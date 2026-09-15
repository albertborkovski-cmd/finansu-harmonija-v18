import { getTaskStatus, type NotificationRow, type ReminderRow, type TaskReminderPreset } from './notifications';

export const TASK_REMINDER_OPTIONS: { value: TaskReminderPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'on_due_date', label: 'On due date' },
  { value: '1_day_before', label: '1 day before' },
  { value: '3_days_before', label: '3 days before' },
  { value: '7_days_before', label: '7 days before' },
];

export type TaskQuickPeriod = 'Overdue' | 'Today' | 'Upcoming' | 'Completed';
export type TaskQuickFilters = { myTasks: boolean; period: TaskQuickPeriod | null };

const REMINDER_DAYS: Partial<Record<TaskReminderPreset, number>> = {
  on_due_date: 0, '1_day_before': 1, '3_days_before': 3, '7_days_before': 7,
};

/** Calendar dates follow the user's local day, not the UTC date of the same instant. */
export function getLocalDateKey(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) return '';
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseCalendarDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function getTaskDueGroup(task: ReminderRow, today = getLocalDateKey()): Exclude<TaskQuickPeriod, 'Completed'> | null {
  if (getTaskStatus(task) !== 'Open' || !parseCalendarDate(task.dueDate) || !parseCalendarDate(today)) return null;
  return task.dueDate! < today ? 'Overdue' : task.dueDate === today ? 'Today' : 'Upcoming';
}

/** Apply these after permission scoping; no selected filters means every visible task is included. */
export function matchesTaskQuickFilters(task: ReminderRow, filters: TaskQuickFilters, email: string, today = getLocalDateKey()): boolean {
  const identity = email.trim().toLowerCase();
  if (filters.myTasks && (!identity || task.assignedToEmail?.trim().toLowerCase() !== identity)) return false;
  if (!filters.period) return true;
  return filters.period === 'Completed'
    ? getTaskStatus(task) === 'Completed'
    : getTaskDueGroup(task, today) === filters.period;
}

/** Return additions only; callers persist these alongside all existing notifications and task history. */
export function collectDueTaskReminderNotifications(tasks: ReminderRow[], existingNotifications: NotificationRow[], now = new Date()): NotificationRow[] {
  const today = getLocalDateKey(now);
  const todayDate = parseCalendarDate(today);
  if (!todayDate) return [];
  const seen = new Set(existingNotifications.map(notification => notification.id));
  const additions: NotificationRow[] = [];
  for (const task of tasks) {
    const daysBefore = task.reminder && REMINDER_DAYS[task.reminder];
    const dueDate = parseCalendarDate(task.dueDate);
    const recipient = task.assignedToEmail?.trim().toLowerCase();
    if (getTaskStatus(task) !== 'Open' || typeof daysBefore !== 'number' || !dueDate || !recipient || !task.organizationId?.trim() || !task.id.trim()) continue;
    if (task.recipientEmails?.length && !task.recipientEmails.some(email => email.trim().toLowerCase() === recipient)) continue;

    // UTC is used only for date arithmetic, so DST changes cannot shorten or extend a reminder day.
    const reminderDate = new Date(dueDate);
    reminderDate.setUTCDate(reminderDate.getUTCDate() - daysBefore);
    if (todayDate.getTime() < reminderDate.getTime()) continue;

    const id = `task-reminder:${[task.organizationId, task.id, recipient, task.dueDate!, task.reminder!].map(encodeURIComponent).join(':')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = task.name.trim() || task.id;
    const dueGroup = getTaskDueGroup(task, today);
    const timing = dueGroup === 'Overdue' ? 'is overdue' : dueGroup === 'Today' ? 'is due today' : 'is upcoming';
    additions.push({
      id,
      origin: 'system',
      name: `Task reminder: ${name} — due ${task.dueDate}`,
      type: 'System',
      message: `${name} ${timing} (due ${task.dueDate}).`,
      status: 'Active',
      createdAt: now.toISOString(),
      organizationId: task.organizationId,
      organizationName: task.organizationName,
      sourceTaskId: task.id,
      relatedObject: task.relatedObject?.organizationId === task.organizationId ? { ...task.relatedObject } : undefined,
      recipientEmails: [recipient],
      relevantRoles: task.relevantRoles ? [...task.relevantRoles] : undefined,
      requiresAction: false,
    });
  }
  return additions;
}
