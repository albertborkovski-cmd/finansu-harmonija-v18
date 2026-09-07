import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp, Trash2, Paperclip, ArrowLeft, Send, FileText } from 'lucide-react';
import { loadOrganizationReferenceValues } from '../OrganizationReferenceValuesView';
import { loadVatClassificationTemplateNames } from '../VatClassificationsView';
import { supabase, type Company } from '../../lib/supabase';
import { getCurrentUserName } from '../../lib/currentUser';
import HorizontalTableScrollbar from '../HorizontalTableScrollbar';
import { PageActionButton } from '../PageHeader';
import SearchableSelect from '../SearchableSelect';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import SendInvoicePanel from './SendInvoicePanel';
import {
  invoiceChatPersistenceKey,
  registerChatConversation,
  type InvoiceChatContext,
  type InvoiceChatMessage,
} from './invoiceChat';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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

function loadCompanyBankAccounts(company?: Company): string[] {
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

export interface InvoicePreviewServiceLine {
  id: string;
  name: string;
  description: string;
  quantity: string;
  price: string;
  vatRate: string;
}

type ServiceLine = InvoicePreviewServiceLine;

export interface InvoicePreviewDetails {
  invoiceNumber: string;
  invoiceDate: string;
  payByDate: string;
  language: string;
  currency: string;
  salesTeam: string;
  magazine: string;
  customerManager: string;
  mainAnalyticalAccount: string;
}

export interface InvoicePreviewPartyDetails {
  seller?: string;
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
}

interface InvoiceAttachment {
  file: File;
  previewUrl: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PdfAttachmentPreview({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    const renderFirstPage = async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdf.getPage(1);
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale: 0.45 });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    };

    void renderFirstPage().catch(() => undefined);
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [file]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Preview of ${file.name}`}
      className="h-full w-full bg-white object-contain"
    />
  );
}

function PdfPagePreview({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    const renderPage = async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    };

    void renderPage().catch(() => undefined);
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Document page ${pageNumber}`}
      className="h-auto max-w-full bg-white shadow-[0_2px_12px_rgba(16,35,58,0.14)]"
    />
  );
}

function PdfFullDocumentPreview({ file }: { file: File }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedPdf: PDFDocumentProxy | null = null;

    const loadDocument = async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      loadedPdf = await pdfjsLib.getDocument({ data }).promise;
      if (!cancelled) setPdf(loadedPdf);
    };

    void loadDocument().catch(() => undefined);
    return () => {
      cancelled = true;
      if (loadedPdf) void loadedPdf.destroy();
    };
  }, [file]);

  if (!pdf) {
    return <div className="font-montserrat text-[13px] font-medium text-[#7288A3]">Loading document…</div>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-5">
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPagePreview key={index + 1} pdf={pdf} pageNumber={index + 1} />
      ))}
    </div>
  );
}

interface CreateInvoicePanelProps {
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
  companyId: string;
  companyName?: string;
  company?: Company;
}

