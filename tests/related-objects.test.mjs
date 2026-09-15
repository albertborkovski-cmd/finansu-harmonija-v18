import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const reconciliationUrl = moduleUrl(transpile('../src/lib/reconciliation.ts'));
const examplesUrl = moduleUrl(transpile('../src/lib/reconciliationExamples.ts').replace(/(['"])\.\/reconciliation\1/g, JSON.stringify(reconciliationUrl)));
const replacements = {
  './accessControl': moduleUrl('export const canViewMenu = session => session.access.chats.view;'),
  './linkedSettingsData': moduleUrl('export const canAccessAssignedOrganization = () => globalThis.relatedFixture.allowed;'),
  './supabase': moduleUrl(`export const supabase = { from(table) { return { select() { return { async eq(key, value) {
    const fixture = globalThis.relatedFixture;
    fixture.queries.push({ table, key, value });
    fixture.afterQuery?.();
    return { data: fixture.documents, error: fixture.error };
  } }; } }; } };`),
  './companyRelatedObjectData': moduleUrl(transpile('../src/lib/companyRelatedObjectData.ts')),
  './reconciliation': reconciliationUrl,
  './reconciliationExamples': examplesUrl,
  '../components/invoices/invoiceChat': moduleUrl(transpile('../src/components/invoices/invoiceChat.ts')),
};
let source = transpile('../src/lib/relatedObjects.ts');
for (const [path, url] of Object.entries(replacements)) source = source.replaceAll(`'${path}'`, JSON.stringify(url));
const { loadRelatedObjects, resolveRelatedObject, loadRelatedObjectChats } = await import(moduleUrl(source));
const { createReconciliationExamples } = await import(examplesUrl);
const organization = { id: 'org-1', name: 'Alice Stone' };
const session = { email: 'person@example.com', roleNames: ['Administrator'], access: { companies: { view: true }, chats: { view: true } }, menuAccess: {} };
const doc = patch => ({ id: 'doc-1', company_id: 'org-1', document_type: 'VAT invoice', file_case: 'invoice-001.pdf', number: 'INV-001', order_no: 'PAY-001', client_counterparty: 'Supplier UAB', ...patch });
const chatKey = 'finansu-harmonija:v12:chat:conversations';
const clientsKey = `finansu-harmonija:v12:company-clients:${organization.id}`;
const reconciliationKey = `finansu-harmonija:v15:reconciliation-examples-v2:${organization.id}`;

function setup(entries = []) {
  const values = new Map(entries);
  const writes = [];
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, value); },
  } };
  globalThis.relatedFixture = { allowed: true, documents: [doc()], queries: [], error: null };
  return { values, writes, fixture: globalThis.relatedFixture };
}

test('catalog uses original IDs and all supported module records in the selected organization', async () => {
  const { fixture, writes } = setup([[chatKey, JSON.stringify([{ storageKey: 'chat-one', organizationId: 'org-1', subject: 'Question', createdByEmail: session.email }])]]);
  fixture.documents.push(doc({ id: 'note-1', document_type: 'Accounting note', file_case: 'note.pdf' }));
  const objects = await loadRelatedObjects(organization, session);
  assert.deepEqual(new Set(objects.map(object => object.type)), new Set(['Invoice', 'Document', 'Bank operation', 'Reconciliation', 'Debt', 'Counterparty', 'Chat']));
  assert.deepEqual(objects.find(object => object.id === 'doc-1'), { id: 'doc-1', organizationId: 'org-1', type: 'Invoice', label: 'invoice-001.pdf' });
  assert.equal(objects.find(object => object.id === 'bank:doc-1').recordId, 'doc-1');
  assert.equal(objects.find(object => object.id === 'chat:chat-one').recordId, 'chat-one');
  assert.equal(objects.find(object => object.id === 'counterparty:alice-client-001').recordId, 'alice-client-001');
  assert.ok(objects.every(object => object.organizationId === organization.id));
  assert.equal(new Set(objects.map(object => object.id)).size, objects.length);
  assert.deepEqual(fixture.queries, [{ table: 'documents', key: 'company_id', value: 'org-1' }]);
  assert.deepEqual(writes, []);
});

test('denied organization or company-module access returns no objects and performs no source query', async () => {
  const { fixture } = setup();
  fixture.allowed = false;
  assert.deepEqual(await loadRelatedObjects(organization, session), []);
  fixture.allowed = true;
  assert.deepEqual(await loadRelatedObjects(organization, { ...session, access: { ...session.access, companies: { view: false } } }), []);
  assert.deepEqual(fixture.queries, []);
});

test('different records with identical labels stay independently selectable', async () => {
  setup();
  const objects = await loadRelatedObjects(organization, session);
  const debts = objects.filter(object => object.type === 'Debt');
  assert.equal(new Set(debts.map(object => object.label)).size, debts.length);
  for (const object of debts) assert.ok(object.label.includes(object.recordId));
});

test('access is rechecked after the document read resolves', async () => {
  const { fixture } = setup();
  fixture.afterQuery = () => { fixture.allowed = false; };
  assert.deepEqual(await loadRelatedObjects(organization, session), []);
});

test('foreign documents are excluded even if the underlying source returns them', async () => {
  const { fixture } = setup();
  fixture.documents.push(doc({ id: 'foreign', company_id: 'org-2' }));
  const objects = await loadRelatedObjects(organization, session);
  assert.equal(objects.some(object => object.id.includes('foreign')), false);
});

