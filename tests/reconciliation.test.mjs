import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/reconciliation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  DEFAULT_RECONCILIATION_RULES,
  suggestReconciliation,
  applyReconciliation,
  reverseReconciliation,
  createDemoReconciliationState,
  parseReconciliationState,
  getReconciliationRoute,
  hasReconciliationClient,
  isClientReconciliationItem,
  assignReconciliationGlAccount,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const organizationId = 'organization-1';
test('missing documents remain stored and cannot generate suggestions', () => {
  const state = createDemoReconciliationState(organizationId);
  const items = state.items.map(item => ({ ...item, missingDocument: true }));
  assert.equal(suggestReconciliation(items).proposals.length, 0);
  assert.ok(JSON.parse(JSON.stringify({ ...state, items })).items.every(item => item.missingDocument));
});
test('cash movements are classified by purpose and direction without matching customer debts', () => {
  const payment = { kind: 'Payment', counterpartyId: '', counterpartyName: '', reference: '' };
  assert.equal(getReconciliationRoute({ ...payment, side: 'Receivable', paymentPurpose: 'Grynųjų pinigų įnešimas' }).category, 'Cash deposit');
  assert.equal(getReconciliationRoute({ ...payment, side: 'Payable', paymentPurpose: 'ATM withdrawal' }).category, 'Cash withdrawal');
  assert.equal(getReconciliationRoute({ ...payment, side: 'Payable', paymentPurpose: 'Cash deposit' }).kind, 'unidentified');
  assert.equal(isClientReconciliationItem({ ...payment, side: 'Payable', paymentPurpose: 'Cash withdrawal' }), false);
});
const referenceOnly = { uniqueAmount: false, partialReference: true, multipleReferences: true };
const batch = { id: 'batch-1', at: '2026-09-14T10:00:00.000Z', actor: 'Accountant' };
const reversedAt = '2026-09-14T11:00:00.000Z';

function item(id, patch = {}) {
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

function invoice(id = 'invoice-1', patch = {}) {
  return item(id, { documentNumber: 'INV-1', ...patch });
}

function funding(id = 'payment-1', patch = {}) {
  return item(id, { kind: 'Payment', documentNumber: `PAY-${id}`, reference: 'INV-1', ...patch });
}

function state(items = [invoice(), funding()]) {
  return { version: 1, organizationId, items, batches: [] };
}

function remaining(input) {
  return Object.fromEntries(input.items.map(row => [row.id, row.remainingMinor]));
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function assertNoProposals(items, rules = DEFAULT_RECONCILIATION_RULES) {
  assert.deepEqual(suggestReconciliation(items, rules).proposals, []);
}

test('exact document reference and exact remaining amount produces High confidence for every funding kind', () => {
  for (const kind of ['Payment', 'Credit note', 'Advance']) {
    const items = [invoice('invoice-1', { originalMinor: 12000 }), funding('payment-1', { kind })];
    const result = suggestReconciliation(items);
    assert.equal(result.proposals.length, 1, kind);
    assert.equal(result.proposals[0].confidence, 'High');
    assert.equal(result.proposals[0].fundingId, 'payment-1');
    assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
    assert.deepEqual(result.proposals[0].expectedRemaining, { 'invoice-1': 10000, 'payment-1': 10000 });
    assert.ok(result.proposals[0].id);
    assert.ok(result.proposals[0].rule);
    assert.ok(result.proposals[0].reason);
  }
});

test('full document reference boundaries distinguish INV-1 from INV-10', () => {
  const result = suggestReconciliation([
    invoice('invoice-1'),
    invoice('invoice-10', { documentNumber: 'INV-10' }),
    funding('payment-1', { reference: 'Settlement for INV-10.' }),
  ], referenceOnly);
  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-10', amountMinor: 10000 }]);
  for (const reference of ['INV-10', 'XINV-1', 'INV-1A', 'INV-1-2', 'INV-1.2', 'INV-1/2']) {
    assertNoProposals([invoice(), funding('payment-1', { reference })], referenceOnly);
  }
});

test('reused invoice numbers in another scope do not invalidate the local exact reference', () => {
  const rows = [invoice(), funding(), invoice('other-company-invoice', { organizationId: 'organization-2' })];
  const result = suggestReconciliation(rows);
  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
});

test('duplicate item IDs are excluded with an explanation', () => {
  const rows = [invoice(), { ...invoice() }, funding()];
  const result = suggestReconciliation(rows, referenceOnly);
  assert.deepEqual(result.proposals, []);
  assert.ok(result.unmatched.some(entry => entry.itemId === 'invoice-1' && /duplicate/i.test(entry.reason)));
  assert.throws(() => applyReconciliation(state(rows), [], batch));
});

test('special object-property item IDs retain their own expected balance', () => {
  const input = state([invoice('__proto__'), funding()]);
  const proposals = suggestReconciliation(input.items).proposals;
  assert.equal(proposals.length, 1);
  assert.ok(Object.hasOwn(proposals[0].expectedRemaining, '__proto__'));
  assert.deepEqual(remaining(applyReconciliation(input, proposals, batch)), { ['__proto__']: 0, 'payment-1': 0 });
});

test('demo data is deterministic, organization-scoped and exercises all test matching categories', () => {
  const demo = createDemoReconciliationState(organizationId);
  assert.deepEqual(createDemoReconciliationState(organizationId), demo);
  assert.equal(demo.version, 1);
  assert.equal(demo.items.length, 22);
  assert.equal(new Set(demo.items.map(row => row.id)).size, demo.items.length);
  assert.ok(demo.items.every(row => row.organizationId === organizationId));
  const proposals = suggestReconciliation(demo.items).proposals;
  assert.equal(proposals.length, 6);
  assert.equal(proposals.filter(proposal => proposal.confidence === 'High').length, 2);
  assert.equal(proposals.reduce((count, proposal) => count + proposal.allocations.length, 0), 7);
  const applied = applyReconciliation(demo, proposals, batch);
  assert.equal(applied.items.find(row => row.id.endsWith(':invoice-partial')).remainingMinor, 35000);
  assert.equal(applied.items.find(row => row.id.endsWith(':advance-overpayment')).remainingMinor, 8000);
  assert.deepEqual(suggestReconciliation(applied.items).proposals, []);
  assert.deepEqual(reverseReconciliation(applied, batch.id, reversedAt).items, demo.items);
  assert.throws(() => createDemoReconciliationState(''));
});

test('reversal rejects corrupt history that would restore above the original balance', () => {
  const input = state();
  const proposals = suggestReconciliation(input.items).proposals;
  const applied = applyReconciliation(input, proposals, batch);
  const corrupted = deepFreeze({ ...applied, items: applied.items.map(row => ({ ...row, remainingMinor: 1 })) });
  assert.throws(() => reverseReconciliation(corrupted, batch.id, reversedAt));
  assert.ok(corrupted.items.every(row => row.remainingMinor === 1));
});

test('matching stays within organization, counterparty identity, currency, and side', () => {
  for (const patch of [
    { organizationId: 'organization-2' },
    { counterpartyId: 'counterparty-2' },
    { currency: 'USD' },
    { side: 'Payable' },
  ]) {
    assertNoProposals([invoice(), funding('payment-1', patch)]);
  }
});

test('supports EUR and USD but does not reconcile unsupported currencies', () => {
  for (const currency of ['EUR', 'USD']) {
    assert.equal(suggestReconciliation([invoice('invoice-1', { currency }), funding('payment-1', { currency })]).proposals.length, 1);
  }
  for (const currency of ['GBP', '', 'eur']) {
    assertNoProposals([invoice('invoice-1', { currency }), funding('payment-1', { currency })]);
  }
});

test('never reconciles invoice with invoice or funding with funding', () => {
  assertNoProposals([invoice(), invoice('invoice-2', { reference: 'INV-1', documentNumber: 'INV-2' })]);
  assertNoProposals([funding(), funding('payment-2', { kind: 'Advance' })]);
});

test('unique remaining amount without reference requires review and the enabled amount rule', () => {
  const items = [invoice('invoice-1', { originalMinor: 14000 }), funding('payment-1', { reference: '' })];
  const result = suggestReconciliation(items);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].confidence, 'Review required');
  assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
  assertNoProposals(items, { ...DEFAULT_RECONCILIATION_RULES, uniqueAmount: false });
});

