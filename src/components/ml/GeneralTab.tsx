import { useMemo, useState } from 'react';
import { AlignLeft, ChevronRight, Copy, Map, Maximize2, Minimize2, MoreVertical, Search, Target, X } from 'lucide-react';
import { getAutomationProcesses } from '../automationRunsStore';
import { SystemCopyToast, useSystemCopyFeedback } from '../SystemCopyFeedback';
import type { DocumentSet } from './types';
import { SystemDropdown } from './CreateSetPanel';
import { useModelCatalog } from './modelCatalogStore';
import ExecutionModelOptionsModal from './ExecutionModelOptionsModal';

const SAMPLE_JSON = `{
  "preprocessing": {
    "resize": true,
    "deskew": true,
    "remove_noise": false
  },
  "extraction": {
    "model": "invoice-v2",
    "confidence_threshold": 0.85,
    "fields": ["total", "date", "vendor"]
  },
  "postprocessing": {
    "validate": true,
    "format_dates": "ISO"
  }
}`;

const FIELD_CLASS = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]';
const LABEL_CLASS = 'font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]';

function inferDocumentType(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('contract')) return 'Contract';
  if (normalized.includes('receipt')) return 'Receipt';
  return 'Invoice';
}

export default function GeneralTab({ documentSet, onUpdate }: { documentSet: DocumentSet; onUpdate: (updates: Partial<DocumentSet>) => void }) {
  const [models] = useModelCatalog();
  const processorOptions = useMemo(() => Array.from(new Set(getAutomationProcesses().map((process) => process.name))), []);
  const [name, setName] = useState(documentSet.name);
  const [description, setDescription] = useState(documentSet.description);
  const [documentType, setDocumentType] = useState(documentSet.documentType ?? inferDocumentType(documentSet.name));
  const [documentProcessor, setDocumentProcessor] = useState(documentSet.documentProcessor ?? processorOptions[0] ?? 'IDP');
  const [trainingModel, setTrainingModel] = useState(documentSet.trainingModel ?? models[0]?.name ?? '');
  const [executionModel, setExecutionModel] = useState(documentSet.executionModel ?? 'invoice-exec-v1.3');
  const [settings, setSettings] = useState(documentSet.settings ?? SAMPLE_JSON);
  const [documentTypeOpen, setDocumentTypeOpen] = useState(false);
  const [processorOpen, setProcessorOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [trainingOptionsOpen, setTrainingOptionsOpen] = useState(false);
  const [executionOptionsOpen, setExecutionOptionsOpen] = useState(false);
  const [jsonMode, setJsonMode] = useState(true);
  const [settingsFullScreen, setSettingsFullScreen] = useState(false);
  const [saved, setSaved] = useState(false);
  const { copied, copyText } = useSystemCopyFeedback();
  const executionOptions = Array.from(new Set(['invoice-exec-v1.3', 'demo.catering.mailbox', ...(executionModel ? [executionModel] : [])]));

  const closeDropdowns = (except?: 'type' | 'processor' | 'training' | 'execution') => {
    if (except !== 'type') setDocumentTypeOpen(false);
    if (except !== 'processor') setProcessorOpen(false);
    if (except !== 'training') setTrainingOpen(false);
    if (except !== 'execution') setExecutionOpen(false);
  };

  const updateDocumentSet = () => {
    if (!name.trim() || !documentType || !documentProcessor) return;
    onUpdate({ name: name.trim(), description, documentType, documentProcessor, trainingModel, executionModel, settings });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className={`${settingsFullScreen ? 'fixed inset-0 z-[90] bg-white p-6' : 'relative flex-1'} flex min-h-0 flex-col gap-6 overflow-auto`}>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex w-[400px] flex-shrink-0 flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Name <span className="text-[#FF4550]">*</span></span>
            <input aria-label="Document set details name" required value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Description</span>
            <textarea aria-label="Document set details description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-20 resize-none rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-[11px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" />
          </label>

          <label className="relative flex flex-col gap-2">
            <span className={LABEL_CLASS}>Document type <span className="text-[#FF4550]">*</span></span>
            <SystemDropdown value={documentType} options={['Invoice', 'Contract', 'Receipt']} placeholder="Select..." ariaLabel="Document set details document type" open={documentTypeOpen} onToggle={() => { setDocumentTypeOpen((open) => !open); closeDropdowns('type'); }} onSelect={(value) => { setDocumentType(value); setDocumentTypeOpen(false); }} />
          </label>

          <label className="relative flex flex-col gap-2">
            <span className={LABEL_CLASS}>Document processor <span className="text-[#FF4550]">*</span></span>
            <SystemDropdown value={documentProcessor} options={processorOptions} placeholder="Select automation process..." ariaLabel="Document set details document processor" open={processorOpen} onToggle={() => { setProcessorOpen((open) => !open); closeDropdowns('processor'); }} onSelect={(value) => { setDocumentProcessor(value); setProcessorOpen(false); }} />
          </label>

          <div className="flex items-end">
            <label className="relative min-w-0 flex-1 flex-col gap-2 flex">
              <span className={LABEL_CLASS}>Training model</span>
              <SystemDropdown value={trainingModel} options={models.map((model) => model.name)} placeholder="Select model..." ariaLabel="Document set details training model" open={trainingOpen} onToggle={() => { setTrainingOpen((open) => !open); closeDropdowns('training'); }} onSelect={(value) => { setTrainingModel(value); setTrainingOpen(false); }} />
            </label>
            <button type="button" aria-label="Document set details training model options" onClick={() => setTrainingOptionsOpen(true)} className="flex h-[42px] w-[42px] items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#007EA7]"><MoreVertical size={16} /></button>
          </div>

          <div className="flex items-end">
            <label className="relative min-w-0 flex-1 flex-col gap-2 flex">
              <span className={LABEL_CLASS}>Execution model</span>
              <SystemDropdown value={executionModel} options={executionOptions} placeholder="Select..." ariaLabel="Document set details execution model" open={executionOpen} onToggle={() => { setExecutionOpen((open) => !open); closeDropdowns('execution'); }} onSelect={(value) => { setExecutionModel(value); setExecutionOpen(false); }} />
            </label>
            <button type="button" aria-label="Document set details execution model options" onClick={() => setExecutionOptionsOpen(true)} className="flex h-[42px] w-[42px] items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#007EA7]"><MoreVertical size={16} /></button>
          </div>

        </div>

        <div className="flex min-h-[500px] min-w-0 flex-1 flex-col gap-2">
          <span className={LABEL_CLASS}>Settings</span>
          <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
            <div className="flex min-h-0 flex-1 overflow-auto">
              {!jsonMode ? (
                <div className="flex flex-1 flex-col gap-2 p-4 font-mono text-[14px] text-[#10233A]"><div className="flex items-center gap-2"><ChevronRight size={16} className="rotate-90 text-[#7288A3]" /><span className="text-[#A61B1B]">settings</span><span className="text-[#A1A1A1]">:</span><input aria-label="Document set details settings tree value" value={settings} onChange={(event) => setSettings(event.target.value)} className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" /></div></div>
              ) : (
                <><div className="flex w-12 flex-shrink-0 flex-col items-center bg-[#F8FAFC] py-4 font-mono text-[14px] leading-6 text-[#7288A3]">{settings.split('\n').map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}</div><textarea aria-label="Document set details settings" value={settings} onChange={(event) => setSettings(event.target.value)} spellCheck={false} className="min-h-full min-w-0 flex-1 resize-none p-4 font-mono text-[15px] leading-6 text-[#10233A] outline-none" /></>
              )}
            </div>
            <div className="flex h-11 flex-shrink-0 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] px-3">
              <button type="button" role="switch" aria-label="Document set details Tree View" aria-checked={!jsonMode} onClick={() => setJsonMode((value) => !value)} className="flex items-center gap-3 font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${!jsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${!jsonMode ? 'translate-x-4' : ''}`} /></span>Tree View</button>
              <div className="flex items-center gap-4 text-[#7288A3]"><button type="button" aria-label="Document set details map"><Map size={18} /></button><button type="button" aria-label="Search document set details settings"><Search size={18} /></button><button type="button" aria-label="Wrap document set details settings"><AlignLeft size={18} /></button><button type="button" aria-label="COPY document set details settings" onClick={() => void copyText(settings)} className={copied ? 'text-[#007EA7]' : ''}><Copy size={18} /></button><button type="button" aria-label="Fullscreen document set details settings" onClick={() => setSettingsFullScreen((value) => !value)}>{settingsFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
            </div>
          </div>
          <button type="button" role="switch" aria-label="Document set details JSON" aria-checked={jsonMode} onClick={() => setJsonMode((value) => !value)} className="flex items-center gap-3 self-start font-montserrat text-[14px] font-medium text-[#10233A]"><span className={`relative h-[20px] w-[36px] rounded-full border ${jsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${jsonMode ? 'translate-x-4' : ''}`} /></span>JSON</button>
        </div>
      </div>

      <button type="button" data-system-action="true" aria-label="Update document set" disabled={!name.trim() || !documentType || !documentProcessor} onClick={updateDocumentSet} className="flex h-[42px] w-[93px] flex-shrink-0 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] enabled:active:text-white disabled:cursor-not-allowed disabled:opacity-40">Update</button>

      {trainingOptionsOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#10233A]/30 p-6" onMouseDown={() => setTrainingOptionsOpen(false)}><div role="dialog" aria-modal="true" aria-label="Document set details training model list" className="flex w-[620px] max-w-full flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="font-montserrat text-[18px] font-semibold text-[#10233A]">Models</h2><button type="button" aria-label="Close document set details training models" onClick={() => setTrainingOptionsOpen(false)}><X size={22} className="text-[#7288A3]" /></button></div><div className="grid grid-cols-[1fr_1fr_40px] px-3 font-montserrat text-[12px] font-medium text-[#7288A3]"><span>Name</span><span>Description</span><span /></div>{models.map((model, index) => <div key={model.id} className={`grid h-10 grid-cols-[1fr_1fr_40px] items-center rounded-lg px-3 font-montserrat text-[13px] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}><span className="truncate">{model.name}</span><span className="truncate text-[#7288A3]">{model.description}</span><button type="button" aria-label={`Select details training model ${model.name}`} onClick={() => { setTrainingModel(model.name); setTrainingOptionsOpen(false); }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={16} /></button></div>)}</div></div>}
      {executionOptionsOpen && <ExecutionModelOptionsModal onClose={() => setExecutionOptionsOpen(false)} onSelect={(option) => { setExecutionModel(option.name); setExecutionOptionsOpen(false); }} />}
      <SystemCopyToast visible={copied} message="Document set settings copied successfully" />
      {saved && <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-[400] -translate-x-1/2 rounded-lg bg-[#2E8B57] px-5 py-3 font-montserrat text-[14px] font-semibold text-white shadow-lg">Document set updated successfully</div>}
    </div>
  );
}
