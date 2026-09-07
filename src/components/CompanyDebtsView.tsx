import { useMemo, useRef, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { MoreVertical } from 'lucide-react';
import { importMenuRecords } from '../lib/menuImport';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import OcrSearchField from './OcrSearchField';
import { PageActionButton, PageHeader } from './PageHeader';
import { ColumnSettingsButton, ImportDataButton } from './ScopedActionButtons';
import RefreshAllButton from './RefreshAllButton';
import TablePagination from './TablePagination';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import SystemAddFilters, { type SystemFilterColumn } from './SystemAddFilters';

interface DebtRow {
  id: string;
  counterpartyCode: string;
  counterpartyName: string;
  counterpartyType: string;
  documentReference: string;
  documentType: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  daysOverdue: number;
  debtStatus: string;
  reminderStage: string;
  lastReminderDate: string;
  paymentPriority: string;
  department: string;
  notes: string;
}

const DEBT_ROWS: DebtRow[] = [
  {
    id: 'debt-1',
    counterpartyCode: '123456',
    counterpartyName: 'UAB Alfa',
    counterpartyType: 'Buyer',
    documentReference: 'INV-1025',
    documentType: 'Sales invoice',
    issueDate: '11.12.2025',
    dueDate: '11.12.2025',
    currency: 'EUR',
    totalAmount: '1,200.00',
    paidAmount: '900.00',
    outstandingAmount: '300.00',
    daysOverdue: 5,
    debtStatus: 'Partially paid',
    reminderStage: 'Final',
    lastReminderDate: '11.12.2025',
    paymentPriority: 'Low',
    department: 'Project A',
    notes: '—',
  },
  {
    id: 'debt-2',
    counterpartyCode: '123456',
    counterpartyName: 'UAB Alfa',
    counterpartyType: 'Buyer',
    documentReference: 'INV-1025',
    documentType: 'Sales invoice',
    issueDate: '11.12.2025',
    dueDate: '11.12.2025',
    currency: 'EUR',
    totalAmount: '1,200.00',
    paidAmount: '900.00',
    outstandingAmount: '300.00',
    daysOverdue: 5,
    debtStatus: 'Partially paid',
    reminderStage: 'Final',
    lastReminderDate: '11.12.2025',
    paymentPriority: 'Low',
    department: 'Project A',
    notes: '—',
  },
];

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: 'counterpartyCode', label: 'Counterparty code', width: 136, visible: true },
  { key: 'counterpartyName', label: 'Counterparty name', width: 144, visible: true },
  { key: 'counterpartyType', label: 'Counterparty type', width: 132, visible: true },
  { key: 'documentReference', label: 'Document reference', width: 142, visible: true },
  { key: 'documentType', label: 'Document type', width: 125, visible: true },
  { key: 'issueDate', label: 'Issue date', width: 96, visible: true },
  { key: 'dueDate', label: 'Due date', width: 96, visible: true },
  { key: 'currency', label: 'Currency', width: 78, visible: true },
  { key: 'totalAmount', label: 'Total amount', width: 108, visible: true },
  { key: 'paidAmount', label: 'Paid amount', width: 104, visible: true },
  { key: 'outstandingAmount', label: 'Outstanding amount', width: 135, visible: true },
  { key: 'daysOverdue', label: 'Days overdue', width: 104, visible: true },
  { key: 'debtStatus', label: 'Debt status', width: 118, visible: true },
  { key: 'reminderStage', label: 'Reminder stage', width: 116, visible: true },
  { key: 'lastReminderDate', label: 'Last reminder date', width: 128, visible: true },
  { key: 'paymentPriority', label: 'Payment priority', width: 120, visible: true },
  { key: 'department', label: 'Department / Project', width: 145, visible: true },
  { key: 'notes', label: 'Notes indicator', width: 112, visible: true },
  { key: 'actions', label: '', width: 130, visible: true },
];

const TABS = ['Receivables', 'Payables', 'All', 'Overdue'];

