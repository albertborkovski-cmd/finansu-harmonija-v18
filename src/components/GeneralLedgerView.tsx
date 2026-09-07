import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FileUp,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import RefreshAllButton from "./RefreshAllButton";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import TablePagination from "./TablePagination";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import SystemAddFilters from "./SystemAddFilters";
import { HeaderBackButton } from "./SystemNavigation";

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  parentCode?: string;
}

interface LedgerTemplate {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  active: boolean;
  accounts: LedgerAccount[];
}

interface CompanyLedgerCustomization {
  overrides: Record<string, LedgerAccount>;
  additions: LedgerAccount[];
  deletedIds: string[];
}

type CompanyLedgerCustomizations = Record<string, CompanyLedgerCustomization>;

const STORAGE_KEY = "finansu-harmonija:v7:general-ledger-templates";
const HIERARCHY_MIGRATION_KEY =
  "finansu-harmonija:v12:general-ledger-lt-hierarchy-v1";

function applyCompanyLedgerCustomization(
  baseAccounts: LedgerAccount[],
  customization?: CompanyLedgerCustomization,
) {
  if (!customization) return baseAccounts;
  const deletedIds = new Set(customization.deletedIds);
  return [
    ...baseAccounts
      .filter((account) => !deletedIds.has(account.id))
      .map((account) => customization.overrides[account.id] ?? account),
    ...customization.additions,
  ];
}

function buildCompanyLedgerCustomization(
  baseAccounts: LedgerAccount[],
  accounts: LedgerAccount[],
): CompanyLedgerCustomization {
  const baseById = new Map(baseAccounts.map((account) => [account.id, account]));
  const accountIds = new Set(accounts.map((account) => account.id));
  const overrides: Record<string, LedgerAccount> = {};

  accounts.forEach((account) => {
    const baseAccount = baseById.get(account.id);
    if (baseAccount && JSON.stringify(baseAccount) !== JSON.stringify(account)) {
      overrides[account.id] = account;
    }
  });

  return {
    overrides,
    additions: accounts.filter((account) => !baseById.has(account.id)),
    deletedIds: baseAccounts
      .filter((account) => !accountIds.has(account.id))
      .map((account) => account.id),
  };
}

type TemplateColumnKey = "name" | "description" | "accounts" | "updatedAt";
type AccountColumnKey = "code" | "name" | "type" | "active";

const TEMPLATE_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", visible: true, width: 290 },
  { key: "description", label: "Description", visible: true, width: 430 },
  { key: "accounts", label: "Accounts", visible: true, width: 130 },
  { key: "updatedAt", label: "Last update", visible: true, width: 150 },
];

const ACCOUNT_COLUMNS: ColConfig[] = [
  { key: "code", label: "DK klasė", visible: true, width: 170 },
  { key: "name", label: "Pavadinimas", visible: true, width: 360 },
  { key: "type", label: "Account type", visible: true, width: 180 },
  { key: "active", label: "Active", visible: true, width: 120 },
];

const LITHUANIAN_LEDGER_ACCOUNTS: LedgerAccount[] = [
  { id: "gl-lt-1", code: "1", name: "Ilgalaikis turtas", type: "Asset", active: true },
  { id: "gl-lt-11", code: "11", name: "Nematerialusis turtas", type: "Asset", active: true, parentCode: "1" },
  { id: "gl-lt-111", code: "111", name: "Plėtros darbai", type: "Asset", active: true, parentCode: "11" },
  { id: "gl-lt-1110", code: "1110", name: "Plėtros darbų atlikimo savikaina", type: "Asset", active: true, parentCode: "111" },
  { id: "gl-lt-1118", code: "1118", name: "Plėtros darbų vertės amortizacija", type: "Asset", active: true, parentCode: "111" },
  { id: "gl-lt-1119", code: "1119", name: "Plėtros darbų vertės sumažėjimas", type: "Asset", active: true, parentCode: "111" },
  { id: "gl-lt-112", code: "112", name: "Prestižas", type: "Asset", active: true, parentCode: "11" },
  { id: "gl-lt-1120", code: "1120", name: "Prestižo įsigijimo savikaina", type: "Asset", active: true, parentCode: "112" },
  { id: "gl-lt-1128", code: "1128", name: "Prestižo vertės amortizacija", type: "Asset", active: true, parentCode: "112" },
  { id: "gl-lt-2", code: "2", name: "Trumpalaikis turtas", type: "Asset", active: true },
  { id: "gl-lt-3", code: "3", name: "Nuosavas kapitalas", type: "Equity", active: true },
  { id: "gl-lt-4", code: "4", name: "Įsipareigojimai", type: "Liability", active: true },
  { id: "gl-lt-5", code: "5", name: "Pajamos", type: "Income", active: true },
  { id: "gl-lt-6", code: "6", name: "Sąnaudos", type: "Expense", active: true },
];

const INITIAL_TEMPLATES: LedgerTemplate[] = [
  {
    id: "ledger-lt-standard",
    name: "Lithuanian standard chart of accounts",
    description:
      "Standard general ledger structure for Lithuanian organizations",
    updatedAt: "2026-08-12",
    active: true,
    accounts: LITHUANIAN_LEDGER_ACCOUNTS,
  },
];

export function loadGeneralLedgerTemplateNames() {
  if (typeof window === "undefined") {
    return INITIAL_TEMPLATES.filter((template) => template.active).map(
      (template) => template.name,
    );
  }

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    const templates =
      storedValue === null
        ? INITIAL_TEMPLATES
        : (JSON.parse(storedValue) as LedgerTemplate[]);
    return templates
      .filter((template) => template.active)
      .map((template) => template.name);
  } catch {
    return INITIAL_TEMPLATES.filter((template) => template.active).map(
      (template) => template.name,
    );
  }
}

export function loadGeneralLedgerTemplates(): LedgerTemplate[] {
  if (typeof window === "undefined") return INITIAL_TEMPLATES;
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    return storedValue === null
      ? INITIAL_TEMPLATES
      : (JSON.parse(storedValue) as LedgerTemplate[]);
  } catch {
    return INITIAL_TEMPLATES;
  }
}

