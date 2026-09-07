import {
  ChevronDown,
  Trash2,
  Upload,
  Loader2,
  Scissors,
  Plus,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase, type Company } from "../lib/supabase";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import { SaveButton } from "./ScopedActionButtons";
import { HeaderBackButton } from "./SystemNavigation";
import { getCurrentUserName } from "../lib/currentUser";
import { loadCompanyGeneralLedgerAccountOptions } from "./GeneralLedgerView";
import GeneralLedgerAccountSelect from "./GeneralLedgerAccountSelect";
import SearchableSelect from "./SearchableSelect";
import {
  loadOrganizationReferenceRecords,
  loadOrganizationReferenceValues,
} from "./OrganizationReferenceValuesView";
import { ensureOrganizationProductGroup } from "../lib/organizationProductGroups";
import { loadOperationDateValidationRule } from "./OperationDateValidationView";
import {
  hasAdministratorRole,
  loadLinkedDirectoryUsers,
  SETTINGS_DATA_CHANGED_EVENT,
  type LinkedDirectoryUser,
} from "../lib/linkedSettingsData";

function loadAccountableUsers() {
  return loadLinkedDirectoryUsers("Internal users").filter(
    (user) =>
      (user.status ?? "Enabled").toLocaleLowerCase() !== "disabled" &&
      !hasAdministratorRole(user),
  );
}

const COUNTERPARTIES_STORAGE_KEY =
  "finansu-harmonija:v7:settings:counterparties";

function loadCounterparties(): Company[] {
  try {
    const stored = window.localStorage.getItem(COUNTERPARTIES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as Company[]) : [];
  } catch {
    return [];
  }
}

type Document = {
  id: string;
  companyId: string;
  receiveDate: string;
  clientCounterparty: string;
  counterpartyId: string;
  counterpartyCode: string;
  documentType: string;
  source: string;
  totalAmount: string;
  dueEndDate: string;
  fileCase: string;
  orderNo: string;
  number: string;
  type: string;
  documentDate: string;
  documentPurpose: string;
  invoiceContractDate: string;
  operationDate: string;
  expenseAccount: string;
  vatClassifier: string;
  currency: string;
  amountWithoutVat: string;
  vat: string;
  vatPercent: string;
  departmentCode: string;
  objectProject: string;
  validForm: string;
  accountableResponsible: string;
  costCenter: string;
  series: string;
  accountingNoteStatus?: string;
  debit?: string;
  credit?: string;
  status: string;
  imageUrl: string | null;
};

type Props = {
  doc: Document;
  readOnly?: boolean;
  companyName?: string;
  generalLedgerName?: string;
  onOpenGeneralLedger?: () => void;
  onClose: () => void;
  onImageUpload?: (docId: string, imageUrl: string) => void;
  onSaved?: (
    docId: string,
    values: {
      amountWithoutVat: string;
      clientCounterparty: string;
      counterpartyId: string;
      counterpartyCode: string;
      accountableResponsible: string;
      invoiceContractDate: string;
      operationDate: string;
      dueEndDate: string;
      number: string;
      orderNo: string;
      currency: string;
      vat: string;
      vatPercent: string;
      totalAmount: string;
      departmentCode: string;
      objectProject: string;
      series: string;
      costCenter: string;
      expenseAccount: string;
      vatClassifier: string;
      debit: string;
      credit: string;
      hasProductDetails: boolean;
      lineItems: LineItem[];
      summaryLineItems: LineItem[];
    },
  ) => void;
};

