export type NotificationTab = "notifications" | "reminders";

export interface NotificationRow {
  id: string;
  createdAt?: string;
  name: string;
  type: string;
  message: string;
  status: "Active" | "Inactive";
}

export interface ReminderRow {
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

export function getAttentionNotifications(
  notifications: NotificationRow[],
  reminders: ReminderRow[],
): AttentionNotification[] {
  return [
    ...notifications.map(row => ({ ...row, category: "notifications" as const })),
    ...reminders.map(row => ({ ...row, category: "reminders" as const })),
  ]
    .filter(row => row.status === "Active")
    .map((row, index) => ({
      row,
      index,
      timestamp: Date.parse(row.createdAt ?? "") ||
        Number(row.id.match(/-(\d{13})$/)?.[1]) || 0,
    }))
    .sort((a, b) => b.timestamp - a.timestamp || b.index - a.index)
    .map(item => item.row);
}
