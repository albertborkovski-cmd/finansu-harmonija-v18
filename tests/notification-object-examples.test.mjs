import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const notificationsUrl = url(transpile('../src/lib/notifications.ts'));
const scheduleUrl = url(transpile('../src/lib/taskSchedule.ts').replaceAll("'./notifications'", JSON.stringify(notificationsUrl)));
const replacements = {
  './accessControl': url(`export const parseSession = raw => { try { return JSON.parse(raw); } catch { return null; } };
    export const canViewMenu = (session, menu) => session.menus.includes(menu);
    export const canEditMenu = (session, menu) => session.editable.includes(menu);`),
  './currentUser': url('export const AUTH_SESSION_KEY = "finansu-harmonija-v7:authenticated";'),
  './linkedSettingsData': url('export const canAccessAssignedOrganization = (company, session) => session.organizations.includes(company.id);'),
  './relatedObjects': url('export const loadRelatedObjects = (...args) => globalThis.loadExampleObjects(...args);'),
  './taskFormData': url('export const loadTaskAssignees = organization => globalThis.exampleAssignees.filter(user => user.organizationId === organization.id);'),
  './notifications': notificationsUrl,
  './taskSchedule': scheduleUrl,
  './taskCreation': url(transpile('../src/lib/taskCreation.ts').replaceAll("'./taskSchedule'", JSON.stringify(scheduleUrl))),
};
let source = transpile('../src/lib/notificationObjectExamples.ts');
for (const [path, target] of Object.entries(replacements)) source = source.replaceAll(`'${path}'`, JSON.stringify(target));
const { ensureObjectNotificationExamples } = await import(url(source));
const session = {
  email: 'accountant@example.com', fullName: 'Test Accountant', roleNames: ['Administrator'],
  access: { companies: { view: true } }, menus: ['notifications', 'dashboard'], editable: ['notifications'], organizations: ['alice', 'john'],
};
const organizations = [{ id: 'john', name: 'John Brick' }, { id: 'alice', name: 'Alice Stone' }];
const notificationKey = 'finansu-harmonija:v7:notifications';
const taskKey = 'finansu-harmonija:v7:reminders';
const authKey = 'finansu-harmonija-v7:authenticated';
const catalog = organizationId => [
  { id: 'receipt', organizationId, type: 'Document', label: 'Receipt' },
  { id: 'invoice', organizationId, type: 'Invoice', label: 'INV-001' },
  { id: 'bank:invoice', recordId: 'invoice', organizationId, type: 'Bank operation', label: 'Payment INV-001' },
  { id: 'debt:1', recordId: '1', organizationId, type: 'Debt', label: 'Debt' },
];

function setup(current = session, entries = []) {
  const values = new Map([[authKey, JSON.stringify(current)], ...entries]);
  const writes = [];
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); writes.push(key); },
    },
    dispatchEvent: event => events.push(event),
  };
  globalThis.loadExampleObjects = async organization => catalog(organization.id);
  globalThis.exampleAssignees = organizations.map(organization => ({
    id: 'Internal users:test-accountant', userId: 'test-accountant', name: session.fullName,
    email: session.email, audience: 'Internal users', organizationId: organization.id,
  }));
  return { values, writes, events, read: key => JSON.parse(values.get(key) ?? 'null') };
}

