import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/notifications.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  getRelevantActions,
  getRelevantActionsForTab,
  getOrganizationRequiredActions,
  getOrganizationOpenTasks,
  requiresAction,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const session = { email: 'accountant@example.com', roleNames: ['Accountant'] };
const organizationId = 'company-1';

test('Companies counts only visible Open Tasks, not unread notifications or unrelated organizations', () => {
  const rows = [
    record('chat', 'notifications'), record('reminder', 'notifications', { sourceTaskId: 'open' }),
    record('open', 'reminders', { taskStatus: 'Open', requiresAction: false, readAtByEmail: { [session.email]: '2026-09-15' } }),
    record('done', 'reminders', { taskStatus: 'Completed' }),
    record('cancelled', 'reminders', { taskStatus: 'Cancelled' }),
    record('resolved', 'reminders', { taskStatus: 'Open', resolvedAt: '2026-09-15' }),
    record('other-company', 'reminders', { organizationId: 'company-2' }),
    record('global', 'reminders', { organizationId: undefined }),
    record('private', 'reminders', { recipientEmails: ['another@example.com'] }),
    record('role', 'reminders', { relevantRoles: ['Other role'] }),
  ];
  assert.deepEqual(getOrganizationOpenTasks(rows, organizationId, session).map(row => row.id), ['open']);
  assert.equal(getOrganizationOpenTasks(rows.filter(row => row.id !== 'open'), organizationId, session).length, 0);
  assert.equal(getOrganizationOpenTasks(rows, '', session).length, 0);
});

test('Companies Open Task count matches the organization Tasks tab selection and deduplication', () => {
  const rows = [record('one', 'reminders'), record('one', 'reminders'), record('two', 'reminders', { requiresAction: false }), record('n')];
  const before = JSON.stringify(rows);
  assert.deepEqual(getOrganizationOpenTasks(rows, organizationId, session).map(row => row.id), ['one', 'two']);
  assert.equal(JSON.stringify(rows), before);
});

function record(id, category = 'notifications', patch = {}) {
  return {
    id,
    category,
    organizationId,
    name: `Record ${id}`,
    type: category === 'reminders' ? 'Scheduled' : 'System',
    message: `Message ${id}`,
    status: 'Active',
    requiresAction: true,
    ...(category === 'reminders' ? { daysTillRemind: '3' } : {}),
    ...patch,
  };
}

test('Notifications and Tasks return only their own categories and preserve source order', () => {
  const rows = [
    record('task-2', 'reminders'),
    record('notification-2'),
    record('task-1', 'reminders'),
    record('notification-1'),
  ];
  assert.deepEqual(getRelevantActionsForTab(rows, session, 'notifications').map(row => row.id), [
    'notification-2', 'notification-1',
  ]);
  assert.deepEqual(getRelevantActionsForTab(rows, session, 'reminders').map(row => row.id), [
    'task-2', 'task-1',
  ]);
});

test('a shared action has a record in both sections regardless of cross-category order', () => {
  const notification = record('notification', 'notifications', { actionId: 'shared-action' });
  const task = record('task', 'reminders', { actionId: 'shared-action' });
  for (const rows of [[notification, task], [task, notification]]) {
    assert.deepEqual(getRelevantActionsForTab(rows, session, 'notifications'), [notification]);
    assert.deepEqual(getRelevantActionsForTab(rows, session, 'reminders'), [task]);
    assert.equal(getRelevantActions(rows, session).length, 1);
    assert.equal(getOrganizationRequiredActions(rows, organizationId, session).length, 1);
  }
});

test('Notifications preserve separate events for one action and deduplicate only organization plus event ID', () => {
  const first = record('first', 'notifications', { actionId: 'shared-action' });
  const changed = record('changed', 'notifications', { actionId: 'shared-action' });
  const otherOrganization = record('first', 'notifications', { actionId: 'shared-action', organizationId: 'company-2' });
  const noActionId = record('no-action-id');
  const rows = [first, changed, { ...first, actionId: 'different-action' }, otherOrganization, noActionId, { ...noActionId }];
  assert.deepEqual(getRelevantActionsForTab(rows, session, 'notifications'), [first, changed, otherOrganization, noActionId]);
  assert.deepEqual(getRelevantActions(rows, session), [first, rows[2], otherOrganization, noActionId]);
});

