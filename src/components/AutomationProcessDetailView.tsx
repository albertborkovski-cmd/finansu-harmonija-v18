import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, RefreshCw, Trash2, ChevronDown, ChevronLeft, ChevronRight, X, Download, Search, Map, AlignLeft, ArrowRight, Copy, Maximize2, Minimize2, Plus, FolderPlus, CheckCircle2, Clock3, ZoomOut, MoreVertical } from 'lucide-react';
import ColumnSettingsPanel, { ColConfig } from './ColumnSettingsPanel';
import { PageActionButton, PageHeader } from './PageHeader';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import OcrSearchField from './OcrSearchField';
import { BulkDeleteButton, RowDeleteButton } from './DeleteButtons';
import StopButton from './StopButton';
import RecordRefreshButton from './RecordRefreshButton';
import { ColumnSettingsButton } from './ScopedActionButtons';
import ImportButton from './ImportButton';
import RefreshAllButton from './RefreshAllButton';
import RedoAllButton from './RedoAllButton';
import MultiSelectField from './MultiSelectField';
import { getNodeNames } from './nodeRecordsStore';
import { getNextGlobalRunId, getProcessRuns, saveProcessRuns, type RunRecord } from './automationRunsStore';
import { getWorkspaceHumanCorrectionCount, subscribeToWorkspaceHumanCorrections } from './workspaceHumanMetricsStore';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import { usePersistentState } from '../hooks/usePersistentState';
import SearchableSelect from './SearchableSelect';
export type { RunRecord } from './automationRunsStore';

export interface OcrProcess {
  id: string;
  name: string;
  description: string;
  capabilities: string;
  createdBy: string;
  creationDate: string;
  modifiedBy: string;
  modifiedDate: string;
}

interface Props {
  process: OcrProcess;
  onBack: () => void;
  initialRunId?: string;
}

const TABS = ['Details', 'Runs', 'Configuration parameters', 'Input data', 'Metrics', 'Notifications'] as const;
type Tab = typeof TABS[number];

const SAMPLE_TASKS = [
  { name: 'IDP', type: 'Selenium' },
  { name: 'Intelligent Document Processing', type: 'RPA' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'Document Classifier', type: 'Python' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'OCR Extractor', type: 'Java' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'Validation Service', type: 'RPA' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'Export Handler', type: 'Python' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'Notification Sender', type: 'Java' },
  { name: 'IDP', type: 'Selenium' },
  { name: 'Audit Logger', type: 'RPA' },
];

const NODES_DATA = [
  { id: '1', name: 'Main processor', value: 'node-processor-01' },
  { id: '2', name: 'Secondary handler', value: 'node-handler-02' },
  { id: '3', name: 'Backup worker', value: 'node-worker-03' },
];

const RUN_COLUMNS: ColConfig[] = [
  { key: 'run_id', label: 'Run ID', width: 120, visible: true },
  { key: 'tasks_count', label: 'Tasks count', width: 100, visible: true },
  { key: 'status', label: 'Status', width: 130, visible: true },
  { key: 'created_by', label: 'Created by', width: 140, visible: true },
  { key: 'creation_date', label: 'Creation date', width: 180, visible: true },
];

const CONFIGURATION_COLUMNS: ColConfig[] = [
  { key: 'key', label: 'Key', width: 220, visible: true },
  { key: 'value', label: 'Value', width: 420, visible: true },
];


export interface AlertRecord { id: string; type: string; message: string; node: string; created: string }
const ALERTS_DATA: AlertRecord[] = [];

