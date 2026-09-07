import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import {
  Activity,
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  FileText,
  Landmark,
  Plus,
  Pencil,
  ShieldAlert,
  Trash2,
  X,
  RefreshCw,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, type Company } from "../lib/supabase";
import { useColumnResize, ResizeHandle } from "./useColumnResize";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import { CancelButton, ColumnSettingsButton, SaveButton } from "./ScopedActionButtons";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { PageActionButton, PageHeader } from "./PageHeader";
import { SystemBreadcrumb } from "./SystemNavigation";
import CreateableEmptyState from "./CreateableEmptyState";
import ImportButton from "./ImportButton";
import OcrSearchField from "./OcrSearchField";
import { matchesTextSearch } from "../utils/textSearch";
import DepartmentCodesEditor from "./DepartmentCodesEditor";
import OrganizationCounterpartiesSettings from "./OrganizationCounterpartiesSettings";
import {
  addOrganizationReferenceValue,
  loadOrganizationReferenceValues,
  type OrganizationReferenceSection,
} from "./OrganizationReferenceValuesView";
import { loadGeneralLedgerTemplateNames } from "./GeneralLedgerView";
import { loadVatClassificationTemplateNames } from "./VatClassificationsView";
import SearchableSelect from "./SearchableSelect";

const ROWS_PER_PAGE = 4;

const COUNTRY_CURRENCIES: Record<string, string> = {
  Lithuania: "EUR",
  Latvia: "EUR",
  Estonia: "EUR",
  Poland: "PLN",
  Germany: "EUR",
  Finland: "EUR",
  Sweden: "SEK",
  Norway: "NOK",
  Denmark: "DKK",
};
const YES_NO_OPTIONS = ["Yes", "No"];
const INVOICE_DIGITIZATION_OPTIONS = ["Detailed with lines", "Summary"];
const DOCUMENT_SPLITTING_OPTIONS = ["Split", "Do not split"];
const REJECT_NON_INVOICE_OPTIONS = ["Reject", "Do not reject"];
const EXPORT_FORMAT_OPTIONS = [
  "Rivilė",
  "Rivilė API",
  "Agnum",
  "XML",
  "B1",
  "Excel",
  "Finvalda",
  "Finvalda Excel",
  "JSON",
];

type CounterpartyBankAccount = {
  id: string;
  iban: string;
  bank: string;
  bankCode: string;
  swift: string;
  primary: boolean;
};

type CounterpartyGlAccount = {
  id: string;
  section: string;
  label: string;
  code: string;
};

type CounterpartyGlSetting = {
  id: string;
  section: string;
  label: string;
  code: string;
};

const DEFAULT_COUNTERPARTY_GL_SETTINGS: CounterpartyGlSetting[] = [
  { id: "currency-positive", section: "Currency conversion", label: "Positive", code: "5803" },
  { id: "currency-negative", section: "Currency conversion", label: "Negative", code: "6803" },
  { id: "internal-waybills", section: "Other accounts", label: "Internal waybills", code: "" },
  { id: "other", section: "Other accounts", label: "Other", code: "" },
  { id: "customs-duty", section: "Other accounts", label: "Customs duty", code: "" },
  { id: "excise-duty", section: "Other accounts", label: "Excise duty", code: "" },
  { id: "driver-accountability", section: "Other accounts", label: "Transport driver accountability", code: "" },
  { id: "vat", section: "Other accounts", label: "VAT", code: "" },
  { id: "rounding-purchases", section: "Cent rounding", label: "Purchases", code: "" },
  { id: "rounding-sales", section: "Cent rounding", label: "Sales", code: "" },
];

function mergeCounterpartyGlSettings(value?: string): CounterpartyGlSetting[] {
  let saved: CounterpartyGlSetting[] = [];
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      saved = parsed.filter(
        (item): item is CounterpartyGlSetting =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as CounterpartyGlSetting).id === "string" &&
          typeof (item as CounterpartyGlSetting).code === "string",
      );
    }
  } catch {
    saved = [];
  }
  const savedById = new Map(saved.map((item) => [item.id, item]));
  return DEFAULT_COUNTERPARTY_GL_SETTINGS.map((item) => ({
    ...item,
    ...savedById.get(item.id),
  }));
}

const BUYER_GL_DEFAULTS: CounterpartyGlAccount[] = [
  { id: "buyer-debts", section: "Buyer", label: "Debts", code: "2410" },
  { id: "buyer-advance-payments", section: "Buyer", label: "Advance payments", code: "4420" },
  { id: "buyer-other-amounts", section: "Buyer", label: "Other amounts", code: "4494" },
  { id: "buyer-customs-duty", section: "Buyer", label: "Customs duty", code: "4493" },
  { id: "buyer-excise-duty", section: "Buyer", label: "Excise duty", code: "4493" },
  { id: "buyer-discounts", section: "Buyer", label: "Discounts", code: "609" },
  { id: "buyer-interest", section: "Buyer", label: "Interest", code: "5802" },
  { id: "buyer-late-fees", section: "Buyer", label: "Late payment fees", code: "5804" },
  { id: "buyer-eu-vat-goods", section: "European VAT", label: "Goods", code: "6208" },
  { id: "buyer-eu-vat-expenses", section: "European VAT", label: "Expenses", code: "6208" },
  { id: "buyer-eu-vat-customs", section: "European VAT", label: "Customs duty", code: "6208" },
  { id: "buyer-eu-vat-excise", section: "European VAT", label: "Excise duty", code: "6208" },
];

const SELLER_GL_DEFAULTS: CounterpartyGlAccount[] = [
  { id: "seller-debts", section: "Seller", label: "Debts", code: "4430" },
  { id: "seller-advance-payments", section: "Seller", label: "Advance payments", code: "2080" },
  { id: "seller-other-amounts", section: "Seller", label: "Other amounts", code: "4494" },
  { id: "seller-customs-duty", section: "Seller", label: "Customs duty", code: "4493" },
  { id: "seller-excise-duty", section: "Seller", label: "Excise duty", code: "4493" },
  { id: "seller-discounts", section: "Seller", label: "Discounts", code: "509" },
  { id: "seller-interest", section: "Seller", label: "Interest", code: "6802" },
  { id: "seller-import-vat-goods", section: "Import VAT", label: "Goods", code: "4493" },
  { id: "seller-import-vat-expenses", section: "Import VAT", label: "Expenses", code: "4493" },
  { id: "seller-import-vat-customs", section: "Import VAT", label: "Customs duty", code: "4493" },
  { id: "seller-import-vat-excise", section: "Import VAT", label: "Excise duty", code: "4493" },
];

function defaultCounterpartyGlAccounts(): CounterpartyGlAccount[] {
  return [...BUYER_GL_DEFAULTS, ...SELLER_GL_DEFAULTS].map((item) => ({ ...item }));
}

function mergeCounterpartyGlAccounts(
  saved: CounterpartyGlAccount[],
): CounterpartyGlAccount[] {
  const savedById = new Map(saved.map((item) => [item.id, item]));
  return defaultCounterpartyGlAccounts().map((item) => ({
    ...item,
    ...savedById.get(item.id),
  }));
}

function parseCounterpartyGlAccounts(value?: string): CounterpartyGlAccount[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is CounterpartyGlAccount =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as CounterpartyGlAccount).id === "string" &&
            typeof (item as CounterpartyGlAccount).label === "string" &&
            typeof (item as CounterpartyGlAccount).code === "string",
        )
      : [];
  } catch {
    return [];
  }
}

const COUNTERPARTY_KINDS = ["Buyer", "Supplier", "Buyer/Supplier", "Company"];
const SHAREPOINT_SYNC_OPTIONS = [
  "Every 5 minutes",
  "Every hour",
  "Every day",
  "Synchronization disabled",
  "Manual synchronization",
];
function OrganizationSelect({
  label,
  value,
  options,
  onChange,
  allowCreate = false,
  referenceSection,
  menuPlacement = "down",
  fixedMenu = false,
  strictOptions = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowCreate?: boolean;
  referenceSection?: OrganizationReferenceSection;
  menuPlacement?: "down" | "up";
  fixedMenu?: boolean;
  strictOptions?: boolean;
}) {
  const triggerRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fixedPosition, setFixedPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [addingOption, setAddingOption] = useState(false);
  const [newOption, setNewOption] = useState("");
  const optionName = label.replace(" *", "");
  const optionNameLower = optionName.toLowerCase();
  const visibleOptions = Array.from(
    new Set([
      ...options,
      ...(!strictOptions && value ? [value] : []),
      ...customOptions,
    ]),
  ).filter((option) => option !== "Other");
  const filteredOptions = visibleOptions.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const positionFixedMenu = useCallback(() => {
    if (!fixedMenu || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const preferredMenuHeight = 320;
    const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
    const roomAbove = rect.top - viewportPadding;
    const openBelow =
      roomBelow >= preferredMenuHeight || roomBelow >= roomAbove;
    const availableRoom = Math.max(
      120,
      openBelow ? roomBelow : roomAbove,
    );
    const maxHeight = Math.min(preferredMenuHeight, availableRoom);
    setFixedPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - rect.width - viewportPadding),
      ),
      top: openBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - maxHeight - gap),
      width: rect.width,
      maxHeight,
    });
  }, [fixedMenu]);
  useEffect(() => {
    if (!open || !fixedMenu) return;
    positionFixedMenu();
    window.addEventListener("resize", positionFixedMenu);
    window.addEventListener("scroll", positionFixedMenu, true);
    return () => {
      window.removeEventListener("resize", positionFixedMenu);
      window.removeEventListener("scroll", positionFixedMenu, true);
    };
  }, [fixedMenu, open, positionFixedMenu]);
  const addOption = () => {
    const nextOption = newOption.trim();
    if (!nextOption) return;
    setCustomOptions((current) =>
      current.includes(nextOption) ? current : [...current, nextOption],
    );
    if (referenceSection) {
      addOrganizationReferenceValue(referenceSection, nextOption);
    }
    onChange(nextOption);
    setNewOption("");
    setAddingOption(false);
    setOpen(false);
  };
  return (
    <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
      <span>
        {optionName}
        {label.trim().endsWith("*") && (
          <span className="ml-1 text-[#E45858]">*</span>
        )}
      </span>
      <span className="relative">
        <input
          ref={triggerRef}
          role="combobox"
          aria-label={label.replace(" *", "")}
          aria-expanded={open}
          value={open ? query : value}
          placeholder="Select"
          autoComplete="off"
          onFocus={(event) => {
            if (!open) positionFixedMenu();
            setQuery("");
            setOpen(true);
            event.currentTarget.select();
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] pr-10 font-montserrat text-[14px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
        />
        <button type="button" tabIndex={-1} aria-label={`Open ${optionNameLower} options`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setOpen((current) => !current); }} className="absolute right-0 top-0 flex h-[42px] w-10 items-center justify-center text-[#7288A3]">
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <span
            role="listbox"
            aria-label={`${label.replace(" *", "")} options`}
            style={fixedMenu && fixedPosition ? fixedPosition : undefined}
            className={`${fixedMenu ? "fixed z-[220] overscroll-contain" : `absolute left-0 z-[160] max-h-60 w-full ${menuPlacement === "up" ? "bottom-[46px]" : "top-[46px]"}`} block overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]`}
          >
            {filteredOptions.map((option) => {
              const selected = value === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${selected ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                  >
                    {selected && (
                      <Check size={13} strokeWidth={3} className="text-white" />
                    )}
                  </span>
                  <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                    {option}
                  </span>
                </button>
              );
            })}
            {allowCreate && (
              <span className="mt-1 block border-t border-[#DDE7F0] pt-1">
                {addingOption ? (
                  <span className="flex items-center gap-2 p-1">
                    <input
                      autoFocus
                      aria-label={`New ${optionNameLower}`}
                      value={newOption}
                      placeholder={`${optionName} name`}
                      onChange={(event) => setNewOption(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addOption();
                        }
                      }}
                      className="h-9 min-w-0 flex-1 rounded-md border border-[#D3E1EC] px-2 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                    <button
                      type="button"
                      aria-label={`Save new ${optionNameLower}`}
                      onClick={addOption}
                      disabled={!newOption.trim()}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-[#007EA7] text-white disabled:opacity-40"
                    >
                      <Check size={15} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingOption(true)}
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 font-montserrat text-[13px] font-semibold text-[#007EA7] hover:bg-[#F0F7FA]"
                  >
                    <Plus size={15} /> Add new {optionNameLower}
                  </button>
                )}
              </span>
            )}
          </span>
        )}
      </span>
    </label>
  );
}

