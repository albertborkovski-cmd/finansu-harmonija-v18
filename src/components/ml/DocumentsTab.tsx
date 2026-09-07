import { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { RefreshCw, ExternalLink, Play, Settings, X, RotateCcw, ArrowLeftRight, ClipboardList, BarChart3, ClipboardCheck, Brush } from 'lucide-react';
import type { DocumentEntry } from './types';
import ColumnSettingsPanel, { type ColConfig } from '../ColumnSettingsPanel';
import HorizontalTableScrollbar from '../HorizontalTableScrollbar';
import TablePagination from '../TablePagination';
import OcrSearchField from '../OcrSearchField';
import { useColumnResize, ResizeHandle } from '../useColumnResize';
import ColumnSortButton, { useMultiColumnSort } from '../ColumnSortButton';
import { BulkDeleteButton } from '../DeleteButtons';
import { ColumnSettingsButton } from '../ScopedActionButtons';
import ImportButton from '../ImportButton';

const INITIAL_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 226, visible: true },
  { key: 'status', label: 'Status', width: 140, visible: true },
  { key: 'createdBy', label: 'Created by', width: 160, visible: true },
  { key: 'size', label: 'Size', width: 100, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 160, visible: true },
  { key: 'lastUpdate', label: 'Last update', width: 160, visible: true },
  { key: 'id', label: 'ID', width: 100, visible: true },
  { key: 'version', label: 'Version', width: 100, visible: true },
  { key: 'pages', label: 'Pages', width: 100, visible: true },
];

const SAMPLE_DOCS: DocumentEntry[] = [
  { id: '1', name: 'Invoice1-047985462m.pdf', status: 'success' },
  { id: '2', name: 'Invoice1-047985462m.pdf', status: 'success' },
  { id: '3', name: 'Invoice1-047985462m.pdf', status: 'success' },
  { id: '4', name: 'Invoice1-047985462m.pdf', status: 'success' },
];

