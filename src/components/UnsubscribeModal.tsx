import { X } from 'lucide-react';

interface UnsubscribeModalProps {
  isOpen: boolean;
  reportName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function UnsubscribeModal({ isOpen, reportName, onConfirm, onCancel }: UnsubscribeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-[340px] bg-white shadow-[-2px_0px_0px_#E5EDF9] p-6 pb-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-start gap-2">
          <h2 className="text-[22px] font-semibold text-[#10233A] leading-8">
            Disable notifications
          </h2>
          <button
            onClick={onCancel}
            className="w-6 h-6 flex items-center justify-center hover:bg-gray-100 rounded transition-colors"
          >
            <X size={24} className="text-[#7288A3]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-8">
          <p className="text-sm font-medium text-[#10233A] leading-5">
            Are you sure that you want to disable notification about {reportName}?
          </p>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 h-[42px] bg-white border-2 border-[#D3E1EC] rounded-lg text-base font-semibold text-[#7288A3] hover:bg-[#F6F7FF] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 h-[42px] bg-main-orange rounded-lg text-base font-semibold text-white hover:bg-[#E55A00] transition-colors"
            >
              Disable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
