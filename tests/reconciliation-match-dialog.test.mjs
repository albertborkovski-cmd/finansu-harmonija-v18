import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}
const engine = load('../src/lib/reconciliation.ts');
const manual = load('../src/lib/manualReconciliation.ts', { './reconciliation': engine });
const correction = load('../src/lib/reconciliationCorrection.ts', { './reconciliation': engine });
const Filters = () => null;
const PageButton = () => null;
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}
const record = (id, patch = {}) => ({ id, organizationId: 'org-1', counterpartyId: 'party-1', counterpartyName: 'Example company',
  kind: 'Payment', side: 'Receivable', documentNumber: id, reference: '', documentDate: '2026-09-01', dueDate: '',
  currency: 'EUR', originalMinor: 10000, remainingMinor: 10000, ...patch });
const source = record('SALE-001', { kind: 'Invoice', glAccountCode: '2410' });
const payment = record('BANK-001', { glAccountCode: '2410' });
const secondPayment = record('BANK-002', { originalMinor: 5000, remainingMinor: 5000 });
const otherParty = record('BANK-003', { counterpartyId: 'party-2', counterpartyName: 'Example company' });
const purchase = record('PURCHASE-001', { kind: 'Invoice', side: 'Payable' });
const items = [source, payment, secondPayment, otherParty, purchase, record('SALE-002', { kind: 'Invoice' }), record('DEBIT-BANK', { side: 'Payable' })];

function dialog(overrides = {}) {
  const values = [];
  let cursor = 0;
  const calls = [];
  const react = { ...require('react'), useMemo: fn => fn(), useState: initial => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
    return [values[index], update => { values[index] = typeof update === 'function' ? update(values[index]) : update; }];
  } };
  const Component = load('../src/components/ReconciliationMatchDialog.tsx', {
    react, '../lib/reconciliation': engine, '../lib/manualReconciliation': manual,
    '../lib/reconciliationExchangeRate': load('../src/lib/reconciliationExchangeRate.ts'),
    '../lib/reconciliationPaymentPurpose': load('../src/lib/reconciliationPaymentPurpose.ts'),
    './PageHeader': { PageActionButton: PageButton }, './OcrSearchField': { default: () => null },
    './SystemAddFilters': { default: Filters }, './ReconciliationDialogs': { ReconciliationDialog: () => null },
    './useColumnResize': { useColumnResize: () => ({ startResize() {} }), ResizeHandle: () => null },
    './ColumnSortButton': { default: () => null, useMultiColumnSort: rows => ({ sortedRows: rows, changeSort() {}, directionFor: () => null }) },
  }).default;
  const props = { item: source, items, onConfirm: proposals => calls.push(proposals), onClose() {}, ...overrides };
  const nodes = () => { cursor = 0; return flatten(Component(props)); };
  return {
    calls,
    filters: () => nodes().find(node => node.type === Filters).props,
    checkboxes: () => nodes().filter(node => node.type === 'input' && node.props.type === 'checkbox'),
    checkbox: id => nodes().find(node => node.type === 'input' && node.props['aria-label'] === `Match ${id}`)?.props,
    amount: id => nodes().find(node => node.type === 'input' && node.props['aria-label'] === `Amount to match ${id}`).props,
    confirm: () => nodes().find(node => node.type === PageButton && node.props.children?.[1] === 'Reconcile selected')?.props
      ?? nodes().filter(node => node.type === PageButton).at(-1).props,
  };
}

test('defaults to the source counterparty by ID and clears to all compatible counterparties', () => {
  const view = dialog();
  assert.deepEqual(view.filters().activeKeys, ['client']);
  assert.deepEqual(view.filters().values, { client: ['party-1'] });
  assert.ok(view.checkbox('BANK-001'));
  assert.equal(view.checkbox('BANK-003'), undefined, 'same display name does not merge distinct counterparties');
  assert.equal(view.checkbox('SALE-002'), undefined);
  assert.equal(view.checkbox('DEBIT-BANK'), undefined);
  view.filters().onClearFilters();
  assert.ok(view.checkbox('BANK-003'));
  assert.ok(view.checkbox('PURCHASE-001'));
  assert.equal(view.checkbox('SALE-002'), undefined, 'clearing UI filters cannot bypass GL eligibility');
});

test('filters retain selections and expose both GL entry and account fields', () => {
  const view = dialog();
  view.checkbox('BANK-001').onChange();
  view.filters().onClearFilters();
  assert.equal(view.checkbox('BANK-001').checked, true);
  assert.equal(view.checkbox('BANK-003').checked, false);
  const fields = view.filters().columns;
  assert.ok(fields.some(field => field.key === 'glEntry' && field.options.includes('Credit')));
  assert.ok(fields.some(field => field.key === 'glAccount' && field.options.includes('2410')));
});

test('reconciled draft permits replacing one checked document with multiple partial allocations', () => {
  const state = { version: 1, organizationId: 'org-1', items, batches: [] };
  const applied = engine.applyReconciliation(state, manual.buildManualReconciliation(items, source.id, [payment.id]).proposals,
    { id: 'batch-1', at: '2026-09-24T10:00:00Z', actor: 'Tester' });
  const draft = correction.prepareReconciliationCorrection(applied, source.id, { id: 'draft-1', at: '2026-09-24T11:00:00Z', actor: 'Tester' });
  const view = dialog({ item: draft.state.items.find(item => item.id === source.id), items: draft.state.items, initialAmounts: draft.amounts });
  assert.equal(view.checkbox(payment.id).checked, true);
  assert.equal(view.checkbox(payment.id).disabled, false);
  view.checkbox(payment.id).onChange();
  view.filters().onClearFilters();
  view.checkbox(secondPayment.id).onChange();
  view.checkbox(otherParty.id).onChange();
  view.amount(secondPayment.id).onChange({ target: { value: '40.00' } });
  view.amount(otherParty.id).onChange({ target: { value: '60.00' } });
  assert.equal(view.checkbox(payment.id).checked, false);
  assert.equal(view.checkbox(secondPayment.id).checked, true);
  assert.equal(view.checkbox(otherParty.id).checked, true);
  assert.equal(view.confirm().disabled, false);
  view.confirm().onClick();
  assert.equal(view.calls.length, 1);
  const corrected = correction.replaceReconciliation(applied, source.id, view.calls[0], { id: 'correction-1', at: '2026-09-24T11:00:00Z', actor: 'Tester' });
  assert.equal(corrected.items.find(item => item.id === source.id).remainingMinor, 0);
  assert.equal(corrected.items.find(item => item.id === payment.id).remainingMinor, 10000);
  assert.equal(corrected.items.find(item => item.id === secondPayment.id).remainingMinor, 1000);
  assert.equal(corrected.items.find(item => item.id === otherParty.id).remainingMinor, 4000);
});