const RUN_ACTIONS = [
  { id: 'preprocess', label: 'Preprocess', Icon: RotateCcw },
  { id: 'execute-model', label: 'Execute Model', Icon: Play },
  { id: 'move-to-human', label: 'Move Model to Human', Icon: ArrowLeftRight },
  { id: 'send-to-workspace', label: 'Send to Workspace', Icon: ClipboardList },
  { id: 'generate-report', label: 'Generate Model Report', Icon: BarChart3 },
  { id: 'prepare-training-set', label: 'Prepare training set', Icon: ClipboardCheck },
  { id: 'clean-up', label: 'Clean Up', Icon: Brush },
] as const;

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
      style={{ background: checked ? '#007EA7' : '#FFFFFF', border: checked ? 'none' : '1px solid #A1B6C6' }}
      onClick={onChange}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default function DocumentsTab({
  onOpenDocument,
}: {
  onOpenDocument?: (document: DocumentEntry, index: number, documents: DocumentEntry[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [selectedRunActions, setSelectedRunActions] = useState<Set<string>>(new Set());
  const [runNotice, setRunNotice] = useState('');
  const [columns, setColumns] = usePersistentState<ColConfig[]>('finansu-harmonija:v7:ml-document-columns', INITIAL_COLUMNS);
  const [documents, setDocuments] = usePersistentState<DocumentEntry[]>('finansu-harmonija:v7:ml-documents', SAMPLE_DOCS);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter(column => column.visible);
  const totalPages = 9 as const;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleDocuments = documents.filter((document) => !normalizedQuery || `${document.name} ${document.status}`.toLowerCase().includes(normalizedQuery));
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(visibleDocuments, (document, key) => {
    const values: Record<string, string> = { name: document.name, status: document.status, createdBy: 'Viltvidas Voronkovas', size: '2.4 MB', creationDate: '05.04.2026 14:22', lastUpdate: '05.04.2026 14:22', id: document.id, version: '1.0', pages: '3' };
    return values[key] ?? '—';
  });

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === documents.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(documents.map(d => d.id)));
    }
  };

  const toggleRunAction = (actionId: string) => {
    setSelectedRunActions(current => {
      const next = new Set(current);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  };

  const runOnAllDocuments = () => {
    if (selectedRunActions.size === 0) return;
    setDocuments(current => current.map(document => ({ ...document, status: 'processing' })));
    setRunNotice(`${selectedRunActions.size} process${selectedRunActions.size === 1 ? '' : 'es'} started for all documents.`);
    setShowRunPanel(false);
    setSelectedRunActions(new Set());
    window.setTimeout(() => setRunNotice(''), 3200);
  };

  const documentCell = (document: DocumentEntry, key: string) => {
    const values: Record<string, string> = {
      name: document.name,
      status: document.status,
      createdBy: 'Viltvidas Voronkovas',
      size: '2.4 MB',
      creationDate: '05.04.2026 14:22',
      lastUpdate: '05.04.2026 14:22',
      id: document.id,
      version: '1.0',
      pages: '3',
    };
    return values[key] ?? '—';
  };

  return (
    <div className="flex flex-col gap-6 flex-1">
      {/* Toolbar */}
      <div className="flex flex-row flex-wrap justify-between items-center gap-2 flex-shrink-0">
        <div className="flex flex-row items-center gap-1 flex-1 min-w-0">
          <OcrSearchField ariaLabel="Search documents" value={query} onChange={setQuery} />
        </div>
        <div className="flex flex-row items-center p-[6px] gap-4 bg-white rounded flex-shrink-0">
          <BulkDeleteButton selectedCount={selectedRows.size} onDelete={() => { setDocuments(current => current.filter(document => !selectedRows.has(document.id))); setSelectedRows(new Set()); }} />
          <button className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors" title="Settings">
            <Settings size={16} />
          </button>
          <button type="button" onClick={() => setShowRunPanel(true)} className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors" title="Run" aria-label="Run on all documents">
            <Play size={16} />
          </button>
          <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
          <ImportButton scope="Document set documents" />
          <button onClick={() => setDocuments(current => current.map(document => ({ ...document })))} className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors" title="REFRESH ALL">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-col gap-4 flex-1 overflow-x-auto scrollbar-hide">
        {/* Headers */}
        <div className="flex min-w-max flex-row items-center gap-3 pl-3 h-5">
          {visibleColumns.map((column) => {
            const realIndex = columns.findIndex(item => item.key === column.key);
            return (
                <div data-table-header-select={column.key === 'name' ? "true" : undefined} key={column.key} className="relative flex flex-row items-center gap-[6px] flex-shrink-0" style={{ width: column.width }}>
                  {column.key === 'name' && <Checkbox checked={selectedRows.size === documents.length && documents.length > 0} onChange={toggleAll} />}
                  <span className={`font-montserrat font-medium text-[12px] leading-[18px] ${column.key === 'name' ? 'text-[#10233A]' : 'text-[#7288A3]'}`}>{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => { changeSort(column.key, direction); setCurrentPage(1); }} />
                  <ResizeHandle onMouseDown={(e) => startResize(realIndex, e)} />
                </div>
            );
          })}
          <div className="w-9 flex-shrink-0" />
        </div>

        {/* Rows */}
        <div className="flex flex-col">
          {sortedRows.map((doc, idx) => (
            <div
              key={doc.id}
              className={`flex min-w-max flex-row items-center gap-3 h-9 rounded-lg px-3 transition-colors group ${
                idx % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'
              } hover:bg-[#E7F4F9]`}
            >
              {visibleColumns.map(column => (
                <div key={column.key} className="contents">
                  <div className="flex flex-shrink-0 items-center gap-[6px] overflow-hidden" style={{ width: column.width }}>
                    {column.key === 'name' && <Checkbox checked={selectedRows.has(doc.id)} onChange={() => toggleRow(doc.id)} />}
                    {column.key === 'status' && <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#D3E1EC]" />}
                    <span className="truncate font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A]">{documentCell(doc, column.key)}</span>
                  </div>
                </div>
              ))}
              <div className="flex h-9 w-9 flex-shrink-0 items-center p-1"><button type="button" title="OPEN DOCUMENT" aria-label={`OPEN DOCUMENT ${doc.name} ${idx + 1}`} onClick={() => onOpenDocument?.(doc, idx, sortedRows)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7]"><ExternalLink size={16} /></button></div>
            </div>
          ))}
        </div>
      </div>

      <HorizontalTableScrollbar />

      {/* Pagination */}
      <div className="flex flex-row items-center justify-between gap-4 flex-shrink-0 pt-2">
        <TablePagination currentPage={currentPage} totalPages={totalPages} itemCount={visibleDocuments.length} onPageChange={setCurrentPage} />
        <div className="flex items-center gap-[14px]"><span className="whitespace-nowrap font-montserrat font-normal text-[12px] leading-[18px] text-[#7288A3]">14 from 15,000 items</span><button className="flex items-center justify-center px-3 py-[6px] gap-1 border-2 border-[#D3E1EC] rounded-md h-8 hover:border-[#007EA7] transition-colors"><span className="font-montserrat font-semibold text-[14px] leading-5 text-[#7288A3]">View all</span></button></div>
      </div>

      {showColumnSettings && (
        <ColumnSettingsPanel columns={columns} defaultColumns={INITIAL_COLUMNS} showSearch={false} onSave={cols => setColumns(cols)} onClose={() => setShowColumnSettings(false)} />
      )}

      {showRunPanel && (
        <div className="fixed inset-0 z-[120] bg-[#10233A]/20" onMouseDown={() => setShowRunPanel(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Run on all documents"
            className="absolute inset-y-0 right-0 flex w-[380px] max-w-full flex-col bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Run on all documents</h2>
              <button type="button" onClick={() => setShowRunPanel(false)} aria-label="Close run menu" className="flex h-6 w-6 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]">
                <X size={24} />
              </button>
            </div>

            <div role="listbox" aria-label="Document processing actions" aria-multiselectable="true" className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_8px_24px_rgba(16,35,58,0.08)]">
              {RUN_ACTIONS.map(({ id, label, Icon }) => {
                const checked = selectedRunActions.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggleRunAction(id)}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[#F8FDFF] ${checked ? 'bg-[#EAF4FB]' : 'bg-white'}`}
                  >
                    <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] ${checked ? 'bg-[#007EA7]' : 'border border-[#A1B6C6] bg-white'}`}>
                      {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 5.5L4.75 8.25L10.5 2.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <Icon size={20} className="flex-shrink-0 text-[#7288A3]" />
                    <span className="font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">{label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={runOnAllDocuments}
              disabled={selectedRunActions.size === 0}
              className="mt-6 flex h-[42px] w-full items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold text-white transition-colors hover:bg-[#006F94] disabled:cursor-not-allowed disabled:bg-[#E1E4E8] disabled:text-[#A1A7AE]"
            >
              PROCESS
            </button>
          </aside>
        </div>
      )}

      {runNotice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[150] -translate-x-1/2 rounded-lg bg-[#E6F7EF] px-5 py-3 font-montserrat text-[14px] font-medium text-[#087A55] shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
          {runNotice}
        </div>
      )}
    </div>
  );
}
