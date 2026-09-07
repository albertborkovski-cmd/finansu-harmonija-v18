import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, Check, FileText, Pencil, Play, Search } from "lucide-react";
import type { Company, DbDocument } from "../lib/supabase";
import { loadOcrDocumentSource } from "../lib/ocrDocumentSource";
import { usePersistentState } from "../hooks/usePersistentState";
import { PageActionButton, PageHeader } from "./PageHeader";
import OcrBreadcrumb from "./OcrBreadcrumb";
import OcrSearchField from "./OcrSearchField";
import SystemAddFilters, { type SystemFilterColumn } from "./SystemAddFilters";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import RefreshAllButton from "./RefreshAllButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import {
  OCR_FIELD_VALIDATION_CHANGED_EVENT,
  loadOcrFieldValidationRules,
  type OcrFieldValidationLevel,
} from "../lib/ocrFieldValidation";

type ProcessedColumnKey =
  | "organization"
  | "status"
  | "receiveDate"
  | "clientCounterparty"
  | "counterpartyCode"
  | "documentType"
  | "invoice"
  | "source"
  | "totalAmount"
  | "dueEndDate"
  | "fileCase"
  | "orderNo"
  | "number"
  | "type"
  | "documentDate"
  | "documentPurpose"
  | "invoiceContractDate"
  | "operationDate"
  | "glAccount"
  | "vatClassifier"
  | "productGroup"
  | "series"
  | "costCenter"
  | "objectProject"
  | "departmentCode"
  | "currency";

type ProcessedRow = Record<ProcessedColumnKey, string> & {
  id: string;
  organizationId: string;
  organizationName: string;
};

export type ReviewDocumentReference = {
  id: string;
  name: string;
};

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "status", label: "Status", width: 150, visible: true },
  { key: "receiveDate", label: "Receive date", width: 150, visible: true },
  { key: "clientCounterparty", label: "Client/Counterparty", width: 210, visible: true },
  { key: "counterpartyCode", label: "Counterparty code", width: 175, visible: true },
  { key: "documentType", label: "Document type", width: 180, visible: true },
  { key: "source", label: "Source", width: 140, visible: true },
  { key: "totalAmount", label: "Total amount", width: 150, visible: true },
  { key: "dueEndDate", label: "Due/End date", width: 150, visible: true },
  { key: "fileCase", label: "File/Case", width: 210, visible: true },
  { key: "orderNo", label: "Order No.", width: 150, visible: true },
  { key: "number", label: "Number", width: 150, visible: true },
  { key: "type", label: "Type", width: 150, visible: true },
  { key: "documentDate", label: "Document date", width: 160, visible: true },
  { key: "documentPurpose", label: "Document purpose", width: 190, visible: true },
  { key: "invoiceContractDate", label: "Invoice/Contract date", width: 200, visible: true },
  { key: "operationDate", label: "Operation date", width: 170, visible: true },
  { key: "glAccount", label: "GL account", width: 150, visible: true },
  { key: "vatClassifier", label: "VAT classifier", width: 165, visible: true },
  { key: "productGroup", label: "Product Group", width: 170, visible: true },
  { key: "currency", label: "Currency", width: 130, visible: true },
];

const REVIEW_COLUMNS: ColConfig[] = [
  { key: "organization", label: "Organizations", width: 190, visible: true },
  ...DEFAULT_COLUMNS.flatMap((column) => column.key === "documentType"
    ? [column, { key: "invoice", label: "Invoice", width: 120, visible: true }]
    : [column]),
  { key: "series", label: "Series", width: 130, visible: true },
  { key: "costCenter", label: "Cost center", width: 150, visible: true },
  { key: "objectProject", label: "Object/Project", width: 170, visible: true },
  { key: "departmentCode", label: "Department code", width: 175, visible: true },
];

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

function rowProductGroup(document: DbDocument) {
  const values = [...(document.summary_line_items ?? []), ...(document.line_items ?? [])]
    .map((line) => line.productGroup?.trim())
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(values)).join(", ");
}

