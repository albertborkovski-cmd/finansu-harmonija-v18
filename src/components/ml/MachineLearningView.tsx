import { useMemo, useState } from 'react';
import { RefreshCw, Users, ArrowLeft, BrainCircuit } from 'lucide-react';
import { useColumnResize, ResizeHandle } from '../useColumnResize';
import ColumnSettingsPanel, { type ColConfig } from '../ColumnSettingsPanel';
import { PageActionButton, PageHeader } from '../PageHeader';
import OcrBreadcrumb from '../OcrBreadcrumb';
import HorizontalTableScrollbar from '../HorizontalTableScrollbar';
import TablePagination from '../TablePagination';
import OcrSearchField from '../OcrSearchField';
import type { DocumentEntry, DocumentSet, DetailTab } from './types';
import GeneralTab from './GeneralTab';
import DocumentsTab from './DocumentsTab';
import { ProcessedDocumentsTable } from '../OcrProcessedDocumentsView';
import DocumentTypesTab from './DocumentTypesTab';
import LogsTab from './LogsTab';
import StatsTab from './StatsTab';
import CreateSetPanel from './CreateSetPanel';
import TrainModelModal from './TrainModelModal';
import { ColumnSettingsButton } from '../ScopedActionButtons';
import ImportButton from '../ImportButton';
import { WorkspaceDocumentEditor, type WorkspaceTask } from '../WorkspaceView';
import ColumnSortButton, { useMultiColumnSort } from '../ColumnSortButton';
import { BulkDeleteButton, RowDeleteButton } from '../DeleteButtons';
import { matchesTextSearch } from '../../utils/textSearch';
import { usePersistentState } from '../../hooks/usePersistentState';
import { supabase } from '../../lib/supabase';

const SAMPLE_SETS: DocumentSet[] = [
  { id: '1', name: 'Invoice Processing', description: 'OCR extraction for invoices', platform: 'RPA platform', date: '10.04.2026 12:22' },
  { id: '2', name: 'Contract Analysis', description: 'Document classification', platform: 'RPA platform', date: '09.04.2026 15:41' },
  { id: '3', name: 'Receipt Scanning', description: 'Receipt data extraction', platform: 'ML platform', date: '08.04.2026 09:13' },
  { id: '4', name: 'ID Verification', description: 'Identity document check', platform: 'RPA platform', date: '07.04.2026 18:05' },
  { id: '5', name: 'Form Recognition', description: 'Structured form parsing', platform: 'ML platform', date: '06.04.2026 11:30' },
  { id: '6', name: 'Medical Records', description: 'Healthcare doc processing', platform: 'RPA platform', date: '05.04.2026 14:22' },
];

const INITIAL_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 280, visible: true },
  { key: 'description', label: 'Description', width: 220, visible: true },
  { key: 'documentsCount', label: 'Documents count', width: 180, visible: false },
  { key: 'status', label: 'Status', width: 130, visible: false },
  { key: 'createdBy', label: 'Created by', width: 160, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 160, visible: true },
  { key: 'updatedBy', label: 'Updated by', width: 160, visible: false },
  { key: 'lastUpdate', label: 'Last update', width: 160, visible: false },
  { key: 'documentType', label: 'Document type', width: 160, visible: false },
];

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label="Select document set"
      aria-checked={checked}
      className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
      style={{ background: checked ? '#007EA7' : '#FFFFFF', border: checked ? 'none' : '1px solid #A1B6C6' }}
      onClick={(event) => { event.stopPropagation(); onChange(); }}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'general', label: 'Details' },
  { id: 'documents', label: 'Documents' },
  { id: 'document-types', label: 'Autoretrain scheduler' },
  { id: 'logs', label: 'Runs' },
  { id: 'stats', label: 'Metrics' },
];

const GROUP_MEMBERS = Array.from({ length: 4 }, (_, index) => ({
  id: `group-member-${index + 1}`,
  name: 'MESO',
  description: '—',
  permission: 'Create',
}));

const GROUP_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 278, visible: true },
  { key: 'description', label: 'Description', width: 322, visible: true },
  { key: 'permission', label: 'Permission', width: 166, visible: true },
];

