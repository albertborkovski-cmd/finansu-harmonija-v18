import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const resolved = path.endsWith('/manualReconciliation.ts') ? outputText.replace("from './reconciliation'", `from '${engineUrl}'`) : outputText;
  return `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`;
}

const engineUrl = moduleUrl('../src/lib/reconciliation.ts');
const { getManualReconciliationCandidates, getManualReconciliationOptions, buildManualReconciliation, parseManualReconciliationAmount } = await import(moduleUrl('../src/lib/manualReconciliation.ts'));
const { applyReconciliation, reverseReconciliation, parseReconciliationState, getReconciliationEntrySide, suggestReconciliation } = await import(engineUrl);
const organizationId = 'organization-1';
const batch = { id: 'manual-batch-1', at: '2026-09-14T10:00:00.000Z', actor: 'Accountant' };

function invoice(id = 'invoice-1', patch = {}) {
  return {
    id,
    organizationId,
    counterpartyId: 'counterparty-1',
    counterpartyName: 'Shared counterparty name',
    kind: 'Invoice',
    side: 'Receivable',
    documentNumber: `INV-${id}`,
    reference: '',
    documentDate: '2026-09-01',
    dueDate: '2026-09-30',
    currency: 'EUR',
    originalMinor: 10000,
    remainingMinor: 10000,
    ...patch,
  };
}

function funding(id = 'payment-1', patch = {}) {
  return invoice(id, { kind: 'Payment', documentNumber: `PAY-${id}`, dueDate: '', ...patch });
}

test('edit browser permits other counterparties but hides same-type, closed and other-organization records', () => {
  const items = [invoice(), funding(), funding('other-party', { counterpartyId: 'other', counterpartyName: 'Other party' }), invoice('same-type'), funding('closed', { remainingMinor: 0 }), funding('foreign', { organizationId: 'foreign' })];
  const before = JSON.stringify(items);
  const rows = getManualReconciliationOptions(items, 'invoice-1');
  assert.deepEqual(new Set(rows.map(row => row.item.id)), new Set(['payment-1', 'other-party']));
  assert.equal(rows[0].reason, '');
  assert.equal(rows.find(row => row.item.id === 'other-party').reason, '');
  assert.equal(JSON.stringify(items), before);
  assert.equal(buildManualReconciliation(items, 'invoice-1', ['other-party']).totalMinor, 10000);
});

test('edit browser hides currency, same GL side and accounting exclusions', () => {
  const items = [invoice(), funding('usd', { currency: 'USD' }), funding('outgoing', { side: 'Payable' }), funding('tax', { counterpartyId: '', counterpartyName: '', payeeName: 'VMI' })];
  const rows = getManualReconciliationOptions(items, 'invoice-1');
  assert.deepEqual(rows, []);
  assert.equal(getManualReconciliationCandidates(items, 'invoice-1').length, 0);
});

