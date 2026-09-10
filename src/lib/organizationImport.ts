import { supabase, type Company } from './supabase';
import { createOrganization, findOrganizationDuplicate } from './organizationCreation';
import { parseSession, isSystemAdministratorRole } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';

export type OrganizationImportRow = { name: string; country: string; code: string; vat: string; externalId: string; targetId: string; selected: boolean };
export type OrganizationSourceLink = { source: string; environment: string; externalId: string; organizationId: string; linkedAt: string };
const KEY = 'finansu-harmonija:v14:organization-source-links';
export function loadOrganizationSourceLinks(): OrganizationSourceLink[] {
  const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  if (!Array.isArray(raw)) throw new Error('Invalid organization source links.');
  return raw as OrganizationSourceLink[];
}

export function importRowFromRecord(record: Record<string, unknown>): OrganizationImportRow {
  const normalized = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), String(value ?? '').trim()]));
  const read = (...keys: string[]) => keys.map(key => normalized[key]).find(Boolean) ?? '';
  return { name: read('name', 'companyname', 'organizationname'), country: read('country', 'taxcountry'), code: read('companycode', 'code'), vat: read('vatcode', 'vat'), externalId: read('externalid', 'sourceid', 'id'), targetId: '', selected: true };
}

/** Onboarding only. Never imports invoices, journals, balances or account data. */
export async function importOrganizationCard(row: OrganizationImportRow, source: string, environment: string): Promise<{ company: Company; outcome: 'Created' | 'Linked' }> {
  row = { ...row, externalId: row.externalId.trim(), name: row.name.trim(), country: row.country.trim(), code: row.code.trim(), vat: row.vat.trim() };
  source = source.trim();
  environment = environment.trim();
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!session?.roleNames.some(isSystemAdministratorRole)) throw new Error('Only an administrator can import organizations.');
  if (![source, environment, row.name, row.country, row.code, row.externalId].every(value => value.trim())) throw new Error('Source, environment, external ID, name, country and company code are required.');
  const links = loadOrganizationSourceLinks();
  const prior = links.find(link => link.source === source && link.environment === environment && link.externalId === row.externalId);
  const { data, error } = await supabase.from('companies').select('*');
  if (error) throw new Error(error.message);
  const companies = (data ?? []) as unknown as Company[];
  const identity = { tax_country: row.country, company_code: row.code, vat_code: row.vat };
  const matches = companies.filter(company => findOrganizationDuplicate([company], identity));
  if (matches.length > 1) throw new Error('Company code and VAT identify conflicting FH organizations. Resolve the conflict before importing.');
  const targetId = row.targetId || prior?.organizationId;
  if (prior && targetId !== prior.organizationId) throw new Error('This source ID is already linked to another FH organization.');
  let company = targetId ? companies.find(item => item.id === targetId) : matches[0];
  if (targetId && !company) throw new Error('The selected FH organization no longer exists.');
  if (company && !findOrganizationDuplicate([company], identity)) throw new Error('The selected FH organization does not match the imported identifiers.');
  const outcome = company ? 'Linked' : 'Created';
  if (!company) company = await createOrganization({ name: row.name, ...identity, client_since: new Date().getFullYear(), action_required: 0, company_status: 'Active' });
  // Re-read so sequential imports retain all mappings. Existing cards are never overwritten.
  const latest = loadOrganizationSourceLinks();
  const existing = latest.find(link => link.source === source && link.environment === environment && link.externalId === row.externalId);
  if (existing && existing.organizationId !== company.id) throw new Error('Source identifier conflict. The organization card was preserved.');
  if (!existing) latest.push({ source, environment, externalId: row.externalId, organizationId: company.id, linkedAt: new Date().toISOString() });
  window.localStorage.setItem(KEY, JSON.stringify(latest));
  window.dispatchEvent(new CustomEvent('finansu-harmonija:settings-data-changed', { detail: { scope: 'organizations' } }));
  return { company, outcome };
}
