import { useEffect, useMemo, useState, useRef } from 'react';
import { RefreshCw, X, UsersRound } from 'lucide-react';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import { PageActionButton, PageHeader } from './PageHeader';
import OcrBreadcrumb from './OcrBreadcrumb';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import OcrSearchField from './OcrSearchField';
import { ColumnSettingsButton } from './ScopedActionButtons';
import { useColumnResize, ResizeHandle } from './useColumnResize';
import OcrDetailView from './OcrDetailView';
import AutomationProcessDetailView from './AutomationProcessDetailView';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import { BulkDeleteButton, RowDeleteButton } from './DeleteButtons';
import ImportButton from './ImportButton';
import type { SecurityAccessTarget } from './ResourceSecurityAccessView';
import { matchesTextSearch } from '../utils/textSearch';

interface OcrProcess {
  id: string;
  name: string;
  description: string;
  capabilities: string;
  createdBy: string;
  creationDate: string;
  modifiedBy: string;
  modifiedDate: string;
}

const SAMPLE_DATA: OcrProcess[] = [
  { id: '1', name: 'IDP', description: 'Intelligent document processing sample', capabilities: '\u2014', createdBy: 'RPA platform', creationDate: '10.04.2026 12:22', modifiedBy: 'Admin', modifiedDate: '11.04.2026 09:00' },
  { id: '2', name: 'IDP', description: 'Intelligent document processing sample', capabilities: '\u2014', createdBy: 'RPA platform', creationDate: '10.04.2026 12:22', modifiedBy: 'Admin', modifiedDate: '11.04.2026 09:00' },
  { id: '3', name: 'IDP', description: 'Intelligent document processing sample', capabilities: '\u2014', createdBy: 'RPA platform', creationDate: '10.04.2026 12:22', modifiedBy: 'Admin', modifiedDate: '11.04.2026 09:00' },
  { id: '4', name: 'IDP', description: 'Intelligent document processing sample', capabilities: '\u2014', createdBy: 'RPA platform', creationDate: '10.04.2026 12:22', modifiedBy: 'Admin', modifiedDate: '11.04.2026 09:00' },
];

const INITIAL_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 200, visible: true },
  { key: 'description', label: 'Description', width: 280, visible: true },
  { key: 'capabilities', label: 'Capabilities', width: 130, visible: true },
  { key: 'createdBy', label: 'Created by', width: 130, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 150, visible: true },
  { key: 'modifiedBy', label: 'Updated by', width: 130, visible: false },
  { key: 'modifiedDate', label: 'Last update', width: 150, visible: false },
];

const ROWS_PER_PAGE = 4;
const PROCESS_STORAGE_KEY = 'finansu-harmonija-v4:automation-processes';

