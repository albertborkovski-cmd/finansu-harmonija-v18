import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, imports = {}, extraExports = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + '\n' + extraExports;
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => imports[id] ?? (id.startsWith('.') ? {} : require(id)), module, module.exports);
  return module.exports;
}
const engine = load('../src/lib/reconciliation.ts');
const main = load('../src/components/CompanyReconciliationView.tsx', { '../lib/reconciliation': engine }, 'export { OPEN_COLUMNS, ACCOUNTING_COLUMNS, PROPOSAL_COLUMNS, HISTORY_COLUMNS, glEntryText, glAccountText, GlRecordSummary };');
const prepayments = load('../src/components/ReconciliationPrepaymentsDialog.tsx', { '../lib/reconciliation': engine }, 'export { COLUMNS, columnValue };');
const dialogs = load('../src/components/ReconciliationDialogs.tsx', { '../lib/reconciliation': engine }, 'export { confirmationPreview };');
const preferences = load('../src/lib/columnPreferences.ts');

test('exchange rate defaults follow currency or currency-labelled amounts, never lead a table', () => {
  for (const [columns, anchor] of [[main.OPEN_COLUMNS, 'currency'], [main.ACCOUNTING_COLUMNS, 'currency'], [main.PROPOSAL_COLUMNS, 'invoiceCurrency'], [main.HISTORY_COLUMNS, 'amounts']]) {
    assert.equal(columns.findIndex(column => column.key === 'exchangeRate'), columns.findIndex(column => column.key === anchor) + 1);
  }
});

test('legacy leading rate layout migrates only reconciliation while keeping other preferences', () => {
  const previousWindow = globalThis.window;
  const stored = [{ key: 'exchangeRate', visible: true }, { key: 'confidence', visible: false }, { key: 'invoiceCurrency', visible: true }, { key: 'funding', visible: true }];
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(stored), setItem() {} } };
  try {
    const restored = preferences.readColumnLayout('finansu-harmonija:v14:column-layout:reconciliation-examples-layout-v5:company:Suggestions', main.PROPOSAL_COLUMNS);
    assert.deepEqual(restored.slice(0, 4).map(column => column.key), ['confidence', 'invoiceCurrency', 'exchangeRate', 'funding']);
    assert.equal(restored[0].visible, false);
    assert.equal(preferences.readColumnLayout('another-table', main.PROPOSAL_COLUMNS)[0].key, 'exchangeRate');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

const sale = { id: 'sale', organizationId: 'org', counterpartyId: 'buyer', counterpartyName: 'Buyer', kind: 'Invoice', side: 'Receivable', documentNumber: 'SALE-1', currency: 'EUR', originalMinor: 10000, remainingMinor: 10000, glAccountCode: '2410' };
const purchase = { ...sale, id: 'purchase', counterpartyId: 'supplier', counterpartyName: 'Supplier', side: 'Payable', documentNumber: 'PUR-1', glAccountCode: '4430' };
const receipt = { ...sale, id: 'receipt', kind: 'Payment', documentNumber: 'BANK-1', glAccountCode: undefined };
const state = { organizationId: 'org', items: [sale, purchase, receipt], batches: [] };
const proposal = (target = purchase) => ({ id: 'proposal', organizationId: 'org', fundingId: sale.id, allocations: [{ invoiceId: target.id, amountMinor: 3000 }], expectedRemaining: { [sale.id]: sale.remainingMinor, [target.id]: target.remainingMinor }, confidence: 'High', rule: 'Manual', reason: 'Selected records' });

test('all reconciliation table column sets default to GL entry with GL account available in Columns', () => {
  for (const columns of [main.OPEN_COLUMNS, main.ACCOUNTING_COLUMNS, main.PROPOSAL_COLUMNS, main.HISTORY_COLUMNS]) {
    assert.equal(columns.find(column => column.key === 'glEntry')?.visible, true);
    assert.equal(columns.find(column => column.key === 'glAccount')?.visible, false);
    assert.equal(new Set(columns.map(column => column.key)).size, columns.length);
  }
  assert.ok(prepayments.COLUMNS.some(column => column.key === 'glEntry'));
  assert.equal(prepayments.columnValue(sale, 'glEntry'), 'Debit');
  assert.equal(prepayments.columnValue(purchase, 'glEntry'), 'Credit');
});

test('existing reconciliation layouts hide GL account once and retain subsequent Columns choices', () => {
  const previousWindow = globalThis.window;
  const key = 'finansu-harmonija:v14:column-layout:reconciliation-examples-layout-v5:company:items';
  const original = main.OPEN_COLUMNS.map(column => ({ ...column, visible: column.key === 'glAccount' ? true : column.visible }));
  const storage = new Map([[key, JSON.stringify(original)]]);
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const migrated = preferences.readColumnLayout(key, main.OPEN_COLUMNS);
    assert.equal(migrated.find(column => column.key === 'glAccount').visible, false);
    assert.deepEqual(migrated.filter(column => column.key !== 'glAccount'), original.filter(column => column.key !== 'glAccount'));
    preferences.saveColumnLayout(key, original);
    assert.equal(preferences.readColumnLayout(key, main.OPEN_COLUMNS).find(column => column.key === 'glAccount').visible, true);
    storage.set('another-table', JSON.stringify(original));
    assert.equal(preferences.readColumnLayout('another-table', main.OPEN_COLUMNS).find(column => column.key === 'glAccount').visible, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('linked rows label each document side without inventing GL account codes', () => {
  assert.equal(main.glEntryText([sale, purchase, sale]), 'SALE-1: Debit · PUR-1: Credit');
  assert.equal(main.glAccountText([sale, receipt]), 'SALE-1: 2410 · BANK-1: —');
  const html = renderToStaticMarkup(createElement(main.GlRecordSummary, { items: [sale, purchase, receipt] }));
  assert.match(html, /SALE-1: Debit/);
  assert.match(html, /PUR-1: Credit/);
  assert.match(html, /BANK-1: Credit/);
  assert.match(html, /\+1/);
});

test('review accepts a sale matched against a purchase from another counterparty', () => {
  const preview = dialogs.confirmationPreview(state, [proposal()]);
  assert.equal(preview.problem, '');
  assert.equal(preview.groups[0].allocations.length, 1);
  assert.equal(preview.groups[0].allocations[0].invoiceAfter, 7000);
  assert.equal(preview.groups[0].allocations[0].fundingAfter, 7000);
});

test('review accepts a sale selected as source and a bank receipt as counterpart', () => {
  const preview = dialogs.confirmationPreview(state, [proposal(receipt)]);
  assert.equal(preview.problem, '');
  assert.equal(preview.groups[0].allocations[0].invoice.kind, 'Payment');
});

test('review rejects same-side, other-organization, missing and currency-mismatched records', () => {
  for (const patch of [{ side: 'Receivable' }, { organizationId: 'other' }, { missingDocument: true }, { currency: 'USD' }]) {
    const invalid = { ...purchase, ...patch };
    const preview = dialogs.confirmationPreview({ ...state, items: [sale, invalid] }, [proposal(invalid)]);
    assert.notEqual(preview.problem, '');
  }
});

test('review retains overlap and stale balance protection', () => {
  assert.notEqual(dialogs.confirmationPreview(state, [{ ...proposal(), expectedRemaining: { sale: 9999, purchase: 10000 } }]).problem, '');
  assert.notEqual(dialogs.confirmationPreview(state, [{ ...proposal(), allocations: [{ invoiceId: purchase.id, amountMinor: 10001 }] }]).problem, '');
});
