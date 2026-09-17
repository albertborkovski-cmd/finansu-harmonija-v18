export type NotificationTab = "notifications" | "reminders";
export type TaskStatus = "Open" | "Completed" | "Cancelled";
export type TaskReminderPreset = 'none' | 'on_due_date' | '1_day_before' | '3_days_before' | '7_days_before';

export type RelatedObject = {
  id: string;
  organizationId: string;
  type: 'Document' | 'Invoice' | 'Bank operation' | 'Reconciliation' | 'Debt' | 'Counterparty' | 'Chat';
  label: string;
  /** Native record identifier; id may be namespaced to distinguish objects from different modules. */
  recordId?: string;
};

export interface OrganizationActionMetadata {
  organizationId?: string;
  organizationName?: string;
  requiresAction?: boolean;
  resolvedAt?: string;
  actionId?: string;
  relevantRoles?: string[];
  recipientEmails?: string[];
  /** Lifecycle and personal reading state are independent from legacy Active/Inactive. */
  taskStatus?: TaskStatus;
  readAtByEmail?: Record<string, string>;
  relatedObject?: RelatedObject;
}

export interface NotificationRow extends OrganizationActionMetadata {
  id: string;
  createdAt?: string;
  /** Generated signals cannot be edited or deleted from the notification center. */
  origin?: 'system' | 'manual';
  /** Primary Task that emitted this signal, separate from the Task's related business object. */
  sourceTaskId?: string;
  /** Original conversation and message identities for generated incoming-message signals. */
  sourceChatId?: string;
  sourceMessageId?: string;
  name: string;
  type: string;
  message: string;
  status: "Active" | "Inactive";
}

export interface ReminderRow extends OrganizationActionMetadata {
  id: string;
  createdAt?: string;
  name: string;
  type: string;
  daysTillRemind: string;
  message: string;
  status: "Active" | "Inactive";
  dueDate?: string;
  reminder?: TaskReminderPreset;
  assignedToId?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToAudience?: 'Internal users' | 'External users';
  source?: string;
  createdByEmail?: string;
  createdByName?: string;
}

export const SAMPLE_NOTIFICATIONS: NotificationRow[] = [
  {
    id: "1",
    origin: "system",
    name: "Payment received",
    type: "Transaction",
    message: "Your payment of $250 has been processed successfully",
    status: "Active",
  },
  {
    id: "2",
    origin: "system",
    name: "New user registered",
    type: "System",
    message: "A new user has signed up for the platform",
    status: "Active",
  },
  {
    id: "3",
    origin: "system",
    name: "Invoice overdue",
    type: "Billing",
    message: "Invoice #1042 is overdue by 5 days",
    status: "Active",
  },
  {
    id: "4",
    origin: "system",
    name: "API limit warning",
    type: "System",
    message: "API usage has reached 85% of monthly limit",
    status: "Inactive",
  },
  {
    id: "5",
    origin: "system",
    name: "Document uploaded",
    type: "Document",
    message: "New document uploaded to project workspace",
    status: "Active",
  },
];

export const SAMPLE_REMINDERS: ReminderRow[] = [
  {
    id: "1",
    name: "Monthly report",
    type: "Scheduled",
    daysTillRemind: "3",
    message: "Generate and send monthly financial report",
    status: "Active",
  },
  {
    id: "2",
    name: "License renewal",
    type: "Deadline",
    daysTillRemind: "14",
    message: "Renew software licenses before expiration",
    status: "Active",
  },
  {
    id: "3",
    name: "Team standup",
    type: "Recurring",
    daysTillRemind: "1",
    message: "Daily team standup meeting at 9:00 AM",
    status: "Active",
  },
  {
    id: "4",
    name: "Backup verification",
    type: "Maintenance",
    daysTillRemind: "7",
    message: "Verify database backup integrity",
    status: "Inactive",
  },
];

export type AttentionNotification = (NotificationRow | ReminderRow) & {
  category: NotificationTab;
};

/** Shared by Companies counts and the destination list. Do not infer actions from Active alone. */
export function getOrganizationRequiredActions(rows: AttentionNotification[], organizationId: string, session: { email: string; roleNames: string[] }): AttentionNotification[] {
  return getRelevantActions(rows, session).filter(row => row.organizationId === organizationId && requiresAction(row));
}

/** Companies counts the same visible Open Tasks as the organization-scoped Tasks tab. */
export function getOrganizationOpenTasks(rows: AttentionNotification[], organizationId: string, session: { email: string; roleNames: string[] }): AttentionNotification[] {
  if (!organizationId.trim()) return [];
  return getRelevantActionsForTab(rows.filter(row => row.organizationId === organizationId), session, 'reminders')
    .filter(row => getTaskStatus(row) === 'Open');
}

export function requiresAction(row: AttentionNotification) {
  return row.status === 'Active' && row.requiresAction === true && !row.resolvedAt;
}