test('edit browser keeps partially reconciled records and excludes duplicate IDs', () => {
  const partial = funding('partial', { remainingMinor: 1234 });
  const rows = getManualReconciliationOptions([invoice(), partial, funding('duplicate'), funding('duplicate')], 'invoice-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item.remainingMinor, 1234);
  assert.equal(rows[0].reason, '');
});

function state(items) {
  return { version: 1, organizationId, items, batches: [] };
}

function balances(input) {
  return Object.fromEntries(input.items.map(item => [item.id, item.remainingMinor]));
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('GL entry side follows the counterparty posting of sales, purchases and each funding kind', () => {
  assert.equal(getReconciliationEntrySide(invoice()), 'Debit');
  assert.equal(getReconciliationEntrySide(invoice('purchase', { side: 'Payable' })), 'Credit');
  for (const kind of ['Payment', 'Credit note', 'Advance', 'Deposit']) {
    assert.equal(getReconciliationEntrySide(funding('incoming', { kind })), 'Credit');
    assert.equal(getReconciliationEntrySide(funding('outgoing', { kind, side: 'Payable' })), 'Debit');
  }
});

test('every source kind exposes only opposite GL entries, with no sales-to-sales or purchases-to-purchases', () => {
  const items = ['Invoice', 'Payment', 'Credit note', 'Advance', 'Deposit'].flatMap(kind => ['Receivable', 'Payable'].map(side => invoice(`${kind}-${side}`, { kind, side })));
  for (const source of items) {
    const expected = items.filter(item => item.id !== source.id && getReconciliationEntrySide(item) !== getReconciliationEntrySide(source));
    const options = getManualReconciliationOptions(items, source.id);
    assert.deepEqual(new Set(options.map(row => row.item.id)), new Set(expected.map(item => item.id)));
    assert.ok(options.every(row => row.reason === ''));
    for (const item of items) {
      if (expected.includes(item)) {
        const preview = buildManualReconciliation(items, source.id, [item.id]);
        const next = applyReconciliation(state(items), preview.proposals, batch);
        assert.equal(balances(next)[source.id], 0);
        assert.equal(balances(next)[item.id], 0);
        assert.deepEqual(parseReconciliationState(JSON.stringify(next), organizationId), next);
        const restored = reverseReconciliation(next, batch.id, '2026-09-14T11:00:00.000Z');
        assert.deepEqual(restored.items, items);
      } else {
        assert.throws(() => buildManualReconciliation(items, source.id, [item.id]), /eligible/);
      }
    }
  }
});

test('manual sale-to-purchase offset supports multiple counterparties and editable partial amounts without crossing accounting organizations', () => {
  const input = deepFreeze(state([
    invoice('sale', { originalMinor: 30000, remainingMinor: 30000 }),
    invoice('purchase-a', { side: 'Payable', counterpartyId: 'buyer-a', counterpartyName: 'Buyer A' }),
    invoice('purchase-b', { side: 'Payable', counterpartyId: 'buyer-b', counterpartyName: 'Buyer B' }),
    funding('bank', { counterpartyId: 'payer-c', counterpartyName: 'Payer C' }),
  ]));
  const preview = buildManualReconciliation(input.items, 'sale', ['purchase-a', 'purchase-b', 'bank'], { 'purchase-a': 4000, 'purchase-b': 6000, bank: 8000 });
  const next = applyReconciliation(input, preview.proposals, batch);
  assert.deepEqual(balances(next), { sale: 12000, 'purchase-a': 6000, 'purchase-b': 4000, bank: 2000 });
  assert.deepEqual(parseReconciliationState(JSON.stringify(next), organizationId), next);
  assert.deepEqual(reverseReconciliation(next, batch.id, '2026-09-14T11:00:00.000Z').items, input.items);
  const foreign = invoice('foreign-purchase', { side: 'Payable', organizationId: 'other-ledger' });
  assert.ok(!getManualReconciliationCandidates([...input.items, foreign], 'sale').some(item => item.id === foreign.id));
  assert.throws(() => buildManualReconciliation([...input.items, foreign], 'sale', [foreign.id]), /eligible/);
});

test('broader manual candidates do not create automatic cross-counterparty suggestions', () => {
  const items = [invoice(), funding('other-party', { counterpartyId: 'other', counterpartyName: 'Other party', reference: 'INV-invoice-1' })];
  assert.equal(getManualReconciliationCandidates(items, 'invoice-1').length, 1);
  assert.equal(suggestReconciliation(items).proposals.length, 0);
});

test('exact manual match supports every funding kind from either source direction', () => {
  for (const kind of ['Payment', 'Credit note', 'Advance', 'Deposit']) {
    const items = [invoice(), funding('payment-1', { kind, reference: 'Unrelated text' })];
    for (const sourceId of ['invoice-1', 'payment-1']) {
      const selectedId = sourceId === 'invoice-1' ? 'payment-1' : 'invoice-1';
      const result = buildManualReconciliation(items, sourceId, [selectedId]);
      assert.deepEqual(result.allocations, [{ itemId: selectedId, amountMinor: 10000, remainingMinor: 0 }]);
      assert.equal(result.totalMinor, 10000);
      assert.equal(result.sourceRemainingMinor, 0);
      assert.equal(result.proposals.length, 1);
      assert.equal(result.proposals[0].confidence, 'Review required');
      assert.equal(result.proposals[0].rule, 'Manual selection');
      assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
      assert.deepEqual(result.proposals[0].expectedRemaining, { 'payment-1': 10000, 'invoice-1': 10000 });
      assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), { 'invoice-1': 0, 'payment-1': 0 });
    }
  }
});

