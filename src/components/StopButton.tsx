import { Ban } from 'lucide-react';

interface StopButtonProps {
  onStop: () => void;
  stopped?: boolean;
  label?: string;
  size?: number;
  variant?: 'outlined' | 'plain';
}

/** Stops only the record whose row owns this button. */
export default function StopButton({ onStop, stopped = false, label = 'STOP', size = 16, variant = 'outlined' }: StopButtonProps) {
  return (
    <button
      type="button"
      data-button-family="stop-record"
      aria-label={label}
      title="STOP"
      disabled={stopped}
      onClick={stopped ? undefined : onStop}
      className={variant === 'plain'
        ? 'flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:text-[#B4B6B8]'
        : 'flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#F5F5F5] disabled:text-[#B4B6B8]'}
    >
      <Ban size={size} />
    </button>
  );
}
