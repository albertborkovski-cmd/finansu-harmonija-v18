import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileText, MessageSquare, Plus, Search, Send, X } from 'lucide-react';
import { PageHeader, PageActionButton } from './PageHeader';
import SearchableSelect from './SearchableSelect';
import { chatRecipients, chatRelatedObjects, chatTargetAudience, createContextChat } from '../lib/newChat';
import { canEditMenu, canViewMenu, parseSession } from '../lib/accessControl';
import { AUTH_SESSION_KEY } from '../lib/currentUser';
import { canAccessAssignedOrganization, loadLinkedDirectoryUsers } from '../lib/linkedSettingsData';
import { useOrganizationAccessRevision } from './useOrganizationAccessRevision';
import { SystemBreadcrumb } from './SystemNavigation';
import {
  invoiceChatPersistenceKey,
  loadChatConversations,
  registerChatConversation,
  type InvoiceChatContext,
  type InvoiceChatMessage,
} from './invoices/invoiceChat';
import { supabase, type Company, type DbDocument } from '../lib/supabase';
import { chatAuthorLabel, currentChatAuthor } from '../lib/chatAuthor';
import { registerChatAttachment, validateChatAttachment } from '../lib/chatAttachment';
import { handoffAccountants, handoffAiChat } from '../lib/chatHandoff';
import { markChatNotificationsRead, publishChatMessageNotification } from '../lib/chatNotifications';

type StoredChatMessage = Omit<InvoiceChatMessage, 'direction'> & {
  timestamp?: string;
  direction: 'incoming' | 'outgoing' | 'received' | 'written';
};

const GENERAL_CHAT: InvoiceChatContext = {
  storageKey: '__general__',
  title: 'General conversation',
  companyName: 'General',
  subject: 'General conversation',
  sourceType: 'Topic',
};

