import { useState } from 'react';
import { X, Upload } from 'lucide-react';

interface UploadAttachmentPanelProps {
  onClose: () => void;
}

export default function UploadAttachmentPanel({ onClose }: UploadAttachmentPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setFileName(file.name);
  };

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex">
      <div className="w-[340px] bg-white border-l flex flex-col h-full" style={{ boxShadow: '-2px 0px 0px #E5EDF9' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5EDF9] flex-shrink-0">
          <span className="font-montserrat font-semibold text-[16px] text-[#10233A]">Upload attachment</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5EDF9] transition-colors">
            <X size={14} className="text-[#7288A3]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            {/* Drag & drop area */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 p-8 rounded-lg border border-dashed transition-colors cursor-pointer ${
                dragOver ? 'border-[#007EA7] bg-[#E6F2F6]' : 'border-[#006080] bg-[#F8FDFF]'
              }`}
              onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <Upload size={24} className="text-[#007EA7]" />
              <div className="text-center">
                <span className="font-montserrat font-medium text-[13px] text-[#10233A] block">
                  Drag & drop files here
                </span>
                <span className="font-montserrat font-medium text-[11px] text-[#7288A3] block mt-1">
                  or click to browse
                </span>
              </div>
              <span className="font-montserrat font-medium text-[10px] text-[#A1B6C6]">
                PDF, JPG, PNG up to 10MB
              </span>
              <input
                id="file-upload-input"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setFileName(file.name);
                }}
              />
            </div>

            {/* Selected file */}
            {fileName && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#E6F2F6] rounded border border-[#D3E1EC]">
                <Upload size={12} className="text-[#007EA7] flex-shrink-0" />
                <span className="font-montserrat font-medium text-[12px] text-[#10233A] truncate flex-1">{fileName}</span>
                <button onClick={() => setFileName('')} className="hover:opacity-70">
                  <X size={12} className="text-[#7288A3]" />
                </button>
              </div>
            )}

            {/* Description field */}
            <div className="flex flex-col gap-1">
              <span className="font-montserrat font-medium text-[11px] text-[#7288A3]">Description (optional)</span>
              <textarea
                placeholder="Add a description for this attachment..."
                rows={3}
                className="px-3 py-2 rounded border border-[#D3E1EC] font-montserrat font-medium text-[12px] text-[#10233A] placeholder:text-[#A1B6C6] outline-none focus:border-[#007EA7] transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#E5EDF9] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-[#D3E1EC] font-montserrat font-medium text-[13px] text-[#10233A] hover:bg-[#F8FDFF] transition-colors"
          >
            Cancel
          </button>
          <button data-system-action="true" className="px-4 py-2 rounded-md bg-[#007EA7] font-montserrat font-semibold text-[13px] text-white hover:bg-[#006b8f] transition-colors">
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
