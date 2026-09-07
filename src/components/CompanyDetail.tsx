import { useEffect, useState } from 'react';
import { ArrowLeft, User, Menu, LogOut, ChevronDown, LayoutDashboard, Files, HandCoins, Scale, BarChart3, History, Building2, Headphones, HelpCircle, BookOpenText, Landmark } from 'lucide-react';
import type { Company } from '../lib/supabase';
import Documents from './Documents';
import DashboardView from './DashboardView';
import InvoicesView from './invoices';
import CompanyClientInformation from './CompanyClientInformation';
import CompanyDebts from './CompanyDebts';
import CompanyDebtsView from './CompanyDebtsView';
import CompanyReconciliationView from './CompanyReconciliationView';
import AllDocumentsView from './AllDocumentsView';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import GeneralLedgerView from './GeneralLedgerView';
import CompanyReportsView from './CompanyReportsView';
import CompanyActionHistoryView from './CompanyActionHistoryView';
import CompanyGlJournalView from './CompanyGlJournalView';
import CompanyBankView from './CompanyBankView';
import CompanyBankAccountsView from './CompanyBankAccountsView';
import CompanySepaPaymentsView from './CompanySepaPaymentsView';
import type { InvoiceChatContext } from './invoices/invoiceChat';

interface CompanyDetailProps {
  company: Company;
  onBack: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  initialMenu?: string;
  initialDocumentId?: string | null;
  onOpenChat?: (context: InvoiceChatContext) => void;
}

const mainMenuItems = [
  { id: 'overview',      label: 'Dashboard', icon: LayoutDashboard },
  { id: 'documents',     label: 'All documents', icon: Files },
  { id: 'gl-journal',    label: 'GL journal', icon: BookOpenText },
  { id: 'bank',          label: 'Bank', icon: Landmark },
  { id: 'reports',       label: 'Debts', icon: HandCoins },
  { id: 'services',      label: 'Reconciliation', icon: Scale },
  { id: 'settings',      label: 'Reports', icon: BarChart3 },
  { id: 'notifications', label: 'Action history', icon: History },
  { id: 'activity',      label: 'Company/Client information', icon: Building2 },
];

const contactMenuItems = [
  { id: 'contacts', label: 'Support', icon: Headphones },
  { id: 'partners', label: 'Help', icon: HelpCircle },
  { id: 'team',     label: 'FAQ', icon: HelpCircle },
];

const companyInformationMenuItems = [
  'Client information',
  'Stats',
  'Contacts',
  'Address',
  'Taxes',
  'Banking',
  'Accounting settings',
  'Representatives',
  'Clients',
  'Files',
  'GL account',
] as const;

function getCompanyInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

function SubmenuStepperDot({ isActive, isFirst, isLast }: { isActive: boolean; isFirst: boolean; isLast: boolean }) {
  return (
    <div className="flex w-1 self-stretch flex-col items-center">
      <div className="w-0 flex-1 border-l border-[#007EA7]" style={{ opacity: isFirst ? 0 : 0.2 }} />
      <div className="h-1 w-1 flex-shrink-0 rounded-full bg-[#007EA7]" style={{ opacity: isActive ? 1 : 0.2 }} />
      <div className="w-0 flex-1 border-l border-[#007EA7]" style={{ opacity: isLast ? 0 : 0.2 }} />
    </div>
  );
}