function loadCompanyGeneralLedgerAccounts(
  companyId: string,
  assignedTemplateName?: string,
) {
  const templates = loadGeneralLedgerTemplates();
  let customizations: CompanyLedgerCustomizations = {};
  if (typeof window !== "undefined" && companyId) {
    try {
      customizations = JSON.parse(
        window.localStorage.getItem(
          `finansu-harmonija:v12:company-general-ledger:${companyId}`,
        ) ?? "{}",
      ) as CompanyLedgerCustomizations;
    } catch {
      customizations = {};
    }
  }

  const customizedTemplateId = Object.keys(customizations).find((templateId) =>
    templates.some((template) => template.id === templateId),
  );
  const template =
    templates.find((item) => item.name === assignedTemplateName) ??
    templates.find((item) => item.id === customizedTemplateId) ??
    templates.find((item) => item.active) ??
    templates[0];
  if (!template) return [];

  return applyCompanyLedgerCustomization(
    template.accounts,
    customizations[template.id],
  ).filter((account) => account.active && account.code.trim());
}

export interface CompanyGeneralLedgerAccountOption {
  code: string;
  name: string;
  type: string;
  parentCode?: string;
  depth: number;
}

export function loadCompanyGeneralLedgerAccountHierarchy(
  companyId: string,
  assignedTemplateName?: string,
): CompanyGeneralLedgerAccountOption[] {
  const accounts = loadCompanyGeneralLedgerAccounts(
    companyId,
    assignedTemplateName,
  );
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const children = new Map<string, LedgerAccount[]>();
  const roots: LedgerAccount[] = [];
  const compareCodes = (left: LedgerAccount, right: LedgerAccount) =>
    left.code.localeCompare(right.code, undefined, { numeric: true });

  accounts.forEach((account) => {
    if (account.parentCode && byCode.has(account.parentCode)) {
      const items = children.get(account.parentCode) ?? [];
      items.push(account);
      children.set(account.parentCode, items);
    } else {
      roots.push(account);
    }
  });
  roots.sort(compareCodes);
  children.forEach((items) => items.sort(compareCodes));

  const result: CompanyGeneralLedgerAccountOption[] = [];
  const visit = (account: LedgerAccount, depth: number) => {
    result.push({
      code: account.code.trim(),
      name: account.name,
      type: account.type,
      parentCode: account.parentCode,
      depth,
    });
    (children.get(account.code) ?? []).forEach((child) =>
      visit(child, depth + 1),
    );
  };
  roots.forEach((account) => visit(account, 0));
  return result;
}

export function loadCompanyGeneralLedgerAccountOptions(
  companyId: string,
  assignedTemplateName?: string,
) {
  return loadCompanyGeneralLedgerAccountHierarchy(
    companyId,
    assignedTemplateName,
  ).map((account) => account.code);
}

export function addCompanyGeneralLedgerAccount(
  companyId: string,
  assignedTemplateName: string | undefined,
  values: { code: string; name: string; parentCode?: string },
) {
  if (typeof window === "undefined" || !companyId) return false;
  const code = values.code.trim();
  const name = values.name.trim();
  if (!code || !name) return false;
  const templates = loadGeneralLedgerTemplates();
  const storageKey = `finansu-harmonija:v12:company-general-ledger:${companyId}`;
  let customizations: CompanyLedgerCustomizations = {};
  try {
    customizations = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "{}",
    ) as CompanyLedgerCustomizations;
  } catch {
    customizations = {};
  }
  const customizedTemplateId = Object.keys(customizations).find((templateId) =>
    templates.some((template) => template.id === templateId),
  );
  const template =
    templates.find((item) => item.name === assignedTemplateName) ??
    templates.find((item) => item.id === customizedTemplateId) ??
    templates.find((item) => item.active) ??
    templates[0];
  if (!template) return false;
  const currentAccounts = applyCompanyLedgerCustomization(
    template.accounts,
    customizations[template.id],
  );
  if (
    currentAccounts.some(
      (account) =>
        account.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase(),
    )
  ) {
    return false;
  }
  const nextAccounts: LedgerAccount[] = [
    ...currentAccounts,
    {
      id: `company-ledger-${companyId}-${crypto.randomUUID()}`,
      code,
      name,
      type: "Detail",
      active: true,
      parentCode: values.parentCode?.trim() || undefined,
    },
  ];
  const nextCustomizations = {
    ...customizations,
    [template.id]: buildCompanyLedgerCustomization(
      template.accounts,
      nextAccounts,
    ),
  };
  window.localStorage.setItem(storageKey, JSON.stringify(nextCustomizations));
  window.dispatchEvent(
    new CustomEvent("company-general-ledger-updated", {
      detail: { companyId },
    }),
  );
  window.dispatchEvent(new CustomEvent("organization-reference-updated"));
  return true;
}

const today = () => new Date().toISOString().slice(0, 10);

function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function importedValue(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeImportHeader));
  const entry = Object.entries(row).find(([key]) =>
    normalizedAliases.has(normalizeImportHeader(key)),
  );
  return entry ? String(entry[1] ?? "").trim() : "";
}

function importedActive(value: string) {
  if (!value) return true;
  return !["false", "no", "0", "inactive", "ne", "neaktyvus"].includes(
    value.toLocaleLowerCase(),
  );
}

function mapImportedAccount(
  row: Record<string, unknown>,
  index: number,
): LedgerAccount | null {
  const code = importedValue(row, [
    "account code",
    "code",
    "gl account",
    "general ledger account",
    "saskaitos kodas",
    "dk saskaita",
    "dk kodas",
  ]);
  const name = importedValue(row, [
    "name",
    "account name",
    "description",
    "pavadinimas",
    "aprasymas",
  ]);
  if (!code || !name) return null;

  return {
    id: `gl-import-${Date.now()}-${index}`,
    code,
    name,
    type:
      importedValue(row, [
        "account type",
        "type",
        "tipas",
        "saskaitos tipas",
      ]) || "Asset",
    active: importedActive(importedValue(row, ["active", "status", "aktyvus"])),
    parentCode:
      importedValue(row, [
        "parent code",
        "parent account",
        "parent",
        "tevine klase",
        "tevinis kodas",
      ]) || undefined,
  };
}

