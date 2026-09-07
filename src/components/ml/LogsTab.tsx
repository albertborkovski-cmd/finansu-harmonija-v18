import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import ColumnSettingsPanel, { type ColConfig } from '../ColumnSettingsPanel';
import HorizontalTableScrollbar from '../HorizontalTableScrollbar';
import TablePagination from '../TablePagination';
import OcrSearchField from '../OcrSearchField';
import { ResizeHandle, useColumnResize } from '../useColumnResize';
import { ColumnSettingsButton } from '../ScopedActionButtons';
import ColumnSortButton, { useMultiColumnSort } from '../ColumnSortButton';
import ImportButton from '../ImportButton';
import { deleteAggregatedRuns, getAggregatedRuns, type RunStatus } from '../automationRunsStore';

interface RunEntry {
  id: string;
  processId: string;
  processName: string;
  tasksCount: number;
  status: RunStatus;
  createdBy: string;
  creationDate: string;
}

const INITIAL_COLUMNS: ColConfig[] = [
  { key: 'id', label: 'Run ID', width: 128, visible: true },
  { key: 'processName', label: 'Process name', width: 200, visible: true },
  { key: 'tasksCount', label: 'Tasks count', width: 130, visible: true },
  { key: 'status', label: 'Status', width: 130, visible: true },
  { key: 'createdBy', label: 'Created by', width: 130, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 130, visible: true },
];

const STATUS_COLOR: Record<RunStatus, string> = {
  Submitted: '#7288A3',
  Completed: '#2EA96B',
  'In Progress': '#007EA7',
  Failed: '#D84A4A',
  Stopped: '#D84A4A',
  'Stopped Idle': '#D99532',
  Queued: '#7288A3',
  'Deploying on Node': '#007EA7',
  Stopping: '#D99532',
};

