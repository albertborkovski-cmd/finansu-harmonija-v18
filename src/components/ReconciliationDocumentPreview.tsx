import type { ReconciliationItem, ReconciliationState } from '../lib/reconciliation';
import { reconciliationPartners } from '../lib/reconciliationPresentation';
import { ReconciliationDialog } from './ReconciliationDialogs';

const money = (amount: number) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100);

export default function ReconciliationDocumentPreview({ item, state, companyName, onClose, onOpen }: {
  item: ReconciliationItem; state: ReconciliationState; companyName: string; onClose: () => void; onOpen: (item: ReconciliationItem) => void;
}) {
  const invoice = item.kind === 'Invoice' || item.kind === 'Credit note';
  const seller = item.side === 'Receivable' ? companyName : item.counterpartyName;
  const buyer = item.side === 'Receivable' ? item.counterpartyName : companyName;
  const partners = reconciliationPartners(state, item.id);
  return <ReconciliationDialog title={'View document · ' + item.documentNumber} onClose={onClose}>
    <article className="space-y-5 text-[12px] leading-[18px] text-[#10233A]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D3E1EC] pb-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#7288A3]">Demonstration document · Not a real accounting document</p><h3 className="mt-2 text-xl font-semibold">{invoice ? item.kind === 'Credit note' ? 'Credit note' : 'Invoice' : 'Payment statement'}</h3><p className="mt-1 text-[#007EA7]">{item.documentNumber}</p></div>
        <dl><dt className="text-[#7288A3]">Document date</dt><dd>{item.documentDate}</dd><dt className="mt-2 text-[#7288A3]">Due date</dt><dd>{item.dueDate || '—'}</dd></dl>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <section><h4 className="text-[#7288A3]">{invoice ? 'Seller' : 'Account holder'}</h4><p className="mt-1 font-semibold">{invoice ? seller : companyName}</p><p className="text-[#7288A3]">Sample details for testing</p></section>
        <section><h4 className="text-[#7288A3]">{invoice ? 'Buyer' : 'Counterparty / payee'}</h4><p className="mt-1 font-semibold">{invoice ? buyer : item.payeeName || item.counterpartyName || 'Not identified'}</p><p className="text-[#7288A3]">Sample details for testing</p></section>
      </div>
      <table className="w-full text-left"><thead className="border-y border-[#D3E1EC] text-[#7288A3]"><tr><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Amount</th></tr></thead><tbody><tr className="bg-[#F8FDFF]"><td className="p-3">{item.reference || 'Demonstration goods / services'}</td><td className="whitespace-nowrap p-3 text-right">{money(item.originalMinor)} {item.currency}</td></tr></tbody></table>
      <p className="text-[11px] text-[#7288A3]">Line items and tax details are not available in the reconciliation sample. The total matches the selected record.</p>
      <dl className="ml-auto grid max-w-sm grid-cols-2 gap-2"><dt>Total</dt><dd className="text-right font-semibold">{money(item.originalMinor)} {item.currency}</dd><dt>Reconciled</dt><dd className="text-right">{money(item.originalMinor - item.remainingMinor)} {item.currency}</dd><dt>Open balance</dt><dd className="text-right">{money(item.remainingMinor)} {item.currency}</dd></dl>
      <section className="border-t border-[#D3E1EC] pt-4"><h4 className="mb-2 font-semibold">Reconciled with</h4>{partners.length ? partners.map(partner => <div key={partner.item.id} className="flex items-center justify-between gap-3 py-1"><button type="button" className="text-left text-[#007EA7] hover:underline" onClick={() => onOpen(partner.item)}>{partner.item.documentNumber}</button><span>{money(partner.amountMinor)} {item.currency}</span></div>) : <p className="text-[#7288A3]">No active reconciliations.</p>}</section>
    </article>
  </ReconciliationDialog>;
}