test('manual deposits expose only compatible invoices and retain unreleased balance over multiple allocations', () => {
  const deposit = funding('deposit', { kind: 'Deposit', originalMinor: 25000, remainingMinor: 25000, reference: 'Contract LT-2026-001' });
  const input = deepFreeze(state([
    deposit, invoice('invoice-a'), invoice('invoice-b'),
    invoice('other-company', { organizationId: 'other-company' }),
    invoice('other-counterparty', { counterpartyId: 'other-counterparty' }),
    invoice('other-currency', { currency: 'USD' }),
    invoice('other-side', { side: 'Payable' }),
    funding('bank'), funding('another-deposit', { kind: 'Deposit' }),
  ]));
  assert.deepEqual(getManualReconciliationCandidates(input.items, 'deposit').map(row => row.id), ['invoice-a', 'invoice-b', 'other-counterparty']);
  const preview = buildManualReconciliation(input.items, 'deposit', ['invoice-a', 'invoice-b'], { 'invoice-a': 2500, 'invoice-b': 4250 });
  assert.equal(preview.totalMinor, 6750);
  assert.equal(preview.sourceRemainingMinor, 18250);
  assert.equal(preview.proposals.length, 1);
  assert.deepEqual(preview.proposals[0].allocations, [{ invoiceId: 'invoice-a', amountMinor: 2500 }, { invoiceId: 'invoice-b', amountMinor: 4250 }]);
  for (const id of ['other-company', 'other-currency', 'other-side', 'bank', 'another-deposit']) {
    assert.throws(() => buildManualReconciliation(input.items, 'deposit', [id]), /not eligible/);
  }
});

test('partial payment previews the unpaid invoice remainder from either source direction', () => {
  const items = [invoice(), funding('payment-1', { originalMinor: 4000, remainingMinor: 4000 })];
  const fromInvoice = buildManualReconciliation(items, 'invoice-1', ['payment-1']);
  assert.deepEqual(fromInvoice.allocations, [{ itemId: 'payment-1', amountMinor: 4000, remainingMinor: 0 }]);
  assert.equal(fromInvoice.sourceRemainingMinor, 6000);
  const fromPayment = buildManualReconciliation(items, 'payment-1', ['invoice-1']);
  assert.deepEqual(fromPayment.allocations, [{ itemId: 'invoice-1', amountMinor: 4000, remainingMinor: 6000 }]);
  assert.equal(fromPayment.sourceRemainingMinor, 0);
  assert.deepEqual(balances(applyReconciliation(state(items), fromPayment.proposals, batch)), { 'invoice-1': 6000, 'payment-1': 0 });
});

test('overpayment retains excess funding and only allocates the open invoice balance', () => {
  const items = [invoice('invoice-1', { remainingMinor: 6000 }), funding()];
  const fromInvoice = buildManualReconciliation(items, 'invoice-1', ['payment-1']);
  assert.deepEqual(fromInvoice.allocations, [{ itemId: 'payment-1', amountMinor: 6000, remainingMinor: 4000 }]);
  assert.equal(fromInvoice.sourceRemainingMinor, 0);
  const fromPayment = buildManualReconciliation(items, 'payment-1', ['invoice-1']);
  assert.equal(fromPayment.totalMinor, 6000);
  assert.equal(fromPayment.sourceRemainingMinor, 4000);
  assert.deepEqual(balances(applyReconciliation(state(items), fromInvoice.proposals, batch)), { 'invoice-1': 0, 'payment-1': 4000 });
});

test('one funding source makes one proposal with multiple invoices in explicit selection order', () => {
  const items = [invoice('invoice-a', { remainingMinor: 7000 }), invoice('invoice-b', { remainingMinor: 6000 }), funding()];
  const result = buildManualReconciliation(items, 'payment-1', ['invoice-b', 'invoice-a']);
  assert.deepEqual(result.allocations, [
    { itemId: 'invoice-b', amountMinor: 6000, remainingMinor: 0 },
    { itemId: 'invoice-a', amountMinor: 4000, remainingMinor: 3000 },
  ]);
  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].allocations, [
    { invoiceId: 'invoice-b', amountMinor: 6000 },
    { invoiceId: 'invoice-a', amountMinor: 4000 },
  ]);
  assert.deepEqual(result.proposals[0].expectedRemaining, { 'payment-1': 10000, 'invoice-b': 6000, 'invoice-a': 7000 });
  assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), { 'invoice-a': 3000, 'invoice-b': 0, 'payment-1': 0 });
});

