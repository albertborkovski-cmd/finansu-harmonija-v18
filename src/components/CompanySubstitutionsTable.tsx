import TablePagination from "./TablePagination";
import { useRef, useState } from 'react';
import OcrSearchField from './OcrSearchField';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import { ColumnSettingsButton } from './ScopedActionButtons';
import RefreshAllButton from './RefreshAllButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import { ResizeHandle, useColumnResize } from './useColumnResize';

type Row = { id: string; name: string; from: string; to: string; status: string };
type Key = 'name' | 'from' | 'to' | 'status';
const COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Substitute accountant', width: 310, visible: true },
  { key: 'from', label: 'From', width: 180, visible: true },
  { key: 'to', label: 'To', width: 180, visible: true },
  { key: 'status', label: 'Status', width: 210, visible: true },
];

export default function CompanySubstitutionsTable({ rows, onRefresh }: { rows: Row[]; onRefresh: () => void }) {
  const [tablePage, setTablePage] = useState(1);
  const [query, setQuery] = useState('');
  const [columns, setColumns] = useState<ColConfig[]>(COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns, 'manage-company-substitutions');
  const filtered = rows.filter(row => [row.name, row.from, row.to, row.status].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<Row, Key>(filtered, (row, key) => row[key]);
  const visible = columns.filter(column => column.visible);
  return <section className="flex w-full min-w-0 flex-col gap-6 bg-white">
    <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">Substitutions</h3>
    <div className="flex items-center justify-between gap-4">
      <OcrSearchField value={query} onChange={setQuery} ariaLabel="Search substitutions" className="w-full max-w-[420px]" />
      <div className="flex items-center gap-4"><ColumnSettingsButton onClick={() => setShowColumns(true)} /><RefreshAllButton onRefresh={onRefresh} /></div>
    </div>
    <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
      <div style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0) + 42 }}>
        <div className="mb-3 flex h-6 items-center"><div className="w-[42px] flex-shrink-0" />{visible.map((column, index) => <div key={column.key} style={{ width: column.width }} className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>
          <span className="whitespace-nowrap">{column.label}</span><ColumnSortButton columnLabel={column.label} direction={directionFor(column.key as Key)} onDirectionChange={direction => changeSort(column.key as Key, direction)} /><ResizeHandle onMouseDown={event => startResize(columns.findIndex(item => item.key === column.key), event)} />
        </div>)}</div>
        <div className="flex flex-col gap-0.5">{sortedRows.slice((Math.min(tablePage, Math.max(1, Math.ceil(sortedRows.length / 20))) - 1) * 20, Math.min(tablePage, Math.max(1, Math.ceil(sortedRows.length / 20))) * 20).map((row, index) => <div key={row.id} className={`flex h-10 w-full items-center rounded-lg text-left font-montserrat text-[12px] font-medium text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`}><div className="w-[42px] flex-shrink-0" />{visible.map(column => <span key={column.key} style={{ width: column.width }} title={row[column.key as Key]} className="block flex-shrink-0 truncate px-3">{row[column.key as Key]}</span>)}</div>)}</div>
      </div>
      {!sortedRows.length && <div className="flex min-h-40 items-center justify-center text-center font-montserrat text-[13px] font-semibold text-[#7288A3]">{query ? 'No substitutions found' : 'No active or scheduled substitutions.'}</div>}
    </div>
    <HorizontalTableScrollbar scrollRef={scrollRef} fixed={false} />
      <TablePagination currentPage={tablePage} totalPages={Math.max(1, Math.ceil(sortedRows.length / 20))} itemCount={sortedRows.length} itemsPerPage={20} onPageChange={setTablePage} />
    {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={COLUMNS} onSave={next => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
  </section>;
}
