import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import { supabase, type Company, type DbDocument } from "../lib/supabase";
import { importMenuRecords } from "../lib/menuImport";
import { mapRow, type Document } from "./Documents";
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

type BankColumnKey =
  | "bankAccount" | "accountCode" | "transferNo" | "date"
  | "counterpartyName" | "counterpartyCode" | "postingType" | "amount"
  | "currency" | "exchangeRateDate" | "paymentPurpose" | "referenceNo"
  | "costCenter" | "notes" | "glAccounts" | "settledDocuments"
  | "confirmed" | "id" | "attachmentsCount";

type BankRow = Record<BankColumnKey, string> & { documentId: string };

type BankAccount = {
  iban?: string;
  bankCode?: string;
  primary?: boolean;
};

const COUNTERPARTIES_STORAGE_KEY = "finansu-harmonija:v7:settings:counterparties";

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "bankAccount", label: "Bank account", width: 190, visible: true },
  { key: "accountCode", label: "Account code", width: 140, visible: true },
  { key: "transferNo", label: "Transfer no.", width: 150, visible: true },
  { key: "date", label: "Date", width: 130, visible: true },
  { key: "counterpartyName", label: "Counterparty name", width: 220, visible: true },
  { key: "counterpartyCode", label: "Counterparty code", width: 170, visible: true },
  { key: "postingType", label: "Posting type", width: 150, visible: true },
  { key: "amount", label: "Amount", width: 140, visible: true },
  { key: "currency", label: "Currency", width: 110, visible: true },
  { key: "exchangeRateDate", label: "Exchange rate date", width: 180, visible: true },
  { key: "paymentPurpose", label: "Purpose of payment", width: 240, visible: true },
  { key: "referenceNo", label: "Reference No.", width: 160, visible: true },
  { key: "costCenter", label: "Cost center", width: 150, visible: true },
  { key: "notes", label: "Notes", width: 220, visible: true },
  { key: "glAccounts", label: "GL accounts", width: 150, visible: true },
  { key: "settledDocuments", label: "Settled documents", width: 220, visible: true },
  { key: "confirmed", label: "Confirmed?", width: 130, visible: true },
  { key: "id", label: "ID", width: 180, visible: true },
  { key: "attachmentsCount", label: "Attachments count", width: 170, visible: true },
];

const CONFIRMED_STATUSES = new Set<Document["status"]>(["Approved", "Paid", "Transferred"]);

function parseBankAccount(company: Company): BankAccount {
  try {
    const accounts = JSON.parse(company.organization_bank_accounts ?? "[]") as BankAccount[];
    if (!Array.isArray(accounts)) return {};
    return accounts.find((account) => account.primary) ?? accounts[0] ?? {};
  } catch {
    return {};
  }
}

function documentGlAccounts(document: Document) {
  const values = [
    document.expenseAccount,
    ...document.lineItems.map((line) => line.expense),
    ...document.summaryLineItems.map((line) => line.expense),
  ].map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(values)).join(", ") || "—";
}

function loadCounterpartyCodes() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COUNTERPARTIES_STORAGE_KEY) ?? "[]") as Company[];
    return new Map(
      (Array.isArray(parsed) ? parsed : []).map((counterparty) => [
        counterparty.name.trim().toLocaleLowerCase(),
        counterparty.company_code || "—",
      ]),
    );
  } catch {
    return new Map<string, string>();
  }
}

function toBankRow(document: Document, account: BankAccount, counterpartyCodes: Map<string, string>): BankRow {
  const date = document.operationDate || document.documentDate || document.receiveDate || "—";
  const documentLabel = document.number || document.fileCase || document.documentType || "—";
  return {
    documentId: document.id,
    bankAccount: account.iban || "—",
    accountCode: account.bankCode || "—",
    transferNo: document.orderNo || document.number || "—",
    date,
    counterpartyName: document.clientCounterparty || "—",
    counterpartyCode: document.counterpartyCode || counterpartyCodes.get(document.clientCounterparty.trim().toLocaleLowerCase()) || "—",
    postingType: document.documentPurpose || document.type || "—",
    amount: document.totalAmount || document.amountWithoutVat || "—",
    currency: document.currency || "—",
    exchangeRateDate: date,
    paymentPurpose: document.note || document.documentSubtype || document.documentType || "—",
    referenceNo: document.number || document.orderNo || "—",
    costCenter: document.costCenter || "—",
    notes: document.note || "—",
    glAccounts: documentGlAccounts(document),
    settledDocuments: documentLabel,
    confirmed: CONFIRMED_STATUSES.has(document.status) ? "Yes" : "No",
    id: document.id,
    attachmentsCount: document.imageUrl ? "1" : "0",
  };
}

