import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import OcrSearchField from './OcrSearchField';
import { PageActionButton } from './PageHeader';
import { ColumnSettingsButton } from './ScopedActionButtons';
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
}

const moneyKeys = new Set(['amount', 'amounts', 'remaining', 'original', 'settled']);
const amountFormatter = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SELECT_COLUMN_WIDTH = 30;
const ACTIONS_COLUMN_WIDTH = 80;
const ROW_INSET = 12;
function cellText(row: ReconciliationTableRow, key: string) {
  const value = row.values[key] ?? '';
  return moneyKeys.has(key) && typeof value === 'number'
    ? amountFormatter.format(value / 100)
    : String(value);
}

interface Props {
  scope: string;
  rows: ReconciliationTableRow[];
  defaultColumns: ColConfig[];
  filterKeys: string[];
  selectable?: boolean;
  initiallySelected?: string[];
  actionLabel?: string;
  selectedOnlyAction?: boolean;
  onAction?: (ids: string[]) => void;
  onRefresh: () => void;
  emptyMessage: string;
}

export default function ReconciliationTable({ scope, rows, defaultColumns, filterKeys, selectable = false, initiallySelected = [], actionLabel, selectedOnlyAction = false, onAction, onRefresh, emptyMessage }: Props) {
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
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const visibleKeys = columns.filter((column) => column.visible).map((column) => column.key);
    return rows.filter((row) => {
      const searchText = visibleKeys.map((key) => cellText(row, key)).join(' ').toLocaleLowerCase();
      return terms.every((term) => searchText.includes(term) || searchText.replace(/,/g, '').includes(term.replace(/,/g, ''))) && activeFilters.every((key) => !filterValues[key]?.length || filterValues[key].includes(String(row.values[key] ?? '—')));
    });
  }, [rows, query, columns, activeFilters, filterValues]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filtered, (row, key) => row.values[key] ?? '');
  const selectableRows = filtered.filter((row) => row.selectable !== false);
  const selectedIds = selectableRows.filter((row) => selected.has(row.id)).map((row) => row.id);
  const allSelected = selectableRows.length > 0 && selectedIds.length === selectableRows.length;
  const actionIds = selectedIds.length || selectedOnlyAction ? selectedIds : selectableRows.map((row) => row.id);
  const changeFilter = (update: () => void) => { update(); setSelected(new Set()); setBatch(1); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const clear = () => changeFilter(() => { setQuery(''); setActiveFilters([]); setFilterValues({}); });
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

  return <>
    <div className="flex min-h-[32px] flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <OcrSearchField ariaLabel="Search reconciliation records" value={query} onChange={(value) => changeFilter(() => setQuery(value))} />
        <SystemAddFilters columns={filterKeys.map((key) => ({ key, label: defaultColumns.find((column) => column.key === key)?.label ?? key, options: [...new Set(rows.map((row) => String(row.values[key] ?? '—')))].sort() }))} activeKeys={activeFilters} values={filterValues} onActiveKeysChange={(keys) => changeFilter(() => setActiveFilters(keys))} onValuesChange={(values) => changeFilter(() => setFilterValues(values))} onClearFilters={clear} />
      </div>
      <div className="flex items-center gap-3">
        {actionLabel && <PageActionButton disabled={!actionIds.length} onClick={() => onAction?.(actionIds)}>{actionLabel}</PageActionButton>}
        <ColumnSettingsButton onClick={() => setShowColumns(true)} />
        <button type="button" aria-label="Export filtered records as CSV" title="Export CSV" onClick={exportRows} className="text-[#7288A3] hover:text-[#007EA7]"><Download size={16} /></button>
        <button type="button" aria-label="Refresh reconciliation records" onClick={onRefresh} className="text-[#7288A3] hover:text-[#007EA7]"><RefreshCw size={16} /></button>
      </div>
    </div>
    <div className="min-h-[18px] text-[12px] text-[#7288A3]" aria-live="polite">
      {selectable && (selectedIds.length ? `${selectedIds.length} selected · ${selectableRows.length} selectable records` : selectedOnlyAction ? 'Select proposals to review and confirm.' : `Auto match uses all ${selectableRows.length} filtered open items, or only the items you select.`)}
    </div>
    <div ref={scrollRef} style={{ maxHeight: tableHeight, minHeight: Math.min(120, tableHeight) }} className="overflow-auto scrollbar-hide" role="region" aria-label="Reconciliation records" tabIndex={0}>
      <div role="table" aria-label="Reconciliation records" style={{ minWidth: rowWidth }} className="w-full font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
        <div role="row" className="sticky top-0 z-10 mb-1 flex h-[42px] w-full items-center border-b border-[#E5EDF9] bg-white pl-3">
          <div role="columnheader" data-table-header-select="true" className="flex h-[42px] w-[30px] shrink-0 items-center py-3">
            {selectable && <input type="checkbox" aria-label="Select all filtered reconciliation records" checked={allSelected} disabled={!selectableRows.length} onChange={() => setSelected(allSelected ? new Set() : new Set(selectableRows.map((row) => row.id)))} className="h-[18px] w-[18px] accent-[#007EA7]" />}
          </div>
          {visibleColumns.map((column) => <div role="columnheader" aria-sort={directionFor(column.key) === 'asc' ? 'ascending' : directionFor(column.key) === 'desc' ? 'descending' : 'none'} key={column.key} style={columnStyle(column)} className="relative flex h-[42px] min-w-0 items-center py-3 pr-3 text-[12px] font-medium leading-[18px]">
            <div className="flex w-full min-w-0 items-center gap-1.5">
              <p title={column.label} className={`min-w-0 flex-1 truncate ${moneyKeys.has(column.key) ? 'text-right' : ''}`}>{column.label}</p>
              <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={(direction) => changeSort(column.key, direction)} />
            </div>
            <ResizeHandle onMouseDown={(event) => startResize(columns.findIndex((entry) => entry.key === column.key), event)} />
          </div>)}
          <div role="columnheader" className="h-[42px] w-[80px] shrink-0"><span className="sr-only">Actions</span></div>
        </div>
        {sortedRows.slice(0, batch * TABLE_BATCH_SIZE).map((row, index) => <div key={row.id} role="row" className={`mb-1 flex h-[42px] w-full items-center rounded-lg pl-3 text-[12px] font-normal leading-[18px] ${index % 2 === 0 ? 'bg-[#F6FBFD]' : 'bg-white'}`}>
          <div role="cell" className="flex h-full w-[30px] shrink-0 items-center">
            {selectable && row.selectable !== false && <input type="checkbox" aria-label={`Select ${row.values.documentNumber ?? row.values.funding ?? row.id}`} checked={selected.has(row.id)} onChange={() => setSelected((previous) => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} className="h-[18px] w-[18px] accent-[#007EA7]" />}
          </div>
          {visibleColumns.map((column) => <div key={column.key} role="cell" style={columnStyle(column)} title={cellText(row, column.key)} className={`min-w-0 overflow-hidden ${moneyKeys.has(column.key) ? 'pr-8 text-right tabular-nums' : 'pr-3'}`}><div className="min-w-0 truncate [&>*]:max-w-full [&>button]:block [&>button]:truncate [&>button]:text-left [&>span]:overflow-hidden [&>span]:text-ellipsis">{row.display?.[column.key] ?? cellText(row, column.key) ?? '—'}</div></div>)}
          <div role="cell" className="system-table-row-actions flex h-full w-[80px] shrink-0 items-center justify-end gap-2 pr-3">{row.actions}</div>
        </div>)}
        {!sortedRows.length && <p className="py-10 text-center text-[#7288A3]">{emptyMessage}</p>}
      </div>
    </div>
    <HorizontalTableScrollbar scrollRef={scrollRef} />
    <TablePagination currentPage={batch} totalPages={Math.max(1, Math.ceil(filtered.length / TABLE_BATCH_SIZE))} itemCount={filtered.length} onPageChange={setBatch} scrollRef={scrollRef} />
    {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={defaultColumns} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
  </>;
}