test('one invoice source makes multiple funding proposals with ORIGINAL expected balances', () => {
  const input = deepFreeze(state([
    invoice(),
    funding('payment-a', { remainingMinor: 7000 }),
    funding('payment-b', { remainingMinor: 6000 }),
  ]));
  const result = buildManualReconciliation(input.items, 'invoice-1', ['payment-b', 'payment-a']);
  assert.deepEqual(result.allocations, [
    { itemId: 'payment-b', amountMinor: 6000, remainingMinor: 0 },
    { itemId: 'payment-a', amountMinor: 4000, remainingMinor: 3000 },
  ]);
  assert.equal(result.proposals.length, 2);
  assert.notEqual(result.proposals[0].id, result.proposals[1].id);
  assert.ok(result.proposals.every(proposal => proposal.expectedRemaining['invoice-1'] === 10000));
  assert.deepEqual(result.proposals.map(proposal => proposal.expectedRemaining[proposal.fundingId]), [6000, 7000]);
  const applied = applyReconciliation(input, result.proposals, batch);
  assert.deepEqual(balances(applied), { 'invoice-1': 0, 'payment-a': 3000, 'payment-b': 0 });
  assert.equal(applied.batches[0].allocations.length, 2);
  assert.deepEqual(reverseReconciliation(applied, batch.id, '2026-09-14T11:00:00.000Z').items, input.items);
  assert.deepEqual(balances(input), { 'invoice-1': 10000, 'payment-a': 7000, 'payment-b': 6000 });
});

test('selected rows remain visible with zero allocation once source capacity is exhausted', () => {
  for (const sourceIsInvoice of [true, false]) {
    const source = sourceIsInvoice ? invoice('source') : funding('source');
    const candidate = sourceIsInvoice ? funding : invoice;
    const items = [source, candidate('first'), candidate('second'), candidate('third')];
    const result = buildManualReconciliation(items, 'source', ['first', 'second', 'third']);
    assert.deepEqual(result.allocations, [
      { itemId: 'first', amountMinor: 10000, remainingMinor: 0 },
      { itemId: 'second', amountMinor: 0, remainingMinor: 10000 },
      { itemId: 'third', amountMinor: 0, remainingMinor: 10000 },
    ]);
    assert.equal(result.totalMinor, 10000);
    assert.equal(result.sourceRemainingMinor, 0);
    assert.equal(result.proposals.length, 1);
    assert.ok(result.proposals.every(proposal => proposal.allocations.every(allocation => allocation.amountMinor > 0)));
    assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), { source: 0, first: 0, second: 10000, third: 10000 });
  }
});

test('candidates include all compatible records without relying on amounts or references', () => {
  const items = [
    invoice(),
    funding('payment-small', { remainingMinor: 1, reference: '' }),
    funding('payment-large', { originalMinor: 100000, remainingMinor: 100000, reference: 'Wrong invoice' }),
  ];
  assert.deepEqual(getManualReconciliationCandidates(items, 'invoice-1').map(item => item.id), ['payment-large', 'payment-small']);
});

test('candidates sort by due date or document date, then document number and ID without mutating input', () => {
  const rows = [
    funding('source'),
    invoice('z', { dueDate: '2026-09-05', documentNumber: 'SAME' }),
    invoice('a', { dueDate: '2026-09-05', documentNumber: 'SAME' }),
    invoice('earliest', { dueDate: '', documentDate: '2026-09-01' }),
    invoice('number-first', { dueDate: '2026-09-05', documentNumber: 'A' }),
    invoice('late', { dueDate: '2026-09-30', documentDate: '2026-08-01' }),
  ];
  deepFreeze(rows);
  const expected = ['earliest', 'number-first', 'a', 'z', 'late'];
  assert.deepEqual(getManualReconciliationCandidates(rows, 'source').map(item => item.id), expected);
  assert.deepEqual(getManualReconciliationCandidates([...rows].reverse(), 'source').map(item => item.id), expected);
  assert.equal(rows[0].id, 'source');
});

test('manual matching enforces accounting company, currency and opposite GL entry side', () => {
  for (const patch of [
    { organizationId: 'organization-2' },
    { currency: 'USD' },
    { side: 'Payable' },
    { kind: 'Invoice' },
  ]) {
    const items = [invoice(), funding('ineligible', patch)];
    assert.deepEqual(getManualReconciliationCandidates(items, 'invoice-1'), []);
    assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['ineligible']), /eligible/);
  }
  assert.deepEqual(getManualReconciliationCandidates([funding('a'), funding('b')], 'a'), []);
  const usdItems = [invoice('invoice-1', { currency: 'USD', side: 'Payable' }), funding('payment-1', { currency: 'USD', side: 'Payable' })];
  assert.equal(buildManualReconciliation(usdItems, 'invoice-1', ['payment-1']).totalMinor, 10000);
});

