import { RotateCw } from 'lucide-react';

interface RedoAllButtonProps {
  onRedo: () => void;
  disabled?: boolean;
  label?: string;
}

/** Re-runs every record selected in the current table context. */
export default function RedoAllButton({ onRedo, disabled = false, label = 'REDO ALL' }: RedoAllButtonProps) {
  return (
    <button
      type="button"
      data-button-family="redo-all"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onRedo}
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors enabled:hover:text-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <RotateCw size={16} />
    </button>
  );
}
