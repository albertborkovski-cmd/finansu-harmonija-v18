import {
  getRelevantActions,
  getRelevantActionsForTab,
  getTaskStatus,
  isNotificationRead,
  requiresAction,
  type AttentionNotification,
  type ReminderRow,
} from './notifications';
import { collectDueTaskReminderNotifications } from './taskSchedule';

/**
 * One source for the dashboard list and its red navigation badge.
 * Every visible Open task needs attention, including Upcoming tasks before
 * their reminder date. The legacy requiresAction flag applies to notifications,
 * not the task lifecycle.
 * A reminder is a new unread alert, not a second company action. Deriving its
 * current identity also supports reminders delivered before this selector existed.
 * Closed, removed, rescheduled, or reassigned tasks cannot keep stale alerts active.
 * The original notification remains in history, with its reading state intact.
 */
export function getDashboardAttentionNotifications(
  rows: AttentionNotification[],
  session: { email: string; roleNames: string[] },
  now = new Date(),
): AttentionNotification[] {
  const tasks: ReminderRow[] = getRelevantActionsForTab(rows, session, 'reminders').map(row => ({
    ...row,
    daysTillRemind: 'daysTillRemind' in row ? row.daysTillRemind : '',
  }));
  const currentReminderIds = new Set(collectDueTaskReminderNotifications(tasks, [], now).map(row => row.id));
  return getRelevantActions(rows.filter(row => {
    if (row.category === 'reminders') return getTaskStatus(row) === 'Open';
    if (row.category === 'notifications' && row.id.startsWith('task-reminder:')) {
      return currentReminderIds.has(row.id) && row.status === 'Active' && !row.resolvedAt
        && !isNotificationRead(row, session.email);
    }
    if (row.category === 'notifications' && (row.relatedObject?.type === 'Chat' || ('sourceChatId' in row && row.sourceChatId))) {
      return requiresAction(row) && !isNotificationRead(row, session.email);
    }
    return requiresAction(row);
  }), session);
}
