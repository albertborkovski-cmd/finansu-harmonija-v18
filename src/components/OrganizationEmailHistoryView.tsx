import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Eye, MailCheck, RotateCcw, Send, X } from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import RefreshAllButton from "./RefreshAllButton";
import { ColumnSettingsButton, ImportDataButton } from "./ScopedActionButtons";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import { importMenuRecords } from "../lib/menuImport";
import {
  appendOrganizationEmailHistory,
  loadOrganizationEmailHistoryForOrganization,
  type OrganizationEmailHistoryEntry,
} from "../lib/organizationEmail";

type Props = { organizationId: string; organizationName: string };
type HistoryColumnKey = "sentAt" | "recipient" | "recipientEmail" | "templateName" | "language" | "subject" | "documentReference" | "responseStatus";

const HISTORY_COLUMNS: ColConfig[] = [
  { key: "sentAt", label: "Sent date", width: 170, visible: true },
  { key: "recipient", label: "Recipient", width: 180, visible: true },
  { key: "recipientEmail", label: "Email", width: 220, visible: true },
  { key: "templateName", label: "Template", width: 180, visible: true },
  { key: "language", label: "Language", width: 110, visible: true },
  { key: "subject", label: "Subject", width: 260, visible: true },
  { key: "documentReference", label: "Document", width: 170, visible: true },
  { key: "responseStatus", label: "Response status", width: 180, visible: true },
];
const ACTIONS_WIDTH = 174;

function responseStatus(entry: OrganizationEmailHistoryEntry) {
  if (entry.responseDecision === "matches") return "Balance confirmed";
  if (entry.responseDecision === "differs") return "Discrepancy submitted";
  return entry.responseReceivedAt ? "Response received" : "Awaiting response";
}

function historySortValue(entry: OrganizationEmailHistoryEntry, key: HistoryColumnKey) {
  if (key === "responseStatus") return responseStatus(entry);
  if (key === "sentAt") return new Date(entry.sentAt);
  return entry[key] ?? "";
}

function historyCellValue(entry: OrganizationEmailHistoryEntry, key: HistoryColumnKey) {
  if (key === "sentAt") return new Date(entry.sentAt).toLocaleString();
  if (key === "responseStatus") return responseStatus(entry);
  return entry[key] || "—";
}

