export const MIGRATION_SCOPE = [
  { key: 'generalLedger', label: 'General ledger / chart of accounts' },
  { key: 'classifiers', label: 'Classifiers' },
  { key: 'counterparties', label: 'Counterparties' },
  { key: 'receivables', label: 'Open customer documents' },
  { key: 'payables', label: 'Open supplier documents' },
  { key: 'partialPayments', label: 'Partial payments' },
  { key: 'advances', label: 'Advances / overpayments' },
  { key: 'openingBalances', label: 'Opening balances' },
] as const;
type Category = typeof MIGRATION_SCOPE[number]['key'];
export type MigrationResult = {
  id: string; at: string; fileName: string; counts: Record<string, number>;
  errors: string[]; checks: Array<{ category: string; currency: string; expected: string; actual: string; passed: boolean }>;
};
export type MigrationSetup = {
  source: string; portfolio: string; asOf: string;
  status: 'Not started' | 'In progress' | 'Validation failed' | 'Validated — awaiting import';
  results: MigrationResult[];
};
const key = (id: string) => `finansu-harmonija:v14:migration:${id}`;
export function loadMigrationSetup(id: string): MigrationSetup {
  try { const stored = JSON.parse(localStorage.getItem(key(id)) || 'null'); if (stored && Array.isArray(stored.results)) return stored; } catch { /* Use initial state. */ }
  return { source: '', portfolio: '', asOf: '', status: 'Not started', results: [] };
}
export function saveMigrationSetup(id: string, setup: MigrationSetup) {
  const previous = localStorage.getItem(key(id));
  localStorage.setItem(key(id), JSON.stringify(setup));
  if (previous !== JSON.stringify(setup)) void recordAdministrativeAction(id, 'Setup / integration', 'Initial setup updated', `Source: ${setup.source || 'Not selected'}. Status: ${setup.status}. Validation results: ${setup.results.length}.`);
}
function cents(value: unknown): number | null {
  const text = String(value ?? '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Staging validation only: it never labels data as imported or posts accounting entries. */
export function validateMigrationPackage(raw: unknown, organizationId: string, asOf: string, fileName: string): MigrationResult {
  const result: MigrationResult = { id: crypto.randomUUID(), at: new Date().toISOString(), fileName, counts: {}, errors: [], checks: [] };
  if (!object(raw)) { result.errors.push('Expected a JSON object.'); return result; }
  if (raw.organizationId !== organizationId) result.errors.push('The package organizationId does not match this organization.');
  if (!asOf || raw.asOf !== asOf) result.errors.push('The package asOf date must match the migration date.');
  const data = object(raw.data) ? raw.data : {};
  const rows: Partial<Record<Category, Record<string, unknown>[]>> = {};
  for (const category of MIGRATION_SCOPE) {
    const entries = data[category.key];
    if (!Array.isArray(entries)) { result.errors.push(`${category.label}: provide an array, including an empty array when not applicable.`); continue; }
    result.counts[category.key] = entries.length;
    rows[category.key] = entries.filter(object);
    const ids = new Set<string>();
    entries.forEach((entry, index) => {
      if (!object(entry)) { result.errors.push(`${category.label}, row ${index + 1}: invalid record.`); return; }
      if (typeof entry.id !== 'string' || !entry.id.trim()) result.errors.push(`${category.label}, row ${index + 1}: id is required.`);
      else if (ids.has(entry.id)) result.errors.push(`${category.label}: duplicate id ${entry.id}.`);
      else ids.add(entry.id);
    });
  }
  const counterpartyIds = new Set(rows.counterparties?.map(row => row.id));
  const documentIds = new Set([...(rows.receivables || []), ...(rows.payables || [])].map(row => row.id));
  for (const category of ['receivables', 'payables', 'partialPayments', 'advances', 'openingBalances'] as const) {
    const totals = new Map<string, number>();
    for (const [index, row] of (rows[category] || []).entries()) {
      const currency = typeof row.currency === 'string' ? row.currency : '';
      const amount = cents(row[category === 'receivables' || category === 'payables' ? 'balance' : 'amount']);
      if (!/^[A-Z]{3}$/.test(currency) || amount === null) { result.errors.push(`${category}, row ${index + 1}: currency and a valid amount/balance with up to two decimals are required.`); continue; }
      if (category !== 'openingBalances' && !counterpartyIds.has(row.counterpartyId)) result.errors.push(`${category}, row ${index + 1}: counterpartyId was not found.`);
      if (category === 'partialPayments' && !documentIds.has(row.documentId)) result.errors.push(`Partial payment ${row.id}: documentId was not found.`);
      totals.set(currency, (totals.get(currency) || 0) + amount);
    }
    const controls = object(raw.controlTotals) && object(raw.controlTotals[category]) ? raw.controlTotals[category] as Record<string, unknown> : null;
    if (!controls) { result.errors.push(`${category}: control totals by currency are required (use {} for an empty dataset).`); continue; }
    for (const currency of new Set([...totals.keys(), ...Object.keys(controls)])) {
      const expected = cents(controls[currency]);
      const actual = totals.get(currency) || 0;
      const passed = expected !== null && expected === actual;
      result.checks.push({ category, currency, expected: expected === null ? 'Missing / invalid' : (expected / 100).toFixed(2), actual: (actual / 100).toFixed(2), passed });
      if (!passed) result.errors.push(`${category} ${currency}: control total does not match the uploaded total.`);
    }
  }
  return result;
}
import { recordAdministrativeAction } from './supabase';
