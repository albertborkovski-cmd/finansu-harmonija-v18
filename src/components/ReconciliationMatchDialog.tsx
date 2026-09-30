import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { PageActionButton } from './PageHeader';
import OcrSearchField from './OcrSearchField';
import SystemAddFilters from './SystemAddFilters';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import type { ColConfig } from './ColumnSettingsPanel';
import { ReconciliationDialog } from './ReconciliationDialogs';
import { buildManualReconciliation, getManualReconciliationCandidates, getManualReconciliationOptions, parseManualReconciliationAmount } from '../lib/manualReconciliation';
import { getReconciliationEntrySide, type ReconciliationItem, type ReconciliationProposal } from '../lib/reconciliation';

import { exchangeRate } from '../lib/reconciliationExchangeRate';
import { paymentPurpose } from '../lib/reconciliationPaymentPurpose';

const formatAmount = (minor: number) => (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amountInputValue = (minor: number) => {
  const digits = String(minor).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
};
const itemType = (item: ReconciliationItem) => item.kind === 'Invoice'
  ? (item.side === 'Receivable' ? 'Sales invoice' : 'Purchase invoice')
  : item.kind === 'Payment' ? (item.side === 'Receivable' ? 'Bank receipt' : 'Bank payment') : item.kind;

interface Props {
  item: ReconciliationItem;
  items: ReconciliationItem[];
  onConfirm: (proposals: ReconciliationProposal[]) => void;
  onClose: () => void;
  error?: string;
  busy?: boolean;
  initialAmounts?: Record<string, number>;
  title?: string;
  confirmLabel?: string;
  description?: string;
  showAllOpenRecords?: boolean;
}

export default function ReconciliationMatchDialog({ item, items, onConfirm, onClose, error, busy = false, initialAmounts, title = 'Reconcile · Select records', confirmLabel = 'Reconcile selected', description, showAllOpenRecords = true }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => Object.keys(initialAmounts ?? {}));
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialAmounts ?? {}).map(([id, amount]) => [id, amountInputValue(amount)])));
  const [query, setQuery] = useState('');
  const [sourceType, setSourceType] = useState('All');
  const [activeFilters, setActiveFilters] = useState<string[]>(() => item.counterpartyId ? ['client'] : []);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>((): Record<string, string[]> => item.counterpartyId ? { client: [item.counterpartyId] } : {});
  const [columns, setColumns] = useState<ColConfig[]>(() => [
    { key: 'document', label: 'Document No.', width: 180, visible: true },
    { key: 'client', label: 'Counterparty', width: 180, visible: true },
    { key: 'type', label: 'Type', width: 140, visible: true },
    { key: 'glEntry', label: 'GL entry', width: 110, visible: true },
    { key: 'glAccount', label: 'GL account', width: 135, visible: true },
    { key: 'date', label: 'Date', width: 125, visible: true },
    { key: 'exchangeRate', label: 'Exchange rate', width: 210, visible: true },
    { key: 'paymentPurpose', label: 'Payment purpose', width: 250, visible: true },
    { key: 'amount', label: 'Open amount', width: 145, visible: true },
    { key: 'toMatch', label: 'To match', width: 130, visible: true },
    { key: 'remaining', label: 'Remaining', width: 140, visible: true },
    ...(showAllOpenRecords ? [
      { key: 'currency', label: 'Currency', width: 110, visible: true },
      { key: 'availability', label: 'Availability', width: 190, visible: true },
    ] : []),
  ]);
  const { startResize } = useColumnResize(columns, setColumns, 'reconciliation-select-records');
  const orderedColumns = ['document', 'client', 'type', 'glEntry', 'glAccount', 'date', 'exchangeRate', 'paymentPurpose', 'amount', 'toMatch', 'remaining', ...(showAllOpenRecords ? ['currency', 'availability'] : [])].map(key => columns.find(column => column.key === key)!);
  const source = items.find(candidate => candidate.id === item.id) ?? item;
  const options = useMemo(() => showAllOpenRecords ? getManualReconciliationOptions(items, item.id) : getManualReconciliationCandidates(items, item.id).map(item => ({ item, reason: '' })), [items, item.id, showAllOpenRecords]);
  const candidates = useMemo(() => options.map(option => option.item), [options]);
  const matchesSourceType = (candidate: ReconciliationItem, type: string) => {
    if (type === 'All') return true;
    if (type === 'Bank') return candidate.kind === 'Payment';
    if (type === 'Bank receipts') return candidate.kind === 'Payment' && candidate.side === 'Receivable';
    if (type === 'Bank payments') return candidate.kind === 'Payment' && candidate.side === 'Payable';
    if (type === 'Advances & deposits') return candidate.kind === 'Advance' || candidate.kind === 'Deposit';
    return (candidate.kind === 'Invoice' || candidate.kind === 'Credit note') && candidate.side === (type === 'Sales' ? 'Receivable' : 'Payable');
  };
  const sourceTypes = ['All', 'Purchases', 'Sales', 'Bank', 'Bank receipts', 'Bank payments', 'Advances & deposits'].filter(type => type === 'All' || candidates.some(candidate => matchesSourceType(candidate, type)));
  const unavailable = new Map(options.map(option => [option.item.id, option.reason]));
  const result = useMemo(() => {
    try {
      const amounts: Record<string, number> = {};
      for (const id of selectedIds) {
        if (!Object.hasOwn(amountInputs, id)) continue;
        try { amounts[id] = parseManualReconciliationAmount(amountInputs[id]); }
        catch (cause) {
          const document = candidates.find(candidate => candidate.id === id)?.documentNumber ?? 'Document';
          return { preview: null, invalidId: id, problem: `${document}: ${cause instanceof Error ? cause.message : 'Enter a valid amount.'}` };
        }
      }
      return { preview: buildManualReconciliation(items, item.id, selectedIds, amounts), invalidId: '', problem: '' };
    } catch (cause) {
      return { preview: null, invalidId: '', problem: cause instanceof Error ? cause.message : 'These balances are no longer available. Close and reopen the list.' };
    }
  }, [items, item.id, selectedIds, amountInputs, candidates]);
  const allocationMap = new Map(result.preview?.allocations.map(allocation => [allocation.itemId, allocation]));
  const filterValue = (candidate: ReconciliationItem, key: string) => {
    switch (key) {
      case 'document': return candidate.documentNumber;
      case 'client': return candidate.counterpartyName || '—';
      case 'type': return itemType(candidate);
      case 'glEntry': return getReconciliationEntrySide(candidate);
      case 'glAccount': return candidate.glAccountCode || '—';
      case 'exchangeRate': return exchangeRate(candidate);
      case 'currency': return candidate.currency;
      case 'availability': return unavailable.get(candidate.id) || 'Available';
      case 'date': return candidate.documentDate;
      case 'paymentPurpose': return paymentPurpose(candidate);
      case 'amount': return formatAmount(candidate.remainingMinor);
      case 'toMatch': {
        if (selectedIds.includes(candidate.id) && Object.hasOwn(amountInputs, candidate.id)) {
          try { return formatAmount(parseManualReconciliationAmount(amountInputs[candidate.id])); }
          catch { return amountInputs[candidate.id] || '—'; }
        }
        return formatAmount(allocationMap.get(candidate.id)?.amountMinor ?? 0);
      }
      case 'remaining': return result.preview ? formatAmount(candidate.remainingMinor - (allocationMap.get(candidate.id)?.amountMinor ?? 0)) : '—';
      default: return '';
    }
  };
  const filterColumns = [
    { key: 'document', label: 'Document No.' }, { key: 'client', label: 'Counterparty' }, { key: 'type', label: 'Type' },
    { key: 'glEntry', label: 'GL entry' }, { key: 'glAccount', label: 'GL account' },
    { key: 'exchangeRate', label: 'Exchange rate' }, { key: 'paymentPurpose', label: 'Payment purpose' }, { key: 'date', label: 'Date' }, { key: 'amount', label: 'Open amount' },
    { key: 'toMatch', label: 'To match' }, { key: 'remaining', label: 'Remaining' },
    ...(showAllOpenRecords ? [{ key: 'currency', label: 'Currency' }, { key: 'availability', label: 'Availability' }] : []),
  ].map(column => column.key === 'client' ? {
    ...column,
    options: [...new Set([source, ...candidates].map(candidate => candidate.counterpartyId).filter(Boolean))],
    optionLabels: Object.fromEntries([source, ...candidates].map(candidate => [candidate.counterpartyId, candidate.counterpartyName || candidate.counterpartyId])),
  } : { ...column, options: [...new Set(candidates.map(candidate => filterValue(candidate, column.key)))].sort() });
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = candidates.filter(candidate => {
    if (!matchesSourceType(candidate, sourceType)) return false;
    if (!activeFilters.every(key => !filterValues[key]?.length || filterValues[key].includes(key === 'client' ? candidate.counterpartyId : filterValue(candidate, key)))) return false;
    const allocation = allocationMap.get(candidate.id)?.amountMinor ?? 0;
    const text = [getReconciliationEntrySide(candidate), candidate.glAccountCode, exchangeRate(candidate), paymentPurpose(candidate), candidate.documentNumber, candidate.counterpartyName, candidate.currency, unavailable.get(candidate.id) || 'Available', itemType(candidate), candidate.documentDate, formatAmount(candidate.remainingMinor), formatAmount(allocation), formatAmount(candidate.remainingMinor - allocation)].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term) || text.replace(/,/g, '').includes(term.replace(/,/g, '')));
  });
  const remaining = result.preview?.sourceRemainingMinor ?? source.remainingMinor;
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filtered, (candidate, key: string) => {
    const value = filterValue(candidate, key);
    if (['amount', 'toMatch', 'remaining'].includes(key)) {
      const numeric = Number(value.replace(/,/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
    }
    return value;
  });
  const selectedTotal = result.preview?.totalMinor ?? 0;
  const toggle = (id: string) => {
    // A previously selected record must always be removable, even if it has since
    // become ineligible. Eligibility only prevents adding it again.
    if (busy || (unavailable.get(id) && !selectedIds.includes(id))) return;
    if (selectedIds.includes(id)) setAmountInputs(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setSelectedIds(previous => previous.includes(id) ? previous.filter(selected => selected !== id) : [...previous, id]);
  };
  const clearSelection = () => { setSelectedIds([]); setAmountInputs({}); };
  const clearFilters = () => { setQuery(''); setSourceType('All'); setActiveFilters([]); setFilterValues({}); };
  const normalizeAmount = (id: string) => {
    if (!Object.hasOwn(amountInputs, id)) return;
    try {
      const value = amountInputValue(parseManualReconciliationAmount(amountInputs[id]));
      setAmountInputs(previous => ({ ...previous, [id]: value }));
    } catch { /* Keep invalid input visible so it can be corrected. */ }
  };
  const close = () => { if (!busy) onClose(); };

  return <ReconciliationDialog title={title} onClose={close} recordSelection>
    <div className="flex min-h-0 flex-1 flex-col gap-2 [&>*]:shrink-0" aria-busy={busy}>
      {description && <p className="text-[12px] leading-[18px] text-[#7288A3]">{description}</p>}
      <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-[#E5EDF9] bg-[#F8FDFF] px-3 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-5">
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-[13px] font-semibold leading-[18px]" title={source.documentNumber}>{source.documentNumber}</h3><span className="shrink-0 text-[10px] font-semibold text-[#007EA7]">TEST MODE</span></div><p className="truncate text-[11px] leading-4 text-[#7288A3]" title={`${source.counterpartyName} · ${itemType(source)} · ${source.currency}`}>{source.counterpartyName} · {itemType(source)} · {source.currency}</p><p className="text-[11px] leading-4 text-[#7288A3]">GL entry: <span className="font-medium text-[#10233A]">{getReconciliationEntrySide(source)}</span>{source.glAccountCode && <> · GL account: {source.glAccountCode}</>}</p></div>
      <dl className="grid grid-cols-3 gap-3 text-[11px] leading-4 lg:border-l lg:border-[#D3E1EC] lg:pl-5" aria-live="polite">
        {[
          ['Open balance', source.remainingMinor], ['Selected to match', selectedTotal], ['Remaining after', remaining],
        ].map(([label, amount]) => <div key={label}><dt className="text-[#7288A3]">{label}</dt><dd className="break-words text-[13px] font-semibold leading-[18px] tabular-nums">{label !== 'Open balance' && !result.preview ? '—' : `${formatAmount(Number(amount))} ${source.currency}`}</dd></div>)}
      </dl>
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&>.system-add-filters]:min-w-0 [&>.system-add-filters]:shrink [&>.system-add-filters]:flex-wrap">
          <OcrSearchField ariaLabel="Search matching items" value={query} onChange={setQuery} />
          <SystemAddFilters columns={filterColumns} activeKeys={activeFilters} values={filterValues} onActiveKeysChange={setActiveFilters} onValuesChange={setFilterValues} onClearFilters={clearFilters} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Record source" className="flex flex-wrap gap-1">{sourceTypes.map(type => <button key={type} type="button" aria-pressed={sourceType === type} onClick={() => setSourceType(type)} className={`h-7 rounded px-3 text-[12px] font-medium ${sourceType === type ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3]'}`}>{type}</button>)}</div>
        <div className="flex items-center gap-3 text-[12px]"><span className="text-[#7288A3]">{selectedIds.length} selected · {filtered.length} shown · {filtered.filter(row => !unavailable.get(row.id)).length} available</span><button type="button" disabled={!selectedIds.length || busy} onClick={clearSelection} className="text-[#007EA7] disabled:text-[#A1B6C6]">Clear selection</button></div>
      </div>
      {showAllOpenRecords && <p className="text-[11px] leading-4 text-[#7288A3]">Only opposite GL entries are listed. Clear the Counterparty filter to include other counterparties. Select multiple records and adjust To match amounts as needed.</p>}
      <div className="min-h-[120px] flex-1 overflow-auto rounded-lg [scrollbar-gutter:stable]" role="region" aria-label="Compatible open items" tabIndex={0}>
        <table style={{ minWidth: 34 + orderedColumns.reduce((total, column) => total + column.width, 0) }} className="w-full table-fixed border-separate border-spacing-0 text-left text-[12px] font-normal leading-[18px] [&_th]:min-w-0 [&_th]:resize-none [&_th]:align-middle [&_th]:after:hidden">
          <colgroup><col className="w-[34px]" />{orderedColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
          <thead className="sticky top-0 z-10 bg-white"><tr className="h-9 text-[#10233A]">
            <th scope="col"><span className="sr-only">Select</span></th>
            {orderedColumns.map(column => <th key={column.key} scope="col" aria-sort={directionFor(column.key) === 'asc' ? 'ascending' : directionFor(column.key) === 'desc' ? 'descending' : 'none'} className="relative pr-5 font-medium">
              <div className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-left" title={column.label}>{column.label}</span><ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => changeSort(column.key, direction)} /></div>
              <ResizeHandle onMouseDown={event => startResize(columns.findIndex(entry => entry.key === column.key), event)} />
            </th>)}
          </tr></thead>
          <tbody>{sortedRows.map((candidate, index) => {
            const checked = selectedIds.includes(candidate.id);
            const disabled = busy || (!checked && Boolean(unavailable.get(candidate.id)));
            const amount = allocationMap.get(candidate.id)?.amountMinor ?? 0;
            const invalid = checked && Boolean(result.problem) && (result.invalidId ? result.invalidId === candidate.id : Object.hasOwn(amountInputs, candidate.id));
            return <tr key={candidate.id} className={`h-9 transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
              <td className="rounded-l-lg pl-2 align-middle"><input type="checkbox" aria-label={`Match ${candidate.documentNumber}`} checked={checked} disabled={disabled} onChange={() => toggle(candidate.id)} className="block h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7] disabled:cursor-not-allowed" /></td>
              <td className="truncate pr-3" title={candidate.documentNumber}><button type="button" aria-pressed={checked} disabled={disabled} onClick={() => toggle(candidate.id)} className="block max-w-full truncate text-left">{candidate.documentNumber}</button></td>
              <td className="truncate pr-3" title={candidate.counterpartyName}>{candidate.counterpartyName || '—'}</td>
              <td className="truncate pr-3" title={itemType(candidate)}>{itemType(candidate)}</td><td className="pr-3">{getReconciliationEntrySide(candidate)}</td><td className="truncate pr-3" title={candidate.glAccountCode || '—'}>{candidate.glAccountCode || '—'}</td><td className="pr-3">{candidate.documentDate}</td><td className="truncate pr-3" title={exchangeRate(candidate)}>{exchangeRate(candidate)}</td><td className="truncate pr-3" title={paymentPurpose(candidate)}>{paymentPurpose(candidate)}</td>
              <td className="pr-3 text-left tabular-nums">{formatAmount(candidate.remainingMinor)}</td>
              <td className="pr-3"><input type="text" inputMode="decimal" autoComplete="off" aria-label={`Amount to match ${candidate.documentNumber}`} aria-invalid={invalid} title={`Enter an amount up to ${formatAmount(Math.min(source.remainingMinor, candidate.remainingMinor))} ${source.currency}`} disabled={!checked || busy} value={checked && Object.hasOwn(amountInputs, candidate.id) ? amountInputs[candidate.id] : amountInputValue(amount)} onFocus={event => event.currentTarget.select()} onChange={event => setAmountInputs(previous => ({ ...previous, [candidate.id]: event.target.value }))} onBlur={() => normalizeAmount(candidate.id)} className={`h-7 w-full min-w-0 rounded border bg-white px-2 text-left text-[12px] leading-[18px] tabular-nums outline-none focus:border-[#007EA7] focus:ring-1 focus:ring-[#007EA7]/20 disabled:border-transparent disabled:bg-transparent disabled:text-[#7288A3] ${invalid ? 'border-red-500 text-red-700' : 'border-[#D3E1EC] text-[#007EA7]'}`} /></td>
              <td className="rounded-r-lg pr-3 text-left tabular-nums">{result.preview ? formatAmount(candidate.remainingMinor - amount) : '—'}</td>
              {showAllOpenRecords && <><td className="pr-3">{candidate.currency}</td><td className="truncate pr-3 text-[#7288A3]" title={unavailable.get(candidate.id) || 'Available'}>{unavailable.get(candidate.id) || 'Available'}</td></>}
            </tr>;
          })}</tbody>
        </table>
        {!filtered.length && <p className="px-4 py-8 text-center text-[12px] text-[#7288A3]">{candidates.length ? 'No matching records. Change the search or clear the Counterparty filter.' : 'No open records with an opposite GL entry are available.'}</p>}
      </div>
      <div className={`min-h-[18px] text-[12px] ${result.problem || error ? 'text-red-700' : 'text-[#7288A3]'}`} role={result.problem || error ? 'alert' : 'status'}>{result.problem || error || (selectedIds.length > 0 && remaining === 0 ? 'The selected document will be fully reconciled.' : selectedIds.length ? `A balance of ${formatAmount(remaining)} ${source.currency} will remain open.` : 'Select one or more records from the list above.')}</div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5EDF9] pt-2">
        <div className="flex gap-2"><PageActionButton disabled={busy} onClick={close}>Cancel</PageActionButton><PageActionButton disabled={busy || !result.preview?.proposals.length || Boolean(result.problem)} icon={<Link2 size={15} />} onClick={() => { if (result.preview?.proposals.length) onConfirm(result.preview.proposals); }}>{busy ? 'Saving…' : confirmLabel}</PageActionButton></div>
      </div>
    </div>
  </ReconciliationDialog>;
}
