import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/notifications.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  getNotificationTabCounts,
  getNotificationStatus,
  setNotificationStatus,
  getTaskStatus,
  isNotificationRead,
  setNotificationRead,
  setTaskStatus,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const session = { email: 'accountant@example.com', roleNames: ['Accountant'] };
const otherSession = { email: 'colleague@example.com', roleNames: ['Accountant'] };
const now = '2026-09-15T09:00:00.000Z';
const later = '2026-09-15T10:00:00.000Z';

test('resolving and reopening updates status and active count without changing reading history', () => {
  const original = Object.freeze(record('status-toggle', 'notifications', { readAtByEmail: { [session.email]: now } }));
  const resolved = setNotificationStatus(original, 'Resolved', later);
  assert.equal(getNotificationStatus(resolved), 'Resolved');
  assert.equal(resolved.resolvedAt, later);
  assert.equal(getNotificationTabCounts([resolved], session).notifications, 0);
  const reopened = setNotificationStatus(resolved, 'Active');
  assert.equal(getNotificationStatus(reopened), 'Active');
  assert.equal(reopened.resolvedAt, undefined);
  assert.equal(getNotificationTabCounts([reopened], session).notifications, 1);
  assert.deepEqual(reopened.readAtByEmail, original.readAtByEmail);
  assert.equal(original.status, 'Active');
  assert.equal(original.resolvedAt, undefined);
});

function record(id, category = 'notifications', patch = {}) {
  return {
    id,
    category,
    organizationId: 'company-1',
    name: `Record ${id}`,
    type: category === 'reminders' ? 'Scheduled' : 'System',
    message: `Message ${id}`,
    status: 'Active',
    ...(category === 'reminders' ? { daysTillRemind: '3' } : {}),
    ...patch,
  };
}

test('counts only Open tasks, independently of the portfolio requires-action flag', () => {
  const rows = [
    record('legacy-open', 'reminders'),
    record('open-without-required-action', 'reminders', { taskStatus: 'Open', requiresAction: false }),
    record('open-required', 'reminders', { taskStatus: 'Open', requiresAction: true }),
    record('completed', 'reminders', { taskStatus: 'Completed' }),
    record('cancelled', 'reminders', { taskStatus: 'Cancelled' }),
    record('legacy-inactive', 'reminders', { status: 'Inactive' }),
    record('legacy-resolved', 'reminders', { resolvedAt: now }),
    record('stale-open-but-resolved', 'reminders', { taskStatus: 'Open', resolvedAt: now }),
  ];
  assert.deepEqual(getNotificationTabCounts(rows, session), { notifications: 0, reminders: 3 });
});

test('task lifecycle prefers valid explicit states and resolves legacy records consistently', () => {
  const cases = [
    [{}, 'Open'],
    [{ status: 'Inactive' }, 'Cancelled'],
    [{ resolvedAt: now }, 'Completed'],
    [{ status: 'Inactive', resolvedAt: now }, 'Completed'],
    [{ taskStatus: 'Open', status: 'Inactive' }, 'Open'],
    [{ taskStatus: 'Completed' }, 'Completed'],
    [{ taskStatus: 'Cancelled' }, 'Cancelled'],
    [{ taskStatus: 'Open', resolvedAt: now }, 'Completed'],
    [{ taskStatus: 'Completed', resolvedAt: now }, 'Completed'],
    [{ taskStatus: 'Cancelled', resolvedAt: now }, 'Cancelled'],
    [{ taskStatus: 'Unknown' }, 'Open'],
    [{ taskStatus: 'Unknown', status: 'Inactive' }, 'Cancelled'],
    [{ taskStatus: 'Unknown', resolvedAt: now }, 'Completed'],
  ];
  for (const [patch, expected] of cases) {
    assert.equal(getTaskStatus(record('task', 'reminders', patch)), expected, JSON.stringify(patch));
  }
});

test('active notifications include every type but exclude inactive and resolved records', () => {
  const rows = [
    record('system', 'notifications', { type: 'System' }),
    record('transaction', 'notifications', { type: 'Transaction' }),
    record('billing', 'notifications', { type: 'Billing' }),
    record('document', 'notifications', { type: 'Document' }),
    record('inactive', 'notifications', { status: 'Inactive' }),
    record('resolved', 'notifications', { resolvedAt: now }),
    record('non-actionable', 'notifications', { requiresAction: false }),
    record('read', 'notifications', { readAtByEmail: { [session.email]: now } }),
    record('task-with-read-receipt', 'reminders', { readAtByEmail: { [session.email]: now } }),
  ];
  assert.deepEqual(getNotificationTabCounts(rows, session), { notifications: 6, reminders: 1 });
});