test('does not select an arbitrary invoice when the amount is ambiguous', () => {
  assertNoProposals([
    invoice(),
    invoice('invoice-2', { documentNumber: 'INV-2' }),
    funding('payment-1', { reference: '' }),
  ]);
});

test('partial explicit reference is review-only and respects the partial-reference rule', () => {
  const items = [invoice(), funding('payment-1', { originalMinor: 4000, remainingMinor: 4000 })];
  const result = suggestReconciliation(items, referenceOnly);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].confidence, 'Review required');
  assert.deepEqual(result.proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 4000 }]);
  assertNoProposals(items, { ...referenceOnly, partialReference: false });
});

test('overpayment allocates only the invoice remaining amount and retains the funding residual', () => {
  const input = state([invoice(), funding('payment-1', { originalMinor: 13000, remainingMinor: 13000 })]);
  const { proposals } = suggestReconciliation(input.items, referenceOnly);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].confidence, 'Review required');
  assert.deepEqual(proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
  assert.deepEqual(remaining(applyReconciliation(input, proposals, batch)), { 'invoice-1': 0, 'payment-1': 3000 });
  assertNoProposals(input.items, { ...referenceOnly, partialReference: false });
});

test('multiple references require review and fully cover every referenced invoice', () => {
  for (const fundingMinor of [10000, 12000]) {
    const input = state([
      invoice('invoice-1', { originalMinor: 4000, remainingMinor: 4000 }),
      invoice('invoice-2', { documentNumber: 'INV-2', originalMinor: 6000, remainingMinor: 6000 }),
      funding('payment-1', { reference: 'INV-1, INV-2', originalMinor: fundingMinor, remainingMinor: fundingMinor }),
    ]);
    const { proposals } = suggestReconciliation(input.items, referenceOnly);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].confidence, 'Review required');
    assert.deepEqual([...proposals[0].allocations].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)), [
      { invoiceId: 'invoice-1', amountMinor: 4000 },
      { invoiceId: 'invoice-2', amountMinor: 6000 },
    ]);
    assert.deepEqual(remaining(applyReconciliation(input, proposals, batch)), {
      'invoice-1': 0, 'invoice-2': 0, 'payment-1': fundingMinor - 10000,
    });
  }
});

test('underfunded multiple references never allocate an arbitrary subset or fall back to amount', () => {
  assertNoProposals([
    invoice('invoice-1', { originalMinor: 4000, remainingMinor: 4000 }),
    invoice('invoice-2', { documentNumber: 'INV-2', originalMinor: 6000, remainingMinor: 6000 }),
    funding('payment-1', { reference: 'INV-1 and INV-2', originalMinor: 4000, remainingMinor: 4000 }),
  ]);
});

test('multiple-reference rule can be disabled without amount fallback', () => {
  assertNoProposals([
    invoice('invoice-1', { originalMinor: 4000, remainingMinor: 4000 }),
    invoice('invoice-2', { documentNumber: 'INV-2', originalMinor: 6000, remainingMinor: 6000 }),
    funding('payment-1', { reference: 'INV-1 and INV-2' }),
  ], { ...DEFAULT_RECONCILIATION_RULES, multipleReferences: false });
});

test('repeated mentions of one document do not duplicate its allocation', () => {
  const { proposals } = suggestReconciliation([invoice(), funding('payment-1', { reference: 'INV-1 / INV-1' })]);
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 10000 }]);
});

test('duplicate document numbers are ambiguous, not multiple explicit references', () => {
  assertNoProposals([
    invoice(),
    invoice('invoice-duplicate', { originalMinor: 20000, remainingMinor: 20000 }),
    funding(),
  ]);
});

test('known out-of-scope or settled reference does not fall back to an unrelated equal amount', () => {
  for (const patch of [
    { organizationId: 'organization-2' },
    { counterpartyId: 'counterparty-2' },
    { currency: 'USD' },
    { side: 'Payable' },
    { remainingMinor: 0 },
  ]) {
    assertNoProposals([
      invoice('referenced-invoice', patch),
      invoice('unrelated-invoice', { documentNumber: 'INV-2' }),
      funding(),
    ]);
  }
});

test('zero balances are valid but cannot create a zero-value proposal', () => {
  for (const patch of [{ remainingMinor: 0 }, { originalMinor: 0, remainingMinor: 0 }]) {
    assertNoProposals([invoice('invoice-1', patch), funding()]);
    assertNoProposals([invoice(), funding('payment-1', patch)]);
  }
});

