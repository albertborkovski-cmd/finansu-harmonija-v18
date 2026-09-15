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
const runtimeUrl = moduleUrl(transpile('../src/lib/taskReminderRuntime.ts')
  .replace(/(['"])\.\/notifications\1/g, JSON.stringify(notificationsUrl))
  .replace(/(['"])\.\/taskSchedule\1/g, JSON.stringify(scheduleUrl)));
const { processTaskReminders, startTaskReminderScheduler } = await import(runtimeUrl);
const TASKS = 'finansu-harmonija:v7:reminders';
const NOTIFICATIONS = 'finansu-harmonija:v7:notifications';
const DELIVERIES = 'finansu-harmonija:v15:task-reminder-deliveries';
const now = new Date(2026, 8, 15, 12);
const task = patch => ({ id: 'task-1', name: 'Review documents', type: 'Review', status: 'Active', taskStatus: 'Open',
  daysTillRemind: '', dueDate: '2026-09-15', reminder: 'on_due_date', assignedToEmail: 'person@example.com',
  organizationId: 'org-1', requiresAction: true, message: '', ...patch });
function storage(tasks = [task()], notifications = []) {
  const values = new Map([[TASKS, JSON.stringify(tasks)], [NOTIFICATIONS, JSON.stringify(notifications)]]);
  const writes = [];
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push(key); values.set(key, value); }, values, writes };
}

test('runtime appends one notification, preserves task bytes and all existing notification metadata', () => {
  const existing = { id: 'old', name: 'Old notification', status: 'Inactive', type: 'System', message: 'Keep', readAtByEmail: { 'person@example.com': '2026-09-01' } };
  const db = storage([task()], [existing]);
  const before = db.getItem(TASKS);
  assert.equal(processTaskReminders(db, now), 1);
  assert.equal(db.getItem(TASKS), before);
  assert.deepEqual(JSON.parse(db.getItem(NOTIFICATIONS))[0], existing);
  assert.equal(JSON.parse(db.getItem(NOTIFICATIONS)).length, 2);
  assert.equal(JSON.parse(db.getItem(DELIVERIES)).length, 1);
  const writes = db.writes.length;
  assert.equal(processTaskReminders(db, now), 0);
  assert.equal(db.writes.length, writes);
});

test('notification deletion and repeated polls do not resend a delivered reminder', () => {
  const db = storage();
  processTaskReminders(db, now);
  db.setItem(NOTIFICATIONS, '[]');
  assert.equal(processTaskReminders(db, new Date(2026, 8, 16)), 0);
  assert.deepEqual(JSON.parse(db.getItem(NOTIFICATIONS)), []);
});

test('changed due date schedules a new reminder while retaining delivery history', () => {
  const db = storage();
  processTaskReminders(db, now);
  db.setItem(TASKS, JSON.stringify([task({ dueDate: '2026-09-16' })]));
  assert.equal(processTaskReminders(db, now), 0);
  assert.equal(processTaskReminders(db, new Date(2026, 8, 16)), 1);
  assert.equal(JSON.parse(db.getItem(DELIVERIES)).length, 2);
});

test('runtime catches up after absence but never sends for completed, cancelled or None tasks', () => {
  const db = storage([task(), task({ id: 'closed', taskStatus: 'Completed' }), task({ id: 'cancelled', taskStatus: 'Cancelled' }), task({ id: 'none', reminder: 'none' })]);
  assert.equal(processTaskReminders(db, new Date(2026, 9, 1)), 1);
  assert.match(JSON.parse(db.getItem(NOTIFICATIONS))[0].message, /overdue/);
});

test('malformed task, notification or delivery storage fails without overwriting any records', () => {
  for (const [key, value] of [[TASKS, '{broken'], [TASKS, '[null]'], [NOTIFICATIONS, '{}'], [DELIVERIES, '[1]']]) {
    const db = storage();
    db.values.set(key, value);
    const before = [...db.values];
    assert.throws(() => processTaskReminders(db, now));
    assert.deepEqual([...db.values], before);
    assert.deepEqual(db.writes, []);
  }
});

test('legacy tasks without an explicit reminder produce no writes', () => {
  const db = storage([task({ reminder: undefined, daysTillRemind: '3' })]);
  assert.equal(processTaskReminders(db, now), 0);
  assert.deepEqual(db.writes, []);
});

test('scheduler shares one timer and removes listeners after the final subscriber', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousStorageEvent = globalThis.StorageEvent;
  const previousCustomEvent = globalThis.CustomEvent;
  const fakeWindow = new EventTarget();
  const fakeDocument = new EventTarget();
  const timers = new Set();
  fakeWindow.localStorage = storage([task({ dueDate: '2000-01-01' })]);
  fakeWindow.setInterval = callback => { timers.add(callback); return callback; };
  fakeWindow.clearInterval = callback => timers.delete(callback);
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;
  globalThis.StorageEvent = class extends Event {};
  globalThis.CustomEvent = class extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } };
  let stopFirst, stopSecond;
  try {
    stopFirst = startTaskReminderScheduler();
    stopSecond = startTaskReminderScheduler();
    assert.equal(timers.size, 1);
    assert.equal(JSON.parse(fakeWindow.localStorage.getItem(NOTIFICATIONS)).length, 1);
    fakeWindow.dispatchEvent(new Event('finansu-harmonija:persistent-state-changed'));
    fakeWindow.dispatchEvent(new Event('focus'));
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    assert.equal(JSON.parse(fakeWindow.localStorage.getItem(NOTIFICATIONS)).length, 1);
    stopFirst(); stopFirst();
    assert.equal(timers.size, 1);
    stopSecond();
    assert.equal(timers.size, 0);
    fakeWindow.localStorage.setItem(TASKS, JSON.stringify([task({ id: 'new', dueDate: '2000-01-01' })]));
    fakeWindow.dispatchEvent(new Event('focus'));
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    assert.equal(JSON.parse(fakeWindow.localStorage.getItem(NOTIFICATIONS)).length, 1);
  } finally {
    stopFirst?.(); stopSecond?.();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.StorageEvent = previousStorageEvent;
    globalThis.CustomEvent = previousCustomEvent;
  }
});
