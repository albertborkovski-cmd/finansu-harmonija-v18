import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Pencil, X } from "lucide-react";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import { HeaderBackButton } from "./SystemNavigation";
import RefreshAllButton from "./RefreshAllButton";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import TablePagination from "./TablePagination";
import SystemAddFilters from "./SystemAddFilters";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

export type OrganizationReferenceSection =
  | "Company status"
  | "Tax country"
  | "Legal form"
  | "Base currency"
  | "Document type"
  | "Document Status"
  | "Unit";

export interface OrganizationReferenceRecord {
  code: string;
  fullName: string;
  description: string;
  country: string;
  status: string;
  parentCode: string;
}

const DEFAULT_RECORDS: Record<
  OrganizationReferenceSection,
  OrganizationReferenceRecord[]
> = {
  "Company status": [
    [
      "ACTIVE",
      "Active",
      "Organization is active and available for daily operations.",
    ],
    ["INACTIVE", "Inactive", "Organization is currently inactive."],
    [
      "SUSPENDED",
      "Suspended",
      "Organization operations are temporarily suspended.",
    ],
    ["DELETED", "Deleted", "Organization is archived and no longer used."],
  ].map(([code, fullName, description]) => ({
    code,
    fullName,
    description,
    country: "",
    status: "Active",
    parentCode: "",
  })),
  "Tax country": [
    ["LT", "Lithuania"],
    ["LV", "Latvia"],
    ["EE", "Estonia"],
    ["PL", "Poland"],
    ["DE", "Germany"],
    ["FI", "Finland"],
    ["SE", "Sweden"],
    ["NO", "Norway"],
    ["DK", "Denmark"],
  ].map(([code, fullName]) => ({
    code,
    fullName,
    description: `Tax jurisdiction: ${fullName}.`,
    country: "",
    status: "Active",
    parentCode: "",
  })),
  "Legal form": [
    ["UAB", "Uždaroji akcinė bendrovė"],
    ["AB", "Akcinė bendrovė"],
    ["MB", "Mažoji bendrija"],
    ["VŠĮ", "Viešoji įstaiga"],
    ["IĮ", "Individuali įmonė"],
    ["Association", "Association"],
    ["Charity and support fund", "Charity and support fund"],
    ["LLC", "Limited Liability Company"],
    ["JSC", "Joint Stock Company"],
    ["Partnership", "Partnership"],
    ["Sole proprietorship", "Sole proprietorship"],
    ["Non-profit organization", "Non-profit organization"],
  ].map(([code, fullName]) => ({
    code,
    fullName,
    description: `Legal form: ${fullName}.`,
    country: "",
    status: "Active",
    parentCode: "",
  })),
  "Base currency": [
    ["EUR", "Euro"],
    ["PLN", "Polish złoty"],
    ["SEK", "Swedish krona"],
    ["NOK", "Norwegian krone"],
    ["DKK", "Danish krone"],
  ].map(([code, fullName]) => ({
    code,
    fullName,
    description: `ISO 4217 base currency: ${fullName}.`,
    country:
      code === "EUR"
        ? "European Union"
        : code === "PLN"
          ? "Poland"
          : code === "SEK"
            ? "Sweden"
            : code === "NOK"
              ? "Norway"
              : "Denmark",
    status: "Active",
    parentCode: "",
  })),
  "Document type": [
    ["INVOICES", "Invoices", "Invoice document group.", ""],
    ["INVOICE", "Invoice", "Invoice.", "INVOICES"],
    ["VAT_INVOICE", "VAT invoice", "VAT invoice.", "INVOICES"],
    ["CREDIT_INVOICE", "Credit invoice", "Credit invoice.", "INVOICES"],
    ["DEBIT_INVOICE", "Debit invoice", "Debit invoice.", "INVOICES"],
    ["ADVANCE_INVOICE", "Advance invoice", "Advance invoice.", "INVOICES"],
    ["VAT_ADVANCE_INVOICE", "VAT advance invoice", "VAT advance invoice.", "INVOICES"],
    ["OTHER_INVOICE_DOCUMENT", "Other document (insurance policies, receipts, permits, declarations, notices, etc.)", "Other invoice-group document.", "INVOICES"],

    ["CONTRACTS", "Contracts", "Contract document group.", ""],
    ["EMPLOYMENT_CONTRACT", "Employment contract", "Employment contract.", "CONTRACTS"],
    ["AUTHOR_AGREEMENT", "Copyright agreement", "Copyright agreement.", "CONTRACTS"],
    ["LOAN_AGREEMENT", "Loan agreement", "Loan agreement.", "CONTRACTS"],
    ["PURCHASE_SALE_AGREEMENT", "Purchase and sale agreement", "Purchase and sale agreement.", "CONTRACTS"],
    ["LOAN_FOR_USE_AGREEMENT", "Loan-for-use agreement", "Loan-for-use agreement.", "CONTRACTS"],
    ["LEASE_AGREEMENT", "Lease agreement", "Lease agreement.", "CONTRACTS"],
    ["SERVICE_AGREEMENT", "Service agreement", "Service agreement.", "CONTRACTS"],
    ["SUPPORT_AGREEMENT", "Support agreement", "Support agreement.", "CONTRACTS"],
    ["CIVIL_SERVICE_AGREEMENT", "Civil service agreement", "Civil service agreement.", "CONTRACTS"],

    ["EMPLOYEE_DOCUMENTS", "Employee documents", "Employee document group.", ""],
    ["EMPLOYMENT_APPLICATION", "Employment application", "Employment application.", "EMPLOYEE_DOCUMENTS"],
    ["TERMINATION_APPLICATION", "Termination application", "Termination application.", "EMPLOYEE_DOCUMENTS"],
    ["PARENT_DAY_APPLICATION", "Request for a mother's / father's day off", "Request for a mother's or father's day off.", "EMPLOYEE_DOCUMENTS"],
    ["LEAVE_APPLICATION", "Leave application", "Leave application.", "EMPLOYEE_DOCUMENTS"],
    ["BONUS_ORDER", "Order on awarding a bonus", "Order on awarding a bonus.", "EMPLOYEE_DOCUMENTS"],
    ["EMPLOYMENT_CONTRACT_AMENDMENT", "Employment contract annexes and amendments", "Employment contract annexes and amendments.", "EMPLOYEE_DOCUMENTS"],

    ["SETTLEMENT", "Settlement", "Settlement and cash document group.", ""],
    ["CASH_RECEIPT", "Cash receipt", "Cash receipt.", "SETTLEMENT"],
    ["CASH_RECEIPT_ORDER", "Cash receipt order (KPO)", "Cash receipt order.", "SETTLEMENT"],
    ["CASH_PAYMENT_ORDER", "Cash payment order (KIO)", "Cash payment order.", "SETTLEMENT"],
    ["MUTUAL_DEBT_OFFSET_ACT", "Mutual debt offset act", "Mutual debt offset act.", "SETTLEMENT"],
    ["DEBT_RECONCILIATION_ACT", "Debt reconciliation act", "Debt reconciliation act.", "SETTLEMENT"],

    ["OTHER_DOCUMENTS", "OTHER", "Other document group.", ""],
    ["COMPLETED_WORK_ACT", "Certificate of completed works", "Certificate of completed works.", "OTHER_DOCUMENTS"],
    ["INVENTORY_WRITE_OFF_ACT", "Inventory write-off act", "Inventory write-off act.", "OTHER_DOCUMENTS"],
    ["TRAVEL_SHEET", "Travel sheets", "Travel sheets.", "OTHER_DOCUMENTS"],
    ["INTRASTAT_REPORT", "Intrastat report", "Intrastat report.", "OTHER_DOCUMENTS"],
    ["WAYBILL", "Waybill", "Waybill.", "OTHER_DOCUMENTS"],

    ["ACCOUNTING_NOTE", "Accounting note", "Accounting note.", ""],
  ].map(([code, fullName, description, parentCode]) => ({
    code,
    fullName,
    description,
    country: "",
    status: "Active",
    parentCode,
  })),
  "Document Status": [
    [
      "PROCESSING",
      "Processing (Apdorojama)",
      "Dokumentas įkeltas į sistemą ir vyksta OCR nuskaitymas, duomenų analizė, validacija arba duomenų papildymas.",
    ],
    [
      "REJECTED",
      "Rejected (Atmesta)",
      "Dokumentas netinkamo formato, neįskaitomas arba neatitinka verslo taisyklių. Dokumentas neatitiko validacijų.",
    ],
    [
      "PROVIDE_ADDITIONAL_DATA",
      "Provide Additional Data (Pateikti papildomus duomenis / suvesti informaciją)",
      "Trūksta duomenų, neidentifikuotas kontrahentas, nenustatyta DK sąskaita, projektas ar išlaidų centras (tik jei pagal nustatymus privaloma), arba trūksta OCR atpažintos informacijos.",
    ],
    [
      "EXCEPTION",
      "Exception (Išimtis)",
      "OCR nepavyko apdoroti dokumento, įvyko integracijos arba sisteminė klaida, todėl dokumentas perduotas Meso Administratoriui rankiniam peržiūrėjimui.",
    ],
    [
      "TRANSFERRED",
      "Transferred (Perkelta)",
      "Dokumentas sėkmingai perduotas į apskaitos sistemą arba kitą išorinę sistemą.",
    ],
    [
      "DUPLICATE",
      "Duplicate (Dublikatas)",
      "Nustatytas galimas dokumento dublikatas.",
    ],
    [
      "NOT_DOCUMENT",
      "Not Document (Ne dokumentas)",
      "Nenustatytas dokumento tipas arba įkeltas failas nėra dokumentas.",
    ],
  ].map(([code, fullName, description]) => ({
    code,
    fullName,
    description,
    country: "",
    status: "Active",
    parentCode: "",
  })),
  "Unit": [
    ["vnt", "Unit", "C62", "Unit"],
    ["kg", "Kilogram", "KGM", "Kilogram"],
    ["g", "Gram", "GRM", "Gram"],
    ["t", "Tonne", "TNE", "Tonne"],
    ["l", "Litre", "LTR", "Litre"],
    ["ml", "Millilitre", "MLT", "Millilitre"],
    ["m", "Metre", "MTR", "Metre"],
    ["cm", "Centimetre", "CMT", "Centimetre"],
    ["mm", "Millimetre", "MMT", "Millimetre"],
    ["m²", "Square metre", "MTK", "Square metre"],
    ["m³", "Cubic metre", "MTQ", "Cubic metre"],
    ["val", "Hour", "HUR", "Hour"],
    ["d", "Day", "DAY", "Day"],
    ["mėn", "Month", "MON", "Month"],
    ["kompl", "Set", "SET", "Set"],
    ["pak", "Package", "XPK", "Package"],
    ["dėž", "Box", "XBX", "Box"],
    ["rul", "Roll", "XRL", "Roll"],
    ["pal", "Pallet", "XPX", "Pallet"],
    ["pora", "Pair", "PR", "Pair"],
  ].map(([code, fullName, uneceCode, uneceValue]) => ({
    code,
    fullName,
    description: uneceCode,
    country: uneceValue,
    status: "Active",
    parentCode: "",
  })),
};

