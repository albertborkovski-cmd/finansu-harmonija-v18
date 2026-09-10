import { supabase, type Company } from './supabase';
import { isSystemAdministratorRole, parseSession } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';

const normalize = (value?: string) => (value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toUpperCase();
export function findOrganizationDuplicate(rows: Company[], input: Partial<Company>) {
  const country = normalize(input.tax_country || input.country);
  const code = normalize(input.company_code);
  const vat = normalize(input.vat_code);
  return rows.find(row =>
    (country === normalize(row.tax_country || row.country) && code === normalize(row.company_code)) ||
    (Boolean(vat) && vat === normalize(row.vat_code)),
  );
}

let pending: Promise<unknown> = Promise.resolve();
/** Shared local organization object/validation for manual and future e-shop onboarding. */
export function createOrganization(input: Omit<Company, 'id'>): Promise<Company> {
  const operation = pending.catch(() => undefined).then(async () => {
    const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    if (!session?.roleNames.some(isSystemAdministratorRole)) throw new Error('Only an administrator can create an organization.');
    if (!input.name.trim() || !normalize(input.tax_country || input.country) || !normalize(input.company_code)) throw new Error('Name, country and company code are required.');
    const { data, error } = await supabase.from('companies').select('*');
    if (error) throw new Error(error.message);
    const duplicate = findOrganizationDuplicate((data ?? []) as unknown as Company[], input);
    if (duplicate) throw new Error(`Organization already exists: ${duplicate.name}. Check country, company code and VAT code.`);
    const organization: Company = { ...input, id: crypto.randomUUID(), name: input.name.trim(), tax_country: input.tax_country?.trim(), company_code: input.company_code.trim(), vat_code: input.vat_code.trim(), action_required: 0 };
    const { error: insertError } = await supabase.from('companies').insert({ ...organization });
    if (insertError) throw new Error(insertError.message);
    return organization;
  });
  pending = operation;
  return operation;
}