export default function OrganizationEmailHistoryView({ organizationId, organizationName }: Props) {
  const [history, setHistory] = useState<OrganizationEmailHistoryEntry[]>(() =>
    loadOrganizationEmailHistoryForOrganization(organizationId, organizationName),
  );
  const [columns, setColumns] = useState<ColConfig[]>(HISTORY_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [resending, setResending] = useState<OrganizationEmailHistoryEntry | null>(null);
  const [viewing, setViewing] = useState<OrganizationEmailHistoryEntry | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(history, historySortValue);

  useEffect(() => {
    const refresh = () => setHistory(loadOrganizationEmailHistoryForOrganization(organizationId, organizationName));
    refresh();
    window.addEventListener("organization-email-history-updated", refresh);
    return () => window.removeEventListener("organization-email-history-updated", refresh);
  }, [organizationId, organizationName]);

  const recipientCount = useMemo(() => new Set(
    history.map((entry) => entry.recipientEmail.trim().toLocaleLowerCase()).filter(Boolean),
  ).size, [history]);
  const visibleColumns = columns.filter((column) => column.visible);
  const tableWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + ACTIONS_WIDTH;

  return (
    <section className="flex w-full flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="Sent emails" value={String(history.length)} description={`Sent by ${organizationName}`} />
        <SummaryCard label="Recipients" value={String(recipientCount)} description="Unique email recipients" />
      </div>

      <div className="flex min-h-5 justify-end gap-4">
        <ColumnSettingsButton onClick={() => setShowColumns(true)} />
        <ImportDataButton
          disabled={history.length === 0}
          onClick={() =>
            importMenuRecords(
              `organization:${organizationId}:sent-email-history`,
              history.map((entry) => entry.id),
            )
          }
        />
        <RefreshAllButton
          onRefresh={() =>
            setHistory(
              loadOrganizationEmailHistoryForOrganization(
                organizationId,
                organizationName,
              ),
            )
          }
        />
      </div>

      <div className="overflow-hidden bg-white">
        <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
          <div style={{ minWidth: tableWidth }}>
            <div className="flex h-10 items-center border-b border-[#D3E1EC] bg-white">
              {visibleColumns.map((column, visibleIndex) => {
                const realIndex = columns.findIndex((item) => item.key === column.key);
                const key = column.key as HistoryColumnKey;
                return (
                  <div key={column.key} style={{ width: column.width }} className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex > 0 ? "border-l border-[#D3E1EC]" : ""}`}>
                    <span className="min-w-0 whitespace-normal leading-[18px]">{column.label}</span>
                    <ColumnSortButton columnLabel={column.label} direction={directionFor(key)} onDirectionChange={(direction) => changeSort(key, direction)} />
                    <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
                  </div>
                );
              })}
              <div style={{ width: ACTIONS_WIDTH }} className="flex-shrink-0" />
            </div>

            {sortedRows.map((entry, index) => (
              <div key={entry.id} className={`flex min-h-12 items-center font-montserrat text-[12px] font-medium text-[#10233A] transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}>
                {visibleColumns.map((column) => {
                  const key = column.key as HistoryColumnKey;
                  const value = String(historyCellValue(entry, key));
                  const isStatus = key === "responseStatus";
                  return (
                    <div key={column.key} style={{ width: column.width }} className="flex-shrink-0 px-3">
                      <span className={`block truncate ${isStatus ? (entry.responseReceivedAt ? "text-[#0A9F79]" : "text-[#C18400]") : ""}`} title={value}>{value}</span>
                    </div>
                  );
                })}
                <div style={{ width: ACTIONS_WIDTH }} className="flex flex-shrink-0 items-center justify-end gap-2 pr-3">
                  <button type="button" title="View email" aria-label={`View email sent to ${entry.recipientEmail}`} onClick={() => setViewing(entry)} className="flex h-7 items-center gap-1.5 rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[11px] font-semibold text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]">
                    <Eye size={13} /> View
                  </button>
                  {!entry.responseReceivedAt ? (
                    <button type="button" title="Resend email" aria-label={`Resend email to ${entry.recipientEmail}`} onClick={() => { setViewing(null); setResending(entry); }} className="flex h-7 items-center gap-1.5 rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[11px] font-semibold text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]">
                      <RotateCcw size={13} /> Resend
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0F7FA] text-[#7288A3]"><MailCheck size={19} /></span>
            <div>
              <p className="font-montserrat text-[13px] font-semibold text-[#10233A]">No sent emails yet</p>
              <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">Messages sent on behalf of this organization will appear here.</p>
            </div>
          </div>
        ) : null}
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} fixed={false} />

      {showColumns ? (
        <ColumnSettingsPanel columns={columns} defaultColumns={HISTORY_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />
      ) : null}
      {resending ? (
        <ResendEmailPanel entry={resending} organizationId={organizationId} organizationName={organizationName} onClose={() => setResending(null)} />
      ) : null}
      {viewing ? (
        <EmailContentPanel
          entry={viewing}
          organizationName={organizationName}
          onClose={() => setViewing(null)}
          onResend={() => {
            setViewing(null);
            setResending(viewing);
          }}
        />
      ) : null}
    </section>
  );
}

function EmailContentPanel({ entry, organizationName, onClose, onResend }: { entry: OrganizationEmailHistoryEntry; organizationName: string; onClose: () => void; onResend: () => void }) {
  const hasResponse = Boolean(entry.responseReceivedAt);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-transparent">
      <aside className="flex h-full w-full max-w-[680px] flex-col border-l border-[#E5EDF9] bg-white shadow-[-8px_0_24px_rgba(16,35,58,0.10)]">
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#E5EDF9] px-6">
          <div>
            <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Sent email</h2>
            <p className="font-montserrat text-[11px] font-medium text-[#7288A3]">Full message content and delivery information</p>
          </div>
          <button type="button" aria-label="Close email content" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#10233A]"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Sent date" value={new Date(entry.sentAt).toLocaleString()} />
            <ReadOnlyField label="Sender organization" value={entry.sender || organizationName} />
            <ReadOnlyField label="Sender email" value={entry.senderEmail || "—"} />
            <ReadOnlyField label="Recipient" value={entry.recipient} />
            <ReadOnlyField label="Recipient email" value={entry.recipientEmail} />
            <ReadOnlyField label="Template" value={entry.templateName} />
            <ReadOnlyField label="Language" value={entry.language} />
            <ReadOnlyField label="Document" value={entry.documentReference} />
            <div className="flex flex-col gap-1.5">
              <span className="font-montserrat text-[12px] font-medium text-[#7288A3]">Response status</span>
              <span className={`flex min-h-9 items-center rounded-md bg-[#F8FDFF] px-3 font-montserrat text-[12px] font-semibold ${hasResponse ? "text-[#0A9F79]" : "text-[#C18400]"}`}>
                {responseStatus(entry)}
              </span>
            </div>
          </div>

          <div className="mt-6 border-t border-[#E5EDF9] pt-5">
            <p className="font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Subject</p>
            <p className="mt-2 font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">{entry.subject || "—"}</p>
          </div>

          <div className="mt-5">
            <p className="font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Message</p>
            <div className="mt-2 min-h-[180px] whitespace-pre-wrap rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] p-4 font-montserrat text-[12px] font-medium leading-5 text-[#10233A]">
              {entry.body || "—"}
            </div>
          </div>

          {entry.portalUrl ? (
            <div className="mt-5">
              <p className="font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Reconciliation portal</p>
              <a href={entry.portalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-montserrat text-[12px] font-semibold text-[#007EA7] hover:underline">
                Open reconciliation document <ExternalLink size={14} />
              </a>
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-3 border-t border-[#E5EDF9] p-6">
          <button type="button" onClick={onClose} className="h-9 rounded-md border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[13px] font-semibold text-[#7288A3]">Close</button>
          {!hasResponse ? (
            <button type="button" onClick={onResend} className="flex h-9 items-center gap-2 rounded-md bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white hover:bg-[#006A8E]"><RotateCcw size={14} />Resend</button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

function ResendEmailPanel({ entry, organizationId, organizationName, onClose }: { entry: OrganizationEmailHistoryEntry; organizationId: string; organizationName: string; onClose: () => void }) {
  const [email, setEmail] = useState(entry.recipientEmail);
  const [subject, setSubject] = useState(entry.subject);
  const [message, setMessage] = useState(entry.body);
  const canSend = Boolean(email.trim() && subject.trim() && message.trim());

  const resend = () => {
    if (!canSend) return;
    appendOrganizationEmailHistory({
      ...entry,
      id: crypto.randomUUID(),
      organizationId,
      sender: organizationName,
      sentAt: new Date().toISOString(),
      recipientEmail: email.trim(),
      subject: subject.trim(),
      body: message.trim(),
      responseReceivedAt: undefined,
      resendOfId: entry.id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-transparent">
      <aside className="flex h-full w-full max-w-[620px] flex-col border-l border-[#E5EDF9] bg-white shadow-[-8px_0_24px_rgba(16,35,58,0.10)]">
        <header className="flex min-h-[72px] items-center justify-between border-b border-[#E5EDF9] px-6">
          <div>
            <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Resend email</h2>
            <p className="font-montserrat text-[11px] font-medium text-[#7288A3]">Review the previous message before sending it again.</p>
          </div>
          <button type="button" aria-label="Close resend email" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#10233A]"><X size={20} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          <ReadOnlyField label="Sender organization" value={organizationName} />
          <ReadOnlyField label="Recipient" value={entry.recipient} />
          <Field label="Recipient email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-9 rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" /></Field>
          <Field label="Subject"><input value={subject} onChange={(event) => setSubject(event.target.value)} className="h-9 rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" /></Field>
          <Field label="Message"><textarea rows={14} value={message} onChange={(event) => setMessage(event.target.value)} className="resize-y rounded-md border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" /></Field>
        </div>
        <footer className="flex justify-end gap-3 border-t border-[#E5EDF9] p-6">
          <button type="button" onClick={onClose} className="h-9 rounded-md border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[13px] font-semibold text-[#7288A3]">Cancel</button>
          <button type="button" disabled={!canSend} onClick={resend} className="flex h-9 items-center gap-2 rounded-md bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white hover:bg-[#006A8E] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"><Send size={14} />Send again</button>
        </footer>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">{label}</span>{children}</label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1.5"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">{label}</span><span className="flex min-h-9 items-center rounded-md bg-[#F8FDFF] px-3 font-montserrat text-[12px] font-medium text-[#10233A]">{value || "—"}</span></div>;
}

function SummaryCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#D3E1EC] bg-white px-5 py-4">
      <p className="font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">{label}</p>
      <p className="mt-2 font-montserrat text-[26px] font-semibold leading-8 text-[#10233A]">{value}</p>
      <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">{description}</p>
    </div>
  );
}