export default function CompanyBankView({ company }: { company: Company }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [showColumns, setShowColumns] = useState(false);
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:company-bank-columns:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleColumns = columns.filter((column) => column.visible);
  const { startResize } = useColumnResize(columns, setColumns);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("documents").select("*")
      .eq("company_id", company.id).order("created_at", { ascending: false });
    if (!error && data)
      setDocuments((data as unknown as DbDocument[]).map(mapRow));
    setLoading(false);
  }, [company.id]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments, refreshRevision]);

  const rows = useMemo(() => {
    void refreshRevision;
    const account = parseBankAccount(company);
    const counterpartyCodes = loadCounterpartyCodes();
    return documents.map((document) => toBankRow(document, account, counterpartyCodes));
  }, [company, documents, refreshRevision]);

  const filterColumns = useMemo(() => DEFAULT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(new Set(rows.map((row) => row[column.key as BankColumnKey]))),
  })), [rows]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (normalized && !DEFAULT_COLUMNS.some((column) => row[column.key as BankColumnKey].toLocaleLowerCase().includes(normalized))) return false;
      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        return selected.length === 0 || selected.includes(row[key as BankColumnKey]);
      });
    });
  }, [filterKeys, filterValues, query, rows]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<BankRow, BankColumnKey>(
    filteredRows,
    (row, key) => row[key],
  );
  const itemsPerPage = showAll ? Math.max(1, sortedRows.length) : 4;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = showAll ? sortedRows : sortedRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Bank" />
      <CompanyBreadcrumb companyName={company.name} items={["Bank"]} />
      <div className="flex flex-wrap items-center gap-2">
        <OcrSearchField ariaLabel="Search bank entries" value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <SystemAddFilters columns={filterColumns} activeKeys={filterKeys} values={filterValues} onActiveKeysChange={setFilterKeys} onValuesChange={setFilterValues} persistenceKey={`finansu-harmonija:v12:company-bank-filters:${company.id}`} />
        <div className="ml-auto flex items-center gap-4">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <ImportDataButton
            disabled={rows.length === 0}
            onClick={() => importMenuRecords(`company:${company.id}:bank`, rows.map((row) => row.documentId))}
          />
          <RefreshAllButton onRefresh={() => setRefreshRevision((value) => value + 1)} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) }}>
          <div className="system-table-header-row mb-3 flex min-h-9 items-start">
            {visibleColumns.map((column) => {
              const key = column.key as BankColumnKey;
              const realIndex = columns.findIndex((item) => item.key === column.key);
              return <div key={column.key} style={{ width: column.width }} className="relative flex flex-shrink-0 items-start gap-1 px-3">
                <span>{column.label}</span>
                <ColumnSortButton columnLabel={column.label} direction={directionFor(key)} onDirectionChange={(direction) => changeSort(key, direction)} />
                <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
              </div>;
            })}
          </div>
          <div className="flex flex-col gap-0.5">
            {visibleRows.map((row, index) => <div key={row.documentId} className={`flex h-10 items-center rounded-lg ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
              {visibleColumns.map((column) => <div key={column.key} style={{ width: column.width }} title={row[column.key as BankColumnKey]} className="flex-shrink-0 truncate px-3 font-montserrat text-[12px] font-normal text-[#10233A]">
                {row[column.key as BankColumnKey]}
              </div>)}
            </div>)}
            {!loading && visibleRows.length === 0 && <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]">
              <Landmark size={30} />
              <span className="text-[14px] font-semibold">No bank entries</span>
              <span className="text-[12px]">Bank entries will appear when the company has related documents.</span>
            </div>}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={currentPage} totalPages={totalPages} itemCount={sortedRows.length} itemsPerPage={itemsPerPage} onPageChange={setPage} onShowMore={() => { setShowAll((value) => !value); setPage(1); }} showMoreLabel={showAll ? "Default" : "Show more"} allItemsVisible={showAll} />
      {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
    </div>
  );
}