test('invalid and closed candidates are excluded and cannot be selected', () => {
  for (const patch of [
    { remainingMinor: 0 },
    { remainingMinor: -1 },
    { remainingMinor: 0.5 },
    { remainingMinor: NaN },
    { remainingMinor: Infinity },
    { remainingMinor: Number.MAX_SAFE_INTEGER + 1 },
    { originalMinor: Number.MAX_SAFE_INTEGER + 1 },
    { originalMinor: 9999 },
    { currency: 'GBP' },
    { kind: 'Refund' },
    { side: '' },
    { documentNumber: '' },
    { reference: null },
    { documentDate: '2026-02-30' },
    { dueDate: 'not-a-date' },
    { counterpartyName: '' },
  ]) {
    const items = [invoice(), funding('invalid', patch)];
    assert.deepEqual(getManualReconciliationCandidates(items, 'invoice-1'), [], JSON.stringify(patch));
    assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['invalid']), /eligible/);
  }
});

test('unknown, invalid, closed or duplicate sources are rejected, even for empty selection', () => {
  for (const items of [
    [], [funding()], [invoice('invoice-1', { remainingMinor: 0 })],
    [invoice('invoice-1', { remainingMinor: 1.5 })],
    [invoice('invoice-1', { originalMinor: Number.MAX_SAFE_INTEGER + 1 })],
    [invoice(), invoice()], [null, invoice('invoice-1', { currency: 'GBP' })],
  ]) {
    assert.deepEqual(getManualReconciliationCandidates(items, 'invoice-1'), []);
    assert.throws(() => buildManualReconciliation(items, 'invoice-1', []), /source/);
  }
});

test('duplicate selected IDs, unknown IDs, self-selection and duplicate candidate IDs are rejected', () => {
  const items = [invoice(), funding()];
  assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['payment-1', 'payment-1']), /Duplicate/);
  assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['missing']), /not found/);
  assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['invoice-1']), /eligible/);
  const duplicateItems = [...items, funding()];
  assert.deepEqual(getManualReconciliationCandidates(duplicateItems, 'invoice-1'), []);
  assert.throws(() => buildManualReconciliation(duplicateItems, 'invoice-1', ['payment-1']), /eligible/);
  // Validation still checks a selected row after earlier choices consume capacity.
  assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['payment-1', 'missing']), /not found/);
});

test('empty selection returns a zero-allocation preview and preserves the source balance', () => {
  assert.deepEqual(buildManualReconciliation([invoice(), funding()], 'invoice-1', []), {
    allocations: [], proposals: [], totalMinor: 0, sourceRemainingMinor: 10000,
  });
});

test('safe integer maximum balances never overflow even when candidate totals would', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const items = [
    invoice('source', { originalMinor: maximum, remainingMinor: maximum }),
    funding('first', { originalMinor: maximum, remainingMinor: maximum - 1 }),
    funding('second', { originalMinor: maximum, remainingMinor: maximum }),
  ];
  const result = buildManualReconciliation(items, 'source', ['first', 'second']);
  assert.equal(result.totalMinor, maximum);
  assert.equal(result.sourceRemainingMinor, 0);
  assert.deepEqual(result.allocations.map(row => row.amountMinor), [maximum - 1, 1]);
  assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), { source: 0, first: 0, second: maximum - 1 });
});

test('proposal IDs are deterministic and include selection order, allocation and balance snapshot', () => {
  const items = [invoice(), funding('a'), funding('b')];
  const original = buildManualReconciliation(items, 'invoice-1', ['a', 'b']);
  assert.deepEqual(buildManualReconciliation([...items].reverse(), 'invoice-1', ['a', 'b']), original);
  assert.notEqual(buildManualReconciliation(items, 'invoice-1', ['b', 'a']).proposals[0].id, original.proposals[0].id);
  assert.notEqual(buildManualReconciliation(items, 'invoice-1', ['a']).proposals[0].id, original.proposals[0].id);
  const changedSnapshot = items.map(row => row.id === 'b' ? { ...row, remainingMinor: 9000 } : row);
  assert.notEqual(buildManualReconciliation(changedSnapshot, 'invoice-1', ['a', 'b']).proposals[0].id, original.proposals[0].id);
  const changedAllocation = items.map(row => row.id === 'a' ? { ...row, remainingMinor: 9000 } : row);
  assert.notEqual(buildManualReconciliation(changedAllocation, 'invoice-1', ['a', 'b']).proposals[0].id, original.proposals[0].id);
});

