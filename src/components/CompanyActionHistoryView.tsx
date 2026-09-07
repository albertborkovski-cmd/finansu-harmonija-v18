import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Eye, FileClock, X } from "lucide-react";
import type { Company, DbDocument } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePersistentState } from "../hooks/usePersistentState";
import { PageActionButton, PageHeader } from "./PageHeader";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import OcrSearchField from "./OcrSearchField";
import SystemAddFilters from "./SystemAddFilters";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import RefreshAllButton from "./RefreshAllButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import { getCurrentUserName } from "../lib/currentUser";

type ActionStatus = "Active" | "Archived";

type ActionHistoryRow = {
  id: string;
  date: string;
  user: string;
  userType: string;
  actionType: string;
  objectType: string;
  objectNumber: string;
  status: ActionStatus;
  details: string;
};

type RawDocumentHistory = {
  id: string;
  document_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
};

type ActionColumnKey =
  | "date"
  | "user"
  | "userType"
  | "actionType"
  | "objectType"
  | "objectNumber"
  | "status";

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "date", label: "Date / Time", width: 172, visible: true },
  { key: "user", label: "User", width: 170, visible: true },
  { key: "userType", label: "User type", width: 130, visible: true },
  { key: "actionType", label: "Action type", width: 180, visible: true },
  { key: "objectType", label: "Object type", width: 150, visible: true },
  { key: "objectNumber", label: "Object ID / No.", width: 170, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
];

const STATUS_COLOR: Record<ActionStatus, string> = {
  Active: "#0ED8A8",
  Archived: "#A1B6C6",
};

function currentUserName() {
  return getCurrentUserName();
}

