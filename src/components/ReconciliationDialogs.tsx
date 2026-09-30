import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { PageActionButton } from "./PageHeader";
import { areReconciliationEntriesCompatible, getReconciliationEntrySide, isClientReconciliationItem, type ReconciliationItem, type ReconciliationProposal, type ReconciliationRules, type ReconciliationState } from "../lib/reconciliation";

const CHECKBOX_CLASS = "h-[18px] w-[18px] shrink-0 rounded border border-[#A1B6C6] accent-[#007EA7]";

function money(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function TestModeNotice() {
  return <div className="rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] px-4 py-3 text-[12px] leading-[18px] text-[#7288A3]"><span className="mr-2 font-semibold text-[#007EA7]">TEST MODE</span>Local test balances only. No accounting entries, bank activity, or real payments are created.</div>;
}

export function ReconciliationDialog({ title, onClose, children, recordSelection = false }: { title: string; onClose: () => void; children: ReactNode; recordSelection?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.focus();
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Expanded controls close their own menu before the enclosing dialog.
        if (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]')) return;
        if (dialog.querySelector('[data-system-add-filters="true"] button[aria-expanded="true"]')) return;
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <div className="fixed inset-0 z-[400] flex items-center justify-center bg-[#10233A]/30 p-4 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`flex max-h-[calc(100dvh-32px)] w-full ${recordSelection ? 'h-[calc(100dvh-32px)] max-w-[1600px] sm:h-[calc(100dvh-48px)]' : 'max-w-4xl'} flex-col rounded-2xl bg-white font-montserrat text-[#10233A] shadow-[0_10px_30px_rgba(0,0,0,0.12)] outline-none sm:max-h-[calc(100dvh-48px)]`}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E5EDF9] px-5 py-4 sm:px-6">
        <h2 id={titleId} className="text-[22px] font-semibold leading-8">{title}</h2>
        <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#7288A3] hover:text-[#007EA7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007EA7]"><X size={22} /></button>
      </div>
      <div className={`min-h-0 overflow-y-auto px-5 py-5 sm:px-6 ${recordSelection ? 'flex flex-1 flex-col' : ''}`}>{children}</div>
    </div>
  </div>;
}

export function ReconciliationRulesDialog({ rules, onSave, onClose }: { rules: ReconciliationRules; onSave: (rules: ReconciliationRules) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(rules);
  const options: { key: keyof ReconciliationRules; label: string; description: string }[] = [
    { key: "uniqueAmount", label: "Unique amount match", description: "Suggest a match when an equal amount identifies a unique eligible counterpart." },
    { key: "partialReference", label: "Partial settlement / overpayment", description: "Use the full invoice reference when amounts differ. Show the remaining invoice or payment balance for review." },
    { key: "multipleReferences", label: "Multiple invoice references", description: "Allow one funding item to be allocated across the invoices identified by its references." },
  ];
  return <ReconciliationDialog title="Reconciliation rules" onClose={onClose}>
    <div className="flex flex-col gap-5">
      <TestModeNotice />
      <p className="text-[13px] leading-5 text-[#7288A3]">Changes apply to the next matching run. Existing proposals and confirmed test reconciliations are not changed.</p>
      <div className="divide-y divide-[#E5EDF9] rounded-lg border border-[#D3E1EC] px-4">
        {options.map(option => <label key={option.key} className="flex cursor-pointer items-start gap-3 py-4">
          <input type="checkbox" checked={draft[option.key]} onChange={event => setDraft(current => ({ ...current, [option.key]: event.target.checked }))} className={`${CHECKBOX_CLASS} mt-0.5`} />
          <span className="flex flex-col gap-1"><span className="text-[14px] font-semibold">{option.label}</span><span className="text-[12px] leading-[18px] text-[#7288A3]">{option.description}</span></span>
        </label>)}
      </div>
      <div className="rounded-lg bg-[#F8FDFF] p-4">
        <h3 className="mb-2 text-[13px] font-semibold">Always required</h3>
        <p className="text-[12px] leading-5 text-[#7288A3]">Same company and currency, with opposite GL entries: Debit against Credit. Automatic suggestions use the same counterparty; manual selection can include other counterparties after clearing the filter. Only open balances can be matched. Amount tolerance is 0.00; differences are never written off automatically.</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5EDF9] pt-4"><PageActionButton onClick={onClose}>Cancel</PageActionButton><PageActionButton onClick={() => onSave(draft)}>Save rules</PageActionButton></div>
    </div>
  </ReconciliationDialog>;
}

type AllocationPreview = { invoice: ReconciliationItem; funding: ReconciliationItem; amountMinor: number; invoiceBefore: number; invoiceAfter: number; fundingBefore: number; fundingAfter: number };

function confirmationPreview(state: ReconciliationState, proposals: ReconciliationProposal[]) {
  const items = new Map(state.items.map(item => [item.id, item]));
  const remaining = new Map(state.items.map(item => [item.id, item.remainingMinor]));
  const totals = new Map<string, number>();
  const seen = new Set(state.batches.filter(batch => !batch.reversedAt).flatMap(batch => batch.proposalIds));
  const groups: { proposal: ReconciliationProposal; allocations: AllocationPreview[] }[] = [];
  let problem = "";
  for (const proposal of proposals) {
    const allocations: AllocationPreview[] = [];
    const funding = items.get(proposal.fundingId);
    if (seen.has(proposal.id) || proposal.organizationId !== state.organizationId || !funding || funding.organizationId !== state.organizationId || !isClientReconciliationItem(funding) || funding.missingDocument || !proposal.allocations.length) {
      problem = "These proposals are no longer valid. Close this review and run matching again.";
      continue;
    }
    seen.add(proposal.id);
    for (const allocation of proposal.allocations) {
      const invoice = items.get(allocation.invoiceId);
      if (!invoice || !isClientReconciliationItem(invoice) || invoice.missingDocument || !areReconciliationEntriesCompatible(funding, invoice) || !Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor <= 0) {
        problem = "A proposal contains an ineligible item or invalid allocation amount. Close this review and run matching again.";
        continue;
      }
      if (!proposal.expectedRemaining || proposal.expectedRemaining[funding.id] !== funding.remainingMinor || proposal.expectedRemaining[invoice.id] !== invoice.remainingMinor) problem = "Open balances have changed since these proposals were created. Close this review and run matching again.";
      const invoiceBefore = remaining.get(invoice.id) ?? 0;
      const fundingBefore = remaining.get(funding.id) ?? 0;
      const invoiceAfter = invoiceBefore - allocation.amountMinor;
      const fundingAfter = fundingBefore - allocation.amountMinor;
      if (invoiceAfter < 0 || fundingAfter < 0) problem = "These proposals overlap or exceed an open balance. Review the selected proposals before confirming.";
      remaining.set(invoice.id, invoiceAfter);
      remaining.set(funding.id, fundingAfter);
      const total = (totals.get(invoice.currency) ?? 0) + allocation.amountMinor;
      if (!Number.isSafeInteger(total)) problem = "The allocation total is outside the supported amount range.";
      totals.set(invoice.currency, total);
      allocations.push({ invoice, funding, amountMinor: allocation.amountMinor, invoiceBefore, invoiceAfter, fundingBefore, fundingAfter });
    }
    groups.push({ proposal, allocations });
  }
  return { groups, totals, problem };
}

function appliedPreview(state: ReconciliationState, itemId: string) {
  const items = new Map(state.items.map(item => [item.id, item]));
  const remaining = new Map(state.items.map(item => [item.id, item.remainingMinor]));
  const active = state.batches.filter(batch => !batch.reversedAt);
  for (const batch of active) for (const allocation of batch.allocations) {
    for (const id of [allocation.invoiceId, allocation.fundingId]) remaining.set(id, (remaining.get(id) ?? 0) + allocation.amountMinor);
  }
  const groups: { proposal: ReconciliationProposal; allocations: AllocationPreview[] }[] = [];
  const totals = new Map<string, number>();
  for (const batch of active) {
    const allocations: AllocationPreview[] = [];
    for (const allocation of batch.allocations) {
      const invoice = items.get(allocation.invoiceId);
      const funding = items.get(allocation.fundingId);
      if (!invoice || !funding) continue;
      const invoiceBefore = remaining.get(invoice.id)!;
      const fundingBefore = remaining.get(funding.id)!;
      const invoiceAfter = invoiceBefore - allocation.amountMinor;
      const fundingAfter = fundingBefore - allocation.amountMinor;
      remaining.set(invoice.id, invoiceAfter); remaining.set(funding.id, fundingAfter);
      if (invoice.id !== itemId && funding.id !== itemId) continue;
      allocations.push({ invoice, funding, amountMinor: allocation.amountMinor, invoiceBefore, invoiceAfter, fundingBefore, fundingAfter });
      totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + allocation.amountMinor);
    }
    if (allocations.length) groups.push({ proposal: { id: batch.id, organizationId: state.organizationId, fundingId: allocations[0].funding.id, allocations: [], expectedRemaining: {}, confidence: 'High', rule: 'Confirmed reconciliation', reason: `${batch.at.replace('T', ' ').slice(0, 19)} UTC · ${batch.actor}` }, allocations });
  }
  return { groups, totals, problem: '' };
}

export function ReconciliationConfirmationDialog({ state, proposals, onConfirm, onClose, error, busy = false, appliedItem }: { state: ReconciliationState; proposals: ReconciliationProposal[]; onConfirm: () => void; onClose: () => void; error?: string; busy?: boolean; appliedItem?: ReconciliationItem }) {
  const [acknowledgedSignature, setAcknowledgedSignature] = useState("");
  const proposalSignature = JSON.stringify(proposals);
  const needsAcknowledgment = !appliedItem && proposals.some(proposal => proposal.confidence !== "High");
  const acknowledged = acknowledgedSignature === proposalSignature;
  const preview = appliedItem ? appliedPreview(state, appliedItem.id) : confirmationPreview(state, proposals);
  const canConfirm = !busy && proposals.length > 0 && !preview.problem && (!needsAcknowledgment || acknowledged);
  const close = () => { if (!busy) onClose(); };
  return <ReconciliationDialog title={appliedItem ? 'View document · ' + appliedItem.documentNumber : 'Review test reconciliation'} onClose={close}>
    <div className="flex flex-col gap-5" aria-busy={busy}>
      <TestModeNotice />
      <p className="text-[13px] leading-5 text-[#7288A3]">{appliedItem ? 'Confirmed document allocations. Open before / after reflects the active allocation sequence; reversed links are excluded. This view does not change balances.' : `Review ${proposals.length} proposal${proposals.length === 1 ? '' : 's'} before confirming. Amounts below show each allocation in order, including any balance left open.`}</p>
      {preview.groups.map(({ proposal, allocations }) => <section key={proposal.id} className="rounded-lg border border-[#D3E1EC]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5EDF9] bg-[#F8FDFF] px-4 py-3"><div className="min-w-0 flex-1"><h3 className="text-[14px] font-semibold">{proposal.rule}</h3><p className="mt-1 text-[12px] leading-[18px] text-[#7288A3]">{proposal.reason}</p></div><span className={`rounded px-2 py-1 text-[11px] font-semibold ${proposal.confidence === "High" ? "bg-[#EAF8F2] text-[#087A55]" : "bg-[#FFF8E5] text-[#9A6700]"}`}>{appliedItem ? 'Reconciled' : proposal.confidence === "High" ? "High confidence" : "Review required"}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[12px]"><thead className="text-[#7288A3]"><tr><th className="px-4 py-2 font-medium">Document</th><th className="px-3 py-2 font-medium">GL entry</th><th className="px-3 py-2 font-medium">GL account</th><th className="px-3 py-2 text-right font-medium">Open before</th><th className="px-3 py-2 text-right font-medium">Allocation</th><th className="px-4 py-2 text-right font-medium">Open after</th></tr></thead>
          {allocations.map((allocation, index) => <tbody key={`${allocation.invoice.id}-${index}`} className="border-t border-[#E5EDF9]">
            <tr><td className="px-4 pt-3 pb-2"><div className="font-medium">{allocation.funding.kind} · {allocation.funding.documentNumber}</div><div className="mt-1 text-[11px] text-[#7288A3]">{allocation.funding.counterpartyName} · {allocation.funding.side}</div></td><td className="whitespace-nowrap px-3 py-2">{getReconciliationEntrySide(allocation.funding)}</td><td className="whitespace-nowrap px-3 py-2">{allocation.funding.glAccountCode || '—'}</td><td className="whitespace-nowrap px-3 py-2 text-right">{money(allocation.fundingBefore, allocation.funding.currency)}</td><td className="whitespace-nowrap px-3 py-2 text-right">{money(allocation.amountMinor, allocation.funding.currency)}</td><td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{money(allocation.fundingAfter, allocation.funding.currency)}</td></tr>
            <tr><td className="px-4 pt-2 pb-3"><div className="font-medium">{allocation.invoice.kind} · {allocation.invoice.documentNumber}</div><div className="mt-1 text-[11px] text-[#7288A3]">{allocation.invoice.counterpartyName} · {allocation.invoice.side}</div></td><td className="whitespace-nowrap px-3 py-2">{getReconciliationEntrySide(allocation.invoice)}</td><td className="whitespace-nowrap px-3 py-2">{allocation.invoice.glAccountCode || '—'}</td><td className="whitespace-nowrap px-3 py-2 text-right">{money(allocation.invoiceBefore, allocation.invoice.currency)}</td><td className="whitespace-nowrap px-3 py-2 text-right">{money(allocation.amountMinor, allocation.invoice.currency)}</td><td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{money(allocation.invoiceAfter, allocation.invoice.currency)}</td></tr>
          </tbody>)}
        </table></div>
      </section>)}
      {preview.groups.length === 0 && <p className="py-4 text-center text-[13px] text-[#7288A3]">{appliedItem ? 'No active reconciliations.' : 'No proposals selected.'}</p>}
      {preview.totals.size > 0 && <div className="rounded-lg bg-[#F8FDFF] px-4 py-3"><h3 className="mb-2 text-[13px] font-semibold">{appliedItem ? 'Total reconciled' : 'Total to reconcile'}</h3><dl className="flex flex-wrap gap-x-6 gap-y-2">{Array.from(preview.totals).map(([currency, total]) => <div key={currency} className="flex items-center gap-2 text-[13px]"><dt className="text-[#7288A3]">{currency}</dt><dd className="font-semibold">{money(total, currency)}</dd></div>)}</dl><p className="mt-2 text-[11px] text-[#7288A3]">Each allocation is counted once. Currencies are not combined.</p></div>}
      {needsAcknowledgment && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#D3E1EC] p-4 text-[13px] leading-5"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledgedSignature(event.target.checked ? proposalSignature : "")} className={`${CHECKBOX_CLASS} mt-0.5`} /><span>I have reviewed every match marked Review required and the remaining balances.</span></label>}
      {(preview.problem || error) && <p role="alert" className="rounded-lg border border-[#F5C2C2] bg-[#FFF0F0] px-4 py-3 text-[13px] leading-5 text-[#D92D20]">{preview.problem || error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5EDF9] pt-4"><PageActionButton disabled={busy} onClick={close}>{appliedItem ? 'Close' : 'Cancel'}</PageActionButton>{!appliedItem && <PageActionButton disabled={!canConfirm} onClick={onConfirm}>{busy ? "Confirming…" : "Confirm test reconciliation"}</PageActionButton>}</div>
    </div>
  </ReconciliationDialog>;
}
