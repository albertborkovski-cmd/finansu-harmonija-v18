import type { InvoiceChatContext, InvoiceChatMessage } from '../components/invoices/invoiceChat';
import { isNotificationRead, SAMPLE_NOTIFICATIONS, setNotificationRead, type NotificationRow } from './notifications';

const NOTIFICATIONS_KEY = 'finansu-harmonija:v7:notifications';
const CHANGED_EVENT = 'finansu-harmonija:persistent-state-changed';
type NotificationStorage = Pick<Storage, 'getItem' | 'setItem'>;

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const email = (value: unknown): string => {
  const identity = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity) ? identity : '';
};

function participants(context: InvoiceChatContext): [string, string] | undefined {
  if (!text(context.organizationId) || !text(context.storageKey) || context.storageKey === '__general__'
    || context.participantType === 'FH AI' || context.recipientId === 'fh-ai' || context.aiEnabled === true) return undefined;
  const creator = email(context.createdByEmail);
  const recipient = email(context.recipientEmail);
  return creator && recipient && creator !== recipient ? [creator, recipient] : undefined;
}

function readNotifications(storage: NotificationStorage): NotificationRow[] {
  const saved = storage.getItem(NOTIFICATIONS_KEY);
  const rows: unknown = saved === null ? SAMPLE_NOTIFICATIONS : JSON.parse(saved);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string')) {
    throw new Error('Unable to read chat notification records.');
  }
  return rows as NotificationRow[];
}

function saveNotifications(storage: NotificationStorage, rows: NotificationRow[]) {
  storage.setItem(NOTIFICATIONS_KEY, JSON.stringify(rows));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { storageKey: NOTIFICATIONS_KEY } }));
  }
}

/** Call after the source message is persisted; opening an empty chat never emits an alert. */
export function publishChatMessageNotification(
  context: InvoiceChatContext,
  message: Omit<InvoiceChatMessage, 'direction'>,
  storage: NotificationStorage = window.localStorage,
): boolean {
  const peers = participants(context);
  const sender = email(message.authorEmail);
  const messageId = text(message.id);
  const sentAt = text(message.sentAt);
  if (!peers || !sender || !peers.includes(sender) || !messageId || !/^\d{4}-\d{2}-\d{2}T/.test(sentAt) || !Number.isFinite(Date.parse(sentAt))
    || message.systemEvent || message.authorType === 'FH AI') return false;
  const recipient = peers.find(peer => peer !== sender)!;
  if (message.recipientEmail !== undefined && email(message.recipientEmail) !== recipient) return false;
  const content = (text(message.text) || message.attachments?.map(attachment => text(attachment.name)).filter(Boolean).join(', ') || '').replace(/\s+/g, ' ');
  if (!content) return false;
  const preview = content.length > 160 ? `${content.slice(0, 159)}…` : content;

  const organizationId = text(context.organizationId);
  const storageKey = text(context.storageKey);
  const id = `chat-message:${[organizationId, storageKey, messageId, recipient].map(encodeURIComponent).join(':')}`;
  const rows = readNotifications(storage);
  if (rows.some(row => row.id === id)) return false;
  const channel = message.channel === 'email' ? 'email' : 'chat message';
  const notification: NotificationRow = {
    id,
    origin: 'system',
    createdAt: sentAt,
    sourceChatId: storageKey,
    sourceMessageId: messageId,
    name: message.channel === 'email' ? 'New email message' : 'New chat message',
    type: message.channel === 'email' ? 'Email' : 'Chat',
    message: `New ${channel} from ${text(message.author) || sender}: ${preview}`,
    status: 'Active',
    organizationId,
    organizationName: text(context.companyName) || undefined,
    recipientEmails: [recipient],
    requiresAction: true,
    relatedObject: {
      id: `chat:${storageKey}`,
      recordId: storageKey,
      organizationId,
      type: 'Chat',
      label: text(context.subject) || text(context.title) || storageKey,
    },
  };
  saveNotifications(storage, [...rows, notification]);
  return true;
}

/** Mark only the current recipient's displayed messages; source history stays untouched. */
export function markChatNotificationsRead(
  context: InvoiceChatContext,
  messageIds: readonly string[],
  currentEmail: string,
  storage: NotificationStorage = window.localStorage,
): number {
  const identity = email(currentEmail);
  if (!identity || !participants(context)?.includes(identity)) return 0;
  const displayed = new Set(messageIds.map(text).filter(Boolean));
  if (!displayed.size) return 0;
  const rows = readNotifications(storage);
  let changed = 0;
  const now = new Date().toISOString();
  const next = rows.map(row => {
    if (row.organizationId !== text(context.organizationId) || row.sourceChatId !== text(context.storageKey)
      || !row.sourceMessageId || !displayed.has(row.sourceMessageId)
      || !row.recipientEmails?.some(recipient => email(recipient) === identity)
      || isNotificationRead(row, identity)) return row;
    changed += 1;
    return setNotificationRead(row, identity, true, now);
  });
  if (changed) saveNotifications(storage, next);
  return changed;
}
