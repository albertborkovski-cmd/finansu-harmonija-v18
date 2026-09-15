import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function loadTypescript(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { getManualReconciliationCandidates, buildManualReconciliation } = await loadTypescript('../src/lib/manualReconciliation.ts');
const { applyReconciliation, reverseReconciliation } = await loadTypescript('../src/lib/reconciliation.ts');
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

test('exact manual match supports every funding kind from either source direction', () => {
  for (const kind of ['Payment', 'Credit note', 'Advance']) {
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

test('manual matching enforces company, counterparty ID, currency, side and opposite kind', () => {
  for (const patch of [
    { organizationId: 'organization-2' },
    { counterpartyId: 'different-counterparty-with-same-name' },
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