function InputField({ label, placeholder, required, value, onChange, hasError }: {
  label: string; placeholder?: string; required?: boolean; value?: string; onChange?: (v: string) => void; hasError?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="font-montserrat font-semibold text-[14px] leading-[140%] text-[#10233A]">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div
        className="box-border flex flex-row items-center px-[14px] py-[11px] w-full h-[42px] bg-white rounded-lg transition-colors"
        style={{ border: hasError ? '1px solid #EF4444' : '1px solid #D3E1EC' }}
      >
        <input
          value={value ?? ''}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder || ''}
          className="font-montserrat font-medium text-[14px] leading-[140%] text-[#10233A] placeholder:text-[#A1B6C6] outline-none w-full bg-transparent"
        />
      </div>
      {hasError && (
        <span className="font-montserrat font-medium text-[12px] leading-[18px] text-red-500">This field is required</span>
      )}
    </div>
  );
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-row items-center gap-3">
      <button
        onClick={() => onChange(!active)}
        className="relative w-[30px] h-[18px] rounded-full transition-colors flex-shrink-0"
        style={{ background: active ? '#007EA7' : '#A1B6C6' }}
      >
        <span
          className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-all"
          style={{ left: active ? '14px' : '2px' }}
        />
      </button>
      <span className="font-montserrat font-medium text-[14px] leading-5 text-[#7288A3]">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'In Progress' || status === 'Submitted' || status === 'Queued' || status === 'Deploying on Node'
    ? '#007EA7'
    : status === 'Completed'
      ? '#0ED8A8'
      : status === 'Failed'
        ? '#E45858'
        : status === 'Stopping'
          ? '#F2994A'
          : '#7288A3';
  return <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function DetailTab({ process, refreshSignal }: { process: OcrProcess; refreshSignal: number }) {
  const initialForm = {
    name: process.name,
    description: process.description,
    moduleClass: 'com.rpaplatform.' + process.name.toLowerCase().replace(/\s+/g, '.'),
    executionGroups: [] as string[],
    capabilities: process.capabilities === '\u2014' ? '' : process.capabilities,
    dedicatedNodes: [] as string[],
    logsSearchQuery: ['#digit', '#digit'] as string[],
    groupId: 'com.rpaplatform',
    artifactId: process.name.toLowerCase().replace(/\s+/g, '-'),
    versionId: '1.0.0',
    clasifier: '',
  };
  const [dedicated, setDedicated] = useState(false);
  const [savedDedicated, setSavedDedicated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [savedForm, setSavedForm] = useState(initialForm);
  const [nodeOptions, setNodeOptions] = useState<string[]>(getNodeNames);
  const handledRefreshSignal = useRef(refreshSignal);
  const isDirty = dedicated !== savedDedicated || JSON.stringify(form) !== JSON.stringify(savedForm);

  useEffect(() => {
    if (refreshSignal === handledRefreshSignal.current) return;
    handledRefreshSignal.current = refreshSignal;
    setForm({ ...savedForm, executionGroups: [...savedForm.executionGroups], dedicatedNodes: [...savedForm.dedicatedNodes], logsSearchQuery: [...savedForm.logsSearchQuery] });
    setDedicated(savedDedicated);
    setSubmitted(false);
    setSaveError(false);
  }, [refreshSignal, savedDedicated, savedForm]);
  useEffect(() => {
    const refreshNodeOptions = () => setNodeOptions(getNodeNames());
    window.addEventListener('finansu-harmonija:nodes-changed', refreshNodeOptions);
    refreshNodeOptions();
    return () => window.removeEventListener('finansu-harmonija:nodes-changed', refreshNodeOptions);
  }, []);
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    setSubmitted(true);
    const missingName = !form.name.trim();
    const missingGroupId = !form.groupId.trim();
    const missingArtifactId = !form.artifactId.trim();
    const missingVersionId = !form.versionId.trim();
    if (missingName || missingGroupId || missingArtifactId || missingVersionId) {
      setSaveError(true);
      return;
    }
    setSaveError(false);
    setSavedForm({ ...form, executionGroups: [...form.executionGroups], dedicatedNodes: [...form.dedicatedNodes], logsSearchQuery: [...form.logsSearchQuery] });
    setSavedDedicated(dedicated);
  };

  return (
    <div className="flex flex-row gap-8 flex-wrap">
      {saveError && (
        <div className="w-full flex items-center gap-3 px-4 py-3 mb-2 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-500 font-montserrat font-medium text-[14px] leading-[140%]">
            Please fill in all required fields marked with *
          </span>
          <button onClick={() => setSaveError(false)} className="ml-auto text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-row gap-8 flex-wrap">
      {/* General panel */}
      <div className="box-border flex flex-col items-start p-6 gap-6 w-[380px] bg-white border border-[#D3E1EC] rounded-lg flex-shrink-0">
        <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">General</h2>
        <InputField label="Name" placeholder="Enter name" required value={form.name} onChange={f('name')} hasError={submitted && !form.name.trim()} />
        <InputField label="Description" placeholder="Enter description" value={form.description} onChange={f('description')} />
        <InputField label="Module class" placeholder="Enter module class" value={form.moduleClass} onChange={f('moduleClass')} />
        <MultiSelectField
          label="Execution groups"
          options={['Operation type', 'Selenium', 'Python script', 'Document processing', 'OCR', 'Text extraction', 'RPA', 'Java', 'Validation', 'Machine learning', 'API']}
          value={form.executionGroups}
          onChange={v => setForm(p => ({ ...p, executionGroups: v }))}
          placeholder="Choose roles"
        />
        <Toggle label="Dedicated" active={dedicated} onChange={setDedicated} />
        {dedicated ? (
          <>
            <MultiSelectField
              label="Dedicated nodes"
              options={nodeOptions}
              value={form.dedicatedNodes}
              onChange={value => setForm(current => ({ ...current, dedicatedNodes: value }))}
              placeholder="Choose nodes"
            />
            <MultiSelectField
              label="Logs search query"
              options={['RpaPlatform', '#digit', 'Error', 'Warning', 'Info', 'Debug']}
              value={form.logsSearchQuery}
              onChange={v => setForm(p => ({ ...p, logsSearchQuery: v }))}
            />
          </>
        ) : (
          <InputField label="Capabilities" placeholder="Enter capabilities" value={form.capabilities} onChange={f('capabilities')} />
        )}
      </div>

      {/* Repository ID panel */}
      <div className="box-border flex flex-col items-start p-6 gap-6 w-[380px] bg-white border border-[#D3E1EC] rounded-lg flex-shrink-0">
        <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A]">Repository ID components</h2>
        <InputField label="Group ID" placeholder="Enter group ID" required value={form.groupId} onChange={f('groupId')} hasError={submitted && !form.groupId.trim()} />
        <InputField label="Artifact ID" placeholder="Enter artifact ID" required value={form.artifactId} onChange={f('artifactId')} hasError={submitted && !form.artifactId.trim()} />
        <InputField label="Version ID" placeholder="Enter version ID" required value={form.versionId} onChange={f('versionId')} hasError={submitted && !form.versionId.trim()} />
        <InputField label="Clasifier" placeholder="Enter clasifier" value={form.clasifier} onChange={f('clasifier')} />
      </div>

      {/* Tasks panel */}
      <div className="box-border flex flex-col items-start p-6 gap-8 flex-1 min-w-[380px] bg-white border border-[#D3E1EC] rounded-lg">
        <div className="flex flex-row items-start gap-6 w-full">
          <h2 className="font-montserrat font-semibold text-[22px] leading-8 text-[#10233A] flex-1">Tasks</h2>
        </div>

        <div className="flex flex-col gap-4 w-full flex-1 min-h-0">
          <div className="flex flex-row items-center px-3 h-5">
            <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3] flex-1">Task</span>
            <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#7288A3] w-[88px] flex-shrink-0">Capabilities</span>
          </div>

          <div className="flex flex-row items-start gap-2 w-full flex-1 min-h-0">
            <div className="flex flex-col items-end flex-1 min-h-0 overflow-y-auto max-h-[504px] scrollbar-thin">
              {SAMPLE_TASKS.map((task, i) => (
                <div
                  key={i}
                  className="flex flex-row items-start w-full h-9 rounded-lg flex-shrink-0"
                  style={{ background: i % 2 === 0 ? '#F8FDFF' : '#FFFFFF' }}
                >
                  <div className="flex flex-row items-center py-[9px] px-3 gap-[6px] flex-1 min-w-0 h-9">
                    <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] truncate">{task.name}</span>
                  </div>
                  <div className="flex flex-row items-center py-[9px] px-[10px] gap-6 w-[88px] flex-shrink-0 h-9">
                    <span className="font-montserrat font-normal text-[12px] leading-[18px] text-[#10233A] truncate">{task.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center gap-4 w-full">
          <button type="button" data-system-action="true" disabled={!isDirty} onClick={handleSave} className="group flex items-center justify-center rounded-lg border-2 px-4 py-[9px] transition-colors enabled:border-[#D3E1EC] enabled:bg-white enabled:hover:border-[#007EA7] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F5F5F5]">
            <span className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A] transition-colors group-active:text-white group-disabled:text-[#B4B6B8]">Upload</span>
          </button>
        </div>
      </div>
      </div>


    </div>
  );
}

function RowCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className="relative flex h-[18px] w-[18px] flex-shrink-0 self-center items-center justify-center rounded-[6px] transition-colors"
      style={{
        background: checked ? '#007EA7' : '#FFFFFF',
        border: checked ? 'none' : '1px solid #A1B6C6',
      }}
    >
      {checked && (
        <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
          <path d="M1 3L3.5 5.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function FilterSearch({ value, onChange, ariaLabel = 'Search records' }: { value: string; onChange: (value: string) => void; ariaLabel?: string }) {
  return <OcrSearchField ariaLabel={ariaLabel} value={value} onChange={onChange} />;
}

const RUN_EVENT_LOGS = [
  { time: '12:49:19.204', severity: 'INFO', node: 'LX 1', message: 'Adding invoice for document 16ca5b4a-66da-4af0-a87b-7fc4c0b5d630' },
  { time: '12:49:32.030', severity: 'INFO', node: 'LX 1', message: 'Run task completed with OK' },
  { time: '12:49:35.599', severity: 'INFO', node: 'LX 1', message: 'CleanupInputTask is executing synchronously' },
  { time: '12:49:35.843', severity: 'INFO', node: 'CS', message: 'Assigning task on node LX 1' },
  { time: '12:49:35.877', severity: 'WARN', node: 'LX 1', message: 'Run configuration was changed by SELENIUM_DIRECT feature' },
  { time: '12:49:36.010', severity: 'INFO', node: 'LX 1', message: 'Started process with pid 707433' },
  { time: '12:49:40.321', severity: 'INFO', node: 'LX 1', message: 'Scanning class path to find ConfigurationModule' },
  { time: '12:49:44.214', severity: 'INFO', node: 'LX 1', message: 'Created SymmetricKeyEncryptDecryptService' },
  { time: '12:49:45.749', severity: 'INFO', node: 'LX 1', message: 'Opening web page and starting document processing' },
  { time: '12:50:03.312', severity: 'INFO', node: 'LX 1', message: 'Run completed with OK' },
  { time: '12:58:08.025', severity: 'ERROR', node: 'CS', message: 'Process status updated: STOPPED_IDLE' },
];

function RunHistory({ run }: { run: RunRecord }) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [view, setView] = useState<'Diagram' | 'Event log' | 'Table'>('Diagram');
  const [zoom, setZoom] = useState(100);
  const workflow = getRunTaskExecutions(run);
  return (
    <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-b-lg border border-t-0 border-[#E5EDF9] bg-white">
      <div className="flex min-h-12 flex-wrap items-center justify-end gap-4 border-b border-[#E5EDF9] px-4 py-2">
        <button type="button" role="switch" aria-checked={autoRefresh} onClick={() => setAutoRefresh(value => !value)} className="flex h-8 items-center gap-2 font-montserrat text-[13px] font-medium text-[#7288A3]">
          <span className={`relative h-[20px] w-[36px] flex-shrink-0 rounded-full border transition-colors duration-200 ${autoRefresh ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}>
            <span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${autoRefresh ? 'translate-x-4' : 'translate-x-0'}`} />
          </span>
          Autorefresh
        </button>
        <div className="flex overflow-hidden rounded-md border border-[#D3E1EC]">{(['Diagram', 'Event log', 'Table'] as const).map(option => <button key={option} type="button" onClick={() => setView(option)} className={`h-8 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium first:border-l-0 ${view === option ? 'bg-[#E5EDF9] text-[#007EA7]' : 'bg-white text-[#7288A3]'}`}>{option}</button>)}</div>
      </div>
      {view === 'Diagram' && <div className="relative flex flex-1 items-start justify-center overflow-auto bg-[#FCFDFE] p-10"><div className="flex min-w-[320px] origin-top flex-col items-center" style={{ transform: `scale(${zoom / 100})` }}>{workflow.map((step, index) => <div key={step.id} className="flex flex-col items-center"><div className="flex min-h-10 min-w-[190px] items-center justify-between gap-4 rounded-lg border border-[#D3E1EC] bg-white px-4 py-2 shadow-sm"><span className="font-montserrat text-[12px] font-medium text-[#10233A]">{step.name}</span><StatusDot status={step.status} /></div>{index < workflow.length - 1 && <div className="h-7 w-px bg-[#A1B6C6]" />}</div>)}</div><div className="absolute bottom-4 right-5 flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">{zoom}%</span><button type="button" onClick={() => setZoom(value => Math.min(160, value + 10))} className="text-[20px] text-[#7288A3]">+</button><button type="button" onClick={() => setZoom(value => Math.max(50, value - 10))} className="text-[20px] text-[#7288A3]">−</button></div></div>}
      {view === 'Event log' && <RunEventLog run={run} />}
      {view === 'Table' && <div className="flex flex-col p-6">{workflow.map((step, index) => <div key={step.id} className={`grid h-10 grid-cols-[70px_1fr_120px] items-center rounded-lg px-3 ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}><span className="font-montserrat text-[12px] text-[#7288A3]">{index + 1}</span><span className="font-montserrat text-[12px] text-[#10233A]">{step.name}</span><span className="font-montserrat text-[12px] text-[#7288A3]">{step.status}</span></div>)}</div>}
    </div>
  );
}

function RunEventLog({ run }: { run: RunRecord }) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('ALL');
  const [severityOpen, setSeverityOpen] = useState(false);
  const [viewColumnsOpen, setViewColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(['timestamp', 'severity']));
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const columnOptions = ['timestamp', 'severity', 'logger', 'thread'];
  const filtered = RUN_EVENT_LOGS.filter(log => (severity === 'ALL' || log.severity === severity) && `${log.time} ${log.severity} ${log.node} ${log.message}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => setRefreshNumber(value => value + 1), 10_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  const toggleColumn = (column: string) => setVisibleColumns(current => {
    const next = new Set(current);
    if (next.has(column)) next.delete(column);
    else next.add(column);
    return next;
  });
  const text = filtered.map(log => [
    visibleColumns.has('timestamp') ? `[2026-07-22 ${log.time}]` : '',
    visibleColumns.has('severity') ? `[${log.severity}]` : '',
    visibleColumns.has('logger') ? `[${log.node}]` : '',
    visibleColumns.has('thread') ? `[${run.id}]` : '',
    log.message,
  ].filter(Boolean).join(' ')).join('\n');
  const copyLog = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  const downloadLog = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${run.id.toLowerCase()}-event-log.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${fullScreen ? 'fixed inset-5 z-[260] rounded-2xl border border-[#D3E1EC] p-6 shadow-[0_16px_48px_rgba(16,35,58,0.18)]' : 'min-h-[520px] rounded-b-lg border border-t-0 border-[#E5EDF9]'} flex flex-1 flex-col overflow-hidden bg-white`}>
      <div className="flex flex-wrap items-end gap-6 border-b border-[#E5EDF9] p-4">
        <div className="flex min-w-[260px] flex-1 items-end">
          <OcrSearchField ariaLabel={`Search ${run.id} event log`} value={query} onChange={setQuery} />
        </div>
        <div className="relative flex w-[235px] flex-col gap-1">
          <span className="font-montserrat text-[12px] font-medium text-[#7288A3]">View columns</span>
          <button type="button" aria-haspopup="listbox" aria-expanded={viewColumnsOpen} onClick={() => { setSeverityOpen(false); setViewColumnsOpen(open => !open); }} className={`flex h-8 items-center justify-between border-b-2 font-montserrat text-[13px] font-medium text-[#10233A] ${viewColumnsOpen ? 'border-[#007EA7]' : 'border-[#D3E1EC]'}`}><span className="truncate">{visibleColumns.size ? columnOptions.filter(column => visibleColumns.has(column)).join(', ') : 'Choose columns'}</span><ChevronDown size={16} className={`ml-2 flex-shrink-0 text-[#7288A3] transition-transform ${viewColumnsOpen ? 'rotate-180' : ''}`} /></button>
          {viewColumnsOpen && <div role="listbox" aria-label="View event log columns" className="absolute left-0 right-0 top-[54px] z-30 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_10px_28px_rgba(16,35,58,0.16)]">{columnOptions.map(column => { const checked = visibleColumns.has(column); return <button key={column} type="button" role="option" aria-selected={checked} onClick={() => toggleColumn(column)} className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-[#F8FDFF] ${checked ? 'bg-[#EAF4FB]' : 'bg-white'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span><span className="font-montserrat text-[14px] font-medium text-[#10233A]">{column}</span></button>; })}</div>}
        </div>
        <div className="relative flex w-[185px] flex-col gap-1">
          <span className="font-montserrat text-[12px] font-medium text-[#7288A3]">Filter by severity</span>
          <button type="button" aria-haspopup="listbox" aria-expanded={severityOpen} onClick={() => { setViewColumnsOpen(false); setSeverityOpen(open => !open); }} className={`flex h-8 items-center justify-between border-b-2 font-montserrat text-[13px] font-medium text-[#10233A] ${severityOpen ? 'border-[#007EA7]' : 'border-[#D3E1EC]'}`}><span>{severity}</span><ChevronDown size={16} className={`text-[#7288A3] transition-transform ${severityOpen ? 'rotate-180' : ''}`} /></button>
          {severityOpen && <div role="listbox" aria-label="Filter event log by severity" className="absolute left-0 right-0 top-[54px] z-30 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_10px_28px_rgba(16,35,58,0.16)]">{['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].map(option => { const checked = severity === option; return <button key={option} type="button" role="option" aria-selected={checked} onClick={() => { setSeverity(option); setSeverityOpen(false); }} className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-[#F8FDFF] ${checked ? 'bg-[#EAF4FB]' : 'bg-white'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{checked && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span><span className="font-montserrat text-[14px] font-medium text-[#10233A]">{option}</span></button>; })}</div>}
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[#FCFDFE] px-4 py-3 font-mono text-[12px] leading-6">
        {filtered.map((log, index) => <div key={`${refreshNumber}-${log.time}-${index}`} className="whitespace-nowrap">{visibleColumns.has('timestamp') && <><span className="text-[#7288A3]">[2026-07-22 {log.time}]</span>{' '}</>}{visibleColumns.has('severity') && <><span className={log.severity === 'ERROR' ? 'text-[#E45858]' : log.severity === 'WARN' ? 'text-[#F2994A]' : 'text-[#A1B6C6]'}>[{log.severity}]</span>{' '}</>}{visibleColumns.has('logger') && <><span className="text-[#007EA7]">[{log.node}]</span>{' '}</>}{visibleColumns.has('thread') && <><span className="text-[#7288A3]">[{run.id}]</span>{' '}</>}<span className="text-[#10233A]">{log.message}</span></div>)}
        {!filtered.length && <div className="py-16 text-center font-montserrat text-[13px] text-[#A1B6C6]">No matching events</div>}
      </div>
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-4 border-t border-[#E5EDF9] bg-[#F8FAFC] px-4 py-2">
        <div className="flex items-center gap-4"><button type="button" role="switch" aria-checked={autoRefresh} onClick={() => setAutoRefresh(value => !value)} className="flex items-center gap-2 font-montserrat text-[13px] font-medium text-[#10233A]"><span className={`relative h-5 w-9 rounded-full border transition-colors ${autoRefresh ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${autoRefresh ? 'translate-x-4' : ''}`} /></span>Autorefresh</button><button type="button" title="REFRESH ALL" aria-label="Refresh event log" onClick={() => setRefreshNumber(value => value + 1)} className="text-[#7288A3] hover:text-[#007EA7]"><RefreshCw size={18} /></button></div>
        <div className="flex items-center gap-4 text-[#7288A3]"><button type="button" title="Download logs" aria-label="Download event log" onClick={downloadLog} className="hover:text-[#007EA7]"><Download size={18} /></button><button type="button" title="COPY" aria-label="Copy event log" onClick={() => void copyLog()} className="hover:text-[#007EA7]"><Copy size={18} /></button><button type="button" title={fullScreen ? 'Exit full screen' : 'FULL SCREEN'} aria-label={fullScreen ? 'Exit full screen' : 'Open full screen'} onClick={() => setFullScreen(value => !value)} className="hover:text-[#007EA7]">{fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
      </div>
      {copied && createPortal(<div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[320] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg"><CheckCircle2 size={18} />Event log copied successfully</div>, document.body)}
    </div>
  );
}

const RUN_WORKFLOW_TASKS = [
  { id: 'start', name: 'Start run', average: 0.0375, color: '#43B54A', category: 'Others' },
  { id: 'load', name: 'Load input', average: 0.299, color: '#E6B800', category: 'Others' },
  { id: 'validate', name: 'Validate document', average: 0.43, color: '#14548C', category: 'OCR' },
  { id: 'extract', name: 'Extract data', average: 6.9, color: '#65508A', category: 'OCR' },
  { id: 'rules', name: 'Apply business rules', average: 1.34, color: '#76216F', category: 'ML' },
  { id: 'export', name: 'Export result', average: 0.485, color: '#F06400', category: 'Others' },
  { id: 'finish', name: 'Finish', average: 0.052, color: '#F3A06A', category: 'Others' },
] as const;

type RunTaskExecutionStatus = 'Started' | 'Completed' | 'Failed';

function getRunTaskExecutions(run: RunRecord) {
  const finalStatus: RunTaskExecutionStatus = run.status === 'Completed'
    ? 'Completed'
    : run.status === 'Failed' || run.status === 'Stopped' || run.status === 'Stopped Idle'
      ? 'Failed'
      : 'Started';

  return RUN_WORKFLOW_TASKS.map((task, index) => ({
    ...task,
    status: index === RUN_WORKFLOW_TASKS.length - 1 ? finalStatus : 'Completed' as RunTaskExecutionStatus,
  }));
}

function RunMetricRows({ rows, valueLabel }: { rows: Array<{ name: string; value: number; color: string }>; valueLabel: (value: number) => string }) {
  const max = Math.max(...rows.map(row => row.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.map(row => (
        <div key={row.name} className="grid grid-cols-[minmax(220px,32%)_1fr_72px] items-center gap-3">
          <span className="truncate text-right font-montserrat text-[11px] font-medium text-[#10233A]" title={row.name}>{row.name}</span>
          <div className="h-4 overflow-hidden rounded-sm bg-[#F1F4F6]">
            <div className="h-full min-w-[2px] rounded-sm transition-[width] duration-500" style={{ width: `${Math.max((row.value / max) * 100, 0.3)}%`, backgroundColor: row.color }} />
          </div>
          <span className="text-right font-montserrat text-[12px] font-semibold" style={{ color: row.color }}>{valueLabel(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function RunMetricsDashboard({ run }: { run: RunRecord }) {
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [interval, setIntervalValue] = useState('1m');
  const [humanCorrections, setHumanCorrections] = useState(() => getWorkspaceHumanCorrectionCount(run.id));
  useEffect(() => {
    setHumanCorrections(getWorkspaceHumanCorrectionCount(run.id));
    return subscribeToWorkspaceHumanCorrections(() => setHumanCorrections(getWorkspaceHumanCorrectionCount(run.id)));
  }, [run.id]);
  const executions = getRunTaskExecutions(run);
  const total = executions.length;
  const completed = executions.filter(task => task.status === 'Completed').length;
  const failed = executions.filter(task => task.status === 'Failed').length;
  const started = executions.filter(task => task.status === 'Started').length;
  const runNumber = Number(run.id.match(/(\d+)$/)?.[1] ?? 1);
  const factor = 0.84 + ((runNumber + refreshNumber) % 7) * 0.04;
  const taskRows = executions.map(task => ({
    name: task.name,
    value: Number((task.average * factor).toFixed(task.average < 1 ? 4 : 2)),
    color: task.color,
    executions: 1,
    category: task.category,
    status: task.status,
  }));
  const allTaskRows = taskRows.map(task => ({ name: task.name, value: Number((task.value * Math.max(task.executions, 1)).toFixed(task.value < 1 ? 3 : 2)), color: task.color }));
  const processingDistribution = ['OCR', 'ML', 'Human', 'Others'].map((category, index) => {
    const value = category === 'Human'
      ? humanCorrections
      : executions.filter(task => task.category === category).length;
    return { name: category, value, color: ['#43B54A', '#E6B800', '#4E8EE8', '#F06400'][index] };
  });
  const processingTotal = Math.max(processingDistribution.reduce((sum, row) => sum + row.value, 0), 1);
  const executionRows = [
    { name: 'Total', value: total, color: '#43B54A', tint: '#DDEFD9' },
    { name: 'Completed', value: completed, color: '#D7AA00', tint: '#F8E9B6' },
    { name: 'Failed', value: failed, color: '#4E8EE8', tint: '#D7E6FA' },
    { name: 'Started', value: started, color: '#F06400', tint: '#FCE0CF' },
  ];
  const createdLabel = run.created || 'Current run';

  return (
    <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-b-lg border border-t-0 border-[#E5EDF9] bg-[#F8FAFC]">
      <div className="flex min-h-12 flex-wrap items-center justify-end gap-3 border-b border-[#E5EDF9] bg-white px-4 py-2">
        <button type="button" aria-label="Previous metrics period" className="text-[#7288A3] hover:text-[#007EA7]"><ChevronLeft size={16} /></button>
        <span className="flex items-center gap-2 font-montserrat text-[12px] font-semibold text-[#7288A3]"><Clock3 size={16} />{createdLabel} to now</span>
        <button type="button" aria-label="Next metrics period" className="text-[#7288A3] hover:text-[#007EA7]"><ChevronRight size={16} /></button>
        <button type="button" aria-label="Zoom out metrics" className="text-[#7288A3] hover:text-[#007EA7]"><ZoomOut size={17} /></button>
        <button type="button" aria-label="Refresh metrics" onClick={() => setRefreshNumber(value => value + 1)} className="text-[#7288A3] hover:text-[#007EA7]"><RefreshCw size={17} /></button>
        <div className="w-[84px]"><SearchableSelect ariaLabel="Metrics interval" value={interval} onChange={setIntervalValue} options={["1m", "5m", "15m", "1h"]} className="h-8 border-b border-[#D3E1EC] bg-white px-1 pr-7 font-montserrat text-[12px] font-semibold text-[#7288A3]" /></div>
      </div>

      <div className="flex flex-col gap-3 overflow-auto p-4">
        <div className="grid gap-3 xl:grid-cols-2">
          <section className="rounded-lg border border-[#D3E1EC] bg-white p-4 shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
            <div className="mb-1 flex items-center justify-between"><h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">Task Executions</h3><button type="button" aria-label="Task executions menu" className="text-[#7288A3]"><MoreVertical size={17} /></button></div>
            <p className="mb-4 font-montserrat text-[11px] text-[#7288A3]">Calculated from {total} History / Table task records</p>
            <div className="flex flex-col gap-3">
              {executionRows.map(row => <div key={row.name} className="grid grid-cols-[92px_1fr_48px] items-center gap-3"><span className="font-montserrat text-[13px] font-medium text-[#10233A]">{row.name}</span><div className="h-7 overflow-hidden rounded-sm bg-[#F1F4F6]"><div className="h-full rounded-sm border-r-2 transition-[width] duration-500" style={{ width: `${total ? Math.max((row.value / total) * 100, row.value ? 1 : 0) : 0}%`, backgroundColor: row.tint, borderColor: row.color }} /></div><span className="text-right font-montserrat text-[21px] font-medium" style={{ color: row.color }}>{row.value}</span></div>)}
            </div>
          </section>

          <section className="rounded-lg border border-[#D3E1EC] bg-white p-4 shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
            <h3 className="mb-1 font-montserrat text-[16px] font-semibold text-[#10233A]">Processing Tasks</h3>
            <p className="mb-4 font-montserrat text-[11px] text-[#7288A3]">Human includes unique documents corrected and saved in OCR Workspace for {run.id}</p>
            <div className="flex flex-col gap-3">
              {processingDistribution.map(row => <div key={row.name} className="grid grid-cols-[72px_1fr_48px] items-center gap-3"><span className="font-montserrat text-[13px] font-medium text-[#10233A]">{row.name}</span><div className="h-7 overflow-hidden rounded-sm bg-[#F1F4F6]"><div className="h-full min-w-[2px] rounded-sm border-r-2 transition-[width] duration-500" style={{ width: `${Math.max((row.value / processingTotal) * 100, row.value ? 1 : 0)}%`, backgroundColor: `${row.color}33`, borderColor: row.color }} /></div><span className="text-right font-montserrat text-[21px] font-medium" style={{ color: row.color }}>{row.value}</span></div>)}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-[#D3E1EC] bg-white p-4 shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
          <h3 className="mb-1 font-montserrat text-[15px] font-semibold text-[#10233A]">Task average (s)</h3>
          <p className="mb-4 font-montserrat text-[11px] text-[#7288A3]">Average execution time for each History / Table task</p>
          <RunMetricRows rows={taskRows.map(({ name, value, color }) => ({ name, value, color }))} valueLabel={value => value.toFixed(value < 1 ? 4 : 2)} />
        </section>

        <section className="rounded-lg border border-[#D3E1EC] bg-white p-4 shadow-[0_2px_8px_rgba(16,35,58,0.04)]">
          <div className="mb-1 flex items-center justify-between"><h3 className="font-montserrat text-[15px] font-semibold text-[#10233A]">All Task Executions (s)</h3><button type="button" aria-label="All task executions menu" className="text-[#7288A3]"><MoreVertical size={17} /></button></div>
          <p className="mb-4 font-montserrat text-[11px] text-[#7288A3]">Total task time: average duration multiplied by execution count</p>
          <RunMetricRows rows={allTaskRows} valueLabel={value => value.toFixed(value < 1 ? 3 : 2)} />
        </section>
      </div>
    </div>
  );
}

export function RunDetailCard({ run, onBack, onUpdate, onRefresh, onDelete, hideBackToList = false }: { run: RunRecord; onBack: () => void; onUpdate: (status: RunRecord['status']) => void; onRefresh: () => void; onDelete: () => void; hideBackToList?: boolean }) {
  const [tab, setTab] = useState<'History' | 'Event Log' | 'Metrics'>('History');
  return (
    <div className="flex min-h-[620px] flex-1 flex-col">
      <div className="rounded-t-lg border border-[#E5EDF9] bg-white px-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4"><h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">Run</h2>{!hideBackToList && <button type="button" onClick={onBack} className="flex items-center gap-2 font-montserrat text-[14px] font-semibold text-[#007EA7]"><ArrowLeft size={16} /> Back to list</button>}</div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex h-8 items-center gap-1">
              <StopButton stopped={run.status === 'Stopped' || run.status === 'Stopped Idle'} label={`STOP ${run.id}`} onStop={() => onUpdate('Stopped')} />
              <RecordRefreshButton disabled={run.status !== 'Stopped' && run.status !== 'Stopped Idle'} label={`REDO ${run.id}`} onRefresh={onRefresh} />
              <RowDeleteButton title="DELETE ALL" label={`DELETE ALL ${run.id}`} onDelete={onDelete} />
            </div>
            <span className="font-montserrat text-[12px] text-[#7288A3]">{run.node} user on {run.created}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-8">{(['History', 'Event Log', 'Metrics'] as const).map(item => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 pb-3 font-montserrat text-[14px] font-medium ${tab === item ? 'border-[#007EA7] text-[#007EA7]' : 'border-transparent text-[#10233A]'}`}>{item}</button>)}</div>
      </div>
      {tab === 'History' && <RunHistory run={run} />}
      {tab === 'Event Log' && <RunEventLog run={run} />}
      {tab === 'Metrics' && <RunMetricsDashboard run={run} />}
    </div>
  );
}

export function RunsTab({ startSignal, refreshSignal = 0, bulkDeleteSignal, runs, setRuns, onDetailOpenChange, onSelectionCountChange, onRunOpen, onProcessOpen, initialRunId, showProcessName = false, columns: suppliedColumns, setColumns: setSuppliedColumns, toolbar }: {
  startSignal: number;
  refreshSignal?: number;
  bulkDeleteSignal: number;
  runs: RunRecord[];
  setRuns: (value: RunRecord[] | ((current: RunRecord[]) => RunRecord[])) => void;
  onDetailOpenChange: (open: boolean) => void;
  onSelectionCountChange: (count: number) => void;
  onRunOpen?: (run: RunRecord) => void;
  onProcessOpen?: (run: RunRecord) => void;
  initialRunId?: string;
  showProcessName?: boolean;
  columns?: ColConfig[];
  setColumns?: (columns: ColConfig[]) => void;
  toolbar?: ReactNode;
}) {
  const getRunKey = (run: RunRecord) => run.processId ? `${run.processId}:${run.id}` : run.id;
  const [page, setPage] = useState(1);
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(() => {
    const initialRun = initialRunId ? runs.find(run => run.id === initialRunId) : undefined;
    return initialRun ? getRunKey(initialRun) : null;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [localColumns, setLocalColumns] = useState<ColConfig[]>(() => showProcessName
    ? [RUN_COLUMNS[0], { key: 'process_name', label: 'Process Name', width: 160, visible: true }, ...RUN_COLUMNS.slice(1)]
    : RUN_COLUMNS
  );
  const columns = suppliedColumns ?? localColumns;
  const setColumns = setSuppliedColumns ?? setLocalColumns;
  const { startResize } = useColumnResize(columns, setColumns);
  const handledStartSignal = useRef(startSignal);
  const handledBulkDeleteSignal = useRef(bulkDeleteSignal);
  const handledRefreshSignal = useRef(refreshSignal);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (startSignal === handledStartSignal.current) return;
    handledStartSignal.current = startSignal;

    setRuns(current => {
      const currentLargestNumber = current.reduce((largest, run) => {
        const match = run.id.match(/(\d+)$/);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0);
      const globalNextNumber = Number(getNextGlobalRunId().match(/(\d+)$/)?.[1] ?? 1);
      const nextRunNumber = Math.max(currentLargestNumber + 1, globalNextNumber);
      const now = new Date();
      const twoDigits = (value: number) => String(value).padStart(2, '0');
      const created = `${twoDigits(now.getDate())}.${twoDigits(now.getMonth() + 1)}.${now.getFullYear()} ${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;

      return [{
        id: `RUN-${String(nextRunNumber).padStart(3, '0')}`,
        tasks: current[0]?.tasks ?? 1,
        status: 'In Progress',
        node: current[0]?.node ?? 'Node-01',
        created,
      }, ...current];
    });
    setPage(1);
  }, [startSignal, setRuns]);

  useEffect(() => {
    if (refreshSignal === handledRefreshSignal.current) return;
    handledRefreshSignal.current = refreshSignal;
    setRuns(current => current.map(run => ({ ...run })));
  }, [refreshSignal, setRuns]);

  useEffect(() => onSelectionCountChange(selectedIds.size), [selectedIds.size, onSelectionCountChange]);
  useEffect(() => {
    if (bulkDeleteSignal === handledBulkDeleteSignal.current) return;
    handledBulkDeleteSignal.current = bulkDeleteSignal;
    if (!selectedIds.size) return;
    setRuns(current => current.filter(run => !selectedIds.has(getRunKey(run))));
    setSelectedIds(new Set());
  }, [bulkDeleteSignal, selectedIds, setRuns]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredRuns = normalizedSearch
    ? runs.filter(run => `${run.id} ${run.tasks} ${run.status} ${run.node} ${run.created} ${run.processName ?? ''}`.toLowerCase().includes(normalizedSearch))
    : runs;
  type RunColumnKey = 'run_id' | 'process_name' | 'tasks_count' | 'status' | 'created_by' | 'creation_date';
  const { sortedRows: sortedRuns, changeSort, directionFor } = useMultiColumnSort(filteredRuns, (run, key: RunColumnKey) => {
    if (key === 'run_id') return run.id;
    if (key === 'process_name') return run.processName ?? '';
    if (key === 'tasks_count') return run.tasks;
    if (key === 'status') return run.status;
    if (key === 'created_by') return run.node;
    const [datePart, timePart = '00:00'] = run.created.split(' ');
    const [day, month, year] = datePart.split('.').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    return Number.isFinite(year) ? new Date(year, month - 1, day, hours, minutes).getTime() : run.created;
  });
  const allSelected = filteredRuns.length > 0 && filteredRuns.every(run => selectedIds.has(getRunKey(run)));
  const visibleColumns = columns.filter(column => column.visible);
  const gridTemplateColumns = `42px ${visibleColumns.map(column => `${column.width}px`).join(' ')} minmax(100px, 1fr)`;
  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + 142;

  function toggleAll() {
    setSelectedIds(current => {
      const next = new Set(current);
      filteredRuns.forEach(run => allSelected ? next.delete(getRunKey(run)) : next.add(getRunKey(run)));
      return next;
    });
  }

  function toggleOne(key: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedRun = runs.find(run => getRunKey(run) === selectedRunKey);
  useEffect(() => {
    onDetailOpenChange(Boolean(selectedRunKey));
    return () => onDetailOpenChange(false);
  }, [selectedRunKey, onDetailOpenChange]);

  if (selectedRun) {
    return (
      <RunDetailCard
        run={selectedRun}
        onBack={() => setSelectedRunKey(null)}
        onUpdate={(status) => setRuns(current => current.map(run => getRunKey(run) === getRunKey(selectedRun) ? { ...run, status } : run))}
        onRefresh={() => setRuns(current => current.map(run => getRunKey(run) === getRunKey(selectedRun) ? { ...run, status: 'In Progress' } : run))}
        onDelete={() => { setRuns(current => current.filter(run => getRunKey(run) !== getRunKey(selectedRun))); setSelectedRunKey(null); }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <FilterSearch value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} ariaLabel="Search automation process runs" />
        {toolbar && <div className="ml-auto flex h-7 flex-shrink-0 items-center gap-4 bg-white px-[6px]">{toolbar}</div>}
      </div>
      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: tableMinWidth }}>
          <div className="system-table-header-row mb-3 grid h-6 items-center" style={{ gridTemplateColumns }}>
            <div data-table-header-select="true" className="system-table-select-cell flex h-6 items-center px-3">
              <RowCheckbox checked={allSelected} onChange={toggleAll} />
            </div>
            {visibleColumns.map((column, index) => {
              const realIndex = columns.findIndex(item => item.key === column.key);
              const sortKey = column.key as RunColumnKey;
              return (
                <div key={column.key} className={`relative flex h-6 items-center gap-[6px] px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>
                  <span className="min-w-0 truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={directionFor(sortKey)} onDirectionChange={direction => changeSort(sortKey, direction)} />
                  {realIndex >= 0 && <ResizeHandle onMouseDown={event => startResize(realIndex, event)} />}
                </div>
              );
            })}
            <span aria-hidden="true" className="sticky right-0 z-10 h-6 bg-white" />
          </div>
          <div className="flex flex-col">
            {sortedRuns.map((row, i) => {
              const runKey = getRunKey(row);
              return (
              <div key={runKey} className={`system-table-row group grid h-10 w-full items-center rounded-lg ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9] transition-colors`} style={{ gridTemplateColumns }}>
                <div className="system-table-select-cell flex h-10 items-center px-3">
                  <RowCheckbox checked={selectedIds.has(runKey)} onChange={() => toggleOne(runKey)} />
                </div>
                {visibleColumns.map(column => (
                  <div key={column.key} className="flex min-w-0 items-center gap-2 overflow-hidden px-3">
                    {column.key === 'run_id' && <button type="button" onClick={() => onRunOpen ? onRunOpen(row) : setSelectedRunKey(runKey)} className="truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline focus:underline focus:outline-none" aria-label={`Open ${row.id} details`}>{row.id}</button>}
                    {column.key === 'process_name' && (row.processName ? <button type="button" onClick={() => onProcessOpen?.(row)} className="truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline focus:underline focus:outline-none" aria-label={`Open ${row.processName} process runs`}>{row.processName}</button> : <span className="font-montserrat text-[12px] text-[#10233A]">—</span>)}
                    {column.key === 'tasks_count' && <span className="truncate font-montserrat text-[12px] text-[#10233A]">{row.tasks}</span>}
                    {column.key === 'status' && <><StatusDot status={row.status} /><span className="truncate font-montserrat text-[12px] text-[#10233A]">{row.status}</span></>}
                    {column.key === 'created_by' && <span className="truncate font-montserrat text-[12px] text-[#10233A]">{row.node}</span>}
                    {column.key === 'creation_date' && <span className="truncate font-montserrat text-[12px] text-[#10233A]">{row.created}</span>}
                  </div>
                ))}
                <div className={`table-row-actions sticky right-0 z-10 flex h-10 items-center justify-end gap-1 pr-2 transition-colors group-hover:bg-[#E7F4F9] ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`} onClick={event => event.stopPropagation()}>
                  <StopButton
                    size={16}
                    stopped={row.status === 'Stopped' || row.status === 'Stopped Idle'}
                    label={`STOP run ${row.id}`}
                    onStop={() => setRuns(current => current.map(run => getRunKey(run) === runKey ? { ...run, status: 'Stopped' } : run))}
                  />
                  <RecordRefreshButton
                    size={16}
                    disabled={row.status !== 'Stopped' && row.status !== 'Stopped Idle'}
                    label={`REDO run ${row.id}`}
                    onRefresh={() => setRuns(current => current.map(run => getRunKey(run) === runKey ? { ...run, status: 'In Progress' } : run))}
                  />
                  <RowDeleteButton label={`Delete run ${row.id}`} onDelete={() => { setRuns(current => current.filter(run => getRunKey(run) !== runKey)); setSelectedIds(current => { const next = new Set(current); next.delete(runKey); return next; }); }} />
                </div>
              </div>
              );
            })}
            {filteredRuns.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center">
                <span className="font-montserrat text-[18px] font-semibold text-[#10233A]">No results found</span>
                <span className="font-montserrat text-[14px] font-medium text-[#7288A3]">No run contains “{searchQuery.trim()}”</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      {/* Pagination Bar */}
      <div className="flex flex-row justify-between items-center h-8">
        <TablePagination currentPage={page} totalPages={Math.max(1, Math.ceil(filteredRuns.length / 20))} itemCount={filteredRuns.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

function Checkbox({ checked, indeterminate = false, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative flex h-[18px] w-[18px] flex-shrink-0 self-center items-center justify-center focus:outline-none"
      style={{ width: 18, height: 18 }}
      aria-checked={indeterminate ? 'mixed' : checked}
      role="checkbox"
    >
      <span
        className="absolute inset-0 rounded-[6px] transition-colors"
        style={{
          boxSizing: 'border-box',
          border: checked || indeterminate ? '1px solid #007EA7' : '1px solid #A1B6C6',
          background: checked || indeterminate ? '#007EA7' : 'transparent',
        }}
      />
      {(checked || indeterminate) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            {indeterminate && !checked
              ? <line x1="2" y1="4" x2="8" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              : <polyline points="1.5,4 4,6.5 8.5,1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            }
          </svg>
        </span>
      )}
    </button>
  );
}

export function NodesTab({ refreshSignal, createSignal, bulkDeleteSignal, onSelectionCountChange, onItemCountChange, columns: suppliedColumns, setColumns: setSuppliedColumns, storageKey = 'default', toolbar }: { refreshSignal: number; createSignal: number; bulkDeleteSignal: number; onSelectionCountChange: (count: number) => void; onItemCountChange: (count: number) => void; columns?: ColConfig[]; setColumns?: (columns: ColConfig[]) => void; storageKey?: string; toolbar?: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nodes, setNodes] = usePersistentState(`finansu-harmonija:v7:configuration-parameters:${storageKey}`, NODES_DATA);
  const [localColumns, setLocalColumns] = useState<ColConfig[]>(CONFIGURATION_COLUMNS);
  const columns = suppliedColumns ?? localColumns;
  const setColumns = setSuppliedColumns ?? setLocalColumns;
  const { startResize } = useColumnResize(columns, setColumns);
  const [searchQuery, setSearchQuery] = useState('');
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editTreeView, setEditTreeView] = useState(false);
  const [editJson, setEditJson] = useState(false);
  const [editFullScreen, setEditFullScreen] = useState(false);
  const [configurationCopied, setConfigurationCopied] = useState(false);
  const handledCreateSignal = useRef(createSignal);
  const handledBulkDeleteSignal = useRef(bulkDeleteSignal);

  useEffect(() => {
    if (refreshSignal === 0) return;
    setNodes(current => current.map(node => ({ ...node })));
  }, [refreshSignal, setNodes]);

  useEffect(() => {
    if (createSignal === handledCreateSignal.current) return;
    handledCreateSignal.current = createSignal;
    setNewKey('');
    setNewValue('');
    setEditTreeView(false);
    setEditJson(false);
    setEditFullScreen(false);
    setShowCreate(true);
  }, [createSignal]);

  useEffect(() => onSelectionCountChange(selected.size), [selected.size, onSelectionCountChange]);
  useEffect(() => onItemCountChange(nodes.length), [nodes.length, onItemCountChange]);
  useEffect(() => {
    if (bulkDeleteSignal === handledBulkDeleteSignal.current) return;
    handledBulkDeleteSignal.current = bulkDeleteSignal;
    if (!selected.size) return;
    setNodes(current => current.filter(node => !selected.has(node.id)));
    setSelected(new Set());
  }, [bulkDeleteSignal, selected, setNodes]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredNodes = normalizedSearch
    ? nodes.filter(node => `${node.name} ${node.value}`.toLowerCase().includes(normalizedSearch))
    : nodes;
  type ConfigurationColumnKey = 'key' | 'value';
  const { sortedRows: sortedNodes, changeSort, directionFor } = useMultiColumnSort(filteredNodes, (node, key: ConfigurationColumnKey) => key === 'key' ? node.name : node.value);
  const visibleColumns = columns.filter(column => column.visible);
  const configurationGridTemplate = `42px ${visibleColumns.map(column => `${column.width}px`).join(' ')} minmax(48px, 1fr)`;
  const configurationTableMinWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + 90;
  const allSelected = filteredNodes.length > 0 && filteredNodes.every(node => selected.has(node.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(current => {
        const next = new Set(current);
        filteredNodes.forEach(node => next.add(node.id));
        return next;
      });
    }
  };

  const editedNode = nodes.find(node => node.id === editNodeId);
  const editDirty = Boolean(editedNode) && (editKey !== editedNode?.name || editValue !== editedNode?.value);
  const openEditNode = (node: (typeof NODES_DATA)[number]) => {
    setEditNodeId(node.id);
    setEditKey(node.name);
    setEditValue(node.value);
    setEditTreeView(false);
    setEditJson(false);
    setEditFullScreen(false);
  };
  const closeEditNode = () => setEditNodeId(null);
  const updateEditedNode = () => {
    if (!editNodeId || !editKey.trim() || !editValue.trim() || !editDirty) return;
    setNodes(current => current.map(node => node.id === editNodeId ? { ...node, name: editKey.trim(), value: editValue } : node));
    closeEditNode();
  };
  const closeCreateNode = () => {
    setShowCreate(false);
    setNewKey('');
    setNewValue('');
    setEditTreeView(false);
    setEditJson(false);
    setEditFullScreen(false);
  };
  const createConfigurationNode = () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setNodes(current => [...current, { id: String(Date.now()), name: newKey.trim(), value: newValue }]);
    closeCreateNode();
  };
  const copyConfigurationValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const copyArea = document.createElement('textarea');
      copyArea.value = value;
      copyArea.style.position = 'fixed';
      copyArea.style.opacity = '0';
      document.body.appendChild(copyArea);
      copyArea.select();
      document.execCommand('copy');
      document.body.removeChild(copyArea);
    }
    setConfigurationCopied(true);
    window.setTimeout(() => setConfigurationCopied(false), 2500);
  };

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [page, setPage] = useState(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <FilterSearch value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} ariaLabel="Search configuration parameters" />
        {toolbar && <div className="ml-auto flex h-7 flex-shrink-0 items-center gap-4 bg-white px-[6px]">{toolbar}</div>}
      </div>
      {nodes.length > 0 ? (
      <>
      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: configurationTableMinWidth }}>
          <div className="system-table-header-row mb-3 grid h-6 items-center" style={{ gridTemplateColumns: configurationGridTemplate }}>
            <div data-table-header-select="true" className="system-table-select-cell flex h-6 items-center px-3">
              <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
            </div>
            {visibleColumns.map((column, index) => {
              const realIndex = columns.findIndex(item => item.key === column.key);
              const sortKey = column.key as ConfigurationColumnKey;
              return <div key={column.key} className={`relative flex h-6 items-center gap-[6px] px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>
                <span className="min-w-0 truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">{column.label}</span>
                <ColumnSortButton columnLabel={column.label} direction={directionFor(sortKey)} onDirectionChange={direction => changeSort(sortKey, direction)} />
                <ResizeHandle onMouseDown={event => startResize(realIndex, event)} />
              </div>;
            })}
            <span aria-hidden="true" className="sticky right-0 z-10 h-6 bg-white" />
          </div>
          <div className="flex flex-col">
            {sortedNodes.map((row, i) => (
              <div key={row.id} className={`group grid h-10 w-full items-center rounded-lg ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9] transition-colors`} style={{ gridTemplateColumns: configurationGridTemplate }}>
                <div className="system-table-select-cell flex h-10 items-center px-3">
                  <Checkbox checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                </div>
                {visibleColumns.map(column => <div key={column.key} className="flex min-w-0 items-center gap-3 overflow-hidden px-3">
                  {column.key === 'key' && <button type="button" onClick={() => openEditNode(row)} className="truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline focus:underline focus:outline-none" aria-label={`Edit configuration ${row.name}`}>{row.name}</button>}
                  {column.key === 'value' && <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{row.value}</span>}
                </div>)}
                <div className={`table-row-actions sticky right-0 z-10 flex h-10 items-center justify-end gap-1 pr-2 transition-colors group-hover:bg-[#E7F4F9] ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                  <RowDeleteButton label={`Delete ${row.name}`} onDelete={() => { setNodes(current => current.filter(node => node.id !== row.id)); setSelected(current => { const next = new Set(current); next.delete(row.id); return next; }); }} />
                </div>
              </div>
            ))}
            {filteredNodes.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center">
                <span className="font-montserrat text-[18px] font-semibold text-[#10233A]">No results found</span>
                <span className="font-montserrat text-[14px] font-medium text-[#7288A3]">No configuration parameter contains “{searchQuery.trim()}”</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      </>
      ) : (
        <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center">
          <div className="flex w-[320px] flex-col items-center gap-4">
            <span className="w-full text-center font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">Empty collection</span>
            <span className="w-full text-center font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">Press "Create new" button to start your work</span>
            <PageActionButton onClick={() => setShowCreate(true)}>Create new</PageActionButton>
          </div>
        </div>
      )}

      {/* Pagination footer — Frame 33631 */}
      <div className="flex flex-row justify-between items-center w-full" style={{ height: 32 }}>
        <TablePagination currentPage={page} totalPages={Math.max(1, Math.ceil(filteredNodes.length / 20))} itemCount={filteredNodes.length} onPageChange={setPage} />
      </div>
      {showCreate && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-[#10233A]/20" onMouseDown={closeCreateNode}>
          <div role="dialog" aria-modal="true" aria-label="Create configuration" className={`flex h-full flex-col gap-6 bg-white p-6 shadow-[-2px_0_0_#E5EDF9] transition-[width] ${editFullScreen ? 'w-full' : 'w-[520px] max-w-[calc(100vw-24px)]'}`} onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4"><h2 className="font-montserrat text-[24px] font-semibold leading-8 text-[#10233A]">Create Configuration</h2><button type="button" title="Close" aria-label="Close create configuration" onClick={closeCreateNode} className="text-[#7288A3] hover:text-[#10233A]"><X size={28} /></button></div>
            <label className="flex flex-col gap-2"><span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Key <span className="text-[#E45858]">*</span></span><input value={newKey} onChange={event => setNewKey(event.target.value)} placeholder="Enter key" className="h-[42px] border-b border-[#A1B6C6] bg-white px-0 font-montserrat text-[16px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" /></label>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Value <span className="text-[#E45858]">*</span></span>
              <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
                <div className="flex min-h-0 flex-1 overflow-auto">{editTreeView ? <div className="flex flex-1 flex-col gap-2 p-4 font-mono text-[14px] text-[#10233A]"><div className="flex items-center gap-2"><ChevronDown size={16} className="text-[#7288A3]" /><span className="text-[#A61B1B]">value</span><span className="text-[#A1A1A1]">:</span><input value={newValue} onChange={event => setNewValue(event.target.value)} placeholder="Enter value" className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" /></div></div> : <><div className="flex w-12 flex-shrink-0 flex-col items-center bg-[#F8FAFC] py-4 font-mono text-[14px] leading-6 text-[#7288A3]">{newValue.split('\n').map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}</div><textarea value={newValue} onChange={event => setNewValue(event.target.value)} placeholder="Enter value" className="min-h-full flex-1 resize-none p-4 font-mono text-[15px] leading-6 text-[#10233A] outline-none" spellCheck={false} /></>}</div>
                <div className="flex h-11 flex-shrink-0 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] px-3">
                  <button type="button" role="switch" aria-checked={editTreeView} onClick={() => setEditTreeView(value => !value)} className="flex items-center gap-3 font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${editTreeView ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${editTreeView ? 'translate-x-4' : ''}`} /></span>Tree View</button>
                  <div className="flex items-center gap-4 text-[#7288A3]"><button type="button" title="MAP"><Map size={18} /></button><button type="button" title="SEARCH"><Search size={18} /></button><button type="button" title="WRAP TEXT"><AlignLeft size={18} /></button><button type="button" title="COPY" aria-label="COPY configuration value" onClick={() => copyConfigurationValue(newValue)} className={configurationCopied ? 'text-[#007EA7]' : ''}><Copy size={18} /></button><button type="button" title="FULL SCREEN" onClick={() => setEditFullScreen(value => !value)}>{editFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
                </div>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={editJson} onClick={() => setEditJson(value => !value)} className="flex items-center gap-3 self-start font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${editJson ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${editJson ? 'translate-x-4' : ''}`} /></span>JSON</button>
            <div className="mt-auto flex justify-end"><button type="button" data-system-action="true" disabled={!newKey.trim() || !newValue.trim()} onClick={createConfigurationNode} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] enabled:active:text-white disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">CREATE</button></div>
          </div>
        </div>
      )}
      {editedNode && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-[#10233A]/20" onMouseDown={closeEditNode}>
          <div role="dialog" aria-modal="true" aria-label={`Edit configuration ${editedNode.name}`} className={`flex h-full flex-col gap-6 bg-white p-6 shadow-[-2px_0_0_#E5EDF9] transition-[width] ${editFullScreen ? 'w-full' : 'w-[520px] max-w-[calc(100vw-24px)]'}`} onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-montserrat text-[24px] font-semibold leading-8 text-[#10233A]">Edit Configuration</h2>
              <button type="button" title="Close" aria-label="Close edit configuration" onClick={closeEditNode} className="text-[#7288A3] hover:text-[#10233A]"><X size={28} /></button>
            </div>
            <label className="flex flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Key <span className="text-[#E45858]">*</span></span>
              <input value={editKey} onChange={event => setEditKey(event.target.value)} className="h-[42px] border-b border-[#A1B6C6] bg-white px-0 font-montserrat text-[16px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
            </label>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Value <span className="text-[#E45858]">*</span></span>
              <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
                <div className="flex min-h-0 flex-1 overflow-auto">
                  {editTreeView ? (
                    <div className="flex flex-1 flex-col gap-2 p-4 font-mono text-[14px] text-[#10233A]"><div className="flex items-center gap-2"><ChevronDown size={16} className="text-[#7288A3]" /><span className="text-[#A61B1B]">value</span><span className="text-[#A1A1A1]">:</span><input value={editValue} onChange={event => setEditValue(event.target.value)} className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" /></div></div>
                  ) : (
                    <><div className="flex w-12 flex-shrink-0 justify-center bg-[#F8FAFC] py-4 font-mono text-[14px] text-[#7288A3]">1</div><textarea value={editValue} onChange={event => setEditValue(event.target.value)} className="min-h-full flex-1 resize-none p-4 font-mono text-[15px] leading-6 text-[#10233A] outline-none" spellCheck={false} /></>
                  )}
                </div>
                <div className="flex h-11 flex-shrink-0 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] px-3">
                  <button type="button" role="switch" aria-checked={editTreeView} onClick={() => setEditTreeView(value => !value)} className="flex items-center gap-3 font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${editTreeView ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${editTreeView ? 'translate-x-4' : ''}`} /></span>Tree View</button>
                  <div className="flex items-center gap-4 text-[#7288A3]"><button type="button" title="MAP"><Map size={18} /></button><button type="button" title="SEARCH"><Search size={18} /></button><button type="button" title="WRAP TEXT"><AlignLeft size={18} /></button><button type="button" title="COPY" aria-label="COPY configuration value" onClick={() => copyConfigurationValue(editValue)} className={configurationCopied ? 'text-[#007EA7]' : ''}><Copy size={18} /></button><button type="button" title="FULL SCREEN" onClick={() => setEditFullScreen(value => !value)}>{editFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
                </div>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={editJson} onClick={() => setEditJson(value => !value)} className="flex items-center gap-3 self-start font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${editJson ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${editJson ? 'translate-x-4' : ''}`} /></span>JSON</button>
            <div className="mt-auto flex justify-end"><button type="button" data-system-action="true" disabled={!editDirty || !editKey.trim() || !editValue.trim()} onClick={updateEditedNode} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] enabled:active:text-white disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">UPDATE</button></div>
          </div>
        </div>
      )}
      {configurationCopied && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg">
          <CheckCircle2 size={18} />
          Configuration value copied successfully
        </div>
      )}
    </div>
  );
}

function updateJsonValue(root: unknown, path: string[], nextValue: unknown): unknown {
  if (path.length === 0) return nextValue;
  const [key, ...rest] = path;
  if (Array.isArray(root)) {
    const container = [...root];
    const index = Number(key);
    container[index] = updateJsonValue(container[index], rest, nextValue);
    return container;
  }
  const container = { ...(root as Record<string, unknown>) };
  container[key] = updateJsonValue(container[key], rest, nextValue);
  return container;
}

function getJsonValue(root: unknown, path: string[]): unknown {
  let current = root;
  for (const part of path) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else return undefined;
  }
  return current;
}

function deleteJsonValue(root: unknown, path: string[]): unknown {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getJsonValue(root, parentPath);
  const nextParent: unknown[] | Record<string, unknown> = Array.isArray(parent)
    ? [...parent]
    : { ...(parent as Record<string, unknown>) };
  if (Array.isArray(nextParent)) nextParent.splice(Number(key), 1);
  else delete nextParent[key];
  return updateJsonValue(root, parentPath, nextParent);
}

function renameJsonKey(root: unknown, parentPath: string[], oldKey: string, requestedKey: string): unknown {
  const nextKey = requestedKey.trim();
  if (!nextKey || nextKey === oldKey) return root;
  const parent = getJsonValue(root, parentPath);
  if (!parent || Array.isArray(parent) || Object.prototype.hasOwnProperty.call(parent, nextKey)) return root;
  const nextParent: Record<string, unknown> = {};
  Object.entries(parent).forEach(([key, value]) => {
    nextParent[key === oldKey ? nextKey : key] = value;
  });
  return updateJsonValue(root, parentPath, nextParent);
}

function parseEditedTreeValue(original: unknown, text: string): unknown {
  if (typeof original === 'number') {
    const number = Number(text);
    return Number.isNaN(number) ? original : number;
  }
  if (typeof original === 'boolean') return text.toLowerCase() === 'true';
  if (original === null && text === 'null') return null;
  return text;
}

function JsonTreeNode({ name, value, path, dataPath, depth, expanded, searchQuery, renameable = true, onToggle, onValueChange, onRename, onAdd, onDelete }: {
  name?: string;
  value: unknown;
  path: string;
  dataPath: string[];
  depth: number;
  expanded: Set<string>;
  searchQuery: string;
  renameable?: boolean;
  onToggle: (path: string) => void;
  onValueChange: (path: string[], value: unknown) => void;
  onRename: (parentPath: string[], oldKey: string, nextKey: string) => void;
  onAdd: (path: string[], kind: 'text' | 'branch') => void;
  onDelete: (path: string[]) => void;
}) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const entries = isObject ? Object.entries(value as Record<string, unknown>) : [];
  const isOpen = expanded.has(path);
  const paddingLeft = depth * 26;

  if (!isObject) {
    const rendered = typeof value === 'string' ? value : value === null ? 'null' : String(value);
    const valueColor = typeof value === 'string' ? '#1459A6' : typeof value === 'number' ? '#2E8B57' : '#7C4D9E';
    const matchesSearch = Boolean(searchQuery) && `${name ?? ''} ${rendered}`.toLowerCase().includes(searchQuery.toLowerCase());
    return (
      <div className={`group flex min-h-9 items-center gap-1 font-mono text-[16px] ${matchesSearch ? 'bg-[#FFF2B8]' : ''}`} style={{ paddingLeft }}>
        {name !== undefined && (renameable ? (
          <input
            key={name}
            defaultValue={name}
            onBlur={event => onRename(dataPath.slice(0, -1), name, event.target.value)}
            className="w-[150px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[#A61B1B] outline-none hover:border-[#D3E1EC] focus:border-[#007EA7]"
          />
        ) : <span className="min-w-8 px-1 text-[#A61B1B]">{name}</span>)}
        {name !== undefined && <span className="px-1 text-[#A1A1A1]">:</span>}
        <input
          value={rendered}
          onChange={event => onValueChange(dataPath, parseEditedTreeValue(value, event.target.value))}
          className="min-w-[180px] flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-[#D3E1EC] focus:border-[#007EA7]"
          style={{ color: valueColor }}
        />
        {dataPath.length > 0 && (
          <button type="button" title="DELETE" aria-label="DELETE TREE FIELD" onClick={() => onDelete(dataPath)} className="mr-2 rounded p-1 text-[#7288A3] opacity-0 hover:bg-[#E5EDF9] group-hover:opacity-100 focus:opacity-100">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    );
  }

  const matchesSearch = Boolean(searchQuery) && Boolean(name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div>
      <div className={`group flex min-h-9 w-full items-center font-mono text-[16px] ${matchesSearch ? 'bg-[#FFF2B8]' : ''}`} style={{ paddingLeft }}>
        <button type="button" onClick={() => onToggle(path)} className="mr-1 rounded p-0.5 hover:bg-[#E5EDF9]" aria-label={isOpen ? 'Collapse branch' : 'Expand branch'}>
          {isOpen ? <ChevronDown size={18} className="flex-shrink-0 text-[#A1A1A1]" /> : <ChevronRight size={18} className="flex-shrink-0 text-[#A1A1A1]" />}
        </button>
        {name !== undefined && (renameable ? (
          <input
            key={name}
            defaultValue={name}
            onBlur={event => onRename(dataPath.slice(0, -1), name, event.target.value)}
            className="w-[150px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[#A61B1B] outline-none hover:border-[#D3E1EC] focus:border-[#007EA7]"
          />
        ) : <span className="min-w-8 px-1 text-[#A61B1B]">{name}</span>)}
        {name !== undefined && <span className="px-1 text-[#A1A1A1]">:</span>}
        <span className="text-[#A1A1A1]">{isArray ? '[' : '{'}</span>
        {isArray && <span className="ml-2 rounded bg-[#DEDEDE] px-2 py-0.5 font-sans text-[13px] font-semibold leading-5 text-white">{entries.length} items</span>}
        <div className="ml-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" title="ADD TEXT FIELD" aria-label="ADD TEXT FIELD" onClick={() => { onAdd(dataPath, 'text'); if (!isOpen) onToggle(path); }} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]"><Plus size={15} /></button>
          <button type="button" title="ADD CHILD BRANCH" aria-label="ADD CHILD BRANCH" onClick={() => { onAdd(dataPath, 'branch'); if (!isOpen) onToggle(path); }} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]"><FolderPlus size={15} /></button>
          {dataPath.length > 0 && <button type="button" title="DELETE" aria-label="DELETE TREE BRANCH" onClick={() => onDelete(dataPath)} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]"><Trash2 size={15} /></button>}
        </div>
      </div>
      {isOpen && (
        <>
          {entries.map(([key, child]) => (
            <JsonTreeNode
              key={`${path}.${key}`}
              name={key}
              value={child}
              path={`${path}.${key}`}
              dataPath={[...dataPath, key]}
              depth={depth + 1}
              expanded={expanded}
              searchQuery={searchQuery}
              renameable={!isArray}
              onToggle={onToggle}
              onValueChange={onValueChange}
              onRename={onRename}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))}
          <div className="h-8 font-mono text-[17px] leading-8 text-[#A1A1A1]" style={{ paddingLeft: paddingLeft + 26 }}>{isArray ? ']' : '}'}</div>
        </>
      )}
    </div>
  );
}

const INITIAL_INPUT_JSON = '{\n  "parent": [],\n  "variables": {},\n  "_id": "c487a18d-bb20-48e5-a327-09e4998c5870"\n}';

function InputDataTab({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [treeView, setTreeView] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateDragging, setUpdateDragging] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const searchFieldRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(new Set(['root', 'root.parent', 'root.variables']));
  const [jsonContent, setJsonContent] = useState(INITIAL_INPUT_JSON);

  const lines = jsonContent.split('\n');
  const searchMatches: number[] = [];
  if (searchQuery) {
    const content = jsonContent.toLowerCase();
    const query = searchQuery.toLowerCase();
    let position = content.indexOf(query);
    while (position !== -1) {
      searchMatches.push(position);
      position = content.indexOf(query, position + Math.max(query.length, 1));
    }
  }
  let parsedJson: unknown = null;
  let treeError = '';
  try {
    parsedJson = JSON.parse(jsonContent);
  } catch {
    treeError = 'JSON is not valid. Fix the JSON text before opening Tree View.';
  }

  useEffect(() => {
    if (!fullScreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullScreen]);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchFieldRef.current?.focus(), 0);
  }, [searchOpen]);

  useEffect(() => {
    if (!treeView || !searchQuery) return;
    try {
      const value = JSON.parse(jsonContent);
      const paths = new Set<string>();
      const collectPaths = (current: unknown, path: string) => {
        if (current === null || typeof current !== 'object') return;
        paths.add(path);
        Object.entries(current as Record<string, unknown>).forEach(([key, child]) => collectPaths(child, `${path}.${key}`));
      };
      collectPaths(value, 'root');
      setExpandedTreePaths(paths);
    } catch {
      // Invalid JSON is already shown by the tree error message.
    }
  }, [treeView, searchQuery, jsonContent]);

  useEffect(() => {
    setJsonContent(INITIAL_INPUT_JSON);
    setSearchQuery('');
    setSearchResultIndex(0);
    setExpandedTreePaths(new Set(['root', 'root.parent', 'root.variables']));
  }, [refreshSignal]);

  const closeUpdate = () => {
    setUpdateOpen(false);
    setUpdateFile(null);
    setUpdateDragging(false);
    if (updateFileRef.current) updateFileRef.current.value = '';
  };

  const applyInputDataFile = async () => {
    if (!updateFile) return;
    const content = await updateFile.text();
    setJsonContent(content);
    setExpandedTreePaths(new Set(['root']));
    setUpdateMessage(`${updateFile.name} uploaded into Input data`);
    window.setTimeout(() => setUpdateMessage(''), 2500);
    closeUpdate();
  };

  const findNextSearchMatch = () => {
    if (!searchMatches.length) return;
    const matchIndex = searchResultIndex % searchMatches.length;
    const start = searchMatches[matchIndex];
    if (!treeView) {
      codeEditorRef.current?.focus();
      codeEditorRef.current?.setSelectionRange(start, start + searchQuery.length);
    }
    setSearchResultIndex((matchIndex + 1) % searchMatches.length);
  };

  const copyInputData = async () => {
    try {
      await navigator.clipboard.writeText(jsonContent);
    } catch {
      const copyArea = document.createElement('textarea');
      copyArea.value = jsonContent;
      copyArea.style.position = 'fixed';
      copyArea.style.opacity = '0';
      document.body.appendChild(copyArea);
      copyArea.select();
      document.execCommand('copy');
      document.body.removeChild(copyArea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className={`flex flex-row overflow-hidden bg-white ${fullScreen ? 'fixed inset-0 z-[200]' : 'rounded-lg border border-[#E5EDF9]'}`}
      style={{ height: fullScreen ? '100vh' : '662px' }}
    >
      {/* JSON Editor Panel */}
      <div className="flex flex-col flex-1 bg-white overflow-hidden">
        {searchOpen && (
          <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-[#E5EDF9] bg-[#F8FAFC] px-3">
            <Search size={16} className="flex-shrink-0 text-[#7288A3]" />
            <input
              ref={searchFieldRef}
              value={searchQuery}
              onChange={event => { setSearchQuery(event.target.value); setSearchResultIndex(0); }}
              onKeyDown={event => { if (event.key === 'Enter') findNextSearchMatch(); if (event.key === 'Escape') setSearchOpen(false); }}
              placeholder="Search in input data"
              className="h-8 min-w-0 flex-1 rounded-md border border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]"
            />
            <span className="whitespace-nowrap font-montserrat text-[12px] font-medium text-[#7288A3]">
              {searchQuery ? `${searchMatches.length} found` : 'Enter search text'}
            </span>
            <button type="button" onClick={findNextSearchMatch} disabled={!searchMatches.length} title="FIND NEXT" className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9] disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} title="CLOSE SEARCH" className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]">
              <X size={18} />
            </button>
          </div>
        )}
        {/* Editor Area */}
        <div className="flex flex-row flex-1 overflow-hidden">
          {treeView ? (
            <div
              className="flex-1 overflow-auto px-3 py-3 transition-colors duration-200"
              style={{ backgroundColor: copied ? '#E0E9E6' : '#FFFFFF' }}
            >
              {treeError ? (
                <div className="rounded-lg bg-[#FFF2F2] px-4 py-3 font-montserrat text-[14px] font-medium text-[#E45858]">
                  {treeError}
                </div>
              ) : (
                <JsonTreeNode
                  value={parsedJson}
                  path="root"
                  dataPath={[]}
                  depth={0}
                  expanded={expandedTreePaths}
                  searchQuery={searchQuery}
                  onToggle={(path) => {
                    setExpandedTreePaths(current => {
                      const next = new Set(current);
                      if (next.has(path)) next.delete(path);
                      else next.add(path);
                      return next;
                    });
                  }}
                  onValueChange={(path, value) => {
                    setJsonContent(JSON.stringify(updateJsonValue(parsedJson, path, value), null, 2));
                  }}
                  onRename={(parentPath, oldKey, nextKey) => {
                    setJsonContent(JSON.stringify(renameJsonKey(parsedJson, parentPath, oldKey, nextKey), null, 2));
                  }}
                  onAdd={(path, kind) => {
                    const container = getJsonValue(parsedJson, path);
                    if (Array.isArray(container)) {
                      setJsonContent(JSON.stringify(updateJsonValue(parsedJson, path, [...container, kind === 'branch' ? {} : '']), null, 2));
                      return;
                    }
                    if (container && typeof container === 'object') {
                      let key = kind === 'branch' ? 'new_branch' : 'new_field';
                      let suffix = 2;
                      while (Object.prototype.hasOwnProperty.call(container, key)) {
                        key = `${kind === 'branch' ? 'new_branch' : 'new_field'}_${suffix++}`;
                      }
                      setJsonContent(JSON.stringify(updateJsonValue(parsedJson, path, { ...container, [key]: kind === 'branch' ? {} : '' }), null, 2));
                    }
                  }}
                  onDelete={(path) => {
                    setJsonContent(JSON.stringify(deleteJsonValue(parsedJson, path), null, 2));
                  }}
                />
              )}
            </div>
          ) : (
            <>
              {/* Line Numbers */}
              <div className="flex flex-col items-center py-4 bg-[#F8FAFC] flex-shrink-0" style={{ width: '48px', minWidth: '48px' }}>
                {lines.map((_, i) => (
                  <span
                    key={i}
                    className="font-mono font-medium leading-[20px] tracking-wide select-none"
                    style={{ fontSize: '14px', color: '#A1B6C6', letterSpacing: '0.5px' }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
              {/* Code Content */}
              <div
                className="flex-1 overflow-auto p-4 transition-colors duration-200"
                style={{ backgroundColor: copied ? '#E0E9E6' : '#FFFFFF' }}
              >
                <textarea
                  ref={codeEditorRef}
                  value={jsonContent}
                  onChange={e => setJsonContent(e.target.value)}
                  className="w-full h-full resize-none outline-none font-mono font-medium leading-[20px] tracking-wide bg-transparent"
                  style={{ fontSize: '14px', color: '#10233A', letterSpacing: '0.5px', minHeight: '100%' }}
                  spellCheck={false}
                />
              </div>
            </>
          )}
        </div>
        {/* Toolbar */}
        <div className="flex flex-row justify-between items-center px-3 bg-[#F8FAFC] border-t border-[#E5EDF9] flex-shrink-0" style={{ height: '44px' }}>
          {/* Left: Update button + Toggle + Tree View */}
          <div className="flex flex-row items-center gap-3">
            <button
              type="button"
              data-system-action="true"
              onClick={() => setUpdateOpen(true)}
              className="flex h-8 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-semibold leading-5 text-[#7288A3] transition-colors hover:border-[#007EA7] active:border-[#007EA7] active:bg-[#007EA7] active:text-white"
            >
              UPDATE
            </button>
            <button
              onClick={() => setTreeView(!treeView)}
              className="relative flex-shrink-0 focus:outline-none"
              style={{ width: '30px', height: '18px' }}
              aria-label="Toggle tree view"
            >
              <div
                className="absolute inset-0 rounded-[13px] transition-colors duration-200"
                style={{ background: treeView ? '#007EA7' : '#A1B6C6' }}
              />
              <div
                className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform duration-200"
                style={{ transform: treeView ? 'translateX(14px)' : 'translateX(2px)' }}
              />
            </button>
            <span className="font-montserrat font-medium text-[14px] leading-[20px] text-[#7288A3]">Tree View</span>
          </div>
          {/* Right: Icons + Format button */}
          <div className="flex flex-row items-center gap-4">
            <div className="flex flex-row items-center" style={{ gap: '16px' }}>
              <button className="hover:opacity-70 transition-opacity" title="Map"><Map size={16} className="text-[#7288A3]" /></button>
              <button
                type="button"
                onClick={() => setSearchOpen(current => !current)}
                className="hover:opacity-70 transition-opacity"
                title="SEARCH01"
                aria-label="SEARCH01"
              >
                <Search size={16} className={searchOpen ? 'text-[#007EA7]' : 'text-[#7288A3]'} />
              </button>
              <button className="hover:opacity-70 transition-opacity" title="Wrap text"><AlignLeft size={16} className="text-[#7288A3]" /></button>
              <button className="hover:opacity-70 transition-opacity" title="Arrow"><ArrowRight size={16} className="text-[#7288A3]" /></button>
              <button
                type="button"
                onClick={copyInputData}
                className="hover:opacity-70 transition-opacity"
                title="COPY"
                aria-label="COPY"
              >
                <Copy size={16} className={copied ? 'text-[#007EA7]' : 'text-[#7288A3]'} />
              </button>
              <button
                type="button"
                onClick={() => setFullScreen(current => !current)}
                className="hover:opacity-70 transition-opacity"
                title={fullScreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
                aria-label={fullScreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}
              >
                {fullScreen
                  ? <Minimize2 size={16} className="text-[#7288A3]" />
                  : <Maximize2 size={16} className="text-[#7288A3]" />}
              </button>
            </div>

          </div>
        </div>
      </div>
      {/* Right Sidebar */}
      {!fullScreen && (
        <div
          className="flex flex-col items-start bg-[#F8FAFC] flex-shrink-0 overflow-y-auto"
          style={{ width: '286px', padding: '16px 24px', gap: '8px', borderLeft: '1px solid #E5EDF9' }}
        >
          <h3 className="font-montserrat font-semibold text-[18px] leading-[24px] text-[#10233A] w-full">Add Input Data</h3>
          <p className="font-montserrat font-medium text-[14px] leading-[20px] text-[#10233A]">
            The data input file contains information needed to complete the task. You can either upload a ready JSON file, or write it right in editor. You are allowed to change "variables" content of the input JSON, all other fields will be ignored.
          </p>
        </div>
      )}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg"
        >
          <CheckCircle2 size={18} />
          Content copied successfully
        </div>
      )}
      {updateOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-[#10233A]/20 p-4" onMouseDown={closeUpdate}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Update Input data"
            className="flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Update Input data</h2>
                <p className="font-montserrat text-[13px] font-medium leading-5 text-[#7288A3]">Select a JSON or TXT file to replace the current content.</p>
              </div>
              <button type="button" title="Close" aria-label="Close Input data update" onClick={closeUpdate} className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>
            <input
              ref={updateFileRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={event => setUpdateFile(event.target.files?.[0] ?? null)}
            />
            <div
              className={`flex min-h-[164px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-5 py-6 transition-colors ${updateDragging ? 'border-[#007EA7] bg-[#F8FDFF]' : 'border-[#4C7CFF] bg-white'}`}
              onDragEnter={event => { event.preventDefault(); setUpdateDragging(true); }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={event => { event.preventDefault(); setUpdateDragging(false); }}
              onDrop={event => {
                event.preventDefault();
                setUpdateDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file && (file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.txt'))) setUpdateFile(file);
              }}
            >
              <button type="button" data-system-action="true" onClick={() => updateFileRef.current?.click()} className="flex h-[42px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006B8F]">Browse file</button>
              <p className="max-w-full break-words text-center font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">{updateFile ? updateFile.name : 'Drop a JSON or TXT file here'}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeUpdate} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
              <button type="button" disabled={!updateFile} onClick={applyInputDataFile} className="flex h-[42px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold text-white hover:bg-[#006B8F] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">Upload file</button>
            </div>
          </div>
        </div>
      )}
      {updateMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[320] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg">
          <CheckCircle2 size={18} />
          {updateMessage}
        </div>
      )}
    </div>
  );
}

const ALERT_COLUMNS: ColConfig[] = [
  { key: 'type', label: 'Trigger', width: 184, visible: true },
  { key: 'message', label: 'Channel', width: 240, visible: true },
  { key: 'node', label: 'Template', width: 240, visible: true },
];

export function AlertsTab({ createSignal, alerts, setAlerts }: {
  createSignal: number;
  alerts: AlertRecord[];
  setAlerts: (value: AlertRecord[] | ((current: AlertRecord[]) => AlertRecord[])) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [triggerDropdownOpen, setTriggerDropdownOpen] = useState(false);
  const [newChannel, setNewChannel] = useState('');
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState('');
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const handledCreateSignal = useRef(createSignal);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(ALERT_COLUMNS);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter(column => column.visible);
  const notificationGridTemplate = `42px ${visibleColumns.map(column => `${column.width}px`).join(' ')} minmax(44px, 1fr)`;
  const notificationTableMinWidth = visibleColumns.reduce((total, column) => total + column.width, 0) + 86;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredAlerts = normalizedSearch
    ? alerts.filter(alert => `${alert.type} ${alert.message} ${alert.node} ${alert.created}`.toLowerCase().includes(normalizedSearch))
    : alerts;
  type AlertColumnKey = 'type' | 'message' | 'node' | 'created';
  const { sortedRows: sortedAlerts, changeSort, directionFor } = useMultiColumnSort(filteredAlerts, (alert, key: AlertColumnKey) => alert[key]);
  const allSelected = filteredAlerts.length > 0 && filteredAlerts.every(alert => selected.has(alert.id));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (createSignal === handledCreateSignal.current) return;
    handledCreateSignal.current = createSignal;
    setShowCreate(true);
  }, [createSignal]);

  const closeCreate = () => {
    setShowCreate(false);
    setTriggerDropdownOpen(false);
    setChannelDropdownOpen(false);
    setTemplateDropdownOpen(false);
    setNewTrigger('');
    setNewChannel('');
    setNewTemplate('');
  };

  const createNotification = () => {
    if (!newTrigger.trim() || !newChannel.trim() || !newTemplate.trim()) return;
    setAlerts(current => [...current, { id: String(Date.now()), type: newTrigger.trim(), message: newChannel.trim(), node: newTemplate.trim(), created: new Date().toISOString() }]);
    closeCreate();
  };

  const toggleAll = () => {
    setSelected(current => {
      const next = new Set(current);
      filteredAlerts.forEach(alert => allSelected ? next.delete(alert.id) : next.add(alert.id));
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col flex-1" style={{ gap: 24 }}>
      {/* Toolbar row */}
      <div className="flex flex-row flex-wrap justify-between items-start gap-2">
        {/* Search */}
        <OcrSearchField ariaLabel="Search notifications" value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} />
        {/* Icon toolbar — Frame 33669 */}
        <div
          className="flex flex-row items-start bg-white rounded-[4px]"
          style={{ padding: 6, gap: 16, width: 124, height: 28 }}
        >
          <BulkDeleteButton selectedCount={selected.size} onDelete={() => { setAlerts(current => current.filter(alert => !selected.has(alert.id))); setSelected(new Set()); }} />
          <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
          <ImportButton scope="Automation process notifications" />
          <RefreshAllButton onRefresh={() => setAlerts(current => current.map(alert => ({ ...alert })))} />
        </div>
      </div>

      {/* Table area with column header + rows / empty state */}
      <div className="flex flex-1 flex-col justify-between">
        <div ref={tableScrollRef} className="flex flex-1 flex-col overflow-x-auto scrollbar-hide">
          <div className="flex w-full flex-col" style={{ minWidth: notificationTableMinWidth }}>
          {/* Column header */}
          <div className="system-table-header-row mb-3 grid h-9 items-start" style={{ gridTemplateColumns: notificationGridTemplate }}>
            <div data-table-header-select="true" className="system-table-select-cell flex h-9 items-start px-3">
              <button type="button" role="checkbox" aria-checked={someSelected && !allSelected ? 'mixed' : allSelected} onClick={toggleAll} className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
                <div className={`h-[18px] w-[18px] rounded-[6px] border ${allSelected || someSelected ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`} />
                {someSelected && !allSelected && <div className="absolute h-[2px] w-[8px] rounded bg-white" />}
                {allSelected && <svg className="absolute inset-0 m-auto" width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </div>
            {visibleColumns.map((column) => { const realIndex = columns.findIndex(item => item.key === column.key); const sortKey = column.key as AlertColumnKey; return <div key={column.key} className="relative flex h-9 items-start gap-[6px] px-3"><span className="min-w-0 whitespace-normal font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">{column.label}</span><ColumnSortButton columnLabel={column.label} direction={directionFor(sortKey)} onDirectionChange={direction => changeSort(sortKey, direction)} /><ResizeHandle onMouseDown={event => startResize(realIndex, event)} /></div>; })}
            <span aria-hidden="true" />
          </div>

          {/* Data rows */}
          {alerts.length > 0 && (
            <div className="mt-4 flex flex-col">
              {sortedAlerts.map((row, i) => (
                <div
                  key={row.id}
                  className={`group grid h-9 w-full items-center rounded-lg transition-colors ${i % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`}
                  style={{ gridTemplateColumns: notificationGridTemplate }}
                >
                  <div className="system-table-select-cell flex h-9 items-center px-3">
                    <button type="button" role="checkbox" aria-checked={selected.has(row.id)} onClick={() => toggleRow(row.id)} className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
                      <div className={`h-[18px] w-[18px] rounded-[6px] border ${selected.has(row.id) ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`} />
                      {selected.has(row.id) && <svg className="absolute inset-0 m-auto" width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  </div>
                  {visibleColumns.map((column) => <div key={column.key} className="flex h-9 items-center overflow-hidden px-3"><span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{String(row[column.key as keyof AlertRecord] ?? '—')}</span></div>)}
                  <div className="flex h-9 items-center justify-end pr-1">
                    <RowDeleteButton label={`Delete notification ${row.id}`} onDelete={() => { setAlerts(current => current.filter(alert => alert.id !== row.id)); setSelected(current => { const next = new Set(current); next.delete(row.id); return next; }); }} />
                  </div>
                </div>
              ))}
              {filteredAlerts.length === 0 && (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center">
                  <span className="font-montserrat text-[18px] font-semibold text-[#10233A]">No results found</span>
                  <span className="font-montserrat text-[14px] font-medium text-[#7288A3]">No notification contains “{searchQuery.trim()}”</span>
                </div>
              )}
            </div>
          )}
          </div>

        {/* Empty state — centered */}
          {alerts.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center" style={{ minHeight: 320 }}>
              <div className="flex flex-col items-center gap-4" style={{ width: 320 }}>
                <span className="font-montserrat font-semibold text-[18px] leading-[24px] text-[#10233A] w-full text-center">Empty collection</span>
                <span className="font-montserrat font-medium text-[14px] leading-[20px] text-[#10233A] w-full text-center">Press "Create new" button to start your work</span>
                <PageActionButton onClick={() => setShowCreate(true)}>Create new</PageActionButton>
              </div>
            </div>
          )}
        </div>

        <HorizontalTableScrollbar scrollRef={tableScrollRef} />

        {/* Pagination footer */}
        <div className="flex flex-row justify-between items-center w-full" style={{ height: 32 }}>
          <TablePagination currentPage={page} totalPages={Math.max(1, Math.ceil(filteredAlerts.length / 20))} itemCount={filteredAlerts.length} onPageChange={setPage} />
        </div>
      </div>
      {showColumnSettings && <ColumnSettingsPanel columns={columns} defaultColumns={ALERT_COLUMNS} onSave={setColumns} onClose={() => setShowColumnSettings(false)} />}
      {showCreate && (
        <div className="fixed inset-0 z-[310] flex justify-end bg-[#10233A]/20" onMouseDown={closeCreate}>
          <div role="dialog" aria-modal="true" aria-label="Create notification" className="flex h-full w-[420px] max-w-[calc(100vw-24px)] flex-col gap-6 bg-white p-6 shadow-[-2px_0_0_#E5EDF9]" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4"><h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Create new</h2><button type="button" title="Close" aria-label="Close create notification" onClick={closeCreate} className="text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button></div>
            <div className="relative flex flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Trigger <span className="text-[#E45858]">*</span></span>
              <button type="button" aria-haspopup="listbox" aria-expanded={triggerDropdownOpen} onClick={() => { setChannelDropdownOpen(false); setTemplateDropdownOpen(false); setTriggerDropdownOpen(open => !open); }} className={`flex h-[42px] items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium outline-none ${triggerDropdownOpen ? 'border-[#007EA7]' : 'border-[#D3E1EC]'}`}>
                <span className={newTrigger ? 'text-[#10233A]' : 'text-[#A1B6C6]'}>{newTrigger || 'Select trigger status'}</span>
                <ChevronDown size={16} className={`text-[#7288A3] transition-transform ${triggerDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {triggerDropdownOpen && (
                <div role="listbox" aria-label="Trigger statuses" className="absolute left-0 right-0 top-[70px] z-20 max-h-[360px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                  <span className="block px-3 pb-2 pt-1 font-montserrat text-[13px] font-medium text-[#7288A3]">Statuses</span>
                  {['Submitted', 'Failed', 'Completed', 'In Progress', 'Stopped', 'Stopped Idle', 'Queued', 'Deploying on Node', 'Stopping'].map(status => (
                    <button key={status} type="button" role="option" aria-selected={newTrigger === status} onClick={() => { setNewTrigger(status); setTriggerDropdownOpen(false); }} className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-[#F8FDFF]">
                      <span className={`flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-[6px] border ${newTrigger === status ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                        {newTrigger === status && <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="font-montserrat text-[14px] font-medium text-[#10233A]">{status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Channel <span className="text-[#E45858]">*</span></span>
              <button type="button" aria-haspopup="listbox" aria-expanded={channelDropdownOpen} onClick={() => { setTriggerDropdownOpen(false); setTemplateDropdownOpen(false); setChannelDropdownOpen(open => !open); }} className={`flex h-[42px] items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium outline-none ${channelDropdownOpen ? 'border-[#007EA7]' : 'border-[#D3E1EC]'}`}>
                <span className={newChannel ? 'text-[#10233A]' : 'text-[#A1B6C6]'}>{newChannel || 'Select channel'}</span>
                <ChevronDown size={16} className={`text-[#7288A3] transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {channelDropdownOpen && (
                <div role="listbox" aria-label="Notification channels" className="absolute left-0 right-0 top-[70px] z-20 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                  {['rpaplatform', 'demo_ap3_matching_results_email'].map(channel => (
                    <button key={channel} type="button" role="option" aria-selected={newChannel === channel} onClick={() => { setNewChannel(channel); setChannelDropdownOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[#F8FDFF] ${newChannel === channel ? 'bg-[#F8FDFF]' : ''}`}>
                      <span className={`flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-[6px] border ${newChannel === channel ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                        {newChannel === channel && <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="break-all font-montserrat text-[14px] font-medium text-[#10233A]">{channel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">Template <span className="text-[#E45858]">*</span></span>
              <button type="button" aria-haspopup="listbox" aria-expanded={templateDropdownOpen} onClick={() => { setTriggerDropdownOpen(false); setChannelDropdownOpen(false); setTemplateDropdownOpen(open => !open); }} className={`flex h-[42px] items-center justify-between rounded-lg border bg-white px-[14px] text-left font-montserrat text-[14px] font-medium outline-none ${templateDropdownOpen ? 'border-[#007EA7]' : 'border-[#D3E1EC]'}`}>
                <span className={`truncate ${newTemplate ? 'text-[#10233A]' : 'text-[#A1B6C6]'}`}>{newTemplate || 'Select template'}</span>
                <ChevronDown size={16} className={`ml-2 flex-shrink-0 text-[#7288A3] transition-transform ${templateDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {templateDropdownOpen && (
                <div role="listbox" aria-label="Notification templates" className="absolute left-0 right-0 top-[70px] z-20 max-h-[300px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                  {['Invoice Plane Email Template', 'Google Translate Sample Report', 'SAP Email Template', '[DEMOAP-2] Translation Report', '[DEMOAP-3] Matching Results Email Template'].map(template => (
                    <button key={template} type="button" role="option" aria-selected={newTemplate === template} onClick={() => { setNewTemplate(template); setTemplateDropdownOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[#F8FDFF] ${newTemplate === template ? 'bg-[#F8FDFF]' : ''}`}>
                      <span className={`flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-[6px] border ${newTemplate === template ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                        {newTemplate === template && <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true"><path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">{template}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-auto flex justify-end gap-2"><button type="button" onClick={closeCreate} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button><button type="button" data-system-action="true" disabled={!newTrigger.trim() || !newChannel.trim() || !newTemplate.trim()} onClick={createNotification} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] enabled:active:text-white disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4 flex-1 min-w-[280px]">
      <div className="flex flex-row items-center justify-between">
        <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">{title}</span>

      </div>
      <div className="w-full h-[180px] bg-[#F8FDFF] border border-[#E5EDF9] rounded-lg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-full flex flex-col justify-between px-4 py-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-full border-b border-dashed border-[#E5EDF9]" />
          ))}
        </div>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 180" preserveAspectRatio="none">
          <path d="M 10 140 Q 50 120, 80 100 T 140 80 T 200 60 T 260 90" stroke="#007EA7" strokeWidth="2" fill="none" opacity="0.6" />
          <path d="M 10 140 Q 50 120, 80 100 T 140 80 T 200 60 T 260 90 V 180 H 10 Z" fill="#007EA7" opacity="0.05" />
        </svg>
      </div>
    </div>
  );
}

function getRunHistoryStatusCounts(run: RunRecord) {
  if (run.status === 'Completed') return { Started: 0, Completed: run.tasks, Failed: 0 };
  if (run.status === 'Failed') return { Started: 0, Completed: Math.max(run.tasks - 1, 0), Failed: Math.min(run.tasks, 1) };
  if (run.status === 'Stopped' || run.status === 'Stopped Idle') {
    const completed = Math.floor(run.tasks / 2);
    return { Started: 0, Completed: completed, Failed: run.tasks - completed };
  }
  const completed = Math.floor(run.tasks * 0.4);
  return { Started: run.tasks - completed, Completed: completed, Failed: 0 };
}

function TaskExecutionsStatusChart({ runs }: { runs: RunRecord[] }) {
  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Task executions</span>
        <div className="flex items-center gap-3">
          {[{ label: 'Started', color: '#007EA7' }, { label: 'Completed', color: '#0ED8A8' }, { label: 'Failed', color: '#E45858' }].map(item => (
            <span key={item.label} className="flex items-center gap-1 font-montserrat text-[10px] font-medium text-[#7288A3]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
          ))}
        </div>
      </div>
      <div className="flex h-[180px] flex-col justify-center gap-3 overflow-auto rounded-lg border border-[#E5EDF9] bg-[#F8FDFF] px-4 py-4">
        {runs.map(run => {
          const counts = getRunHistoryStatusCounts(run);
          const total = Math.max(run.tasks, 1);
          return (
            <div key={run.id} className="grid grid-cols-[62px_1fr_28px] items-center gap-3">
              <span className="truncate font-montserrat text-[10px] font-medium text-[#7288A3]">{run.id}</span>
              <div className="flex h-3 overflow-hidden rounded-full bg-[#E5EDF9]" title={`Started: ${counts.Started}, Completed: ${counts.Completed}, Failed: ${counts.Failed}`}>
                {counts.Started > 0 && <span style={{ width: `${(counts.Started / total) * 100}%`, backgroundColor: '#007EA7' }} />}
                {counts.Completed > 0 && <span style={{ width: `${(counts.Completed / total) * 100}%`, backgroundColor: '#0ED8A8' }} />}
                {counts.Failed > 0 && <span style={{ width: `${(counts.Failed / total) * 100}%`, backgroundColor: '#E45858' }} />}
              </div>
              <span className="text-right font-montserrat text-[10px] font-semibold text-[#10233A]">{run.tasks}</span>
            </div>
          );
        })}
        {!runs.length && <span className="text-center font-montserrat text-[12px] font-medium text-[#A1B6C6]">No History records</span>}
      </div>
    </div>
  );
}

function ProcessExecutionsChart({ runs }: { runs: RunRecord[] }) {
  const statuses = [
    { name: 'In Progress', count: runs.filter(run => ['Submitted', 'In Progress', 'Queued', 'Deploying on Node', 'Stopping'].includes(run.status)).length, color: '#007EA7' },
    { name: 'Completed', count: runs.filter(run => run.status === 'Completed').length, color: '#0ED8A8' },
    { name: 'Failed', count: runs.filter(run => run.status === 'Failed').length, color: '#E45858' },
    { name: 'Stopped', count: runs.filter(run => run.status === 'Stopped' || run.status === 'Stopped Idle').length, color: '#7288A3' },
  ];
  const total = runs.length;
  let currentPercent = 0;
  const segments = statuses.map(status => {
    const start = currentPercent;
    currentPercent += total ? (status.count / total) * 100 : 0;
    return `${status.color} ${start}% ${currentPercent}%`;
  });

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-4">
      <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Process executions</span>
      <div className="flex h-[180px] items-center justify-center gap-8 rounded-lg border border-[#E5EDF9] bg-[#F8FDFF] px-6 py-5">
        <div
          className="relative h-[128px] w-[128px] flex-shrink-0 rounded-full"
          style={{ background: total ? `conic-gradient(${segments.join(', ')})` : '#E5EDF9' }}
          aria-label={`${total} process executions`}
        >
          <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="font-montserrat text-[24px] font-semibold leading-7 text-[#10233A]">{total}</span>
            <span className="font-montserrat text-[11px] font-medium leading-4 text-[#7288A3]">Runs</span>
          </div>
        </div>
        <div className="flex min-w-[150px] flex-col gap-2">
          {statuses.map(status => (
            <div key={status.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="flex-1 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">{status.name}</span>
              <span className="font-montserrat text-[13px] font-semibold leading-[18px] text-[#10233A]">{status.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonitoringTab({ runs }: { runs: RunRecord[] }) {
  return (
    <div className="flex flex-col gap-0 -mx-[clamp(24px,5vw,72px)]">
      {/* Toolbar */}
      <div className="flex flex-row justify-between items-center bg-[#EFF7FF]" style={{ padding: '12px 12px 4px', height: '36px', gap: '16px' }}>
        {/* Left: time range + interval */}
        <div className="flex flex-row items-center gap-6">
          {/* Last 1 hour dropdown */}
          <div className="flex flex-row items-center gap-2 rounded-[4px]" style={{ width: '120px', height: '20px' }}>
            <div className="flex flex-row items-center gap-1">
              {/* clock icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#7288A3" strokeWidth="1.2"/>
                <path d="M8 4.5V8.5L10.5 10" stroke="#7288A3" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="font-montserrat font-medium text-[14px] leading-[20px] text-[#10233A] whitespace-nowrap">Last 1 hour</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 6.5L8 10L11.5 6.5" stroke="#10233A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {/* 1m dropdown */}
          <div className="flex flex-row items-center gap-2 rounded-[4px]" style={{ width: '44px', height: '20px' }}>
            <span className="font-montserrat font-medium text-[14px] leading-[20px] text-[#10233A]">1m</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 6.5L8 10L11.5 6.5" stroke="#10233A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {/* Right: zoom-out, zoom-in, refresh */}
        <div className="flex flex-row items-start gap-4" style={{ height: '16px' }}>
          {/* zoom-out */}
          <button className="hover:opacity-70 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#7288A3" strokeWidth="1.3"/>
              <path d="M5 7H9" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11 11L13.5 13.5" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          {/* zoom-in */}
          <button className="hover:opacity-70 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#7288A3" strokeWidth="1.3"/>
              <path d="M5 7H9M7 5V10" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11 11L13.5 13.5" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          {/* refresh */}
          <button className="hover:opacity-70 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 8A5 5 0 1 1 8 3c1.5 0 2.8.6 3.8 1.6L13 6" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M13 3V6H10" stroke="#7288A3" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      {/* Charts */}
      <div className="flex flex-col gap-8 px-[clamp(24px,5vw,72px)] pt-8 pb-8">
        <div className="flex flex-row flex-wrap gap-8">
          <ProcessExecutionsChart runs={runs} />
          <TaskExecutionsStatusChart runs={runs} />
        </div>
        <div className="flex flex-row flex-wrap gap-8">
          <ChartPlaceholder title="Issue contribution" />
          <ChartPlaceholder title="Task average" />
        </div>
      </div>
    </div>
  );
}

export default function AutomationProcessDetailView({ process, onBack, initialRunId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Runs');
  const [runs, setRuns] = useState<RunRecord[]>(() => getProcessRuns(process.id));
  const [runDetailOpen, setRunDetailOpen] = useState(false);
  const [runsSelectedCount, setRunsSelectedCount] = useState(0);
  const [runsBulkDeleteSignal, setRunsBulkDeleteSignal] = useState(0);
  const [configurationSelectedCount, setConfigurationSelectedCount] = useState(0);
  const [configurationItemCount, setConfigurationItemCount] = useState(NODES_DATA.length);
  const [configurationBulkDeleteSignal, setConfigurationBulkDeleteSignal] = useState(0);
  const [startRunSignal, setStartRunSignal] = useState(0);
  const [runsRefreshSignal, setRunsRefreshSignal] = useState(0);
  const [refreshAllSignal, setRefreshAllSignal] = useState(0);
  const [detailRefreshSignal, setDetailRefreshSignal] = useState(0);
  const [inputDataRefreshSignal, setInputDataRefreshSignal] = useState(0);
  const [createConfigurationSignal, setCreateConfigurationSignal] = useState(0);
  const [createNotificationSignal, setCreateNotificationSignal] = useState(0);
  const [notifications, setNotifications] = usePersistentState<AlertRecord[]>(`finansu-harmonija:v7:automation-process:${process.id}:notifications`, ALERTS_DATA);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'original' | ''>('');
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [runColumns, setRunColumns] = usePersistentState<ColConfig[]>(`finansu-harmonija:v7:automation-process:${process.id}:run-columns`, RUN_COLUMNS);
  const [configurationColumns, setConfigurationColumns] = usePersistentState<ColConfig[]>(`finansu-harmonija:v7:automation-process:${process.id}:configuration-columns`, CONFIGURATION_COLUMNS);

  useEffect(() => {
    saveProcessRuns(process.id, runs);
  }, [process.id, runs]);

  const exportProcessDetails = () => {
    if (!exportFormat) return;
    const isJson = exportFormat === 'json';
    const exportingConfiguration = activeTab === 'Configuration parameters';
    const exportData = exportingConfiguration
      ? { processId: process.id, processName: process.name, configurationParameters: NODES_DATA }
      : process;
    const content = isJson
      ? JSON.stringify(exportData, null, 2)
      : JSON.stringify({ packageType: exportingConfiguration ? 'automation-process-configuration' : 'automation-process', exportedAt: new Date().toISOString(), data: exportData });
    const blob = new Blob([content], { type: isJson ? 'application/json' : 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = exportingConfiguration ? '-configuration' : '-details';
    link.download = `${process.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'automation-process'}${isJson ? `${suffix}.json` : `${suffix}-original.package`}`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    setExportFormat('');
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'Details': return <DetailTab process={process} refreshSignal={detailRefreshSignal} />;
      case 'Runs': return <RunsTab startSignal={startRunSignal} refreshSignal={runsRefreshSignal} bulkDeleteSignal={runsBulkDeleteSignal} runs={runs} setRuns={setRuns} onDetailOpenChange={setRunDetailOpen} onSelectionCountChange={setRunsSelectedCount} initialRunId={initialRunId} columns={runColumns} setColumns={setRunColumns} toolbar={runDetailOpen ? undefined : <><BulkDeleteButton selectedCount={runsSelectedCount} onDelete={() => setRunsBulkDeleteSignal(signal => signal + 1)} /><ColumnSettingsButton onClick={() => setShowColumnPanel(true)} /><RefreshAllButton onRefresh={() => setRunsRefreshSignal(signal => signal + 1)} /></>} />;
      case 'Configuration parameters': return <NodesTab refreshSignal={refreshAllSignal} createSignal={createConfigurationSignal} bulkDeleteSignal={configurationBulkDeleteSignal} onSelectionCountChange={setConfigurationSelectedCount} onItemCountChange={setConfigurationItemCount} columns={configurationColumns} setColumns={setConfigurationColumns} storageKey={`process-${process.id}`} toolbar={<><BulkDeleteButton selectedCount={configurationSelectedCount} onDelete={() => setConfigurationBulkDeleteSignal(signal => signal + 1)} /><ColumnSettingsButton onClick={() => setShowColumnPanel(true)} /><button type="button" data-button-family="export" aria-expanded={exportOpen} title="EXPORT" aria-label={`EXPORT ${process.name} configuration parameters`} onClick={() => setExportOpen(true)} className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"><Download size={16} /></button><ImportButton scope="Automation process configuration parameters" /><RefreshAllButton onRefresh={() => setRefreshAllSignal(signal => signal + 1)} /></>} />;
      case 'Input data': return <InputDataTab refreshSignal={inputDataRefreshSignal} />;
      case 'Metrics': return <MonitoringTab runs={runs} />;
      case 'Notifications': return <AlertsTab createSignal={createNotificationSignal} alerts={notifications} setAlerts={setNotifications} />;
    }
  };

  return (
    <div className="flex flex-col bg-white min-h-full" style={{ padding: '56px clamp(24px, 5vw, 72px)' }}>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <PageHeader title="Automation processes details" leading={<button onClick={onBack} className="hover:opacity-70 transition-opacity"><ArrowLeft size={16} className="text-[#7288A3]" /></button>} actions={activeTab === 'Runs' ? (runDetailOpen ? undefined : <PageActionButton onClick={() => setStartRunSignal(signal => signal + 1)}>START RUN</PageActionButton>) : activeTab === 'Configuration parameters' ? (configurationItemCount > 0 ? <PageActionButton onClick={() => setCreateConfigurationSignal(signal => signal + 1)}>Create new</PageActionButton> : undefined) : activeTab === 'Notifications' ? (notifications.length > 0 ? <PageActionButton onClick={() => setCreateNotificationSignal(signal => signal + 1)}>Create new</PageActionButton> : undefined) : activeTab === 'Details' || activeTab === 'Metrics' || activeTab === 'Input data' ? undefined : <PageActionButton disabled>Create new</PageActionButton>} />

        {/* Breadcrumbs */}
        <div className="flex flex-row items-center gap-2 pl-[32px]">
          <button onClick={onBack} className="font-montserrat font-medium text-[12px] leading-[17px] text-[#7288A3] hover:underline">
            Automation processes
          </button>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">/</span>
          <span className="font-montserrat font-medium text-[12px] leading-[17px] text-[#A1B6C6]">
            {process.name}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col border-b border-[#E5EDF9] mb-8">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-row items-start gap-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex flex-col items-start gap-4 flex-shrink-0"
            >
              <span className={`font-montserrat font-medium text-[16px] leading-[22px] whitespace-nowrap ${activeTab === tab ? 'text-[#007EA7]' : 'text-[#10233A]'} transition-colors`}>
                {tab}
              </span>
              <div className={`w-full h-[2px] ${activeTab === tab ? 'bg-[#007EA7]' : 'bg-transparent'}`} />
            </button>
          ))}
          </div>
          {activeTab === 'Details' && (
            <div className="flex h-7 flex-shrink-0 items-center gap-4 rounded bg-white p-[6px]">
              <RefreshAllButton onRefresh={() => setDetailRefreshSignal(signal => signal + 1)} />
              <button type="button" data-button-family="export" aria-expanded={exportOpen} title="EXPORT" aria-label={`EXPORT ${process.name} details`} onClick={() => setExportOpen(true)} className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"><Download size={16} /></button>
            </div>
          )}
          {activeTab === 'Input data' && (
            <div className="flex h-7 flex-shrink-0 items-center rounded bg-white p-[6px]">
              <RedoAllButton label="REDO" onRedo={() => setInputDataRefreshSignal(signal => signal + 1)} />
            </div>
          )}
        </div>
      </div>
      {/* Tab content */}
      <div className="flex min-h-[520px] flex-1 flex-col">
        {renderTab()}
      </div>

      {showColumnPanel && (
        <ColumnSettingsPanel
          columns={activeTab === 'Configuration parameters' ? configurationColumns : runColumns}
          defaultColumns={activeTab === 'Configuration parameters' ? CONFIGURATION_COLUMNS : RUN_COLUMNS}
          onSave={activeTab === 'Configuration parameters' ? setConfigurationColumns : setRunColumns}
          onClose={() => setShowColumnPanel(false)}
        />
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#10233A]/20 p-4" onMouseDown={() => { setExportOpen(false); setExportFormat(''); }}>
          <div role="dialog" aria-modal="true" aria-label="Export automation process" className="flex w-[420px] max-w-[calc(100vw-32px)] flex-col gap-7 rounded-2xl bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Export</h2>
              <button type="button" title="Close" aria-label="Close export" onClick={() => { setExportOpen(false); setExportFormat(''); }} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>

            <label className="flex flex-col gap-3">
              <span className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">File format type <span className="text-[#E45858]">*</span></span>
              <SearchableSelect ariaLabel="File format type" value={exportFormat} onChange={(nextValue) => setExportFormat(nextValue as 'json' | 'original' | '')} placeholder="File format type" options={[{ value: "json", label: "JSON" }, { value: "original", label: "Original package" }]} className="h-[52px] rounded-xl border border-[#D3E1EC] bg-white px-4 pr-11 font-montserrat text-[16px] font-medium text-[#10233A]" />
            </label>

            <div className="flex flex-col gap-4 pt-2">
              <button type="button" data-system-action="true" disabled={!exportFormat} onClick={exportProcessDetails} className="flex h-[54px] items-center justify-center rounded-xl border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[18px] font-semibold text-[#7288A3] transition-colors hover:border-[#A1B6C6] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">Export</button>
              <button type="button" onClick={() => { setExportOpen(false); setExportFormat(''); }} className="flex h-[54px] items-center justify-center rounded-xl border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[18px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