export default function CreateInvoicePanel({ onClose, onCreated, companyId, companyName = '', company }: CreateInvoicePanelProps) {
  const [created, setCreated] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [invoiceDetails, setInvoiceDetails] = useState({
    invoiceNumber: '',
    invoiceDate: '',
    payByDate: '',
    language: '',
    currency: '',
    salesTeam: '',
    magazine: '',
    customerManager: '',
    mainAnalyticalAccount: '',
  });
  const [partyDetails, setPartyDetails] = useState({
    seller: '',
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
  });
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<InvoiceAttachment | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<number | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentPreviewUrlsRef = useRef<string[]>([]);
  const attachmentNames = attachments.map(({ file }) => file.name);
  const [note, setNote] = useState('');
  const [counterparties, setCounterparties] = useState<Company[]>(() => loadCounterparties());
  const [personType, setPersonType] = useState<'physical' | 'legal'>('legal');
  const bankAccountOptions = loadCompanyBankAccounts(company);
  const [selectedBankAccount, setSelectedBankAccount] = useState(
    () => bankAccountOptions[0] ?? '',
  );
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(() =>
    loadOrganizationReferenceValues('Base currency'),
  );
  const [taxCountryOptions, setTaxCountryOptions] = useState<string[]>(() =>
    loadOrganizationReferenceValues('Tax country'),
  );
  const [vatCodeOptions, setVatCodeOptions] = useState<string[]>(() =>
    loadVatClassificationTemplateNames(),
  );
  const [expandedSections, setExpandedSections] = useState({
    attachments: false,
    general: false,
    buyer: false,
    seller: false,
    services: false,
    note: false,
  });

  const [services, setServices] = useState<ServiceLine[]>([
    { id: '1', name: '', description: '', quantity: '1', price: '', vatRate: '21' },
  ]);

  useEffect(() => {
    const refreshOrganizationOptions = () => {
      setCurrencyOptions(loadOrganizationReferenceValues('Base currency'));
      setTaxCountryOptions(loadOrganizationReferenceValues('Tax country'));
      setVatCodeOptions(loadVatClassificationTemplateNames());
      setCounterparties(loadCounterparties());
    };
    window.addEventListener('organization-reference-updated', refreshOrganizationOptions);
    window.addEventListener('vat-classifications-updated', refreshOrganizationOptions);
    window.addEventListener('storage', refreshOrganizationOptions);
    window.addEventListener('counterparties-updated', refreshOrganizationOptions);
    return () => {
      window.removeEventListener('organization-reference-updated', refreshOrganizationOptions);
      window.removeEventListener('vat-classifications-updated', refreshOrganizationOptions);
      window.removeEventListener('storage', refreshOrganizationOptions);
      window.removeEventListener('counterparties-updated', refreshOrganizationOptions);
    };
  }, []);

  useEffect(() => {
    return () => {
      attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      attachmentPreviewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const availableAccounts = loadCompanyBankAccounts(company);
    setSelectedBankAccount((current) =>
      availableAccounts.includes(current) ? current : (availableAccounts[0] ?? ''),
    );
  }, [company]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const addService = () => {
    setServices(prev => [...prev, { id: Date.now().toString(), name: '', description: '', quantity: '1', price: '', vatRate: '21' }]);
  };

  const removeService = (id: string) => {
    setServices(prev => prev.filter(s => s.id !== id));
  };

  const updateService = (id: string, field: keyof ServiceLine, value: string) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleAttachmentSelection = (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    const maxSize = 10 * 1024 * 1024;
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];
    const invalidFile = selectedFiles.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      return file.size > maxSize || !allowedExtensions.includes(extension);
    });

    if (invalidFile) {
      setAttachmentError(
        invalidFile.size > maxSize
          ? `${invalidFile.name} exceeds the 10 MB limit.`
          : `${invalidFile.name} has an unsupported file format.`,
      );
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      return;
    }

    setAttachmentError('');
    setAttachments((current) => {
      const next = [...current];
      selectedFiles.forEach((file) => {
        const duplicate = next.some(
          ({ file: existing }) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        );
        if (!duplicate) {
          const previewUrl = URL.createObjectURL(file);
          attachmentPreviewUrlsRef.current.push(previewUrl);
          next.push({ file, previewUrl });
        }
      });
      return next;
    });
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => {
      const removed = current[index];
      if (removed) {
        if (previewAttachment?.previewUrl === removed.previewUrl) setPreviewAttachment(null);
        URL.revokeObjectURL(removed.previewUrl);
        attachmentPreviewUrlsRef.current = attachmentPreviewUrlsRef.current.filter(
          (url) => url !== removed.previewUrl,
        );
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setAttachmentError('');
  };

  const updateCounterpartyTitle = (value: string) => {
    const exactMatch = counterparties.find((counterparty) => counterparty.name.toLowerCase() === value.trim().toLowerCase());
    if (exactMatch) {
      selectCounterpartyRecord(exactMatch, setPartyDetails, setPersonType);
      return;
    }
    setPartyDetails((current) => {
      const wasExisting = counterparties.some((counterparty) => counterparty.name === current.title);
      return wasExisting
        ? { ...current, title: value, country: '', city: '', address: '', postalCode: '', code: '', vatCode: '', phone: '', email: '', countryOfSale: '' }
        : { ...current, title: value };
    });
  };

  const handleCreateInvoice = async () => {
    if (!requiredFieldsCompleted || saving) return;
    setSaving(true);
    setSaveError('');

    const normalizedTitle = partyDetails.title.trim().toLowerCase();
    const exists = counterparties.some((counterparty) => counterparty.name.trim().toLowerCase() === normalizedTitle);
    if (partyDetails.title.trim() && !exists) {
      const now = new Date().toISOString();
      const counterparty: Company = {
        id: `counterparty-${Date.now()}`,
        name: partyDetails.title.trim(),
        company_code: partyDetails.code.trim(),
        vat_code: partyDetails.vatCode.trim(),
        client_since: new Date().getFullYear(),
        action_required: 0,
        country: partyDetails.country,
        address: partyDetails.address.trim(),
        phone: partyDetails.phone.trim(),
        email: partyDetails.email.trim(),
        legal_form: personType === 'legal' ? 'Legal entity' : 'Physical person',
        counterparty_country: partyDetails.country,
        counterparty_legal_status: personType === 'legal' ? 'Legal entity' : 'Physical person',
        counterparty_kind: 'Buyer',
        counterparty_vat_classification: partyDetails.vatCode,
        counterparty_notes: '',
        counterparty_bank_accounts: '[]',
        counterparty_created_by: 'Current user',
        counterparty_created_at: now,
        counterparty_activity_log: JSON.stringify([{ date: now, user: 'Current user', action: 'Counterparty created from invoice' }]),
      };
      const next = [...counterparties, counterparty];
      window.localStorage.setItem(COUNTERPARTIES_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('counterparties-updated'));
      setCounterparties(next);
    }

    const storedServices = services.map((service, index) => {
      const lineAmount = (Number(service.quantity) || 0) * (Number(service.price) || 0);
      const lineVat = lineAmount * ((Number(service.vatRate) || 0) / 100);
      return {
        id: service.id || crypto.randomUUID(),
        barcode: '',
        systemId: `${Date.now()}-${index + 1}`,
        product: service.name,
        productGroup: '',
        unit: 'vnt',
        qty: service.quantity || '1',
        code: '',
        price: service.price,
        subtotal: lineAmount.toFixed(2),
        discount: '0.00',
        vat: lineVat.toFixed(2),
        vatPct: service.vatRate ? `${service.vatRate}%` : '',
        total: (lineAmount + lineVat).toFixed(2),
        department: '',
        object: '',
        series: '',
        center: '',
        expense: invoiceDetails.mainAnalyticalAccount,
        vatClass: '',
      };
    });
    const vatRates = [...new Set(services.map((service) => service.vatRate).filter(Boolean))];
    const createdBy = getCurrentUserName();
    const uploadedAttachments: Array<{
      name: string;
      type: string;
      size: number;
      url: string;
    }> = [];

    for (const [index, attachment] of attachments.entries()) {
      const { file } = attachment;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${companyId}/invoices/${Date.now()}-${index + 1}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('invoice-attachments')
        .upload(path, file);
      if (uploadError) {
        setSaving(false);
        setSaveError(`Attachment ${file.name} could not be uploaded: ${uploadError.message}`);
        return;
      }
      const { data: publicData } = supabase.storage
        .from('invoice-attachments')
        .getPublicUrl(path);
      uploadedAttachments.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        url: publicData.publicUrl,
      });
    }

    const { data, error } = await supabase.from('documents').insert({
      company_id: companyId,
      status: 'Draft',
      receive_date: invoiceDetails.invoiceDate || null,
      client_counterparty: partyDetails.title,
      document_type: 'VAT invoice',
      source: 'Manual',
      total_amount: (amount + vat).toFixed(2),
      due_end_date: invoiceDetails.payByDate || null,
      file_case: attachmentNames[0] ?? '',
      order_no: '',
      number: invoiceDetails.invoiceNumber,
      type: 'Income',
      document_date: invoiceDetails.invoiceDate || null,
      document_purpose: services.map((service) => service.name).filter(Boolean).join(', '),
      invoice_contract_date: invoiceDetails.invoiceDate || null,
      operation_date: invoiceDetails.invoiceDate || null,
      expense_account: invoiceDetails.mainAnalyticalAccount,
      vat_classifier: '',
      currency: invoiceDetails.currency,
      amount_without_vat: amount.toFixed(2),
      vat: vat.toFixed(2),
      vat_percent: vatRates.length === 1 ? `${vatRates[0]}%` : '',
      department_code: '',
      object_project: '',
      valid_form: invoiceDetails.language,
      accountable_responsible: createdBy,
      cost_center: '',
      series: invoiceDetails.magazine,
      image_url: uploadedAttachments[0]?.url || null,
      invoice_attachments: uploadedAttachments,
      created_by: createdBy,
      line_items: storedServices,
      summary_line_items: [],
      notes: note,
      invoice_sales_team: invoiceDetails.salesTeam,
      invoice_customer_manager: invoiceDetails.customerManager,
      buyer_country: partyDetails.country,
      buyer_city: partyDetails.city,
      buyer_address: partyDetails.address,
      buyer_postal_code: partyDetails.postalCode,
      buyer_code: partyDetails.code,
      buyer_vat_code: partyDetails.vatCode,
      buyer_phone: partyDetails.phone,
      buyer_email: partyDetails.email,
      buyer_country_of_sale: partyDetails.countryOfSale,
    });

    if (error) {
      setSaving(false);
      setSaveError(error.message);
      return;
    }

    setCreatedAt(new Date().toISOString());

    const savedDocumentId = String(data?.[0]?.id ?? '');
    if (savedDocumentId) {
      await supabase.from('document_history').insert({
        document_id: savedDocumentId,
        action: 'Create',
        user_name: createdBy,
        details: 'VAT invoice created manually',
      });
    }
    await onCreated?.();
    setSaving(false);
    setCreated(true);
  };

  const amount = services.reduce(
    (sum, service) =>
      sum + (Number(service.quantity) || 0) * (Number(service.price) || 0),
    0,
  );
  const vat = services.reduce((sum, service) => {
    const lineAmount =
      (Number(service.quantity) || 0) * (Number(service.price) || 0);
    return sum + lineAmount * ((Number(service.vatRate) || 0) / 100);
  }, 0);

  const requiredFieldsCompleted = Boolean(
    invoiceDetails.language.trim() &&
      invoiceDetails.currency.trim() &&
      invoiceDetails.magazine.trim(),
  );

  if (created) {
    return (
      <CreatedInvoiceView
        organizationId={companyId}
        companyName={companyName}
        organizationEmail={company?.email}
        organizationCompany={company}
        sellerCompany={company}
        sellerBankAccount={selectedBankAccount}
        invoiceDetails={invoiceDetails}
        receiveDate={createdAt}
        partyDetails={partyDetails}
        personType={personType}
        attachmentNames={attachmentNames}
        note={note}
        services={services}
        amount={amount}
        vat={vat}
        onBack={onClose}
      />
    );
  }

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex max-w-full">
      <div
        className="flex h-full w-[720px] max-w-[100vw] flex-col gap-px bg-[#D3E1EC]"
        style={{ boxShadow: '-2px 0 0 #E5EDF9' }}
      >
        <div className="flex h-20 flex-shrink-0 items-center justify-between bg-white px-6">
          <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
            Create VAT invoice
          </h2>
          <button
            type="button"
            aria-label="Close Create VAT invoice"
            onClick={onClose}
            className="flex h-8 w-6 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]"
          >
            <X size={24} strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="flex flex-col gap-px bg-[#D3E1EC]">
            <CollapsibleSection
              title="Attachments"
              expanded={expandedSections.attachments}
              onToggle={() => toggleSection('attachments')}
            >
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#A1B6C6] bg-[#F8FDFF] text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]">
                <Paperclip size={18} />
                <span className="font-montserrat text-[12px] font-medium">Add invoice attachments</span>
                <span className="font-montserrat text-[10px] font-medium text-[#A1B6C6]">PDF, image, Word or Excel · up to 10 MB</span>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => handleAttachmentSelection(event.target.files)}
                />
              </label>
              {attachments.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {attachments.map(({ file, previewUrl }, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex min-h-[112px] items-center gap-3 rounded-lg border border-[#D3E1EC] bg-white p-3"
                    >
                      <button
                        type="button"
                        aria-label={`Open full preview of ${file.name}`}
                        onClick={() => setPreviewAttachment({ file, previewUrl })}
                        className="flex h-[104px] w-[84px] flex-shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-[#D3E1EC] bg-[#F8FDFF] transition-colors hover:border-[#007EA7] focus:outline-none focus:ring-2 focus:ring-[#007EA7]/20"
                      >
                        {file.type.startsWith('image/') ? (
                          <img
                            src={previewUrl}
                            alt={`Preview of ${file.name}`}
                            className="h-full w-full object-contain"
                          />
                        ) : file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
                          <PdfAttachmentPreview file={file} />
                        ) : (
                          <FileText size={28} className="text-[#007EA7]" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-montserrat text-[12px] font-medium text-[#10233A]">{file.name}</div>
                        <div className="font-montserrat text-[10px] font-medium text-[#A1B6C6]">{formatFileSize(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove attachment ${file.name}`}
                        onClick={() => setAttachmentToDelete(index)}
                        className="flex h-7 w-7 items-center justify-center rounded text-[#7288A3] transition-colors hover:bg-[#FFF1F1] hover:text-[#D90310]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && (
                <p className="mt-2 font-montserrat text-[11px] font-medium text-[#D90310]">{attachmentError}</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Invoice details"
              expanded={expandedSections.general}
              onToggle={() => toggleSection('general')}
            >
              <div className="flex w-full flex-col gap-4">
                <div className="flex h-[18px] items-center pl-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                  <span className="w-[200px] flex-shrink-0">Parameter</span>
                  <span>Value</span>
                </div>
                <div className="flex w-full flex-col">
                  <InvoiceDetailRow label="Invoice Nr." placeholder="Enter invoice number" value={invoiceDetails.invoiceNumber} onChange={(value) => setInvoiceDetails((current) => ({ ...current, invoiceNumber: value }))} shaded />
                  <InvoiceDetailRow label="Invoice date" type="date" value={invoiceDetails.invoiceDate} onChange={(value) => setInvoiceDetails((current) => ({ ...current, invoiceDate: value }))} />
                  <InvoiceDetailRow label="Pay by date" type="date" value={invoiceDetails.payByDate} onChange={(value) => setInvoiceDetails((current) => ({ ...current, payByDate: value }))} shaded />
                  <InvoiceDetailRow label="Language" options={['English', 'Lithuanian']} value={invoiceDetails.language} onChange={(value) => setInvoiceDetails((current) => ({ ...current, language: value }))} required />
                  <InvoiceDetailRow label="Currency" options={currencyOptions} value={invoiceDetails.currency} onChange={(value) => setInvoiceDetails((current) => ({ ...current, currency: value }))} required shaded />
                  <InvoiceDetailRow label="Sales team" options={['Sales team 1', 'Sales team 2']} value={invoiceDetails.salesTeam} onChange={(value) => setInvoiceDetails((current) => ({ ...current, salesTeam: value }))} />
                  <InvoiceDetailRow label="Magazine" options={['Main magazine', 'Sales magazine']} value={invoiceDetails.magazine} onChange={(value) => setInvoiceDetails((current) => ({ ...current, magazine: value }))} required shaded />
                  <InvoiceDetailRow label="Customre Manager" options={['Not assigned', 'Account manager']} value={invoiceDetails.customerManager} onChange={(value) => setInvoiceDetails((current) => ({ ...current, customerManager: value }))} />
                  <InvoiceDetailRow label="Main analytical account" options={['Not selected', 'Sales']} value={invoiceDetails.mainAnalyticalAccount} onChange={(value) => setInvoiceDetails((current) => ({ ...current, mainAnalyticalAccount: value }))} shaded />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Seller information" expanded={expandedSections.seller} onToggle={() => toggleSection('seller')}>
              <div className="flex w-full flex-col gap-4">
                <div className="flex h-[18px] w-[274px] items-center gap-[2px] pl-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                  <span className="w-[207px] flex-shrink-0">Parameter</span>
                  <span>Value</span>
                </div>
                <div className="flex w-full flex-col">
                  <InvoiceDetailRow
                    label="Bank account"
                    placeholder={bankAccountOptions.length ? 'Select bank account' : 'No bank accounts'}
                    options={bankAccountOptions}
                    value={selectedBankAccount}
                    onChange={setSelectedBankAccount}
                    shaded
                    compactSeller
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Buyer information" expanded={expandedSections.buyer} onToggle={() => toggleSection('buyer')}>
              <div className="flex w-full flex-col gap-4">
                <div className="flex h-[18px] items-center pl-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                  <span className="w-[200px] flex-shrink-0">Parameter</span>
                  <span>Value</span>
                </div>
                <div className="flex w-full flex-col">
                  <div className="flex h-9 w-full items-center rounded-lg bg-[#F8FDFF] px-3 font-montserrat text-[12px] leading-[18px]">
                    <span className="w-[200px] flex-shrink-0 font-normal text-[#10233A]">
                      Physical / Legal person
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-6">
                      {(['physical', 'legal'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setPersonType(type)}
                          className="flex items-center gap-2"
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${personType === type ? 'border-[#007EA7]' : 'border-[#A1B6C6]'}`}>
                            {personType === type && <span className="h-2 w-2 rounded-full bg-[#007EA7]" />}
                          </span>
                          <span className="font-montserrat text-[12px] font-medium capitalize text-[#10233A]">
                            {type}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <CounterpartyTitleField
                    value={partyDetails.title}
                    counterparties={counterparties}
                    onChange={updateCounterpartyTitle}
                    onSelect={(counterparty) => selectCounterpartyRecord(counterparty, setPartyDetails, setPersonType)}
                  />
                  <InvoiceDetailRow
                    label="Country"
                    placeholder="Select country"
                    options={taxCountryOptions}
                    value={partyDetails.country}
                    onChange={(value) => setPartyDetails((current) => ({ ...current, country: value }))}
                    shaded
                  />
                  <InvoiceDetailRow label="City" placeholder="Enter city" value={partyDetails.city} onChange={(value) => setPartyDetails((current) => ({ ...current, city: value }))} />
                  <InvoiceDetailRow label="Address" placeholder="Enter address" value={partyDetails.address} onChange={(value) => setPartyDetails((current) => ({ ...current, address: value }))} shaded />
                  <InvoiceDetailRow label="Postal code" placeholder="Enter postal code" value={partyDetails.postalCode} onChange={(value) => setPartyDetails((current) => ({ ...current, postalCode: value }))} />
                  <InvoiceDetailRow label="Code" placeholder="Enter code" value={partyDetails.code} onChange={(value) => setPartyDetails((current) => ({ ...current, code: value }))} shaded />
                  <InvoiceDetailRow
                    label="VAT code"
                    placeholder="Select VAT code"
                    options={vatCodeOptions}
                    value={partyDetails.vatCode}
                    onChange={(value) => setPartyDetails((current) => ({ ...current, vatCode: value }))}
                  />
                  <InvoiceDetailRow label="Phone" placeholder="Enter phone" type="tel" value={partyDetails.phone} onChange={(value) => setPartyDetails((current) => ({ ...current, phone: value }))} shaded />
                  <InvoiceDetailRow label="Email" placeholder="Enter email" type="email" value={partyDetails.email} onChange={(value) => setPartyDetails((current) => ({ ...current, email: value }))} />
                  <InvoiceDetailRow
                    label="Country of sale"
                    placeholder="Select country of sale"
                    options={taxCountryOptions}
                    value={partyDetails.countryOfSale}
                    onChange={(value) => setPartyDetails((current) => ({ ...current, countryOfSale: value }))}
                    shaded
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Services" expanded={expandedSections.services} onToggle={() => toggleSection('services')}>
              <div className="flex w-full flex-col gap-2">
                <div className="flex flex-col gap-4">
                  <div className="grid h-[18px] grid-cols-[125px_109px_60px_80px_60px_108px_80px] items-center gap-[2px] pl-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                    <span>Srvice name</span>
                    <span>Description</span>
                    <span>Quantity</span>
                    <span>Price</span>
                    <span>VAT rate</span>
                    <span>VAT</span>
                    <span>Amount</span>
                  </div>
                  <div className="flex flex-col">
                    {services.map((service, index) => {
                      const lineAmount = (Number(service.quantity) || 0) * (Number(service.price) || 0);
                      const lineVat = lineAmount * ((Number(service.vatRate) || 0) / 100);
                      return (
                        <div
                          key={service.id}
                          className={`grid h-9 grid-cols-[125px_109px_60px_80px_60px_108px_80px_26px] items-center gap-[2px] rounded-lg px-[5px] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}
                        >
                          <CompactSystemServiceSelect
                            value={service.name}
                            placeholder="Select service"
                            options={['Service', 'Product']}
                            onChange={(value) => updateService(service.id, 'name', value)}
                          />
                          <CompactServiceInput
                            value={service.description}
                            placeholder="Description"
                            expandWhenLong
                            onChange={(value) => updateService(service.id, 'description', value)}
                          />
                          <CompactServiceInput value={service.quantity} placeholder="0" onChange={(value) => updateService(service.id, 'quantity', value)} />
                          <CompactServiceInput value={service.price} placeholder="0.00" onChange={(value) => updateService(service.id, 'price', value)} />
                          <CompactSystemServiceSelect
                            value={service.vatRate}
                            placeholder="VAT"
                            options={['0', '9', '21']}
                            onChange={(value) => updateService(service.id, 'vatRate', value)}
                          />
                          <CompactServiceValue value={`€${lineVat.toFixed(2)}`} />
                          <CompactServiceValue value={`€${lineAmount.toFixed(2)}`} />
                          <button
                            type="button"
                            aria-label={`Delete service ${index + 1}`}
                            onClick={() => removeService(service.id)}
                            className="flex h-[26px] w-[26px] items-center justify-center rounded text-[#7288A3] transition-colors hover:bg-[#E5EDF9] hover:text-[#007EA7]"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex min-h-[104px] items-start justify-between gap-6">
                  <button type="button" onClick={addService} className="flex h-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-semibold leading-4 text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]">
                    Add service
                  </button>
                  <div className="flex w-[168px] flex-col items-end gap-2">
                    <div className="flex w-full flex-col gap-0.5">
                      <CompactTotal label="Amount" value={amount} />
                      <CompactTotal label="VAT" value={vat} />
                    </div>
                    <CompactTotal label="Total to pay" value={amount + vat} strong />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Note" expanded={expandedSections.note} onToggle={() => toggleSection('note')}>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add invoice note..." rows={4} className="w-full resize-none rounded-lg border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
            </CollapsibleSection>
          </div>
        </div>

        <div className="flex h-[148px] flex-shrink-0 flex-col gap-4 bg-white p-6">
          {saveError && (
            <p className="font-montserrat text-[12px] font-medium text-[#D90310]">{saveError}</p>
          )}
          <button
            type="button"
            disabled={!requiredFieldsCompleted || saving}
            onClick={() => void handleCreateInvoice()}
            className={`flex h-[42px] w-full items-center justify-center rounded-lg font-montserrat text-[16px] font-semibold transition-colors ${requiredFieldsCompleted && !saving ? 'bg-[#007EA7] text-white hover:bg-[#006B8E]' : 'cursor-not-allowed bg-[#F5F5F5] text-[#B4B6B8]'}`}
          >
            {saving ? 'Saving...' : 'Create invoice'}
          </button>
          <button type="button" onClick={onClose} className="flex h-[42px] w-full items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold text-[#7288A3] hover:bg-[#F8FDFF]">
            Cancel
          </button>
        </div>
      </div>
      {previewAttachment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Document preview ${previewAttachment.file.name}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/55 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewAttachment(null);
          }}
        >
          <div className="flex h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_70px_rgba(16,35,58,0.28)]">
            <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#D3E1EC] px-6">
              <div className="min-w-0">
                <h3 className="truncate font-montserrat text-[16px] font-semibold text-[#10233A]">{previewAttachment.file.name}</h3>
                <p className="font-montserrat text-[11px] font-medium text-[#A1B6C6]">{formatFileSize(previewAttachment.file.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAttachment.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center justify-center rounded-lg border border-[#D3E1EC] px-4 font-montserrat text-[12px] font-semibold text-[#7288A3] transition-colors hover:bg-[#F8FDFF]"
                >
                  Open document
                </a>
                <button
                  type="button"
                  aria-label="Close document preview"
                  onClick={() => setPreviewAttachment(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#7288A3] transition-colors hover:bg-[#F8FDFF] hover:text-[#10233A]"
                >
                  <X size={22} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#EEF4F8] p-6">
              {previewAttachment.file.type.startsWith('image/') ? (
                <img
                  src={previewAttachment.previewUrl}
                  alt={`Full preview of ${previewAttachment.file.name}`}
                  className="mx-auto h-auto max-h-full max-w-full bg-white object-contain shadow-[0_2px_12px_rgba(16,35,58,0.14)]"
                />
              ) : previewAttachment.file.type === 'application/pdf' || previewAttachment.file.name.toLowerCase().endsWith('.pdf') ? (
                <PdfFullDocumentPreview file={previewAttachment.file} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <FileText size={48} className="text-[#007EA7]" />
                  <p className="font-montserrat text-[13px] font-medium text-[#7288A3]">Use “Open document” to view this file format.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {attachmentToDelete !== null && attachments[attachmentToDelete] && (
        <div
          className="fixed inset-0 z-[120] bg-[#10233A]/20"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAttachmentToDelete(null);
          }}
        >
          <aside
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-attachment-title"
            aria-describedby="delete-attachment-description"
            className="absolute inset-y-0 right-0 flex w-[340px] max-w-full flex-col gap-6 bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
          >
            <div className="flex h-8 w-full items-start justify-between gap-2">
              <h3 id="delete-attachment-title" className="min-w-0 flex-1 font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                Delete attachment
              </h3>
              <button
                type="button"
                aria-label="Close delete attachment warning"
                onClick={() => setAttachmentToDelete(null)}
                className="flex h-8 w-6 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]"
              >
                <X size={24} strokeWidth={1.8} />
              </button>
            </div>

            <p id="delete-attachment-description" className="font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">
              Are you sure that you want to delete attachment “{attachments[attachmentToDelete].file.name}”?
            </p>

            <div className="flex h-[42px] w-full items-start gap-4">
              <button
                type="button"
                onClick={() => setAttachmentToDelete(null)}
                className="flex h-[42px] flex-1 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] transition-colors hover:bg-[#F8FDFF]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  removeAttachment(attachmentToDelete);
                  setAttachmentToDelete(null);
                }}
                className="flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#FF6200] px-4 font-montserrat text-[16px] font-semibold text-white transition-colors hover:bg-[#E45800]"
              >
                Delete
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

type PartyDetails = {
  seller: string;
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

function selectCounterpartyRecord(
  counterparty: Company,
  setPartyDetails: React.Dispatch<React.SetStateAction<PartyDetails>>,
  setPersonType: React.Dispatch<React.SetStateAction<'physical' | 'legal'>>,
) {
  const legalStatus = (counterparty.counterparty_legal_status ?? counterparty.legal_form ?? '').toLowerCase();
  setPersonType(legalStatus.includes('physical') || legalStatus.includes('individual') ? 'physical' : 'legal');
  setPartyDetails((current) => ({
    ...current,
    title: counterparty.name ?? '',
    country: counterparty.counterparty_country ?? counterparty.country ?? '',
    city: '',
    address: counterparty.address ?? '',
    postalCode: '',
    code: counterparty.company_code ?? '',
    vatCode: counterparty.counterparty_vat_classification ?? counterparty.vat_code ?? '',
    phone: counterparty.phone ?? '',
    email: counterparty.email ?? '',
    countryOfSale: counterparty.counterparty_country ?? counterparty.country ?? '',
  }));
}

export interface CreatedInvoiceViewProps {
  organizationId?: string;
  companyName: string;
  organizationEmail?: string;
  organizationCompany?: Company;
  sellerCompany?: Company;
  sellerDetails?: Partial<InvoicePreviewPartyDetails>;
  sellerBankAccount: string;
  invoiceDetails: InvoicePreviewDetails;
  receiveDate: string;
  partyDetails: InvoicePreviewPartyDetails;
  personType: 'physical' | 'legal';
  attachmentNames: string[];
  note: string;
  services: InvoicePreviewServiceLine[];
  amount: number;
  vat: number;
  onBack: () => void;
  onStartChat?: (context: InvoiceChatContext) => void;
  initialReceivedMessage?: Omit<InvoiceChatMessage, 'id' | 'direction'>;
}

export function CreatedInvoiceView({
  organizationId,
  companyName,
  organizationEmail,
  organizationCompany,
  sellerCompany,
  sellerDetails,
  sellerBankAccount,
  invoiceDetails,
  receiveDate,
  partyDetails,
  personType,
  attachmentNames,
  note,
  services,
  amount,
  vat,
  onBack,
  onStartChat,
  initialReceivedMessage,
}: CreatedInvoiceViewProps) {
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const visibleServices = services.filter(
    (service) => service.name || service.description || Number(service.price),
  );
  const normalizedCompanyName = companyName.trim().toLocaleLowerCase();
  const buyerIsOrganization = partyDetails.title.trim().toLocaleLowerCase() === normalizedCompanyName;
  const emailCounterparty = buyerIsOrganization
    ? sellerDetails
    : partyDetails;
  const chatStorageKey = `${companyName}:${invoiceDetails.invoiceNumber || 'invoice'}`;
  const chatContext = useMemo<InvoiceChatContext>(() => ({
      storageKey: chatStorageKey,
      title: `${companyName} / ${invoiceDetails.invoiceNumber || 'Invoice'}`,
      companyName,
      subject: invoiceDetails.invoiceNumber || 'Invoice',
      sourceType: 'Document',
    }),
    [chatStorageKey, companyName, invoiceDetails.invoiceNumber],
  );

  useEffect(() => {
    if (initialReceivedMessage?.text) registerChatConversation(chatContext);
  }, [chatContext, initialReceivedMessage?.text]);

  return (
    <div className="absolute inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-white">
      <div ref={pageScrollRef} className="scrollbar-hide min-h-0 flex-1 overflow-auto px-6 py-10 sm:px-10 lg:px-[72px] lg:py-14">
        <div className="mx-auto flex w-full min-w-[1240px] max-w-[1440px] flex-col gap-8">
        <header>
          <div className="flex min-h-[46px] items-start justify-between gap-6">
            <div className="flex min-w-0 items-center gap-5">
              <button type="button" aria-label="Back to invoices" onClick={onBack} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[#7288A3] transition-colors hover:bg-[#F8FDFF] hover:text-[#007EA7]">
                <ArrowLeft size={28} strokeWidth={1.7} />
              </button>
              <h1 className="truncate font-montserrat text-[36px] font-semibold leading-[44px] text-[#10233A]">{invoiceDetails.invoiceNumber || 'Invoice'}</h1>
            </div>

            <div className="flex h-8 flex-shrink-0 items-start justify-end gap-2">
              <PageActionButton onClick={() => setSendOpen(true)}>Send to</PageActionButton>
              <PageActionButton onClick={() => setPreviewOpen(true)}>Preview invoice</PageActionButton>
              <PageActionButton
                onClick={() =>
                  onStartChat?.(chatContext)
                }
              >
                Start chat
              </PageActionButton>
            </div>
          </div>
          <div className="mt-3 font-montserrat text-[13px] font-medium text-[#7288A3]">
            Companies&nbsp;&nbsp;/&nbsp;&nbsp;{companyName || 'Company'}&nbsp;&nbsp;/&nbsp;&nbsp;Invoices&nbsp;&nbsp;/&nbsp;&nbsp;{invoiceDetails.invoiceNumber || 'Invoice'}
          </div>
        </header>

        <div className="grid min-w-0 grid-cols-[550px_minmax(0,1fr)] items-start gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            <CreatedInfoSection title="Invoice information">
              <CreatedInfoRow label="Invoice Nr." value={invoiceDetails.invoiceNumber} shaded />
              <CreatedInfoRow label="Invoice date" value={formatCreatedDate(invoiceDetails.invoiceDate)} />
              <CreatedInfoRow label="Receive date" value={formatCreatedTimestamp(receiveDate)} shaded />
              <CreatedInfoRow label="Pay by date" value={formatCreatedDate(invoiceDetails.payByDate)} />
              <CreatedInfoRow label="Language" value={invoiceDetails.language} shaded />
              <CreatedInfoRow label="Currency" value={invoiceDetails.currency} />
              <CreatedInfoRow label="Sales team" value={invoiceDetails.salesTeam} shaded />
              <CreatedInfoRow label="Magazine" value={invoiceDetails.magazine} />
              <CreatedInfoRow label="Customer Manager" value={invoiceDetails.customerManager} shaded />
              <CreatedInfoRow label="Main analytical account" value={invoiceDetails.mainAnalyticalAccount} />
            </CreatedInfoSection>

            <CreatedInfoSection title="Buyer information">
              <CreatedInfoRow label="Physical / Legal person" value={personType === 'legal' ? 'Legal' : 'Physical'} shaded />
              <CreatedInfoRow label="Title" value={partyDetails.title} />
              <CreatedInfoRow label="Country" value={partyDetails.country} shaded />
              <CreatedInfoRow label="City" value={partyDetails.city} />
              <CreatedInfoRow label="Address" value={partyDetails.address} shaded />
              <CreatedInfoRow label="Postal code" value={partyDetails.postalCode} />
              <CreatedInfoRow label="Code" value={partyDetails.code} shaded />
              <CreatedInfoRow label="VAT code" value={partyDetails.vatCode} />
              <CreatedInfoRow label="Phone" value={partyDetails.phone} shaded />
              <CreatedInfoRow label="Email" value={partyDetails.email} />
              <CreatedInfoRow label="Country of sale" value={partyDetails.countryOfSale} shaded />
            </CreatedInfoSection>

            <CreatedInfoSection title="Seller information">
              <CreatedInfoRow label="Title" value={sellerDetails?.title ?? sellerCompany?.name ?? companyName} shaded />
              <CreatedInfoRow label="Bank account" value={sellerBankAccount} />
              <CreatedInfoRow label="Country" value={sellerDetails?.country ?? sellerCompany?.tax_country ?? sellerCompany?.country} shaded />
              <CreatedInfoRow label="City" value={sellerDetails?.city} />
              <CreatedInfoRow label="Address" value={sellerDetails?.address ?? sellerCompany?.address} shaded />
              <CreatedInfoRow label="Postal code" value={sellerDetails?.postalCode} />
              <CreatedInfoRow label="Code" value={sellerDetails?.code ?? sellerCompany?.company_code} shaded />
              <CreatedInfoRow label="VAT code" value={sellerDetails?.vatCode ?? sellerCompany?.vat_code} />
              <CreatedInfoRow label="Phone" value={sellerDetails?.phone ?? sellerCompany?.phone} shaded />
              <CreatedInfoRow label="Email" value={sellerDetails?.email ?? sellerCompany?.email} />
              <CreatedInfoRow label="Country of sale" value={sellerDetails?.countryOfSale ?? sellerCompany?.tax_country ?? sellerCompany?.country} shaded />
            </CreatedInfoSection>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="overflow-hidden rounded-xl border border-[#D3E1EC] bg-white">
              <div className="flex min-h-[72px] items-center border-b border-[#E5EDF9] px-6">
                <h2 className="font-montserrat text-[20px] font-semibold text-[#10233A]">Services</h2>
              </div>
              <div className="p-6">
                <div className="min-w-[690px]">
                  <div className="grid grid-cols-[150px_1fr_80px_100px_90px_110px] gap-3 px-3 pb-3 font-montserrat text-[12px] font-medium text-[#7288A3]">
                    <span>Service name</span><span>Description</span><span>Quantity</span><span>Price</span><span>VAT</span><span>Amount</span>
                  </div>
                  {visibleServices.map((service, index) => {
                    const lineAmount = (Number(service.quantity) || 0) * (Number(service.price) || 0);
                    const lineVat = lineAmount * ((Number(service.vatRate) || 0) / 100);
                    return (
                      <div key={service.id} className={`grid min-h-11 grid-cols-[150px_1fr_80px_100px_90px_110px] items-center gap-3 rounded-lg px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                        <span>{service.name || '—'}</span>
                        <span>{service.description || '—'}</span>
                        <span>{service.quantity || '—'}</span>
                        <span>{formatMoney(Number(service.price) || 0)}</span>
                        <span>{service.vatRate || '0'}% ({formatMoney(lineVat)})</span>
                        <span>{formatMoney(lineAmount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end border-t border-[#E5EDF9] px-6 py-5">
                <div className="w-[230px] space-y-2 font-montserrat text-[13px] text-[#10233A]">
                  <CreatedTotal label="Amount" value={amount} />
                  <CreatedTotal label="VAT" value={vat} />
                  <CreatedTotal label="Total to pay" value={amount + vat} strong />
                </div>
              </div>
            </section>

            <InvoiceChatSection
              storageKey={chatStorageKey}
              initialReceivedMessage={initialReceivedMessage}
            />
            <CreatedContentSection title="Attachments" content={attachmentNames.join(', ')} />
            <CreatedContentSection title="Notes" content={note} />
          </div>
        </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={pageScrollRef} className="max-w-none px-6 sm:px-10 lg:px-[72px]" />
      {previewOpen && (
        <InvoicePaymentPreviewPanel
          invoiceNumber={invoiceDetails.invoiceNumber || 'Invoice'}
          total={amount + vat}
          currency={invoiceDetails.currency || 'EUR'}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {sendOpen && (
        <SendInvoicePanel
          invoice={{
            id: invoiceDetails.invoiceNumber || crypto.randomUUID(),
            number: invoiceDetails.invoiceNumber || 'Invoice',
            buyer: partyDetails.title,
            totalAmount: amount + vat,
            currency: invoiceDetails.currency || 'EUR',
          }}
          organizationId={organizationId}
          senderName={companyName}
          senderEmail={organizationEmail}
          senderDetails={{
            name: organizationCompany?.name || companyName,
            companyCode: organizationCompany?.company_code,
            vatCode: organizationCompany?.vat_code,
            address: organizationCompany?.address,
            email: organizationCompany?.email || organizationEmail,
            phone: organizationCompany?.phone,
          }}
          recipientName={emailCounterparty?.title || 'Counterparty'}
          recipientEmail={emailCounterparty?.email || ''}
          recipientDetails={{
            name: emailCounterparty?.title || 'Counterparty',
            companyCode: emailCounterparty?.code,
            vatCode: emailCounterparty?.vatCode,
            address: emailCounterparty?.address,
            email: emailCounterparty?.email,
            phone: emailCounterparty?.phone,
          }}
          reconciliationDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  );
}

export function InvoicePaymentPreviewPanel({
  invoiceNumber,
  total,
  currency,
  onClose,
}: {
  invoiceNumber: string;
  total: number;
  currency: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="absolute inset-0 z-[100] flex justify-end bg-transparent" onClick={onClose}>
      <aside
        aria-label="Preview invoice"
        className="flex h-full w-[340px] flex-shrink-0 flex-col items-start gap-6 bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-8 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
            Preview invoice
          </h2>
          <button
            type="button"
            aria-label="Close Preview invoice"
            onClick={onClose}
            className="flex h-8 w-6 items-center justify-center py-1 text-[#7288A3] transition-colors hover:text-[#10233A]"
          >
            <X size={24} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full flex-col items-center justify-center gap-2 text-center">
            <div className="w-full font-montserrat text-[36px] font-bold leading-[46px] text-[#FF6200]">
              {total.toFixed(2)} {currency}
            </div>
            <p className="w-full font-montserrat text-[16px] font-medium leading-6 text-[#10233A]">
              Payment link for invoice {invoiceNumber}
            </p>
          </div>

          <PaymentQrPreview value={`${invoiceNumber}:${total.toFixed(2)}:${currency}`} />

          <div className="flex h-[200px] w-full flex-col items-end gap-6 rounded-lg bg-[#F2F5F9] p-3">
            <div className="flex w-full flex-col items-start gap-4">
              <h3 className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">
                Send payment link
              </h3>
              <label className="flex w-full flex-col items-start gap-2">
                <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSent(false);
                  }}
                  placeholder="Enter email address"
                  className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!validEmail}
              onClick={() => setSent(true)}
              className={`flex h-[42px] w-full items-center justify-center rounded-lg border-2 px-4 font-montserrat text-[16px] font-semibold leading-6 transition-colors ${
                validEmail
                  ? 'border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]'
                  : 'cursor-not-allowed border-[#E5EDF9] bg-[#F7F7F7] text-[#B4B6B8]'
              }`}
            >
              {sent ? 'Sent' : 'Send'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PaymentQrPreview({ value }: { value: string }) {
  const size = 21;
  const seed = Array.from(value).reduce(
    (sum, character, index) => sum + character.charCodeAt(0) * (index + 3),
    0,
  );
  const finderCell = (row: number, column: number, top: number, left: number) => {
    const y = row - top;
    const x = column - left;
    if (x < 0 || y < 0 || x > 6 || y > 6) return false;
    return x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
  };
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    const finder =
      finderCell(row, column, 0, 0) ||
      finderCell(row, column, 0, size - 7) ||
      finderCell(row, column, size - 7, 0);
    const data = ((row * 17 + column * 31 + seed + row * column * 7) % 11) < 5;
    return finder || data;
  });

  return (
    <div
      aria-label={`Payment QR code for ${value.split(':')[0]}`}
      className="grid h-[200px] w-[200px] flex-shrink-0 rounded-[10px] border border-[#D3E1EC] bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {cells.map((filled, index) => (
        <span key={index} className={filled ? 'bg-[#10233A]' : 'bg-white'} />
      ))}
    </div>
  );
}

function CreatedInfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#D3E1EC] bg-white">
      <div className="flex min-h-[68px] items-center border-b border-[#E5EDF9] px-6">
        <h2 className="font-montserrat text-[20px] font-semibold text-[#10233A]">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function CreatedInfoRow({ label, value, shaded = false }: { label: string; value?: string; shaded?: boolean }) {
  return (
    <div className={`grid min-h-10 grid-cols-[210px_minmax(0,1fr)] items-center rounded-lg px-3 font-montserrat text-[12px] ${shaded ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
      <span className="font-normal text-[#7288A3]">{label}</span>
      <span className="min-w-0 truncate font-medium text-[#10233A]">
        {value || '—'}
      </span>
    </div>
  );
}

function CreatedContentSection({ title, content }: { title: string; content: string }) {
  return (
    <section className="flex min-h-[94px] items-center gap-8 rounded-xl border border-[#D3E1EC] bg-white px-6">
      <h2 className="font-montserrat text-[20px] font-semibold text-[#10233A]">{title}</h2>
      <span className="min-w-0 flex-1 whitespace-pre-wrap font-montserrat text-[12px] font-medium text-[#10233A]">{content || '—'}</span>
    </section>
  );
}

function InvoiceChatSection({
  storageKey,
  initialReceivedMessage,
}: {
  storageKey: string;
  initialReceivedMessage?: Omit<InvoiceChatMessage, 'id' | 'direction'>;
}) {
  const persistenceKey = invoiceChatPersistenceKey(storageKey);
  const [messages, setMessages] = useState<InvoiceChatMessage[]>(() => {
    try {
      const stored = window.localStorage.getItem(persistenceKey);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed) && parsed.length) return parsed;
      return initialReceivedMessage
        ? [{
            ...initialReceivedMessage,
            id: `invoice-chat-received-${storageKey}`,
            direction: 'received' as const,
          }]
        : [];
    } catch {
      return initialReceivedMessage
        ? [{
            ...initialReceivedMessage,
            id: `invoice-chat-received-${storageKey}`,
            direction: 'received' as const,
          }]
        : [];
    }
  });
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(persistenceKey, JSON.stringify(messages));
  }, [messages, persistenceKey]);

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      {
        id: `invoice-chat-${Date.now()}`,
        author: getCurrentUserName(),
        date: new Date().toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }),
        text,
        direction: 'written',
      },
    ]);
    setMessage('');
  };

  const receivedCount = messages.filter((item) => item.direction === 'received').length;
  const writtenCount = messages.filter((item) => item.direction === 'written').length;
  const lastMessage = messages[messages.length - 1];

  return (
    <section className="rounded-xl border border-[#D3E1EC] bg-white p-6">
      <h2 className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">Chats</h2>

      <div className="mt-4 flex h-5 items-center gap-3 px-3 font-montserrat text-[12px] font-medium leading-[18px]">
        <span className="text-[#10233A]">Received messages: {receivedCount}</span>
        <span className="h-5 w-px bg-[#D3E1EC]" />
        <span className="text-[#7288A3]">Written messages: {writtenCount}</span>
      </div>

      <div className="mt-4 flex h-9 items-center rounded-lg bg-[#F8FDFF] font-montserrat text-[12px] leading-[18px]">
        <span className="w-[146px] flex-shrink-0 px-3 font-normal text-[#10233A]">
          {lastMessage ? (lastMessage.direction === 'received' ? 'Received' : 'Written') : 'No messages'}
        </span>
        <span className="min-w-0 flex-1 truncate px-3 font-normal text-[#10233A]">{lastMessage?.text || '—'}</span>
        <span className="flex w-[96px] flex-shrink-0 items-center gap-2 px-2 text-[#10233A]">
          {lastMessage && <span className={`h-1.5 w-1.5 rounded-full ${lastMessage.direction === 'received' ? 'bg-[#18C79C]' : 'bg-[#EEB648]'}`} />}
          {lastMessage ? (lastMessage.direction === 'received' ? 'Received' : 'Written') : '—'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="mr-1 flex h-7 w-[91px] flex-shrink-0 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white font-montserrat text-[12px] font-semibold text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"
        >
          {open ? 'Close chat' : 'Open chat'}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-[#E5EDF9] pt-4">
          {messages.length > 0 && (
            <div className="mb-4 flex max-h-[220px] flex-col gap-3 overflow-y-auto pr-1">
              {messages.map((chatMessage) => (
                <div key={chatMessage.id} className={`flex flex-col gap-1 ${chatMessage.direction === 'written' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[82%] rounded-lg px-3 py-2 ${chatMessage.direction === 'written' ? 'bg-[#E6F2F6]' : 'border border-[#E5EDF9] bg-[#F8FDFF]'}`}>
                    <span className="font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">{chatMessage.text}</span>
                  </div>
                  <span className="font-montserrat text-[10px] font-medium text-[#A1B6C6]">{chatMessage.author} - {chatMessage.date}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendMessage();
              }}
              placeholder="Type a message..."
              className="h-9 min-w-0 flex-1 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
            />
            <button
              type="button"
              aria-label="Send message"
              disabled={!message.trim()}
              onClick={sendMessage}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${message.trim() ? 'bg-[#007EA7] text-white hover:bg-[#006B8E]' : 'cursor-not-allowed bg-[#F5F5F5] text-[#B4B6B8]'}`}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CreatedTotal({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? 'border-t border-[#D3E1EC] pt-2 text-[14px] font-semibold' : ''}`}><span>{label}</span><span>{formatMoney(value)}</span></div>;
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} €`;
}

function formatCreatedDate(value: string) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatCreatedTimestamp(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}


function CollapsibleSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[72px] w-full items-center justify-between px-6 text-left transition-colors hover:bg-[#F8FDFF]"
      >
        <span className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">{title}</span>
        {expanded ? <ChevronUp size={24} strokeWidth={1.6} className="text-[#7288A3]" /> : <ChevronDown size={24} strokeWidth={1.6} className="text-[#7288A3]" />}
      </button>
      {expanded && <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

function CounterpartyTitleField({
  value,
  counterparties,
  onChange,
  onSelect,
}: {
  value: string;
  counterparties: Company[];
  onChange: (value: string) => void;
  onSelect: (counterparty: Company) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = value.trim().toLowerCase();
  const matches = counterparties.filter((counterparty) =>
    !normalized || counterparty.name.toLowerCase().includes(normalized),
  );

  return (
    <div className={`relative flex h-9 w-full items-center rounded-lg bg-white px-3 font-montserrat text-[12px] leading-[18px] ${open ? 'z-40' : 'z-0'}`}>
      <span className="w-[200px] flex-shrink-0 font-normal text-[#10233A]">Title</span>
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          value={value}
          placeholder="Enter or search counterparty"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          className="h-[26px] w-full rounded border border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7] focus:ring-2 focus:ring-[#007EA7]/10"
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

function InvoiceDetailRow({
  label,
  placeholder,
  type = 'text',
  options,
  select = false,
  required = false,
  shaded = false,
  compactSeller = false,
  value: controlledValue,
  onChange,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  options?: string[];
  select?: boolean;
  required?: boolean;
  shaded?: boolean;
  compactSeller?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const isSelect = select || Boolean(options);
  const [internalValue, setInternalValue] = useState('');
  const value = controlledValue ?? internalValue;
  const updateValue = (nextValue: string) => {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  };
  return (
    <div
      className={`relative flex h-9 w-full items-center rounded-lg font-montserrat text-[12px] leading-[18px] ${compactSeller ? 'gap-[2px] py-[5px] pl-3 pr-[5px]' : 'px-3'} ${shaded ? 'bg-[#F8FDFF]' : 'bg-white'}`}
    >
      <span className="w-[200px] flex-shrink-0 font-normal text-[#10233A]">
        {label}
        {required && <span className="ml-0.5 text-[#D90310]">*</span>}
      </span>
      <div className="relative min-w-0 flex-1">
        {isSelect ? (
          <SearchableSelect ariaLabel={label} value={value} onChange={updateValue} options={options ?? ['INV', 'VAT', 'SER']} placeholder={placeholder || 'Select'} className="h-[26px] rounded border border-[#D3E1EC] bg-white px-2 pr-7 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" />
        ) : (
          <input
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={(event) => updateValue(event.target.value)}
            className="h-[26px] w-full rounded border border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
          />
        )}
      </div>
    </div>
  );
}

function CompactServiceInput({ value, onChange, placeholder, type = 'text', expandWhenLong = false }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string; expandWhenLong?: boolean }) {
  const [focused, setFocused] = useState(false);
  const expanded = expandWhenLong && focused && value.length > 13;
  return (
    <div className={`relative h-[26px] min-w-0 w-full ${expanded ? 'z-40' : 'z-0'}`}>
      <input
        type={type}
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
        className={`absolute left-0 top-0 h-[26px] min-w-0 rounded border bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7] ${expanded ? 'w-[535px] border-[#007EA7] shadow-[0_8px_24px_rgba(16,35,58,0.16)]' : 'w-full border-[#D3E1EC]'}`}
      />
    </div>
  );
}

function CompactSystemServiceSelect({ value, onChange, placeholder, options }: { value: string; onChange: (value: string) => void; placeholder: string; options: string[] }) {
  return <SearchableSelect ariaLabel={placeholder} value={value} onChange={onChange} placeholder={placeholder} options={options} className="h-[26px] rounded border border-[#D3E1EC] bg-white px-2 pr-7 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" menuClassName="min-w-[180px]" />;
}

function CompactServiceValue({ value }: { value: string }) {
  return (
    <div className="flex h-[26px] min-w-0 w-full items-center rounded border border-[#D3E1EC] bg-white px-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
      <span className="truncate">{value}</span>
    </div>
  );
}

function CompactTotal({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex h-5 w-full items-center justify-end gap-2 font-montserrat text-[14px] font-medium leading-5">
      <span className="w-[100px] text-right text-[#10233A]">{label}</span>
      <span className={`w-[60px] text-right ${strong ? 'font-bold text-[#007EA7]' : 'text-[#7288A3]'}`}>
        €{value.toFixed(2)}
      </span>
    </div>
  );
}
