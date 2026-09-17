import { canEditMenu, parseSession } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { canAccessAssignedOrganization, hasOrganizationSubstitution, isAccountantAssigned, loadLinkedDirectoryUsers, loadOrganizationUserIds, organizationAssignmentStorageKey, type LinkedOrganization, type SettingsAudience } from './linkedSettingsData';
import { registerChatConversation, type InvoiceChatContext } from '../components/invoices/invoiceChat';
import { loadRelatedObjects } from './relatedObjects';

export async function chatRelatedObjects(organization: LinkedOrganization): Promise<NonNullable<InvoiceChatContext['relatedObject']>[]> {
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!session || !canAccessAssignedOrganization(organization, session) || !session.access.companies.view) return [];
  const objects = await loadRelatedObjects(organization, session);
  return objects.flatMap(object => {
    if (object.type === 'Document' || object.type === 'Invoice' || object.type === 'Bank operation' || object.type === 'Reconciliation' || object.type === 'Debt') {
      return [{ ...object, type: object.type }];
    }
    return [];
  });
}

export function chatTargetAudience(currentEmail: string): SettingsAudience | null {
  const email = currentEmail.trim().toLowerCase();
  if (!email) return null;
  for (const audience of ['Internal users', 'External users'] as SettingsAudience[]) {
    if (loadLinkedDirectoryUsers(audience).some(user => user.email?.trim().toLowerCase() === email)) {
      return audience === 'Internal users' ? 'External users' : 'Internal users';
    }
  }
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  return session?.email.trim().toLowerCase() === email && session.roleNames.some(role => ['administrator', 'administration', 'meso accountant'].includes(role.toLowerCase())) ? 'External users' : null;
}

export function chatRecipients(organization: LinkedOrganization, currentEmail: string) {
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!session || session.email.toLowerCase() !== currentEmail.toLowerCase() || !canAccessAssignedOrganization(organization, session)) return [];
  const demo = session.roleNames.includes('External demo user');
  const target = chatTargetAudience(currentEmail);
  const audiences: SettingsAudience[] = demo || target === 'External users' ? ['External users', 'Internal users'] : target ? [target] : [];
  return audiences.flatMap(audience => {
    const assigned = loadOrganizationUserIds(organization.id, audience);
    const hasExplicit = window.localStorage.getItem(organizationAssignmentStorageKey(organization.id, audience)) !== null;
    return loadLinkedDirectoryUsers(audience).filter(user => {
      if (!user.email || user.email.toLowerCase() === currentEmail.toLowerCase() || (user.status && !['enabled', 'active'].includes(user.status.toLowerCase()))) return false;
      if (demo) return true;
      if (assigned.includes(user.id)) return true;
      if (audience === 'Internal users' && (isAccountantAssigned(organization, user) || hasOrganizationSubstitution(organization.id, user.id))) return true;
      return !hasExplicit && (user.organizations?.toLowerCase() === 'all organizations' || user.organizations?.split(',').some(name => [organization.id.toLowerCase(), organization.name.toLowerCase()].includes(name.trim().toLowerCase())));
    }).map(user => ({ id: `${audience}:${user.id}`, email: user.email!, name: user.fullName || user.username || user.email!, audience }));
  });
}

export async function createContextChat(organization: LinkedOrganization | undefined, recipientId: string, relatedObjectId = '', topic = ''): Promise<InvoiceChatContext> {
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  if (!session || !canEditMenu(session, 'messages')) throw new Error('You do not have permission to start a chat.');
  if (!organization || !canAccessAssignedOrganization(organization, session)) throw new Error('Select an available organization.');
  const isAi = recipientId === 'fh-ai';
  const recipient = isAi ? { id: 'fh-ai', name: 'FH AI', email: undefined, audience: undefined }
    : chatRecipients(organization, session.email).find(user => user.id === recipientId);
  if (!recipient) throw new Error('Select a participant assigned to this organization.');
  const relatedObject = relatedObjectId ? (await chatRelatedObjects(organization)).find(object => object.id === relatedObjectId) : undefined;
  if (relatedObjectId && !relatedObject) throw new Error('The related object is no longer available in this organization.');
  const subject = topic.trim() || relatedObject?.label.trim() || '';
  if (!subject) throw new Error('Enter a Subject or select a related record.');
  const context: InvoiceChatContext = {
    storageKey: `organization-chat:${organization.id}:${crypto.randomUUID()}`,
    organizationId: organization.id,
    companyName: organization.name,
    title: `${organization.name} / ${subject}`,
    subject,
    sourceType: 'Topic',
    recipientId: recipient.id,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    createdByEmail: session.email,
    createdByName: session.fullName,
    participantType: isAi ? 'FH AI' : recipient.audience === 'External users' ? 'Client' : 'MESO accountant',
    aiEnabled: isAi,
    relatedObject,
  };
  registerChatConversation(context);
  return context;
}