test('rejects negative, fractional, unsafe, non-finite and inconsistent minor-unit amounts', () => {
  const invalid = [
    { remainingMinor: -1 },
    { remainingMinor: 9999.5 },
    { remainingMinor: Number.NaN },
    { remainingMinor: Number.POSITIVE_INFINITY },
    { originalMinor: 9999 },
    { originalMinor: -1 },
    { originalMinor: 10000.5 },
    { originalMinor: Number.MAX_SAFE_INTEGER + 1 },
    { originalMinor: Number.MAX_SAFE_INTEGER + 1, remainingMinor: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const patch of invalid) {
    assertNoProposals([invoice('invoice-1', patch), funding()]);
    assertNoProposals([invoice(), funding('payment-1', patch)]);
  }
});

test('small integer cents are reconciled without floating-point rounding', () => {
  const input = state([
    invoice('invoice-1', { originalMinor: 3, remainingMinor: 3 }),
    funding('payment-1', { originalMinor: 2, remainingMinor: 2 }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  assert.deepEqual(proposals[0].allocations, [{ invoiceId: 'invoice-1', amountMinor: 2 }]);
  assert.deepEqual(remaining(applyReconciliation(input, proposals, batch)), { 'invoice-1': 1, 'payment-1': 0 });
});

test('conflicting funding candidates are all rejected instead of choosing an arbitrary winner', () => {
  for (const reference of ['', 'INV-1']) {
    assertNoProposals([invoice(), funding('payment-1', { reference }), funding('payment-2', { reference })]);
  }
});

test('non-conflicting partial proposals share the original snapshot and reserve total invoice capacity', () => {
  const input = state([
    invoice(),
    funding('payment-1', { originalMinor: 4000, remainingMinor: 4000 }),
    funding('payment-2', { originalMinor: 6000, remainingMinor: 6000 }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  assert.equal(proposals.length, 2);
  for (const proposal of proposals) assert.equal(proposal.expectedRemaining['invoice-1'], 10000);
  assert.deepEqual(remaining(applyReconciliation(input, proposals, batch)), {
    'invoice-1': 0, 'payment-1': 0, 'payment-2': 0,
  });
  const subset = applyReconciliation(input, [proposals.find(proposal => proposal.fundingId === 'payment-2')], batch);
  assert.deepEqual(remaining(subset), { 'invoice-1': 4000, 'payment-1': 4000, 'payment-2': 0 });
});

test('overcommitted partial proposals are rejected together', () => {
  assertNoProposals([
    invoice(),
    funding('payment-1', { originalMinor: 6000, remainingMinor: 6000 }),
    funding('payment-2', { originalMinor: 6000, remainingMinor: 6000 }),
  ]);
});

test('suggestion output is deterministic and does not mutate frozen inputs or rules', () => {
  const items = deepFreeze([
    invoice(),
    funding('payment-1', { originalMinor: 4000, remainingMinor: 4000 }),
    funding('payment-2', { originalMinor: 6000, remainingMinor: 6000 }),
  ]);
  const rules = deepFreeze({ ...DEFAULT_RECONCILIATION_RULES });
  const before = JSON.stringify({ items, rules });
  const first = suggestReconciliation(items, rules);
  assert.deepEqual(suggestReconciliation(items, rules), first);
  assert.equal(JSON.stringify({ items, rules }), before);
  assert.equal(new Set(first.proposals.map(proposal => proposal.id)).size, first.proposals.length);
});

test('unmatched funding retains an explanatory reason', () => {
  const result = suggestReconciliation([funding('unmatched-payment', { reference: 'Unknown' })]);
  assert.deepEqual(result.proposals, []);
  assert.ok(result.unmatched.some(entry => entry.itemId === 'unmatched-payment' && typeof entry.reason === 'string' && entry.reason.length > 0));
});

test('apply is immutable and records a full auditable batch', () => {
  const input = deepFreeze(state());
  const proposals = deepFreeze(suggestReconciliation(input.items).proposals);
  const before = JSON.stringify({ input, proposals });
  const applied = applyReconciliation(input, proposals, batch);
  assert.notEqual(applied, input);
  assert.notEqual(applied.items, input.items);
  assert.deepEqual(remaining(applied), { 'invoice-1': 0, 'payment-1': 0 });
  assert.equal(applied.batches.length, 1);
  assert.deepEqual(applied.batches[0], {
    ...batch,
    proposalIds: [proposals[0].id],
    allocations: [{ fundingId: 'payment-1', invoiceId: 'invoice-1', amountMinor: 10000 }],
  });
  assert.equal(JSON.stringify({ input, proposals }), before);
});

test('apply rejects stale funding or invoice snapshots without mutating anything', () => {
  for (const staleId of ['invoice-1', 'payment-1']) {
    const input = state();
    const { proposals } = suggestReconciliation(input.items);
    input.items = input.items.map(row => row.id === staleId ? { ...row, remainingMinor: 9999 } : row);
    const before = JSON.stringify(input);
    assert.throws(() => applyReconciliation(deepFreeze(input), proposals, batch));
    assert.equal(JSON.stringify(input), before);
  }
});

test('apply atomically rejects a batch with a valid proposal followed by a stale proposal', () => {
  const input = state([
    invoice(), funding(),
    invoice('invoice-2', { documentNumber: 'INV-2' }),
    funding('payment-2', { reference: 'INV-2' }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  assert.equal(proposals.length, 2);
  const stale = proposals.map((proposal, index) => index === 1
    ? { ...proposal, expectedRemaining: { ...proposal.expectedRemaining, [proposal.fundingId]: 9000 } }
    : proposal);
  const before = JSON.stringify(input);
  assert.throws(() => applyReconciliation(deepFreeze(input), stale, batch));
  assert.equal(JSON.stringify(input), before);
  assert.equal(input.batches.length, 0);
});

test('apply rejects invalid allocation amounts and capacity overflow atomically', () => {
  const input = deepFreeze(state());
  const { proposals } = suggestReconciliation(input.items);
  for (const amountMinor of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 10001]) {
    const modified = [{ ...proposals[0], allocations: [{ invoiceId: 'invoice-1', amountMinor }] }];
    assert.throws(() => applyReconciliation(input, modified, batch));
    assert.deepEqual(remaining(input), { 'invoice-1': 10000, 'payment-1': 10000 });
    assert.deepEqual(input.batches, []);
  }
});

test('apply validates item existence, document kind, proposal scope, and expected balances', () => {
  const input = deepFreeze(state());
  const original = suggestReconciliation(input.items).proposals[0];
  const invalid = [
    { ...original, fundingId: 'missing' },
    { ...original, fundingId: 'invoice-1' },
    { ...original, organizationId: 'organization-2' },
    { ...original, allocations: [{ invoiceId: 'missing', amountMinor: 10000 }] },
    { ...original, allocations: [{ invoiceId: 'payment-1', amountMinor: 10000 }] },
    { ...original, expectedRemaining: {} },
  ];
  for (const proposal of invalid) assert.throws(() => applyReconciliation(input, [proposal], batch));
});

test('apply rechecks organization, counterparty, currency, and side on the actual items', () => {
  const original = state();
  const { proposals } = suggestReconciliation(original.items);
  for (const patch of [
    { organizationId: 'organization-2' },
    { counterpartyId: 'counterparty-2' },
    { currency: 'USD' },
    { side: 'Payable' },
  ]) {
    const input = deepFreeze({ ...original, items: original.items.map(row => row.kind === 'Invoice' ? { ...row, ...patch } : row) });
    assert.throws(() => applyReconciliation(input, proposals, batch));
  }
});

test('apply checks combined capacity across proposals, not each allocation in isolation', () => {
  const input = deepFreeze(state([
    invoice(),
    funding('payment-1', { originalMinor: 6000, remainingMinor: 6000 }),
    funding('payment-2', { originalMinor: 6000, remainingMinor: 6000 }),
  ]));
  const proposals = input.items.filter(row => row.kind === 'Payment').map(row => ({
    id: `manual-${row.id}`,
    organizationId,
    fundingId: row.id,
    allocations: [{ invoiceId: 'invoice-1', amountMinor: 6000 }],
    confidence: 'Review required',
    rule: 'partial reference',
    reason: 'Explicit invoice reference',
    expectedRemaining: { 'invoice-1': 10000, [row.id]: 6000 },
  }));
  assert.throws(() => applyReconciliation(input, proposals, batch));
  assert.equal(input.items[0].remainingMinor, 10000);
  assert.deepEqual(input.batches, []);
});

test('apply rejects duplicate proposal IDs within a batch and already-active proposal IDs', () => {
  const input = state([
    invoice(), funding(),
    invoice('invoice-2', { documentNumber: 'INV-2' }),
    funding('payment-2', { reference: 'INV-2' }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  assert.equal(proposals.length, 2);
  assert.throws(() => applyReconciliation(input, [proposals[0], proposals[0]], batch));
  const applied = applyReconciliation(input, [proposals[0]], batch);
  assert.throws(() => applyReconciliation(applied, [{ ...proposals[1], id: proposals[0].id }], { ...batch, id: 'batch-2' }));
});

test('reversal restores all balances, preserves history, and is immutable', () => {
  const input = state([
    invoice('invoice-1', { originalMinor: 4000, remainingMinor: 4000 }),
    invoice('invoice-2', { documentNumber: 'INV-2', originalMinor: 6000, remainingMinor: 6000 }),
    funding('payment-1', { reference: 'INV-1 / INV-2', originalMinor: 12000, remainingMinor: 12000 }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  const applied = deepFreeze(applyReconciliation(input, proposals, batch));
  const before = JSON.stringify(applied);
  const reversed = reverseReconciliation(applied, batch.id, reversedAt);
  assert.notEqual(reversed, applied);
  assert.deepEqual(remaining(reversed), remaining(input));
  assert.equal(reversed.batches.length, 1);
  assert.deepEqual(reversed.batches[0], { ...applied.batches[0], reversedAt });
  assert.equal(JSON.stringify(applied), before);
  assert.throws(() => reverseReconciliation(reversed, batch.id, reversedAt));
  assert.throws(() => reverseReconciliation(applied, 'missing-batch', reversedAt));
});

test('reversal affects only its batch and retains other completed allocations', () => {
  const input = state([
    invoice(), funding(),
    invoice('invoice-2', { documentNumber: 'INV-2' }),
    funding('payment-2', { reference: 'INV-2' }),
  ]);
  const { proposals } = suggestReconciliation(input.items);
  const first = proposals.find(proposal => proposal.fundingId === 'payment-1');
  const second = proposals.find(proposal => proposal.fundingId === 'payment-2');
  const firstApplied = applyReconciliation(input, [first], batch);
  const bothApplied = applyReconciliation(firstApplied, [second], { ...batch, id: 'batch-2' });
  const reversed = reverseReconciliation(bothApplied, batch.id, reversedAt);
  assert.deepEqual(remaining(reversed), { 'invoice-1': 10000, 'payment-1': 10000, 'invoice-2': 0, 'payment-2': 0 });
  assert.equal(reversed.batches.length, 2);
  assert.equal(reversed.batches[0].reversedAt, reversedAt);
  assert.equal(reversed.batches[1].reversedAt, undefined);
});

test('a reversed proposal can be applied again under a new batch ID', () => {
  const input = state();
  const { proposals } = suggestReconciliation(input.items);
  const applied = applyReconciliation(input, proposals, batch);
  const reversed = reverseReconciliation(applied, batch.id, reversedAt);
  const reapplied = applyReconciliation(reversed, proposals, { ...batch, id: 'batch-2' });
  assert.deepEqual(remaining(reapplied), remaining(applied));
  assert.equal(reapplied.batches.length, 2);
  assert.equal(reapplied.batches[0].reversedAt, reversedAt);
  assert.equal(reapplied.batches[1].id, 'batch-2');
  assert.equal(reapplied.batches[1].reversedAt, undefined);
});

function persistedHistory() {
  return {
    ...state([invoice('invoice-1', { remainingMinor: 0 }), funding('payment-1', { remainingMinor: 0 })]),
    batches: [{
      ...batch,
      proposalIds: ['proposal-1'],
      allocations: [{ fundingId: 'payment-1', invoiceId: 'invoice-1', amountMinor: 10000 }],
    }],
  };
}

function assertInvalidPersisted(value, companyId = organizationId) {
  assert.throws(() => parseReconciliationState(JSON.stringify(value), companyId), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.trim().length > 0);
    return true;
  });
}

test('parser rejects malformed JSON and non-object top-level values with an explanatory error', () => {
  for (const raw of ['', '{', '{"version":1,}', 'undefined', 'NaN']) {
    assert.throws(() => parseReconciliationState(raw, organizationId), Error);
  }
  for (const value of [null, false, true, 0, 1, 'state', [], [state()]]) assertInvalidPersisted(value);
});

test('parser requires version 1, matching organization, and item/batch arrays', () => {
  const valid = state();
  for (const patch of [
    { version: undefined }, { version: 0 }, { version: 2 }, { version: '1' },
    { organizationId: undefined }, { organizationId: '' }, { organizationId: 1 }, { organizationId: 'organization-2' },
    { items: undefined }, { items: null }, { items: {} }, { items: '[]' },
    { batches: undefined }, { batches: null }, { batches: {} }, { batches: '[]' },
  ]) assertInvalidPersisted({ ...valid, ...patch });
  assertInvalidPersisted(valid, 'organization-2');
  assertInvalidPersisted(valid, '');
  assert.deepEqual(parseReconciliationState(JSON.stringify(state([])), organizationId), state([]));
});

test('parser requires every item string field, including display name, reference, and due date', () => {
  const fields = [
    'id', 'organizationId', 'counterpartyId', 'counterpartyName', 'kind', 'side',
    'documentNumber', 'reference', 'documentDate', 'dueDate', 'currency',
  ];
  for (const field of fields) {
    for (const invalid of [undefined, null, 123, [], {}]) {
      assertInvalidPersisted(state([invoice('invoice-1', { [field]: invalid })]));
    }
  }
  for (const field of ['id', 'organizationId', 'counterpartyId', 'documentNumber']) {
    for (const invalid of ['', '   ']) assertInvalidPersisted(state([invoice('invoice-1', { [field]: invalid })]));
  }
  for (const invalid of [null, 0, 'invoice', [], {}]) assertInvalidPersisted(state([invalid]));
});

test('parser rejects foreign items, duplicate item IDs, and unknown enum values', () => {
  assertInvalidPersisted(state([invoice('invoice-1', { organizationId: 'organization-2' })]));
  assertInvalidPersisted(state([invoice(), funding('invoice-1')]));
  for (const patch of [
    { kind: 'Refund' }, { kind: 'invoice' }, { kind: '' },
    { side: 'Both' }, { side: 'receivable' }, { side: '' },
    { currency: 'GBP' }, { currency: 'eur' }, { currency: '' },
  ]) assertInvalidPersisted(state([invoice('invoice-1', patch)]));
});

test('parser enforces safe non-negative integer cents and remaining no greater than original', () => {
  for (const field of ['originalMinor', 'remainingMinor']) {
    for (const invalid of [undefined, null, '10000', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      assertInvalidPersisted(state([invoice('invoice-1', { [field]: invalid })]));
    }
  }
  assertInvalidPersisted(state([invoice('invoice-1', { originalMinor: 100, remainingMinor: 101 })]));
  for (const amount of [0, 1, Number.MAX_SAFE_INTEGER]) {
    const valid = state([invoice('invoice-1', { originalMinor: amount, remainingMinor: amount })]);
    assert.deepEqual(parseReconciliationState(JSON.stringify(valid), organizationId), valid);
  }
});

test('parser validates actual ISO document dates and permits only an empty or actual ISO due date', () => {
  for (const field of ['documentDate', 'dueDate']) {
    for (const invalid of ['2026-02-29', '2026-09-31', '2026-13-01', '2026-00-10', '2026-09-00', '2026-9-01', '09/01/2026', '2026-09-01T00:00:00Z', 'not-a-date']) {
      assertInvalidPersisted(state([invoice('invoice-1', { [field]: invalid })]));
    }
  }
  assertInvalidPersisted(state([invoice('invoice-1', { documentDate: '' })]));
  const leapDate = state([invoice('invoice-1', { documentDate: '2028-02-29', dueDate: '' })]);
  assert.deepEqual(parseReconciliationState(JSON.stringify(leapDate), organizationId), leapDate);
});

test('parser validates batch metadata and requires timezone-bearing ISO timestamps', () => {
  const valid = persistedHistory();
  for (const field of ['id', 'actor']) {
    for (const invalid of [undefined, null, 1, '', '   ', [], {}]) {
      assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], [field]: invalid }] });
    }
  }
  for (const invalid of [undefined, null, 1, '', '2026-09-14', '2026-09-14T10:00:00', 'not-a-date', '2026-02-30T10:00:00Z', '2026-09-14T25:00:00Z']) {
    assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], at: invalid }] });
  }
  for (const at of ['2026-09-14T10:00:00Z', '2026-09-14T13:00:00+03:00', batch.at]) {
    const accepted = { ...valid, batches: [{ ...valid.batches[0], at }] };
    assert.deepEqual(parseReconciliationState(JSON.stringify(accepted), organizationId), accepted);
  }
  for (const invalid of [null, 0, 'batch', [], {}]) assertInvalidPersisted({ ...valid, batches: [invalid] });
});

test('parser requires nonempty unique proposal IDs and nonempty allocation arrays', () => {
  const valid = persistedHistory();
  for (const proposalIds of [undefined, null, 'proposal-1', {}, [], [null], [1], [''], ['  '], ['proposal-1', 'proposal-1'], ['proposal-1', 'proposal-2']]) {
    assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], proposalIds }] });
  }
  for (const allocations of [undefined, null, '[]', {}, [], [null], [0], ['allocation'], [[]], [{}]]) {
    assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], allocations }] });
  }
});