function GroupManagementView({ documentSet, onBack, onOpenDocumentSet }: { documentSet: DocumentSet; onBack: () => void; onOpenDocumentSet: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [groupPage, setGroupPage] = useState(1);
  const [showGroupColumnSettings, setShowGroupColumnSettings] = useState(false);
  const [groupColumns, setGroupColumns] = usePersistentState<ColConfig[]>('finansu-harmonija:v7:ml-group-columns', GROUP_COLUMNS);
  const [groupMembers, setGroupMembers] = usePersistentState('finansu-harmonija:v7:ml-group-members', GROUP_MEMBERS);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = groupMembers.filter((member) => !normalizedQuery || `${member.name} ${member.description} ${member.permission}`.toLowerCase().includes(normalizedQuery));
  const { sortedRows: members, changeSort: changeGroupSort, directionFor: groupDirectionFor } = useMultiColumnSort(filteredMembers, (member, key) => member[key as keyof typeof member]);
  const visibleGroupColumns = groupColumns.filter((column) => column.visible);
  const groupTableMinWidth = visibleGroupColumns.reduce((total, column) => total + column.width, 36);

  const toggleMember = (id: string) => setSelectedMembers((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex min-h-full flex-col gap-8 bg-white px-9 py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <div className="flex flex-col gap-4">
        <PageHeader title={`Group Management (${documentSet.name})`} leading={<button type="button" aria-label="Back to Document sets" onClick={onBack} className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><ArrowLeft size={18} strokeWidth={2} /></button>} actions={<><PageActionButton disabled>Add</PageActionButton><PageActionButton disabled>Create new</PageActionButton></>} />
        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium leading-[17px]">
          <button type="button" onClick={onBack} className="text-[#7288A3]">Document sets</button><span className="text-[#A1B6C6]">/</span><span className="text-[#A1B6C6]">Group Management ({documentSet.name})</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex items-center justify-between gap-2">
          <OcrSearchField ariaLabel="Search group members" value={query} onChange={setQuery} />
          <div className="flex h-7 items-center gap-4 rounded bg-white p-1.5 text-[#7288A3]">
            <BulkDeleteButton selectedCount={selectedMembers.size} onDelete={() => { setGroupMembers(current => current.filter(member => !selectedMembers.has(member.id))); setSelectedMembers(new Set()); }} label="Delete selected group members" />
            <ColumnSettingsButton onClick={() => setShowGroupColumnSettings(true)} />
            <ImportButton scope="Machine learning group members" />
            <button type="button" title="REFRESH ALL" aria-label="Refresh all group members" onClick={() => setGroupMembers(current => current.map(member => ({ ...member })))} className="flex h-4 w-4 items-center justify-center hover:text-[#007EA7]"><RefreshCw size={16} /></button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-12 overflow-x-auto scrollbar-hide">
          <div style={{ minWidth: Math.max(760, groupTableMinWidth) }}>
            <div className="flex h-5 items-center px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
              {visibleGroupColumns.map((column) => (
                <div key={column.key} className={`flex flex-shrink-0 items-center gap-3 ${column.key === 'name' ? 'text-[#10233A]' : ''}`} style={{ width: column.width }}>
                  {column.key === 'name' && <Checkbox checked={selectedMembers.size === members.length && members.length > 0} onChange={() => setSelectedMembers(selectedMembers.size === members.length ? new Set() : new Set(members.map((member) => member.id)))} />}
                  <span>{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={groupDirectionFor(column.key)} onDirectionChange={direction => { changeGroupSort(column.key, direction); setGroupPage(1); }} />
                </div>
              ))}
              <span className="w-9 flex-shrink-0" />
            </div>
            <div className="mt-4 flex flex-col">
              {members.map((member, index) => (
                <div key={member.id} className={`flex h-9 items-center rounded-lg font-montserrat text-[12px] leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                  {visibleGroupColumns.map((column) => (
                    <div key={column.key} className="flex flex-shrink-0 items-center gap-3 truncate px-3" style={{ width: column.width }}>
                      {column.key === 'name' && <Checkbox checked={selectedMembers.has(member.id)} onChange={() => toggleMember(member.id)} />}
                      {column.key === 'name' ? (
                        <button type="button" aria-label={`Open ${member.name} document set ${index + 1}`} onClick={onOpenDocumentSet} className="truncate text-left hover:text-[#007EA7] hover:underline">{member.name}</button>
                      ) : (
                        <span className="truncate">{member[column.key as 'description' | 'permission']}</span>
                      )}
                    </div>
                  ))}
                  <span className="flex h-9 items-center p-1"><RowDeleteButton label={`Delete ${member.name} group member ${index + 1}`} onDelete={() => { setGroupMembers(current => current.filter(item => item.id !== member.id)); setSelectedMembers(current => { const next = new Set(current); next.delete(member.id); return next; }); }} /></span>
                </div>
              ))}
            </div>
          </div>

          <HorizontalTableScrollbar />

          <div className="flex items-center justify-between gap-4">
            <TablePagination currentPage={groupPage} totalPages={9} itemCount={members.length} onPageChange={setGroupPage} />
          </div>
        </div>
      </div>

      {showGroupColumnSettings && (
        <ColumnSettingsPanel
          columns={groupColumns}
          defaultColumns={GROUP_COLUMNS}
          onSave={setGroupColumns}
          onClose={() => setShowGroupColumnSettings(false)}
        />
      )}
    </div>
  );
}

export default function MachineLearningView({
  onOpenAutomationProcess,
  openInvoiceProcessingDocuments = false,
}: {
  onOpenAutomationProcess?: (processId: string, processName: string, runId?: string) => void;
  openInvoiceProcessingDocuments?: boolean;
}) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [detailSet, setDetailSet] = useState<DocumentSet | null>(() =>
    openInvoiceProcessingDocuments
      ? SAMPLE_SETS.find(documentSet => documentSet.name === 'Invoice Processing') ?? null
      : null
  );
  const [activeTab, setActiveTab] = useState<DetailTab>(openInvoiceProcessingDocuments ? 'documents' : 'general');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [trainingSet, setTrainingSet] = useState<DocumentSet | null>(null);
  const [managedSet, setManagedSet] = useState<DocumentSet | null>(null);
  const [detailDocumentName, setDetailDocumentName] = useState<string | null>(null);
  const [detailDocumentQueue, setDetailDocumentQueue] = useState<DocumentEntry[]>([]);
  const [detailDocumentIndex, setDetailDocumentIndex] = useState(-1);
  const [runNotice, setRunNotice] = useState('');
  const [savedDocumentTasks, setSavedDocumentTasks] = usePersistentState<Record<string, WorkspaceTask>>('finansu-harmonija:v7:ml-document-tasks', {});
  const [columns, setColumns] = usePersistentState<ColConfig[]>('finansu-harmonija:v7:ml-document-set-columns', INITIAL_COLUMNS);
  const [documentSets, setDocumentSets] = usePersistentState<DocumentSet[]>('finansu-harmonija:v7:ml-document-sets', SAMPLE_SETS);
  const [query, setQuery] = useState('');
  const { startResize } = useColumnResize(columns, setColumns);
  const totalPages = 10;
  const visibleColumns = columns.filter(column => column.visible);
  const tableMinWidth = visibleColumns.reduce((total, column) => total + column.width, 68);
  const filteredSets = useMemo(() => documentSets.filter(documentSet => matchesTextSearch(documentSet, query)), [documentSets, query]);
  const { sortedRows: sortedSets, changeSort, directionFor } = useMultiColumnSort(filteredSets, (documentSet, key) => documentSet[key as keyof DocumentSet] as string | number | undefined);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === documentSets.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(documentSets.map(s => s.id)));
    }
  };

  if (managedSet) {
    return <GroupManagementView documentSet={managedSet} onBack={() => setManagedSet(null)} onOpenDocumentSet={() => { setDetailSet(managedSet); setManagedSet(null); setActiveTab('general'); }} />;
  }

  if (detailSet && detailDocumentName) {
    const currentDocument = detailDocumentQueue[detailDocumentIndex];
    const documentId = currentDocument?.id ?? detailDocumentName;
    const storageKey = `${detailSet.id}:${documentId}`;
    const hasNextFile = detailDocumentIndex >= 0 && detailDocumentIndex < detailDocumentQueue.length - 1;
    return (
      <WorkspaceDocumentEditor
        key={storageKey}
        documentName={detailDocumentName}
        documentId={documentId}
        savedTask={savedDocumentTasks[storageKey]}
        filePosition={detailDocumentIndex + 1}
        fileTotal={detailDocumentQueue.length}
        onSave={task => setSavedDocumentTasks(current => ({ ...current, [storageKey]: task }))}
        onNextFile={hasNextFile ? () => {
          const nextIndex = detailDocumentIndex + 1;
          const nextDocument = detailDocumentQueue[nextIndex];
          setDetailDocumentIndex(nextIndex);
          setDetailDocumentName(nextDocument.name);
        } : undefined}
        onBack={() => {
          setDetailDocumentName(null);
          setDetailDocumentQueue([]);
          setDetailDocumentIndex(-1);
          setActiveTab('documents');
        }}
      />
    );
  }

  if (detailSet) {
    return (
      <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
        <PageHeader
          title={openInvoiceProcessingDocuments ? "Machine learning" : "Document set"}
          leading={openInvoiceProcessingDocuments ? undefined : <button onClick={() => { setDetailSet(null); setActiveTab('general'); }} className="flex items-center justify-center py-[9px] px-[1px]"><ArrowLeft size={16} className="text-[#7288A3]" strokeWidth={2} /></button>}
          actions={<PageActionButton disabled>Runs</PageActionButton>}
        />

        {openInvoiceProcessingDocuments ? (
          <OcrBreadcrumb items={["Machine learning"]} />
        ) : (
          <div className="flex flex-row items-center gap-2">
            <button onClick={() => { setDetailSet(null); setActiveTab('general'); }} className="flex flex-col items-start">
              <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3]">Machine learning</span>
            </button>
            {!openInvoiceProcessingDocuments && (
              <>
                <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
                <button onClick={() => { setDetailSet(null); setActiveTab('general'); }} className="flex flex-col items-start">
                  <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3]">Document sets</span>
                </button>
              </>
            )}
            {!openInvoiceProcessingDocuments && (
              <>
                <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
                <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">{detailSet.name}</span>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        {!openInvoiceProcessingDocuments && (
          <div className="flex flex-row items-end gap-0 border-b border-[#E5EDF9] flex-shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative px-4 pb-3 pt-1"
              >
                <span className={`font-montserrat font-semibold text-[14px] leading-5 transition-colors ${
                  activeTab === tab.id ? 'text-[#007EA7]' : 'text-[#7288A3]'
                }`}>
                  {tab.label}
                </span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#007EA7] rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === 'general' && <GeneralTab documentSet={detailSet} onUpdate={(updates) => { setDetailSet(current => current ? { ...current, ...updates } : current); setDocumentSets(current => current.map(item => item.id === detailSet.id ? { ...item, ...updates } : item)); }} />}
              {activeTab === 'documents' && (openInvoiceProcessingDocuments
                ? <ProcessedDocumentsTable
                    embedded
                    reviewOnly
                    selectable
                    onEditDocument={(document, index, documents) => {
                      const queue: DocumentEntry[] = documents.map((item) => ({ id: item.id, name: item.name, status: 'pending' }));
                      setDetailDocumentQueue(queue);
                      setDetailDocumentIndex(index);
                      setDetailDocumentName(document.name);
                    }}
                    onRunDocument={async (document) => {
                      const result = await supabase
                        .from('documents')
                        .update({ status: 'Processing' })
                        .eq('id', document.id);
                      if (result.error) {
                        setRunNotice(`${document.name} could not be started: ${result.error.message}`);
                        return;
                      }
                      window.dispatchEvent(new CustomEvent('finansu-harmonija:data-changed'));
                      setRunNotice(`${document.name} started.`);
                    }}
                  />
                : <DocumentsTab onOpenDocument={(document, index, documents) => {
                    setDetailDocumentQueue(documents);
                    setDetailDocumentIndex(index);
                    setDetailDocumentName(document.name);
                  }} />)}
          {activeTab === 'document-types' && <DocumentTypesTab />}
          {activeTab === 'logs' && <LogsTab
            onOpenProcess={(processId, processName) => onOpenAutomationProcess?.(processId, processName)}
            onOpenRun={(processId, processName, runId) => onOpenAutomationProcess?.(processId, processName, runId)}
          />}
          {activeTab === 'stats' && <StatsTab />}
        </div>

        {/* Train model modal */}
        {trainingSet && <TrainModelModal documentSetName={trainingSet.name} onClose={() => setTrainingSet(null)} />}
        {runNotice && <div role="status" className="fixed bottom-6 right-6 z-[240] rounded-lg bg-[#E7F7EF] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#237A50] shadow-lg">{runNotice}</div>}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      {/* Header */}
      <PageHeader title="Document sets" actions={<><PageActionButton onClick={() => setShowCreatePanel(true)}>Create new set</PageActionButton><PageActionButton disabled>Execute model</PageActionButton></>} />
      <OcrBreadcrumb items={["Machine learning", "Document sets"]} />

      {/* Content */}
      <div className="flex flex-col gap-6 flex-1">
        {/* Filter bar */}
        <div className="flex-shrink-0">
          <div className="flex flex-row flex-wrap justify-between items-center gap-2">
            <div className="flex flex-row items-center gap-1 flex-1 min-w-0">
              <OcrSearchField ariaLabel="Search document sets" value={query} onChange={setQuery} />
            </div>
            <div className="flex flex-row items-center p-[6px] gap-4 bg-white rounded flex-shrink-0">
              <BulkDeleteButton selectedCount={selectedRows.size} onDelete={() => { setDocumentSets(current => current.filter(item => !selectedRows.has(item.id))); setSelectedRows(new Set()); }} />
              <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
              <ImportButton scope="Document sets" />
              <button onClick={() => setDocumentSets(current => current.map(documentSet => ({ ...documentSet })))} className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors" title="REFRESH ALL">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex flex-col gap-12 flex-1">
          <div className="overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: Math.max(900, tableMinWidth) }}>
              {/* Column headers */}
              <div className="system-table-header-row flex flex-row items-center pl-3 gap-0 h-5 mb-4">
                {visibleColumns.map((col) => {
                  const colRealIdx = columns.findIndex(c => c.key === col.key);
                  return (
                    <div data-table-header-select={col.key === 'name' ? "true" : undefined} key={col.key} className="relative flex flex-row items-center gap-0 flex-shrink-0" style={{ width: col.width }}>
                      <div className="flex flex-row items-center gap-[6px] flex-1 min-w-0">
                        {col.key === 'name' && (
                          <>
                            <Checkbox checked={selectedRows.size === documentSets.length && documentSets.length > 0} onChange={toggleAll} />
                            <div className="flex flex-row items-center gap-[6px]">
                              <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A] truncate">{col.label}</span>
                              <ColumnSortButton columnLabel={col.label} direction={directionFor(col.key)} onDirectionChange={direction => { changeSort(col.key, direction); setCurrentPage(1); }} />
                            </div>
                          </>
                        )}
                        {col.key !== 'name' && <><span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3] truncate">{col.label}</span><ColumnSortButton columnLabel={col.label} direction={directionFor(col.key)} onDirectionChange={direction => { changeSort(col.key, direction); setCurrentPage(1); }} /></>}
                      </div>
                      <ResizeHandle onMouseDown={(e) => startResize(colRealIdx, e)} />
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {sortedSets.map((set, i) => (
                  <div
                    key={set.id}
                    className={`group flex h-9 w-full flex-row items-center rounded-lg ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} transition-colors hover:bg-[#E7F4F9]`}
                  >
                    {visibleColumns.map((column) => {
                      const values: Record<string, string> = {
                        name: set.name,
                        description: set.description,
                        documentsCount: String(18 + i * 7),
                        status: i % 3 === 2 ? 'Draft' : 'Active',
                        createdBy: set.platform,
                        creationDate: set.date,
                        updatedBy: set.platform,
                        lastUpdate: set.date,
                        documentType: ['Invoice', 'Contract', 'Receipt', 'Identity', 'Form', 'Medical'][i] ?? 'Document',
                      };
                      return (
                        <div key={column.key} className="system-table-select-cell flex h-9 flex-shrink-0 items-center gap-1.5 px-3 py-[9px]" style={{ width: column.width }}>
                          {column.key === 'name' && <Checkbox checked={selectedRows.has(set.id)} onChange={() => toggleRow(set.id)} />}
                          {column.key === 'name' ? (
                            <button
                              type="button"
                              onClick={() => setDetailSet(set)}
                              className="min-w-0 truncate text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline"
                            >
                              {values[column.key] ?? '—'}
                            </button>
                          ) : (
                            <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{values[column.key] ?? '—'}</span>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex flex-row items-center p-1 gap-1 flex-shrink-0 h-9" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        title="Train model"
                        aria-label={`Train model for ${set.name}`}
                        onClick={() => setTrainingSet(set)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                      >
                        <BrainCircuit size={16} strokeWidth={1.8} />
                      </button>
                      <button type="button" aria-label={`Open ${set.name} group management`} onClick={() => setManagedSet(set)} className="w-7 h-7 flex items-center justify-center bg-white border-2 border-[#D3E1EC] rounded hover:border-[#007EA7] transition-colors">
                        <Users size={16} className="text-[#7288A3]" />
                      </button>
                      <RowDeleteButton label={`Delete ${set.name}`} onDelete={() => { setDocumentSets(current => current.filter(item => item.id !== set.id)); setSelectedRows(current => { const next = new Set(current); next.delete(set.id); return next; }); }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <HorizontalTableScrollbar />

          {/* Footer / Pagination */}
          <div className="flex flex-row flex-wrap justify-between items-center gap-4 flex-shrink-0">
            <TablePagination currentPage={currentPage} totalPages={totalPages} itemCount={SAMPLE_SETS.length} onPageChange={setCurrentPage} />
          </div>
        </div>
      </div>

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={INITIAL_COLUMNS}
          onSave={setColumns}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Create Set Panel */}
      {showCreatePanel && <CreateSetPanel onClose={() => setShowCreatePanel(false)} />}

      {/* Train Model Modal */}
      {trainingSet && <TrainModelModal documentSetName={trainingSet.name} onClose={() => setTrainingSet(null)} />}
    </div>
  );
}