test('special object-property IDs retain own snapshot keys and work with the existing engine', () => {
  for (const sourceIsInvoice of [true, false]) {
    const items = sourceIsInvoice
      ? [invoice('__proto__'), funding('constructor'), funding('toString')]
      : [funding('__proto__'), invoice('constructor'), invoice('toString')];
    const result = buildManualReconciliation(items, '__proto__', ['constructor', 'toString']);
    assert.ok(Object.hasOwn(result.proposals[0].expectedRemaining, '__proto__'));
    assert.ok(Object.hasOwn(result.proposals[0].expectedRemaining, 'constructor'));
    assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), { ['__proto__']: 0, constructor: 0, toString: 10000 });
  }
});

test('stale manual proposals are rejected atomically without mutation', () => {
  const original = state([invoice(), funding('a', { remainingMinor: 6000 }), funding('b', { remainingMinor: 6000 })]);
  const result = buildManualReconciliation(original.items, 'invoice-1', ['a', 'b']);
  for (const changedId of ['invoice-1', 'a', 'b']) {
    const stale = deepFreeze({
      ...original,
      items: original.items.map(item => item.id === changedId ? { ...item, remainingMinor: item.remainingMinor - 1 } : item),
    });
    const before = JSON.stringify(stale);
    assert.throws(() => applyReconciliation(stale, result.proposals, batch), /Stale/);
    assert.equal(JSON.stringify(stale), before);
    assert.equal(stale.batches.length, 0);
  }
});

test('entered partial amounts leave both document balances open in either source direction', () => {
  for (const kind of ['Payment', 'Credit note', 'Advance', 'Deposit']) {
    for (const sourceIsInvoice of [true, false]) {
      const input = deepFreeze(state([invoice(), funding('payment-1', { kind })]));
      const sourceId = sourceIsInvoice ? 'invoice-1' : 'payment-1';
      const candidateId = sourceIsInvoice ? 'payment-1' : 'invoice-1';
      const result = buildManualReconciliation(input.items, sourceId, [candidateId], { [candidateId]: 2517 });
      assert.deepEqual(result.allocations, [{ itemId: candidateId, amountMinor: 2517, remainingMinor: 7483 }]);
      assert.equal(result.totalMinor, 2517);
      assert.equal(result.sourceRemainingMinor, 7483);
      assert.deepEqual(result.proposals[0].expectedRemaining, { 'payment-1': 10000, 'invoice-1': 10000 });
      const applied = applyReconciliation(input, result.proposals, batch);
      assert.deepEqual(balances(applied), { 'invoice-1': 7483, 'payment-1': 7483 });
      assert.deepEqual(reverseReconciliation(applied, batch.id, '2026-09-14T11:00:00.000Z').items, input.items);
    }
  }
});

test('purchase deposit is allocated partially across several invoices without consuming their remaining debt', () => {
  for (const kind of ['Advance', 'Deposit']) {
    const input = state([
      funding('deposit', { kind, side: 'Payable', originalMinor: 100000, remainingMinor: 100000 }),
      invoice('purchase-a', { side: 'Payable', originalMinor: 70000, remainingMinor: 70000 }),
      invoice('purchase-b', { side: 'Payable', originalMinor: 60000, remainingMinor: 60000 }),
    ]);
    const preview = buildManualReconciliation(input.items, 'deposit', ['purchase-a', 'purchase-b'], { 'purchase-a': 30000, 'purchase-b': 20000 });
    assert.equal(preview.totalMinor, 50000);
    assert.equal(preview.sourceRemainingMinor, 50000);
    const applied = applyReconciliation(input, preview.proposals, batch);
    assert.deepEqual(balances(applied), { deposit: 50000, 'purchase-a': 40000, 'purchase-b': 40000 });
    assert.deepEqual(reverseReconciliation(applied, batch.id, '2026-09-16T11:00:00.000Z').items, input.items);
  }
});

