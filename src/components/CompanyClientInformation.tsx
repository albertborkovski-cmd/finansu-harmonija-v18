import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MessageSquare,
  Paperclip,
  Plus,
  Landmark,
  Trash2,
  Building2,
  Upload,
} from "lucide-react";
import { supabase, type Company } from "../lib/supabase";
import { PageActionButton, PageHeader } from "./PageHeader";
import CompanyBreadcrumb from "./CompanyBreadcrumb";
import DepartmentCodesEditor from "./DepartmentCodesEditor";
import OrganizationCounterpartiesSettings from "./OrganizationCounterpartiesSettings";
import {
  addOrganizationReferenceValue,
  loadOrganizationReferenceValues,
  type OrganizationReferenceSection,
} from "./OrganizationReferenceValuesView";
import OrganizationUsersSettings from "./OrganizationUsersSettings";
import OrganizationEmailHistoryView from "./OrganizationEmailHistoryView";
import { loadVatClassificationTemplateNames } from "./VatClassificationsView";
import { loadGeneralLedgerTemplateNames } from "./GeneralLedgerView";
import CompanyClientsView from "./CompanyClientsView";
import { ensureOrganizationProductGroups } from "../lib/organizationProductGroups";
import { loadCompanyLogo, saveCompanyLogo } from "../lib/companyBranding";

const STATS_TABS = [
  "Stats",
  "Divisions",
  "Objects",
  "Series",
  "Centers",
  "Accountable persons",
  "Item groups",
  "Allocations",
  "Clients",
  "Export settings",
];

interface FieldDefinition {
  key: string;
  label: string;
  value: string;
  type?: "select" | "text" | "time";
  options?: string[];
  showTools?: boolean;
  required?: boolean;
  readOnly?: boolean;
  strictOptions?: boolean;
}

type OrganizationBankAccount = {
  id: string;
  iban: string;
  bank: string;
  bankCode: string;
  swift: string;
  primary: boolean;
};

function parseOrganizationBankAccounts(value?: string): OrganizationBankAccount[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is OrganizationBankAccount =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as OrganizationBankAccount).id === "string" &&
            typeof (item as OrganizationBankAccount).iban === "string",
        )
      : [];
  } catch {
    return [];
  }
}

const CLIENT_INFORMATION_STORAGE_KEY = "finansu-harmonija:client-information:";

const CONTACT_FIELD_KEYS = new Set([
  "email",
  "phone",
  "website",
  "accountant",
]);

const ORGANIZATION_DIGITIZATION_FIELD_KEYS = new Set([
  "allowDocumentDuplicates",
  "invoiceDigitization",
  "documentSplitting",
  "rejectNonInvoices",
  "primaryExportFormat",
  "twoFactorAuthentication",
]);

const ORGANIZATION_SHAREPOINT_FIELD_KEYS = new Set([
  "sharepointClientId",
  "sharepointClientSecret",
  "sharepointTenantId",
  "sharepointUrls",
  "sharepointSyncSchedule",
  "sharepointSyncTime",
]);

const SHAREPOINT_SYNC_OPTIONS = [
  "Every 5 minutes",
  "Every hour",
  "Every day",
  "Synchronization disabled",
  "Manual synchronization",
];

const ORGANIZATION_COUNTERPARTIES_FIELD_KEYS = new Set([
  "counterpartiesSettings",
]);

const ORGANIZATION_DIMENSION_EDITORS: Record<
  string,
  {
    title: string;
    requiredLabel: string;
    itemSingular: string;
    itemPlural: string;
  }
> = {
  departmentCodes: {
    title: "Department codes",
    requiredLabel: "Department code required",
    itemSingular: "department code",
    itemPlural: "department codes",
  },
  objects: {
    title: "Objects",
    requiredLabel: "Object required",
    itemSingular: "object",
    itemPlural: "objects",
  },
  projects: {
    title: "Projects",
    requiredLabel: "Project required",
    itemSingular: "project",
    itemPlural: "projects",
  },
  documentSeries: {
    title: "Series",
    requiredLabel: "Series required",
    itemSingular: "series",
    itemPlural: "series",
  },
  costCenters: {
    title: "Cost centers",
    requiredLabel: "Cost center required",
    itemSingular: "cost center",
    itemPlural: "cost centers",
  },
  productGroups: {
    title: "Product Group",
    requiredLabel: "Product Group required",
    itemSingular: "product group",
    itemPlural: "product groups",
  },
};

type DimensionItem = { code: string; name?: string };

function dimensionItems(value: string | undefined): DimensionItem[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as {
      enabled?: boolean;
      items?: Array<{ code?: string; name?: string }>;
    };
    if (Array.isArray(parsed.items)) {
      return parsed.items
        .map((item) => ({
          code: String(item.code ?? "").trim(),
          name: String(item.name ?? "").trim(),
        }))
        .filter((item) => item.code);
    }
  } catch {
    // Legacy values may be comma-separated.
  }
  return value
    .split(",")
    .map((code) => ({ code: code.trim(), name: "" }))
    .filter((item) => item.code);
}

function mergeDimensionValue(
  currentValue: string | undefined,
  incomingCodes: string[],
) {
  const currentItems = dimensionItems(currentValue);
  const existing = new Set(currentItems.map((item) => item.code.toLocaleLowerCase()));
  const additions = incomingCodes
    .map((code) => code.trim())
    .filter((code) => code && !existing.has(code.toLocaleLowerCase()))
    .map((code) => ({ code, name: "" }));
  if (!additions.length) return currentValue ?? "";
  return JSON.stringify({
    enabled: true,
    items: [...currentItems, ...additions],
  });
}

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

