import type { ColConfig } from '../components/ColumnSettingsPanel';
import type { NotificationRow } from './notifications';

export const NOTIFICATION_OPEN_BUTTON_CLASS_NAME = 'flex h-7 w-20 shrink-0 items-center justify-center whitespace-nowrap rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7] active:bg-[#007EA7] active:text-white disabled:cursor-wait disabled:opacity-60';

/** Use the same names as the destination menus, not delivery channels or event names. */
export const NOTIFICATION_MODULE_LABELS = [
  'Chats', 'Tasks', 'Documents', 'Invoices', 'Debts', 'Bank', 'GL journal',
  'Reconciliation', 'Counterparties', 'Uploaded documents', 'OCR', 'Reports',
  'Companies', 'Organizations', 'Users', 'Roles', 'General ledger', 'Integrations',
  'Settings', 'Notifications & Tasks', 'Action history', 'Analytics',
] as const;

type NotificationModuleLabel = typeof NOTIFICATION_MODULE_LABELS[number];
const normalizeModule = (value: string) => value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
const notificationModuleAliases = new Map<string, NotificationModuleLabel>([
  ...NOTIFICATION_MODULE_LABELS.map(label => [normalizeModule(label), label] as const),
  ['email', 'Chats'], ['e mail', 'Chats'], ['chat', 'Chats'], ['message', 'Chats'],
  ['task', 'Tasks'], ['task reminder', 'Tasks'], ['reminder', 'Tasks'],
  ['document', 'Documents'], ['invoice', 'Invoices'], ['billing', 'Invoices'],
  ['debt', 'Debts'], ['bank operation', 'Bank'], ['bank transaction', 'Bank'],
  ['transaction', 'Bank'], ['payment', 'Bank'], ['banking', 'Bank'],
  ['counterparty', 'Counterparties'], ['report', 'Reports'],
  ['company', 'Companies'], ['organization', 'Organizations'], ['user', 'Users'],
  ['internal users', 'Users'], ['external users', 'Users'], ['role', 'Roles'],
  ['integration', 'Integrations'], ['synchronization', 'Integrations'],
  ['system', 'Settings'], ['notification', 'Notifications & Tasks'],
  ['notifications', 'Notifications & Tasks'], ['audit', 'Action history'],
]);

/** Derive a display label without rewriting source data or changing navigation. */
export function getNotificationModuleLabel(row: Pick<NotificationRow, 'id' | 'type' | 'organizationId' | 'sourceTaskId' | 'sourceChatId' | 'relatedObject'>): NotificationModuleLabel | '—' {
  // A Task or Chat can refer to an invoice, but the signal still belongs to Tasks or Chats.
  if (row.sourceTaskId?.trim() || getNotificationSourceTaskId(row)) return 'Tasks';
  if (row.sourceChatId?.trim() || row.id.startsWith('chat-message:')) return 'Chats';
  if (row.organizationId?.trim() && row.relatedObject?.organizationId === row.organizationId) {
    const relatedModule = notificationModuleAliases.get(normalizeModule(row.relatedObject.type));
    if (relatedModule) return relatedModule;
  }
  const type = row.type?.trim();
  if (!type) return '—';
  return notificationModuleAliases.get(normalizeModule(type)) ?? 'Notifications & Tasks';
}

/** A notification is an event signal, not a second copy of its source record. */
export function createNotificationColumns(organizationContext = false): ColConfig[] {
  return [
    { key: 'createdAt', label: 'Date / time', width: 180, visible: true },
    { key: 'organization', label: 'Organization', width: 220, visible: !organizationContext },
    { key: 'type', label: 'Type', width: 140, visible: true },
    { key: 'message', label: 'Message', width: 380, visible: true },
    { key: 'status', label: 'Read / Unread', width: 150, visible: true },
  ];
}

export function formatNotificationDateTime(row: Pick<NotificationRow, 'createdAt' | 'id'>): string {
  const createdAt = row.createdAt?.trim();
  // Older locally created records sometimes carry their creation time only in the ID.
  const timestamp = createdAt ? Date.parse(createdAt) : Number(row.id.match(/-(\d{13})$/)?.[1] ?? Number.NaN);
  if (!Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function notificationMessage(row: Pick<NotificationRow, 'message' | 'name'>): string {
  return row.message?.trim() || row.name?.trim() || '—';
}

/** Protect generated signals, including old records that predate explicit provenance. */
export function isSystemNotification(row: Pick<NotificationRow, 'id' | 'origin' | 'sourceTaskId' | 'sourceChatId' | 'sourceMessageId'>): boolean {
  if (row.origin === 'system' || row.sourceTaskId?.trim() || row.sourceChatId?.trim() || row.sourceMessageId?.trim()
    || row.id.startsWith('task-reminder:') || row.id.startsWith('chat-message:')) return true;
  if (row.origin === 'manual') return false;
  // The retired manual notification form used this exact ID shape without provenance.
  return !/^notification-\d{13}$/.test(row.id);
}

/** One navigation label for the primary source; object access is still checked by the caller. */
export function getNotificationActionLabel(row: Pick<NotificationRow, 'id' | 'organizationId' | 'sourceTaskId' | 'relatedObject'>): string | undefined {
  if (getNotificationSourceTaskId(row)) return 'Open task';
  if (!row.organizationId?.trim() || row.relatedObject?.organizationId !== row.organizationId) return undefined;
  return `Open ${row.relatedObject.type.toLowerCase()}`;
}

/** Resolve only source identity; callers must recheck current task visibility and existence. */
export function getNotificationSourceTaskId(row: Pick<NotificationRow, 'id' | 'organizationId' | 'sourceTaskId'>): string | undefined {
  if (!row.organizationId?.trim()) return undefined;
  if (row.sourceTaskId?.trim()) return row.sourceTaskId;
  if (!row.id.startsWith('task-reminder:')) return undefined;
  const encoded = row.id.slice('task-reminder:'.length).split(':');
  if (encoded.length !== 5) return undefined;
  try {
    const [organizationId, taskId, recipient, dueDate, reminder] = encoded.map(decodeURIComponent);
    if (organizationId !== row.organizationId || !taskId.trim() || !recipient.trim()) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return undefined;
    const parsedDate = new Date(`${dueDate}T00:00:00Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dueDate) return undefined;
    if (!['on_due_date', '1_day_before', '3_days_before', '7_days_before'].includes(reminder)) return undefined;
    return taskId;
  } catch {
    return undefined;
  }
}
