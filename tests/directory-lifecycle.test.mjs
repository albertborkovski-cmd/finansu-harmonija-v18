import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const lifecycleUrl = moduleUrl(transpile(read('../src/lib/recordLifecycle.ts')));
const identitySource = read('../src/components/SettingsIdentityManagementView.tsx');
const emailSource = read('../src/components/OrganizationEmailSettingsView.tsx');

function declaration(source, name) {
  const tree = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(tree);
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = `const ${node.getText(tree)};`;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(found, `Missing ${name}`);
  return found;
}

const directory = await import(moduleUrl(transpile(`
  import { isInactiveRecord, isRecordLinked, removeOrDeactivateRecords } from ${JSON.stringify(lifecycleUrl)};
  const storageKey = (audience, section) => 'finansu-harmonija:test:' + audience + ':' + section;
  const loadRows = (_audience, section) => section === 'Users' ? globalThis.fixture.users : globalThis.fixture.roles;
  const readDeletedIds = () => new Set(globalThis.fixture.deleted);
  const persistDeletedIds = (_audience, _section, ids) => { globalThis.fixture.deleted = [...ids]; };
  const persistRows = (_audience, section, rows) => { globalThis.fixture[section === 'Users' ? 'users' : 'roles'] = rows; };
  const isProtectedSystemRole = (_audience, row) => row?.id === 'protected-role';
  const setRows = rows => { globalThis.fixture.rendered = rows; };
  const setSelected = selected => { globalThis.fixture.selected = selected; };
  let audience, section, key;
  ${declaration(identitySource, 'internalUserStatus')}
  ${declaration(identitySource, 'isDirectoryRowLinked')}
  ${declaration(identitySource, 'readRoles')}
  ${declaration(identitySource, 'remove')}
  export { internalUserStatus, isDirectoryRowLinked, readRoles };
  export function removeRows(nextSection, ids) {
    audience = 'Internal users'; section = nextSection; key = storageKey(audience, section);
    remove(new Set(ids));
  }
`)));

const email = await import(moduleUrl(transpile(`
  const loadOrganizationEmailHistory = () => globalThis.fixture.history;
  let companyId, companyName;
  ${declaration(emailSource, 'hasTemplateHistory')}
  export function linked(template, id, name) { companyId = id; companyName = name; return hasTemplateHistory(template); }
`)));

