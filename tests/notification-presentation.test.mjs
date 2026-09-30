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
const { createNotificationColumns, formatNotificationAge, formatNotificationDateTime, notificationMessage, isSystemNotification, getNotificationActionLabel, getNotificationSourceTaskId, getNotificationRelatedObjectLabel } = await import(moduleUrl(transpile('../src/lib/notificationPresentation.ts')));

test('relative registration age handles minutes, hours, days and missing dates without inventing timestamps', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  for (const [minutes, expected] of [[0, 'Just now'], [10, '10 min ago'], [18, '18 min ago'], [25, '25 min ago'], [32, '32 min ago'], [60, '1 hour ago'], [120, '2 hours ago'], [1440, '1 day ago'], [2880, '2 days ago']]) {
    assert.equal(formatNotificationAge({ id: 'example', createdAt: new Date(now - minutes * 60000).toISOString() }, now), expected);
  }
  assert.equal(formatNotificationAge({ id: `notification-${now - 600000}` }, now), '10 min ago');
  assert.equal(formatNotificationAge({ id: 'legacy' }, now), '—');
  assert.equal(formatNotificationAge({ id: 'invalid', createdAt: 'invalid' }, now), '—');
  assert.equal(formatNotificationAge({ id: 'future', createdAt: new Date(now + 60000).toISOString() }, now), 'Just now');
});
const notificationsUrl = moduleUrl(transpile('../src/lib/notifications.ts'));
const { SAMPLE_NOTIFICATIONS, isNotificationRead, setNotificationRead } = await import(notificationsUrl);
const scheduleUrl = moduleUrl(transpile('../src/lib/taskSchedule.ts').replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl)));
const { collectDueTaskReminderNotifications } = await import(scheduleUrl);

const legacyId = (values = ['company-1', 'task-1', 'assignee@example.com', '2026-09-15', 'on_due_date']) => `task-reminder:${values.map(encodeURIComponent).join(':')}`;

test('notification data columns exclude the contextual action rendered as a row button', () => {
  assert.deepEqual(createNotificationColumns(), [
    { key: 'type', label: 'Module', width: 140, visible: true },
    { key: 'message', label: 'Message', width: 380, visible: true },
    { key: 'organization', label: 'Organization', width: 220, visible: true },
    { key: 'createdAt', label: 'Time', width: 180, visible: true },
    { key: 'severity', label: 'Severity', width: 120, visible: true },
    { key: 'status', label: 'Resolved/Active', width: 150, visible: true },
    { key: 'relatedObject', label: 'Related object', width: 240, visible: true },
  ]);
});

test('related object displays its number or name and never a generic action label', () => {
  const row = { id: 'n1', organizationId: 'company-1', relatedObject: { id: 'invoice-1', recordId: 'record-1', organizationId: 'company-1', type: 'Invoice', label: ' INV-2026-001 ' } };
  assert.equal(getNotificationRelatedObjectLabel(row), 'INV-2026-001');
  assert.equal(getNotificationRelatedObjectLabel({ ...row, relatedObject: { ...row.relatedObject, label: '' } }), 'record-1');
  assert.equal(getNotificationRelatedObjectLabel({ ...row, organizationId: 'company-2' }), '—');
  assert.equal(getNotificationRelatedObjectLabel({ id: 'n1', organizationId: 'company-1' }), '—');
});

test('task signals show the primary task name within the same organization', () => {
  const row = { id: 'n1', sourceTaskId: 'task-1', organizationId: 'company-1' };
  const tasks = [{ id: 'task-1', organizationId: 'company-2', name: 'Other company task' }, { id: 'task-1', organizationId: 'company-1', name: 'Review INV-001' }];
  assert.equal(getNotificationRelatedObjectLabel(row, tasks), 'Review INV-001');
  assert.equal(getNotificationRelatedObjectLabel(row, tasks.slice(0, 1)), 'task-1');
});

test('organization context hides only the redundant organization column', () => {
  const global = createNotificationColumns();
  assert.deepEqual(createNotificationColumns(true), global.map(column => column.key === 'organization' ? { ...column, visible: false } : column));
  const edited = createNotificationColumns();
  edited[0].visible = false;
  edited[1].width = 999;
  assert.deepEqual(createNotificationColumns(), global);
});