function createClientFields(
  company: Company,
  organizationMode = false,
  organizationDesign = false,
): FieldDefinition[] {
  const managedCompanyStatuses =
    loadOrganizationReferenceValues("Company status");
  const managedTaxCountries = loadOrganizationReferenceValues("Tax country");
  const managedLegalForms = loadOrganizationReferenceValues("Legal form");
  const managedBaseCurrencies =
    loadOrganizationReferenceValues("Base currency");
  const vatClassificationTemplates = loadVatClassificationTemplateNames();
  const generalLedgerTemplates = loadGeneralLedgerTemplateNames();
  const selectedGeneralLedger =
    company.general_ledger &&
    generalLedgerTemplates.includes(company.general_ledger)
      ? company.general_ledger
      : "";
  const selectedVatClassification =
    company.vat_classification_template &&
    vatClassificationTemplates.includes(company.vat_classification_template)
      ? company.vat_classification_template
      : "";
  const taxCountry = company.tax_country ?? managedTaxCountries[0];
  const mappedBaseCurrency = COUNTRY_CURRENCIES[taxCountry] ?? "EUR";
  const legalFormCandidate = company.legal_form ?? company.company_type;
  const legalForm =
    legalFormCandidate && managedLegalForms.includes(legalFormCandidate)
      ? legalFormCandidate
      : managedLegalForms[0];
  const baseCurrencyCandidate = company.base_currency ?? mappedBaseCurrency;
  const baseCurrency = managedBaseCurrencies.includes(baseCurrencyCandidate)
    ? baseCurrencyCandidate
    : managedBaseCurrencies[0];
  const defaultFields: FieldDefinition[] = [
    {
      key: "status",
      label: "Company status",
      value: company.company_status ?? "Active",
      type: "select",
      options: organizationMode
        ? managedCompanyStatuses
        : ["Active", "Inactive", "Pending review"],
    },
    {
      key: "taxCountry",
      label: "Tax country *",
      value: taxCountry,
      type: "select",
      options: managedTaxCountries,
      required: true,
    },
    ...(organizationMode
      ? [
          {
            key: "legalForm",
            label: "Legal form *",
            value: legalForm,
            type: "select" as const,
            options: managedLegalForms,
            required: true,
          },
          {
            key: "baseCurrency",
            label: "Base currency *",
            value: baseCurrency,
            type: "select" as const,
            options: managedBaseCurrencies,
            required: true,
          },
        ]
      : []),
    {
      key: "legalName",
      label: organizationMode ? "Company name *" : "Legal company name",
      value: company.name,
      showTools: !organizationMode && !organizationDesign,
      required: organizationMode,
    },
    {
      key: "companyCode",
      label: organizationMode ? "Company code *" : "Company code",
      value: company.company_code,
      showTools: !organizationMode && !organizationDesign,
      required: organizationMode,
    },
    {
      key: "vatCode",
      label: "Company VAT code",
      value: company.vat_code,
      showTools: !organizationMode && !organizationDesign,
    },
    ...(organizationMode
      ? [
          {
            key: "generalLedger",
            label: "General ledger (DK) *",
            value: selectedGeneralLedger,
            type: "select" as const,
            options: generalLedgerTemplates,
            required: true,
            strictOptions: true,
          },
          {
            key: "vatClassification",
            label: "VAT classification *",
            value: selectedVatClassification,
            type: "select" as const,
            options: vatClassificationTemplates,
            required: true,
            strictOptions: true,
          },
          {
            key: "departmentCodes",
            label: "Department codes",
            value: company.department_codes ?? "",
          },
          {
            key: "objects",
            label: "Objects",
            value: company.objects ?? "",
          },
          {
            key: "projects",
            label: "Projects",
            value: company.projects ?? "",
          },
          {
            key: "costCenters",
            label: "Cost centers",
            value: company.cost_centers ?? "",
          },
          {
            key: "productGroups",
            label: "Product Group",
            value: company.product_groups ?? "",
          },
          {
            key: "documentSeries",
            label: "Series",
            value: company.document_series ?? "",
          },
          {
            key: "allowDocumentDuplicates",
            label: "Allow document duplicates",
            value: company.allow_document_duplicates ?? "No",
            type: "select" as const,
            options: YES_NO_OPTIONS,
          },
          {
            key: "invoiceDigitization",
            label: "Invoice digitization",
            value: company.invoice_digitization ?? "Summary",
            type: "select" as const,
            options: INVOICE_DIGITIZATION_OPTIONS,
          },
          {
            key: "documentSplitting",
            label: "Document splitting",
            value: company.document_splitting ?? "Split",
            type: "select" as const,
            options: DOCUMENT_SPLITTING_OPTIONS,
          },
          {
            key: "rejectNonInvoices",
            label: "Reject non-invoices",
            value: company.reject_non_invoices ?? "Do not reject",
            type: "select" as const,
            options: REJECT_NON_INVOICE_OPTIONS,
          },
          {
            key: "primaryExportFormat",
            label: "Primary export format",
            value: company.primary_export_format ?? "Rivilė",
            type: "select" as const,
            options: EXPORT_FORMAT_OPTIONS,
          },
          {
            key: "twoFactorAuthentication",
            label: "Two-factor authentication (2FA)",
            value: company.two_factor_authentication ?? "No",
            type: "select" as const,
            options: YES_NO_OPTIONS,
          },
          {
            key: "sharepointClientId",
            label: "SharePoint Client ID",
            value: company.sharepoint_client_id ?? "",
          },
          {
            key: "sharepointClientSecret",
            label: "SharePoint Client secret",
            value: company.sharepoint_client_secret ?? "",
          },
          {
            key: "sharepointTenantId",
            label: "SharePoint Tenant ID",
            value: company.sharepoint_tenant_id ?? "",
          },
          {
            key: "sharepointUrls",
            label: "SharePoint URLs",
            value: company.sharepoint_urls ?? "",
          },
          {
            key: "sharepointSyncSchedule",
            label: "Synchronization schedule",
            value:
              company.sharepoint_sync_schedule ?? "Manual synchronization",
            type: "select" as const,
            options: SHAREPOINT_SYNC_OPTIONS,
            strictOptions: true,
          },
          {
            key: "sharepointSyncTime",
            label: "Daily synchronization time",
            value: company.sharepoint_sync_time ?? "09:00",
            type: "time" as const,
          },
          {
            key: "counterpartiesSettings",
            label: "Counterparties Settings",
            value: company.counterparties_settings ?? "",
          },
        ]
      : []),
    ...(!organizationMode
      ? [
          {
            key: "clientType",
            label: "Client type",
            value: company.client_type ?? "Legal entity",
            type: "select" as const,
            options: ["Legal entity", "Individual", "Non-profit organization"],
          },
        ]
      : []),
    {
      key: "address",
      label: "Registered address",
      value: company.address ?? "Vilnius, Lithuania",
      showTools: !organizationMode && !organizationDesign,
    },
    {
      key: "email",
      label: "Primary email",
      value: company.email ?? "finance@company.lt",
      showTools: !organizationMode && !organizationDesign,
    },
    {
      key: "phone",
      label: "Phone number",
      value: company.phone ?? "+370 600 00000",
      showTools: !organizationMode && !organizationDesign,
    },
    {
      key: "website",
      label: "Website",
      value: company.website ?? "www.company.lt",
      showTools: !organizationMode && !organizationDesign,
    },
    {
      key: "clientSince",
      label: "Client since",
      value: String(company.client_since),
    },
    ...(!organizationMode
      ? [
          {
            key: "accountant",
            label: "Assigned accountant",
            value: company.assigned_accountant ?? "Viltvidas Voronkovas",
            type: "select" as const,
            options: ["Viltvidas Voronkovas", "Alice Stone", "John Smith"],
          },
        ]
      : []),
    ...(!organizationMode
      ? [
          {
            key: "companyType",
            label: "Company type",
            value: company.company_type ?? "UAB",
            type: "select" as const,
            options: ["UAB", "MB", "AB", "Individual activity"],
          },
        ]
      : []),
    ...(!organizationMode
      ? [
          {
            key: "serviceScope",
            label: "Service scope",
            value: company.service_scope ?? "Full accounting",
            type: "select" as const,
            options: ["Full accounting", "Payroll", "Document processing"],
          },
        ]
      : []),
    {
      key: "notes",
      label: "Client notes",
      value:
        company.client_notes ?? "Priority client. Monthly reporting required.",
      showTools: !organizationMode && !organizationDesign,
    },
  ];

  if (typeof window === "undefined") return defaultFields;

  try {
    const storedValues = JSON.parse(
      window.localStorage.getItem(
        `${CLIENT_INFORMATION_STORAGE_KEY}${company.id}`,
      ) ?? "{}",
    ) as Record<string, string>;
    const companyValues: Record<string, string | number | undefined> = {
      status: company.company_status,
      legalName: company.name,
      companyCode: company.company_code,
      vatCode: company.vat_code,
      clientType: company.client_type,
      address: company.address,
      email: company.email,
      phone: company.phone,
      website: company.website,
      clientSince: company.client_since,
      accountant: company.assigned_accountant,
      companyType: company.company_type,
      serviceScope: company.service_scope,
      notes: company.client_notes,
      taxCountry: company.tax_country,
      legalForm: company.legal_form,
      baseCurrency: company.base_currency,
      vatClassification: company.vat_classification_template,
      generalLedger: company.general_ledger,
      departmentCodes: company.department_codes,
      objects: company.objects,
      projects: company.projects,
      documentSeries: company.document_series,
      costCenters: company.cost_centers,
      productGroups: company.product_groups,
      allowDocumentDuplicates: company.allow_document_duplicates,
      invoiceDigitization: company.invoice_digitization,
      documentSplitting: company.document_splitting,
      rejectNonInvoices: company.reject_non_invoices,
      primaryExportFormat: company.primary_export_format,
      twoFactorAuthentication: company.two_factor_authentication,
      sharepointClientId: company.sharepoint_client_id,
      sharepointClientSecret: company.sharepoint_client_secret,
      sharepointTenantId: company.sharepoint_tenant_id,
      sharepointUrls: company.sharepoint_urls,
      sharepointSyncSchedule: company.sharepoint_sync_schedule,
      sharepointSyncTime: company.sharepoint_sync_time,
      counterpartiesSettings: company.counterparties_settings,
    };
    return defaultFields.map((field) =>
      companyValues[field.key] !== undefined ||
      storedValues[field.key] === undefined
        ? field
        : { ...field, value: storedValues[field.key] },
    );
  } catch {
    return defaultFields;
  }
}

