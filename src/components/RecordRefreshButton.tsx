import { RotateCw } from 'lucide-react';

interface RecordRefreshButtonProps {
  onRefresh: () => void;
  label?: string;
  size?: number;
  disabled?: boolean;
  variant?: 'outlined' | 'plain';
}

/** Re-runs only the record whose row owns this button. */
export default function RecordRefreshButton({ onRefresh, label = 'REDO', size = 16, disabled = false, variant = 'outlined' }: RecordRefreshButtonProps) {
  return (
    <button
      type="button"
      data-button-family="redo-record"
      aria-label={label}
      title="REDO"
      disabled={disabled}
      onClick={disabled ? undefined : onRefresh}
      className={variant === 'plain'
        ? 'flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:text-[#B4B6B8]'
        : 'flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#F5F5F5] disabled:text-[#B4B6B8]'}
    >
      <RotateCw size={size} />
    </button>
  );
}
