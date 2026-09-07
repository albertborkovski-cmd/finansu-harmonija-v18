import { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, X, ChevronDown, ChevronUp, Upload, Paperclip, Check, Plus, Loader2, Trash2 } from 'lucide-react';
import { supabase, type Company } from '../lib/supabase';
import {
  loadOrganizationReferenceRecords,
  loadOrganizationReferenceValues,
} from './OrganizationReferenceValuesView';
import { loadVatClassifications } from './VatClassificationsView';
import { loadVatClassificationTemplateNames } from './VatClassificationsView';
import { getCurrentUserName } from '../lib/currentUser';
import GeneralLedgerAccountSelect from './GeneralLedgerAccountSelect';
import SearchableSelect from './SearchableSelect';
import { loadOperationDateValidationRule, resolveOperationDate } from './OperationDateValidationView';
import type { DocumentLineItem } from './Documents';
import { PageActionButton } from './PageHeader';
import {
  hasAdministratorRole,
  loadLinkedDirectoryUsers,
  SETTINGS_DATA_CHANGED_EVENT,
} from '../lib/linkedSettingsData';

interface Props {
  companyId: string;
  companyName?: string;
  sectionName?: string;
  generalLedgerName?: string;
  onOpenGeneralLedger?: () => void;
  onClose: () => void;
  onCreated: () => void;
  initialData?: Partial<FormData>;
  presetDocumentType?: string;
  initialFinancialLines?: FinancialLine[];
  initialLineItems?: DocumentLineItem[];
  initialSummaryLineItems?: DocumentLineItem[];
  initialFinancialLineMode?: 'quantity' | 'summary';
  initialImageUrl?: string | null;
  viewOnly?: boolean;
  viewActions?: {
    onSend: () => void;
    onPreview: () => void;
    onStartChat: () => void;
  };
}

type PartyDetails = {
  title: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  code: string;
  vatCode: string;
  phone: string;
  email: string;
  countryOfSale: string;
};

type FinancialLine = {
  id: string;
  name: string;
  description: string;
  productGroup: string;
  quantity: string;
  price: string;
  vatRate: string;
};

const EMPTY_PARTY: PartyDetails = {
  title: '',
  country: '',
  city: '',
  address: '',
  postalCode: '',
  code: '',
  vatCode: '',
  phone: '',
  email: '',
  countryOfSale: '',
};

const COUNTERPARTIES_STORAGE_KEY = 'finansu-harmonija:v7:settings:counterparties';

