import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileText,
  Trash2,
  X,
} from "lucide-react";
import type { Company } from "../lib/supabase";
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
import { HeaderBackButton } from "./SystemNavigation";
import TrialBalanceReportView from "./TrialBalanceReportView";
import { loadCompanyLogo } from "../lib/companyBranding";
import SearchableSelect from "./SearchableSelect";

type ReportStatus = "Active" | "Pending" | "Processed" | "Inactive";

type CompanyReport = {
  id: string;
  name: string;
  company: string;
  period: string;
  status: ReportStatus;
  createdAt: string;
  nextRun: string;
  reportType: string;
  frequency: string;
  format: string;
  recipients: string;
  description: string;
};

type ReportColumnKey =
  | "id"
  | "name"
  | "company"
  | "period"
  | "status"
  | "createdAt"
  | "nextRun";

const REPORT_COLUMNS: ColConfig[] = [
  { key: "id", label: "Report ID", width: 120, visible: true },
  { key: "name", label: "Report", width: 210, visible: true },
  { key: "company", label: "Company", width: 170, visible: true },
  { key: "period", label: "Period", width: 190, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
  { key: "createdAt", label: "Created date", width: 140, visible: true },
  { key: "nextRun", label: "Next run", width: 140, visible: true },
];

const STATUS_COLORS: Record<ReportStatus, string> = {
  Active: "#EEB648",
  Pending: "#EEB648",
  Processed: "#0ED8A8",
  Inactive: "#A1B6C6",
};

const REPORT_TYPES = [
  "Reconciliation",
  "General ledger",
  "VAT report",
  "Trial balance",
  "Debts",
  "Sales",
  "Purchases",
  "Cash flow",
];

const FREQUENCIES = ["Once", "Daily", "Weekly", "Monthly", "Quarterly"];
const FORMATS = ["PDF", "XLSX", "CSV"];

function initialReports(companyName: string): CompanyReport[] {
  return [
    {
      id: "RPT-001",
      name: "Monthly reconciliation",
      company: companyName,
      period: "10.11.2025 - 10.12.2025",
      status: "Processed",
      createdAt: "11.12.2025",
      nextRun: "11.01.2026",
      reportType: "Reconciliation",
      frequency: "Monthly",
      format: "PDF",
      recipients: "finance@company.lt",
      description: "Monthly reconciliation overview.",
    },
    {
      id: "RPT-002",
      name: "VAT reconciliation",
      company: companyName,
      period: "01.12.2025 - 31.12.2025",
      status: "Active",
      createdAt: "11.12.2025",
      nextRun: "02.01.2026",
      reportType: "VAT report",
      frequency: "Monthly",
      format: "XLSX",
      recipients: "accounting@company.lt",
      description: "VAT classification and reconciliation report.",
    },
    {
      id: "RPT-003",
      name: "Open debts",
      company: companyName,
      period: "01.01.2025 - 31.12.2025",
      status: "Pending",
      createdAt: "12.12.2025",
      nextRun: "19.12.2025",
      reportType: "Debts",
      frequency: "Weekly",
      format: "PDF",
      recipients: "finance@company.lt",
      description: "Outstanding and overdue debt report.",
    },
    {
      id: "RPT-004",
      name: "Trial Balance",
      company: companyName,
      period: "01.06.2026 - 30.06.2026",
      status: "Processed",
      createdAt: "17.06.2026",
      nextRun: "—",
      reportType: "Trial balance",
      frequency: "Monthly",
      format: "PDF",
      recipients: "accounting@company.lt",
      description: "Account balances and turnover for the selected accounting period.",
    },
  ];
}

type ScheduleDraft = {
  name: string;
  reportType: string;
  from: string;
  to: string;
  frequency: string;
  format: string;
  recipients: string;
  description: string;
  active: boolean;
};

const EMPTY_DRAFT: ScheduleDraft = {
  name: "",
  reportType: "Reconciliation",
  from: "",
  to: "",
  frequency: "Monthly",
  format: "PDF",
  recipients: "",
  description: "",
  active: true,
};

function downloadFile(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function CompanyReportsView({ company }: { company: Company }) {
  const companyLogo = company.logo_url || loadCompanyLogo(company.id);
  const storageKey = `finansu-harmonija:v12:company-reports:${company.id}`;
  const [reports, setReports] = usePersistentState<CompanyReport[]>(
    storageKey,
    () => initialReports(company.name),
  );
  const [query, setQuery] = useState("");
  const [filterKeys, setFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [columns, setColumns] = useState<ColConfig[]>(REPORT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [deleteReport, setDeleteReport] = useState<CompanyReport | null>(null);
  const [previewReport, setPreviewReport] = useState<CompanyReport | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  useEffect(() => {
    setReports((current) => {
      const existingIndex = current.findIndex(
        (report) => report.reportType.toLocaleLowerCase() === "trial balance",
      );
      const trialBalance: CompanyReport = {
        id: existingIndex >= 0 ? current[existingIndex].id : "RPT-004",
        name: "Trial Balance",
        company: company.name,
        period: "01.06.2026 - 30.06.2026",
        status: "Processed",
        createdAt: "17.06.2026",
        nextRun: "—",
        reportType: "Trial balance",
        frequency: "Monthly",
        format: "PDF",
        recipients: "accounting@company.lt",
        description: "Account balances and turnover for the selected accounting period.",
      };
      if (existingIndex < 0) return [...current, trialBalance];
      const existing = current[existingIndex];
      if (
        existing.name === trialBalance.name &&
        existing.period === trialBalance.period &&
        existing.status === trialBalance.status &&
        existing.createdAt === trialBalance.createdAt &&
        existing.format === trialBalance.format
      ) return current;
      return current.map((report, index) => index === existingIndex ? trialBalance : report);
    });
  }, [company.name, setReports]);

  const visibleColumns = columns.filter((column) => column.visible);
  const filteredReports = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return reports.filter((report) => {
      if (
        needle &&
        !Object.values(report).some((value) =>
          String(value).toLocaleLowerCase().includes(needle),
        )
      ) return false;
      return filterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        return selected.length === 0 || selected.includes(String(report[key as keyof CompanyReport]));
      });
    });
  }, [filterKeys, filterValues, query, reports]);
  const {
    sortedRows,
    changeSort,
    directionFor,
  } = useMultiColumnSort<CompanyReport, ReportColumnKey>(
    filteredReports,
    (report, key) => report[key],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = sortedRows.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );

  const filterColumns = REPORT_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(
      new Set(reports.map((report) => String(report[column.key as keyof CompanyReport]))),
    ).sort(),
  }));

  const saveSchedule = () => {
    if (!draft.name.trim() || !draft.from || !draft.to) return;
    const nextNumber = Math.max(
      0,
      ...reports.map((report) => Number(report.id.replace(/\D/g, "")) || 0),
    ) + 1;
    setReports((current) => [
      ...current,
      {
        id: `RPT-${String(nextNumber).padStart(3, "0")}`,
        name: draft.name.trim(),
        company: company.name,
        period: `${draft.from.split("-").reverse().join(".")} - ${draft.to.split("-").reverse().join(".")}`,
        status: draft.active ? "Active" : "Inactive",
        createdAt: new Date().toLocaleDateString("lt-LT"),
        nextRun: draft.active ? draft.to.split("-").reverse().join(".") : "—",
        reportType: draft.reportType,
        frequency: draft.frequency,
        format: draft.format,
        recipients: draft.recipients.trim(),
        description: draft.description.trim(),
      },
    ]);
    setDraft(EMPTY_DRAFT);
    setScheduleOpen(false);
  };

  const exportReports = () => {
    const headers = visibleColumns.map((column) => column.label);
    const rows = sortedRows.map((report) =>
      visibleColumns.map((column) => report[column.key as keyof CompanyReport]),
    );
    downloadFile(
      [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n"),
      `${company.name.replace(/\s+/g, "-").toLocaleLowerCase()}-reports.csv`,
      "text/csv;charset=utf-8",
    );
  };

  if (previewReport) {
    if (previewReport.reportType.toLocaleLowerCase() === "trial balance") {
      return (
        <TrialBalanceReportView
          companyName={company.name}
          companyLogo={companyLogo}
          onBack={() => setPreviewReport(null)}
        />
      );
    }
    return (
      <ReportPreview
        companyName={company.name}
        companyLogo={companyLogo}
        report={previewReport}
        onBack={() => setPreviewReport(null)}
      />
    );
  }

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Reports"
        actions={
          <>
            <PageActionButton onClick={exportReports}>Export</PageActionButton>
            <PageActionButton onClick={() => setScheduleOpen(true)}>
              Schedule report
            </PageActionButton>
          </>
        }
      />
      <CompanyBreadcrumb companyName={company.name} items={["Reports"]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <OcrSearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setCurrentPage(1);
            }}
            ariaLabel="Search reports"
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v12:filters:company-reports:${company.id}`}
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
            onClick={exportReports}
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"
          >
            <Download size={16} />
          </button>
          <RefreshAllButton onRefresh={() => setReports((current) => [...current])} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-[260px] flex-1 overflow-x-auto scrollbar-hide">
        <div
          className="min-w-max"
          style={{
            width: visibleColumns.reduce((sum, column) => sum + column.width, 0) + 88,
          }}
        >
          <div className="mb-3 flex h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
            {visibleColumns.map((column, index) => (
              <div
                key={column.key}
                style={{ width: column.width }}
                className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 ${index > 0 ? "border-l border-[#D3E1EC]" : ""}`}
              >
                <span className="min-w-0 whitespace-normal leading-4">{column.label}</span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key as ReportColumnKey)}
                  onDirectionChange={(direction) =>
                    changeSort(column.key as ReportColumnKey, direction)
                  }
                />
                <ResizeHandle
                  onMouseDown={(event) =>
                    startResize(columns.findIndex((item) => item.key === column.key), event)
                  }
                />
              </div>
            ))}
            <div className="w-[88px] flex-shrink-0" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-0.5">
            {pageRows.map((report, index) => (
              <div
                key={report.id}
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
                          style={{ background: STATUS_COLORS[report.status] }}
                        />
                        {report.status}
                      </span>
                    ) : (
                      <span className="block truncate">
                        {String(report[column.key as keyof CompanyReport])}
                      </span>
                    )}
                  </div>
                ))}
                <div className="flex w-[88px] flex-shrink-0 items-center justify-center gap-2">
                  <button
                    type="button"
                    title="VIEW"
                    aria-label={`VIEW ${report.name}`}
                    onClick={() => setPreviewReport(report)}
                    className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                  >
                    <Eye size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    title="DELETE"
                    aria-label={`DELETE ${report.name}`}
                    onClick={() => setDeleteReport(report)}
                    className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#D64545] hover:text-[#D64545]"
                  >
                    <Trash2 size={15} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ))}
            {pageRows.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileText size={30} />
                <span className="font-montserrat text-[13px] font-semibold">No reports found</span>
                {reports.length === 0 && (
                  <PageActionButton onClick={() => setScheduleOpen(true)}>
                    Schedule report
                  </PageActionButton>
                )}
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
          setItemsPerPage((current) => (current === 4 ? Math.max(4, sortedRows.length) : 4));
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
            defaultColumns={REPORT_COLUMNS}
            onSave={setColumns}
            onClose={() => setShowColumns(false)}
          />
        </>
      )}
      {scheduleOpen && (
        <ScheduleReportPanel
          draft={draft}
          onChange={setDraft}
          onClose={() => setScheduleOpen(false)}
          onSave={saveSchedule}
        />
      )}
      {deleteReport && (
        <DeleteReportPanel
          report={deleteReport}
          onClose={() => setDeleteReport(null)}
          onConfirm={() => {
            setReports((current) =>
              current.filter((item) => item.id !== deleteReport.id),
            );
            setDeleteReport(null);
          }}
        />
      )}
    </main>
  );
}

