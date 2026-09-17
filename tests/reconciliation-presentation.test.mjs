import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(id => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}
const helper = load('../src/lib/reconciliationPresentation.ts');
const item = { id: 'invoice', kind: 'Invoice', side: 'Receivable', documentNumber: 'DEMO-001', counterpartyName: 'Demo buyer', documentDate: '2026-09-16', dueDate: '2026-09-30', originalMinor: 12000, remainingMinor: 0, currency: 'EUR', reference: 'Sample services' };
const payment = { ...item, id: 'payment', kind: 'Payment', documentNumber: 'BANK-001' };
test('suggestions show current funding balances, with proposed amount separate and without applying it', () => {
  const funding = { ...payment, organizationId: 'org', remainingMinor: 9000 };
  const proposal = { fundingId: funding.id, organizationId: 'org', allocations: [{ invoiceId: 'invoice', amountMinor: 4000 }] };
  const before = JSON.stringify(funding);
  assert.deepEqual(helper.reconciliationSuggestionAmounts(funding, proposal), { debit: 3000, credit: 12000, remaining: -9000, original: 12000, settled: 3000, amount: 4000 });
  assert.equal(JSON.stringify(funding), before);
  assert.deepEqual(helper.reconciliationSuggestionAmounts({ ...funding, side: 'Payable' }, proposal), { debit: 12000, credit: 3000, remaining: 9000, original: 12000, settled: 3000, amount: 4000 });
});
test('suggestion presentation cannot take amounts from a different document or organization', () => {
  const funding = { ...payment, organizationId: 'org' };
  assert.throws(() => helper.reconciliationSuggestionAmounts(funding, { fundingId: 'other', organizationId: 'org', allocations: [] }));
  assert.throws(() => helper.reconciliationSuggestionAmounts(funding, { fundingId: funding.id, organizationId: 'other', allocations: [] }));
});
const state = { items: [item, payment], batches: [{ id: '1', allocations: [{ invoiceId: 'invoice', fundingId: 'payment', amountMinor: 7000 }] }, { id: '2', allocations: [{ invoiceId: 'invoice', fundingId: 'payment', amountMinor: 5000 }] }, { id: '3', reversedAt: '2026-09-16', allocations: [{ invoiceId: 'invoice', fundingId: 'payment', amountMinor: 12000 }] }] };
test('fully reconciled documents have equal debit and credit and zero balance for every document type', () => {
  for (const side of ['Receivable', 'Payable']) for (const kind of ['Invoice', 'Payment', 'Credit note', 'Advance', 'Deposit']) {
    assert.deepEqual(helper.reconciliationDocumentAmounts({ ...item, side, kind }), { debitMinor: 12000, creditMinor: 12000, balanceMinor: 0, settledMinor: 12000 });
  }
});
test('partial sales and purchases show confirmed settlement on the opposite side with signed residual', () => {
  assert.deepEqual(helper.reconciliationDocumentAmounts({ ...item, remainingMinor: 8000 }), { debitMinor: 12000, creditMinor: 4000, balanceMinor: 8000, settledMinor: 4000 });
  assert.deepEqual(helper.reconciliationDocumentAmounts({ ...item, side: 'Payable', remainingMinor: 8000 }), { debitMinor: 4000, creditMinor: 12000, balanceMinor: -8000, settledMinor: 4000 });
});
test('receipts, outgoing payments, credits, advances and deposits reverse the invoice side', () => {
  for (const kind of ['Payment', 'Credit note', 'Advance', 'Deposit']) {
    assert.deepEqual(helper.reconciliationDocumentAmounts({ ...item, kind, remainingMinor: 3000 }), { debitMinor: 9000, creditMinor: 12000, balanceMinor: -3000, settledMinor: 9000 });
    assert.deepEqual(helper.reconciliationDocumentAmounts({ ...item, kind, side: 'Payable', remainingMinor: 3000 }), { debitMinor: 12000, creditMinor: 9000, balanceMinor: 3000, settledMinor: 9000 });
  }
});
test('unmatched, suggested or fully reversed records have no confirmed opposite movement', () => {
  const original = { ...item, remainingMinor: 12000 };
  const before = JSON.stringify(original);
  assert.deepEqual(helper.reconciliationDocumentAmounts(original), { debitMinor: 12000, creditMinor: 0, balanceMinor: 12000, settledMinor: 0 });
  assert.equal(JSON.stringify(original), before);
});
test('All items sums document groups and suggestions without adding historical batches', () => {
  assert.equal(helper.reconciliationEntryCount(17, 390, 11, 52), 470);
  assert.equal(helper.reconciliationEntryCount(0, 0, 0, 0), 0);
});
test('partners aggregate active allocations, exclude reversed batches and work in both directions', () => {
  const before = JSON.stringify(state);
  assert.deepEqual(helper.reconciliationPartners(state, 'invoice'), [{ item: payment, amountMinor: 12000 }]);
  assert.deepEqual(helper.reconciliationPartners(state, 'payment'), [{ item, amountMinor: 12000 }]);
  assert.deepEqual(helper.reconciliationPartners(state, 'missing'), []);
  assert.equal(JSON.stringify(state), before);
});
const Preview = load('../src/components/ReconciliationDocumentPreview.tsx', {
  '../lib/reconciliationPresentation': helper,
  './ReconciliationDialogs': { ReconciliationDialog: ({ children, title }) => createElement('section', { 'aria-label': title }, children) },
}).default;
test('demonstration invoice displays seller, buyer, actual totals and linked reconciled payment', () => {
  const html = renderToStaticMarkup(createElement(Preview, { item, state, companyName: 'Demo seller', onClose() {}, onOpen() {} }));
  for (const text of ['Not a real accounting document', 'Seller', 'Buyer', 'Demo seller', 'Demo buyer', 'DEMO-001', 'BANK-001', '120.00', 'Open balance', 'Reconciled with']) assert.ok(html.includes(text), text);
});
test('bank record opens as payment statement rather than a fabricated invoice', () => {
  const html = renderToStaticMarkup(createElement(Preview, { item: payment, state, companyName: 'Demo company', onClose() {}, onOpen() {} }));
  assert.ok(html.includes('Payment statement'));
  assert.ok(html.includes('Account holder'));
});