async function readImportedAccounts(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  let sourceRows: Record<string, unknown>[] = [];

  if (extension === "json") {
    const parsed = JSON.parse(await file.text()) as
      Record<string, unknown>[] | { accounts?: Record<string, unknown>[] };
    sourceRows = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return [];
    sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });
  }

  return sourceRows
    .map(mapImportedAccount)
    .filter((account): account is LedgerAccount => account !== null);
}

function SelectionBox({
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
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={13} strokeWidth={2.5} className="text-white" />}
    </button>
  );
}

function LedgerDropdown({
  value,
  options,
  placeholder,
  ariaLabel,
  open,
  onToggle,
  onSelect,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  ariaLabel: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedLabel = options.find((option) => option.value === value)?.label;
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="relative w-full">
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        value={open ? query : selectedLabel ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(event) => { setQuery(""); if (!open) onToggle(); event.currentTarget.select(); }}
        onClick={() => { if (!open) onToggle(); }}
        onChange={(event) => { setQuery(event.target.value); if (!open) onToggle(); }}
        className={`h-[42px] w-full rounded-lg border bg-white px-[14px] pr-10 font-montserrat text-[14px] font-medium text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] ${open ? "border-[#007EA7] ring-2 ring-[#007EA7]/10" : "border-[#D3E1EC] hover:border-[#A1B6C6]"}`}
      />
      <button type="button" tabIndex={-1} aria-label={`Open ${ariaLabel} options`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); onToggle(); }} className="absolute right-0 top-0 flex h-[42px] w-10 items-center justify-center text-[#7288A3]">
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-[#7288A3] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className="absolute left-0 right-0 top-[46px] z-50 max-h-[240px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]"
        >
          {filteredOptions.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || "root"}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { setQuery(""); onSelect(option.value); }}
                className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left font-montserrat text-[13px] font-semibold text-[#10233A] transition-colors ${selected ? "bg-[#E5EDF9]" : "hover:bg-[#F8FDFF]"}`}
              >
                <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>
                  {selected && <Check size={12} strokeWidth={2.5} className="text-white" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GeneralLedgerView({
  assignedTemplateName,
  companyName,
  companyId,
}: {
  assignedTemplateName?: string;
  companyName?: string;
  companyId?: string;
} = {}) {
  const [templates, setTemplates] = usePersistentState<LedgerTemplate[]>(
    STORAGE_KEY,
    INITIAL_TEMPLATES,
  );
  const [companyLedgerCustomizations, setCompanyLedgerCustomizations] =
    usePersistentState<CompanyLedgerCustomizations>(
      companyId
        ? `finansu-harmonija:v12:company-general-ledger:${companyId}`
        : "finansu-harmonija:v12:company-general-ledger:settings-unused",
      {},
    );
  useEffect(() => {
    if (window.localStorage.getItem(HIERARCHY_MIGRATION_KEY) === "done") return;
    setTemplates((current) => {
      const templateIndex = current.findIndex(
        (template) => template.id === "ledger-lt-standard",
      );
      if (templateIndex < 0) return [...current, INITIAL_TEMPLATES[0]];

      const template = current[templateIndex];
      const previousSeedCodes = new Set(["1000", "2000", "4000", "6000"]);
      const containsOnlyPreviousSeed =
        template.accounts.length > 0 &&
        template.accounts.every((account) => previousSeedCodes.has(account.code));
      const existingCodes = new Set(template.accounts.map((account) => account.code));
      const accounts = containsOnlyPreviousSeed
        ? LITHUANIAN_LEDGER_ACCOUNTS
        : [
            ...LITHUANIAN_LEDGER_ACCOUNTS,
            ...template.accounts.filter(
              (account) => !existingCodes.has(account.code) || !LITHUANIAN_LEDGER_ACCOUNTS.some((seed) => seed.code === account.code),
            ),
          ].filter(
            (account, index, list) =>
              list.findIndex((candidate) => candidate.code === account.code) === index,
          );
      const next = [...current];
      next[templateIndex] = {
        ...template,
        accounts,
        updatedAt: today(),
      };
      return next;
    });
    window.localStorage.setItem(HIERARCHY_MIGRATION_KEY, "done");
  }, [setTemplates]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("general-ledger-updated"));
  }, [templates]);
  useEffect(() => {
    if (!companyId) return;
    window.dispatchEvent(
      new CustomEvent("company-general-ledger-updated", {
        detail: { companyId },
      }),
    );
  }, [companyId, companyLedgerCustomizations]);
  const [query, setQuery] = useState("");
  const [templateFilterKeys, setTemplateFilterKeys] = useState<string[]>([]);
  const [templateFilterValues, setTemplateFilterValues] = useState<
    Record<string, string[]>
  >({});
  const [accountFilterKeys, setAccountFilterKeys] = useState<string[]>([]);
  const [accountFilterValues, setAccountFilterValues] = useState<
    Record<string, string[]>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    () =>
      assignedTemplateName
        ? loadGeneralLedgerTemplates().find(
            (template) => template.name === assignedTemplateName,
          )?.id ?? null
        : null,
  );
  const [templateDraft, setTemplateDraft] = useState<LedgerTemplate | null>(
    null,
  );
  const [accountDraft, setAccountDraft] = useState<LedgerAccount | null>(null);
  const [expandedAccountCodes, setExpandedAccountCodes] = useState<Set<string>>(
    () => new Set(["1", "11", "111", "112"]),
  );
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [templateColumns, setTemplateColumns] =
    useState<ColConfig[]>(TEMPLATE_COLUMNS);
  const [accountColumns, setAccountColumns] =
    useState<ColConfig[]>(ACCOUNT_COLUMNS);
  const [showTemplateColumns, setShowTemplateColumns] = useState(false);
  const [showAccountColumns, setShowAccountColumns] = useState(false);
  const templateTableScrollRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { startResize: startTemplateResize } = useColumnResize(
    templateColumns,
    setTemplateColumns,
  );
  const { startResize: startAccountResize } = useColumnResize(
    accountColumns,
    setAccountColumns,
  );

  const baseSelectedTemplate =
    templates.find((item) => item.id === selectedTemplateId) ?? null;
  const selectedTemplate = useMemo(() => {
    if (!baseSelectedTemplate || !companyId) return baseSelectedTemplate;
    return {
      ...baseSelectedTemplate,
      accounts: applyCompanyLedgerCustomization(
        baseSelectedTemplate.accounts,
        companyLedgerCustomizations[baseSelectedTemplate.id],
      ),
    };
  }, [baseSelectedTemplate, companyId, companyLedgerCustomizations]);

  useEffect(() => {
    if (assignedTemplateName === undefined) return;
    setSelectedTemplateId(
      templates.find((template) => template.name === assignedTemplateName)
        ?.id ?? null,
    );
  }, [assignedTemplateName, templates]);
  const visibleTemplates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return templates.filter((item) => {
      if (
        needle &&
        ![item.name, item.description, item.updatedAt].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        )
      )
        return false;
      return templateFilterKeys.every((key) => {
        const selected = templateFilterValues[key] ?? [];
        const value =
          key === "accounts"
            ? String(item.accounts.length)
            : String(item[key as keyof Omit<LedgerTemplate, "accounts">] ?? "");
        return selected.length === 0 || selected.includes(value);
      });
    });
  }, [query, templateFilterKeys, templateFilterValues, templates]);
  const visibleAccounts = useMemo(() => {
    if (!selectedTemplate) return [];
    const needle = query.trim().toLocaleLowerCase();
    return selectedTemplate.accounts.filter((account) => {
      if (
        needle &&
        ![account.code, account.name, account.type].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        )
      )
        return false;
      return accountFilterKeys.every((key) => {
        const selected = accountFilterValues[key] ?? [];
        return (
          selected.length === 0 ||
          selected.includes(String(account[key as keyof LedgerAccount]))
        );
      });
    });
  }, [accountFilterKeys, accountFilterValues, query, selectedTemplate]);
  const visibleTemplateColumns = templateColumns.filter(
    (column) => column.visible,
  );
  const visibleAccountColumns = accountColumns.filter(
    (column) => column.visible,
  );
  const {
    sortedRows: sortedTemplates,
    changeSort: changeTemplateSort,
    directionFor: templateDirectionFor,
  } = useMultiColumnSort<LedgerTemplate, TemplateColumnKey>(
    visibleTemplates,
    (template, key) =>
      key === "accounts" ? template.accounts.length : template[key],
  );
  const {
    sortedRows: accounts,
    changeSort: changeAccountSort,
    directionFor: accountDirectionFor,
  } = useMultiColumnSort<LedgerAccount, AccountColumnKey>(
    visibleAccounts,
    (account, key) =>
      key === "active" ? (account.active ? 1 : 0) : account[key],
  );
  const accountByCode = useMemo(
    () =>
      new Map(
        (selectedTemplate?.accounts ?? []).map((account) => [
          account.code,
          account,
        ]),
      ),
    [selectedTemplate],
  );
  const parentCodes = useMemo(
    () =>
      new Set(
        (selectedTemplate?.accounts ?? [])
          .map((account) => account.parentCode)
          .filter((code): code is string => Boolean(code)),
      ),
    [selectedTemplate],
  );
  const accountDepth = (account: LedgerAccount) => {
    let depth = 0;
    let parentCode = account.parentCode;
    const visited = new Set<string>();
    while (parentCode && !visited.has(parentCode)) {
      visited.add(parentCode);
      depth += 1;
      parentCode = accountByCode.get(parentCode)?.parentCode;
    }
    return depth;
  };
  const treeAccounts = useMemo(() => {
    const availableCodes = new Set(accounts.map((account) => account.code));
    const childrenByParent = new Map<string, LedgerAccount[]>();
    const roots: LedgerAccount[] = [];

    accounts.forEach((account) => {
      if (account.parentCode && availableCodes.has(account.parentCode)) {
        const children = childrenByParent.get(account.parentCode) ?? [];
        children.push(account);
        childrenByParent.set(account.parentCode, children);
      } else {
        roots.push(account);
      }
    });

    const ordered: LedgerAccount[] = [];
    const visited = new Set<string>();
    const appendBranch = (account: LedgerAccount) => {
      if (visited.has(account.id)) return;
      visited.add(account.id);
      ordered.push(account);
      if (!expandedAccountCodes.has(account.code)) return;
      (childrenByParent.get(account.code) ?? []).forEach(appendBranch);
    };

    roots.forEach(appendBranch);
    accounts.forEach((account) => {
      if (!visited.has(account.id)) appendBranch(account);
    });
    return ordered;
  }, [accounts, expandedAccountCodes]);

  useEffect(() => {
    if (parentCodes.size === 0) return;
    setExpandedAccountCodes((current) => {
      const next = new Set(current);
      parentCodes.forEach((code) => next.add(code));
      return next.size === current.size ? current : next;
    });
  }, [parentCodes]);

  const updateSelectedAccounts = (
    updater: (accounts: LedgerAccount[]) => LedgerAccount[],
  ) => {
    if (!selectedTemplate) return;

    if (companyId && baseSelectedTemplate) {
      setCompanyLedgerCustomizations((current) => {
        const currentAccounts = applyCompanyLedgerCustomization(
          baseSelectedTemplate.accounts,
          current[baseSelectedTemplate.id],
        );
        const nextAccounts = updater(currentAccounts);
        return {
          ...current,
          [baseSelectedTemplate.id]: buildCompanyLedgerCustomization(
            baseSelectedTemplate.accounts,
            nextAccounts,
          ),
        };
      });
      return;
    }

    setTemplates((current) =>
      current.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              accounts: updater(template.accounts),
              updatedAt: today(),
            }
          : template,
      ),
    );
  };

  const saveTemplate = (draft: LedgerTemplate) => {
    const next = { ...draft, name: draft.name.trim(), updatedAt: today() };
    if (!next.name) return;
    setTemplates((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next],
    );
    setTemplateDraft(null);
  };

  const saveAccount = (draft: LedgerAccount) => {
    if (!selectedTemplate || !draft.code.trim() || !draft.name.trim()) return;
    if (
      selectedTemplate.accounts.some(
        (account) =>
          account.id !== draft.id &&
          account.code.trim().toLocaleLowerCase() ===
            draft.code.trim().toLocaleLowerCase(),
      )
    )
      return;
    updateSelectedAccounts((accounts) => {
      const previous = accounts.find((item) => item.id === draft.id);
      return previous
        ? accounts.map((item) =>
            item.id === draft.id
              ? draft
              : item.parentCode === previous.code
                ? { ...item, parentCode: draft.code }
                : item,
          )
        : [...accounts, draft];
    });
    if (draft.parentCode) {
      setExpandedAccountCodes((current) =>
        new Set([...current, draft.parentCode as string]),
      );
    }
    setAccountDraft(null);
  };

  const importAccounts = async (file?: File) => {
    if (!file || !selectedTemplate) return;
    try {
      const importedAccounts = await readImportedAccounts(file);
      if (importedAccounts.length === 0) {
        setImportMessage({
          type: "error",
          text: "No general ledger accounts were found in the selected file.",
        });
        return;
      }

      const mergedAccounts = [...selectedTemplate.accounts];
      let addedCount = 0;
      let updatedCount = 0;
      importedAccounts.forEach((importedAccount) => {
        const existingIndex = mergedAccounts.findIndex(
          (account) =>
            account.code.toLocaleUpperCase() ===
            importedAccount.code.toLocaleUpperCase(),
        );
        if (existingIndex >= 0) {
          mergedAccounts[existingIndex] = {
            ...importedAccount,
            id: mergedAccounts[existingIndex].id,
          };
          updatedCount += 1;
        } else {
          mergedAccounts.push(importedAccount);
          addedCount += 1;
        }
      });

      updateSelectedAccounts(() => mergedAccounts);
      setImportMessage({
        type: "success",
        text: `${importedAccounts.length} accounts imported: ${addedCount} added, ${updatedCount} updated.`,
      });
    } catch {
      setImportMessage({
        type: "error",
        text: "The structure could not be imported. Use XLSX, XLS, CSV, JSON or TXT format.",
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  if (assignedTemplateName !== undefined && !selectedTemplate) {
    return (
      <main
        className="flex min-h-full min-w-0 flex-1 flex-col gap-8 bg-white py-14"
        style={{
          paddingLeft: "clamp(24px, 5vw, 72px)",
          paddingRight: "clamp(24px, 5vw, 72px)",
        }}
      >
        <PageHeader title={companyName ?? "GL account"} />
        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
          <span>Companies</span>
          <span className="text-[#A1B6C6]">/</span>
          <span>{companyName}</span>
          <span className="text-[#A1B6C6]">/</span>
          <span>Company/Client information</span>
          <span className="text-[#A1B6C6]">/</span>
          <span className="text-[#A1B6C6]">GL account</span>
        </div>
        <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#D3E1EC] text-[#7288A3]">
          <FileText size={30} />
          <span className="font-montserrat text-[13px] font-semibold">
            No general ledger template assigned
          </span>
          <span className="font-montserrat text-[12px] font-medium">
            Assign an active template in Settings / Organizations.
          </span>
        </div>
      </main>
    );
  }

  if (selectedTemplate) {
    return (
      <main
        className="flex h-screen min-w-0 flex-1 flex-col gap-8 overflow-hidden bg-white py-14"
        style={{
          paddingLeft: "clamp(24px, 5vw, 72px)",
          paddingRight: "clamp(24px, 5vw, 72px)",
        }}
      >
        <PageHeader
          title={companyName ?? selectedTemplate.name}
          leading={assignedTemplateName === undefined ? <HeaderBackButton onClick={() => { setSelectedTemplateId(null); setQuery(""); }} label="Back to General ledger templates" /> : undefined}
          actions={
            <div className="flex items-center gap-2">
              <PageActionButton
                icon={<FileUp size={15} />}
                onClick={() => importInputRef.current?.click()}
              >
                Import structure
              </PageActionButton>
              <PageActionButton
                onClick={() =>
                  setAccountDraft({
                    id: `gl-${Date.now()}`,
                    code: "",
                    name: "",
                    type: "Asset",
                    active: true,
                    parentCode: undefined,
                  })
                }
              >
                Create new
              </PageActionButton>
            </div>
          }
        />
        <input
          ref={importInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv,.json,.txt"
          onChange={(event) => void importAccounts(event.target.files?.[0])}
        />
        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
          {companyName ? (
            <>
              <span>Companies</span>
              <span className="text-[#A1B6C6]">/</span>
              <span>{companyName}</span>
              <span className="text-[#A1B6C6]">/</span>
              <span>Company/Client information</span>
              <span className="text-[#A1B6C6]">/</span>
              <span className="text-[#A1B6C6]">GL account</span>
            </>
          ) : (
            <>
              <span>Settings</span>
              <span className="text-[#A1B6C6]">/</span>
              <span>General ledger</span>
              <span className="text-[#A1B6C6]">/</span>
              <span className="text-[#A1B6C6]">{selectedTemplate.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <OcrSearchField
              value={query}
              onChange={setQuery}
              ariaLabel="Search general ledger accounts"
            />
            <SystemAddFilters
              persistenceKey={`finansu-harmonija:v7:filters:general-ledger:accounts:${selectedTemplate.id}`}
              columns={ACCOUNT_COLUMNS.map((column) => ({
                key: column.key,
                label: column.label,
                options: Array.from(
                  new Set(
                    selectedTemplate.accounts.map((account) =>
                      String(account[column.key as keyof LedgerAccount]),
                    ),
                  ),
                ).sort(),
              }))}
              activeKeys={accountFilterKeys}
              values={accountFilterValues}
              onActiveKeysChange={setAccountFilterKeys}
              onValuesChange={setAccountFilterValues}
            />
          </div>
          <div className="flex items-center gap-4">
            {companyName && (
              <span className="hidden max-w-[320px] truncate whitespace-nowrap font-montserrat text-[12px] font-semibold text-[#10233A] lg:inline">
                {selectedTemplate.name}
              </span>
            )}
            <ColumnSettingsButton onClick={() => setShowAccountColumns(true)} />
            <RefreshAllButton
              onRefresh={() =>
                companyId
                  ? setCompanyLedgerCustomizations((current) => ({ ...current }))
                  : setTemplates((current) => [...current])
              }
            />
          </div>
        </div>
        <div
          ref={templateTableScrollRef}
          className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
        >
          <div
            style={{
              minWidth:
                visibleAccountColumns.reduce(
                  (total, column) => total + column.width,
                  0,
                ) + 108,
            }}
          >
            <div className="mb-3 flex h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
              {visibleAccountColumns.map((column, index) => (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex h-6 flex-shrink-0 items-center px-3 ${index > 0 ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="whitespace-nowrap">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={accountDirectionFor(
                      column.key as AccountColumnKey,
                    )}
                    onDirectionChange={(direction) =>
                      changeAccountSort(
                        column.key as AccountColumnKey,
                        direction,
                      )
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) => startAccountResize(index, event)}
                  />
                </div>
              ))}
              <span className="w-[108px] flex-shrink-0" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-0.5">
              {treeAccounts.map((account, index) => (
                <div
                  key={account.id}
                  className={`flex h-10 items-center rounded-lg font-montserrat text-[12px] text-[#10233A] transition-colors ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                >
                  {visibleAccountColumns.map((column) => (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="flex flex-shrink-0 items-center overflow-hidden px-3"
                    >
                      {column.key === "active" ? (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className={`h-2 w-2 rounded-full ${account.active ? "bg-[#18B889]" : "bg-[#B8C5D0]"}`}
                          />
                          {account.active ? "Yes" : "No"}
                        </span>
                      ) : column.key === "code" ? (
                        <span
                          className="flex min-w-0 items-center"
                          style={{ paddingLeft: accountDepth(account) * 18 }}
                        >
                          {parentCodes.has(account.code) ? (
                            <button
                              type="button"
                              aria-label={`${expandedAccountCodes.has(account.code) ? "Collapse" : "Expand"} ${account.code}`}
                              onClick={() =>
                                setExpandedAccountCodes((current) => {
                                  const next = new Set(current);
                                  if (next.has(account.code)) next.delete(account.code);
                                  else next.add(account.code);
                                  return next;
                                })
                              }
                              className="mr-1.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[#7288A3] hover:bg-white hover:text-[#007EA7]"
                            >
                              {expandedAccountCodes.has(account.code) ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              )}
                            </button>
                          ) : (
                            <span className="mr-1.5 h-6 w-6 flex-shrink-0" />
                          )}
                          <span className="truncate font-medium text-[#007EA7]">
                            {account.code}
                          </span>
                        </span>
                      ) : (
                        <span
                          className="block truncate"
                        >
                          {String(account[column.key as keyof LedgerAccount])}
                        </span>
                      )}
                    </div>
                  ))}
                  <span className="flex w-[108px] flex-shrink-0 items-center justify-end gap-1.5 px-2">
                    <button
                      type="button"
                      aria-label={`Add child to ${account.code}`}
                      title="Add child DK account"
                      onClick={() =>
                        setAccountDraft({
                          id: `gl-${Date.now()}`,
                          code: "",
                          name: "",
                          type: account.type,
                          active: true,
                          parentCode: account.code,
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${account.name}`}
                      onClick={() => setAccountDraft({ ...account })}
                      className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Pencil size={15} />
                    </button>
                    <RowDeleteButton
                      variant="outlined"
                      label={`Delete ${account.code} ${account.name}`}
                      onDelete={() =>
                        updateSelectedAccounts((items) =>
                          items.filter((item) => item.id !== account.id),
                        )
                      }
                    />
                  </span>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                  <FileText size={30} />
                  <span className="font-montserrat text-[13px] font-semibold">
                    No general ledger accounts
                  </span>
                  <PageActionButton
                    onClick={() =>
                      setAccountDraft({
                        id: `gl-${Date.now()}`,
                        code: "",
                        name: "",
                        type: "Asset",
                        active: true,
                        parentCode: undefined,
                      })
                    }
                  >
                    Create new
                  </PageActionButton>
                </div>
              )}
            </div>
          </div>
        </div>
        <HorizontalTableScrollbar scrollRef={templateTableScrollRef} />
        <div>
          <TablePagination
            currentPage={1}
            totalPages={1}
            itemCount={accounts.length}
            itemsPerPage={Math.max(1, accounts.length)}
            onPageChange={() => undefined}
            onShowMore={() => undefined}
          />
        </div>
        {importMessage && (
          <div
            role="status"
            className={`fixed bottom-6 right-6 z-[140] flex max-w-[430px] items-start justify-between gap-4 rounded-xl border px-4 py-3 shadow-lg ${
              importMessage.type === "success"
                ? "border-[#B9E9D7] bg-[#EEFBF6] text-[#08745A]"
                : "border-[#F1CACA] bg-[#FFF5F5] text-[#B53F3F]"
            }`}
          >
            <span className="font-montserrat text-[12px] font-semibold leading-5">
              {importMessage.text}
            </span>
            <button
              type="button"
              aria-label="Close import message"
              onClick={() => setImportMessage(null)}
              className="mt-0.5 shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {showAccountColumns && (
          <ColumnSettingsPanel
            columns={accountColumns}
            defaultColumns={ACCOUNT_COLUMNS}
            onSave={(next) => {
              setAccountColumns(next);
              setShowAccountColumns(false);
            }}
            onClose={() => setShowAccountColumns(false)}
          />
        )}
        {accountDraft && (
          <AccountEditor
            draft={accountDraft}
            accounts={selectedTemplate.accounts}
            onClose={() => setAccountDraft(null)}
            onSave={saveAccount}
          />
        )}
      </main>
    );
  }

  const allSelected =
    sortedTemplates.length > 0 &&
    sortedTemplates.every((item) => selectedIds.has(item.id));
  return (
    <main
      className="flex h-screen min-w-0 flex-1 flex-col gap-8 overflow-hidden bg-white py-14"
      style={{
        paddingLeft: "clamp(24px, 5vw, 72px)",
        paddingRight: "clamp(24px, 5vw, 72px)",
      }}
    >
      <PageHeader
        title="General ledger templates"
        actions={
          <PageActionButton
            onClick={() =>
              setTemplateDraft({
                id: `ledger-${Date.now()}`,
                name: "",
                description: "",
                updatedAt: today(),
                active: true,
                accounts: [],
              })
            }
          >
            Create new
          </PageActionButton>
        }
      />
      <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
        <span>Settings</span>
        <span className="text-[#A1B6C6]">/</span>
        <span className="text-[#A1B6C6]">General ledger</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <OcrSearchField
            value={query}
            onChange={setQuery}
            ariaLabel="Search general ledger templates"
          />
          <SystemAddFilters
            persistenceKey="finansu-harmonija:v7:filters:general-ledger:templates"
            columns={TEMPLATE_COLUMNS.map((column) => ({
              key: column.key,
              label: column.label,
              options: Array.from(
                new Set(
                  templates.map((template) =>
                    column.key === "accounts"
                      ? String(template.accounts.length)
                      : String(
                          template[
                            column.key as keyof Omit<LedgerTemplate, "accounts">
                          ] ?? "",
                        ),
                  ),
                ),
              ).sort(),
            }))}
            activeKeys={templateFilterKeys}
            values={templateFilterValues}
            onActiveKeysChange={setTemplateFilterKeys}
            onValuesChange={setTemplateFilterValues}
          />
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selectedIds.size}
            onDelete={() => {
              setTemplates((current) =>
                current.filter((item) => !selectedIds.has(item.id)),
              );
              setSelectedIds(new Set());
            }}
          />
          <ColumnSettingsButton onClick={() => setShowTemplateColumns(true)} />
          <RefreshAllButton
            onRefresh={() => setTemplates((current) => [...current])}
          />
        </div>
      </div>
      <div
        ref={templateTableScrollRef}
        className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
      >
        <div
          style={{
            minWidth:
              visibleTemplateColumns.reduce(
                (sum, column) => sum + column.width,
                0,
              ) + 114,
          }}
        >
          <div className="mb-3 flex h-6 items-center">
            <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 px-3">
              <SelectionBox
                checked={allSelected}
                label="Select all templates"
                onChange={() =>
                  setSelectedIds(
                    allSelected
                      ? new Set()
                      : new Set(sortedTemplates.map((item) => item.id)),
                  )
                }
              />
            </div>
            {visibleTemplateColumns.map((column, visibleIndex) => {
              const realIndex = templateColumns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex > 0 ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="whitespace-nowrap">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={templateDirectionFor(
                      column.key as TemplateColumnKey,
                    )}
                    onDirectionChange={(direction) =>
                      changeTemplateSort(
                        column.key as TemplateColumnKey,
                        direction,
                      )
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) =>
                      startTemplateResize(realIndex, event)
                    }
                  />
                </div>
              );
            })}
            <div className="w-[72px] flex-shrink-0" />
          </div>
          <div className="flex flex-col gap-0.5">
            {sortedTemplates.map((template, index) => (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setQuery("");
                }}
                className={`flex h-10 cursor-pointer items-center rounded-lg font-montserrat text-[12px] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
              >
                <div className="flex w-[42px] flex-shrink-0 px-3">
                  <SelectionBox
                    checked={selectedIds.has(template.id)}
                    label={`Select ${template.name}`}
                    onChange={() =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(template.id)) next.delete(template.id);
                        else next.add(template.id);
                        return next;
                      })
                    }
                  />
                </div>
                {visibleTemplateColumns.map((column) => (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className="flex-shrink-0 overflow-hidden px-3"
                  >
                    <span
                      className={`block truncate ${column.key === "name" ? "font-medium text-[#007EA7]" : "font-normal text-[#10233A]"}`}
                    >
                      {column.key === "accounts"
                        ? template.accounts.length
                        : template[
                            column.key as Exclude<TemplateColumnKey, "accounts">
                          ] || "—"}
                    </span>
                  </div>
                ))}
                <span className="flex w-[72px] flex-shrink-0 justify-end gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${template.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTemplateDraft({ ...template });
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-[#7288A3] hover:bg-white hover:text-[#007EA7]"
                  >
                    <Pencil size={15} />
                  </button>
                  <RowDeleteButton
                    variant="plain"
                    onDelete={() =>
                      setTemplates((current) =>
                        current.filter((item) => item.id !== template.id),
                      )
                    }
                  />
                </span>
              </div>
            ))}
            {sortedTemplates.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileText size={30} />
                <span className="font-montserrat text-[14px] font-semibold">
                  No templates
                </span>
                <PageActionButton
                  onClick={() =>
                    setTemplateDraft({
                      id: `ledger-${Date.now()}`,
                      name: "",
                      description: "",
                      updatedAt: today(),
                      active: true,
                      accounts: [],
                    })
                  }
                >
                  Create new
                </PageActionButton>
              </div>
            )}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={templateTableScrollRef} />
      <div>
        <TablePagination
          currentPage={1}
          totalPages={1}
          itemCount={sortedTemplates.length}
          itemsPerPage={Math.max(1, sortedTemplates.length)}
          onPageChange={() => undefined}
          onShowMore={() => undefined}
        />
      </div>
      {showTemplateColumns && (
        <ColumnSettingsPanel
          columns={templateColumns}
          defaultColumns={TEMPLATE_COLUMNS}
          onSave={(next) => {
            setTemplateColumns(next);
            setShowTemplateColumns(false);
          }}
          onClose={() => setShowTemplateColumns(false)}
        />
      )}
      {templateDraft && (
        <TemplateEditor
          draft={templateDraft}
          onClose={() => setTemplateDraft(null)}
          onSave={saveTemplate}
        />
      )}
    </main>
  );
}

function TemplateEditor({
  draft,
  onClose,
  onSave,
}: {
  draft: LedgerTemplate;
  onClose: () => void;
  onSave: (draft: LedgerTemplate) => void;
}) {
  const [value, setValue] = useState(draft);
  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end bg-[#10233A]/10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={draft.name ? "Edit general ledger template" : "New general ledger template"}
        className="flex h-full w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
              {draft.name
                ? "Edit general ledger template"
                : "New general ledger template"}
            </h2>
            <p className="mt-1 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
              Create a reusable general ledger structure for organizations.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close general ledger template"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#10233A]"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mt-8 space-y-5">
          <Field
            label="Template name *"
            value={value.name}
            onChange={(name) => setValue((current) => ({ ...current, name }))}
          />
          <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            Description
            <textarea
              value={value.description}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={4}
              className="min-h-[104px] resize-y rounded-lg border border-[#D3E1EC] px-[14px] py-2.5 font-montserrat text-[14px] font-medium outline-none focus:border-[#007EA7]"
            />
          </label>
          <label className="flex items-center gap-3 font-montserrat text-[13px] font-medium text-[#10233A]">
            <SelectionBox
              checked={value.active}
              label="Active template"
              onChange={() =>
                setValue((current) => ({
                  ...current,
                  active: !current.active,
                }))
              }
            />
            Active
          </label>
        </div>

        <div className="mt-auto flex justify-end gap-3 pt-8">
          <button
            type="button"
            onClick={onClose}
            className="h-[42px] min-w-[108px] rounded-lg border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#A1B6C6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.name.trim()}
            onClick={() => onSave(value)}
            className="h-[42px] min-w-[108px] rounded-lg bg-[#007EA7] px-6 font-montserrat text-[14px] font-semibold text-white hover:bg-[#006D91] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}

function AccountEditor({
  draft,
  accounts,
  onClose,
  onSave,
}: {
  draft: LedgerAccount;
  accounts: LedgerAccount[];
  onClose: () => void;
  onSave: (draft: LedgerAccount) => void;
}) {
  const [value, setValue] = useState(draft);
  const [typeOpen, setTypeOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const duplicateCode = accounts.some(
    (account) =>
      account.id !== value.id &&
      account.code.trim().toLocaleLowerCase() ===
        value.code.trim().toLocaleLowerCase(),
  );
  const invalidParentCodes = new Set([value.code]);
  let hierarchyChanged = true;
  while (hierarchyChanged) {
    hierarchyChanged = false;
    accounts.forEach((account) => {
      if (
        account.parentCode &&
        invalidParentCodes.has(account.parentCode) &&
        !invalidParentCodes.has(account.code)
      ) {
        invalidParentCodes.add(account.code);
        hierarchyChanged = true;
      }
    });
  }
  const parentOptions = [
    { value: "", label: "No parent class" },
    ...accounts
      .filter(
        (account) =>
          account.id !== value.id && !invalidParentCodes.has(account.code),
      )
      .sort((left, right) =>
        left.code.localeCompare(right.code, undefined, { numeric: true }),
      )
      .map((account) => ({
        value: account.code,
        label: `${account.code} — ${account.name}`,
      })),
  ];
  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end bg-[#10233A]/10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={draft.code ? `Edit ${draft.code}` : "New general ledger account"}
        className="flex h-full w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
              {draft.code ? `Edit ${draft.code}` : "New general ledger account"}
            </h2>
            <p className="mt-1 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
              Add a root account or place it under an existing DK class.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close general ledger account"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#10233A]"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          <div>
            <Field
              label="DK class *"
              value={value.code}
              onChange={(code) => setValue((current) => ({ ...current, code }))}
            />
            {duplicateCode && (
              <span className="mt-1.5 block font-montserrat text-[11px] font-semibold text-[#D64545]">
                This DK class already exists.
              </span>
            )}
          </div>
          <Field
            label="Name *"
            value={value.name}
            onChange={(name) => setValue((current) => ({ ...current, name }))}
          />
          <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            Account type
            <LedgerDropdown
              value={value.type}
              options={["Asset", "Liability", "Equity", "Income", "Expense"].map(
                (type) => ({ value: type, label: type }),
              )}
              placeholder="Select account type"
              ariaLabel="Account type"
              open={typeOpen}
              onToggle={() => {
                setTypeOpen((current) => !current);
                setParentOpen(false);
              }}
              onSelect={(type) => {
                setValue((current) => ({
                  ...current,
                  type,
                }));
                setTypeOpen(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
            Parent DK class
            <LedgerDropdown
              value={value.parentCode ?? ""}
              options={parentOptions}
              placeholder="No parent class"
              ariaLabel="Parent DK class"
              open={parentOpen}
              onToggle={() => {
                setParentOpen((current) => !current);
                setTypeOpen(false);
              }}
              onSelect={(parentCode) => {
                setValue((current) => ({
                  ...current,
                  parentCode: parentCode || undefined,
                }));
                setParentOpen(false);
              }}
            />
            <span className="font-montserrat text-[11px] font-medium text-[#7288A3]">
              Select a parent class to place this account in the hierarchy.
            </span>
          </label>
          <label className="flex items-center gap-3 font-montserrat text-[13px] font-medium text-[#10233A]">
            <SelectionBox
              checked={value.active}
              label="Active"
              onChange={() =>
                setValue((current) => ({
                  ...current,
                  active: !current.active,
                }))
              }
            />
            Active
          </label>
        </div>

        <div className="mt-auto flex justify-end gap-3 pt-8">
          <button
            type="button"
            onClick={onClose}
            className="h-[42px] min-w-[108px] rounded-lg border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#A1B6C6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.code.trim() || !value.name.trim() || duplicateCode}
            onClick={() => onSave(value)}
            className="h-[42px] min-w-[108px] rounded-lg bg-[#007EA7] px-6 font-montserrat text-[14px] font-semibold text-white hover:bg-[#006D91] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
      <span>
        {label.endsWith("*") ? (
          <>
            {label.slice(0, -1)}
            <span className="text-[#D64545]">*</span>
          </>
        ) : (
          label
        )}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[14px] font-medium outline-none focus:border-[#007EA7]"
      />
    </label>
  );
}