test('parser rejects invalid allocation amounts and unknown or wrong-kind document references', () => {
  const valid = persistedHistory();
  const allocation = valid.batches[0].allocations[0];
  for (const patch of [
    ...[undefined, null, '10000', 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(amountMinor => ({ amountMinor })),
    ...[undefined, null, 1, '', 'missing-funding', 'invoice-1'].map(fundingId => ({ fundingId })),
    ...[undefined, null, 1, '', 'missing-invoice', 'payment-1'].map(invoiceId => ({ invoiceId })),
  ]) {
    assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], allocations: [{ ...allocation, ...patch }] }] });
  }
});

test('parser requires persisted allocations to share counterparty, currency, side, and organization', () => {
  const valid = persistedHistory();
  for (const patch of [
    { counterpartyId: 'counterparty-2' },
    { currency: 'USD' },
    { side: 'Payable' },
    { organizationId: 'organization-2' },
  ]) {
    assertInvalidPersisted({ ...valid, items: valid.items.map(row => row.kind === 'Invoice' ? { ...row, ...patch } : row) });
  }
});

test('parser validates reversal timestamps and rejects reversal before application', () => {
  const valid = persistedHistory();
  for (const invalid of [null, 1, '', 'not-a-date', '2026-09-14', '2026-09-14T11:00:00', '2026-02-30T11:00:00Z', '2026-09-14T09:59:59.999Z']) {
    assertInvalidPersisted({ ...valid, batches: [{ ...valid.batches[0], reversedAt: invalid }] });
  }
  for (const at of [batch.at, reversedAt, '2026-09-14T13:00:00+03:00']) {
    const accepted = { ...state(), batches: [{ ...valid.batches[0], reversedAt: at }] };
    assert.deepEqual(parseReconciliationState(JSON.stringify(accepted), organizationId), accepted);
  }
});

