import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FileText, Plus, Scissors, Upload, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { PageHeader } from './PageHeader';
import { HeaderBackButton, SystemBreadcrumb } from './SystemNavigation';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import type { ColConfig } from './ColumnSettingsPanel';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import OcrSearchField from './OcrSearchField';
import TablePagination from './TablePagination';
import SearchableSelect from './SearchableSelect';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import { supabase, type Company, type DbDocument } from '../lib/supabase';
import { loadOcrDocumentSource } from '../lib/ocrDocumentSource';
import { getSearchSuggestions, matchesTextSearch } from '../utils/textSearch';
import {
  matchesUploadedDateFilter,
  prepareUploadedDocuments,
  uploadedDocumentTimestamp as uploadedTimestamp,
  uploadedStatus,
  uploadedStatusGroup as statusGroup,
  type UploadedDocumentsGroup,
  type UploadedStatus,
} from '../lib/uploadedDocuments';

export type { UploadedDocumentsGroup } from '../lib/uploadedDocuments';
type StatusGroup = UploadedDocumentsGroup;
type UploadedFilterKey = 'uploaded' | 'organization' | 'status' | 'sourceType' | 'sourceValue';

const PAGE_SIZE = 50;

type UploadedColumnKey = 'document' | 'organization' | 'status' | 'uploaded';

const UPLOADED_DOCUMENT_COLUMNS = [
  { key: 'document', label: 'Document', width: 230, visible: true },
  { key: 'organization', label: 'Organization', width: 170, visible: true },
  { key: 'status', label: 'Status', width: 270, visible: true },
  { key: 'uploaded', label: 'Uploaded', width: 150, visible: true },
] satisfies Array<{ key: UploadedColumnKey; label: string; width: number; visible: boolean }>;

const UPLOADED_FILTERS: Array<{ key: UploadedFilterKey; label: string }> = [
  { key: 'uploaded', label: 'Uploaded date' },
  { key: 'organization', label: 'Organization' },
  { key: 'status', label: 'Status' },
  { key: 'sourceType', label: 'Source type' },
  { key: 'sourceValue', label: 'Source value' },
];

const statusDotColors: Record<UploadedStatus, string> = {
  Processing: '#E6A700',
  Processed: '#12B886',
  'Organization not identified': '#FF6200',
  Rejected: '#D64545',
  Exception: '#D64545',
  Duplicate: '#FF6200',
  'Not document': '#7288A3',
};

