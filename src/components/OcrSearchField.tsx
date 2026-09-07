import { useState, type KeyboardEventHandler } from "react";
import { Search } from "lucide-react";

interface OcrSearchFieldProps {
  ariaLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
  onActivate?: () => void;
  onFocus?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  ariaExpanded?: boolean;
  ariaControls?: string;
  className?: string;
}

/** Shared OCR search control. Keep its fixed size and placement stable across every OCR view. */
export default function OcrSearchField({
  ariaLabel = "Search",
  value,
  onChange,
  onActivate,
  onFocus,
  onKeyDown,
  ariaExpanded,
  ariaControls,
  className = "",
}: OcrSearchFieldProps) {
  const [internalValue, setInternalValue] = useState("");
  const currentValue = value ?? internalValue;

  if (onActivate) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onActivate}
        className={`ocr-search-field order-first flex h-7 w-[260px] min-w-[260px] max-w-[260px] flex-shrink-0 items-center justify-between gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] text-left transition-colors hover:bg-[#D3E1EC] ${className}`}
      >
        <span className="min-w-0 flex-1 truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
          Search
        </span>
        <Search size={16} className="flex-shrink-0 text-[#7288A3]" />
      </button>
    );
  }

  return (
    <label
      className={`ocr-search-field order-first flex h-7 w-[260px] min-w-[260px] max-w-[260px] flex-shrink-0 items-center justify-between gap-1 rounded bg-[#E5EDF9] px-2 py-[5px] ${className}`}
    >
      <input
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        autoComplete="off"
        value={currentValue}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (value === undefined) setInternalValue(nextValue);
          onChange?.(nextValue);
        }}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#7288A3]"
      />
      <Search size={16} className="flex-shrink-0 text-[#7288A3]" />
    </label>
  );
}
