import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const notificationsUrl = url(transpile('../src/lib/notifications.ts'));
const chatNotificationsUrl = url(transpile('../src/lib/chatNotifications.ts').replaceAll("'./notifications'", JSON.stringify(notificationsUrl)));
const replacements = {
  './accessControl': url('export const parseSession = raw => raw ? JSON.parse(raw) : null; export const canViewMenu = (session, menu) => session.menus.includes(menu);'),
  './currentUser': url('export const AUTH_SESSION_KEY = "finansu-harmonija-v7:authenticated";'),
  './linkedSettingsData': url('export const canAccessAssignedOrganization = (company, session) => session.organizations.includes(company.id);'),
  '../components/invoices/invoiceChat': url(transpile('../src/components/invoices/invoiceChat.ts')),
  './chatNotifications': chatNotificationsUrl,
  './notificationPresentation': url(transpile('../src/lib/notificationPresentation.ts')),
};
let source = transpile('../src/lib/chatNotificationExample.ts');
for (const [path, target] of Object.entries(replacements)) source = source.replaceAll(`'${path}'`, JSON.stringify(target));
const { ensureReceivedEmailExample } = await import(url(source));
const session = { email: 'accountant@example.com', fullName: 'Test Accountant', roleNames: ['Administrator'], access: { companies: { view: true } }, menus: ['messages', 'notifications'], organizations: ['alice', 'john'] };
const organizations = [{ id: 'john', name: 'John Brick' }, { id: 'alice', name: 'Alice Stone' }];
const notificationKey = 'finansu-harmonija:v7:notifications';
const conversationKey = 'finansu-harmonija:v12:chat:conversations';
const authKey = 'finansu-harmonija-v7:authenticated';

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
  return { values, writes, events, read: key => JSON.parse(values.get(key) ?? 'null') };
}

test('one explicit demo email produces a real organization chat and one recipient-only notification', () => {
  const fixture = setup();
  assert.equal(ensureReceivedEmailExample(organizations, session), true);
  const [context] = fixture.read(conversationKey);
  assert.equal(context.organizationId, 'alice');
  assert.equal(context.recipientEmail, session.email);
  const messages = fixture.read(`finansu-harmonija:v12:invoice-chat:${context.storageKey}`);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].channel, 'email');
  assert.match(messages[0].text, /Demo email/);
  assert.match(messages[0].text, /No real email was sent/);
  const added = fixture.read(notificationKey).filter(row => row.sourceChatId === context.storageKey);
  assert.equal(added.length, 1);
  assert.equal(added[0].sourceMessageId, messages[0].id);
  assert.deepEqual(added[0].recipientEmails, [session.email]);
  assert.deepEqual(added[0].relatedObject, { id: `chat:${context.storageKey}`, recordId: context.storageKey, type: 'Chat', organizationId: 'alice', label: context.subject });
  assert.equal(added[0].origin, 'system');
});

test('rerenders and later visits never duplicate the fixture or reset its reading state', () => {
  const fixture = setup();
  ensureReceivedEmailExample(organizations, session);
  const rows = fixture.read(notificationKey);
  rows.find(row => row.sourceChatId).readAtByEmail = { [session.email]: '2026-09-15T10:00:00Z' };
  fixture.values.set(notificationKey, JSON.stringify(rows));
  const before = [...fixture.values];
  const count = fixture.writes.length;
  for (let i = 0; i < 5; i++) assert.equal(ensureReceivedEmailExample([...organizations], { ...session }), false);
  assert.deepEqual([...fixture.values], before);
  assert.equal(fixture.writes.length, count);
});

test('existing conversations, notifications and messages are retained', () => {
  const existing = { id: 'old-event', origin: 'system', name: 'Existing', message: 'Keep', status: 'Active' };
  const fixture = setup(session, [[conversationKey, JSON.stringify([{ storageKey: 'old-thread', title: 'Keep' }])], [notificationKey, JSON.stringify([existing])]]);
  ensureReceivedEmailExample(organizations, session);
  assert.ok(fixture.read(conversationKey).some(row => row.storageKey === 'old-thread'));
  assert.deepEqual(fixture.read(notificationKey)[0], existing);
});

test('fixture is not seeded into an inaccessible organization or for a stale or unauthorized session', () => {
  for (const patch of [
    { organizations: [] }, { menus: ['notifications'] }, { menus: ['messages'] },
    { access: { companies: { view: false } } }, { email: 'another@example.com' },
  ]) {
    const fixture = setup({ ...session, ...patch });
    assert.equal(ensureReceivedEmailExample(organizations, session), false);
    assert.equal(fixture.writes.length, 0);
  }
  const fixture = setup({ ...session, organizations: ['john'] });
  assert.equal(ensureReceivedEmailExample(organizations, session), true);
  assert.equal(fixture.read(conversationKey)[0].organizationId, 'john');
});

test('corrupt existing demo chat data is never silently overwritten', () => {
  const key = `finansu-harmonija:v12:invoice-chat:demo-received-email:alice:${encodeURIComponent(session.email)}`;
  for (const stored of ['{', '{}', '[null]']) {
    const fixture = setup(session, [[key, stored]]);
    assert.throws(() => ensureReceivedEmailExample(organizations, session));
    assert.equal(fixture.values.get(key), stored);
    assert.equal(fixture.writes.length, 0);
  }
});

test('a malformed conversation index is preserved before any demo records are written', () => {
  for (const stored of ['{', '{}', '[null]', '[{"title":"Missing identity"}]']) {
    const fixture = setup(session, [[conversationKey, stored]]);
    assert.throws(() => ensureReceivedEmailExample(organizations, session));
    assert.equal(fixture.values.get(conversationKey), stored);
    assert.equal(fixture.writes.length, 0);
  }
});
