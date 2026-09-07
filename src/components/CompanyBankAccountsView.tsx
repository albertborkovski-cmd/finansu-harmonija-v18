import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, CheckCircle2, ChevronDown, Landmark, Settings2, X } from "lucide-react";
import { supabase, type Company } from "../lib/supabase";
import { usePersistentState } from "../hooks/usePersistentState";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import RefreshAllButton from "./RefreshAllButton";
import { CancelButton, ColumnSettingsButton, SaveButton } from "./ScopedActionButtons";
import SystemAddFilters from "./SystemAddFilters";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

type OrganizationBankAccount = {
  id: string;
  iban: string;
  bank: string;
  bankCode: string;
  swift: string;
  primary: boolean;
  syncSchedule?: string;
  syncTime?: string;
  lastSyncedAt?: string;
};

type BankAccountColumnKey =
  | "iban" | "bank" | "bankCode" | "swift" | "primaryLabel"
  | "scheduleLabel" | "lastSyncedLabel";

type BankAccountRow = OrganizationBankAccount & {
  primaryLabel: string;
  scheduleLabel: string;
  lastSyncedLabel: string;
};

const SYNC_OPTIONS = [
  "Every 5 minutes",
  "Every hour",
  "Every day",
  "Synchronization disabled",
  "Manual synchronization",
];

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "iban", label: "Bank account", width: 210, visible: true },
  { key: "bank", label: "Bank", width: 170, visible: true },
  { key: "bankCode", label: "Account code", width: 140, visible: true },
  { key: "swift", label: "SWIFT/BIC", width: 140, visible: true },
  { key: "primaryLabel", label: "Primary", width: 100, visible: true },
  { key: "lastSyncedLabel", label: "Last synchronized", width: 180, visible: true },
];

function parseAccounts(value?: string): OrganizationBankAccount[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is OrganizationBankAccount =>
          Boolean(item) && typeof item === "object" &&
          typeof (item as OrganizationBankAccount).id === "string" &&
          typeof (item as OrganizationBankAccount).iban === "string")
      : [];
  } catch {
    return [];
  }
}

