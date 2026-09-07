import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Pencil,
  Plus,
  ScanText,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "./PageHeader";
import OcrBreadcrumb from "./OcrBreadcrumb";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import {
  ColumnSettingsButton,
  ImportDataButton,
} from "./ScopedActionButtons";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import RefreshAllButton from "./RefreshAllButton";
import OcrSearchField from "./OcrSearchField";
import { importMenuRecords } from "../lib/menuImport";

type DocumentStatus =
  | "New"
  | "In progress"
  | "Processed"
  | "Completed"
  | "Duplicate"
  | "Transferred";
type DocumentSource = "SharePoint" | "Email" | "WEB" | "Manual";

interface DocumentRecord {
  id: string;
  fileName: string;
  documentType: string;
  documentSubtype: string;
  status: DocumentStatus;
  uploadedAt: string;
  source: DocumentSource;
  clientCounterparty: string;
  currency: string;
  amount: number;
  duplicateOfId?: string;
  ocrErrorMessage?: string;
  deleted?: boolean;
  deletedAt?: string;
  accepted?: boolean;
  acceptedAt?: string;
  organizationName?: string;
  _companyStorageKey?: string;
  _sourceId?: string;
}

type ColumnKey =
  | "organizationName"
  | "fileName"
  | "documentType"
  | "documentSubtype"
  | "status"
  | "uploadedAt"
  | "source"
  | "duplicateRelation";

const FILTER_LABELS: Record<ColumnKey, string> = {
  organizationName: "Organization",
  fileName: "Document PDF",
  documentType: "Document type",
  documentSubtype: "Document subtype",
  status: "Status",
  uploadedAt: "Update",
  source: "Source",
  duplicateRelation: "Duplicate / Original",
};

const DOCUMENTS: DocumentRecord[] = [
  {
    id: "doc-001",
    fileName: "invoice-2026-001.pdf",
    documentType: "Invoices",
    documentSubtype: "VAT invoice",
    status: "Processed",
    uploadedAt: "10.08.2026 09:32",
    source: "SharePoint",
    clientCounterparty: "UAB Robolabs",
    currency: "EUR",
    amount: 2197.36,
  },
  {
    id: "doc-002",
    fileName: "purchase-invoice-1008.pdf",
    documentType: "Invoices",
    documentSubtype: "Purchase invoice",
    status: "In progress",
    uploadedAt: "10.08.2026 10:18",
    source: "Email",
    clientCounterparty: "MB Technologijos",
    currency: "EUR",
    amount: 5499.45,
  },
  {
    id: "doc-003",
    fileName: "contract-2026-08.pdf",
    documentType: "Contracts",
    documentSubtype: "Service agreement",
    status: "Duplicate",
    uploadedAt: "10.08.2026 11:05",
    source: "WEB",
    clientCounterparty: "UAB Sprendimų grupė",
    currency: "USD",
    amount: 3200,
    duplicateOfId: "doc-001",
  },
  {
    id: "doc-004",
    fileName: "receipt-0341.pdf",
    documentType: "Reconciliation",
    documentSubtype: "Cash receipt",
    status: "New",
    uploadedAt: "10.08.2026 11:41",
    source: "Manual",
    clientCounterparty: "UAB IT Sprendimai",
    currency: "EUR",
    amount: 180.25,
  },
];

const ALICE_DRAFT_TEST_DOCUMENTS: DocumentRecord[] = [
  {
    id: "alice-draft-005",
    fileName: "sales-invoice-2026-0811.pdf",
    documentType: "Invoices",
    documentSubtype: "Sales invoice",
    status: "Processed",
    uploadedAt: "11.08.2026 08:14",
    source: "Email",
    clientCounterparty: "UAB Baltic Trade",
    currency: "EUR",
    amount: 1248.5,
  },
  {
    id: "alice-draft-006",
    fileName: "credit-note-CN-184.pdf",
    documentType: "Invoices",
    documentSubtype: "Credit note",
    status: "Completed",
    uploadedAt: "11.08.2026 09:06",
    source: "SharePoint",
    clientCounterparty: "MB Verslo sprendimai",
    currency: "EUR",
    amount: 315.75,
  },
  {
    id: "alice-draft-007",
    fileName: "office-rent-agreement.pdf",
    documentType: "Contracts",
    documentSubtype: "Lease agreement",
    status: "Transferred",
    uploadedAt: "11.08.2026 10:22",
    source: "WEB",
    clientCounterparty: "UAB Miesto turtas",
    currency: "EUR",
    amount: 1850,
  },
  {
    id: "alice-draft-008",
    fileName: "sales-invoice-2026-0811-copy.pdf",
    documentType: "Invoices",
    documentSubtype: "Sales invoice",
    status: "Duplicate",
    uploadedAt: "11.08.2026 10:41",
    source: "Email",
    clientCounterparty: "UAB Baltic Trade",
    currency: "EUR",
    amount: 1248.5,
    duplicateOfId: "alice-draft-005",
  },
  {
    id: "alice-draft-009",
    fileName: "cash-expense-order-047.pdf",
    documentType: "Reconciliation",
    documentSubtype: "Cash expense order",
    status: "Processed",
    uploadedAt: "11.08.2026 11:18",
    source: "Manual",
    clientCounterparty: "UAB Transporto linija",
    currency: "EUR",
    amount: 426.2,
  },
  {
    id: "alice-draft-010",
    fileName: "employment-contract-annex.pdf",
    documentType: "Employee documents",
    documentSubtype: "Employment contract amendment",
    status: "Completed",
    uploadedAt: "11.08.2026 12:03",
    source: "SharePoint",
    clientCounterparty: "Jonas Jonaitis",
    currency: "EUR",
    amount: 0,
  },
  {
    id: "alice-draft-011",
    fileName: "service-report-july-2026.pdf",
    documentType: "Other",
    documentSubtype: "Completed work report",
    status: "Transferred",
    uploadedAt: "11.08.2026 13:27",
    source: "WEB",
    clientCounterparty: "UAB Projektų centras",
    currency: "EUR",
    amount: 3780,
  },
  {
    id: "alice-draft-012",
    fileName: "accounting-note-2026-08.pdf",
    documentType: "Accounting note",
    documentSubtype: "Accounting note",
    status: "Processed",
    uploadedAt: "11.08.2026 14:09",
    source: "Manual",
    clientCounterparty: "UAB Alice Stone",
    currency: "EUR",
    amount: 690.4,
  },
];

