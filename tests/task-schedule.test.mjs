import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function transpile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const scheduleSource = transpile('../src/lib/taskSchedule.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl));
const { TASK_REMINDER_OPTIONS, getLocalDateKey, getTaskDueGroup, matchesTaskQuickFilters, collectDueTaskReminderNotifications } = await import(moduleUrl(scheduleSource));
const { getAttentionNotifications, getOrganizationRequiredActions } = await import(notificationsUrl);

const today = '2026-09-15';
const localDate = (date, hour = 12) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour);
};

function task(patch = {}) {
  return {
    id: 'task-1', name: 'Review invoice', type: 'Review', message: 'Check invoice amounts.',
    status: 'Active', taskStatus: 'Open', requiresAction: true, daysTillRemind: '',
    dueDate: today, reminder: 'on_due_date', assignedToEmail: 'assignee@example.com',
    organizationId: 'company-1', organizationName: 'First Organization',
    ...patch,
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('task reminder notifications reference the source Task and retain its related-object context', () => {
  const relatedObject = { id: 'chat:thread-1', recordId: 'thread-1', organizationId: 'company-1', type: 'Chat', label: 'Invoice review' };
  const original = freezeDeep(task({ relatedObject }));
  const [notification] = collectDueTaskReminderNotifications([original], [], localDate(today));
  assert.equal(notification.origin, 'system');
  assert.equal(notification.organizationId, original.organizationId);
  assert.equal(notification.sourceTaskId, original.id);
  assert.deepEqual(notification.relatedObject, relatedObject);
  assert.notEqual(notification.relatedObject, relatedObject);
  const [unlinked] = collectDueTaskReminderNotifications([task({ relatedObject: { ...relatedObject, organizationId: 'company-2' } })], [], localDate(today));
  assert.equal(unlinked.relatedObject, undefined);
  assert.equal(unlinked.sourceTaskId, original.id);
});

test('reminder presets have the exact finite values and English labels', () => {
  assert.deepEqual(TASK_REMINDER_OPTIONS, [
    { value: 'none', label: 'None' },
    { value: 'on_due_date', label: 'On due date' },
    { value: '1_day_before', label: '1 day before' },
    { value: '3_days_before', label: '3 days before' },
    { value: '7_days_before', label: '7 days before' },
  ]);
});

test('local date keys use the local calendar instead of the UTC date', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Vilnius';
    assert.equal(getLocalDateKey(new Date('2026-09-14T22:30:00.000Z')), '2026-09-15');
    process.env.TZ = 'America/New_York';
    assert.equal(getLocalDateKey(new Date('2026-09-15T01:30:00.000Z')), '2026-09-14');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
  assert.equal(getLocalDateKey(localDate('2026-01-02')), '2026-01-02');
  assert.equal(getLocalDateKey(new Date(Number.NaN)), '');
});

test('date groups classify only Open tasks with valid ISO due dates', () => {
  assert.equal(getTaskDueGroup(task({ dueDate: '2026-09-14' }), today), 'Overdue');
  assert.equal(getTaskDueGroup(task(), today), 'Today');
  assert.equal(getTaskDueGroup(task({ dueDate: '2026-09-16' }), today), 'Upcoming');
  assert.equal(getTaskDueGroup(task({ taskStatus: undefined }), today), 'Today');
  for (const patch of [
    { taskStatus: 'Completed' }, { taskStatus: 'Cancelled' },
    { taskStatus: undefined, status: 'Inactive' }, { resolvedAt: '2026-09-15T08:00:00Z' },
  ]) {
    assert.equal(getTaskDueGroup(task(patch), today), null);
  }
  for (const dueDate of [undefined, '', '2026-9-15', '2026-02-29', '2026-09-31', '2026-13-01', '2026-09-15T00:00:00Z']) {
    assert.equal(getTaskDueGroup(task({ dueDate }), today), null, String(dueDate));
  }
  assert.equal(getTaskDueGroup(task({ dueDate: '2028-02-29' }), '2028-02-29'), 'Today');
  assert.equal(getTaskDueGroup(task(), 'invalid-today'), null);
});

test('default quick filters include every supplied permission-visible task without implicit My tasks', () => {
  const rows = [
    task(), task({ assignedToEmail: 'another@example.com' }), task({ assignedToEmail: undefined }),
    task({ dueDate: undefined }), task({ taskStatus: 'Completed' }), task({ taskStatus: 'Cancelled' }),
  ];
  for (const row of rows) {
    assert.equal(matchesTaskQuickFilters(row, { myTasks: false, period: null }, 'unrelated@example.com', today), true);
  }
});

test('My tasks matches only the normalized nonblank assignee email', () => {
  const filters = { myTasks: true, period: null };
  assert.equal(matchesTaskQuickFilters(task({ assignedToEmail: ' ASSIGNEE@EXAMPLE.COM ' }), filters, ' Assignee@Example.Com ', today), true);
  assert.equal(matchesTaskQuickFilters(task(), filters, 'creator@example.com', today), false);
  assert.equal(matchesTaskQuickFilters(task({ assignedToEmail: undefined }), filters, 'assignee@example.com', today), false);
  assert.equal(matchesTaskQuickFilters(task({ assignedToEmail: ' ' }), filters, ' ', today), false);
  assert.equal(matchesTaskQuickFilters(task(), filters, '', today), false);
});

test('My tasks and one date/status quick filter combine with AND semantics', () => {
  const rows = [
    task({ id: 'my-overdue', dueDate: '2026-09-14' }),
    task({ id: 'my-today' }),
    task({ id: 'my-upcoming', dueDate: '2026-09-16' }),
    task({ id: 'my-completed', taskStatus: 'Completed', dueDate: undefined }),
    task({ id: 'other-today', assignedToEmail: 'other@example.com' }),
    task({ id: 'other-completed', taskStatus: 'Completed', assignedToEmail: 'other@example.com' }),
    task({ id: 'my-cancelled', taskStatus: 'Cancelled' }),
  ];
  for (const [period, expected] of [
    ['Overdue', ['my-overdue']], ['Today', ['my-today']], ['Upcoming', ['my-upcoming']], ['Completed', ['my-completed']],
  ]) {
    assert.deepEqual(rows.filter(row => matchesTaskQuickFilters(row, { myTasks: true, period }, 'assignee@example.com', today)).map(row => row.id), expected);
  }
  assert.deepEqual(rows.filter(row => matchesTaskQuickFilters(row, { myTasks: false, period: 'Today' }, '', today)).map(row => row.id), ['my-today', 'other-today']);
  assert.deepEqual(rows.filter(row => matchesTaskQuickFilters(row, { myTasks: false, period: 'Completed' }, '', today)).map(row => row.id), ['my-completed', 'other-completed']);
});

test('Completed quick filter uses lifecycle only, including resolved legacy tasks', () => {
  const filters = { myTasks: false, period: 'Completed' };
  assert.equal(matchesTaskQuickFilters(task({ taskStatus: 'Completed', dueDate: 'invalid' }), filters, '', 'invalid-today'), true);
  assert.equal(matchesTaskQuickFilters(task({ taskStatus: undefined, resolvedAt: '2026-09-01T00:00:00Z', dueDate: undefined }), filters, '', today), true);
  assert.equal(matchesTaskQuickFilters(task({ taskStatus: 'Cancelled', resolvedAt: '2026-09-01T00:00:00Z' }), filters, '', today), false);
  assert.equal(matchesTaskQuickFilters(task(), filters, '', today), false);
});

test('each reminder preset triggers on its calendar threshold, never the preceding day', () => {
  for (const [reminder, threshold, preceding] of [
    ['on_due_date', '2026-09-15', '2026-09-14'],
    ['1_day_before', '2026-09-14', '2026-09-13'],
    ['3_days_before', '2026-09-12', '2026-09-11'],
    ['7_days_before', '2026-09-08', '2026-09-07'],
  ]) {
    const row = task({ reminder });
    assert.deepEqual(collectDueTaskReminderNotifications([row], [], localDate(preceding, 23)), []);
    assert.equal(collectDueTaskReminderNotifications([row], [], localDate(threshold, 0)).length, 1, reminder);
    assert.equal(collectDueTaskReminderNotifications([row], [], localDate(threshold, 23)).length, 1, reminder);
  }
});

test('calendar subtraction handles leap dates, month/year boundaries and DST transitions', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Vilnius';
    for (const [dueDate, reminder, threshold, preceding] of [
      ['2028-03-01', '1_day_before', '2028-02-29', '2028-02-28'],
      ['2027-01-01', '3_days_before', '2026-12-29', '2026-12-28'],
      ['2026-03-30', '1_day_before', '2026-03-29', '2026-03-28'],
      ['2026-10-26', '1_day_before', '2026-10-25', '2026-10-24'],
    ]) {
      const row = task({ dueDate, reminder });
      assert.deepEqual(collectDueTaskReminderNotifications([row], [], localDate(preceding, 23)), []);
      assert.equal(collectDueTaskReminderNotifications([row], [], localDate(threshold, 0)).length, 1, `${dueDate} ${reminder}`);
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('missed reminder dates catch up with task, due date and current timing in the notification', () => {
  for (const [date, timing] of [['2026-09-12', 'upcoming'], ['2026-09-15', 'due today'], ['2026-09-20', 'overdue']]) {
    const [notification] = collectDueTaskReminderNotifications([task({ reminder: '7_days_before' })], [], localDate(date));
    assert.ok(notification);
    assert.match(notification.name, /Review invoice/);
    assert.match(notification.name, /2026-09-15/);
    assert.match(notification.message, /Review invoice/);
    assert.match(notification.message, /2026-09-15/);
    assert.ok(notification.message.includes(timing), timing);
  }
});

test('None, missing legacy reminders and unsupported presets do not generate notifications', () => {
  for (const reminder of ['none', undefined, '', '2_days_before', 'on_due', 'toString', '__proto__']) {
    assert.deepEqual(collectDueTaskReminderNotifications([task({ reminder, daysTillRemind: '3' })], [], localDate('2026-12-31')), [], String(reminder));
  }
});

test('terminal tasks and missing or invalid schedule identities are skipped', () => {
  const invalidRows = [
    task({ taskStatus: 'Completed' }), task({ taskStatus: 'Cancelled' }), task({ resolvedAt: '2026-09-01T00:00:00Z' }),
    task({ taskStatus: undefined, status: 'Inactive' }), task({ dueDate: undefined }), task({ dueDate: '2026-02-29' }),
    task({ dueDate: '2026-09-31' }), task({ dueDate: '2026-9-15' }), task({ assignedToEmail: undefined }),
    task({ assignedToEmail: ' ' }), task({ organizationId: undefined }), task({ organizationId: ' ' }), task({ id: ' ' }),
  ];
  assert.deepEqual(collectDueTaskReminderNotifications(invalidRows, [], localDate('2026-12-31')), []);
  assert.deepEqual(collectDueTaskReminderNotifications([task()], [], new Date(Number.NaN)), []);
});

test('generated reminders target only the normalized assignee and do not double count task actions', () => {
  const row = task({ assignedToEmail: ' ASSIGNEE@EXAMPLE.COM ', actionId: 'underlying-task-action', recipientEmails: ['creator@example.com', 'assignee@example.com'] });
  const [notification] = collectDueTaskReminderNotifications([row], [], localDate(today));
  assert.equal(notification.type, 'System');
  assert.equal(notification.status, 'Active');
  assert.equal(notification.organizationId, row.organizationId);
  assert.equal(notification.organizationName, row.organizationName);
  assert.deepEqual(notification.recipientEmails, ['assignee@example.com']);
  assert.equal(notification.requiresAction, false);
  assert.equal(notification.actionId, undefined);
  const visibleTask = { ...row, recipientEmails: undefined };
  const actions = getAttentionNotifications([notification], [visibleTask], true);
  assert.equal(getOrganizationRequiredActions(actions, row.organizationId, { email: 'assignee@example.com', roleNames: [] }).length, 1);
});

test('reminders preserve task role restrictions and never widen explicit task recipients', () => {
  const restricted = freezeDeep(task({ relevantRoles: ['Accountant'], recipientEmails: [' CREATOR@EXAMPLE.COM '] }));
  assert.deepEqual(collectDueTaskReminderNotifications([restricted], [], localDate(today)), []);
  const allowed = freezeDeep(task({ relevantRoles: ['Accountant'], recipientEmails: ['creator@example.com', ' ASSIGNEE@EXAMPLE.COM '] }));
  const [notification] = collectDueTaskReminderNotifications([allowed], [], localDate(today));
  assert.deepEqual(notification.recipientEmails, ['assignee@example.com']);
  assert.deepEqual(notification.relevantRoles, ['Accountant']);
  assert.notEqual(notification.relevantRoles, allowed.relevantRoles);
  assert.equal(collectDueTaskReminderNotifications([task({ recipientEmails: [] })], [], localDate(today)).length, 1);
});

test('stable IDs deduplicate polling, reloads, existing read/inactive history, and repeated input rows', () => {
  const row = task();
  const first = collectDueTaskReminderNotifications([row, { ...row }], [], localDate(today));
  assert.equal(first.length, 1);
  const polled = collectDueTaskReminderNotifications([row], [], localDate('2026-09-20'));
  assert.equal(polled[0].id, first[0].id);
  const history = JSON.parse(JSON.stringify(first.map(notification => ({ ...notification, status: 'Inactive', readAtByEmail: { 'assignee@example.com': '2026-09-15T15:00:00Z' } }))));
  assert.deepEqual(collectDueTaskReminderNotifications([row], history, localDate('2026-09-20')), []);
  assert.equal(collectDueTaskReminderNotifications([task({ assignedToEmail: ' ASSIGNEE@EXAMPLE.COM ' })], [], localDate(today))[0].id, first[0].id);
});

test('rescheduling, reminder changes, reassignment and distinct tasks/organizations create separate reminder identities', () => {
  const original = task();
  const history = collectDueTaskReminderNotifications([original], [], localDate('2026-09-30'));
  const updatedRows = [
    task({ dueDate: '2026-09-16' }), task({ reminder: '1_day_before' }), task({ assignedToEmail: 'another@example.com' }),
    task({ id: 'task-2' }), task({ organizationId: 'company-2' }),
  ];
  const additions = collectDueTaskReminderNotifications(updatedRows, history, localDate('2026-09-30'));
  assert.equal(additions.length, updatedRows.length);
  assert.equal(new Set([...history, ...additions].map(row => row.id)).size, updatedRows.length + 1);
  assert.deepEqual(collectDueTaskReminderNotifications(updatedRows, [...history, ...additions], localDate('2026-10-01')), []);
  assert.deepEqual(collectDueTaskReminderNotifications([task({ name: 'Renamed task', message: 'Edited description' })], history, localDate('2026-09-30')), []);
});

test('deterministic reminder IDs cannot collide when organization or task IDs contain delimiters', () => {
  const rows = [task({ organizationId: 'a:b', id: 'c' }), task({ organizationId: 'a', id: 'b:c' })];
  const additions = collectDueTaskReminderNotifications(rows, [], localDate(today));
  assert.equal(additions.length, 2);
  assert.notEqual(additions[0].id, additions[1].id);
});

test('collecting returns additions only without mutating tasks, notifications, or the supplied time', () => {
  const rows = freezeDeep([task(), task({ id: 'not-due', dueDate: '2027-01-01' })]);
  const history = freezeDeep([{ id: 'existing-system-notification', name: 'History', message: 'Keep this', type: 'System', status: 'Inactive', recipientEmails: ['assignee@example.com'] }]);
  const now = localDate(today);
  const before = JSON.stringify({ rows, history, now });
  const additions = collectDueTaskReminderNotifications(rows, history, now);
  assert.equal(additions.length, 1);
  assert.equal(additions.some(row => row.id === history[0].id), false);
  assert.equal(additions[0].createdAt, now.toISOString());
  assert.equal(JSON.stringify({ rows, history, now }), before);
  assert.equal(matchesTaskQuickFilters(rows[0], { myTasks: true, period: 'Today' }, 'assignee@example.com', today), true);
  assert.equal(JSON.stringify({ rows, history, now }), before);
});
