/** Shared safety policy for persisted demo records (not unsaved form rows). */
type RecordValue = Record<string, unknown>;
const asRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalized = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : '';
export function isInactiveRecord(value: unknown): boolean {
  if (!asRecord(value)) return false;
  return value.inactive === true || value.inactive === 'true'
    || value.active === false || value.active === 'false'
    || value.enabled === false || value.enabled === 'false'
    || ['inactive', 'deactivated'].includes(normalized(value.status))
    || ['inactive', 'deactivated'].includes(normalized(value.company_status));
}

const ignoredStore = /(?:columns|column-preferences|filters|preferences|authenticated|user-profile|admin-controls|login-history)/i;
const identityFields = new Set(['id', 'key', 'code', 'name', 'fullname', 'full_name', 'email', 'company_code', 'companycode', 'number']);
const referenceField = /(?:_id$|id$|ids$|account|iban|bank|role|assigned|organization|company|counterparty|template|parent|currency|country|unit|document|invoice|model|process|group|department|object|project|cost.?center|series|source|set|recipient|sender|author|created.?by|updated.?by|user|vat|tax|classif|status|legal.?form|email|^(?:to|cc|bcc|from)$)/i;
const referenceCollection = /(?:related.?objects?|references|links)$/i;
const companyFields = ['company_id', 'companyId', 'organization_id', 'organizationId'];
const recordCompany = (value: RecordValue) => companyFields.map(field => normalized(value[field])).find(Boolean) || '';
const storeCompany = (key?: string) => {
  const scope = key?.match(/:(?:company|organization):([^:]+)$/i)?.[1]
    ?? key?.match(/:(?:(?:company|organization)-[^:]+|reconciliation-examples-v\d+):([^:]+)$/i)?.[1];
  return scope === 'settings-unused' ? '' : normalized(scope);
};
type ParsedStore = { raw: string; value: unknown; malformed: boolean };
const parsedStores = new Map<string, ParsedStore>();
const MAX_CACHED_STORES = 128;
function parseStore(key: string, raw: string): ParsedStore {
  const cached = parsedStores.get(key);
  if (cached?.raw === raw) return cached;
  let parsed: ParsedStore;
  try { parsed = { raw, value: JSON.parse(raw), malformed: false }; }
  catch { parsed = { raw, value: undefined, malformed: true }; }
  parsedStores.set(key, parsed);
  if (parsedStores.size > MAX_CACHED_STORES) {
    const oldestKey = parsedStores.keys().next().value;
    if (oldestKey !== undefined) parsedStores.delete(oldestKey);
  }
  return parsed;
}

/** Check both explicit linkage metadata and exact references in persisted stores.
 * Unreadable relevant data is never interpreted as proof that deletion is safe. */
export function isRecordLinked(record: unknown, sourceKey?: string, storage?: Storage): boolean {
  if (!asRecord(record)) return true;
  if (record.linked === true || record.used === true || Number(record.linkedRecordsCount) > 0 || Number(record.usageCount) > 0) return true;
  let store: Storage | undefined;
  try { store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined); } catch { return true; }
  if (!store) return true;
  const id = normalized(record.id) || normalized(record.key);
  const aliases = new Set(['name','fullName','code','company_code','companyCode','email','number','iban','accountNumber','account_number'].map(key => normalized(record[key])).filter(value => value && value !== '—'));
  const bankNumbers = new Set(['iban', 'accountNumber', 'account_number'].map(key => normalized(record[key]).replace(/\s/g, '')).filter(Boolean));
  const identifiers = new Set([id, ...aliases].filter(Boolean));
  if (!identifiers.size) return true;
  const targetCompany = recordCompany(record) || storeCompany(sourceKey);
  const visit = (value: unknown, key: string, ownStore: boolean, company = '', inReferences = false): boolean => {
    const references = inReferences || referenceCollection.test(key);
    if (Array.isArray(value)) return value.some(child => visit(child, key, ownStore, company, references));
    if (asRecord(value)) {
      // Skip the target's own declaration, but not other records in the same list.
      const declaredId = normalized(value.id) || normalized(value.key);
      if (ownStore && !references && ((id && declaredId === id) || (!declaredId && record.code && normalized(value.code) === normalized(record.code)))) return false;
      const nextCompany = recordCompany(value) || company;
      return Object.entries(value).some(([field, child]) => {
        if (id && normalized(field) === id && (Array.isArray(child) ? child.length > 0 : Boolean(child))) return true;
        return visit(child, field, ownStore, nextCompany, references);
      });
    }
    const text = normalized(value);
    if (!text) return false;
    // Related-object references use ids such as `counterparty:<record-id>`.
    if (references && id && (text === id || text.endsWith(`:${id}`))) return true;
    if (identityFields.has(key.toLowerCase())) return false;
    if (id && text === id) return true;
    if (!references && !referenceField.test(key)) return false;
    // Several existing relationship fields store ID/name lists as JSON or CSV.
    if (typeof value === 'string' && /^[{[]/.test(value.trim())) {
      try { return visit(JSON.parse(value), key, ownStore, company, references); } catch { return true; }
    }
    const parts = text.split(/[,;|]/).map(part => part.trim());
    if (id && parts.includes(id)) return true;
    // Names/codes can repeat between companies; explicit ids remain authoritative.
    if (targetCompany && company && targetCompany !== company) return false;
    return aliases.has(text) || parts.some(part => aliases.has(part))
      || (/(?:iban|bank|account)/i.test(key) && parts.some(part => bankNumbers.has(part.replace(/\s/g, ''))));
  };
  try {
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (!key || !/^(finansu-harmonija|fh-|meso)/i.test(key) || ignoredStore.test(key)) continue;
      const raw = store.getItem(key);
      if (raw === null) continue;
      const parsed = parseStore(key, raw);
      if (parsed.malformed) { if (/^[{[]/.test(raw.trim()) || /^finansu-harmonija-v\d+:data:/i.test(key)) return true; else continue; }
      if (visit(parsed.value, key, key === sourceKey, storeCompany(key))) return true;
    }
    return false;
  } catch { return true; }
}

export function deactivateRecord<T>(row: T): T {
  if (!asRecord(row)) return row;
  return { ...row, inactive: true, active: false,
    ...('enabled' in row ? { enabled: false } : {}),
    ...('status' in row ? { status: 'Inactive' } : {}),
    ...('company_status' in row ? { company_status: 'Inactive' } : {}),
  } as T;
}

export function removeOrDeactivateRecords<T>(rows: T[], ids: Set<string>, sourceKey?: string, deactivate: (row: T) => T = deactivateRecord, linked?: (row: T) => boolean): T[] {
  return rows.flatMap(row => {
    if (!asRecord(row) || !ids.has(String(row.id ?? row.key))) return [row];
    if (isInactiveRecord(row)) return [row];
    return linked?.(row) || isRecordLinked(row, sourceKey) ? [deactivate(row)] : [];
  });
}