function normalizeHistoricalUser(userName: string) {
  return userName.trim().toLocaleLowerCase() === "current user"
    ? currentUserName()
    : userName || "Unknown user";
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()} - ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: Array<Array<unknown>>) {
  const blob = new Blob(
    [`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function objectTypeFor(document: DbDocument) {
  const value = document.document_type?.trim();
  return value || "Document";
}

function objectNumberFor(document: DbDocument) {
  return document.number?.trim() || document.file_case?.trim() || document.id;
}

export default function CompanyActionHistoryView({ company }: { company: Company }) {
  const [rows, setRows] = useState<ActionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v12:columns:company-action-history:${company.id}`,
    DEFAULT_COLUMNS,
  );
  const [showColumns, setShowColumns] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionHistoryRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [refreshingText, setRefreshingText] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  const loadActions = useCallback(async () => {
    setLoading(true);
    const [documentResult, historyResult] = await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_history")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const documents = (documentResult.data ?? []) as unknown as DbDocument[];
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const savedHistory = ((historyResult.data ?? []) as unknown as RawDocumentHistory[])
      .filter((history) => documentById.has(history.document_id))
      .map<ActionHistoryRow>((history) => {
        const document = documentById.get(history.document_id)!;
        return {
          id: history.id,
          date: history.created_at,
          user: normalizeHistoricalUser(history.user_name),
          userType: "Internal user",
          actionType: history.action || "Updated",
          objectType: objectTypeFor(document),
          objectNumber: objectNumberFor(document),
          status: "Active",
          details: history.details || "Document information updated.",
        };
      });

    const creationRows = documents.map<ActionHistoryRow>((document) => ({
      id: `created-${document.id}`,
      date: document.created_at,
      user:
        document.source === "Manual"
          ? document.created_by?.trim() || "Unknown user"
          : company.name,
      userType: document.source === "Manual" ? "Internal user" : "Client",
      actionType:
        document.source === "Manual" ? "Document creation" : "Document upload",
      objectType: objectTypeFor(document),
      objectNumber: objectNumberFor(document),
      status: "Active",
      details:
        document.source === "Manual"
          ? "Document created manually."
          : `Document received from ${document.source || "an external source"}.`,
    }));

    setRows(
      [...savedHistory, ...creationRows].sort(
        (left, right) =>
          new Date(right.date).getTime() - new Date(left.date).getTime(),
      ),
    );
    setLoading(false);
  }, [company.id, company.name]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const visibleColumns = columns.filter((column) => column.visible);
  const filterColumns = DEFAULT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(
      new Set(
        rows.map((row) =>
          column.key === "date"
            ? displayDate(row.date).slice(0, 10)
            : String(row[column.key as ActionColumnKey]),
        ),
      ),
    ).sort(),
  }));

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (
        needle &&
        ![
          displayDate(row.date),
          row.user,
          row.userType,
          row.actionType,
          row.objectType,
          row.objectNumber,
          row.status,
          row.details,
        ].some((value) => value.toLocaleLowerCase().includes(needle))
      ) return false;
      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        const value =
          key === "date"
            ? displayDate(row.date).slice(0, 10)
            : String(row[key as ActionColumnKey]);
        return selected.length === 0 || selected.includes(value);
      });
    });
  }, [filterKeys, filterValues, query, rows]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    ActionHistoryRow,
    ActionColumnKey
  >(filteredRows, (row, key) => row[key]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = sortedRows.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );

  const exportHistory = () => {
    const headers = visibleColumns.map((column) => column.label);
    const data = sortedRows.map((row) =>
      visibleColumns.map((column) =>
        column.key === "date"
          ? displayDate(row.date)
          : row[column.key as ActionColumnKey],
      ),
    );
    downloadCsv(
      `${company.name.replace(/\s+/g, "-").toLocaleLowerCase()}-action-history.csv`,
      [headers, ...data],
    );
  };

  const refreshAll = async () => {
    setRefreshingText(true);
    await loadActions();
    window.setTimeout(() => setRefreshingText(false), 420);
  };

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Action history"
        actions={
          <PageActionButton onClick={exportHistory}>Export history</PageActionButton>
        }
      />
      <CompanyBreadcrumb companyName={company.name} items={["Action history"]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <OcrSearchField
            ariaLabel="Search action history"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setCurrentPage(1);
            }}
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v12:filters:company-action-history:${company.id}`}
            columns={filterColumns}
            activeKeys={filterKeys}
            values={filterValues}
            onActiveKeysChange={(keys) => {
              setFilterKeys(keys);
              setCurrentPage(1);
            }}
            onValuesChange={(values) => {
              setFilterValues(values);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-4 rounded bg-white p-1.5">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <button
            type="button"
            aria-label="EXPORT DATA"
            title="EXPORT DATA"
            onClick={exportHistory}
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
          >
            <Download size={16} />
          </button>
          <RefreshAllButton onRefresh={() => void refreshAll()} />
        </div>
      </div>

      <div
        ref={tableScrollRef}
        className="min-h-[260px] flex-1 overflow-x-auto scrollbar-hide"
      >
        <div
          className="min-w-max"
          style={{
            width:
              visibleColumns.reduce((sum, column) => sum + column.width, 0) +
              44,
          }}
        >
          <div className="mb-3 flex min-h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
            {visibleColumns.map((column, index) => (
              <div
                key={column.key}
                style={{ width: column.width }}
                className={`relative flex min-h-6 flex-shrink-0 items-center gap-1 px-3 ${index > 0 ? "border-l border-[#D3E1EC]" : ""}`}
              >
                <span className="min-w-0 whitespace-normal leading-4">
                  {column.label}
                </span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key as ActionColumnKey)}
                  onDirectionChange={(direction) =>
                    changeSort(column.key as ActionColumnKey, direction)
                  }
                />
                <ResizeHandle
                  onMouseDown={(event) =>
                    startResize(
                      columns.findIndex((item) => item.key === column.key),
                      event,
                    )
                  }
                />
              </div>
            ))}
            <div className="w-11 flex-shrink-0" aria-hidden="true" />
          </div>

          <div
            className={`flex flex-col gap-0.5 transition-opacity ${refreshingText ? "opacity-35" : "opacity-100"}`}
          >
            {!loading &&
              pageRows.map((row, index) => (
                <div
                  key={row.id}
                  className={`flex min-h-10 items-center rounded-lg font-montserrat text-[12px] text-[#10233A] transition-colors ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                >
                  {visibleColumns.map((column) => (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="flex flex-shrink-0 items-center overflow-hidden px-3"
                    >
                      {column.key === "status" ? (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: STATUS_COLOR[row.status] }}
                          />
                          {row.status}
                        </span>
                      ) : (
                        <span className="block truncate">
                          {column.key === "date"
                            ? displayDate(row.date)
                            : String(row[column.key as ActionColumnKey])}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="flex w-11 flex-shrink-0 justify-center">
                    <button
                      type="button"
                      title="VIEW"
                      aria-label={`VIEW details for ${row.objectNumber}`}
                      onClick={() => setSelectedAction(row)}
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Eye size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}

            {loading && (
              <div className="flex min-h-[260px] items-center justify-center font-montserrat text-[12px] text-[#7288A3]">
                Loading action history…
              </div>
            )}
            {!loading && pageRows.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileClock size={30} />
                <span className="font-montserrat text-[13px] font-semibold">
                  No actions found
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={safePage}
        totalPages={totalPages}
        itemCount={sortedRows.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onShowMore={() => {
          setItemsPerPage((current) =>
            current === 4 ? Math.max(4, sortedRows.length) : 4,
          );
          setCurrentPage(1);
        }}
        showMoreLabel={itemsPerPage === 4 ? "Show more" : "Default"}
        allItemsVisible={itemsPerPage !== 4}
      />

      {showColumns && (
        <>
          <button
            type="button"
            aria-label="Close column settings"
            className="fixed inset-0 z-40 bg-[#10233A]/10"
            onClick={() => setShowColumns(false)}
          />
          <ColumnSettingsPanel
            columns={columns}
            defaultColumns={DEFAULT_COLUMNS}
            onSave={setColumns}
            onClose={() => setShowColumns(false)}
          />
        </>
      )}

      {selectedAction && (
        <>
          <button
            type="button"
            aria-label="Close action details"
            className="fixed inset-0 z-[70] bg-[#10233A]/10"
            onClick={() => setSelectedAction(null)}
          />
          <aside className="fixed right-0 top-0 z-[80] flex h-screen w-[340px] max-w-full flex-col gap-6 bg-white p-6 shadow-[-2px_0_0_#E5EDF9]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                Action details
              </h2>
              <button
                type="button"
                aria-label="Close action details"
                onClick={() => setSelectedAction(null)}
                className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]"
              >
                <X size={24} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const text = [
                  `Action ID: ${selectedAction.id}`,
                  `Date: ${displayDate(selectedAction.date)}`,
                  `User: ${selectedAction.user}`,
                  `Action type: ${selectedAction.actionType}`,
                  `Object type: ${selectedAction.objectType}`,
                  `Object ID/No.: ${selectedAction.objectNumber}`,
                  `Details: ${selectedAction.details}`,
                ].join("\n");
                void navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                });
              }}
              className="flex h-8 w-fit items-center gap-2 rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
            >
              {copied ? "Copied" : "Copy action details"} <Copy size={16} />
            </button>

            <div className="flex flex-col gap-3 rounded-lg bg-[#F2F5F9] p-3">
              {[
                ["Action ID", selectedAction.id],
                ["Date", displayDate(selectedAction.date)],
                ["User", selectedAction.user],
                ["Action type", selectedAction.actionType],
                ["Object type", selectedAction.objectType],
                ["Object ID / No.", selectedAction.objectNumber],
                ["Status", selectedAction.status],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <span className="font-montserrat text-[12px] font-semibold leading-[18px] text-[#10233A]">
                    {label}
                  </span>
                  <span className="break-words font-montserrat text-[12px] leading-[18px] text-[#10233A]">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-montserrat text-[12px] font-semibold leading-[18px] text-[#10233A]">
                Details
              </span>
              <p className="rounded-lg border border-[#E5EDF9] bg-[#F8FDFF] p-3 font-montserrat text-[12px] leading-5 text-[#10233A]">
                {selectedAction.details}
              </p>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}