test('notification timestamps use local calendar date and minute precision', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Vilnius';
    assert.equal(formatNotificationDateTime({ id: 'n1', createdAt: '2026-09-14T22:30:45.123Z' }), '2026-09-15 01:30');
    process.env.TZ = 'America/New_York';
    assert.equal(formatNotificationDateTime({ id: 'n1', createdAt: '2026-09-15T01:30:45.123Z' }), '2026-09-14 21:30');
    process.env.TZ = 'UTC';
    assert.equal(formatNotificationDateTime({ id: 'n1', createdAt: '1970-01-01T00:00:00.000Z' }), '1970-01-01 00:00');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('legacy ID timestamps are used only when createdAt is missing', () => {
  const timestamp = Date.parse('2026-09-15T09:05:00Z');
  const id = `notification-${timestamp}`;
  const expected = formatNotificationDateTime({ id: 'n1', createdAt: '2026-09-15T09:05:00Z' });
  assert.equal(formatNotificationDateTime({ id }), expected);
  assert.equal(formatNotificationDateTime({ id, createdAt: '   ' }), expected);
  assert.equal(formatNotificationDateTime({ id, createdAt: 'invalid-date' }), '—');
  for (const missing of ['1', 'notification', `notification-${timestamp}x`, 'notification-123456789012']) {
    assert.equal(formatNotificationDateTime({ id: missing }), '—');
  }
});

test('message is the signal text with a safe legacy name fallback', () => {
  assert.equal(notificationMessage({ message: '  Invoice processing completed.  ', name: 'Old title' }), 'Invoice processing completed.');
  assert.equal(notificationMessage({ message: ' \n ', name: '  Legacy notification  ' }), 'Legacy notification');
  assert.equal(notificationMessage({ message: '', name: '' }), '—');
  assert.equal(notificationMessage({}), '—');
});

test('system provenance and source evidence protect notifications regardless of displayed type or legacy ID', () => {
  const manualId = 'notification-1789463100000';
  for (const row of [
    { id: manualId, origin: 'system', type: 'Billing' },
    { id: manualId, sourceTaskId: 'task-1', type: 'Document' },
    { id: manualId, origin: 'manual', sourceTaskId: 'task-1' },
    { id: manualId, origin: 'manual', sourceChatId: 'chat-1' },
    { id: manualId, origin: 'manual', sourceMessageId: 'message-1' },
    { id: 'chat-message:legacy', origin: 'manual' },
    { id: legacyId() },
    { id: legacyId(), origin: 'manual' },
    { id: 'task-reminder:malformed', origin: 'manual' },
    { id: 'task-reminder:', origin: 'manual' },
    { id: 'generated', sourceTaskId: 'task-1', organizationId: undefined },
  ]) {
    assert.equal(isSystemNotification(Object.freeze(row)), true, JSON.stringify(row));
  }
});

test('explicit manual and exact legacy manual IDs remain editable without strong generated evidence', () => {
  for (const row of [
    { id: 'manual-notification', origin: 'manual' },
    { id: 'manual-notification', origin: 'manual', type: 'System' },
    { id: 'notification-1789463100000' },
    { id: 'notification-1789463100000', type: 'System' },
    { id: 'notification-1789463100000', sourceTaskId: '   ' },
  ]) {
    assert.equal(isSystemNotification(Object.freeze(row)), false, JSON.stringify(row));
  }
});

test('unknown and ambiguous legacy notifications fail closed as system signals', () => {
  for (const id of ['', '1', 'imported-event', 'notification-123', 'notification-178946310000', 'notification-17894631000000', 'prefix-notification-1789463100000', 'notification-1789463100000x']) {
    assert.equal(isSystemNotification({ id }), true, id);
  }
  assert.equal(SAMPLE_NOTIFICATIONS.length, 5);
  for (const row of SAMPLE_NOTIFICATIONS) {
    assert.equal(row.origin, 'system');
    assert.equal(isSystemNotification(row), true);
    const { origin, ...legacySample } = row;
    assert.equal(isSystemNotification(legacySample), true, 'Persisted samples without origin remain protected');
  }
});

test('contextual action labels cover every supported business object', () => {
  for (const type of ['Chat', 'Document', 'Invoice', 'Bank operation', 'Reconciliation', 'Debt', 'Counterparty']) {
    const row = Object.freeze({
      id: 'generated-event', organizationId: 'company-1',
      relatedObject: Object.freeze({ id: 'object-1', organizationId: 'company-1', type, label: 'Primary record' }),
    });
    assert.equal(getNotificationActionLabel(row), `Open ${type.toLowerCase()}`);
  }
});

test('missing or cross-organization related objects do not fabricate navigation actions', () => {
  const relatedObject = { id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice 1' };
  for (const row of [
    { id: 'n1', organizationId: 'company-1' },
    { id: 'n1', relatedObject },
    { id: 'n1', organizationId: 'company-2', relatedObject },
    { id: 'n1', organizationId: '', relatedObject: { ...relatedObject, organizationId: '' } },
    { id: 'n1', organizationId: '  ', relatedObject: { ...relatedObject, organizationId: '  ' } },
    { id: 'n1', sourceTaskId: 'task-1' },
    { id: legacyId(), organizationId: 'company-other' },
    { id: 'task-reminder:malformed', organizationId: 'company-1' },
  ]) {
    assert.equal(getNotificationActionLabel(row), undefined, JSON.stringify(row));
  }
});

test('source Task produces exactly one primary action even when another related business object exists', () => {
  for (const type of ['Chat', 'Document', 'Invoice', 'Bank operation', 'Reconciliation', 'Debt', 'Counterparty']) {
    const relatedObject = Object.freeze({ id: 'object-1', organizationId: 'company-1', type, label: 'Related business object' });
    for (const source of [{ id: 'generated-task-event', sourceTaskId: 'task-current' }, { id: legacyId() }]) {
      const row = Object.freeze({ ...source, organizationId: 'company-1', relatedObject });
      assert.equal(getNotificationActionLabel(row), 'Open task');
      assert.notEqual(getNotificationActionLabel(row), `Open ${type.toLowerCase()}`);
    }
  }
  assert.equal(getNotificationActionLabel({
    id: 'generated-task-event', sourceTaskId: 'task-current', organizationId: 'company-1',
    relatedObject: { id: 'invoice-1', organizationId: 'company-other', type: 'Invoice', label: 'Other organization' },
  }), 'Open task');
});

test('system signals retain personal read and unread operations without mutating their source data', () => {
  const task = Object.freeze({
    id: 'task-1', organizationId: 'company-1', assignedToEmail: 'assignee@example.com',
    name: 'Review invoice', type: 'Review', message: 'Review tax amounts', status: 'Active',
    taskStatus: 'Open', daysTillRemind: '', dueDate: '2026-09-15', reminder: 'on_due_date',
    relatedObject: Object.freeze({ id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice 1' }),
  });
  const [generated] = collectDueTaskReminderNotifications([task], [], new Date(2026, 8, 15, 12));
  const notification = Object.freeze({ ...generated, readAtByEmail: Object.freeze({ 'other@example.com': '2026-09-15T08:00:00Z' }) });
  const originalTask = JSON.stringify(task);
  const originalNotification = JSON.stringify(notification);
  assert.equal(isSystemNotification(notification), true);
  const read = setNotificationRead(notification, 'ASSIGNEE@example.com', true, '2026-09-15T09:00:00Z');
  assert.equal(isNotificationRead(read, 'assignee@example.com'), true);
  assert.equal(isNotificationRead(read, 'other@example.com'), true);
  assert.equal(isSystemNotification(read), true);
  assert.equal(getNotificationActionLabel(read), 'Open task');
  const unread = setNotificationRead(read, 'assignee@example.com', false);
  assert.equal(isNotificationRead(unread, 'assignee@example.com'), false);
  assert.equal(isNotificationRead(unread, 'other@example.com'), true);
  assert.deepEqual(unread, notification);
  assert.equal(JSON.stringify(notification), originalNotification);
  assert.equal(JSON.stringify(task), originalTask);
});

test('explicit source Task metadata takes precedence and requires an organization scope', () => {
  assert.equal(getNotificationSourceTaskId({ id: legacyId(), organizationId: 'company-1', sourceTaskId: 'task-current' }), 'task-current');
  assert.equal(getNotificationSourceTaskId({ id: 'task-created', organizationId: 'company-1', sourceTaskId: 'task-1' }), 'task-1');
  assert.equal(getNotificationSourceTaskId({ id: 'task-created', sourceTaskId: 'task-1' }), undefined);
  assert.equal(getNotificationSourceTaskId({ id: legacyId(), organizationId: '   ', sourceTaskId: 'task-1' }), undefined);
  assert.equal(getNotificationSourceTaskId({ id: legacyId(), organizationId: 'company-1', sourceTaskId: '  ' }), 'task-1');
});

test('legacy Task reminders decode exact native identity and matching organization', () => {
  const values = ['company:1/ä', 'task:2/% č', 'assignee@example.com', '2026-09-15', '3_days_before'];
  assert.equal(getNotificationSourceTaskId({ id: legacyId(values), organizationId: values[0] }), values[1]);
  assert.equal(getNotificationSourceTaskId({ id: legacyId(values), organizationId: 'company-other' }), undefined);
  for (const reminder of ['on_due_date', '1_day_before', '3_days_before', '7_days_before']) {
    assert.equal(getNotificationSourceTaskId({ id: legacyId(['company-1', 'task-1', 'user@example.com', '2026-09-15', reminder]), organizationId: 'company-1' }), 'task-1');
  }
});

test('malformed or incomplete legacy identities are not routed to a Task', () => {
  const invalidIds = [
    'other:company-1:task-1:user@example.com:2026-09-15:on_due_date',
    'task-reminder:company-1:task-1',
    `${legacyId()}:extra`,
    'task-reminder:company-1:%ZZ:user@example.com:2026-09-15:on_due_date',
    legacyId(['company-1', '', 'user@example.com', '2026-09-15', 'on_due_date']),
    legacyId(['company-1', '   ', 'user@example.com', '2026-09-15', 'on_due_date']),
    legacyId(['company-1', 'task-1', '  ', '2026-09-15', 'on_due_date']),
    legacyId(['company-1', 'task-1', 'user@example.com', '2026-02-30', 'on_due_date']),
    legacyId(['company-1', 'task-1', 'user@example.com', 'not-a-date', 'on_due_date']),
    legacyId(['company-1', 'task-1', 'user@example.com', '2026-09-15', 'none']),
    legacyId(['company-1', 'task-1', 'user@example.com', '2026-09-15', 'unsupported']),
  ];
  for (const id of invalidIds) assert.equal(getNotificationSourceTaskId({ id, organizationId: 'company-1' }), undefined, id);
});

test('fresh and legacy reminders open the same source Task without modifying original records', () => {
  const relatedObject = Object.freeze({ id: 'invoice-1', organizationId: 'company-1', type: 'Invoice', label: 'Invoice 1' });
  const task = Object.freeze({ id: 'task-1', organizationId: 'company-1', assignedToEmail: 'assignee@example.com', name: 'Review invoice', type: 'Review', message: 'Review tax amounts', status: 'Active', taskStatus: 'Open', daysTillRemind: '', dueDate: '2026-09-15', reminder: 'on_due_date', relatedObject });
  const [notification] = collectDueTaskReminderNotifications([task], [], new Date(2026, 8, 15, 12));
  const before = JSON.stringify(notification);
  assert.equal(notification.sourceTaskId, task.id);
  assert.equal(getNotificationSourceTaskId(notification), task.id);
  const { sourceTaskId, ...legacy } = notification;
  assert.equal(getNotificationSourceTaskId(legacy), task.id);
  assert.deepEqual(notification.relatedObject, relatedObject);
  assert.equal(JSON.stringify(notification), before);
  assert.equal(task.relatedObject.id, 'invoice-1');
});