test('parser rejects duplicate batch IDs and proposal IDs reused across active batches', () => {
  const valid = persistedHistory();
  const items = valid.items.map(row => ({ ...row, originalMinor: 20000 }));
  assertInvalidPersisted({
    ...valid,
    items,
    batches: [valid.batches[0], { ...valid.batches[0], proposalIds: ['proposal-2'] }],
  });
  assertInvalidPersisted({
    ...valid,
    items,
    batches: [valid.batches[0], { ...valid.batches[0], id: 'batch-2' }],
  });
});

test('parser checks active allocations plus current balances against both original balances', () => {
  const valid = persistedHistory();
  for (const id of ['invoice-1', 'payment-1']) {
    assertInvalidPersisted({ ...valid, items: valid.items.map(row => row.id === id ? { ...row, remainingMinor: 1 } : row) });
  }
  const partialBatch = {
    ...valid.batches[0],
    allocations: [{ fundingId: 'payment-1', invoiceId: 'invoice-1', amountMinor: 6000 }],
  };
  assertInvalidPersisted({
    ...valid,
    batches: [partialBatch, { ...partialBatch, id: 'batch-2', proposalIds: ['proposal-2'] }],
  });
});

test('parser rejects unsafe aggregate allocation totals even when each amount is a safe integer', () => {
  const valid = persistedHistory();
  const items = valid.items.map(row => ({ ...row, originalMinor: Number.MAX_SAFE_INTEGER }));
  const allocation = valid.batches[0].allocations[0];
  assertInvalidPersisted({
    ...valid,
    items,
    batches: [{
      ...valid.batches[0],
      allocations: [{ ...allocation, amountMinor: Number.MAX_SAFE_INTEGER - 10 }, { ...allocation, amountMinor: 20 }],
    }],
  });
});

