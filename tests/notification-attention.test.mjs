import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const scheduleUrl = moduleUrl(transpile('../src/lib/taskSchedule.ts').replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl)));
const attentionUrl = moduleUrl(transpile('../src/lib/notificationAttention.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl))
  .replace(/(['"])\.\/taskSchedule\1/g, JSON.stringify(scheduleUrl)));
const runtimeUrl = moduleUrl(transpile('../src/lib/taskReminderRuntime.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl))
  .replace(/(['"])\.\/taskSchedule\1/g, JSON.stringify(scheduleUrl)));
const { getDashboardAttentionNotifications } = await import(attentionUrl);
const { collectDueTaskReminderNotifications, getTaskDueGroup } = await import(scheduleUrl);
const { processTaskReminders } = await import(runtimeUrl);
const { getAttentionNotifications, getOrganizationRequiredActions, getNotificationTabCounts, setNotificationRead, setTaskStatus } = await import(notificationsUrl);

const session = { email: 'assignee@example.com', roleNames: ['Accountant'] };
const localDate = (day, hour = 12) => new Date(2026, 8, day, hour);
const now = localDate(15);
const task = (patch = {}) => ({
  id: 'task-1', name: 'Review invoice', type: 'Review', message: 'Check invoice amounts.',
  status: 'Active', taskStatus: 'Open', requiresAction: true, daysTillRemind: '',
  dueDate: '2026-09-22', reminder: '7_days_before', assignedToEmail: session.email,
  organizationId: 'company-1', organizationName: 'First Organization',
  ...patch,
});
const generate = (row, date = now) => collectDueTaskReminderNotifications([row], [], date)[0];
const rows = (tasks, notifications = []) => getAttentionNotifications(notifications, tasks, true);
const ids = result => result.map(row => `${row.category}:${row.id}`).sort();
const freezeDeep = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

test('seven-day reminder adds exactly one attention alert on the threshold, not the day before', () => {
  const source = task();
  const reminder = generate(source);
  const records = rows([source], [reminder]);
  assert.equal(collectDueTaskReminderNotifications([source], [], localDate(14, 23)).length, 0);
  assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, localDate(14, 23))), ['reminders:task-1']);
  assert.equal(getDashboardAttentionNotifications(records, session, localDate(15, 0)).length, 2);
  assert.equal(getDashboardAttentionNotifications(records, session, localDate(15, 23)).length, 2);
  assert.equal(getDashboardAttentionNotifications(records, session, localDate(23)).length, 2);
  assert.deepEqual(getNotificationTabCounts(records, session), { notifications: 1, reminders: 1 });
});

test('legacy generated reminders with requiresAction false work without altering Companies action counts', () => {
  const source = task({ actionId: 'underlying-task' });
  const reminder = generate(source);
  assert.equal(reminder.requiresAction, false);
  const records = rows([source], [JSON.parse(JSON.stringify(reminder))]);
  assert.equal(getDashboardAttentionNotifications(records, session, now).length, 2);
  assert.equal(getOrganizationRequiredActions(records, 'company-1', session).length, 1);
  assert.equal(getOrganizationRequiredActions(records, 'company-1', session)[0].id, source.id);
});

test('an Open task with requiresAction false counts separately from its due reminder without changing Companies counts', () => {
  const source = task({ requiresAction: false });
  const reminder = generate(source);
  const records = rows([source], [reminder]);
  assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, now)), [`notifications:${reminder.id}`, 'reminders:task-1'].sort());
  assert.equal(getOrganizationRequiredActions(records, 'company-1', session).length, 0);
});

test('exactly two Upcoming Open tasks count before either reminder is due, including false and missing requiresAction', () => {
  const first = task({ id: 'upcoming-false', requiresAction: false, dueDate: '2026-09-25', reminder: '3_days_before' });
  const second = task({ id: 'upcoming-missing', dueDate: '2026-09-26', reminder: '1_day_before' });
  delete second.requiresAction;
  assert.equal(getTaskDueGroup(first, '2026-09-15'), 'Upcoming');
  assert.equal(getTaskDueGroup(second, '2026-09-15'), 'Upcoming');
  assert.deepEqual(collectDueTaskReminderNotifications([first, second], [], now), []);
  const records = rows([first, second]);
  assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, now)), ['reminders:upcoming-false', 'reminders:upcoming-missing']);
  assert.equal(getDashboardAttentionNotifications(records, session, now).length, 2);
  assert.deepEqual(getNotificationTabCounts(records, session), { notifications: 0, reminders: 2 });
  assert.equal(getOrganizationRequiredActions(records, 'company-1', session).length, 0);
});

test('Open task attention is independent of reminder configuration and legacy action flag', () => {
  for (const reminder of ['none', undefined, 'on_due_date', '7_days_before']) {
    for (const requiresAction of [true, false, undefined]) {
      const source = task({ requiresAction, dueDate: '2026-10-22', reminder });
      assert.deepEqual(ids(getDashboardAttentionNotifications(rows([source]), session, now)), ['reminders:task-1']);
    }
  }
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([task({ dueDate: undefined, reminder: undefined, requiresAction: false })]), session, now)), ['reminders:task-1']);
});

