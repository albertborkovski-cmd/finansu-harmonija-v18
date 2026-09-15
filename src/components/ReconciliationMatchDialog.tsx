import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { PageActionButton } from './PageHeader';
import OcrSearchField from './OcrSearchField';
import { ReconciliationDialog } from './ReconciliationDialogs';
import { buildManualReconciliation, getManualReconciliationCandidates } from '../lib/manualReconciliation';
import type { ReconciliationItem, ReconciliationProposal } from '../lib/reconciliation';

const formatAmount = (minor: number) => (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  item: ReconciliationItem;
  items: ReconciliationItem[];
  onConfirm: (proposals: ReconciliationProposal[]) => void;
  onClose: () => void;
  error?: string;
  busy?: boolean;
}

export default function ReconciliationMatchDialog({ item, items, onConfirm, onClose, error, busy = false }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const source = items.find(candidate => candidate.id === item.id) ?? item;
  const result = useMemo(() => {
    try {
      return { candidates: getManualReconciliationCandidates(items, item.id), preview: buildManualReconciliation(items, item.id, selectedIds), problem: '' };
    } catch (cause) {
      return { candidates: [], preview: null, problem: cause instanceof Error ? cause.message : 'These balances are no longer available. Close and reopen the list.' };
    }
  }, [items, item.id, selectedIds]);
  const allocationMap = new Map(result.preview?.allocations.map(allocation => [allocation.itemId, allocation]));
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = result.candidates.filter(candidate => {
    const allocation = allocationMap.get(candidate.id)?.amountMinor ?? 0;
    const text = [candidate.documentNumber, candidate.kind, candidate.documentDate, formatAmount(candidate.remainingMinor), formatAmount(allocation), formatAmount(candidate.remainingMinor - allocation)].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term) || text.replace(/,/g, '').includes(term.replace(/,/g, '')));
  });
  const remaining = result.preview?.sourceRemainingMinor ?? source.remainingMinor;
  const selectedTotal = result.preview?.totalMinor ?? 0;
  const toggle = (id: string) => {
    setSelectedIds(previous => previous.includes(id) ? previous.filter(selected => selected !== id) : [...previous, id]);
  };
  const close = () => { if (!busy) onClose(); };

  return <ReconciliationDialog title="Match open items" onClose={close}>
    <div className="flex min-h-0 flex-col gap-4" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="break-words text-[15px] font-semibold">{source.documentNumber}</h3><p className="mt-1 text-[12px] text-[#7288A3]">{source.counterpartyName} · {source.kind} · {source.currency}</p></div>
        <span className="text-[11px] font-semibold text-[#007EA7]">TEST MODE</span>
      </div>
      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-[#F6FBFD] px-4 py-3 text-[12px]" aria-live="polite">
        {[
          ['Open balance', source.remainingMinor], ['Selected to match', selectedTotal], ['Remaining after', remaining],
        ].map(([label, amount]) => <div key={label}><dt className="text-[#7288A3]">{label}</dt><dd className="mt-1 break-words text-[14px] font-semibold tabular-nums">{formatAmount(Number(amount))} {source.currency}</dd></div>)}
      </dl>
      <p className="text-[12px] leading-[18px] text-[#7288A3]">Tick the records to match. Amounts are filled automatically in the order you select; any excess remains open. Only compatible open items are listed.</p>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <OcrSearchField ariaLabel="Search matching items" value={query} onChange={setQuery} />
        <div className="flex items-center gap-3 text-[12px]"><span className="text-[#7288A3]">{selectedIds.length} selected · {filtered.length} available</span><button type="button" disabled={!selectedIds.length || busy} onClick={() => setSelectedIds([])} className="text-[#007EA7] disabled:text-[#A1B6C6]">Clear selection</button></div>
      </div>
      <div className="max-h-[min(34dvh,360px)] min-h-[120px] overflow-auto rounded-lg" role="region" aria-label="Compatible open items" tabIndex={0}>
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-y-1 text-left text-[12px] leading-[18px] [&_th]:min-w-0 [&_th]:resize-none [&_th]:align-middle [&_th]:after:hidden">
          <colgroup><col className="w-[34px]" /><col className="w-[165px]" /><col className="w-[90px]" /><col className="w-[95px]" /><col className="w-[105px]" /><col className="w-[110px]" /><col className="w-[110px]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-white"><tr className="h-[38px] text-[#7288A3]">
            <th scope="col"><span className="sr-only">Select</span></th>
            <th scope="col" className="pr-3 font-medium">Document</th><th scope="col" className="pr-3 font-medium">Type</th><th scope="col" className="pr-3 font-medium">Date</th>
            <th scope="col" className="pr-3 text-right font-medium">Open amount</th><th scope="col" className="pr-3 text-right font-medium">To match</th><th scope="col" className="pr-3 text-right font-medium">Remaining</th>
          </tr></thead>
          <tbody>{filtered.map((candidate, index) => {
            const checked = selectedIds.includes(candidate.id);
            const disabled = busy || (!checked && remaining <= 0);
            const amount = allocationMap.get(candidate.id)?.amountMinor ?? 0;
            return <tr key={candidate.id} className={`h-[42px] ${index % 2 === 0 ? 'bg-[#F6FBFD]' : 'bg-white'}`}>
              <td className="rounded-l-lg pl-2 align-middle"><input type="checkbox" aria-label={`Match ${candidate.documentNumber}`} checked={checked} disabled={disabled} onChange={() => toggle(candidate.id)} className="block h-[18px] w-[18px] rounded border-[#A1B6C6] accent-[#007EA7] disabled:cursor-not-allowed" /></td>
              <td className="truncate pr-3" title={candidate.documentNumber}><button type="button" aria-pressed={checked} disabled={disabled} onClick={() => toggle(candidate.id)} className="block max-w-full truncate text-left">{candidate.documentNumber}</button></td>
              <td className="truncate pr-3">{candidate.kind}</td><td className="pr-3">{candidate.documentDate}</td>
              <td className="pr-3 text-right tabular-nums">{formatAmount(candidate.remainingMinor)}</td><td className={`pr-3 text-right tabular-nums ${checked ? 'font-medium text-[#007EA7]' : 'text-[#7288A3]'}`}>{formatAmount(amount)}</td><td className="rounded-r-lg pr-3 text-right tabular-nums">{formatAmount(candidate.remainingMinor - amount)}</td>
            </tr>;
          })}</tbody>
        </table>
        {!filtered.length && <p className="px-4 py-8 text-center text-[12px] text-[#7288A3]">{result.candidates.length ? 'No matching records. Change the search text.' : 'No compatible open items for this counterparty, currency and side.'}</p>}
      </div>
      <div className="min-h-[18px] text-[12px] text-[#7288A3]" role="status">{selectedIds.length > 0 && remaining === 0 ? 'The selected document will be fully reconciled. Uncheck a record to choose another.' : selectedIds.length ? `A balance of ${formatAmount(remaining)} ${source.currency} will remain open.` : 'Select one or more records from the list above.'}</div>
      {(result.problem || error) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-[12px] text-red-700">{result.problem || error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5EDF9] pt-4">
        <p className="text-[11px] text-[#7288A3]">Only local test balances will change. Real accounting is not affected.</p>
        <div className="flex gap-2"><PageActionButton disabled={busy} onClick={close}>Cancel</PageActionButton><PageActionButton disabled={busy || !result.preview?.proposals.length || Boolean(result.problem)} icon={<Link2 size={15} />} onClick={() => { if (result.preview?.proposals.length) onConfirm(result.preview.proposals); }}>{busy ? 'Reconciling…' : 'Reconcile selected'}</PageActionButton></div>
      </div>
    </div>
  </ReconciliationDialog>;
}