function displayUploadedDate(document: DbDocument) {
  const timestamp = uploadedTimestamp(document);
  if (!timestamp) return document.receive_date || '—';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusReason(_document: DbDocument, status: UploadedStatus) {
  if (status === 'Processed') {
    return 'Initial processing is complete; this does not mean accounting approval.';
  }
  if (status === 'Organization not identified') {
    return 'This is the only data assignment action allowed in this view.';
  }
  if (status === 'Duplicate') {
    return 'View original';
  }
  if (status === 'Rejected') {
    return 'The reason is displayed below the status in smaller text.';
  }
  if (status === 'Exception') {
    return 'A processing error or exception occurred.';
  }
  if (status === 'Not document') {
    return 'The file was identified as not being a document.';
  }
  return 'The document has been received and OCR, analysis, or organization identification is in progress.';
}

function sourceValue(document: DbDocument) {
  return document.created_by || document.source || 'Unknown source';
}

function AssignmentField({ label, value, grey = false }: { label: string; value?: string; grey?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">{label}</span>
      <div className={`flex h-8 min-w-0 items-center rounded-md border border-[#D3E1EC] px-2 py-[6px] font-montserrat text-[14px] font-medium leading-5 ${grey ? 'bg-[#F7F7F7] text-[#828588]' : 'bg-white text-[#10233A]'}`}>
        <span className="truncate" title={value || undefined}>{value || '—'}</span>
      </div>
    </div>
  );
}

function uploadedVisibleSearchCells(document: DbDocument, organizationName: string) {
  const status = uploadedStatus(document);
  return [
    document.file_case || document.number || document.id,
    sourceValue(document),
    organizationName,
    status,
    statusReason(document, status),
    displayUploadedDate(document),
  ];
}

export default function UploadedDocumentsView({
  onOpenDocument,
  initialGroup = 'All',
}: {
  onOpenDocument: (document: DbDocument) => void | Promise<void>;
  initialGroup?: UploadedDocumentsGroup;
}) {
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [organizations, setOrganizations] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<StatusGroup>(initialGroup);
  const [showFilters, setShowFilters] = useState(false);
  const [openFilter, setOpenFilter] = useState<UploadedFilterKey | null>(null);
  const [visibleFilterKeys, setVisibleFilterKeys] = useState<UploadedFilterKey[]>([]);
  const [pendingFilterKeys, setPendingFilterKeys] = useState<UploadedFilterKey[]>([]);
  const [selectedFilterKeys, setSelectedFilterKeys] = useState<UploadedFilterKey[]>([]);
  const [dateFilter, setDateFilter] = useState('30');
  const [documentFilter, setDocumentFilter] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [sourceValueFilter, setSourceValueFilter] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<DbDocument | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DbDocument | null>(null);
  const [assigningOrganization, setAssigningOrganization] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [assignmentLineMode, setAssignmentLineMode] = useState<'summary' | 'quantity'>('summary');
  const [issueMode, setIssueMode] = useState(false);
  const [issueComment, setIssueComment] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(() => UPLOADED_DOCUMENT_COLUMNS.map((column) => ({ ...column })));
  const { startResize } = useColumnResize(columns, setColumns);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const listScrollPositionRef = useRef(0);

  const loadData = useCallback(async () => {
    const ocrSource = await loadOcrDocumentSource();
    const preparedDocuments = prepareUploadedDocuments(
      ocrSource.documents,
    );
    await Promise.all(
      preparedDocuments.generated.map((document) =>
        supabase.from('documents').upsert({ ...document }, { onConflict: 'id' }),
      ),
    );
    const loadedDocuments = preparedDocuments.documents;
    setDocuments(loadedDocuments);
    setOrganizations(ocrSource.organizations);
    setSelectedDocument((current) => current
      ? loadedDocuments.find((document) => document.id === current.id) ?? current
      : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const reload = () => void loadData();
    window.addEventListener('finansu-harmonija:data-changed', reload);
    window.addEventListener('finansu-harmonija:settings-data-changed', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('finansu-harmonija:data-changed', reload);
      window.removeEventListener('finansu-harmonija:settings-data-changed', reload);
      window.removeEventListener('storage', reload);
    };
  }, [loadData]);

  useEffect(() => {
    setActiveGroup(initialGroup);
    setPage(1);
  }, [initialGroup]);

  useEffect(() => {
    if (!showFilters && openFilter === null && !searchSuggestionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterMenuRef.current?.contains(event.target)) {
        setShowFilters(false);
        setOpenFilter(null);
        setSearchSuggestionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFilters(false);
        setOpenFilter(null);
        setSearchSuggestionsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openFilter, searchSuggestionsOpen, showFilters]);

  const organizationNames = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );

  const filteredDocuments = useMemo(() => {
    const normalizedDocument = documentFilter.trim().toLowerCase();
    const normalizedOrganization = organizationFilter.trim().toLowerCase();
    const normalizedSourceValue = sourceValueFilter.trim().toLowerCase();

    return [...documents]
      .sort((left, right) => uploadedTimestamp(right) - uploadedTimestamp(left))
      .filter((document) => {
        const status = uploadedStatus(document);
        const group = statusGroup(status);
        if (activeGroup !== 'All' && group !== activeGroup) return false;
        if (!matchesUploadedDateFilter(document, dateFilter)) return false;
        const organizationName = organizationNames.get(document.company_id || '') || 'Organization not identified';
        if (normalizedDocument && !matchesTextSearch(uploadedVisibleSearchCells(document, organizationName), documentFilter)) return false;
        if (normalizedOrganization && !organizationName.toLowerCase().includes(normalizedOrganization)) return false;
        if (statusFilter && status !== statusFilter) return false;
        if (sourceTypeFilter && (document.source || '').toLowerCase() !== sourceTypeFilter.toLowerCase()) return false;
        if (normalizedSourceValue && !sourceValue(document).toLowerCase().includes(normalizedSourceValue)) return false;
        return true;
      });
  }, [activeGroup, dateFilter, documentFilter, documents, organizationFilter, organizationNames, sourceTypeFilter, sourceValueFilter, statusFilter]);

  const searchSuggestions = useMemo(() => {
    return getSearchSuggestions(
      filteredDocuments.map((document) => uploadedVisibleSearchCells(
        document,
        organizationNames.get(document.company_id || '') || 'Organization not identified',
      )),
      documentFilter,
    );
  }, [documentFilter, filteredDocuments, organizationNames]);

  const {
    sortedRows: sortedDocuments,
    changeSort,
    directionFor,
  } = useMultiColumnSort(filteredDocuments, (document, key: UploadedColumnKey) => {
    if (key === 'document') return document.file_case || document.number || document.id;
    if (key === 'organization') return organizationNames.get(document.company_id || '') || 'Organization not identified';
    if (key === 'status') return uploadedStatus(document);
    return uploadedTimestamp(document);
  });

  useEffect(() => setPage(1), [activeGroup, dateFilter, documentFilter, organizationFilter, statusFilter, sourceTypeFilter, sourceValueFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePage = showAll ? 1 : Math.min(page, pageCount);
  const pageDocuments = showAll
    ? sortedDocuments
    : sortedDocuments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const sourceTypes = [...new Set(documents.map((document) => document.source).filter(Boolean))];
  const filterOptions: Record<UploadedFilterKey, Array<{ label: string; value: string }>> = {
    uploaded: [
      { label: 'Last 30 days', value: '30' },
      { label: 'Last 90 days', value: '90' },
      { label: 'Last 12 months', value: '365' },
      { label: 'All time', value: 'all' },
    ],
    organization: [
      { label: 'All', value: '' },
      ...[...new Set(organizations.map((organization) => organization.name).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ label: value, value })),
    ],
    status: [
      { label: 'All', value: '' },
      ...Object.keys(statusDotColors).map((value) => ({ label: value, value })),
    ],
    sourceType: [
      { label: 'All', value: '' },
      ...sourceTypes.map((value) => ({ label: value, value })),
    ],
    sourceValue: [
      { label: 'All', value: '' },
      ...[...new Set(documents.map(sourceValue).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ label: value, value })),
    ],
  };


  const returnToUploadedDocuments = () => {
    setAssigningOrganization(false);
    setSelectedDocument(null);
    setSelectedOrganizationId('');
    window.requestAnimationFrame(() => window.scrollTo({ top: listScrollPositionRef.current }));
  };

  const openOrganizationAssignment = (document: DbDocument) => {
    listScrollPositionRef.current = window.scrollY;
    setSelectedDocument(document);
    setSelectedOrganizationId('');
    setAssignmentLineMode(document.summary_line_items?.length ? 'summary' : 'quantity');
    setAssigningOrganization(true);
    setIssueMode(false);
    setNotice('');
    window.scrollTo({ top: 0 });
  };

  const assignOrganization = async () => {
    if (!selectedDocument) return;
    const organization = organizations.find((item) => item.id === selectedOrganizationId);
    if (!organization) return;
    await supabase.from('documents').upsert(
      { ...selectedDocument, company_id: organization.id },
      { onConflict: 'id' },
    );
    const updated = { ...selectedDocument, company_id: organization.id };
    setDocuments((current) => current.map((document) => document.id === updated.id ? updated : document));
    setNotice(`Assigned to ${organization.name}.`);
    returnToUploadedDocuments();
  };

  const reportIssue = async () => {
    if (!selectedDocument || !issueComment.trim()) return;
    const updated = {
      ...selectedDocument,
      status: 'Exception',
      valid_form: `OCR issue: ${issueComment.trim()}`,
    };
    await supabase.from('documents').upsert(updated, { onConflict: 'id' });
    const historyKey = `finansu-harmonija:v12:ocr-issue-thread:${selectedDocument.id}`;
    const currentHistory = JSON.parse(window.localStorage.getItem(historyKey) || '[]') as unknown[];
    window.localStorage.setItem(historyKey, JSON.stringify([
      ...currentHistory,
      { comment: issueComment.trim(), createdAt: new Date().toISOString(), destination: 'MESO Worker / OCR review' },
    ]));
    setDocuments((current) => current.map((document) => document.id === updated.id ? updated : document));
    setSelectedDocument(updated);
    setIssueComment('');
    setIssueMode(false);
    setNotice('OCR issue sent to MESO Worker for review.');
  };

  const closeSidePanel = () => {
    setSelectedDocument(null);
    setAssigningOrganization(false);
    setSelectedOrganizationId('');
    setIssueMode(false);
    setIssueComment('');
  };

  const openUploadedDocument = (document: DbDocument) => {
    setSelectedDocument(null);
    setNotice('');
    if (document.image_url) {
      window.open(document.image_url, '_blank', 'noopener,noreferrer');
      return;
    }

    const pdf = new jsPDF();
    const documentName = document.file_case || document.number || document.id;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(documentName, 20, 28);
    pdf.setDrawColor(211, 225, 236);
    pdf.line(20, 36, 190, 36);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    const details = [
      ['Document type', document.document_type || document.type || '—'],
      ['Document number', document.number || '—'],
      ['Client / Counterparty', document.client_counterparty || '—'],
      ['Document date', document.document_date || '—'],
      ['Uploaded', displayUploadedDate(document)],
      ['Currency', document.currency || '—'],
      ['Total amount', document.total_amount || '—'],
      ['Source', document.source || '—'],
      ['Source value', sourceValue(document)],
    ];
    details.forEach(([label, value], index) => {
      const y = 50 + index * 14;
      pdf.setFont('helvetica', 'bold');
      pdf.text(String(label), 20, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(String(value), 75, y);
    });
    const pdfUrl = pdf.output('bloburl');
    window.open(String(pdfUrl), '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!previewDocument) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewDocument(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewDocument]);

  const clearFilterValue = (key: UploadedFilterKey) => {
    if (key === 'uploaded') setDateFilter('30');
    if (key === 'organization') setOrganizationFilter('');
    if (key === 'status') setStatusFilter('');
    if (key === 'sourceType') setSourceTypeFilter('');
    if (key === 'sourceValue') setSourceValueFilter('');
    setSelectedFilterKeys((current) => current.filter((filterKey) => filterKey !== key));
    setPage(1);
  };

  const currentFilterValue = (key: UploadedFilterKey) => {
    if (key === 'uploaded') return dateFilter;
    if (key === 'organization') return organizationFilter;
    if (key === 'status') return statusFilter;
    if (key === 'sourceType') return sourceTypeFilter;
    return sourceValueFilter;
  };

  const setCurrentFilterValue = (key: UploadedFilterKey, value: string) => {
    if (key === 'uploaded') setDateFilter(value);
    if (key === 'organization') setOrganizationFilter(value);
    if (key === 'status') setStatusFilter(value);
    if (key === 'sourceType') setSourceTypeFilter(value);
    if (key === 'sourceValue') setSourceValueFilter(value);
    setSelectedFilterKeys((current) => current.includes(key) ? current : [...current, key]);
    setPage(1);
  };

  const applyPendingFilters = () => {
    const addedFilterKeys = pendingFilterKeys.filter((key) => !visibleFilterKeys.includes(key));
    visibleFilterKeys
      .filter((key) => !pendingFilterKeys.includes(key))
      .forEach(clearFilterValue);
    if (addedFilterKeys.includes('uploaded')) {
      setSelectedFilterKeys((current) => current.includes('uploaded') ? current : [...current, 'uploaded']);
    }
    setVisibleFilterKeys(pendingFilterKeys);
    setShowFilters(false);
  };

  const clearAllFilters = () => {
    setActiveGroup('All');
    setDocumentFilter('');
    setDateFilter('30');
    setOrganizationFilter('');
    setStatusFilter('');
    setSourceTypeFilter('');
    setSourceValueFilter('');
    setVisibleFilterKeys([]);
    setPendingFilterKeys([]);
    setSelectedFilterKeys([]);
    setShowFilters(false);
    setOpenFilter(null);
    setSearchSuggestionsOpen(false);
    setHighlightedSuggestion(0);
    setShowAll(false);
    setPage(1);
  };

  const originalForDuplicate = selectedDocument && uploadedStatus(selectedDocument) === 'Duplicate'
    ? documents.find((document) => document.id !== selectedDocument.id && (
        (selectedDocument.number && document.number === selectedDocument.number) ||
        (selectedDocument.file_case && document.file_case === selectedDocument.file_case)
      ))
    : undefined;

  const originalForDocument = (document: DbDocument) => uploadedStatus(document) === 'Duplicate'
    ? documents.find((candidate) => candidate.id !== document.id && (
        (document.number && candidate.number === document.number) ||
        (document.file_case && candidate.file_case === document.file_case)
      ))
    : undefined;

  if (assigningOrganization && selectedDocument) {
    const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId);
    const purpose = (selectedDocument.document_purpose || '').trim().toLowerCase();
    const isPurchase = purpose === 'purchase' || (purpose !== 'sale' && /purchase|expense|pirk/i.test(`${selectedDocument.type} ${selectedDocument.document_type}`));
    const counterpartyName = selectedDocument.client_counterparty === 'Organization pending identification'
      ? '—'
      : selectedDocument.client_counterparty || '—';
    let counterpartyCode = '';
    try {
      const stored = JSON.parse(window.localStorage.getItem('finansu-harmonija:v7:settings:counterparties') || '[]') as Company[];
      if (Array.isArray(stored)) counterpartyCode = stored.find((party) => party.id === selectedDocument.counterparty_id || party.name.trim().toLowerCase() === counterpartyName.trim().toLowerCase())?.company_code || '';
    } catch { /* Missing optional directory data leaves the code empty. */ }
    const selectedAssignmentLines = assignmentLineMode === 'summary'
      ? selectedDocument.summary_line_items
      : selectedDocument.line_items;
    const assignmentLines = selectedAssignmentLines?.length
      ? selectedAssignmentLines
      : assignmentLineMode === 'summary' && selectedDocument.line_items?.length
        ? selectedDocument.line_items
        : assignmentLineMode === 'quantity' && selectedDocument.summary_line_items?.length
          ? selectedDocument.summary_line_items
        : [{
            id: 'empty-line', unit: '—', qty: '—', price: selectedDocument.amount_without_vat || '—',
            subtotal: selectedDocument.amount_without_vat || '—', vat: selectedDocument.vat || '—',
            vatPct: selectedDocument.vat_percent || '—', total: selectedDocument.total_amount || '—',
            productGroup: '—', department: selectedDocument.department_code || '—',
            object: selectedDocument.object_project || '—', series: selectedDocument.series || '—',
            center: selectedDocument.cost_center || '—', expense: selectedDocument.expense_account || '—',
            vatClass: selectedDocument.vat_classifier || '—', barcode: '', product: '', code: '', discount: '',
          }];
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-row overflow-y-auto">
          <section className="sticky left-0 top-0 flex h-screen w-[28%] min-w-[260px] max-w-[400px] flex-shrink-0 items-center justify-center border-r border-[#D3E1EC] bg-[#F8FDFF]">
            <div className="h-full w-full">
              {selectedDocument.image_url && (selectedDocument.image_url.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|tiff?)($|\?)/i.test(selectedDocument.image_url)) ? (
                <img src={selectedDocument.image_url} alt="Uploaded document" className="h-full w-full bg-white object-contain object-top" />
              ) : selectedDocument.image_url ? (
                <object data={selectedDocument.image_url} type="application/pdf" aria-label="Uploaded document" className="h-full w-full bg-white">
                  <div className="flex h-full items-center justify-center bg-white px-8 text-center font-montserrat text-[14px] text-[#7288A3]">PDF preview is not available in this browser.</div>
                </object>
              ) : (
                <div className="flex h-full items-center justify-center px-4">
                  <div className="flex w-full max-w-[304px] flex-col items-center gap-4 rounded-lg border-2 border-dashed border-[#D3E1EC] bg-white px-4 py-8 text-center">
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#F0F7FA]"><Upload size={28} className="text-[#007EA7]" /></div>
                    <span className="w-full whitespace-nowrap text-center font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Uploaded document</span>
                    <span className="w-full min-w-0 text-center font-montserrat text-[13px] font-medium leading-5 text-[#7288A3] [overflow-wrap:anywhere]" title={selectedDocument.file_case || selectedDocument.number || selectedDocument.id}>{selectedDocument.file_case || selectedDocument.number || selectedDocument.id}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 px-6 py-6">
                <div className="flex min-w-0 items-center gap-2">
                  <HeaderBackButton onClick={returnToUploadedDocuments} label="Back to uploaded documents" />
                  <h1 className="truncate font-montserrat text-[18px] font-semibold leading-[26px] text-[#10233A]">Assign organization · {selectedDocument.file_case || selectedDocument.number || selectedDocument.id}</h1>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button type="button" onClick={returnToUploadedDocuments} className="flex h-8 items-center rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-semibold text-[#7288A3]">Cancel</button>
                  <button type="button" disabled={!selectedOrganization} onClick={() => void assignOrganization()} className="flex h-8 items-center rounded-md bg-[#007EA7] px-4 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D3E1EC] disabled:text-[#7288A3]">Assign organization</button>
                </div>
              </header>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide">
            <div className="flex min-h-full w-full min-w-0 flex-col gap-6 px-6 pb-6">
              <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-4 rounded-lg border border-[#D3E1EC] p-4">
                <div className="contents">
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Organization</span>
                    <SearchableSelect
                      ariaLabel="Organization"
                      value={selectedOrganizationId}
                      onChange={setSelectedOrganizationId}
                      placeholder="Select organization"
                      options={organizations.map((organization) => ({
                        value: organization.id,
                        label: [organization.name, organization.company_code].filter(Boolean).join(' · '),
                      }))}
                      className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-8 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]"
                      menuClassName="min-w-[300px]"
                      emptyMessage="No organizations found."
                    />
                  </div>
                  <AssignmentField label={isPurchase ? 'Seller (LT)' : 'Buyer (LT)'} value={counterpartyName} grey />
                  <AssignmentField label="Counterparty code" value={counterpartyCode} grey />
                  <AssignmentField label="Accountable person" value={selectedDocument.accountable_responsible} />
                </div>

                {[
                  [['Invoice date', selectedDocument.invoice_contract_date || selectedDocument.document_date || '—'], ['Operation date', selectedDocument.operation_date || '—']],
                  [['Due date', selectedDocument.due_end_date || '—']],
                  [['Document Number', selectedDocument.number || '—'], ['Order number', selectedDocument.order_no || '—']],
                  [['Amount', selectedDocument.amount_without_vat || '—'], ['Total Amount', selectedDocument.total_amount || '—']],
                  [['VAT', selectedDocument.vat || '—'], ['Currency', selectedDocument.currency || '—']],
                ].map((fieldGroup, groupIndex) => (
                  <div key={groupIndex} className="contents">
                    {fieldGroup.map(([label, value]) => <AssignmentField key={label} label={label} value={value} grey={['Amount', 'Total Amount', 'VAT'].includes(label)} />)}
                  </div>
                ))}


              </div>

              <section className="flex w-full min-w-0 flex-col gap-2">
                <div className="flex items-center justify-start gap-3">
                  <div className="inline-flex rounded-md bg-[#EEF4F7] p-0.5">
                    <button type="button" onClick={() => setAssignmentLineMode('summary')} className={`h-7 rounded px-3 font-montserrat text-[11px] font-semibold transition-colors ${assignmentLineMode === 'summary' ? 'bg-white text-[#007EA7] shadow-[0_1px_3px_rgba(16,35,58,0.12)]' : 'text-[#7288A3] hover:text-[#10233A]'}`}>Summary ({selectedDocument.summary_line_items?.length || 0})</button>
                    <button type="button" onClick={() => setAssignmentLineMode('quantity')} className={`h-7 rounded px-3 font-montserrat text-[11px] font-semibold transition-colors ${assignmentLineMode === 'quantity' ? 'bg-white text-[#007EA7] shadow-[0_1px_3px_rgba(16,35,58,0.12)]' : 'text-[#7288A3] hover:text-[#10233A]'}`}>Quantity ({selectedDocument.line_items?.length || 0})</button>
                  </div>
                  <button type="button" disabled aria-label="Split" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#D3E1EC]"><Scissors size={14} strokeWidth={1.8} /></button>
                  <button type="button" disabled aria-label="Add line" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#D3E1EC] bg-white text-[#D3E1EC]"><Plus size={14} strokeWidth={1.8} /></button>
                </div>
                <h2 className="border-b border-[#D3E1EC] pb-2 font-montserrat text-[12px] font-semibold text-[#10233A]">Document lines</h2>
                <div ref={tableScrollRef} className="w-full min-w-0 overflow-x-auto scrollbar-hide">
                <div className="flex w-max min-w-full flex-col">
                  <div className="flex flex-row items-center gap-[2px] p-[5px]">
                    <div className="w-[18px] flex-shrink-0" />
                    <div className="w-6 flex-shrink-0" />
                    {[['Unit',110],['Quantity',80],['Price',90],['Amount',90],['VAT',80],['VAT %',70],['Total Amount',110],['Product group',130],['Department',100],['Object',90],['Series',80],['Center',90],['GL account',110],['VAT Classifier',110]].map(([label, width], index) => <div key={String(label)} className="flex-shrink-0 px-2 font-montserrat text-[12px] font-medium text-[#7288A3]" style={{ width: Number(width) }}>{label}{index < 7 ? <span className="ml-0.5 text-[#D64545]">*</span> : null}</div>)}
                  </div>
                  {assignmentLines.map((line, lineIndex) => (
                    <div key={line.id} className={`flex flex-row items-center gap-[2px] rounded-lg p-[5px] ${lineIndex % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                      <div className="flex w-[18px] flex-shrink-0 items-center justify-center font-montserrat text-[12px] font-medium text-[#A1B6C6]">{lineIndex + 1}</div>
                      <div className="w-6 flex-shrink-0" />
                      {[[line.unit,110],[line.qty,80],[line.price,90],[line.subtotal,90],[line.vat,80],[line.vatPct,70],[line.total,110],[line.productGroup,130],[line.department,100],[line.object,90],[line.series,80],[line.center,90],[line.expense,110],[line.vatClass,110]].map(([value, width], index) => <div key={`${line.id}-${index}`} className={`flex h-[26px] flex-shrink-0 items-center rounded border border-[#D3E1EC] px-2 font-montserrat text-[12px] font-medium leading-[18px] ${index === 6 ? 'bg-[#F7F7F7] text-[#828588]' : 'bg-white text-[#10233A]'}`} style={{ width: Number(width) }}><span className="truncate" title={String(value || '')}>{String(value || '—')}</span></div>)}
                    </div>
                  ))}
                </div>
                </div>
                <HorizontalTableScrollbar scrollRef={tableScrollRef} className="py-2" />
              </section>

              <section aria-label="Activity history" className="flex w-full min-w-0 flex-col gap-4 overflow-x-auto pb-2">
                <div className="flex items-center gap-3 pl-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                  <span className="w-[158px] text-[#10233A]">Date</span><span className="h-5 w-px bg-[#D3E1EC]" /><span className="w-[120px]">User</span><span className="h-5 w-px bg-[#D3E1EC]" /><span className="w-[136px]">Action</span><span className="h-5 w-px bg-[#D3E1EC]" /><span>Details</span>
                </div>
                <div className="flex h-9 items-center rounded-lg bg-[#F8FDFF] font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                  <span className="w-[180px] flex-shrink-0 px-3">{displayUploadedDate(selectedDocument)}</span><div className="flex flex-1 items-center gap-6 px-3"><span className="w-[120px] truncate" title={sourceValue(selectedDocument)}>{sourceValue(selectedDocument)}</span><span className="w-[136px] truncate" title="Organization identification">Organization identification</span><span>Organization assignment is required.</span></div>
                </div>
              </section>
            </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]"
    >
      <PageHeader title="Uploaded documents" />
      <SystemBreadcrumb items={["Uploaded documents"]} />

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="system-table-toolbar relative h-7 min-h-7 flex-shrink-0">
          <div ref={filterMenuRef} className="flex h-7 min-h-7 min-w-0 flex-row flex-nowrap items-center gap-1">
            <div data-native-system-filters className="relative flex-shrink-0">
              <OcrSearchField
                value={documentFilter}
                onChange={(value) => {
                  setDocumentFilter(value);
                  setSearchSuggestionsOpen(Boolean(value.trim()));
                  setHighlightedSuggestion(0);
                  setPage(1);
                }}
                onFocus={() => setSearchSuggestionsOpen(Boolean(documentFilter.trim()))}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchSuggestionsOpen(false);
                    return;
                  }
                  if (!searchSuggestions.length) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSearchSuggestionsOpen(true);
                    setHighlightedSuggestion((current) => Math.min(current + 1, searchSuggestions.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlightedSuggestion((current) => Math.max(current - 1, 0));
                  }
                  if (event.key === 'Enter' && searchSuggestionsOpen) {
                    event.preventDefault();
                    setDocumentFilter(searchSuggestions[highlightedSuggestion] ?? documentFilter);
                    setSearchSuggestionsOpen(false);
                    setPage(1);
                  }
                }}
                ariaExpanded={searchSuggestionsOpen && searchSuggestions.length > 0}
                ariaControls="uploaded-document-search-suggestions"
                ariaLabel="Search uploaded documents"
              />
              {searchSuggestionsOpen && searchSuggestions.length > 0 && (
                <div
                  id="uploaded-document-search-suggestions"
                  role="listbox"
                  aria-label="Uploaded document search suggestions"
                  className="absolute left-0 top-[32px] z-50 w-[320px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
                >
                  {searchSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      type="button"
                      role="option"
                      aria-selected={highlightedSuggestion === index}
                      onMouseEnter={() => setHighlightedSuggestion(index)}
                      onClick={() => {
                        setDocumentFilter(suggestion);
                        setSearchSuggestionsOpen(false);
                        setPage(1);
                      }}
                      className={`flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] ${highlightedSuggestion === index ? 'bg-[#F2F7FC]' : 'hover:bg-[#F2F7FC]'}`}
                    >
                      <span className="truncate">{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          <div className="flex flex-nowrap items-center gap-1" role="tablist" aria-label="Uploaded document groups">
            {(['Processing', 'Needs attention', 'Processed'] as StatusGroup[]).map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={activeGroup === group}
                onClick={() => setActiveGroup(group)}
                className={`flex h-7 items-center rounded px-3 font-montserrat text-[12px] font-medium leading-[18px] transition-colors ${activeGroup === group ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3] hover:bg-[#DCE7F6]'}`}
              >
                {group}
              </button>
            ))}
          </div>
          {visibleFilterKeys.map((key) => {
            const filter = UPLOADED_FILTERS.find((item) => item.key === key);
            if (!filter) return null;
            const value = currentFilterValue(key);
            const hasSelection = selectedFilterKeys.includes(key);
            const displayValue = filterOptions[key].find((option) => option.value === value)?.label || 'All';
            const isOpen = openFilter === key;
            return (
              <div key={key} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setOpenFilter((current) => current === key ? null : key);
                    setShowFilters(false);
                  }}
                  aria-expanded={isOpen}
                  aria-label={`Filter by ${filter.label}`}
                  className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
                >
                  <span className="truncate whitespace-nowrap">
                    {filter.label}{hasSelection && <>: <span className="text-[#10233A]">{displayValue}</span></>}
                  </span>
                  {hasSelection ? (
                    <X
                      size={15}
                      className="flex-shrink-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearFilterValue(key);
                        setOpenFilter(null);
                      }}
                    />
                  ) : (
                    <ChevronDown size={15} className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {isOpen && (
                  <div className="absolute left-0 top-[32px] z-40 min-w-[220px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white py-1 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                    <div className="max-h-[240px] overflow-y-auto">
                      {filterOptions[key].map((option) => {
                        const checked = hasSelection && value === option.value;
                        return (
                          <button
                            key={`${key}-${option.value}`}
                            type="button"
                            onClick={() => {
                              setCurrentFilterValue(key, option.value);
                              setOpenFilter(null);
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#F2F7FC]"
                          >
                            <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                              {checked && <Check size={13} strokeWidth={2.5} className="text-white" />}
                            </span>
                            <span className="font-montserrat text-[13px] font-medium text-[#10233A]">{option.label}</span>
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
                setPendingFilterKeys(visibleFilterKeys);
                setShowFilters((current) => !current);
                setOpenFilter(null);
              }}
              aria-expanded={showFilters}
              className="flex h-7 items-center gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
            >
              <Plus size={15} />
              Add filters
            </button>
            {showFilters && (
              <div
                className="absolute left-0 top-[32px] z-40 min-w-[240px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyPendingFilters();
                  }
                }}
              >
                <div className="max-h-[300px] overflow-y-auto">
                  {UPLOADED_FILTERS.map((filter) => {
                    const checked = pendingFilterKeys.includes(filter.key);
                    return (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setPendingFilterKeys((current) => checked
                          ? current.filter((key) => key !== filter.key)
                          : [...current, filter.key])}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[#F2F7FC]"
                      >
                        <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                          {checked && <Check size={13} strokeWidth={2.5} className="text-white" />}
                        </span>
                        <span className="font-montserrat text-[13px] font-medium text-[#10233A]">{filter.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-[#E5EDF9] px-2 pt-2">
                  <span className="font-montserrat text-[11px] text-[#7288A3]">Enter to apply</span>
                  <button type="button" onClick={applyPendingFilters} className="h-8 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006D91]">
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex h-7 flex-shrink-0 items-center gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
          >
            <X size={15} />
            Clear filters
          </button>
          </div>
        </div>

        {notice && <div className="rounded-lg bg-[#EAF8F3] px-4 py-2 font-montserrat text-[12px] font-medium text-[#008A6A]">{notice}</div>}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-12 bg-white">
        <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
          <div style={{ minWidth: `${columns.reduce((sum, column) => sum + column.width + 12, 0) + 24}px` }}>
            <div className="mb-4 flex h-5 flex-row items-center gap-3 pl-3">
              {columns.map((column, index) => (
                <div key={column.key} className="flex flex-shrink-0 flex-row items-center">
                  <div
                    className="relative flex flex-shrink-0 flex-row items-center gap-[6px]"
                    style={{ width: column.width }}
                  >
                    <span className="min-w-0 truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">
                      {column.label}
                    </span>
                    <ColumnSortButton
                      columnLabel={column.label}
                      direction={directionFor(column.key as UploadedColumnKey)}
                      onDirectionChange={(direction) => {
                        changeSort(column.key as UploadedColumnKey, direction);
                        setPage(1);
                      }}
                    />
                    <ResizeHandle onMouseDown={(event) => startResize(index, event)} />
                  </div>
                </div>
              ))}
            </div>

          {loading ? (
            <div className="flex min-h-44 items-center justify-center font-montserrat text-[13px] text-[#7288A3]">Loading uploaded documents…</div>
          ) : pageDocuments.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center">
              <FileText size={28} className="text-[#A1B6C6]" />
              <span className="font-montserrat text-[13px] font-semibold text-[#10233A]">No uploaded documents found</span>
            </div>
          ) : pageDocuments.map((document, index) => {
            const status = uploadedStatus(document);
            const organizationName = organizationNames.get(document.company_id || '');
            const duplicateOriginal = originalForDocument(document);
            const isSelected = selectedDocument?.id === document.id;
            return (
              <div
                key={document.id}
                role="row"
                tabIndex={0}
                onClick={() => {
                  setSelectedDocument(isSelected ? null : document);
                  setAssigningOrganization(false);
                  setIssueMode(false);
                  setNotice('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelectedDocument(isSelected ? null : document);
                }}
                className={`flex h-9 w-full cursor-pointer flex-row items-center rounded-lg px-3 transition-colors ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} ${isSelected ? '!bg-[#EAF4F8]' : 'hover:bg-[#E7F4F9]'}`}
              >
                <div className="flex h-9 min-w-0 flex-1 flex-row items-center gap-3 py-0.5">
                <div className="min-w-0 flex-shrink-0" style={{ width: columns[0].width }}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openUploadedDocument(document);
                    }}
                    className="block max-w-full truncate text-left font-montserrat text-[12px] font-normal leading-[18px] text-[#007EA7]"
                    title={document.file_case || document.number || document.id}
                  >
                    {document.file_case || document.number || document.id}
                  </button>
                  <span className="block max-w-full truncate font-montserrat text-[11px] font-normal leading-[14px] text-[#7288A3]" title={sourceValue(document)}>
                    {sourceValue(document)}
                  </span>
                </div>
                <div className="min-w-0 flex-shrink-0" style={{ width: columns[1].width }}>
                  {organizationName ? (
                    <span className="block truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{organizationName}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openOrganizationAssignment(document);
                      }}
                      className="font-montserrat text-[11px] font-semibold text-[#007EA7]"
                    >
                      Assign organization
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-shrink-0" style={{ width: columns[2].width }}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusDotColors[status] }} />
                    <span className="flex-shrink-0 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{status}</span>
                  </div>
                  {status === 'Duplicate' && duplicateOriginal ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onOpenDocument(duplicateOriginal);
                          }}
                          className="block text-left font-montserrat text-[11px] font-normal leading-[14px] text-[#007EA7] hover:underline"
                        >
                          View original
                        </button>
                  ) : (
                  <span className="block max-w-full truncate font-montserrat text-[11px] font-normal leading-[14px] text-[#7288A3]" title={statusReason(document, status)}>
                    {statusReason(document, status)}
                  </span>
                  )}
                </div>
                <span className="flex-shrink-0 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]" style={{ width: columns[3].width }}>{displayUploadedDate(document)}</span>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        <HorizontalTableScrollbar scrollRef={tableScrollRef} className="uploaded-documents-scrollbar" />
        <div className="flex flex-shrink-0 flex-row flex-wrap items-center justify-between gap-4">
          <TablePagination
            currentPage={safePage}
            totalPages={showAll ? 1 : pageCount}
            itemCount={filteredDocuments.length}
            itemsPerPage={showAll ? Math.max(1, filteredDocuments.length) : PAGE_SIZE}
            onPageChange={showAll ? () => undefined : setPage}
            onShowMore={() => {
              setShowAll((current) => !current);
              setPage(1);
            }}
            showMoreLabel={showAll ? 'Default' : 'Show more'}
            allItemsVisible={showAll}
          />
        </div>
        </section>
      </div>

      {previewDocument && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/25 p-4 sm:p-6"
          onMouseDown={() => setPreviewDocument(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Document preview ${previewDocument.file_case || previewDocument.number || previewDocument.id}`}
            className="flex h-[min(900px,94vh)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E5EDF9] px-6">
              <div className="min-w-0">
                <h2 className="truncate font-montserrat text-[18px] font-semibold text-[#10233A]">
                  {previewDocument.file_case || previewDocument.number || previewDocument.id}
                </h2>
                <p className="font-montserrat text-[11px] font-normal text-[#7288A3]">Original uploaded document · Read-only</p>
              </div>
              <button
                type="button"
                aria-label="Close document preview"
                onClick={() => setPreviewDocument(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]"
              >
                <X size={22} />
              </button>
            </header>
            <div className="min-h-0 flex-1 bg-[#EEF3F7] p-3 sm:p-5">
              {previewDocument.image_url && (previewDocument.image_url.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|tiff?)($|\?)/i.test(previewDocument.image_url)) ? (
                <img
                  src={previewDocument.image_url}
                  alt={`Uploaded document ${previewDocument.file_case || previewDocument.number || previewDocument.id}`}
                  className="h-full w-full object-contain"
                />
              ) : previewDocument.image_url ? (
                <object
                  data={previewDocument.image_url}
                  type="application/pdf"
                  aria-label={`Uploaded PDF ${previewDocument.file_case || previewDocument.number || previewDocument.id}`}
                  className="h-full w-full rounded-lg bg-white"
                >
                  <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg bg-white px-8 text-center">
                    <FileText size={36} className="text-[#007EA7]" />
                    <p className="font-montserrat text-[13px] font-medium text-[#10233A]">This browser cannot display the uploaded document.</p>
                    <a href={previewDocument.image_url} target="_blank" rel="noreferrer" className="font-montserrat text-[13px] font-semibold text-[#007EA7]">Open document</a>
                  </div>
                </object>
              ) : (
                <div className="h-full overflow-y-auto rounded-lg bg-[#E9EFF4] p-5 sm:p-8">
                  <article className="mx-auto min-h-full w-full max-w-[760px] bg-white px-8 py-10 shadow-sm sm:px-14 sm:py-12">
                    <header className="flex items-start justify-between gap-8 border-b border-[#D3E1EC] pb-7">
                      <div className="min-w-0">
                        <p className="font-montserrat text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7288A3]">Uploaded document</p>
                        <h3 className="mt-2 break-words font-montserrat text-[24px] font-semibold leading-8 text-[#10233A]">
                          {previewDocument.file_case || previewDocument.number || previewDocument.id}
                        </h3>
                      </div>
                      <FileText size={42} strokeWidth={1.4} className="flex-shrink-0 text-[#007EA7]" />
                    </header>
                    <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
                      {[
                        ['Document type', previewDocument.document_type || previewDocument.type || '—'],
                        ['Document number', previewDocument.number || '—'],
                        ['Organization', organizationNames.get(previewDocument.company_id || '') || '—'],
                        ['Client / Counterparty', previewDocument.client_counterparty || '—'],
                        ['Document date', previewDocument.document_date || '—'],
                        ['Received', displayUploadedDate(previewDocument)],
                        ['Currency', previewDocument.currency || '—'],
                        ['Total amount', previewDocument.total_amount || '—'],
                        ['Source', previewDocument.source || '—'],
                        ['Source value', sourceValue(previewDocument)],
                      ].map(([label, value]) => (
                        <div key={label} className="border-b border-[#E5EDF9] pb-3">
                          <dt className="font-montserrat text-[11px] font-semibold text-[#7288A3]">{label}</dt>
                          <dd className="mt-1 break-words font-montserrat text-[13px] font-normal leading-5 text-[#10233A]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedDocument && (
        <>
          <button
            type="button"
            aria-label="Close document details"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeSidePanel();
            }}
            className="fixed inset-0 z-[69] cursor-default bg-transparent"
          />
          <aside className="fixed bottom-0 right-0 top-0 z-[70] flex w-[390px] max-w-[calc(100vw-24px)] flex-col border-l border-[#D3E1EC] bg-white shadow-[-12px_0_32px_rgba(16,35,58,0.12)]">
            <div className="border-b border-[#D3E1EC] px-6 py-5">
              <h2 className="truncate font-montserrat text-[18px] font-semibold text-[#10233A]">{selectedDocument.file_case || selectedDocument.number || selectedDocument.id}</h2>
              <p className="mt-1 font-montserrat text-[11px] font-medium text-[#7288A3]">Click anywhere outside this panel to close it.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <dl className="space-y-4">
                {[
                  ['Status', uploadedStatus(selectedDocument)],
                  ['Reason', statusReason(selectedDocument, uploadedStatus(selectedDocument))],
                  ['Organization', organizationNames.get(selectedDocument.company_id || '') || 'Organization not identified'],
                  ['Source', selectedDocument.source || '—'],
                  ['Source value', sourceValue(selectedDocument)],
                  ['Uploaded', displayUploadedDate(selectedDocument)],
                  ['Processed', uploadedStatus(selectedDocument) === 'Processed' ? displayUploadedDate(selectedDocument) : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-montserrat text-[11px] font-semibold text-[#7288A3]">{label}</dt>
                    <dd className="mt-1 whitespace-normal font-montserrat text-[13px] font-medium leading-5 text-[#10233A]">
                      {label === 'Reason' && originalForDuplicate ? (
                        <button type="button" onClick={() => void onOpenDocument(originalForDuplicate)} className="text-[#007EA7] hover:underline">View original</button>
                      ) : value}
                    </dd>
                  </div>
                ))}
              </dl>

              {issueMode && (
                <section className="mt-6 rounded-xl border border-[#D3E1EC] p-4">
                  <label className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                    Required comment <span className="text-[#D64545]">*</span>
                  </label>
                  <textarea value={issueComment} onChange={(event) => setIssueComment(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-lg border border-[#D3E1EC] p-3 font-montserrat text-[12px] outline-none focus:border-[#007EA7]" />
                  <button type="button" disabled={!issueComment.trim()} onClick={() => void reportIssue()} className="mt-3 h-9 w-full rounded-lg bg-[#007EA7] font-montserrat text-[12px] font-semibold text-white disabled:opacity-40">Send to OCR review</button>
                </section>
              )}

            </div>
            <footer className="space-y-3 border-t border-[#D3E1EC] px-6 py-5">
              {uploadedStatus(selectedDocument) === 'Processed' && selectedDocument.company_id && (
                <button type="button" onClick={() => void onOpenDocument(selectedDocument)} className="h-[42px] w-full rounded-lg bg-[#007EA7] font-montserrat text-[14px] font-semibold text-white">Open in organization</button>
              )}
              {!selectedDocument.company_id && (
                <button type="button" onClick={() => openOrganizationAssignment(selectedDocument)} className="h-[42px] w-full rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[14px] font-semibold text-[#007EA7]">Assign organization</button>
              )}
              <button type="button" onClick={() => setIssueMode(true)} className="flex h-[42px] w-full items-center justify-center gap-2 rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[14px] font-semibold text-[#7288A3]"><AlertCircle size={16} />Report OCR issue</button>
            </footer>
          </aside>
        </>
      )}
    </div>
  );
}
