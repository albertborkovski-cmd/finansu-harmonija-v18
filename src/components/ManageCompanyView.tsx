import { useState } from 'react';
import { Archive, Building2, PauseCircle, Power, Upload } from 'lucide-react';
import CompanyActionHistoryView from './CompanyActionHistoryView';
import OrganizationEmailHistoryView from './OrganizationEmailHistoryView';
import type { Company } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import CompanyAccessPanel from './CompanyAccessPanel';
import OrganizationSetupIntegration from './OrganizationSetupIntegration';
import { PageActionButton, PageHeader } from './PageHeader';
import { HeaderBackButton, SystemBreadcrumb } from './SystemNavigation';
import CompanyClientInformation, { ClientField } from './CompanyClientInformation';
import { loadOrganizationReferenceValues } from './OrganizationReferenceValuesView';
import { loadCompanyLogo, saveCompanyLogo } from '../lib/companyBranding';

const SECTIONS = [
  'General & status',
  'Accounting setup',
  'Bank setup',
  'Documents & digitization setup',
  'Accountants & access',
  'Services',
  'Setup & integration',
  'Sent documents history',
  'Audit',
] as const;

type Section = (typeof SECTIONS)[number];
type OrganizationDetails = Pick<Company, 'name' | 'company_code' | 'vat_code' | 'tax_country' | 'legal_form' | 'base_currency' | 'address' | 'email' | 'phone' | 'website' | 'client_since' | 'client_notes'>;
function editableDetails(company: Company) {
  return { name: company.name, company_code: company.company_code, vat_code: company.vat_code, tax_country: company.tax_country || company.country || '', legal_form: company.legal_form || '', base_currency: company.base_currency || '', address: company.address || '', email: company.email || '', phone: company.phone || '', website: company.website || '', client_since: String(company.client_since || ''), client_notes: company.client_notes || '' };
}
type CompanyStatus = 'Active' | 'Suspended' | 'Deactivated' | 'Archived';

const STATUS_ACTIONS: Array<{
  status: CompanyStatus;
  label: string;
  icon: typeof Power;
}> = [
  { status: 'Active', label: 'Activate', icon: Power },
  { status: 'Suspended', label: 'Suspend', icon: PauseCircle },
  { status: 'Deactivated', label: 'Deactivate', icon: Power },
  { status: 'Archived', label: 'Archive', icon: Archive },
];

const STATUS_STYLES: Record<CompanyStatus, string> = {
  Active: 'bg-[#E8F8F1] text-[#087A55]',
  Suspended: 'bg-[#FFF6DE] text-[#9A6700]',
  Deactivated: 'bg-[#F1F4F7] text-[#596E83]',
  Archived: 'bg-[#F3F0F7] text-[#6C4A7E]',
};

