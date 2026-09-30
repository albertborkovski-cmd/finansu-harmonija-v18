import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, imports = {}, storage) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'localStorage', outputText)(id => imports[id] ?? (id.startsWith('.') ? {} : require(id)), module, module.exports, storage);
  return module.exports;
}
const engine = load('../src/lib/reconciliation.ts');
const manual = load('../src/lib/manualReconciliation.ts', { './reconciliation': engine });
const receipt = load('../src/lib/reconciliationMissingDocument.ts', { './reconciliation': engine });
const examples = load('../src/lib/reconciliationExamples.ts', { './reconciliation': engine });
const Table = () => null;
const MatchDialog = () => null;
const UiStub = () => null;
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return [node, ...flatten(node.props?.children)];
}
const invoice = { id: 'invoice', organizationId: 'company', counterpartyId: 'client', counterpartyName: 'Client', kind: 'Invoice', side: 'Receivable', documentNumber: 'INV-001', documentDate: '2026-09-01', dueDate: '', reference: '', currency: 'EUR', originalMinor: 10000, remainingMinor: 10000, missingDocument: true };
const payment = { ...invoice, id: 'payment', documentNumber: 'BANK-001', kind: 'Payment', missingDocument: false };

function view(canEditGlAccounts = true) {
  const initial = { version: 1, organizationId: 'company', items: [invoice, payment], batches: [] };
  let stored = JSON.stringify(initial);
  let writes = 0;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; writes++; } };
  const hooks = [];
  let cursor = 0;
  const react = { ...require('react'), useEffect() {}, useMemo: fn => fn(),
    useRef: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
  };
  const Component = load('../src/components/CompanyReconciliationView.tsx', {
    react,
    '../lib/reconciliation': engine,
    '../lib/reconciliationMissingDocument': receipt,
    '../lib/reconciliationExamples': { ...examples, augmentReconciliationExamples: state => state },
    '../lib/reconciliationPresentation': load('../src/lib/reconciliationPresentation.ts'),
    '../lib/reconciliationExchangeRate': load('../src/lib/reconciliationExchangeRate.ts'),
    '../lib/reconciliationPaymentPurpose': load('../src/lib/reconciliationPaymentPurpose.ts'),
    '../lib/currentUser': { getCurrentUserName: () => 'Tester' },
    './GeneralLedgerView': { loadCompanyGeneralLedgerAccountHierarchy: () => [] },
    './PageHeader': { PageHeader: UiStub, PageActionButton: UiStub },
    './CompanyBreadcrumb': { default: UiStub },
    './SearchableSelect': { default: UiStub },
    './ReconciliationTable': { default: Table },
    './ReconciliationMatchDialog': { default: MatchDialog },
  }, storage).default;
  const nodes = () => { cursor = 0; return flatten(Component({ companyId: 'company', companyName: 'Test company', canEditGlAccounts })); };
  const table = () => nodes().find(node => node.type === Table).props;
  return {
    state: () => JSON.parse(stored), writes: () => writes,
    open: () => table().rows.find(row => row.id === invoice.id).actions.props,
    dialog: () => nodes().find(node => node.type === MatchDialog)?.props,
    errors: () => nodes().filter(node => node.props?.role === 'alert').map(node => node.props.children),
    externalChange: () => { stored += ' '; },
  };
}

test('Document received opens the shared Reconcile form without saving; Cancel preserves Missing document', () => {
  const page = view();
  const before = page.state();
  page.open().onClick();
  const form = page.dialog();
  assert.equal(form.title, 'Document received · Select records');
  assert.equal(form.item.id, invoice.id);
  assert.equal(form.items.find(item => item.id === invoice.id).missingDocument, false);
  assert.deepEqual(page.state(), before);
  assert.equal(page.writes(), 0);
  form.onClose();
  assert.equal(page.dialog(), undefined);
  assert.deepEqual(page.state(), before);
  assert.equal(page.writes(), 0);
});

test('confirm receives and reconciles in one write and closes the shared form', () => {
  const page = view();
  page.open().onClick();
  const form = page.dialog();
  const proposals = manual.buildManualReconciliation(form.items, invoice.id, [payment.id], { [payment.id]: 4000 }).proposals;
  form.onConfirm(proposals);
  assert.equal(page.writes(), 1);
  assert.equal(page.state().items[0].missingDocument, false);
  assert.equal(page.state().items[0].remainingMinor, 6000);
  assert.equal(page.state().items[1].remainingMinor, 6000);
  assert.equal(page.state().batches.length, 1);
  assert.equal(page.dialog(), undefined);
});

test('an external storage change blocks confirmation without receiving or overwriting records', () => {
  const page = view();
  page.open().onClick();
  const form = page.dialog();
  const proposals = manual.buildManualReconciliation(form.items, invoice.id, [payment.id]).proposals;
  page.externalChange();
  form.onConfirm(proposals);
  assert.equal(page.writes(), 0);
  assert.equal(page.state().items[0].missingDocument, true);
  assert.equal(page.state().batches.length, 0);
  assert.ok(page.dialog());
  assert.match(page.errors().join(' '), /changed in another tab/);
});

test('Document received respects company edit permission', () => {
  const page = view(false);
  assert.equal(page.open().disabled, true);
  page.open().onClick();
  assert.equal(page.dialog(), undefined);
  assert.equal(page.writes(), 0);
});
