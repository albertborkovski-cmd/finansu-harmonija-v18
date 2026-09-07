import { RefreshCw } from 'lucide-react';

interface RefreshAllButtonProps {
  onRefresh: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** System-wide REFRESH ALL action. It reloads data without restarting records or changing their status. */
export default function RefreshAllButton({ onRefresh, label = 'REFRESH ALL', disabled = false, className = '' }: RefreshAllButtonProps) {
  return (
    <button
      type="button"
      data-button-family="refresh-all"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onRefresh}
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors enabled:hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <RefreshCw size={16} />
    </button>
  );
}
