import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

const toModuleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const engineUrl = toModuleUrl(transpile('../src/lib/reconciliation.ts'));
const engine = await import(engineUrl);
const examplesSource = transpile('../src/lib/reconciliationExamples.ts').replace("from './reconciliation'", `from '${engineUrl}'`);
const { createReconciliationExamples, getReconciliationItemStatus } = await import(toModuleUrl(examplesSource));
const companyId = 'example-company';
const noSuggestions = { proposals: [], unmatched: [] };
const id = suffix => `${companyId}:demo-examples:${suffix}`;
const row = (state, suffix) => state.items.find(item => item.id === id(suffix));

test('showcase is deterministic and preserves every original open-item fixture', () => {
  const state = createReconciliationExamples(companyId);
  assert.deepEqual(state, createReconciliationExamples(companyId));
  assert.equal(state.items.length, 30);
  assert.equal(state.batches.length, 4);
  assert.deepEqual(state.items.slice(0, 22), engine.createDemoReconciliationState(companyId).items);
  assert.equal(new Set(state.items.map(item => item.id)).size, state.items.length);
  assert.ok(state.batches.every(batch => batch.actor === 'Demo accountant'));
});

test('examples use real validated balances for full, partial, credit and reversed allocations', () => {
  const state = createReconciliationExamples(companyId);
  assert.equal(row(state, 'settled:invoice').remainingMinor, 0);
  assert.equal(row(state, 'settled:funding').remainingMinor, 0);
  assert.equal(row(state, 'partial:invoice').remainingMinor, 55000);
  assert.equal(row(state, 'partial:funding').remainingMinor, 30000);
  assert.equal(row(state, 'credited:invoice').remainingMinor, 0);
  assert.equal(row(state, 'credited:funding').kind, 'Credit note');
  assert.equal(row(state, 'credited:funding').remainingMinor, 0);
  assert.equal(row(state, 'reversed:invoice').remainingMinor, 36000);
  assert.equal(row(state, 'reversed:funding').remainingMinor, 36000);
  assert.equal(state.batches.filter(batch => batch.reversedAt).length, 1);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(state), companyId), state);
});

test('all six requested statuses are visible without applying or fabricating new data', () => {
  const state = createReconciliationExamples(companyId);
  const suggestions = engine.suggestReconciliation(state.items);
  const statuses = new Set(state.items.map(item => getReconciliationItemStatus(item, state, suggestions)));
  assert.deepEqual([...statuses].sort(), ['Reconciled', 'Partially reconciled', 'Suggested', 'Needs review', 'Not reconciled', 'Reversed'].sort());
  const expected = [
    ['settled:invoice', 'Reconciled'],
    ['partial:invoice', 'Partially reconciled'],
    ['partial:funding', 'Partially reconciled'],
    ['reversed:invoice', 'Reversed'],
    ['credited:funding', 'Reconciled'],
  ];
  for (const [suffix, status] of expected) assert.equal(getReconciliationItemStatus(row(state, suffix), state, suggestions), status);
  assert.equal(getReconciliationItemStatus(state.items.find(item => item.id.endsWith(':payment-ambiguous')), state, suggestions), 'Needs review');
  assert.equal(getReconciliationItemStatus(state.items.find(item => item.id.endsWith(':invoice-unmatched')), state, suggestions), 'Not reconciled');
});

test('seeded active reconciliation can be reversed once while retaining its history', () => {
  const state = createReconciliationExamples(companyId);
  const undone = engine.reverseReconciliation(state, id('settled:batch'), '2026-09-14T12:00:00.000Z');
  assert.equal(row(undone, 'settled:invoice').remainingMinor, 125000);
  assert.equal(getReconciliationItemStatus(row(undone, 'settled:invoice'), undone, noSuggestions), 'Reversed');
  assert.equal(state.items.find(item => item.id === id('settled:invoice')).remainingMinor, 0);
  assert.equal(undone.batches.length, state.batches.length);
  assert.throws(() => engine.reverseReconciliation(undone, id('settled:batch'), '2026-09-14T13:00:00.000Z'), /already been reversed/);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(undone), companyId), undone);
});

test('a new confirmed reconciliation supersedes a prior reversal', () => {
  const state = createReconciliationExamples(companyId);
  const suggestions = engine.suggestReconciliation(state.items);
  const proposal = suggestions.proposals.find(entry => entry.fundingId === id('reversed:funding'));
  assert.ok(proposal);
  const applied = engine.applyReconciliation(state, [proposal], { id: id('reapply:batch'), at: '2026-09-14T12:00:00.000Z', actor: 'Test reviewer' });
  assert.equal(getReconciliationItemStatus(row(applied, 'reversed:invoice'), applied, engine.suggestReconciliation(applied.items)), 'Reconciled');
  assert.equal(applied.batches.length, 5);
  assert.equal(applied.batches.filter(batch => batch.reversedAt).length, 1);
  assert.deepEqual(engine.parseReconciliationState(JSON.stringify(applied), companyId), applied);
});

test('company-scoped fixtures and histories cannot be confused between organizations', () => {
  const first = createReconciliationExamples(companyId);
  const second = createReconciliationExamples('other-company');
  const ids = new Set(first.items.map(item => item.id));
  const batches = new Set(first.batches.map(batch => batch.id));
  assert.ok(second.items.every(item => !ids.has(item.id) && item.organizationId === 'other-company'));
  assert.ok(second.batches.every(batch => !batches.has(batch.id)));
  assert.throws(() => engine.parseReconciliationState(JSON.stringify(first), 'other-company'), /different organization/);
  assert.throws(() => createReconciliationExamples(''), /Organization ID is required/);
});

test('generic unmatched wording is not accidentally classified as ambiguity', () => {
  const state = createReconciliationExamples(companyId);
  const item = state.items.find(entry => entry.id.endsWith(':invoice-unmatched'));
  assert.equal(getReconciliationItemStatus(item, state, { proposals: [], unmatched: [{ itemId: item.id, reason: 'No unambiguous compatible funding was found.' }] }), 'Not reconciled');
  assert.equal(getReconciliationItemStatus(item, state, { proposals: [], unmatched: [{ itemId: item.id, reason: 'Competing funding records would over-allocate an invoice.' }] }), 'Needs review');
});