function OrganizationSidebar({
  organizations,
  selectedIds,
  onChange,
}: {
  organizations: Company[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [organizationQuery, setOrganizationQuery] = useState("");
  const allSelected =
    organizations.length > 0 && selectedIds.length === organizations.length;
  const visibleOrganizations = useMemo(() => {
    const normalizedQuery = organizationQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return organizations;
    return organizations.filter((organization) =>
      organization.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [organizationQuery, organizations]);

  const toggleOrganization = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <aside className="w-[248px] flex-shrink-0 self-start overflow-hidden rounded-xl border border-[#D3E1EC] bg-white shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
      <div className="border-b border-[#E5EDF9] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-montserrat text-[14px] font-semibold text-[#10233A]">
            Organizations
          </h2>
          <span className="flex h-6 min-w-10 items-center justify-center rounded-full bg-[#E7F4F9] px-2 font-montserrat text-[11px] font-semibold text-[#007EA7]">
            {selectedIds.length}/{organizations.length}
          </span>
        </div>
        <p className="mt-1 font-montserrat text-[11px] font-medium leading-[16px] text-[#7288A3]">
          Choose which organizations to display
        </p>
        <label className="mt-3 flex h-9 items-center gap-2 rounded-lg bg-[#F2F7FC] px-3 focus-within:ring-1 focus-within:ring-[#007EA7]">
          <Search size={15} className="flex-shrink-0 text-[#7288A3]" />
          <input
            type="search"
            value={organizationQuery}
            onChange={(event) => setOrganizationQuery(event.target.value)}
            placeholder="Search organizations"
            className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#7288A3]"
            aria-label="Search organizations"
          />
        </label>
      </div>
      <div className="p-2">
        <button
          type="button"
          onClick={() => onChange(
            allSelected ? [] : organizations.map((organization) => organization.id),
          )}
          className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${allSelected ? "bg-[#E7F4F9]" : "hover:bg-[#F2F7FC]"}`}
        >
          <SelectorCheck checked={allSelected} />
          <span className="min-w-0 flex-1 font-montserrat text-[12px] font-semibold text-[#10233A]">
            All organizations
          </span>
          <span className="font-montserrat text-[11px] font-medium text-[#7288A3]">
            {organizations.length}
          </span>
        </button>
        <div className="mx-2 my-2 h-px bg-[#E5EDF9]" />
        <div className="max-h-[calc(100vh-330px)] overflow-y-auto pr-0.5">
          <div className="flex flex-col gap-0.5">
            {visibleOrganizations.map((organization) => {
              const checked = selectedIds.includes(organization.id);
              const initials = organization.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part.charAt(0).toLocaleUpperCase())
                .join("");
              return (
                <button
                  type="button"
                  key={organization.id}
                  onClick={() => toggleOrganization(organization.id)}
                  className={`group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${checked && !allSelected ? "bg-[#F2F7FC]" : "hover:bg-[#F2F7FC]"}`}
                >
                  <SelectorCheck checked={checked} />
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#E5EDF9] font-montserrat text-[10px] font-semibold text-[#42627E] group-hover:bg-white">
                    {initials || "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-montserrat text-[12px] font-medium text-[#10233A]">
                    {organization.name}
                  </span>
                </button>
              );
            })}
            {visibleOrganizations.length === 0 && (
              <div className="px-3 py-6 text-center font-montserrat text-[11px] font-medium text-[#7288A3]">
                No organizations found
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SelectorCheck({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>
      {checked && <Check size={12} strokeWidth={2.5} className="text-white" />}
    </span>
  );
}

function statusColor(status: string) {
  const normalized = status.toLocaleLowerCase();
  if (["completed", "processed", "paid", "transferred", "approved"].includes(normalized)) return "#12B886";
  if (["duplicate", "rejected", "overdue"].includes(normalized)) return "#FF6200";
  if (["in progress", "pending", "processing"].includes(normalized)) return "#E6A700";
  return "#7288A3";
}

function SelectionCheckbox({
  checked,
  mixed = false,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className="h-[18px] w-[18px] cursor-pointer rounded border border-[#A1B6C6] accent-[#007EA7]"
    />
  );
}

export function ProcessedDocumentsTable({
  embedded = false,
  reviewOnly = false,
  showAllDocuments = false,
  selectable = false,
  onEditDocument,
  onRunDocument,
  onApproveDocument,
  onImportDocuments,
  importActionContainer,
  selectionActionVariant = "import",
}: {
  embedded?: boolean;
  reviewOnly?: boolean;
  showAllDocuments?: boolean;
  selectable?: boolean;
  onEditDocument?: (document: ReviewDocumentReference, index: number, documents: ReviewDocumentReference[]) => void;
  onRunDocument?: (document: ReviewDocumentReference) => void | Promise<void>;
  onApproveDocument?: (document: ReviewDocumentReference) => void;
  onImportDocuments?: (documents: ReviewDocumentReference[]) => void | Promise<void>;
  importActionContainer?: HTMLElement | null;
  selectionActionVariant?: "import" | "run";
}) {
  const defaultColumns = reviewOnly || showAllDocuments ? REVIEW_COLUMNS : DEFAULT_COLUMNS;
  const [organizations, setOrganizations] = useState<Company[]>([]);
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [query, setQuery] = useState("");
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    reviewOnly
      ? "finansu-harmonija:v12:ml:need-review-documents:columns"
      : "finansu-harmonija:v12:ocr:processed-documents:columns",
    defaultColumns,
  );
  const [selectedOrganizationIds, setSelectedOrganizationIds] = usePersistentState<string[]>(
    "finansu-harmonija:v12:ocr:processed-documents:organizations",
    [],
  );
  const [organizationSelectionInitialized, setOrganizationSelectionInitialized] = usePersistentState(
    "finansu-harmonija:v12:ocr:processed-documents:organizations-initialized",
    false,
  );
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [fieldValidationRules, setFieldValidationRules] = useState(() => loadOcrFieldValidationRules());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  const loadData = useCallback(async () => {
    const { organizations: nextOrganizations, documents: nextDocuments } = await loadOcrDocumentSource();
    setOrganizations(nextOrganizations);
    setDocuments(nextDocuments);
    setSelectedOrganizationIds((current) => {
      const validIds = new Set(nextOrganizations.map((organization) => organization.id));
      const validSelection = current.filter((id) => validIds.has(id));
      if (validSelection.length > 0 || organizationSelectionInitialized) {
        return validSelection;
      }
      return nextOrganizations.map((organization) => organization.id);
    });
    if (!organizationSelectionInitialized) setOrganizationSelectionInitialized(true);
  }, [organizationSelectionInitialized, setOrganizationSelectionInitialized, setSelectedOrganizationIds]);

  useEffect(() => {
    void loadData();
    const reload = () => void loadData();
    window.addEventListener("finansu-harmonija:data-changed", reload);
    window.addEventListener("finansu-harmonija:settings-data-changed", reload);
    return () => {
      window.removeEventListener("finansu-harmonija:data-changed", reload);
      window.removeEventListener("finansu-harmonija:settings-data-changed", reload);
    };
  }, [loadData]);

  useEffect(() => {
    const reloadRules = () => setFieldValidationRules(loadOcrFieldValidationRules());
    window.addEventListener(OCR_FIELD_VALIDATION_CHANGED_EVENT, reloadRules);
    return () => window.removeEventListener(OCR_FIELD_VALIDATION_CHANGED_EVENT, reloadRules);
  }, []);

  useEffect(() => {
    setColumns((current) => {
      const missing = defaultColumns.filter(
        (defaultColumn) => !current.some((column) => column.key === defaultColumn.key),
      );
      return missing.length ? [...current, ...missing] : current;
    });
  }, [defaultColumns, setColumns]);

  const organizationById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );

  const counterpartyCodes = useMemo(() => {
    try {
      const stored = window.localStorage.getItem("finansu-harmonija:v7:settings:counterparties");
      const counterparties = stored ? (JSON.parse(stored) as Company[]) : [];
      return new Map(counterparties.map((counterparty) => [counterparty.name.trim().toLocaleLowerCase(), counterparty.company_code ?? ""]));
    } catch {
      return new Map<string, string>();
    }
  }, []);

  const rows = useMemo<ProcessedRow[]>(() => documents
    .filter((document) => selectedOrganizationIds.includes(document.company_id ?? ""))
    .filter((document) => !reviewOnly || REVIEW_STATUSES.has((document.status || "").trim().toLocaleLowerCase()))
    .map((document) => ({
      id: document.id,
      organizationId: document.company_id ?? "",
      organizationName: organizationById.get(document.company_id ?? "")?.name ?? "—",
      organization: organizationById.get(document.company_id ?? "")?.name ?? "—",
      status: reviewOnly ? "Need review" : document.status || "—",
      receiveDate: document.receive_date || "—",
      clientCounterparty: document.client_counterparty || "—",
      counterpartyCode: counterpartyCodes.get((document.client_counterparty ?? "").trim().toLocaleLowerCase()) || document.counterparty_id || "—",
      documentType: document.document_type || "—",
      invoice: /invoice/i.test(document.document_type || "") ? "Yes" : "No",
      source: document.source || "—",
      totalAmount: document.total_amount || "—",
      dueEndDate: document.due_end_date || "—",
      fileCase: document.file_case || "—",
      orderNo: document.order_no || "—",
      number: document.number || "—",
      type: document.type || "—",
      documentDate: document.document_date || "—",
      documentPurpose: document.document_purpose || "—",
      invoiceContractDate: document.invoice_contract_date || "—",
      operationDate: document.operation_date || "—",
      glAccount: document.expense_account || "—",
      vatClassifier: document.vat_classifier || "—",
      productGroup: rowProductGroup(document) || "—",
      series: document.series || "—",
      costCenter: document.cost_center || "—",
      objectProject: document.object_project || "—",
      departmentCode: document.department_code || "—",
      currency: document.currency || "—",
    })), [counterpartyCodes, documents, organizationById, reviewOnly, selectedOrganizationIds]);

  const filterColumns = useMemo<SystemFilterColumn[]>(() => defaultColumns.map((column) => ({
    key: column.key,
    label: column.label,
    options: Array.from(new Set(rows.map((row) => row[column.key as ProcessedColumnKey]).filter((value) => value && value !== "—"))).sort(),
  })), [defaultColumns, rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (normalizedQuery && !Object.values(row).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))) return false;
      return activeFilterKeys.every((key) => {
        const selectedValues = filterValues[key] ?? [];
        return selectedValues.length === 0 || selectedValues.includes(row[key as ProcessedColumnKey]);
      });
    });
  }, [activeFilterKeys, filterValues, query, rows]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<ProcessedRow, ProcessedColumnKey>(
    filteredRows,
    (row, key) => row[key],
  );
  const pageSize = showAll ? Math.max(1, sortedRows.length) : 4;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayedRows = showAll
    ? sortedRows
    : sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleColumns = columns.filter((column) => column.visible);
  const validationLevelByField = useMemo(
    () => new Map(fieldValidationRules.map((rule) => [rule.key, rule.level])),
    [fieldValidationRules],
  );
  const reviewDocumentQueue = useMemo<ReviewDocumentReference[]>(() => sortedRows.map((row) => ({
    id: row.id,
    name: row.fileCase === "—" ? `Document ${row.id}` : row.fileCase,
  })), [sortedRows]);

  const allRowsSelected = selectable && sortedRows.length > 0 && sortedRows.every((row) => selectedRowIds.has(row.id));
  const someRowsSelected = selectable && !allRowsSelected && sortedRows.some((row) => selectedRowIds.has(row.id));

  const toggleAllRows = () => {
    setSelectedRowIds(allRowsSelected ? new Set() : new Set(sortedRows.map((row) => row.id)));
  };

  const toggleRow = (rowId: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const importSelectedDocuments = async () => {
    if (!onImportDocuments || selectedRowIds.size === 0 || importing) return;
    const selectedDocuments = reviewDocumentQueue.filter((document) => selectedRowIds.has(document.id));
    if (selectedDocuments.length === 0) return;
    setImporting(true);
    try {
      await onImportDocuments(selectedDocuments);
      setSelectedRowIds(new Set());
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => setPage(1), [activeFilterKeys, filterValues, query, selectedOrganizationIds, showAll]);

  const importAction = selectable && onImportDocuments ? (
    <PageActionButton
      ariaLabel={`${selectionActionVariant === "run" ? "Run" : "Import"} selected documents`}
      icon={selectionActionVariant === "run"
        ? <Play size={15} className={importing ? "animate-pulse" : undefined} />
        : <ArrowDownToLine size={15} className={importing ? "animate-pulse" : undefined} />}
      disabled={selectedRowIds.size === 0 || importing}
      onClick={() => void importSelectedDocuments()}
    >
      {importing
        ? selectionActionVariant === "run" ? "Running…" : "Importing…"
        : selectionActionVariant === "run" ? "Run" : "Import"}
    </PageActionButton>
  ) : null;

  return (
    <>
      {importActionContainer && importAction ? createPortal(importAction, importActionContainer) : null}
    <div className={`flex min-h-full min-w-0 flex-col bg-white ${embedded ? "gap-6" : "gap-8 px-4 py-14 sm:px-8 lg:px-[72px]"}`}>
      {!embedded && <PageHeader title="Processed documents" />}
      {!embedded && <OcrBreadcrumb items={["All documents", "Processed documents"]} />}

      <div className="flex min-h-0 flex-1 items-stretch gap-6">
        {!embedded && (
          <OrganizationSidebar
            organizations={organizations}
            selectedIds={selectedOrganizationIds}
            onChange={setSelectedOrganizationIds}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <div className="system-table-toolbar flex h-7 min-h-7 flex-nowrap items-center gap-1">
            <OcrSearchField ariaLabel={reviewOnly ? "Search documents requiring review" : "Search processed documents"} value={query} onChange={setQuery} />
            <SystemAddFilters
              columns={filterColumns}
              activeKeys={activeFilterKeys}
              values={filterValues}
              onActiveKeysChange={setActiveFilterKeys}
              onValuesChange={setFilterValues}
              persistenceKey={reviewOnly ? "finansu-harmonija:v12:ml:need-review-documents:filters" : "finansu-harmonija:v12:ocr:processed-documents:filters"}
            />
            <div className="ml-auto flex h-7 items-center gap-4">
              {!importActionContainer && importAction}
              <ColumnSettingsButton onClick={() => setShowColumns(true)} />
              <RefreshAllButton onRefresh={() => void loadData()} />
            </div>
          </div>

          <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, (selectable ? 42 : 0) + (onEditDocument || onRunDocument || onApproveDocument ? 88 : 0)) }}>
          <div className="mb-3 flex h-9 items-center">
            {selectable && (
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 items-center justify-center">
                <SelectionCheckbox checked={allRowsSelected} mixed={someRowsSelected} label="Select all documents" onChange={toggleAllRows} />
              </div>
            )}
            {visibleColumns.map((column, visibleIndex) => {
              const columnIndex = columns.findIndex((item) => item.key === column.key);
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="truncate">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={directionFor(column.key as ProcessedColumnKey)}
                    onDirectionChange={(direction) => changeSort(column.key as ProcessedColumnKey, direction)}
                  />
                  <ResizeHandle onMouseDown={(event) => startResize(columnIndex, event)} />
                </div>
              );
            })}
            {(onEditDocument || onRunDocument || onApproveDocument) && <div className="w-[88px] flex-shrink-0" aria-hidden="true" />}
          </div>

              <div className="flex flex-col gap-0.5">
            {displayedRows.map((row, index) => (
              <div key={row.id} className={`flex h-10 items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
                {selectable && (
                  <div className="flex w-[42px] flex-shrink-0 items-center justify-center">
                    <SelectionCheckbox checked={selectedRowIds.has(row.id)} label={`Select ${row.fileCase === "—" ? row.id : row.fileCase}`} onChange={() => toggleRow(row.id)} />
                  </div>
                )}
                {visibleColumns.map((column) => {
                  const key = column.key as ProcessedColumnKey;
                  const failedInvoiceValidation = key === "invoice" && row[key] === "No";
                  const needsAttention = row[key] === "—" || failedInvoiceValidation;
                  const validationLevel = (validationLevelByField.get(key) ?? "red") as OcrFieldValidationLevel;
                  const validationColors = validationLevel === "red"
                    ? { background: "bg-[#FFF0F0]", text: "text-[#D92D20]" }
                    : validationLevel === "yellow"
                      ? { background: "bg-[#FFF8E5]", text: "text-[#9A6700]" }
                      : { background: "bg-[#EAF8F2]", text: "text-[#087A55]" };
                  return (
                    <div
                      key={key}
                      style={{ width: column.width }}
                      className={`flex h-10 flex-shrink-0 items-center overflow-hidden px-3 ${needsAttention ? `rounded-md ${validationColors.background}` : ""}`}
                      title={failedInvoiceValidation ? "Document is not an invoice" : needsAttention ? `${column.label} was not digitized (${validationLevel})` : undefined}
                    >
                      {key === "status" ? (
                        <span className="flex items-center gap-2 font-montserrat text-[12px] text-[#10233A]">
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor(row.status) }} />
                          <span className="truncate">{row.status}</span>
                        </span>
                      ) : (
                        <span className={`block truncate font-montserrat text-[12px] font-normal ${needsAttention ? `font-medium ${validationColors.text}` : "text-[#10233A]"}`} title={row[key]}>{row[key]}</span>
                      )}
                    </div>
                  );
                })}
                {(onEditDocument || onRunDocument || onApproveDocument) && (
                  <div className="sticky right-0 z-10 flex h-10 w-[88px] flex-shrink-0 items-center justify-center gap-2 border-l border-[#E5EDF9] bg-inherit">
                    {onEditDocument && <button
                        type="button"
                        title="EDIT"
                        aria-label={`EDIT ${row.fileCase}`}
                        onClick={() => {
                          const queueIndex = reviewDocumentQueue.findIndex((document) => document.id === row.id);
                          const selectedDocument = reviewDocumentQueue[queueIndex];
                          if (selectedDocument) onEditDocument(selectedDocument, queueIndex, reviewDocumentQueue);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                      >
                        <Pencil size={15} strokeWidth={1.8} />
                      </button>}
                    {onRunDocument && <button
                        type="button"
                        title="RUN"
                        aria-label={`RUN ${row.fileCase}`}
                        onClick={() => {
                          const selectedDocument = reviewDocumentQueue.find((document) => document.id === row.id);
                          if (selectedDocument) void onRunDocument(selectedDocument);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                      >
                        <Play size={15} strokeWidth={1.8} />
                      </button>}
                    {onApproveDocument && <button
                        type="button"
                        title="APPROVE"
                        aria-label={`APPROVE ${row.fileCase}`}
                        onClick={() => {
                          const selectedDocument = reviewDocumentQueue.find((document) => document.id === row.id);
                          if (selectedDocument) onApproveDocument(selectedDocument);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#12B886] hover:text-[#12B886]"
                      >
                        <Check size={15} strokeWidth={2} />
                      </button>}
                  </div>
                )}
              </div>
            ))}
            {displayedRows.length === 0 && (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]">
                <FileText size={30} />
                <span className="text-[14px] font-semibold">{reviewOnly ? "No documents requiring review found" : "No processed documents found"}</span>
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
            itemsPerPage={pageSize}
            onPageChange={setPage}
            onShowMore={() => setShowAll((current) => !current)}
            showMoreLabel={showAll ? "Default" : "Show more"}
            allItemsVisible={showAll}
          />
        </div>
      </div>

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={defaultColumns}
          onSave={(next) => {
            setColumns(next);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
      </div>
    </>
  );
}

export default function OcrProcessedDocumentsView() {
  return <ProcessedDocumentsTable />;
}
