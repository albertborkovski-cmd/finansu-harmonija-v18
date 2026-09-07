import { useMemo, useRef, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import { RefreshCw, Upload } from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import SystemAddFilters from "./SystemAddFilters";
import CompanyBreadcrumb from "./CompanyBreadcrumb";

interface ReconciliationRow {
  id: string;
  counterparty: string;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  dueDate: string;
  originalAmount: string;
  paidAmount: string;
  outstandingBalance: string;
  currency: string;
  overdueDays: number;
  status: "Reconciled" | "Not reconciled";
  suggestedMatch: string;
}

type ReconciliationFilterKey =
  | "overdue"
  | "overdueDaysRange"
  | "dateRange"
  | "counterparty"
  | "status";

const RECONCILIATION_ROWS: ReconciliationRow[] = [
  {
    id: "reconciliation-1",
    counterparty: "123456",
    documentType: "UAB Alfa",
    documentNumber: "Buyer",
    documentDate: "11.12.2025",
    dueDate: "11.12.2025",
    originalAmount: "1,200.00",
    paidAmount: "900.00",
    outstandingBalance: "300.00",
    currency: "EUR",
    overdueDays: 5,
    status: "Reconciled",
    suggestedMatch: "—",
  },
  {
    id: "reconciliation-2",
    counterparty: "123456",
    documentType: "UAB Alfa",
    documentNumber: "Buyer",
    documentDate: "11.12.2025",
    dueDate: "11.12.2025",
    originalAmount: "1,200.00",
    paidAmount: "900.00",
    outstandingBalance: "300.00",
    currency: "EUR",
    overdueDays: 5,
    status: "Not reconciled",
    suggestedMatch: "—",
  },
];

function overdueDaysRange(days: number) {
  if (days <= 0) return "Not overdue";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "More than 90 days";
}

function reconciliationFilterValue(
  row: ReconciliationRow,
  key: ReconciliationFilterKey,
) {
  if (key === "overdue") return row.overdueDays > 0 ? "Overdue" : "Not overdue";
  if (key === "overdueDaysRange") return overdueDaysRange(row.overdueDays);
  if (key === "dateRange") return `${row.documentDate} – ${row.dueDate}`;
  return String(row[key]);
}

const RECONCILIATION_FILTER_COLUMNS = [
  { key: "overdue", label: "Overdue" },
  { key: "overdueDaysRange", label: "Overdue days ranges" },
  { key: "dateRange", label: "Date range" },
  { key: "counterparty", label: "Counterparty" },
  { key: "status", label: "Status" },
].map(({ key, label }) => ({
  key,
  label,
  options: Array.from(
    new Set(
      RECONCILIATION_ROWS.map((row) =>
        reconciliationFilterValue(row, key as ReconciliationFilterKey),
      ),
    ),
  ).sort(),
}));

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "counterparty", label: "Counterparty", width: 124, visible: true },
  { key: "documentType", label: "Document type", width: 118, visible: true },
  { key: "documentNumber", label: "Document No.", width: 116, visible: true },
  { key: "documentDate", label: "Document date", width: 118, visible: true },
  { key: "dueDate", label: "Due date", width: 96, visible: true },
  {
    key: "originalAmount",
    label: "Original amount",
    width: 118,
    visible: true,
  },
  { key: "paidAmount", label: "Paid amount", width: 108, visible: true },
  {
    key: "outstandingBalance",
    label: "Outstanding balance",
    width: 138,
    visible: true,
  },
  { key: "currency", label: "Currency", width: 86, visible: true },
  { key: "overdueDays", label: "Overdue days", width: 106, visible: true },
  { key: "status", label: "Reconciliation status", width: 148, visible: true },
  {
    key: "suggestedMatch",
    label: "Suggested match",
    width: 128,
    visible: true,
  },
  { key: "actions", label: "", width: 142, visible: true },
];