const COMPANY_DOCUMENTS_STORAGE_PREFIX =
  "finansu-harmonija:v12:all-documents-records:company:";

function scopeCompanyDocuments(
  storageKey: string,
  companyName: string,
  records: DocumentRecord[],
) {
  const idPrefix = `${storageKey}::`;
  return records.map((record) => ({
    ...record,
    id: `${idPrefix}${record.id}`,
    duplicateOfId: record.duplicateOfId
      ? `${idPrefix}${record.duplicateOfId}`
      : undefined,
    organizationName: companyName,
    _companyStorageKey: storageKey,
    _sourceId: record.id,
  }));
}

function readAllCompanyDocuments() {
  if (typeof window === "undefined") {
    return scopeCompanyDocuments(
      `${COMPANY_DOCUMENTS_STORAGE_PREFIX}Alice Stone`,
      "Alice Stone",
      [...DOCUMENTS, ...ALICE_DRAFT_TEST_DOCUMENTS],
    );
  }

  const companyStorageKeys = Object.keys(window.localStorage).filter((key) =>
    key.startsWith(COMPANY_DOCUMENTS_STORAGE_PREFIX),
  );
  const allRecords = companyStorageKeys.flatMap((storageKey) => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "[]",
      ) as DocumentRecord[];
      const companyName = storageKey.slice(COMPANY_DOCUMENTS_STORAGE_PREFIX.length);
      return Array.isArray(stored)
        ? scopeCompanyDocuments(storageKey, companyName, stored)
        : [];
    } catch {
      return [];
    }
  });

  return allRecords.length > 0
    ? allRecords
    : scopeCompanyDocuments(
        `${COMPANY_DOCUMENTS_STORAGE_PREFIX}Alice Stone`,
        "Alice Stone",
        [...DOCUMENTS, ...ALICE_DRAFT_TEST_DOCUMENTS],
      );
}

function persistAllCompanyDocuments(records: DocumentRecord[]) {
  if (typeof window === "undefined") return;
  const grouped = new Map<string, DocumentRecord[]>();
  records.forEach((record) => {
    const storageKey = record._companyStorageKey;
    if (!storageKey) return;
    const idPrefix = `${storageKey}::`;
    const storedRecord = { ...record };
    storedRecord.id = record._sourceId ?? record.id.replace(idPrefix, "");
    storedRecord.duplicateOfId = record.duplicateOfId
      ? record.duplicateOfId.replace(idPrefix, "")
      : undefined;
    delete storedRecord.organizationName;
    delete storedRecord._companyStorageKey;
    delete storedRecord._sourceId;
    grouped.set(storageKey, [...(grouped.get(storageKey) ?? []), storedRecord]);
  });

  grouped.forEach((companyRecords, storageKey) => {
    window.localStorage.setItem(storageKey, JSON.stringify(companyRecords));
    window.queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent("finansu-harmonija:persistent-state-changed", {
          detail: { storageKey },
        }),
      );
    });
  });
}

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "fileName", label: "Document PDF", width: 310, visible: true },
  { key: "status", label: "Status", width: 190, visible: true },
  {
    key: "uploadedAt",
    label: "Upload date and time",
    width: 240,
    visible: true,
  },
  { key: "source", label: "Source", width: 190, visible: true },
];

const PROCESSED_COLUMNS: ColConfig[] = [
  { key: "fileName", label: "Document PDF", width: 270, visible: true },
  { key: "documentType", label: "Document type", width: 190, visible: true },
  {
    key: "documentSubtype",
    label: "Document subtype",
    width: 210,
    visible: true,
  },
  { key: "status", label: "Status", width: 160, visible: true },
  {
    key: "uploadedAt",
    label: "Upload date and time",
    width: 220,
    visible: true,
  },
  { key: "source", label: "Source", width: 170, visible: true },
  {
    key: "duplicateRelation",
    label: "Duplicate / Original",
    width: 300,
    visible: true,
  },
];

const OCR_DRAFT_COLUMNS: ColConfig[] = [
  { key: "organizationName", label: "Organization", width: 190, visible: true },
  ...PROCESSED_COLUMNS.filter((column) => column.key !== "duplicateRelation"),
];