test('parser validates reversed history references even though reversed allocations no longer reserve balance', () => {
  const valid = persistedHistory();
  const historical = { ...valid.batches[0], reversedAt };
  const accepted = { ...state(), batches: [historical] };
  assert.deepEqual(parseReconciliationState(JSON.stringify(accepted), organizationId), accepted);
  assertInvalidPersisted({
    ...accepted,
    batches: [{ ...historical, allocations: [{ fundingId: 'payment-1', invoiceId: 'missing', amountMinor: 10000 }] }],
  });
  assertInvalidPersisted({
    ...accepted,
    batches: [{ ...historical, allocations: [{ fundingId: 'payment-1', invoiceId: 'invoice-1', amountMinor: 10001 }] }],
  });
});

test('parser accepts a prior partially paid baseline without inventing missing reconciliation history', () => {
  const initial = state([
    invoice('invoice-1', { originalMinor: 10000, remainingMinor: 6000 }),
    funding('payment-1', { originalMinor: 2000, remainingMinor: 2000, dueDate: '' }),
  ]);
  assert.deepEqual(parseReconciliationState(JSON.stringify(initial), organizationId), initial);
  const { proposals } = suggestReconciliation(initial.items);
  const applied = applyReconciliation(initial, proposals, batch);
  const parsed = parseReconciliationState(JSON.stringify(applied), organizationId);
  assert.deepEqual(parsed, applied);
  assert.equal(parsed.items.find(row => row.kind === 'Invoice').remainingMinor, 4000);
  const reversed = reverseReconciliation(parsed, batch.id, reversedAt);
  assert.deepEqual(reversed.items, initial.items);
  assert.deepEqual(parseReconciliationState(JSON.stringify(reversed), organizationId), reversed);
});

test('parser reconstructs only known state, item, batch, and allocation fields', () => {
  const expected = persistedHistory();
  const extra = {
    ...expected,
    extraState: { unexpected: true },
    items: expected.items.map(row => ({ ...row, extraItem: 'discard me' })),
    batches: expected.batches.map(entry => ({
      ...entry,
      extraBatch: 'discard me',
      allocations: entry.allocations.map(allocation => ({ ...allocation, extraAllocation: 'discard me' })),
    })),
  };
  const parsed = parseReconciliationState(JSON.stringify(extra), organizationId);
  assert.deepEqual(parsed, expected);
  assert.equal(Object.hasOwn(parsed, 'extraState'), false);
  assert.equal(Object.hasOwn(parsed.items[0], 'extraItem'), false);
  assert.equal(Object.hasOwn(parsed.batches[0], 'extraBatch'), false);
  assert.equal(Object.hasOwn(parsed.batches[0].allocations[0], 'extraAllocation'), false);
});

test('parser round-trips demo, applied, undone, and reapplied states with reused historical proposal IDs', () => {
  const demo = createDemoReconciliationState(organizationId);
  const { proposals } = suggestReconciliation(demo.items);
  assert.ok(proposals.length > 0);
  const applied = applyReconciliation(demo, proposals, batch);
  const reversed = reverseReconciliation(applied, batch.id, reversedAt);
  const reapplied = applyReconciliation(reversed, proposals, { ...batch, id: 'batch-2', at: '2026-09-14T12:00:00.000Z' });
  for (const value of [demo, applied, reversed, reapplied]) {
    assert.deepEqual(parseReconciliationState(JSON.stringify(value), organizationId), value);
  }
  assert.deepEqual(reapplied.batches[0].proposalIds, reapplied.batches[1].proposalIds);
  assert.equal(reapplied.batches[0].reversedAt, reversedAt);
  assert.equal(reapplied.batches[1].reversedAt, undefined);
});

test('deposits are manual-only even with exact references, unique amounts or multiple covered invoices', () => {
  for (const patch of [
    { reference: 'INV-1' },
    { reference: '' },
    { reference: 'INV-1 INV-2', originalMinor: 20000, remainingMinor: 20000 },
  ]) {
    const deposit = funding('deposit-1', { kind: 'Deposit', ...patch });
    const rows = [invoice(), invoice('invoice-2', { documentNumber: 'INV-2' }), deposit];
    const result = suggestReconciliation(deepFreeze(rows));
    assert.equal(result.proposals.length, 0);
    assert.match(result.unmatched.find(entry => entry.itemId === deposit.id).reason, /Deposits require manual allocation/);
  }
  const deposit = funding('deposit-1', { kind: 'Deposit' });
  const withBank = suggestReconciliation([invoice(), funding(), deposit]);
  assert.equal(withBank.proposals.length, 1);
  assert.equal(withBank.proposals[0].fundingId, 'payment-1');
  assert.match(withBank.unmatched.find(entry => entry.itemId === deposit.id).reason, /manual allocation/);
  const settled = suggestReconciliation([deposit].map(row => ({ ...row, remainingMinor: 0 })));
  assert.equal(settled.unmatched[0].reason, 'No remaining balance.');
});

test('manual deposit allocations apply partially, parse and reverse without losing contract history', () => {
  for (const side of ['Receivable', 'Payable']) {
    const input = deepFreeze(state([
      invoice('invoice-1', { side }),
      funding('deposit-1', { kind: 'Deposit', side, originalMinor: 25000, remainingMinor: 25000, reference: 'Contract LT-2026-001' }),
    ]));
    const proposal = {
      id: 'manual-deposit', organizationId, fundingId: 'deposit-1',
      allocations: [{ invoiceId: 'invoice-1', amountMinor: 2517 }],
      confidence: 'Review required', rule: 'Manual selection', reason: 'Approved partial contract release',
      expectedRemaining: { 'deposit-1': 25000, 'invoice-1': 10000 },
    };
    const applied = applyReconciliation(input, [proposal], batch);
    assert.deepEqual(remaining(applied), { 'invoice-1': 7483, 'deposit-1': 22483 });
    assert.deepEqual(applied.batches[0].allocations, [{ fundingId: 'deposit-1', invoiceId: 'invoice-1', amountMinor: 2517 }]);
    const parsed = parseReconciliationState(JSON.stringify(applied), organizationId);
    assert.deepEqual(parsed, applied);
    assert.equal(parsed.items[1].reference, 'Contract LT-2026-001');
    const reversed = reverseReconciliation(parsed, batch.id, reversedAt);
    assert.deepEqual(reversed.items, input.items);
    assert.deepEqual(parseReconciliationState(JSON.stringify(reversed), organizationId), reversed);
    assert.throws(() => reverseReconciliation(reversed, batch.id, reversedAt), /already been reversed/);
  }
});

