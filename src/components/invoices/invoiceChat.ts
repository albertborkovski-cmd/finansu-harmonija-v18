export type InvoiceChatMessage = {
  id: string;
  author: string;
  date: string;
  text: string;
  direction: 'received' | 'written';
};

export type InvoiceChatContext = {
  storageKey: string;
  title: string;
  companyName?: string;
  subject?: string;
  sourceType?: 'Document' | 'Topic';
};

const CHAT_CONVERSATIONS_KEY = 'finansu-harmonija:v12:chat:conversations';

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
  const next = [
    context,
    ...current.filter((item) => item.storageKey !== context.storageKey),
  ];
  window.localStorage.setItem(CHAT_CONVERSATIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('chat-conversations-updated'));
}