test('resolver rejects changed organization, type, native identity and deleted objects', async () => {
  const { fixture } = setup();
  const original = (await loadRelatedObjects(organization, session)).find(object => object.id === 'doc-1');
  assert.equal((await resolveRelatedObject(original, organization, session)).id, 'doc-1');
  for (const patch of [{ organizationId: 'org-2' }, { type: 'Document' }, { recordId: 'foreign' }, { id: 'missing' }]) {
    assert.equal(await resolveRelatedObject({ ...original, ...patch }, organization, session), undefined);
  }
  fixture.documents = [];
  assert.equal(await resolveRelatedObject(original, organization, session), undefined);
});

test('resolver returns the current source label instead of a stale saved title', async () => {
  const { fixture } = setup();
  const original = (await loadRelatedObjects(organization, session)).find(object => object.id === 'bank:doc-1');
  fixture.documents[0].order_no = 'PAY-UPDATED';
  const result = await resolveRelatedObject(original, organization, session);
  assert.match(result.label, /PAY-UPDATED/);
  assert.equal(result.recordId, 'doc-1');
});

test('stored clients replace seeds; explicit empty and malformed stores do not reintroduce deleted clients', async () => {
  const { values, writes } = setup([[clientsKey, JSON.stringify([{ id: 'own', name: 'Actual client', companyCode: '123' }])]]);
  const relatedClients = async () => (await loadRelatedObjects(organization, session)).filter(object => object.type === 'Counterparty');
  assert.deepEqual((await relatedClients()).map(object => object.id), ['counterparty:own']);
  for (const raw of ['[]', '{}', '{broken', '[null, {}, 7]']) {
    values.set(clientsKey, raw);
    assert.deepEqual(await relatedClients(), []);
    assert.equal(values.get(clientsKey), raw);
  }
  assert.deepEqual(writes, []);
});

test('reconciliation reads saved native items and batches, without recreating examples after an explicit reset', async () => {
  const state = createReconciliationExamples(organization.id);
  const { values, writes } = setup([[reconciliationKey, JSON.stringify(state)]]);
  const related = (await loadRelatedObjects(organization, session)).filter(object => object.type === 'Reconciliation');
  assert.equal(related.length, state.items.length + state.batches.length);
  assert.ok(related.some(object => object.id === `reconciliation-batch:${state.batches[0].id}`));
  values.set(reconciliationKey, JSON.stringify({ version: 1, organizationId: 'org-1', items: [], batches: [] }));
  assert.equal((await loadRelatedObjects(organization, session)).some(object => object.type === 'Reconciliation'), false);
  assert.deepEqual(writes, []);
});

test('invalid and foreign reconciliation state is omitted without replacing it with new fixtures', async () => {
  const { values, writes } = setup();
  for (const raw of ['{broken', JSON.stringify(createReconciliationExamples('org-2'))]) {
    values.set(reconciliationKey, raw);
    assert.equal((await loadRelatedObjects(organization, session)).some(object => object.type === 'Reconciliation'), false);
    assert.equal(values.get(reconciliationKey), raw);
  }
  assert.deepEqual(writes, []);
});

test('chat selection follows participant permissions and requires the exact organization', async () => {
  setup([[chatKey, JSON.stringify([
    { storageKey: 'mine', organizationId: 'org-1', createdByEmail: session.email },
    { storageKey: 'received', organizationId: 'org-1', createdByEmail: 'other@example.com', recipientEmail: 'PERSON@EXAMPLE.COM' },
    { storageKey: 'private', organizationId: 'org-1', createdByEmail: 'other@example.com', recipientEmail: 'third@example.com' },
    { storageKey: 'foreign', organizationId: 'org-2', companyName: organization.name, createdByEmail: session.email },
    { storageKey: '__general__', companyName: organization.name, createdByEmail: session.email },
  ])]]);
  assert.deepEqual(loadRelatedObjectChats(organization, session, []).map(chat => chat.storageKey), ['mine', 'received']);
  assert.deepEqual(loadRelatedObjectChats(organization, { ...session, access: { ...session.access, chats: { view: false } } }, []), []);
});

test('legacy document chats appear only when they actually have messages, not for every document', async () => {
  const legacyKey = `${organization.name}:INV-001`;
  const { values, writes } = setup();
  assert.deepEqual(loadRelatedObjectChats(organization, session, [doc()]), []);
  values.set(`finansu-harmonija:v12:invoice-chat:${legacyKey}`, JSON.stringify([{ id: 'msg-1', text: 'Existing discussion' }]));
  const [chat] = loadRelatedObjectChats(organization, session, [doc()]);
  assert.equal(chat.storageKey, legacyKey);
  assert.equal(chat.organizationId, organization.id);
  const [object] = (await loadRelatedObjects(organization, session)).filter(object => object.type === 'Chat');
  assert.equal(object.recordId, legacyKey);
  assert.deepEqual(writes, []);
});

test('source read failure is surfaced rather than silently accepting stale document links', async () => {
  const { fixture } = setup();
  fixture.error = new Error('unavailable');
  await assert.rejects(loadRelatedObjects(organization, session), /Unable to load related objects/);
});