test('explicit amounts are reserved before automatic allocations in either direction', () => {
  for (const sourceIsInvoice of [true, false]) {
    const source = sourceIsInvoice ? invoice('source') : funding('source');
    const candidate = sourceIsInvoice ? funding : invoice;
    const input = deepFreeze(state([
      source,
      candidate('automatic-first', { remainingMinor: 6000 }),
      candidate('explicit-middle'),
      candidate('automatic-last'),
      candidate('explicit-last'),
    ]));
    const overrides = deepFreeze({ 'explicit-last': 1000, 'explicit-middle': 2000 });
    const result = buildManualReconciliation(input.items, 'source', [
      'automatic-first', 'explicit-middle', 'automatic-last', 'explicit-last',
    ], overrides);
    assert.deepEqual(result.allocations, [
      { itemId: 'automatic-first', amountMinor: 6000, remainingMinor: 0 },
      { itemId: 'explicit-middle', amountMinor: 2000, remainingMinor: 8000 },
      { itemId: 'automatic-last', amountMinor: 1000, remainingMinor: 9000 },
      { itemId: 'explicit-last', amountMinor: 1000, remainingMinor: 9000 },
    ]);
    assert.equal(result.totalMinor, 10000);
    assert.equal(result.sourceRemainingMinor, 0);
    assert.ok(result.proposals.every(proposal => proposal.expectedRemaining.source === 10000));
    const applied = applyReconciliation(input, result.proposals, batch);
    assert.deepEqual(balances(applied), {
      source: 0, 'automatic-first': 0, 'explicit-middle': 8000, 'automatic-last': 9000, 'explicit-last': 9000,
    });
    assert.deepEqual(reverseReconciliation(applied, batch.id, '2026-09-14T11:00:00.000Z').items, input.items);
  }
});

test('fully reserved source keeps automatic selected rows at zero without changing entered amounts', () => {
  const items = [invoice(), funding('automatic'), funding('explicit')];
  const result = buildManualReconciliation(items, 'invoice-1', ['automatic', 'explicit'], { explicit: 10000 });
  assert.deepEqual(result.allocations, [
    { itemId: 'automatic', amountMinor: 0, remainingMinor: 10000 },
    { itemId: 'explicit', amountMinor: 10000, remainingMinor: 0 },
  ]);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].fundingId, 'explicit');
});

test('manual overrides reject unselected keys and invalid, over-balance or over-source amounts', () => {
  const input = deepFreeze(state([invoice(), funding('a', { remainingMinor: 6000 }), funding('b')]));
  const before = JSON.stringify(input);
  for (const value of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null, undefined]) {
    assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', ['a'], { a: value }), /positive safe integer/);
  }
  for (const key of ['missing', 'b', 'invoice-1']) {
    assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', ['a'], { [key]: 1 }), /selected item/);
  }
  assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', [], { a: 1 }), /selected item/);
  assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', ['a'], { a: 6001 }), /selected document's open balance/);
  assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', ['a', 'b'], { a: 6000, b: 4001 }), /source document's open balance/);
  for (const invalid of [null, [], '100']) {
    assert.throws(() => buildManualReconciliation(input.items, 'invoice-1', ['a'], invalid), /supplied by selected item ID/);
  }
  assert.equal(JSON.stringify(input), before);
});

test('safe integer capacity checks cannot overflow when summing explicit requests', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const items = [
    invoice('source', { originalMinor: maximum, remainingMinor: maximum }),
    funding('a', { originalMinor: maximum, remainingMinor: maximum }),
    funding('b', { originalMinor: maximum, remainingMinor: maximum }),
  ];
  const result = buildManualReconciliation(items, 'source', ['a', 'b'], { a: maximum - 1, b: 1 });
  assert.equal(result.totalMinor, maximum);
  assert.equal(result.sourceRemainingMinor, 0);
  assert.deepEqual(result.allocations.map(row => row.amountMinor), [maximum - 1, 1]);
  assert.throws(() => buildManualReconciliation(items, 'source', ['a', 'b'], { a: maximum, b: maximum }), /source document's open balance/);
});