function readRuns(): RunEntry[] {
  return getAggregatedRuns().map(run => ({
    id: run.id,
    processId: run.processId,
    processName: run.processName,
    tasksCount: run.tasks,
    status: run.status,
    createdBy: 'RPA platform',
    creationDate: run.created,
  }));
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border transition-colors"
      style={{ background: checked ? '#007EA7' : '#FFFFFF', borderColor: checked ? '#007EA7' : '#A1B6C6' }}
      onClick={onChange}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export default function LogsTab({
  onOpenProcess,
  onOpenRun,
}: {
  onOpenProcess?: (processId: string, processName: string) => void;
  onOpenRun?: (processId: string, processName: string, runId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<RunEntry[]>(readRuns);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(INITIAL_COLUMNS);
  const { startResize } = useColumnResize(columns, setColumns);

  const visibleColumns = columns.filter(column => column.visible);
  const gridTemplateColumns = `42px ${visibleColumns.map(column => `${column.width}px`).join(' ')} 68px`;
  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + 110;
  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return runs;
    return runs.filter(run => Object.values(run).some(value => String(value).toLowerCase().includes(normalizedQuery)));
  }, [query, runs]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filteredRuns, (run, key) => run[key as keyof RunEntry]);

  useEffect(() => {
    const syncRuns = () => setRuns(readRuns());
    window.addEventListener('finansu-harmonija:runs-changed', syncRuns);
    return () => window.removeEventListener('finansu-harmonija:runs-changed', syncRuns);
  }, []);

  const toggleRow = (id: string) => {
    setSelectedRows(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visibleIds = filteredRuns.map(run => run.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedRows.has(id));
    setSelectedRows(allSelected ? new Set() : new Set(visibleIds));
  };

  const removeRun = (runToRemove: RunEntry) => {
    deleteAggregatedRuns([{ processId: runToRemove.processId, runId: runToRemove.id }]);
    setRuns(previous => previous.filter(run => !(run.processId === runToRemove.processId && run.id === runToRemove.id)));
    setSelectedRows(previous => {
      const next = new Set(previous);
      next.delete(runToRemove.id);
      return next;
    });
  };

  const valueFor = (run: RunEntry, key: string) => {
    if (key === 'id') {
      return (
        <button type="button" onClick={() => onOpenRun?.(run.processId, run.processName, run.id)} className="truncate text-left font-medium text-[#007EA7] hover:underline focus:underline focus:outline-none" aria-label={`Open ${run.id} run details`}>
          {run.id}
        </button>
      );
    }
    if (key === 'processName') {
      return (
        <button type="button" onClick={() => onOpenProcess?.(run.processId, run.processName)} className="truncate text-left font-medium text-[#007EA7] hover:underline focus:underline focus:outline-none" aria-label={`Open ${run.processName} automation process runs`}>
          {run.processName}
        </button>
      );
    }
    if (key === 'status') {
      return (
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: STATUS_COLOR[run.status] }} />
          {run.status}
        </span>
      );
    }
    return String(run[key as keyof RunEntry]);
  };

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every(run => selectedRows.has(run.id));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-shrink-0 flex-row items-center justify-between gap-4">
        <OcrSearchField ariaLabel="Search runs" value={query} onChange={setQuery} />

        <div className="flex flex-shrink-0 flex-row items-center gap-4 rounded bg-white p-[6px]">
          <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
          <ImportButton scope="Machine learning runs" />
          <button type="button" title="REFRESH ALL" aria-label="Refresh all runs" onClick={() => setRuns(current => current.map(run => ({ ...run })))} className="text-[#7288A3] transition-colors hover:text-[#007EA7]">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: tableMinWidth }}>
          <div aria-label="Runs table columns" className="grid min-h-9 items-center" style={{ gridTemplateColumns }}>
            <div data-table-header-select="true" className="flex h-9 items-center px-3">
              <Checkbox checked={allVisibleSelected} onChange={toggleAll} label="Select all runs" />
            </div>
            {visibleColumns.map((column, index) => (
              <div key={column.key} className={`relative flex h-9 min-w-0 items-center gap-1.5 px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>
                <span className="min-w-0 truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">
                  {column.label}
                </span>
                <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => { changeSort(column.key, direction); setCurrentPage(1); }} />
                <ResizeHandle onMouseDown={event => startResize(columns.findIndex(item => item.key === column.key), event)} />
              </div>
            ))}
            <div className="h-9" aria-hidden="true" />
          </div>

          <div className="mt-3 flex flex-col">
            {sortedRows.map((run, rowIndex) => (
              <div key={run.id} className={`grid h-9 w-full items-center rounded-lg ${rowIndex % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} transition-colors hover:bg-[#E7F4F9]`} style={{ gridTemplateColumns }}>
                <div className="flex h-9 items-center px-3">
                  <Checkbox checked={selectedRows.has(run.id)} onChange={() => toggleRow(run.id)} label={`Select run ${run.id}`} />
                </div>
                {visibleColumns.map(column => (
                  <div key={column.key} className="flex min-w-0 items-center overflow-hidden px-3 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">
                    <span className="min-w-0 truncate">{valueFor(run, column.key)}</span>
                  </div>
                ))}
                <div className="table-row-actions flex h-9 items-center justify-end gap-1 pr-2">
                  <button type="button" aria-label={`Open resources for ${run.id}`} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7]">
                    <Users size={16} />
                  </button>
                  <button type="button" aria-label={`Delete ${run.id}`} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7]" onClick={() => removeRun(run)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {filteredRuns.length === 0 && (
              <div className="flex h-28 items-center justify-center font-montserrat text-[14px] font-medium text-[#7288A3]">No results found</div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar />

      <div className="flex flex-shrink-0 flex-row items-center justify-between pt-2">
        <span className="font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">14 from 15,000 items</span>
        <TablePagination currentPage={currentPage} totalPages={8} itemCount={filteredRuns.length} onPageChange={setCurrentPage} />
        <button type="button" className="flex h-8 items-center justify-center rounded-md border-2 border-[#D3E1EC] px-3 py-[6px] font-montserrat text-[14px] font-semibold leading-5 text-[#7288A3] transition-colors hover:border-[#007EA7]">View all</button>
      </div>

      {showColumnSettings && (
        <ColumnSettingsPanel columns={columns} onSave={setColumns} onClose={() => setShowColumnSettings(false)} />
      )}
    </div>
  );
}
