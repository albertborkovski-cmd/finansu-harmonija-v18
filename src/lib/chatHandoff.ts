import { parseSession, canEditMenu } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { canAccessAssignedOrganization, loadLinkedDirectoryUsers, loadOrganizationUserIds, organizationAssignmentStorageKey, isAccountantAssigned, hasOrganizationSubstitution, type LinkedOrganization } from './linkedSettingsData';
import { invoiceChatPersistenceKey, loadChatConversations, registerChatConversation, type InvoiceChatMessage } from '../components/invoices/invoiceChat';

export function handoffAccountants(organization: LinkedOrganization, currentEmail: string) {
  const assigned = new Set(loadOrganizationUserIds(organization.id, 'Internal users'));
  const hasExplicitAssignments = window.localStorage.getItem(organizationAssignmentStorageKey(organization.id, 'Internal users')) !== null;
  return loadLinkedDirectoryUsers('Internal users').filter(user => user.email && user.email.toLowerCase() !== currentEmail.toLowerCase()
    && (!user.status || ['enabled', 'active'].includes(user.status.toLowerCase()))
    && (assigned.has(user.id) || isAccountantAssigned(organization, user) || hasOrganizationSubstitution(organization.id, user.id)
      || (!hasExplicitAssignments && (user.organizations?.trim().toLowerCase() === 'all organizations'
        || user.organizations?.split(',').some(value => [organization.id.toLowerCase(), organization.name.toLowerCase()].includes(value.trim().toLowerCase()))))));
}

export function handoffAiChat(storageKey: string, organization: LinkedOrganization, accountantId: string) {
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  const context = loadChatConversations().find(item => item.storageKey === storageKey);
  if (!session || !canEditMenu(session, 'messages') || !canAccessAssignedOrganization(organization, session)
    || !context || context.organizationId !== organization.id || context.createdByEmail?.toLowerCase() !== session.email.toLowerCase()) throw new Error('You cannot transfer this conversation.');
  if (context.participantType !== 'FH AI' || context.handedOffAt) throw new Error('This conversation has already been transferred or is not an AI conversation.');
  const accountant = handoffAccountants(organization, session.email).find(user => user.id === accountantId);
  if (!accountant?.email) throw new Error('Select an active internal user assigned to this organization.');
  const key = invoiceChatPersistenceKey(storageKey);
  const previous = window.localStorage.getItem(key);
  const messages: InvoiceChatMessage[] = previous ? JSON.parse(previous) : [];
  if (!Array.isArray(messages)) throw new Error('Unable to read conversation history.');
  const now = new Date().toISOString();
  const next = { ...context, recipientId: `Internal users:${accountant.id}`, recipientEmail: accountant.email,
    recipientName: accountant.fullName || accountant.username || accountant.email, participantType: 'MESO accountant' as const,
    handedOffAt: now, handedOffBy: session.email, aiEnabled: false };
  const event: InvoiceChatMessage = { id: `handoff-${crypto.randomUUID()}`, author: 'System', systemEvent: 'accountant-handoff',
    actorEmail: session.email, recipientEmail: accountant.email, sentAt: now, date: now, direction: 'received',
    text: `${session.fullName} transferred this conversation to FH accountant ${next.recipientName}. The organization, topic, related object and previous messages have been retained.` };
  window.localStorage.setItem(key, JSON.stringify([...messages, event]));
  try { registerChatConversation(next); }
  catch (error) { if (previous === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, previous); throw error; }
  return next;
}