const linkedData = await import(moduleUrl(transpile(read('../src/lib/linkedSettingsData.ts'))
  .replace(/(['"])\.\/supabase\1/g, JSON.stringify(moduleUrl('export const recordAdministrativeAction = async () => {};')))));

function setup(patch = {}) {
  const values = new Map();
  globalThis.window = { localStorage: {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };
  globalThis.fixture = { roles: [], users: [], deleted: [], history: [], ...patch };
  return globalThis.fixture;
}

test('unused role is physically deleted and tombstoned', () => {
  const fixture = setup({ roles: [{ id: 'unused', name: 'Unused' }] });
  directory.removeRows('Roles', ['unused']);
  assert.deepEqual(fixture.roles, []);
  assert.deepEqual(fixture.deleted, ['unused']);
});

test('assigned role is deactivated without erasing user assignments or adding a tombstone', () => {
  const fixture = setup({ roles: [{ id: 'used', name: 'Auditor' }], users: [{ id: 'user', roles: 'Reviewer, Auditor' }] });
  directory.removeRows('Roles', ['used']);
  assert.equal(fixture.roles[0].inactive, true);
  assert.equal(fixture.roles[0].active, false);
  assert.equal(fixture.users[0].roles, 'Reviewer, Auditor');
  assert.deepEqual(fixture.deleted, []);
});

test('user relationships and history remain intact after deactivation', () => {
  const fixture = setup({ users: [{ id: 'user', fullName: 'Test User', roles: 'Auditor', organizations: 'Example', status: 'Active', documentsCreated: '2' }] });
  directory.removeRows('Users', ['user']);
  assert.equal(fixture.users[0].status, 'Inactive');
  assert.equal(fixture.users[0].roles, 'Auditor');
  assert.equal(fixture.users[0].organizations, 'Example');
  assert.equal(fixture.users[0].documentsCreated, '2');
  assert.deepEqual(fixture.deleted, []);
  assert.equal(directory.internalUserStatus(fixture.users[0].status), 'Inactive');
});

test('bulk action preserves protected and inactive roles while removing unused roles', () => {
  const fixture = setup({ roles: [
    { id: 'protected-role', name: 'Administrator' },
    { id: 'inactive', name: 'Inactive', inactive: true, active: false },
    { id: 'unused', name: 'Unused' },
  ] });
  directory.removeRows('Roles', ['protected-role', 'inactive', 'unused']);
  assert.deepEqual(fixture.roles.map((row) => row.id), ['protected-role', 'inactive']);
  assert.equal(fixture.roles[0].inactive, undefined);
  assert.deepEqual(fixture.deleted, ['unused']);
});

test('inactive roles remain in the directory but cannot be assigned to new users', () => {
  setup({ roles: [{ id: 'active', name: 'Active role' }, { id: 'inactive', name: 'Inactive role', inactive: true }] });
  assert.deepEqual(directory.readRoles('Internal users'), ['Active role']);
  assert.equal(globalThis.fixture.roles.length, 2);
});

test('built-in directory defaults never overwrite saved inactive state', () => {
  setup();
  const key = linkedData.directoryStorageKey('Internal users');
  const inactive = { id: 'user-system-administrator', email: 'albertborkvski@gmail.com', status: 'Inactive', inactive: true, active: false };
  window.localStorage.setItem(key, JSON.stringify([inactive]));
  const user = linkedData.loadLinkedDirectoryUsers('Internal users').find((row) => row.id === inactive.id);
  assert.equal(user.status, 'Inactive');
  assert.equal(user.inactive, true);
  assert.equal(user.active, false);
  assert.equal(linkedData.loadLinkedDirectoryUsers('Internal users').filter((row) => row.id === inactive.id).length, 1);
});

test('email history protects templates by name, language and organization', () => {
  setup({ history: [{ templateName: 'Debt reconciliation', language: 'EN', organizationId: 'org-one', sender: 'Example' }] });
  const template = { name: 'Debt reconciliation', language: 'EN' };
  assert.equal(email.linked(template, 'org-one', 'Example'), true);
  assert.equal(email.linked(template, 'org-two', 'Other'), false);
  assert.equal(email.linked({ ...template, language: 'LT' }, 'org-one', 'Example'), false);
  assert.equal(email.linked(template), true);
});

test('legacy email history is matched to the original organization name', () => {
  setup({ history: [{ templateName: 'Debt reconciliation', language: 'EN', sender: 'Example' }] });
  assert.equal(email.linked({ name: 'Debt reconciliation', language: 'EN' }, 'org-one', 'Example'), true);
  assert.equal(email.linked({ name: 'Debt reconciliation', language: 'EN' }, 'org-two', 'Other'), false);
});

test('all directory tables expose full-row inactive styling and shared lifecycle actions', () => {
  for (const name of ['Companies', 'CompanyClientsView', 'SettingsIdentityManagementView', 'OrganizationEmailSettingsView']) {
    const source = read(`../src/components/${name}.tsx`);
    assert.match(source, /data-record-inactive=\{isInactiveRecord\(/, name);
    assert.match(source, /removeOrDeactivateRecords\(/, name);
    assert.match(source, /<RowDeleteButton/, name);
  }
  assert.match(read('../src/components/CompanyClientsView.tsx'), /\{ \.\.\.client, \.\.\.normalized \}/);
  assert.match(identitySource, /const savedRow = \{ \.\.\.existing, \.\.\.row \}/);
});