test('deposit funding cannot bypass scope, safe-cent or stale-balance validation', () => {
  const initial = state([invoice(), funding('deposit-1', { kind: 'Deposit' })]);
  const proposal = {
    id: 'manual-deposit', organizationId, fundingId: 'deposit-1',
    allocations: [{ invoiceId: 'invoice-1', amountMinor: 2500 }],
    confidence: 'Review required', rule: 'Manual selection', reason: 'Partial release',
    expectedRemaining: { 'deposit-1': 10000, 'invoice-1': 10000 },
  };
  for (const patch of [{ organizationId: 'another-company' }, { counterpartyId: 'another-client' }, { currency: 'USD' }, { side: 'Payable' }]) {
    const incompatible = deepFreeze({ ...initial, items: initial.items.map(row => row.kind === 'Deposit' ? { ...row, ...patch } : row) });
    assert.throws(() => applyReconciliation(incompatible, [proposal], batch), /organization|counterparty|currency|side/i);
  }
  for (const amountMinor of [0, -1, 1.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 10001]) {
    assert.throws(() => applyReconciliation(deepFreeze(initial), [{ ...proposal, allocations: [{ invoiceId: 'invoice-1', amountMinor }] }], batch));
  }
  const stale = { ...proposal, expectedRemaining: { 'deposit-1': 9999, 'invoice-1': 10000 } };
  assert.throws(() => applyReconciliation(initial, [stale], batch), /Stale/);
  for (const originalMinor of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parseReconciliationState(JSON.stringify({ ...initial, items: initial.items.map(row => row.kind === 'Deposit' ? { ...row, originalMinor } : row) }), organizationId), /safe integer/);
  }
});

test('explicit payment purposes route to accounting with or without an assigned client', () => {
  const categories = [
    ['Tax authority', ['VMI', 'Valstybinė mokesčių inspekcija', 'Tax authority', 'State tax inspectorate']],
    ['Social insurance', ['Sodra', 'Social insurance contributions', 'Valstybinio socialinio draudimo fondo valdyba']],
    ['Payroll', ['PAYROLL 2026-09', 'salary', 'salaries', 'Darbo užmokestis', 'Darbo uzmokescio avansas']],
    ['Bank fees', ['Bank fee', 'bank fees', 'Bank service fee', 'bank commission', 'Bank charges', 'Banko komisinis mokestis', 'banko mokesčiai']],
  ];
  for (const [category, signals] of categories) for (const signal of signals) {
    for (const field of ['payeeName', 'counterpartyName', 'reference']) {
      const identified = funding('accounting', { [field]: signal });
      const route = getReconciliationRoute(identified);
      assert.equal(route.kind, 'accounting', `${field}: ${signal}`);
      assert.equal(route.category, category, signal);
      assert.ok(route.reason.length > 0);
      assert.equal(hasReconciliationClient(identified), true);
      assert.equal(isClientReconciliationItem(identified), false);
      if (field !== 'counterpartyName') {
        const unassigned = { ...identified, counterpartyId: '', counterpartyName: '' };
        assert.equal(getReconciliationRoute(unassigned).category, category);
        assert.equal(hasReconciliationClient(unassigned), false);
      }
    }
  }
});

test('recognition avoids substrings, generic VAT invoices and ordinary commissions', () => {
  for (const reference of ['VAT invoice INV-1', 'PVM sąskaita faktūra INV-1', 'Tax consulting invoice', 'Sales commission INV-1', 'Invoice settlement', 'XVMIX', 'VMI123', 'Sodralita UAB', 'salary123', 'payrolls', 'bank feesXYZ', 'x_bank fee', 'VMI_service']) {
    const identified = funding('ordinary', { reference });
    assert.equal(getReconciliationRoute(identified).kind, 'client', reference);
    assert.equal(isClientReconciliationItem(identified), true);
    const missing = { ...identified, counterpartyId: '', counterpartyName: '' };
    assert.equal(getReconciliationRoute(missing).kind, 'unidentified', reference);
  }
  for (const kind of ['Invoice', 'Advance', 'Deposit', 'Credit note']) {
    assert.equal(getReconciliationRoute(item('nonpayment', { kind, reference: 'VMI salary bank fee Sodra' })).kind, 'client');
  }
});

test('parser permits exactly empty client fields only for payments and preserves optional metadata', () => {
  const valid = state([funding('tax', { counterpartyId: '', counterpartyName: '', payeeName: 'VMI', glAccountCode: '4484' })]);
  assert.deepEqual(parseReconciliationState(JSON.stringify(valid), organizationId), valid);
  assert.deepEqual(parseReconciliationState(JSON.stringify(state()), organizationId), state());
  assert.equal(Object.hasOwn(parseReconciliationState(JSON.stringify(state()), organizationId), 'glAssignments'), false);
  for (const patch of [
    { counterpartyId: '' }, { counterpartyName: '' }, { counterpartyId: ' ', counterpartyName: ' ' },
    { counterpartyId: null, counterpartyName: null }, { counterpartyId: undefined, counterpartyName: undefined },
  ]) assertInvalidPersisted(state([funding('invalid', patch)]));
  for (const kind of ['Invoice', 'Advance', 'Deposit', 'Credit note']) {
    assertInvalidPersisted(state([item('invalid', { kind, counterpartyId: '', counterpartyName: '' })]));
  }
  for (const key of ['payeeName', 'glAccountCode']) for (const value of [null, '', ' ', 42, [], {}]) {
    assertInvalidPersisted(state([funding('bad-meta', { [key]: value })]));
  }
  assertInvalidPersisted(state([funding('bad-account', { glAccountCode: ' 4484 ' })]));
});

test('non-client routes never produce suggestions or apply new invoice allocations', () => {
  const original = state();
  const proposals = suggestReconciliation(original.items).proposals;
  for (const patch of [
    { reference: 'INV-1; VMI' }, { payeeName: 'Sodra' }, { reference: 'Payroll INV-1' },
    { reference: 'Bank fee INV-1' }, { counterpartyId: '', counterpartyName: '' },
  ]) {
    const input = deepFreeze({ ...original, items: original.items.map(row => row.kind === 'Payment' ? { ...row, ...patch } : row) });
    const before = JSON.stringify(input);
    assertNoProposals(input.items);
    assert.ok(suggestReconciliation(input.items).unmatched.find(entry => entry.itemId === 'payment-1')?.reason);
    assert.throws(() => applyReconciliation(input, proposals, batch));
    assert.equal(JSON.stringify(input), before);
  }
});

test('recognized payment purposes do not invalidate existing allocation history or its reversal', () => {
  const original = state();
  const applied = applyReconciliation(original, suggestReconciliation(original.items).proposals, batch);
  const historical = { ...applied, items: applied.items.map(row => row.kind === 'Payment' ? { ...row, reference: 'Bank commission; INV-1' } : row) };
  const parsed = deepFreeze(parseReconciliationState(JSON.stringify(historical), organizationId));
  assert.deepEqual(parsed, historical);
  const reversed = reverseReconciliation(parsed, batch.id, reversedAt);
  assert.deepEqual(remaining(reversed), remaining(original));
  assert.deepEqual(parseReconciliationState(JSON.stringify(reversed), organizationId), reversed);
  assertNoProposals(reversed.items);
});