function ClientField({
  field,
  onChange,
}: {
  field: FieldDefinition;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [addingOption, setAddingOption] = useState(false);
  const [newOption, setNewOption] = useState("");
  const referenceSectionByField: Partial<
    Record<string, OrganizationReferenceSection>
  > = {
    taxCountry: "Tax country",
    legalForm: "Legal form",
    baseCurrency: "Base currency",
  };
  const referenceSection = referenceSectionByField[field.key];
  const allowCreate = Boolean(referenceSection);
  const optionName = field.label.replace(" *", "");
  const optionNameLower = optionName.toLowerCase();
  const required = field.required || field.label.trim().endsWith("*");
  const visibleOptions = Array.from(
    new Set([
      ...(field.options ?? []),
      ...(!field.strictOptions && field.value ? [field.value] : []),
      ...customOptions,
    ]),
  ).filter((option) => option !== "Other");
  const filteredOptions = visibleOptions.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
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
    setIsOpen(false);
  };
  const controlClass =
    "h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors focus:border-[#1B55E9]";

  return (
    <label className="flex h-[70px] w-full flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
        {optionName}
        {required && <span className="ml-1 text-[#E45858]">*</span>}
      </span>
      <span className="relative flex h-[42px] items-center">
        {field.type === "select" ? (
          <span className="relative block h-[42px] w-full">
            <input
              role="combobox"
              aria-label={field.label}
              aria-required={required}
              aria-expanded={isOpen}
              value={isOpen ? query : field.value}
              placeholder="Select"
              autoComplete="off"
              onFocus={(event) => { setQuery(""); setIsOpen(true); event.currentTarget.select(); }}
              onClick={() => setIsOpen(true)}
              onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
              className={`${controlClass} pr-10`}
            />
            <button type="button" tabIndex={-1} aria-label={`Open ${optionNameLower} options`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setIsOpen((current) => !current); }} className="absolute right-0 top-0 flex h-[42px] w-10 items-center justify-center text-[#7288A3]">
              <ChevronDown
                size={16}
                className={`flex-shrink-0 text-[#7288A3] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <span
                role="listbox"
                aria-label={`${field.label} options`}
                className="absolute left-0 top-[46px] z-30 block max-h-60 w-full overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
              >
                {filteredOptions.map((option) => {
                  const selected = option === field.value;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${selected ? "bg-[#F0F7FA]" : "hover:bg-[#F7FBFC]"}`}
                    >
                      <span
                        className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                      >
                        {selected && (
                          <Check
                            size={13}
                            strokeWidth={3}
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
        ) : (
          <>
            <input
              type={field.type === "time" ? "time" : "text"}
              aria-label={field.label}
              aria-required={required}
              required={required}
              value={field.value}
              readOnly={field.readOnly}
              onChange={(event) => onChange(event.target.value)}
              className={`${controlClass} ${field.showTools ? "pr-[76px]" : ""} ${field.readOnly ? "bg-[#F7FBFC] text-[#7288A3]" : ""}`}
            />
            {field.showTools && (
              <span className="absolute right-[14px] flex items-center gap-3 text-[#7288A3]">
                <button
                  type="button"
                  aria-label={`Attach file to ${field.label}`}
                  className="flex h-6 w-6 items-center justify-center hover:text-[#007EA7]"
                >
                  <Paperclip size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Add comment to ${field.label}`}
                  className="flex h-6 w-6 items-center justify-center hover:text-[#1B55E9]"
                >
                  <MessageSquare size={16} />
                </button>
              </span>
            )}
          </>
        )}
      </span>
    </label>
  );
}

export default function CompanyClientInformation({
  company,
  activeTab,
  onCompanyUpdated,
  onBack,
  onNavigateToUserDirectory,
  organizationMode = false,
  organizationDesign = false,
  createMode = false,
}: {
  company: Company;
  activeTab: string;
  onCompanyUpdated?: (company: Company) => void;
  onBack?: () => void;
  onNavigateToUserDirectory?: (
    audience: "Internal users" | "External users",
  ) => void;
  organizationMode?: boolean;
  organizationDesign?: boolean;
  createMode?: boolean;
}) {
  const organizationInformationDesign = organizationMode || organizationDesign;
  const [companyLogo, setCompanyLogo] = useState(() =>
    company.logo_url || loadCompanyLogo(company.id),
  );
  const [companyLogoError, setCompanyLogoError] = useState("");
  const [activeStatsTab, setActiveStatsTab] = useState("Stats");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [organizationFormSection, setOrganizationFormSection] = useState<
    | "general"
    | "banking"
    | "digitization"
    | "sharepoint"
    | "counterparties"
    | "users"
    | "email-history"
  >("general");
  const [organizationBankAccounts, setOrganizationBankAccounts] = useState<
    OrganizationBankAccount[]
  >(() => parseOrganizationBankAccounts(company.organization_bank_accounts));
  const [fields, setFields] = useState<FieldDefinition[]>(() =>
    createClientFields(
      company,
      organizationInformationDesign,
      organizationDesign,
    ),
  );

  useEffect(() => {
    setSaved(false);
    setSaveError("");
  }, [activeTab]);

  useEffect(() => {
    setCompanyLogo(company.logo_url || loadCompanyLogo(company.id));
    setCompanyLogoError("");
  }, [company.id, company.logo_url]);

  const updateCompanyLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg)$/)) {
      setCompanyLogoError("Use a PNG or JPG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setCompanyLogoError("The logo must be smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const logo = typeof reader.result === "string" ? reader.result : "";
      if (!logo) return;
      setCompanyLogo(logo);
      setCompanyLogoError("");
      saveCompanyLogo(company.id, logo);
      onCompanyUpdated?.({ ...company, logo_url: logo });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    setOrganizationBankAccounts(
      parseOrganizationBankAccounts(company.organization_bank_accounts),
    );
  }, [company.id, company.organization_bank_accounts]);

  useEffect(() => {
    const refreshManagedFields = () => {
      setFields((current) => {
        const refreshed = createClientFields(
          company,
          organizationInformationDesign,
          organizationDesign,
        );
        const currentValues = new Map(
          current.map((field) => [field.key, field.value]),
        );
        return refreshed.map((field) => ({
          ...field,
          value:
            currentValues.has(field.key) &&
            (field.type !== "select" ||
              field.options?.includes(currentValues.get(field.key) ?? ""))
              ? currentValues.get(field.key) ?? field.value
              : field.value,
        }));
      });
    };
    window.addEventListener(
      "organization-reference-updated",
      refreshManagedFields,
    );
    window.addEventListener(
      "vat-classifications-updated",
      refreshManagedFields,
    );
    window.addEventListener("general-ledger-updated", refreshManagedFields);
    return () => {
      window.removeEventListener(
        "organization-reference-updated",
        refreshManagedFields,
      );
      window.removeEventListener(
        "vat-classifications-updated",
        refreshManagedFields,
      );
      window.removeEventListener("general-ledger-updated", refreshManagedFields);
    };
  }, [company, organizationDesign, organizationInformationDesign]);

  useEffect(() => {
    if (!organizationInformationDesign || createMode || !company.id) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("documents")
        .select("department_code,cost_center,object_project")
        .eq("company_id", company.id),
      supabase.from("lookup_values").select("type,value"),
    ]).then(async ([documentsResult, lookupResult]) => {
      if (cancelled) return;
      const documents = documentsResult.data ?? [];
      const lookups = lookupResult.data ?? [];
      const codesFor = (field: string, type: string) => [
        ...documents.map((row) => String(row[field] ?? "")),
        ...lookups
          .filter((row) => row.type === `${type}::company::${company.id}`)
          .map((row) => String(row.value ?? "")),
      ].filter(Boolean);
      const productGroups = lookups
        .filter(
          (row) =>
            row.type === `product_group::company::${company.id}`,
        )
        .map((row) => String(row.value ?? "").trim())
        .filter(Boolean);
      await ensureOrganizationProductGroups(company.id, productGroups);
      if (cancelled) return;
      setFields((current) =>
        current.map((field) => {
          if (field.key === "departmentCodes") {
            return { ...field, value: mergeDimensionValue(field.value, codesFor("department_code", "department_code")) };
          }
          if (field.key === "costCenters") {
            return { ...field, value: mergeDimensionValue(field.value, codesFor("cost_center", "cost_center")) };
          }
          if (field.key === "objects") {
            return { ...field, value: mergeDimensionValue(field.value, codesFor("object_project", "object_project")) };
          }
          if (field.key === "productGroups") {
            return {
              ...field,
              value: mergeDimensionValue(field.value, productGroups),
            };
          }
          return field;
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [company.id, createMode, organizationInformationDesign]);

  const updateField = (key: string, value: string) => {
    setSaved(false);
    setSaveError("");
    setFields((current) => {
      const normalizedValue =
        key === "legalName" ? value.replace(/["“”„]/g, "") : value;
      if (key !== "taxCountry") {
        return current.map((field) =>
          field.key === key ? { ...field, value: normalizedValue } : field,
        );
      }
      const legalOptions = loadOrganizationReferenceValues("Legal form");
      const managedBaseCurrencies =
        loadOrganizationReferenceValues("Base currency");
      return current.map((field) => {
        if (field.key === "taxCountry") {
          return { ...field, value: normalizedValue };
        }
        if (field.key === "baseCurrency") {
          const mappedCurrency = COUNTRY_CURRENCIES[normalizedValue] ?? "EUR";
          return {
            ...field,
            value: managedBaseCurrencies.includes(mappedCurrency)
              ? mappedCurrency
              : managedBaseCurrencies[0],
          };
        }
        if (field.key === "legalForm") {
          return {
            ...field,
            options: legalOptions,
            value: legalOptions.includes(field.value)
              ? field.value
              : legalOptions[0],
          };
        }
        return field;
      });
    });
  };

  const saveClientInformation = async () => {
    if (
      organizationInformationDesign &&
      !createMode &&
      organizationFormSection === "banking"
    ) {
      setSaving(true);
      setSaveError("");
      try {
        const serializedAccounts = JSON.stringify(organizationBankAccounts);
        const { error } = await supabase
          .from("companies")
          .update({ organization_bank_accounts: serializedAccounts })
          .eq("id", company.id);
        if (error) throw new Error(error.message);
        const savedCompany = {
          ...company,
          organization_bank_accounts: serializedAccounts,
        };
        window.dispatchEvent(
          new CustomEvent("finansu-harmonija:settings-data-changed", {
            detail: { scope: "organizations", companyId: company.id },
          }),
        );
        onCompanyUpdated?.(savedCompany);
        setSaved(true);
      } catch {
        setSaveError(
          "Bank information could not be saved. Please try again.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    const values = Object.fromEntries(
      fields.map((field) => [field.key, field.value]),
    );
    if (fields.some((field) => field.required && !field.value.trim())) {
      setSaveError("Please complete all required fields.");
      return;
    }
    if (/["“”„]/.test(values.legalName)) {
      setSaveError("Company name cannot contain quotation marks.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const companyUpdate: Partial<Company> = {
        name: values.legalName.trim(),
        company_code: values.companyCode.trim(),
        vat_code: values.vatCode.trim(),
        company_status: values.status,
        tax_country: values.taxCountry,
        client_type: values.clientType ?? company.client_type,
        address: values.address,
        email: values.email,
        phone: values.phone,
        website: values.website,
        client_since: Number(values.clientSince) || company.client_since,
        assigned_accountant: values.accountant,
        company_type: values.companyType,
        service_scope: values.serviceScope ?? company.service_scope,
        client_notes: values.notes,
        ...(organizationInformationDesign
          ? {
              legal_form: values.legalForm,
              base_currency: values.baseCurrency,
              vat_classification_template: values.vatClassification,
              general_ledger: values.generalLedger,
              company_type: values.legalForm,
              department_codes: values.departmentCodes,
              objects: values.objects,
              projects: values.projects,
              document_series: values.documentSeries,
              cost_centers: values.costCenters,
              product_groups: values.productGroups,
              allow_document_duplicates: values.allowDocumentDuplicates,
              invoice_digitization: values.invoiceDigitization,
              document_splitting: values.documentSplitting,
              reject_non_invoices: values.rejectNonInvoices,
              primary_export_format: values.primaryExportFormat,
              two_factor_authentication: values.twoFactorAuthentication,
              sharepoint_client_id: values.sharepointClientId,
              sharepoint_client_secret: values.sharepointClientSecret,
              sharepoint_tenant_id: values.sharepointTenantId,
              sharepoint_urls: values.sharepointUrls,
              sharepoint_sync_schedule: values.sharepointSyncSchedule,
              sharepoint_sync_time: values.sharepointSyncTime,
              counterparties_settings: values.counterpartiesSettings,
              organization_bank_accounts: JSON.stringify(
                organizationBankAccounts,
              ),
            }
          : {}),
      };
      if (organizationInformationDesign) {
        const { data: companyRows, error: companyLookupError } = await supabase
          .from("companies")
          .select("*");
        if (companyLookupError) throw new Error(companyLookupError.message);
        const duplicateCode = (companyRows ?? []).some(
          (row) =>
            String(row.id) !== company.id &&
            String(row.company_code).trim().toLowerCase() ===
              values.companyCode.trim().toLowerCase(),
        );
        if (duplicateCode) throw new Error("DUPLICATE_COMPANY_CODE");
      }
      const saveResult = createMode
        ? await supabase.from("companies").insert({
            ...companyUpdate,
            client_since:
              Number(values.clientSince) || new Date().getFullYear(),
            action_required: 0,
          })
        : await supabase
            .from("companies")
            .update(companyUpdate)
            .eq("id", company.id);
      const { error } = saveResult;
      if (error) throw new Error(error.message);
      const savedCompany = createMode
        ? ({
            ...company,
            ...companyUpdate,
            ...((saveResult.data?.[0] ?? {}) as Partial<Company>),
          } as Company)
        : ({ ...company, ...companyUpdate } as Company);
      if (organizationInformationDesign) {
        const scopedSeriesType = `series::company::${savedCompany.id}`;
        await supabase
          .from("lookup_values")
          .delete()
          .eq("type", scopedSeriesType);
        const lookupRows = [
          ...dimensionItems(values.departmentCodes).map((item) => ({
            type: `department_code::company::${savedCompany.id}`,
            value: item.code,
          })),
          ...dimensionItems(values.costCenters).map((item) => ({
            type: `cost_center::company::${savedCompany.id}`,
            value: item.code,
          })),
          ...dimensionItems(values.objects).map((item) => ({
            type: `object_project::company::${savedCompany.id}`,
            value: item.code,
          })),
          ...dimensionItems(values.productGroups).map((item) => ({
            type: `product_group::company::${savedCompany.id}`,
            value: item.code,
          })),
          ...dimensionItems(values.documentSeries).map((item) => ({
            type: scopedSeriesType,
            value: item.code,
          })),
        ];
        if (lookupRows.length) {
          await supabase
            .from("lookup_values")
            .upsert(lookupRows, { onConflict: "type,value" });
        }
      }
      window.localStorage.setItem(
        `${CLIENT_INFORMATION_STORAGE_KEY}${savedCompany.id}`,
        JSON.stringify(values),
      );
      window.dispatchEvent(
        new CustomEvent("finansu-harmonija:settings-data-changed", {
          detail: { scope: "organizations" },
        }),
      );
      onCompanyUpdated?.(savedCompany);
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message === "DUPLICATE_COMPANY_CODE"
          ? "Company code must be unique."
          : "Client information could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col items-start gap-8 bg-white px-[72px] py-14">
      <PageHeader
        title={createMode ? "Create organization" : company.name}
        className="max-w-[1440px]"
        leading={
          onBack ? (
            <button
              type="button"
              aria-label="Back to organizations"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
            >
              <ArrowLeft size={20} />
            </button>
          ) : undefined
        }
        actions={
          (activeTab === "Client information" &&
            (!organizationInformationDesign ||
              organizationFormSection !== "email-history")) ||
          (!organizationMode && activeTab === "Contacts") ? (
            <>
              <PageActionButton onClick={saveClientInformation}>
                {saving
                  ? "Saving..."
                  : createMode
                    ? "Create organization"
                    : activeTab === "Contacts"
                      ? "Update contacts"
                      : organizationInformationDesign &&
                          organizationFormSection === "banking"
                        ? "Update bank information"
                      : "Update client information"}
              </PageActionButton>
            </>
          ) : undefined
        }
      />
      {!organizationMode && !createMode && (
        <CompanyBreadcrumb
          companyName={company.name}
          items={["Company/Client information", activeTab]}
        />
      )}

      <div className="flex w-full max-w-[1440px] flex-col gap-6">
        {activeTab === "Stats" ? (
          <StatsView
            activeTab={activeStatsTab}
            onTabChange={setActiveStatsTab}
          />
        ) : activeTab === "Client information" ? (
          <div
            className={`flex w-full flex-col gap-6 ${
              organizationInformationDesign &&
              organizationFormSection === "counterparties"
                ? "max-w-[1440px]"
                : organizationInformationDesign &&
                    organizationFormSection === "email-history"
                  ? "max-w-[1440px]"
                : organizationInformationDesign &&
                    organizationFormSection === "users"
                  ? "max-w-[1180px]"
                  : organizationInformationDesign &&
                      organizationFormSection === "banking"
                    ? "max-w-[1180px]"
                  : organizationInformationDesign &&
                      organizationFormSection === "general"
                    ? "max-w-[1180px]"
                    : organizationDesign
                      ? "max-w-[1180px]"
                    : "max-w-[980px]"
            }`}
          >
            {organizationInformationDesign && (
              <div
                role="tablist"
                aria-label="Organization settings sections"
                className="flex w-full overflow-x-auto border-b border-[#DDE7F0]"
              >
                {[
                  ["general", "Organization information"],
                  ["banking", "Bank information"],
                  ["digitization", "Document digitization settings"],
                  ["sharepoint", "SharePoint settings"],
                  ["counterparties", "Counterparties Settings"],
                  ["users", "Users"],
                  ["email-history", "Sent email history"],
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
                            | "banking"
                            | "digitization"
                            | "sharepoint"
                            | "counterparties"
                            | "users"
                            | "email-history",
                        )
                      }
                      className={`border-b-2 px-5 py-3 font-montserrat text-[14px] font-semibold transition-colors ${
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
            <div
              className={`max-w-full ${
                organizationInformationDesign &&
                organizationFormSection === "counterparties"
                  ? "flex w-full flex-col gap-6"
                  : organizationInformationDesign &&
                      organizationFormSection === "email-history"
                    ? "flex w-full flex-col gap-6"
                  : organizationInformationDesign &&
                      organizationFormSection === "users"
                    ? "flex w-full flex-col gap-6"
                    : organizationInformationDesign &&
                        organizationFormSection === "banking"
                      ? "flex w-full flex-col gap-6"
                    : organizationInformationDesign &&
                        organizationFormSection === "general"
                      ? "grid w-full grid-cols-1 gap-x-5 gap-y-4 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-5 lg:grid-cols-2"
                      : organizationDesign
                        ? "grid w-full grid-cols-1 gap-x-5 gap-y-4 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-5 lg:grid-cols-2"
                      : "flex w-[560px] flex-col gap-6"
              }`}
            >
              {organizationInformationDesign &&
                organizationFormSection === "general" && (
                  <div className="flex items-center gap-4 rounded-lg border border-[#E3ECF3] bg-[#F8FAFC] p-4 lg:col-span-2">
                    <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D3E1EC] bg-white">
                      {companyLogo ? (
                        <img
                          src={companyLogo}
                          alt={`${company.name} company logo`}
                          className="max-h-full max-w-full object-contain p-2"
                        />
                      ) : (
                        <Building2 size={26} className="text-[#8CA1B7]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                        Company logo
                      </p>
                      <p className="mt-0.5 font-montserrat text-[12px] text-[#879BB1]">
                        PNG or JPG image. Used in reports and documents.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4">
                        <label className="inline-flex cursor-pointer items-center gap-2 font-montserrat text-[14px] font-medium text-[#007EA7] hover:text-[#006F91]">
                          <Upload size={16} />
                          {companyLogo ? "Replace logo" : "Upload logo"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={(event) => updateCompanyLogo(event.target.files?.[0])}
                          />
                        </label>
                        {companyLogo && (
                          <button
                            type="button"
                            onClick={() => {
                              setCompanyLogo("");
                              setCompanyLogoError("");
                              saveCompanyLogo(company.id, "");
                              onCompanyUpdated?.({ ...company, logo_url: "" });
                            }}
                            className="font-montserrat text-[13px] font-medium text-[#7288A3] hover:text-[#D64545]"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {companyLogoError && (
                        <p className="mt-2 font-montserrat text-[12px] font-medium text-[#D64545]">
                          {companyLogoError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              {organizationInformationDesign &&
              organizationFormSection === "email-history" ? (
                <OrganizationEmailHistoryView
                  organizationId={company.id}
                  organizationName={company.name}
                />
              ) : organizationInformationDesign &&
                organizationFormSection === "users" ? (
                <OrganizationUsersSettings
                  organizationId={company.id}
                  organizationName={company.name}
                  onCreateUser={(audience) =>
                    onNavigateToUserDirectory?.(audience)
                  }
                />
              ) : organizationInformationDesign &&
                organizationFormSection === "banking" ? (
                <div className="flex w-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-montserrat text-[15px] font-semibold text-[#10233A]">
                        Bank accounts
                      </h3>
                      <p className="mt-1 max-w-[720px] font-montserrat text-[11px] leading-5 text-[#7288A3]">
                        Add one or more organization bank accounts. Only one account can be primary.
                      </p>
                    </div>
                    <PageActionButton
                      onClick={() =>
                        setOrganizationBankAccounts((current) => [
                          ...current,
                          {
                            id: "organization-bank-" + Date.now(),
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
                  {organizationBankAccounts.length ? (
                    organizationBankAccounts.map((account, index) => (
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
                                setOrganizationBankAccounts((current) =>
                                  current.map((item) => ({
                                    ...item,
                                    primary: item.id === account.id,
                                  })),
                                )
                              }
                              className={`rounded-md px-3 py-1.5 font-montserrat text-[11px] font-semibold ${
                                account.primary
                                  ? "bg-[#E7F4F9] text-[#007EA7]"
                                  : "border border-[#D3E1EC] bg-white text-[#7288A3]"
                              }`}
                            >
                              {account.primary ? "Primary" : "Set primary"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete organization bank account ${index + 1}`}
                              onClick={() =>
                                setOrganizationBankAccounts((current) => {
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
                                    key as keyof OrganizationBankAccount
                                  ] as string
                                }
                                onChange={(event) =>
                                  setOrganizationBankAccounts((current) =>
                                    current.map((item) =>
                                      item.id === account.id
                                        ? { ...item, [key]: event.target.value }
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
                          setOrganizationBankAccounts([
                            {
                              id: "organization-bank-" + Date.now(),
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
              ) : (
                fields
                  .filter((field) => {
                    if (!organizationInformationDesign) {
                      return !CONTACT_FIELD_KEYS.has(field.key);
                    }
                    const isDigitizationField =
                      ORGANIZATION_DIGITIZATION_FIELD_KEYS.has(field.key);
                    const isSharePointField =
                      ORGANIZATION_SHAREPOINT_FIELD_KEYS.has(field.key);
                    const isCounterpartiesField =
                      ORGANIZATION_COUNTERPARTIES_FIELD_KEYS.has(field.key);
                    if (organizationFormSection === "digitization") {
                      return isDigitizationField;
                    }
                    if (organizationFormSection === "sharepoint") {
                      return (
                        isSharePointField &&
                        (field.key !== "sharepointSyncTime" ||
                          fields.find(
                            (item) => item.key === "sharepointSyncSchedule",
                          )?.value === "Every day")
                      );
                    }
                    if (organizationFormSection === "counterparties") {
                      return isCounterpartiesField;
                    }
                    if (
                      organizationFormSection === "users" ||
                      organizationFormSection === "email-history"
                    ) return false;
                    return (
                      !isDigitizationField &&
                      !isSharePointField &&
                      !isCounterpartiesField
                    );
                  })
                  .map((field) => {
                    const dimension = ORGANIZATION_DIMENSION_EDITORS[field.key];
                    return organizationInformationDesign &&
                      field.key === "counterpartiesSettings" ? (
                      <OrganizationCounterpartiesSettings
                        key={field.key}
                        value={field.value}
                        onChange={(value) => updateField(field.key, value)}
                      />
                    ) : organizationInformationDesign && dimension ? (
                      <div key={field.key} className="lg:col-span-2">
                        <DepartmentCodesEditor
                          value={field.value}
                          onChange={(value) => updateField(field.key, value)}
                          title={dimension.title}
                          requiredLabel={dimension.requiredLabel}
                          itemSingular={dimension.itemSingular}
                          itemPlural={dimension.itemPlural}
                          manageWhenNotRequired={
                            field.key === "productGroups" ||
                            field.key === "documentSeries"
                          }
                        />
                      </div>
                    ) : (
                      <ClientField
                        key={field.key}
                        field={field}
                        onChange={(value) => updateField(field.key, value)}
                      />
                    );
                  })
              )}
              {saved && (
                <span
                  role="status"
                  className="font-montserrat text-[13px] font-medium text-[#2EA96B] lg:col-span-2"
                >
                  {organizationInformationDesign &&
                  organizationFormSection === "banking"
                    ? "Bank information updated"
                    : "Client information updated"}
                </span>
              )}
              {saveError && (
                <span
                  role="alert"
                  className="font-montserrat text-[13px] font-medium text-[#E45858] lg:col-span-2"
                >
                  {saveError}
                </span>
              )}
            </div>
          </div>
        ) : activeTab === "Contacts" ? (
          <div className="grid w-full max-w-[1180px] grid-cols-1 gap-x-5 gap-y-4 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-5 lg:grid-cols-2">
            {fields
              .filter((field) => CONTACT_FIELD_KEYS.has(field.key))
              .map((field) => (
                <ClientField
                  key={field.key}
                  field={field}
                  onChange={(value) => updateField(field.key, value)}
                />
              ))}
            {saved && (
              <span
                role="status"
                className="font-montserrat text-[13px] font-medium text-[#2EA96B] lg:col-span-2"
              >
                Contact information updated
              </span>
            )}
            {saveError && (
              <span
                role="alert"
                className="font-montserrat text-[13px] font-medium text-[#E45858] lg:col-span-2"
              >
                {saveError}
              </span>
            )}
          </div>
        ) : activeTab === "Clients" ? (
          <CompanyClientsView company={company} />
        ) : (
          <div className="flex h-48 w-[560px] max-w-full items-center justify-center rounded-lg border border-dashed border-[#D3E1EC] font-montserrat text-[14px] font-medium text-[#7288A3]">
            {activeTab} information
          </div>
        )}
      </div>
    </div>
  );
}

function StatsView({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <div className="flex min-h-[650px] w-full flex-col">
      <div className="flex h-10 items-start gap-6 overflow-x-auto border-b border-[#D3E1EC]">
        {STATS_TABS.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex h-10 flex-shrink-0 flex-col justify-between whitespace-nowrap font-montserrat text-[14px] font-medium leading-5 ${activeTab === tab ? "text-[#007EA7]" : "text-[#10233A]"}`}
          >
            <span>{tab}</span>
            <span
              className={`h-0.5 w-full ${activeTab === tab ? "bg-[#007EA7]" : "bg-transparent"}`}
            />
          </button>
        ))}
      </div>

      {activeTab === "Stats" ? (
        <div className="flex min-h-[560px] flex-1 flex-col pt-3">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid h-10 grid-cols-[112px_160px_180px_160px_190px] items-center border-b border-[#E5EDF9] px-3 font-montserrat text-[12px] font-medium text-[#7288A3]">
                <span className="text-[#10233A]">Month</span>
                <span className="border-l border-[#D3E1EC] pl-3">
                  Invoices by upload date
                </span>
                <span className="border-l border-[#D3E1EC] pl-3">
                  Invoices by document date
                </span>
                <span className="border-l border-[#D3E1EC] pl-3">
                  Lines by upload date
                </span>
                <span className="border-l border-[#D3E1EC] pl-3">
                  Lines by document date
                </span>
              </div>
              {[
                ["2025-11", "7", "5", "0", "0"],
                ["2025-10", "7", "5", "0", "0"],
              ].map((row, index) => (
                <div
                  key={row[0]}
                  className={`grid h-10 grid-cols-[112px_160px_180px_160px_190px] items-center px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${index % 2 === 0 ? "bg-[#F7FBFC]" : "bg-white"}`}
                >
                  {row.map((value, cellIndex) => (
                    <span
                      key={`${row[0]}-${cellIndex}`}
                      className={
                        cellIndex ? "border-l border-[#E5EDF9] pl-3" : ""
                      }
                    >
                      {value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between pb-2 pt-8 font-montserrat text-[12px] font-medium text-[#7288A3]">
            <div className="flex items-center gap-5">
              <button type="button" className="text-[#1B55E9]">
                1
              </button>
            </div>
            <div className="mx-8 h-2 min-w-[240px] flex-1 rounded-full bg-[#E5EDF9]">
              <div className="h-2 w-1/2 rounded-full bg-[#D3E1EC]" />
            </div>
            <div className="flex items-center gap-4">
              <span>1–2 from 2 items</span>
              <button
                type="button"
                className="h-9 rounded-lg border-2 border-[#D3E1EC] px-4 text-[14px] font-semibold"
              >
                Show more
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center border-b border-[#E5EDF9] font-montserrat text-[14px] font-medium text-[#7288A3]">
          {activeTab} information
        </div>
      )}
    </div>
  );
}
