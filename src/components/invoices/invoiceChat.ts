export type InvoiceChatMessage = {
  id: string;
  author: string;
  date: string;
  text: string;
  direction: 'received' | 'written';
  authorEmail?: string;
  authorType?: 'Client' | 'MESO accountant' | 'FH AI';
  sentAt?: string;
  /** How the original message arrived; email ingestion is distinct from chat delivery. */
  channel?: 'email' | 'chat';
  systemEvent?: 'accountant-handoff';
  actorEmail?: string;
  recipientEmail?: string;
  attachments?: Array<{ documentId: string; name: string; size: number; url: string }>;
};

export type InvoiceChatContext = {
  storageKey: string;
  title: string;
  companyName?: string;
  subject?: string;
  sourceType?: 'Document' | 'Topic';
  organizationId?: string;
  recipientId?: string;
  recipientEmail?: string;
  recipientName?: string;
  createdByEmail?: string;
  createdByName?: string;
  participantType?: 'FH AI' | 'MESO accountant' | 'Client';
  handedOffAt?: string;
  handedOffBy?: string;
  aiEnabled?: boolean;
  relatedObject?: { id: string; organizationId: string; type: 'Document' | 'Invoice' | 'Bank operation' | 'Reconciliation' | 'Debt' | 'Other'; label: string };
};

export const CHAT_CONVERSATIONS_KEY = 'finansu-harmonija:v12:chat:conversations';

export function invoiceChatPersistenceKey(storageKey: string) {
  if (storageKey === '__general__') return 'finansu-harmonija:v7:chat:messages';
  return `finansu-harmonija:v12:invoice-chat:${storageKey}`;
}

export function loadChatConversations(): InvoiceChatContext[] {
  try {
    const stored = window.localStorage.getItem(CHAT_CONVERSATIONS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function registerChatConversation(context: InvoiceChatContext) {
  const current = loadChatConversations();
  const existing = current.find(item => item.storageKey === context.storageKey);
  // A stale AI view must never reactivate a conversation already handed to a human.
  const saved = existing?.handedOffAt ? {
    ...context,
    handedOffAt: existing.handedOffAt,
    handedOffBy: existing.handedOffBy,
    recipientId: existing.recipientId,
    recipientName: existing.recipientName,
    recipientEmail: existing.recipientEmail,
    participantType: existing.participantType,
    aiEnabled: false,
  } : context;
  const next = [
    saved,
    ...current.filter((item) => item.storageKey !== context.storageKey),
  ];
  window.localStorage.setItem(CHAT_CONVERSATIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('chat-conversations-updated'));
}