function ScheduleReportPanel({
  draft,
  onChange,
  onClose,
  onSave,
}: {
  draft: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const valid = Boolean(draft.name.trim() && draft.from && draft.to);
  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-[#10233A]/20" onMouseDown={onClose}>
      <aside
        className="flex h-full w-[380px] max-w-full flex-col overflow-y-auto bg-white px-6 py-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Schedule report</h2>
          <button type="button" aria-label="Close schedule report" onClick={onClose} className="text-[#7288A3] hover:text-[#10233A]">
            <X size={24} />
          </button>
        </div>
        <div className="mt-6 flex flex-1 flex-col gap-5">
          <DrawerField label="Report name *">
            <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Enter report name" className="system-report-input" />
          </DrawerField>
          <DrawerField label="Report type *">
            <SearchableSelect ariaLabel="Report type" value={draft.reportType} onChange={(reportType) => onChange({ ...draft, reportType })} options={REPORT_TYPES} className="system-report-input pr-9" />
          </DrawerField>
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="From *">
              <input type="date" value={draft.from} onChange={(event) => onChange({ ...draft, from: event.target.value })} className="system-report-input" />
            </DrawerField>
            <DrawerField label="To *">
              <input type="date" min={draft.from} value={draft.to} onChange={(event) => onChange({ ...draft, to: event.target.value })} className="system-report-input" />
            </DrawerField>
          </div>
          <DrawerField label="Frequency">
            <SearchableSelect ariaLabel="Frequency" value={draft.frequency} onChange={(frequency) => onChange({ ...draft, frequency })} options={FREQUENCIES} className="system-report-input pr-9" />
          </DrawerField>
          <DrawerField label="File format">
            <SearchableSelect ariaLabel="File format" value={draft.format} onChange={(format) => onChange({ ...draft, format })} options={FORMATS} className="system-report-input pr-9" />
          </DrawerField>
          <DrawerField label="Recipients">
            <input value={draft.recipients} onChange={(event) => onChange({ ...draft, recipients: event.target.value })} placeholder="name@company.lt" className="system-report-input" />
          </DrawerField>
          <DrawerField label="Description">
            <textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Add report description" rows={4} className="system-report-input h-auto resize-none py-3" />
          </DrawerField>
          <button type="button" onClick={() => onChange({ ...draft, active: !draft.active })} className="flex items-center gap-3 text-left">
            <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${draft.active ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>
              {draft.active && <Check size={12} className="text-white" />}
            </span>
            <span className="font-montserrat text-[13px] font-medium text-[#10233A]">Active schedule</span>
          </button>
        </div>
        <div className="mt-8 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-[42px] rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3]">Cancel</button>
          <button type="button" disabled={!valid} onClick={onSave} className="h-[42px] rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">Schedule report</button>
        </div>
      </aside>
    </div>
  );
}

function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
      {label}
      {children}
    </label>
  );
}