function ReadOnlyField({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[12px] font-semibold leading-[18px] text-[#7288A3]">{label}</span>
      <div className="flex min-h-[42px] items-center rounded-lg border border-[#D3E1EC] bg-[#F7F7F7] px-[14px] font-montserrat text-[14px] font-normal leading-5 text-[#10233A]">
        <span className="truncate" title={String(value || '—')}>{value || '—'}</span>
      </div>
    </div>
  );
}

export default function ManageCompanyView({
  company,
  onBack,
  onStatusChange,
  onSaveDetails,
  onSaveLogo,
  onCompanyUpdated,
}: {
  company: Company;
  onBack: () => void;
  onOpenCompany?: (company: Company) => void;
  onOpenSetup?: (company: Company) => void;
  onStatusChange?: (status: CompanyStatus, reason: string) => Promise<void>;
  onSaveDetails?: (values: OrganizationDetails) => Promise<void>;
  onSaveLogo?: (logo: string) => Promise<void>;
  onCompanyUpdated?: (company: Company) => void;
}) {
  const [section, setSection] = useState<Section>('General & status');
  const [pendingStatus, setPendingStatus] = useState<CompanyStatus | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [details, setDetails] = useState(() => editableDetails(company));
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [logoSaving, setLogoSaving] = useState(false);
  const companyLogo = company.logo_url || loadCompanyLogo(company.id);
  const persistLogo = async (logo: string) => {
    if (!onSaveLogo || logoSaving) return;
    setLogoSaving(true);
    setLogoError('');
    try {
      await onSaveLogo(logo);
      saveCompanyLogo(company.id, logo);
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'Unable to save company logo.');
    } finally { setLogoSaving(false); }
  };
  const uploadLogo = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setLogoError('Use a PNG or JPG image.'); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError('The logo must be smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') void persistLogo(reader.result); };
    reader.onerror = () => setLogoError('Unable to read image. Please try again.');
    reader.readAsDataURL(file);
  };
  const detailsChanged = JSON.stringify(details) !== JSON.stringify(editableDetails(company));
  const services = [...new Set((company.service_scope || '')
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean))];
  const currentStatus = (STATUS_ACTIONS.some((action) => action.status === company.company_status)
    ? company.company_status
    : 'Active') as CompanyStatus;

  const submitStatusChange = async () => {
    if (!pendingStatus || !statusReason.trim() || !onStatusChange || statusSaving) return;
    setStatusSaving(true);
    setStatusError('');
    try {
      await onStatusChange(pendingStatus, statusReason.trim());
      setPendingStatus(null);
      setStatusReason('');
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Status could not be changed.');
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Manage company"
      />
      <SystemBreadcrumb items={['Companies', company.name, 'Manage company', section]} />

      <div className="flex items-center gap-3">
        <HeaderBackButton onClick={onBack} label="Back to companies" />
        <div className="min-w-0">
          <h2 className="truncate font-montserrat text-[18px] font-semibold leading-[26px] text-[#10233A]">{company.name}</h2>
          <p className="font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">Company code: {company.company_code || '—'}</p>
        </div>
      </div>

      <div role="tablist" aria-label="Manage company sections" className="flex min-w-0 flex-wrap border-b border-[#D3E1EC]">
        {SECTIONS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={section === item}
            onClick={() => setSection(item)}
            className={`h-[42px] border-b-2 px-4 font-montserrat text-[13px] font-semibold leading-5 transition-colors ${section === item ? 'border-[#007EA7] text-[#007EA7]' : 'border-transparent text-[#7288A3] hover:text-[#10233A]'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {section === 'General & status' && (
        <section className="flex flex-col gap-6">
          <div className="rounded-lg border border-[#D3E1EC] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Company details</h3>
                <p className="mt-1 font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">Primary identification and registration information.</p>
              </div>
              <span className={`inline-flex h-7 items-center rounded-full px-3 font-montserrat text-[12px] font-semibold leading-[18px] ${STATUS_STYLES[currentStatus]}`}>
                {currentStatus}
              </span>
            </div>
            <div className="mb-5 flex items-center gap-4 rounded-lg border border-[#E3ECF3] bg-[#F8FAFC] p-4">
              <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D3E1EC] bg-white">
                {companyLogo ? <img src={companyLogo} alt={`${company.name} company logo`} className="max-h-full max-w-full object-contain p-2" /> : <Building2 size={26} className="text-[#8CA1B7]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-montserrat text-[14px] font-semibold text-[#10233A]">Company logo</p>
                <p className="mt-0.5 font-montserrat text-[12px] text-[#879BB1]">PNG or JPG image. Used in reports and documents.</p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 font-montserrat text-[14px] font-medium text-[#007EA7] hover:text-[#006F91]">
                    <Upload size={16} />{logoSaving ? 'Saving…' : companyLogo ? 'Replace logo' : 'Upload logo'}
                    <input type="file" aria-label="Upload company logo" accept="image/png,image/jpeg" className="hidden" disabled={logoSaving || !onSaveLogo} onChange={(event) => { uploadLogo(event.target.files?.[0]); event.target.value = ''; }} />
                  </label>
                  {companyLogo && <button type="button" disabled={logoSaving || !onSaveLogo} onClick={() => void persistLogo('')} className="font-montserrat text-[13px] font-medium text-[#7288A3] hover:text-[#D64545] disabled:opacity-50">Remove</button>}
                </div>
                {logoError && <p role="alert" className="mt-2 font-montserrat text-[12px] font-medium text-[#D64545]">{logoError}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {([['name', 'Company name *'], ['company_code', 'Company code *'], ['vat_code', 'VAT code']] as const).map(([key, label]) => <ClientField key={key} field={{ key, label, value: details[key] }} onChange={value => setDetails(current => ({ ...current, [key]: value }))} />)}
              <ClientField field={{ key: 'taxCountry', label: 'Tax country *', type: 'select', value: details.tax_country, options: loadOrganizationReferenceValues('Tax country') }} onChange={(value) => setDetails((current) => ({ ...current, tax_country: value }))} />
              <ClientField field={{ key: 'legalForm', label: 'Legal form *', type: 'select', value: details.legal_form, options: loadOrganizationReferenceValues('Legal form') }} onChange={(value) => setDetails((current) => ({ ...current, legal_form: value }))} />
              <ClientField field={{ key: 'baseCurrency', label: 'Base currency *', type: 'select', value: details.base_currency, options: loadOrganizationReferenceValues('Base currency') }} onChange={(value) => setDetails((current) => ({ ...current, base_currency: value }))} />
            </div>
            <div className="mt-6 border-t border-[#E5EDF4] pt-5">
              <h4 className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Company address</h4>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {([['address', 'Registered address'], ['email', 'Primary email'], ['phone', 'Phone number'], ['website', 'Website'], ['client_since', 'Client since']] as const).map(([key, label]) => <ClientField key={key} field={{ key, label, value: details[key] }} onChange={value => setDetails(current => ({ ...current, [key]: value }))} />)}
                <div className="md:col-span-2 xl:col-span-3">
                  <label className="flex flex-col gap-2 font-montserrat text-[14px] font-semibold text-[#10233A]">Client notes<textarea value={details.client_notes} onChange={event => setDetails(current => ({ ...current, client_notes: event.target.value }))} className="min-h-[84px] w-full resize-y rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-3 font-normal leading-5 outline-none focus:border-[#007EA7]" /></label>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              {detailsError && <p role="alert" className="font-montserrat text-[12px] text-[#D92D20]">{detailsError}</p>}
              <PageActionButton disabled={!onSaveDetails || !detailsChanged || detailsSaving || !details.tax_country || !details.legal_form || !details.base_currency} onClick={async () => {
                if (!onSaveDetails || detailsSaving) return;
                setDetailsSaving(true);
                setDetailsError('');
                try {
                  if (!details.name.trim() || !details.company_code.trim()) throw new Error('Company name and company code are required.');
                  if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) throw new Error('Enter a valid email address.');
                  if (!/^\d{4}$/.test(details.client_since)) throw new Error('Client since must be a four-digit year.');
                  const { data, error } = await supabase.from('companies').select('*');
                  if (error) throw new Error(error.message);
                  const normalized = (value: unknown) => String(value || '').trim().toLowerCase();
                  if ((data || []).some(row => row.id !== company.id && ((normalized(row.tax_country || row.country) === normalized(details.tax_country) && normalized(row.company_code) === normalized(details.company_code)) || (details.vat_code.trim() && normalized(row.vat_code) === normalized(details.vat_code))))) throw new Error('A company with this company code or VAT code already exists.');
                  await onSaveDetails({ ...details, name: details.name.trim(), company_code: details.company_code.trim(), vat_code: details.vat_code.trim(), client_since: Number(details.client_since) });
                }
                catch (error) { setDetailsError(error instanceof Error ? error.message : 'Unable to save company details.'); }
                finally { setDetailsSaving(false); }
              }}>{detailsSaving ? 'Saving…' : 'Save'}</PageActionButton>
            </div>
          </div>

          <div className="rounded-lg border border-[#D3E1EC] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Status management</h3>
                <p className="mt-1 max-w-[720px] font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">Status changes preserve the company record and its complete audit history. User blocking is managed separately at user level.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {STATUS_ACTIONS.map(({ status, label, icon: Icon }) => (
                  <PageActionButton
                    key={status}
                    disabled={currentStatus === status || !onStatusChange}
                    onClick={() => {
                      setPendingStatus(status);
                      setStatusReason('');
                      setStatusError('');
                    }}
                    icon={<Icon size={14} />}
                  >
                    {label}
                  </PageActionButton>
                ))}
              </div>
            </div>
            {(company.company_status_reason || company.company_status_changed_at) && (
              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-[#E5EDF4] pt-5 md:grid-cols-2">
                <ReadOnlyField label="Latest status reason" value={company.company_status_reason} />
                <ReadOnlyField label="Status changed at" value={company.company_status_changed_at} />
              </div>
            )}
          </div>
        </section>
      )}

      {section === 'Accountants & access' && (
        <CompanyAccessPanel company={company} />
      )}

      {section === 'Services' && (
        <section className="flex w-full min-w-0 flex-col gap-6 bg-white">
          <div>
            <h3 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">FH services & modules</h3>
            <p className="mt-1 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">Services assigned to {company.name}.</p>
          </div>
          <div role="table" aria-label="Company service scope" className="font-montserrat text-[12px] font-medium text-[#10233A]">
            <div role="row" className="mb-3 flex h-6 items-center">
              <div role="columnheader" className="min-w-0 flex-1 px-3">Service scope</div>
              <div role="columnheader" className="w-[180px] flex-shrink-0 border-l border-[#D3E1EC] px-3">Status</div>
            </div>
            <div role="rowgroup" className="flex flex-col gap-0.5">
              {services.map((service, index) => <div role="row" key={service} className={`flex h-10 items-center rounded-lg ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`}>
                <div role="cell" className="min-w-0 flex-1 truncate px-3" title={service}>{service}</div>
                <div role="cell" className="flex w-[180px] flex-shrink-0 items-center gap-2 px-3"><span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-[#12B886]" />Active</div>
              </div>)}
            </div>
            {!services.length && <p className="py-12 text-center text-[13px] text-[#7288A3]">No services assigned to this company.</p>}
          </div>
        </section>
      )}

      {section === 'Setup & integration' && <OrganizationSetupIntegration key={company.id} company={company} embedded />}

      {section === 'Accounting setup' && <CompanyClientInformation key={company.id} company={company} activeTab="Client information" organizationMode additionalSettingsOnly onCompanyUpdated={onCompanyUpdated} />}

      {section === 'Bank setup' && <CompanyClientInformation key={`banking-${company.id}`} company={company} activeTab="Client information" organizationMode bankInformationOnly onCompanyUpdated={onCompanyUpdated} />}

      {section === 'Documents & digitization setup' && <CompanyClientInformation key={`digitization-${company.id}`} company={company} activeTab="Client information" organizationMode digitizationSettingsOnly onCompanyUpdated={onCompanyUpdated} />}

      {section === 'Sent documents history' && (
        <OrganizationEmailHistoryView key={company.id} organizationId={company.id} organizationName={company.name} />
      )}

      {section === 'Audit' && (
        <CompanyActionHistoryView company={company} administrativeOnly embedded />
      )}

      {pendingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/25 p-4" role="dialog" aria-modal="true" aria-labelledby="status-change-title">
          <div className="w-full max-w-[520px] rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-[0_20px_60px_rgba(16,35,58,0.18)]">
            <h2 id="status-change-title" className="font-montserrat text-[20px] font-semibold leading-7 text-[#10233A]">Change status to {pendingStatus}</h2>
            <p className="mt-2 font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">Provide a reason for this status change. The reason will be saved in the company audit history.</p>
            <label className="mt-5 flex flex-col gap-2">
              <span className="font-montserrat text-[12px] font-semibold leading-[18px] text-[#10233A]">Reason <span className="text-[#D92D20]">*</span></span>
              <textarea
                autoFocus
                value={statusReason}
                onChange={(event) => {
                  setStatusReason(event.target.value);
                  setStatusError('');
                }}
                rows={4}
                className="resize-none rounded-lg border border-[#D3E1EC] px-3 py-2 font-montserrat text-[13px] font-normal leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                placeholder="Enter reason"
              />
            </label>
            {statusError && <p className="mt-2 font-montserrat text-[12px] leading-[18px] text-[#D92D20]">{statusError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <PageActionButton onClick={() => {
                setPendingStatus(null);
                setStatusReason('');
                setStatusError('');
              }}>Cancel</PageActionButton>
              <button
                type="button"
                disabled={!statusReason.trim() || statusSaving}
                onClick={submitStatusChange}
                className="flex h-8 items-center justify-center rounded-md bg-[#007EA7] px-3 font-montserrat text-[14px] font-semibold leading-5 text-white transition-colors hover:bg-[#006B8E] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"
              >
                {statusSaving ? 'Saving…' : `Confirm ${pendingStatus.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