test('four explicit recipient-only examples point to real source objects, including a saved self-assigned Task', async () => {
  const fixture = setup();
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 4);
  const rows = fixture.read(notificationKey).filter(row => row.id.startsWith('demo-object-notification:'));
  assert.equal(rows.length, 4);
  const taskNotification = rows.find(row => row.type === 'Task');
  const task = fixture.read(taskKey).find(row => row.id === taskNotification.sourceTaskId);
  assert.ok(task);
  assert.equal(task.organizationId, 'alice');
  assert.equal(task.assignedToEmail, session.email);
  assert.equal(task.reminder, 'none');
  assert.deepEqual(task.recipientEmails, [session.email]);
  assert.match(task.name, /Demo/);
  assert.equal(taskNotification.relatedObject, undefined);
  for (const row of rows) {
    assert.equal(row.organizationId, 'alice');
    assert.equal(row.origin, 'system');
    assert.equal(row.requiresAction, false);
    assert.deepEqual(row.recipientEmails, [session.email]);
    assert.match(row.message, /Demo navigation test/);
    assert.match(row.message, /No business record was changed/);
    if (row.type !== 'Task') assert.deepEqual(row.relatedObject, catalog('alice').find(object => object.type === row.type));
  }
  assert.equal(fixture.events.length, 2);
  assert.ok(fixture.writes.every(key => [notificationKey, taskKey].includes(key) || key.startsWith('finansu-harmonija:v15:object-notification-example:')));
});

test('existing visible Task is linked without editing it or requiring task creation permission', async () => {
  const task = { id: 'real-task', organizationId: 'alice', name: 'Existing task', status: 'Inactive', taskStatus: 'Completed', message: 'Preserve history', recipientEmails: [session.email] };
  const fixture = setup({ ...session, editable: [] }, [[taskKey, JSON.stringify([task])]]);
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 4);
  assert.equal(fixture.read(notificationKey).find(row => row.type === 'Task').sourceTaskId, 'real-task');
  assert.deepEqual(fixture.read(taskKey), [task]);
  assert.equal(fixture.writes.includes(taskKey), false);
});

test('inaccessible Tasks are never linked; a demo Task requires an eligible self-assignee and edit access', async () => {
  const excluded = [
    { id: 'other-org', name: 'Other organization', organizationId: 'elsewhere' },
    { id: 'other-recipient', name: 'Other user', organizationId: 'alice', recipientEmails: ['other@example.com'] },
    { id: 'other-role', name: 'Other role', organizationId: 'alice', relevantRoles: ['Client'] },
  ];
  for (const editable of [[], ['notifications']]) {
    const fixture = setup({ ...session, editable }, [[taskKey, JSON.stringify(excluded)]]);
    globalThis.exampleAssignees = [];
    assert.equal(await ensureObjectNotificationExamples(organizations, session), 3);
    assert.equal(fixture.read(notificationKey).some(row => row.sourceTaskId), false);
    assert.deepEqual(fixture.read(taskKey), excluded);
  }
  const fixture = setup({ ...session, editable: [] }, [[taskKey, '[]']]);
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 3);
  assert.deepEqual(fixture.read(taskKey), []);
});

test('rerenders, concurrent calls and later visits preserve reading state and never duplicate or recreate examples', async () => {
  const fixture = setup();
  assert.deepEqual(await Promise.all([
    ensureObjectNotificationExamples(organizations, session),
    ensureObjectNotificationExamples([...organizations], { ...session }),
  ]), [4, 0]);
  const rows = fixture.read(notificationKey);
  rows.find(row => row.sourceTaskId).readAtByEmail = { [session.email]: '2026-09-15T10:00:00Z' };
  fixture.values.set(notificationKey, JSON.stringify(rows));
  const before = [...fixture.values];
  const count = fixture.writes.length;
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 0);
  assert.deepEqual([...fixture.values], before);
  assert.equal(fixture.writes.length, count);
  fixture.values.set(notificationKey, '[]');
  fixture.values.set(taskKey, '[]');
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 0);
  assert.deepEqual(fixture.read(notificationKey), []);
  assert.deepEqual(fixture.read(taskKey), []);
});

test('existing legacy samples and unrelated custom data are retained without assigning fabricated targets', async () => {
  const oldNotification = { id: 'keep', name: 'Legacy', type: 'Billing', status: 'Inactive', message: 'Keep', custom: { kept: true } };
  const oldTask = { id: 'keep-task', name: 'Unscoped task', message: 'Keep', daysTillRemind: '14' };
  const fixture = setup(session, [[notificationKey, JSON.stringify([oldNotification])], [taskKey, JSON.stringify([oldTask])], ['original-source-records', 'unchanged']]);
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 4);
  assert.deepEqual(fixture.read(notificationKey)[0], oldNotification);
  assert.deepEqual(fixture.read(taskKey)[0], oldTask);
  assert.equal(fixture.values.get('original-source-records'), 'unchanged');
});

