import { useState } from 'react';
import { AlignLeft, Check, ChevronDown, ChevronRight, Copy, Map, Maximize2, Minimize2, MoreVertical, Search, Target, X } from 'lucide-react';
import TablePagination from '../TablePagination';
import { getAutomationProcesses } from '../automationRunsStore';
import { SystemCopyToast, useSystemCopyFeedback } from '../SystemCopyFeedback';
import { useModelCatalog, type ModelRecord } from './modelCatalogStore';

const FIELD_CLASS = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]';
const LABEL_CLASS = 'font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]';

export function SystemDropdown({ value, options, placeholder, ariaLabel, open, onToggle, onSelect }: {
  value: string;
  options: string[];
  placeholder: string;
  ariaLabel: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filteredOptions = options.filter(option => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <div className="relative w-full">
      <input role="combobox" aria-label={ariaLabel} aria-expanded={open} value={open ? query : value} placeholder={placeholder} autoComplete="off" onFocus={(event) => { setQuery(''); if (!open) onToggle(); event.currentTarget.select(); }} onClick={() => { if (!open) onToggle(); }} onChange={(event) => { setQuery(event.target.value); if (!open) onToggle(); }} className={`h-[42px] w-full rounded-lg border bg-white px-[14px] pr-10 font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] ${open ? 'border-[#007EA7] ring-2 ring-[#007EA7]/10' : 'border-[#D3E1EC] hover:border-[#A1B6C6]'}`} />
      <button type="button" tabIndex={-1} aria-label={`Open ${ariaLabel} options`} onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(''); onToggle(); }} className="absolute right-0 top-0 flex h-[42px] w-10 items-center justify-center text-[#7288A3]">
        <ChevronDown size={16} className={`flex-shrink-0 text-[#7288A3] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" aria-label={`${ariaLabel} options`} className="absolute left-0 right-0 top-[46px] z-50 max-h-[220px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]">
          {filteredOptions.map((option) => {
            const selected = option === value;
            return (
              <button key={option} type="button" role="option" aria-selected={selected} onClick={() => { setQuery(''); onSelect(option); }} className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left font-montserrat text-[13px] font-semibold text-[#10233A] transition-colors ${selected ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}>
                <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${selected ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{selected && <Check size={12} strokeWidth={2.5} className="text-white" />}</span>
                <span className="truncate">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EXECUTION_MODEL_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  id: `execution-model-${index + 1}`,
  name: 'demo.catering.mailbox',
  version: '0.0.13',
  description: 'IE HTML Invoice',
  status: 'Active',
}));

function TrainingModelOptionsModal({ onClose, onSelect, models }: { onClose: () => void; onSelect: (name: string) => void; models: ModelRecord[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const normalizedQuery = query.trim().toLowerCase();
  const options = models.filter((option) => !normalizedQuery || `${option.name} ${option.description}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train model options" className="flex h-[600px] w-[872px] max-w-[calc(100vw-32px)] flex-col items-start gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Train model options</h2>
          <button type="button" aria-label="Close Train model options" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex h-[504px] w-full flex-col gap-6">
          <label className="flex h-7 w-[260px] items-center justify-between rounded bg-[#E5EDF9] px-2">
            <input aria-label="Search train model options" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#7288A3]" />
            <Search size={16} className="text-[#7288A3]" />
          </label>

          <div className="flex h-[452px] w-full flex-col justify-between gap-12">
            <div className="flex h-[396px] flex-col gap-4 overflow-hidden">
              <div className="grid h-5 grid-cols-[minmax(180px,278px)_minmax(220px,1fr)_36px] items-center px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                <span className="text-[#10233A]">Name</span><span>Description</span><span />
              </div>
              <div className="flex h-[360px] flex-col overflow-hidden">
                {options.map((option, index) => (
                  <div key={option.id} className={`grid h-9 flex-shrink-0 grid-cols-[minmax(180px,278px)_minmax(220px,1fr)_36px] items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                    <span className="truncate px-3">{option.name}</span>
                    <span className="truncate px-[10px]">{option.description}</span>
                    <span className="flex h-9 items-center p-1"><button type="button" aria-label={`Select training model option ${index + 1}`} onClick={() => onSelect(option.name)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={16} /></button></span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex h-8 items-center justify-between gap-4">
              <TablePagination currentPage={page} totalPages={5} itemCount={options.length} onPageChange={setPage} />
              <span className="font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">14 from 15,000 items</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutionModelOptionsModal({ onClose, onSelect }: { onClose: () => void; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const normalizedQuery = query.trim().toLowerCase();
  const options = EXECUTION_MODEL_OPTIONS.filter((option) => !normalizedQuery || `${option.name} ${option.version} ${option.description} ${option.status}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Execution model options" className="flex h-[600px] w-[872px] max-w-[calc(100vw-32px)] flex-col items-start gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Execution model options</h2>
          <button type="button" aria-label="Close Execution model options" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex h-[504px] w-full flex-col gap-6">
          <label className="flex h-7 w-[260px] items-center justify-between rounded bg-[#E5EDF9] px-2">
            <input aria-label="Search execution model options" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#7288A3]" />
            <Search size={16} className="text-[#7288A3]" />
          </label>

          <div className="flex h-[452px] w-full flex-col justify-between gap-12">
            <div className="flex h-[396px] flex-col gap-4 overflow-hidden">
              <div className="grid h-5 grid-cols-[minmax(150px,278px)_84px_minmax(150px,250px)_minmax(90px,140px)_36px] items-center px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                <span className="text-[#10233A]">Name</span><span>Version</span><span>Description</span><span>Status</span><span />
              </div>
              <div className="flex h-[360px] flex-col overflow-hidden">
                {options.map((option, index) => (
                  <div key={option.id} className={`grid h-9 flex-shrink-0 grid-cols-[minmax(150px,278px)_84px_minmax(150px,250px)_minmax(90px,140px)_36px] items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                    <span className="truncate px-3">{option.name}</span>
                    <span className="truncate px-[10px]">{option.version}</span>
                    <span className="truncate px-[10px]">{option.description}</span>
                    <span className="flex items-center gap-1 px-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#0ED8A8]" />{option.status}</span>
                    <span className="flex h-9 items-center p-1"><button type="button" aria-label={`Select execution model option ${index + 1}`} onClick={() => onSelect(option.name)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={16} /></button></span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex h-8 items-center justify-between gap-4">
              <TablePagination currentPage={page} totalPages={5} itemCount={options.length} onPageChange={setPage} />
              <span className="font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">14 from 15,000 items</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateSetPanel({ onClose }: { onClose: () => void }) {
  const [models] = useModelCatalog();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentTypeOpen, setDocumentTypeOpen] = useState(false);
  const [preprocessingPipeline, setPreprocessingPipeline] = useState('');
  const [documentProcessorOpen, setDocumentProcessorOpen] = useState(false);
  const [trainingPipeline, setTrainingPipeline] = useState('');
  const [trainingModelOpen, setTrainingModelOpen] = useState(false);
  const [trainingOptionsOpen, setTrainingOptionsOpen] = useState(false);
  const [executionPipeline, setExecutionPipeline] = useState('');
  const [executionModelOpen, setExecutionModelOpen] = useState(false);
  const [executionOptionsOpen, setExecutionOptionsOpen] = useState(false);
  const [zipFile, setZipFile] = useState('');
  const [settings, setSettings] = useState('{}');
  const [settingsJsonMode, setSettingsJsonMode] = useState(true);
  const [settingsFullScreen, setSettingsFullScreen] = useState(false);
  const { copied: settingsCopied, copyText: copySettings } = useSystemCopyFeedback();
  const documentProcessorOptions = Array.from(new Set(getAutomationProcesses().map((process) => process.name)));
  const executionModelOptions = Array.from(new Set(['Default execution', 'Invoice execution', ...(executionPipeline ? [executionPipeline] : [])]));

  return (
    <aside role="dialog" aria-modal="false" aria-label="New document set" className={`${settingsFullScreen ? 'fixed inset-0 w-full' : 'absolute inset-y-0 right-0 w-[440px]'} z-40 flex flex-col items-start gap-6 bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9] transition-[width]`}>
      <div className="flex h-8 w-full flex-shrink-0 items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">New document set</h2>
        <button type="button" aria-label="Close New document set" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
      </div>

      <div className="min-h-0 w-full flex-1 overflow-y-auto">
        <div className="flex min-h-[1223px] w-full flex-col gap-8">
          <div className="flex w-full flex-col gap-6">
            <label className="flex h-[70px] w-full flex-col gap-2">
              <span className={LABEL_CLASS}>Name <span className="text-[#FF4550]">*</span></span>
              <input aria-label="Document set name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter name..." className={FIELD_CLASS} />
            </label>

            <label className="flex h-[108px] w-full flex-col gap-2">
              <span className={LABEL_CLASS}>Description</span>
              <textarea aria-label="Document set description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter description..." className="h-20 w-full resize-none rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-[11px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]" />
            </label>

            <label className="relative flex h-[70px] w-full flex-col gap-2">
              <span className={LABEL_CLASS}>Document type <span className="text-[#FF4550]">*</span></span>
              <SystemDropdown value={documentType} options={['Invoice', 'Contract', 'Receipt']} placeholder="Select..." ariaLabel="Document type" open={documentTypeOpen} onToggle={() => { setDocumentTypeOpen((open) => !open); setDocumentProcessorOpen(false); setTrainingModelOpen(false); setExecutionModelOpen(false); }} onSelect={(option) => { setDocumentType(option); setDocumentTypeOpen(false); }} />
            </label>

            <label className="relative flex h-[70px] w-full flex-col gap-2">
              <span className={LABEL_CLASS}>Document processor <span className="text-[#FF4550]">*</span></span>
              <SystemDropdown value={preprocessingPipeline} options={documentProcessorOptions} placeholder="Select automation process..." ariaLabel="Document processor" open={documentProcessorOpen} onToggle={() => { setDocumentProcessorOpen((open) => !open); setDocumentTypeOpen(false); setTrainingModelOpen(false); setExecutionModelOpen(false); }} onSelect={(option) => { setPreprocessingPipeline(option); setDocumentProcessorOpen(false); }} />
            </label>

            <div className="flex h-[70px] w-full items-end">
              <label className="flex h-[70px] min-w-0 flex-1 flex-col gap-2">
                <span className={LABEL_CLASS}>Training model</span>
                <SystemDropdown value={trainingPipeline} options={models.map((model) => model.name)} placeholder="Select model..." ariaLabel="Training model" open={trainingModelOpen} onToggle={() => { setTrainingModelOpen((open) => !open); setDocumentTypeOpen(false); setDocumentProcessorOpen(false); setExecutionModelOpen(false); }} onSelect={(option) => { setTrainingPipeline(option); setTrainingModelOpen(false); }} />
              </label>
              <button type="button" aria-label="Training model options" onClick={() => setTrainingOptionsOpen(true)} className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#007EA7]"><MoreVertical size={16} /></button>
            </div>

            <div className="flex h-[70px] w-full items-end">
              <label className="flex h-[70px] min-w-0 flex-1 flex-col gap-2">
                <span className={LABEL_CLASS}>Execution model</span>
                <SystemDropdown value={executionPipeline} options={executionModelOptions} placeholder="Select..." ariaLabel="Execution model" open={executionModelOpen} onToggle={() => { setExecutionModelOpen((open) => !open); setDocumentTypeOpen(false); setDocumentProcessorOpen(false); setTrainingModelOpen(false); }} onSelect={(option) => { setExecutionPipeline(option); setExecutionModelOpen(false); }} />
              </label>
              <button type="button" aria-label="Execution model options" onClick={() => setExecutionOptionsOpen(true)} className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#007EA7]"><MoreVertical size={16} /></button>
            </div>

            <div className="flex h-[60px] w-full flex-col items-center gap-3">
              <p className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Please, provide ZIP file</p>
              <label className="flex h-7 cursor-pointer items-center justify-center rounded bg-[#007EA7] px-2 font-montserrat text-[12px] font-semibold leading-4 text-white hover:bg-[#006b8f]">
                {zipFile || 'Add'}
                <input type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => setZipFile(event.target.files?.[0]?.name || '')} />
              </label>
            </div>

            <div className="flex h-[500px] w-full flex-col gap-2">
              <span className={LABEL_CLASS}>Settings</span>
              <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
                <div className="flex min-h-0 flex-1 overflow-auto">
                  {!settingsJsonMode ? (
                    <div className="flex flex-1 flex-col gap-2 p-4 font-mono text-[14px] text-[#10233A]">
                      <div className="flex items-center gap-2">
                        <ChevronRight size={16} className="rotate-90 text-[#7288A3]" />
                        <span className="text-[#A61B1B]">settings</span>
                        <span className="text-[#A1A1A1]">:</span>
                        <input aria-label="Document set settings tree value" value={settings} onChange={(event) => setSettings(event.target.value)} placeholder="Enter settings" className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex w-12 flex-shrink-0 flex-col items-center bg-[#F8FAFC] py-4 font-mono text-[14px] leading-6 text-[#7288A3]">
                        {settings.split('\n').map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}
                      </div>
                      <textarea aria-label="Document set settings" value={settings} onChange={(event) => setSettings(event.target.value)} placeholder="Enter settings" spellCheck={false} className="min-h-full min-w-0 flex-1 resize-none p-4 font-mono text-[15px] leading-6 text-[#10233A] outline-none" />
                    </>
                  )}
                </div>
                <div className="flex h-11 flex-shrink-0 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] px-3">
                  <button type="button" role="switch" aria-label="Document set Tree View" aria-checked={!settingsJsonMode} onClick={() => setSettingsJsonMode((value) => !value)} className="flex items-center gap-3 font-montserrat text-[14px] font-medium text-[#10233A]">
                    <span className={`relative h-[20px] w-[36px] rounded-full border ${!settingsJsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${!settingsJsonMode ? 'translate-x-4' : ''}`} /></span>
                    Tree View
                  </button>
                  <div className="flex items-center gap-4 text-[#7288A3]">
                    <button type="button" title="MAP" aria-label="Settings map"><Map size={18} /></button>
                    <button type="button" title="SEARCH" aria-label="Search settings"><Search size={18} /></button>
                    <button type="button" title="WRAP TEXT" aria-label="Wrap settings"><AlignLeft size={18} /></button>
                    <button type="button" title="COPY" aria-label="COPY document set settings" onClick={() => void copySettings(settings)} className={settingsCopied ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Copy size={18} /></button>
                    <button type="button" title="FULL SCREEN" aria-label="Fullscreen settings" onClick={() => setSettingsFullScreen((value) => !value)}>{settingsFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
                  </div>
                </div>
              </div>
              <button type="button" role="switch" aria-label="Document set JSON" aria-checked={settingsJsonMode} onClick={() => setSettingsJsonMode((value) => !value)} className="flex items-center gap-3 self-start font-montserrat text-[14px] font-medium text-[#10233A]">
                <span className={`relative h-[20px] w-[36px] rounded-full border ${settingsJsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${settingsJsonMode ? 'translate-x-4' : ''}`} /></span>
                JSON
              </button>
            </div>
          </div>

          <div className="flex h-[42px] w-full flex-shrink-0 gap-4">
            <button type="button" onClick={onClose} className="flex h-[42px] flex-1 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
            <button data-system-action="true" type="button" disabled={!name.trim() || !documentType || !preprocessingPipeline} onClick={onClose} className="flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#007EA7] font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006b8f] disabled:cursor-not-allowed disabled:opacity-40">Create</button>
          </div>
        </div>
      </div>

      {trainingOptionsOpen && <TrainingModelOptionsModal models={models} onClose={() => setTrainingOptionsOpen(false)} onSelect={(modelName) => { setTrainingPipeline(modelName); setTrainingOptionsOpen(false); }} />}
      {executionOptionsOpen && <ExecutionModelOptionsModal onClose={() => setExecutionOptionsOpen(false)} onSelect={(modelName) => { setExecutionPipeline(modelName); setExecutionOptionsOpen(false); }} />}
      <SystemCopyToast visible={settingsCopied} message="Document set settings copied successfully" />
    </aside>
  );
}