function Checkbox({ checked, onChange, label = 'Select record' }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
      style={{ background: checked ? '#007EA7' : '#FFFFFF', border: checked ? 'none' : '1px solid #A1B6C6' }}
      onClick={onChange}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function SecurityAccessIcon() {
  return (
    <UsersRound size={16} strokeWidth={1.8} className="text-[#7288A3]" />
  );
}

function getCellValue(row: OcrProcess, key: string): string {
  return (row as unknown as Record<string, string>)[key] ?? '\u2014';
}

export default function OcrView({ onNavigateToAdministration }: { onNavigateToAdministration?: (target: SecurityAccessTarget) => void }) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const [, setScrollRatio] = useState(0);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mergeAuto, setMergeAuto] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<OcrProcess | null>(null);
  const [columns, setColumns] = useState<ColConfig[]>(INITIAL_COLUMNS);
  const [processes, setProcesses] = useState<OcrProcess[]>(() => {
    if (typeof window === 'undefined') return SAMPLE_DATA;
    try {
      const stored = window.localStorage.getItem(PROCESS_STORAGE_KEY);
      return stored ? JSON.parse(stored) as OcrProcess[] : SAMPLE_DATA;
    } catch {
      return SAMPLE_DATA;
    }
  });
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const filteredProcesses = useMemo(
    () => processes.filter(process => matchesTextSearch(process, searchQuery)),
    [processes, searchQuery],
  );
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filteredProcesses, (row, key) => getCellValue(row, key));

  const visibleColumns = columns.filter(c => c.visible);
  const totalPages = Math.max(1, Math.ceil(filteredProcesses.length / ROWS_PER_PAGE));
  const rows = viewAll ? sortedRows : sortedRows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  useEffect(() => {
    window.localStorage.setItem(PROCESS_STORAGE_KEY, JSON.stringify(processes));
  }, [processes]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map(r => r.id)));
    }
  };

  const handleTableScroll = () => {
    const el = tableScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollRatio(max > 0 ? el.scrollLeft / max : 0);
  };

  if (showDetail) {
    return (
      <OcrDetailView
        onBack={() => setShowDetail(false)}
        onCreated={process => {
          const now = new Date().toLocaleString('lt-LT');
          setProcesses(current => [{
            id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
            name: process.name,
            description: process.description || '\u2014',
            capabilities: process.capabilities,
            createdBy: 'Local user',
            creationDate: now,
            modifiedBy: 'Local user',
            modifiedDate: now,
          }, ...current]);
          setPage(1);
          setViewAll(false);
          setShowDetail(false);
        }}
      />
    );
  }

  if (selectedProcess) {
    return <AutomationProcessDetailView process={selectedProcess} onBack={() => setSelectedProcess(null)} />;
  }

  return (
    <div className="flex flex-col bg-white px-9 py-14 gap-8 min-h-full relative" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>

      {/* Header */}
      <PageHeader title="Automation processes" actions={<><PageActionButton onClick={() => setShowUploadModal(true)}>Upload package</PageActionButton>{processes.length > 0 && <PageActionButton onClick={() => setShowDetail(true)}>Create new</PageActionButton>}</>} />
      <OcrBreadcrumb items={["Automation processes"]} />

      {/* Content */}
      <div className="flex flex-col gap-6 flex-1">

        {/* Filter bar */}
        <div className="flex-shrink-0">
          <div className="flex flex-row flex-wrap justify-between items-center gap-2">
            <div className="flex flex-row items-center gap-1 flex-1 min-w-0">
              <OcrSearchField ariaLabel="Search automation processes" value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="flex flex-row items-center p-[6px] gap-4 bg-white rounded flex-shrink-0">
              <BulkDeleteButton selectedCount={selectedRows.size} onDelete={() => { setProcesses(current => current.filter(row => !selectedRows.has(row.id))); setSelectedRows(new Set()); }} />
              <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
              <ImportButton scope="Automation processes" label="IMPORT FIRST" />
              <button onClick={() => setProcesses(current => current.map(process => ({ ...process })))} className="w-4 h-4 flex items-center justify-center text-[#7288A3] hover:text-[#007EA7] transition-colors" title="REFRESH ALL">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex flex-col gap-12 flex-1">
          <div className="overflow-x-auto scrollbar-hide" ref={tableScrollRef} onScroll={handleTableScroll}>
            <div style={{ minWidth: processes.length > 0 ? `${visibleColumns.reduce((s, c) => s + c.width, 0) + 120}px` : '100%' }}>

              {/* Column headers */}
              <div className="system-table-header-row flex h-5 flex-row items-center gap-0 pl-3 mb-4">
                {visibleColumns.map((col, idx) => {
                  const colRealIdx = columns.findIndex(c => c.key === col.key);
                  return (
                    <div data-table-header-select={idx === 0 ? "true" : undefined} key={col.key} className="relative flex flex-row items-center gap-0 flex-shrink-0" style={{ width: col.width }}>
                      <div className="flex flex-row items-center gap-[6px] flex-1 min-w-0">
                        {idx === 0 && (
                          <>
                            <Checkbox checked={selectedRows.size === rows.length && rows.length > 0} onChange={toggleAll} label="Select all automation processes" />
                            <div className="flex flex-row items-center gap-[6px]">
                              <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A] truncate">{col.label}</span>
                              <ColumnSortButton columnLabel={col.label} direction={directionFor(col.key)} onDirectionChange={direction => { changeSort(col.key, direction); setPage(1); }} />
                            </div>
                          </>
                        )}
                        {idx > 0 && <><span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A] truncate">{col.label}</span><ColumnSortButton columnLabel={col.label} direction={directionFor(col.key)} onDirectionChange={direction => { changeSort(col.key, direction); setPage(1); }} /></>}
                      </div>
                      <ResizeHandle onMouseDown={(e) => startResize(colRealIdx, e)} />
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {rows.map((row, i) => (
                  <div key={row.id} className={`group flex flex-row items-center w-full h-9 rounded-lg ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9] transition-colors`}>
                    <div className="system-table-select-cell flex flex-row items-center px-3 py-[9px] gap-[6px] flex-shrink-0" style={{ width: visibleColumns[0]?.width ?? 200 }}>
                      <Checkbox checked={selectedRows.has(row.id)} onChange={() => toggleRow(row.id)} label={`Select ${row.name} ${row.id}`} />
                      {visibleColumns[0]?.key === 'name' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedProcess(row)}
                          className="min-w-0 truncate text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline"
                          title={`Open ${row.name}`}
                        >
                          {row.name}
                        </button>
                      ) : (
                        <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] truncate">
                          {getCellValue(row, visibleColumns[0]?.key ?? 'name')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-row items-center px-[10px] py-[9px] gap-0 flex-1 h-9 min-w-0">
                      {visibleColumns.slice(1).map(col => col.key === 'name' ? (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => setSelectedProcess(row)}
                          className="flex-shrink-0 truncate px-1 text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline"
                          style={{ width: col.width }}
                          title={`Open ${row.name}`}
                        >
                          {row.name}
                        </button>
                      ) : (
                        <span key={col.key} className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] flex-shrink-0 truncate px-1" style={{ width: col.width }}>
                          {getCellValue(row, col.key)}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-row items-center p-1 gap-1 flex-shrink-0 h-9">
                      <button
                        type="button"
                        title="SECURITY ACCESS"
                        aria-label={`SECURITY ACCESS for ${row.name} ${row.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onNavigateToAdministration?.({ module: 'Automation processes', resourceType: 'Automation process', id: row.id, name: row.name });
                          }}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white transition-colors hover:border-[#007EA7]"
                      >
                        <SecurityAccessIcon />
                      </button>
                      <RowDeleteButton label={`Delete ${row.name}`} onDelete={() => { setProcesses(current => current.filter(item => item.id !== row.id)); setSelectedRows(current => { const next = new Set(current); next.delete(row.id); return next; }); }} />
                    </div>
                  </div>
                ))}
                {filteredProcesses.length === 0 && (
                  <div className="flex min-h-[340px] flex-col items-center justify-center gap-6">
                    <div className="flex w-[320px] flex-col items-center gap-4">
                      <span className="w-full text-center font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">{processes.length ? 'No matching records' : 'Empty collection'}</span>
                      <span className="w-full text-center font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">{processes.length ? 'Try a different search value' : 'Press "Create new" button to start your work'}</span>
                    </div>
                    {!processes.length && <PageActionButton onClick={() => setShowDetail(true)}>Create new</PageActionButton>}
                  </div>
                )}
              </div>
            </div>
          </div>

          <HorizontalTableScrollbar scrollRef={tableScrollRef} />

          {/* Footer */}
          <div className="flex flex-row flex-wrap justify-between items-center gap-4 flex-shrink-0">
            <TablePagination
              currentPage={viewAll ? 1 : page}
              totalPages={viewAll ? 1 : totalPages}
              itemCount={filteredProcesses.length}
              itemsPerPage={viewAll ? Math.max(1, filteredProcesses.length) : ROWS_PER_PAGE}
              onPageChange={viewAll ? () => undefined : setPage}
              onShowMore={() => { setViewAll(v => !v); setPage(1); }}
              showMoreLabel={viewAll ? 'Default' : 'Show more'}
              allItemsVisible={viewAll}
            />
          </div>
        </div>
      </div>

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columns}
          onSave={cols => setColumns(cols)}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Upload Package Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowUploadModal(false)} />
          <div className="relative w-[429px] bg-white rounded-2xl p-6 flex flex-col gap-6" style={{ boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.1)' }}>
            <div className="flex flex-row justify-between items-start gap-2">
              <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#10233A]">
                Please, provide packages to upload
              </span>
              <button onClick={() => setShowUploadModal(false)} className="w-6 h-6 flex items-center justify-center flex-shrink-0 hover:opacity-70">
                <X size={16} className="text-[#7288A3]" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col justify-center items-center gap-4 w-full h-[160px] border border-dashed border-[#3A6DFF] rounded-lg">
                <button data-system-action="true" className="flex items-center justify-center px-3 py-[6px] gap-1 h-8 bg-[#007EA7] rounded-md">
                  <span className="font-montserrat font-semibold text-[14px] leading-5 text-white">Choose file</span>
                </button>
                <span className="font-montserrat font-medium text-[14px] leading-5 text-[#7288A3]">
                  Please, provide ZIP file or drag and drop here
                </span>
              </div>

              <div className="flex flex-row items-center gap-3">
                <Checkbox checked={mergeAuto} onChange={() => setMergeAuto(!mergeAuto)} />
                <span className="font-montserrat font-medium text-[14px] leading-[140%] text-[#7288A3]">
                  Try to merge all automatically
                </span>
              </div>
            </div>

            <div className="flex flex-row justify-end items-start gap-2">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex items-center justify-center px-4 h-[42px] border-2 border-[#D3E1EC] rounded-lg font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3] hover:border-[#007EA7] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex items-center justify-center px-4 h-[42px] bg-[#007EA7] rounded-lg font-montserrat font-semibold text-[16px] leading-6 text-white hover:bg-[#006b8f] transition-colors"
              >
                Start upload
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
