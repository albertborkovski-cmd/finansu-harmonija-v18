export type NotificationTab = "notifications" | "reminders";

export interface OrganizationActionMetadata {
  organizationId?: string;
  organizationName?: string;
  requiresAction?: boolean;
  resolvedAt?: string;
  actionId?: string;
  relevantRoles?: string[];
  recipientEmails?: string[];
}

export interface NotificationRow extends OrganizationActionMetadata {
  id: string;
  createdAt?: string;
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
}

export const SAMPLE_NOTIFICATIONS: NotificationRow[] = [
  {
    id: "1",
    name: "Payment received",
    type: "Transaction",
    message: "Your payment of $250 has been processed successfully",
    status: "Active",
  },
  {
    id: "2",
    name: "New user registered",
    type: "System",
    message: "A new user has signed up for the platform",
    status: "Active",
  },
  {
    id: "3",
    name: "Invoice overdue",
    type: "Billing",
    message: "Invoice #1042 is overdue by 5 days",
    status: "Active",
  },
  {
    id: "4",
    name: "API limit warning",
    type: "System",
    message: "API usage has reached 85% of monthly limit",
    status: "Inactive",
  },
  {
    id: "5",
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

export function requiresAction(row: AttentionNotification) {
  return row.status === 'Active' && row.requiresAction === true && !row.resolvedAt;
}

export function getRelevantActions(rows: AttentionNotification[], session: { email: string; roleNames: string[] }): AttentionNotification[] {
  const roles = new Set(session.roleNames.map(role => role.toLowerCase()));
  const unique = new Map<string, AttentionNotification>();
  for (const row of rows) {
    if (row.relevantRoles?.length && !row.relevantRoles.some(role => roles.has(role.toLowerCase()))) continue;
    if (row.recipientEmails?.length && !row.recipientEmails.some(email => email.toLowerCase() === session.email.toLowerCase())) continue;
    const key = `${row.organizationId ?? ''}:${row.actionId || `${row.category}:${row.id}`}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
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