const glMeta = { id: 'gl-1', at: '2026-09-16T10:00:00.000Z', actor: 'Accountant', note: '' };
const accountingState = () => state([invoice(), funding('accounting', { counterpartyId: '', counterpartyName: '', payeeName: 'VMI', reference: 'PVM įmoka' })]);

test('GL account assignment appends immutable audit metadata without changing money or batches', () => {
  const input = deepFreeze(accountingState());
  const before = JSON.stringify(input);
  const changed = assignReconciliationGlAccount(input, 'accounting', '4484', ['4484', '271'], glMeta);
  assert.equal(JSON.stringify(input), before);
  assert.strictEqual(changed.batches, input.batches);
  assert.strictEqual(changed.items[0], input.items[0]);
  assert.deepEqual(remaining(changed), remaining(input));
  assert.deepEqual(changed.items.map(row => row.originalMinor), input.items.map(row => row.originalMinor));
  assert.deepEqual(changed.glAssignments, [{ ...glMeta, itemId: 'accounting', fromAccount: '', toAccount: '4484' }]);
  assert.equal(changed.items[1].glAccountCode, '4484');
  const twice = assignReconciliationGlAccount(deepFreeze(changed), 'accounting', '271', ['271'], { ...glMeta, id: 'gl-2', at: '2026-09-16T11:00:00Z', note: 'Correction after review' });
  assert.deepEqual(twice.glAssignments[1], { id: 'gl-2', at: '2026-09-16T11:00:00Z', actor: 'Accountant', note: 'Correction after review', itemId: 'accounting', fromAccount: '4484', toAccount: '271' });
  assert.deepEqual(parseReconciliationState(JSON.stringify(twice), organizationId), twice);
  assert.equal(getReconciliationRoute(twice.items[1]).kind, 'accounting');
});

test('GL edits support unidentified and identified accounting payments, including historical balances', () => {
  for (const patch of [
    { counterpartyId: '', counterpartyName: '', reference: 'Unrecognized transfer' },
    { reference: 'Bank service fee' },
  ]) {
    const input = state([funding('accounting', patch)]);
    const changed = assignReconciliationGlAccount(input, 'accounting', '6118', ['6118'], glMeta);
    assert.deepEqual(remaining(changed), remaining(input));
    assert.deepEqual(parseReconciliationState(JSON.stringify(changed), organizationId), changed);
  }
  const historical = persistedHistory();
  historical.items[1].reference = 'Bank fee';
  const changed = assignReconciliationGlAccount(deepFreeze(historical), 'payment-1', '6118', ['6118'], glMeta);
  assert.deepEqual(changed.batches, historical.batches);
  assert.deepEqual(remaining(changed), remaining(historical));
  const reversed = reverseReconciliation(changed, batch.id, reversedAt);
  assert.deepEqual(reversed.glAssignments, changed.glAssignments);
  assert.deepEqual(parseReconciliationState(JSON.stringify(reversed), organizationId), reversed);
});

test('GL assignment rejects invalid items, company scope, inactive accounts and invalid metadata atomically', () => {
  const input = deepFreeze(accountingState());
  const before = JSON.stringify(input);
  for (const itemId of ['missing', 'invoice-1']) assert.throws(() => assignReconciliationGlAccount(input, itemId, '4484', ['4484'], glMeta));
  assert.throws(() => assignReconciliationGlAccount(state(), 'payment-1', '4484', ['4484'], glMeta));
  for (const code of ['', ' ', ' 4484 ', 'inactive', null, 4484]) assert.throws(() => assignReconciliationGlAccount(input, 'accounting', code, ['4484'], glMeta));
  for (const allowed of [[], null, {}, ['4484', null]]) assert.throws(() => assignReconciliationGlAccount(input, 'accounting', '4484', allowed, glMeta));
  for (const patch of [{ id: '' }, { actor: ' ' }, { note: null }, { note: undefined }, { at: '2026-09-16' }, { at: '2026-02-30T10:00:00Z' }]) {
    assert.throws(() => assignReconciliationGlAccount(input, 'accounting', '4484', ['4484'], { ...glMeta, ...patch }));
  }
  assert.throws(() => assignReconciliationGlAccount({ ...input, organizationId: 'other' }, 'accounting', '4484', ['4484'], glMeta));
  assert.throws(() => assignReconciliationGlAccount({ ...input, items: [...input.items, input.items[1]] }, 'accounting', '4484', ['4484'], glMeta));
  const once = assignReconciliationGlAccount(input, 'accounting', '4484', ['4484'], glMeta);
  assert.throws(() => assignReconciliationGlAccount(once, 'accounting', '4484', ['4484'], { ...glMeta, id: 'gl-2' }), /different/);
  assert.throws(() => assignReconciliationGlAccount(once, 'accounting', '271', ['271'], glMeta), /already exists/);
  assert.throws(() => assignReconciliationGlAccount(once, 'accounting', '271', ['271'], { ...glMeta, id: 'gl-2', at: '2026-09-15T10:00:00Z' }), /precedes/);
  assert.equal(JSON.stringify(input), before);
});

test('parser strictly validates GL audit records and their final account and edit chain', () => {
  const once = assignReconciliationGlAccount(accountingState(), 'accounting', '4484', ['4484'], glMeta);
  for (const glAssignments of [null, {}, '', [null], [{}], [once.glAssignments[0], once.glAssignments[0]]]) assertInvalidPersisted({ ...once, glAssignments });
  for (const patch of [
    { id: '' }, { itemId: 'missing' }, { itemId: 'invoice-1' }, { fromAccount: null }, { fromAccount: ' ' },
    { toAccount: '' }, { toAccount: ' 4484' }, { fromAccount: '4484' }, { actor: '' }, { note: null },
    { at: 'yesterday' }, { at: '2026-02-30T00:00:00Z' },
  ]) assertInvalidPersisted({ ...once, glAssignments: [{ ...once.glAssignments[0], ...patch }] });
  assertInvalidPersisted({ ...once, items: once.items.map(row => row.id === 'accounting' ? { ...row, glAccountCode: '271' } : row) });
  const twice = assignReconciliationGlAccount(once, 'accounting', '271', ['271'], { ...glMeta, id: 'gl-2', at: '2026-09-16T11:00:00Z' });
  for (const patch of [{ fromAccount: '' }, { fromAccount: '6118' }, { at: '2026-09-15T10:00:00Z' }]) {
    assertInvalidPersisted({ ...twice, glAssignments: [twice.glAssignments[0], { ...twice.glAssignments[1], ...patch }] });
  }
  const emptyAudit = { ...state(), glAssignments: [] };
  assert.deepEqual(parseReconciliationState(JSON.stringify(emptyAudit), organizationId), emptyAudit);
});
