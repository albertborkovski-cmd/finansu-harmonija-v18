import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/generalLedgerUsage.ts', import.meta.url), 'utf8');
const module = { exports: {} };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports });
const { protectedLedgerAccountIds, deleteUnusedLedgerAccount, rememberLedgerTableUsage, rememberReconciliationLedgerUsage, LEDGER_USAGE_KEY } = module.exports;
const prefix = 'finansu-harmonija-v4:data:';
const scope = { companyId: 'a', templateId: 'template-a', templateName: 'A' };
const accounts = [{ id: 'account', code: '6000', active: true }, { id: 'unused', code: '6999', active: true }];
function storage() {
  const values = new Map([[prefix + 'companies', JSON.stringify([{ id: 'a', general_ledger: 'A' }, { id: 'b', general_ledger: 'B' }])]]);
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('unused account can be physically deleted without modifying the input or other records', () => {
  const s = storage();
  assert.equal(protectedLedgerAccountIds(scope, accounts, s).size, 0);
  const result = deleteUnusedLedgerAccount(scope, accounts, 'unused', s);
  assert.deepEqual([...result].map(row => row.id), ['account']);
  assert.equal(accounts.length, 2);
});
for (const [name, reference] of Object.entries({ document: { expense_account: '6000' }, lines: { line_items: [{ expense: '6000' }] }, summary: { summary_line_items: [{ expense: '6000' }] }, journal: { entries: [{ account_code: '6000' }] } })) {
  test(`${name} references block deletion, including inactive accounts`, () => {
    const s = storage();
    s.setItem(prefix + 'documents', JSON.stringify([{ company_id: 'a', ...reference }]));
    assert.equal(protectedLedgerAccountIds(scope, accounts, s).has('account'), true);
    assert.throws(() => deleteUnusedLedgerAccount(scope, accounts.map(row => ({ ...row, active: false })), 'account', s), /Deactivate/);
  });
}
test('usage is retained after documents are removed and an account code is renamed', () => {
  const s = storage();
  rememberLedgerTableUsage('documents', [{ company_id: 'a', expense_account: '6000' }], s);
  protectedLedgerAccountIds(scope, accounts, s);
  s.setItem(prefix + 'documents', '[]');
  const renamed = accounts.map(row => row.id === 'account' ? { ...row, code: '6010' } : row);
  assert.throws(() => deleteUnusedLedgerAccount(scope, renamed, 'account', s), /Deactivate/);
});
test('company and template usage do not leak to an unrelated company/template', () => {
  const s = storage();
  rememberLedgerTableUsage('documents', [{ company_id: 'b', expense_account: '6000' }], s);
  assert.equal(protectedLedgerAccountIds(scope, accounts, s).size, 0);
  assert.equal(protectedLedgerAccountIds({ templateId: 'template-a', templateName: 'A' }, accounts, s).size, 0);
  assert.equal(protectedLedgerAccountIds({ templateId: 'template-b', templateName: 'B' }, accounts, s).has('account'), true);
});
test('reconciliation current and historical GL assignments are protected', () => {
  const s = storage();
  rememberReconciliationLedgerUsage({ organizationId: 'a', items: [{ glAccountCode: '6000' }], glAssignments: [{ fromAccount: '6999', toAccount: '6000' }] }, 'a', 'A', s);
  assert.equal(protectedLedgerAccountIds(scope, accounts, s).size, 2);
});
test('stored reconciliation usage is discovered before delete, including other-company records', () => {
  const s = storage();
  s.setItem('finansu-harmonija:v15:reconciliation-examples-v2:b', JSON.stringify({ organizationId: 'b', items: [{ organizationId: 'a', glAccountCode: '6000' }] }));
  assert.throws(() => deleteUnusedLedgerAccount(scope, accounts, 'account', s), /Deactivate/);
});
test('counterparty GL mappings count as accounting relations, not product codes', () => {
  const s = storage();
  rememberLedgerTableUsage('companies', [{ counterparty_gl_template: 'A', counterparty_gl_accounts: '[{"code":"6000"}]' }], s);
  assert.equal(protectedLedgerAccountIds(scope, accounts, s).has('account'), true);
  assert.equal(protectedLedgerAccountIds({ ...scope, companyId: 'b', templateName: 'B' }, accounts, s).size, 0);
  const empty = storage();
  rememberLedgerTableUsage('documents', [{ company_id: 'a', line_items: [{ code: '6000', barcode: '6999' }] }], empty);
  assert.equal(protectedLedgerAccountIds(scope, accounts, empty).size, 0);
});
test('parent accounts cannot be removed leaving orphaned children', () => {
  const s = storage();
  assert.throws(() => deleteUnusedLedgerAccount(scope, [...accounts, { id: 'child', code: '60001', parentCode: '6000' }], 'account', s), /Deactivate/);
});
test('malformed usage, accounting data or unavailable storage block deletion', () => {
  for (const [key, value] of [[LEDGER_USAGE_KEY, '{'], [LEDGER_USAGE_KEY, '{}'], [prefix + 'documents', '{'], [prefix + 'documents', '{}']]) {
    const s = storage(); s.setItem(key, value);
    assert.throws(() => deleteUnusedLedgerAccount(scope, accounts, 'account', s));
  }
  assert.throws(() => deleteUnusedLedgerAccount(scope, accounts, 'account', { getItem() { throw new Error('Unavailable'); } }));
});
test('fresh check prevents deletion after an earlier unused-state UI snapshot', () => {
  const s = storage();
  assert.equal(protectedLedgerAccountIds(scope, accounts, s).size, 0);
  rememberLedgerTableUsage('documents', [{ company_id: 'a', expense_account: '6000' }], s);
  assert.throws(() => deleteUnusedLedgerAccount(scope, accounts, 'account', s), /Deactivate/);
});
