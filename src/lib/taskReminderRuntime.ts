import { SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS, type NotificationRow, type ReminderRow } from './notifications';
import { collectDueTaskReminderNotifications } from './taskSchedule';

const NOTIFICATIONS_KEY = 'finansu-harmonija:v7:notifications';
const TASKS_KEY = 'finansu-harmonija:v7:reminders';
const DELIVERED_KEY = 'finansu-harmonija:v15:task-reminder-deliveries';
const CHANGED_EVENT = 'finansu-harmonija:persistent-state-changed';
type ReminderStorage = Pick<Storage, 'getItem' | 'setItem'>;

function readRows<T>(storage: ReminderStorage, key: string, fallback: T[]): T[] {
  const stored = storage.getItem(key);
  const rows: unknown = stored === null ? fallback : JSON.parse(stored);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string')) {
    throw new Error('Unable to read task reminder records.');
  }
  return rows as T[];
}

/** Append reminders without changing tasks, reading receipts or existing notifications. */
export function processTaskReminders(storage: ReminderStorage, now = new Date()): number {
  const tasks = readRows<ReminderRow>(storage, TASKS_KEY, SAMPLE_REMINDERS);
  const notifications = readRows<NotificationRow>(storage, NOTIFICATIONS_KEY, SAMPLE_NOTIFICATIONS);
  const savedDeliveries = storage.getItem(DELIVERED_KEY);
  const deliveryIds: unknown = savedDeliveries === null ? [] : JSON.parse(savedDeliveries);
  if (!Array.isArray(deliveryIds) || deliveryIds.some(id => typeof id !== 'string')) throw new Error('Unable to read task reminder delivery history.');
  const delivered = new Set<string>(deliveryIds);
  const additions = collectDueTaskReminderNotifications(tasks, notifications, now).filter(notification => !delivered.has(notification.id));
  if (additions.length) storage.setItem(NOTIFICATIONS_KEY, JSON.stringify([...notifications, ...additions]));
  // Keep delivery history separately so reading or deleting a notification cannot resend it.
  for (const notification of [...notifications, ...additions]) {
    if (notification.id.startsWith('task-reminder:')) delivered.add(notification.id);
  }
  if (delivered.size !== deliveryIds.length) storage.setItem(DELIVERED_KEY, JSON.stringify([...delivered]));
  return additions.length;
}

let subscriptions = 0;
let stopScheduler: (() => void) | undefined;

/** One browser-local scheduler shared by all notification readers; catches up on return. */
export function startTaskReminderScheduler(): () => void {
  subscriptions += 1;
  if (!stopScheduler) {
    let running = false;
    let reportedError = false;
    const refresh = () => {
      if (running) return;
      running = true;
      try {
        if (processTaskReminders(window.localStorage)) {
          window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { storageKey: NOTIFICATIONS_KEY } }));
        }
        reportedError = false;
      } catch (error) {
        if (!reportedError) console.error('Task reminders could not be synchronized.', error);
        reportedError = true;
      } finally {
        running = false;
      }
    };
    const recordsChanged = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<{ storageKey?: string }>).detail?.storageKey;
      if (!key || key === TASKS_KEY || key === NOTIFICATIONS_KEY) refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', recordsChanged);
    window.addEventListener(CHANGED_EVENT, recordsChanged);
    stopScheduler = () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', recordsChanged);
      window.removeEventListener(CHANGED_EVENT, recordsChanged);
      stopScheduler = undefined;
    };
    refresh();
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscriptions -= 1;
    if (!subscriptions) stopScheduler?.();
  };
}
