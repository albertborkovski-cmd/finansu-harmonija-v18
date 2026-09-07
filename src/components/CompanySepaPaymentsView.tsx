import { useMemo, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import type { Company } from "../lib/supabase";
import { usePersistentState } from "../hooks/usePersistentState";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton from "./ColumnSortButton";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageHeader } from "./PageHeader";
import RefreshAllButton from "./RefreshAllButton";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import SystemAddFilters from "./SystemAddFilters";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "paymentId", label: "Payment ID", width: 170, visible: true },
  { key: "executionDate", label: "Execution date", width: 160, visible: true },
  { key: "debtorAccount", label: "Debtor account", width: 210, visible: true },
  { key: "counterparty", label: "Counterparty", width: 220, visible: true },
  { key: "creditorAccount", label: "Creditor account", width: 210, visible: true },
  { key: "amount", label: "Amount", width: 140, visible: true },
  { key: "currency", label: "Currency", width: 110, visible: true },
  { key: "purpose", label: "Purpose of payment", width: 250, visible: true },
  { key: "status", label: "Status", width: 140, visible: true },
];

export default function CompanySepaPaymentsView({ company }: { company: Company }) {
  const [query, setQuery] = useState("");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:sepa-payment-columns:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleColumns = columns.filter((column) => column.visible);
  const { startResize } = useColumnResize(columns, setColumns);
  const filterColumns = useMemo(() => DEFAULT_COLUMNS.map((column) => ({ key: column.key, label: column.label, options: [] })), []);

  return (
    <div className="flex min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="SEPA payments" />
      <CompanyBreadcrumb companyName={company.name} items={["Bank", "SEPA payments"]} />

      <div className="flex flex-wrap items-center gap-2">
        <OcrSearchField ariaLabel="Search SEPA payments" value={query} onChange={setQuery} />
        <SystemAddFilters columns={filterColumns} activeKeys={filterKeys} values={filterValues} onActiveKeysChange={setFilterKeys} onValuesChange={setFilterValues} persistenceKey={`finansu-harmonija:v12:sepa-payment-filters:${company.id}`} />
        <div className="ml-auto flex items-center gap-4">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton onRefresh={() => undefined} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}>
          <div className="system-table-header-row mb-3 flex min-h-9 items-start">
            {visibleColumns.map((column) => {
              const realIndex = columns.findIndex((item) => item.key === column.key);
              return <div key={column.key} style={{ width: column.width }} className="relative flex flex-shrink-0 items-start gap-1 px-3">
                <span>{column.label}</span>
                <ColumnSortButton columnLabel={column.label} direction={null} onDirectionChange={() => undefined} />
                <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
              </div>;
            })}
          </div>
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]">
            <Landmark size={30} />
            <span className="text-[14px] font-semibold">No SEPA payments</span>
            <span className="text-[12px]">SEPA payment records will be displayed here.</span>
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={1} totalPages={1} itemCount={0} onPageChange={() => undefined} />
      {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
    </div>
  );
}
