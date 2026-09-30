import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/recordLifecycle.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const prefix = 'finansu-harmonija-v4:data:';
const sourceKey = 'finansu-harmonija:v18:test-records';

function storage(entries = []) {
  const values = new Map(entries.map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}
function lifecycle(store, windowOverride) {
  const module = { exports: {} };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    ...(store || windowOverride ? { window: windowOverride ?? { localStorage: store } } : {}),
  });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const record = { id: 'record-a', name: 'Example record', code: 'EX-001', active: true };

test('a record declaration is not its own usage, including a legacy code-only declaration', () => {
  const store = storage([[sourceKey, [record, { id: 'other', name: 'Unrelated' }]]]);
  const { isRecordLinked } = lifecycle(store);
  assert.equal(isRecordLinked(record, sourceKey), false);
  store.setItem(sourceKey, JSON.stringify([{ code: 'EX-001', name: 'Example record' }]));
  assert.equal(isRecordLinked(record, sourceKey), false);
});

test('duplicate identity fields in other declarations are not references', () => {
  const store = storage([[prefix + 'other-catalog', [{ id: record.id, code: record.code, name: record.name, email: record.name }]]]);
  assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), false);
});

test('key-based OCR declarations are not their own references, including normalized id callers', () => {
  const row = { key: 'invoice_date', name: 'Invoice date', active: true };
  const store = storage([[sourceKey, [row]]]);
  const { isRecordLinked } = lifecycle(store);
  assert.equal(isRecordLinked(row, sourceKey), false);
  assert.equal(isRecordLinked({ ...row, id: row.key }, sourceKey), false);
  store.setItem(prefix + 'documents', JSON.stringify([{ configuredFieldId: row.key }]));
  assert.equal(isRecordLinked(row, sourceKey), true);
});

test('bank references match IBAN and account numbers including display spacing', () => {
  for (const [account, reference] of [
    [{ id: 'bank-a', iban: 'LT12 1234 5678 9012' }, { iban: 'LT12123456789012' }],
    [{ id: 'bank-a', accountNumber: '123456789' }, { bankAccount: '123456789' }],
    [{ id: 'bank-a', account_number: '123456789' }, { bank_account: '123456789' }],
  ]) {
    const store = storage([[sourceKey, [account]], [prefix + 'bank_transactions', [reference]]]);
    assert.equal(lifecycle(store).isRecordLinked(account, sourceKey), true);
  }
});

test('bank aliases from a known different company do not protect an unrelated account', () => {
  const account = { id: 'bank-a', company_id: 'company-a', iban: 'LT12 1234 5678 9012' };
  const store = storage([[prefix + 'bank_transactions', [{ company_id: 'company-b', iban: 'LT12123456789012' }]]]);
  assert.equal(lifecycle(store).isRecordLinked(account, sourceKey), false);
});

for (const [name, link] of Object.entries({
  'direct id': { recordId: record.id },
  'primitive id array': { assignedIds: ['different', record.id] },
  'JSON id array': { templateIds: JSON.stringify(['different', record.id]) },
  'CSV ids': { assignedIds: `different, ${record.id}` },
  'semicolon aliases': { accounts: `other; ${record.code}` },
  'nested record': { lines: [{ accountCode: record.code }] },
  'VAT classifier': { vat_classifier: record.code },
  'classification name': { classificationName: record.name },
  'template alias': { assignedTemplate: record.name.toUpperCase() },
  'map keyed by id': { assignments: { [record.id]: ['organization-a'] } },
  'email recipient': { to: record.name },
})) {
  test(`${name} protects a referenced record`, () => {
    const store = storage([[sourceKey, [record]], [prefix + 'documents', [{ id: 'document-a', ...link }]]]);
    assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), true);
  });
}

for (const relatedId of [record.id, `counterparty:${record.id}`]) {
  test(`related-object id ${relatedId} is detected in a different store and the same source list`, () => {
    for (const sameStore of [false, true]) {
      const related = { id: 'other-record', relatedObjects: [{ id: relatedId, title: 'Stored link' }] };
      const store = storage(sameStore
        ? [[sourceKey, [record, related]]]
        : [[sourceKey, [record]], [prefix + 'companies', [related]]]);
      assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), true);
    }
  });
}

test('same-list parent references protect code-only catalog entries', () => {
  const parent = { code: 'PARENT', name: 'Parent' };
  const store = storage([[sourceKey, [parent, { code: 'CHILD', parentCode: 'PARENT' }]]]);
  assert.equal(lifecycle(store).isRecordLinked(parent, sourceKey), true);
});

