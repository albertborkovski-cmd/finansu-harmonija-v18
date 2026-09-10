import { parseSession } from './accessControl';
import { AUTH_SESSION_KEY } from './currentUser';
import { loadLinkedDirectoryUsers } from './linkedSettingsData';
import type { InvoiceChatMessage } from '../components/invoices/invoiceChat';

export function chatAuthorLabel(message: Pick<InvoiceChatMessage, 'author' | 'authorEmail' | 'authorType'>): string {
  // Keep recorded authorship; directory lookup is only a fallback for legacy messages.
  if (message.authorType === 'MESO accountant') return 'Internal User';
  if (message.authorType === 'Client') return 'External User';
  if (message.authorType === 'FH AI') return 'AI asistentas';
  const normalize = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const email = normalize(message.authorEmail);
  const name = normalize(message.author);
  if (!email && !name) return 'User type not identified';
  const matches = (audience: 'Internal users' | 'External users') => loadLinkedDirectoryUsers(audience).some(user =>
    email ? normalize(user.email) === email : [user.fullName, user.username].some(value => normalize(value) === name),
  );
  const internal = matches('Internal users');
  const external = matches('External users');
  if (internal !== external) return internal ? 'Internal User' : 'External User';
  return 'User type not identified';
}

/** Snapshot at send time; never derive historic authorship from current roles. */
export function currentChatAuthor(): Pick<InvoiceChatMessage, 'authorEmail' | 'authorType' | 'sentAt'> {
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  const email = session?.email.toLowerCase();
  const internal = loadLinkedDirectoryUsers('Internal users').some(user => email && user.email?.toLowerCase() === email);
  const external = loadLinkedDirectoryUsers('External users').some(user => email && user.email?.toLowerCase() === email);
  const authorType = internal || session?.roleNames.some(role => ['administrator', 'administration', 'meso accountant'].includes(role.toLowerCase()))
    ? 'MESO accountant' : external ? 'Client' : undefined;
  return { authorEmail: session?.email, authorType, sentAt: new Date().toISOString() };
}
