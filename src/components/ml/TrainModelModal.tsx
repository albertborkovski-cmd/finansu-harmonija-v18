import { useState } from 'react';
import { AlignLeft, Check, ChevronDown, ChevronRight, Copy, Map, Maximize2, Minimize2, MoreVertical, Search, Target, X } from 'lucide-react';
import TablePagination from '../TablePagination';
import { SystemCopyToast, useSystemCopyFeedback } from '../SystemCopyFeedback';
import { useModelCatalog, type ModelRecord } from './modelCatalogStore';

const TRAIN_JSON = `{
  "training": {
    "epochs": 100,
    "batch_size": 16,
    "optimizer": "adam",
    "learning_rate": 0.0005
  },
  "augmentation": {
    "rotate": true,
    "flip": false,
    "scale_range": [0.8, 1.2]
  }
}`;

function TrainModelOptionsModal({ onClose, onSelect, models }: { onClose: () => void; onSelect: (option: ModelRecord) => void; models: ModelRecord[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();
  const options = models.filter((option) => !normalized || `${option.name} ${option.description}`.toLowerCase().includes(normalized));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10233A]/35 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train model options" className="flex h-[600px] w-[872px] flex-col items-start gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 w-full items-start justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Train model options</h2>
          <button type="button" aria-label="Close Train model options" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex h-[504px] w-full flex-col gap-6">
          <label className="flex h-7 w-[260px] items-center justify-between rounded bg-[#E5EDF9] px-2"><input aria-label="Search train model options" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#7288A3]" /><Search size={16} className="text-[#7288A3]" /></label>

          <div className="flex h-[452px] w-full flex-col justify-between gap-12">
            <div className="flex h-[396px] flex-col gap-4 overflow-hidden">
              <div className="grid h-5 grid-cols-[256px_250px_1fr] items-center gap-3 px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]"><span className="text-[#10233A]">Name</span><span>Description</span><span /></div>
              <div className="flex flex-col overflow-hidden">
                {options.map((option, index) => (
                  <div key={option.id} className={`grid h-9 flex-shrink-0 grid-cols-[256px_250px_1fr] items-center gap-3 rounded-lg px-3 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                    <span className="truncate">{option.name}</span><span className="truncate">{option.description}</span>
                    <span className="flex justify-end"><button type="button" aria-label={`Select train model option ${index + 1}`} onClick={() => onSelect(option)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={16} /></button></span>
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

export default function TrainModelModal({ onClose, documentSetName }: { onClose: () => void; documentSetName: string }) {
  const [models] = useModelCatalog();
  const [jsonMode, setJsonMode] = useState(true);
  const [settings, setSettings] = useState(TRAIN_JSON);
  const [settingsFullScreen, setSettingsFullScreen] = useState(false);
  const { copied: settingsCopied, copyText: copySettings } = useSystemCopyFeedback();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [name, setName] = useState(models[0]?.name ?? '');
  const [modelDescription, setModelDescription] = useState('');
  const [version, setVersion] = useState('');
  const runName = `${documentSetName} training`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10233A]/20 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Train model" className={`flex max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)] transition-[width,height] ${settingsFullScreen ? 'h-[calc(100vh-48px)] w-[calc(100vw-48px)]' : 'h-[626px] w-[872px]'}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-6 flex-shrink-0 items-center justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Train model <span className="font-medium text-[#7288A3]">— {documentSetName}</span></h2>
          <button type="button" aria-label="Close Train model" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex h-[464px] min-h-0 w-full gap-6">
          <div className="flex h-[390px] w-[400px] flex-shrink-0 flex-col gap-6">
            <div className="flex h-[70px] items-end">
              <label className="relative flex h-[70px] min-w-0 flex-1 flex-col gap-2">
                <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Name <span className="text-[#FF4550]">*</span></span>
                <button type="button" aria-label="Train model name" aria-expanded={nameMenuOpen} onClick={() => setNameMenuOpen((open) => !open)} className={`flex h-[42px] items-center justify-between rounded-lg border bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 outline-none transition-colors ${nameMenuOpen ? 'border-[#007EA7] ring-2 ring-[#007EA7]/10' : 'border-[#D3E1EC] hover:border-[#A1B6C6]'}`}>
                  <span className={name ? 'truncate text-[#10233A]' : 'text-[#A1B6C6]'}>{name || 'Choose model'}</span>
                  <ChevronDown size={16} className={`flex-shrink-0 text-[#7288A3] transition-transform ${nameMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {nameMenuOpen && (
                  <div role="listbox" aria-label="Models from Machine learning" className="absolute left-0 right-0 top-[74px] z-30 max-h-[220px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]">
                    {models.map((model) => {
                      const selected = model.name === name;
                      return (
                        <button key={model.id} type="button" role="option" aria-selected={selected} onClick={() => { setName(model.name); setNameMenuOpen(false); }} className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left font-montserrat text-[13px] transition-colors ${selected ? 'bg-[#E5EDF9] text-[#10233A]' : 'text-[#10233A] hover:bg-[#F8FDFF]'}`}>
                          <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${selected ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{selected && <Check size={12} strokeWidth={2.5} className="text-white" />}</span>
                          <span className="min-w-0 truncate font-semibold">{model.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </label>
              <button type="button" aria-label="Open Train model options" onClick={() => setOptionsOpen(true)} className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-lg text-[#7288A3] hover:bg-[#F8FDFF] hover:text-[#007EA7]"><MoreVertical size={16} /></button>
            </div>

            <div className="flex h-[70px] items-end">
              <label className="relative flex h-[70px] min-w-0 flex-1 flex-col gap-2">
                <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Version</span>
                <input aria-label="Train model version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Enter version" className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]" />
              </label>
            </div>

            <label className="flex h-[108px] flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Description</span>
              <textarea aria-label="Selected model description" value={modelDescription} onChange={(event) => setModelDescription(event.target.value)} className="h-20 resize-none rounded-lg border border-[#D3E1EC] bg-white px-[14px] py-[11px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" />
            </label>

            <label className="flex h-[70px] flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Run name</span>
              <input aria-label="Training run name" value={runName} readOnly aria-readonly="true" className="h-[42px] cursor-default rounded-lg border border-[#E5EDF9] bg-[#F8FAFC] px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#7288A3] outline-none" />
            </label>
          </div>

          <div className="flex h-[464px] min-w-0 flex-1 flex-col gap-2">
            <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Settings</span>
            <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[#E5EDF9] bg-white">
              <div className="flex min-h-0 flex-1 overflow-auto">
                {!jsonMode ? (
                  <div className="flex flex-1 flex-col gap-2 p-4 font-mono text-[14px] text-[#10233A]">
                    <div className="flex items-center gap-2">
                      <ChevronRight size={16} className="rotate-90 text-[#7288A3]" />
                      <span className="text-[#A61B1B]">settings</span>
                      <span className="text-[#A1A1A1]">:</span>
                      <input aria-label="Train model settings tree value" value={settings} onChange={(event) => setSettings(event.target.value)} placeholder="Enter settings" className="min-w-0 flex-1 rounded border border-[#D3E1EC] px-2 py-1 font-mono text-[#1459A6] outline-none focus:border-[#007EA7]" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex w-12 flex-shrink-0 flex-col items-center bg-[#F8FAFC] py-4 font-mono text-[14px] leading-6 text-[#7288A3]">
                      {settings.split('\n').map((_, index) => <span key={index} className="h-6 select-none">{index + 1}</span>)}
                    </div>
                    <textarea aria-label="Train model settings" value={settings} onChange={(event) => setSettings(event.target.value)} placeholder="Enter settings" spellCheck={false} className="min-h-full min-w-0 flex-1 resize-none p-4 font-mono text-[15px] leading-6 text-[#10233A] outline-none" />
                  </>
                )}
              </div>
              <div className="flex h-11 flex-shrink-0 items-center justify-between border-t border-[#E5EDF9] bg-[#F8FAFC] px-3">
                <button type="button" role="switch" aria-label="Train model Tree View" aria-checked={!jsonMode} onClick={() => setJsonMode((value) => !value)} className="flex items-center gap-3 font-montserrat text-[14px] font-medium text-[#10233A]">
                  <span className={`relative h-[20px] w-[36px] rounded-full border ${!jsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${!jsonMode ? 'translate-x-4' : ''}`} /></span>
                  Tree View
                </button>
                <div className="flex items-center gap-4 text-[#7288A3]">
                  <button type="button" title="MAP" aria-label="Train settings map"><Map size={18} /></button>
                  <button type="button" title="SEARCH" aria-label="Search train settings"><Search size={18} /></button>
                  <button type="button" title="WRAP TEXT" aria-label="Wrap train settings"><AlignLeft size={18} /></button>
                  <button type="button" title="COPY" aria-label="COPY train model settings" onClick={() => void copySettings(settings)} className={settingsCopied ? 'text-[#007EA7]' : 'transition-colors hover:text-[#007EA7]'}><Copy size={18} /></button>
                  <button type="button" title="FULL SCREEN" aria-label="Fullscreen train settings" onClick={() => setSettingsFullScreen((value) => !value)}>{settingsFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
                </div>
              </div>
            </div>
            <button type="button" role="switch" aria-label="Train model JSON" aria-checked={jsonMode} onClick={() => setJsonMode((value) => !value)} className="flex items-center gap-3 self-start font-montserrat text-[14px] font-medium text-[#10233A]">
              <span className={`relative h-[20px] w-[36px] rounded-full border ${jsonMode ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-[#E5EDF9]'}`}><span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${jsonMode ? 'translate-x-4' : ''}`} /></span>
              JSON
            </button>
          </div>
        </div>

        <div className="flex h-[42px] flex-shrink-0 justify-end gap-2">
          <button type="button" onClick={onClose} className="flex h-[42px] w-[88px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
          <button data-system-action="true" type="button" disabled={!name.trim()} className="flex h-[42px] w-[73px] items-center justify-center rounded-lg bg-[#007EA7] font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006B8F] disabled:opacity-40">Train</button>
        </div>

        {optionsOpen && <TrainModelOptionsModal models={models} onClose={() => setOptionsOpen(false)} onSelect={(option) => { setName(option.name); setOptionsOpen(false); }} />}
        <SystemCopyToast visible={settingsCopied} message="Train model settings copied successfully" />
      </div>
    </div>
  );
}