const FALLBACK_COMPANIES: Company[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "John Brick",
    company_code: "ec6940fg5698",
    vat_code: "ec6940fg5698",
    client_since: 2019,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Alice Stone",
    company_code: "ab1234cd5678",
    vat_code: "ab1234cd5678",
    client_since: 2021,
    action_required: 3,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Bob Morris",
    company_code: "xy9876zw5432",
    vat_code: "xy9876zw5432",
    client_since: 2020,
    action_required: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Carol White",
    company_code: "mn3456op7890",
    vat_code: "mn3456op7890",
    client_since: 2022,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "David Lane",
    company_code: "qr2345st6789",
    vat_code: "qr2345st6789",
    client_since: 2018,
    action_required: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    name: "Emma Clarke",
    company_code: "gh5678ij9012",
    vat_code: "gh5678ij9012",
    client_since: 2023,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "Frank Hughes",
    company_code: "cd3456ef7890",
    vat_code: "cd3456ef7890",
    client_since: 2017,
    action_required: 5,
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    name: "Grace Kim",
    company_code: "wx8901yz2345",
    vat_code: "wx8901yz2345",
    client_since: 2022,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "Henry Ford",
    company_code: "op4567qr8901",
    vat_code: "op4567qr8901",
    client_since: 2020,
    action_required: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Iris Taylor",
    company_code: "ij0123kl4567",
    vat_code: "ij0123kl4567",
    client_since: 2021,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "James Wilson",
    company_code: "ef7890gh1234",
    vat_code: "ef7890gh1234",
    client_since: 2019,
    action_required: 3,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    name: "Karen Scott",
    company_code: "st2345uv6789",
    vat_code: "st2345uv6789",
    client_since: 2023,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    name: "Leo Nolan",
    company_code: "uv6789wx0123",
    vat_code: "uv6789wx0123",
    client_since: 2018,
    action_required: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    name: "Mia Turner",
    company_code: "yz4567ab8901",
    vat_code: "yz4567ab8901",
    client_since: 2022,
    action_required: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    name: "Noah Reed",
    company_code: "bc8901de2345",
    vat_code: "bc8901de2345",
    client_since: 2016,
    action_required: 7,
  },
];

interface ColumnDef {
  key: string;
  label: string;
  width: number;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Company name", width: 128 },
  { key: "company_code", label: "Company code", width: 110 },
  { key: "vat_code", label: "Company VAT code", width: 130 },
  { key: "client_since", label: "Client since", width: 80 },
  { key: "action_required", label: "Action required", width: 110 },
  { key: "company_status", label: "Company status", width: 120 },
  { key: "assigned_accountant", label: "Assigned accountant", width: 150 },
  { key: "company_type", label: "Company type", width: 120 },
  { key: "service_scope", label: "Service scope", width: 120 },
  { key: "phone", label: "Phone", width: 120 },
  { key: "email", label: "Email", width: 160 },
  { key: "registration_date", label: "Registration date", width: 130 },
  { key: "vat_status", label: "VAT status", width: 100 },
  { key: "country", label: "Country", width: 100 },
  { key: "address", label: "Address", width: 160 },
];

const DEFAULT_VISIBLE = new Set([
  "name",
  "company_code",
  "vat_code",
  "client_since",
  "action_required",
]);
const DEFAULT_ORDER = ALL_COLUMNS.map((c) => c.key);

const DEFAULT_FILTER_KEYS = [
  "company_status",
  "action_required",
  "assigned_accountant",
  "company_type",
  "service_scope",
];

function entityColumnLabel(label: string, entityLabel: string) {
  if (entityLabel === "company") return label;
  if (entityLabel === "counterparty")
    return label.replace(/^Company /, "Counterparty ");
  return label.replace(/^Company /, "Organization ");
}

function entityPlural(entityLabel: string) {
  return entityLabel === "counterparty" ? "counterparties" : `${entityLabel}s`;
}

function getCompanyCellText(key: string, row: Company): string {
  switch (key) {
    case "name":
      return row.name ?? "";
    case "company_code":
      return row.company_code ?? "";
    case "vat_code":
      return row.vat_code ?? "";
    case "client_since":
      return String(row.client_since ?? "");
    case "action_required":
      return String(row.action_required ?? "");
    case "company_status":
      return row.company_status ?? "Active";
    case "assigned_accountant":
      return row.assigned_accountant ?? "Not assigned";
    case "company_type":
      return row.company_type ?? "UAB";
    case "service_scope":
      return row.service_scope ?? "Full accounting";
    default:
      return (row as unknown as Record<string, unknown>)[key]?.toString() ?? "";
  }
}

function renderDataCell(key: string, row: Company) {
  const text = (val: string | number) => (
    <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
      {val}
    </span>
  );
  const dotCell = (val: string | number) => (
    <div className="flex flex-row items-center gap-1">
      <div className="w-[6px] h-[6px] rounded-full bg-[#FCC74D]" />
      <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
        {val}
      </span>
    </div>
  );
  switch (key) {
    case "name":
      return text(row.name);
    case "company_code":
      return text(row.company_code);
    case "vat_code":
      return text(row.vat_code);
    case "client_since":
      return text(row.client_since);
    case "action_required":
      return dotCell(row.action_required);
    default: {
      const value = getCompanyCellText(key, row);
      return value === "" ? (
        <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#7288A3]">
          —
        </span>
      ) : (
        text(value)
      );
    }
  }
}

interface CompaniesProps {
  onViewDetails?: (company: Company) => void;
  onCreate?: () => void;
  title?: string;
  entityLabel?: string;
  allowCreate?: boolean;
  dataSource?: "companies" | "counterparties";
  breadcrumbs?: string[];
}

