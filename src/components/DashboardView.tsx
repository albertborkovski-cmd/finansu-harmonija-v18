import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Copy, RefreshCw, CheckCircle, AlertCircle, Upload, BarChart2, LineChart, PieChart, Settings, X, Check, FileText } from 'lucide-react';
import { supabase, type Company, type DbDocument } from '../lib/supabase';
import { usePersistentState } from '../hooks/usePersistentState';
import type { AccessMap } from '../lib/accessControl';
import { PageHeader } from './PageHeader';
import CompanyBreadcrumb from './CompanyBreadcrumb';
import { SystemBreadcrumb } from './SystemNavigation';
import DashboardAttention from './DashboardAttention';
import type { AttentionNotification, NotificationTab } from '../lib/notifications';
import {
  matchesUploadedDateFilter,
  prepareUploadedDocuments,
  uploadedStatus,
  uploadedStatusGroup,
  type UploadedDocumentsGroup,
} from '../lib/uploadedDocuments';

type OcrAdditionalInformation = {
  departmentCode: string;
  object: string;
  project: string;
  costCenter: string;
  glAccount: string;
  accountablePerson: string;
  productGroup: string;
  vatClassifier: string;
  source: string;
  detailedSplitting: boolean;
  duplicatesAccepted: boolean;
};

type DashboardAnalyticsCategory = 'processing' | 'processed' | 'attention';
type DashboardAnalyticsSelection = DashboardAnalyticsCategory | 'all';

const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff']);

const EMPTY_OCR_ADDITIONAL_INFORMATION: OcrAdditionalInformation = {
  departmentCode: '',
  object: '',
  project: '',
  costCenter: '',
  glAccount: '',
  accountablePerson: '',
  productGroup: '',
  vatClassifier: '',
  source: '',
  detailedSplitting: false,
  duplicatesAccepted: false,
};

function documentAnalyticsCategory(document: DbDocument): DashboardAnalyticsCategory {
  const group = uploadedStatusGroup(uploadedStatus(document));
  if (group === 'Processed') return 'processed';
  if (group === 'Needs attention') return 'attention';
  return 'processing';
}

function dashboardDocumentTimestamp(document: DbDocument): number {
  const createdAt = Date.parse(document.created_at || '');
  if (Number.isFinite(createdAt)) return createdAt;

  const dateParts = (document.receive_date || '').match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!dateParts) return 0;
  return new Date(Number(dateParts[3]), Number(dateParts[2]) - 1, Number(dateParts[1])).getTime();
}

function AdditionalInformationField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[13px] font-semibold leading-5 text-[#10233A]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[38px] w-full rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
      />
    </label>
  );
}

// ── SVG Line Chart ──────────────────────────────────────────────────────────
function SvgLineChart({ data, color, height = 150 }: { data: number[]; color: string; height?: number }) {
  const w = 600;
  const h = height;
  const pad = { top: 8, bottom: 8, left: 0, right: 0 };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad.left + (i / (data.length - 1)) * (w - pad.left - pad.right);
    const y = pad.top + ((max - v) / range) * (h - pad.top - pad.bottom);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const areaClose = `${pts[pts.length - 1].split(',')[0]},${h} ${pts[0].split(',')[0]},${h}`;
  const areaPath = `M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${areaClose} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ segments, size = 120, strokeWidth = 14, centerText, centerSub }: {
  segments: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  centerText?: string;
  centerSub?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, g) => s + g.value, 0) || 1;
  let offset = -90;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E6F2F6" strokeWidth={strokeWidth} />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * 2 * Math.PI * r;
        const gap = (1 - pct) * 2 * Math.PI * r;
        const rot = offset;
        offset += pct * 360;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rot} ${cx} ${cy})`}
            strokeLinecap="round"
          />
        );
      })}
      {centerText && (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Montserrat" fontWeight="600" fontSize="16" fill="#10233A">{centerText}</text>
          {centerSub && <text x={cx} y={cy + 16} textAnchor="middle" fontFamily="Montserrat" fontSize="10" fill="#7288A3">{centerSub}</text>}
        </>
      )}
    </svg>
  );
}

// ── Chart grid lines background ──────────────────────────────────────────────
function ChartGrid({ lines = 5 }: { lines?: number }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="w-full border-t border-[#E2E2E2]" />
      ))}
    </div>
  );
}

