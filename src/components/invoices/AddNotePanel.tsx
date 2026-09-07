import { useState } from 'react';
import { X } from 'lucide-react';

interface AddNotePanelProps {
  onClose: () => void;
}

export default function AddNotePanel({ onClose }: AddNotePanelProps) {
  const [noteText, setNoteText] = useState('');

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex">
      <div className="w-[340px] bg-white border-l flex flex-col h-full" style={{ boxShadow: '-2px 0px 0px #E5EDF9' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5EDF9] flex-shrink-0">
          <span className="font-montserrat font-semibold text-[16px] text-[#10233A]">Add note</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5EDF9] transition-colors">
            <X size={14} className="text-[#7288A3]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-montserrat font-medium text-[11px] text-[#7288A3] uppercase tracking-wide">Note</span>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Enter your note here..."
                rows={8}
                className="px-3 py-2 rounded border border-[#D3E1EC] font-montserrat font-medium text-[12px] text-[#10233A] placeholder:text-[#A1B6C6] outline-none focus:border-[#007EA7] transition-colors resize-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-montserrat font-medium text-[11px] text-[#7288A3] uppercase tracking-wide">Visibility</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="w-4 h-4 rounded-full border-2 border-[#007EA7] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#007EA7]" />
                  </div>
                  <span className="font-montserrat font-medium text-[12px] text-[#10233A]">Internal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="w-4 h-4 rounded-full border-2 border-[#A1B6C6] flex items-center justify-center" />
                  <span className="font-montserrat font-medium text-[12px] text-[#10233A]">Client visible</span>
                </label>
              </div>
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
            Add note
          </button>
        </div>
      </div>
    </div>
  );
}