test('Tasks retain action deduplication within an organization', () => {
  const first = record('first', 'reminders', { actionId: 'shared-action' });
  const duplicate = record('duplicate', 'reminders', { actionId: 'shared-action' });
  const otherOrganization = record('other-organization', 'reminders', { actionId: 'shared-action', organizationId: 'company-2' });
  const noActionId = record('no-action-id', 'reminders');
  assert.deepEqual(getRelevantActionsForTab([first, duplicate, otherOrganization, noActionId, { ...noActionId }], session, 'reminders'), [first, otherOrganization, noActionId]);
});

test('notification identities cannot collide when organization or event IDs contain separators', () => {
  const first = record('b:c', 'notifications', { organizationId: 'a' });
  const second = record('c', 'notifications', { organizationId: 'a:b' });
  assert.deepEqual(getRelevantActionsForTab([first, second], session, 'notifications'), [first, second]);
});

test('notification visibility is checked before deduplicating the same event identity', () => {
  const hidden = record('event', 'notifications', { recipientEmails: ['someone-else@example.com'] });
  const visible = record('event', 'notifications', { recipientEmails: [session.email] });
  assert.deepEqual(getRelevantActionsForTab([hidden, visible], session, 'notifications'), [visible]);
});

test('both sections preserve case-insensitive role and recipient restrictions before deduplication', () => {
  for (const category of ['notifications', 'reminders']) {
    const rows = [
      record('wrong-role', category, { relevantRoles: ['Administrator'], actionId: 'restricted-action' }),
      record('wrong-recipient', category, { recipientEmails: ['someone-else@example.com'] }),
      record('role-only', category, { relevantRoles: ['ACCOUNTANT'] }),
      record('recipient-only', category, { recipientEmails: ['ACCOUNTANT@EXAMPLE.COM'] }),
      record('both-match', category, {
        relevantRoles: ['Accountant'], recipientEmails: ['Accountant@example.com'], actionId: 'restricted-action',
      }),
      record('one-restriction-fails', category, {
        relevantRoles: ['Accountant'], recipientEmails: ['someone-else@example.com'],
      }),
      record('unrestricted', category, { relevantRoles: [], recipientEmails: [] }),
    ];
    assert.deepEqual(getRelevantActionsForTab(rows, session, category).map(row => row.id), [
      'role-only', 'recipient-only', 'both-match', 'unrestricted',
    ]);
  }
});

test('company action counts remain unique across categories and exclude non-actionable or irrelevant records', () => {
  const rows = [
    record('notification', 'notifications', { actionId: 'shared-action' }),
    record('task', 'reminders', { actionId: 'shared-action' }),
    record('other-action', 'reminders'),
    record('resolved', 'notifications', { resolvedAt: '2026-09-15T09:00:00.000Z' }),
    record('inactive', 'reminders', { status: 'Inactive' }),
    record('not-required', 'notifications', { requiresAction: false }),
    record('unspecified-action', 'reminders', { requiresAction: undefined }),
    record('other-organization', 'notifications', { organizationId: 'company-2' }),
    record('wrong-role', 'reminders', { relevantRoles: ['Administrator'] }),
    record('wrong-recipient', 'notifications', { recipientEmails: ['someone-else@example.com'] }),
  ];
  assert.deepEqual(getOrganizationRequiredActions(rows, organizationId, session).map(row => row.id), [
    'notification', 'other-action',
  ]);
  for (const category of ['notifications', 'reminders']) {
    const section = getRelevantActionsForTab(rows, session, category);
    const scoped = section.filter(row => row.organizationId === organizationId && requiresAction(row));
    assert.deepEqual(scoped.map(row => row.id), category === 'notifications' ? ['notification'] : ['task', 'other-action']);
  }
});

test('section selection preserves non-actionable records for the unfiltered main page without mutating source', () => {
  const rows = Object.freeze([
    Object.freeze(record('inactive', 'notifications', { status: 'Inactive' })),
    Object.freeze(record('resolved', 'reminders', { resolvedAt: '2026-09-15T09:00:00.000Z' })),
    Object.freeze(record('not-required', 'reminders', { requiresAction: false })),
  ]);
  const original = JSON.stringify(rows);
  assert.deepEqual(getRelevantActionsForTab(rows, session, 'notifications'), [rows[0]]);
  assert.deepEqual(getRelevantActionsForTab(rows, session, 'reminders'), [rows[1], rows[2]]);
  assert.equal(JSON.stringify(rows), original);
});
