import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => {
    if (!imports[id]) throw new Error(`Unexpected import: ${id}`);
    return imports[id];
  }, module, module.exports);
  return module.exports;
}

const engine = load('../src/lib/reconciliation.ts');
const manual = load('../src/lib/manualReconciliation.ts', { './reconciliation': engine });
const { prepareMissingDocumentReconciliation, receiveAndReconcileDocument } = load(
  '../src/lib/reconciliationMissingDocument.ts', { './reconciliation': engine },
);
const meta = { id: 'received-batch', at: '2026-09-24T10:00:00.000Z', actor: 'Receiving accountant' };
const missingMetadata = {
  missingDocument: true,
  missingDocumentMarkedAt: '2026-09-22T10:00:00.000Z',
  missingDocumentMarkedBy: 'Original accountant',
};

function item(id, kind = 'Invoice', amount = 10000, patch = {}) {
  return {
    id, organizationId: 'org', counterpartyId: 'client', counterpartyName: 'Example client',
    kind, side: 'Receivable', documentNumber: id, reference: '', documentDate: '2026-09-01',
    dueDate: kind === 'Invoice' ? '2026-09-30' : '', currency: 'EUR',
    originalMinor: amount, remainingMinor: amount, ...patch,
  };
}

function fixture(sourcePatch = {}) {
  return {
    version: 1, organizationId: 'org',
    items: [
      item('missing-source', 'Invoice', 10000, { ...missingMetadata, exchangeRate: 1.12, exchangeRateCurrency: 'USD', ...sourcePatch }),
      item('payment-a', 'Payment', 6000),
      item('payment-b', 'Payment', 7000),
      item('other-invoice', 'Invoice', 5000),
      item('other-payment', 'Payment', 5000),
      item('still-missing', 'Invoice', 5000, missingMetadata),
      item('settled-invoice', 'Invoice', 2000, { remainingMinor: 0 }),
      item('settled-payment', 'Payment', 2000, { remainingMinor: 0 }),
      item('bank-fee', 'Payment', 1000, { paymentPurpose: 'Bank service fee', glAccountCode: '6270' }),
    ],
    batches: [{
      id: 'existing-batch', at: '2026-09-21T10:00:00.000Z', actor: 'Original accountant',
      proposalIds: ['existing-proposal'],
      allocations: [{ fundingId: 'settled-payment', invoiceId: 'settled-invoice', amountMinor: 2000 }],
    }],
    glAssignments: [{
      id: 'existing-gl-edit', itemId: 'bank-fee', fromAccount: '', toAccount: '6270',
      at: '2026-09-20T10:00:00.000Z', actor: 'Original accountant', note: 'Bank fee classification',
    }],
  };
}

const getItem = (state, id) => state.items.find(row => row.id === id);
const balances = state => Object.fromEntries(state.items.map(row => [row.id, row.remainingMinor]));
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function proposal(state, fundingId, invoiceId, amountMinor, id = 'received-proposal') {
  return {
    id, organizationId: state.organizationId, fundingId,
    allocations: [{ invoiceId, amountMinor }], confidence: 'Review required', rule: 'Manual selection', reason: 'Selected by accountant',
    expectedRemaining: balances(state),
  };
}
function assertRejectedWithoutChanges(state, selected, batch = meta, sourceId = 'missing-source') {
  const before = JSON.stringify(state);
  assert.throws(() => receiveAndReconcileDocument(state, sourceId, selected, batch));
  assert.equal(JSON.stringify(state), before);
  assert.equal(getItem(state, 'missing-source').missingDocument, true);
}

test('opening and abandoning Document received only creates a pure eligible draft', () => {
  const state = deepFreeze(fixture());
  const before = JSON.stringify(state);
  const draft = prepareMissingDocumentReconciliation(state, 'missing-source');
  assert.notEqual(draft, state);
  assert.deepEqual(draft, {
    ...state,
    items: state.items.map(row => row.id === 'missing-source' ? { ...row, missingDocument: false } : row),
  });
  assert.deepEqual(balances(draft), balances(state));
  assert.deepEqual(draft.batches, state.batches);
  assert.deepEqual(draft.glAssignments, state.glAssignments);
  assert.ok(manual.getManualReconciliationCandidates(draft.items, 'missing-source').some(row => row.id === 'payment-a'));
  assert.equal(JSON.stringify(state), before, 'Discarding the dialog draft must retain the stored missing flag and all ledger data');
});