test('ordinary text matching an alias is not a relationship', () => {
  const store = storage([[prefix + 'documents', [{ id: 'doc', description: record.name, notes: record.code }]]]);
  assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), false);
});

test('company-scoped aliases match only their company when context is available', () => {
  const account = { ...record, company_id: 'company-a' };
  const store = storage([[prefix + 'documents', [{ id: 'doc', company_id: 'company-b', accountCode: account.code }]]]);
  const { isRecordLinked } = lifecycle(store);
  assert.equal(isRecordLinked(account, sourceKey), false);
  store.setItem(prefix + 'documents', JSON.stringify([{ id: 'doc', company_id: 'company-a', accountCode: account.code }]));
  assert.equal(isRecordLinked(account, sourceKey), true);
});

test('company scope can be inferred from a source store and a referenced store', () => {
  const ownKey = 'finansu-harmonija:v12:company-general-ledger:company-a';
  const otherKey = 'finansu-harmonija:v12:company-reports:company-b';
  const store = storage([[ownKey, [record]], [otherKey, [{ accountCode: record.code }]]]);
  const { isRecordLinked } = lifecycle(store);
  assert.equal(isRecordLinked(record, ownKey), false);
  store.setItem(otherKey, JSON.stringify([{ company_id: 'company-a', accountCode: record.code }]));
  assert.equal(isRecordLinked(record, ownKey), true);
});

test('organization template company suffix scopes aliases without hiding exact cross-company ids', () => {
  const key = 'finansu-harmonija:v12:organization-email-templates:company:company-a';
  const store = storage([[key, [record]], [prefix + 'documents', [{ company_id: 'company-b', template: record.name }]]]);
  const { isRecordLinked } = lifecycle(store);
  assert.equal(isRecordLinked(record, key), false);
  store.setItem(prefix + 'documents', JSON.stringify([{ company_id: 'company-b', templateId: record.id }]));
  assert.equal(isRecordLinked(record, key), true);
});

test('aliases in unknown company contexts are conservatively protected', () => {
  const store = storage([[prefix + 'documents', [{ accountCode: record.code }]]]);
  assert.equal(lifecycle(store).isRecordLinked({ ...record, organizationId: 'company-a' }, sourceKey), true);
});

test('global company identities retain incoming references across all company stores', () => {
  const company = { id: 'company-a', name: 'Company A' };
  const store = storage([[prefix + 'documents', [{ company_id: company.id }]]]);
  assert.equal(lifecycle(store).isRecordLinked(company, prefix + 'companies'), true);
});

test('malformed persisted records and nested relationship JSON fail closed', () => {
  for (const raw of ['{', '[{"id":', 'unreadable table data', JSON.stringify([{ assignedIds: '["record-a",' }]), JSON.stringify([{ relatedObjects: '{broken' }])]) {
    const store = storage();
    store.setItem(prefix + 'documents', raw);
    assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), true, raw);
  }
});

test('irrelevant preferences and other applications do not block deletion', () => {
  const store = storage();
  store.setItem('finansu-harmonija:v18:column-preferences', '{');
  store.setItem('unrelated-application-data', JSON.stringify([{ recordId: record.id }]));
  assert.equal(lifecycle(store).isRecordLinked(record, sourceKey), false);
});

test('missing identities, missing storage and unavailable storage fail closed', () => {
  assert.equal(lifecycle().isRecordLinked(record, sourceKey), true);
  assert.equal(lifecycle(storage()).isRecordLinked({}, sourceKey), true);
  assert.equal(lifecycle(storage()).isRecordLinked(null, sourceKey), true);
  const unavailable = { get length() { throw new Error('Storage unavailable'); } };
  assert.equal(lifecycle(unavailable).isRecordLinked(record, sourceKey), true);
  const inaccessibleWindow = Object.defineProperty({}, 'localStorage', { get() { throw new Error('Access denied'); } });
  assert.equal(lifecycle(undefined, inaccessibleWindow).isRecordLinked(record, sourceKey), true);
});

test('explicit linked or used metadata protects records', () => {
  for (const metadata of [{ linked: true }, { used: true }, { linkedRecordsCount: 1 }, { usageCount: '2' }]) {
    assert.equal(lifecycle(storage()).isRecordLinked({ ...record, ...metadata }, sourceKey), true);
  }
});