function formatSyncTime(value?: string) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function CompanyBankAccountsView({ company, onCompanyUpdated }: { company: Company; onCompanyUpdated: (company: Company) => void }) {
  const [accounts, setAccounts] = useState<OrganizationBankAccount[]>(() => parseAccounts(company.organization_bank_accounts));
  const [query, setQuery] = useState("");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<OrganizationBankAccount | null>(null);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:bank-account-columns:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const visibleColumns = columns.filter((column) => column.visible);
  const { startResize } = useColumnResize(columns, setColumns);

  useEffect(() => setAccounts(parseAccounts(company.organization_bank_accounts)), [company.id, company.organization_bank_accounts]);

  useEffect(() => {
    setColumns((current) => {
      const allowedKeys = new Set(DEFAULT_COLUMNS.map((column) => column.key));
      const retained = current.filter((column) => allowedKeys.has(column.key));
      const missing = DEFAULT_COLUMNS.filter(
        (column) => !retained.some((currentColumn) => currentColumn.key === column.key),
      );
      return [...retained, ...missing];
    });
  }, [setColumns]);

  const persistAccounts = async (next: OrganizationBankAccount[], successMessage: string) => {
    setError("");
    const serialized = JSON.stringify(next);
    const { error: saveError } = await supabase.from("companies").update({ organization_bank_accounts: serialized }).eq("id", company.id);
    if (saveError) {
      setError("Bank account settings could not be saved.");
      return false;
    }
    setAccounts(next);
    onCompanyUpdated({ ...company, organization_bank_accounts: serialized });
    setMessage(successMessage);
    window.setTimeout(() => setMessage(""), 2200);
    return true;
  };

  const syncAccounts = async (ids: string[]) => {
    if (!ids.length) return;
    setSyncingIds(ids);
    const syncedAt = new Date().toISOString();
    const next = accounts.map((account) => ids.includes(account.id) ? { ...account, lastSyncedAt: syncedAt } : account);
    await persistAccounts(next, ids.length === 1 ? "Bank account synchronized" : "All bank accounts synchronized");
    window.setTimeout(() => setSyncingIds([]), 450);
  };

  const rows = useMemo<BankAccountRow[]>(() => accounts.map((account) => ({
    ...account,
    primaryLabel: account.primary ? "Yes" : "No",
    scheduleLabel: account.syncSchedule || "Manual synchronization",
    lastSyncedLabel: formatSyncTime(account.lastSyncedAt),
  })), [accounts]);

  const filterColumns = useMemo(() => DEFAULT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(new Set(rows.map((row) => String(row[column.key as BankAccountColumnKey] || "—")))),
  })), [rows]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !normalized || DEFAULT_COLUMNS.some((column) => String(row[column.key as BankAccountColumnKey] || "—").toLocaleLowerCase().includes(normalized));
      const matchesFilters = filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        return !selected.length || selected.includes(String(row[key as BankAccountColumnKey] || "—"));
      });
      return matchesSearch && matchesFilters;
    });
  }, [filterKeys, filterValues, query, rows]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<BankAccountRow, BankAccountColumnKey>(filteredRows, (row, key) => row[key]);
  const itemsPerPage = showAll ? Math.max(1, sortedRows.length) : 4;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = showAll ? sortedRows : sortedRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const renderCell = (row: BankAccountRow, key: string) => {
    if (key === "primaryLabel") return <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${row.primary ? "bg-[#E7F4F9] text-[#007EA7]" : "text-[#7288A3]"}`}>{row.primaryLabel}</span>;
    return String(row[key as BankAccountColumnKey] || "—");
  };

  const saveEditing = async () => {
    if (!editing) return;
    const next = accounts.map((account) => account.id === editing.id ? editing : account);
    if (await persistAccounts(next, "Synchronization settings saved")) {
      setEditing(null);
      setFrequencyOpen(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Bank accounts" actions={<PageActionButton disabled={!accounts.length || syncingIds.length > 0} onClick={() => void syncAccounts(accounts.map((account) => account.id))}>SYNC ALL</PageActionButton>} />
      <CompanyBreadcrumb companyName={company.name} items={["Bank", "Bank accounts"]} />

      <div className="flex flex-wrap items-center gap-2">
        <OcrSearchField ariaLabel="Search bank accounts" value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <SystemAddFilters columns={filterColumns} activeKeys={filterKeys} values={filterValues} onActiveKeysChange={setFilterKeys} onValuesChange={setFilterValues} persistenceKey={`finansu-harmonija:v12:bank-account-filters:${company.id}`} />
        <div className="ml-auto flex items-center gap-4">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton onRefresh={() => setAccounts(parseAccounts(company.organization_bank_accounts))} />
        </div>
      </div>

      {(message || error) && <div className={`flex h-10 items-center gap-2 rounded-lg px-4 font-montserrat text-[12px] font-semibold ${error ? "bg-[#FCEEEE] text-[#B42318]" : "bg-[#E7F8F2] text-[#087A5B]"}`}>{!error && <CheckCircle2 size={16} />}{error || message}</div>}

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) + 104 }}>
          <div className="system-table-header-row mb-3 flex min-h-9 items-start">
            {visibleColumns.map((column) => {
              const key = column.key as BankAccountColumnKey;
              const realIndex = columns.findIndex((item) => item.key === column.key);
              return <div key={column.key} style={{ width: column.width }} className="relative flex flex-shrink-0 items-start gap-1 px-3">
                <span>{column.label}</span>
                <ColumnSortButton columnLabel={column.label} direction={directionFor(key)} onDirectionChange={(direction) => changeSort(key, direction)} />
                <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
              </div>;
            })}
            <div className="w-[104px] flex-shrink-0" />
          </div>

          <div className="flex flex-col gap-0.5">
            {visibleRows.map((row, index) => {
              const syncing = syncingIds.includes(row.id);
              return <div key={row.id} className={`flex h-10 items-center rounded-lg ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
                {visibleColumns.map((column) => <div key={column.key} style={{ width: column.width }} className="flex-shrink-0 truncate px-3 font-montserrat text-[12px] font-normal text-[#10233A]">{renderCell(row, column.key)}</div>)}
                <div className="flex w-[104px] flex-shrink-0 items-center justify-end gap-2 px-3">
                  <button type="button" aria-label={`Synchronize ${row.iban}`} title="SYNC NOW" disabled={syncing} onClick={() => void syncAccounts([row.id])} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C8D8E5] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-white hover:text-[#007EA7] disabled:opacity-50"><ArrowDownUp size={14} className={syncing ? "animate-pulse" : ""} /></button>
                  <button type="button" aria-label={`SETTINGS ${row.iban}`} title="SETTINGS" onClick={() => setEditing({ ...row })} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C8D8E5] text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-white hover:text-[#007EA7]"><Settings2 size={14} /></button>
                </div>
              </div>;
            })}
            {!visibleRows.length && <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]"><Landmark size={30} /><span className="text-[14px] font-semibold">No bank accounts</span><span className="text-[12px]">Add bank accounts in Settings / Organizations / Bank information.</span></div>}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={currentPage} totalPages={totalPages} itemCount={sortedRows.length} itemsPerPage={itemsPerPage} onPageChange={setPage} onShowMore={() => { setShowAll((value) => !value); setPage(1); }} showMoreLabel={showAll ? "Default" : "Show more"} allItemsVisible={showAll} />

      {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}

      {editing && <div className="fixed inset-0 z-[220] flex justify-end" onClick={() => setEditing(null)}>
        <aside className="flex h-full w-[380px] max-w-full flex-col bg-white shadow-[-2px_0_0_#E5EDF9]" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-5"><h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Synchronization settings</h2><button type="button" aria-label="Close synchronization settings" onClick={() => setEditing(null)} className="text-[#7288A3]"><X size={24} /></button></div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-2">
            <div className="rounded-lg bg-[#F8FDFF] px-4 py-3"><p className="font-montserrat text-[11px] font-semibold uppercase text-[#7288A3]">Bank account</p><p className="mt-1 font-montserrat text-[13px] font-semibold text-[#10233A]">{editing.iban || "—"}</p></div>
            <label className="relative flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">Synchronization frequency
              <button type="button" aria-haspopup="listbox" aria-expanded={frequencyOpen} onClick={() => setFrequencyOpen((value) => !value)} className="flex h-10 items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 text-left text-[13px] font-medium outline-none focus:border-[#007EA7]"><span>{editing.syncSchedule || "Manual synchronization"}</span><ChevronDown size={16} className={`text-[#7288A3] transition-transform ${frequencyOpen ? "rotate-180" : ""}`} /></button>
              {frequencyOpen && <div role="listbox" className="absolute left-0 right-0 top-[66px] z-10 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-lg">{SYNC_OPTIONS.map((option) => { const selected = (editing.syncSchedule || "Manual synchronization") === option; return <button key={option} type="button" role="option" aria-selected={selected} onClick={() => { setEditing({ ...editing, syncSchedule: option }); setFrequencyOpen(false); }} className={`flex h-9 w-full items-center justify-between rounded-md px-3 text-left font-montserrat text-[12px] font-medium ${selected ? "bg-[#E7F4F9] text-[#007EA7]" : "text-[#10233A] hover:bg-[#F8FDFF]"}`}><span>{option}</span>{selected && <Check size={14} />}</button>; })}</div>}
            </label>
            {(editing.syncSchedule || "Manual synchronization") === "Every day" && <label className="flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">Daily synchronization time<input type="time" value={editing.syncTime || "09:00"} onChange={(event) => setEditing({ ...editing, syncTime: event.target.value })} className="h-10 rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" /></label>}
            <div className="rounded-lg border border-[#E5EDF9] px-4 py-3"><p className="font-montserrat text-[11px] font-semibold uppercase text-[#7288A3]">Last synchronized</p><p className="mt-1 font-montserrat text-[13px] font-medium text-[#10233A]">{formatSyncTime(editing.lastSyncedAt)}</p></div>
          </div>
          <div className="flex gap-3 border-t border-[#E5EDF9] px-6 py-5"><CancelButton className="flex-1" onClick={() => setEditing(null)} /><SaveButton className="flex-1" onClick={() => void saveEditing()} /></div>
        </aside>
      </div>}
    </div>
  );
}
