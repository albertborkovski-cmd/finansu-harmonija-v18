/** Append-only usage evidence for the prototype's local accounting stores. */
export const LEDGER_USAGE_KEY = 'finansu-harmonija:v18:general-ledger-usage';
const DATA_PREFIX = 'finansu-harmonija-v4:data:';
const RECONCILIATION_PREFIX = 'finansu-harmonija:v15:reconciliation-examples-v2:';
type Row = Record<string, unknown>;
type Usage = { companyId: string; template: string; code: string };
type Registry = { entries: Usage[]; protectedIds: string[] };
type Account = { id: string; code: string; parentCode?: string };
export type LedgerScope = { companyId?: string; templateId: string; templateName: string };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ACCOUNT_FIELDS = new Set(['expense_account', 'expenseAccount', 'expense', 'glAccountCode', 'gl_account', 'gl_account_code', 'accountCode', 'account_code', 'debitAccount', 'creditAccount', 'fromAccount', 'toAccount', 'account']);

function readJson(storage: Storage, key: string, fallback: unknown): unknown {
  const raw = storage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw);
}
function registry(storage: Storage): Registry {
  const value = readJson(storage, LEDGER_USAGE_KEY, { entries: [], protectedIds: [] });
  if (!object(value) || !Array.isArray(value.entries) || !Array.isArray(value.protectedIds)
    || !value.entries.every(entry => object(entry) && ['companyId', 'template', 'code'].every(key => typeof entry[key] === 'string'))
    || !value.protectedIds.every(id => typeof id === 'string')) throw new Error('GL account usage history could not be verified. Deletion is blocked.');
  return value as Registry;
}
function collect(value: unknown, context: Omit<Usage, 'code'>, companies: Row[], result: Usage[]) {
  if (Array.isArray(value)) { value.forEach(item => collect(item, context, companies, result)); return; }
  if (!object(value)) return;
  const companyId = text(value.company_id) || text(value.organizationId) || text(value.organization_id) || context.companyId;
  const company = companies.find(item => item.id === companyId);
  const template = text(value.counterparty_gl_template) || (companyId === context.companyId ? context.template : '') || text(company?.general_ledger);
  const next = { companyId, template };
  for (const [key, child] of Object.entries(value)) {
    if (ACCOUNT_FIELDS.has(key) && text(child)) result.push({ ...next, code: text(child) });
    else if (key === 'counterparty_gl_accounts' || key === 'counterparty_gl_settings') {
      const links = typeof child === 'string' ? JSON.parse(child || '[]') : child;
      if (!Array.isArray(links)) throw new Error('GL account links could not be verified.');
      links.forEach(link => { if (object(link) && text(link.code)) result.push({ ...next, code: text(link.code) }); });
    } else if (Array.isArray(child) || object(child)) collect(child, next, companies, result);
  }
}
function append(storage: Storage, entries: Usage[]) {
  if (!entries.length) return;
  const previous = registry(storage);
  const known = new Set(previous.entries.map(entry => JSON.stringify(entry)));
  for (const entry of entries) {
    const key = JSON.stringify(entry);
    if (!known.has(key)) { previous.entries.push(entry); known.add(key); }
  }
  const serialized = JSON.stringify(previous);
  if (storage.getItem(LEDGER_USAGE_KEY) !== serialized) storage.setItem(LEDGER_USAGE_KEY, serialized);
}
function companiesFrom(storage: Storage): Row[] {
  const companies = readJson(storage, `${DATA_PREFIX}companies`, []);
  if (!Array.isArray(companies)) throw new Error('Companies could not be verified.');
  return companies.filter(object);
}

/** Call before replacing/deleting rows, and for the new rows, so past use survives. */
export function rememberLedgerTableUsage(table: string, rows: unknown, storage: Storage = window.localStorage) {
  if (!['documents', 'companies', 'document_history', 'gl_journal', 'journal_entries', 'bank_transactions', 'invoices'].includes(table)) return;
  if (!Array.isArray(rows)) throw new Error('Accounting records could not be verified. Deletion is blocked.');
  const entries: Usage[] = [];
  collect(rows, { companyId: '', template: '' }, companiesFrom(storage), entries);
  append(storage, entries);
}
export function rememberReconciliationLedgerUsage(state: unknown, companyId: string, template = '', storage: Storage = window.localStorage) {
  const entries: Usage[] = [];
  collect(state, { companyId, template }, companiesFrom(storage), entries);
  append(storage, entries);
}

/** Fresh scan plus historical evidence. Never interpret unavailable/corrupt data as unused. */
export function protectedLedgerAccountIds(scope: LedgerScope, accounts: Account[], storage: Storage = window.localStorage): Set<string> {
  const companies = companiesFrom(storage);
  for (const table of ['documents', 'companies', 'document_history', 'gl_journal', 'journal_entries', 'bank_transactions', 'invoices']) {
    rememberLedgerTableUsage(table, readJson(storage, `${DATA_PREFIX}${table}`, []), storage);
  }
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(RECONCILIATION_PREFIX)) rememberReconciliationLedgerUsage(readJson(storage, key, {}), key.slice(RECONCILIATION_PREFIX.length), '', storage);
  }
  const saved = registry(storage);
  const relevant = saved.entries.filter(entry => scope.companyId
    ? entry.companyId ? entry.companyId === scope.companyId : !entry.template || entry.template === scope.templateName
    : entry.template ? entry.template === scope.templateName
      : !entry.companyId || (text(companies.find(company => company.id === entry.companyId)?.general_ledger) || 'Lithuanian standard chart of accounts') === scope.templateName);
  const codes = new Set(relevant.map(entry => entry.code));
  const identity = (id: string) => JSON.stringify([scope.companyId || '', scope.templateId, id]);
  const historicalIds = new Set(saved.protectedIds);
  const result = new Set<string>();
  for (const account of accounts) {
    if (codes.has(account.code) || historicalIds.has(identity(account.id))) {
      result.add(account.id);
      historicalIds.add(identity(account.id));
    }
    // A parent is still referenced by its children, even without postings.
    if (accounts.some(child => child.parentCode === account.code)) result.add(account.id);
  }
  if (historicalIds.size !== saved.protectedIds.length) storage.setItem(LEDGER_USAGE_KEY, JSON.stringify({ ...saved, protectedIds: [...historicalIds] }));
  return result;
}

export function deleteUnusedLedgerAccount<T extends Account>(scope: LedgerScope, accounts: T[], id: string, storage: Storage = window.localStorage): T[] {
  if (protectedLedgerAccountIds(scope, accounts, storage).has(id)) throw new Error('This GL account has accounting links or has been used. Deactivate it instead.');
  return accounts.filter(account => account.id !== id);
}
