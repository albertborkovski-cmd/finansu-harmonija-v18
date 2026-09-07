import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, FileText, X } from "lucide-react";
import { supabase, type Company, type DbDocument } from "../lib/supabase";
import { importMenuRecords } from "../lib/menuImport";
import { mapRow, type Document } from "./Documents";
import { loadCompanyGeneralLedgerAccountOptions } from "./GeneralLedgerView";
import { usePersistentState } from "../hooks/usePersistentState";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageHeader } from "./PageHeader";
import RefreshAllButton from "./RefreshAllButton";
import { ColumnSettingsButton, ImportDataButton } from "./ScopedActionButtons";
import SystemAddFilters from "./SystemAddFilters";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

type JournalColumnKey =
  | "operationDate"
  | "documentType"
  | "documentSubtype"
  | "counterparty"
  | "account"
  | "postingStatus"
  | "debit"
  | "credit"
  | "total";

interface JournalRow {
  id: string;
  operationDate: string;
  documentType: string;
  documentSubtype: string;
  counterparty: string;
  account: string;
  postingStatus: "Posted" | "Unposted";
  debit: number;
  credit: number;
  total: number;
  accountActive: boolean;
  posted: boolean;
  balanced: boolean;
  document: Document;
}

const POSTED_STATUSES = new Set<Document["status"]>([
  "Approved",
  "Paid",
  "Transferred",
]);

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "operationDate", label: "Operation date", width: 150, visible: true },
  { key: "documentType", label: "Type", width: 180, visible: true },
  { key: "documentSubtype", label: "Subtype", width: 190, visible: true },
  { key: "counterparty", label: "Company / Counterparty", width: 230, visible: true },
  { key: "account", label: "GL account", width: 150, visible: true },
  { key: "postingStatus", label: "Posting status", width: 150, visible: true },
  { key: "debit", label: "Debit", width: 140, visible: true },
  { key: "credit", label: "Credit", width: 140, visible: true },
  { key: "total", label: "Total", width: 150, visible: true },
];

function amount(value: string | number | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, currency: string) {
  return `${value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency || "EUR"}`;
}

function createJournalCandidates(document: Document, activeAccounts: Set<string>) {
  const documentTotal = amount(document.totalAmount || document.amountWithoutVat);
  const isAccountingNote = /accounting[\s_-]*note/i.test(document.documentType);
  const posted = POSTED_STATUSES.has(document.status);
  const sourceLines = document.lineItems.length > 0
    ? document.lineItems
    : document.summaryLineItems;
  const lineAccounts = sourceLines
    .map((line, index) => ({
      id: line.id || `${document.id}-${index}`,
      account: line.expense?.trim() || "",
      value: amount(line.total || line.subtotal),
    }))
    .filter((line) => line.account);
  const accountLines = lineAccounts.length > 0
    ? lineAccounts
    : document.expenseAccount.trim()
      ? [{ id: document.id, account: document.expenseAccount.trim(), value: documentTotal }]
      : [];
  const fallbackLineValue = accountLines.length > 0
    ? documentTotal / accountLines.length
    : documentTotal;

  return accountLines.map((line) => {
    const total = line.value > 0 ? line.value : fallbackLineValue;
    const debit = isAccountingNote ? amount(document.debit) : total;
    const credit = isAccountingNote ? amount(document.credit) : total;
    const balanced = debit > 0 && credit > 0 && Math.abs(debit - credit) < 0.01;
    return {
      id: `${document.id}:${line.id}`,
      operationDate: document.operationDate || document.documentDate || "—",
      documentType: document.documentType || "—",
      documentSubtype: document.documentSubtype || "—",
      counterparty: document.clientCounterparty || "—",
      account: line.account,
      postingStatus: posted ? "Posted" : "Unposted",
      debit,
      credit,
      total: Math.max(debit, credit, total),
      accountActive: activeAccounts.has(line.account),
      posted,
      balanced,
      document,
    } satisfies JournalRow;
  });
}