test('Upcoming task attention follows completion, cancellation and reopening even with a stale action flag', () => {
  const source = task({ dueDate: '2026-10-22', requiresAction: true });
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([source]), session, now)), ['reminders:task-1']);
  for (const status of ['Completed', 'Cancelled']) {
    const terminal = setTaskStatus(source, status, now.toISOString());
    assert.deepEqual(getDashboardAttentionNotifications(rows([terminal]), session, now), []);
    assert.deepEqual(getDashboardAttentionNotifications(rows([{ ...source, taskStatus: status }]), session, now), []);
    const reopened = { ...setTaskStatus(terminal, 'Open', now.toISOString()), requiresAction: false };
    assert.deepEqual(ids(getDashboardAttentionNotifications(rows([reopened]), session, now)), ['reminders:task-1']);
  }
  assert.deepEqual(getDashboardAttentionNotifications(rows([{ ...source, resolvedAt: now.toISOString() }]), session, now), []);
});

test('Upcoming Open task counts honor role, recipient and accessible-organization scopes without requiring assignment', () => {
  const source = task({ requiresAction: false, dueDate: '2026-10-22', assignedToEmail: 'other@example.com' });
  const records = rows([
    source,
    task({ id: 'hidden-role', requiresAction: false, relevantRoles: ['Other role'] }),
    task({ id: 'hidden-recipient', requiresAction: false, recipientEmails: ['other@example.com'] }),
    task({ id: 'hidden-company', requiresAction: false, organizationId: 'company-2' }),
  ]).filter(row => row.organizationId === 'company-1');
  assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, now)), ['reminders:task-1']);
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([{ ...source, relevantRoles: ['Accountant'], recipientEmails: [session.email] }]), session, now)), ['reminders:task-1']);
});

test('a newer ineligible notification sharing an action ID cannot suppress its Open task', () => {
  const source = task({ actionId: 'shared-action', requiresAction: false, dueDate: '2026-10-22', createdAt: '2026-09-01T08:00:00.000Z' });
  for (const patch of [
    { requiresAction: false },
    { requiresAction: undefined },
    { requiresAction: true, status: 'Inactive' },
    { requiresAction: true, resolvedAt: now.toISOString() },
  ]) {
    const notification = {
      id: 'newer-ineligible', actionId: source.actionId, organizationId: source.organizationId,
      name: 'Task information', type: 'System', message: 'Updated.', status: 'Active',
      createdAt: now.toISOString(), ...patch,
    };
    const records = rows([source], [notification]);
    assert.equal(records[0].id, notification.id);
    assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, now)), ['reminders:task-1']);
  }
});