test('unavailable source types are skipped and may receive one example when the actual object later exists', async () => {
  const fixture = setup();
  globalThis.loadExampleObjects = async () => [];
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 1);
  globalThis.loadExampleObjects = async organization => catalog(organization.id);
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 3);
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 0);
  assert.equal(fixture.read(notificationKey).filter(row => row.id.startsWith('demo-object-notification:')).length, 4);
});

test('latest auth identity, organization access and notification permissions are checked before loading and after awaiting', async () => {
  for (const patch of [
    { organizations: [] }, { menus: [] }, { access: { companies: { view: false } } }, { email: 'other@example.com' },
  ]) {
    const fixture = setup({ ...session, ...patch });
    assert.equal(await ensureObjectNotificationExamples(organizations, session), 0);
    assert.equal(fixture.writes.length, 0);
  }
  for (const current of [null, { ...session, organizations: [] }, { ...session, menus: [] }, { ...session, email: 'other@example.com' }]) {
    const fixture = setup();
    globalThis.loadExampleObjects = async organization => {
      fixture.values.set(authKey, JSON.stringify(current));
      return catalog(organization.id);
    };
    assert.equal(await ensureObjectNotificationExamples(organizations, session), 0);
    assert.equal(fixture.writes.length, 0);
  }
});

test('current Task-edit permission and assignee availability are used after asynchronous loading', async () => {
  const fixture = setup();
  globalThis.loadExampleObjects = async organization => {
    fixture.values.set(authKey, JSON.stringify({ ...session, editable: [] }));
    return catalog(organization.id);
  };
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 3);
  assert.equal(fixture.writes.includes(taskKey), false);
});

test('notification updates made during source loading are preserved', async () => {
  const fixture = setup();
  const concurrent = { id: 'concurrent', name: 'Read elsewhere', readAtByEmail: { [session.email]: 'read' } };
  globalThis.loadExampleObjects = async organization => {
    fixture.values.set(notificationKey, JSON.stringify([concurrent]));
    return catalog(organization.id);
  };
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 4);
  assert.deepEqual(fixture.read(notificationKey)[0], concurrent);
});

test('corrupt shared stores fail closed without replacing data or writing any source Task', async () => {
  for (const key of [notificationKey, taskKey]) {
    for (const raw of ['{', '{}', '[null]', '[{"name":"missing id"}]', '[{"id":"broken","recipientEmails":"wrong"}]']) {
      const fixture = setup(session, [[key, raw]]);
      await assert.rejects(ensureObjectNotificationExamples(organizations, session));
      assert.equal(fixture.values.get(key), raw);
      assert.equal(fixture.writes.length, 0);
    }
  }
});

test('corruption occurring during catalog loading is checked again before any writes', async () => {
  const fixture = setup();
  globalThis.loadExampleObjects = async organization => {
    fixture.values.set(notificationKey, '{');
    return catalog(organization.id);
  };
  await assert.rejects(ensureObjectNotificationExamples(organizations, session));
  assert.equal(fixture.values.get(notificationKey), '{');
  assert.equal(fixture.writes.length, 0);
});

test('fallback organization and fixture identities are scoped to the actual current user and accessible company', async () => {
  const fixture = setup({ ...session, organizations: ['john'] });
  assert.equal(await ensureObjectNotificationExamples(organizations, session), 4);
  const rows = fixture.read(notificationKey).filter(row => row.id.startsWith('demo-object-notification:'));
  assert.ok(rows.every(row => row.organizationId === 'john' && row.id.includes(encodeURIComponent(session.email))));
  assert.ok(rows.filter(row => row.relatedObject).every(row => row.relatedObject.organizationId === 'john'));
});
