import { canViewMenu, isSystemAdministratorRole, type AppSession } from './accessControl';
import { getRelevantActionsForTab, getTaskStatus, setTaskStatus, type ReminderRow } from './notifications';

export type TaskPermissions = { edit: boolean; complete: boolean; cancel: boolean };
export type TaskTransitionAction = 'complete' | 'cancel';

const normalizeEmail = (email?: string) => email?.trim().toLowerCase() ?? '';

/** Organization visibility is checked by the caller; action visibility depends on identity, not lifecycle. */
export function getTaskActionVisibility(task: ReminderRow, session: AppSession): TaskPermissions {
  const email = normalizeEmail(session.email);
  const visible = email && canViewMenu(session, 'notifications') && getRelevantActionsForTab([{
    ...task,
    category: 'reminders',
    recipientEmails: task.recipientEmails?.map(normalizeEmail),
    relevantRoles: task.relevantRoles?.map(role => role.trim()),
  }], {
    email,
    roleNames: session.roleNames.map(role => role.trim()).filter(Boolean),
  }, 'reminders').length > 0;
  if (!visible) return { edit: false, complete: false, cancel: false };

  const administrator = session.roleNames.some(isSystemAdministratorRole);
  const creator = email === normalizeEmail(task.createdByEmail);
  const assignee = email === normalizeEmail(task.assignedToEmail);
  return {
    edit: creator || administrator,
    complete: assignee || administrator,
    cancel: creator || administrator,
  };
}

/** Terminal actions remain visible to eligible users, but only Open tasks can transition. */
export function getTaskPermissions(task: ReminderRow, session: AppSession): TaskPermissions {
  const visible = getTaskActionVisibility(task, session);
  const open = getTaskStatus(task) === 'Open';
  return {
    edit: visible.edit,
    complete: visible.complete && open,
    cancel: visible.cancel && open,
  };
}

/** Terminal transitions preserve the task as history; this API never reopens or deletes records. */
export function transitionTask(task: ReminderRow, session: AppSession, action: TaskTransitionAction, now = new Date().toISOString()): ReminderRow {
  if (action !== 'complete' && action !== 'cancel') throw new Error('Unsupported task action.');
  if (!getTaskPermissions(task, session)[action]) {
    throw new Error(`You do not have permission to ${action} this task, or it is no longer Open.`);
  }
  return { ...setTaskStatus(task, action === 'complete' ? 'Completed' : 'Cancelled', now), requiresAction: false };
}
