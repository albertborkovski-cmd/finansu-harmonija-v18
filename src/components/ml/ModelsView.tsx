import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileCog,
  HelpCircle,
  Map,
  Maximize,
  Minimize,
  MoreVertical,
  PackageOpen,
  RefreshCw,
  Search,
  Target,
  Ticket,
  Copy,
  ArrowRightLeft,
  WrapText,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import ColumnSettingsPanel, { type ColConfig } from '../ColumnSettingsPanel';
import { PageActionButton, PageHeader } from '../PageHeader';
import OcrBreadcrumb from '../OcrBreadcrumb';
import CreateableEmptyState from '../CreateableEmptyState';
import HorizontalTableScrollbar from '../HorizontalTableScrollbar';
import TablePagination from '../TablePagination';
import OcrSearchField from '../OcrSearchField';
import { ColumnSettingsButton } from '../ScopedActionButtons';
import ImportButton from '../ImportButton';
import { SystemCopyToast, useSystemCopyFeedback } from '../SystemCopyFeedback';
import { useModelCatalog, type ModelRecord } from './modelCatalogStore';
import { ResizeHandle, useColumnResize } from '../useColumnResize';
import ColumnSortButton, { useMultiColumnSort } from '../ColumnSortButton';
import SystemAddFilters from '../SystemAddFilters';

const MODEL_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 280, visible: true },
  { key: 'description', label: 'Description', width: 360, visible: true },
  { key: 'createdBy', label: 'Created by', width: 180, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 180, visible: true },
  { key: 'updateBy', label: 'Updated by', width: 180, visible: false },
  { key: 'lastUpdate', label: 'Last update', width: 180, visible: false },
];

const MODEL_LOG_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 280, visible: true },
  { key: 'description', label: 'Description', width: 320, visible: true },
  { key: 'capabilities', label: 'Capabilities', width: 130, visible: true },
  { key: 'createdBy', label: 'Created by', width: 130, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 150, visible: true },
];

const MODEL_VERSION_COLUMNS: ColConfig[] = [
  { key: 'version', label: 'Version', width: 122, visible: true },
  { key: 'description', label: 'Description', width: 300, visible: true },
  { key: 'status', label: 'Status', width: 120, visible: true },
  { key: 'createdBy', label: 'Created by', width: 150, visible: true },
  { key: 'creationDate', label: 'Creation date', width: 160, visible: true },
  { key: 'updatedBy', label: 'Updated by', width: 150, visible: true },
  { key: 'lastUpdate', label: 'Last update', width: 160, visible: true },
];

const MODEL_VERSIONS = [
  { version: '1.0.14', description: 'IDP Sample invoice information extraction model (150dp 209docs)', status: 'Active', createdBy: 'RPA platform', creationDate: '09.04.2026 16:08', updatedBy: 'RPA platform', lastUpdate: '10.04.2026 12:22' },
  { version: '1.0.13', description: 'Improved supplier and total amount detection', status: 'Processed', createdBy: 'RPA platform', creationDate: '07.04.2026 09:20', updatedBy: 'RPA platform', lastUpdate: '08.04.2026 15:40' },
  { version: '1.0.12', description: 'Initial production training run', status: 'Archived', createdBy: 'ML platform', creationDate: '04.04.2026 10:32', updatedBy: 'ML platform', lastUpdate: '04.04.2026 11:03' },
];