test('partial proposals use immutable original snapshots and reject stale data atomically', () => {
  const original = deepFreeze(state([invoice(), funding('a'), funding('b')]));
  const result = buildManualReconciliation(original.items, 'invoice-1', ['a', 'b'], { a: 1500, b: 2000 });
  assert.deepEqual(result.proposals.map(proposal => proposal.expectedRemaining), [
    { a: 10000, 'invoice-1': 10000 }, { b: 10000, 'invoice-1': 10000 },
  ]);
  for (const changedId of ['invoice-1', 'a', 'b']) {
    const stale = deepFreeze({
      ...original,
      items: original.items.map(item => item.id === changedId ? { ...item, remainingMinor: item.remainingMinor - 1 } : item),
    });
    const before = JSON.stringify(stale);
    assert.throws(() => applyReconciliation(stale, result.proposals, batch), /Stale/);
    assert.equal(JSON.stringify(stale), before);
  }
  const nowTooSmall = original.items.map(item => item.id === 'a' ? { ...item, remainingMinor: 1499 } : item);
  assert.throws(() => buildManualReconciliation(nowTooSmall, 'invoice-1', ['a', 'b'], { a: 1500, b: 2000 }), /selected document's open balance/);
  const sourceTooSmall = original.items.map(item => item.id === 'invoice-1' ? { ...item, remainingMinor: 3499 } : item);
  assert.throws(() => buildManualReconciliation(sourceTooSmall, 'invoice-1', ['a', 'b'], { a: 1500, b: 2000 }), /source document's open balance/);
});

test('partial proposal identities are deterministic, amount-sensitive and ignore override insertion order', () => {
  const items = deepFreeze([invoice(), funding('a'), funding('b')]);
  const selected = deepFreeze(['a', 'b']);
  const overrides = deepFreeze({ a: 1500, b: 2000 });
  const result = buildManualReconciliation(items, 'invoice-1', selected, overrides);
  assert.deepEqual(buildManualReconciliation([...items].reverse(), 'invoice-1', selected, { b: 2000, a: 1500 }), result);
  const changed = buildManualReconciliation(items, 'invoice-1', selected, { a: 1501, b: 2000 });
  assert.ok(changed.proposals.every((proposal, index) => proposal.id !== result.proposals[index].id));
  assert.deepEqual(overrides, { a: 1500, b: 2000 });
  assert.deepEqual(buildManualReconciliation(items, 'invoice-1', selected, {}), buildManualReconciliation(items, 'invoice-1', selected));
});

test('special-property override IDs are treated as own keys and inherited values are not amounts', () => {
  const items = [invoice('source'), funding('__proto__'), funding('constructor'), funding('toString')];
  const overrides = Object.fromEntries([['__proto__', 1000], ['constructor', 2000], ['toString', 3000]]);
  const result = buildManualReconciliation(items, 'source', ['__proto__', 'constructor', 'toString'], overrides);
  assert.deepEqual(result.allocations.map(row => row.amountMinor), [1000, 2000, 3000]);
  assert.deepEqual(balances(applyReconciliation(state(items), result.proposals, batch)), {
    source: 4000, ['__proto__']: 9000, constructor: 8000, toString: 7000,
  });
  const inherited = Object.create({ constructor: 2000, missing: 1 });
  assert.equal(buildManualReconciliation(items, 'source', ['constructor'], inherited).totalMinor, 10000);
});

test('decimal amount parsing is exact for dot and comma separators and accepts the safe limit', () => {
  for (const [text, expected] of [
    ['1', 100], ['1.2', 120], ['1,23', 123], ['0.29', 29], ['0,01', 1], ['0001.02', 102],
    ['  12.34  ', 1234], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ]) assert.equal(parseManualReconciliationAmount(text), expected, text);
});

test('decimal amount parsing rejects empty, zero, negatives, exponent, grouping and excessive precision', () => {
  for (const text of [
    '', ' ', '0', '0.00', '00,00', '-1', '+1', '1e2', '1E2', '1.001', '1,001',
    '1,000.00', '1.000,00', '1 000', '1_000', '1.', '.5', '1,', '1..2', 'NaN', 'Infinity',
    '90071992547409.92', '999999999999999999999999', null, undefined, 12.34,
  ]) assert.throws(() => parseManualReconciliationAmount(text), /amount|Enter/, String(text));
});

test('accounting and unidentified payments are excluded as manual source and candidate', () => {
  for (const patch of [
    { payeeName: 'VMI' }, { counterpartyName: 'Sodra' }, { reference: 'Salary September' },
    { reference: 'Bank fee' }, { counterpartyId: '', counterpartyName: '', reference: 'Unidentified transfer' },
  ]) {
    const items = deepFreeze([invoice(), funding('accounting', patch), funding('client-payment')]);
    const before = JSON.stringify(items);
    assert.deepEqual(getManualReconciliationCandidates(items, 'accounting'), []);
    assert.deepEqual(getManualReconciliationCandidates(items, 'invoice-1').map(row => row.id), ['client-payment']);
    assert.throws(() => buildManualReconciliation(items, 'accounting', ['invoice-1']), /source/);
    assert.throws(() => buildManualReconciliation(items, 'invoice-1', ['accounting']), /eligible/);
    assert.equal(JSON.stringify(items), before);
  }
});

test('generic VAT and ordinary commission references remain available for manual client matching', () => {
  for (const reference of ['VAT invoice INV-1', 'Sales commission', 'Sodralita services', 'VMI123']) {
    const items = [invoice(), funding('client', { reference })];
    assert.equal(getManualReconciliationCandidates(items, 'client').length, 1);
    assert.equal(buildManualReconciliation(items, 'client', ['invoice-1']).totalMinor, 10000);
  }
});