test('confirming a partial match atomically receives the source and preserves its marking metadata and history', () => {
  const state = deepFreeze(fixture());
  const before = JSON.stringify(state);
  const draft = prepareMissingDocumentReconciliation(state, 'missing-source');
  const selected = manual.buildManualReconciliation(draft.items, 'missing-source', ['payment-a'], { 'payment-a': 2500 }).proposals;
  const next = receiveAndReconcileDocument(state, 'missing-source', selected, meta);
  assert.deepEqual(getItem(next, 'missing-source'), { ...getItem(state, 'missing-source'), missingDocument: false, remainingMinor: 7500 });
  assert.equal(getItem(next, 'payment-a').remainingMinor, 3500);
  assert.deepEqual(getItem(next, 'still-missing'), getItem(state, 'still-missing'));
  assert.deepEqual(next.batches.slice(0, -1), state.batches);
  assert.deepEqual(next.glAssignments, state.glAssignments);
  assert.deepEqual(next.batches.at(-1), {
    ...meta, proposalIds: selected.map(row => row.id),
    allocations: [{ fundingId: 'payment-a', invoiceId: 'missing-source', amountMinor: 2500 }],
  });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(next), 'org'), next);
});

test('a missing invoice can receive several selected funding records with a remaining balance', () => {
  const state = deepFreeze(fixture());
  const draft = prepareMissingDocumentReconciliation(state, 'missing-source');
  const selected = manual.buildManualReconciliation(draft.items, 'missing-source', ['payment-a', 'payment-b'], { 'payment-a': 3000, 'payment-b': 4500 }).proposals;
  const next = receiveAndReconcileDocument(state, 'missing-source', selected, meta);
  assert.equal(selected.length, 2);
  assert.equal(getItem(next, 'missing-source').remainingMinor, 2500);
  assert.equal(getItem(next, 'payment-a').remainingMinor, 3000);
  assert.equal(getItem(next, 'payment-b').remainingMinor, 2500);
  assert.equal(getItem(next, 'missing-source').missingDocument, false);
  assert.equal(next.batches.at(-1).allocations.length, 2);
});

test('a missing funding source can match multiple documents without receiving other missing records', () => {
  const state = fixture({ kind: 'Payment', dueDate: '' });
  state.items.push(item('second-invoice', 'Invoice', 6000));
  deepFreeze(state);
  const draft = prepareMissingDocumentReconciliation(state, 'missing-source');
  assert.ok(!manual.getManualReconciliationCandidates(draft.items, 'missing-source').some(row => row.id === 'still-missing'));
  const selected = manual.buildManualReconciliation(draft.items, 'missing-source', ['other-invoice', 'second-invoice'], { 'other-invoice': 4000, 'second-invoice': 6000 }).proposals;
  const next = receiveAndReconcileDocument(state, 'missing-source', selected, meta);
  assert.equal(selected.length, 1);
  assert.equal(getItem(next, 'missing-source').remainingMinor, 0);
  assert.equal(getItem(next, 'other-invoice').remainingMinor, 1000);
  assert.equal(getItem(next, 'second-invoice').remainingMinor, 0);
  assert.deepEqual(getItem(next, 'still-missing'), getItem(state, 'still-missing'));
  assert.equal(getItem(next, 'missing-source').missingDocument, false);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(next), 'org'), next);
});

test('receipt cannot bypass missing-document restrictions on a selected partner', () => {
  const state = deepFreeze(fixture({ kind: 'Payment', dueDate: '' }));
  assertRejectedWithoutChanges(state, [proposal(state, 'missing-source', 'still-missing', 1000)]);
});