const STATUS_COLORS: Record<DocumentStatus, string> = {
  New: "#7288A3",
  "In progress": "#E6A700",
  Processed: "#007EA7",
  Completed: "#12B886",
  Duplicate: "#FF6200",
  Transferred: "#12B886",
};

function CheckBox({
  checked,
  mixed = false,
  onChange,
  label,
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: () => void;
  label: string;
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
      className="w-[18px] h-[18px] rounded border border-[#A1B6C6] accent-[#007EA7] cursor-pointer"
    />
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#DCE7F6]"
      >
        <span className="max-w-[190px] truncate whitespace-nowrap">
          {label}
          {value && <span className="text-[#10233A]">: {value}</span>}
        </span>
        {value ? (
          <X
            size={14}
            className="flex-shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
              setOpen(false);
            }}
          />
        ) : (
          <ChevronDown
            size={14}
            className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-[32px] z-50 min-w-[210px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
          {[{ value: "", label: "All" }, ...options.map((option) => ({ value: option, label: option }))].map(
            (option) => {
              const checked = option.value === value;
              return (
                <button
                  type="button"
                  key={option.value || "all"}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[#F2F7FC]"
                >
                  <span
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                  >
                    {checked && (
                      <Check
                        size={12}
                        strokeWidth={2.5}
                        className="text-white"
                      />
                    )}
                  </span>
                  <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                    {option.label}
                  </span>
                </button>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

function DocumentPreview({
  record,
  onClose,
}: {
  record: DocumentRecord;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/25 p-6"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Document preview ${record.fileName}`}
        className="flex h-[min(760px,92vh)] w-[min(920px,94vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E5EDF9] px-6">
          <div className="min-w-0">
            <h2 className="truncate font-montserrat text-[20px] font-semibold text-[#10233A]">
              {record.fileName}
            </h2>
            <p className="font-montserrat text-[12px] text-[#7288A3]">
              PDF document preview
            </p>
          </div>
          <button
            type="button"
            aria-label="Close document preview"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-[#7288A3] hover:text-[#10233A]"
          >
            <X size={22} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 bg-[#EEF3F7] p-6">
          <div className="mx-auto flex h-full w-[min(610px,100%)] flex-col bg-white px-12 py-10 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-montserrat text-[30px] font-semibold tracking-wide text-[#10233A]">
                  DOCUMENT
                </p>
                <p className="mt-1 font-montserrat text-[12px] text-[#7288A3]">
                  {record.fileName}
                </p>
              </div>
              <FileText
                size={42}
                strokeWidth={1.4}
                className="text-[#007EA7]"
              />
            </div>
            <div className="mt-10 grid grid-cols-2 gap-8 border-y border-[#D3E1EC] py-6 font-montserrat text-[12px]">
              <div>
                <p className="font-semibold text-[#7288A3]">Uploaded</p>
                <p className="mt-2 text-[#10233A]">{record.uploadedAt}</p>
              </div>
              <div>
                <p className="font-semibold text-[#7288A3]">Source</p>
                <p className="mt-2 text-[#10233A]">{record.source}</p>
              </div>
            </div>
            <div className="mt-8 space-y-3">
              {[88, 74, 94, 66, 82, 58].map((width, index) => (
                <div
                  key={index}
                  className="h-2 rounded bg-[#E5EDF9]"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
            <div className="mt-auto flex justify-end border-t border-[#E5EDF9] pt-5 font-montserrat text-[12px] text-[#7288A3]">
              Status: {record.status}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AllDocumentsView({
  mode,
  scope = "global",
  companyName = "",
}: {
  mode: "processed" | "uploaded";
  scope?: "global" | "company";
  companyName?: string;
}) {
  const processedSectionLabel =
    scope === "company" ? "Draft" : "Processed documents";
  const [query, setQuery] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    `finansu-harmonija:v7:all-documents-columns:${mode}`,
    mode === "processed" ? PROCESSED_COLUMNS : DEFAULT_COLUMNS,
  );
  const [showColumns, setShowColumns] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [companyDocuments, setCompanyDocuments] = usePersistentState<DocumentRecord[]>(
    `finansu-harmonija:v12:all-documents-records:${scope}:${companyName || "all"}`,
    DOCUMENTS,
  );
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<DocumentRecord[]>(
    readAllCompanyDocuments,
  );
  const documents = scope === "global" ? allCompanyDocuments : companyDocuments;
  const setDocuments = useCallback(
    (update: SetStateAction<DocumentRecord[]>) => {
      if (scope === "company") {
        setCompanyDocuments(update);
        return;
      }
      setAllCompanyDocuments((current) => {
        const next = typeof update === "function" ? update(current) : update;
        persistAllCompanyDocuments(next);
        return next;
      });
    },
    [scope, setCompanyDocuments],
  );
  const [resendRecord, setResendRecord] = useState<DocumentRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DocumentRecord | null>(null);
  const [ocrErrorMessage, setOcrErrorMessage] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentSubtype, setDocumentSubtype] = useState("");
  const [duplicateRelation, setDuplicateRelation] = useState("");
  const [activeFilterKeys, setActiveFilterKeys] = usePersistentState<ColumnKey[]>(
    `finansu-harmonija:v12:all-documents-active-filters:${mode}:${scope}:${companyName || "all"}`,
    [],
  );
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [pendingAddedFilterKeys, setPendingAddedFilterKeys] = useState<
    ColumnKey[]
  >([]);
  const [, setRefreshRevision] = useState(0);
  const addFilterMenuRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const defaultColumns = useMemo(
    () => mode === "processed"
      ? scope === "company"
        ? PROCESSED_COLUMNS.filter((column) => column.key !== "duplicateRelation")
        : PROCESSED_COLUMNS
      : scope === "global"
        ? OCR_DRAFT_COLUMNS
        : DEFAULT_COLUMNS,
    [mode, scope],
  );

  useEffect(() => {
    if (scope !== "global") return;
    const reloadAllCompanyDocuments = (event?: Event) => {
      if (event instanceof CustomEvent) {
        const storageKey = String(event.detail?.storageKey ?? "");
        if (
          storageKey &&
          !storageKey.startsWith(COMPANY_DOCUMENTS_STORAGE_PREFIX)
        ) {
          return;
        }
      }
      setAllCompanyDocuments(readAllCompanyDocuments());
    };
    const reloadFromStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(COMPANY_DOCUMENTS_STORAGE_PREFIX)) {
        reloadAllCompanyDocuments();
      }
    };
    window.addEventListener(
      "finansu-harmonija:persistent-state-changed",
      reloadAllCompanyDocuments,
    );
    window.addEventListener("storage", reloadFromStorage);
    return () => {
      window.removeEventListener(
        "finansu-harmonija:persistent-state-changed",
        reloadAllCompanyDocuments,
      );
      window.removeEventListener("storage", reloadFromStorage);
    };
  }, [scope]);

  useEffect(() => {
    setColumns((current) => {
      if (mode === "uploaded" && scope === "global") {
        const currentByKey = new Map(
          current.map((column) => [column.key, column]),
        );
        const normalized = defaultColumns.map((defaultColumn) => {
          const savedColumn = currentByKey.get(defaultColumn.key);
          return savedColumn
            ? {
                ...defaultColumn,
                width: savedColumn.width,
                visible: savedColumn.visible,
              }
            : defaultColumn;
        });
        const isAlreadyNormalized =
          normalized.length === current.length &&
          normalized.every(
            (column, index) =>
              column.key === current[index]?.key &&
              column.width === current[index]?.width &&
              column.visible === current[index]?.visible,
          );
        return isAlreadyNormalized ? current : normalized;
      }

      const missing = defaultColumns.filter(
        (defaultColumn) =>
          !current.some((column) => column.key === defaultColumn.key),
      );
      return missing.length > 0 ? [...current, ...missing] : current;
    });
  }, [defaultColumns, mode, scope, setColumns]);

  useEffect(() => {
    const allowedKeys = new Set(defaultColumns.map((column) => column.key));
    setActiveFilterKeys((current) => current.filter((key) => allowedKeys.has(key)));
  }, [defaultColumns, setActiveFilterKeys]);

  useEffect(() => {
    if (!addFilterOpen) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !addFilterMenuRef.current?.contains(target)
      ) {
        setAddFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddFilterOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addFilterOpen]);

  useEffect(() => {
    setDocuments((current) => {
      const needsDuplicateStatusMigration = current.some(
        (record) => record.duplicateOfId && record.status !== "Duplicate",
      );
      if (!needsDuplicateStatusMigration) return current;
      return current.map((record) =>
        record.duplicateOfId ? { ...record, status: "Duplicate" } : record,
      );
    });
  }, [setDocuments]);

  useEffect(() => {
    if (
      mode !== "processed" ||
      scope !== "company" ||
      companyName.trim().toLocaleLowerCase() !== "alice stone"
    ) {
      return;
    }

    setDocuments((current) => {
      const existingIds = new Set(current.map((record) => record.id));
      const missing = ALICE_DRAFT_TEST_DOCUMENTS.filter(
        (record) => !existingIds.has(record.id),
      );
      return missing.length > 0 ? [...current, ...missing] : current;
    });
  }, [companyName, mode, scope, setDocuments]);

  const visibleColumns = columns.filter(
    (column) => column.visible && defaultColumns.some((defaultColumn) => defaultColumn.key === column.key),
  );
  const availableFilterColumns = defaultColumns.filter((column) =>
    FILTER_LABELS[column.key as ColumnKey],
  );
  const isCompanyDraft = mode === "processed" && scope === "company";
  const isUploadedOcr = mode === "uploaded" && scope === "global";
  const sectionDocuments = useMemo(
    () =>
      documents.filter((record) =>
        mode === "processed" || isUploadedOcr
          ? record.status === "Processed" ||
            record.status === "Completed" ||
            record.status === "Duplicate" ||
            (!isCompanyDraft && !isUploadedOcr && record.status === "Transferred")
          : record.status === "New" || record.status === "In progress",
      ),
    [documents, isCompanyDraft, isUploadedOcr, mode],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return sectionDocuments.filter((record) => {
      const recordPeriod = record.uploadedAt.slice(3, 10);
      if (period && recordPeriod !== period) return false;
      if (organizationName && record.organizationName !== organizationName)
        return false;
      const relatedOriginal = record.duplicateOfId
        ? documents.find((item) => item.id === record.duplicateOfId)
        : undefined;
      const relatedDuplicate = documents.find(
        (item) => item.duplicateOfId === record.id,
      );
      const recordDuplicateRelation = relatedOriginal
        ? "Duplicate"
        : relatedDuplicate
          ? "Original"
          : "None";
      if (status && record.status !== status) return false;
      if (source && record.source !== source) return false;
      if (fileName && record.fileName !== fileName) return false;
      if (documentType && record.documentType !== documentType) return false;
      if (documentSubtype && record.documentSubtype !== documentSubtype)
        return false;
      if (
        duplicateRelation &&
        recordDuplicateRelation !== duplicateRelation
      )
        return false;
      return (
        !normalized ||
        [
          record.organizationName ?? "",
          record.fileName,
          record.documentType,
          record.documentSubtype,
          record.status,
          record.uploadedAt,
          record.source,
          record.clientCounterparty,
          record.currency,
          String(record.amount),
        ].some((value) => value.toLocaleLowerCase().includes(normalized))
      );
    });
  }, [
    documentSubtype,
    documentType,
    documents,
    duplicateRelation,
    fileName,
    organizationName,
    period,
    query,
    sectionDocuments,
    source,
    status,
  ]);

  const filterBindings: Record<
    ColumnKey,
    { value: string; options: string[]; onChange: (value: string) => void }
  > = {
    organizationName: {
      value: organizationName,
      options: Array.from(
        new Set(
          sectionDocuments
            .map((record) => record.organizationName)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
      onChange: setOrganizationName,
    },
    fileName: {
      value: fileName,
      options: Array.from(new Set(sectionDocuments.map((record) => record.fileName))),
      onChange: setFileName,
    },
    documentType: {
      value: documentType,
      options: Array.from(
        new Set(sectionDocuments.map((record) => record.documentType)),
      ),
      onChange: setDocumentType,
    },
    documentSubtype: {
      value: documentSubtype,
      options: Array.from(
        new Set(sectionDocuments.map((record) => record.documentSubtype)),
      ),
      onChange: setDocumentSubtype,
    },
    status: {
      value: status,
      options: Array.from(new Set(sectionDocuments.map((record) => record.status))),
      onChange: setStatus,
    },
    uploadedAt: {
      value: period,
      options: Array.from(
        new Set(sectionDocuments.map((record) => record.uploadedAt.slice(3, 10))),
      ),
      onChange: setPeriod,
    },
    source: {
      value: source,
      options: Array.from(new Set(sectionDocuments.map((record) => record.source))),
      onChange: setSource,
    },
    duplicateRelation: {
      value: duplicateRelation,
      options: ["Original", "Duplicate", "None"],
      onChange: setDuplicateRelation,
    },
  };

  const applySelectedFilters = () => {
    setActiveFilterKeys(pendingAddedFilterKeys);
    (Object.keys(filterBindings) as ColumnKey[]).forEach((key) => {
      if (!pendingAddedFilterKeys.includes(key)) {
        filterBindings[key].onChange("");
      }
    });
    setAddFilterOpen(false);
  };

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    DocumentRecord,
    ColumnKey
  >(filtered, (record, key) => {
    if (key === "duplicateRelation") {
      if (record.duplicateOfId) return "Duplicate";
      return documents.some((item) => item.duplicateOfId === record.id)
        ? "Original"
        : "None";
    }
    return record[key];
  });
  const allSelected =
    sortedRows.length > 0 &&
    sortedRows.every((record) => selected.has(record.id));
  const someSelected =
    !allSelected && sortedRows.some((record) => selected.has(record.id));
  const pinRowActionsRight = isCompanyDraft || isUploadedOcr;
  const rowActionsWidth = isCompanyDraft ? 116 : pinRowActionsRight ? 78 : 42;

  const exportProcessedDocuments = () => {
    const escapeCsv = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      [
        "Document PDF",
        "Document type",
        "Document subtype",
        "Status",
        "Upload date and time",
        "Source",
        "Client / Counterparty",
        "Currency",
        "Amount",
      ],
      ...sectionDocuments.map((record) => [
        record.fileName,
        record.documentType,
        record.documentSubtype,
        record.status,
        record.uploadedAt,
        record.source,
        record.clientCounterparty,
        record.currency,
        record.amount,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "processed-documents.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importAllDraftDocuments = () => {
    const importableDocuments = sectionDocuments.filter((record) => !record.deleted);
    if (importableDocuments.length === 0) return;
    importMenuRecords(
      `company:${companyName}:draft`,
      importableDocuments.map((record) => record.id),
    );
    const importedIds = new Set(importableDocuments.map((record) => record.id));
    setDocuments((current) =>
      current.map((record) =>
        importedIds.has(record.id)
          ? { ...record, status: "Transferred" }
          : record,
      ),
    );
    setSelected(new Set());
  };

  const renderCell = (record: DocumentRecord, key: string) => {
    if (key === "fileName") {
      if (record.deleted) {
        return (
          <span className="block truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#A1B6C6] line-through">
            {record.fileName}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => setPreview(record)}
          className={`block truncate text-left font-montserrat text-[12px] font-normal leading-[18px] transition-colors ${record.accepted ? "text-[#A1B6C6]" : "text-[#10233A] hover:text-[#007EA7]"}`}
          title={`Open ${record.fileName}`}
        >
          {record.fileName}
        </button>
      );
    }
    if (key === "status") {
      const statusContent = (
        <>
          {record.accepted && !record.deleted ? (
            <CheckCircle2 size={14} className="flex-shrink-0 text-[#12B886]" />
          ) : (
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: record.deleted ? "#A1B6C6" : STATUS_COLORS[record.status] }}
            />
          )}
          {record.status}
        </>
      );
      const statusClassName = `flex items-center gap-2 font-montserrat text-[12px] leading-[18px] ${record.deleted ? "font-normal text-[#A1B6C6] line-through" : record.accepted ? "font-medium text-[#12B886]" : "font-normal text-[#10233A]"}`;
      const originalDocument = record.status === "Duplicate" && record.duplicateOfId
        ? documents.find((item) => item.id === record.duplicateOfId)
        : undefined;
      if (originalDocument && !record.deleted) {
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`${statusClassName} flex-shrink-0`}>
              {statusContent}
            </span>
            <span className="flex-shrink-0 font-montserrat text-[12px] text-[#A1B6C6]">
              ·
            </span>
            <button
              type="button"
              onClick={() => setPreview(originalDocument)}
              className="min-w-0 truncate text-left font-montserrat text-[12px] font-medium text-[#007EA7] hover:underline"
              title={`Open original document ${originalDocument.fileName}`}
            >
              {originalDocument.fileName}
            </button>
          </div>
        );
      }
      return (
        <span className={statusClassName}>
          {statusContent}
        </span>
      );
    }
    if (key === "duplicateRelation") {
      const original = record.duplicateOfId
        ? documents.find((item) => item.id === record.duplicateOfId)
        : undefined;
      const duplicate = documents.find((item) => item.duplicateOfId === record.id);
      if (record.deleted) {
        return (
          <span className="block truncate font-montserrat text-[12px] text-[#A1B6C6] line-through">
            {original ? "Duplicate" : duplicate ? "Original" : "—"}
          </span>
        );
      }
      if (record.accepted) {
        return (
          <span className="block truncate font-montserrat text-[12px] text-[#A1B6C6]">
            {original ? "Duplicate" : duplicate ? "Original" : "—"}
          </span>
        );
      }
      if (!original && !duplicate) {
        return <span className="font-montserrat text-[12px] text-[#A1B6C6]">—</span>;
      }
      const related = original ?? duplicate;
      return (
        <div className="flex min-w-0 items-center gap-2 font-montserrat text-[12px]">
          <span className={`flex-shrink-0 rounded px-2 py-0.5 font-semibold ${original ? "bg-[#FFF2E8] text-[#C45100]" : "bg-[#E7F4F9] text-[#007EA7]"}`}>
            {original ? "Duplicate" : "Original"}
          </span>
          {related && (
            <button
              type="button"
              onClick={() => setPreview(related)}
              className="truncate font-medium text-[#007EA7] hover:underline"
              title={`Open ${related.fileName}`}
            >
              {related.fileName}
            </button>
          )}
        </div>
      );
    }
    return (
      <span className={`block truncate font-montserrat text-[12px] font-normal leading-[18px] ${record.deleted ? "text-[#A1B6C6] line-through" : record.accepted ? "text-[#A1B6C6]" : "text-[#10233A]"}`}>
        {String(record[key as keyof DocumentRecord] ?? "—")}
      </span>
    );
  };

  const resendToOcr = () => {
    if (!resendRecord || !ocrErrorMessage.trim()) return;
    setDocuments((current) =>
      current.map((record) =>
        record.id === resendRecord.id
          ? {
              ...record,
              status: "In progress",
              ocrErrorMessage: ocrErrorMessage.trim(),
            }
          : record,
      ),
    );
    setSelected((current) => {
      const next = new Set(current);
      next.delete(resendRecord.id);
      return next;
    });
    setResendRecord(null);
    setOcrErrorMessage("");
  };

  const confirmDelete = () => {
    if (!deleteRecord) return;
    setDocuments((current) =>
      current.map((record) =>
        record.id === deleteRecord.id
          ? { ...record, deleted: true, deletedAt: new Date().toISOString() }
          : record,
      ),
    );
    setSelected((current) => {
      const next = new Set(current);
      next.delete(deleteRecord.id);
      return next;
    });
    setDeleteRecord(null);
  };

  const acceptRecord = (recordId: string) => {
    setDocuments((current) =>
      current.map((record) =>
        record.id === recordId
          ? { ...record, accepted: true, acceptedAt: new Date().toISOString() }
          : record,
      ),
    );
    setSelected((current) => {
      const next = new Set(current);
      next.delete(recordId);
      return next;
    });
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 font-montserrat text-[#10233A] sm:px-8 lg:px-[72px]">
      <PageHeader
        title={
          mode === "processed" ? processedSectionLabel : "Draft"
        }
      />
      {scope === "company" && companyName ? (
        <CompanyBreadcrumb
          companyName={companyName}
          items={["All documents", mode === "processed" ? processedSectionLabel : "Draft"]}
          singleLine
        />
      ) : (
        <OcrBreadcrumb
          items={[
            "All documents",
            mode === "processed" ? processedSectionLabel : "Draft",
          ]}
        />
      )}
      <div className="system-table-toolbar flex h-7 min-h-7 flex-row flex-nowrap items-center gap-4">
        <div
          data-native-system-filters="true"
          className="flex min-w-0 flex-1 flex-row flex-nowrap items-center gap-1"
        >
          <OcrSearchField
            ariaLabel={`Search ${
              mode === "processed" ? processedSectionLabel : "Draft"
            }`}
            value={query}
            onChange={setQuery}
          />
          {activeFilterKeys.map((key) => {
            const binding = filterBindings[key];
            if (!binding) return null;
            return (
              <FilterDropdown
                key={key}
                label={FILTER_LABELS[key]}
                value={binding.value}
                options={binding.options}
                onChange={binding.onChange}
              />
            );
          })}
          <div ref={addFilterMenuRef} className="relative flex-shrink-0">
            <button
              type="button"
              aria-label="Add filters"
              aria-expanded={addFilterOpen}
              onClick={() =>
                setAddFilterOpen((current) => {
                  if (!current) setPendingAddedFilterKeys(activeFilterKeys);
                  return !current;
                })
              }
              className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#7288A3] transition-colors hover:bg-[#DCE7F6]"
            >
              <Plus size={14} />
              <span>Add filters</span>
            </button>
            {addFilterOpen && (
              <div
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySelectedFilters();
                  }
                }}
                className="absolute left-0 top-full z-30 mt-1 min-w-[270px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
              >
                {availableFilterColumns.map((column) => {
                  const key = column.key as ColumnKey;
                  const selected = pendingAddedFilterKeys.includes(key);
                  return (
                  <button
                    type="button"
                    key={key}
                    onClick={() =>
                      setPendingAddedFilterKeys((current) =>
                        current.includes(key)
                          ? current.filter((item) => item !== key)
                          : [...current, key],
                      )
                    }
                    className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[#F2F7FC]"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {selected && (
                        <Check
                          size={13}
                          strokeWidth={2.5}
                          className="text-white"
                        />
                      )}
                    </span>
                    <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                      {FILTER_LABELS[key]}
                    </span>
                  </button>
                  );
                })}
                <div className="mt-1 flex items-center justify-between border-t border-[#E5EDF9] px-2 pt-2">
                  <span className="font-montserrat text-[11px] text-[#7288A3]">
                    Enter to apply
                  </span>
                  <button
                    type="button"
                    onClick={applySelectedFilters}
                    className="h-8 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006D91]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveFilterKeys([]);
              setPendingAddedFilterKeys([]);
              (Object.keys(filterBindings) as ColumnKey[]).forEach((key) =>
                filterBindings[key].onChange(""),
              );
              setAddFilterOpen(false);
            }}
            className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
          >
            <X size={15} />
            <span>Clear filters</span>
          </button>
        </div>
        <div className="ml-auto flex h-7 flex-row items-center gap-4 rounded bg-white">
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          {(mode === "processed" || isUploadedOcr) && (
            <>
              {scope === "company" || isUploadedOcr ? (
                <ImportDataButton
                  disabled={!sectionDocuments.some((record) => !record.deleted)}
                  onClick={importAllDraftDocuments}
                />
              ) : (
                <button
                  type="button"
                  data-button-family="export"
                  title="EXPORTDATA"
                  aria-label={`EXPORTDATA ${processedSectionLabel}`}
                  onClick={exportProcessedDocuments}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
                >
                  <Download size={16} />
                </button>
              )}
              <RefreshAllButton
                onRefresh={() => setRefreshRevision((current) => current + 1)}
              />
            </>
          )}
        </div>
      </div>

      <div
        ref={tableScrollRef}
        className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
      >
        <div
          style={{
            minWidth:
              visibleColumns.reduce((sum, column) => sum + column.width, 0) +
              42 +
              rowActionsWidth,
          }}
        >
          <div className="mb-3 flex h-9 items-center">
            <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 items-center justify-center">
              <CheckBox
                checked={allSelected}
                mixed={someSelected}
                label="Select all documents"
                onChange={() =>
                  setSelected(
                    allSelected
                      ? new Set()
                      : new Set(sortedRows.map((record) => record.id)),
                  )
                }
              />
            </div>
            {visibleColumns.map((column, visibleIndex) => {
              const realIndex = columns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="truncate">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={directionFor(column.key as ColumnKey)}
                    onDirectionChange={(direction) =>
                      changeSort(column.key as ColumnKey, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) => startResize(realIndex, event)}
                  />
                </div>
              );
            })}
            <div
              aria-hidden="true"
              style={{ width: rowActionsWidth }}
              className="h-full flex-shrink-0"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            {sortedRows.map((record, index) => {
              const rowBackground =
                index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white";
              const editAction = (
                <div
                  style={{ width: rowActionsWidth }}
                  className={`flex h-full flex-shrink-0 items-center justify-center gap-2 ${pinRowActionsRight ? "rounded-r-lg bg-inherit px-2" : ""}`}
                >
                  {!pinRowActionsRight && (
                    <button
                      type="button"
                      title="EDIT"
                      aria-label={`EDIT ${record.fileName}`}
                      onClick={() => setPreview(record)}
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {pinRowActionsRight && (
                    <>
                      <button
                        type="button"
                        title="ACCEPT"
                        aria-label={`ACCEPT ${record.fileName}`}
                        disabled={record.deleted || record.accepted}
                        onClick={() => acceptRecord(record.id)}
                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${record.accepted ? "cursor-default border-[#12B886] bg-[#12B886] text-white" : "border-[#C8D8E5] bg-transparent text-[#7288A3] hover:border-[#12B886] hover:bg-white hover:text-[#12B886] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"}`}
                      >
                        <Check size={14} strokeWidth={2.4} />
                      </button>
                      {!isUploadedOcr && (
                        <button
                          type="button"
                          title="Resend to OCR"
                          aria-label={`Resend ${record.fileName} to OCR`}
                          disabled={record.deleted || record.accepted}
                          onClick={() => {
                            setOcrErrorMessage("");
                            setResendRecord(record);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C8D8E5] bg-transparent text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-white hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"
                        >
                          <ScanText size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="DELETE"
                        aria-label={`DELETE ${record.fileName}`}
                        disabled={record.deleted}
                        onClick={() => setDeleteRecord(record)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[#C8D8E5] bg-transparent text-[#7288A3] transition-colors hover:border-[#FF6200] hover:bg-white hover:text-[#FF6200] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              );

              return (
                <div
                  key={record.id}
                  className={`group flex h-10 items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] ${rowBackground} ${record.deleted || record.accepted ? "text-[#A1B6C6]" : "text-[#10233A] hover:bg-[#E7F4F9]"}`}
                >
                  <div className="flex w-[42px] flex-shrink-0 justify-center">
                    <CheckBox
                      checked={selected.has(record.id)}
                      label={`Select ${record.fileName}`}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(record.id)) next.delete(record.id);
                          else next.add(record.id);
                          return next;
                        })
                      }
                    />
                  </div>
                  {visibleColumns.map((column) => (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="flex-shrink-0 overflow-hidden px-3"
                    >
                      {renderCell(record, column.key)}
                    </div>
                  ))}
                  {editAction}
                </div>
              );
            })}
            {!sortedRows.length && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 font-montserrat text-[#7288A3]">
                <FileText size={30} />
                <span className="text-[14px] font-semibold">
                  No matching documents
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <div className="flex flex-shrink-0">
        <TablePagination
          currentPage={1}
          totalPages={1}
          itemCount={sortedRows.length}
          onPageChange={() => undefined}
        />
      </div>

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns.filter((column) => defaultColumns.some((defaultColumn) => defaultColumn.key === column.key))}
          defaultColumns={defaultColumns}
          onSave={(next) => {
            const allowedKeys = new Set(defaultColumns.map((column) => column.key));
            setColumns((current) => [
              ...next,
              ...current.filter((column) => !allowedKeys.has(column.key)),
            ]);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
      {preview && (
        <DocumentPreview record={preview} onClose={() => setPreview(null)} />
      )}

      {resendRecord && (
        <div className="fixed inset-0 z-[210] flex justify-end" onClick={() => setResendRecord(null)}>
          <aside className="flex h-full w-[420px] flex-col bg-white shadow-[-2px_0_0_#E5EDF9]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#D3E1EC] px-6 py-5">
              <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Resend to OCR</h2>
              <button type="button" aria-label="Close resend to OCR" onClick={() => setResendRecord(null)} className="text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>
            <div className="flex-1 space-y-6 px-6 py-6 font-montserrat">
              <div className="rounded-lg bg-[#F8FDFF] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7288A3]">Document</p>
                <p className="mt-1 truncate text-[13px] font-semibold text-[#10233A]">{resendRecord.fileName}</p>
              </div>
              <label className="flex flex-col gap-2 text-[12px] font-semibold text-[#10233A]">
                <span>Error message<span className="text-[#D90310]">*</span></span>
                <textarea value={ocrErrorMessage} onChange={(event) => setOcrErrorMessage(event.target.value)} rows={7} placeholder="Describe the OCR or document processing error" className="resize-none rounded-lg border border-[#D3E1EC] px-3 py-2 text-[13px] font-medium outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]" />
              </label>
              <p className="text-[11px] leading-5 text-[#7288A3]">The document will be returned to OCR with status In progress. The error message will be retained with the document.</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#D3E1EC] px-6 py-5">
              <button type="button" onClick={() => setResendRecord(null)} className="h-[42px] min-w-[108px] rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]">Cancel</button>
              <button data-system-action="true" type="button" disabled={!ocrErrorMessage.trim()} onClick={resendToOcr} className="h-[42px] min-w-[132px] rounded-lg bg-[#007EA7] px-4 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Send to OCR</button>
            </div>
          </aside>
        </div>
      )}

      {deleteRecord && (
        <div className="fixed inset-0 z-[210] flex justify-end" onClick={() => setDeleteRecord(null)}>
          <aside className="flex h-full w-[340px] flex-col bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Delete document</h2>
              <button type="button" aria-label="Close delete document" onClick={() => setDeleteRecord(null)} className="text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>
            <p className="mt-6 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">Are you sure that you want to delete {deleteRecord.fileName}?</p>
            <p className="mt-2 font-montserrat text-[12px] font-normal leading-5 text-[#7288A3]">The record will remain in Draft and will be shown in gray with strikethrough text.</p>
            <div className="mt-8 flex gap-4">
              <button type="button" onClick={() => setDeleteRecord(null)} className="h-[42px] flex-1 rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[14px] font-semibold text-[#7288A3]">Cancel</button>
              <button data-system-action="true" type="button" onClick={confirmDelete} className="h-[42px] flex-1 rounded-lg bg-[#FF6200] font-montserrat text-[14px] font-semibold text-white">Delete</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