const columnsForSection = (
  section: OrganizationReferenceSection,
): ColConfig[] => {
  if (section === "Company status") {
    return [
      { key: "code", label: "Code", width: 220, visible: true },
      { key: "description", label: "Description", width: 560, visible: true },
    ];
  }
  if (section === "Base currency") {
    return [
      { key: "code", label: "Code", width: 150, visible: true },
      {
        key: "fullName",
        label: "Currency full name",
        width: 300,
        visible: true,
      },
      { key: "country", label: "Country", width: 240, visible: true },
      { key: "status", label: "Status", width: 180, visible: true },
    ];
  }
  if (section === "Document type") {
    return [
      { key: "code", label: "Code", width: 200, visible: true },
      { key: "fullName", label: "Name", width: 300, visible: true },
      { key: "parentCode", label: "Subdocument types", width: 220, visible: true },
      { key: "description", label: "Description", width: 440, visible: true },
      { key: "status", label: "Status", width: 180, visible: true },
    ];
  }
  if (section === "Unit") {
    return [
      { key: "code", label: "Short code", width: 190, visible: true },
      { key: "fullName", label: "Name", width: 300, visible: true },
      { key: "description", label: "UNECE code", width: 200, visible: true },
    ];
  }
  return [
    { key: "code", label: "Code", width: 180, visible: true },
    { key: "fullName", label: "Full name", width: 320, visible: true },
    { key: "description", label: "Description", width: 420, visible: true },
    { key: "status", label: "Status", width: 180, visible: true },
  ];
};