function formatTimestamp(date: Date) {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

function readMessages(context: InvoiceChatContext | null): StoredChatMessage[] {
  if (!context) return [];
  try {
    const stored = window.localStorage.getItem(invoiceChatPersistenceKey(context.storageKey));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readReceiptKey(context: InvoiceChatContext, email: string) {
  return `finansu-harmonija:v14:chat-read:${encodeURIComponent(email.toLowerCase())}:${context.storageKey}`;
}

function isIncoming(message: StoredChatMessage, email: string) {
  if (message.systemEvent) return false;
  return message.authorEmail ? message.authorEmail.toLowerCase() !== email.toLowerCase()
    : message.direction === 'received' || message.direction === 'incoming';
}

function chatPartner(context: InvoiceChatContext, email: string, messages: StoredChatMessage[]) {
  const isCreator = context.createdByEmail?.toLowerCase() === email.toLowerCase();
  const incoming = [...messages].reverse().find(message => isIncoming(message, email));
  const partnerEmail = (isCreator ? context.recipientEmail : context.createdByEmail) || incoming?.authorEmail;
  const external = loadLinkedDirectoryUsers('External users').find(user => partnerEmail && user.email?.toLowerCase() === partnerEmail.toLowerCase());
  const internal = loadLinkedDirectoryUsers('Internal users').find(user => partnerEmail && user.email?.toLowerCase() === partnerEmail.toLowerCase());
  const name = external?.fullName || internal?.fullName || (isCreator ? context.recipientName : context.createdByName) || incoming?.author || context.recipientName || 'Participant not assigned';
  const recordedType = isCreator ? context.participantType : undefined;
  const type = external ? 'External User' : internal ? 'Internal User'
    : recordedType === 'Client' ? 'External User' : recordedType === 'MESO accountant' ? 'Internal User' : recordedType;
  return { name, type: type || (name === 'FH AI' ? 'FH AI' : undefined) };
}

function conversationCompany(context: InvoiceChatContext) {
  return context.companyName || context.title.split('/')[0]?.trim() || 'Other';
}

function conversationSubject(context: InvoiceChatContext) {
  return context.subject || context.title.split('/').slice(1).join('/').trim() || context.title;
}

export default function ChatsView({
  currentUserName,
  conversation,
  onOpenDocument,
  onBack,
  preserveConversationMetadata = false,
}: {
  currentUserName: string;
  conversation?: InvoiceChatContext | null;
  onOpenDocument?: (document: DbDocument) => void;
  onBack?: () => void;
  preserveConversationMetadata?: boolean;
}) {
  const [conversations, setConversations] = useState<InvoiceChatContext[]>(() => [
    ...loadChatConversations(),
    GENERAL_CHAT,
  ]);
  const [selected, setSelected] = useState<InvoiceChatContext | null>(conversation ?? null);
  const [messages, setMessages] = useState<StoredChatMessage[]>(() => readMessages(conversation ?? null));
  const [draft, setDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; id: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<NonNullable<InvoiceChatMessage['attachments']>[number] | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [attachmentPreviewError, setAttachmentPreviewError] = useState('');
  const viewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!previewAttachment) return;
    const controller = new AbortController();
    let objectUrl = '';
    setAttachmentPreviewUrl('');
    setAttachmentPreviewError('');
    const open = async () => {
      try {
        const url = previewAttachment.url;
        if (!url || !/^(data:|blob:|https?:\/\/)/i.test(url)) throw new Error('Attachment file is unavailable.');
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load the attached file.');
        const blob = await response.blob();
        const extension = previewAttachment.name.split('.').pop()?.toLowerCase();
        const types: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };
        const type = types[extension || ''];
        if (!type || !blob.size) throw new Error('This file cannot be previewed.');
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type }));
        setAttachmentPreviewUrl(objectUrl);
      } catch (error) {
        if (!controller.signal.aborted) setAttachmentPreviewError(error instanceof Error ? error.message : 'Unable to open attachment.');
      }
    };
    void open();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewAttachment(null); };
    document.addEventListener('keydown', close);
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); document.removeEventListener('keydown', close); };
  }, [previewAttachment]);
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [talkTo, setTalkTo] = useState('');
  const [subject, setSubject] = useState('');
  const [chatSubject, setChatSubject] = useState('');
  const [relatedModule, setRelatedModule] = useState('');
  const relatedModules = [
    { value: 'Document', label: 'Documents' },
    { value: 'Invoice', label: 'Invoices' },
    { value: 'Bank operation', label: 'Bank' },
    { value: 'Reconciliation', label: 'Reconciliation' },
    { value: 'Debt', label: 'Debts' },
  ];
  const [relatedObjects, setRelatedObjects] = useState<NonNullable<InvoiceChatContext['relatedObject']>[]>([]);
  const effectiveChatSubject = chatSubject || relatedObjects.find(object => object.id === subject)?.label || '';
  const [creatingChat, setCreatingChat] = useState(false);
  const [linkedDocument, setLinkedDocument] = useState<DbDocument | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffRecipient, setHandoffRecipient] = useState('');
  const [handoffError, setHandoffError] = useState('');
  const [newChatError, setNewChatError] = useState('');
  useOrganizationAccessRevision();
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  const currentEmail = session?.email ?? '';
  const selectedPartner = selected ? chatPartner(selected, currentEmail, messages) : null;
  const selectedSubject = selected ? conversationSubject(selected) : '';
  const showSelectedSubject = Boolean(selected && (selected.relatedObject || ![
    selected.recipientName, selected.createdByName, selectedPartner?.name, session?.fullName, currentUserName,
  ].some(name => name?.trim().toLowerCase() === selectedSubject.trim().toLowerCase())));
  const canStartChat = Boolean(session && canEditMenu(session, 'messages'));
  const availableCompanies = companies.filter(company => session && canAccessAssignedOrganization(company, session));
  const defaultOrganizationId = availableCompanies.find(company => company.id === conversation?.organizationId)?.id
    ?? (availableCompanies.length === 1 ? availableCompanies[0].id : '');
  const effectiveOrganizationId = organizationId || defaultOrganizationId;
  const organization = availableCompanies.find(company => company.id === effectiveOrganizationId);
  const recipients = organization ? chatRecipients(organization, currentEmail).filter(user => user.audience === talkTo) : [];
  const handoffOrganization = availableCompanies.find(company => company.id === selected?.organizationId);
  const accountants = handoffOrganization ? handoffAccountants(handoffOrganization, currentEmail) : [];
  const targetAudience = chatTargetAudience(currentEmail);
  const isExternalDemo = Boolean(session?.roleNames.includes('External demo user'));
  const canChooseAudience = (audience: string) => Boolean((isExternalDemo && ['Internal users', 'External users'].includes(audience)) || (targetAudience && (audience === targetAudience || audience === 'Internal users')));
  const aiActive = Boolean(selected && !selected.handedOffAt && selected.aiEnabled !== false && (selected.participantType === 'FH AI' || selected.recipientId === 'fh-ai'));
  const effectiveRecipientId = talkTo === 'AI' ? 'fh-ai' : canChooseAudience(talkTo) ? (recipientId || (recipients.length === 1 ? recipients[0].id : '')) : '';

  useEffect(() => {
    let cancelled = false;
    setLinkedDocument(null);
    const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    const company = companies.find(item => selected?.organizationId ? item.id === selected.organizationId : item.name === selected?.companyName);
    if (selected && company && session?.access.companies.view && canAccessAssignedOrganization(company, session)) {
      void supabase.from('documents').select('*').eq('company_id', company.id).then(({ data }) => {
        if (cancelled) return;
        const matches = ((data ?? []) as unknown as DbDocument[]).filter(doc => selected.relatedObject
          ? ['Document', 'Invoice'].includes(selected.relatedObject.type) && doc.id === selected.relatedObject.id && doc.company_id === selected.relatedObject.organizationId
          : selected.sourceType === 'Document' && [doc.number, doc.file_case].includes(selected.subject || ''));
        if (matches.length === 1) setLinkedDocument(matches[0]);
      });
    }
    return () => { cancelled = true; };
  }, [selected, companies, currentEmail]);

  useEffect(() => {
    let cancelled = false;
    setRelatedObjects([]);
    setSubject('');
    setChatSubject('');
    setRelatedModule('');
    if (newChatOpen && organization) {
      void chatRelatedObjects(organization).then(objects => { if (!cancelled) setRelatedObjects(objects); }).catch(() => {
        if (!cancelled) setNewChatError('Unable to load related objects.');
      });
    }
    return () => { cancelled = true; };
  }, [newChatOpen, organization, currentEmail]);

  useEffect(() => {
    const refresh = () => {
      const registered = loadChatConversations();
      setSelected(current => {
        if (!current) return current;
        const updated = registered.find(item => item.storageKey === current.storageKey);
        return updated && JSON.stringify(updated) !== JSON.stringify(current) ? updated : current;
      });
      setConversations((current) => [
        ...registered,
        ...current.filter(
          (item) =>
            item.storageKey !== GENERAL_CHAT.storageKey &&
            !registered.some((registeredItem) => registeredItem.storageKey === item.storageKey),
        ),
        GENERAL_CHAT,
      ]);
    };
    window.addEventListener('chat-conversations-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('chat-conversations-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDocumentConversations = async () => {
      const [{ data: companyRows }, { data: documentRows }] = await Promise.all([
        supabase.from('companies').select('*'),
        supabase.from('documents').select('*'),
      ]);
      if (cancelled) return;

      const companies = (companyRows as unknown as Company[] | null) ?? [];
      setCompanies(companies);
      const documents = (documentRows as unknown as DbDocument[] | null) ?? [];
      const companyNames = new Map(companies.map((company) => [String(company.id), company.name]));
      const discovered: InvoiceChatContext[] = documents.map((document) => {
        const companyName = companyNames.get(String(document.company_id)) || 'Unassigned company';
        const subject = String(document.number || document.file_case || document.document_type || 'Document');
        return {
          storageKey: `${companyName}:${subject}`,
          title: `${companyName} / ${subject}`,
          companyName,
          subject,
          sourceType: 'Document',
        };
      });

      setConversations((current) => {
        const merged = [...loadChatConversations(), ...discovered, ...current, GENERAL_CHAT];
        return merged.filter(
          (item, index, all) =>
            all.findIndex((candidate) => candidate.storageKey === item.storageKey) === index,
        );
      });
    };

    void loadDocumentConversations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!conversation) {
      setSelected(null);
      return;
    }
    const existing = loadChatConversations().find(item => item.storageKey === conversation.storageKey);
    if (preserveConversationMetadata) {
      setSelected({ ...conversation, ...existing });
      return;
    }
    const context = {
      ...conversation,
      ...existing,
      createdByEmail: existing?.createdByEmail || conversation.createdByEmail || currentEmail,
      createdByName: existing?.createdByName || conversation.createdByName || currentUserName,
    };
    registerChatConversation(context);
    setSelected(context);
  }, [conversation, currentEmail, currentUserName, preserveConversationMetadata]);

  useEffect(() => {
    const refreshMessages = () => {
      const next = readMessages(selected);
      setMessages(next);
      const readingSession = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
      const company = companies.find(item => selected?.organizationId ? item.id === selected.organizationId : selected && item.name === conversationCompany(selected));
      const canRead = readingSession && readingSession.email.toLowerCase() === currentEmail.toLowerCase()
        && canViewMenu(readingSession, 'messages')
        && (selected?.storageKey === GENERAL_CHAT.storageKey || (company && canAccessAssignedOrganization(company, readingSession)));
      if (selected && currentEmail && next.length && canRead && document.visibilityState === 'visible' && viewRef.current?.getClientRects().length) {
        const key = readReceiptKey(selected, currentEmail);
        const lastId = next[next.length - 1].id;
        if (window.localStorage.getItem(key) !== lastId) {
          window.localStorage.setItem(key, lastId);
          window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed', { detail: { storageKey: 'finansu-harmonija:v7:notifications' } }));
        }
        try { markChatNotificationsRead(selected, next.filter(message => isIncoming(message, currentEmail)).map(message => message.id), currentEmail); }
        catch (error) { console.error('Unable to update chat notification reading status.', error); }
      }
    };
    refreshMessages();
    setDraft('');
    setPendingAttachment(null);
    setSendError('');
    window.addEventListener('storage', refreshMessages);
    window.addEventListener('chat-conversations-updated', refreshMessages);
    document.addEventListener('visibilitychange', refreshMessages);
    return () => {
      window.removeEventListener('storage', refreshMessages);
      window.removeEventListener('chat-conversations-updated', refreshMessages);
      document.removeEventListener('visibilitychange', refreshMessages);
    };
  }, [selected, currentEmail, companies]);

  const visibleConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const unique = conversations
      .filter(
        (item, index, all) => all.findIndex((candidate) => candidate.storageKey === item.storageKey) === index,
      )
      .filter((item) =>
        item.createdByEmail ? [item.createdByEmail, item.recipientEmail].some(email => email?.toLowerCase() === currentEmail.toLowerCase()) : readMessages(item).length > 0,
      );
    if (!term) return unique;
    return unique.filter((item) =>
      `${conversationCompany(item)} ${conversationSubject(item)} ${item.sourceType || 'Document'}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [conversations, search, currentEmail]);

  const grouped = useMemo(() => {
    return visibleConversations.reduce<Record<string, InvoiceChatContext[]>>((groups, item) => {
      const company = conversationCompany(item);
      (groups[company] ??= []).push(item);
      return groups;
    }, {});
  }, [visibleConversations]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !pendingAttachment) || !selected || sending) return;
    setSending(true);
    setSendError('');
    try {
    const attachments = pendingAttachment ? [await registerChatAttachment(selected, pendingAttachment.file, pendingAttachment.id)] : undefined;
    const message: StoredChatMessage = {
      id: `message-${Date.now()}`,
      author: currentUserName,
      ...currentChatAuthor(),
      channel: 'chat',
      date: formatTimestamp(new Date()),
      text,
      attachments,
      direction: selected.storageKey === '__general__' ? 'outgoing' : 'written',
    };
    const next = [...readMessages(selected), message];
    window.localStorage.setItem(
      invoiceChatPersistenceKey(selected.storageKey),
      JSON.stringify(next),
    );
    setMessages(next);
    setDraft('');
    setPendingAttachment(null);
    try { publishChatMessageNotification(selected, message); }
    catch { setSendError('Message saved, but its notification could not be created.'); }
    window.dispatchEvent(new CustomEvent('chat-conversations-updated'));
    } catch (error) { setSendError(error instanceof Error ? error.message : 'Unable to send message.'); }
    finally { setSending(false); }
  };

  return (
    <section
      ref={viewRef}
      className="relative flex h-screen min-h-0 flex-col gap-8 overflow-hidden bg-white px-4 py-14 font-montserrat sm:px-8 lg:px-[72px]"
    >
      <PageHeader title="Chats" actions={onBack ? <PageActionButton onClick={onBack}>Back</PageActionButton> : undefined} />
      <SystemBreadcrumb items={["Chats"]} />

      <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)] overflow-hidden rounded-xl border border-[#D3E1EC] bg-white">
        <aside className="flex min-h-0 flex-col border-r border-[#E5EDF9] bg-[#FCFDFE]">
          <div className="border-b border-[#E5EDF9] p-4">
            <div className="mb-3"><PageActionButton disabled={!canStartChat} onClick={() => { setOrganizationId(''); setRecipientId(''); setTalkTo(''); setSubject(''); setNewChatError(''); setNewChatOpen(true); }}>+ New chat</PageActionButton></div>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-[#D3E1EC] bg-white px-3 focus-within:border-[#007EA7]">
              <Search size={15} className="text-[#7288A3]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search companies, documents or topics"
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {Object.entries(grouped).map(([company, items]) => (
              <div key={company} className="mb-4">
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
                  {company}
                </div>
                <div className="flex flex-col gap-1">
                  {items.map((item) => {
                    const active = selected?.storageKey === item.storageKey;
                    const sourceType = item.sourceType || 'Document';
                    const Icon = sourceType === 'Document' ? FileText : MessageSquare;
                    const itemMessages = readMessages(item);
                    const lastMessage = itemMessages[itemMessages.length - 1];
                    const lastReadId = window.localStorage.getItem(readReceiptKey(item, currentEmail));
                    const lastReadIndex = itemMessages.findIndex(message => message.id === lastReadId);
                    const unreadCount = itemMessages.filter((message, index) => index > lastReadIndex && isIncoming(message, currentEmail)).length;
                    const unread = unreadCount > 0;
                    const partner = chatPartner(item, currentEmail, itemMessages);
                    return (
                      <button
                        key={item.storageKey}
                        type="button"
                        disabled={sending}
                        onClick={() => setSelected(item)}
                        className={`flex min-h-[64px] w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? 'bg-[#E6F2F6]' : 'hover:bg-[#F2F7FC]'}`}
                      >
                        <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${active ? 'bg-[#007EA7] text-white' : 'bg-white text-[#7288A3]'}`}>
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span title={partner.name} className="truncate text-[13px] font-semibold text-[#10233A]">{partner.name}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {partner.type && <span className="shrink-0 rounded bg-[#E6F2F6] px-2 py-0.5 text-[10px] font-semibold text-[#007EA7]">{partner.type}</span>}
                              {sourceType !== 'Topic' && <span className="text-[9px] font-semibold uppercase text-[#007EA7]">{sourceType}</span>}
                              {unreadCount > 0 && <span aria-label={`${unreadCount} unread messages`} title={`${unreadCount} unread messages`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E45858] px-1.5 text-[11px] font-semibold leading-none text-white">{unreadCount}</span>}
                            </span>
                          </span>
                          <span className="mt-1 flex min-w-0 items-center justify-between gap-2">
                            <span title={conversationSubject(item)} className="truncate text-[11px] font-medium text-[#7288A3]">{conversationSubject(item)}</span>
                          </span>
                          <span title={currentEmail} className="mt-1 block truncate text-[11px] text-[#7288A3]">You: {session?.fullName || currentUserName} · {currentEmail}</span>
                          <span title={lastMessage?.text} className="mt-1 block truncate text-[11px] font-medium text-[#7288A3]">{lastMessage?.text || lastMessage?.attachments?.map(file => file.name).join(', ') || 'No messages yet'}</span>
                          <span className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                            <span title="Your reading status" className={`inline-flex items-center gap-1 ${unread ? 'font-semibold text-[#007EA7]' : 'text-[#8FA6B8]'}`}><span className={`h-1.5 w-1.5 rounded-full ${unread ? 'bg-[#007EA7]' : 'bg-[#A1B6C6]'}`} />{lastMessage ? (unread ? 'Unread' : 'Read') : 'No messages'}</span>
                            <span className="text-[#8FA6B8]">{lastMessage?.timestamp || lastMessage?.date || '—'}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          {selected ? (
            <>
              <div className="flex min-h-[92px] flex-shrink-0 items-center gap-3 border-b border-[#E5EDF9] px-6 py-3">
                <button type="button" aria-label="Back to chat list" onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F2F7FC] hover:text-[#007EA7]">
                  <ArrowLeft size={17} />
                </button>
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold text-[#10233A]">{selectedPartner?.name}{selectedPartner?.type && <span className="ml-2 text-[11px] font-medium text-[#007EA7]">{selectedPartner.type}</span>}</h2>
                  <p className="mt-0.5 text-[11px] font-medium text-[#7288A3]">You: {session?.fullName || currentUserName} · {currentEmail}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#7288A3]">{conversationCompany(selected)}{showSelectedSubject && <> · {selectedSubject}</>}</p>
                  {linkedDocument && onOpenDocument && <p className="mt-1 text-[12px] text-[#7288A3]">Related object: <button type="button" onClick={() => onOpenDocument(linkedDocument)} className="text-[#007EA7] hover:underline">{linkedDocument.file_case || linkedDocument.number}</button></p>}
                  {selected.relatedObject && !linkedDocument && <p className="mt-1 text-[12px] text-[#7288A3]">Related object: {selected.relatedObject.label} · Unavailable</p>}
                  {aiActive && <p className="mt-1 text-[11px] text-[#7288A3]">AI service is not connected yet. Messages are saved, but automatic replies are unavailable.</p>}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
                {messages.length === 0 && (
                  <div className="m-auto text-center text-[12px] font-medium text-[#A1B6C6]">No messages in this conversation yet.</div>
                )}
                {messages.map((message) => {
                  if (message.systemEvent) return <article key={message.id} className="self-center rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] px-4 py-3 text-center text-[12px] text-[#7288A3]"><p className="mb-1 font-semibold">System</p><p>{message.text}</p><time className="mt-1 block text-[10px]" dateTime={message.sentAt}>{message.sentAt ? formatTimestamp(new Date(message.sentAt)) : message.date}</time></article>;
                  const outgoing = !isIncoming(message, currentEmail);
                  return (
                    <article key={message.id} className={`flex w-full flex-col ${outgoing ? 'items-end' : 'items-start'}`}>
                      <p className="mb-1 flex max-w-[85%] flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 text-[12px] text-[#10233A]"><span className="font-semibold">{message.author}</span><span className="text-[11px] text-[#7288A3]">{chatAuthorLabel(message)}</span>{message.channel === 'email' && <span className="text-[11px] text-[#7288A3]">· Email from {message.authorEmail}</span>}</p>
                      <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-4 py-2.5 text-[12px] font-normal leading-5 text-[#183047] ${outgoing ? 'bg-[#EDF6F8]' : 'border border-[#DCE7EF] bg-[#FCFDFE]'}`}>
                        {message.text}
                        {message.attachments?.map(file => <button type="button" key={file.documentId} onClick={() => setPreviewAttachment(file)} className="mt-1 block break-all text-left text-[#007EA7] hover:underline">{file.name} <span className="text-[10px] text-[#7288A3]">({Math.ceil(file.size / 1024)} KB)</span></button>)}
                      </div>
                      <time dateTime={message.sentAt} className="mt-1 px-1 text-[10px] font-medium leading-4 text-[#8FA6B8]">{message.sentAt && !Number.isNaN(Date.parse(message.sentAt)) ? formatTimestamp(new Date(message.sentAt)) : message.timestamp || message.date || '—'}</time>
                    </article>
                  );
                })}
              </div>

              {aiActive && (
                <aside role="note" aria-label="AI accuracy warning" className="flex shrink-0 items-start gap-3 border-y border-amber-300 bg-amber-50 px-4 py-3 text-[12px] font-medium leading-5 text-amber-950">
                  <AlertTriangle aria-hidden="true" size={21} className="mt-0.5 shrink-0 text-amber-700" />
                  <div className="min-w-0 space-y-1">
                    <p lang="en">FH AI Assistant may provide inaccurate information. Please confirm important accounting, tax, or legal matters with your accountant.</p>
                  </div>
                </aside>
              )}
              {aiActive && (
                <div className="flex shrink-0 justify-end px-4 pt-3 pb-1">
                  <button
                    type="button"
                    disabled={sending || !canStartChat}
                    onClick={() => { setHandoffRecipient(accountants.length === 1 ? accountants[0].id : ''); setHandoffError(''); setHandoffOpen(true); }}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#B9DCE7] bg-[#E6F2F6] px-3.5 font-montserrat text-[13px] font-semibold text-[#007EA7] transition-colors hover:border-[#007EA7] hover:bg-[#D9EDF3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007EA7] focus-visible:ring-offset-2 active:bg-[#007EA7] active:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MessageSquare aria-hidden="true" size={16} strokeWidth={1.7} />
                    Contact FH accountant
                  </button>
                </div>
              )}
              {sendError && <p role="alert" className="px-4 py-2 text-[12px] text-red-600">{sendError}</p>}
              {pendingAttachment && <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-[#7288A3]"><span className="truncate">{pendingAttachment.file.name}</span><button disabled={sending} type="button" aria-label="Remove attachment" onClick={() => setPendingAttachment(null)}><X size={14} /></button></div>}
              <form onSubmit={sendMessage} className="flex flex-shrink-0 flex-wrap items-stretch gap-2.5 border-t border-[#E5EDF9] bg-white p-4">
                <input ref={attachmentInput} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff" onChange={event => {
                  const file = event.target.files?.[0]; event.target.value = '';
                  if (!file) return;
                  try { validateChatAttachment(file); setPendingAttachment({ file, id: `chat-${crypto.randomUUID()}` }); setSendError(''); }
                  catch (error) { setSendError(error instanceof Error ? error.message : 'Invalid file.'); }
                }} />
                <label htmlFor="chat-message" className="sr-only">Type a message</label>
                <div className="relative min-w-0 flex-1">
                  <input disabled={sending} id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message..." autoComplete="off" className="h-10 w-full min-w-0 rounded-lg border border-[#CEDDE8] bg-white py-2 pl-10 pr-3.5 text-[12px] font-normal text-[#183047] outline-none placeholder:text-[#A8BCCB] focus:border-[#007EA7] focus:ring-2 focus:ring-[#DDF1F6]" />
                  <button type="button" aria-label="Attach document" title="Attach document" disabled={sending || !canStartChat || (!session?.access.companies.edit && !isExternalDemo) || !selected.companyName && !selected.organizationId} onClick={() => attachmentInput.current?.click()} className="absolute inset-y-0 left-1 flex w-8 items-center justify-center rounded-md text-[#7288A3] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40"><Plus size={19} strokeWidth={1.7} /></button>
                </div>
                <button type="submit" disabled={sending || (!draft.trim() && !pendingAttachment)} aria-label={sending ? 'Sending message' : 'Send message'} title="Send message" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[#CEDDE8] bg-white text-[#7288A3] transition-colors hover:border-[#9EB5C6] hover:bg-[#F7FAFC] hover:text-[#007EA7] active:border-[#007EA7] active:bg-[#007EA7] active:text-white disabled:cursor-not-allowed disabled:opacity-45">
                  <Send aria-hidden="true" size={17} strokeWidth={1.7} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F2F6] text-[#007EA7]"><MessageSquare size={21} /></div>
              <h2 className="text-[16px] font-semibold text-[#10233A]">Select a document or topic</h2>
              <p className="max-w-[380px] text-[12px] font-medium leading-5 text-[#7288A3]">Choose a company first, then open the document or topic whose conversation you want to view.</p>
            </div>
          )}
        </div>
      </div>
      {handoffOpen && <div className="fixed inset-0 z-[145] flex items-center justify-center bg-[#10233A]/20 p-6" onClick={() => setHandoffOpen(false)}>
        <form role="dialog" aria-modal="true" aria-label="Contact FH accountant" className="flex w-full max-w-[480px] flex-col gap-4 rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()} onSubmit={event => {
          event.preventDefault();
          try {
            if (!selected || !handoffOrganization) throw new Error('Organization is unavailable.');
            const next = handoffAiChat(selected.storageKey, handoffOrganization, handoffRecipient);
            setSelected(next); setHandoffOpen(false);
          } catch (error) { setHandoffError(error instanceof Error ? error.message : 'Unable to transfer conversation.'); }
        }}>
          <h2 className="text-[22px] font-semibold text-[#10233A]">Contact FH accountant</h2>
          <p className="text-[12px] text-[#7288A3]">The full conversation history and related object will be shared with the selected accountant.</p>
          <SearchableSelect selectionIndicator="checkbox" ariaLabel="FH accountant" value={handoffRecipient} options={accountants.map(user => ({ value: user.id, label: user.fullName || user.email || user.id }))} onChange={setHandoffRecipient} emptyMessage="No active internal users assigned to this organization" />
          {accountants.length === 0 && <p className="text-[12px] text-[#7288A3]">Assign an active internal user to this organization first.</p>}
          {handoffError && <p role="alert" className="text-[12px] text-red-600">{handoffError}</p>}
          <footer className="flex justify-end gap-2"><PageActionButton onClick={() => setHandoffOpen(false)}>Cancel</PageActionButton><button type="submit" disabled={!handoffRecipient || !handoffOrganization} className="rounded-md border-2 border-[#D3E1EC] px-3 py-1 text-[14px] font-semibold text-[#7288A3] disabled:opacity-40">Transfer conversation</button></footer>
        </form>
      </div>}
      {previewAttachment && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#10233A]/30 p-4" onClick={() => setPreviewAttachment(null)}>
        <section role="dialog" aria-modal="true" aria-label={`Attachment preview: ${previewAttachment.name}`} className="flex h-[90vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-[#D3E1EC] bg-white shadow-xl" onClick={event => event.stopPropagation()}>
          <header className="flex shrink-0 items-center gap-4 border-b border-[#D3E1EC] px-5 py-3">
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#10233A]">{previewAttachment.name}</h2>
            {attachmentPreviewUrl && <a href={attachmentPreviewUrl} download={previewAttachment.name} className="text-[13px] font-semibold text-[#007EA7]">Download</a>}
            <button type="button" aria-label="Close attachment preview" onClick={() => setPreviewAttachment(null)} className="text-[#7288A3]"><X size={22} /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto bg-[#F8FDFF]">
            {attachmentPreviewError ? <p role="alert" className="p-6 text-[14px] text-red-600">{attachmentPreviewError}</p> : !attachmentPreviewUrl ? <p className="p-6 text-[14px] text-[#7288A3]">Loading document…</p> : /\.pdf$/i.test(previewAttachment.name) ? <iframe title={previewAttachment.name} src={attachmentPreviewUrl} className="h-full w-full border-0" /> : /\.tiff?$/i.test(previewAttachment.name) ? <div className="p-6 text-[14px] text-[#7288A3]">TIFF preview is not supported by all browsers. <a href={attachmentPreviewUrl} download={previewAttachment.name} className="text-[#007EA7]">Download document</a></div> : <img src={attachmentPreviewUrl} alt={previewAttachment.name} className="mx-auto max-h-full max-w-full object-contain" />}
          </div>
        </section>
      </div>}
      {newChatOpen && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#10233A]/20 p-6" onClick={() => setNewChatOpen(false)}>
        <form role="dialog" aria-modal="true" aria-label="New chat" className="flex w-full max-w-[480px] flex-col gap-4 rounded-xl border border-[#D3E1EC] bg-white p-6 text-[12px] text-[#10233A] shadow-xl" onClick={event => event.stopPropagation()} onSubmit={async event => {
          event.preventDefault();
          if (creatingChat) return;
          setCreatingChat(true);
          try {
            if (!talkTo || (talkTo !== 'AI' && !canChooseAudience(talkTo))) throw new Error('Select who you want to talk to.');
            if (!effectiveChatSubject.trim()) { setNewChatError('Enter a Subject or select a related record.'); return; }
            const context = await createContextChat(organization, effectiveRecipientId, subject, chatSubject);
            setSelected(context); setSearch(''); setNewChatOpen(false);
          } catch (error) { setNewChatError(error instanceof Error ? error.message : 'Unable to create chat.'); }
          finally { setCreatingChat(false); }
        }}>
          <header className="flex items-center justify-between"><h2 className="text-[22px] font-semibold">New chat</h2><button type="button" aria-label="Close new chat" onClick={() => setNewChatOpen(false)}><X size={22} /></button></header>
          <div className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Organization <span className="text-red-600">*</span></span>
            <SearchableSelect selectionIndicator="checkbox" ariaLabel="Chat organization" value={effectiveOrganizationId} options={availableCompanies.map(company => ({ value: company.id, label: `${company.name}${company.company_code ? ` (${company.company_code})` : ''}` }))} onChange={value => { setOrganizationId(value); setRecipientId(''); setTalkTo(''); setNewChatError(''); }} />
          </div>
          {organization && <div className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Talk to <span className="text-red-600">*</span></span>
            <SearchableSelect selectionIndicator="checkbox" ariaLabel="Talk to" value={talkTo} options={[{ value: 'AI', label: 'AI (Artificial intelligence)' }, ...(canChooseAudience('External users') ? [{ value: 'External users', label: 'Client' }] : []), ...(canChooseAudience('Internal users') ? [{ value: 'Internal users', label: 'FH accountant' }] : [])]} onChange={value => { setTalkTo(value); setRecipientId(''); }} />
          </div>}
          {organization && canChooseAudience(talkTo) && <div className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Participant <span className="text-red-600">*</span></span>
            <SearchableSelect selectionIndicator="checkbox" ariaLabel="Chat participant" value={effectiveRecipientId} options={recipients.map(user => ({ value: user.id, label: `${user.name} (${user.email})` }))} onChange={setRecipientId} emptyMessage="No eligible participants assigned to this organization" />
          </div>}
          <div className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Related object <span className="text-[#7288A3]">(optional)</span></span>
            <SearchableSelect
              selectionIndicator="checkbox"
              ariaLabel="Related object module"
              disabled={!organization || creatingChat}
              value={relatedModule}
              onChange={value => { setRelatedModule(value); setSubject(''); }}
              placeholder="Select module"
              menuClassName="!top-auto bottom-[calc(100%+4px)] !max-h-[min(260px,40vh)]"
              options={[{ value: '', label: 'No related object' }, ...relatedModules]}
            />
          </div>
          {relatedModule && <div className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Record <span className="text-[#7288A3]">(optional)</span></span>
            <SearchableSelect selectionIndicator="checkbox" ariaLabel="Related object record"
              disabled={!organization || creatingChat} value={subject} onChange={setSubject}
              placeholder="Select record"
              menuClassName="!top-auto bottom-[calc(100%+4px)] !max-h-[min(260px,40vh)]"
              options={[{ value: '', label: 'No specific record' }, ...relatedObjects.filter(object => object.type === relatedModule).map(object => ({ value: object.id, label: object.label }))]}
              emptyMessage="No available records in this module" />
          </div>}
          <label className="flex min-w-0 flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Subject <span className="font-normal text-[#7288A3]">(optional with a related record)</span></span>
            <input aria-label="Subject" value={effectiveChatSubject} onChange={event => { setChatSubject(event.target.value); setNewChatError(''); }} placeholder="Enter conversation subject" className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] text-[14px] font-medium outline-none focus:border-[#007EA7]" />
          </label>
          {newChatError && <p role="alert" className="text-red-600">{newChatError}</p>}
          <footer className="flex justify-end gap-2"><PageActionButton onClick={() => setNewChatOpen(false)}>Cancel</PageActionButton><button type="submit" disabled={creatingChat || !canStartChat || !organization || (talkTo !== 'AI' && !recipients.some(user => user.id === effectiveRecipientId))} className="h-[34px] rounded border-2 border-[#D3E1EC] px-3 font-semibold text-[#7288A3] hover:border-[#007EA7] disabled:opacity-40">Start chat</button></footer>
        </form>
      </div>}
    </section>
  );
}
