import { canViewMenu, parseSession, type AppSession } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { canAccessAssignedOrganization, type LinkedOrganization } from './linkedSettingsData';
import { CHAT_CONVERSATIONS_KEY, invoiceChatPersistenceKey, registerChatConversation, type InvoiceChatContext, type InvoiceChatMessage } from '../components/invoices/invoiceChat';
import { publishChatMessageNotification } from './chatNotifications';
import { formatNotificationDateTime } from './notificationPresentation';

/** One explicit local development fixture, not an email inbox integration. */
export function ensureReceivedEmailExample(organizations: readonly LinkedOrganization[], session: AppSession): boolean {
  const current = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  const email = session.email.trim().toLowerCase();
  if (!current || current.email.trim().toLowerCase() !== email || !current.access.companies.view
    || !canViewMenu(current, 'messages') || !canViewMenu(current, 'notifications')) return false;
  const marker = `finansu-harmonija:v15:received-email-example:${encodeURIComponent(email)}`;
  if (window.localStorage.getItem(marker)) return false;
  const available = organizations.filter(company => canAccessAssignedOrganization(company, current));
  const organization = available.find(company => company.name === 'Alice Stone') ?? available[0];
  if (!organization) return false;
  const savedConversations = window.localStorage.getItem(CHAT_CONVERSATIONS_KEY);
  const conversations: InvoiceChatContext[] = savedConversations === null ? [] : JSON.parse(savedConversations);
  if (!Array.isArray(conversations) || conversations.some(chat => !chat || typeof chat.storageKey !== 'string')) {
    throw new Error('Unable to read existing conversations.');
  }
  const storageKey = `demo-received-email:${organization.id}:${encodeURIComponent(email)}`;
  const senderEmail = email === 'client@example.com' ? 'sender@example.com' : 'client@example.com';
  const subject = 'Demo email: document clarification';
  const context: InvoiceChatContext = {
    storageKey,
    title: `${organization.name} / ${subject}`,
    companyName: organization.name,
    organizationId: organization.id,
    subject,
    sourceType: 'Topic',
    createdByEmail: senderEmail,
    createdByName: 'Demo client',
    recipientEmail: current.email,
    recipientName: current.fullName,
    participantType: current.roleNames.some(role => /administrator|administration|accountant/i.test(role)) ? 'MESO accountant' : 'Client',
    aiEnabled: false,
  };
  const messageKey = invoiceChatPersistenceKey(storageKey);
  const stored = window.localStorage.getItem(messageKey);
  const messages: InvoiceChatMessage[] = stored === null ? [] : JSON.parse(stored);
  if (!Array.isArray(messages) || messages.some(item => !item || typeof item.id !== 'string')) throw new Error('Unable to read the demo conversation.');
  let message = messages.find(item => item.id === 'demo-received-email-001');
  if (!message) {
    const sentAt = new Date().toISOString();
    message = {
      id: 'demo-received-email-001',
      author: 'Demo client',
      authorEmail: senderEmail,
      authorType: 'Client',
      recipientEmail: current.email,
      channel: 'email',
      sentAt,
      date: formatNotificationDateTime({ id: 'demo-received-email-001', createdAt: sentAt }),
      direction: 'received',
      text: 'Hello,\n\nCould you confirm whether our purchase invoice has been received and whether any additional information is required?\n\nThank you.\n\n[Demo email for testing Notifications → Open chat. No real email was sent.]',
    };
    window.localStorage.setItem(messageKey, JSON.stringify([...messages, message]));
  }
  const existing = conversations.find(chat => chat.storageKey === storageKey);
  if (!existing) registerChatConversation(context);
  publishChatMessageNotification(existing ?? context, message);
  window.localStorage.setItem(marker, 'created');
  return true;
}