test('reading a reminder removes only its attention alert and leaves the Open task action intact', () => {
  const source = task();
  const reminder = generate(source);
  const read = setNotificationRead(reminder, ' ASSIGNEE@EXAMPLE.COM ', true, now.toISOString());
  const records = rows([source], [read]);
  assert.deepEqual(ids(getDashboardAttentionNotifications(records, session, now)), ['reminders:task-1']);
  assert.deepEqual(getNotificationTabCounts(records, session), { notifications: 0, reminders: 1 });
  const otherReader = setNotificationRead(reminder, 'other@example.com', true, now.toISOString());
  assert.equal(getDashboardAttentionNotifications(rows([source], [otherReader]), session, now).length, 2);
});

test('inactive or resolved reminder notifications do not show as fresh attention alerts', () => {
  const source = task();
  const reminder = generate(source);
  for (const patch of [{ status: 'Inactive' }, { resolvedAt: now.toISOString() }]) {
    assert.deepEqual(ids(getDashboardAttentionNotifications(rows([source], [{ ...reminder, ...patch }]), session, now)), ['reminders:task-1']);
  }
});

test('completed and cancelled tasks no longer produce attention from their old reminder', () => {
  const source = task();
  const reminder = generate(source);
  for (const status of ['Completed', 'Cancelled']) {
    const closed = { ...setTaskStatus(source, status, now.toISOString()), requiresAction: false };
    const records = rows([closed], [reminder]);
    assert.deepEqual(getDashboardAttentionNotifications(records, session, now), []);
    // The original unread notification remains historical data in Notifications.
    assert.deepEqual(getNotificationTabCounts(records, session), { notifications: 1, reminders: 0 });
  }
});

test('a deleted task cannot leave an orphaned reminder in attention', () => {
  assert.deepEqual(getDashboardAttentionNotifications(rows([], [generate(task())]), session, now), []);
});

test('rescheduling, disabling reminders or reassigning a task suppresses its obsolete warning', () => {
  const source = task();
  const reminder = generate(source);
  for (const patch of [
    { dueDate: '2026-10-22' }, { reminder: '1_day_before' }, { reminder: 'none' },
    { reminder: undefined }, { assignedToEmail: 'other@example.com' },
  ]) {
    const current = { ...source, ...patch };
    assert.deepEqual(ids(getDashboardAttentionNotifications(rows([current], [reminder]), session, now)), ['reminders:task-1']);
  }
});

test('current replacement schedule creates a new alert but does not retain its old schedule alert', () => {
  const original = task();
  const oldReminder = generate(original);
  const updated = task({ dueDate: '2026-09-21', reminder: '7_days_before' });
  const currentReminder = generate(updated);
  const result = getDashboardAttentionNotifications(rows([updated], [oldReminder, currentReminder]), session, now);
  assert.deepEqual(ids(result), [`notifications:${currentReminder.id}`, 'reminders:task-1'].sort());
});

test('role and recipient restrictions apply to both reminder and linked source task', () => {
  const source = task();
  const reminder = generate(source);
  for (const patch of [{ relevantRoles: ['Other role'] }, { recipientEmails: ['other@example.com'] }]) {
    assert.deepEqual(getDashboardAttentionNotifications(rows([{ ...source, ...patch }], [reminder]), session, now), []);
    assert.deepEqual(ids(getDashboardAttentionNotifications(rows([source], [{ ...reminder, ...patch }]), session, now)), ['reminders:task-1']);
  }
  const other = { email: 'other@example.com', roleNames: ['Accountant'] };
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([source], [reminder]), other, now)), ['reminders:task-1']);
});

test('records already scoped to accessible organizations cannot show a warning without its source', () => {
  const source = task({ organizationId: 'inaccessible-company' });
  const reminder = generate(source);
  const preScoped = rows([source], [reminder]).filter(row => row.organizationId === 'accessible-company');
  assert.deepEqual(getDashboardAttentionNotifications(preScoped, session, now), []);
});

