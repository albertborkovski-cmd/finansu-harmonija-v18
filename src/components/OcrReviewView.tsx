import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, FileText, UserRound } from "lucide-react";
import type { Company, DbDocument } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { getCurrentUserName } from "../lib/currentUser";
import { loadLinkedDirectoryUsers } from "../lib/linkedSettingsData";
import { usePersistentState } from "../hooks/usePersistentState";
import { PageHeader } from "./PageHeader";
import OcrBreadcrumb from "./OcrBreadcrumb";
import OcrSearchField from "./OcrSearchField";
import RefreshAllButton from "./RefreshAllButton";
import SystemAddFilters, { type SystemFilterColumn } from "./SystemAddFilters";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import type { ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import { ProcessedDocumentsTable, type ReviewDocumentReference } from "./OcrProcessedDocumentsView";
import { WorkspaceDocumentEditor, type WorkspaceTask } from "./WorkspaceView";
import { OCR_DOCUMENT_WORK_LOG_KEY, type OcrDocumentWorkLog } from "./ocrDocumentWorkTimeStore";

export type OcrReviewSection = "approve-documents" | "analytics";

type ReviewWorkLog = OcrDocumentWorkLog;

type DirectoryUser = {
  id?: string;
  fullName?: string;
  username?: string;
  email?: string;
  status?: string;
};

type WorkerDocument = {
  document: DbDocument;
  organization: string;
  seconds: number;
};

type WorkerAnalytics = {
  id: string;
  name: string;
  email: string;
  documents: WorkerDocument[];
  needReview: number;
  approved: number;
  totalSeconds: number;
};

type AnalyticsFilterKey = "employee" | "email" | "documents" | "needReview" | "approved" | "workTime";

const ANALYTICS_FILTER_COLUMNS: Array<{ key: AnalyticsFilterKey; label: string }> = [
  { key: "employee", label: "Employee" },
  { key: "email", label: "Email" },
  { key: "documents", label: "Documents" },
  { key: "needReview", label: "Need review" },
  { key: "approved", label: "Approved" },
  { key: "workTime", label: "Work time" },
];

const ANALYTICS_COLUMNS: ColConfig[] = [
  { key: "employee", label: "Employee", width: 240, visible: true },
  { key: "email", label: "Email", width: 190, visible: true },
  { key: "documents", label: "Documents", width: 140, visible: true },
  { key: "needReview", label: "Need review", width: 140, visible: true },
  { key: "approved", label: "Approved", width: 140, visible: true },
  { key: "workTime", label: "Work time", width: 150, visible: true },
];

const REVIEW_WORK_LOG_KEY = OCR_DOCUMENT_WORK_LOG_KEY;
const REVIEW_STATUSES = new Set([
  "need review",
  "needs review",
  "pending",
  "draft",
  "overdue",
  "rejected",
  "provide additional data",
  "exception",
  "duplicate",
  "not document",
]);

function normalized(value?: string) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function userName(user: DirectoryUser) {
  return user.fullName?.trim() || user.username?.trim() || user.email?.trim() || "Unnamed user";
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function analyticsFilterValue(row: WorkerAnalytics, key: AnalyticsFilterKey) {
  if (key === "employee") return row.name;
  if (key === "email") return row.email;
  if (key === "documents") return String(row.documents.length);
  if (key === "needReview") return String(row.needReview);
  if (key === "approved") return String(row.approved);
  return formatDuration(row.totalSeconds);
}

function ApproveDocumentsView() {
  const [activeDocument, setActiveDocument] = useState<ReviewDocumentReference | null>(null);
  const [documentQueue, setDocumentQueue] = useState<ReviewDocumentReference[]>([]);
  const [documentIndex, setDocumentIndex] = useState(-1);
  const [notice, setNotice] = useState("");
  const [reviewHeaderActions, setReviewHeaderActions] = useState<HTMLDivElement | null>(null);
  const [savedTasks, setSavedTasks] = usePersistentState<Record<string, WorkspaceTask>>(
    "finansu-harmonija:v12:ocr:review-tasks",
    {},
  );
  const [, setWorkLog] = usePersistentState<ReviewWorkLog>(REVIEW_WORK_LOG_KEY, {});
  const workStartedAt = useRef<number | null>(null);

  const finishWorkSession = useCallback((documentId?: string) => {
    if (!documentId || workStartedAt.current === null) return;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - workStartedAt.current) / 1000));
    setWorkLog((current) => {
      const previous = current[documentId];
      return {
        ...current,
        [documentId]: {
          seconds: (previous?.seconds ?? 0) + elapsedSeconds,
          user: getCurrentUserName(),
          updatedAt: new Date().toISOString(),
        },
      };
    });
    workStartedAt.current = null;
  }, [setWorkLog]);

  const openDocument = (document: ReviewDocumentReference, index: number, documents: ReviewDocumentReference[]) => {
    setActiveDocument(document);
    setDocumentQueue(documents);
    setDocumentIndex(index);
    workStartedAt.current = Date.now();
  };

  const runAndApproveDocument = async (document: ReviewDocumentReference) => {
    const result = await supabase.from("documents").update({ status: "Accepted" }).eq("id", document.id);
    if (result.error) {
      setNotice(`Document could not be approved: ${result.error.message}`);
      return;
    }
    finishWorkSession(document.id);
    window.dispatchEvent(new CustomEvent("finansu-harmonija:data-changed"));
    setNotice(`${document.name} approved.`);
  };

  const runAndApproveDocuments = async (documents: ReviewDocumentReference[]) => {
    if (documents.length === 0) return;
    const result = await supabase
      .from("documents")
      .update({ status: "Accepted" })
      .in("id", documents.map((document) => document.id));
    if (result.error) {
      setNotice(`Documents could not be processed: ${result.error.message}`);
      return;
    }
    window.dispatchEvent(new CustomEvent("finansu-harmonija:data-changed"));
    setNotice(`${documents.length} document${documents.length === 1 ? "" : "s"} processed and approved.`);
  };

  if (activeDocument) {
    const hasNext = documentIndex >= 0 && documentIndex < documentQueue.length - 1;
    return (
      <WorkspaceDocumentEditor
        documentName={activeDocument.name}
        documentId={activeDocument.id}
        savedTask={savedTasks[activeDocument.id]}
        filePosition={documentIndex + 1}
        fileTotal={documentQueue.length}
        onSave={(task) => {
          setSavedTasks((current) => ({ ...current, [activeDocument.id]: task }));
          finishWorkSession(activeDocument.id);
          workStartedAt.current = Date.now();
        }}
        onNextFile={hasNext ? () => {
          finishWorkSession(activeDocument.id);
          const nextIndex = documentIndex + 1;
          setDocumentIndex(nextIndex);
          setActiveDocument(documentQueue[nextIndex]);
          workStartedAt.current = Date.now();
        } : undefined}
        onBack={() => {
          finishWorkSession(activeDocument.id);
          setActiveDocument(null);
          setDocumentQueue([]);
          setDocumentIndex(-1);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Approve documents"
        actions={<div ref={setReviewHeaderActions} className="flex items-center" />}
      />
      <OcrBreadcrumb items={["Review", "Approve documents"]} />
      <ProcessedDocumentsTable
        embedded
        reviewOnly
        selectable
        onImportDocuments={runAndApproveDocuments}
        importActionContainer={reviewHeaderActions}
        selectionActionVariant="run"
        onEditDocument={openDocument}
        onRunDocument={(document) => void runAndApproveDocument(document)}
      />
      {notice && <div role="status" className="fixed bottom-6 right-6 z-[240] rounded-lg bg-[#E7F7EF] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#237A50] shadow-lg">{notice}</div>}
    </div>
  );
}

function ReviewAnalyticsView() {
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [analyticsColumns, setAnalyticsColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v12:ocr:review-analytics:columns",
    ANALYTICS_COLUMNS,
  );
  const [workLog] = usePersistentState<ReviewWorkLog>(REVIEW_WORK_LOG_KEY, {});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(analyticsColumns, setAnalyticsColumns);

  const loadData = useCallback(async () => {
    const [documentResult, companyResult] = await Promise.all([
      supabase.from("documents").select("*").order("receive_date", { ascending: false }),
      supabase.from("companies").select("*").order("name", { ascending: true }),
    ]);
    setDocuments((documentResult.data ?? []) as unknown as DbDocument[]);
    setCompanies((companyResult.data ?? []) as unknown as Company[]);
    setUsers(loadLinkedDirectoryUsers("Internal users") as DirectoryUser[]);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allAnalytics = useMemo<WorkerAnalytics[]>(() => {
    const companyNames = new Map(companies.map((company) => [company.id, company.name]));
    const workerByIdentity = new Map<string, DirectoryUser>();
    users.forEach((user) => {
      [userName(user), user.email, user.username].filter(Boolean).forEach((identity) => workerByIdentity.set(normalized(identity), user));
    });

    const rows = new Map<string, WorkerAnalytics>();
    users.forEach((user, index) => {
      const name = userName(user);
      rows.set(normalized(name), { id: user.id || `worker-${index}`, name, email: user.email || "—", documents: [], needReview: 0, approved: 0, totalSeconds: 0 });
    });

    documents.forEach((document) => {
      const recordedWork = workLog[document.id];
      const identity = normalized(recordedWork?.email || recordedWork?.user || document.accountable_responsible || document.created_by) || "unassigned";
      const matchedUser = workerByIdentity.get(identity);
      const name = matchedUser ? userName(matchedUser) : (recordedWork?.user || document.accountable_responsible || document.created_by || "Unassigned");
      const key = normalized(name);
      const row = rows.get(key) ?? { id: matchedUser?.id || `worker-${key}`, name, email: matchedUser?.email || recordedWork?.email || "—", documents: [], needReview: 0, approved: 0, totalSeconds: 0 };
      const seconds = recordedWork?.seconds ?? 0;
      row.documents.push({ document, organization: companyNames.get(document.company_id ?? "") || "—", seconds });
      if (REVIEW_STATUSES.has(normalized(document.status))) row.needReview += 1;
      if (["accepted", "approved", "completed", "processed", "transferred"].includes(normalized(document.status))) row.approved += 1;
      row.totalSeconds += seconds;
      rows.set(key, row);
    });

    return [...rows.values()]
      .sort((a, b) => b.needReview - a.needReview || b.documents.length - a.documents.length || a.name.localeCompare(b.name));
  }, [companies, documents, users, workLog]);

  const filterColumns = useMemo<SystemFilterColumn[]>(() => ANALYTICS_FILTER_COLUMNS.map((column) => ({
    ...column,
    options: Array.from(new Set(allAnalytics.map((row) => analyticsFilterValue(row, column.key)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  })), [allAnalytics]);

  const analytics = useMemo(() => {
    const normalizedQuery = normalized(query);
    return allAnalytics.filter((row) => {
      if (normalizedQuery && !`${row.name} ${row.email}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      return activeFilterKeys.every((key) => {
        const selectedValues = filterValues[key] ?? [];
        return selectedValues.length === 0 || selectedValues.includes(analyticsFilterValue(row, key as AnalyticsFilterKey));
      });
    });
  }, [activeFilterKeys, allAnalytics, filterValues, query]);

  const analyticsSorter = useMultiColumnSort<WorkerAnalytics, AnalyticsFilterKey>(
    analytics,
    (row, key) => {
      if (key === "employee") return row.name;
      if (key === "email") return row.email;
      if (key === "documents") return row.documents.length;
      if (key === "needReview") return row.needReview;
      if (key === "approved") return row.approved;
      return row.totalSeconds;
    },
  );
  const sortedAnalytics = analyticsSorter.sortedRows;
  const visibleAnalyticsColumns = analyticsColumns.filter((column) => column.visible);
  const analyticsGridTemplate = `42px ${visibleAnalyticsColumns.map((column) => `${column.width}px`).join(" ")}`;
  const analyticsTableWidth = 42 + visibleAnalyticsColumns.reduce((sum, column) => sum + column.width, 0);

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(sortedAnalytics.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayedWorkers = sortedAnalytics.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleWorker = (id: string) => setExpandedWorkers((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const exportAnalytics = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows: Array<Array<string | number>> = [
      ["Employee", "Email", "Documents", "Need review", "Approved", "Work time"],
      ...sortedAnalytics.map((worker) => [
        worker.name,
        worker.email,
        worker.documents.length,
        worker.needReview,
        worker.approved,
        formatDuration(worker.totalSeconds),
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ocr-review-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Review analytics" />
      <OcrBreadcrumb items={["Review", "Analytics"]} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<UserRound size={18} />} label="Employees" value={analytics.length} />
        <SummaryCard icon={<FileText size={18} />} label="Assigned documents" value={analytics.reduce((sum, row) => sum + row.documents.length, 0)} />
        <SummaryCard icon={<CheckCircle2 size={18} />} label="Need review" value={analytics.reduce((sum, row) => sum + row.needReview, 0)} accent />
        <SummaryCard icon={<Clock3 size={18} />} label="Recorded work time" value={formatDuration(analytics.reduce((sum, row) => sum + row.totalSeconds, 0))} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <OcrSearchField ariaLabel="Search review analytics" value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
        <SystemAddFilters
          columns={filterColumns}
          activeKeys={activeFilterKeys}
          values={filterValues}
          onActiveKeysChange={(keys) => { setActiveFilterKeys(keys); setPage(1); }}
          onValuesChange={(values) => { setFilterValues(values); setPage(1); }}
          persistenceKey="finansu-harmonija:v12:ocr:review-analytics:filters"
        />
        <div className="ml-auto flex h-7 items-center gap-4">
          <button
            type="button"
            data-button-family="export"
            title="EXPORTDATA"
            aria-label="EXPORTDATA review analytics"
            onClick={exportAnalytics}
            disabled={sortedAnalytics.length === 0}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Download size={16} />
          </button>
          <RefreshAllButton onRefresh={() => void loadData()} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: analyticsTableWidth }}>
          <div
            style={{ gridTemplateColumns: analyticsGridTemplate }}
            className="system-table-header-row mb-3 grid min-h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]"
          >
            <span />
            {visibleAnalyticsColumns.map((column) => {
              const columnKey = column.key as AnalyticsFilterKey;
              const columnIndex = analyticsColumns.findIndex((item) => item.key === column.key);
              return (
                <div key={column.key} className="relative flex min-w-0 h-6 items-center gap-1 border-l border-[#D3E1EC] px-3">
                  <span className="min-w-0 whitespace-normal leading-[15px]">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={analyticsSorter.directionFor(columnKey)}
                    onDirectionChange={(direction) => {
                      analyticsSorter.changeSort(columnKey, direction);
                      setPage(1);
                    }}
                  />
                  <ResizeHandle onMouseDown={(event) => startResize(columnIndex, event)} />
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-0.5">
            {displayedWorkers.map((worker, index) => {
              const expanded = expandedWorkers.has(worker.id);
              return (
                <div key={worker.id} className="overflow-hidden rounded-lg">
                  <div style={{ gridTemplateColumns: analyticsGridTemplate }} className={`grid min-h-10 items-center font-montserrat text-[12px] text-[#10233A] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
                    <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${worker.name}`} onClick={() => toggleWorker(worker.id)} className="flex h-10 items-center justify-center text-[#7288A3] hover:text-[#007EA7]">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                    {visibleAnalyticsColumns.map((column) => (
                      <span
                        key={column.key}
                        className={`min-w-0 truncate px-3 ${column.key === "employee" ? "font-medium" : ""} ${column.key === "email" ? "text-[#7288A3]" : ""} ${column.key === "needReview" ? "font-semibold text-[#FF6200]" : ""} ${column.key === "approved" ? "text-[#087A55]" : ""}`}
                      >
                        {column.key === "employee" ? worker.name
                          : column.key === "email" ? worker.email
                          : column.key === "documents" ? worker.documents.length
                          : column.key === "needReview" ? worker.needReview
                          : column.key === "approved" ? worker.approved
                          : formatDuration(worker.totalSeconds)}
                      </span>
                    ))}
                  </div>
                  {expanded && (
                    <div className="border-x border-b border-[#E5EDF9] bg-white px-5 py-4">
                      <div className="grid grid-cols-[170px_260px_150px_160px_140px] gap-0 border-b border-[#E5EDF9] pb-2 font-montserrat text-[11px] font-semibold text-[#7288A3]">
                        <span>Organization</span><span>Document</span><span>Status</span><span>Last activity</span><span>Time spent</span>
                      </div>
                      {worker.documents.length ? worker.documents.map(({ document, organization, seconds }) => (
                        <div key={document.id} className="grid min-h-9 grid-cols-[170px_260px_150px_160px_140px] items-center gap-0 border-b border-[#F2F7FC] font-montserrat text-[12px] text-[#10233A] last:border-0">
                          <span className="truncate pr-3">{organization}</span>
                          <span className="truncate pr-3">{document.file_case || document.number || document.id}</span>
                          <span className="truncate pr-3">{document.status || "—"}</span>
                          <span className="truncate pr-3 text-[#7288A3]">{workLog[document.id]?.updatedAt ? new Date(workLog[document.id].updatedAt).toLocaleString("en-GB") : "—"}</span>
                          <span>{formatDuration(seconds)}</span>
                        </div>
                      )) : <div className="py-5 text-center font-montserrat text-[12px] text-[#7288A3]">No documents assigned</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={safePage} totalPages={totalPages} itemCount={analytics.length} itemsPerPage={pageSize} onPageChange={setPage} />
    </div>
  );
}

function SummaryCard({ icon, label, value, accent = false }: { icon: ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#D3E1EC] bg-white p-4 shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
      <div className="flex items-center justify-between text-[#7288A3]"><span className="font-montserrat text-[12px] font-semibold">{label}</span>{icon}</div>
      <div className={`mt-3 font-montserrat text-[24px] font-semibold ${accent ? "text-[#FF6200]" : "text-[#10233A]"}`}>{value}</div>
    </div>
  );
}

export default function OcrReviewView({ section }: { section: OcrReviewSection }) {
  return section === "analytics" ? <ReviewAnalyticsView /> : <ApproveDocumentsView />;
}