function getRelevantRecords(rows: AttentionNotification[], session: { email: string; roleNames: string[] }, identity: (row: AttentionNotification) => string): AttentionNotification[] {
  const roles = new Set(session.roleNames.map(role => role.toLowerCase()));
  const unique = new Map<string, AttentionNotification>();
  for (const row of rows) {
    if (row.relevantRoles?.length && !row.relevantRoles.some(role => roles.has(role.toLowerCase()))) continue;
    if (row.recipientEmails?.length && !row.recipientEmails.some(email => email.toLowerCase() === session.email.toLowerCase())) continue;
    const key = identity(row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export function getRelevantActions(rows: AttentionNotification[], session: { email: string; roleNames: string[] }): AttentionNotification[] {
  return getRelevantRecords(rows, session, row => `${row.organizationId ?? ''}:${row.actionId || `${row.category}:${row.id}`}`);
}

/** Notifications are distinct events; Tasks and portfolio counts retain action deduplication. */
export function getRelevantActionsForTab(rows: AttentionNotification[], session: { email: string; roleNames: string[] }, tab: NotificationTab): AttentionNotification[] {
  const section = rows.filter(row => row.category === tab);
  return tab === 'notifications'
    ? getRelevantRecords(section, session, row => JSON.stringify([row.organizationId ?? '', row.id]))
    : getRelevantActions(section, session);
}

export function getTaskStatus(row: OrganizationActionMetadata & { status: string }): TaskStatus {
  if (row.taskStatus === 'Cancelled') return 'Cancelled';
  if (row.resolvedAt) return 'Completed';
  if (row.taskStatus === 'Open' || row.taskStatus === 'Completed') return row.taskStatus;
  return row.status === 'Active' ? 'Open' : 'Cancelled';
}

export function isNotificationRead(row: OrganizationActionMetadata, email: string): boolean {
  const identity = email.trim().toLowerCase();
  if (!identity) return false;
  if (Object.entries(row.readAtByEmail ?? {}).some(([recipient, readAt]) => recipient.trim().toLowerCase() === identity && Boolean(readAt))) return true;
  const signal = row as OrganizationActionMetadata & Partial<Pick<NotificationRow, 'sourceChatId' | 'sourceMessageId' | 'createdAt'>>;
  const chatId = signal.sourceChatId || (row.relatedObject?.type === 'Chat' ? row.relatedObject.recordId || row.relatedObject.id.replace(/^chat:/, '') : '');
  if (!chatId || typeof window === 'undefined') return false;
  try {
    const lastReadId = window.localStorage.getItem(`finansu-harmonija:v14:chat-read:${encodeURIComponent(identity)}:${chatId}`);
    if (!lastReadId) return false;
    const messages = JSON.parse(window.localStorage.getItem(`finansu-harmonija:v12:invoice-chat:${chatId}`) || '[]') as Array<{ id: string; sentAt?: string; timestamp?: string; date?: string }>;
    if (!Array.isArray(messages)) return false;
    const readIndex = messages.findIndex(message => message.id === lastReadId);
    if (readIndex < 0) return false;
    if (signal.sourceMessageId) {
      const index = messages.findIndex(message => message.id === signal.sourceMessageId);
      return index >= 0 && index <= readIndex;
    }
    // Legacy thread-level signals have no message ID. Never dismiss a newer signal.
    const readAt = Date.parse(messages[readIndex].sentAt || messages[readIndex].timestamp || messages[readIndex].date || '');
    return readIndex === messages.length - 1 && (!signal.createdAt || Date.parse(signal.createdAt) <= readAt);
  } catch { return false; }
}

export function setNotificationRead<T extends OrganizationActionMetadata>(row: T, email: string, read: boolean, now = new Date().toISOString()): T {
  const identity = email.trim().toLowerCase();
  if (!identity) return row;
  const readAtByEmail = Object.fromEntries(Object.entries(row.readAtByEmail ?? {}).filter(([recipient]) => recipient.trim().toLowerCase() !== identity));
  if (read) readAtByEmail[identity] = now;
  return { ...row, readAtByEmail };
}

export function setTaskStatus<T extends OrganizationActionMetadata & { status: 'Active' | 'Inactive' }>(row: T, taskStatus: TaskStatus, now = new Date().toISOString()): T {
  return { ...row, taskStatus, status: taskStatus === 'Open' ? 'Active' : 'Inactive', resolvedAt: taskStatus === 'Open' ? undefined : now };
}

/** Counts cover all permission-visible records, independent of search, filters and loaded rows. */
export function getNotificationTabCounts(rows: AttentionNotification[], session: { email: string; roleNames: string[] }): Record<NotificationTab, number> {
  return {
    notifications: getRelevantActionsForTab(rows, session, 'notifications').filter(row => !isNotificationRead(row, session.email)).length,
    reminders: getRelevantActionsForTab(rows, session, 'reminders').filter(row => getTaskStatus(row) === 'Open').length,
  };
}

export function getAttentionNotifications(
  notifications: NotificationRow[],
  reminders: ReminderRow[],
  includeInactive = false,
): AttentionNotification[] {
  return [
    ...notifications.map(row => ({ ...row, category: "notifications" as const })),
    ...reminders.map(row => ({ ...row, category: "reminders" as const })),
  ]
    .filter(row => includeInactive || row.status === "Active")
    .map((row, index) => ({
      row,
      index,
      timestamp: Date.parse(row.createdAt ?? "") ||
        Number(row.id.match(/-(\d{13})$/)?.[1]) || 0,
    }))
    .sort((a, b) => b.timestamp - a.timestamp || b.index - a.index)
    .map(item => item.row);
}
