import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => { if (!imports[id]) throw new Error(id); return imports[id]; }, module, module.exports);
  return module.exports;
}
const engine = load('../src/lib/reconciliation.ts');
const correction = load('../src/lib/reconciliationCorrection.ts', { './reconciliation': engine });
const manual = load('../src/lib/manualReconciliation.ts', { './reconciliation': engine });
const meta = { id: 'correction:1', at: '2026-09-16T10:00:00.000Z', actor: 'Test accountant' };
function fixture() {
  const row = (id, kind, amount) => ({ id, kind, organizationId: 'org', counterpartyId: 'party', counterpartyName: 'Example', documentNumber: id, side: 'Receivable', currency: 'EUR', originalMinor: amount, remainingMinor: amount, reference: '', documentDate: '2026-09-01', dueDate: '2026-09-30' });
  const initial = { version: 1, organizationId: 'org', items: [row('i1', 'Invoice', 10000), row('i2', 'Invoice', 10000), row('i3', 'Invoice', 5000), row('p1', 'Payment', 20000), row('p2', 'Payment', 5000), row('p3', 'Payment', 10000)], batches: [] };
  const proposal = (id, fundingId, allocations) => ({ id, fundingId, organizationId: 'org', allocations, confidence: 'High', rule: 'Test', reason: 'Test', expectedRemaining: Object.fromEntries(initial.items.map(item => [item.id, item.remainingMinor])) });
  return engine.applyReconciliation(initial, [proposal('original1', 'p1', [{ invoiceId: 'i1', amountMinor: 10000 }, { invoiceId: 'i2', amountMinor: 10000 }]), proposal('original2', 'p2', [{ invoiceId: 'i3', amountMinor: 5000 }])], { id: 'original', at: '2026-09-15T10:00:00.000Z', actor: 'Original accountant' });
}
const balance = (state, id) => state.items.find(item => item.id === id).remainingMinor;
test('opening correction is a pure draft and preselects existing partners and amounts', () => {
  const state = fixture(); const before = JSON.stringify(state);
  const draft = correction.prepareReconciliationCorrection(state, 'i1', meta);
  assert.equal(draft.amounts.p1, 10000);
  assert.equal(balance(draft.state, 'i1'), 10000);
  assert.equal(balance(draft.state, 'p1'), 10000);
  for (const id of ['i2', 'i3', 'p2']) assert.equal(balance(draft.state, id), balance(state, id));
  assert.equal(JSON.stringify(state), before);
});
test('replacement atomically switches one invoice partner while retaining unrelated batch allocations and audit', () => {
  const state = fixture(); const draft = correction.prepareReconciliationCorrection(state, 'i1', meta);
  const proposals = manual.buildManualReconciliation(draft.state.items, 'i1', ['p3'], { p3: 10000 }).proposals;
  const next = correction.replaceReconciliation(state, 'i1', proposals, meta);
  assert.equal(balance(next, 'i1'), 0); assert.equal(balance(next, 'p3'), 0); assert.equal(balance(next, 'p1'), 10000);
  for (const id of ['i2', 'i3', 'p2']) assert.equal(balance(next, id), 0);
  assert.equal(next.batches[0].actor, 'Original accountant'); assert.equal(next.batches[0].reversedAt, meta.at);
  assert.equal(next.batches.at(-1).actor, 'Test accountant');
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(next), 'org'), next);
});
test('funding-side editing supports splitting between invoices and a partial residual', () => {
  const state = fixture(); const draft = correction.prepareReconciliationCorrection(state, 'p1', meta);
  const proposals = manual.buildManualReconciliation(draft.state.items, 'p1', ['i1', 'i2'], { i1: 4000, i2: 6000 }).proposals;
  const next = correction.replaceReconciliation(state, 'p1', proposals, meta);
  assert.equal(balance(next, 'p1'), 10000); assert.equal(balance(next, 'i1'), 6000); assert.equal(balance(next, 'i2'), 4000);
  assert.equal(balance(next, 'i3'), 0); assert.equal(balance(next, 'p2'), 0);
});
test('invalid and stale replacements never mutate current state', () => {
  const state = fixture(); const before = JSON.stringify(state);
  const draft = correction.prepareReconciliationCorrection(state, 'i1', meta);
  const proposals = manual.buildManualReconciliation(draft.state.items, 'i1', ['p3']).proposals;
  proposals[0].expectedRemaining.p3 = 1;
  assert.throws(() => correction.replaceReconciliation(state, 'i1', proposals, meta), /Stale/);
  assert.throws(() => correction.replaceReconciliation(state, 'i1', [], meta), /at least one/);
  assert.equal(JSON.stringify(state), before);
});
test('cannot open missing or already reversed matches for correction', () => {
  const state = fixture();
  assert.throws(() => correction.prepareReconciliationCorrection(state, 'missing', meta), /No active/);
  assert.throws(() => correction.prepareReconciliationCorrection(engine.reverseReconciliation(state, 'original', meta.at), 'i1', meta), /No active/);
});
test('cannot replace unrelated records through the selected document editor', () => {
  const state = fixture(); const draft = correction.prepareReconciliationCorrection(state, 'p1', meta);
  const unrelated = manual.buildManualReconciliation(draft.state.items, 'p3', ['i1']).proposals;
  assert.throws(() => correction.replaceReconciliation(state, 'p1', unrelated, meta), /selected document/);
});