const DOCUMENT_SUBTYPE_COLUMNS: ColConfig[] = [
  { key: "code", label: "Code", width: 220, visible: true },
  { key: "fullName", label: "Name", width: 320, visible: true },
  { key: "description", label: "Description", width: 520, visible: true },
  { key: "status", label: "Status", width: 180, visible: true },
];

const storageKey = (section: OrganizationReferenceSection) =>
  `finansu-harmonija:organization-reference:${section}`;

const DOCUMENT_TYPE_SCHEMA_VERSION = "3";
const DOCUMENT_TYPE_SCHEMA_VERSION_KEY =
  "finansu-harmonija:organization-reference:Document type:schema-version";
const LEGACY_DOCUMENT_TYPE_CODES = new Set([
  "INVOICE",
  "SF",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "ADVANCE_INVOICE",
  "RECEIPT",
  "CONTRACT",
  "AGREEMENT",
  "ADVANCE_AGREEMENT",
  "LEASE_AGREEMENT",
  "OTHER",
]);

const valueForRecord = (
  section: OrganizationReferenceSection,
  record: OrganizationReferenceRecord,
) =>
  section === "Tax country" ||
  section === "Company status" ||
  section === "Document Status"
    ? record.fullName
    : record.code;

export function loadOrganizationReferenceRecords(
  section: OrganizationReferenceSection,
) {
  if (typeof window === "undefined") return DEFAULT_RECORDS[section];
  try {
    const storedValue = window.localStorage.getItem(storageKey(section));
    if (storedValue === null) {
      if (section === "Document type") {
        window.localStorage.setItem(
          DOCUMENT_TYPE_SCHEMA_VERSION_KEY,
          DOCUMENT_TYPE_SCHEMA_VERSION,
        );
      }
      return DEFAULT_RECORDS[section];
    }
    const stored = JSON.parse(
      storedValue,
    ) as Array<string | Partial<OrganizationReferenceRecord>>;
    if (!Array.isArray(stored)) return DEFAULT_RECORDS[section];
    if (stored.length === 0) return [];
    const normalized = stored.map((item) => {
      if (typeof item !== "string") {
        return {
          code: String(item.code ?? item.fullName ?? "").trim(),
          fullName: String(item.fullName ?? item.code ?? "").trim(),
          description: String(item.description ?? "").trim(),
          country: String(item.country ?? "").trim(),
          status: String(item.status ?? "Active").trim(),
          parentCode: String(item.parentCode ?? "").trim(),
        };
      }
      const matchedDefault = DEFAULT_RECORDS[section].find(
        (record) =>
          valueForRecord(section, record).toLocaleLowerCase() ===
            item.toLocaleLowerCase() ||
          record.code.toLocaleLowerCase() === item.toLocaleLowerCase() ||
          record.fullName.toLocaleLowerCase() === item.toLocaleLowerCase(),
      );
      return (
        matchedDefault ?? {
          code: item,
          fullName: item,
          description: "",
          country: "",
          status: "Active",
          parentCode: "",
        }
      );
    });
    if (section !== "Document type") return normalized;
    if (
      window.localStorage.getItem(DOCUMENT_TYPE_SCHEMA_VERSION_KEY) ===
      DOCUMENT_TYPE_SCHEMA_VERSION
    ) {
      return normalized;
    }
    const customRecords = normalized
      .filter((record) => !LEGACY_DOCUMENT_TYPE_CODES.has(record.code))
      .map((record) => ({
        ...record,
        parentCode:
          record.parentCode === "INVOICE"
            ? "INVOICES"
            : record.parentCode === "CONTRACT"
              ? "CONTRACTS"
              : record.parentCode === "OTHER"
                ? "OTHER_DOCUMENTS"
                : record.parentCode,
      }));
    const defaultCodes = new Set(
      DEFAULT_RECORDS[section].map((record) => record.code),
    );
    const migrated = [
      ...DEFAULT_RECORDS[section],
      ...customRecords.filter((record) => !defaultCodes.has(record.code)),
    ];
    window.localStorage.setItem(storageKey(section), JSON.stringify(migrated));
    window.localStorage.setItem(
      DOCUMENT_TYPE_SCHEMA_VERSION_KEY,
      DOCUMENT_TYPE_SCHEMA_VERSION,
    );
    return migrated;
  } catch {
    return DEFAULT_RECORDS[section];
  }
}

export function loadOrganizationReferenceValues(
  section: OrganizationReferenceSection,
) {
  return loadOrganizationReferenceRecords(section)
    .filter((record) => record.status.toLocaleLowerCase() === "active")
    .map((record) => valueForRecord(section, record));
}

export function addOrganizationReferenceValue(
  section: OrganizationReferenceSection,
  value: string,
) {
  const normalized = value.trim();
  if (!normalized || typeof window === "undefined") return;
  const current = loadOrganizationReferenceRecords(section);
  const next = current.some(
    (item) =>
      valueForRecord(section, item).toLocaleLowerCase() ===
      normalized.toLocaleLowerCase(),
  )
    ? current
    : [
        ...current,
        {
          code: normalized,
          fullName: normalized,
          description: "",
          country: "",
          status: "Active",
          parentCode: "",
        },
      ];
  window.localStorage.setItem(storageKey(section), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("organization-reference-updated"));
}

function CheckBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={12} className="text-white" />}
    </button>
  );
}

export default function OrganizationReferenceValuesView({
  section,
}: {
  section: OrganizationReferenceSection;
}) {
  const [records, setRecords] = useState<OrganizationReferenceRecord[]>(() =>
    loadOrganizationReferenceRecords(section),
  );
  const [search, setSearch] = useState("");
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>(
    {},
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<OrganizationReferenceRecord>({
    code: "",
    fullName: "",
    description: "",
    country: "",
    status: "Active",
    parentCode: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDocumentTypeCode, setSelectedDocumentTypeCode] = useState<
    string | null
  >(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [subtypeEditingIndex, setSubtypeEditingIndex] = useState<number | null>(null);
  const [subtypeStatusOpen, setSubtypeStatusOpen] = useState(false);
  const [subtypeDraft, setSubtypeDraft] = useState<OrganizationReferenceRecord>({
    code: "",
    fullName: "",
    description: "",
    country: "",
    status: "Active",
    parentCode: "",
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [showSubtypeColumns, setShowSubtypeColumns] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(() =>
    columnsForSection(section),
  );
  const [subtypeColumns, setSubtypeColumns] = useState<ColConfig[]>(
    DOCUMENT_SUBTYPE_COLUMNS,
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const { startResize: startSubtypeResize } = useColumnResize(
    subtypeColumns,
    setSubtypeColumns,
  );
  const { sortedRows, directionFor, changeSort } = useMultiColumnSort(
    records.map((record, index) => ({ record, index })),
    (row, key) => row.record[key as keyof OrganizationReferenceRecord] ?? "",
  );
  const subtypeSorter = useMultiColumnSort(
    records
      .map((record, index) => ({ record, index }))
      .filter(
        ({ record }) => record.parentCode === selectedDocumentTypeCode,
      ),
    (row, key) => row.record[key as keyof OrganizationReferenceRecord] ?? "",
  );

  const subtypeFilterColumns = useMemo(
    () =>
      DOCUMENT_SUBTYPE_COLUMNS.map((column) => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(
            records
              .filter(
                (record) => record.parentCode === selectedDocumentTypeCode,
              )
              .map((record) =>
                String(
                  record[column.key as keyof OrganizationReferenceRecord] ??
                    "",
                ),
              )
              .filter(Boolean),
          ),
        ).sort((left, right) => left.localeCompare(right)),
      })),
    [records, selectedDocumentTypeCode],
  );

  const visibleSubtypeRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return subtypeSorter.sortedRows.filter(({ record }) => {
      const matchesSearch = [
        record.code,
        record.fullName,
        record.description,
        record.status,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
      return (
        matchesSearch &&
        activeFilterKeys.every((key) => {
          const values = filterValues[key] ?? [];
          return (
            values.length === 0 ||
            values.includes(
              String(
                record[key as keyof OrganizationReferenceRecord] ?? "",
              ),
            )
          );
        })
      );
    });
  }, [
    activeFilterKeys,
    filterValues,
    search,
    subtypeSorter.sortedRows,
  ]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchesFilters = ({ record }: { record: OrganizationReferenceRecord }) => {
      const matchesSearch = [
        record.code,
        record.fullName,
        record.description,
        record.country,
        record.status,
        record.parentCode,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
      if (!matchesSearch) return false;
      return activeFilterKeys.every((key) => {
        const selectedValues = filterValues[key] ?? [];
        return (
          selectedValues.length === 0 ||
          selectedValues.includes(
            String(record[key as keyof OrganizationReferenceRecord] ?? ""),
          )
        );
      });
    };
    const filtered = sortedRows.filter(matchesFilters);
    if (section !== "Document type") return filtered;
    const parents = sortedRows.filter(({ record }) => !record.parentCode);
    if (!query && activeFilterKeys.length === 0) return parents;
    return parents.filter((parent) => {
      const family = [
        parent,
        ...sortedRows.filter(
          ({ record }) => record.parentCode === parent.record.code,
        ),
      ];
      return family.some(matchesFilters);
    });
  }, [activeFilterKeys, filterValues, search, section, sortedRows]);

  const recordsPerPage = 4;
  const paginationItemCount =
    section === "Document type" && selectedDocumentTypeCode
      ? visibleSubtypeRecords.length
      : visibleRecords.length;
  const totalPages = viewAll
    ? 1
    : Math.max(1, Math.ceil(paginationItemCount / recordsPerPage));
  const displayedRecords = viewAll
    ? visibleRecords
    : visibleRecords.slice(
        (currentPage - 1) * recordsPerPage,
        currentPage * recordsPerPage,
      );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeFilterKeys, filterValues, section]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const filterColumns = useMemo(
    () =>
      columnsForSection(section).map((column) => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(
            records
              .map((record) =>
                String(
                  record[column.key as keyof OrganizationReferenceRecord] ?? "",
                ),
              )
              .filter(Boolean),
          ),
        ).sort((left, right) => left.localeCompare(right)),
      })),
    [records, section],
  );

  useEffect(() => {
    setRecords(loadOrganizationReferenceRecords(section));
    setColumns(columnsForSection(section));
    setSubtypeColumns(DOCUMENT_SUBTYPE_COLUMNS);
    setSelectedDocumentTypeCode(null);
    setEditingIndex(null);
    setCreateOpen(false);
    setActiveFilterKeys([]);
    setFilterValues({});
    setSubtypeEditingIndex(null);
    setCurrentPage(1);
    setViewAll(false);
  }, [section]);

  useEffect(() => {
    const refreshRecords = () => {
      setRecords(loadOrganizationReferenceRecords(section));
    };
    const refreshStoredRecords = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey(section)) refreshRecords();
    };

    window.addEventListener("organization-reference-updated", refreshRecords);
    window.addEventListener("storage", refreshStoredRecords);
    return () => {
      window.removeEventListener(
        "organization-reference-updated",
        refreshRecords,
      );
      window.removeEventListener("storage", refreshStoredRecords);
    };
  }, [section]);

  const persist = (nextRecords: OrganizationReferenceRecord[]) => {
    setRecords(nextRecords);
    window.localStorage.setItem(
      storageKey(section),
      JSON.stringify(nextRecords),
    );
    window.dispatchEvent(new CustomEvent("organization-reference-updated"));
  };

  const startCreate = () => {
    setEditingIndex(-1);
    setDraft({
      code: "",
      fullName: "",
      description: "",
      country: "",
      status: "Active",
      parentCode: "",
    });
    setCreateOpen(true);
    setStatusOpen(false);
    setSubtypeEditingIndex(null);
    setSubtypeStatusOpen(false);
  };

  const startEdit = (index: number, record: OrganizationReferenceRecord) => {
    setEditingIndex(index);
    setDraft({ ...record });
    setCreateOpen(true);
    setStatusOpen(false);
    setSubtypeEditingIndex(null);
    setSubtypeStatusOpen(false);
  };

  const openDocumentType = (code: string) => {
    setSelectedDocumentTypeCode(code);
    setSearch("");
    setActiveFilterKeys([]);
    setFilterValues({});
    setSelected(new Set());
    setCurrentPage(1);
    setViewAll(false);
  };

  const activeParentCode =
    section === "Document type"
      ? selectedDocumentTypeCode ||
        (editingIndex !== null && editingIndex >= 0
          ? records[editingIndex]?.code ?? ""
          : "")
      : "";
  const startCreateSubtype = () => {
    if (!activeParentCode) return;
    setSubtypeEditingIndex(-1);
    setSubtypeStatusOpen(false);
    setSubtypeDraft({
      code: "",
      fullName: "",
      description: "",
      country: "",
      status: "Active",
      parentCode: activeParentCode,
    });
  };

  const startEditSubtype = (
    index: number,
    record: OrganizationReferenceRecord,
  ) => {
    setSubtypeEditingIndex(index);
    setSubtypeStatusOpen(false);
    setSubtypeDraft({ ...record });
  };

  const saveSubtype = () => {
    const nextSubtype = {
      ...subtypeDraft,
      code: subtypeDraft.code.trim(),
      fullName: subtypeDraft.fullName.trim(),
      description: subtypeDraft.description.trim(),
      country: "",
      status: subtypeDraft.status || "Active",
      parentCode: activeParentCode,
    };
    if (!nextSubtype.code || !nextSubtype.fullName || !activeParentCode) return;
    if (subtypeEditingIndex === -1) {
      if (
        records.some(
          (record) =>
            record.code.toLocaleLowerCase() ===
            nextSubtype.code.toLocaleLowerCase(),
        )
      )
        return;
      persist([...records, nextSubtype]);
    } else if (subtypeEditingIndex !== null) {
      persist(
        records.map((record, index) =>
          index === subtypeEditingIndex ? nextSubtype : record,
        ),
      );
    }
    setSubtypeEditingIndex(null);
    setSubtypeStatusOpen(false);
  };

  const saveDraft = () => {
    const nextRecord = {
      code: draft.code.trim(),
      fullName:
        section === "Company status"
          ? draft.code.trim()
          : draft.fullName.trim(),
      description: draft.description.trim(),
      country: draft.country.trim(),
      status: draft.status.trim() || "Active",
      parentCode:
        section === "Document type" ? draft.parentCode.trim() : "",
    };
    if (!nextRecord.code || !nextRecord.fullName) return;
    if (editingIndex === -1) {
      if (
        !records.some(
          (record) =>
            valueForRecord(section, record).toLocaleLowerCase() ===
            valueForRecord(section, nextRecord).toLocaleLowerCase(),
        )
      ) {
        persist([...records, nextRecord]);
      }
    } else if (editingIndex !== null) {
      const previousCode = records[editingIndex]?.code ?? nextRecord.code;
      persist(
        records.map((record, index) => {
          if (index === editingIndex) return nextRecord;
          if (
            section === "Document type" &&
            record.parentCode === previousCode
          ) {
            return { ...record, parentCode: nextRecord.code };
          }
          return record;
        }),
      );
    }
    setEditingIndex(null);
    setCreateOpen(false);
    setDraft({
      code: "",
      fullName: "",
      description: "",
      country: "",
      status: "Active",
      parentCode: "",
    });
  };

  const deleteIndexes = (indexes: Set<number>) => {
    const deletedCodes = new Set(
      records
        .filter((_, index) => indexes.has(index))
        .map((record) => record.code),
    );
    persist(
      records.filter(
        (record, index) =>
          !indexes.has(index) && !deletedCodes.has(record.parentCode),
      ),
    );
    setSelected(new Set());
  };

  const allVisibleSelected =
    displayedRecords.length > 0 &&
    displayedRecords.every(({ index }) => selected.has(index));
  const visibleColumns = columns.filter((column) => column.visible);
  const tableWidth =
    42 + visibleColumns.reduce((sum, column) => sum + column.width, 0) + 72;

  if (section === "Document type" && selectedDocumentTypeCode) {
    const selectedDocumentType = records.find(
      (record) => record.code === selectedDocumentTypeCode,
    );
    if (selectedDocumentType) {
      const detailColumns = subtypeColumns.filter((column) => column.visible);
      const detailTableWidth =
        42 +
        detailColumns.reduce((sum, column) => sum + column.width, 0) +
        72;
      const subtypeTotalPages = viewAll
        ? 1
        : Math.max(1, Math.ceil(visibleSubtypeRecords.length / recordsPerPage));
      const displayedSubtypes = viewAll
        ? visibleSubtypeRecords
        : visibleSubtypeRecords.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage,
          );
      const allSubtypesSelected =
        displayedSubtypes.length > 0 &&
        displayedSubtypes.every(({ index }) => selected.has(index));

      return (
        <main
          className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white py-14"
          style={{
            paddingLeft: "clamp(24px, 5vw, 72px)",
            paddingRight: "clamp(24px, 5vw, 72px)",
          }}
        >
          <PageHeader
            title={selectedDocumentType.fullName}
            leading={
              <HeaderBackButton
                label="Back to document types"
                onClick={() => {
                  setSelectedDocumentTypeCode(null);
                  setSearch("");
                  setActiveFilterKeys([]);
                  setFilterValues({});
                  setSelected(new Set());
                  setCurrentPage(1);
                  setViewAll(false);
                }}
              />
            }
            actions={
              <PageActionButton onClick={startCreateSubtype}>
                Create new
              </PageActionButton>
            }
          />
          <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
            <span>Settings</span>
            <span>/</span>
            <span>Organizations</span>
            <span>/</span>
            <button
              type="button"
              onClick={() => setSelectedDocumentTypeCode(null)}
              className="hover:text-[#007EA7]"
            >
              Document type
            </button>
            <span>/</span>
            <span className="text-[#A1B6C6]">
              {selectedDocumentType.fullName}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              data-native-system-filters="true"
            >
              <OcrSearchField
                ariaLabel={`Search ${selectedDocumentType.fullName} subdocument types`}
                value={search}
                onChange={setSearch}
                className="!w-[260px] !min-w-[260px] !max-w-[260px] !flex-none"
              />
              <SystemAddFilters
                persistenceKey={`finansu-harmonija:v12:filters:document-subtypes:${selectedDocumentType.code}`}
                columns={subtypeFilterColumns}
                activeKeys={activeFilterKeys}
                values={filterValues}
                onActiveKeysChange={setActiveFilterKeys}
                onValuesChange={setFilterValues}
              />
            </div>
            <div className="flex items-center gap-4">
              <BulkDeleteButton
                selectedCount={selected.size}
                onDelete={() => deleteIndexes(selected)}
              />
              <ColumnSettingsButton
                onClick={() => setShowSubtypeColumns(true)}
              />
              <RefreshAllButton
                onRefresh={() => setRecords((current) => [...current])}
              />
            </div>
          </div>

          <div
            ref={tableScrollRef}
            className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
          >
            <div style={{ minWidth: detailTableWidth }}>
              <div className="mb-3 flex h-6 items-center">
                <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 px-3">
                  <CheckBox
                    checked={allSubtypesSelected}
                    label="Select all subdocument types"
                    onChange={() =>
                      setSelected(
                        allSubtypesSelected
                          ? new Set()
                          : new Set(displayedSubtypes.map(({ index }) => index)),
                      )
                    }
                  />
                </div>
                {detailColumns.map((column) => {
                  const realIndex = subtypeColumns.findIndex(
                    (item) => item.key === column.key,
                  );
                  return (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="relative flex flex-shrink-0 items-center gap-1 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A]"
                    >
                      {column.label}
                      <ColumnSortButton
                        columnLabel={column.label}
                        direction={subtypeSorter.directionFor(column.key)}
                        onDirectionChange={(direction) =>
                          subtypeSorter.changeSort(column.key, direction)
                        }
                      />
                      <ResizeHandle
                        onMouseDown={(event) =>
                          startSubtypeResize(realIndex, event)
                        }
                      />
                    </div>
                  );
                })}
                <div className="h-6 w-[72px] flex-shrink-0" />
              </div>

              <div className="flex flex-col gap-0.5">
                {displayedSubtypes.map(({ record, index }, rowIndex) => (
                  <div
                    key={`${record.code}-${index}`}
                    className={`group flex h-10 items-center rounded-lg ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                  >
                    <div className="flex w-[42px] flex-shrink-0 px-3">
                      <CheckBox
                        checked={selected.has(index)}
                        label={`Select ${record.fullName}`}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                      />
                    </div>
                    {detailColumns.map((column) => (
                      <div
                        key={column.key}
                        style={{ width: column.width }}
                        className="flex-shrink-0 overflow-hidden px-3"
                      >
                        <span className="block truncate font-montserrat text-[12px] font-normal text-[#10233A]">
                          {record[
                            column.key as keyof OrganizationReferenceRecord
                          ] || "—"}
                        </span>
                      </div>
                    ))}
                    <div
                      className={`flex h-10 w-[72px] flex-shrink-0 items-center justify-end gap-3 px-2 group-hover:bg-[#E7F4F9] ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
                    >
                      <button
                        type="button"
                        aria-label={`Edit ${record.fullName}`}
                        onClick={() => startEditSubtype(index, record)}
                        className="text-[#7288A3] hover:text-[#007EA7]"
                      >
                        <Pencil size={16} />
                      </button>
                      <RowDeleteButton
                        variant="plain"
                        label={`Delete ${record.fullName}`}
                        onDelete={() => deleteIndexes(new Set([index]))}
                      />
                    </div>
                  </div>
                ))}
                {visibleSubtypeRecords.length === 0 && (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                    <FileText size={30} />
                    <span className="font-montserrat text-[14px] font-semibold">
                      No subdocument types
                    </span>
                    <PageActionButton onClick={startCreateSubtype}>
                      Create new
                    </PageActionButton>
                  </div>
                )}
              </div>
            </div>
          </div>

          <HorizontalTableScrollbar scrollRef={tableScrollRef} />
          <TablePagination
            currentPage={viewAll ? 1 : currentPage}
            totalPages={subtypeTotalPages}
            itemCount={visibleSubtypeRecords.length}
            itemsPerPage={
              viewAll ? Math.max(1, visibleSubtypeRecords.length) : recordsPerPage
            }
            onPageChange={setCurrentPage}
            onShowMore={() => {
              setViewAll((current) => !current);
              setCurrentPage(1);
            }}
            showMoreLabel={viewAll ? "Default" : "Show more"}
            allItemsVisible={viewAll}
          />

          {showSubtypeColumns && (
            <ColumnSettingsPanel
              columns={subtypeColumns}
              defaultColumns={DOCUMENT_SUBTYPE_COLUMNS}
              onSave={(next) => {
                setSubtypeColumns(next);
                setShowSubtypeColumns(false);
              }}
              onClose={() => setShowSubtypeColumns(false)}
            />
          )}

          {subtypeEditingIndex !== null && (
            <SubtypeEditorPanel
              draft={subtypeDraft}
              statusOpen={subtypeStatusOpen}
              isNew={subtypeEditingIndex === -1}
              onChange={setSubtypeDraft}
              onToggleStatus={() =>
                setSubtypeStatusOpen((current) => !current)
              }
              onClose={() => {
                setSubtypeEditingIndex(null);
                setSubtypeStatusOpen(false);
              }}
              onSave={saveSubtype}
            />
          )}
        </main>
      );
    }
  }

  return (
    <main
      className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white py-14"
      style={{
        paddingLeft: "clamp(24px, 5vw, 72px)",
        paddingRight: "clamp(24px, 5vw, 72px)",
      }}
    >
      <PageHeader
        title={section}
        actions={
          records.length > 0 ? (
            <PageActionButton onClick={startCreate}>
              Create new
            </PageActionButton>
          ) : undefined
        }
      />
      <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
        <span>Settings</span>
        <span>/</span>
        <span>Organizations</span>
        <span>/</span>
        <span className="text-[#A1B6C6]">{section}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField
            ariaLabel={`Search ${section}`}
            value={search}
            onChange={setSearch}
            className="!w-[260px] !min-w-[260px] !max-w-[260px] !flex-none"
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v7:filters:organization-reference:${section}`}
            columns={filterColumns}
            activeKeys={activeFilterKeys}
            values={filterValues}
            onActiveKeysChange={setActiveFilterKeys}
            onValuesChange={setFilterValues}
          />
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selected.size}
            onDelete={() => deleteIndexes(selected)}
          />
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton
            onRefresh={() => setRecords((current) => [...current])}
          />
        </div>
      </div>

      <div
        ref={tableScrollRef}
        className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
      >
        <div style={{ minWidth: tableWidth }}>
          <div className="mb-3 flex h-6 items-center">
            <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 px-3">
              <CheckBox
                checked={allVisibleSelected}
                label="Select all records"
                onChange={() =>
                  setSelected(
                    allVisibleSelected
                      ? new Set()
                      : new Set(displayedRecords.map(({ index }) => index)),
                  )
                }
              />
            </div>
            {visibleColumns.map((column) => {
              const realIndex = columns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className="relative flex flex-shrink-0 items-center gap-1 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A]"
                >
                  {column.label}
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={directionFor(column.key)}
                    onDirectionChange={(direction) =>
                      changeSort(column.key, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) => startResize(realIndex, event)}
                  />
                </div>
              );
            })}
            <div className="h-6 w-[72px] flex-shrink-0 bg-white" />
          </div>

          <div className="flex flex-col gap-0.5">
            {displayedRecords.map(({ record, index }, rowIndex) => (
              <div
                key={`${record.code}-${index}`}
                role={section === "Document type" ? "button" : undefined}
                tabIndex={section === "Document type" ? 0 : undefined}
                onClick={() => {
                  if (section === "Document type") openDocumentType(record.code);
                }}
                onKeyDown={(event) => {
                  if (
                    section === "Document type" &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    openDocumentType(record.code);
                  }
                }}
                className={`group flex h-10 items-center rounded-lg ${section === "Document type" ? "cursor-pointer" : ""} ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
              >
                <div className="flex w-[42px] flex-shrink-0 px-3">
                  <CheckBox
                    checked={selected.has(index)}
                    label={`Select ${valueForRecord(section, record)}`}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
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
                    {section === "Document type" && column.key === "fullName" ? (
                      <button
                        type="button"
                        aria-label={`Open ${record.fullName} document type`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openDocumentType(record.code);
                        }}
                        className="group block max-w-full appearance-none overflow-hidden border-0 bg-transparent p-0 text-left focus:outline-none"
                      >
                        <span className="block truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] group-hover:underline group-focus:underline">
                          {record.fullName || "—"}
                        </span>
                      </button>
                    ) : section === "Document type" && column.key === "parentCode" ? (
                      <span className="block truncate font-montserrat text-[12px] font-normal text-[#10233A]">
                        {
                          records.filter(
                            (item) => item.parentCode === record.code,
                          ).length
                        }
                      </span>
                    ) : (
                      <span className="block truncate font-montserrat text-[12px] font-normal text-[#10233A]">
                        {record[
                          column.key as keyof OrganizationReferenceRecord
                        ] || "—"}
                      </span>
                    )}
                  </div>
                ))}
                <div
                  onClick={(event) => event.stopPropagation()}
                  className={`flex h-10 w-[72px] flex-shrink-0 items-center justify-end gap-3 px-2 group-hover:bg-[#E7F4F9] ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
                >
                  <button
                    type="button"
                    aria-label={`Edit ${valueForRecord(section, record)}`}
                    onClick={() => startEdit(index, record)}
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
                  >
                    <Pencil size={16} />
                  </button>
                  <RowDeleteButton
                    variant="plain"
                    label={`Delete ${valueForRecord(section, record)}`}
                    onDelete={() => deleteIndexes(new Set([index]))}
                  />
                </div>
              </div>
            ))}
            {visibleRecords.length === 0 && editingIndex === null && (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileText size={30} />
                <span className="font-montserrat text-[14px] font-semibold">
                  No records
                </span>
                <PageActionButton onClick={startCreate}>
                  Create new
                </PageActionButton>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <div>
        <TablePagination
          currentPage={viewAll ? 1 : currentPage}
          totalPages={totalPages}
          itemCount={visibleRecords.length}
          itemsPerPage={viewAll ? Math.max(1, visibleRecords.length) : recordsPerPage}
          onPageChange={setCurrentPage}
          onShowMore={() => {
            setViewAll((current) => !current);
            setCurrentPage(1);
          }}
          showMoreLabel={viewAll ? "Default" : "Show more"}
          allItemsVisible={viewAll}
        />
      </div>

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={columnsForSection(section)}
          onSave={(next) => {
            setColumns(next);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-[130] flex justify-end bg-[#10233A]/10"
          onMouseDown={() => {
            setCreateOpen(false);
            setEditingIndex(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={
              editingIndex === -1 ? `Create new ${section}` : `Edit ${section}`
            }
            className="flex h-full w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                {editingIndex === -1
                  ? `Create new ${section.toLocaleLowerCase()}`
                  : `Edit ${section.toLocaleLowerCase()}`}
              </h2>
              <button
                type="button"
                aria-label="Close create form"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingIndex(null);
                }}
                className="text-[#7288A3] hover:text-[#10233A]"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-5">
              {columnsForSection(section)
                .filter(
                  (column) =>
                    section !== "Document type" || column.key !== "parentCode",
                )
                .map((column) => {
                const key = column.key as keyof OrganizationReferenceRecord;
                return (
                  <label
                    key={column.key}
                    className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]"
                  >
                    <span>{column.label}</span>
                    {key === "status" ? (
                      <span className="relative">
                        <button
                          type="button"
                          aria-label={column.label}
                          aria-haspopup="listbox"
                          aria-expanded={statusOpen}
                          onClick={() => setStatusOpen((current) => !current)}
                          className="flex h-[42px] w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                        >
                          <span>{draft.status}</span>
                          <ChevronDown size={16} className="text-[#7288A3]" />
                        </button>
                        {statusOpen && (
                          <span
                            role="listbox"
                            aria-label="Status options"
                            className="absolute left-0 top-[46px] z-10 block w-full rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
                          >
                            {["Active", "Inactive"].map((status) => (
                              <button
                                key={status}
                                type="button"
                                role="option"
                                aria-selected={draft.status === status}
                                onClick={() => {
                                  setDraft({ ...draft, status });
                                  setStatusOpen(false);
                                }}
                                className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left font-montserrat text-[13px] font-medium text-[#10233A] ${draft.status === status ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                              >
                                <span
                                  className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${draft.status === status ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                                >
                                  {draft.status === status && (
                                    <Check
                                      size={12}
                                      strokeWidth={3}
                                      className="text-white"
                                    />
                                  )}
                                </span>
                                {status}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                    ) : (
                      <input
                        autoFocus={column.key === "code"}
                        aria-label={column.label}
                        value={draft[key]}
                        onChange={(event) =>
                          setDraft({ ...draft, [key]: event.target.value })
                        }
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    )}
                  </label>
                );
              })}
            </div>

            <div className="mt-auto flex justify-end gap-2 pt-8">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingIndex(null);
                }}
                className="h-[42px] rounded-lg border-2 border-[#D3E1EC] px-5 font-montserrat text-[14px] font-semibold text-[#7288A3]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !draft.code.trim() ||
                  (section !== "Company status" && !draft.fullName.trim())
                }
                onClick={saveDraft}
                className="h-[42px] rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {editingIndex === -1 ? "Create" : "Save"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function SubtypeEditorPanel({
  draft,
  statusOpen,
  isNew,
  onChange,
  onToggleStatus,
  onClose,
  onSave,
}: {
  draft: OrganizationReferenceRecord;
  statusOpen: boolean;
  isNew: boolean;
  onChange: (draft: OrganizationReferenceRecord) => void;
  onToggleStatus: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[150] flex justify-end bg-[#10233A]/10"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Create new subdocument type" : "Edit subdocument type"}
        className="flex h-full w-[420px] max-w-[calc(100vw-24px)] flex-col bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
              {isNew ? "Create new subdocument type" : "Edit subdocument type"}
            </h2>
            <p className="mt-1 font-montserrat text-[12px] font-medium text-[#7288A3]">
              This entry belongs to the opened document type.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close subdocument type form"
            onClick={onClose}
            className="text-[#7288A3] hover:text-[#10233A]"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          {[
            { key: "code", label: "Code" },
            { key: "fullName", label: "Name" },
            { key: "description", label: "Description" },
          ].map((field) => (
            <label
              key={field.key}
              className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]"
            >
              <span>{field.label}</span>
              <input
                autoFocus={field.key === "code"}
                aria-label={field.label}
                value={
                  draft[field.key as keyof OrganizationReferenceRecord]
                }
                onChange={(event) =>
                  onChange({ ...draft, [field.key]: event.target.value })
                }
                className="h-[42px] rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
              />
            </label>
          ))}

          <label className="relative flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            <span>Status</span>
            <button
              type="button"
              aria-label="Status"
              aria-haspopup="listbox"
              aria-expanded={statusOpen}
              onClick={onToggleStatus}
              className="flex h-[42px] w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
            >
              <span>{draft.status}</span>
              <ChevronDown size={16} className="text-[#7288A3]" />
            </button>
            {statusOpen && (
              <span
                role="listbox"
                aria-label="Status options"
                className="absolute left-0 top-[66px] z-20 block w-full rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
              >
                {["Active", "Inactive"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="option"
                    aria-selected={draft.status === status}
                    onClick={() => {
                      onChange({ ...draft, status });
                      onToggleStatus();
                    }}
                    className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left font-montserrat text-[13px] font-medium text-[#10233A] ${draft.status === status ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${draft.status === status ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {draft.status === status && (
                        <Check size={12} className="text-white" />
                      )}
                    </span>
                    {status}
                  </button>
                ))}
              </span>
            )}
          </label>
        </div>

        <div className="mt-auto flex justify-end gap-2 pt-8">
          <button
            type="button"
            onClick={onClose}
            className="h-[42px] rounded-lg border-2 border-[#D3E1EC] px-5 font-montserrat text-[14px] font-semibold text-[#7288A3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draft.code.trim() || !draft.fullName.trim()}
            onClick={onSave}
            className="h-[42px] rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {isNew ? "Create" : "Save"}
          </button>
        </div>
      </aside>
    </div>
  );
}