function Field({
  label,
  value,
  grey,
  dropdown,
}: {
  label: string;
  value: string;
  grey?: boolean;
  dropdown?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">
        {label}
      </span>
      <div
        className="flex items-center justify-between px-2 py-[6px] border border-[#D3E1EC] rounded-md h-8"
        style={{ background: grey ? "#F7F7F7" : "#FFFFFF" }}
      >
        <span
          className="font-montserrat font-medium text-[14px] leading-5 truncate"
          style={{ color: grey ? "#828588" : "#10233A" }}
        >
          {value || "—"}
        </span>
        {dropdown && (
          <ChevronDown size={16} className="text-[#7288A3] flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

function EditablePartyField({
  label,
  value,
  selectedId,
  counterparties,
  onSelect,
}: {
  label: string;
  value: string;
  selectedId: string;
  counterparties: Company[];
  onSelect: (counterparty: Company) => void;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
        {label}
      </span>
      <SearchableSelect ariaLabel={label} value={selectedId} placeholder={value || "Select counterparty"} emptyMessage="No counterparties configured" options={counterparties.map((counterparty) => ({ value: counterparty.id, label: `${counterparty.name}${counterparty.company_code ? ` · ${counterparty.company_code}` : ""}` }))} onChange={(id) => { const counterparty = counterparties.find((item) => item.id === id); if (counterparty) onSelect(counterparty); }} className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-9 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]" />
    </div>
  );
}

function AccountablePersonField({
  value,
  users,
  onChange,
}: {
  value: string;
  users: LinkedDirectoryUser[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
        Accountable person
      </span>
      <SearchableSelect ariaLabel="Accountable person" value={value} placeholder="Select internal user" emptyMessage="No internal users configured" options={users.map((user) => { const name = user.fullName || user.username || user.email || "Unnamed user"; return { value: name, label: user.email && user.email !== name ? `${name} · ${user.email}` : name }; })} onChange={onChange} className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-9 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]" />
    </div>
  );
}

function EditableValueField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
        {label}
      </span>
      <input
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full rounded-md border border-[#D3E1EC] px-2 font-montserrat text-[14px] font-medium leading-5 outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7] ${readOnly ? "cursor-default bg-[#F3F6F8] text-[#7288A3]" : "bg-white text-[#10233A]"}`}
        placeholder="—"
      />
    </label>
  );
}

function EditableOptionField({
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
  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">{label}</span>
      <SearchableSelect ariaLabel={label} value={value} options={options} onChange={onChange} placeholder="Select value" className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-9 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]" />
    </div>
  );
}

function Cell({
  value,
  width,
  grey,
  dropdown,
}: {
  value: string;
  width: number;
  grey?: boolean;
  dropdown?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-2 py-1 border border-[#D3E1EC] rounded text-[12px] leading-[18px] h-[26px] flex-shrink-0"
      style={{ width, background: grey ? "#F7F7F7" : "#FFFFFF" }}
    >
      <span
        className="font-montserrat font-medium truncate"
        style={{ color: grey ? "#828588" : "#10233A" }}
      >
        {value || ""}
      </span>
      {dropdown && (
        <ChevronDown size={12} className="text-[#7288A3] flex-shrink-0" />
      )}
    </div>
  );
}

function EditCell({
  value,
  width,
  grey,
  readOnly,
  onChange,
}: {
  value: string;
  width: number;
  grey?: boolean;
  readOnly?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      className="flex-shrink-0 px-2 py-1 border border-[#D3E1EC] rounded text-[12px] leading-[18px] h-[26px] font-montserrat font-medium focus:outline-none focus:border-[#007EA7] transition-colors"
      style={{
        width,
        background: grey ? "#F7F7F7" : "#FFFFFF",
        color: grey ? "#828588" : "#10233A",
      }}
    />
  );
}

function PercentEditCell({
  value,
  width,
  onChange,
}: {
  value: string;
  width: number;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="flex h-[26px] flex-shrink-0 items-center rounded border border-[#D3E1EC] bg-white px-2 transition-colors focus-within:border-[#007EA7]"
      style={{ width }}
    >
      <input
        inputMode="decimal"
        value={value.replace(/%/g, "")}
        onChange={(event) => onChange(formatVatPercent(event.target.value))}
        className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none"
      />
      <span className="ml-0.5 flex-shrink-0 font-montserrat text-[12px] font-medium text-[#10233A]">
        %
      </span>
    </div>
  );
}

type LookupType =
  | "cost_center"
  | "series"
  | "object_project"
  | "department_code"
  | "vat_class"
  | "division"
  | "gl_account"
  | "product_group"
  | "unit";

function LookupDropdownCell({
  value,
  width,
  lookupType,
  companyId,
  generalLedgerName,
  onOpenGeneralLedger,
  onChange,
}: {
  value: string;
  width: number;
  lookupType: LookupType;
  companyId: string;
  generalLedgerName?: string;
  onOpenGeneralLedger?: () => void;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [optionLabels, setOptionLabels] = useState<Record<string, string>>({});
  const [newVal, setNewVal] = useState("");
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scopedLookupType =
    ["department_code", "cost_center", "object_project", "product_group", "series"].includes(lookupType) && companyId
      ? `${lookupType}::company::${companyId}`
      : lookupType;
  const filteredOptions = options.filter((option) =>
    `${option} ${optionLabels[option] ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    if (lookupType === "unit") {
      const unitRecords = loadOrganizationReferenceRecords("Unit").filter(
        (record) => record.status.toLocaleLowerCase() === "active",
      );
      setOptions(unitRecords.map((record) => record.code));
      setOptionLabels(
        Object.fromEntries(
          unitRecords.map((record) => [record.code, record.fullName]),
        ),
      );
      return;
    }
    supabase
      .from("lookup_values")
      .select("value")
      .eq("type", scopedLookupType)
      .order("value")
      .then(({ data }) => {
        const managedGlAccounts =
          lookupType === "gl_account"
            ? loadCompanyGeneralLedgerAccountOptions(
                companyId,
                generalLedgerName,
              )
            : [];
        setOptions(
          Array.from(new Set(
            lookupType === "gl_account"
              ? managedGlAccounts
              : (data ?? []).map((record) => String(record.value ?? "")),
          )).sort((left, right) =>
            left.localeCompare(right, undefined, { numeric: true }),
          ),
        );
      });
  }, [companyId, generalLedgerName, lookupType, open, scopedLookupType]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleAdd() {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    setAdding(true);
    await supabase
      .from("lookup_values")
      .upsert(
        { type: scopedLookupType, value: trimmed },
        { onConflict: "type,value" },
      );
    if (lookupType === "product_group") {
      await ensureOrganizationProductGroup(companyId, trimmed);
    }
    setOptions((prev) => [...new Set([...prev, trimmed])].sort());
    onChange(trimmed);
    setNewVal("");
    setAdding(false);
    setOpen(false);
  }

  if (lookupType === "gl_account") {
    return (
      <GeneralLedgerAccountSelect
        value={value}
        companyId={companyId}
        generalLedgerName={generalLedgerName}
        width={width}
        compact
        onChange={onChange}
        onOpenGeneralLedger={onOpenGeneralLedger}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-shrink-0"
      style={{ width }}
    >
      <input
        role="combobox"
        aria-label={
          lookupType === "unit"
            ? "Unit"
            : lookupType === "product_group"
              ? "Product group"
              : undefined
        }
        aria-expanded={open}
        value={open ? query : value}
        autoComplete="off"
        onFocus={(event) => { setQuery(""); setOpen(true); event.currentTarget.select(); }}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        className={`h-[26px] w-full rounded border bg-white px-2 py-1 pr-7 font-montserrat text-[12px] font-medium leading-[18px] outline-none transition-colors ${open ? "border-[#007EA7] ring-1 ring-[#007EA7]/20" : "border-[#D3E1EC] hover:border-[#A1B6C6]"}`}
        style={{ background: "#FFFFFF", color: value ? "#10233A" : "#A1B6C6" }}
      />
      <button type="button" tabIndex={-1} aria-label="Open options" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setOpen((current) => !current); }} className="absolute right-0 top-0 flex h-[26px] w-7 items-center justify-center text-[#7288A3]">
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={
            lookupType === "unit"
              ? "Unit options"
              : lookupType === "product_group"
                ? "Product group options"
                : undefined
          }
          className="absolute left-0 top-full z-[200] mt-1 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
          style={{ minWidth: lookupType === "unit" ? 240 : Math.max(width, 160) }}
        >
          <div className="max-h-40 overflow-y-auto">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-[#A1B6C6] font-montserrat">
                No options yet
              </div>
            )}
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === value}
                onClick={async () => {
                  if (lookupType === "product_group") {
                    await ensureOrganizationProductGroup(companyId, opt);
                  }
                  onChange(opt);
                  setOpen(false);
                  setQuery("");
                }}
                className={`flex min-h-9 w-full items-center rounded-md px-2 py-1.5 text-left font-montserrat text-[12px] font-medium transition-colors hover:bg-[#F2F7FC] ${opt === value ? "bg-[#F2F7FC]" : ""} ${lookupType === "unit" ? "gap-3" : "justify-between"}`}
                style={{ color: opt === value ? "#007EA7" : "#10233A" }}
              >
                {lookupType === "unit" && (
                  <span
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${opt === value ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                  >
                    {opt === value && (
                      <Check size={12} strokeWidth={2.5} className="text-white" />
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {lookupType === "unit"
                    ? `${opt} — ${optionLabels[opt] ?? opt}`
                    : opt}
                </span>
                {lookupType !== "unit" && opt === value && (
                  <Check size={11} className="text-[#007EA7] flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          {lookupType !== "unit" && lookupType !== "series" && <div className="border-t border-[#D3E1EC] p-2 flex gap-1">
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                e.stopPropagation();
              }}
              placeholder="Add new..."
              className="flex-1 min-w-0 px-2 py-1 text-[11px] font-montserrat border border-[#D3E1EC] rounded focus:outline-none focus:border-[#007EA7] transition-colors"
            />
            <button
              data-system-action="true"
              type="button"
              onClick={handleAdd}
              disabled={!newVal.trim() || adding}
              className="flex items-center justify-center w-6 h-6 rounded bg-[#007EA7] hover:bg-[#006a8e] disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {adding ? (
                <Loader2 size={10} className="text-white animate-spin" />
              ) : (
                <Plus size={10} className="text-white" />
              )}
            </button>
          </div>}
        </div>
      )}
    </div>
  );
}

type LineItem = {
  id: string;
  barcode: string;
  systemId: string;
  product: string;
  productGroup: string;
  unit: string;
  qty: string;
  code: string;
  price: string;
  subtotal: string;
  discount: string;
  vat: string;
  vatPct: string;
  total: string;
  department: string;
  object: string;
  series: string;
  center: string;
  expense: string;
  vatClass: string;
};

let lastGeneratedSystemId = 0;

function createSystemId(): string {
  const now = Date.now();
  lastGeneratedSystemId = Math.max(now, lastGeneratedSystemId + 1);
  return String(lastGeneratedSystemId);
}

function newLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    barcode: "",
    systemId: createSystemId(),
    product: "",
    productGroup: "",
    unit: "",
    qty: "",
    code: "",
    price: "",
    subtotal: "",
    discount: "",
    vat: "",
    vatPct: "",
    total: "",
    department: "",
    object: "",
    series: "",
    center: "",
    expense: "",
    vatClass: "",
  };
}

function newSummaryLineItem(): LineItem {
  return {
    ...newLineItem(),
    unit: "vnt",
    qty: "1",
  };
}

function formatVatPercent(value: string): string {
  const numericValue = value.replace(/%/g, "").replace(/[^\d.,-]/g, "");
  return numericValue ? `${numericValue}%` : "";
}

const STATUS_COLORS_HIST: Record<string, string> = {
  Updated: "#007EA7",
  Manual: "#007EA7",
  Draft: "#A1B6C6",
  Pending: "#EEB648",
  Paid: "#22C55E",
  Overdue: "#EF4444",
  Processing: "#6366F1",
  Rejected: "#DC2626",
  "Provide Additional": "#F59E0B",
  Exception: "#EA580C",
  Transferred: "#0284C7",
  Duplicate: "#7C3AED",
  "Not Documented": "#9CA3AF",
};

type HistoryRow = {
  id: string;
  created_at: string;
  user_name: string;
  action: string;
  details: string;
};

const HISTORY_FIELD_LABELS: Partial<Record<keyof LineItem, string>> = {
  barcode: "Barcode",
  systemId: "System ID",
  product: "Product",
  productGroup: "Product group",
  unit: "Unit",
  qty: "Quantity",
  price: "Price",
  subtotal: "Amount",
  discount: "Discount",
  vat: "VAT",
  vatPct: "VAT %",
  total: "Total Amount",
  department: "Department code",
  object: "Object / Project",
  series: "Series",
  center: "Cost center",
  expense: "GL account",
  vatClass: "VAT classifier",
};

function currentHistoryUserName() {
  return getCurrentUserName();
}

function displayedHistoryUserName(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return !normalized || normalized === "current user"
    ? currentHistoryUserName()
    : value;
}

function describeLineChanges(
  previous: { quantity: LineItem[]; summary: LineItem[] },
  next: { quantity: LineItem[]; summary: LineItem[] },
) {
  const changes: string[] = [];
  (["summary", "quantity"] as const).forEach((mode) => {
    const before = previous[mode] ?? [];
    const after = next[mode] ?? [];
    if (after.length > before.length)
      changes.push(`${mode === "summary" ? "Summary" : "Quantity"}: added ${after.length - before.length} line(s)`);
    if (before.length > after.length)
      changes.push(`${mode === "summary" ? "Summary" : "Quantity"}: deleted ${before.length - after.length} line(s)`);

    after.forEach((row, index) => {
      const oldRow = before.find((item) => item.id === row.id);
      if (!oldRow) return;
      const changedFields = (Object.keys(HISTORY_FIELD_LABELS) as Array<keyof LineItem>)
        .filter((key) => String(oldRow[key] ?? "") !== String(row[key] ?? ""))
        .map((key) => HISTORY_FIELD_LABELS[key]);
      if (changedFields.length)
        changes.push(
          `${mode === "summary" ? "Summary" : "Quantity"} line ${index + 1}: ${changedFields.join(", ")}`,
        );
    });
  });
  return changes.length ? changes.join("; ") : "Document data updated";
}

export default function DocumentDetailPanel({
  doc,
  readOnly = false,
  companyName,
  generalLedgerName,
  onOpenGeneralLedger,
  onClose,
  onImageUpload,
  onSaved,
}: Props) {
  const filename = doc.fileCase || `${doc.documentType}-${doc.number}.pdf`;
  const isPurchaseDocument = /purchase|expense|pirk/i.test(
    `${doc.type} ${doc.documentType}`,
  );
  const isAccountingNote = /accounting[\s_-]*note/i.test(doc.documentType);
  const operationDateRule = loadOperationDateValidationRule(doc.companyId);
  const currentCompanyName = companyName;
  const [counterparties, setCounterparties] = useState<Company[]>(() =>
    loadCounterparties(),
  );
  const initialCounterparty = loadCounterparties().find(
    (item) =>
      item.id === doc.counterpartyId ||
      item.name.trim().toLocaleLowerCase() ===
        doc.clientCounterparty.trim().toLocaleLowerCase(),
  );
  const [counterparty, setCounterparty] = useState(doc.clientCounterparty);
  const [counterpartyId, setCounterpartyId] = useState(
    doc.counterpartyId || initialCounterparty?.id || "",
  );
  const [counterpartyCode, setCounterpartyCode] = useState(
    doc.counterpartyCode || initialCounterparty?.company_code || "",
  );
  const [internalUsers, setInternalUsers] =
    useState<LinkedDirectoryUser[]>(loadAccountableUsers);
  const [accountablePerson, setAccountablePerson] = useState(
    doc.accountableResponsible || "",
  );
  const [savedAccountablePerson, setSavedAccountablePerson] = useState(
    doc.accountableResponsible || "",
  );
  const [invoiceDate, setInvoiceDate] = useState(
    doc.invoiceContractDate || "",
  );
  const [operationDate, setOperationDate] = useState(doc.operationDate || "");
  const [dueDate, setDueDate] = useState(doc.dueEndDate || "");
  const [documentNumber, setDocumentNumber] = useState(doc.number || "");
  const [orderNumber, setOrderNumber] = useState(doc.orderNo || "");
  const [documentCurrency, setDocumentCurrency] = useState(doc.currency || "");
  const [debit, setDebit] = useState(doc.debit || "");
  const [credit, setCredit] = useState(doc.credit || "");
  const [savedHeaderFields, setSavedHeaderFields] = useState(() =>
    JSON.stringify({
      invoiceDate: doc.invoiceContractDate || "",
      operationDate: doc.operationDate || "",
      dueDate: doc.dueEndDate || "",
      documentNumber: doc.number || "",
      orderNumber: doc.orderNo || "",
      documentCurrency: doc.currency || "",
      debit: doc.debit || "",
      credit: doc.credit || "",
    }),
  );
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(() =>
    loadOrganizationReferenceValues("Base currency"),
  );
  const [savedCounterpartySnapshot, setSavedCounterpartySnapshot] = useState(
    doc.clientCounterparty,
  );

  useEffect(() => {
    const refresh = () => setCounterparties(loadCounterparties());
    window.addEventListener("counterparties-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("counterparties-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () =>
      setCurrencyOptions(loadOrganizationReferenceValues("Base currency"));
    window.addEventListener("organization-reference-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("organization-reference-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setInternalUsers(loadAccountableUsers());
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const displayedSeller = isPurchaseDocument
    ? counterparty || doc.source || "—"
    : currentCompanyName || doc.source || "Meso group, UAB";
  const displayedBuyer = isPurchaseDocument
    ? currentCompanyName || "—"
    : counterparty || "—";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(
    doc.imageUrl,
  );
  const [localFileType, setLocalFileType] = useState<"image" | "pdf">(() =>
    doc.imageUrl?.toLowerCase().startsWith("data:application/pdf") ||
    doc.imageUrl?.split("?")[0].toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "image",
  );
  const [uploadError, setUploadError] = useState("");

  const defaultLineItem = useCallback(
    (): LineItem => ({
      id: crypto.randomUUID(),
      barcode: "",
      systemId: createSystemId(),
      product: doc.documentPurpose || doc.documentType || "",
      productGroup: "",
      unit: "",
      qty: "1",
      code: doc.number || "",
      price: doc.amountWithoutVat || "",
      subtotal: doc.amountWithoutVat || "",
      discount: "0.00",
      vat: doc.vat || "",
      vatPct: doc.vatPercent || "",
      total: doc.totalAmount || "",
      department: doc.departmentCode || "",
      object: doc.objectProject || "",
      series: doc.series || "",
      center: doc.costCenter || "",
      expense: doc.expenseAccount || "",
      vatClass: doc.vatClassifier || "",
    }),
    [
      doc.amountWithoutVat,
      doc.costCenter,
      doc.departmentCode,
      doc.documentPurpose,
      doc.documentType,
      doc.expenseAccount,
      doc.number,
      doc.objectProject,
      doc.series,
      doc.totalAmount,
      doc.vat,
      doc.vatClassifier,
      doc.vatPercent,
    ],
  );

  const [lineItems, setLineItems] = useState<LineItem[]>(() => [
    defaultLineItem(),
  ]);
  const [summaryLineItems, setSummaryLineItems] = useState<LineItem[]>(() => [
    { ...defaultLineItem(), unit: "vnt", qty: "1" },
  ]);
  const [savedLineItemsSnapshot, setSavedLineItemsSnapshot] = useState(() =>
    JSON.stringify({ quantity: lineItems, summary: summaryLineItems }),
  );
  const [savingChanges, setSavingChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [lineViewMode, setLineViewMode] = useState<"summary" | "quantity">(
    "summary",
  );

  function recalcRow(
    row: LineItem,
    field: "qty" | "price" | "subtotal" | "vatPct" | "vat",
    val: string,
  ): LineItem {
    let updated = { ...row, [field]: val };
    if (field === "qty") {
      const quantity = parseAmount(val);
      const assignedAmount = parseAmount(row.subtotal);
      updated = {
        ...updated,
        price:
          quantity > 0 ? (assignedAmount / quantity).toFixed(2) : "0.00",
      };
    } else if (field === "price") {
      const quantity = parseAmount(updated.qty);
      const unitPrice = parseAmount(updated.price);
      updated = { ...updated, subtotal: (quantity * unitPrice).toFixed(2) };
    }
    const sub = parseAmount(updated.subtotal);
    const pct = parseFloat(updated.vatPct.replace(/[^\d.]/g, "")) || 0;
    const vatAmt =
      field === "vat"
        ? parseFloat(updated.vat.replace(/[^\d.]/g, "")) || 0
        : (sub * pct) / 100;
    const total = sub + vatAmt;
    const cur = documentCurrency || "EUR";
    return {
      ...updated,
      vat: vatAmt.toFixed(2) + " " + cur,
      total: total.toFixed(2) + " " + cur,
    };
  }

  function addCalculatedLine(mode: "summary" | "quantity") {
    const updateItems =
      mode === "summary" ? setSummaryLineItems : setLineItems;
    updateItems((current) => {
      const nextLine =
        mode === "summary" ? newSummaryLineItem() : newLineItem();
      const rows = [...current, nextLine];
      const amount = parseAmount(doc.amountWithoutVat);
      const vatPercent =
        parseFloat(doc.vatPercent.replace(/[^\d.]/g, "")) || 0;
      const totalAmount = parseAmount(doc.totalAmount);
      const vatAmount = parseAmount(doc.vat);
      const amountCents = Math.round(amount * 100);
      const vatCents = Math.round(vatAmount * 100);
      const totalCents = Math.round(totalAmount * 100);
      return rows.map((row, index) => {
        const amountForLine =
          (Math.floor(amountCents / rows.length) +
            (index < amountCents % rows.length ? 1 : 0)) /
          100;
        const vatForLine =
          (Math.floor(vatCents / rows.length) +
            (index < vatCents % rows.length ? 1 : 0)) /
          100;
        const totalForLine =
          (Math.floor(totalCents / rows.length) +
            (index < totalCents % rows.length ? 1 : 0)) /
          100;
        const quantity = parseAmount(row.qty) || 1;
        const price = amountForLine / quantity;
        return {
          ...row,
          unit: mode === "summary" ? row.unit || "vnt" : row.unit,
          qty: row.qty || "1",
          price: price.toFixed(2),
          subtotal: amountForLine.toFixed(2),
          vat: `${vatForLine.toFixed(2)} ${documentCurrency || "EUR"}`,
          vatPct: vatPercent ? `${vatPercent}%` : "",
          total: `${totalForLine.toFixed(2)} ${documentCurrency || "EUR"}`,
        };
      });
    });
  }

  const currency = documentCurrency || "EUR";
  const activeLineItems =
    lineViewMode === "summary" ? summaryLineItems : lineItems;
  const requiredLineFields: Array<keyof LineItem> =
    lineViewMode === "quantity"
      ? [
          "product",
          "unit",
          "qty",
          "price",
          "subtotal",
          "discount",
          "vat",
          "vatPct",
          "total",
        ]
      : ["unit", "qty", "price", "subtotal", "vat", "vatPct", "total"];
  const activeLinesValid =
    activeLineItems.length > 0 &&
    activeLineItems.every((line) =>
      requiredLineFields.every(
        (field) => String(line[field] ?? "").trim().length > 0,
      ),
    );
  const accountingDebitCreditValid =
    (Number(debit) > 0 || Number(credit) > 0) &&
    Number(debit) >= 0 &&
    Number(credit) >= 0;
  const lineAmount = activeLineItems.reduce(
    (sum, row) => sum + parseAmount(row.subtotal),
    0,
  );
  const lineVat = activeLineItems.reduce(
    (sum, row) => sum + parseAmount(row.vat),
    0,
  );
  const lineTotalAmount = activeLineItems.reduce(
    (sum, row) => sum + parseAmount(row.total),
    0,
  );
  const formatMoney = (amount: number) => `${amount.toFixed(2)} ${currency}`;
  const hasUnsavedChanges =
    JSON.stringify({ quantity: lineItems, summary: summaryLineItems }) !==
      savedLineItemsSnapshot ||
    counterparty !== savedCounterpartySnapshot ||
    accountablePerson !== savedAccountablePerson ||
    JSON.stringify({
      invoiceDate,
      operationDate,
      dueDate,
      documentNumber,
      orderNumber,
      documentCurrency,
      debit,
      credit,
    }) !== savedHeaderFields;
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [splitMode, setSplitMode] = useState<"equal" | "percent" | "amount">(
    "equal",
  );
  const [splitInputs, setSplitInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setCounterparty(doc.clientCounterparty);
    setSavedCounterpartySnapshot(doc.clientCounterparty);
    setDebit(doc.debit || "");
    setCredit(doc.credit || "");
  }, [doc.clientCounterparty, doc.credit, doc.debit, doc.id]);

  useEffect(() => {
    setLocalImageUrl(doc.imageUrl);
    if (doc.imageUrl) {
      const normalizedUrl = doc.imageUrl.toLowerCase();
      setLocalFileType(
        normalizedUrl.startsWith("data:application/pdf") ||
          normalizedUrl.split("?")[0].endsWith(".pdf")
          ? "pdf"
          : "image",
      );
    }
    setUploadError("");
  }, [doc.imageUrl]);

  useEffect(() => {
    supabase
      .from("documents")
      .select("line_items,summary_line_items")
      .eq("id", doc.id)
      .then(async ({ data }) => {
        const savedItems = data?.[0]?.line_items;
        if (!Array.isArray(savedItems) || savedItems.length === 0) return;
        const savedSummaryItems = data?.[0]?.summary_line_items;
        const needsSystemIds = (savedItems as LineItem[]).some(
          (item) => !item.systemId,
        );
        const restored = (savedItems as LineItem[]).map((item) => ({
          ...item,
          systemId: item.systemId || createSystemId(),
          productGroup:
            item.productGroup === doc.documentType
              ? ""
              : item.productGroup || "",
          code: doc.number || item.code || "",
        }));
        setLineItems(restored);
        let restoredSummary =
          Array.isArray(savedSummaryItems) && savedSummaryItems.length > 0
            ? (savedSummaryItems as LineItem[]).map((item) => ({
                ...item,
                systemId: item.systemId || createSystemId(),
                productGroup:
                  item.productGroup === doc.documentType
                    ? ""
                    : item.productGroup || "",
                code: doc.number || item.code || "",
              }))
            : [{ ...defaultLineItem(), unit: "vnt", qty: "1" }];
        restoredSummary = restoredSummary.map((item) => ({
          ...item,
          unit: item.unit || "vnt",
          qty: item.qty || "1",
        }));
        const summaryDoesNotMatchDocument =
          restoredSummary.length === 1 &&
          (parseAmount(restoredSummary[0].subtotal) !==
            parseAmount(doc.amountWithoutVat) ||
            parseAmount(restoredSummary[0].total) !==
              parseAmount(doc.totalAmount));
        if (summaryDoesNotMatchDocument) {
          restoredSummary = [
            {
              ...restoredSummary[0],
              qty: restoredSummary[0].qty || "1",
              price: doc.amountWithoutVat,
              subtotal: doc.amountWithoutVat,
              vat: doc.vat,
              vatPct: doc.vatPercent,
              total: doc.totalAmount,
            },
          ];
        }
        setSummaryLineItems(restoredSummary);
        setSavedLineItemsSnapshot(
          JSON.stringify({ quantity: restored, summary: restoredSummary }),
        );
        if (needsSystemIds || summaryDoesNotMatchDocument) {
          await supabase
            .from("documents")
            .update({
              ...(needsSystemIds ? { line_items: restored } : {}),
              ...(summaryDoesNotMatchDocument
                ? { summary_line_items: restoredSummary }
                : {}),
            })
            .eq("id", doc.id);
        }
      });
  }, [
    defaultLineItem,
    doc.amountWithoutVat,
    doc.documentType,
    doc.id,
    doc.number,
    doc.totalAmount,
    doc.vat,
    doc.vatPercent,
  ]);

  useEffect(() => {
    supabase
      .from("document_history")
      .select("*")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        if (!data) return;
        const activeUserName = currentHistoryUserName();
        const rows = (data as HistoryRow[]).map((row) =>
          row.user_name.trim().toLocaleLowerCase() === "current user"
            ? { ...row, user_name: activeUserName }
            : row,
        );
        const legacyRows = (data as HistoryRow[]).filter(
          (row) => row.user_name.trim().toLocaleLowerCase() === "current user",
        );
        if (legacyRows.length) {
          await Promise.all(
            legacyRows.map((row) =>
              supabase
                .from("document_history")
                .update({ user_name: activeUserName })
                .eq("id", row.id),
            ),
          );
        }
        setHistory(rows);
      });
  }, [doc.id]);

  async function handleSaveChanges() {
    if (!activeLinesValid) {
      setSaveMessage("");
      setSaveError("Please complete all required document line fields.");
      return;
    }
    setSavingChanges(true);
    setSaveMessage("");
    setSaveError("");
    let previousLines: { quantity: LineItem[]; summary: LineItem[] } = {
      quantity: [],
      summary: [],
    };
    try {
      previousLines = JSON.parse(savedLineItemsSnapshot) as {
        quantity: LineItem[];
        summary: LineItem[];
      };
    } catch {
      previousLines = { quantity: [], summary: [] };
    }
    const amountWithoutVat = formatMoney(lineAmount);
    const vat = formatMoney(lineVat);
    const totalAmount = formatMoney(lineTotalAmount);
    const commonValue = (key: keyof LineItem) => {
      if (!activeLineItems.length) return "";
      const values = activeLineItems.map((item) =>
        String(item[key] ?? "").trim(),
      );
      const first = values[0];
      return first && values.every((value) => value === first) ? first : "";
    };
    const departmentCode = commonValue("department");
    const objectProject = commonValue("object");
    const series =
      activeLineItems.find((item) => item.series.trim().length > 0)?.series ??
      "";
    const costCenter = commonValue("center");
    const expenseAccount = commonValue("expense");
    const vatClassifier = commonValue("vatClass");
    const vatPercent = commonValue("vatPct");
    const { error } = await supabase
      .from("documents")
      .update({
        client_counterparty: counterparty,
        counterparty_id: counterpartyId,
        accountable_responsible: accountablePerson,
        invoice_contract_date: invoiceDate || null,
        operation_date: operationDate || null,
        due_end_date: dueDate || null,
        number: documentNumber,
        order_no: orderNumber,
        currency: documentCurrency,
        amount_without_vat: amountWithoutVat,
        vat,
        total_amount: totalAmount,
        department_code: departmentCode,
        object_project: objectProject,
        series,
        cost_center: costCenter,
        expense_account: expenseAccount,
        vat_classifier: vatClassifier,
        vat_percent: vatPercent,
        debit: isAccountingNote ? debit : doc.debit || "",
        credit: isAccountingNote ? credit : doc.credit || "",
        line_items: lineItems,
        summary_line_items: summaryLineItems,
      })
      .eq("id", doc.id);

    if (error) {
      setSaveError("Changes could not be saved. Please try again.");
      setSavingChanges(false);
      return;
    }

    const historyEntry = {
      document_id: doc.id,
      user_name: currentHistoryUserName(),
      action: "Updated",
      details: describeLineChanges(previousLines, {
        quantity: lineItems,
        summary: summaryLineItems,
      }),
      created_at: new Date().toISOString(),
    };
    const { data: savedHistory, error: historyError } = await supabase
      .from("document_history")
      .insert(historyEntry);
    if (historyError || !savedHistory?.[0]) {
      setSaveError("Document saved, but the Activity Log entry could not be recorded.");
      setSavingChanges(false);
      return;
    }
    setHistory((current) => [savedHistory[0] as HistoryRow, ...current]);
    setSavedLineItemsSnapshot(
      JSON.stringify({ quantity: lineItems, summary: summaryLineItems }),
    );
    setSavedCounterpartySnapshot(counterparty);
    setSavedAccountablePerson(accountablePerson);
    setSavedHeaderFields(
      JSON.stringify({
        invoiceDate,
        operationDate,
        dueDate,
        documentNumber,
        orderNumber,
        documentCurrency,
        debit,
        credit,
      }),
    );
    setSaveMessage("Changes saved successfully.");
    onSaved?.(doc.id, {
      amountWithoutVat,
      clientCounterparty: counterparty,
      counterpartyId,
      counterpartyCode,
      accountableResponsible: accountablePerson,
      invoiceContractDate: invoiceDate,
      operationDate,
      dueEndDate: dueDate,
      number: documentNumber,
      orderNo: orderNumber,
      currency: documentCurrency,
      vat,
      vatPercent,
      totalAmount,
      departmentCode,
      objectProject,
      series,
      costCenter,
      expenseAccount,
      vatClassifier,
      debit,
      credit,
      hasProductDetails:
        lineItems.length > 1 || summaryLineItems.length > 1,
      lineItems,
      summaryLineItems,
    });
    setSavingChanges(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const ext = file.name.split(".").pop();
      const path = `${doc.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(path, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage
        .from("document-images")
        .getPublicUrl(path);
      if (!data.publicUrl)
        throw new Error("Uploaded document URL is unavailable");
      const publicUrl =
        data.publicUrl.startsWith("data:") || data.publicUrl.startsWith("blob:")
          ? data.publicUrl
          : `${data.publicUrl}${data.publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
      await supabase
        .from("documents")
        .update({ image_url: publicUrl })
        .eq("id", doc.id);
      setLocalImageUrl(publicUrl);
      setLocalFileType(
        file.type === "application/pdf" || ext?.toLowerCase() === "pdf"
          ? "pdf"
          : "image",
      );
      onImageUpload?.(doc.id, publicUrl);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadError("Document could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const contentRef = useRef<HTMLDivElement>(null);
  function parseAmount(s: string): number {
    return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
  }

  function openSplit() {
    const activeItems =
      lineViewMode === "summary" ? summaryLineItems : lineItems;
    const init: Record<string, string> = {};
    if (splitMode === "equal") {
      activeItems.forEach((r) => {
        init[r.id] = "";
      });
    } else if (splitMode === "percent") {
      const eq =
        activeItems.length > 0 ? (100 / activeItems.length).toFixed(2) : "0";
      activeItems.forEach((r) => {
        init[r.id] = eq;
      });
    } else {
      const base = parseAmount(doc.amountWithoutVat);
      const each =
        activeItems.length > 0 ? (base / activeItems.length).toFixed(2) : "0";
      activeItems.forEach((r) => {
        init[r.id] = each;
      });
    }
    setSplitInputs(init);
    setShowSplitPanel(true);
  }

  function applySplit() {
    const base = parseAmount(doc.amountWithoutVat);
    const updateActiveItems =
      lineViewMode === "summary" ? setSummaryLineItems : setLineItems;
    updateActiveItems((prev) =>
      prev.map((r) => {
        let amount: number;
        if (splitMode === "equal") {
          amount = prev.length > 0 ? base / prev.length : 0;
        } else if (splitMode === "percent") {
          const pct = parseFloat(splitInputs[r.id] ?? "0") || 0;
          amount = (base * pct) / 100;
        } else {
          amount = parseFloat(splitInputs[r.id] ?? "0") || 0;
        }
        const subtotal = amount.toFixed(2) + " " + (documentCurrency || "EUR");
        return recalcRow({ ...r, subtotal }, "subtotal", subtotal);
      }),
    );
    setShowSplitPanel(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-row gap-0 p-0">
        {/* Left: document preview / upload placeholder — sticky, never scrolls horizontally */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          disabled={readOnly}
          onChange={handleFileChange}
        />
        {localImageUrl ? (
          <div
            className="flex-shrink-0 sticky left-0 self-start relative group cursor-pointer"
            style={{ width: 400, height: 968 }}
            onClick={() => {
              if (!readOnly) fileInputRef.current?.click();
            }}
          >
            {localFileType === "pdf" ? (
              <object
                data={localImageUrl}
                type="application/pdf"
                aria-label={`PDF document ${filename}`}
                className="h-full w-full bg-white pointer-events-none"
              >
                <div className="flex h-full items-center justify-center bg-[#F8FDFF] px-8 text-center font-montserrat text-[14px] text-[#7288A3]">
                  PDF preview is not available in this browser.
                </div>
              </object>
            ) : (
              <img
                src={localImageUrl}
                alt="Document"
                className="w-full h-full object-contain object-top bg-white"
              />
            )}
            {!readOnly && <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {uploading ? (
                <Loader2 size={36} className="text-white animate-spin" />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={32} className="text-white" />
                  <span className="text-white font-montserrat font-semibold text-[14px]">
                    Replace image
                  </span>
                </div>
              )}
            </div>}
          </div>
        ) : (
          <div
            className="flex-shrink-0 sticky left-0 self-start flex items-center justify-center bg-[#F8FDFF] border-r border-[#D3E1EC]"
            style={{ width: 400, height: "100vh" }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly || uploading}
              className="flex flex-col items-center gap-3 px-8 py-10 border-2 border-dashed border-[#D3E1EC] rounded-lg bg-white hover:border-[#007EA7] hover:bg-[#F0F7FA] transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#F0F7FA]">
                {uploading ? (
                  <Loader2 size={28} className="text-[#007EA7] animate-spin" />
                ) : (
                  <Upload
                    size={28}
                    className="text-[#007EA7]"
                    strokeWidth={2}
                  />
                )}
              </div>
              <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#10233A]">
                {uploading ? "Uploading..." : "Upload document"}
              </span>
              <span className="font-montserrat font-medium text-[13px] leading-5 text-[#7288A3]">
                PDF, PNG or JPG
              </span>
              {uploadError && (
                <span
                  role="alert"
                  className="max-w-[260px] text-center font-montserrat text-[12px] leading-4 text-[#D64545]"
                >
                  {uploadError}
                </span>
              )}
            </button>
          </div>
        )}
        {/* Right: content — scrolls horizontally when fields don't fit */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={contentRef}
            className="flex-1 overflow-x-auto overflow-y-visible min-w-0 scrollbar-hide"
          >
            <div
              className="flex flex-col gap-8 p-6"
              style={{ minWidth: 1984, width: 1984 }}
            >
              {/* Title bar */}
              <div className="flex flex-row items-center gap-2 min-h-8">
                <div className="flex flex-row items-center gap-2 flex-1 min-w-0">
                  <span data-view-allowed="true">
                    <HeaderBackButton
                      onClick={onClose}
                      label="Back to documents"
                    />
                  </span>
                  <span className="font-montserrat font-semibold text-[18px] leading-[26px] text-[#10233A] truncate">
                    {isAccountingNote
                      ? readOnly
                        ? "View accounting note"
                        : "Accounting note"
                      : readOnly
                        ? "View document"
                        : "Sale invoice"}{" "}
                    {filename}
                  </span>
                </div>
                {!readOnly && <div className="flex flex-row items-center gap-2 flex-shrink-0">
                  <SaveButton
                    onClick={handleSaveChanges}
                    disabled={
                      !hasUnsavedChanges ||
                      savingChanges ||
                      (isAccountingNote
                        ? !accountingDebitCreditValid
                        : !activeLinesValid)
                    }
                    className="h-8 text-[14px]"
                  >
                    {savingChanges ? "Saving…" : "Save"}
                  </SaveButton>
                  <button className="flex items-center justify-center px-3 py-[6px] border-2 border-[#D3E1EC] rounded-md bg-white hover:border-[#007EA7] transition-colors h-8">
                    <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#7288A3] whitespace-nowrap">
                      Exclude from export
                    </span>
                  </button>
                  <button className="flex items-center justify-center px-3 py-[6px] border-2 border-[#D3E1EC] rounded-md bg-white hover:border-[#007EA7] transition-colors h-8">
                    <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#7288A3] whitespace-nowrap">
                      Mark as exported
                    </span>
                  </button>
                  <button className="flex items-center justify-center px-3 py-[6px] border-2 border-[#D3E1EC] rounded-md bg-white hover:border-[#007EA7] transition-colors h-8">
                    <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#7288A3] whitespace-nowrap">
                      Add note
                    </span>
                  </button>
                  <button className="flex items-center justify-center px-3 py-[6px] border-2 border-[#FF6200] rounded-md bg-white hover:bg-[#FFF5F0] transition-colors h-8">
                    <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#FF6200] whitespace-nowrap">
                      Report issue
                    </span>
                  </button>
                </div>}
              </div>

              <fieldset
                disabled={readOnly}
                className={`contents ${readOnly ? "[&_input]:cursor-default [&_input]:bg-[#F7F7F7] [&_textarea]:cursor-default [&_textarea]:bg-[#F7F7F7] [&_button]:cursor-default" : ""}`}
              >

              {/* Main fields card */}
              <div className="flex w-[1936px] flex-row gap-4 rounded-lg border border-[#D3E1EC] p-4">
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  {isAccountingNote ? (
                    <EditablePartyField
                      label="Client"
                      value={counterparty}
                      selectedId={counterpartyId}
                      counterparties={counterparties}
                      onSelect={(selected) => {
                        setCounterpartyId(selected.id);
                        setCounterparty(selected.name);
                        setCounterpartyCode(selected.company_code ?? "");
                      }}
                    />
                  ) : (
                    <>
                      {isPurchaseDocument ? (
                        <EditablePartyField
                          label="Seller (LT)"
                          value={counterparty}
                          selectedId={counterpartyId}
                          counterparties={counterparties}
                          onSelect={(selected) => {
                            setCounterpartyId(selected.id);
                            setCounterparty(selected.name);
                            setCounterpartyCode(selected.company_code ?? "");
                          }}
                        />
                      ) : (
                        <Field label="Seller (LT)" value={displayedSeller} grey />
                      )}
                      {isPurchaseDocument ? (
                        <Field label="Buyer (LT)" value={displayedBuyer} grey />
                      ) : (
                        <EditablePartyField
                          label="Buyer (LT)"
                          value={counterparty}
                          selectedId={counterpartyId}
                          counterparties={counterparties}
                          onSelect={(selected) => {
                            setCounterpartyId(selected.id);
                            setCounterparty(selected.name);
                            setCounterpartyCode(selected.company_code ?? "");
                          }}
                        />
                      )}
                    </>
                  )}
                  <Field
                    label="Counterparty code"
                    value={counterpartyCode || "—"}
                    grey
                  />
                  <AccountablePersonField
                    value={accountablePerson}
                    users={internalUsers}
                    onChange={setAccountablePerson}
                  />
                </div>
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  <EditableValueField
                    label="Invoice date"
                    value={invoiceDate}
                    onChange={setInvoiceDate}
                  />
                  <EditableValueField
                    label="Operation date"
                    value={operationDate}
                    onChange={setOperationDate}
                    readOnly={!operationDateRule.manualAdjustmentAllowed}
                  />
                </div>
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  <EditableValueField
                    label="Due date"
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </div>
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  <EditableValueField
                    label="Document Number"
                    value={documentNumber}
                    onChange={setDocumentNumber}
                  />
                  <EditableValueField
                    label="Order number"
                    value={orderNumber}
                    onChange={setOrderNumber}
                  />
                </div>
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  <Field label="Amount" value={formatMoney(lineAmount)} grey />
                  <Field
                    label="Total Amount"
                    value={formatMoney(lineTotalAmount)}
                    grey
                  />
                </div>
                <div
                  className="flex flex-col gap-4 flex-1 min-w-0"
                  style={{ maxWidth: 216 }}
                >
                  <Field label="VAT" value={formatMoney(lineVat)} grey />
                  <EditableOptionField
                    label="Currency"
                    value={documentCurrency}
                    options={currencyOptions}
                    onChange={setDocumentCurrency}
                  />
                </div>
                {isAccountingNote && (
                  <div
                    className="flex flex-col gap-4 flex-1 min-w-0"
                    style={{ maxWidth: 216 }}
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
                        Debit / Credit<span className="text-[#D90310]">*</span>
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Debit"
                          value={debit}
                          onChange={(event) => setDebit(event.target.value)}
                          className="h-8 min-w-0 rounded-md border border-[#D3E1EC] bg-white px-2 font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                          placeholder="Debit"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Credit"
                          value={credit}
                          onChange={(event) => setCredit(event.target.value)}
                          className="h-8 min-w-0 rounded-md border border-[#D3E1EC] bg-white px-2 font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                          placeholder="Credit"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="flex min-h-[250px] w-[1936px] flex-col gap-2 overflow-visible">
                <div className="flex items-center justify-start gap-3">
                  <div className="inline-flex rounded-md bg-[#EEF4F7] p-0.5">
                    <button
                      type="button"
                      onClick={() => setLineViewMode("summary")}
                      className={`h-7 rounded px-3 font-montserrat text-[11px] font-semibold transition-colors ${lineViewMode === "summary" ? "bg-white text-[#007EA7] shadow-[0_1px_3px_rgba(16,35,58,0.12)]" : "text-[#7288A3] hover:text-[#10233A]"}`}
                    >
                      Summary ({summaryLineItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineViewMode("quantity")}
                      className={`h-7 rounded px-3 font-montserrat text-[11px] font-semibold transition-colors ${lineViewMode === "quantity" ? "bg-white text-[#007EA7] shadow-[0_1px_3px_rgba(16,35,58,0.12)]" : "text-[#7288A3] hover:text-[#10233A]"}`}
                    >
                      Quantity ({lineItems.length})
                    </button>
                  </div>
                  {(lineViewMode === "summary"
                    ? summaryLineItems.length
                    : lineItems.length) > 0 && (
                    <button
                      type="button"
                      onClick={openSplit}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
                      title="Split"
                      aria-label="Split"
                    >
                      <Scissors size={14} strokeWidth={1.8} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => addCalculatedLine(lineViewMode)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
                    title="Add line"
                    aria-label="Add line"
                  >
                    <Plus size={14} strokeWidth={1.8} />
                  </button>
                </div>
                <div className="border-b border-[#D3E1EC] pb-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Document lines
                </div>
                {lineViewMode === "summary" ? (
                  <div className="flex w-[1936px] flex-col">
                    <div className="flex flex-row items-center gap-[2px] p-[5px]">
                      <div className="w-[18px] flex-shrink-0" />
                      <div className="w-6 flex-shrink-0" />
                      {[
                        { label: "Unit", w: 110, required: true },
                        { label: "Quantity", w: 80, required: true },
                        { label: "Price", w: 90, required: true },
                        { label: "Amount", w: 90, required: true },
                        { label: "VAT", w: 80, required: true },
                        { label: "VAT %", w: 70, required: true },
                        { label: "Total Amount", w: 110, required: true },
                        { label: "Product group", w: 130 },
                        { label: "Department", w: 100 },
                        { label: "Object", w: 90 },
                        { label: "Series", w: 80 },
                        { label: "Center", w: 90 },
                        { label: "GL account", w: 110 },
                        { label: "VAT Classifier", w: 110 },
                      ].map((header) => (
                        <div
                          key={header.label}
                          className="flex-shrink-0 px-2 font-montserrat text-[12px] font-medium text-[#7288A3]"
                          style={{ width: header.w }}
                        >
                          {header.label}
                          {header.required && (
                            <span className="ml-0.5 text-[#D64545]">*</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      {summaryLineItems.map((line, lineIndex) => {
                        const updateLine = (
                          key: keyof LineItem,
                          value: string,
                        ) =>
                          setSummaryLineItems((current) =>
                            current.map((row) =>
                              row.id === line.id ? { ...row, [key]: value } : row,
                            ),
                          );
                        return (
                          <div
                            key={line.id}
                            className={`flex flex-row items-center gap-[2px] rounded-lg p-[5px] ${lineIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"}`}
                          >
                            <div className="flex w-[18px] flex-shrink-0 items-center justify-center">
                              <span className="font-montserrat text-[12px] font-medium leading-[18px] text-[#A1B6C6]">
                                {lineIndex + 1}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="flex w-6 flex-shrink-0 items-center justify-center px-1"
                              disabled={summaryLineItems.length === 1}
                              onClick={() =>
                                setSummaryLineItems((current) =>
                                  current.filter((row) => row.id !== line.id),
                                )
                              }
                              aria-label={`Delete summary line ${lineIndex + 1}`}
                            >
                              <Trash2
                                size={14}
                                className={
                                  summaryLineItems.length === 1
                                    ? "text-[#D3E1EC]"
                                    : "text-[#FF6200] opacity-60 transition-opacity hover:opacity-100"
                                }
                              />
                            </button>
                            <LookupDropdownCell
                              value={line.unit}
                              width={110}
                              lookupType="unit"
                              companyId={doc.companyId}
                              onChange={(value) => updateLine("unit", value)}
                            />
                            <EditCell
                              value={line.qty}
                              width={80}
                              onChange={(value) =>
                                setSummaryLineItems((current) =>
                                  current.map((row) =>
                                    row.id === line.id
                                      ? recalcRow(row, "qty", value)
                                      : row,
                                  ),
                                )
                              }
                            />
                            <EditCell
                              value={line.price}
                              width={90}
                              onChange={(value) =>
                                setSummaryLineItems((current) =>
                                  current.map((row) =>
                                    row.id === line.id
                                      ? recalcRow(row, "price", value)
                                      : row,
                                  ),
                                )
                              }
                            />
                            <EditCell
                              value={line.subtotal}
                              width={90}
                              onChange={(value) =>
                                setSummaryLineItems((current) =>
                                  current.map((row) =>
                                    row.id === line.id
                                      ? recalcRow(row, "subtotal", value)
                                      : row,
                                  ),
                                )
                              }
                            />
                            <EditCell
                              value={line.vat}
                              width={80}
                              onChange={(value) =>
                                setSummaryLineItems((current) =>
                                  current.map((row) =>
                                    row.id === line.id
                                      ? recalcRow(row, "vat", value)
                                      : row,
                                  ),
                                )
                              }
                            />
                            <PercentEditCell
                              value={line.vatPct}
                              width={70}
                              onChange={(value) =>
                                setSummaryLineItems((current) =>
                                  current.map((row) =>
                                    row.id === line.id
                                      ? recalcRow(
                                          row,
                                          "vatPct",
                                          formatVatPercent(value),
                                        )
                                      : row,
                                  ),
                                )
                              }
                            />
                            <Cell value={formatMoney(parseAmount(line.total))} width={110} grey />
                            <LookupDropdownCell value={line.productGroup} width={130} lookupType="product_group" companyId={doc.companyId} onChange={(value) => updateLine("productGroup", value)} />
                            <LookupDropdownCell value={line.department} width={100} lookupType="department_code" companyId={doc.companyId} onChange={(value) => updateLine("department", value)} />
                            <LookupDropdownCell value={line.object} width={90} lookupType="object_project" companyId={doc.companyId} onChange={(value) => updateLine("object", value)} />
                            <LookupDropdownCell value={line.series} width={80} lookupType="series" companyId={doc.companyId} onChange={(value) => updateLine("series", value)} />
                            <LookupDropdownCell value={line.center} width={90} lookupType="cost_center" companyId={doc.companyId} onChange={(value) => updateLine("center", value)} />
                            <LookupDropdownCell value={line.expense} width={110} lookupType="gl_account" companyId={doc.companyId} generalLedgerName={generalLedgerName} onOpenGeneralLedger={onOpenGeneralLedger} onChange={(value) => updateLine("expense", value)} />
                            <LookupDropdownCell value={line.vatClass} width={110} lookupType="vat_class" companyId={doc.companyId} onChange={(value) => updateLine("vatClass", value)} />
                          </div>
                        );
                      })}
                    </div>
                    {showSplitPanel && summaryLineItems.length > 0 && (
                      <div className="mt-2 flex min-w-[720px] flex-col gap-3 rounded-lg border border-[#007EA7]/30 bg-[#F8FDFF] p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                            Split: <span className="text-[#007EA7]">{doc.amountWithoutVat || doc.totalAmount || "0.00"}</span>
                          </span>
                          <div className="flex items-center gap-1 rounded-md border border-[#D3E1EC] bg-white p-[2px]">
                            {(["equal", "percent", "amount"] as const).map(
                              (mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => {
                                    setSplitMode(mode);
                                    const base = parseAmount(doc.amountWithoutVat);
                                    const next: Record<string, string> = {};
                                    summaryLineItems.forEach((row) => {
                                      next[row.id] =
                                        mode === "percent"
                                          ? (100 / summaryLineItems.length).toFixed(2)
                                          : mode === "amount"
                                            ? (base / summaryLineItems.length).toFixed(2)
                                            : "";
                                    });
                                    setSplitInputs(next);
                                  }}
                                  className={`rounded px-3 py-1 font-montserrat text-[11px] font-semibold ${splitMode === mode ? "bg-[#007EA7] text-white" : "text-[#7288A3] hover:text-[#10233A]"}`}
                                >
                                  {mode === "equal"
                                    ? "Equal"
                                    : mode === "percent"
                                      ? "By %"
                                      : "By amount"}
                                </button>
                              ),
                            )}
                          </div>
                          <span className="ml-auto font-montserrat text-[11px] text-[#7288A3]">
                            {summaryLineItems.length} lines
                          </span>
                        </div>
                        <div className="grid gap-1">
                          {summaryLineItems.map((row, index) => {
                            const base = parseAmount(doc.amountWithoutVat);
                            const inputValue = splitInputs[row.id] ?? "";
                            const computed =
                              splitMode === "equal"
                                ? base / summaryLineItems.length
                                : splitMode === "percent"
                                  ? (base * (parseFloat(inputValue) || 0)) / 100
                                  : parseFloat(inputValue) || 0;
                            return (
                              <div
                                key={row.id}
                                className="grid min-h-8 grid-cols-[32px_150px_1fr] items-center gap-2"
                              >
                                <span className="text-right font-montserrat text-[11px] text-[#A1B6C6]">
                                  {index + 1}
                                </span>
                                {splitMode === "equal" ? (
                                  <div className="flex h-7 items-center rounded border border-[#D3E1EC] bg-[#F7F7F7] px-2 font-montserrat text-[12px] text-[#828588]">
                                    {computed.toFixed(2)} {documentCurrency || "EUR"}
                                  </div>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={inputValue}
                                    onChange={(event) =>
                                      setSplitInputs((current) => ({
                                        ...current,
                                        [row.id]: event.target.value,
                                      }))
                                    }
                                    className="h-7 rounded border border-[#D3E1EC] px-2 font-montserrat text-[12px] outline-none focus:border-[#007EA7]"
                                  />
                                )}
                                <span className="font-montserrat text-[11px] text-[#7288A3]">
                                  {splitMode === "percent"
                                    ? `${inputValue || "0"}% = ${computed.toFixed(2)} ${documentCurrency || "EUR"}`
                                    : splitMode === "amount"
                                      ? documentCurrency || "EUR"
                                      : row.product || `Line ${index + 1}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 border-t border-[#D3E1EC] pt-3">
                          <button
                            type="button"
                            onClick={applySplit}
                            className="h-8 rounded-md bg-[#007EA7] px-4 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006080]"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSplitPanel(false)}
                            className="h-8 rounded-md border border-[#D3E1EC] bg-white px-4 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#007EA7]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex w-[1936px] flex-col">
                {/* Header row */}
                <div className="order-1 flex flex-row items-center gap-[2px] p-[5px]">
                  <div className="flex-shrink-0" style={{ width: 18 }} />
                  <div className="w-6 flex-shrink-0" />
                  {[
                    { label: "Barcode", w: 100 },
                    { label: "System ID", w: 110 },
                    { label: "Product", w: 140, required: true },
                    { label: "Product group", w: 130 },
                    { label: "Unit of measure", w: 110, required: true },
                    { label: "Quantity", w: 80, required: true },
                    { label: "Price", w: 90, required: true },
                    { label: "Amount", w: 90, required: true },
                    { label: "Discount", w: 90, required: true },
                    { label: "VAT", w: 80, required: true },
                    { label: "VAT %", w: 70, required: true },
                    { label: "Total Amount", w: 110, required: true },
                    { label: "Document Number", w: 120 },
                    { label: "Department", w: 100 },
                    { label: "Object", w: 90 },
                    { label: "Series", w: 80 },
                    { label: "Center", w: 90 },
                    { label: "GL account", w: 110 },
                    { label: "VAT Classifier", w: 110 },
                  ].map((h) => (
                    <div
                      key={h.label}
                      className="flex items-center flex-shrink-0"
                      style={{ width: h.w }}
                    >
                      <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3] truncate">
                        {h.label}
                        {h.required && (
                          <span className="ml-0.5 text-[#D64545]">*</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Split panel */}
                {showSplitPanel &&
                  lineItems.length > 0 &&
                  (() => {
                    const base = parseAmount(doc.amountWithoutVat);
                    const totalPct = lineItems.reduce(
                      (s, r) => s + (parseFloat(splitInputs[r.id] ?? "0") || 0),
                      0,
                    );
                    const totalAmt = lineItems.reduce(
                      (s, r) => s + (parseFloat(splitInputs[r.id] ?? "0") || 0),
                      0,
                    );
                    return (
                      <div className="order-3 mt-2 flex flex-col gap-3 rounded-lg border border-[#007EA7]/30 bg-[#F8FDFF] p-4">
                        {/* Top bar */}
                        <div className="flex flex-row items-center gap-3 flex-wrap">
                          <span className="font-montserrat font-semibold text-[12px] text-[#10233A]">
                            Split:{" "}
                            <span className="text-[#007EA7]">
                              {doc.totalAmount || "0.00"}
                            </span>
                          </span>
                          <div className="flex flex-row items-center gap-1 bg-white border border-[#D3E1EC] rounded-md p-[2px]">
                            {(["equal", "percent", "amount"] as const).map(
                              (m) => (
                                <button
                                  key={m}
                                  onClick={() => {
                                    setSplitMode(m);
                                    const init: Record<string, string> = {};
                                    if (m === "equal") {
                                      lineItems.forEach((r) => {
                                        init[r.id] = "";
                                      });
                                    } else if (m === "percent") {
                                      const eq = (
                                        100 / lineItems.length
                                      ).toFixed(2);
                                      lineItems.forEach((r) => {
                                        init[r.id] = eq;
                                      });
                                    } else {
                                      const each = (
                                        base / lineItems.length
                                      ).toFixed(2);
                                      lineItems.forEach((r) => {
                                        init[r.id] = each;
                                      });
                                    }
                                    setSplitInputs(init);
                                  }}
                                  className={`px-3 py-1 rounded text-[11px] font-montserrat font-semibold transition-colors ${splitMode === m ? "bg-[#007EA7] text-white" : "text-[#7288A3] hover:text-[#10233A]"}`}
                                >
                                  {m === "equal"
                                    ? "Equal"
                                    : m === "percent"
                                      ? "By %"
                                      : "By amount"}
                                </button>
                              ),
                            )}
                          </div>
                          <span className="font-montserrat text-[11px] text-[#7288A3] ml-auto">
                            {splitMode === "equal"
                              ? `${lineItems.length} rows × ${(base / lineItems.length).toFixed(2)} ${documentCurrency || "EUR"}`
                              : splitMode === "percent"
                                ? `Total: ${totalPct.toFixed(1)}%`
                                : `Total: ${totalAmt.toFixed(2)} / ${base.toFixed(2)}`}
                          </span>
                        </div>

                        {/* Per-row inputs */}
                        <div className="flex flex-col gap-1">
                          {lineItems.map((r, i) => {
                            const inputVal = splitInputs[r.id] ?? "";
                            const computed =
                              splitMode === "equal"
                                ? (base / lineItems.length).toFixed(2)
                                : splitMode === "percent"
                                  ? (
                                      (base * (parseFloat(inputVal) || 0)) /
                                      100
                                    ).toFixed(2)
                                  : inputVal;
                            return (
                              <div
                                key={r.id}
                                className="flex flex-row items-center gap-3"
                              >
                                <span className="font-montserrat font-medium text-[11px] text-[#A1B6C6] w-6 text-right flex-shrink-0">
                                  {i + 1}
                                </span>
                                {splitMode === "equal" ? (
                                  <div
                                    className="flex items-center px-2 h-7 border border-[#D3E1EC] rounded bg-[#F7F7F7] flex-shrink-0"
                                    style={{ width: 130 }}
                                  >
                                    <span className="font-montserrat font-medium text-[12px] text-[#828588]">
                                      {computed} {documentCurrency || "EUR"}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      step={
                                        splitMode === "percent"
                                          ? "0.01"
                                          : "0.01"
                                      }
                                      value={inputVal}
                                      onChange={(e) =>
                                        setSplitInputs((prev) => ({
                                          ...prev,
                                          [r.id]: e.target.value,
                                        }))
                                      }
                                      className="h-7 px-2 border border-[#D3E1EC] rounded text-[12px] font-montserrat focus:outline-none focus:border-[#007EA7] transition-colors"
                                      style={{ width: 80 }}
                                      placeholder={
                                        splitMode === "percent" ? "%" : "0.00"
                                      }
                                    />
                                    {splitMode === "percent" && (
                                      <>
                                        <span className="font-montserrat text-[11px] text-[#7288A3]">
                                          %
                                        </span>
                                        <span className="font-montserrat text-[11px] text-[#10233A]">
                                          = {computed} {documentCurrency || "EUR"}
                                        </span>
                                      </>
                                    )}
                                    {splitMode === "amount" && (
                                      <span className="font-montserrat text-[11px] text-[#7288A3]">
                                        {documentCurrency || "EUR"}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-row items-center gap-2 pt-1 border-t border-[#D3E1EC]">
                          <button
                            data-system-action="true"
                            onClick={applySplit}
                            className="px-4 py-1.5 rounded-md bg-[#007EA7] text-white font-montserrat font-semibold text-[12px] hover:bg-[#006080] transition-colors"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => setShowSplitPanel(false)}
                            className="px-4 py-1.5 rounded-md border border-[#D3E1EC] text-[#7288A3] font-montserrat font-semibold text-[12px] hover:border-[#007EA7] hover:text-[#10233A] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                {/* Data rows */}
                <div className="order-2 flex flex-col">
                  {lineItems.map((row, i) => (
                    <div
                      key={row.id}
                      className="flex flex-row items-center gap-[2px] p-[5px] rounded-lg"
                      style={{
                        background: i % 2 === 0 ? "#F8FDFF" : "#FFFFFF",
                      }}
                    >
                      <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 18 }}
                      >
                        <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#A1B6C6]">
                          {i + 1}
                        </span>
                      </div>
                      <button
                        className="flex items-center justify-center px-1 flex-shrink-0"
                        style={{ width: 24 }}
                        disabled={lineItems.length === 1}
                        onClick={() =>
                          setLineItems((prev) =>
                            prev.filter((r) => r.id !== row.id),
                          )
                        }
                      >
                        <Trash2
                          size={14}
                          className={
                            lineItems.length === 1
                              ? "text-[#D3E1EC]"
                              : "text-[#FF6200] opacity-60 hover:opacity-100 transition-opacity"
                          }
                        />
                      </button>
                      <EditCell
                        value={row.barcode}
                        width={100}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, barcode: v } : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.systemId}
                        width={110}
                        readOnly
                        grey
                        onChange={() => {}}
                      />
                      <EditCell
                        value={row.product}
                        width={140}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, product: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.productGroup}
                        width={130}
                        lookupType="product_group"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, productGroup: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.unit}
                        width={110}
                        lookupType="unit"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, unit: v } : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.qty}
                        width={80}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? recalcRow(r, "qty", v) : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.price}
                        width={90}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? recalcRow(r, "price", v) : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.subtotal}
                        width={90}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? recalcRow(r, "subtotal", v)
                                : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.discount}
                        width={90}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, discount: v } : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.vat}
                        width={80}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? recalcRow(r, "vat", v) : r,
                            ),
                          )
                        }
                      />
                      <PercentEditCell
                        value={row.vatPct}
                        width={70}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? recalcRow(
                                    r,
                                    "vatPct",
                                    formatVatPercent(v),
                                  )
                                : r,
                            ),
                          )
                        }
                      />
                      <EditCell
                        value={row.total}
                        width={110}
                        readOnly
                        onChange={() => {}}
                        grey
                      />
                      <EditCell
                        value={row.code}
                        width={120}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, code: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.department}
                        width={100}
                        lookupType="department_code"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, department: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.object}
                        width={90}
                        lookupType="object_project"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, object: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.series}
                        width={80}
                        lookupType="series"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, series: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.center}
                        width={90}
                        lookupType="cost_center"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, center: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.expense}
                        width={110}
                        lookupType="gl_account"
                        companyId={doc.companyId}
                        generalLedgerName={generalLedgerName}
                        onOpenGeneralLedger={onOpenGeneralLedger}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, expense: v } : r,
                            ),
                          )
                        }
                      />
                      <LookupDropdownCell
                        value={row.vatClass}
                        width={110}
                        lookupType="vat_class"
                        companyId={doc.companyId}
                        onChange={(v) =>
                          setLineItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, vatClass: v } : r,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                  </div>
                )}
              </div>

              {/* History */}
              <div className="flex flex-col gap-4">
                {/* Header row */}
                <div className="flex flex-row items-center gap-3 pl-3">
                  <div
                    className="flex items-center gap-1.5"
                    style={{ width: 158 }}
                  >
                    <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">
                      Date
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <div className="w-3 h-px bg-[#10233A]" />
                      <div className="w-2 h-px bg-[#10233A]" />
                      <div className="w-1 h-px bg-[#10233A]" />
                    </div>
                  </div>
                  <div className="w-px h-5 bg-[#D3E1EC]" />
                  <div style={{ width: 120 }}>
                    <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3]">
                      User
                    </span>
                  </div>
                  <div className="w-px h-5 bg-[#D3E1EC]" />
                  <div style={{ width: 136 }}>
                    <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3]">
                      Action
                    </span>
                  </div>
                  <div className="w-px h-5 bg-[#D3E1EC]" />
                  <div className="flex-1">
                    <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3]">
                      Details
                    </span>
                  </div>
                </div>

                {/* Rows */}
                <div className="flex flex-col">
                  {history.length === 0 && (
                    <div className="flex items-center justify-center py-6">
                      <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#A1B6C6]">
                        No status changes recorded yet
                      </span>
                    </div>
                  )}
                  {history.map((row, i) => {
                    const d = new Date(row.created_at);
                    const dateStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} — ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    return (
                      <div
                        key={row.id}
                        className="flex flex-row items-center rounded-lg"
                        style={{
                          background: i % 2 === 0 ? "#F8FDFF" : "#FFFFFF",
                          height: 36,
                        }}
                      >
                        <div
                          className="flex items-center px-3 flex-shrink-0"
                          style={{ width: 180 }}
                        >
                          <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
                            {dateStr}
                          </span>
                        </div>
                        <div className="flex items-center flex-1 px-3 gap-6">
                          <span
                            className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]"
                            style={{ width: 120 }}
                          >
                            {displayedHistoryUserName(row.user_name || "")}
                          </span>
                          <div
                            className="flex items-center gap-1.5"
                            style={{ width: 136 }}
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{
                                background:
                                  STATUS_COLORS_HIST[row.action] ?? "#A1B6C6",
                              }}
                            />
                            <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">
                              {row.action}
                            </span>
                          </div>
                          <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] truncate">
                            {row.details}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </fieldset>
            </div>
          </div>
          <HorizontalTableScrollbar
            scrollRef={contentRef}
            className="px-6 py-2"
          />
        </div>
      </div>
      {saveMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[110] flex items-center gap-2 rounded-lg bg-[#E7F7EF] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#237A50] shadow-lg"
        >
          <Check size={16} />
          {saveMessage}
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-[110] rounded-lg bg-[#FFF0F0] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#B42318] shadow-lg"
        >
          {saveError}
        </div>
      )}
    </div>
  );
}