const MODEL_DOCUMENT_SETS = ['Invoice Processing', 'Contract Analysis', 'Receipt Scanning', 'ID Verification', 'Form Recognition', 'Medical Records'];

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={(event) => { event.stopPropagation(); onChange(); }}
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
        checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white hover:border-[#007EA7]'
      }`}
    >
      {checked && <Check size={12} strokeWidth={2.5} className="text-white" />}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[560px] overflow-hidden rounded-xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#E5EDF9] px-6 py-5">
          <h2 className="font-montserrat text-[20px] font-semibold text-[#10233A]">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="rounded-md p-1 text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#007EA7]">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="font-montserrat text-[14px] font-semibold text-[#10233A]">{children}</label>;
}

function ImportModelModal({ onClose, onImport }: { onClose: () => void; onImport: (model: ModelRecord) => void }) {
  const [usePackage, setUsePackage] = useState(false);
  const [fileName, setFileName] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelVersion, setModelVersion] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    const importedName = modelName.trim() || fileName.replace(/\.[^.]+$/, '') || 'imported-model';
    onImport({ id: `model-${Date.now()}`, name: importedName, description: description.trim() || 'Imported machine learning model', usage: 0, platform: usePackage ? 'RPA platform' : 'ML platform', updatedAt: new Date().toLocaleString('lt-LT'), status: 'Draft' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Model import" className="flex w-[429px] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Model import</h2>
          <button type="button" aria-label="Close Model import" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]">
            <X size={18} />
          </button>
        </div>

        <button type="button" role="switch" aria-checked={usePackage} onClick={() => { setUsePackage((value) => !value); setFileName(''); }} className="flex h-5 items-center gap-2 self-start">
          <span className={`relative h-[18px] w-[30px] rounded-[13px] transition-colors ${usePackage ? 'bg-[#007EA7]' : 'bg-[#A1B6C6]'}`}>
            <span className={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white transition-all ${usePackage ? 'left-[14px]' : 'left-0.5'}`} />
          </span>
          <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Use existing package</span>
        </button>

        {usePackage ? (
          <div className="flex h-[296px] w-full flex-col gap-6">
            <label className="flex h-[70px] w-full flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Model name <span className="text-[#FF4550]">*</span></span>
              <input aria-label="Model name" required value={modelName} onChange={(event) => setModelName(event.target.value)} className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors focus:border-[#007EA7]" />
            </label>
            <label className="flex h-[70px] w-full flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Model version <span className="text-[#FF4550]">*</span></span>
              <input aria-label="Model version" required value={modelVersion} onChange={(event) => setModelVersion(event.target.value)} className="h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors focus:border-[#007EA7]" />
            </label>
            <label className="flex h-[108px] w-full flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Description</span>
              <textarea aria-label="Description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-20 w-full resize-none rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-[11px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors focus:border-[#007EA7]" />
            </label>
          </div>
        ) : (
          <div className="flex h-[68px] w-full flex-col items-center gap-4">
            <p className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Please, provide CSV file with columns: Alias, Value.</p>
            <label className="flex h-8 cursor-pointer items-center justify-center rounded-md bg-[#007EA7] px-3 font-montserrat text-[14px] font-semibold leading-5 text-white transition-colors hover:bg-[#006b8f]">
              {fileName || 'Add'}
              <input type="file" accept=".csv" className="hidden" onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} />
            </label>
          </div>
        )}

        <div className="flex h-[42px] w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="flex h-[42px] w-[88px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] transition-colors hover:border-[#007EA7]">Cancel</button>
          <button data-system-action="true" type="button" disabled={usePackage && (!modelName.trim() || !modelVersion.trim())} onClick={submit} className="flex h-[42px] w-[89px] items-center justify-center rounded-lg bg-[#007EA7] font-montserrat text-[16px] font-semibold leading-6 text-white transition-colors hover:bg-[#006b8f] disabled:cursor-not-allowed disabled:opacity-40">Import</button>
        </div>
      </div>
    </div>
  );
}

function CreateModelModal({ onClose, onCreate }: { onClose: () => void; onCreate: (model: ModelRecord) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Modal title="Create model" onClose={onClose}>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2"><FieldLabel>Name <span className="text-[#FF4550]">*</span></FieldLabel><input aria-label="Name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter model name" className="h-[42px] rounded-lg border border-[#D3E1EC] px-3.5 font-montserrat text-[14px] outline-none focus:border-[#007EA7]" /></div>
        <div className="flex flex-col gap-2"><FieldLabel>Description</FieldLabel><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Model purpose and expected documents" className="min-h-[110px] resize-none rounded-lg border border-[#D3E1EC] px-3.5 py-3 font-montserrat text-[14px] outline-none focus:border-[#007EA7]" /></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#E5EDF9] px-6 py-4">
        <button type="button" onClick={onClose} className="h-9 rounded-md border-2 border-[#D3E1EC] px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]">Cancel</button>
        <button type="button" disabled={!name.trim()} onClick={() => onCreate({ id: `model-${Date.now()}`, name: name.trim(), description: description.trim() || 'New machine learning model', usage: 0, platform: 'ML platform', updatedAt: new Date().toLocaleString('lt-LT'), status: 'Draft' })} className="h-9 rounded-md bg-[#007EA7] px-4 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Create model</button>
      </div>
    </Modal>
  );
}

function TrainModelCatalogModal({ models, onClose, onSelect }: { models: ModelRecord[]; onClose: () => void; onSelect: (modelId: string) => void }) {
  const [query, setQuery] = useState('');
  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return models;
    return models.filter(model => `${model.name} ${model.description}`.toLowerCase().includes(normalized));
  }, [models, query]);
  const modelSortValue = (model: ModelRecord, key: string) => ({
    name: model.name,
    description: model.description,
    createdBy: model.platform,
    creationDate: model.updatedAt,
    updateBy: model.platform,
    lastUpdate: model.updatedAt,
  } as Record<string, string>)[key] ?? '—';
  const { sortedRows: sortedModels } = useMultiColumnSort(filteredModels, modelSortValue);

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train model options" className="flex h-[min(760px,calc(100vh-48px))] w-[min(1160px,calc(100vw-48px))] flex-col gap-8 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.12)]" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Train model options</h2>
          <button type="button" aria-label="Close Train model options" onClick={onClose} className="flex h-8 w-8 items-center justify-center text-[#7288A3] transition-colors hover:text-[#10233A]"><X size={28} strokeWidth={1.7} /></button>
        </div>

        <OcrSearchField ariaLabel="Search train model options" value={query} onChange={setQuery} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-[minmax(220px,1fr)_minmax(320px,1.8fr)_44px] items-center gap-6 px-4 pb-4 font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">
            <span className="text-[#10233A]">Name</span>
            <span>Description</span>
            <span />
          </div>
          <div className="flex flex-col">
            {sortedModels.map((model, index) => (
              <div key={model.id} className={`grid min-h-[48px] grid-cols-[minmax(220px,1fr)_minmax(320px,1.8fr)_44px] items-center gap-6 rounded-lg px-4 font-montserrat text-[14px] font-medium leading-5 text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                <span className="truncate">{model.name}</span>
                <span className="truncate">{model.description}</span>
                <button type="button" title="SELECT MODEL" aria-label={`Select train model ${model.name}`} onClick={() => onSelect(model.id)} className="flex h-8 w-8 items-center justify-center rounded border border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={18} strokeWidth={1.8} /></button>
              </div>
            ))}
            {!filteredModels.length && <div className="flex min-h-[180px] items-center justify-center font-montserrat text-[14px] font-medium text-[#7288A3]">No models found</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E5EDF9] pt-5">
          <TablePagination currentPage={1} totalPages={1} itemCount={filteredModels.length} onPageChange={() => undefined} />
        </div>
      </div>
    </div>
  );
}

function TrainModelModal({ models, initialModel, lockModelName = false, onClose, onTrain }: { models: ModelRecord[]; initialModel?: string; lockModelName?: boolean; onClose: () => void; onTrain: (name: string) => void }) {
  const [modelId, setModelId] = useState(initialModel || '');
  const [documentSet, setDocumentSet] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [settings, setSettings] = useState('');
  const [treeView, setTreeView] = useState(false);
  const [settingsFullScreen, setSettingsFullScreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [wrapSettings, setWrapSettings] = useState(true);
  const [documentSetOpen, setDocumentSetOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const settingsEditorRef = useRef<HTMLTextAreaElement>(null);
  const settingsSearchRef = useRef<HTMLInputElement>(null);
  const { copied: settingsCopied, copyText: copySettings } = useSystemCopyFeedback();
  const modelName = models.find((model) => model.id === modelId)?.name || 'model';
  const settingsLines = settings.split('\n');
  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: number[] = [];
    const content = settings.toLowerCase();
    const query = searchQuery.toLowerCase();
    let position = content.indexOf(query);
    while (position !== -1) {
      matches.push(position);
      position = content.indexOf(query, position + Math.max(query.length, 1));
    }
    return matches;
  }, [searchQuery, settings]);

  let parsedSettings: Record<string, unknown> | null = null;
  let settingsError = '';
  try {
    const parsed = JSON.parse(settings.trim() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedSettings = parsed as Record<string, unknown>;
    else settingsError = 'Settings must be a JSON object.';
  } catch {
    settingsError = 'JSON is not valid. Fix the code before opening Tree View.';
  }

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => settingsSearchRef.current?.focus(), 0);
  }, [searchOpen]);

  useEffect(() => {
    if (!settingsFullScreen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsFullScreen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsFullScreen]);

  const findNextSetting = () => {
    if (!searchMatches.length) return;
    const index = searchResultIndex % searchMatches.length;
    const start = searchMatches[index];
    setTreeView(false);
    window.setTimeout(() => {
      settingsEditorRef.current?.focus();
      settingsEditorRef.current?.setSelectionRange(start, start + searchQuery.length);
    }, 0);
    setSearchResultIndex((index + 1) % searchMatches.length);
  };

  const formatSettings = () => {
    try {
      setSettings(JSON.stringify(JSON.parse(settings.trim() || '{}'), null, 2));
      setTreeView(false);
    } catch {
      setTreeView(false);
    }
  };

  const updateTreeSetting = (key: string, value: string) => {
    if (!parsedSettings) return;
    let nextValue: unknown = value;
    try { nextValue = JSON.parse(value); } catch { /* Keep ordinary text as a string. */ }
    setSettings(JSON.stringify({ ...parsedSettings, [key]: nextValue }, null, 2));
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train model" className={`flex max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)] transition-[width,height] ${settingsFullScreen ? 'h-[calc(100vh-48px)] w-[calc(100vw-48px)]' : 'h-[626px] w-[872px]'}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Train model</h2>
          <button type="button" aria-label="Close Train model" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]"><X size={18} /></button>
        </div>

        <div className="flex h-[464px] min-h-0 w-full gap-6">
          <div className="flex h-[390px] w-[400px] flex-col gap-6">
            <div className="flex h-[70px] flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Document set <span className="text-[#FF4550]">*</span></span>
              <div className="relative h-[42px] w-full">
                <button type="button" aria-label="Document set" aria-expanded={documentSetOpen} onClick={() => { setDocumentSetOpen(value => !value); setModelOpen(false); }} className="flex h-[42px] w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none transition-colors hover:border-[#A1B6C6] focus:border-[#007EA7]">
                  <span className={documentSet ? 'text-[#10233A]' : 'text-[#A1B6C6]'}>{documentSet || 'Select document set'}</span>
                  <ChevronDown size={16} className={`text-[#7288A3] transition-transform ${documentSetOpen ? 'rotate-180' : ''}`} />
                </button>
                {documentSetOpen && <div role="listbox" aria-label="Document set options" className="absolute left-0 right-0 top-[46px] z-40 max-h-[220px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]">
                  {MODEL_DOCUMENT_SETS.map(option => <button key={option} type="button" role="option" aria-selected={documentSet === option} onClick={() => { setDocumentSet(option); setDocumentSetOpen(false); }} className={`flex h-10 w-full items-center rounded-md px-3 text-left font-montserrat text-[14px] font-medium text-[#10233A] hover:bg-[#F8FDFF] ${documentSet === option ? 'bg-[#EAF4FB]' : 'bg-white'}`}>{option}</button>)}
                </div>}
              </div>
            </div>

            <div className="flex h-[70px] items-end">
              <div className="flex h-[70px] w-full flex-col gap-2">
                <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Name <span className="text-[#FF4550]">*</span></span>
                <div className="relative h-[42px] w-full">
                  {lockModelName ? (
                    <input aria-label="Model name" value={models.find(model => model.id === modelId)?.name || ''} readOnly aria-readonly="true" className="h-[42px] w-full cursor-default rounded-lg border border-[#E5EDF9] bg-[#F8FAFC] px-[14px] font-montserrat text-[14px] font-medium text-[#7288A3] outline-none" />
                  ) : (
                    <>
                      <button type="button" aria-label="Model name" aria-expanded={modelOpen} onClick={() => { setModelOpen(value => !value); setDocumentSetOpen(false); }} className="flex h-[42px] w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none transition-colors hover:border-[#A1B6C6] focus:border-[#007EA7]">
                        <span className={modelId ? 'truncate text-[#10233A]' : 'text-[#A1B6C6]'}>{models.find(model => model.id === modelId)?.name || 'Select model'}</span>
                        <ChevronDown size={16} className={`flex-shrink-0 text-[#7288A3] transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <button type="button" title="MODEL LIST" aria-label="Open full model list" aria-expanded={modelOptionsOpen} onClick={() => { setModelOptionsOpen(true); setModelOpen(false); setDocumentSetOpen(false); }} className={`absolute right-[-24px] top-[11px] flex h-5 w-5 items-center justify-center transition-colors hover:text-[#007EA7] ${modelOptionsOpen ? 'text-[#007EA7]' : 'text-[#7288A3]'}`}><MoreVertical size={16} strokeWidth={2} /></button>
                    </>
                  )}
                  {!lockModelName && modelOpen && <div role="listbox" aria-label="Model name options" className="absolute left-0 right-0 top-[46px] z-40 max-h-[220px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]">
                    {models.map(model => <button key={model.id} type="button" role="option" aria-selected={modelId === model.id} onClick={() => { setModelId(model.id); setModelOpen(false); }} className={`flex h-10 w-full items-center rounded-md px-3 text-left font-montserrat text-[14px] font-medium text-[#10233A] hover:bg-[#F8FDFF] ${modelId === model.id ? 'bg-[#EAF4FB]' : 'bg-white'}`}>{model.name}</button>)}
                  </div>}
                </div>
              </div>
            </div>

            <label className="flex h-[108px] flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Description</span>
              <textarea aria-label="Training description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-20 w-full resize-none rounded-lg border border-[#D3E1EC] px-[14px] py-[11px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
            </label>

            <label className="flex h-[70px] flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Version</span>
              <input aria-label="Version" value={version} onChange={(event) => setVersion(event.target.value)} className="h-[42px] w-full rounded-lg border border-[#D3E1EC] px-[14px] font-montserrat text-[14px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
            </label>
          </div>

          <div className="flex h-[464px] min-w-0 flex-1 flex-col gap-2">
            <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Settings</span>
            <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
              {searchOpen && (
                <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-[#E5EDF9] bg-[#F8FAFC] px-3">
                  <Search size={16} className="flex-shrink-0 text-[#7288A3]" />
                  <input ref={settingsSearchRef} aria-label="Search in training settings" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchResultIndex(0); }} onKeyDown={(event) => { if (event.key === 'Enter') findNextSetting(); if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Search in settings" className="h-8 min-w-0 flex-1 rounded-md border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
                  <span className="whitespace-nowrap font-montserrat text-[12px] font-medium text-[#7288A3]">{searchQuery ? `${searchMatches.length} found` : 'Enter search text'}</span>
                  <button type="button" aria-label="Find next setting" disabled={!searchMatches.length} onClick={findNextSetting} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9] disabled:cursor-not-allowed disabled:opacity-40"><ChevronDown size={17} /></button>
                  <button type="button" aria-label="Close settings search" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]"><X size={17} /></button>
                </div>
              )}
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {treeView ? (
                  <div className="flex-1 overflow-auto p-4 font-mono text-[14px] text-[#10233A]">
                    {settingsError ? (
                      <div role="alert" className="rounded-lg bg-[#FFF2F2] px-4 py-3 font-montserrat text-[13px] font-medium text-[#D64545]">{settingsError}</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {Object.entries(parsedSettings || {}).length === 0 && <p className="font-montserrat text-[13px] font-medium text-[#7288A3]">Empty settings object. Switch to code view to add fields.</p>}
                        {Object.entries(parsedSettings || {}).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[120px_1fr] items-start gap-2">
                            <span className="truncate py-1 text-[#A61B1B]">{key}:</span>
                            <textarea aria-label={`Tree setting ${key}`} value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)} onChange={(event) => updateTreeSetting(key, event.target.value)} rows={Math.max(1, Math.min(6, JSON.stringify(value, null, 2).split('\n').length))} className="min-w-0 resize-y rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex w-12 flex-shrink-0 flex-col items-center overflow-hidden bg-[#F8FAFC] py-4 font-mono text-[14px] font-medium leading-6 tracking-[0.5px] text-[#A1B6C6]">
                      {settingsLines.map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}
                    </div>
                    <textarea ref={settingsEditorRef} aria-label="Training settings" value={settings} onChange={(event) => setSettings(event.target.value)} wrap={wrapSettings ? 'soft' : 'off'} spellCheck={false} className={`h-full min-w-0 flex-1 resize-none overflow-auto p-4 font-mono text-[14px] font-medium leading-6 tracking-[0.5px] text-[#10233A] outline-none ${wrapSettings ? 'whitespace-pre-wrap' : 'whitespace-pre'}`} />
                  </>
                )}
              </div>
              <div className="flex h-11 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] p-3">
                <button type="button" role="switch" aria-label="Training settings Tree View" aria-checked={treeView} onClick={() => setTreeView((value) => !value)} className="flex items-center gap-2">
                  <span className={`relative h-[18px] w-[30px] rounded-[13px] ${treeView ? 'bg-[#007EA7]' : 'bg-[#A1B6C6]'}`}><span className={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white transition-all ${treeView ? 'left-[14px]' : 'left-0.5'}`} /></span>
                  <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Tree View</span>
                </button>
                <div className="flex items-center gap-4 text-[#7288A3]">
                  <button type="button" title="MAP" aria-label="Settings map" onClick={() => setTreeView(true)} disabled={Boolean(settingsError)} className="transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40"><Map size={16} /></button>
                  <button type="button" title="SEARCH" aria-label="Search settings" onClick={() => setSearchOpen((value) => !value)} className={searchOpen ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Search size={16} /></button>
                  <button type="button" title="WRAP TEXT" aria-label="Wrap settings" aria-pressed={wrapSettings} onClick={() => setWrapSettings((value) => !value)} className={wrapSettings ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><WrapText size={16} /></button>
                  <button type="button" title="FORMAT JSON" aria-label="Format settings" onClick={formatSettings} className="transition-colors hover:text-[#007EA7]"><ArrowRightLeft size={16} /></button>
                  <button type="button" title="COPY" aria-label="Copy settings" onClick={() => void copySettings(settings)} className={settingsCopied ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Copy size={16} /></button>
                  <button type="button" title={settingsFullScreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'} aria-label={settingsFullScreen ? 'Exit fullscreen settings' : 'Fullscreen settings'} onClick={() => setSettingsFullScreen((value) => !value)} className="transition-colors hover:text-[#007EA7]">{settingsFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-[42px] w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="flex h-[42px] w-[88px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
          <button type="button" disabled={!documentSet || !modelId} onClick={() => onTrain(modelName)} className="flex h-[42px] w-[73px] items-center justify-center rounded-lg bg-[#007EA7] font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006b8f] disabled:cursor-not-allowed disabled:bg-[#E1E4E8] disabled:text-[#A1A7AE]">Train</button>
        </div>
        <SystemCopyToast visible={settingsCopied} message="Train model settings copied successfully" />
      </div>
    </div>
    {modelOptionsOpen && <TrainModelCatalogModal models={models} onClose={() => setModelOptionsOpen(false)} onSelect={(selectedModelId) => { setModelId(selectedModelId); setModelOptionsOpen(false); }} />}
    </>
  );
}

function ModelResourcesExportPanel({ model, version, onClose, onDownload }: { model: ModelRecord; version: string; onClose: () => void; onDownload: (fileName: string) => void }) {
  const files = ['model_report.json', 'model_report.xlsx', 'train_congif.json'];

  return (
    <aside role="dialog" aria-modal="false" aria-label="Model resources export" className="fixed inset-y-0 right-0 z-[120] flex w-[340px] flex-col items-start gap-6 bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]">
      <div className="flex h-8 w-full items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 truncate font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Model resources</h2>
        <button type="button" aria-label="Close model resources export" onClick={onClose} className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col items-start">
        {files.map((fileName) => (
          <button type="button" key={fileName} aria-label={`Download ${fileName}`} onClick={() => onDownload(fileName)} className="flex h-9 w-full items-center justify-between gap-4 py-2 font-montserrat text-[14px] font-medium leading-5 text-[#7288A3] transition-colors hover:text-[#007EA7]">
            <span className="truncate">{fileName}</span>
            <Download size={16} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      <span className="sr-only">Resources for {model.name}, version {version}</span>
    </aside>
  );
}

function TrainConfigurationModal({ model, version, onClose, onUpdate }: { model: ModelRecord; version: string; onClose: () => void; onUpdate: (configuration: string) => void }) {
  const [configuration, setConfiguration] = useState('{\n  "parent": [],\n  "variables": {},\n  "_id": "c487a18d-bb20-48e5-a327-09e4998c5870"\n}');
  const [treeView, setTreeView] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [wrapText, setWrapText] = useState(true);
  const configurationEditorRef = useRef<HTMLTextAreaElement>(null);
  const configurationSearchRef = useRef<HTMLInputElement>(null);
  const { copied, copyText } = useSystemCopyFeedback();
  const configurationLines = configuration.split('\n');
  const configurationMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: number[] = [];
    const content = configuration.toLowerCase();
    const query = searchQuery.toLowerCase();
    let position = content.indexOf(query);
    while (position !== -1) {
      matches.push(position);
      position = content.indexOf(query, position + Math.max(query.length, 1));
    }
    return matches;
  }, [configuration, searchQuery]);

  let parsedConfiguration: Record<string, unknown> | null = null;
  let configurationError = '';
  try {
    const parsed = JSON.parse(configuration.trim() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedConfiguration = parsed as Record<string, unknown>;
    else configurationError = 'Configuration must be a JSON object.';
  } catch {
    configurationError = 'JSON is not valid. Fix the code before opening Tree View.';
  }

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => configurationSearchRef.current?.focus(), 0);
  }, [searchOpen]);

  useEffect(() => {
    if (!fullScreen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullScreen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullScreen]);

  const findNextConfiguration = () => {
    if (!configurationMatches.length) return;
    const index = searchResultIndex % configurationMatches.length;
    const start = configurationMatches[index];
    setTreeView(false);
    window.setTimeout(() => {
      configurationEditorRef.current?.focus();
      configurationEditorRef.current?.setSelectionRange(start, start + searchQuery.length);
    }, 0);
    setSearchResultIndex((index + 1) % configurationMatches.length);
  };

  const updateConfigurationTreeValue = (key: string, value: string) => {
    if (!parsedConfiguration) return;
    let nextValue: unknown = value;
    try { nextValue = JSON.parse(value); } catch { /* Keep ordinary text as a string. */ }
    setConfiguration(JSON.stringify({ ...parsedConfiguration, [key]: nextValue }, null, 2));
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train configuration" className={`flex max-w-[calc(100vw-32px)] flex-col items-start gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)] transition-[width,height] ${fullScreen ? 'h-[calc(100vh-48px)] w-[calc(100vw-48px)]' : 'h-[598px] w-[570px]'}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Train configuration</h2>
          <button type="button" aria-label="Close Train configuration" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex min-h-[320px] w-full flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
          {searchOpen && (
            <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-[#E5EDF9] bg-[#F8FAFC] px-3">
              <Search size={16} className="flex-shrink-0 text-[#7288A3]" />
              <input ref={configurationSearchRef} aria-label="Search train configuration" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchResultIndex(0); }} onKeyDown={(event) => { if (event.key === 'Enter') findNextConfiguration(); if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Search configuration" className="h-8 min-w-0 flex-1 rounded-md border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
              <span className="whitespace-nowrap font-montserrat text-[12px] font-medium text-[#7288A3]">{searchQuery ? `${configurationMatches.length} found` : 'Enter search text'}</span>
              <button type="button" aria-label="Find next configuration value" disabled={!configurationMatches.length} onClick={findNextConfiguration} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9] disabled:cursor-not-allowed disabled:opacity-40"><ChevronDown size={17} /></button>
              <button type="button" aria-label="Close configuration search" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="rounded p-1 text-[#7288A3] hover:bg-[#E5EDF9]"><X size={17} /></button>
            </div>
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {treeView ? (
              <div aria-label="Train configuration tree" className="flex-1 overflow-auto p-4 font-mono text-[14px] text-[#10233A]">
                {configurationError ? (
                  <div role="alert" className="rounded-lg bg-[#FFF2F2] px-4 py-3 font-montserrat text-[13px] font-medium text-[#D64545]">{configurationError}</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span>{'{'}</span>
                    {Object.entries(parsedConfiguration || {}).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[120px_1fr] items-start gap-2 pl-5">
                        <span className="truncate py-1 text-[#A61B1B]">&quot;{key}&quot;:</span>
                        <textarea aria-label={`Configuration tree ${key}`} value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)} onChange={(event) => updateConfigurationTreeValue(key, event.target.value)} rows={Math.max(1, Math.min(8, JSON.stringify(value, null, 2).split('\n').length))} className="min-w-0 resize-y rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" />
                      </div>
                    ))}
                    <span>{'}'}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex w-12 flex-shrink-0 flex-col items-center overflow-hidden bg-[#F8FAFC] py-4 font-mono text-[14px] font-medium leading-6 tracking-[0.5px] text-[#A1B6C6]">
                  {configurationLines.map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}
                </div>
                <textarea ref={configurationEditorRef} aria-label="Train configuration JSON" value={configuration} onChange={(event) => setConfiguration(event.target.value)} wrap={wrapText ? 'soft' : 'off'} spellCheck={false} className={`h-full min-w-0 flex-1 resize-none overflow-auto p-4 font-mono text-[14px] font-medium leading-6 tracking-[0.5px] text-[#10233A] outline-none ${wrapText ? 'whitespace-pre-wrap' : 'whitespace-pre'}`} />
              </>
            )}
          </div>
          <div className="flex h-11 w-full items-center justify-between gap-4 border-t border-[#E5EDF9] bg-[#F8FAFC] p-3">
            <button type="button" role="switch" aria-label="Configuration Tree View" aria-checked={treeView} onClick={() => setTreeView((value) => !value)} className="flex h-5 items-center gap-2">
              <span className={`relative h-[18px] w-[30px] rounded-[13px] ${treeView ? 'bg-[#007EA7]' : 'bg-[#A1B6C6]'}`}><span className={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white transition-all ${treeView ? 'left-[14px]' : 'left-0.5'}`} /></span>
              <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Tree View</span>
            </button>
            <div className="flex h-4 items-center gap-4 text-[#7288A3]">
              <button type="button" title="MAP" aria-label="Configuration map" disabled={Boolean(configurationError)} onClick={() => setTreeView(true)} className="transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40"><Map size={16} /></button>
              <button type="button" title="SEARCH" aria-label="Search configuration" onClick={() => setSearchOpen((value) => !value)} className={searchOpen ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Search size={16} /></button>
              <button type="button" title="WRAP TEXT" aria-label="Wrap configuration" aria-pressed={wrapText} onClick={() => setWrapText((value) => !value)} className={wrapText ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><WrapText size={16} /></button>
              <button type="button" title="COPY" aria-label="Copy configuration" onClick={() => void copyText(configuration)} className={copied ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Copy size={16} /></button>
              <button type="button" title={fullScreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'} aria-label={fullScreen ? 'Exit fullscreen configuration' : 'Fullscreen configuration'} onClick={() => setFullScreen((value) => !value)} className="transition-colors hover:text-[#007EA7]">{fullScreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
            </div>
          </div>
        </div>

        <div className="flex h-[42px] w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="flex h-[42px] w-[88px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
          <button type="button" onClick={() => onUpdate(configuration)} className="flex h-[42px] min-w-[92px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006b8f]">Retrain</button>
        </div>
        <span className="sr-only">Configuration for {model.name}, version {version}</span>
        <SystemCopyToast visible={copied} message="Train configuration copied successfully" />
      </div>
    </div>
  );
}

export default function ModelsView() {
  const [models, setModels] = useModelCatalog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailModel, setDetailModel] = useState<ModelRecord | null>(null);
  const [versionQuery, setVersionQuery] = useState('');
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<'import' | 'create' | 'train' | null>(null);
  const [resourcesExportOpen, setResourcesExportOpen] = useState(false);
  const [resourcesExportVersion, setResourcesExportVersion] = useState<string | null>(null);
  const [logVersion, setLogVersion] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState('');
  const [logSeverity, setLogSeverity] = useState('All');
  const [configurationVersion, setConfigurationVersion] = useState<string | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(MODEL_COLUMNS);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const [showLogColumnSettings, setShowLogColumnSettings] = useState(false);
  const [logColumns, setLogColumns] = useState<ColConfig[]>(MODEL_LOG_COLUMNS);
  const [showVersionColumnSettings, setShowVersionColumnSettings] = useState(false);
  const [versionColumns, setVersionColumns] = useState<ColConfig[]>(MODEL_VERSION_COLUMNS);
  const [toast, setToast] = useState('');
  const [modelVersions, setModelVersions] = useState(MODEL_VERSIONS);
  const [versionFilterKeys, setVersionFilterKeys] = useState<string[]>([]);
  const [versionFilterValues, setVersionFilterValues] = useState<Record<string, string[]>>({});

  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return models;
    return models.filter((model) => `${model.name} ${model.description} ${model.platform}`.toLowerCase().includes(normalized));
  }, [models, query]);
  const modelSortValue = (model: ModelRecord, key: string) => ({
    name: model.name,
    description: model.description,
    createdBy: model.platform,
    creationDate: model.updatedAt,
    updateBy: model.platform,
    lastUpdate: model.updatedAt,
  } as Record<string, string>)[key] ?? '—';
  const { sortedRows: sortedModels, changeSort, directionFor } = useMultiColumnSort(filteredModels, modelSortValue);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const addModel = (model: ModelRecord, message: string) => {
    setModels((current) => [model, ...current]);
    setModal(null);
    notify(message);
  };

  const deleteModels = (ids: Set<string>) => {
    if (!ids.size) return;
    setModels((current) => current.filter((model) => !ids.has(model.id)));
    setSelected(new Set());
    notify(`${ids.size} model${ids.size === 1 ? '' : 's'} deleted`);
  };

  const downloadModelResource = (fileName: string) => {
    if (!detailModel) return;
    const exportedVersion = resourcesExportVersion ?? MODEL_VERSIONS[0].version;
    const exportedVersionRecord = modelVersions.find((version) => version.version === exportedVersion) ?? MODEL_VERSIONS[0];
    const report = fileName.endsWith('.json')
      ? JSON.stringify({ model: detailModel.name, version: exportedVersion, generatedAt: new Date().toISOString() }, null, 2)
      : `Model\tVersion\tStatus\n${detailModel.name}\t${exportedVersion}\t${exportedVersionRecord.status}`;
    const url = URL.createObjectURL(new Blob([report], { type: fileName.endsWith('.json') ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(`${fileName} downloaded`);
  };

  const allVisibleSelected = filteredModels.length > 0 && filteredModels.every((model) => selected.has(model.id));
  const visibleColumns = columns.filter((column) => column.visible);
  const tableGrid = `${visibleColumns.map((column) => `${column.width}px`).join(' ')} 72px`;
  const tableMinWidth = visibleColumns.reduce((total, column) => total + column.width, 72);

  const modelCell = (model: ModelRecord, key: string) => {
    if (key === 'name') {
      return (
        <span className="flex min-w-0 items-center gap-[6px]">
          <Checkbox
            checked={selected.has(model.id)}
            label={`Select ${model.name}`}
            onChange={() => setSelected((current) => {
              const next = new Set(current);
              if (next.has(model.id)) next.delete(model.id);
              else next.add(model.id);
              return next;
            })}
          />
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setDetailModel(model); }}
            className="min-w-0 truncate text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline"
            title={`Open ${model.name}`}
          >
            {model.name}
          </button>
        </span>
      );
    }

    const values: Record<string, string> = {
      description: model.description,
      createdBy: model.platform,
      creationDate: model.updatedAt,
      updateBy: model.platform,
      lastUpdate: model.updatedAt,
    };
    return <span className="block truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{values[key] ?? '—'}</span>;
  };

  if (detailModel) {
    if (logVersion) {
      return (
        <div className="relative flex min-h-full flex-col gap-8 bg-white py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
          <div className="flex flex-col gap-4">
            <div className="flex min-h-[46px] items-center gap-4">
              <button type="button" aria-label="Back to model resources" onClick={() => { setLogVersion(null); setLogQuery(''); setLogSeverity('All'); }} className="flex h-[18px] w-[18px] items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><ArrowLeft size={18} strokeWidth={2} /></button>
              <h1 className="font-montserrat text-[36px] font-semibold leading-[46px] text-[#10233A]">Model log</h1>
            </div>
            <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium leading-[18px]">
              <button type="button" onClick={() => { setDetailModel(null); setLogVersion(null); }} className="text-[#7288A3] hover:text-[#007EA7]">Machine learning</button>
              <span className="text-[#A1B6C6]">/</span>
              <button type="button" onClick={() => setLogVersion(null)} className="text-[#7288A3] hover:text-[#007EA7]">Models</button>
              <span className="text-[#A1B6C6]">/</span>
              <span className="text-[#A1B6C6]">Model log</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <OcrSearchField ariaLabel="Search model log" value={logQuery} onChange={setLogQuery} />
                <div className="h-7 w-[157px]"><SearchableSelect ariaLabel="Filter model log by severity" value={logSeverity} onChange={setLogSeverity} options={["All", "Info", "Warning", "Error"]} className="h-7 rounded bg-[#E5EDF9] px-2 pr-7 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]" /></div>
              </div>
              <div className="flex h-7 items-center gap-4 rounded bg-white p-1.5 text-[#7288A3]">
                <ColumnSettingsButton onClick={() => setShowLogColumnSettings(true)} />
                <ImportButton scope="Model log" onImport={file => notify(`${file.name} imported into model log`)} />
                <button type="button" title="REFRESH ALL" aria-label="Refresh all model log records" onClick={() => notify('All model log records refreshed')} className="hover:text-[#007EA7]"><RefreshCw size={16} /></button>
                <button type="button" aria-label="Model log help" onClick={() => notify('Model log help opened')} className="hover:text-[#007EA7]"><HelpCircle size={16} /></button>
                <button type="button" aria-label="Model log metrics" onClick={() => notify('Model log metrics opened')} className="hover:text-[#007EA7]"><BarChart3 size={16} /></button>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-between gap-12">
              <div className="relative min-h-[340px] overflow-x-auto scrollbar-hide">
                <div className="min-w-max">
                  <div className="system-table-header-row mb-4 grid h-5 items-center font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" style={{ gridTemplateColumns: `${logColumns.filter(column => column.visible).map(column => `${column.width}px`).join(' ')} 68px` }}>
                    {logColumns.filter(column => column.visible).map((column, index) => <div data-table-header-select={column.key === 'name' ? "true" : undefined} key={column.key} className={`flex h-5 min-w-0 items-center gap-[6px] px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>{column.key === 'name' && <Checkbox checked={false} label="Select all model logs" onChange={() => undefined} />}<span className="truncate">{column.label}</span></div>)}<div />
                  </div>
                </div>
                <div className="absolute inset-x-0 top-[155px] flex flex-col items-center gap-4 text-center">
                  <h2 className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">No logs found</h2>
                  <p className="sr-only">No model log records found for {detailModel.name}, version {logVersion}.</p>
                </div>
              </div>

              <HorizontalTableScrollbar />

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                <TablePagination currentPage={1} totalPages={9} itemCount={0} onPageChange={() => undefined} />
              </div>
            </div>
          </div>
          {showLogColumnSettings && <ColumnSettingsPanel columns={logColumns} defaultColumns={MODEL_LOG_COLUMNS} onSave={setLogColumns} onClose={() => setShowLogColumnSettings(false)} />}
          {toast && <div role="status" className="fixed bottom-6 right-6 z-[130] rounded-lg bg-[#10233A] px-4 py-3 font-montserrat text-[13px] font-medium text-white shadow-xl">{toast}</div>}
        </div>
      );
    }

    const normalizedVersionQuery = versionQuery.trim().toLowerCase();
    const versionFilterColumns = MODEL_VERSION_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      options: Array.from(new Set(modelVersions.map((version) => String(version[column.key as keyof typeof version] ?? '—')))),
    }));
    const visibleVersions = modelVersions.filter((version) => {
      if (normalizedVersionQuery && !Object.values(version).join(' ').toLowerCase().includes(normalizedVersionQuery)) return false;
      return versionFilterKeys.every((key) => {
        const selectedValues = versionFilterValues[key] ?? [];
        return selectedValues.length === 0 || selectedValues.includes(String(version[key as keyof typeof version] ?? '—'));
      });
    });
    const allVersionsSelected = visibleVersions.length > 0 && visibleVersions.every((version) => selectedVersions.has(version.version));
    const versionActionClass = 'flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]';
    const visibleVersionColumns = versionColumns.filter(column => column.visible);
    const versionGrid = `${visibleVersionColumns.map(column => `${column.width}px`).join(' ')} 164px`;
    const versionTableMinWidth = visibleVersionColumns.reduce((total, column) => total + column.width, 164);

    return (
      <div className="relative flex min-h-full flex-col gap-8 bg-white py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
        <div className="flex flex-col gap-4">
          <PageHeader
            title={detailModel.name}
            leading={<button type="button" aria-label="Back to models" onClick={() => { setDetailModel(null); setVersionQuery(''); setSelectedVersions(new Set()); setResourcesExportOpen(false); setLogVersion(null); }} className="flex h-[18px] w-[18px] items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><ArrowLeft size={18} strokeWidth={2} /></button>}
            actions={<PageActionButton onClick={() => setModal('train')}>Train model</PageActionButton>}
          />
          <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium leading-[18px]">
            <button type="button" onClick={() => { setDetailModel(null); setResourcesExportOpen(false); setLogVersion(null); }} className="text-[#7288A3] hover:text-[#007EA7]">Models</button>
            <span className="text-[#A1B6C6]">/</span>
            <span className="text-[#A1B6C6]">Model resources</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1" data-native-system-filters="true">
              <OcrSearchField ariaLabel="Search model resources" value={versionQuery} onChange={setVersionQuery} />
              <SystemAddFilters
                columns={versionFilterColumns}
                activeKeys={versionFilterKeys}
                values={versionFilterValues}
                onActiveKeysChange={setVersionFilterKeys}
                onValuesChange={setVersionFilterValues}
                persistenceKey={`fh-model-resources-filters:${detailModel.id}`}
              />
            </div>
            <div className="flex h-7 items-center gap-4 rounded bg-white p-1.5 text-[#7288A3]">
              <button type="button" title="ALL DELETE" aria-label="Delete selected versions" disabled={!selectedVersions.size} onClick={() => { setModelVersions(current => current.filter(version => !selectedVersions.has(version.version))); notify(`${selectedVersions.size} version${selectedVersions.size === 1 ? '' : 's'} deleted`); setSelectedVersions(new Set()); }} className="disabled:cursor-not-allowed disabled:opacity-40 hover:text-[#D64545]"><Trash2 size={16} /></button>
              <ColumnSettingsButton onClick={() => setShowVersionColumnSettings(true)} />
              <ImportButton scope={`Model versions ${detailModel.name}`} onImport={file => notify(`${file.name} imported into ${detailModel.name}`)} />
              <button type="button" title="REFRESH ALL" aria-label="Refresh all versions" onClick={() => { setModelVersions(current => current.map(version => ({ ...version }))); notify('All model versions refreshed'); }} className="hover:text-[#007EA7]"><RefreshCw size={16} /></button>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-12">
            <div className="overflow-x-auto scrollbar-hide">
              <div style={{ minWidth: versionTableMinWidth }}>
                <div className="system-table-header-row mb-4 grid h-5 items-center font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" style={{ gridTemplateColumns: versionGrid }}>
                  {visibleVersionColumns.map((column, index) => <div data-table-header-select={column.key === 'version' ? "true" : undefined} key={column.key} className={`flex h-5 min-w-0 items-center gap-[6px] px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>{column.key === 'version' && <Checkbox checked={allVersionsSelected} label="Select all model versions" onChange={() => setSelectedVersions(allVersionsSelected ? new Set() : new Set(visibleVersions.map((version) => version.version)))} />}<span className="truncate">{column.label}</span></div>)}<div />
                </div>
                {visibleVersions.map((version, index) => (
                  <div key={version.version} className={`grid h-9 items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`} style={{ gridTemplateColumns: versionGrid }}>
                    {visibleVersionColumns.map(column => <div key={column.key} className="flex min-w-0 items-center gap-[6px] overflow-hidden px-3"><span className="flex min-w-0 items-center gap-[6px] truncate">{column.key === 'version' && <Checkbox checked={selectedVersions.has(version.version)} label={`Select version ${version.version}`} onChange={() => setSelectedVersions((current) => { const next = new Set(current); if (next.has(version.version)) next.delete(version.version); else next.add(version.version); return next; })} />}{column.key === 'status' && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${version.status === 'Archived' ? 'bg-[#A1B6C6]' : 'bg-[#0ED8A8]'}`} />}{String(version[column.key as keyof typeof version] ?? '—')}</span></div>)}
                    <span className="flex h-9 items-center justify-end gap-1 pr-1">
                      <button type="button" aria-label={`Version details ${version.version}`} onClick={() => setConfigurationVersion(version.version)} className={versionActionClass}><Ticket size={16} /></button>
                      <button type="button" title="TRAIN CONFIG" aria-label={`TRAIN CONFIG ${version.version}`} onClick={() => setConfigurationVersion(version.version)} className={versionActionClass}><FileCog size={16} /></button>
                      <button type="button" title="EXPORT" aria-label={`EXPORT version ${version.version}`} onClick={() => { setResourcesExportVersion(version.version); setResourcesExportOpen(true); }} className="flex h-7 w-7 items-center justify-center rounded border border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"><Download size={14} strokeWidth={2} /></button>
                      <button type="button" aria-label={`Open version ${version.version}`} onClick={() => { setResourcesExportOpen(false); setLogVersion(version.version); setLogQuery(''); setLogSeverity('All'); }} className={versionActionClass}><ExternalLink size={16} /></button>
                      <button type="button" aria-label={`Delete version ${version.version}`} onClick={() => { setModelVersions(current => current.filter(item => item.version !== version.version)); setSelectedVersions(current => { const next = new Set(current); next.delete(version.version); return next; }); notify(`${version.version} deleted`); }} className={`${versionActionClass} hover:border-[#D64545] hover:text-[#D64545]`}><Trash2 size={16} /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <HorizontalTableScrollbar />

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
              <TablePagination currentPage={1} totalPages={5} itemCount={visibleVersions.length} onPageChange={() => undefined} />
            </div>
          </div>
        </div>
        {showVersionColumnSettings && <ColumnSettingsPanel columns={versionColumns} defaultColumns={MODEL_VERSION_COLUMNS} onSave={setVersionColumns} onClose={() => setShowVersionColumnSettings(false)} />}
        {resourcesExportOpen && resourcesExportVersion && <ModelResourcesExportPanel model={detailModel} version={resourcesExportVersion} onClose={() => { setResourcesExportOpen(false); setResourcesExportVersion(null); }} onDownload={downloadModelResource} />}
        {configurationVersion && <TrainConfigurationModal model={detailModel} version={configurationVersion} onClose={() => setConfigurationVersion(null)} onUpdate={() => { notify(`Train configuration updated for ${configurationVersion}`); setConfigurationVersion(null); }} />}
        {modal === 'train' && <TrainModelModal models={models} initialModel={detailModel.id} lockModelName onClose={() => setModal(null)} onTrain={(name) => { setModal(null); notify(`Training started for ${name}`); }} />}
        {toast && <div role="status" className="fixed bottom-6 right-6 z-[110] rounded-lg bg-[#10233A] px-4 py-3 font-montserrat text-[13px] font-medium text-white shadow-xl">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col gap-8 bg-white py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <PageHeader title="Models" actions={<><PageActionButton onClick={() => setModal('import')}>Import model</PageActionButton><PageActionButton onClick={() => setModal('create')}>Create model</PageActionButton><PageActionButton onClick={() => setModal('train')}>Train model</PageActionButton></>} />
      <OcrBreadcrumb items={["Machine learning", "Models"]} />

      <div className="flex flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <OcrSearchField ariaLabel="Search models" value={query} onChange={(nextQuery) => { setQuery(nextQuery); setCurrentPage(1); }} />
          <div className="flex items-center gap-4 rounded bg-white p-1.5 text-[#7288A3]">
            <button type="button" title="ALL DELETE" aria-label="Delete selected models" disabled={!selected.size} onClick={() => deleteModels(selected)} className="disabled:cursor-not-allowed disabled:opacity-40 hover:text-[#D64545]"><Trash2 size={16} /></button>
            <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
            <ImportButton scope="Models" onImport={file => notify(`${file.name} imported into Models`)} />
            <button type="button" title="REFRESH ALL" aria-label="Refresh all models" onClick={() => { setModels(current => current.map(model => ({ ...model }))); notify('All models refreshed'); }} className="hover:text-[#007EA7]"><RefreshCw size={16} /></button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-12">
          <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: tableMinWidth }}>
              <div className="system-table-header-row mb-4 grid h-5 items-center font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" style={{ gridTemplateColumns: tableGrid }}>
                {visibleColumns.map((column, index) => {
                  const realIndex = columns.findIndex(item => item.key === column.key);
                  return (
                  <div data-table-header-select={column.key === 'name' ? "true" : undefined} key={column.key} className={`relative flex h-5 min-w-0 items-center gap-[6px] px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`}>
                    {column.key === 'name' && (
                      <Checkbox
                        checked={allVisibleSelected}
                        label="Select all models"
                        onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(filteredModels.map((model) => model.id)))}
                      />
                    )}
                    <span className="truncate">{column.label}</span>
                    <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => { changeSort(column.key, direction); setCurrentPage(1); }} />
                    <ResizeHandle onMouseDown={event => startResize(realIndex, event)} />
                  </div>
                )})}
                <div aria-hidden="true" />
              </div>
              {sortedModels.length ? sortedModels.map((model, index) => (
                <div key={model.id} onClick={() => setDetailModel(model)} className={`system-table-row group grid h-9 cursor-pointer items-center rounded-lg font-montserrat text-[12px] leading-[18px] text-[#10233A] transition-colors hover:bg-[#E7F4F9] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`} style={{ gridTemplateColumns: tableGrid }}>
                  {visibleColumns.map((column) => <div key={column.key} className="min-w-0 overflow-hidden px-3">{modelCell(model, column.key)}</div>)}
                  <div className="table-row-actions flex h-9 items-center justify-end gap-1 pr-1"><button type="button" aria-label={`Open ${model.name} resources`} onClick={(event) => { event.stopPropagation(); setDetailModel(model); setVersionQuery(''); setSelectedVersions(new Set()); setLogVersion(null); }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"><UsersRound size={16} strokeWidth={1.8} /></button><button type="button" data-button-family="row-delete" aria-label={`Delete ${model.name}`} onClick={(event) => { event.stopPropagation(); deleteModels(new Set([model.id])); }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#D64545] hover:text-[#D64545]"><Trash2 size={16} /></button></div>
                </div>
              )) : models.length === 0
                ? <CreateableEmptyState onCreate={() => setModal('create')} />
                : <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-[#7288A3]"><PackageOpen size={30} /><p className="font-montserrat text-[14px] font-semibold">No models found</p><p className="font-montserrat text-[12px]">Change the search query.</p></div>}
            </div>
          </div>

          <HorizontalTableScrollbar scrollRef={tableScrollRef} />

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
            <TablePagination currentPage={currentPage} totalPages={5} itemCount={filteredModels.length} onPageChange={setCurrentPage} />
          </div>
        </div>
      </div>

      {modal === 'import' && <ImportModelModal onClose={() => setModal(null)} onImport={(model) => addModel(model, `${model.name} imported`)} />}
      {modal === 'create' && <CreateModelModal onClose={() => setModal(null)} onCreate={(model) => {
        setModels((current) => [model, ...current]);
        setSelected(new Set([model.id]));
        setModal('train');
        notify(`${model.name} created. Complete the training settings.`);
      }} />}
      {modal === 'train' && <TrainModelModal models={models} initialModel={selected.size === 1 ? Array.from(selected)[0] : undefined} onClose={() => setModal(null)} onTrain={(name) => { setModal(null); notify(`Training started for ${name}`); }} />}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={MODEL_COLUMNS}
          onSave={setColumns}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[110] rounded-lg bg-[#10233A] px-4 py-3 font-montserrat text-[13px] font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}