export default function CompanyDebtsView({ companyName = "" }: { companyName?: string }) {
  const [activeTab, setActiveTab] = useState('Payables');
  const [query, setQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columns, setColumns] = usePersistentState<ColConfig[]>('finansu-harmonija:v7:company-debts-columns', DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter(column => column.visible);

  const filterColumns = useMemo<SystemFilterColumn[]>(
    () =>
      DEFAULT_COLUMNS.filter(column => column.key !== 'actions').map(column => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(
            DEBT_ROWS.map(row => String(row[column.key as keyof DebtRow] ?? '')).filter(Boolean),
          ),
        ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
      })),
    [],
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return DEBT_ROWS.filter(row => {
      if (
        normalized &&
        !Object.values(row).some(value =>
          String(value).toLocaleLowerCase().includes(normalized),
        )
      ) {
        return false;
      }

      return activeFilterKeys.every(key => {
        const selectedValues = filterValues[key] ?? [];
        return (
          selectedValues.length === 0 ||
          selectedValues.includes(String(row[key as keyof DebtRow] ?? ''))
        );
      });
    });
  }, [activeFilterKeys, filterValues, query]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filteredRows,
    (row, key) => row[key as keyof DebtRow] as string | number,
  );

  const toggleAll = () => {
    setSelectedRows(current => current.size === sortedRows.length ? new Set() : new Set(sortedRows.map(row => row.id)));
  };

  const toggleRow = (id: string) => {
    setSelectedRows(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cell = (row: DebtRow, key: string) => {
    if (key === 'debtStatus') {
      return <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#EEB648]" />{row.debtStatus}</span>;
    }
    if (key === 'actions') {
      return (
        <div className="flex items-center gap-1">
          <button type="button" className="h-7 rounded-md border border-[#D3E1EC] bg-white px-2 text-[#7288A3] hover:border-[#007EA7]">View details</button>
          <button type="button" aria-label={`Actions for ${row.documentReference}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7]"><MoreVertical size={14} /></button>
        </div>
      );
    }
    return String(row[key as keyof DebtRow] ?? '—');
  };

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-4 bg-white px-4 py-10 sm:px-8 lg:px-[56px]">
      <PageHeader
        title="Debts"
        className="!min-h-[42px]"
        actions={
          <>
            <PageActionButton disabled={selectedRows.size === 0}>Send reminder to selected</PageActionButton>
            <PageActionButton>Create payment</PageActionButton>
            <PageActionButton>Send statement</PageActionButton>
          </>
        }
      />
      {companyName && (
        <CompanyBreadcrumb companyName={companyName} items={["Debts", "Debt list"]} />
      )}

      <div className="flex h-10 flex-shrink-0 items-start gap-6 border-b border-[#E5EDF9]">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex h-10 flex-col justify-between whitespace-nowrap font-montserrat text-[14px] font-medium ${activeTab === tab ? 'text-[#007EA7]' : 'text-[#10233A]'}`}
          >
            <span>{tab}</span>
            <span className={`h-0.5 w-full ${activeTab === tab ? 'bg-[#007EA7]' : 'bg-transparent'}`} />
          </button>
        ))}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <OcrSearchField ariaLabel="Search debts" value={query} onChange={setQuery} className="!w-[220px] !min-w-[220px] !max-w-[220px]" />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v12:filters:company-debts:${activeTab}`}
            columns={filterColumns}
            activeKeys={activeFilterKeys}
            values={filterValues}
            onActiveKeysChange={setActiveFilterKeys}
            onValuesChange={setFilterValues}
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-4 p-[6px]">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <ImportDataButton
            disabled={DEBT_ROWS.length === 0}
            onClick={() => importMenuRecords(`company:${companyName}:debts`, DEBT_ROWS.map(row => row.id))}
          />
          <RefreshAllButton onRefresh={() => undefined} />
        </div>
      </div>

      <div ref={tableScrollRef} className="flex min-h-[160px] flex-1 flex-col overflow-x-auto scrollbar-hide">
        <div className="min-w-max">
          <div className="mb-1 flex h-8 items-center border-b border-[#E5EDF9] pl-3 pr-2">
            <div data-table-header-select="true" className="flex w-[30px] flex-shrink-0 items-center">
              <input type="checkbox" aria-label="Select all debts" checked={sortedRows.length > 0 && selectedRows.size === sortedRows.length} onChange={toggleAll} className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]" />
            </div>
            {visibleColumns.map(column => {
              const columnIndex = columns.findIndex(item => item.key === column.key);
              return (
                <div key={column.key} style={{ width: column.width }} className="relative flex flex-shrink-0 items-center gap-1 whitespace-nowrap pr-3 font-montserrat text-[11px] font-medium text-[#10233A]">
                  {column.label && <><span>{column.label}</span><ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => changeSort(column.key, direction)} /></>}
                  <ResizeHandle onMouseDown={event => startResize(columnIndex, event)} />
                </div>
              );
            })}
          </div>

          {sortedRows.map((row, index) => (
            <div key={row.id} className={`group flex h-9 items-center rounded-lg pl-3 pr-2 transition-colors hover:bg-[#EEF6FA] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
              <div className="flex w-[30px] flex-shrink-0 items-center">
                <input type="checkbox" aria-label={`Select ${row.documentReference}`} checked={selectedRows.has(row.id)} onChange={() => toggleRow(row.id)} className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]" />
              </div>
              {visibleColumns.map(column => (
                <div key={column.key} style={{ width: column.width }} className="flex flex-shrink-0 items-center overflow-hidden pr-2 font-montserrat text-[11px] text-[#10233A]">
                  <div className="w-full min-w-0 truncate">{cell(row, column.key)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <div className="flex flex-shrink-0 items-center justify-between pt-2">
        <TablePagination
          currentPage={currentPage}
          totalPages={Math.max(1, Math.ceil(sortedRows.length / 14))}
          itemCount={sortedRows.length}
          itemsPerPage={14}
          onPageChange={setCurrentPage}
        />
      </div>

      {showColumns && <ColumnSettingsPanel columns={columns} onSave={setColumns} onClose={() => setShowColumns(false)} />}
    </div>
  );
}
