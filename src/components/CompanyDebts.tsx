import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase, type Company } from '../lib/supabase';
import { usePersistentState } from '../hooks/usePersistentState';
import ColumnSortButton, { useColumnSort } from './ColumnSortButton';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import SearchableSelect from './SearchableSelect';

interface CompanyDebtsProps {
  company: Company;
  onCompanyUpdated?: (company: Company) => void;
}

interface DetailRow {
  label: string;
  value: string | number;
}

const buyerRows: DetailRow[] = [
  { label: 'Taxes', value: 'VAT' },
  { label: 'Deadlines', value: '—' },
  { label: 'Include VAT in the debt', value: 'Yes' },
];

const supplierRows: DetailRow[] = [
  { label: 'Taxes', value: '—' },
  { label: 'Deadlines', value: '—' },
  { label: 'Include VAT in the debt', value: 'Yes' },
];

function EditButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-md border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] font-medium text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
    >
      Edit
    </button>
  );
}

function DetailTable({ rows, label = 'Parameter' }: { rows: DetailRow[]; label?: string }) {
  const { direction, setDirection, sortedRows } = useColumnSort(
    rows,
    (row) => row.label,
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid h-9 grid-cols-[minmax(125px,0.9fr)_minmax(0,1.8fr)] items-center px-3 font-montserrat text-[13px] font-medium text-[#10233A]">
        <div className="flex items-center gap-1">
          <span>{label}</span>
          <ColumnSortButton
            columnLabel={label}
            direction={direction}
            onDirectionChange={setDirection}
          />
        </div>
        <span className="border-l border-[#D3E1EC] pl-4 text-[#7288A3]">Value</span>
      </div>
      {sortedRows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          className={`grid min-h-10 grid-cols-[minmax(125px,0.9fr)_minmax(0,1.8fr)] items-center rounded-lg px-3 font-montserrat text-[13px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F5FAFC]' : 'bg-white'}`}
        >
          <span className="pr-4">{row.label}</span>
          <span className="min-w-0 break-words pl-4">{row.value || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = '',
  onEdit,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  onEdit?: () => void;
}) {
  return (
    <section className={`flex flex-col gap-4 border-[#D3E1EC] bg-white p-6 ${className}`}>
      <div className="flex min-h-8 items-center justify-between gap-4">
        <h2 className="font-montserrat text-[18px] font-semibold text-[#10233A]">{title}</h2>
        <EditButton onClick={onEdit} />
      </div>
      {children}
    </section>
  );
}

export default function CompanyDebts({ company, onCompanyUpdated }: CompanyDebtsProps) {
  const [isClientEditOpen, setIsClientEditOpen] = useState(false);
  const [isAddressEditOpen, setIsAddressEditOpen] = useState(false);
  const [isAlternativeAddressEditOpen, setIsAlternativeAddressEditOpen] = useState(false);
  const [clientInfo, setClientInfo] = usePersistentState(`finansu-harmonija:v7:company-client:${company.id}`, {
    companyCode: company.company_code || '',
    name: company.name,
    category: 'Buyer/Seller',
    type: company.client_type ?? 'Legal entity',
  });
  const [draftClientInfo, setDraftClientInfo] = useState(clientInfo);
  const [addressInfo, setAddressInfo] = usePersistentState(`finansu-harmonija:v7:company-address:${company.id}`, {
    companyCode: company.company_code || '',
    vatCode: company.vat_code || '',
    address: company.address ?? 'Klaipėda, Liepų St. 83, LT-92195',
    email: company.email ?? 'some@gmail.com',
    phone: company.phone ?? '+3755659874',
  });
  const [draftAddressInfo, setDraftAddressInfo] = useState(addressInfo);
  const [alternativeAddressInfo, setAlternativeAddressInfo] = usePersistentState(`finansu-harmonija:v7:company-alternative-address:${company.id}`, {
    countryCode: 'LT',
    email: 'some@gmail.com',
    useByDefault: true,
    bankCode: '21400',
    bankName: 'Nordea Bank',
    accountCode: 'LT4873000022222222222222',
    server: 'To the line',
  });
  const [draftAlternativeAddressInfo, setDraftAlternativeAddressInfo] = useState(alternativeAddressInfo);

  useEffect(() => {
    setClientInfo(current => ({ ...current, companyCode: company.company_code, name: company.name, type: company.client_type ?? current.type }));
    setAddressInfo(current => ({
      ...current,
      companyCode: company.company_code,
      vatCode: company.vat_code,
      address: company.address ?? current.address,
      email: company.email ?? current.email,
      phone: company.phone ?? current.phone,
    }));
  }, [company, setAddressInfo, setClientInfo]);

  const openClientEdit = () => {
    setDraftClientInfo(clientInfo);
    setIsClientEditOpen(true);
  };

  const saveClientInfo = async () => {
    if (!draftClientInfo.companyCode.trim() || !draftClientInfo.name.trim()) return;
    const update: Partial<Company> = {
      name: draftClientInfo.name.trim(),
      company_code: draftClientInfo.companyCode.trim(),
      client_type: draftClientInfo.type,
    };
    const { error } = await supabase.from('companies').update(update).eq('id', company.id);
    if (error) return;
    setClientInfo(draftClientInfo);
    onCompanyUpdated?.({ ...company, ...update } as Company);
    setIsClientEditOpen(false);
  };

  const openAddressEdit = () => {
    setDraftAddressInfo(addressInfo);
    setIsAddressEditOpen(true);
  };

  const isAddressValid = Object.values(draftAddressInfo).every(value => value.trim().length > 0);

  const saveAddressInfo = async () => {
    if (!isAddressValid) return;
    const update: Partial<Company> = {
      company_code: draftAddressInfo.companyCode.trim(),
      vat_code: draftAddressInfo.vatCode.trim(),
      address: draftAddressInfo.address.trim(),
      email: draftAddressInfo.email.trim(),
      phone: draftAddressInfo.phone.trim(),
    };
    const { error } = await supabase.from('companies').update(update).eq('id', company.id);
    if (error) return;
    setAddressInfo(draftAddressInfo);
    onCompanyUpdated?.({ ...company, ...update } as Company);
    setIsAddressEditOpen(false);
  };

  const openAlternativeAddressEdit = () => {
    setDraftAlternativeAddressInfo(alternativeAddressInfo);
    setIsAlternativeAddressEditOpen(true);
  };

  const isAlternativeAddressValid = [
    draftAlternativeAddressInfo.countryCode,
    draftAlternativeAddressInfo.email,
    draftAlternativeAddressInfo.bankCode,
    draftAlternativeAddressInfo.bankName,
    draftAlternativeAddressInfo.accountCode,
    draftAlternativeAddressInfo.server,
  ].every(value => value.trim().length > 0);

  const saveAlternativeAddressInfo = () => {
    if (!isAlternativeAddressValid) return;
    setAlternativeAddressInfo(draftAlternativeAddressInfo);
    setIsAlternativeAddressEditOpen(false);
  };

  const addressRows: DetailRow[] = [
    { label: 'Company code', value: addressInfo.companyCode || '—' },
    { label: 'VAT code', value: addressInfo.vatCode || '—' },
    { label: 'Address', value: addressInfo.address || '—' },
    { label: 'Email', value: addressInfo.email || '—' },
    { label: 'Phone', value: addressInfo.phone || '—' },
  ];

  const alternativeAddressRows: DetailRow[] = [
    { label: 'Country code', value: alternativeAddressInfo.countryCode },
    { label: 'Email', value: alternativeAddressInfo.email },
    { label: 'Use this email by default', value: alternativeAddressInfo.useByDefault ? 'Yes' : 'No' },
    { label: 'Bank code', value: alternativeAddressInfo.bankCode },
    { label: 'Bank name', value: alternativeAddressInfo.bankName },
    { label: 'Account code', value: alternativeAddressInfo.accountCode },
    { label: 'Server', value: alternativeAddressInfo.server },
  ];

  return (
    <div className="min-h-full bg-white px-6 py-10 sm:px-10 lg:px-[56px]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <h1 className="font-montserrat text-[36px] font-semibold leading-[46px] text-[#10233A]">
          {clientInfo.name}
        </h1>
        <CompanyBreadcrumb companyName={clientInfo.name} items={["Debts", "Client information"]} />

        <section className="rounded-xl border border-[#D3E1EC] bg-white p-4">
          <div className="grid min-h-[160px] grid-cols-1 items-center gap-x-8 gap-y-5 rounded-lg bg-[#F5FAFC] px-6 py-5 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['Company code', clientInfo.companyCode || '—'],
              ['Name', clientInfo.name],
              ['Category', clientInfo.category],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col gap-1 font-montserrat">
                <span className="text-[12px] font-medium text-[#10233A]">{label}</span>
                <span className="truncate text-[12px] text-[#10233A]">{value}</span>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-1 font-montserrat">
              <span className="text-[12px] font-medium text-[#10233A]">Type</span>
              <span className="truncate text-[12px] text-[#10233A]">{clientInfo.type}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1 font-montserrat">
              <span className="text-[12px] font-medium text-[#10233A]">Status</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-[#10233A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0ED8A8]" /> Active
              </span>
            </div>
            <div className="flex justify-end sm:col-start-2 xl:col-start-3">
              <EditButton onClick={openClientEdit} />
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-[#D3E1EC]">
            <SectionCard title="Address" className="border-b" onEdit={openAddressEdit}>
              <DetailTable rows={addressRows} />
            </SectionCard>
            <SectionCard title="Alternative addresses" onEdit={openAlternativeAddressEdit}>
              <DetailTable rows={alternativeAddressRows} />
            </SectionCard>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#D3E1EC]">
            <SectionCard title="Buyers/suppliers" className="border-b">
              <DetailTable rows={[{ label: 'The species', value: 'Buyer/Supplier' }]} />
              <DetailTable rows={buyerRows} label="Buyers parameter" />
              <DetailTable rows={supplierRows} label="Suppliers parameter" />
            </SectionCard>
            <SectionCard title="Groups list">
              <DetailTable rows={[
                { label: 'Account connection', value: 'PT001' },
                { label: 'Group', value: 'North' },
              ]} />
            </SectionCard>
          </div>
        </div>
      </div>

      {isClientEditOpen && (
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Edit client information"
          className="fixed inset-y-0 right-0 z-[150] flex w-full max-w-[440px] flex-col overflow-y-auto border-l border-[#E5EDF9] bg-white px-8 py-8 shadow-[-12px_0_32px_rgba(16,35,58,0.10)]"
        >
          <div className="mb-10 flex items-center justify-between gap-5">
            <h2 className="font-montserrat text-[28px] font-semibold leading-9 text-[#10233A]">
              Edit client information
            </h2>
            <button
              type="button"
              aria-label="Close edit client information"
              onClick={() => setIsClientEditOpen(false)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
            >
              <X size={28} strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex flex-col gap-8">
            <FormField label="Company code" required>
              <input
                aria-label="Company code"
                value={draftClientInfo.companyCode}
                onChange={(event) => setDraftClientInfo(current => ({ ...current, companyCode: event.target.value }))}
                className="h-[58px] w-full rounded-xl border border-[#D3E1EC] bg-white px-4 font-montserrat text-[18px] text-[#10233A] outline-none transition-colors focus:border-[#007EA7]"
              />
            </FormField>

            <FormField label="Name" required>
              <input
                aria-label="Name"
                value={draftClientInfo.name}
                onChange={(event) => setDraftClientInfo(current => ({ ...current, name: event.target.value }))}
                className="h-[58px] w-full rounded-xl border border-[#D3E1EC] bg-white px-4 font-montserrat text-[18px] text-[#10233A] outline-none transition-colors focus:border-[#007EA7]"
              />
            </FormField>

            <FormField label="Category" required>
              <SelectField
                ariaLabel="Category"
                value={draftClientInfo.category}
                options={['Buyer/Seller', 'Buyer', 'Seller']}
                onChange={(value) => setDraftClientInfo(current => ({ ...current, category: value }))}
              />
            </FormField>

            <FormField label="Type" required>
              <SelectField
                ariaLabel="Type"
                value={draftClientInfo.type}
                options={['Legal entity', 'Individual']}
                onChange={(value) => setDraftClientInfo(current => ({ ...current, type: value }))}
              />
            </FormField>
          </div>

          <div className="mt-10 flex flex-col gap-4">
            <button
              type="button"
              onClick={saveClientInfo}
              disabled={!draftClientInfo.companyCode.trim() || !draftClientInfo.name.trim()}
              className="h-[58px] rounded-xl bg-[#0089AE] px-5 font-montserrat text-[18px] font-semibold text-white transition-colors hover:bg-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#D3E1EC]"
            >
              Update client information
            </button>
            <button
              type="button"
              onClick={() => setIsClientEditOpen(false)}
              className="h-[58px] rounded-xl border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[18px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6]"
            >
              Cancel
            </button>
          </div>
        </aside>
      )}

      {isAddressEditOpen && (
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Edit address"
          className="fixed inset-y-0 right-0 z-[150] flex w-full max-w-[440px] flex-col overflow-y-auto border-l border-[#E5EDF9] bg-white px-8 py-8 shadow-[-12px_0_32px_rgba(16,35,58,0.10)]"
        >
          <div className="mb-9 flex items-center justify-between gap-5">
            <h2 className="font-montserrat text-[28px] font-semibold leading-9 text-[#10233A]">Edit address</h2>
            <button
              type="button"
              aria-label="Close edit address"
              onClick={() => setIsAddressEditOpen(false)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
            >
              <X size={28} strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex flex-col gap-7">
            <FormField label="Company code" required>
              <AddressInput
                label="Address company code"
                value={draftAddressInfo.companyCode}
                onChange={(value) => setDraftAddressInfo(current => ({ ...current, companyCode: value }))}
              />
            </FormField>
            <FormField label="VAT code" required>
              <AddressInput
                label="Address VAT code"
                value={draftAddressInfo.vatCode}
                onChange={(value) => setDraftAddressInfo(current => ({ ...current, vatCode: value }))}
              />
            </FormField>
            <FormField label="Address" required>
              <AddressInput
                label="Address"
                value={draftAddressInfo.address}
                onChange={(value) => setDraftAddressInfo(current => ({ ...current, address: value }))}
              />
            </FormField>
            <FormField label="Email" required>
              <AddressInput
                label="Address email"
                value={draftAddressInfo.email}
                onChange={(value) => setDraftAddressInfo(current => ({ ...current, email: value }))}
                type="email"
              />
            </FormField>
            <FormField label="Phone" required>
              <AddressInput
                label="Address phone"
                value={draftAddressInfo.phone}
                onChange={(value) => setDraftAddressInfo(current => ({ ...current, phone: value }))}
                type="tel"
              />
            </FormField>
          </div>

          <div className="mt-10 flex flex-col gap-4">
            <button
              type="button"
              onClick={saveAddressInfo}
              disabled={!isAddressValid}
              className="h-[58px] rounded-xl bg-[#0089AE] px-5 font-montserrat text-[18px] font-semibold text-white transition-colors hover:bg-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#D3E1EC]"
            >
              Update address
            </button>
            <button
              type="button"
              onClick={() => setIsAddressEditOpen(false)}
              className="h-[58px] rounded-xl border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[18px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6]"
            >
              Cancel
            </button>
          </div>
        </aside>
      )}

      {isAlternativeAddressEditOpen && (
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Edit alternative addresses"
          className="fixed inset-y-0 right-0 z-[150] flex w-full max-w-[440px] flex-col overflow-y-auto border-l border-[#E5EDF9] bg-white px-8 py-8 shadow-[-12px_0_32px_rgba(16,35,58,0.10)]"
        >
          <div className="mb-9 flex items-start justify-between gap-5">
            <h2 className="max-w-[290px] font-montserrat text-[28px] font-semibold leading-[1.35] text-[#10233A]">
              Edit alternative addresses
            </h2>
            <button
              type="button"
              aria-label="Close edit alternative addresses"
              onClick={() => setIsAlternativeAddressEditOpen(false)}
              className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"
            >
              <X size={28} strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex flex-col gap-7">
            <FormField label="Country code" required>
              <SelectField
                ariaLabel="Alternative country code"
                value={draftAlternativeAddressInfo.countryCode}
                options={['LT', 'LV', 'EE', 'PL']}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, countryCode: value }))}
              />
            </FormField>

            <FormField label="Email" required>
              <AddressInput
                label="Alternative email"
                value={draftAlternativeAddressInfo.email}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, email: value }))}
                type="email"
              />
            </FormField>

            <label className="flex cursor-pointer items-center gap-3 font-montserrat text-[17px] text-[#7288A3]">
              <input
                type="checkbox"
                aria-label="Use this email by default"
                checked={draftAlternativeAddressInfo.useByDefault}
                onChange={(event) => setDraftAlternativeAddressInfo(current => ({ ...current, useByDefault: event.target.checked }))}
                className="peer sr-only"
              />
              <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#A1B6C6] bg-white text-white transition-colors peer-checked:border-[#0089AE] peer-checked:bg-[#0089AE]">
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.25]">
                  <path d="m3 8 3 3 7-7" />
                </svg>
              </span>
              <span>Use this email by default</span>
            </label>

            <FormField label="Bank code" required>
              <AddressInput
                label="Alternative bank code"
                value={draftAlternativeAddressInfo.bankCode}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, bankCode: value }))}
              />
            </FormField>

            <FormField label="Bank name" required>
              <AddressInput
                label="Alternative bank name"
                value={draftAlternativeAddressInfo.bankName}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, bankName: value }))}
              />
            </FormField>

            <FormField label="Account code" required>
              <AddressInput
                label="Alternative account code"
                value={draftAlternativeAddressInfo.accountCode}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, accountCode: value }))}
              />
            </FormField>

            <FormField label="Server" required>
              <SelectField
                ariaLabel="Alternative server"
                value={draftAlternativeAddressInfo.server}
                options={['To the line', 'Local', 'Remote']}
                onChange={(value) => setDraftAlternativeAddressInfo(current => ({ ...current, server: value }))}
              />
            </FormField>
          </div>

          <div className="mt-10 flex flex-col gap-4 pb-8">
            <button
              type="button"
              onClick={saveAlternativeAddressInfo}
              disabled={!isAlternativeAddressValid}
              className="h-[58px] rounded-xl bg-[#0089AE] px-5 font-montserrat text-[18px] font-semibold text-white transition-colors hover:bg-[#007EA7] disabled:cursor-not-allowed disabled:bg-[#D3E1EC]"
            >
              Update buyers/suppliers
            </button>
            <button
              type="button"
              onClick={() => setIsAlternativeAddressEditOpen(false)}
              className="h-[58px] rounded-xl border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[18px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6]"
            >
              Cancel
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-3 font-montserrat">
      <span className="text-[17px] font-semibold text-[#10233A]">
        {label}{required && <span className="ml-1 text-[#FF4550]">*</span>}
      </span>
      {children}
    </label>
  );
}

function SelectField({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <SearchableSelect ariaLabel={ariaLabel} value={value} options={options} onChange={onChange} className="h-[58px] rounded-xl border border-[#D3E1EC] bg-white px-4 pr-12 font-montserrat text-[18px] text-[#10233A]" />
  );
}

function AddressInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel';
}) {
  return (
    <input
      type={type}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-[58px] w-full rounded-xl border border-[#D3E1EC] bg-white px-4 font-montserrat text-[18px] text-[#10233A] outline-none transition-colors focus:border-[#007EA7]"
    />
  );
}