export default function CompanyReconciliationView({ companyName = "" }: { companyName?: string }) {
  const [activeTab, setActiveTab] = useState("Reconciled");
  const [query, setQuery] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v7:company-reconciliation-columns",
    DEFAULT_COLUMNS,
  );
  const [showColumns, setShowColumns] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [additionalFilterKeys, setAdditionalFilterKeys] = useState<string[]>(
    [],
  );
  const [additionalFilterValues, setAdditionalFilterValues] = useState<
    Record<string, string[]>
  >({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter((column) => column.visible);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return RECONCILIATION_ROWS.filter((row) => {
      if (
        normalized &&
        !Object.values(row).some((value) =>
          String(value).toLocaleLowerCase().includes(normalized),
        )
      )
        return false;
      return additionalFilterKeys.every((key) => {
        const selected = additionalFilterValues[key] ?? [];
        return (
          selected.length === 0 ||
          selected.includes(
            reconciliationFilterValue(
              row,
              key as ReconciliationFilterKey,
            ),
          )
        );
      });
    });
  }, [additionalFilterKeys, additionalFilterValues, query]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filteredRows,
    (row, key) => row[key as keyof ReconciliationRow] as string | number,
  );

  const toggleAll = () => {
    setSelectedRows((current) =>
      current.size === sortedRows.length
        ? new Set()
        : new Set(sortedRows.map((row) => row.id)),
    );
  };

  const toggleRow = (id: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cell = (row: ReconciliationRow, key: string) => {
    if (key === "status") {
      const reconciled = row.status === "Reconciled";
      return (
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${reconciled ? "bg-[#0ED8A8]" : "bg-[#FF4550]"}`}
          />
          {row.status}
        </span>
      );
    }
    if (key === "actions") {
      const approveDisabled = row.status === "Not reconciled";
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={approveDisabled}
            className="h-7 rounded-md border border-[#D3E1EC] bg-white px-2 text-[#7288A3] hover:border-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"
          >
            Approve
          </button>
          <button
            type="button"
            className="h-7 rounded-md border border-[#D3E1EC] bg-white px-2 text-[#7288A3] hover:border-[#007EA7]"
          >
            Review
          </button>
        </div>
      );
    }
    return String(row[key as keyof ReconciliationRow] ?? "—");
  };

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-4 bg-white px-4 py-10 sm:px-8 lg:px-[56px]">
      <PageHeader
        title="Reconciliation"
        className="!min-h-[42px]"
        actions={
          <>
            <PageActionButton disabled={selectedRows.size === 0}>
              Approve selected
            </PageActionButton>
            <PageActionButton>Approve all suggestions</PageActionButton>
          </>
        }
      />
      {companyName && (
        <CompanyBreadcrumb companyName={companyName} items={["Reconciliation"]} />
      )}

      <div className="flex h-10 flex-shrink-0 items-start gap-6 border-b border-[#E5EDF9]">
        {["To review", "Reconciled"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex h-10 flex-col justify-between whitespace-nowrap font-montserrat text-[14px] font-medium ${activeTab === tab ? "text-[#007EA7]" : "text-[#10233A]"}`}
          >
            <span>{tab}</span>
            <span
              className={`h-0.5 w-full ${activeTab === tab ? "bg-[#007EA7]" : "bg-transparent"}`}
            />
          </button>
        ))}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <OcrSearchField
            ariaLabel="Search reconciliation"
            value={query}
            onChange={setQuery}
            className="!w-[220px] !min-w-[220px] !max-w-[220px]"
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v7:filters:company-reconciliation:${activeTab}`}
            columns={RECONCILIATION_FILTER_COLUMNS}
            activeKeys={additionalFilterKeys}
            values={additionalFilterValues}
            onActiveKeysChange={setAdditionalFilterKeys}
            onValuesChange={setAdditionalFilterValues}
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-4 p-[6px]">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <button
            type="button"
            title="EXPORT"
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"
          >
            <Upload size={16} />
          </button>
          <button
            type="button"
            title="REFRESH ALL"
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div
        ref={tableScrollRef}
        className="flex min-h-[160px] flex-1 flex-col overflow-x-auto scrollbar-hide"
      >
        <div className="min-w-max">
          <div className="mb-1 flex h-8 items-center border-b border-[#E5EDF9] pl-3 pr-2">
            <div data-table-header-select="true" className="flex w-[30px] flex-shrink-0 items-center">
              <input
                type="checkbox"
                aria-label="Select all reconciliation records"
                checked={
                  sortedRows.length > 0 &&
                  selectedRows.size === sortedRows.length
                }
                onChange={toggleAll}
                className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]"
              />
            </div>
            {visibleColumns.map((column) => {
              const columnIndex = columns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className="relative flex flex-shrink-0 items-center gap-1 whitespace-nowrap pr-3 font-montserrat text-[11px] font-medium text-[#10233A]"
                >
                  {column.label && (
                    <>
                      <span>{column.label}</span>
                      <ColumnSortButton
                        columnLabel={column.label}
                        direction={directionFor(column.key)}
                        onDirectionChange={(direction) =>
                          changeSort(column.key, direction)
                        }
                      />
                    </>
                  )}
                  <ResizeHandle
                    onMouseDown={(event) => startResize(columnIndex, event)}
                  />
                </div>
              );
            })}
          </div>

          {sortedRows.map((row, index) => (
            <div
              key={row.id}
              className={`group flex h-9 items-center rounded-lg pl-3 pr-2 transition-colors hover:bg-[#EEF6FA] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
            >
              <div className="flex w-[30px] flex-shrink-0 items-center">
                <input
                  type="checkbox"
                  aria-label={`Select reconciliation ${row.id}`}
                  checked={selectedRows.has(row.id)}
                  onChange={() => toggleRow(row.id)}
                  className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]"
                />
              </div>
              {visibleColumns.map((column) => (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className="flex flex-shrink-0 items-center overflow-hidden pr-2 font-montserrat text-[11px] text-[#10233A]"
                >
                  <div className="w-full min-w-0 truncate">
                    {cell(row, column.key)}
                  </div>
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
          totalPages={1}
          itemCount={sortedRows.length}
          itemsPerPage={14}
          onPageChange={setCurrentPage}
        />
      </div>

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          onSave={setColumns}
          onClose={() => setShowColumns(false)}
        />
      )}
    </div>
  );
}