function loadCounterparties(): Company[] {
  try {
    const stored = window.localStorage.getItem(COUNTERPARTIES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function companyToParty(company?: Company | null, fallbackName = ''): PartyDetails {
  return {
    ...EMPTY_PARTY,
    title: company?.name ?? fallbackName,
    country: company?.tax_country ?? company?.country ?? '',
    address: company?.address ?? '',
    code: company?.company_code ?? '',
    vatCode: company?.vat_code ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    countryOfSale: company?.tax_country ?? company?.country ?? '',
  };
}

function loadCompanyBankAccounts(company?: Company | null): string[] {
  if (!company?.counterparty_bank_accounts?.trim()) return [];
  try {
    const parsed = JSON.parse(company.counterparty_bank_accounts) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((account) => {
        if (typeof account === 'string') return account.trim();
        if (!account || typeof account !== 'object') return '';
        const record = account as Record<string, unknown>;
        const iban = String(record.iban ?? record.account ?? record.accountNumber ?? '').trim();
        const bank = String(record.bank ?? record.bankName ?? '').trim();
        return [iban, bank].filter(Boolean).join(' · ');
      })
      .filter((account, index, accounts) => Boolean(account) && accounts.indexOf(account) === index);
  } catch {
    return company.counterparty_bank_accounts
      .split(',')
      .map((account) => account.trim())
      .filter(Boolean);
  }
}

const STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue', 'Processing', 'Rejected', 'Provide Additional', 'Exception', 'Transferred', 'Duplicate', 'Not Documented'] as const;
const ACCOUNTING_NOTE_STATUSES = ['New', 'Approved', 'Correcting'] as const;

function createAccountingOperationNumber() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const uniquePart = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `AN-${date}-${uniquePart}`;
}

type FormData = {
  status: string;
  receiveDate: string;
  clientCounterparty: string;
  documentType: string;
  documentSubtype: string;
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
  note: string;
  operationNumber: string;
  accountingNoteStatus: string;
  debit: string;
  credit: string;
};

const EMPTY: FormData = {
  status: 'Draft',
  receiveDate: '',
  clientCounterparty: '',
  documentType: '',
  documentSubtype: '',
  source: 'Manual',
  totalAmount: '',
  dueEndDate: '',
  fileCase: '',
  orderNo: '',
  number: '',
  type: '',
  documentDate: '',
  documentPurpose: '',
  invoiceContractDate: '',
  operationDate: '',
  expenseAccount: '',
  vatClassifier: '',
  currency: '',
  amountWithoutVat: '',
  vat: '',
  vatPercent: '',
  departmentCode: '',
  objectProject: '',
  validForm: '',
  accountableResponsible: '',
  costCenter: '',
  series: '',
  note: '',
  operationNumber: '',
  accountingNoteStatus: 'New',
  debit: '',
  credit: '',
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 w-full items-center rounded-lg px-3 font-montserrat text-[12px] leading-[18px]">
      <label className="w-[45%] max-w-[210px] flex-shrink-0 font-normal text-[#10233A]">
        {label}{required && <span className="text-[#EF4444] ml-0.5">*</span>}
      </label>
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}

const inputCls =
  'document-value-control w-full h-[26px] px-2 bg-white border border-[#D3E1EC] rounded font-montserrat font-medium text-[12px] text-[#10233A] placeholder-[#A1B6C6] outline-none focus:border-[#007EA7] transition-colors disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]';

function DocumentSection({ title, expanded, onToggle, children, disabled = false }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <section className="flex flex-col overflow-visible rounded-xl border border-[#D3E1EC] bg-white">
      <button type="button" disabled={disabled} aria-disabled={disabled} onClick={onToggle} className={`flex min-h-[72px] w-full items-center justify-between px-6 text-left transition-colors ${disabled ? 'cursor-not-allowed bg-[#F8FAFC]' : 'hover:bg-[#F8FDFF]'}`}>
        <span className={`font-montserrat text-[18px] font-semibold leading-6 ${disabled ? 'text-[#A1B6C6]' : 'text-[#10233A]'}`}>{title}</span>
        {expanded ? <ChevronUp size={24} strokeWidth={1.6} className={disabled ? 'text-[#C8D5DF]' : 'text-[#7288A3]'} /> : <ChevronDown size={24} strokeWidth={1.6} className={disabled ? 'text-[#C8D5DF]' : 'text-[#7288A3]'} />}
      </button>
      {expanded && !disabled && <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

function DocumentRowsHeader() {
  return (
    <div className="mb-4 flex h-[18px] items-center pl-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
      <span className="w-[45%] max-w-[210px] flex-shrink-0">Parameter</span>
      <span>Value</span>
    </div>
  );
}

function CounterpartyTitleField({
  value,
  counterparties,
  onChange,
  onSelect,
  disabled = false,
}: {
  value: string;
  counterparties: Company[];
  onChange: (value: string) => void;
  onSelect: (counterparty: Company) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const normalized = value.trim().toLocaleLowerCase();
  const matches = counterparties.filter((counterparty) =>
    !normalized || counterparty.name.toLocaleLowerCase().includes(normalized),
  );

  return (
    <div className={`relative flex min-h-9 w-full items-center rounded-lg bg-white px-3 font-montserrat text-[12px] leading-[18px] ${open ? 'z-40' : 'z-0'}`}>
      <span className="w-[45%] max-w-[210px] flex-shrink-0 font-normal text-[#10233A]">Title</span>
      <div className="relative min-w-0 flex-1">
        <input
          disabled={disabled}
          value={value}
          placeholder="Enter or search counterparty"
          onFocus={() => !disabled && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`}
        />
        {open && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-[30px] z-50 max-h-[210px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]">
            {matches.map((counterparty) => (
              <button
                key={counterparty.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(counterparty);
                  setOpen(false);
                }}
                className="flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left font-montserrat text-[12px] font-semibold text-[#10233A] transition-colors hover:bg-[#F8FDFF]"
              >
                <span className="truncate">{counterparty.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ManagedSelect({
  value,
  options,
  placeholder,
  onChange,
  addLabel,
  onAdd,
  disabled = false,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  addLabel?: string;
  onAdd?: (value: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [savingNewValue, setSavingNewValue] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const saveNewValue = async () => {
    const normalized = newValue.trim();
    if (!normalized || !onAdd) return;
    setSavingNewValue(true);
    await onAdd(normalized);
    onChange(normalized);
    setNewValue('');
    setAdding(false);
    setSavingNewValue(false);
    setOpen(false);
  };
  const filteredOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        value={open ? query : value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(event) => { if (!disabled) { setQuery(''); setOpen(true); event.currentTarget.select(); } }}
        onClick={() => !disabled && setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        className={`document-value-control h-[26px] w-full rounded border bg-white px-2 pr-7 font-montserrat text-[12px] font-medium text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3] ${
          open ? 'border-[#007EA7] ring-1 ring-[#007EA7]/20' : 'border-[#D3E1EC] hover:border-[#A1B6C6]'
        }`}
      />
      <button type="button" tabIndex={-1} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); setOpen((current) => !current); }} className="absolute right-0 top-0 flex h-[26px] w-7 items-center justify-center text-[#7288A3] disabled:hidden">
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[30px] z-[80] max-h-[250px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 font-montserrat text-[12px] text-[#A1B6C6]">
              No available records
            </div>
          ) : (
            filteredOptions.map((option) => {
              const selected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[#F2F7FC] ${selected ? 'bg-[#F2F7FC]' : ''}`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${selected ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}
                  >
                    {selected && <Check size={12} strokeWidth={2.5} className="text-white" />}
                  </span>
                  <span className="font-montserrat text-[13px] font-medium leading-5 text-[#10233A]">
                    {option}
                  </span>
                </button>
              );
            })
          )}
          {onAdd && (
            <div className="mt-1 border-t border-[#D3E1EC] px-2 pt-2">
              {adding ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveNewValue();
                      }
                    }}
                    placeholder={addLabel ?? 'Add new value'}
                    className="h-8 min-w-0 flex-1 rounded-md border border-[#D3E1EC] px-2 font-montserrat text-[12px] text-[#10233A] outline-none focus:border-[#007EA7]"
                  />
                  <button
                    type="button"
                    disabled={!newValue.trim() || savingNewValue}
                    onClick={() => void saveNewValue()}
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-[#007EA7] text-white hover:bg-[#006B8F] disabled:cursor-not-allowed disabled:bg-[#D7E1E8]"
                  >
                    {savingNewValue ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 font-montserrat text-[13px] font-semibold text-[#007EA7] hover:bg-[#F2F7FC]"
                >
                  <Plus size={15} />
                  {addLabel ?? 'Add new value'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FinancialLineInput({
  value,
  onChange,
  placeholder,
  expandWhenLong = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  expandWhenLong?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const expanded = expandWhenLong && focused && value.length > 13;
  return (
    <div className={`relative h-[26px] min-w-0 w-full ${expanded ? 'z-40' : 'z-0'}`}>
      <input
        value={value}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onChange={(event) => onChange(event.target.value)}
        className={`document-value-control absolute left-0 top-0 h-[26px] min-w-0 rounded border bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3] ${expanded ? 'w-[535px] border-[#007EA7] shadow-[0_8px_24px_rgba(16,35,58,0.16)]' : 'w-full border-[#D3E1EC]'}`}
      />
    </div>
  );
}

function FinancialLineSelect({
  value,
  onChange,
  placeholder,
  options,
  emptyMessage = 'No options available',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  emptyMessage?: string;
}) {
  return <SearchableSelect ariaLabel={placeholder} value={value} onChange={onChange} options={options} placeholder={placeholder} emptyMessage={emptyMessage} className="document-value-control h-[26px] rounded border border-[#D3E1EC] bg-white px-2 pr-7 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" menuClassName="w-[220px] max-w-[min(320px,calc(100vw-32px))]" />;
}

function FinancialLineValue({ value, disabled = false }: { value: string; disabled?: boolean }) {
  return <div className={`document-value-control flex h-[26px] min-w-0 w-full items-center rounded border border-[#D3E1EC] px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] ${disabled ? 'bg-[#F3F6F8]' : 'bg-white'}`}><span className="truncate">{value}</span></div>;
}

function FinancialTotal({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) {
  return (
    <div className="flex h-5 w-full items-center justify-end gap-2 font-montserrat text-[14px] font-medium leading-5">
      <span className="min-w-0 flex-1 text-right text-[#10233A]">{label}</span>
      <span className={`min-w-[96px] whitespace-nowrap text-right tabular-nums ${strong ? 'font-bold text-[#007EA7]' : 'text-[#7288A3]'}`}>{value.toFixed(2)} {currency}</span>
    </div>
  );
}

function configuredProductGroups(company: Company | null): string[] {
  const value = company?.product_groups;
  if (!value?.trim()) return [];
  try {
    const config = JSON.parse(value) as {
      enabled?: boolean;
      items?: Array<{ code?: string; name?: string }>;
    };
    if (!config.enabled || !Array.isArray(config.items)) return [];
    return [...new Set(
      config.items
        .map((item) => String(item.code ?? item.name ?? '').trim())
        .filter(Boolean),
    )];
  } catch {
    return [];
  }
}

function loadAccountablePersonOptions() {
  return [
    ...new Set(
      loadLinkedDirectoryUsers('Internal users')
        .filter(
          (user) =>
            (user.status ?? 'Enabled').toLocaleLowerCase() !== 'disabled' &&
            !hasAdministratorRole(user),
        )
        .map((user) => user.fullName || user.username || user.email || '')
        .filter(Boolean),
    ),
  ];
}

function PartyEditor({
  details,
  counterparties,
  taxCountryOptions,
  vatCodeOptions,
  onChange,
  onSelect,
  disabled = false,
}: {
  details: PartyDetails;
  counterparties: Company[];
  taxCountryOptions: string[];
  vatCodeOptions: string[];
  onChange: (key: keyof PartyDetails, value: string) => void;
  onSelect: (counterparty: Company) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
      <CounterpartyTitleField
        value={details.title}
        counterparties={counterparties}
        onChange={(value) => onChange('title', value)}
        onSelect={onSelect}
        disabled={disabled}
      />
      <Field label="Country">
        <ManagedSelect
          value={details.country}
          options={taxCountryOptions}
          placeholder="Select country"
          onChange={(value) => onChange('country', value)}
          disabled={disabled}
        />
      </Field>
      <Field label="City"><input disabled={disabled} className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.city} onChange={(event) => onChange('city', event.target.value)} /></Field>
      <Field label="Address"><input disabled={disabled} className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.address} onChange={(event) => onChange('address', event.target.value)} /></Field>
      <Field label="Postal code"><input disabled={disabled} className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.postalCode} onChange={(event) => onChange('postalCode', event.target.value)} /></Field>
      <Field label="Code"><input disabled={disabled} className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.code} onChange={(event) => onChange('code', event.target.value)} /></Field>
      <Field label="VAT code">
        <ManagedSelect
          value={details.vatCode}
          options={vatCodeOptions}
          placeholder="Select VAT classification"
          onChange={(value) => onChange('vatCode', value)}
          disabled={disabled}
        />
      </Field>
      <Field label="Phone"><input disabled={disabled} className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.phone} onChange={(event) => onChange('phone', event.target.value)} /></Field>
      <Field label="Email"><input disabled={disabled} type="email" className={`${inputCls} disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]`} value={details.email} onChange={(event) => onChange('email', event.target.value)} /></Field>
      <Field label="Country of sale">
        <ManagedSelect
          value={details.countryOfSale}
          options={taxCountryOptions}
          placeholder="Select country of sale"
          onChange={(value) => onChange('countryOfSale', value)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export default function CreateDocumentModal({ companyId, companyName = '', sectionName = 'Documents', generalLedgerName, onOpenGeneralLedger, onClose, onCreated, initialData, presetDocumentType = '', initialFinancialLines, initialLineItems, initialSummaryLineItems, initialFinancialLineMode, initialImageUrl, viewOnly = false, viewActions }: Props) {
  const [form, setForm] = useState<FormData>({
    ...EMPTY,
    ...(presetDocumentType ? { documentType: presetDocumentType } : {}),
    ...initialData,
  });
  const isDuplicate = !!initialData && !viewOnly;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [operationDateRuleMessage, setOperationDateRuleMessage] = useState('');
  const [operationRuleVersion, setOperationRuleVersion] = useState(0);
  const operationDateRule = loadOperationDateValidationRule(companyId);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [expandedSections, setExpandedSections] = useState({
    attachments: true,
    general: true,
    dates: true,
    seller: true,
    buyer: true,
    financials: true,
    organization: true,
    note: true,
    accountingNote: viewOnly,
    correspondence: true,
  });
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const [documentTypeRecords, setDocumentTypeRecords] = useState(() =>
    loadOrganizationReferenceRecords('Document type'),
  );
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(() =>
    loadOrganizationReferenceValues('Base currency'),
  );
  const [accountablePersonOptions, setAccountablePersonOptions] = useState<string[]>(
    loadAccountablePersonOptions,
  );
  const [vatClassifierOptions, setVatClassifierOptions] = useState<string[]>(() =>
    loadVatClassifications()
      .filter((classification) => classification.active)
      .map((classification) => classification.code),
  );
  const [departmentCodeOptions, setDepartmentCodeOptions] = useState<string[]>([]);
  const [costCenterOptions, setCostCenterOptions] = useState<string[]>([]);
  const [objectProjectOptions, setObjectProjectOptions] = useState<string[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState('');
  const [counterparties, setCounterparties] = useState<Company[]>(() => loadCounterparties());
  const [externalParty, setExternalParty] = useState<PartyDetails>({
    ...EMPTY_PARTY,
    title: initialData?.clientCounterparty ?? '',
  });
  const [financialLines, setFinancialLines] = useState<FinancialLine[]>(
    initialFinancialLines?.length
      ? initialFinancialLines
      : [{ id: '1', name: '', description: '', productGroup: '', quantity: '1', price: '', vatRate: '21' }],
  );
  const [taxCountryOptions, setTaxCountryOptions] = useState<string[]>(() =>
    loadOrganizationReferenceValues('Tax country'),
  );
  const [partyVatCodeOptions, setPartyVatCodeOptions] = useState<string[]>(() =>
    loadVatClassificationTemplateNames(),
  );
  const documentTypeOptions = documentTypeRecords
    .filter((record) => record.status.toLocaleLowerCase() === 'active' && !record.parentCode)
    .map((record) => record.code);
  const documentSubtypeOptions = documentTypeRecords
    .filter(
      (record) =>
        record.status.toLocaleLowerCase() === 'active' &&
        record.parentCode === form.documentType,
    )
    .map((record) => record.code);
  const selectedDocumentType = documentTypeRecords.find(
    (record) => record.code === form.documentType,
  );
  const isAccountingNote = [
    form.documentType,
    selectedDocumentType?.fullName ?? '',
  ].some((value) => /accounting[\s_-]*note/i.test(value));
  const viewLabel = isAccountingNote
    ? 'View accounting note'
    : sectionName === 'Invoices'
      ? 'View invoice'
      : 'View document';
  const plainDocumentView = viewOnly;

  useEffect(() => {
    const refreshAccountablePeople = () =>
      setAccountablePersonOptions(loadAccountablePersonOptions());
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, refreshAccountablePeople);
    window.addEventListener('storage', refreshAccountablePeople);
    return () => {
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, refreshAccountablePeople);
      window.removeEventListener('storage', refreshAccountablePeople);
    };
  }, []);

  useEffect(() => {
    if (pageScrollRef.current) {
      pageScrollRef.current.scrollLeft = 0;
    }
  }, [isAccountingNote]);

  const addLookupValue = async (
    type: 'department_code' | 'cost_center' | 'object_project' | 'vat_class' | 'gl_account',
    value: string,
    updateOptions: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    const storedType = ['department_code', 'cost_center', 'object_project'].includes(type)
      ? `${type}::company::${companyId}`
      : type;
    await supabase
      .from('lookup_values')
      .upsert({ type: storedType, value }, { onConflict: 'type,value' });
    updateOptions((current) => [...new Set([...current, value])].sort());
  };

  useEffect(() => {
    const refreshManagedOptions = async () => {
      setDocumentTypeRecords(loadOrganizationReferenceRecords('Document type'));
      setCurrencyOptions(loadOrganizationReferenceValues('Base currency'));
      const [{ data: lookups }, { data: documents }] = await Promise.all([
        supabase.from('lookup_values').select('type,value').order('value'),
        supabase
          .from('documents')
          .select('department_code,cost_center,object_project,expense_account,vat_classifier')
          .eq('company_id', companyId),
      ]);
      const lookupValues = (type: string) =>
        (lookups ?? [])
          .filter((item) => item.type === type)
          .map((item) => String(item.value ?? '').trim())
          .filter(Boolean);
      const documentValues = (key: string) =>
        (documents ?? [])
          .map((item) => String(item[key] ?? '').trim())
          .filter(Boolean);
      setDepartmentCodeOptions([...new Set([...lookupValues(`department_code::company::${companyId}`), ...documentValues('department_code')])].sort());
      setCostCenterOptions([...new Set([...lookupValues(`cost_center::company::${companyId}`), ...documentValues('cost_center')])].sort());
      setObjectProjectOptions([...new Set([...lookupValues(`object_project::company::${companyId}`), ...documentValues('object_project')])].sort());
      setSeriesOptions([...new Set([
        ...lookupValues(`series::company::${companyId}`),
        ...(currentCompany?.document_series
          ? (() => {
              try {
                const parsed = JSON.parse(currentCompany.document_series) as { items?: Array<{ code?: string }> };
                return (parsed.items ?? []).map((item) => String(item.code ?? '').trim()).filter(Boolean);
              } catch {
                return currentCompany.document_series.split(',').map((value) => value.trim()).filter(Boolean);
              }
            })()
          : []),
      ])].sort());
      setVatClassifierOptions([...new Set([
        ...loadVatClassifications().filter((classification) => classification.active).map((classification) => classification.code),
        ...lookupValues('vat_class'),
        ...documentValues('vat_classifier'),
      ])].sort());
    };
    void refreshManagedOptions();
    window.addEventListener('organization-reference-updated', refreshManagedOptions);
    window.addEventListener('storage', refreshManagedOptions);
    return () => {
      window.removeEventListener('organization-reference-updated', refreshManagedOptions);
      window.removeEventListener('storage', refreshManagedOptions);
    };
  }, [companyId, currentCompany?.document_series, generalLedgerName]);

  useEffect(() => {
    let active = true;
    const refreshPartyOptions = async () => {
      setCounterparties(loadCounterparties());
      setTaxCountryOptions(loadOrganizationReferenceValues('Tax country'));
      setPartyVatCodeOptions(loadVatClassificationTemplateNames());
      const { data } = await supabase.from('companies').select('*').eq('id', companyId);
      if (!active) return;
      const record = Array.isArray(data) ? data[0] : data;
      setCurrentCompany((record as Company | null) ?? null);
      if (initialData?.clientCounterparty) {
        const matchedCounterparty = loadCounterparties().find(
          (counterparty) =>
            counterparty.name.trim().toLocaleLowerCase() ===
            (initialData?.clientCounterparty ?? '').trim().toLocaleLowerCase(),
        );
        setExternalParty(
          matchedCounterparty
            ? companyToParty(matchedCounterparty)
            : { ...EMPTY_PARTY, title: initialData?.clientCounterparty ?? '' },
        );
      }
    };
    void refreshPartyOptions();
    window.addEventListener('counterparties-updated', refreshPartyOptions);
    window.addEventListener('organization-reference-updated', refreshPartyOptions);
    window.addEventListener('vat-classifications-updated', refreshPartyOptions);
    window.addEventListener('storage', refreshPartyOptions);
    return () => {
      active = false;
      window.removeEventListener('counterparties-updated', refreshPartyOptions);
      window.removeEventListener('organization-reference-updated', refreshPartyOptions);
      window.removeEventListener('vat-classifications-updated', refreshPartyOptions);
      window.removeEventListener('storage', refreshPartyOptions);
    };
  }, [companyId, initialData?.clientCounterparty, isDuplicate]);

  const companyBankAccountOptions = useMemo(
    () => loadCompanyBankAccounts(currentCompany),
    [currentCompany],
  );
  const productGroupOptions = configuredProductGroups(currentCompany);
  const sellerIsEditable = form.documentPurpose === 'Purchase';
  const buyerIsEditable = form.documentPurpose === 'Sale';

  const updateExternalParty = (key: keyof PartyDetails, value: string) => {
    setExternalParty((current) => ({ ...current, [key]: value }));
    if (key === 'title') set('clientCounterparty', value);
  };

  const selectExternalCounterparty = (counterparty: Company) => {
    const details = companyToParty(counterparty);
    setExternalParty(details);
    set('clientCounterparty', details.title);
  };

  const addFinancialLine = () => {
    setFinancialLines((current) => [
      ...current,
      { id: crypto.randomUUID(), name: '', description: '', productGroup: '', quantity: '1', price: '', vatRate: '21' },
    ]);
  };

  const updateFinancialLine = (id: string, key: keyof FinancialLine, value: string) => {
    setFinancialLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));
  };

  const removeFinancialLine = (id: string) => {
    setFinancialLines((current) => current.filter((line) => line.id !== id));
  };

  const financialAmount = financialLines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0),
    0,
  );
  const financialVat = financialLines.reduce((sum, line) => {
    const lineAmount = (Number(line.quantity) || 0) * (Number(line.price) || 0);
    return sum + lineAmount * ((Number(line.vatRate) || 0) / 100);
  }, 0);
  const additionalInformationDisabled = financialLines.length !== 1;

  useEffect(() => {
    const rates = [...new Set(financialLines.map((line) => line.vatRate).filter(Boolean))];
    setForm((current) => ({
      ...current,
      amountWithoutVat: financialAmount.toFixed(2),
      vat: financialVat.toFixed(2),
      totalAmount: (financialAmount + financialVat).toFixed(2),
      vatPercent: rates.length === 1 ? rates[0] : '',
    }));
  }, [financialAmount, financialVat, financialLines]);

  useEffect(() => {
    if (!additionalInformationDisabled) return;
    setExpandedSections((current) =>
      current.organization ? { ...current, organization: false } : current,
    );
  }, [additionalInformationDisabled]);

  useEffect(() => {
    setSelectedBankAccount((current) =>
      companyBankAccountOptions.includes(current)
        ? current
        : (companyBankAccountOptions[0] ?? ''),
    );
  }, [companyBankAccountOptions]);

  useEffect(() => {
    if (!isAccountingNote || form.operationNumber) return;
    setForm((current) => ({
      ...current,
      operationNumber: createAccountingOperationNumber(),
      accountingNoteStatus: current.accountingNoteStatus || 'New',
      source: 'Manual',
    }));
    setExpandedSections((current) => ({
      ...current,
      accountingNote: true,
    }));
  }, [form.operationNumber, isAccountingNote]);

  useEffect(() => {
    const refreshRule = () => setOperationRuleVersion((current) => current + 1);
    window.addEventListener('operation-date-validation-updated', refreshRule);
    return () => window.removeEventListener('operation-date-validation-updated', refreshRule);
  }, []);

  useEffect(() => {
    if (isAccountingNote || !form.documentDate) {
      setOperationDateRuleMessage('');
      return;
    }
    const resolved = resolveOperationDate({
      companyId,
      documentDate: form.documentDate,
      submittedDate: form.receiveDate,
    });
    if (!resolved) {
      setOperationDateRuleMessage('');
      return;
    }
    setOperationDateRuleMessage(resolved.message);
    setForm((current) =>
      current.operationDate === resolved.operationDate
        ? current
        : { ...current, operationDate: resolved.operationDate },
    );
  }, [companyId, form.documentDate, form.receiveDate, isAccountingNote, operationRuleVersion]);

  function set(key: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (viewOnly) return;
    if (!form.documentType.trim()) { setError('Document type is required.'); return; }
    if (isAccountingNote) {
      if (!form.operationNumber.trim()) { setError('Operation number is required.'); return; }
      if (!form.accountingNoteStatus.trim()) { setError('Indicator is required.'); return; }
      if (!form.documentDate) { setError('Date is required.'); return; }
      if (!form.number.trim()) { setError('Document number is required.'); return; }
      if (!form.currency.trim()) { setError('Currency is required.'); return; }
      if (!form.clientCounterparty.trim()) { setError('Client is required.'); return; }
      if (!form.expenseAccount.trim()) { setError('GL account is required.'); return; }
      if (!(Number(form.debit) > 0) && !(Number(form.credit) > 0)) {
        setError('Enter a Debit or Credit amount.');
        return;
      }
    }
    if (!form.clientCounterparty.trim()) { setError('Client/Counterparty is required.'); return; }
    setSaving(true);
    setError('');
    const matchedCounterparty = counterparties.find(
      (counterparty) =>
        counterparty.name.trim().toLocaleLowerCase() ===
        form.clientCounterparty.trim().toLocaleLowerCase(),
    );

    let imageUrl: string | null = initialImageUrl ?? null;
    if (uploadFile) {
      const ext = uploadFile.name.split('.').pop();
      const path = `${companyId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('document-images')
        .upload(path, uploadFile);
      if (uploadErr) { setSaving(false); setError(uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('document-images').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    const newLineFromFinancial = (line: FinancialLine, index: number): DocumentLineItem => {
      const amount = (Number(line.quantity) || 0) * (Number(line.price) || 0);
      const vatAmount = amount * ((Number(line.vatRate) || 0) / 100);
      return {
        id: crypto.randomUUID(),
        barcode: '',
        systemId: `${Date.now()}-${index + 1}`,
        product: line.name,
        description: line.description,
        productGroup: line.productGroup,
        unit: 'vnt',
        qty: line.quantity || '1',
        code: '',
        price: line.price,
        subtotal: amount.toFixed(2),
        discount: '0.00',
        vat: vatAmount.toFixed(2),
        vatPct: line.vatRate,
        total: (amount + vatAmount).toFixed(2),
        department: '',
        object: '',
        series: '',
        center: '',
        expense: '',
        vatClass: form.vatClassifier,
      };
    };
    const copyLines = (
      original: DocumentLineItem[] | undefined,
      applyFinancialChanges: boolean,
    ) => {
      if (!original?.length && !applyFinancialChanges) return [];
      if (!applyFinancialChanges) {
        return (original ?? []).map((line) => ({
          ...line,
          id: crypto.randomUUID(),
          systemId: `${Date.now()}-${crypto.randomUUID()}`,
        }));
      }
      return financialLines.map((financialLine, index) => {
        const amount =
          (Number(financialLine.quantity) || 0) *
          (Number(financialLine.price) || 0);
        const vatAmount = amount * ((Number(financialLine.vatRate) || 0) / 100);
        return {
          ...(original?.[index] ?? newLineFromFinancial(financialLine, index)),
          id: crypto.randomUUID(),
          systemId: `${Date.now()}-${crypto.randomUUID()}`,
          product: financialLine.name,
          description: financialLine.description,
          productGroup: financialLine.productGroup,
          qty: financialLine.quantity || '1',
          price: financialLine.price,
          subtotal: amount.toFixed(2),
          vat: vatAmount.toFixed(2),
          vatPct: financialLine.vatRate,
          total: (amount + vatAmount).toFixed(2),
        };
      });
    };

    const accountingAmount = Math.max(Number(form.debit) || 0, Number(form.credit) || 0);
    const accountingLine: DocumentLineItem = {
      id: crypto.randomUUID(),
      barcode: '',
      systemId: `${Date.now()}-1`,
      product: form.note,
      description: form.note,
      productGroup: '',
      unit: 'vnt',
      qty: '1',
      code: '',
      price: accountingAmount.toFixed(2),
      subtotal: accountingAmount.toFixed(2),
      discount: '0.00',
      vat: '0.00',
      vatPct: '0',
      total: accountingAmount.toFixed(2),
      department: form.departmentCode,
      object: form.objectProject,
      series: form.series,
      center: form.costCenter,
      expense: form.expenseAccount,
      vatClass: '',
    };

    const { data: insertedDocuments, error: dbErr } = await supabase.from('documents').insert({
      company_id: companyId,
      status: isAccountingNote ? form.accountingNoteStatus : form.status,
      receive_date: form.receiveDate || null,
      client_counterparty: form.clientCounterparty,
      counterparty_id: matchedCounterparty?.id ?? '',
      document_type: form.documentType,
      document_subtype: form.documentSubtype,
      source: form.source,
      total_amount: isAccountingNote ? accountingAmount.toFixed(2) : form.totalAmount,
      due_end_date: form.dueEndDate || null,
      file_case: form.fileCase,
      order_no: isAccountingNote ? form.operationNumber : form.orderNo,
      number: form.number,
      type: form.type,
      document_date: form.documentDate || null,
      document_purpose: form.documentPurpose,
      invoice_contract_date: form.invoiceContractDate || null,
      operation_date: form.operationDate || null,
      expense_account: form.expenseAccount,
      vat_classifier: form.vatClassifier,
      currency: form.currency,
      amount_without_vat: isAccountingNote ? accountingAmount.toFixed(2) : form.amountWithoutVat,
      vat: isAccountingNote ? '0.00' : form.vat,
      vat_percent: isAccountingNote ? '0' : form.vatPercent,
      department_code: form.departmentCode,
      object_project: form.objectProject,
      valid_form: form.validForm || null,
      accountable_responsible: form.accountableResponsible,
      cost_center: form.costCenter,
      series: form.series,
      notes: form.note,
      operation_number: isAccountingNote ? form.operationNumber : '',
      accounting_note_status: isAccountingNote ? form.accountingNoteStatus : '',
      debit: isAccountingNote ? form.debit : '',
      credit: isAccountingNote ? form.credit : '',
      image_url: imageUrl,
      line_items: isAccountingNote
        ? [accountingLine]
        : isDuplicate
        ? copyLines(initialLineItems, initialFinancialLineMode === 'quantity')
        : financialLines.map(newLineFromFinancial),
      summary_line_items: isDuplicate
        ? copyLines(initialSummaryLineItems, initialFinancialLineMode === 'summary')
        : [],
      created_by: getCurrentUserName(),
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    const normalizedExternalTitle = externalParty.title.trim().toLocaleLowerCase();
    const counterpartyExists = counterparties.some(
      (counterparty) => counterparty.name.trim().toLocaleLowerCase() === normalizedExternalTitle,
    );
    if (normalizedExternalTitle && !counterpartyExists) {
      const now = new Date().toISOString();
      const newCounterparty: Company = {
        id: `counterparty-${Date.now()}`,
        name: externalParty.title.trim(),
        company_code: externalParty.code.trim(),
        vat_code: externalParty.vatCode.trim(),
        client_since: new Date().getFullYear(),
        action_required: 0,
        country: externalParty.country,
        address: externalParty.address.trim(),
        phone: externalParty.phone.trim(),
        email: externalParty.email.trim(),
        counterparty_country: externalParty.country,
        counterparty_legal_status: 'Legal entity',
        counterparty_kind: form.documentPurpose === 'Sale' ? 'Buyer' : 'Supplier',
        counterparty_vat_classification: externalParty.vatCode,
        counterparty_notes: '',
        counterparty_bank_accounts: '[]',
        counterparty_created_by: getCurrentUserName(),
        counterparty_created_at: now,
        counterparty_activity_log: JSON.stringify([
          { date: now, user: getCurrentUserName(), action: 'Counterparty created from manual document' },
        ]),
      };
      const nextCounterparties = [...counterparties, newCounterparty];
      window.localStorage.setItem(COUNTERPARTIES_STORAGE_KEY, JSON.stringify(nextCounterparties));
      window.dispatchEvent(new CustomEvent('counterparties-updated'));
      const insertedDocumentId = insertedDocuments?.[0]?.id;
      if (insertedDocumentId) {
        await supabase
          .from('documents')
          .update({ counterparty_id: newCounterparty.id })
          .eq('id', insertedDocumentId);
      }
    }
    onCreated();
    onClose();
  }

  const STATUS_COLORS: Record<string, string> = {
    Manual: '#007EA7',
    Draft: '#A1B6C6',
    Pending: '#EEB648',
    Paid: '#22C55E',
    Overdue: '#EF4444',
    Processing: '#6366F1',
    Rejected: '#DC2626',
    'Provide Additional': '#F59E0B',
    Exception: '#EA580C',
    Transferred: '#0284C7',
    Duplicate: '#7C3AED',
    'Not Documented': '#9CA3AF',
  };

  return (
    <div className={`absolute inset-0 z-50 flex min-h-0 flex-col bg-white ${plainDocumentView ? 'document-view-plain' : ''}`}>
      <div
        ref={pageScrollRef}
        className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 flex-col bg-white px-6 pb-6 pt-10 sm:px-10 lg:px-[72px] lg:pt-14">
          <div className="mx-auto flex w-full min-w-0 max-w-[1440px] items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-5">
              <button type="button" aria-label={`Back to ${sectionName.toLocaleLowerCase()}`} onClick={onClose} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[#7288A3] transition-colors hover:bg-[#F8FDFF] hover:text-[#007EA7]">
                <ArrowLeft size={28} strokeWidth={1.7} />
              </button>
              <h2 className="truncate font-montserrat text-[36px] font-semibold leading-[44px] text-[#10233A]">
                {viewOnly
                  ? viewLabel
                  : isAccountingNote
                  ? 'Create accounting note'
                  : isDuplicate
                    ? 'Duplicate document'
                    : 'Create document manually'}
              </h2>
            </div>
            <div className="flex h-10 flex-shrink-0 items-center gap-2">
              {viewOnly && viewActions && <>
                <PageActionButton onClick={viewActions.onSend}>Send to</PageActionButton>
                <PageActionButton onClick={viewActions.onPreview}>Preview invoice</PageActionButton>
                <PageActionButton onClick={viewActions.onStartChat}>Start chat</PageActionButton>
              </>}
              <button type="button" onClick={onClose} className="flex h-8 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[13px] font-semibold text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]">
                {viewOnly ? 'Close' : 'Cancel'}
              </button>
              {!viewOnly && <button data-system-action="true" form="create-doc-form" type="submit" disabled={saving} className="flex h-8 items-center justify-center rounded-md bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white transition-colors hover:bg-[#006A8E] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving…' : isDuplicate ? 'Save copy' : 'Save document'}
              </button>}
            </div>
          </div>
          <div className="mx-auto mt-3 w-full min-w-0 max-w-[1440px] truncate pl-[60px] font-montserrat text-[13px] font-medium text-[#7288A3]">
            Companies&nbsp;&nbsp;/&nbsp;&nbsp;{companyName || 'Company'}&nbsp;&nbsp;/&nbsp;&nbsp;{sectionName}&nbsp;&nbsp;/&nbsp;&nbsp;{viewOnly ? viewLabel : isAccountingNote ? 'Create accounting note' : isDuplicate ? 'Duplicate document' : 'Create document manually'}
          </div>
        </div>

        <fieldset disabled={viewOnly} className="contents">
        {!isAccountingNote && (
          <div className={`mx-auto mb-6 grid w-full min-w-0 max-w-[1440px] grid-cols-1 gap-6 px-6 sm:px-10 lg:px-[72px] xl:grid-cols-2 [&>section]:overflow-visible [&>section]:rounded-xl [&>section]:border [&>section]:border-[#D3E1EC] ${viewOnly ? 'items-start' : 'items-stretch'}`}>
            <section className="flex min-h-[104px] flex-col items-stretch justify-center gap-3 bg-white px-6 py-4">
              <h2 className="whitespace-nowrap font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">
                Document purpose
              </h2>
              <div className="w-full">
                <ManagedSelect
                  value={form.documentPurpose}
                  options={['Purchase', 'Sale']}
                  placeholder="Select document purpose"
                  onChange={(value) => set('documentPurpose', value)}
                />
              </div>
            </section>

            <DocumentSection title="Attachments" expanded={expandedSections.attachments} onToggle={() => toggleSection('attachments')}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setFileDragOver(true); }}
                onDragLeave={() => setFileDragOver(false)}
                onDrop={e => { e.preventDefault(); setFileDragOver(false); const file = e.dataTransfer.files[0]; if (file) setUploadFile(file); }}
                className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 transition-colors ${fileDragOver ? 'border-[#007EA7] bg-[#EEF6FA]' : 'border-[#D3E1EC] bg-[#F8FDFF] hover:border-[#007EA7]'}`}
              >
                {uploadFile ? (
                  <>
                    <Paperclip size={18} className="text-[#007EA7]" />
                    <span className="max-w-full truncate font-montserrat text-[12px] font-medium text-[#10233A]">{uploadFile.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${uploadFile.name}`}
                      onClick={event => { event.stopPropagation(); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="flex h-6 items-center gap-1 rounded px-2 font-montserrat text-[11px] font-medium text-[#7288A3] transition-colors hover:bg-white hover:text-[#D90310]"
                    >
                      <X size={13} /> Remove
                    </button>
                  </>
                ) : (
                  <>
                    <Upload size={18} className="text-[#7288A3]" />
                    <span className="font-montserrat text-[12px] font-medium text-[#10233A]">Add document attachment</span>
                    <span className="font-montserrat text-[11px] text-[#7288A3]">PDF, image, Word or Excel</span>
                  </>
                )}
              </div>
            </DocumentSection>
          </div>
        )}
        </fieldset>

        {/* Body */}
        <form
          id="create-doc-form"
          onSubmit={handleSubmit}
          className="contents"
        >
          <fieldset
            disabled={viewOnly}
            className={isAccountingNote
              ? "mx-auto grid w-full min-w-0 max-w-[1440px] grid-cols-1 content-start items-start gap-6 border-0 bg-white px-6 pb-14 sm:px-10 lg:px-[72px] xl:grid-cols-2 [&>section]:overflow-visible [&>section]:rounded-xl [&>section]:border [&>section]:border-[#D3E1EC]"
              : "mx-auto grid w-full min-w-0 max-w-[1440px] grid-cols-1 content-start items-start gap-6 border-0 bg-white px-6 pb-14 sm:px-10 lg:px-[72px] xl:grid-cols-2 [&>section]:break-inside-avoid [&>section]:overflow-visible [&>section]:rounded-xl [&>section]:border [&>section]:border-[#D3E1EC] [&>section:nth-child(1)]:order-1 [&>section:nth-child(2)]:order-2 [&>section:nth-child(3)]:order-3 [&>section:nth-child(4)]:order-4 [&>section:nth-child(6)]:order-5 [&>section:nth-child(7)]:order-6 [&>section:nth-child(5)]:order-7 xl:[&>section:nth-child(5)]:col-span-2"}
          >
          {!isAccountingNote && (
          <>
          <DocumentSection title="Document information" expanded={expandedSections.general} onToggle={() => toggleSection('general')}>
            <DocumentRowsHeader />
            <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
            {!isAccountingNote && <>
            <Field label="Status">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStatusOpen(v => !v)}
                  className={`${inputCls} group flex items-center justify-between pr-2`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[form.status] }} />
                    <span>{form.status}</span>
                  </div>
                  <ChevronDown size={14} className="text-[#7288A3] group-disabled:hidden" />
                </button>
                {statusOpen && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#D3E1EC] rounded-lg shadow-lg z-[80] overflow-hidden">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { set('status', s); setStatusOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 font-montserrat text-[13px] hover:bg-[#F0F7FA] transition-colors ${form.status === s ? 'text-[#007EA7] font-semibold' : 'text-[#10233A]'}`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s] }} />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            </>}
            <Field label="Document type">
              <ManagedSelect
                value={form.documentType}
                options={documentTypeOptions}
                placeholder="Select document type"
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    documentType: value,
                    documentSubtype: '',
                  }))
                }
              />
            </Field>
            {!isAccountingNote && <>
            <Field label="Document subtype">
              <ManagedSelect
                value={form.documentSubtype}
                options={documentSubtypeOptions}
                placeholder={
                  form.documentType
                    ? documentSubtypeOptions.length > 0
                      ? 'Select document subtype'
                      : 'No subtypes configured'
                    : 'Select document type first'
                }
                onChange={(value) => set('documentSubtype', value)}
              />
            </Field>
            <Field label="Source">
              <input className={inputCls} placeholder="Source" value={form.source} onChange={e => set('source', e.target.value)} />
            </Field>
            <Field label="Currency">
              <ManagedSelect
                value={form.currency}
                options={currencyOptions}
                placeholder="Select currency"
                onChange={(value) => set('currency', value)}
              />
            </Field>
            <Field label="Accountable / Responsible person">
              <ManagedSelect
                value={form.accountableResponsible}
                options={accountablePersonOptions}
                placeholder="Select internal user"
                onChange={(value) => set('accountableResponsible', value)}
              />
            </Field>
            <Field label="Order No.">
              <input className={inputCls} placeholder="Order number" value={form.orderNo} onChange={e => set('orderNo', e.target.value)} />
            </Field>
            <Field label="Invoice">
              <input className={inputCls} placeholder="Invoice" value={form.number} onChange={e => set('number', e.target.value)} />
            </Field>
            </>}
            </div>
          </DocumentSection>
          </>
          )}

          {isAccountingNote ? (
            <>
              <DocumentSection
                title="Accounting note details"
                expanded={expandedSections.accountingNote}
                onToggle={() => toggleSection('accountingNote')}
              >
                <DocumentRowsHeader />
                <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
                  <Field label="Operation number" required>
                    <input
                      readOnly
                      aria-readonly="true"
                      className={`${inputCls} cursor-default bg-[#F3F6F8] text-[#7288A3]`}
                      value={form.operationNumber}
                    />
                  </Field>
                  <Field label="Indicator" required>
                    <ManagedSelect
                      value={form.accountingNoteStatus}
                      options={[...ACCOUNTING_NOTE_STATUSES]}
                      placeholder="Select indicator"
                      onChange={(value) => set('accountingNoteStatus', value)}
                    />
                  </Field>
                  <Field label="Date" required>
                    <input type="date" className={inputCls} value={form.documentDate} onChange={(event) => set('documentDate', event.target.value)} />
                  </Field>
                  <Field label="Document number" required>
                    <input className={inputCls} placeholder="Enter document number" value={form.number} onChange={(event) => set('number', event.target.value)} />
                  </Field>
                  <Field label="Currency" required>
                    <ManagedSelect
                      value={form.currency}
                      options={currencyOptions}
                      placeholder="Select currency"
                      onChange={(value) => set('currency', value)}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={form.note}
                      onChange={(event) => set('note', event.target.value)}
                      placeholder="Enter accounting note description"
                      rows={3}
                      className="document-value-control min-h-[72px] w-full resize-y rounded border border-[#D3E1EC] bg-white px-2 py-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                    />
                  </Field>
                  <Field label="Client" required>
                    <ManagedSelect
                      value={form.clientCounterparty}
                      options={counterparties.map((counterparty) => counterparty.name)}
                      placeholder="Select counterparty"
                      onChange={(value) => {
                        const counterparty = counterparties.find((item) => item.name === value);
                        if (counterparty) selectExternalCounterparty(counterparty);
                      }}
                    />
                  </Field>
                </div>
              </DocumentSection>

              <DocumentSection
                title="Correspondence"
                expanded={expandedSections.correspondence}
                onToggle={() => toggleSection('correspondence')}
              >
                <DocumentRowsHeader />
                <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
                  <Field label="GL account" required>
                    <GeneralLedgerAccountSelect
                      value={form.expenseAccount}
                      companyId={companyId}
                      generalLedgerName={generalLedgerName}
                      placeholder="Select GL account"
                      onChange={(value) => set('expenseAccount', value)}
                      onOpenGeneralLedger={onOpenGeneralLedger}
                      disabled={viewOnly}
                    />
                  </Field>
                  <Field label="Debit / Credit" required>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" inputMode="decimal" className={inputCls} placeholder="Debit" value={form.debit} onChange={(event) => set('debit', event.target.value)} />
                      <input type="text" inputMode="decimal" className={inputCls} placeholder="Credit" value={form.credit} onChange={(event) => set('credit', event.target.value)} />
                    </div>
                  </Field>
                  <Field label="Department">
                    <ManagedSelect value={form.departmentCode} options={departmentCodeOptions} placeholder="Select department" onChange={(value) => set('departmentCode', value)} />
                  </Field>
                  <Field label="Object / Project">
                    <ManagedSelect value={form.objectProject} options={objectProjectOptions} placeholder="Select object or project" onChange={(value) => set('objectProject', value)} />
                  </Field>
                  <Field label="Series">
                    <ManagedSelect value={form.series} options={seriesOptions} placeholder="Select series" onChange={(value) => set('series', value)} />
                  </Field>
                  <Field label="Center">
                    <ManagedSelect value={form.costCenter} options={costCenterOptions} placeholder="Select center" onChange={(value) => set('costCenter', value)} />
                  </Field>
                </div>
              </DocumentSection>
            </>
          ) : (
          <>
          <DocumentSection title="Dates" expanded={expandedSections.dates} onToggle={() => toggleSection('dates')}>
            <DocumentRowsHeader />
            <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
            <Field label="Receive date">
              <input type="date" className={inputCls} value={form.receiveDate} onChange={e => set('receiveDate', e.target.value)} />
            </Field>
            <Field label="Due / End date">
              <input type="date" className={inputCls} value={form.dueEndDate} onChange={e => set('dueEndDate', e.target.value)} />
            </Field>
            <Field label="Document date">
              <input type="date" className={inputCls} value={form.documentDate} onChange={e => set('documentDate', e.target.value)} />
            </Field>
            <Field label="Invoice / Contract date">
              <input type="date" className={inputCls} value={form.invoiceContractDate} onChange={e => set('invoiceContractDate', e.target.value)} />
            </Field>
            <Field label="Operation date">
              <div className="flex flex-col gap-1.5">
                <input
                  type="date"
                  readOnly={!operationDateRule.manualAdjustmentAllowed}
                  className={`${inputCls} ${operationDateRule.manualAdjustmentAllowed ? "" : "cursor-default bg-[#F3F6F8] text-[#7288A3]"}`}
                  value={form.operationDate}
                  onChange={e => set('operationDate', e.target.value)}
                />
                {operationDateRuleMessage && (
                  <p className="rounded-md bg-[#EEF6FA] px-2 py-1.5 font-montserrat text-[11px] font-medium leading-4 text-[#45647F]">
                    {operationDateRuleMessage}
                  </p>
                )}
              </div>
            </Field>
            <Field label="Valid from">
              <input type="date" className={inputCls} value={form.validForm} onChange={e => set('validForm', e.target.value)} />
            </Field>
            </div>
          </DocumentSection>

          <DocumentSection title="Seller information" expanded={expandedSections.seller} onToggle={() => toggleSection('seller')}>
            <DocumentRowsHeader />
            {!form.documentPurpose ? (
              <div className="rounded-lg bg-[#F8FDFF] px-3 py-3 font-montserrat text-[12px] font-medium text-[#7288A3]">
                Select Document purpose above to define the seller and buyer.
              </div>
            ) : sellerIsEditable ? (
              <PartyEditor
                details={externalParty}
                counterparties={counterparties}
                taxCountryOptions={taxCountryOptions}
                vatCodeOptions={partyVatCodeOptions}
                onChange={updateExternalParty}
                onSelect={selectExternalCounterparty}
                disabled={isDuplicate}
              />
            ) : (
              <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
                <Field label="Bank account">
                  <ManagedSelect
                    value={selectedBankAccount}
                    options={companyBankAccountOptions}
                    placeholder={companyBankAccountOptions.length > 0 ? 'Select bank account' : 'No accounts'}
                    onChange={setSelectedBankAccount}
                  />
                </Field>
              </div>
            )}
          </DocumentSection>

          <DocumentSection title="Buyer information" expanded={expandedSections.buyer} onToggle={() => toggleSection('buyer')}>
            <DocumentRowsHeader />
            {!form.documentPurpose ? (
              <div className="rounded-lg bg-[#F8FDFF] px-3 py-3 font-montserrat text-[12px] font-medium text-[#7288A3]">
                Select Document purpose above to define the seller and buyer.
              </div>
            ) : buyerIsEditable ? (
              <PartyEditor
                details={externalParty}
                counterparties={counterparties}
                taxCountryOptions={taxCountryOptions}
                vatCodeOptions={partyVatCodeOptions}
                onChange={updateExternalParty}
                onSelect={selectExternalCounterparty}
                disabled={isDuplicate}
              />
            ) : (
              <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
                <Field label="Bank account">
                  <ManagedSelect
                    value={selectedBankAccount}
                    options={companyBankAccountOptions}
                    placeholder={companyBankAccountOptions.length > 0 ? 'Select bank account' : 'No accounts'}
                    onChange={setSelectedBankAccount}
                  />
                </Field>
              </div>
            )}
          </DocumentSection>

          <DocumentSection title="Services" expanded={expandedSections.financials} onToggle={() => toggleSection('financials')}>
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-col gap-4">
                <div className={`hidden h-[18px] w-full items-center gap-1 px-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] xl:grid ${viewOnly ? 'grid-cols-[minmax(130px,1.4fr)_minmax(130px,1.4fr)_minmax(130px,1.3fr)_80px_100px_80px_110px_110px]' : 'grid-cols-[minmax(130px,1.4fr)_minmax(130px,1.4fr)_minmax(130px,1.3fr)_80px_100px_80px_110px_110px_30px]'}`}>
                  <span>Service name</span>
                  <span>Description</span>
                  <span>Product group</span>
                  <span>Quantity</span>
                  <span>Price</span>
                  <span>VAT rate</span>
                  <span>VAT</span>
                  <span>Amount</span>
                  {!viewOnly && <span aria-hidden="true" />}
                </div>
                <div className="flex flex-col">
                  {financialLines.map((line, index) => {
                    const lineAmount = (Number(line.quantity) || 0) * (Number(line.price) || 0);
                    const lineVat = lineAmount * ((Number(line.vatRate) || 0) / 100);
                    return (
                      <div key={line.id} className={`grid h-auto w-full grid-cols-1 gap-3 rounded-lg p-3 sm:grid-cols-2 xl:h-9 xl:items-center xl:gap-1 xl:px-[5px] xl:py-0 ${viewOnly ? 'xl:grid-cols-[minmax(130px,1.4fr)_minmax(130px,1.4fr)_minmax(130px,1.3fr)_80px_100px_80px_110px_110px]' : 'xl:grid-cols-[minmax(130px,1.4fr)_minmax(130px,1.4fr)_minmax(130px,1.3fr)_80px_100px_80px_110px_110px_30px]'} ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Service name</span><FinancialLineInput value={line.name} placeholder="Service name" onChange={(value) => updateFinancialLine(line.id, 'name', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Description</span><FinancialLineInput value={line.description} placeholder="Description" expandWhenLong onChange={(value) => updateFinancialLine(line.id, 'description', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Product group</span><FinancialLineSelect value={line.productGroup} placeholder="Product group" options={productGroupOptions} emptyMessage="No product groups configured" onChange={(value) => updateFinancialLine(line.id, 'productGroup', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Quantity</span><FinancialLineInput value={line.quantity} placeholder="0" onChange={(value) => updateFinancialLine(line.id, 'quantity', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Price</span><FinancialLineInput value={line.price} placeholder="0.00" onChange={(value) => updateFinancialLine(line.id, 'price', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">VAT rate</span><FinancialLineSelect value={line.vatRate} placeholder="VAT" options={['0', '9', '21']} onChange={(value) => updateFinancialLine(line.id, 'vatRate', value)} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">VAT</span><FinancialLineValue disabled={viewOnly} value={`${lineVat.toFixed(2)} ${form.currency || '€'}`} /></div>
                        <div className="min-w-0 space-y-1 xl:contents"><span className="font-montserrat text-[11px] font-medium text-[#7288A3] xl:hidden">Amount</span><FinancialLineValue disabled={viewOnly} value={`${lineAmount.toFixed(2)} ${form.currency || '€'}`} /></div>
                        {!viewOnly && <button type="button" aria-label={`Delete financial line ${index + 1}`} onClick={() => removeFinancialLine(line.id)} className="flex h-[26px] w-[26px] items-center justify-center justify-self-end rounded text-[#7288A3] transition-colors hover:bg-[#E5EDF9] hover:text-[#007EA7] sm:col-span-2 xl:col-span-1"><Trash2 size={16} /></button>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex min-h-[104px] flex-wrap items-start justify-between gap-4">
                {!viewOnly && (
                  <button type="button" onClick={addFinancialLine} className="flex h-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-semibold leading-4 text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]">Add service</button>
                )}
                <div className="ml-auto flex w-full max-w-[240px] flex-col items-end gap-2">
                  <div className="flex w-full flex-col gap-0.5">
                    <FinancialTotal label="Amount" value={financialAmount} currency={form.currency || '€'} />
                    <FinancialTotal label="VAT" value={financialVat} currency={form.currency || '€'} />
                  </div>
                  <FinancialTotal label="Total to pay" value={financialAmount + financialVat} currency={form.currency || '€'} strong />
                </div>
              </div>
            </div>
          </DocumentSection>

          <DocumentSection
            title="Additional information"
            expanded={expandedSections.organization}
            onToggle={() => toggleSection('organization')}
            disabled={additionalInformationDisabled}
          >
            <DocumentRowsHeader />
            <div className="flex flex-col [&>*:nth-child(odd)]:bg-[#F8FDFF]">
            <Field label="VAT classifier">
              <ManagedSelect
                value={form.vatClassifier}
                options={vatClassifierOptions}
                placeholder="Select VAT classifier"
                onChange={(value) => set('vatClassifier', value)}
                addLabel="Add new"
                onAdd={(value) => addLookupValue('vat_class', value, setVatClassifierOptions)}
              />
            </Field>
            <Field label="GL account">
              <GeneralLedgerAccountSelect
                value={form.expenseAccount}
                companyId={companyId}
                generalLedgerName={generalLedgerName}
                placeholder="Select GL account"
                onChange={(value) => set('expenseAccount', value)}
                onOpenGeneralLedger={onOpenGeneralLedger}
                addButtonLabel="Add new"
                formField
                disabled={viewOnly}
              />
            </Field>
            <Field label="Department code">
              <ManagedSelect
                value={form.departmentCode}
                options={departmentCodeOptions}
                placeholder="Select department code"
                onChange={(value) => set('departmentCode', value)}
                addLabel="Add new"
                onAdd={(value) => addLookupValue('department_code', value, setDepartmentCodeOptions)}
              />
            </Field>
            <Field label="Cost center">
              <ManagedSelect
                value={form.costCenter}
                options={costCenterOptions}
                placeholder="Select cost center"
                onChange={(value) => set('costCenter', value)}
                addLabel="Add new"
                onAdd={(value) => addLookupValue('cost_center', value, setCostCenterOptions)}
              />
            </Field>
            <Field label="Object / Project">
              <ManagedSelect
                value={form.objectProject}
                options={objectProjectOptions}
                placeholder="Select object or project"
                onChange={(value) => set('objectProject', value)}
                addLabel="Add new"
                onAdd={(value) => addLookupValue('object_project', value, setObjectProjectOptions)}
              />
            </Field>
            <Field label="Series">
              <ManagedSelect
                value={form.series}
                options={seriesOptions}
                placeholder="Select series"
                onChange={(value) => set('series', value)}
              />
            </Field>
            </div>
          </DocumentSection>

          <DocumentSection title="Notes" expanded={expandedSections.note} onToggle={() => toggleSection('note')}>
            <textarea
              value={form.note}
              onChange={(event) => set('note', event.target.value)}
              placeholder="Add document note..."
              rows={4}
              className="document-value-control w-full resize-none rounded-lg border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3]"
            />
          </DocumentSection>
          </>
          )}
          </fieldset>
        </form>

        {error && (
          <div className="flex flex-shrink-0 justify-center bg-white px-6 pb-6">
            <p className="font-montserrat text-[12px] text-[#D90310]">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