test('invalid, stale, overamount, same-side, and accounting-only proposals preserve missing state and balances', () => {
  const state = deepFreeze(fixture());
  const valid = proposal(state, 'payment-a', 'missing-source', 1000);
  const cases = [
    [],
    [{ ...valid, allocations: [] }],
    [proposal(state, 'payment-a', 'missing-source', 0)],
    [proposal(state, 'payment-a', 'missing-source', -1)],
    [proposal(state, 'payment-a', 'missing-source', 0.5)],
    [proposal(state, 'payment-a', 'missing-source', 10001)],
    [{ ...valid, expectedRemaining: { ...valid.expectedRemaining, 'payment-a': 1 } }],
    [proposal(state, 'other-invoice', 'missing-source', 1000)],
    [proposal(state, 'bank-fee', 'missing-source', 1000)],
    [proposal(state, 'not-found', 'missing-source', 1000)],
    [{ ...valid, organizationId: 'another-organization' }],
  ];
  for (const selected of cases) assertRejectedWithoutChanges(state, selected);
});

test('a later failed proposal cannot partially receive or reconcile the source', () => {
  const state = deepFreeze(fixture());
  assertRejectedWithoutChanges(state, [
    proposal(state, 'payment-a', 'missing-source', 2000, 'valid-first'),
    proposal(state, 'payment-b', 'missing-source', 8000, 'invalid-second'),
  ]);
  assertRejectedWithoutChanges(state, [
    proposal(state, 'payment-a', 'missing-source', 6000, 'valid-first'),
    proposal(state, 'payment-b', 'missing-source', 7000, 'valid-alone-but-overallocated-together'),
  ]);
});

test('every proposal must involve the received source; unrelated work cannot clear its missing flag', () => {
  const state = deepFreeze(fixture());
  const unrelated = proposal(state, 'other-payment', 'other-invoice', 1000, 'unrelated');
  assertRejectedWithoutChanges(state, [unrelated]);
  assertRejectedWithoutChanges(state, [proposal(state, 'payment-a', 'missing-source', 1000), unrelated]);
  assertRejectedWithoutChanges(state, [{
    ...proposal(state, 'payment-a', 'missing-source', 1000),
    allocations: [{ invoiceId: 'missing-source', amountMinor: 1000 }, { invoiceId: 'other-invoice', amountMinor: 1000 }],
  }]);
});

test('missing IDs, already received, closed, and non-client sources cannot open or confirm receipt', () => {
  for (const patch of [
    { missingDocument: false },
    { missingDocument: undefined },
    { remainingMinor: 0 },
    { kind: 'Payment', paymentPurpose: 'Bank service fee' },
    { kind: 'Payment', counterpartyId: '', counterpartyName: '' },
  ]) {
    const state = deepFreeze(fixture(patch));
    const before = JSON.stringify(state);
    assert.throws(() => prepareMissingDocumentReconciliation(state, 'missing-source'));
    assert.throws(() => receiveAndReconcileDocument(state, 'missing-source', [proposal(state, 'payment-a', 'missing-source', 1000)], meta));
    assert.equal(JSON.stringify(state), before);
  }
  const state = deepFreeze(fixture());
  assert.throws(() => prepareMissingDocumentReconciliation(state, 'not-found'));
  assertRejectedWithoutChanges(state, [proposal(state, 'payment-a', 'missing-source', 1000)], meta, 'not-found');
});

test('invalid history and duplicate batch IDs are rejected without committing receipt', () => {
  const state = deepFreeze(fixture());
  assertRejectedWithoutChanges(state, [proposal(state, 'payment-a', 'missing-source', 1000)], { ...meta, id: 'existing-batch' });
  const corrupt = fixture();
  corrupt.batches[0].at = 'not-a-timestamp';
  deepFreeze(corrupt);
  const before = JSON.stringify(corrupt);
  assert.throws(() => prepareMissingDocumentReconciliation(corrupt, 'missing-source'));
  assertRejectedWithoutChanges(corrupt, [proposal(corrupt, 'payment-a', 'missing-source', 1000)]);
  assert.equal(JSON.stringify(corrupt), before);
});