test('read receipts are per user and matching ignores email case and surrounding whitespace', () => {
  const notification = record('notification', 'notifications', {
    readAtByEmail: { ' ACCOUNTANT@EXAMPLE.COM ': now },
  });
  assert.equal(isNotificationRead(notification, session.email), true);
  assert.equal(isNotificationRead(notification, '  Accountant@Example.Com  '), true);
  assert.equal(isNotificationRead(notification, otherSession.email), false);
  assert.equal(isNotificationRead(record('legacy'), session.email), false);
  assert.deepEqual(getNotificationTabCounts([notification], session), { notifications: 1, reminders: 0 });
  assert.deepEqual(getNotificationTabCounts([notification], otherSession), { notifications: 1, reminders: 0 });
});

test('role and recipient permissions are applied to both counters before section deduplication', () => {
  const rows = ['notifications', 'reminders'].flatMap(category => [
    record(`${category}-wrong-role`, category, { relevantRoles: ['Administrator'], actionId: 'restricted' }),
    record(`${category}-wrong-recipient`, category, { recipientEmails: ['someone-else@example.com'] }),
    record(`${category}-role-only`, category, { relevantRoles: ['ACCOUNTANT'] }),
    record(`${category}-recipient-only`, category, { recipientEmails: ['ACCOUNTANT@EXAMPLE.COM'] }),
    record(`${category}-both`, category, {
      relevantRoles: ['Accountant'], recipientEmails: ['Accountant@example.com'], actionId: 'restricted',
    }),
    record(`${category}-one-fails`, category, {
      relevantRoles: ['Accountant'], recipientEmails: ['someone-else@example.com'],
    }),
    record(`${category}-unrestricted`, category, { relevantRoles: [], recipientEmails: [] }),
  ]);
  assert.deepEqual(getNotificationTabCounts(rows, session), { notifications: 4, reminders: 4 });
  assert.deepEqual(getNotificationTabCounts(rows, otherSession), { notifications: 2, reminders: 2 });
});

test('counts distinct notification events while Tasks retain action deduplication', () => {
  const rows = ['notifications', 'reminders'].flatMap(category => {
    const first = record('first', category, { actionId: 'shared' });
    const withoutAction = record('without-action', category);
    return [
      first,
      record('duplicate', category, { actionId: 'shared' }),
      record('other-organization', category, { actionId: 'shared', organizationId: 'company-2' }),
      withoutAction,
      { ...withoutAction },
    ];
  });
  assert.deepEqual(getNotificationTabCounts(rows, session), { notifications: 4, reminders: 3 });
  assert.deepEqual(getNotificationTabCounts([...rows].reverse(), session), { notifications: 4, reminders: 3 });
});

test('reading one event does not read later events for the same primary action', () => {
  const first = record('created', 'notifications', { actionId: 'task-1' });
  const changed = record('changed', 'notifications', { actionId: 'task-1' });
  assert.deepEqual(getNotificationTabCounts([first, changed], session), { notifications: 2, reminders: 0 });
  const readFirst = setNotificationRead(first, session.email, true, now);
  assert.deepEqual(getNotificationTabCounts([readFirst, changed], session), { notifications: 2, reminders: 0 });
  assert.equal(isNotificationRead(changed, session.email), false);
  assert.deepEqual(getNotificationTabCounts([readFirst, changed], otherSession), { notifications: 2, reminders: 0 });
});

test('read and unread updates are immutable and preserve all other users and record fields', () => {
  const receipts = Object.freeze({
    ' ACCOUNTANT@EXAMPLE.COM ': now,
    'Accountant@example.com': now,
    [otherSession.email]: now,
  });
  const original = Object.freeze(record('notification', 'notifications', {
    readAtByEmail: receipts, requiresAction: true, resolvedAt: now,
  }));
  const before = JSON.stringify(original);
  const unread = setNotificationRead(original, ' accountant@EXAMPLE.com ', false, later);
  assert.notEqual(unread, original);
  assert.notEqual(unread.readAtByEmail, receipts);
  assert.equal(isNotificationRead(unread, session.email), false);
  assert.deepEqual(unread.readAtByEmail, { [otherSession.email]: now });
  const read = setNotificationRead(unread, '  ACCOUNTANT@example.com ', true, later);
  assert.equal(isNotificationRead(read, session.email), true);
  assert.equal(read.readAtByEmail[session.email], later);
  assert.equal(read.readAtByEmail[otherSession.email], now);
  assert.equal(read.resolvedAt, now);
  assert.equal(read.requiresAction, true);
  assert.equal(JSON.stringify(original), before);
  const { readAtByEmail: ignoredOriginal, ...originalFields } = original;
  const { readAtByEmail: ignoredUpdated, ...updatedFields } = read;
  assert.deepEqual(updatedFields, originalFields);
});