export default function Companies({
  onViewDetails,
  onCreate,
  title = "Companies",
  entityLabel = "company",
  allowCreate = false,
  dataSource = "companies",
  breadcrumbs,
}: CompaniesProps) {
  const managedTaxCountries = loadOrganizationReferenceValues("Tax country");
  const managedLegalForms = loadOrganizationReferenceValues("Legal form");
  const managedBaseCurrencies =
    loadOrganizationReferenceValues("Base currency");
  const managedVatClassificationTemplates =
    loadVatClassificationTemplateNames();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const [, setScrollRatio] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [counterpartyToDelete, setCounterpartyToDelete] =
    useState<Company | null>(null);
  const [editingCounterpartyId, setEditingCounterpartyId] = useState<
    string | null
  >(null);
  const [organizationFormSection, setOrganizationFormSection] = useState<
    "general" | "digitization" | "sharepoint" | "counterparties"
  >("general");
  const [newCompany, setNewCompany] = useState({
    taxCountry: "Lithuania",
    legalForm: managedLegalForms[0] ?? "",
    baseCurrency: "EUR",
    name: "",
    companyCode: "",
    vatCode: "",
    generalLedger: loadGeneralLedgerTemplateNames()[0] ?? "",
    departmentCodes: "",
    objects: "",
    projects: "",
    documentSeries: "",
    costCenters: "",
    productGroups: "",
    allowDocumentDuplicates: "No",
    invoiceDigitization: "Summary",
    documentSplitting: "Split",
    rejectNonInvoices: "Do not reject",
    primaryExportFormat: "Rivilė",
    twoFactorAuthentication: "No",
    sharepointClientId: "",
    sharepointClientSecret: "",
    sharepointTenantId: "",
    sharepointUrls: "",
    sharepointSyncSchedule: "Manual synchronization",
    sharepointSyncTime: "09:00",
    counterpartiesSettings: "",
    clientSince: String(new Date().getFullYear()),
    actionRequired: "0",
    counterpartyCountry: managedTaxCountries[0] ?? "",
    counterpartyKind: "Buyer/Supplier",
    counterpartyVatClassification:
      managedVatClassificationTemplates[0] ?? "",
    counterpartyPhone: "",
    counterpartyEmail: "",
    counterpartyNotes: "",
  });
  const [counterpartySection, setCounterpartySection] = useState<
    "general" | "banking" | "glAccounts" | "glSettings" | "analysis"
  >("general");
  const [counterpartyBankAccounts, setCounterpartyBankAccounts] = useState<
    CounterpartyBankAccount[]
  >([]);
  const [counterpartyGlTemplate, setCounterpartyGlTemplate] = useState("");
  const [counterpartyGlAccounts, setCounterpartyGlAccounts] = useState<
    CounterpartyGlAccount[]
  >([]);
  const [counterpartyGlRole, setCounterpartyGlRole] = useState<
    "Buyer" | "Seller"
  >("Buyer");
  const [counterpartyGlSettings, setCounterpartyGlSettings] = useState<
    CounterpartyGlSetting[]
  >(() => mergeCounterpartyGlSettings());
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleFilterKeys, setVisibleFilterKeys] =
    useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>(
    {},
  );
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [pendingFilterKeys, setPendingFilterKeys] =
    useState<string[]>([]);
  const filterPersistenceKey = `finansu-harmonija:v7:filters:${dataSource}:${entityLabel}`;
  const [hydratedFilterKey, setHydratedFilterKey] = useState<string | null>(
    null,
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(DEFAULT_VISIBLE),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_ORDER);
  const [columns, setColumns] = useState<ColConfig[]>(
    ALL_COLUMNS.map((c) => ({
      key: c.key,
      label: entityColumnLabel(c.label, entityLabel),
      width: c.width,
      visible: DEFAULT_VISIBLE.has(c.key),
    })),
  );
  const { startResize } = useColumnResize(columns, setColumns);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addFilterOpen && openFilter === null) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !filterMenuRef.current?.contains(target)) {
        setAddFilterOpen(false);
        setOpenFilter(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAddFilterOpen(false);
      setOpenFilter(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addFilterOpen, openFilter]);

  useLayoutEffect(() => {
    if (dataSource !== "counterparties") return;
    const scrollContainer = pageRootRef.current?.closest<HTMLElement>(
      ".overflow-y-auto",
    );
    scrollContainer?.scrollTo({ top: 0, behavior: "auto" });
  }, [dataSource, visibleFilterKeys]);

  useEffect(() => {
    setHydratedFilterKey(null);
    try {
      const stored = window.localStorage.getItem(filterPersistenceKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as {
          visibleFilterKeys?: unknown;
          filterValues?: unknown;
        };
        const availableKeys = new Set(ALL_COLUMNS.map((column) => column.key));
        const restoredKeys = Array.isArray(parsed.visibleFilterKeys)
          ? parsed.visibleFilterKeys.filter(
              (key): key is string =>
                typeof key === "string" && availableKeys.has(key),
            )
          : [];
        const restoredValues =
          parsed.filterValues && typeof parsed.filterValues === "object"
            ? Object.fromEntries(
                Object.entries(parsed.filterValues).flatMap(([key, value]) =>
                  availableKeys.has(key) && Array.isArray(value)
                    ? [
                        [
                          key,
                          value.filter(
                            (item): item is string => typeof item === "string",
                          ),
                        ],
                      ]
                    : [],
                ),
              )
            : {};
        const isLegacyAutomaticDefault =
          restoredKeys.length === DEFAULT_FILTER_KEYS.length &&
          DEFAULT_FILTER_KEYS.every((key) => restoredKeys.includes(key)) &&
          Object.values(restoredValues).every((value) => value.length === 0);
        const nextKeys = isLegacyAutomaticDefault ? [] : restoredKeys;
        setVisibleFilterKeys(nextKeys);
        setPendingFilterKeys(nextKeys);
        setFilterValues(restoredValues);
      } else {
        setVisibleFilterKeys([]);
        setPendingFilterKeys([]);
        setFilterValues({});
      }
    } catch {
      window.localStorage.removeItem(filterPersistenceKey);
      setVisibleFilterKeys([]);
      setPendingFilterKeys([]);
      setFilterValues({});
    }
    setHydratedFilterKey(filterPersistenceKey);
  }, [filterPersistenceKey]);

  useEffect(() => {
    if (hydratedFilterKey !== filterPersistenceKey) return;
    window.localStorage.setItem(
      filterPersistenceKey,
      JSON.stringify({ visibleFilterKeys, filterValues }),
    );
  }, [
    filterPersistenceKey,
    filterValues,
    hydratedFilterKey,
    visibleFilterKeys,
  ]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (dataSource === "counterparties") {
      try {
        const stored = window.localStorage.getItem(
          "finansu-harmonija:v7:settings:counterparties",
        );
        setCompanies(stored ? (JSON.parse(stored) as Company[]) : []);
      } catch {
        setCompanies([]);
      }
      setLoading(false);
      return;
    }
    const { data, error: fetchError } = await supabase
      .from("companies")
      .select("*")
      .order("name", { ascending: true });
    if (fetchError) {
      setCompanies(FALLBACK_COMPANIES);
      setError(null);
    } else {
      setCompanies(
        data && data.length > 0
          ? (data as unknown as Company[])
          : FALLBACK_COMPANIES,
      );
    }
    setLoading(false);
  }, [dataSource]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleRefresh = async () => {
    if (refreshing || loading) return;
    setRefreshing(true);
    setPage(1);
    await fetchCompanies();
    setRefreshing(false);
  };

  const openColSettings = () => setColSettingsOpen(true);

  const openCounterpartyEditor = (counterparty: Company) => {
    let bankAccounts: CounterpartyBankAccount[] = [];
    try {
      const parsed = JSON.parse(counterparty.counterparty_bank_accounts ?? "[]");
      if (Array.isArray(parsed)) bankAccounts = parsed;
    } catch {
      bankAccounts = [];
    }
    setEditingCounterpartyId(counterparty.id);
    setCounterpartySection("general");
    setCounterpartyBankAccounts(bankAccounts);
    const assignedGlTemplate = counterparty.counterparty_gl_template ?? "";
    const savedGlAccounts = parseCounterpartyGlAccounts(
      counterparty.counterparty_gl_accounts,
    );
    setCounterpartyGlTemplate(assignedGlTemplate);
    setCounterpartyGlAccounts(
      assignedGlTemplate
        ? mergeCounterpartyGlAccounts(savedGlAccounts)
        : savedGlAccounts,
    );
    setCounterpartyGlRole(
      counterparty.counterparty_kind === "Supplier" ? "Seller" : "Buyer",
    );
    setCounterpartyGlSettings(
      mergeCounterpartyGlSettings(counterparty.counterparty_gl_settings),
    );
    setCreateError("");
    setNewCompany((current) => ({
      ...current,
      name: counterparty.name ?? "",
      companyCode: counterparty.company_code ?? "",
      vatCode: counterparty.vat_code ?? "",
      clientSince: String(
        counterparty.client_since ?? new Date().getFullYear(),
      ),
      actionRequired: String(counterparty.action_required ?? 0),
      counterpartyCountry:
        counterparty.counterparty_country ?? counterparty.country ?? "",
      legalForm:
        counterparty.counterparty_legal_status ??
        counterparty.legal_form ??
        "",
      counterpartyKind: counterparty.counterparty_kind ?? "Buyer/Supplier",
      counterpartyVatClassification:
        counterparty.counterparty_vat_classification ?? "",
      counterpartyPhone: counterparty.phone ?? "",
      counterpartyEmail: counterparty.email ?? "",
      counterpartyNotes: counterparty.counterparty_notes ?? "",
    }));
    setCreateOpen(true);
  };

  const deleteCounterparty = () => {
    if (dataSource !== "counterparties" || !counterpartyToDelete) return;

    const next = companies.filter(
      (company) => company.id !== counterpartyToDelete.id,
    );
    window.localStorage.setItem(
      "finansu-harmonija:v7:settings:counterparties",
      JSON.stringify(next),
    );
    window.dispatchEvent(new CustomEvent("counterparties-updated"));
    setCompanies(next);
    setCounterpartyToDelete(null);
    setPage(1);
  };

  const createCompany = async () => {
    const organizationMode = entityLabel === "organization";
    const counterpartyMode = entityLabel === "counterparty";
    if (
      !newCompany.name.trim() ||
      !newCompany.companyCode.trim() ||
      (counterpartyMode &&
        (!newCompany.counterpartyCountry ||
          !newCompany.legalForm ||
          !newCompany.counterpartyKind ||
          !newCompany.counterpartyVatClassification)) ||
      (organizationMode &&
        (!newCompany.taxCountry ||
          !newCompany.legalForm ||
          !newCompany.baseCurrency ||
          !newCompany.generalLedger))
    ) {
      setCreateError("Please complete all required fields.");
      return;
    }
    if (/["“”„]/.test(newCompany.name)) {
      setCreateError("Company name cannot contain quotation marks.");
      return;
    }
    if (
      companies.some(
        (company) =>
          company.id !== editingCounterpartyId &&
          company.company_code.trim().toLowerCase() ===
          newCompany.companyCode.trim().toLowerCase(),
      )
    ) {
      setCreateError("Company code must be unique.");
      return;
    }
    setCreating(true);
    setCreateError("");
    if (dataSource === "counterparties") {
      const existingCounterparty = editingCounterpartyId
        ? companies.find((company) => company.id === editingCounterpartyId)
        : undefined;
      let activityLog: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(
          existingCounterparty?.counterparty_activity_log ?? "[]",
        );
        if (Array.isArray(parsed)) activityLog = parsed;
      } catch {
        activityLog = [];
      }
      const now = new Date().toISOString();
      const counterparty: Company = {
        ...existingCounterparty,
        id: existingCounterparty?.id ?? `counterparty-${Date.now()}`,
        name: newCompany.name.trim(),
        company_code: newCompany.companyCode.trim(),
        vat_code: newCompany.vatCode.trim(),
        client_since:
          Number(newCompany.clientSince) || new Date().getFullYear(),
        action_required: Number(newCompany.actionRequired) || 0,
        country: newCompany.counterpartyCountry,
        phone: newCompany.counterpartyPhone.trim(),
        email: newCompany.counterpartyEmail.trim(),
        counterparty_country: newCompany.counterpartyCountry,
        legal_form: newCompany.legalForm,
        counterparty_legal_status: newCompany.legalForm,
        counterparty_kind: newCompany.counterpartyKind,
        counterparty_vat_classification:
          newCompany.counterpartyVatClassification,
        counterparty_notes: newCompany.counterpartyNotes.trim(),
        counterparty_bank_accounts: JSON.stringify(counterpartyBankAccounts),
        counterparty_gl_template: counterpartyGlTemplate,
        counterparty_gl_accounts: JSON.stringify(counterpartyGlAccounts),
        counterparty_gl_settings: JSON.stringify(counterpartyGlSettings),
        counterparty_created_by:
          existingCounterparty?.counterparty_created_by ?? "Administrator",
        counterparty_created_at:
          existingCounterparty?.counterparty_created_at ?? now,
        counterparty_activity_log: JSON.stringify([
          ...activityLog,
          {
            date: now,
            user: "Administrator",
            action: existingCounterparty
              ? "Counterparty updated"
              : "Counterparty created",
          },
        ]),
      };
      const next = existingCounterparty
        ? companies.map((company) =>
            company.id === existingCounterparty.id ? counterparty : company,
          )
        : [...companies, counterparty];
      window.localStorage.setItem(
        "finansu-harmonija:v7:settings:counterparties",
        JSON.stringify(next),
      );
      window.dispatchEvent(new CustomEvent("counterparties-updated"));
      setCompanies(next);
      setCreating(false);
      setCreateOpen(false);
      setEditingCounterpartyId(null);
      setCounterpartySection("general");
      setCounterpartyBankAccounts([]);
      setCounterpartyGlTemplate("");
      setCounterpartyGlAccounts([]);
      setCounterpartyGlRole("Buyer");
      setCounterpartyGlSettings(mergeCounterpartyGlSettings());
      setNewCompany((current) => ({
        ...current,
        name: "",
        companyCode: "",
        vatCode: "",
        counterpartyCountry: managedTaxCountries[0] ?? "",
        legalForm: managedLegalForms[0] ?? "",
        counterpartyKind: "Buyer/Supplier",
        counterpartyVatClassification:
          managedVatClassificationTemplates[0] ?? "",
        counterpartyPhone: "",
        counterpartyEmail: "",
        counterpartyNotes: "",
      }));
      setPage(1);
      return;
    }
    const { error: insertError } = await supabase.from("companies").insert({
      name: newCompany.name.trim(),
      company_code: newCompany.companyCode.trim(),
      vat_code: newCompany.vatCode.trim() || newCompany.companyCode.trim(),
      client_since: Number(newCompany.clientSince) || new Date().getFullYear(),
      action_required: Number(newCompany.actionRequired) || 0,
      tax_country: newCompany.taxCountry,
      legal_form: newCompany.legalForm,
      base_currency: newCompany.baseCurrency,
      general_ledger: newCompany.generalLedger,
      department_codes: newCompany.departmentCodes,
      objects: newCompany.objects,
      projects: newCompany.projects,
      document_series: newCompany.documentSeries,
      cost_centers: newCompany.costCenters,
      product_groups: newCompany.productGroups,
      allow_document_duplicates: newCompany.allowDocumentDuplicates,
      invoice_digitization: newCompany.invoiceDigitization,
      document_splitting: newCompany.documentSplitting,
      reject_non_invoices: newCompany.rejectNonInvoices,
      primary_export_format: newCompany.primaryExportFormat,
      two_factor_authentication: newCompany.twoFactorAuthentication,
      sharepoint_client_id: newCompany.sharepointClientId,
      sharepoint_client_secret: newCompany.sharepointClientSecret,
      sharepoint_tenant_id: newCompany.sharepointTenantId,
      sharepoint_urls: newCompany.sharepointUrls,
      sharepoint_sync_schedule: newCompany.sharepointSyncSchedule,
      sharepoint_sync_time: newCompany.sharepointSyncTime,
      counterparties_settings: newCompany.counterpartiesSettings,
    });
    if (insertError) {
      setCreateError(insertError.message);
      setCreating(false);
      return;
    }
    await fetchCompanies();
    setCreating(false);
    setCreateOpen(false);
    setOrganizationFormSection("general");
    setNewCompany({
      taxCountry: managedTaxCountries[0] ?? "",
      legalForm: managedLegalForms[0] ?? "",
      baseCurrency: "EUR",
      name: "",
      companyCode: "",
      vatCode: "",
      generalLedger: loadGeneralLedgerTemplateNames()[0] ?? "",
      departmentCodes: "",
      objects: "",
      projects: "",
      documentSeries: "",
      costCenters: "",
      productGroups: "",
      allowDocumentDuplicates: "No",
      invoiceDigitization: "Summary",
      documentSplitting: "Split",
      rejectNonInvoices: "Do not reject",
      primaryExportFormat: "Rivilė",
      twoFactorAuthentication: "No",
      sharepointClientId: "",
      sharepointClientSecret: "",
      sharepointTenantId: "",
      sharepointUrls: "",
      sharepointSyncSchedule: "Manual synchronization",
      sharepointSyncTime: "09:00",
      counterpartiesSettings: "",
      clientSince: String(new Date().getFullYear()),
      actionRequired: "0",
      counterpartyCountry: managedTaxCountries[0] ?? "",
      counterpartyKind: "Buyer/Supplier",
      counterpartyVatClassification:
        managedVatClassificationTemplates[0] ?? "",
      counterpartyPhone: "",
      counterpartyEmail: "",
      counterpartyNotes: "",
    });
    setPage(1);
  };

  const saveColSettings = (nextColumns: ColConfig[]) => {
    setColumns(nextColumns);
    setColumnOrder(nextColumns.map((column) => column.key));
    setVisibleColumns(
      new Set(
        nextColumns
          .filter((column) => column.visible)
          .map((column) => column.key),
      ),
    );
  };

  const handleExport = () => {
    if (!exportFormat) return;
    const exportBaseName =
      dataSource === "counterparties"
        ? "counterparties"
        : entityLabel === "organization"
          ? "organizations"
          : "companies";
    const cols = activeCols;
    const headers = cols.map((c) => c.label);
    const dataRows = sorted.map((row) =>
      cols.map((c) => getCompanyCellText(c.key, row)),
    );

    if (exportFormat === "csv") {
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [
        headers.map(escape).join(","),
        ...dataRows.map((r) => r.map(escape).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportBaseName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === "xlsx") {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
      XLSX.writeFile(
        workbook,
        `${exportBaseName}.xlsx`,
      );
    } else if (exportFormat === "json") {
      const blob = new Blob([JSON.stringify(sorted, null, 2)], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportBaseName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExportOpen(false);
  };

  const handleCounterpartyImport = async (file: File) => {
    let records: Record<string, unknown>[] = [];
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(await file.text()) as unknown;
      records = Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : parsed && typeof parsed === "object"
          ? [parsed as Record<string, unknown>]
          : [];
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      records = sheet
        ? (XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<
            string,
            unknown
          >[])
        : [];
    }

    const normalizeKey = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const readValue = (
      record: Record<string, unknown>,
      aliases: string[],
    ) => {
      const aliasKeys = aliases.map(normalizeKey);
      const match = Object.entries(record).find(([key]) =>
        aliasKeys.includes(normalizeKey(key)),
      );
      return match?.[1] == null ? "" : String(match[1]).trim();
    };
    const now = new Date().toISOString();
    const imported = records.flatMap((record, index): Company[] => {
      const name = readValue(record, [
        "name",
        "counterparty name",
        "company name",
        "pavadinimas",
      ]);
      const companyCode = readValue(record, [
        "code",
        "counterparty code",
        "company code",
        "kodas",
      ]);
      if (!name || !companyCode) return [];
      const existing = companies.find(
        (company) =>
          company.company_code.toLocaleLowerCase() ===
          companyCode.toLocaleLowerCase(),
      );
      const country = readValue(record, ["country", "šalis"]);
      const legalForm = readValue(record, [
        "legal form",
        "legal status",
        "juridinis statusas",
      ]);
      const kind = readValue(record, ["type", "kind", "rūšis"]);
      const vatClassification = readValue(record, [
        "vat classification",
        "vat classifier",
        "pvm klasifikatorius",
      ]);
      return [
        {
          ...existing,
          id: existing?.id ?? `counterparty-import-${Date.now()}-${index}`,
          name,
          company_code: companyCode,
          vat_code: readValue(record, ["vat code", "pvm code", "pvm kodas"]),
          client_since:
            Number(readValue(record, ["client since"])) ||
            existing?.client_since ||
            new Date().getFullYear(),
          action_required: existing?.action_required ?? 0,
          country: country || existing?.country || managedTaxCountries[0] || "",
          counterparty_country:
            country || existing?.counterparty_country || managedTaxCountries[0] || "",
          legal_form: legalForm || existing?.legal_form || managedLegalForms[0] || "",
          counterparty_legal_status:
            legalForm || existing?.counterparty_legal_status || managedLegalForms[0] || "",
          counterparty_kind:
            kind || existing?.counterparty_kind || "Buyer/Supplier",
          counterparty_vat_classification:
            vatClassification ||
            existing?.counterparty_vat_classification ||
            managedVatClassificationTemplates[0] ||
            "",
          phone: readValue(record, ["phone", "phone number", "tel nr"]),
          email: readValue(record, ["email", "e-mail", "el paštas"]),
          counterparty_notes: readValue(record, ["notes", "pastabos"]),
          counterparty_bank_accounts:
            existing?.counterparty_bank_accounts ?? "[]",
          counterparty_gl_template: existing?.counterparty_gl_template ?? "",
          counterparty_gl_accounts: existing?.counterparty_gl_accounts ?? "[]",
          counterparty_gl_settings:
            existing?.counterparty_gl_settings ??
            JSON.stringify(mergeCounterpartyGlSettings()),
          counterparty_created_by:
            existing?.counterparty_created_by ?? "Administrator",
          counterparty_created_at: existing?.counterparty_created_at ?? now,
          counterparty_activity_log: JSON.stringify([
            {
              date: now,
              user: "Administrator",
              action: existing
                ? "Counterparty updated by import"
                : "Counterparty imported",
            },
          ]),
        },
      ];
    });

    if (!imported.length) {
      throw new Error(
        "No valid counterparty records found. Name and Code are required.",
      );
    }
    const importedByCode = new Map(
      imported.map((item) => [item.company_code.toLocaleLowerCase(), item]),
    );
    const next = [
      ...companies.map(
        (item) =>
          importedByCode.get(item.company_code.toLocaleLowerCase()) ?? item,
      ),
      ...imported.filter(
        (item) =>
          !companies.some(
            (existing) =>
              existing.company_code.toLocaleLowerCase() ===
              item.company_code.toLocaleLowerCase(),
          ),
      ),
    ];
    window.localStorage.setItem(
      "finansu-harmonija:v7:settings:counterparties",
      JSON.stringify(next),
    );
    window.dispatchEvent(new CustomEvent("counterparties-updated"));
    setCompanies(next);
    setPage(1);
  };

  const handleOrganizationImport = async (file: File) => {
    let records: Record<string, unknown>[] = [];
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(await file.text()) as unknown;
      records = Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : parsed && typeof parsed === "object"
          ? [parsed as Record<string, unknown>]
          : [];
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      records = sheet
        ? (XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<
            string,
            unknown
          >[])
        : [];
    }
    const normalizeKey = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const readValue = (
      record: Record<string, unknown>,
      aliases: string[],
    ) => {
      const aliasKeys = aliases.map(normalizeKey);
      const match = Object.entries(record).find(([key]) =>
        aliasKeys.includes(normalizeKey(key)),
      );
      return match?.[1] == null ? "" : String(match[1]).trim();
    };
    const imported = records.flatMap(
      (record): Array<Record<string, string | number>> => {
      const name = readValue(record, [
        "name",
        "organization name",
        "company name",
        "pavadinimas",
      ]);
      const companyCode = readValue(record, [
        "code",
        "organization code",
        "company code",
        "kodas",
      ]);
      if (!name || !companyCode) return [];
      return [
        {
          name,
          company_code: companyCode,
          vat_code:
            readValue(record, ["vat code", "pvm code", "pvm kodas"]) ||
            companyCode,
          client_since:
            Number(readValue(record, ["client since"])) ||
            new Date().getFullYear(),
          action_required:
            Number(readValue(record, ["action required"])) || 0,
          company_status:
            readValue(record, ["status", "company status"]) || "Active",
          tax_country:
            readValue(record, ["tax country", "country", "šalis"]) ||
            managedTaxCountries[0] ||
            "",
          legal_form:
            readValue(record, ["legal form", "teisinė forma"]) ||
            managedLegalForms[0] ||
            "",
          base_currency:
            readValue(record, ["base currency", "currency", "valiuta"]) ||
            managedBaseCurrencies[0] ||
            "EUR",
          general_ledger:
            readValue(record, ["general ledger", "gl template", "dk"]) ||
            loadGeneralLedgerTemplateNames()[0] ||
            "",
          address: readValue(record, ["address", "registered address"]),
          email: readValue(record, ["email", "e-mail"]),
          phone: readValue(record, ["phone", "phone number"]),
          website: readValue(record, ["website"]),
          client_notes: readValue(record, ["notes", "client notes"]),
        },
      ];
      },
    );
    if (!imported.length) {
      throw new Error(
        "No valid organization records found. Company name and Company code are required.",
      );
    }
    const { error: importError } = await supabase
      .from("companies")
      .upsert(imported, { onConflict: "company_code" });
    if (importError) throw new Error(importError.message);
    await fetchCompanies();
    setPage(1);
  };

  const handleTableScroll = () => {
    const el = tableScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollRatio(max > 0 ? el.scrollLeft / max : 0);
  };

  const filterOptions = useMemo(
    () =>
      Object.fromEntries(
        ALL_COLUMNS.map((column) => [
          column.key,
          Array.from(
            new Set(
              companies
                .map((company) => getCompanyCellText(column.key, company))
                .filter(Boolean),
            ),
          ).sort((left, right) =>
            left.localeCompare(right, undefined, {
              numeric: true,
              sensitivity: "base",
            }),
          ),
        ]),
      ) as Record<string, string[]>,
    [companies],
  );

  const filteredCompanies = useMemo(
    () =>
      companies.filter((company) => {
        if (
          !matchesTextSearch(
            ALL_COLUMNS.map((column) =>
              getCompanyCellText(column.key, company),
            ),
            query,
          )
        )
          return false;
        return visibleFilterKeys.every((key) => {
          const selectedValues = filterValues[key] ?? [];
          return (
            selectedValues.length === 0 ||
            selectedValues.includes(getCompanyCellText(key, company))
          );
        });
      }),
    [companies, filterValues, query, visibleFilterKeys],
  );

  const {
    sortedRows: sorted,
    changeSort,
    directionFor,
  } = useMultiColumnSort(filteredCompanies, (company, key) =>
    getCompanyCellText(key, company),
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const rows = viewAll
    ? sorted
    : sorted.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const isSpinning = refreshing || loading;
  const colMap = new Map(columns.map((c) => [c.key, c]));
  const activeCols = columnOrder
    .map((k) => colMap.get(k)!)
    .filter((c) => c && visibleColumns.has(c.key));
  const actionColumnWidth =
    entityLabel === "counterparty"
      ? 76
      : entityLabel === "organization"
        ? 44
        : 136;
  const applyPendingFilters = () => {
    const nextValues = { ...filterValues };
    visibleFilterKeys.forEach((key) => {
      if (!pendingFilterKeys.includes(key)) delete nextValues[key];
    });
    setFilterValues(nextValues);
    setVisibleFilterKeys(pendingFilterKeys);
    setAddFilterOpen(false);
    setPage(1);
    window.requestAnimationFrame(() => {
      pageRootRef.current
        ?.closest<HTMLElement>(".overflow-y-auto")
        ?.scrollTo({ top: 0, behavior: "auto" });
    });
  };

  return (
    <div
      ref={pageRootRef}
      className={`relative flex flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px] ${dataSource === "counterparties" ? "h-full min-h-0 overflow-hidden" : "min-h-full"}`}
    >
      {/* Header */}
      <PageHeader
        title={title}
        actions={
          allowCreate ? (
            <PageActionButton
              onClick={() => {
                if (onCreate) {
                  onCreate();
                  return;
                }
                setCreateError("");
                setEditingCounterpartyId(null);
                setOrganizationFormSection("general");
                setCounterpartySection("general");
                setCounterpartyBankAccounts([]);
                setCounterpartyGlTemplate("");
                setCounterpartyGlAccounts([]);
                setCounterpartyGlRole("Buyer");
                setCounterpartyGlSettings(mergeCounterpartyGlSettings());
                if (entityLabel === "counterparty") {
                  setNewCompany((current) => ({
                    ...current,
                    name: "",
                    companyCode: "",
                    vatCode: "",
                    counterpartyCountry: managedTaxCountries[0] ?? "",
                    legalForm: managedLegalForms[0] ?? "",
                    counterpartyKind: "Buyer/Supplier",
                    counterpartyVatClassification:
                      managedVatClassificationTemplates[0] ?? "",
                    counterpartyPhone: "",
                    counterpartyEmail: "",
                    counterpartyNotes: "",
                  }));
                }
                setCreateOpen(true);
              }}
            >
              Create new
            </PageActionButton>
          ) : undefined
        }
      />

      <SystemBreadcrumb items={breadcrumbs?.length ? breadcrumbs : [title]} />

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        {/* Filter bar */}
        <div className="system-table-toolbar relative h-7 min-h-7 flex-shrink-0">
          <div className="flex h-7 min-h-7 items-center">
            <div ref={filterMenuRef} className="flex min-w-0 flex-1 flex-row flex-nowrap items-center gap-1 pr-[128px]">
              {visibleFilterKeys.map((key) => {
                const column = ALL_COLUMNS.find((item) => item.key === key);
                if (!column) return null;
                const selectedValues = filterValues[key] ?? [];
                const isOpen = openFilter === key;
                const displayValue =
                  selectedValues.length > 0 ? selectedValues.join(", ") : "";

                return (
                  <div key={key} className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenFilter((current) =>
                          current === key ? null : key,
                        );
                        setAddFilterOpen(false);
                      }}
                      className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
                      aria-expanded={isOpen}
                      aria-label={`Filter by ${entityColumnLabel(column.label, entityLabel)}`}
                    >
                      <span className="truncate whitespace-nowrap">
                        {entityColumnLabel(column.label, entityLabel)}
                        {displayValue && (
                          <span className="text-[#10233A]">
                            : {displayValue}
                          </span>
                        )}
                      </span>
                      {selectedValues.length > 0 ? (
                        <X
                          size={15}
                          className="flex-shrink-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFilterValues((current) => ({
                              ...current,
                              [key]: [],
                            }));
                            setPage(1);
                          }}
                        />
                      ) : (
                        <ChevronDown
                          size={15}
                          className={`flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {isOpen && (
                      <div className="absolute left-0 top-[32px] z-40 min-w-[220px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white py-1 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                        <button
                          type="button"
                          data-system-action={
                            entityLabel === "organization" ||
                            entityLabel === "counterparty"
                              ? undefined
                              : "true"
                          }
                          onClick={() => {
                            setFilterValues((current) => ({
                              ...current,
                              [key]: [],
                            }));
                            setPage(1);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#F2F7FC]"
                        >
                          <span
                            className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${selectedValues.length === 0 ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                          >
                            {selectedValues.length === 0 && (
                              <Check
                                size={13}
                                strokeWidth={2.5}
                                className="text-white"
                              />
                            )}
                          </span>
                          <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                            All
                          </span>
                        </button>
                        <div className="max-h-[240px] overflow-y-auto">
                          {(filterOptions[key] ?? []).map((option) => {
                            const checked = selectedValues.includes(option);
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setFilterValues((current) => {
                                    const values = current[key] ?? [];
                                    return {
                                      ...current,
                                      [key]: checked
                                        ? values.filter(
                                            (value) => value !== option,
                                          )
                                        : [...values, option],
                                    };
                                  });
                                  setPage(1);
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#F2F7FC]"
                              >
                                <span
                                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                                >
                                  {checked && (
                                    <Check
                                      size={13}
                                      strokeWidth={2.5}
                                      className="text-white"
                                    />
                                  )}
                                </span>
                                <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                                  {option}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAddFilterOpen((current) => {
                      if (!current) setPendingFilterKeys(visibleFilterKeys);
                      return !current;
                    });
                    setOpenFilter(null);
                  }}
                  className="flex h-7 items-center gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
                  aria-expanded={addFilterOpen}
                >
                  <Plus size={15} />
                  <span>Add filters</span>
                </button>
                {addFilterOpen && (
                  <div
                    className="absolute left-0 top-[32px] z-40 min-w-[240px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyPendingFilters();
                      }
                    }}
                  >
                    <div className="max-h-[300px] overflow-y-auto">
                      {ALL_COLUMNS.map((column) => {
                        const checked = pendingFilterKeys.includes(column.key);
                        return (
                          <button
                            key={column.key}
                            type="button"
                            onClick={() =>
                              setPendingFilterKeys((current) =>
                                checked
                                  ? current.filter((key) => key !== column.key)
                                  : [...current, column.key],
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[#F2F7FC]"
                          >
                            <span
                              className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                            >
                              {checked && (
                                <Check
                                  size={13}
                                  strokeWidth={2.5}
                                  className="text-white"
                                />
                              )}
                            </span>
                            <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                              {entityColumnLabel(column.label, entityLabel)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-[#E5EDF9] px-2 pt-2">
                      <span className="font-montserrat text-[11px] text-[#7288A3]">
                        Enter to apply
                      </span>
                      <button
                        type="button"
                        onClick={applyPendingFilters}
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
                  setVisibleFilterKeys([]);
                  setPendingFilterKeys([]);
                  setFilterValues({});
                  setAddFilterOpen(false);
                  setOpenFilter(null);
                  setPage(1);
                }}
                className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
              >
                <X size={15} />
                <span>Clear filters</span>
              </button>

              <OcrSearchField
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
                ariaLabel={`Search ${entityPlural(entityLabel)}`}
                className="min-w-[140px] max-w-[260px] flex-1"
              />
            </div>

            <div className="absolute right-0 top-0 flex h-7 flex-row items-center gap-4 rounded bg-white">
              <ColumnSettingsButton onClick={openColSettings} />
              {(dataSource === "counterparties" ||
                entityLabel === "organization") && (
                <button
                  type="button"
                  data-button-family="export"
                  aria-label={`EXPORT ${title}`}
                  title="EXPORT"
                  onClick={() => setExportOpen(true)}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
                >
                  <Download size={16} />
                </button>
              )}
              <ImportButton
                scope={title}
                onImport={
                  dataSource === "counterparties"
                    ? handleCounterpartyImport
                    : entityLabel === "organization"
                      ? handleOrganizationImport
                      : undefined
                }
              />
              <button
                className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors"
                onClick={handleRefresh}
                title="REFRESH ALL"
              >
                <RefreshCw
                  size={16}
                  className={isSpinning ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col gap-12">
          <div
            className={`scrollbar-hide ${dataSource === "counterparties" ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto"}`}
            ref={tableScrollRef}
            onScroll={handleTableScroll}
          >
            <div
              style={{
                minWidth: `${activeCols.reduce((s, c) => s + c.width + 12, 0) + 2 + actionColumnWidth + 12}px`,
              }}
            >
              {/* Column headers */}
              <div className="flex flex-row items-center pl-3 gap-3 h-5 mb-4">
                {activeCols.map((col) => {
                  const colIdx = columns.findIndex((c) => c.key === col.key);
                  return (
                    <div
                      key={col.key}
                      className="flex flex-row items-center flex-shrink-0"
                    >
                      <div
                        className="relative flex flex-row items-center gap-[6px] flex-shrink-0"
                        style={{ width: col.width }}
                      >
                        <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">
                          {col.label}
                        </span>
                        <ColumnSortButton
                          columnLabel={col.label}
                          direction={directionFor(col.key)}
                          onDirectionChange={(direction) => {
                            changeSort(col.key, direction);
                            setPage(1);
                          }}
                        />
                        <ResizeHandle
                          onMouseDown={(e) => startResize(colIdx, e)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {loading && !refreshing ? (
                  Array.from({ length: ROWS_PER_PAGE }).map((_, i) => (
                    <div
                      key={i}
                      className={`group flex h-9 w-full flex-row items-center rounded-lg transition-colors ${i % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                    >
                      <div className="flex-1 px-3 py-[9px]">
                        <div
                          className="h-3 bg-[#E5EDF9] rounded animate-pulse"
                          style={{ width: `${40 + ((i * 15) % 40)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : error ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="font-montserrat text-[13px] text-red-500">
                      {error}
                    </span>
                  </div>
                ) : rows.length === 0 ? (
                  allowCreate && companies.length === 0 ? (
                    <CreateableEmptyState
                      title={`No ${entityPlural(entityLabel)} found`}
                      onCreate={() => {
                        if (onCreate) {
                          onCreate();
                          return;
                        }
                        setCreateError("");
                        setEditingCounterpartyId(null);
                        setOrganizationFormSection("general");
                        setCounterpartySection("general");
                        setCounterpartyBankAccounts([]);
                        setCounterpartyGlTemplate("");
                        setCounterpartyGlAccounts([]);
                        setCounterpartyGlRole("Buyer");
                        setCounterpartyGlSettings(mergeCounterpartyGlSettings());
                        setCreateOpen(true);
                      }}
                    />
                  ) : (
                    <div className="flex min-h-[220px] items-center justify-center py-8">
                      <span className="font-montserrat text-[13px] text-[#7288A3]">
                        No {entityPlural(entityLabel)} found.
                      </span>
                    </div>
                  )
                ) : (
                  rows.map((row, i) => (
                    <div
                      key={row.id}
                      className={`group flex h-9 w-full flex-row items-center rounded-lg transition-colors hover:bg-[#E7F4F9] ${i % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
                    >
                      <div className="flex flex-row items-center px-2 py-[9px] gap-3 flex-1 h-9 min-w-0">
                        {activeCols.map((col) => (
                          <div
                            key={col.key}
                            className="flex-shrink-0"
                            style={{ width: col.width }}
                          >
                            {renderDataCell(col.key, row)}
                          </div>
                        ))}
                      </div>

                      <div
                        className={`flex h-9 flex-shrink-0 flex-row items-center justify-end gap-1 p-1 transition-colors ${i % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} group-hover:bg-[#E7F4F9]`}
                        style={{ width: actionColumnWidth }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (entityLabel === "counterparty") {
                              openCounterpartyEditor(row);
                              return;
                            }
                            onViewDetails?.(row);
                          }}
                          title={
                            entityLabel === "organization" ||
                            entityLabel === "counterparty"
                              ? "EDIT"
                              : "Open company"
                          }
                          aria-label={
                            entityLabel === "organization" ||
                            entityLabel === "counterparty"
                              ? `EDIT ${row.name}`
                              : `Open company ${row.name}`
                          }
                          className={`flex h-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors ${entityLabel === "organization" || entityLabel === "counterparty" ? "w-7" : "min-w-[128px] px-3"}`}
                        >
                          {entityLabel === "organization" ||
                          entityLabel === "counterparty" ? (
                            <Pencil size={14} />
                          ) : (
                            <span className="whitespace-nowrap font-montserrat text-[12px] font-medium leading-[18px]">
                              Open company
                            </span>
                          )}
                        </button>
                        {entityLabel === "counterparty" && (
                          <button
                            type="button"
                            onClick={() => setCounterpartyToDelete(row)}
                            title="DELETE"
                            aria-label={`DELETE ${row.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#D64545] hover:text-[#D64545]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <HorizontalTableScrollbar scrollRef={tableScrollRef} />

          {/* Footer */}
          <div className="flex flex-row flex-wrap justify-between items-center gap-4 flex-shrink-0">
            <TablePagination
              currentPage={viewAll ? 1 : page}
              totalPages={viewAll ? 1 : totalPages}
              itemCount={sorted.length}
              itemsPerPage={
                viewAll ? Math.max(1, sorted.length) : ROWS_PER_PAGE
              }
              onPageChange={viewAll ? () => undefined : setPage}
              onShowMore={() => {
                setViewAll((current) => !current);
                setPage(1);
              }}
              showMoreLabel={viewAll ? "Default" : "Show more"}
              allItemsVisible={viewAll}
            />
          </div>
        </div>
      </div>

      {/* Column settings drawer */}
      {colSettingsOpen && (
        <ColumnSettingsPanel
          columns={columnOrder
            .map((key) => columns.find((column) => column.key === key)!)
            .filter(Boolean)
            .map((column) => ({
              ...column,
              visible: visibleColumns.has(column.key),
            }))}
          defaultColumns={ALL_COLUMNS.map((column) => ({
            ...column,
            label: entityColumnLabel(column.label, entityLabel),
            visible: DEFAULT_VISIBLE.has(column.key),
          }))}
          onSave={saveColSettings}
          onClose={() => setColSettingsOpen(false)}
        />
      )}

      {createOpen && (
        <div
          className={
            entityLabel === "counterparty"
              ? "fixed inset-0 z-[130] flex overflow-hidden bg-white"
              : "fixed inset-0 z-[130] flex justify-end bg-[#10233A]/10"
          }
          onClick={() => setCreateOpen(false)}
        >
          <aside
            className={`flex h-full min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-white ${
              entityLabel === "counterparty"
                ? "mx-auto w-full max-w-[1440px] gap-8 px-4 py-14 sm:px-8 lg:px-[72px]"
                : `gap-6 px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9] ${entityLabel === "organization" ? "w-[min(1040px,calc(100vw-24px))]" : "w-[380px]"}`
            }`}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Create new ${entityLabel}`}
          >
            {entityLabel === "counterparty" ? (
              <>
                <PageHeader
                  title={editingCounterpartyId ? "Edit counterparty" : "Create counterparty"}
                  className="max-w-[1440px]"
                  leading={
                    <button
                      type="button"
                      aria-label="Back to counterparties"
                      onClick={() => {
                        setCounterpartySection("general");
                        setEditingCounterpartyId(null);
                        setCounterpartyGlTemplate("");
                        setCounterpartyGlAccounts([]);
                        setCounterpartyGlRole("Buyer");
                        setCounterpartyGlSettings(mergeCounterpartyGlSettings());
                        setCreateOpen(false);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
                    >
                      <ArrowLeft size={20} />
                    </button>
                  }
                />
                <SystemBreadcrumb
                  items={[
                    "Settings",
                    "Counterparties",
                    editingCounterpartyId ? "Edit counterparty" : "Create counterparty",
                  ]}
                />
              </>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                  {`Create new ${entityLabel}`}
                </h2>
                <button
                  type="button"
                  aria-label={`Close create ${entityLabel}`}
                  onClick={() => {
                    setOrganizationFormSection("general");
                    setCreateOpen(false);
                  }}
                  className="text-[#7288A3] hover:text-[#10233A]"
                >
                  <X size={24} />
                </button>
              </div>
            )}
            {entityLabel === "organization" && (
              <div
                role="tablist"
                aria-label="Organization settings sections"
                className="flex border-b border-[#DDE7F0]"
              >
                {[
                  ["general", "Organization information"],
                  ["digitization", "Document digitization settings"],
                  ["sharepoint", "SharePoint settings"],
                  ["counterparties", "Counterparties Settings"],
                ].map(([section, label]) => {
                  const selected = organizationFormSection === section;
                  return (
                    <button
                      key={section}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() =>
                        setOrganizationFormSection(
                          section as
                            | "general"
                            | "digitization"
                            | "sharepoint"
                            | "counterparties",
                        )
                      }
                      className={`flex-1 border-b-2 px-2 py-3 font-montserrat text-[12px] font-semibold transition-colors ${
                        selected
                          ? "border-[#007EA7] text-[#007EA7]"
                          : "border-transparent text-[#7288A3] hover:text-[#10233A]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {entityLabel === "counterparty" && (
              <div
                role="tablist"
                aria-label="Counterparty sections"
                className="flex border-b border-[#DDE7F0]"
              >
                {[
                  ["general", "Main information"],
                  ["banking", "Bank information"],
                  ["glAccounts", "GL accounts"],
                  ["glSettings", "Currency Conversion"],
                  ["analysis", "Analysis & activity"],
                ].map(([section, label]) => {
                  const selected = counterpartySection === section;
                  return (
                    <button
                      key={section}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() =>
                        setCounterpartySection(
                          section as
                            | "general"
                            | "banking"
                            | "glAccounts"
                            | "glSettings"
                            | "analysis",
                        )
                      }
                      className={`border-b-2 px-5 py-3 font-montserrat text-[12px] font-semibold transition-colors ${
                        selected
                          ? "border-[#007EA7] text-[#007EA7]"
                          : "border-transparent text-[#7288A3] hover:text-[#10233A]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-4">
              {entityLabel === "counterparty" &&
                counterpartySection === "general" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
                      <span>
                        Name <span className="text-[#E45858]">*</span>
                      </span>
                      <input
                        value={newCompany.name}
                        onChange={(event) => {
                          setNewCompany((current) => ({
                            ...current,
                            name: event.target.value.replace(/["“”„]/g, ""),
                          }));
                          setCreateError("");
                        }}
                        placeholder="Praktika"
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                    <OrganizationSelect
                      label="Country *"
                      value={newCompany.counterpartyCountry}
                      options={managedTaxCountries}
                      allowCreate
                      referenceSection="Tax country"
                      onChange={(counterpartyCountry) =>
                        setNewCompany((current) => ({
                          ...current,
                          counterpartyCountry,
                        }))
                      }
                    />
                    <OrganizationSelect
                      label="Legal form *"
                      value={newCompany.legalForm}
                      options={managedLegalForms}
                      allowCreate
                      referenceSection="Legal form"
                      onChange={(legalForm) =>
                        setNewCompany((current) => ({
                          ...current,
                          legalForm,
                        }))
                      }
                    />
                    <OrganizationSelect
                      label="Type *"
                      value={newCompany.counterpartyKind}
                      options={COUNTERPARTY_KINDS}
                      onChange={(counterpartyKind) => {
                        setNewCompany((current) => ({
                          ...current,
                          counterpartyKind,
                        }));
                      }}
                    />
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
                      <span>
                        Code <span className="text-[#E45858]">*</span>
                      </span>
                      <input
                        value={newCompany.companyCode}
                        onChange={(event) => {
                          setNewCompany((current) => ({
                            ...current,
                            companyCode: event.target.value,
                          }));
                          setCreateError("");
                        }}
                        placeholder="234565443"
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
                      VAT code
                      <input
                        value={newCompany.vatCode}
                        onChange={(event) =>
                          setNewCompany((current) => ({
                            ...current,
                            vatCode: event.target.value,
                          }))
                        }
                        placeholder="LT100013324325435"
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                    <OrganizationSelect
                      label="VAT classification *"
                      value={newCompany.counterpartyVatClassification}
                      options={managedVatClassificationTemplates}
                      fixedMenu
                      strictOptions
                      onChange={(counterpartyVatClassification) =>
                        setNewCompany((current) => ({
                          ...current,
                          counterpartyVatClassification,
                        }))
                      }
                    />
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
                      Phone number
                      <input
                        type="tel"
                        value={newCompany.counterpartyPhone}
                        onChange={(event) =>
                          setNewCompany((current) => ({
                            ...current,
                            counterpartyPhone: event.target.value,
                          }))
                        }
                        placeholder="+37067000000"
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A]">
                      E-mail
                      <input
                        type="email"
                        value={newCompany.counterpartyEmail}
                        onChange={(event) =>
                          setNewCompany((current) => ({
                            ...current,
                            counterpartyEmail: event.target.value,
                          }))
                        }
                        placeholder="testas@naujas.lt"
                        className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 font-montserrat text-[13px] font-semibold text-[#10233A] md:col-span-2">
                      Notes
                      <textarea
                        rows={4}
                        value={newCompany.counterpartyNotes}
                        onChange={(event) =>
                          setNewCompany((current) => ({
                            ...current,
                            counterpartyNotes: event.target.value,
                          }))
                        }
                        placeholder="Add relevant counterparty notes"
                        className="resize-y rounded-lg border border-[#D3E1EC] px-[14px] py-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                      />
                    </label>
                  </div>
                )}
              {entityLabel === "counterparty" &&
                counterpartySection === "banking" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-montserrat text-[15px] font-semibold text-[#10233A]">
                          Bank accounts
                        </h3>
                        <p className="mt-1 max-w-[680px] font-montserrat text-[11px] leading-5 text-[#7288A3]">
                          Add one or more accounts. Only one account can be
                          primary and will be used for matching and payments.
                        </p>
                      </div>
                      <PageActionButton
                        onClick={() =>
                          setCounterpartyBankAccounts((current) => [
                            ...current,
                            {
                              id: `bank-${Date.now()}`,
                              iban: "",
                              bank: "",
                              bankCode: "",
                              swift: "",
                              primary: current.length === 0,
                            },
                          ])
                        }
                      >
                        Add bank account
                      </PageActionButton>
                    </div>
                    {counterpartyBankAccounts.length ? (
                      counterpartyBankAccounts.map((account, index) => (
                        <div
                          key={account.id}
                          className="rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-4"
                        >
                          <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Landmark size={17} className="text-[#7288A3]" />
                              <span className="font-montserrat text-[13px] font-semibold text-[#10233A]">
                                Bank account {index + 1}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setCounterpartyBankAccounts((current) =>
                                    current.map((item) => ({
                                      ...item,
                                      primary: item.id === account.id,
                                    })),
                                  )
                                }
                                className={`rounded-md px-3 py-1.5 font-montserrat text-[11px] font-semibold ${account.primary ? "bg-[#E7F4F9] text-[#007EA7]" : "border border-[#D3E1EC] text-[#7288A3]"}`}
                              >
                                {account.primary ? "Primary" : "Set primary"}
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete bank account ${index + 1}`}
                                onClick={() =>
                                  setCounterpartyBankAccounts((current) => {
                                    const next = current.filter(
                                      (item) => item.id !== account.id,
                                    );
                                    if (
                                      account.primary &&
                                      next.length &&
                                      !next.some((item) => item.primary)
                                    ) {
                                      next[0] = { ...next[0], primary: true };
                                    }
                                    return next;
                                  })
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#FCEEEE] hover:text-[#D64545]"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {[
                              ["iban", "Account number (IBAN)"],
                              ["bank", "Bank"],
                              ["bankCode", "Bank code"],
                              ["swift", "SWIFT/BIC code"],
                            ].map(([key, label]) => (
                              <label
                                key={key}
                                className="flex flex-col gap-1.5 font-montserrat text-[12px] font-semibold text-[#10233A]"
                              >
                                {label}
                                <input
                                  value={
                                    account[
                                      key as keyof CounterpartyBankAccount
                                    ] as string
                                  }
                                  onChange={(event) =>
                                    setCounterpartyBankAccounts((current) =>
                                      current.map((item) =>
                                        item.id === account.id
                                          ? {
                                              ...item,
                                              [key]: event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="h-10 rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] text-[#10233A] outline-none focus:border-[#007EA7]"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#D3E1EC] text-[#7288A3]">
                        <Landmark size={30} strokeWidth={1.5} />
                        <span className="font-montserrat text-[13px] font-semibold">
                          No bank accounts added
                        </span>
                        <PageActionButton
                          onClick={() =>
                            setCounterpartyBankAccounts([
                              {
                                id: `bank-${Date.now()}`,
                                iban: "",
                                bank: "",
                                bankCode: "",
                                swift: "",
                                primary: true,
                              },
                            ])
                          }
                        >
                          Add bank account
                        </PageActionButton>
                      </div>
                    )}
                  </div>
                )}
              {entityLabel === "counterparty" &&
                counterpartySection === "glAccounts" && (
                  <div className="flex flex-col gap-5">
                    <div>
                      <h3 className="font-montserrat text-[15px] font-semibold text-[#10233A]">
                        GL account template
                      </h3>
                      <p className="mt-1 font-montserrat text-[11px] leading-5 text-[#7288A3]">
                        Assign a system GL template, switch between Buyer and Seller, and edit the default accounts for this counterparty.
                      </p>
                    </div>
                    <OrganizationSelect
                      label="Template"
                      value={counterpartyGlTemplate}
                      options={loadGeneralLedgerTemplateNames()}
                      fixedMenu
                      strictOptions
                      onChange={(template) => {
                        setCounterpartyGlTemplate(template);
                        setCounterpartyGlAccounts(
                          defaultCounterpartyGlAccounts(),
                        );
                      }}
                    />
                    {counterpartyGlTemplate ? (
                      <div className="flex flex-col gap-4">
                        <div
                          role="tablist"
                          aria-label="GL account role"
                          className="flex w-fit rounded-lg border border-[#D3E1EC] bg-[#F8FDFF] p-1"
                        >
                          {(["Buyer", "Seller"] as const).map((role) => (
                            <button
                              key={role}
                              type="button"
                              role="tab"
                              aria-selected={counterpartyGlRole === role}
                              onClick={() => setCounterpartyGlRole(role)}
                              className={`min-w-[112px] rounded-md px-4 py-2 font-montserrat text-[12px] font-semibold transition-colors ${
                                counterpartyGlRole === role
                                  ? "bg-[#007EA7] text-white shadow-sm"
                                  : "text-[#7288A3] hover:bg-white hover:text-[#10233A]"
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-[#DDE7F0] bg-white">
                        <div className="grid grid-cols-[minmax(180px,1fr)_140px] border-b border-[#DDE7F0] bg-[#F8FDFF] px-4 py-3 font-montserrat text-[12px] font-semibold text-[#10233A]">
                          <span>Account purpose</span>
                          <span>GL account</span>
                        </div>
                        {Array.from(
                          new Set(
                            counterpartyGlAccounts
                              .filter((item) =>
                                counterpartyGlRole === "Buyer"
                                  ? item.section === "Buyer" ||
                                    item.section === "European VAT"
                                  : item.section === "Seller" ||
                                    item.section === "Import VAT",
                              )
                              .map((item) => item.section),
                          ),
                        ).map((section) => (
                          <div key={section}>
                            <div className="border-b border-[#E5EDF9] bg-[#FBFDFE] px-4 py-2 font-montserrat text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
                              {section}
                            </div>
                            {counterpartyGlAccounts
                              .filter((item) => item.section === section)
                              .map((item) => (
                                <label
                                  key={item.id}
                                  className="grid grid-cols-[minmax(180px,1fr)_140px] items-center border-b border-[#EEF3F7] px-4 py-2.5 last:border-b-0"
                                >
                                  <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                                    {item.label}
                                  </span>
                                  <input
                                    aria-label={`${section} ${item.label} GL account`}
                                    value={item.code}
                                    inputMode="numeric"
                                    onChange={(event) =>
                                      setCounterpartyGlAccounts((current) =>
                                        current.map((account) =>
                                          account.id === item.id
                                            ? { ...account, code: event.target.value }
                                            : account,
                                        ),
                                      )
                                    }
                                    className="h-9 rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                                  />
                                </label>
                              ))}
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-[#D3E1EC] px-6 text-center font-montserrat text-[12px] text-[#7288A3]">
                        Select a GL account template to fill the default accounts.
                      </div>
                    )}
                  </div>
                )}
              {entityLabel === "counterparty" &&
                counterpartySection === "glSettings" && (
                  <div className="flex flex-col gap-5">
                    <div>
                      <h3 className="font-montserrat text-[15px] font-semibold text-[#10233A]">
                        Currency Conversion
                      </h3>
                      <p className="mt-1 font-montserrat text-[11px] leading-5 text-[#7288A3]">
                        Assign GL accounts for currency conversion, other operations and cent rounding. Empty values are optional.
                      </p>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[#DDE7F0] bg-white">
                      <div className="grid grid-cols-[minmax(220px,1fr)_160px] border-b border-[#DDE7F0] bg-[#F8FDFF] px-4 py-3 font-montserrat text-[12px] font-semibold text-[#10233A]">
                        <span>Setting</span>
                        <span>GL account</span>
                      </div>
                      {Array.from(
                        new Set(counterpartyGlSettings.map((item) => item.section)),
                      ).map((section) => (
                        <div key={section}>
                          <div className="border-b border-[#E5EDF9] bg-[#FBFDFE] px-4 py-2 font-montserrat text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7288A3]">
                            {section}
                          </div>
                          {counterpartyGlSettings
                            .filter((item) => item.section === section)
                            .map((item) => (
                              <label
                                key={item.id}
                                className="grid grid-cols-[minmax(220px,1fr)_160px] items-center border-b border-[#EEF3F7] px-4 py-2.5 last:border-b-0"
                              >
                                <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                                  {item.label}
                                </span>
                                <input
                                  aria-label={`${item.label} GL account`}
                                  value={item.code}
                                  placeholder="Optional"
                                  onChange={(event) =>
                                    setCounterpartyGlSettings((current) =>
                                      current.map((setting) =>
                                        setting.id === item.id
                                          ? { ...setting, code: event.target.value }
                                          : setting,
                                      ),
                                    )
                                  }
                                  className="h-9 rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A7B8C9] focus:border-[#007EA7]"
                                />
                              </label>
                            ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              {entityLabel === "counterparty" &&
                counterpartySection === "analysis" && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[
                      {
                        icon: Banknote,
                        title: "Financial information",
                        lines: [
                          "Total purchases: 0.00 EUR",
                          "Total sales: 0.00 EUR",
                          "Current balance: 0.00 EUR",
                          "Overdue debt: 0.00 EUR",
                        ],
                      },
                      {
                        icon: FileText,
                        title: "Document information",
                        lines: [
                          "Issued invoices: 0",
                          "Received invoices: 0",
                          "Unpaid invoices: 0",
                          "Reconciliation history: no records",
                        ],
                      },
                      {
                        icon: Activity,
                        title: "Activity history",
                        lines: [
                          "Created by: Administrator",
                          "No data changes recorded",
                          "No user actions recorded",
                          "Activity Log starts after saving",
                        ],
                      },
                      {
                        icon: ShieldAlert,
                        title: "Risk indicators",
                        lines: [
                          "No overdue payments",
                          "Counterparty is active",
                          "No frequent data changes",
                        ],
                      },
                    ].map(({ icon: Icon, title: cardTitle, lines }) => (
                      <div
                        key={cardTitle}
                        className="rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-4"
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={18} className="text-[#7288A3]" />
                          <h3 className="font-montserrat text-[13px] font-semibold text-[#10233A]">
                            {cardTitle}
                          </h3>
                        </div>
                        <div className="mt-3 flex flex-col divide-y divide-[#E5EDF9]">
                          {lines.map((line) => (
                            <div
                              key={line}
                              className="py-2 font-montserrat text-[12px] text-[#10233A]"
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              {entityLabel === "organization" &&
                organizationFormSection === "general" && (
                  <>
                    <OrganizationSelect
                      label="Tax country *"
                      value={newCompany.taxCountry}
                      options={managedTaxCountries}
                      allowCreate
                      referenceSection="Tax country"
                      onChange={(taxCountry) => {
                        const mappedCurrency =
                          COUNTRY_CURRENCIES[taxCountry] ?? "EUR";
                        setNewCompany((current) => ({
                          ...current,
                          taxCountry,
                          legalForm: managedLegalForms.includes(
                            current.legalForm,
                          )
                            ? current.legalForm
                            : managedLegalForms[0],
                          baseCurrency: managedBaseCurrencies.includes(
                            mappedCurrency,
                          )
                            ? mappedCurrency
                            : managedBaseCurrencies[0],
                        }));
                      }}
                    />
                    <OrganizationSelect
                      label="Legal form *"
                      value={newCompany.legalForm}
                      options={managedLegalForms}
                      onChange={(legalForm) =>
                        setNewCompany((current) => ({
                          ...current,
                          legalForm,
                        }))
                      }
                      allowCreate
                      referenceSection="Legal form"
                    />
                    <OrganizationSelect
                      label="Base currency *"
                      value={newCompany.baseCurrency}
                      options={managedBaseCurrencies}
                      onChange={(baseCurrency) =>
                        setNewCompany((current) => ({
                          ...current,
                          baseCurrency,
                        }))
                      }
                      allowCreate
                      referenceSection="Base currency"
                    />
                  </>
                )}
              {entityLabel !== "counterparty" &&
                (entityLabel !== "organization" ||
                  organizationFormSection === "general") &&
                [
                  {
                    key: "name",
                    label:
                      entityLabel === "organization"
                        ? "Company name *"
                        : "Name *",
                    value: newCompany.name,
                    type: "text",
                  },
                  {
                    key: "companyCode",
                    label: "Company code *",
                    value: newCompany.companyCode,
                    type: "text",
                  },
                  {
                    key: "vatCode",
                    label: "VAT code",
                    value: newCompany.vatCode,
                    type: "text",
                  },
                  {
                    key: "clientSince",
                    label: "Client since",
                    value: newCompany.clientSince,
                    type: "number",
                  },
                  {
                    key: "actionRequired",
                    label: "Action required",
                    value: newCompany.actionRequired,
                    type: "number",
                  },
                ].map((field) => (
                  <label
                    key={field.key}
                    className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]"
                  >
                    <span>
                      {field.label.replace(" *", "")}
                      {field.label.trim().endsWith("*") && (
                        <span className="ml-1 text-[#E45858]">*</span>
                      )}
                    </span>
                    <input
                      type={field.type}
                      required={field.label.trim().endsWith("*")}
                      aria-required={field.label.trim().endsWith("*")}
                      value={field.value}
                      onChange={(event) => {
                        const value =
                          field.key === "name"
                            ? event.target.value.replace(/["“”„]/g, "")
                            : event.target.value;
                        setNewCompany((current) => ({
                          ...current,
                          [field.key]: value,
                        }));
                        setCreateError("");
                      }}
                      className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                    />
                  </label>
                ))}
              {entityLabel === "organization" &&
                organizationFormSection === "general" && (
                  <>
                    <OrganizationSelect
                      label="General ledger (DK) *"
                      value={newCompany.generalLedger}
                      options={loadGeneralLedgerTemplateNames()}
                      onChange={(generalLedger) =>
                        setNewCompany((current) => ({
                          ...current,
                          generalLedger,
                        }))
                      }
                    />
                    <h3 className="border-t border-[#E5EDF9] pt-5 font-montserrat text-[16px] font-semibold text-[#10233A]">
                      Accounting dimensions
                    </h3>
                    <DepartmentCodesEditor
                      value={newCompany.departmentCodes}
                      onChange={(departmentCodes) =>
                        setNewCompany((current) => ({
                          ...current,
                          departmentCodes,
                        }))
                      }
                    />
                    {[
                      {
                        key: "objects",
                        title: "Objects",
                        requiredLabel: "Object required",
                        itemSingular: "object",
                        itemPlural: "objects",
                      },
                      {
                        key: "projects",
                        title: "Projects",
                        requiredLabel: "Project required",
                        itemSingular: "project",
                        itemPlural: "projects",
                      },
                      {
                        key: "costCenters",
                        title: "Cost centers",
                        requiredLabel: "Cost center required",
                        itemSingular: "cost center",
                        itemPlural: "cost centers",
                      },
                      {
                        key: "productGroups",
                        title: "Product Group",
                        requiredLabel: "Product Group required",
                        itemSingular: "product group",
                        itemPlural: "product groups",
                      },
                      {
                        key: "documentSeries",
                        title: "Series",
                        requiredLabel: "Series required",
                        itemSingular: "series",
                        itemPlural: "series",
                      },
                    ].map((dimension) => (
                      <DepartmentCodesEditor
                        key={dimension.key}
                        value={
                          newCompany[
                            dimension.key as
                              | "objects"
                              | "projects"
                              | "documentSeries"
                              | "costCenters"
                              | "productGroups"
                          ]
                        }
                        onChange={(nextValue) =>
                          setNewCompany((current) => ({
                            ...current,
                            [dimension.key]: nextValue,
                          }))
                        }
                        title={dimension.title}
                        requiredLabel={dimension.requiredLabel}
                        itemSingular={dimension.itemSingular}
                        itemPlural={dimension.itemPlural}
                      />
                    ))}
                  </>
                )}
              {entityLabel === "organization" &&
                organizationFormSection === "digitization" && (
                  <>
                    <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">
                      Document digitization settings
                    </h3>
                    {[
                      [
                        "allowDocumentDuplicates",
                        "Allow document duplicates",
                        YES_NO_OPTIONS,
                      ],
                      [
                        "invoiceDigitization",
                        "Invoice digitization",
                        INVOICE_DIGITIZATION_OPTIONS,
                      ],
                      [
                        "documentSplitting",
                        "Document splitting",
                        DOCUMENT_SPLITTING_OPTIONS,
                      ],
                      [
                        "rejectNonInvoices",
                        "Reject non-invoices",
                        REJECT_NON_INVOICE_OPTIONS,
                      ],
                      [
                        "primaryExportFormat",
                        "Primary export format",
                        EXPORT_FORMAT_OPTIONS,
                      ],
                      [
                        "twoFactorAuthentication",
                        "Two-factor authentication (2FA)",
                        YES_NO_OPTIONS,
                      ],
                    ].map(([key, label, options]) => (
                      <OrganizationSelect
                        key={key as string}
                        label={label as string}
                        value={newCompany[key as keyof typeof newCompany]}
                        options={options as string[]}
                        onChange={(value) =>
                          setNewCompany((current) => ({
                            ...current,
                            [key as string]: value,
                          }))
                        }
                      />
                    ))}
                  </>
                )}
              {entityLabel === "organization" &&
                organizationFormSection === "sharepoint" && (
                  <>
                    <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">
                      SharePoint settings
                    </h3>
                    {[
                      ["sharepointClientId", "Client ID"],
                      ["sharepointClientSecret", "Client secret"],
                      ["sharepointTenantId", "Tenant ID"],
                      ["sharepointUrls", "SharePoint URLs"],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]"
                      >
                        {label}
                        <input
                          aria-label={label}
                          type={
                            key === "sharepointClientSecret"
                              ? "password"
                              : "text"
                          }
                          value={newCompany[key as keyof typeof newCompany]}
                          onChange={(event) =>
                            setNewCompany((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          className="h-[42px] rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                        />
                      </label>
                    ))}
                    <OrganizationSelect
                      label="Synchronization schedule"
                      value={newCompany.sharepointSyncSchedule}
                      options={SHAREPOINT_SYNC_OPTIONS}
                      onChange={(sharepointSyncSchedule) =>
                        setNewCompany((current) => ({
                          ...current,
                          sharepointSyncSchedule,
                        }))
                      }
                    />
                    {newCompany.sharepointSyncSchedule === "Every day" && (
                      <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">
                        Daily synchronization time
                        <input
                          aria-label="Daily synchronization time"
                          type="time"
                          value={newCompany.sharepointSyncTime}
                          onChange={(event) =>
                            setNewCompany((current) => ({
                              ...current,
                              sharepointSyncTime: event.target.value,
                            }))
                          }
                          className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
                        />
                      </label>
                    )}
                  </>
                )}
              {entityLabel === "organization" &&
                organizationFormSection === "counterparties" && (
                  <OrganizationCounterpartiesSettings
                    value={newCompany.counterpartiesSettings}
                    onChange={(counterpartiesSettings) =>
                      setNewCompany((current) => ({
                        ...current,
                        counterpartiesSettings,
                      }))
                    }
                  />
                )}
              {createError && (
                <p className="font-montserrat text-[12px] text-red-500">
                  {createError}
                </p>
              )}
            </div>
            <div
              className={`mt-auto flex gap-3 ${
                entityLabel === "counterparty"
                  ? "flex-row-reverse justify-start"
                  : "flex-col"
              }`}
            >
              <SaveButton
                className={
                  entityLabel === "counterparty" ? "min-w-[96px]" : ""
                }
                onClick={createCompany}
                disabled={
                  creating ||
                  !newCompany.name.trim() ||
                  !newCompany.companyCode.trim() ||
                  (entityLabel === "organization" &&
                    (!newCompany.taxCountry ||
                      !newCompany.legalForm ||
                      !newCompany.baseCurrency ||
                      !newCompany.generalLedger)) ||
                  (entityLabel === "counterparty" &&
                    (!newCompany.counterpartyCountry ||
                      !newCompany.legalForm ||
                      !newCompany.counterpartyKind ||
                      !newCompany.counterpartyVatClassification))
                }
              >
                {creating
                  ? "Saving..."
                  : editingCounterpartyId
                    ? "Save changes"
                    : "Save"}
              </SaveButton>
              {entityLabel === "counterparty" ? (
                <CancelButton
                  className="min-w-[96px]"
                  onClick={() => {
                    setCounterpartySection("general");
                    setEditingCounterpartyId(null);
                    setCounterpartyGlTemplate("");
                    setCounterpartyGlAccounts([]);
                    setCounterpartyGlRole("Buyer");
                    setCounterpartyGlSettings(mergeCounterpartyGlSettings());
                    setCreateOpen(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOrganizationFormSection("general");
                    setCreateOpen(false);
                  }}
                  className="h-[42px] rounded-lg border-2 border-[#D3E1EC] font-montserrat text-[16px] font-semibold text-[#7288A3] hover:border-[#007EA7]"
                >
                  Cancel
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {counterpartyToDelete && (
        <div
          className="fixed inset-0 z-[120] flex justify-end bg-[#10233A]/20"
          onMouseDown={() => setCounterpartyToDelete(null)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-counterparty-title"
            className="h-full w-[340px] bg-white px-6 py-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                id="delete-counterparty-title"
                className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]"
              >
                Delete counterparty
              </h2>
              <button
                type="button"
                aria-label="Close delete counterparty"
                onClick={() => setCounterpartyToDelete(null)}
                className="text-[#7288A3] transition-colors hover:text-[#10233A]"
              >
                <X size={24} />
              </button>
            </div>
            <p className="mt-6 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">
              Are you sure that you want to delete {counterpartyToDelete.name}?
            </p>
            <div className="mt-8 flex gap-2">
              <button
                type="button"
                onClick={() => setCounterpartyToDelete(null)}
                className="h-[42px] flex-1 rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] transition-colors hover:border-[#007EA7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteCounterparty}
                className="h-[42px] flex-1 rounded-lg bg-[#D64545] px-4 font-montserrat text-[16px] font-semibold text-white transition-colors hover:bg-[#bd3535]"
              >
                Delete
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Export drawer */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="relative h-full w-[340px] bg-white flex flex-col gap-6 px-6 pt-6 pb-8 overflow-y-auto"
            style={{ boxShadow: "-2px 0px 0px #E5EDF9" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-row justify-between items-center">
              <span className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">
                EXPORT
              </span>
              <button
                onClick={() => setExportOpen(false)}
                className="text-[#7288A3] hover:text-[#10233A] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 bg-[#F2F5F9] rounded-lg p-3">
                <div className="flex flex-col gap-2">
                  {[
                    {
                      label: "Records to export",
                      value: sorted.length.toLocaleString(),
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col">
                      <span className="font-montserrat font-semibold text-[12px] leading-[140%] text-[#10233A]">
                        {item.label}
                      </span>
                      <span className="mt-[2px] font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
                  File format type <span className="text-red-500">*</span>
                </span>
                <SearchableSelect ariaLabel="File format type" value={exportFormat} onChange={setExportFormat} placeholder="Select format" options={[{ value: "csv", label: "CSV" }, { value: "xlsx", label: "XLSX" }, { value: "json", label: "JSON" }]} />
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-auto">
              <button
                data-system-action="true"
                className="w-full h-[42px] flex items-center justify-center bg-[#007EA7] rounded-lg hover:bg-[#006b8f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleExport}
                disabled={!exportFormat}
              >
                <span className="font-montserrat font-semibold text-[16px] leading-6 text-white">
                  EXPORT
                </span>
              </button>
              <button
                onClick={() => setExportOpen(false)}
                className="w-full h-[42px] flex items-center justify-center bg-white border-2 border-[#D3E1EC] rounded-lg hover:border-[#007EA7] transition-colors"
              >
                <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3]">
                  Cancel
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