export default function CompanyDetail({ company, onBack, onLogout, onOpenProfile, initialMenu = 'overview', initialDocumentId = null, onOpenChat }: CompanyDetailProps) {
  const [currentCompany, setCurrentCompany] = useState(company);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMenu, setActiveMenu] = useState(initialMenu === 'invoices' ? 'documents' : initialMenu);
  const [activeDocumentsMenu, setActiveDocumentsMenu] = useState<'documents' | 'invoices' | 'processed'>(initialMenu === 'invoices' ? 'invoices' : 'documents');
  const [dashboardDocumentId, setDashboardDocumentId] = useState<string | null>(initialDocumentId);
  const [activeDebtsMenu, setActiveDebtsMenu] = useState<'list' | 'information'>('list');
  const [activeBankMenu, setActiveBankMenu] = useState<'transactions' | 'accounts' | 'sepa'>('transactions');
  const [activeCompanyInformationMenu, setActiveCompanyInformationMenu] = useState<(typeof companyInformationMenuItems)[number]>('Client information');
  const fallbackMenuLabel = [...mainMenuItems, ...contactMenuItems].find(
    (item) => item.id === activeMenu,
  )?.label ?? "Company overview";
  const openGeneralLedger = () => {
    setActiveMenu("activity");
    setActiveCompanyInformationMenu("GL account");
  };

  useEffect(() => {
    setCurrentCompany(company);
  }, [company]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Blue strip */}
      <div className="w-12 min-h-screen bg-[#E6F2F6] flex flex-col justify-between items-center py-4 z-10 flex-shrink-0">
        <div className="group relative flex h-8 w-12 items-center justify-center">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Profile settings"
            aria-describedby="company-profile-settings-tooltip"
            className="peer w-8 h-8 flex items-center justify-center rounded hover:bg-[#D0E8EF] transition-colors"
          >
            <User size={16} className="text-[#7288A3]" />
          </button>
          <span
            id="company-profile-settings-tooltip"
            role="tooltip"
            className="pointer-events-none invisible absolute left-[44px] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#D3E1EC] bg-white px-3 py-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] opacity-0 shadow-[0_8px_24px_rgba(16,35,58,0.14)] transition-opacity duration-75 group-hover:visible group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
          >
            Profile settings
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="group relative flex h-8 w-12 items-center justify-center">
            <button
              onClick={() => setIsExpanded(v => !v)}
              aria-label="Collapse sidebar"
              aria-describedby="company-collapse-sidebar-tooltip"
              className="peer w-12 h-8 flex items-center justify-center hover:bg-[#D0E8EF] rounded transition-colors"
            >
              <Menu size={16} className="text-[#006080]" />
            </button>
            <span
              id="company-collapse-sidebar-tooltip"
              role="tooltip"
              className="pointer-events-none invisible absolute left-[44px] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#D3E1EC] bg-white px-3 py-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] opacity-0 shadow-[0_8px_24px_rgba(16,35,58,0.14)] transition-opacity duration-75 group-hover:visible group-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
            >
              Collapse
            </span>
          </div>
          <button onClick={onLogout} className="w-12 h-8 flex items-center justify-center hover:bg-[#D0E8EF] rounded transition-colors" title="Logout">
            <LogOut size={16} className="text-[#006080] rotate-90" />
          </button>
        </div>
      </div>

      {/* White panel */}
      <div
        className="min-h-screen bg-white border-r-2 border-[#E6F2F6] flex flex-col transition-all duration-300 overflow-hidden flex-shrink-0"
        style={{ width: isExpanded ? '288px' : '68px' }}
      >
        <div className="p-4 flex flex-col h-full">
          {/* Back button */}
          <div className="flex items-center px-2 py-[6px] h-8 flex-shrink-0 overflow-hidden mb-2">
            <button
              onClick={onBack}
              className="flex flex-row items-center gap-2 hover:opacity-70 transition-opacity"
              title="Back"
            >
              <ArrowLeft size={11} className="text-[#007EA7] flex-shrink-0" style={{ strokeWidth: 2.5 }} />
              {isExpanded && (
                <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#007EA7] whitespace-nowrap">
                  Back
                </span>
              )}
            </button>
          </div>

          {/* Company name */}
          <div className={`mb-2 flex h-5 flex-shrink-0 items-center overflow-hidden ${isExpanded ? 'px-2' : 'justify-center px-0'}`}>
            {isExpanded ? (
              <span className="font-montserrat font-medium text-[14px] leading-5 text-[#161616] whitespace-nowrap truncate block">
                Client: {currentCompany.name}
              </span>
            ) : (
              <span
                className="font-montserrat text-[13px] font-semibold leading-5 text-[#10233A]"
                title={currentCompany.name}
                aria-label={currentCompany.name}
              >
                {getCompanyInitials(currentCompany.name)}
              </span>
            )}
          </div>

          {/* Main menu — grows to fill space */}
          <nav className="flex flex-col gap-0 flex-1 overflow-y-auto">
            {mainMenuItems.map((item) => {
              const isActive = activeMenu === item.id;
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex flex-col">
                  <button
                    onClick={() => {
                      setActiveMenu(item.id);
                      if (item.id === 'activity') {
                        setActiveCompanyInformationMenu('Client information');
                      }
                    }}
                    title={!isExpanded ? item.label : undefined}
                    className={`h-9 flex flex-row items-center justify-between rounded transition-colors overflow-hidden ${
                      isExpanded ? 'w-full px-3' : 'w-9 justify-center px-[10px]'
                    } ${isActive ? 'bg-[#007EA7]' : 'hover:bg-[#F0F7FA]'}`}
                  >
                    {!isExpanded && <Icon size={16} className={isActive ? 'text-white' : 'text-[#7288A3]'} />}
                    {isExpanded && (
                      <>
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-[#7288A3]'}`} />
                          <span className={`truncate whitespace-nowrap font-montserrat text-[14px] font-medium leading-5 ${isActive ? 'text-white' : 'text-[#10233A]'}`}>
                            {item.label}
                          </span>
                        </div>
                        {(item.id === 'documents' || item.id === 'bank' || item.id === 'activity') && <ChevronDown size={16} className={`flex-shrink-0 transition-transform ${isActive ? 'rotate-180 text-white' : 'text-[#10233A]'}`} />}
                      </>
                    )}
                  </button>
                  {isExpanded && item.id === 'documents' && isActive && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {[
                        { id: 'documents' as const, label: 'Documents' },
                        { id: 'invoices' as const, label: 'Invoices' },
                        { id: 'processed' as const, label: 'Draft' },
                      ].map((subItem, index, items) => (
                        <div key={subItem.id} className="flex h-8 flex-row items-center gap-[14px]">
                          <SubmenuStepperDot isActive={activeDocumentsMenu === subItem.id} isFirst={index === 0} isLast={index === items.length - 1} />
                          <button
                            type="button"
                            onClick={() => setActiveDocumentsMenu(subItem.id)}
                            className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${activeDocumentsMenu === subItem.id ? 'bg-[#007EA7]' : 'hover:bg-[#F0F7FA]'}`}
                          >
                            <span className={`truncate font-montserrat text-[14px] font-medium leading-5 ${activeDocumentsMenu === subItem.id ? 'text-white' : 'text-[#10233A]'}`}>{subItem.label}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && item.id === 'reports' && isActive && (
                    <div className="ml-5 flex flex-col border-l border-[#D3E1EC] py-1 pl-3">
                      {[
                        { id: 'list' as const, label: 'Debt list' },
                        { id: 'information' as const, label: 'Client information' },
                      ].map(subItem => (
                        <button
                          key={subItem.id}
                          type="button"
                          onClick={() => setActiveDebtsMenu(subItem.id)}
                          className={`h-8 rounded px-2 text-left font-montserrat text-[13px] font-medium transition-colors ${activeDebtsMenu === subItem.id ? 'bg-[#E6F2F6] text-[#007EA7]' : 'text-[#10233A] hover:bg-[#F0F7FA]'}`}
                        >
                          {subItem.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {isExpanded && item.id === 'bank' && isActive && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {[
                        { id: 'transactions' as const, label: 'Bank transactions' },
                        { id: 'accounts' as const, label: 'Bank accounts' },
                        { id: 'sepa' as const, label: 'SEPA payments' },
                      ].map((subItem, index, items) => (
                        <div key={subItem.id} className="flex h-8 flex-row items-center gap-[14px]">
                          <SubmenuStepperDot isActive={activeBankMenu === subItem.id} isFirst={index === 0} isLast={index === items.length - 1} />
                          <button type="button" onClick={() => setActiveBankMenu(subItem.id)} className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${activeBankMenu === subItem.id ? 'bg-[#007EA7]' : 'hover:bg-[#F0F7FA]'}`}>
                            <span className={`truncate font-montserrat text-[14px] font-medium leading-5 ${activeBankMenu === subItem.id ? 'text-white' : 'text-[#10233A]'}`}>{subItem.label}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && item.id === 'activity' && isActive && (
                    <div className="mt-1.5 flex flex-col gap-0.5 pb-1 pl-[14px]">
                      {companyInformationMenuItems.map((label, index, items) => (
                        <div key={label} className="flex h-8 flex-row items-center gap-[14px]">
                          <SubmenuStepperDot isActive={activeCompanyInformationMenu === label} isFirst={index === 0} isLast={index === items.length - 1} />
                          <button
                            type="button"
                            onClick={() => setActiveCompanyInformationMenu(label)}
                            className={`flex h-8 min-w-0 flex-1 items-center rounded-md px-3 transition-colors ${activeCompanyInformationMenu === label ? 'bg-[#007EA7]' : 'hover:bg-[#F0F7FA]'}`}
                          >
                            <span className={`truncate font-montserrat text-[14px] font-medium leading-5 ${activeCompanyInformationMenu === label ? 'text-white' : 'text-[#10233A]'}`}>{label}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Contact menu items — pinned to bottom */}
          <div className="flex flex-col gap-0 flex-shrink-0">
            {contactMenuItems.map((item) => {
              const isActive = activeMenu === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  title={!isExpanded ? item.label : undefined}
                  className={`h-9 flex flex-row items-center rounded transition-colors overflow-hidden ${
                    isExpanded ? 'w-full px-3' : 'w-9 justify-center px-[10px]'
                  } ${isActive ? 'bg-[#007EA7]' : 'hover:bg-[#F0F7FA]'}`}
                >
                  {!isExpanded && <Icon size={16} className={isActive ? 'text-white' : 'text-[#7288A3]'} />}
                  {isExpanded && (
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon size={16} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-[#7288A3]'}`} />
                      <span className={`truncate whitespace-nowrap font-montserrat text-[14px] font-medium leading-5 ${isActive ? 'text-white' : 'text-[#10233A]'}`}>
                        {item.label}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div data-app-main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white">
        {activeMenu === 'documents' ? (
          activeDocumentsMenu === 'documents'
            ? <Documents companyId={currentCompany.id} companyName={currentCompany.name} company={currentCompany} generalLedgerName={currentCompany.general_ledger ?? ''} initialViewDocumentId={dashboardDocumentId} onInitialViewConsumed={() => setDashboardDocumentId(null)} onInitialViewBack={initialDocumentId ? onBack : () => setActiveMenu('overview')} onOpenGeneralLedger={openGeneralLedger} onStartChat={onOpenChat} />
            : activeDocumentsMenu === 'invoices'
              ? <InvoicesView companyId={currentCompany.id} companyName={currentCompany.name} company={currentCompany} onStartChat={onOpenChat} />
              : <AllDocumentsView mode="processed" scope="company" companyName={currentCompany.name} />
        ) : activeMenu === 'overview' ? (
          <DashboardView
            companyId={currentCompany.id}
            clientName={currentCompany.name}
            onOpenDocument={(document) => {
              setDashboardDocumentId(document.id);
              setActiveDocumentsMenu('documents');
              setActiveMenu('documents');
            }}
          />
        ) : activeMenu === 'gl-journal' ? (
          <CompanyGlJournalView company={currentCompany} />
        ) : activeMenu === 'bank' ? (
          activeBankMenu === 'transactions'
            ? <CompanyBankView company={currentCompany} />
            : activeBankMenu === 'accounts'
              ? <CompanyBankAccountsView company={currentCompany} onCompanyUpdated={setCurrentCompany} />
              : <CompanySepaPaymentsView company={currentCompany} />
        ) : activeMenu === 'reports' ? (
          activeDebtsMenu === 'list' ? <CompanyDebtsView companyName={currentCompany.name} /> : <CompanyDebts company={currentCompany} onCompanyUpdated={setCurrentCompany} />
        ) : activeMenu === 'activity' ? (
          activeCompanyInformationMenu === 'GL account'
            ? <GeneralLedgerView assignedTemplateName={currentCompany.general_ledger ?? ''} companyName={currentCompany.name} companyId={currentCompany.id} />
            : <CompanyClientInformation company={currentCompany} activeTab={activeCompanyInformationMenu} organizationDesign onCompanyUpdated={setCurrentCompany} />
        ) : activeMenu === 'services' ? (
          <CompanyReconciliationView companyName={currentCompany.name} />
        ) : activeMenu === 'settings' ? (
          <CompanyReportsView company={currentCompany} />
        ) : activeMenu === 'notifications' ? (
          <CompanyActionHistoryView company={currentCompany} />
        ) : (
          <div className="px-9 py-14">
            <CompanyOverview company={currentCompany} sectionLabel={fallbackMenuLabel} />
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-montserrat font-medium text-[11px] leading-4 text-[#7288A3] uppercase tracking-wide">{label}</span>
      <span className="font-montserrat font-medium text-[14px] leading-5 text-[#10233A]">{value || '—'}</span>
    </div>
  );
}

function CompanyOverview({ company, sectionLabel }: { company: Company; sectionLabel: string }) {
  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-montserrat font-semibold text-[24px] leading-8 text-[#10233A]">{company.name}</h1>
        <span className="font-montserrat font-medium text-[13px] leading-5 text-[#7288A3]">{sectionLabel}</span>
      </div>
      <CompanyBreadcrumb companyName={company.name} items={[sectionLabel]} />

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Company code',   value: company.company_code },
          { label: 'VAT code',       value: company.vat_code },
          { label: 'Client since',   value: company.client_since },
          { label: 'Action required', value: company.action_required },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-3 px-5 py-4 bg-[#F8FDFF] border border-[#E6F2F6] rounded-xl">
            <InfoRow label={label} value={value} />
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      {['Documents', 'Transactions'].map(section => (
        <div key={section} className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between">
            <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#10233A]">{section}</span>
            <span className="font-montserrat font-medium text-[13px] leading-5 text-[#007EA7] cursor-pointer hover:underline">View all</span>
          </div>
          <div className="flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-[#D3E1EC]">
            <span className="font-montserrat font-medium text-[13px] text-[#7288A3]">No {section.toLowerCase()} yet</span>
          </div>
        </div>
      ))}
    </div>
  );
}
