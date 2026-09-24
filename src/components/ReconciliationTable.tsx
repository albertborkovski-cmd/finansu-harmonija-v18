import { toggleFilteredSelection } from '../lib/tableSelection';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import OcrSearchField from './OcrSearchField';
import { ColumnSettingsButton } from './ScopedActionButtons';
import RefreshAllButton from './RefreshAllButton';
import SystemAddFilters from './SystemAddFilters';
import TablePagination from './TablePagination';
import { TABLE_BATCH_SIZE } from '../lib/tablePaging';
import { ResizeHandle, useColumnResize } from './useColumnResize';

export interface ReconciliationTableRow {
  id: string;
  values: Record<string, string | number>;
  display?: Record<string, ReactNode>;
  actions: ReactNode;
  selectable?: boolean;
  expanded?: boolean;
}

const moneyKeys = new Set(['amount', 'amounts', 'remaining', 'original', 'settled', 'debit', 'credit']);
const amountFormatter = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SELECT_COLUMN_WIDTH = 30;
const ACTIONS_COLUMN_WIDTH = 150;
const ROW_INSET = 12;
function cellText(row: ReconciliationTableRow, key: string) {
  const value = row.values[key] ?? '';
  return moneyKeys.has(key) && typeof value === 'number'
    ? amountFormatter.format(value / 100)
    : String(value);
}
const filterValue = (row: ReconciliationTableRow, key: string) => String(row.values[key] ?? '—') || '—';

interface Props {
  scope: string;
  rows: ReconciliationTableRow[];
  defaultColumns: ColConfig[];
  selectable?: boolean;
  initiallySelected?: string[];
  actionLabel?: string;
  selectedOnlyAction?: boolean;
  onAction?: (ids: string[]) => void;
  onRefresh: () => void;
  onClearFilters?: () => void;
  emptyMessage: string;
  topFilters?: ReactNode;
}

