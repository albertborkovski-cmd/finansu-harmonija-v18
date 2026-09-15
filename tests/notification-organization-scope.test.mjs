import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const load = async path => {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const { scopeNotificationRecords } = await load('../src/lib/notificationOrganizationScope.ts');
const { getRelevantActionsForTab, getNotificationTabCounts } = await load('../src/lib/notifications.ts');
const session = { email: 'user@example.com', roleNames: ['Accountant'] };
const records = Object.freeze([
  { id: 'a-task', category: 'reminders', organizationId: 'a', taskStatus: 'Open', status: 'Active', assignedToEmail: 'other@example.com' },
  { id: 'a-signal', category: 'notifications', organizationId: 'a', status: 'Active' },
  { id: 'b-task', category: 'reminders', organizationId: 'b', taskStatus: 'Open', status: 'Active' },
  { id: 'b-signal', category: 'notifications', organizationId: 'b', status: 'Active' },
  { id: 'c-completed', category: 'reminders', organizationId: 'c', taskStatus: 'Completed', status: 'Active' },
  { id: 'global-signal', category: 'notifications', status: 'Active' },
].map(Object.freeze));
const ids = rows => rows.map(row => row.id);

test('global context without a selection retains every already-accessible record', () => {
  const result = scopeNotificationRecords(records);
  assert.deepEqual(result, records);
  assert.notEqual(result, records);
});

test('one or multiple organization selections apply equally to tasks and notifications', () => {
  assert.deepEqual(ids(scopeNotificationRecords(records, undefined, ['a'])), ['a-task', 'a-signal']);
  const scoped = scopeNotificationRecords(records, undefined, ['b', 'a', 'b']);
  assert.deepEqual(ids(scoped), ['a-task', 'a-signal', 'b-task', 'b-signal']);
  assert.deepEqual(ids(getRelevantActionsForTab(scoped, session, 'reminders')), ['a-task', 'b-task']);
  assert.deepEqual(ids(getRelevantActionsForTab(scoped, session, 'notifications')), ['a-signal', 'b-signal']);
  assert.deepEqual(getNotificationTabCounts(scoped, session), { reminders: 2, notifications: 2 });
});

test('company context overrides other selections and remains scoped after Clear filters', () => {
  assert.deepEqual(ids(scopeNotificationRecords(records, 'a', ['b'])), ['a-task', 'a-signal']);
  assert.deepEqual(ids(scopeNotificationRecords(records, 'a', [])), ['a-task', 'a-signal']);
  assert.deepEqual(scopeNotificationRecords(records, 'missing', ['a']), []);
});

test('a stale or inaccessible selected ID never broadens results', () => {
  const accessible = records.filter(row => row.organizationId !== 'b');
  assert.deepEqual(scopeNotificationRecords(accessible, undefined, ['b']), []);
  assert.deepEqual(ids(scopeNotificationRecords(accessible, undefined, ['a', 'b'])), ['a-task', 'a-signal']);
});

test('role and recipient restrictions still apply inside the selected organization', () => {
  const scoped = scopeNotificationRecords([
    ...records,
    { id: 'private', category: 'notifications', organizationId: 'a', recipientEmails: ['someone@example.com'] },
    { id: 'restricted', category: 'reminders', organizationId: 'a', relevantRoles: ['Other role'], taskStatus: 'Open' },
  ], undefined, ['a']);
  assert.deepEqual(ids(getRelevantActionsForTab(scoped, session, 'notifications')), ['a-signal']);
  assert.deepEqual(ids(getRelevantActionsForTab(scoped, session, 'reminders')), ['a-task']);
});

test('historical tasks remain available while counters only count Open tasks', () => {
  const scoped = scopeNotificationRecords(records, 'c');
  assert.deepEqual(ids(getRelevantActionsForTab(scoped, session, 'reminders')), ['c-completed']);
  assert.deepEqual(getNotificationTabCounts(scoped, session), { reminders: 0, notifications: 0 });
});