test('same task IDs in different organizations retain separate reminder identities', () => {
  const first = task();
  const second = task({ organizationId: 'company-2', organizationName: 'Second Organization' });
  const firstReminder = generate(first);
  const secondReminder = generate(second);
  assert.notEqual(firstReminder.id, secondReminder.id);
  const records = rows([first, second], [firstReminder, secondReminder]);
  assert.equal(getDashboardAttentionNotifications(records, session, now).length, 4);
  assert.equal(getOrganizationRequiredActions(records, 'company-1', session).length, 1);
  assert.equal(getOrganizationRequiredActions(records, 'company-2', session).length, 1);
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([first], [firstReminder, secondReminder]), session, now)), [`notifications:${firstReminder.id}`, 'reminders:task-1'].sort());
});

test('ordinary unread informational notifications are not silently promoted to required actions', () => {
  const informational = { id: 'ordinary', name: 'Saved', type: 'System', status: 'Active', message: 'Saved.', requiresAction: false };
  assert.deepEqual(getDashboardAttentionNotifications(rows([], [informational]), session, now), []);
  const action = { ...informational, id: 'real-action', requiresAction: true };
  assert.deepEqual(ids(getDashboardAttentionNotifications(rows([], [informational, action]), session, now)), ['notifications:real-action']);
});

test('duplicate input records cannot duplicate alerts and the newly delivered warning stays newest', () => {
  const source = task({ createdAt: '2026-09-01T08:00:00.000Z' });
  const reminder = generate(source);
  const result = getDashboardAttentionNotifications(rows([source, { ...source }], [reminder, { ...reminder }]), session, now);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, reminder.id);
  assert.equal(result[1].id, source.id);
});

test('selector preserves inputs and stable results across repeated reads', () => {
  const source = task();
  const reminder = generate(source);
  const records = freezeDeep(rows([source], [reminder]));
  const viewer = freezeDeep({ ...session, roleNames: [...session.roleNames] });
  const before = JSON.stringify({ records, viewer, now });
  const first = getDashboardAttentionNotifications(records, viewer, now);
  assert.deepEqual(getDashboardAttentionNotifications(records, viewer, now), first);
  assert.equal(JSON.stringify({ records, viewer, now }), before);
});

test('runtime delivery increments attention once, survives polling and reload, and never resends a read reminder', () => {
  const TASKS = 'finansu-harmonija:v7:reminders';
  const NOTIFICATIONS = 'finansu-harmonija:v7:notifications';
  const values = new Map([[TASKS, JSON.stringify([task()])], [NOTIFICATIONS, '[]']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const readRecords = () => rows(JSON.parse(storage.getItem(TASKS)), JSON.parse(storage.getItem(NOTIFICATIONS)));
  assert.equal(processTaskReminders(storage, localDate(14, 23)), 0);
  assert.equal(getDashboardAttentionNotifications(readRecords(), session, localDate(14, 23)).length, 1);
  assert.equal(processTaskReminders(storage, now), 1);
  assert.equal(getDashboardAttentionNotifications(readRecords(), session, now).length, 2);
  assert.equal(processTaskReminders(storage, now), 0);
  assert.equal(getDashboardAttentionNotifications(readRecords(), session, now).length, 2);
  const [notification] = JSON.parse(storage.getItem(NOTIFICATIONS));
  storage.setItem(NOTIFICATIONS, JSON.stringify([setNotificationRead(notification, session.email, true, now.toISOString())]));
  assert.equal(processTaskReminders(storage, localDate(16)), 0);
  assert.equal(JSON.parse(storage.getItem(NOTIFICATIONS)).length, 1);
  assert.equal(getDashboardAttentionNotifications(readRecords(), session, localDate(16)).length, 1);
});
