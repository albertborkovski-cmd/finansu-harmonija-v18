import { Ban } from 'lucide-react';

interface StopAllButtonProps {
  onStop: () => void;
  disabled?: boolean;
  label?: string;
}

/** Stops only the records selected in the current table context. */
export default function StopAllButton({ onStop, disabled = false, label = 'STOP ALL' }: StopAllButtonProps) {
  return (
    <button
      type="button"
      data-button-family="stop-all"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onStop}
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors enabled:hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Ban size={16} />
    </button>
  );
}
