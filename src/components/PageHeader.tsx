import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  leading?: ReactNode;
  afterTitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

interface PageActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** System-wide page heading: title on the left, all page actions pinned right. */
export function PageHeader({ title, leading, afterTitle, actions, className = '' }: PageHeaderProps) {
  return (
    <div data-system-page-header="true" className={`system-page-header flex h-[46px] w-full flex-row flex-nowrap items-center justify-between gap-2 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        {leading && <div className="system-page-header-leading flex h-9 w-9 flex-shrink-0 items-center justify-center">{leading}</div>}
        <h1 className="truncate font-montserrat text-[36px] font-semibold leading-[46px] text-[#10233A]">{title}</h1>
        {afterTitle}
      </div>
      {actions && <div className="ml-auto flex flex-shrink-0 flex-nowrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

/**
 * System-wide top action. Enabled actions use the shared neutral outline and
 * become blue only while pressed; unavailable actions remain non-interactive.
 */
export function PageActionButton({ children, onClick, disabled = false, icon, iconOnly = false, ariaLabel, className = '' }: PageActionButtonProps) {
  const isHeaderCreate = children === 'Create new';
  return (
    <button
      type="button"
      data-system-action="true"
      data-button-family={isHeaderCreate ? 'header-create' : 'page-action'}
      aria-label={ariaLabel}
      title={iconOnly && typeof children === 'string' ? children : undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex h-8 items-center justify-center rounded-md font-montserrat text-[14px] font-semibold leading-5 transition-colors ${iconOnly ? 'w-8 px-0' : 'gap-1 px-3'} ${
        disabled
          ? 'cursor-not-allowed bg-[#F5F5F5] text-[#B4B6B8]'
          : 'border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#A1B6C6] active:border-[#007EA7] active:bg-[#007EA7] active:text-white'
      } ${className}`}
    >
      {icon}
      <span className={iconOnly ? 'sr-only' : 'whitespace-nowrap'}>{children}</span>
    </button>
  );
}