function DeleteReportPanel({ report, onClose, onConfirm }: { report: CompanyReport; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-[#10233A]/20" onMouseDown={onClose}>
      <aside className="h-full w-[340px] bg-white px-6 py-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Delete report</h2>
          <button type="button" aria-label="Close delete report" onClick={onClose} className="text-[#7288A3]"><X size={24} /></button>
        </div>
        <p className="mt-6 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">Are you sure that you want to delete {report.name}?</p>
        <div className="mt-8 flex gap-2">
          <button type="button" onClick={onClose} className="h-[42px] flex-1 rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3]">Cancel</button>
          <button type="button" onClick={onConfirm} className="h-[42px] flex-1 rounded-lg bg-[#D64545] px-4 font-montserrat text-[16px] font-semibold text-white">Delete</button>
        </div>
      </aside>
    </div>
  );
}

const PREVIEW_COLUMNS = [
  "No.", "Transaction type", "Date / Time", "Transaction ID", "Status", "Created by",
  "Counterparty ID", "Counterparty", "Related ID", "Currency", "Original amount",
  "Account currency", "Account amount", "Fee", "Tax", "Total", "Purpose", "Direction",
  "Channel", "Department", "Object", "Project", "Cost center", "GL account",
  "VAT classifier", "Risk type", "Review status", "Reviewer", "Notes",
];

function ReportPreview({ companyName, companyLogo, report, onBack }: { companyName: string; companyLogo?: string; report: CompanyReport; onBack: () => void }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const previewRows = Array.from({ length: 6 }, (_, index) => [
    String(index + 1),
    "Web transaction",
    `02.06.2021 - ${String(11 + index).padStart(2, "0")}:14:42`,
    `1f32dec3-7dc6-4bed-84b0-d22d27d75bc${index}`,
    index % 3 === 0 ? "Processed" : index % 3 === 1 ? "In progress" : "Under investigation",
    index % 2 === 0 ? "Olaf Shmidt" : "Sindy Roper",
    `CP-${String(1001 + index)}`,
    index % 2 === 0 ? "UAB Alfa" : "UAB Beta",
    `DOC-${String(501 + index)}`,
    "EUR",
    (1000 + index * 125).toFixed(2),
    "EUR",
    (1000 + index * 125).toFixed(2),
    "10.00",
    "210.00",
    (1210 + index * 151.25).toFixed(2),
    index % 2 === 0 ? "Invoice payment" : "Refund",
    index % 2 === 0 ? "Incoming" : "Outgoing",
    "WEB",
    "DEP-01",
    "OBJ-01",
    "PRJ-01",
    "CC-100",
    index % 2 === 0 ? "2410" : "4430",
    "PVM1",
    "AML",
    index % 2 === 0 ? "Processed" : "Under investigation",
    index % 2 === 0 ? "Olaf Shmidt" : "Sindy Roper",
    index % 2 === 0 ? "—" : "Manual review required",
  ]);
  const exportPreview = () => downloadFile(
    [PREVIEW_COLUMNS, ...previewRows].map((row) => row.map(csvValue).join(",")).join("\n"),
    `${report.id.toLocaleLowerCase()}-preview.csv`,
    "text/csv;charset=utf-8",
  );

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Report preview"
        leading={<HeaderBackButton onClick={onBack} label="Back to reports" />}
        actions={<PageActionButton onClick={exportPreview}>Export</PageActionButton>}
      />
      <CompanyBreadcrumb companyName={companyName} items={["Reports", "Report preview"]} />
      {companyLogo && (
        <div className="flex h-20 items-center rounded-xl border border-[#D3E1EC] bg-white px-5">
          <img
            src={companyLogo}
            alt={`${companyName} company logo`}
            className="max-h-14 max-w-[180px] object-contain"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-[#D3E1EC] bg-[#F8FDFF] p-4 md:grid-cols-4">
        {[
          ["Report", report.name],
          ["Type", report.reportType],
          ["Period", report.period],
          ["Status", report.status],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="font-montserrat text-[11px] font-medium uppercase tracking-wide text-[#7288A3]">{label}</span>
            <span className="font-montserrat text-[13px] font-semibold text-[#10233A]">{value}</span>
          </div>
        ))}
      </div>
      <div ref={tableRef} className="min-h-[340px] flex-1 overflow-x-auto scrollbar-hide">
        <div className="min-w-max">
          <div className="mb-2 flex h-9 items-center font-montserrat text-[12px] font-semibold text-[#10233A]">
            {PREVIEW_COLUMNS.map((column, index) => (
              <div key={column} className={`w-[150px] flex-shrink-0 px-3 ${index > 0 ? "border-l border-[#D3E1EC]" : ""}`}>{column}</div>
            ))}
          </div>
          {previewRows.map((row, rowIndex) => (
            <div key={rowIndex} className={`flex h-10 items-center rounded-lg font-montserrat text-[12px] text-[#10233A] ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
              {row.map((value, cellIndex) => <div key={cellIndex} title={value} className="w-[150px] flex-shrink-0 truncate px-3">{value}</div>)}
            </div>
          ))}
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableRef} />
      <TablePagination currentPage={1} totalPages={1} itemCount={previewRows.length} itemsPerPage={previewRows.length} onPageChange={() => undefined} onShowMore={() => undefined} />
    </main>
  );
}