export default function ReconciliationTable({ scope, rows, defaultColumns, selectable = false, initiallySelected = [], actionLabel, selectedOnlyAction = false, onAction, onRefresh, onClearFilters, emptyMessage, topFilters }: Props) {
  const [columns, setColumns] = useState<ColConfig[]>(defaultColumns);
  const [showColumns, setShowColumns] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState(() => new Set(initiallySelected));
  const [batch, setBatch] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState(280);
  useLayoutEffect(() => {
    const resize = () => {
      // The shared scrollbar occupies 44px above its 104px bottom offset.
      // Keep rows above that entire surface, never underneath its hit area.
      if (scrollRef.current) setTableHeight(Math.max(0, window.innerHeight - scrollRef.current.getBoundingClientRect().top - 160));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (scrollRef.current?.parentElement) observer.observe(scrollRef.current.parentElement);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const { startResize } = useColumnResize(columns, setColumns, scope);
  const visibleColumns = columns.filter((column) => column.visible && column.key !== 'actions');
  const filterColumns = useMemo(() => columns.filter(column => column.key !== 'actions').map(column => ({
    key: column.key,
    label: column.label,
    options: [...new Set(rows.map(row => filterValue(row, column.key)))].sort((left, right) => left.localeCompare(right, 'en', { numeric: true })),
    optionLabels: Object.fromEntries(rows.map(row => [filterValue(row, column.key), cellText(row, column.key) || '—'])),
  })), [columns, rows]);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visibleKeys = columns.filter((column) => column.visible).map((column) => column.key);
    return rows.filter((row) => {
      const searchText = visibleKeys.map((key) => cellText(row, key)).join(' ').toLocaleLowerCase();
      return terms.every((term) => searchText.includes(term) || searchText.replace(/,/g, '').includes(term.replace(/,/g, ''))) && activeFilters.every((key) => !filterValues[key]?.length || filterValues[key].includes(filterValue(row, key)));
    });
  }, [rows, query, columns, activeFilters, filterValues]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filtered, (row, key) => row.values[key] ?? '');
  const selectableRows = filtered.filter((row) => row.selectable !== false);
  const selectedIds = selectableRows.filter((row) => selected.has(row.id)).map((row) => row.id);
  const allSelected = selectableRows.length > 0 && selectedIds.length === selectableRows.length;
  const actionIds = selectedIds.length || selectedOnlyAction ? selectedIds : selectableRows.map((row) => row.id);
  const changeFilter = (update: () => void) => { update(); setBatch(1); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const clear = () => changeFilter(() => { setQuery(''); setActiveFilters([]); setFilterValues({}); onClearFilters?.(); });
  const exportRows = () => {
    const escape = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = [visibleColumns.map((column) => escape(column.label)).join(','), ...sortedRows.map((row) => visibleColumns.map((column) => escape(cellText(row, column.key))).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'reconciliation-test.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const rowWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + ROW_INSET + SELECT_COLUMN_WIDTH + ACTIONS_COLUMN_WIDTH;
  // The same width contract is used in headers and rows. Columns grow to fill
  // spare space, but never shrink below the user's configured resize width.
  const columnStyle = (column: ColConfig) => ({ minWidth: column.width, flex: `${column.width} 0 ${column.width}px` });

  const tableTools = <>
    <ColumnSettingsButton onClick={() => setShowColumns(true)} />
    <button type="button" data-button-family="export" aria-label="EXPORT" title="EXPORT" onClick={exportRows} className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"><Download size={16} /></button>
    <RefreshAllButton onRefresh={onRefresh} />
  </>;
  return <>
    {topFilters && <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">{topFilters}<div className="flex items-center gap-3">{tableTools}</div></div>}
    <div className="flex min-h-[32px] flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 [&>.system-add-filters]:min-w-0 [&>.system-add-filters]:shrink [&>.system-add-filters]:flex-wrap">
        <OcrSearchField ariaLabel="Search reconciliation records" value={query} onChange={(value) => changeFilter(() => setQuery(value))} />
        <SystemAddFilters columns={filterColumns} activeKeys={activeFilters} values={filterValues} onActiveKeysChange={(keys) => changeFilter(() => setActiveFilters(keys))} onValuesChange={(values) => changeFilter(() => setFilterValues(values))} onClearFilters={clear} />
      </div>
      <div className="flex items-center gap-3">
        {selectedIds.length > 0 && <span className="whitespace-nowrap text-[12px] leading-[18px] text-[#7288A3]" role="status">{selectedIds.length} selected</span>}
        {actionLabel && <button type="button" disabled={!actionIds.length} onClick={() => onAction?.(actionIds)} className="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded border border-[#D3E1EC] bg-white px-2.5 text-[12px] font-medium leading-[18px] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-[#F8FDFF] hover:text-[#007EA7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:bg-[#F7F9FC] disabled:text-[#A1B6C6]">{actionLabel}</button>}
        {!topFilters && tableTools}
      </div>
    </div>
    <div ref={scrollRef} style={{ maxHeight: tableHeight, minHeight: Math.min(120, tableHeight) }} className="overflow-auto scrollbar-hide" role="region" aria-label="Reconciliation records" tabIndex={0}>
      <div role="table" aria-label="Reconciliation records" style={{ minWidth: rowWidth }} className="w-full font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
        <div role="row" className="system-table-header-row sticky top-0 z-10 mb-1 flex h-9 w-full items-start border-b border-[#E5EDF9] bg-white">
          <div role="columnheader" data-table-header-select="true" className="system-table-select-cell flex h-9 w-[30px] shrink-0 items-start">
            {selectable && <input type="checkbox" aria-label="Select all filtered reconciliation records" checked={allSelected} disabled={!selectableRows.length} onChange={() => setSelected(current => toggleFilteredSelection(current, selectableRows.map(row => row.id)))} className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]" />}
          </div>
          {visibleColumns.map((column) => <div role="columnheader" aria-sort={directionFor(column.key) === 'asc' ? 'ascending' : directionFor(column.key) === 'desc' ? 'descending' : 'none'} key={column.key} style={columnStyle(column)} className="relative flex h-9 min-w-0 items-start pr-4 text-[12px] font-medium leading-[18px]">
            <div className="flex w-full min-w-0 items-center gap-1.5">
              <p title={column.label} className={`min-w-0 flex-1 truncate ${moneyKeys.has(column.key) ? 'text-right' : ''}`}>{column.label}</p>
              <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={(direction) => changeSort(column.key, direction)} />
            </div>
            <ResizeHandle onMouseDown={(event) => startResize(columns.findIndex((entry) => entry.key === column.key), event)} />
          </div>)}
          <div role="columnheader" style={{ width: ACTIONS_COLUMN_WIDTH }} className="h-9 shrink-0"><span className="sr-only">Actions</span></div>
        </div>
        {sortedRows.slice(0, batch * TABLE_BATCH_SIZE).map((row, index) => <div key={row.id} role="row" className={`group flex ${row.expanded ? 'min-h-[60px] py-1' : 'h-9'} w-full items-center rounded-lg pl-3 text-[12px] font-normal leading-[18px] transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
          <div role="cell" className="flex h-full w-[30px] shrink-0 items-center">
            {selectable && row.selectable !== false && <input type="checkbox" aria-label={`Select ${row.values.documentNumber ?? row.values.funding ?? row.id}`} checked={selected.has(row.id)} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]" />}
          </div>
          {visibleColumns.map((column) => <div key={column.key} role="cell" style={columnStyle(column)} title={cellText(row, column.key)} className={`min-w-0 overflow-hidden ${moneyKeys.has(column.key) ? 'pr-9 text-right tabular-nums' : 'pr-4'}`}><div className="min-w-0 truncate [&>*]:max-w-full [&>button]:block [&>button]:truncate [&>button]:text-left [&>span]:overflow-hidden [&>span]:text-ellipsis">{row.display?.[column.key] ?? cellText(row, column.key) ?? '—'}</div></div>)}
          <div role="cell" style={{ width: ACTIONS_COLUMN_WIDTH }} className="system-table-row-actions flex h-full shrink-0 items-center justify-end gap-1 pr-3">{row.actions}</div>
        </div>)}
        {!sortedRows.length && <p className="py-10 text-center text-[#7288A3]">{emptyMessage}</p>}
      </div>
    </div>
    <HorizontalTableScrollbar scrollRef={scrollRef} />
    <TablePagination currentPage={batch} totalPages={Math.max(1, Math.ceil(filtered.length / TABLE_BATCH_SIZE))} itemCount={filtered.length} onPageChange={setBatch} scrollRef={scrollRef} />
    {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={defaultColumns} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
  </>;
}
