import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, MessageSquare, Search, Send } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { SystemBreadcrumb } from './SystemNavigation';
import {
  invoiceChatPersistenceKey,
  loadChatConversations,
  type InvoiceChatContext,
  type InvoiceChatMessage,
} from './invoices/invoiceChat';
import { supabase, type Company, type DbDocument } from '../lib/supabase';

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

function conversationCompany(context: InvoiceChatContext) {
  return context.companyName || context.title.split('/')[0]?.trim() || 'Other';
}

function conversationSubject(context: InvoiceChatContext) {
  return context.subject || context.title.split('/').slice(1).join('/').trim() || context.title;
}

export default function ChatsView({
  currentUserName,
  conversation,
}: {
  currentUserName: string;
  conversation?: InvoiceChatContext | null;
}) {
  const [conversations, setConversations] = useState<InvoiceChatContext[]>(() => [
    ...loadChatConversations(),
    GENERAL_CHAT,
  ]);
  const [selected, setSelected] = useState<InvoiceChatContext | null>(conversation ?? null);
  const [messages, setMessages] = useState<StoredChatMessage[]>(() => readMessages(conversation ?? null));
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const refresh = () => {
      const registered = loadChatConversations();
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
    setSelected(conversation ?? null);
  }, [conversation]);

  useEffect(() => {
    setMessages(readMessages(selected));
    setDraft('');
  }, [selected]);

  const visibleConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const unique = conversations
      .filter(
        (item, index, all) => all.findIndex((candidate) => candidate.storageKey === item.storageKey) === index,
      )
      .filter((item) =>
        readMessages(item).some(
          (message) => message.direction === 'received' || message.direction === 'incoming',
        ),
      );
    if (!term) return unique;
    return unique.filter((item) =>
      `${conversationCompany(item)} ${conversationSubject(item)} ${item.sourceType || 'Document'}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [conversations, search]);

  const grouped = useMemo(() => {
    return visibleConversations.reduce<Record<string, InvoiceChatContext[]>>((groups, item) => {
      const company = conversationCompany(item);
      (groups[company] ??= []).push(item);
      return groups;
    }, {});
  }, [visibleConversations]);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selected) return;
    const message: StoredChatMessage = {
      id: `message-${Date.now()}`,
      author: currentUserName,
      date: formatTimestamp(new Date()),
      text,
      direction: selected.storageKey === '__general__' ? 'outgoing' : 'written',
    };
    const next = [...messages, message];
    setMessages(next);
    window.localStorage.setItem(
      invoiceChatPersistenceKey(selected.storageKey),
      JSON.stringify(next),
    );
    setDraft('');
  };

  return (
    <section
      className="relative flex h-screen min-h-0 flex-col gap-8 overflow-hidden bg-white px-4 py-14 font-montserrat sm:px-8 lg:px-[72px]"
    >
      <PageHeader title="Chats" />
      <SystemBreadcrumb items={["Chats"]} />

      <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)] overflow-hidden rounded-xl border border-[#D3E1EC] bg-white">
        <aside className="flex min-h-0 flex-col border-r border-[#E5EDF9] bg-[#FCFDFE]">
          <div className="border-b border-[#E5EDF9] p-4">
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
                    return (
                      <button
                        key={item.storageKey}
                        type="button"
                        onClick={() => setSelected(item)}
                        className={`flex min-h-[64px] w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? 'bg-[#E6F2F6]' : 'hover:bg-[#F2F7FC]'}`}
                      >
                        <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${active ? 'bg-[#007EA7] text-white' : 'bg-white text-[#7288A3]'}`}>
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-semibold text-[#10233A]">{conversationSubject(item)}</span>
                            <span className="flex-shrink-0 text-[9px] font-semibold uppercase text-[#007EA7]">{sourceType}</span>
                          </span>
                          <span className="mt-1 block truncate text-[11px] font-medium text-[#8FA6B8]">{lastMessage?.text}</span>
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
              <div className="flex h-[68px] flex-shrink-0 items-center gap-3 border-b border-[#E5EDF9] px-6">
                <button type="button" aria-label="Back to chat list" onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F2F7FC] hover:text-[#007EA7]">
                  <ArrowLeft size={17} />
                </button>
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold text-[#10233A]">{conversationSubject(selected)}</h2>
                  <p className="mt-0.5 text-[11px] font-medium text-[#7288A3]">{conversationCompany(selected)} · {selected.sourceType || 'Document'}</p>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
                {messages.length === 0 && (
                  <div className="m-auto text-center text-[12px] font-medium text-[#A1B6C6]">No messages in this conversation yet.</div>
                )}
                {messages.map((message) => {
                  const outgoing = message.direction === 'outgoing' || message.direction === 'written';
                  return (
                    <article key={message.id} className={`flex w-full flex-col ${outgoing ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[72%] rounded-xl px-4 py-2.5 text-[12px] font-normal leading-5 text-[#183047] ${outgoing ? 'bg-[#EDF6F8]' : 'border border-[#DCE7EF] bg-[#FCFDFE]'}`}>
                        {message.text}
                      </div>
                      <p className="mt-1 px-1 text-[10px] font-medium leading-4 text-[#8FA6B8]">{message.author} - {message.timestamp || message.date || '—'}</p>
                    </article>
                  );
                })}
              </div>

              <form onSubmit={sendMessage} className="flex flex-shrink-0 items-stretch gap-2.5 border-t border-[#E5EDF9] bg-white p-4">
                <label htmlFor="chat-message" className="sr-only">Type a message</label>
                <input id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message..." autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-[#CEDDE8] bg-white px-3.5 py-2 text-[12px] font-normal text-[#183047] outline-none placeholder:text-[#A8BCCB] focus:border-[#007EA7] focus:ring-2 focus:ring-[#DDF1F6]" />
                <button type="submit" disabled={!draft.trim()} aria-label="Send message" title="Send message" className="flex w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[#CEDDE8] bg-white text-[#7288A3] transition-colors hover:border-[#9EB5C6] hover:bg-[#F7FAFC] hover:text-[#007EA7] active:border-[#007EA7] active:bg-[#007EA7] active:text-white disabled:cursor-not-allowed disabled:opacity-45">
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
    </section>
  );
}
