import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  appendOrganizationEmailHistory,
  loadDebtReconciliationPortalPreview,
  loadOrganizationEmailHistory,
  markOrganizationEmailResponseReceived,
  type OrganizationEmailPartyDetails,
} from "../lib/organizationEmail";
import { supabase, type Company } from "../lib/supabase";

const RESPONSE_KEY = "finansu-harmonija:v12:debt-reconciliation-responses";
const COUNTERPARTIES_STORAGE_KEY = "finansu-harmonija:v7:settings:counterparties";

type ReconciliationDecision = "matches" | "differs";

function parseBalance(value: string) {
  const amount = Number.parseFloat(value.replace(/[^\d.,-]/g, "").replace(",", "."));
  const currency = value.match(/[A-Z]{3}/)?.[0] ?? "EUR";
  return { amount: Number.isFinite(amount) ? amount : 0, currency };
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function readResponses() {
  try {
    const value = JSON.parse(localStorage.getItem(RESPONSE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function companyParty(company?: Company): OrganizationEmailPartyDetails | undefined {
  if (!company) return undefined;
  return {
    name: company.name,
    companyCode: company.company_code,
    vatCode: company.vat_code,
    address: company.address,
    email: company.email,
    phone: company.phone,
  };
}

function mergePartyDetails(
  name: string,
  fallbackEmail: string,
  saved?: OrganizationEmailPartyDetails,
  live?: OrganizationEmailPartyDetails,
): OrganizationEmailPartyDetails {
  return {
    name: live?.name || saved?.name || name,
    companyCode: live?.companyCode || saved?.companyCode || "",
    vatCode: live?.vatCode || saved?.vatCode || "",
    address: live?.address || saved?.address || "",
    email: live?.email || saved?.email || fallbackEmail,
    phone: live?.phone || saved?.phone || "",
  };
}

export default function DebtReconciliationPortalView() {
  const path = window.location.pathname;
  const historyEntry = loadOrganizationEmailHistory().find((item) => {
    try {
      return new URL(item.portalUrl).pathname === path;
    } catch {
      return false;
    }
  });
  const previewEntry = loadDebtReconciliationPortalPreview(path);
  const entry = historyEntry ?? previewEntry;
  const isPreview = !historyEntry && Boolean(previewEntry);
  const [comment, setComment] = useState("");
  const [submittedDecision, setSubmittedDecision] = useState<ReconciliationDecision | null>(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [liveSender, setLiveSender] = useState<OrganizationEmailPartyDetails>();
  const [liveRecipient, setLiveRecipient] = useState<OrganizationEmailPartyDetails>();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const balance = parseBalance(entry?.debtBalance ?? "0 EUR");
  const statementDate = entry?.reconciliationDate || "—";
  const periodStart = statementDate === "—" ? "—" : `${statementDate.slice(0, 4)}-01-01`;
  const entrySender = entry?.sender ?? "";
  const entryRecipient = entry?.recipient ?? "";
  const senderParty = mergePartyDetails(entry?.sender ?? "", entry?.senderEmail ?? "", entry?.senderDetails, liveSender);
  const recipientParty = mergePartyDetails(entry?.recipient ?? "", entry?.recipientEmail ?? "", entry?.recipientDetails, liveRecipient);

  useEffect(() => {
    if (!entrySender && !entryRecipient) return;
    let active = true;

    const loadCards = async () => {
      let storedCounterparties: Company[] = [];
      try {
        const parsed = JSON.parse(window.localStorage.getItem(COUNTERPARTIES_STORAGE_KEY) ?? "[]");
        storedCounterparties = Array.isArray(parsed) ? parsed : [];
      } catch {
        storedCounterparties = [];
      }

      const normalize = (value: string) => value.trim().toLocaleLowerCase();
      const storedRecipient = storedCounterparties.find((company) => normalize(company.name) === normalize(entryRecipient));
      if (active && storedRecipient) setLiveRecipient(companyParty(storedRecipient));

      const { data } = await supabase
        .from("companies")
        .select("*")
        .in("name", [entrySender, entryRecipient]);
      if (!active || !Array.isArray(data)) return;
      const companies = data as unknown as Company[];
      const sender = companies.find((company) => normalize(company.name) === normalize(entrySender));
      const recipient = companies.find((company) => normalize(company.name) === normalize(entryRecipient));
      if (sender) setLiveSender(companyParty(sender));
      if (recipient && !storedRecipient) setLiveRecipient(companyParty(recipient));
    };

    void loadCards();
    return () => { active = false; };
  }, [entryRecipient, entrySender]);

  const submit = (decision: ReconciliationDecision) => {
    if (!entry || (decision === "differs" && !comment.trim())) return;
    const submittedAt = new Date().toISOString();
    const responseEntryId = historyEntry?.id ?? crypto.randomUUID();
    if (!historyEntry) {
      appendOrganizationEmailHistory({
        ...entry,
        id: responseEntryId,
      });
    }
    localStorage.setItem(
      RESPONSE_KEY,
      JSON.stringify([
        {
          id: crypto.randomUUID(),
          portalPath: path,
          submittedAt,
          decision,
          confirmedBalance: entry.debtBalance,
          comment: comment.trim(),
        },
        ...readResponses(),
      ]),
    );
    markOrganizationEmailResponseReceived(responseEntryId, submittedAt, decision);
    setSubmittedDecision(decision);
  };

  if (!entry) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F8FB] px-5 py-10">
        <section className="w-full max-w-[620px] rounded-xl border border-[#D3E1EC] bg-white p-8 text-center shadow-[0_18px_48px_rgba(16,35,58,0.08)]">
          <AlertCircle size={42} className="mx-auto text-[#C18400]" />
          <h1 className="mt-4 font-montserrat text-[22px] font-semibold text-[#10233A]">
            Reconciliation link unavailable
          </h1>
          <p className="mt-2 font-montserrat text-[13px] font-medium text-[#7288A3]">
            This reconciliation link is not active or has not been sent yet.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F8FB] px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        {isPreview ? (
          <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-[#B7DCE9] bg-[#E7F4F9] px-4 py-3 font-montserrat text-[12px] font-medium text-[#10233A]">
            <span><strong className="font-semibold text-[#007EA7]">Preview mode.</strong> This is how the reconciliation portal will appear to the counterparty after the email is sent.</span>
            <span className="flex-shrink-0 rounded bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#007EA7]">Not sent</span>
          </div>
        ) : null}
        {submittedDecision ? (
          <div className="flex min-h-12 items-center gap-3 rounded-lg border border-[#A9E3D5] bg-[#E8FAF5] px-4 py-3 font-montserrat text-[12px] font-medium text-[#10233A]">
            <CheckCircle2 size={18} className="flex-shrink-0 text-[#0A9F79]" />
            <span><strong className="font-semibold">Reconciliation submitted.</strong> Your response was saved and sent to {entry.sender}.</span>
          </div>
        ) : null}
        <header className="flex flex-col gap-4 rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-[0_10px_30px_rgba(16,35,58,0.06)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E7F4F9] text-[#007EA7]">
              <FileCheck2 size={21} />
            </span>
            <div>
              <h1 className="font-montserrat text-[26px] font-semibold leading-9 text-[#10233A] sm:text-[30px]">
                Mutual debt reconciliation statement
              </h1>
            </div>
          </div>
          <p
            className={`font-montserrat text-[14px] font-medium leading-6 ${
              balance.amount > 0 ? "text-[#D92D20]" : "text-[#10233A]"
            }`}
          >
            According to our accounting records as of {statementDate}, {entry.recipient} owes {entry.sender}{" "}
            <strong className="font-semibold">{entry.debtBalance}</strong>.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-[#D3E1EC] bg-white p-6">
            <h2 className="font-montserrat text-[17px] font-semibold text-[#10233A]">
              The balance matches
            </h2>
            <p className="mt-2 flex-1 font-montserrat text-[12px] font-medium leading-5 text-[#7288A3]">
              Confirm that the balance in your accounting records matches the balance shown in this statement.
            </p>
            <button
              type="button"
              disabled={Boolean(submittedDecision)}
              onClick={() => submit("matches")}
              className={`mt-5 flex h-10 items-center justify-center gap-2 rounded-md px-5 font-montserrat text-[13px] font-semibold transition-colors ${submittedDecision === "differs" ? "cursor-not-allowed bg-[#E5EDF9] text-[#7288A3]" : "bg-[#007EA7] text-white hover:bg-[#006A8E] active:bg-[#005B79]"}`}
            >
              <CheckCircle2 size={16} />
              {submittedDecision === "matches" ? "Balance confirmed" : "Confirm matching balance"}
            </button>
          </div>

          <div className="flex flex-col rounded-xl border border-[#D3E1EC] bg-white p-6">
            <h2 className="font-montserrat text-[17px] font-semibold text-[#10233A]">
              The balance differs
            </h2>
            <p className="mt-2 font-montserrat text-[12px] font-medium leading-5 text-[#7288A3]">
              Describe the difference or provide information about missing documents.
            </p>
            <div className="mt-4 rounded-lg bg-[#F8FDFF] px-4 py-3 font-montserrat text-[12px] font-medium leading-5 text-[#10233A]">
              <p className="font-semibold">If the balance does not match:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Forward the missing invoices to{" "}
                  {senderParty.email ? (
                    <a href={`mailto:${senderParty.email}`} className="font-semibold text-[#007EA7] hover:underline">{senderParty.email}</a>
                  ) : (
                    <span className="font-semibold text-[#C18400]">the organization email (not configured)</span>
                  )}.
                </li>
                <li>
                  Upload the missing invoices through the{" "}
                  <button type="button" onClick={() => setUploadPanelOpen(true)} className="font-semibold text-[#007EA7] underline hover:text-[#006A8E]">portal</button>{" "}
                  (click the link).
                </li>
              </ul>
            </div>
            <textarea
              rows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Enter a comment or correction…"
              className="mt-4 resize-y rounded-md border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
            />
            <button
              type="button"
              disabled={Boolean(submittedDecision) || !comment.trim()}
              onClick={() => submit("differs")}
              className={`mt-4 flex h-10 items-center justify-center rounded-md border-2 px-5 font-montserrat text-[13px] font-semibold transition-colors ${submittedDecision === "differs" ? "border-[#007EA7] bg-[#007EA7] text-white" : "border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"}`}
            >
              {submittedDecision === "differs" ? "Discrepancy submitted" : "Submit discrepancy"}
            </button>
          </div>
        </section>

        <article className="overflow-hidden rounded-xl border border-[#D3E1EC] bg-white shadow-[0_10px_30px_rgba(16,35,58,0.05)]">
          <div className="border-b border-[#E5EDF9] px-6 py-7 text-center sm:px-8">
            <p className="font-montserrat text-[11px] font-medium text-[#7288A3]">
              Statement generated: {new Date(entry.sentAt).toLocaleString()}
            </p>
            <h2 className="mt-3 font-montserrat text-[22px] font-semibold uppercase text-[#10233A]">
              Mutual debt reconciliation statement
            </h2>
            <p className="mt-2 font-montserrat text-[15px] font-semibold text-[#007EA7]">
              {statementDate}
            </p>
          </div>

          <div className="grid gap-8 border-b border-[#E5EDF9] px-6 py-7 sm:grid-cols-2 sm:px-8">
            <Party title="From" details={senderParty} />
            <Party title="To" details={recipientParty} />
          </div>

          <div className="px-6 py-7 sm:px-8">
            <h3 className="text-center font-montserrat text-[14px] font-semibold text-[#10233A]">
              Period {periodStart} – {statementDate}
            </h3>
            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[125px_175px_minmax(220px,1fr)_90px_120px_120px_120px_120px] items-center gap-3 border-b border-[#D3E1EC] px-4 py-3 font-montserrat text-[11px] font-semibold text-[#7288A3]">
                  <span>Date</span><span>Document</span><span>Operation</span><span className="text-center">Currency</span><span className="text-right">Amount</span><span className="text-right">Balance</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                </div>
                <div className="grid min-h-12 grid-cols-[125px_175px_minmax(220px,1fr)_90px_120px_120px_120px_120px] items-center gap-3 rounded-lg bg-[#F8FDFF] px-4 font-montserrat text-[12px] font-medium text-[#10233A]">
                  <span>{statementDate}</span>
                  <span className="truncate" title={entry.documentReference || "—"}>{entry.documentReference || "—"}</span>
                  <span className="truncate" title="Debt reconciliation">Debt reconciliation</span>
                  <span className="text-center">{balance.currency}</span>
                  <span className="text-right tabular-nums">{formatAmount(Math.abs(balance.amount))}</span>
                  <span className="text-right tabular-nums">{formatAmount(balance.amount)}</span>
                  <span className="text-right tabular-nums">{formatAmount(Math.max(balance.amount, 0))}</span>
                  <span className="text-right tabular-nums">{formatAmount(Math.max(-balance.amount, 0))}</span>
                </div>
                <div className="mt-2 flex min-h-12 items-center justify-between rounded-lg border border-[#D3E1EC] px-4 font-montserrat text-[12px] font-semibold text-[#10233A]">
                  <span>Balance as of {statementDate}, {balance.currency}</span>
                  <span className="text-[#007EA7]">{formatAmount(balance.amount)}</span>
                </div>
              </div>
            </div>

            <p className="mt-6 rounded-lg bg-[#F8FDFF] px-4 py-3 font-montserrat text-[13px] font-medium leading-6 text-[#10233A]">
              As of and including {statementDate}, {recipientParty.name} owes {senderParty.name}{" "}
              <strong className="font-semibold text-[#007EA7]">{formatAmount(balance.amount)} {balance.currency}</strong>.
            </p>
          </div>

          <div className="border-t border-[#E5EDF9] px-6 py-7 sm:px-8">
            <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">Signatures of the parties:</h3>
            <div className="mt-5 grid gap-8 sm:grid-cols-2">
              <Signature details={senderParty} />
              <Signature details={recipientParty} />
            </div>
          </div>

          <footer className="border-t border-[#E5EDF9] bg-[#F8FDFF] px-6 py-6 sm:px-8">
            <div className="font-montserrat text-[12px] font-medium leading-5 text-[#10233A]">
              <p>
                <strong className="font-semibold">Attention:</strong> Please immediately forward any invoice(s) that you notice were not included in the reconciliation statement. Send missing invoices to:{" "}
                {senderParty.email ? (
                  <a href={`mailto:${senderParty.email}`} className="font-semibold text-[#007EA7] hover:underline">{senderParty.email}</a>
                ) : (
                  <span className="font-semibold text-[#C18400]">organization email not configured</span>
                )}.
              </p>
              <p className="mt-5">Please confirm the reconciled balance using whichever method is most convenient for you:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[#7288A3]">
                <li>Sign the reconciliation statement using an electronic or mobile signature and return it to us by email.</li>
                <li>Sign the reconciliation statement and send it to the address provided by {senderParty.name}.</li>
                <li>Contact us if your records show a different outstanding balance.</li>
                <li>Send us an email confirming that you agree with the stated balance.</li>
                <li>Click the confirmation button at the top of the portal.</li>
              </ul>
              <p className="mt-5 font-semibold">If we do not receive your confirmation within 10 business days, the intercompany reconciliation balance will be considered correct.</p>
            </div>
          </footer>
        </article>
      </div>

      {uploadPanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-5" onClick={() => setUploadPanelOpen(false)}>
          <section className="flex max-h-[calc(100vh-40px)] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-[#D3E1EC] bg-white shadow-[0_18px_48px_rgba(16,35,58,0.16)]" onClick={(event) => event.stopPropagation()}>
            <header className="flex min-h-[72px] items-center justify-between border-b border-[#E5EDF9] px-6">
              <div>
                <p className="font-montserrat text-[11px] font-semibold uppercase tracking-[0.12em] text-[#007EA7]">Document portal</p>
                <h2 className="mt-1 font-montserrat text-[20px] font-semibold text-[#10233A]">Upload missing invoices</h2>
              </div>
              <button type="button" aria-label="Close document portal" onClick={() => setUploadPanelOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#10233A]"><X size={20} /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <p className="font-montserrat text-[12px] font-medium leading-5 text-[#7288A3]">Add invoices or supporting documents related to this reconciliation.</p>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setUploadDragging(true); }}
                onDragLeave={() => setUploadDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setUploadDragging(false);
                  setUploadedFiles((current) => [...current, ...Array.from(event.dataTransfer.files)]);
                }}
                className={`mt-5 flex min-h-[210px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-5 py-8 transition-colors ${uploadDragging ? "border-[#007EA7] bg-[#F0F9FF]" : "border-[#AFC3D2] bg-[#FCFEFF] hover:border-[#007EA7]"}`}
              >
                <UploadCloud size={30} className="text-[#007EA7]" />
                <span className="text-center font-montserrat text-[13px] font-semibold text-[#10233A]">Click to browse files or drag &amp; drop files here</span>
                <span className="font-montserrat text-[11px] font-medium text-[#7288A3]">PDF, PNG, JPG, JPEG, TIFF</span>
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                className="hidden"
                aria-label="Upload missing invoices"
                onChange={(event) => {
                  setUploadedFiles((current) => [...current, ...Array.from(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />

              {uploadedFiles.length ? (
                <div className="mt-4 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-[#F8FDFF] px-3">
                      <span className="min-w-0 truncate font-montserrat text-[12px] font-medium text-[#10233A]" title={file.name}>{file.name}</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setUploadedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-[#7288A3] hover:bg-white hover:text-[#D90310]"><X size={15} /></button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Party({ title, details }: { title: string; details: OrganizationEmailPartyDetails }) {
  return (
    <section className="min-w-0 text-left">
      <p className="font-montserrat text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">{title}</p>
      <p className="mt-2 break-words font-montserrat text-[15px] font-semibold text-[#10233A]">{details.name || "—"}</p>
      <div className="mt-3 max-w-full space-y-1 font-montserrat text-[12px] font-medium leading-5 text-[#7288A3]">
        <p className="break-words">Company code: {details.companyCode || "—"}</p>
        <p className="break-words">VAT code: {details.vatCode || "—"}</p>
        <p className="break-words">Address: {details.address || "—"}</p>
      </div>
    </section>
  );
}

function Signature({ details }: { details: OrganizationEmailPartyDetails }) {
  return (
    <section>
      <p className="font-montserrat text-[13px] font-semibold text-[#10233A]">{details.name || "—"}</p>
      <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">Email: {details.email || "—"}</p>
      <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">Phone: {details.phone || "—"}</p>
      <div className="mt-8 border-b border-[#A1B6C6]" />
      <p className="mt-2 font-montserrat text-[10px] font-medium text-[#A1B6C6]">Position, full name</p>
      <div className="mt-7 border-b border-[#A1B6C6]" />
      <p className="mt-2 font-montserrat text-[10px] font-medium text-[#A1B6C6]">Signature</p>
      <p className="mt-5 font-montserrat text-[11px] font-semibold text-[#7288A3]">Company seal</p>
    </section>
  );
}
