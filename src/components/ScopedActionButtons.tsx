import type { ReactNode } from 'react';
import { ArrowDownToLine, Columns2 } from 'lucide-react';

interface ColumnSettingsButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** System-wide COLUMNS action contract. */
export function ColumnSettingsButton({ onClick, disabled = false }: ColumnSettingsButtonProps) {
  return (
    <button
      type="button"
      data-button-family="column-settings"
      aria-label="COLUMNS"
      title="COLUMNS"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:text-[#B4B6B8]"
    >
      <Columns2 size={16} />
    </button>
  );
}

interface ImportRecordsButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** System-wide toolbar action: import every record in the current menu. */
export function ImportDataButton({ onClick, disabled = false }: ImportRecordsButtonProps) {
  return (
    <button
      type="button"
      data-button-family="import-data"
      aria-label="IMPORTDATA"
      title="IMPORTDATA"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[#7288A3] transition-colors hover:text-[#007EA7] disabled:cursor-not-allowed disabled:text-[#B4B6B8]"
    >
      <ArrowDownToLine size={16} />
    </button>
  );
}

interface ImportRecordButtonProps extends ImportRecordsButtonProps {
  recordLabel?: string;
}

/** System-wide row action: import only the record in this row. */
export function ImportOneButton({ onClick, disabled = false, recordLabel }: ImportRecordButtonProps) {
  return (
    <button
      type="button"
      data-button-family="import-one"
      aria-label={`IMPORT1${recordLabel ? ` ${recordLabel}` : ''}`}
      title="IMPORT1"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"
    >
      <ArrowDownToLine size={14} />
    </button>
  );
}

interface SaveButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

interface CancelButtonProps {
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  type?: 'button' | 'reset';
}

/** Exact Save action contract. Width remains contextual; visual design does not. */
export function SaveButton({ onClick, disabled = false, children = 'Save', className = '', type = 'button' }: SaveButtonProps) {
  return (
    <button
      type={type}
      data-system-action="true"
      data-button-family="save"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex h-[42px] items-center justify-center rounded-lg px-4 font-montserrat text-[16px] font-semibold leading-6 transition-colors ${
        disabled
          ? 'cursor-not-allowed bg-[#F5F5F5] text-[#B4B6B8]'
          : 'bg-[#007EA7] text-white hover:bg-[#006B8F] active:bg-[#005F80]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** System-wide form cancel action. Width remains contextual; visual design does not. */
export function CancelButton({ onClick, children = 'Cancel', className = '', type = 'button' }: CancelButtonProps) {
  return (
    <button
      type={type}
      data-system-action="true"
      data-button-family="cancel"
      onClick={onClick}
      className={`flex h-[42px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[16px] font-semibold leading-6 text-[#7288A3] transition-colors hover:border-[#A1B6C6] active:border-[#007EA7] active:text-[#007EA7] ${className}`}
    >
      {children}
    </button>
  );
}
