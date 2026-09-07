import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload, X } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

interface ImportButtonProps {
  scope: string;
  onImport?: (file: File) => void | Promise<void>;
  className?: string;
  variant?: 'toolbar' | 'row' | 'action';
  label?: string;
  iconDirection?: 'up' | 'down';
  disabled?: boolean;
}

/** Shared contextual IMPORT action. The selected file is always assigned to this button's scope. */
export default function ImportButton({ scope, onImport, className = '', variant = 'toolbar', label = 'IMPORT', iconDirection = 'up', disabled = false }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState('Default');
  const [mergeAutomatically, setMergeAutomatically] = useState(false);
  const [dragging, setDragging] = useState(false);

  const close = () => {
    setOpen(false);
    setSelectedFile(null);
    setFormat('Default');
    setMergeAutomatically(false);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    try {
      await onImport?.(file);
    const storageKey = 'finansu-harmonija-v4:context-imports';
    let stored: Record<string, Array<{ fileName: string; size: number; type: string; importedAt: string; mergeAutomatically?: boolean }>> = {};
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    } catch {
      stored = {};
    }
    stored[scope] = [
      ...(stored[scope] ?? []),
      { fileName: file.name, size: file.size, type: file.type, importedAt: new Date().toISOString(), mergeAutomatically: label === 'IMPORT FIRST' ? mergeAutomatically : undefined },
    ];
    localStorage.setItem(storageKey, JSON.stringify(stored));
    window.dispatchEvent(new CustomEvent('finansu-harmonija:import', {
      detail: { scope, fileName: file.name, size: file.size, type: file.type, mergeAutomatically: label === 'IMPORT FIRST' ? mergeAutomatically : undefined },
    }));
    setConfirmation(`${file.name} imported into ${scope}`);
    } catch (error) {
      setConfirmation(error instanceof Error ? error.message : `Could not import ${file.name}`);
    }
    window.setTimeout(() => setConfirmation(''), 2500);
  };

  return (
    <>
      <button
        type="button"
        data-button-family="import"
        aria-expanded={open}
        title={label}
        aria-label={`${label} into ${scope}`}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(true); }}
        className={`flex flex-shrink-0 items-center justify-center transition-colors ${disabled ? 'cursor-not-allowed text-[#C7D2DC]' : 'text-[#7288A3] hover:text-[#007EA7]'} ${variant === 'row' ? `h-7 w-7 rounded border bg-white ${disabled ? 'border-[#E5E7EB]' : 'border-[#D3E1EC] hover:border-[#007EA7]'}` : variant === 'action' ? `h-[42px] rounded-lg border-2 bg-white px-4 font-montserrat text-[16px] font-semibold leading-6 ${disabled ? 'border-[#E5E7EB]' : 'border-[#D3E1EC] hover:border-[#007EA7]'}` : 'h-4 w-4'} ${className}`}
      >
        {variant === 'action' ? label : iconDirection === 'down' ? <Download size={variant === 'row' ? 14 : 16} /> : <Upload size={variant === 'row' ? 14 : 16} />}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={label === 'IMPORT FIRST' ? '.zip,application/zip' : '.json,.csv,.xlsx,.xls,.xml,.zip,.pdf,.txt'}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) setSelectedFile(file);
        }}
      />
      {open && label === 'IMPORT FIRST' && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#10233A]/20 p-4" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Please, provide packages to upload"
            className="flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Please, provide packages to upload</h2>
              <button type="button" title="Close" aria-label="Close package import" onClick={close} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]">
                <X size={24} />
              </button>
            </div>

            <div
              className={`flex min-h-[164px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-5 py-6 transition-colors ${dragging ? 'border-[#007EA7] bg-[#F8FDFF]' : 'border-[#4C7CFF] bg-white'}`}
              onDragEnter={event => { event.preventDefault(); setDragging(true); }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={event => { event.preventDefault(); setDragging(false); }}
              onDrop={event => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file?.name.toLowerCase().endsWith('.zip')) setSelectedFile(file);
              }}
            >
              <button type="button" data-system-action="true" onClick={() => inputRef.current?.click()} className="flex h-[42px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold leading-6 text-white hover:bg-[#006B8F]">
                Browse file
              </button>
              <p className="max-w-full break-words text-center font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">{selectedFile ? selectedFile.name : 'Please provide ZIP file or drag and drop here'}</p>
            </div>

            <button type="button" onClick={() => setMergeAutomatically(value => !value)} className="flex items-center gap-3 self-start text-left">
              <span className={`relative flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md border ${mergeAutomatically ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                {mergeAutomatically && <span className="h-2 w-3 rotate-[-45deg] border-b-2 border-l-2 border-white" />}
              </span>
              <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Try to merge all automatically</span>
            </button>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
              <button
                type="button"
                disabled={!selectedFile}
                onClick={() => {
                  if (!selectedFile) return;
                  void handleFile(selectedFile);
                  close();
                }}
                className="flex h-[42px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold text-white hover:bg-[#006B8F] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"
              >
                Upload file
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {open && label !== 'IMPORT FIRST' && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#10233A]/20 p-4" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${label} into ${scope}`}
            className="flex w-[429px] max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Upload {scope} entries</h2>
              <button type="button" title="Close" aria-label="Close import" onClick={close} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A]">
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <p className="text-center font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">Please, provide a file with records</p>
              <button type="button" data-system-action="true" onClick={() => inputRef.current?.click()} className="flex h-8 items-center justify-center rounded-md bg-[#007EA7] px-3 font-montserrat text-[14px] font-semibold leading-5 text-white hover:bg-[#006B8F]">
                Add
              </button>
              {selectedFile && <p className="max-w-full truncate font-montserrat text-[12px] font-medium text-[#10233A]">{selectedFile.name}</p>}
            </div>

            <label className="flex flex-col gap-2">
              <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">Choose file format</span>
              <SearchableSelect ariaLabel="Choose file format" value={format} onChange={setFormat} options={["Default", "CSV", "JSON", "Excel", "XML"]} />
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
              <button
                type="button"
                disabled={!selectedFile}
                onClick={() => {
                  if (!selectedFile) return;
                  void handleFile(selectedFile);
                  close();
                }}
                className="flex h-[42px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[16px] font-semibold text-white hover:bg-[#006B8F] disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]"
              >
                Upload
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {confirmation && (
        <div role="status" className="fixed bottom-6 right-6 z-[120] rounded-lg bg-[#10233A] px-4 py-3 font-montserrat text-[13px] font-medium text-white shadow-xl">
          {confirmation}
        </div>
      )}
    </>
  );
}