test('reading and marking unread never change the active notification count', () => {
  let notification = record('notification');
  assert.deepEqual(getNotificationTabCounts([notification], session), { notifications: 1, reminders: 0 });
  notification = setNotificationRead(notification, session.email, true, now);
  assert.deepEqual(getNotificationTabCounts([notification], session), { notifications: 1, reminders: 0 });
  assert.deepEqual(getNotificationTabCounts([notification], otherSession), { notifications: 1, reminders: 0 });
  notification = setNotificationRead(notification, otherSession.email, true, later);
  notification = setNotificationRead(notification, session.email, false, later);
  assert.deepEqual(getNotificationTabCounts([notification], session), { notifications: 1, reminders: 0 });
  assert.deepEqual(getNotificationTabCounts([notification], otherSession), { notifications: 1, reminders: 0 });
});

test('notification counts track Active and Resolved exactly as the status column', () => {
  const active = record('active', 'notifications', { notificationStatus: 'Active', status: 'Inactive' });
  const resolved = { ...active, notificationStatus: 'Resolved', status: 'Active' };
  assert.equal(getNotificationTabCounts([active], session).notifications, 1);
  assert.equal(getNotificationTabCounts([resolved], session).notifications, 0);
  assert.equal(getNotificationTabCounts([{ ...active, resolvedAt: now }], session).notifications, 0);
  const many = Array.from({ length: 9 }, (_, index) => ({ ...active, id: String(index) }));
  assert.equal(getNotificationTabCounts(many, session).notifications, 9);
});

test('completing, reopening, and cancelling synchronize lifecycle fields and counts without mutation', () => {
  const original = Object.freeze(record('task', 'reminders', {
    requiresAction: true, actionId: 'action-task', relevantRoles: Object.freeze(['Accountant']),
  }));
  const before = JSON.stringify(original);
  const completed = setTaskStatus(original, 'Completed', now);
  assert.notEqual(completed, original);
  assert.equal(completed.taskStatus, 'Completed');
  assert.equal(completed.status, 'Inactive');
  assert.equal(completed.resolvedAt, now);
  assert.deepEqual(getNotificationTabCounts([completed], session), { notifications: 0, reminders: 0 });
  const reopened = setTaskStatus(Object.freeze(completed), 'Open', later);
  assert.equal(reopened.taskStatus, 'Open');
  assert.equal(reopened.status, 'Active');
  assert.equal(reopened.resolvedAt, undefined);
  assert.deepEqual(getNotificationTabCounts([reopened], session), { notifications: 0, reminders: 1 });
  const cancelled = setTaskStatus(Object.freeze(reopened), 'Cancelled', later);
  assert.equal(cancelled.taskStatus, 'Cancelled');
  assert.equal(cancelled.status, 'Inactive');
  assert.equal(cancelled.resolvedAt, later);
  assert.deepEqual(getNotificationTabCounts([cancelled], session), { notifications: 0, reminders: 0 });
  for (const updated of [completed, reopened, cancelled]) {
    const { status, taskStatus, resolvedAt, ...unchanged } = updated;
    const { status: legacyStatus, ...expected } = original;
    assert.deepEqual(unchanged, expected);
  }
  assert.equal(JSON.stringify(original), before);
});

test('counting has no side effects and is independent of separately filtered display rows', () => {
  const rows = Object.freeze([
    Object.freeze(record('visible-notification')),
    Object.freeze(record('another-notification', 'notifications', { status: 'Inactive' })),
    Object.freeze(record('read-notification', 'notifications', {
      readAtByEmail: Object.freeze({ [session.email]: now }),
    })),
    Object.freeze(record('visible-task', 'reminders')),
    Object.freeze(record('another-task', 'reminders')),
    Object.freeze(record('closed-task', 'reminders', { taskStatus: 'Completed' })),
  ]);
  const frozenSession = Object.freeze({ ...session, roleNames: Object.freeze([...session.roleNames]) });
  const before = JSON.stringify({ rows, frozenSession });
  const firstCounts = getNotificationTabCounts(rows, frozenSession);
  const displayRows = rows.filter(row => row.name.includes('visible-')).slice(0, 1);
  assert.equal(displayRows.length, 1);
  assert.deepEqual(firstCounts, { notifications: 2, reminders: 2 });
  assert.deepEqual(getNotificationTabCounts(rows, frozenSession), firstCounts);
  assert.equal(JSON.stringify({ rows, frozenSession }), before);
});

test('empty collections return explicit zero counters', () => {
  assert.deepEqual(getNotificationTabCounts([], session), { notifications: 0, reminders: 0 });
});