test('all existing inactive representations are recognized', () => {
  const { isInactiveRecord } = lifecycle(storage());
  for (const row of [{ inactive: true }, { inactive: 'true' }, { active: false }, { active: 'false' }, { enabled: false }, { enabled: 'false' }, { status: ' INACTIVE ' }, { status: 'Deactivated' }, { company_status: 'Inactive' }]) {
    assert.equal(isInactiveRecord(row), true);
  }
  for (const row of [null, {}, { active: true }, { enabled: true }, { status: 'Active' }]) assert.equal(isInactiveRecord(row), false);
});

test('deactivation preserves record identity, linked fields, nested data and the original input', () => {
  const { deactivateRecord, isInactiveRecord } = lifecycle(storage());
  const input = { ...record, status: 'Active', enabled: true, company_status: 'Active', templateId: 'template-a', entries: [{ amount: 42 }] };
  const before = plain(input);
  const output = deactivateRecord(input);
  assert.equal(isInactiveRecord(output), true);
  assert.equal(output.id, input.id);
  assert.equal(output.templateId, input.templateId);
  assert.equal(output.entries, input.entries);
  assert.equal(output.status, 'Inactive');
  assert.equal(output.company_status, 'Inactive');
  assert.equal(output.enabled, false);
  assert.deepEqual(input, before);
});

test('bulk deletion removes only selected unused active records and retains linked and inactive rows', () => {
  const rows = [record, { id: 'unused', active: true }, { id: 'already-inactive', active: false }, { id: 'unselected', active: true }];
  const before = plain(rows);
  const store = storage([[sourceKey, rows], [prefix + 'documents', [{ recordId: record.id }]]]);
  const output = lifecycle(store).removeOrDeactivateRecords(rows, new Set([record.id, 'unused', 'already-inactive']), sourceKey);
  assert.deepEqual(Array.from(output, row => row.id), [record.id, 'already-inactive', 'unselected']);
  assert.equal(output[0].active, false);
  assert.equal(output[0].name, record.name);
  assert.equal(output[1], rows[2]);
  assert.equal(output[2], rows[3]);
  assert.deepEqual(rows, before);
});

test('bulk actions support stricter domain protection and domain-specific deactivation', () => {
  const rows = [{ id: 'assigned', enabled: true, organizationIds: ['company-a'] }, { id: 'unused', enabled: true }];
  const store = storage([[sourceKey, rows]]);
  const output = lifecycle(store).removeOrDeactivateRecords(rows, new Set(['assigned', 'unused']), sourceKey,
    row => ({ ...row, enabled: false }), row => row.id === 'assigned');
  assert.deepEqual(plain(output), [{ ...rows[0], enabled: false }]);
});

test('fresh bulk check catches references created after the earlier UI check', () => {
  const store = storage([[sourceKey, [record]]]);
  const { isRecordLinked, removeOrDeactivateRecords } = lifecycle(store);
  assert.equal(isRecordLinked(record, sourceKey), false);
  store.setItem(prefix + 'documents', JSON.stringify([{ recordId: record.id }]));
  const output = removeOrDeactivateRecords([record], new Set([record.id]), sourceKey);
  assert.equal(output.length, 1);
  assert.equal(output[0].active, false);
});

test('bulk deletion supports stable key-based rows without injected ids', () => {
  const row = { key: 'field-a', active: true };
  const store = storage([[sourceKey, [row]]]);
  const { removeOrDeactivateRecords } = lifecycle(store);
  assert.equal(removeOrDeactivateRecords([row], new Set([row.key]), sourceKey).length, 0);
  store.setItem(prefix + 'documents', JSON.stringify([{ parameterId: row.key }]));
  const output = removeOrDeactivateRecords([row], new Set([row.key]), sourceKey);
  assert.equal(output.length, 1);
  assert.equal(output[0].key, row.key);
  assert.equal(output[0].active, false);
});

test('parsed stores are reused for unchanged data and refreshed after a write', () => {
  const store = storage([[sourceKey, [record]], [prefix + 'documents', []]]);
  let parseCount = 0;
  const module = { exports: {} };
  runInNewContext(compiled, { module, exports: module.exports, window: { localStorage: store }, JSON: {
    parse(raw) { parseCount += 1; return JSON.parse(raw); },
  } });
  const { isRecordLinked } = module.exports;
  assert.equal(isRecordLinked(record, sourceKey), false);
  assert.equal(parseCount, 2);
  assert.equal(isRecordLinked(record, sourceKey), false);
  assert.equal(parseCount, 2);
  store.setItem(prefix + 'documents', JSON.stringify([{ recordId: record.id }]));
  assert.equal(isRecordLinked(record, sourceKey), true);
  assert.equal(parseCount, 3);
});