export default function CompanyGlJournalView({ company }: { company: Company }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [openDocument, setOpenDocument] = useState<JournalRow | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:gl-journal-columns:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleColumns = columns.filter((column) => column.visible);
  const { startResize } = useColumnResize(columns, setColumns);

  useEffect(() => {
    setColumns((current) => {
      const synchronized = current.map((column) => {
        const systemColumn = DEFAULT_COLUMNS.find(
          (candidate) => candidate.key === column.key,
        );
        return systemColumn
          ? { ...column, label: systemColumn.label }
          : column;
      });
      const missing = DEFAULT_COLUMNS.filter(
        (systemColumn) =>
          !synchronized.some((column) => column.key === systemColumn.key),
      );
      return missing.length > 0 ? [...synchronized, ...missing] : synchronized;
    });
  }, [setColumns]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (!error && data)
      setDocuments((data as unknown as DbDocument[]).map(mapRow));
    setLoading(false);
  }, [company.id]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments, refreshRevision]);

  const activeAccounts = useMemo(
    () => {
      void refreshRevision;
      return new Set(
        loadCompanyGeneralLedgerAccountOptions(
          company.id,
          company.general_ledger ?? "",
        ),
      );
    },
    [company.general_ledger, company.id, refreshRevision],
  );

  const candidates = useMemo(
    () =>
      documents
        .flatMap((document) => createJournalCandidates(document, activeAccounts)),
    [activeAccounts, documents],
  );
  const unbalancedCount = candidates.filter(
    (candidate) => candidate.posted && !candidate.balanced,
  ).length;
  const rows = candidates.filter(
    (candidate) => !candidate.posted || candidate.balanced,
  );

  const filterColumns = DEFAULT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(
      new Set(
        rows.map((row) => {
          const key = column.key as JournalColumnKey;
          const value = row[key];
          return typeof value === "number"
            ? money(value, row.document.currency)
            : String(value);
        }),
      ),
    ),
  }));

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (
        normalized &&
        ![
          row.operationDate,
          row.documentType,
          row.documentSubtype,
          row.counterparty,
          row.account,
          row.document.number,
        ].some((value) => value.toLocaleLowerCase().includes(normalized))
      )
        return false;
      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        if (selected.length === 0) return true;
        const value = row[key as JournalColumnKey];
        const rendered =
          typeof value === "number"
            ? money(value, row.document.currency)
            : String(value);
        return selected.includes(rendered);
      });
    });
  }, [filterKeys, filterValues, query, rows]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    JournalRow,
    JournalColumnKey
  >(filteredRows, (row, key) => row[key]);

  const renderCell = (row: JournalRow, key: string) => {
    if (key === "account") {
      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">{row.account}</span>
          {!row.accountActive && row.account !== "—" && (
            <span className="flex-shrink-0 rounded bg-[#FFF2E8] px-1.5 py-0.5 text-[10px] font-semibold text-[#C45100]">
              Archived
            </span>
          )}
          {!row.balanced && (
            <span className="flex-shrink-0 rounded bg-[#FFF2E8] px-1.5 py-0.5 text-[10px] font-semibold text-[#C45100]">
              Unbalanced
            </span>
          )}
        </div>
      );
    }
    if (["debit", "credit", "total"].includes(key)) {
      return money(row[key as "debit" | "credit" | "total"], row.document.currency);
    }
    if (key === "postingStatus") {
      return (
        <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${row.posted ? "bg-[#E7F8F2] text-[#087A5B]" : "bg-[#E5EDF9] text-[#7288A3]"}`}>
          {row.postingStatus}
        </span>
      );
    }
    return String(row[key as JournalColumnKey] ?? "—");
  };

  return (
    <div className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="GL journal" />
      <CompanyBreadcrumb companyName={company.name} items={["GL journal"]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField ariaLabel="Search GL journal" value={query} onChange={setQuery} />
          <SystemAddFilters
            columns={filterColumns}
            activeKeys={filterKeys}
            values={filterValues}
            onActiveKeysChange={setFilterKeys}
            onValuesChange={setFilterValues}
            persistenceKey={`finansu-harmonija:v12:gl-journal-filters:${company.id}`}
          />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <ImportDataButton
            disabled={rows.length === 0}
            onClick={() => importMenuRecords(`company:${company.id}:gl-journal`, rows.map((row) => row.document.id))}
          />
          <RefreshAllButton onRefresh={() => setRefreshRevision((value) => value + 1)} />
        </div>
      </div>

      {unbalancedCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-[#F3D19E] bg-[#FFF8EC] px-4 py-3 font-montserrat text-[12px] text-[#7A4B00]">
          <AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />
          <span>
            {unbalancedCount} approved operation{unbalancedCount === 1 ? " is" : "s are"} excluded because debit and credit are not balanced.
          </span>
        </div>
      )}

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) + 70 }}>
          <div className="system-table-header-row mb-3 flex min-h-9 items-start">
            {visibleColumns.map((column) => {
              const key = column.key as JournalColumnKey;
              const realIndex = columns.findIndex((item) => item.key === column.key);
              return (
                <div key={column.key} style={{ width: column.width }} className="relative flex flex-shrink-0 items-start gap-1 px-3">
                  <span>{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={directionFor(key)} onDirectionChange={(direction) => changeSort(key, direction)} />
                  <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
                </div>
              );
            })}
            <div className="w-[70px] flex-shrink-0 px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">
              View
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            {sortedRows.map((row, index) => (
              <div key={row.id} className={`group flex h-10 items-center rounded-lg ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
                {visibleColumns.map((column) => (
                  <div key={column.key} style={{ width: column.width }} className="flex-shrink-0 overflow-hidden px-3 font-montserrat text-[12px] font-normal text-[#10233A]">
                    {renderCell(row, column.key)}
                  </div>
                ))}
                <div className="flex w-[70px] flex-shrink-0 items-center justify-center">
                  <button type="button" title="VIEW" aria-label={`VIEW ${row.document.number || row.document.documentType}`} onClick={() => setOpenDocument(row)} className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]">
                    <Eye size={15} />
                  </button>
                </div>
              </div>
            ))}
            {!loading && sortedRows.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]">
                <FileText size={30} />
                <span className="text-[14px] font-semibold">No documents with an assigned GL account</span>
                <span className="max-w-[520px] text-center text-[12px] leading-5">Assign an active GL account to the document or one of its lines to display it in this journal.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={1} totalPages={1} itemCount={sortedRows.length} onPageChange={() => undefined} />

      {showColumns && (
        <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />
      )}

      {openDocument && (
        <div className="fixed inset-0 z-[210] flex justify-end" onClick={() => setOpenDocument(null)}>
          <aside className="flex h-full w-[460px] max-w-full flex-col bg-white shadow-[-2px_0_0_#E5EDF9]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#D3E1EC] px-6 py-5">
              <div>
                <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Document details</h2>
                <p className="mt-1 font-montserrat text-[12px] text-[#7288A3]">Locked GL journal entry</p>
              </div>
              <button type="button" aria-label="Close document details" onClick={() => setOpenDocument(null)} className="text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col overflow-hidden rounded-lg border border-[#D3E1EC]">
                {[
                  ["Operation date", openDocument.operationDate],
                  ["Document number", openDocument.document.number || "—"],
                  ["Type", openDocument.documentType],
                  ["Subtype", openDocument.documentSubtype],
                  ["Company / Counterparty", openDocument.counterparty],
                  ["Status", openDocument.document.status],
                  ["Posting", openDocument.posted ? "Posted" : "Unposted"],
                  ["Account", openDocument.account],
                  ["Debit", money(openDocument.debit, openDocument.document.currency)],
                  ["Credit", money(openDocument.credit, openDocument.document.currency)],
                  ["Total", money(openDocument.total, openDocument.document.currency)],
                  ["Source", openDocument.document.source || "—"],
                ].map(([label, value], index) => (
                  <div key={label} className={`grid grid-cols-[160px_1fr] gap-4 px-4 py-3 font-montserrat text-[12px] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}>
                    <span className="font-semibold text-[#7288A3]">{label}</span>
                    <span className="font-medium text-[#10233A]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-[#F3F6F8] px-4 py-3 font-montserrat text-[11px] leading-5 text-[#7288A3]">
                Historical journal data is read-only. Archived GL accounts remain visible, but cannot be assigned to new documents or counterparties.
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
