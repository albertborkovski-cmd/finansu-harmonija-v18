import { useCallback, useMemo, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import OcrSearchField from './OcrSearchField';
import { PageActionButton } from './PageHeader';
import { ReconciliationDialog } from './ReconciliationDialogs';
import SystemAddFilters from './SystemAddFilters';
import type { ReconciliationItem } from '../lib/reconciliation';

import { exchangeRate } from '../lib/reconciliationExchangeRate';
import { paymentPurpose } from '../lib/reconciliationPaymentPurpose';

type BalanceView = 'All' | 'Open' | 'Reconciled';
type ColumnKey = 'exchangeRate' | 'documentNumber' | 'counterpartyName' | 'kind' | 'documentDate' | 'currency' | 'paymentPurpose' | 'used' | 'remaining';

const COLUMNS: { key: ColumnKey; label: string; numeric?: boolean; width: number }[] = [
  { key: 'documentNumber', label: 'Document No.', width: 132 },
  { key: 'counterpartyName', label: 'Counterparty', width: 136 },
  { key: 'kind', label: 'Type', width: 66 },
  { key: 'documentDate', label: 'Date', width: 92 },
  { key: 'exchangeRate', label: 'Exchange rate', width: 210 },
  { key: 'currency', label: 'Currency', width: 72 },
  { key: 'paymentPurpose', label: 'Payment purpose', width: 250 },
  { key: 'used', label: 'Used', numeric: true, width: 70 },
  { key: 'remaining', label: 'Remaining', numeric: true, width: 82 },
];

const formatAmount = (minor: number) => (minor / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function columnValue(item: ReconciliationItem, key: ColumnKey): string {
  switch (key) {
    case 'exchangeRate': return exchangeRate(item);
    case 'paymentPurpose': return paymentPurpose(item);
    case 'used': return formatAmount(item.originalMinor - item.remainingMinor);
    case 'remaining': return formatAmount(item.remainingMinor);
    default: return item[key];
  }
}

interface Props {
  items: ReconciliationItem[];
  open?: boolean;
  onSelect: (item: ReconciliationItem) => void;
  onClose: () => void;
}

export default function ReconciliationPrepaymentsDialog({ items, open = true, onSelect, onClose }: Props) {
  const [view, setView] = useState<BalanceView>('Open');
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const scrollPosition = useRef({ top: 0, left: 0 });
  const restoreListPosition = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    node.scrollTop = scrollPosition.current.top;
    node.scrollLeft = scrollPosition.current.left;
  }, []);
  const prepayments = useMemo(() => items
    .filter(item => item.kind === 'Advance' || item.kind === 'Deposit')
    .sort((left, right) => right.documentDate.localeCompare(left.documentDate) || left.documentNumber.localeCompare(right.documentNumber)), [items]);
  const filterColumns = useMemo(() => COLUMNS.map(column => ({
    key: column.key,
    label: column.label,
    options: [...new Set(prepayments.map(item => columnValue(item, column.key)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  })), [prepayments]);
  const counts: Record<BalanceView, number> = {
    All: prepayments.length,
    Open: prepayments.filter(item => item.remainingMinor > 0).length,
    Reconciled: prepayments.filter(item => item.remainingMinor === 0).length,
  };
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = prepayments.filter(item => {
    if (view === 'Open' && item.remainingMinor <= 0) return false;
    if (view === 'Reconciled' && item.remainingMinor !== 0) return false;
    if (!activeFilters.every(key => {
      const column = COLUMNS.find(candidate => candidate.key === key);
      return !column || !filterValues[key]?.length || filterValues[key].includes(columnValue(item, column.key));
    })) return false;
    const text = COLUMNS.map(column => columnValue(item, column.key)).join(' ').toLocaleLowerCase();
    const normalizedText = text.replace(/,/g, '');
    return terms.every(term => text.includes(term) || normalizedText.includes(term.replace(/,/g, '')));
  });
  const clearFilters = () => {
    setQuery('');
    setView('All');
    setActiveFilters([]);
    setFilterValues({});
  };

  // Keep list preferences while the matching dialog is open, but unmount the
  // enclosing modal so only the currently visible dialog traps keyboard focus.
  if (!open) return null;

  return <ReconciliationDialog title="Advances & deposits" onClose={onClose}>
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 [&>.system-add-filters]:min-w-0 [&>.system-add-filters]:shrink [&>.system-add-filters]:flex-wrap">
        <OcrSearchField ariaLabel="Search advances and deposits" value={query} onChange={setQuery} />
        <SystemAddFilters columns={filterColumns} activeKeys={activeFilters} values={filterValues} onActiveKeysChange={setActiveFilters} onValuesChange={setFilterValues} onClearFilters={clearFilters} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Advance and deposit balances" className="flex gap-1">
          {(['All', 'Open', 'Reconciled'] as const).map(option => <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={`h-7 rounded px-3 text-[12px] font-medium ${view === option ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3] hover:bg-[#DCE7F6]'}`}>{option} ({counts[option]})</button>)}
        </div>
        <span role="status" className="text-[12px] leading-[18px] text-[#7288A3]">{filtered.length} {filtered.length === 1 ? 'record' : 'records'}</span>
      </div>
      <div ref={restoreListPosition} onScroll={event => { scrollPosition.current = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft }; }} role="region" aria-label="Advances and deposits" tabIndex={0} className="max-h-[clamp(120px,calc(100dvh-340px),480px)] min-h-[120px] overflow-auto rounded-lg">
        <table className="w-full min-w-[828px] table-fixed border-separate border-spacing-0 text-left text-[12px] font-normal leading-[18px] [&_th]:min-w-0 [&_th]:resize-none [&_th]:whitespace-nowrap [&_th]:align-middle [&_th]:after:hidden">
          <caption className="sr-only">Advance and deposit balances available for reconciliation</caption>
          <colgroup>{COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}<col className="w-[100px]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-white"><tr className="h-9 text-[#10233A]">
            {COLUMNS.map((column, index) => <th key={column.key} scope="col" className={`pr-3 font-medium ${index === 0 ? 'pl-3' : ''} ${column.numeric ? 'text-right' : ''}`}>{column.label}</th>)}
            <th scope="col" className="pr-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{filtered.map((item, index) => <tr key={item.id} className={`h-9 transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
            {COLUMNS.map((column, columnIndex) => <td key={column.key} title={columnValue(item, column.key)} className={`truncate pr-3 ${columnIndex === 0 ? 'rounded-l-lg pl-3' : ''} ${column.numeric ? 'text-right tabular-nums' : ''}`}>{columnValue(item, column.key)}</td>)}
            <td className="rounded-r-lg pr-3"><button type="button" aria-label={`Reconcile ${item.documentNumber}`} disabled={item.remainingMinor <= 0} onClick={() => onSelect(item)} className="ml-auto flex h-7 items-center justify-center gap-1.5 rounded border border-[#D3E1EC] bg-white px-2 text-[12px] font-medium leading-[18px] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:bg-[#F7F9FC] disabled:text-[#A1B6C6]"><Link2 size={14} aria-hidden="true" />Reconcile</button></td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <p className="px-4 py-8 text-center text-[12px] leading-[18px] text-[#7288A3]">{prepayments.length ? 'No matching records. Change the search or filters.' : 'No advances or deposits for this organization.'}</p>}
      </div>
      <div className="flex justify-end border-t border-[#E5EDF9] pt-4"><PageActionButton onClick={onClose}>Close</PageActionButton></div>
    </div>
  </ReconciliationDialog>;
}
