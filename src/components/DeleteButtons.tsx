import { Power, Trash2 } from 'lucide-react';

const lifecycleLabel = (label: string, action: string) => /^delete\b/i.test(label)
  ? label.replace(/^delete\b/i, action)
  : `${action}: ${label}`;

interface BulkDeleteButtonProps {
  linked?: boolean;
  inactive?: boolean;
  selectedCount: number;
  onDelete: () => void;
  label?: string;
  className?: string;
}

export function BulkDeleteButton({ selectedCount, onDelete, label = 'Delete selected records', className = '', linked = false, inactive = false }: BulkDeleteButtonProps) {
  const disabled = selectedCount === 0 || inactive;
  const actionLabel = inactive ? lifecycleLabel(label, 'Inactive') : linked
    ? label === 'Delete selected records'
      ? 'Deactivate linked records; delete unused selected records'
      : `${lifecycleLabel(label, 'Deactivate')}; delete unused selected records`
    : label;
  return (
    <button
      type="button"
      data-button-family="bulk-delete"
      aria-label={actionLabel}
      title={inactive ? 'INACTIVE' : linked ? actionLabel : 'DELETE SELECTED'}
      disabled={disabled}
      onClick={disabled ? undefined : onDelete}
      className={`flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors enabled:hover:text-[#D64545] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {linked || inactive ? <Power size={16} /> : <Trash2 size={16} />}
    </button>
  );
}

interface RowDeleteButtonProps {
  linked?: boolean;
  inactive?: boolean;
  onDelete: () => void;
  label?: string;
  className?: string;
  title?: string;
  variant?: 'outlined' | 'plain';
  disabled?: boolean;
}

export function RowDeleteButton({ onDelete, label = 'Delete record', className = '', title = 'DELETE', variant = 'outlined', disabled = false, linked = false, inactive = false }: RowDeleteButtonProps) {
  const deactivate = linked || inactive;
  const actionDisabled = disabled || inactive;
  return (
    <button
      type="button"
      data-button-family="row-delete"
      aria-label={inactive ? lifecycleLabel(label, 'Inactive') : deactivate ? lifecycleLabel(label, 'Deactivate') : label}
      title={inactive ? 'INACTIVE' : deactivate ? 'DEACTIVATE' : title}
      disabled={actionDisabled}
      onClick={event => {
        event.stopPropagation();
        if (!actionDisabled) onDelete();
      }}
      className={`${variant === 'plain'
        ? 'flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors enabled:hover:text-[#D64545] disabled:cursor-not-allowed disabled:opacity-40'
        : 'flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors enabled:hover:border-[#D64545] enabled:hover:text-[#D64545] disabled:cursor-not-allowed disabled:opacity-40'} ${className}`}
    >
      {deactivate ? <Power size={16} /> : <Trash2 size={16} />}
    </button>
  );
}