// ── Month Selector ───────────────────────────────────────────────────────────
function MonthSelector({ months, active, onSelect }: { months: string[]; active: string; onSelect: (m: string) => void }) {
  return (
    <div className="flex flex-row items-center gap-0 bg-[#F8FDFF] rounded-lg p-1">
      {months.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(m)}
          className={`px-[6px] py-[3px] rounded font-montserrat font-medium text-[12px] leading-[18px] transition-colors ${
            active === m ? 'bg-[#007EA7] text-white' : 'text-[#7288A3]'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

// ── Year Selector ────────────────────────────────────────────────────────────
function YearSelector({ years, active, onSelect }: { years: string[]; active: string; onSelect: (y: string) => void }) {
  return (
    <div className="flex flex-row items-center gap-0 bg-white rounded-lg p-1 border border-[#E6F2F6]">
      {years.map((y) => (
        <button
          key={y}
          onClick={() => onSelect(y)}
          className={`px-[6px] py-[3px] rounded font-montserrat font-medium text-[12px] leading-[18px] transition-colors ${
            active === y ? 'bg-[#007EA7] text-white' : 'text-[#7288A3]'
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-[#E1EBF2] bg-white p-5 shadow-[0_8px_24px_rgba(79,111,138,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

// ── Card header ──────────────────────────────────────────────────────────────
function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-row items-center justify-between gap-2">
      <h2 className="font-montserrat text-[18px] font-semibold leading-7 text-[#10233A]">{title}</h2>
      {right}
    </div>
  );
}

// ── Radio ────────────────────────────────────────────────────────────────────
function Radio({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2">
      <div className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 ${checked ? 'border-[#007EA7]' : 'border-[#A1B6C6]'}`}>
        {checked && <div className="w-[9px] h-[9px] rounded-full bg-[#007EA7]" />}
      </div>
      <span className={`font-montserrat font-medium text-[14px] leading-5 ${checked ? 'text-[#007EA7]' : 'text-[#7288A3]'}`}>{label}</span>
    </button>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type GlobalDashboardStats = {
  companyCount: number;
  documentCount: number;
  actionRequired: number;
  totalAmount: number;
  incomeTotal: number;
  expenseTotal: number;
  vatOutput: number;
  vatInput: number;
  vatOutputByYear: Record<string, number[]>;
  vatInputByYear: Record<string, number[]>;
  statusCounts: Record<string, number>;
  statusAmounts: Record<string, number>;
  statusCountsByYear: Record<string, Record<string, number>>;
  statusAmountsByYear: Record<string, Record<string, number>>;
  availableYears: string[];
  nextDueDate: string;
  remainingDays: number;
  incomeByYear: Record<string, number[]>;
  expenseByYear: Record<string, number[]>;
  processedDocumentsByYear: Record<string, number[]>;
  documentsToProcessByYear: Record<string, number[]>;
  organizations: Array<{
    id: string;
    name: string;
    companyCode: string;
    status: string;
    documentCount: number;
    actionRequired: number;
  }>;
};

const EMPTY_GLOBAL_STATS: GlobalDashboardStats = {
  companyCount: 0,
  documentCount: 0,
  actionRequired: 0,
  totalAmount: 0,
  incomeTotal: 0,
  expenseTotal: 0,
  vatOutput: 0,
  vatInput: 0,
  vatOutputByYear: {},
  vatInputByYear: {},
  statusCounts: {},
  statusAmounts: {},
  statusCountsByYear: {},
  statusAmountsByYear: {},
  availableYears: [],
  nextDueDate: '',
  remainingDays: 0,
  incomeByYear: {},
  expenseByYear: {},
  processedDocumentsByYear: {},
  documentsToProcessByYear: {},
  organizations: [],
};

function parseMoney(value: string) {
  let normalized = value
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const fractionLength = normalized.length - normalized.lastIndexOf(',') - 1;
    normalized = fractionLength > 0 && fractionLength <= 2
      ? normalized.replace(',', '.')
      : normalized.replace(/,/g, '');
  }
  return Number(normalized) || 0;
}

function documentPeriod(document: DbDocument) {
  const match = document.document_date?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return { year: match[3], month: Number(match[2]) - 1 };
  const date = new Date(document.created_at);
  return Number.isNaN(date.getTime())
    ? { year: '2025', month: 0 }
    : { year: String(date.getFullYear()), month: date.getMonth() };
}

function parseDocumentDate(value: string) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function DashboardView({
  companyId,
  clientName,
  allCompanies = false,
  onOpenDocument,
  onOpenUploadedDocuments,
  attentionNotifications,
  onOpenNotifications,
}: {
  companyId?: string;
  clientName?: string;
  allCompanies?: boolean;
  roleNames?: string[];
  access?: AccessMap;
  onOpenDocument?: (document: DbDocument) => void;
  onOpenUploadedDocuments?: (group: UploadedDocumentsGroup) => void;
  attentionNotifications?: AttentionNotification[];
  onOpenNotifications?: (tab?: NotificationTab, query?: string) => void;
}) {
  const [activeMonth, setActiveMonth] = useState('Jan');
  const [activeYear3, setActiveYear3] = useState('2025');
  const [activeYear4, setActiveYear4] = useState('2025');
  const [activeYear5, setActiveYear5] = useState('2025');
  const [activeYear6, setActiveYear6] = useState('2025');
  const [chartMode3, setChartMode3] = useState<'monthly' | 'quarterly'>('monthly');
  const [chartMode5, setChartMode5] = useState<'monthly' | 'quarterly'>('monthly');
  const [chartMode6, setChartMode6] = useState<'monthly' | 'quarterly'>('monthly');
  const [showPersonal, setShowPersonal] = useState(false);
  const [globalStats, setGlobalStats] = useState(EMPTY_GLOBAL_STATS);
  const [dashboardDocuments, setDashboardDocuments] = useState<DbDocument[]>([]);
  const [selectedAnalyticsCategory, setSelectedAnalyticsCategory] =
    useState<DashboardAnalyticsSelection | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState('');
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadHelpRef = useRef<HTMLDivElement>(null);
  const additionalInformationStorageKey = `finansu-harmonija:v12:dashboard:ocr-additional-information:${companyId ?? clientName ?? 'company-dashboard'}`;
  const [additionalInformation, setAdditionalInformation] = usePersistentState<OcrAdditionalInformation>(
    additionalInformationStorageKey,
    EMPTY_OCR_ADDITIONAL_INFORMATION,
  );
  const [additionalInformationDraft, setAdditionalInformationDraft] = useState<OcrAdditionalInformation>(additionalInformation);
  const [showAdditionalInformation, setShowAdditionalInformation] = useState(false);

  const openAnalyticsDocuments = (selection: DashboardAnalyticsSelection) => {
    const uploadedGroup: UploadedDocumentsGroup = selection === 'processing'
      ? 'Processing'
      : selection === 'processed'
        ? 'Processed'
        : selection === 'attention'
          ? 'Needs attention'
          : 'All';
    if (onOpenUploadedDocuments) {
      onOpenUploadedDocuments(uploadedGroup);
      return;
    }
    setSelectedAnalyticsCategory(selection);
  };

  const updateAdditionalInformationDraft = <K extends keyof OcrAdditionalInformation,>(
    key: K,
    value: OcrAdditionalInformation[K],
  ) => {
    setAdditionalInformationDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!showUploadHelp) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !uploadHelpRef.current?.contains(event.target)) {
        setShowUploadHelp(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUploadHelp(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showUploadHelp]);

  useEffect(() => {
    if (allCompanies) return undefined;

    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.matches('input, textarea, select, [contenteditable="true"]'));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && showAdditionalInformation) {
        setShowAdditionalInformation(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.code === 'KeyP' && event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setAdditionalInformationDraft(additionalInformation);
        setShowAdditionalInformation(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [additionalInformation, allCompanies, showAdditionalInformation]);

  const refreshGlobalStats = useCallback(async () => {
    const [companyResult, documentResult] = await Promise.all([
      supabase.from('companies').select('*'),
      supabase.from('documents').select('*'),
    ]);
    const allCompanyRows = (companyResult.data as unknown as Company[] | null) ?? [];
    const allDocumentRows = prepareUploadedDocuments(
      (documentResult.data as unknown as DbDocument[] | null) ?? [],
    ).documents;
    const scopedCompanies = allCompanies
      ? allCompanyRows
      : allCompanyRows.filter((company) =>
          companyId ? company.id === companyId : company.name === clientName,
        );
    const scopedCompanyIds = new Set(scopedCompanies.map((company) => company.id));
    const documents = allCompanies
      ? allDocumentRows
      : allDocumentRows.filter((document) =>
          companyId
            ? document.company_id === companyId
            : Boolean(document.company_id && scopedCompanyIds.has(document.company_id)),
        );
    setDashboardDocuments(documents);
    const incomeByYear: Record<string, number[]> = {};
    const expenseByYear: Record<string, number[]> = {};
    const processedDocumentsByYear: Record<string, number[]> = {};
    const documentsToProcessByYear: Record<string, number[]> = {};
    const vatOutputByYear: Record<string, number[]> = {};
    const vatInputByYear: Record<string, number[]> = {};
    const statusCounts: Record<string, number> = {};
    const statusAmounts: Record<string, number> = {};
    const statusCountsByYear: Record<string, Record<string, number>> = {};
    const statusAmountsByYear: Record<string, Record<string, number>> = {};
    const documentCounts = documents.reduce<Record<string, number>>(
      (counts, document) => {
        if (document.company_id) {
          counts[document.company_id] = (counts[document.company_id] ?? 0) + 1;
        }
        return counts;
      },
      {},
    );
    let incomeTotal = 0;
    let expenseTotal = 0;
    let vatOutput = 0;
    let vatInput = 0;

    documents.forEach((document) => {
      const amount = parseMoney(document.amount_without_vat || document.total_amount);
      const vat = parseMoney(document.vat);
      const { year, month } = documentPeriod(document);
      const normalizedStatus = (document.status || '').trim().toLowerCase();
      const isProcessed = ['paid', 'processed', 'completed', 'transferred'].includes(normalizedStatus);
      const processingTarget = isProcessed ? processedDocumentsByYear : documentsToProcessByYear;
      processingTarget[year] ??= Array(12).fill(0);
      processingTarget[year][month] += 1;
      const isIncome = document.type.toLowerCase() === 'income';
      const target = isIncome ? incomeByYear : expenseByYear;
      target[year] ??= Array(12).fill(0);
      target[year][month] += amount;
      if (isIncome) {
        incomeTotal += amount;
        vatOutput += vat;
        vatOutputByYear[year] ??= Array(12).fill(0);
        vatOutputByYear[year][month] += vat;
      } else {
        expenseTotal += amount;
        vatInput += vat;
        vatInputByYear[year] ??= Array(12).fill(0);
        vatInputByYear[year][month] += vat;
      }
      const status = normalizedStatus || 'submitted';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      statusAmounts[status] = (statusAmounts[status] ?? 0) + parseMoney(document.total_amount);
      statusCountsByYear[year] ??= {};
      statusAmountsByYear[year] ??= {};
      statusCountsByYear[year][status] = (statusCountsByYear[year][status] ?? 0) + 1;
      statusAmountsByYear[year][status] =
        (statusAmountsByYear[year][status] ?? 0) + parseMoney(document.total_amount);
    });

    const availableYears = Array.from(
      new Set(documents.map((document) => documentPeriod(document).year)),
    ).sort();
    const latestDocument = documents
      .map(documentPeriod)
      .sort((a, b) => Number(b.year) - Number(a.year) || b.month - a.month)[0];
    if (latestDocument) {
      setActiveMonth(MONTHS_SHORT[latestDocument.month]);
      setActiveYear3(latestDocument.year);
      setActiveYear4(latestDocument.year);
      setActiveYear5(latestDocument.year);
      setActiveYear6(latestDocument.year);
    }
    const documentActionRequired = [
      'overdue',
      'rejected',
      'exceptional',
      'exception',
      'needs info',
      'provide additional',
      'duplicate error',
      'dublicate error',
      'duplicate',
    ].reduce((total, status) => total + (statusCounts[status] ?? 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDates = documents
      .map((document) => parseDocumentDate(document.due_end_date))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const nextDue = dueDates.find((date) => date.getTime() >= today.getTime()) ?? dueDates.at(-1);
    const remainingDays = nextDue
      ? Math.max(0, Math.ceil((nextDue.getTime() - today.getTime()) / 86_400_000))
      : 0;

    setGlobalStats({
      companyCount: scopedCompanies.length,
      documentCount: documents.length,
      actionRequired: allCompanies
        ? scopedCompanies.reduce(
            (total, company) => total + Number(company.action_required || 0),
            0,
          )
        : documentActionRequired,
      totalAmount: documents.reduce(
        (total, document) => total + parseMoney(document.total_amount),
        0,
      ),
      incomeTotal,
      expenseTotal,
      vatOutput,
      vatInput,
      vatOutputByYear,
      vatInputByYear,
      statusCounts,
      statusAmounts,
      statusCountsByYear,
      statusAmountsByYear,
      availableYears,
      nextDueDate: nextDue?.toLocaleDateString('lt-LT') ?? '',
      remainingDays,
      incomeByYear,
      expenseByYear,
      processedDocumentsByYear,
      documentsToProcessByYear,
      organizations: scopedCompanies.map((company) => ({
        id: company.id,
        name: company.name,
        companyCode: company.company_code,
        status: company.company_status || 'Active',
        documentCount: documentCounts[company.id] ?? 0,
        actionRequired: Number(company.action_required || 0),
      })),
    });
  }, [allCompanies, clientName, companyId]);

  useEffect(() => {
    void refreshGlobalStats();
  }, [refreshGlobalStats]);

  const uploadForOcr = async (files: File[]) => {
    if (!allCompanies || files.length === 0 || uploading) return;

    const unsupportedFile = files.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      return !SUPPORTED_UPLOAD_EXTENSIONS.has(extension);
    });
    if (unsupportedFile) {
      setUploadFeedback(`Unsupported file format: ${unsupportedFile.name}. Use PDF, JPG, PNG or TIF.`);
      return;
    }

    const oversizedFile = files.find((file) => file.size > MAX_UPLOAD_FILE_SIZE);
    if (oversizedFile) {
      setUploadFeedback(`${oversizedFile.name} exceeds the 50 MB file size limit.`);
      return;
    }

    setUploading(true);
    setUploadFeedback('');
    try {
      for (const [index, file] of files.entries()) {
        const id = `dashboard-ocr-${Date.now()}-${index}`;
        const storagePath = `dashboard/${id}-${file.name}`;
        const { error: fileError } = await supabase.storage
          .from('documents')
          .upload(storagePath, file);
        if (fileError) throw new Error(fileError.message);
        const imageUrl = supabase.storage
          .from('documents')
          .getPublicUrl(storagePath).data.publicUrl;
        const now = new Date();
        const date = now.toLocaleDateString('lt-LT');
        await supabase.from('documents').upsert(
          {
            id,
            company_id: undefined,
            receive_date: date,
            client_counterparty: 'Unassigned company',
            document_type: 'OCR intake',
            source: 'Dashboard upload',
            total_amount: '0.00 €',
            due_end_date: '',
            file_case: file.name,
            order_no: '',
            number: `OCR-${String(globalStats.documentCount + index + 1).padStart(4, '0')}`,
            type: 'Expense',
            document_date: date,
            document_purpose: 'Submitted for OCR processing',
            invoice_contract_date: '',
            operation_date: date,
            expense_account: '',
            vat_classifier: '',
            currency: 'EUR',
            amount_without_vat: '0.00 €',
            vat: '0.00 €',
            vat_percent: '0%',
            department_code: '',
            object_project: '',
            valid_form: 'OCR queue',
            accountable_responsible: '',
            cost_center: '',
            series: 'OCR',
            status: 'Submitted',
            created_at: now.toISOString(),
            image_url: imageUrl || null,
            project_code: '',
            product_group: '',
            detailed_splitting: false,
            ocr_input_priority: 'user-confirmed',
          },
          { onConflict: 'id' },
        );
      }
      setUploadFeedback(
        `${files.length} ${files.length === 1 ? 'document' : 'documents'} submitted for OCR processing.`,
      );
      await refreshGlobalStats();
    } catch (error) {
      setUploadFeedback(
        error instanceof Error ? error.message : 'Document upload failed.',
      );
    } finally {
      setUploading(false);
    }
  };

  const dashboardYears = globalStats.availableYears.length
    ? globalStats.availableYears
    : ['2025'];
  const incomeData = globalStats.incomeByYear[activeYear3] ?? Array(12).fill(0);
  const expenseData = globalStats.expenseByYear[activeYear3] ?? Array(12).fill(0);
  const revenueData = globalStats.incomeByYear[activeYear5] ?? Array(12).fill(0);
  const expData6 = globalStats.expenseByYear[activeYear6] ?? Array(12).fill(0);
  const newestDashboardDocuments = dashboardDocuments
    .filter((document) => matchesUploadedDateFilter(document, '30'))
    .sort(
      (left, right) => dashboardDocumentTimestamp(right) - dashboardDocumentTimestamp(left),
    );
  const analyticsDocuments = {
    processing: newestDashboardDocuments.filter(
      (document) => documentAnalyticsCategory(document) === 'processing',
    ),
    processed: newestDashboardDocuments.filter(
      (document) => documentAnalyticsCategory(document) === 'processed',
    ),
    attention: newestDashboardDocuments.filter(
      (document) => documentAnalyticsCategory(document) === 'attention',
    ),
  } satisfies Record<DashboardAnalyticsCategory, DbDocument[]>;
  const selectedAnalyticsDocuments = selectedAnalyticsCategory
    ? selectedAnalyticsCategory === 'all'
      ? newestDashboardDocuments
      : analyticsDocuments[selectedAnalyticsCategory]
    : [];
  const selectedAnalyticsTitle = selectedAnalyticsCategory
    ? {
        all: 'All documents',
        processing: 'Processing documents',
        processed: 'Processed documents',
        attention: 'Documents needing attention',
      }[selectedAnalyticsCategory]
    : '';
  const organizationNames = new Map(
    globalStats.organizations.map((organization) => [organization.id, organization.name]),
  );
  const selectedMonthIndex = Math.max(0, MONTHS_SHORT.indexOf(activeMonth));
  const selectedVatOutput = globalStats.vatOutputByYear[activeYear3]?.[selectedMonthIndex] ?? 0;
  const selectedVatInput = globalStats.vatInputByYear[activeYear3]?.[selectedMonthIndex] ?? 0;
  const vatMonths = MONTHS_SHORT.filter((_, monthIndex) =>
    (globalStats.vatOutputByYear[activeYear3]?.[monthIndex] ?? 0) !== 0 ||
    (globalStats.vatInputByYear[activeYear3]?.[monthIndex] ?? 0) !== 0,
  );
  const vatRows = [
    { label: 'VAT payable', output: formatAmount(selectedVatOutput), input: '—', total: formatAmount(selectedVatOutput) },
    { label: 'VAT deductible', output: '—', input: formatAmount(selectedVatInput), total: `-${formatAmount(selectedVatInput)}` },
    { label: 'VAT to pay', output: '—', input: '—', total: formatAmount(selectedVatOutput - selectedVatInput) },
  ];
  const paymentStatusCounts = globalStats.statusCountsByYear[activeYear4] ?? {};
  const paymentStatusAmounts = globalStats.statusAmountsByYear[activeYear4] ?? {};
  const paymentStatusCount = (...statuses: string[]) => statuses.reduce(
    (total, status) => total + (paymentStatusCounts[status.toLowerCase()] ?? 0),
    0,
  );
  const pendingDocuments = paymentStatusCount('Pending', 'Submitted', 'Draft');
  const overdueDocuments = paymentStatusCount('Overdue');
  const trackedPayments = pendingDocuments + overdueDocuments;
  const pendingPercent = trackedPayments > 0
    ? Math.round((pendingDocuments / trackedPayments) * 100)
    : 0;
  const overduePercent = trackedPayments > 0 ? 100 - pendingPercent : 0;
  const statusAmount = (...statuses: string[]) => statuses.reduce(
    (total, status) => total + (paymentStatusAmounts[status.toLowerCase()] ?? 0),
    0,
  );
  const pendingAmount = statusAmount('Pending', 'Submitted', 'Draft');
  const overdueAmount = statusAmount('Overdue');
  return (
    <div className={`dashboard-view relative flex min-h-full min-w-0 flex-col bg-white px-4 sm:px-8 lg:px-[72px] ${allCompanies ? 'gap-5 py-6 lg:py-8' : 'gap-8 py-14'}`}>
      <PageHeader title="Dashboard" />
      {allCompanies ? (
        <SystemBreadcrumb items={["Dashboard"]} />
      ) : clientName ? (
        <CompanyBreadcrumb companyName={clientName} items={["Dashboard"]} />
      ) : null}

      <div className="flex flex-col gap-6">
        {/* Alert card */}
        {!allCompanies && (
          <div className="flex flex-col gap-3 rounded-xl border border-[#D9E8EF] border-l-4 border-l-[#007EA7] bg-[#F8FDFF] p-4">
            <p className="font-montserrat font-semibold text-[16px] leading-[18px] text-[#007EA7]">
              {allCompanies
                ? `${globalStats.actionRequired} actions require attention across ${globalStats.companyCount} companies.`
                : "It seems like you forgot to pay for our services. Please take your time and pay whenever you have time."}
            </p>
            <div className="flex flex-row items-end justify-between gap-4 flex-wrap">
              <div className="flex flex-row items-stretch gap-3 flex-wrap">
                {/* Name */}
                <div className="flex flex-col gap-[2px]">
                  <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">{allCompanies ? 'Scope' : 'Name'}</span>
                  <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] whitespace-nowrap">{allCompanies ? clientName ?? 'Meso Group' : 'Meso Group'}</span>
                </div>
                <div className="w-px self-stretch bg-[#D3E1EC] hidden sm:block" />
                {/* Pay tax date */}
                <div className="flex flex-col gap-[2px]">
                  <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">{allCompanies ? 'Companies' : 'Pay tax date'}</span>
                  <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] whitespace-nowrap">{allCompanies ? globalStats.companyCount : globalStats.nextDueDate || '—'}</span>
                </div>
                <div className="w-px self-stretch bg-[#D3E1EC] hidden sm:block" />
                {/* Tax to pay */}
                <div className="flex flex-col gap-[2px]">
                  <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">{allCompanies ? 'Action required' : 'Tax to pay'}</span>
                  <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] whitespace-nowrap">{allCompanies ? globalStats.actionRequired : `${formatAmount(globalStats.totalAmount)} €`}</span>
                </div>
                <div className="w-px self-stretch bg-[#D3E1EC] hidden sm:block" />
                {/* Document status */}
                <div className="flex flex-col gap-[2px]">
                  <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">{allCompanies ? 'Documents' : 'Document status'}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${globalStats.documentCount > 0 ? 'bg-[#01BF92]' : 'bg-[#A1B6C6]'}`} />
                    <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">{globalStats.documentCount}</span>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="flex flex-row items-center gap-4 flex-shrink-0">
                <button type="button" data-system-action="true" className="flex items-center justify-center rounded bg-[#007EA7] px-3 py-1.5 transition-colors hover:bg-[#006D91]">
                  <span className="font-montserrat text-[12px] font-semibold leading-4 text-white">Pay for the service</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2×3 card grid */}
        <div className={`dashboard-card-grid grid grid-cols-1 items-start ${allCompanies ? 'gap-3' : 'gap-5'}`}>

          {/* ── Card 1: Uploading documents ────────────────────────────── */}
          <Card className={allCompanies ? 'col-span-full w-full !gap-3 !p-4' : ''}>
            <div className="flex flex-col gap-2">
              <CardHeader
                title="Uploading documents"
                right={(
                  <div ref={uploadHelpRef} className="relative flex-shrink-0">
                    <button
                      type="button"
                      aria-label="About uploading documents"
                      aria-expanded={showUploadHelp}
                      aria-controls="upload-documents-help"
                      onClick={() => setShowUploadHelp((current) => !current)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#007EA7] transition-colors hover:bg-[#E6F2F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007EA7] focus-visible:ring-offset-2"
                    >
                      <Info size={20} />
                    </button>
                    {showUploadHelp && (
                      <div
                        id="upload-documents-help"
                        role="dialog"
                        aria-label="Uploading documents information"
                        className="absolute right-0 top-9 z-50 w-[360px] max-w-[calc(100vw-48px)] rounded-lg border border-[#D3E1EC] bg-white p-4 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
                      >
                        <p className="font-montserrat text-[13px] font-semibold leading-5 text-[#10233A]">
                          Upload one or multiple documents by drag &amp; drop or by selecting files.
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                          <li>Documents for different organizations can be uploaded together – the system will identify and assign them during processing.</li>
                          <li>You can also send documents to the email address shown above.</li>
                          <li>After upload, documents are sent for processing and their status can be followed in Uploaded documents.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              />
              <div className="flex items-center gap-1">
                <span className="font-montserrat font-medium text-[14px] leading-5 text-[#161616]">Or email documents to:</span>
                <a
                  href="mailto:demo@demo.lt"
                  className="font-montserrat text-[14px] font-medium leading-5 text-[#007EA7]"
                >
                  demo@demo.lt
                </a>
                <button
                  type="button"
                  className="ml-1"
                  aria-label="Copy document upload email"
                  onClick={() => void navigator.clipboard.writeText('demo@demo.lt')}
                >
                  <Copy size={14} className="text-[#007EA7]" />
                </button>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(event) => {
                if (!allCompanies) return;
                event.preventDefault();
                setDraggingFiles(true);
              }}
              onDragLeave={() => setDraggingFiles(false)}
              onDrop={(event) => {
                if (!allCompanies) return;
                event.preventDefault();
                setDraggingFiles(false);
                void uploadForOcr(Array.from(event.dataTransfer.files));
              }}
              className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed transition-colors ${allCompanies ? 'h-[104px] p-3' : 'h-[156px] p-5'} ${draggingFiles ? 'border-[#007EA7] bg-[#E6F2F6]' : 'border-[#AFC3D2] bg-[#E6F2F6]'}`}
            >
              <Upload size={28} className="text-[#7288A3]" />
              <p className="text-center font-montserrat text-[13px] font-medium leading-5 text-[#7288A3]">
                {uploading ? (
                  'Submitting documents for OCR processing…'
                ) : (
                  <>
                    Drag &amp; drop files here or{' '}
                    <button
                      type="button"
                      disabled={!allCompanies}
                      onClick={() => uploadInputRef.current?.click()}
                      className="font-semibold text-[#007EA7] transition-colors hover:text-[#007EA7] disabled:cursor-default disabled:text-[#007EA7]"
                    >
                      browse files
                    </button>
                  </>
                )}
              </p>
              <p className="text-center font-montserrat text-[12px] font-medium leading-[18px] text-[#8CA0B8]">
                Supported: PDF, JPG, PNG, TIF <span aria-hidden="true">*</span> Max file size: 50 MB
              </p>
              {uploadFeedback && (
                <span className="font-montserrat text-[12px] font-medium not-italic text-[#007EA7]">
                  {uploadFeedback}
                </span>
              )}
            </div>
            {allCompanies && (
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                className="hidden"
                aria-label="Upload documents for OCR processing"
                onChange={(event) => {
                  void uploadForOcr(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            )}
          </Card>

          {allCompanies && (
            <section className="col-span-full w-full self-stretch overflow-hidden rounded-2xl border border-[#E1EBF2] bg-white shadow-[0_8px_24px_rgba(79,111,138,0.08)]">
              <div className="grid w-full grid-cols-1 divide-y divide-[#E1EBF2] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                {[
                  {
                    key: 'processing' as const,
                    title: 'Processing',
                    description: 'Currently being processed',
                    count: analyticsDocuments.processing.length,
                    icon: <RefreshCw size={25} strokeWidth={2} />,
                    color: '#D79500',
                    background: '#FFF7E1',
                  },
                  {
                    key: 'processed' as const,
                    title: 'Processed',
                    description: 'Successfully processed',
                    count: analyticsDocuments.processed.length,
                    icon: <CheckCircle size={25} strokeWidth={2} />,
                    color: '#00A97B',
                    background: '#EAF8F3',
                  },
                  {
                    key: 'attention' as const,
                    title: 'Needs attention',
                    description: 'Action required',
                    count: analyticsDocuments.attention.length,
                    icon: <AlertCircle size={25} strokeWidth={2} />,
                    color: '#E34242',
                    background: '#FFF0F1',
                  },
                ].map((item) => (
                  <article
                    key={item.key}
                    className="relative flex min-h-[132px] min-w-0 flex-col px-5 pb-3 pt-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ color: item.color, backgroundColor: item.background }}
                      >
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">
                          {item.title}
                        </h2>
                        <div className="font-montserrat text-[26px] font-semibold leading-8 text-[#10233A]">
                          {item.count}
                        </div>
                        <p className="mt-1 whitespace-normal font-montserrat text-[12px] font-medium leading-5 text-[#7288A3]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAnalyticsDocuments(item.key)}
                      className="mt-2 flex h-8 w-full items-center gap-2 border-t border-[#E1EBF2] pt-2 font-montserrat text-[12px] font-semibold text-[#007EA7] transition-colors hover:text-[#006B8E]"
                    >
                      View all documents
                    </button>
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </article>
                ))}
              </div>
              <div className="flex min-h-10 items-center justify-between gap-4 border-t border-[#E1EBF2] bg-[#FCFEFF] px-5 py-1.5">
                <div className="flex items-center gap-2 font-montserrat text-[11px] font-medium text-[#7288A3]">
                  <Info size={15} />
                  Based on current documents
                </div>
                <button
                  type="button"
                  onClick={() => openAnalyticsDocuments('all')}
                  className="flex h-8 items-center gap-2 font-montserrat text-[12px] font-semibold text-[#007EA7] transition-colors hover:text-[#006B8E]"
                >
                  View all documents
                </button>
              </div>
            </section>
          )}

          {/* ── Card 2: assigned organizations / VAT overview ───────────── */}
          {allCompanies && attentionNotifications && onOpenNotifications && (
            <DashboardAttention rows={attentionNotifications} onOpen={onOpenNotifications} />
          )}
          {!allCompanies && (
          <Card>
            <div className="flex flex-col gap-2">
              <CardHeader
                title="Value Added Tax (VAT)"
                right={
                  <MonthSelector
                    months={vatMonths.length ? vatMonths : [activeMonth]}
                    active={activeMonth}
                    onSelect={setActiveMonth}
                  />
                }
              />
              <span className="font-montserrat font-normal text-[16px] leading-5 text-[#10233A]">
                Tax period: {activeMonth} {activeYear3}
              </span>
            </div>

            <div className="flex flex-row gap-4 flex-1">
              {/* VAT table */}
              <div className="flex-1 flex flex-col gap-0 min-w-0">
                <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A] mb-2">Summary</span>
                <div className="flex flex-col gap-0">
                  {/* Header */}
                  <div className="flex flex-row items-center bg-[#F8FDFF] rounded-t-lg px-3 py-2 gap-2">
                    <span className="flex-1 font-montserrat font-medium text-[11px] text-[#7288A3]">Type</span>
                    <span className="w-[70px] font-montserrat font-medium text-[11px] text-[#7288A3] text-right">Output</span>
                    <span className="w-[70px] font-montserrat font-medium text-[11px] text-[#7288A3] text-right">Input</span>
                    <span className="w-[70px] font-montserrat font-medium text-[11px] text-[#7288A3] text-right">Total</span>
                  </div>
                  {vatRows.map((row, i) => (
                    <div
                      key={i}
                      className={`flex flex-row items-center px-3 py-2 gap-2 ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}
                    >
                      <span className="flex-1 font-montserrat font-normal text-[12px] text-[#10233A] truncate">{row.label}</span>
                      <span className="w-[70px] font-montserrat font-normal text-[12px] text-[#10233A] text-right">{row.output}</span>
                      <span className="w-[70px] font-montserrat font-normal text-[12px] text-[#10233A] text-right">{row.input}</span>
                      <span className="w-[70px] font-montserrat font-semibold text-[12px] text-[#10233A] text-right">{row.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remaining days donut */}
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A] text-center">Remaining days</span>
                <DonutChart
                  segments={[
                    { value: globalStats.remainingDays, color: '#007EA7' },
                    { value: Math.max(0, 30 - globalStats.remainingDays), color: '#E6F2F6' },
                  ]}
                  size={110}
                  strokeWidth={12}
                  centerText={String(globalStats.remainingDays)}
                  centerSub="days left"
                />
                <span className="font-montserrat font-normal text-[12px] text-[#7288A3] text-center">Until {globalStats.nextDueDate || '—'}</span>
              </div>
            </div>

            {/* Orange alert */}
            <div className="flex items-center justify-center px-4 py-2.5 rounded-lg" style={{ background: 'rgba(204,79,0,0.1)', border: '1px solid #CC4F00' }}>
              <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#CC4F00] text-center">
                Awaiting confirmation from the tax authority
              </span>
            </div>
          </Card>
          )}

          {/* ── Card 3: unanswered chats / Income & Expenses ───────────── */}
          {!allCompanies && (
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">Income & Expenses</h2>
                <div className="flex items-center gap-3">
                  <YearSelector years={dashboardYears} active={activeYear3} onSelect={setActiveYear3} />
                  <div className="flex items-center gap-2">
                    <button><LineChart size={14} className="text-[#161616]" /></button>
                    <button><BarChart2 size={14} className="text-[#767676]" /></button>
                    <button><Settings size={14} className="text-[#767676]" /></button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Radio checked={chartMode3 === 'monthly'} label="Monthly" onClick={() => setChartMode3('monthly')} />
                <Radio checked={chartMode3 === 'quarterly'} label="Quarterly" onClick={() => setChartMode3('quarterly')} />
                <span className="font-montserrat font-normal text-[16px] text-[#10233A] ml-2">EUR</span>
              </div>
            </div>

            {/* Chart */}
            <div className="relative flex-1 min-h-[140px]">
              <ChartGrid />
              <div className="absolute inset-0 flex flex-col justify-end">
                <div className="relative h-full">
                  <div className="absolute inset-0">
                    <SvgLineChart data={incomeData} color="#007EA7" height={130} />
                  </div>
                  <div className="absolute inset-0">
                    <SvgLineChart data={expenseData} color="#CC4F00" height={130} />
                  </div>
                </div>
              </div>
              {/* X axis labels */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between">
                {MONTHS_SHORT.map((m) => (
                  <span key={m} className="font-montserrat text-[10px] text-[#767676]">{m}</span>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-[#007EA7]" />
                <span className="font-montserrat text-[12px] text-[#10233A]">Income</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-[#CC4F00]" />
                <span className="font-montserrat text-[12px] text-[#10233A]">Expenses</span>
              </div>
            </div>
          </Card>
          )}

          {/* ── Card 4: documents requiring review / Payment structure ─── */}
          {!allCompanies && (
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">Payment structure</h2>
                <div className="flex items-center gap-3">
                  <YearSelector years={dashboardYears} active={activeYear4} onSelect={setActiveYear4} />
                  <div className="flex items-center gap-2">
                    <button><PieChart size={14} className="text-[#161616]" /></button>
                    <button><BarChart2 size={14} className="text-[#767676]" /></button>
                    <button><Settings size={14} className="text-[#767676]" /></button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPersonal(!showPersonal)}
                  className="flex items-center"
                >
                  <div className={`w-[30px] h-[18px] rounded-full relative transition-colors ${showPersonal ? 'bg-[#007EA7]' : 'bg-[#A1B6C6]'}`}>
                    <div className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${showPersonal ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                  </div>
                </button>
                <span className="font-montserrat font-medium text-[14px] text-[#7288A3]">Show only personal amount</span>
              </div>
            </div>

            {/* Donut charts row */}
            <div className="flex flex-row items-center justify-center gap-8 flex-1">
              {/* Pending vs Overdue */}
              <div className="flex flex-col items-center gap-3">
                <DonutChart
                  segments={[
                    { value: pendingDocuments, color: '#BB6BD9' },
                    { value: overdueDocuments, color: '#1B2FE0' },
                  ]}
                  size={120}
                  strokeWidth={14}
                  centerText={`${pendingPercent}%`}
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-[#BB6BD9]" />
                    <span className="font-montserrat text-[12px] text-[#10233A]">Pending payments</span>
                    <span className="font-montserrat font-medium text-[12px] text-[#10233A] ml-1">{pendingPercent}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm bg-[#1B2FE0]" />
                    <span className="font-montserrat text-[12px] text-[#10233A]">Overdue payments</span>
                    <span className="font-montserrat font-medium text-[12px] text-[#10233A] ml-1">{overduePercent}%</span>
                  </div>
                </div>
              </div>

              {/* Breakdown donut */}
              <div className="flex flex-col items-center gap-3">
                <DonutChart
                  segments={[
                    { value: overdueAmount, color: '#007EA7' },
                    { value: pendingAmount, color: '#CC4F00' },
                  ]}
                  size={120}
                  strokeWidth={14}
                  centerText={`€${formatAmount(pendingAmount + overdueAmount)}`}
                  centerSub="total"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm bg-[#CC4F00]" />
                    <div className="flex flex-col">
                      <span className="font-montserrat font-normal text-[14px] text-[#10233A]">Pending payments</span>
                      <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">€{formatAmount(pendingAmount)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm bg-[#007EA7]" />
                    <div className="flex flex-col">
                      <span className="font-montserrat font-normal text-[14px] text-[#10233A]">Overdue payments</span>
                      <span className="font-montserrat font-semibold text-[14px] text-[#10233A]">€{formatAmount(overdueAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
          )}

          {/* ── Card 5: document processing / Revenue dynamics ─────────── */}
          {!allCompanies && (
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">Revenue dynamics</h2>
                <div className="flex items-center gap-3">
                  <YearSelector years={dashboardYears} active={activeYear5} onSelect={setActiveYear5} />
                  <div className="flex items-center gap-2">
                    <button><LineChart size={14} className="text-[#161616]" /></button>
                    <button><BarChart2 size={14} className="text-[#767676]" /></button>
                    <button><Settings size={14} className="text-[#767676]" /></button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Radio checked={chartMode5 === 'monthly'} label="For months" onClick={() => setChartMode5('monthly')} />
                <Radio checked={chartMode5 === 'quarterly'} label="In quarters" onClick={() => setChartMode5('quarterly')} />
                <span className="font-montserrat font-normal text-[16px] text-[#10233A] ml-2">EUR</span>
              </div>
            </div>

            <div className="relative flex-1 min-h-[140px]">
              <ChartGrid />
              <div className="absolute inset-0">
                <SvgLineChart data={revenueData} color="#007EA7" height={130} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between">
                {MONTHS_SHORT.map((m) => (
                  <span key={m} className="font-montserrat text-[10px] text-[#767676]">{m}</span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-[#007EA7]" />
                <span className="font-montserrat text-[12px] text-[#10233A]">Net revenue</span>
              </div>
            </div>
          </Card>
          )}

          {/* ── Card 6: permissions and roles / Expense analysis ───────── */}
          {!allCompanies && (
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">Expense analysis</h2>
                <div className="flex items-center gap-3">
                  <YearSelector years={dashboardYears} active={activeYear6} onSelect={setActiveYear6} />
                  <div className="flex items-center gap-2">
                    <button><LineChart size={14} className="text-[#161616]" /></button>
                    <button><BarChart2 size={14} className="text-[#767676]" /></button>
                    <button><Settings size={14} className="text-[#767676]" /></button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Radio checked={chartMode6 === 'monthly'} label="For months" onClick={() => setChartMode6('monthly')} />
                <Radio checked={chartMode6 === 'quarterly'} label="In quarters" onClick={() => setChartMode6('quarterly')} />
                <span className="font-montserrat font-normal text-[16px] text-[#10233A] ml-2">EUR</span>
              </div>
            </div>

            <div className="relative flex-1 min-h-[140px]">
              <ChartGrid />
              <div className="absolute inset-0">
                <SvgLineChart data={expData6} color="#CC4F00" height={130} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between">
                {MONTHS_SHORT.map((m) => (
                  <span key={m} className="font-montserrat text-[10px] text-[#767676]">{m}</span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-[#CC4F00]" />
                <span className="font-montserrat text-[12px] text-[#10233A]">Total expenses</span>
              </div>
            </div>
          </Card>
          )}

        </div>
      </div>

      {selectedAnalyticsCategory && (
        <section
          className="w-full overflow-hidden rounded-2xl border border-[#D3E1EC] bg-white shadow-[0_8px_24px_rgba(79,111,138,0.08)]"
          aria-labelledby="dashboard-document-details-title"
        >
          <div className="flex w-full flex-col overflow-hidden">
            <header className="flex min-h-20 flex-shrink-0 items-center gap-4 border-b border-[#D3E1EC] px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2
                    id="dashboard-document-details-title"
                    className="truncate font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]"
                  >
                    {selectedAnalyticsTitle}
                  </h2>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#E6F2F6] px-2 font-montserrat text-[12px] font-semibold text-[#007EA7]">
                    {selectedAnalyticsDocuments.length}
                  </span>
                </div>
                <p className="font-montserrat text-[11px] font-medium leading-4 text-[#7288A3]">
                  Detailed document list across assigned organizations
                </p>
              </div>
            </header>

            <div className="max-h-[520px] min-h-0 flex-1 overflow-auto px-6 py-5">
              {selectedAnalyticsDocuments.length > 0 ? (
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[170px_180px_minmax(170px,1fr)_130px_110px_120px] items-center rounded-t-lg bg-[#F8FDFF] px-3 py-2.5">
                    {['Organization', 'File / Case', 'Client / Counterparty', 'Status', 'Receive date', 'Total amount'].map((label) => (
                      <span key={label} className="px-2 font-montserrat text-[11px] font-medium text-[#7288A3]">
                        {label}
                      </span>
                    ))}
                  </div>
                  {selectedAnalyticsDocuments.map((document, index) => {
                    const category = documentAnalyticsCategory(document);
                    const badge = category === 'processed'
                      ? 'bg-[#EAF8F3] text-[#008A6A]'
                      : category === 'attention'
                        ? 'bg-[#FFF0F1] text-[#D64545]'
                        : 'bg-[#FFF7E1] text-[#B67800]';
                    return (
                      <div
                        key={document.id}
                        className={`grid min-h-12 grid-cols-[170px_180px_minmax(170px,1fr)_130px_110px_120px] items-center rounded-lg px-3 font-montserrat text-[12px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#EAF4F8]`}
                      >
                        <span className="truncate px-2 font-medium" title={organizationNames.get(document.company_id || '') || 'Unassigned organization'}>
                          {organizationNames.get(document.company_id || '') || 'Unassigned organization'}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenDocument?.(document)}
                          disabled={!onOpenDocument}
                          className="truncate px-2 text-left font-medium text-[#007EA7] transition-colors hover:text-[#006B8E] disabled:cursor-default disabled:text-[#10233A]"
                          title={document.file_case || document.number || '—'}
                        >
                          {document.file_case || document.number || '—'}
                        </button>
                        <span className="truncate px-2" title={document.client_counterparty || '—'}>
                          {document.client_counterparty || '—'}
                        </span>
                        <span className="px-2">
                          <span className={`inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge}`}>
                            {document.status || 'Submitted'}
                          </span>
                        </span>
                        <span className="truncate px-2">{document.receive_date || '—'}</span>
                        <span className="truncate px-2 text-right font-medium">{document.total_amount || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF5FA] text-[#7288A3]">
                    <FileText size={26} />
                  </span>
                  <div>
                    <p className="font-montserrat text-[14px] font-semibold text-[#10233A]">No documents in this category</p>
                    <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">The list will update automatically when document statuses change.</p>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex flex-shrink-0 justify-end border-t border-[#D3E1EC] px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedAnalyticsCategory(null)}
                className="flex h-[42px] min-w-[120px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[14px] font-semibold text-[#7288A3] transition-colors hover:bg-[#F8FDFF]"
              >
                Close
              </button>
            </footer>
          </div>
        </section>
      )}

      {!allCompanies && showAdditionalInformation && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#10233A]/10 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ocr-additional-information-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAdditionalInformation(false);
          }}
        >
          <div className="flex max-h-[calc(100vh-64px)] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[#D3E1EC] bg-white shadow-[0_18px_50px_rgba(16,35,58,0.18)]">
            <header className="flex min-h-20 flex-shrink-0 items-center justify-between border-b border-[#D3E1EC] px-6 py-4">
              <div>
                <h2 id="ocr-additional-information-title" className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">
                  Additional information
                </h2>
                <p className="font-montserrat text-[11px] font-medium leading-4 text-[#7288A3]">
                  Data for OCR digitization
                </p>
              </div>
              <button
                type="button"
                aria-label="Close additional information"
                onClick={() => setShowAdditionalInformation(false)}
                className="flex h-8 w-8 items-center justify-center rounded text-[#7288A3] transition-colors hover:bg-[#F2F7FC] hover:text-[#10233A]"
              >
                <X size={22} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <AdditionalInformationField label="Department code" value={additionalInformationDraft.departmentCode} placeholder="Enter department code" onChange={(value) => updateAdditionalInformationDraft('departmentCode', value)} />
                <AdditionalInformationField label="Object" value={additionalInformationDraft.object} placeholder="Enter object" onChange={(value) => updateAdditionalInformationDraft('object', value)} />
                <AdditionalInformationField label="Project" value={additionalInformationDraft.project} placeholder="Enter project" onChange={(value) => updateAdditionalInformationDraft('project', value)} />
                <AdditionalInformationField label="Cost center" value={additionalInformationDraft.costCenter} placeholder="Enter cost center" onChange={(value) => updateAdditionalInformationDraft('costCenter', value)} />
                <AdditionalInformationField label="GL account" value={additionalInformationDraft.glAccount} placeholder="Enter GL account" onChange={(value) => updateAdditionalInformationDraft('glAccount', value)} />
                <AdditionalInformationField label="Accountable person" value={additionalInformationDraft.accountablePerson} placeholder="Enter accountable person" onChange={(value) => updateAdditionalInformationDraft('accountablePerson', value)} />
                <AdditionalInformationField label="Product group" value={additionalInformationDraft.productGroup} placeholder="Enter product group" onChange={(value) => updateAdditionalInformationDraft('productGroup', value)} />
                <AdditionalInformationField label="VAT classifier" value={additionalInformationDraft.vatClassifier} placeholder="Enter VAT classifier" onChange={(value) => updateAdditionalInformationDraft('vatClassifier', value)} />
                <AdditionalInformationField label="Source" value={additionalInformationDraft.source} placeholder="Email or SharePoint folder" onChange={(value) => updateAdditionalInformationDraft('source', value)} />

                {([
                  {
                    key: 'detailedSplitting' as const,
                    label: 'Detailed document splitting',
                    description: 'Send the OCR system an instruction to split the document into individual lines.',
                  },
                  {
                    key: 'duplicatesAccepted' as const,
                    label: 'Accept duplicate documents',
                    description: 'Allow documents identified as duplicates to continue through OCR processing.',
                  },
                ]).map((option) => {
                  const checked = additionalInformationDraft[option.key];
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => updateAdditionalInformationDraft(option.key, !checked)}
                      className="flex min-h-[72px] w-full items-center justify-between gap-4 rounded-lg border border-[#D3E1EC] bg-white px-4 py-3 text-left transition-colors hover:border-[#007EA7] hover:bg-[#F8FDFF] md:col-span-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-montserrat text-[13px] font-semibold leading-5 text-[#10233A]">{option.label}</span>
                        <span className="mt-1 block whitespace-normal break-words font-montserrat text-[11px] font-medium leading-[17px] text-[#7288A3]">{option.description}</span>
                      </span>
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                        {checked && <Check size={14} strokeWidth={2.5} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <footer className="flex flex-shrink-0 gap-4 border-t border-[#D3E1EC] bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setAdditionalInformation(additionalInformationDraft);
                  setShowAdditionalInformation(false);
                }}
                className="flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#007EA7] font-montserrat text-[16px] font-semibold text-white transition-colors hover:bg-[#006B8E]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdditionalInformationDraft(additionalInformation);
                  setShowAdditionalInformation(false);
                }}
                className="flex h-[42px] flex-1 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold text-[#7288A3] transition-colors hover:bg-[#F8FDFF]"
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}
