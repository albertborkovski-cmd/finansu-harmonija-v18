import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useDropdownDismiss } from './useDropdownDismiss';

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableSelectOption[] | string[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  emptyMessage?: string;
  /** @deprecated All selection fields use the system checklist indicator. */
  selectionIndicator?: 'check' | 'checkbox';
};

const normalizeOptions = (
  options: SearchableSelectOption[] | string[],
): SearchableSelectOption[] =>
  options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

/**
 * System-wide single-value combobox. The visible control is also the search
 * field, so long option lists can be filtered without opening a second input.
 */
export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  ariaLabel,
  disabled = false,
  className = "h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-[14px] pr-9 font-montserrat text-[14px] font-medium text-[#10233A]",
  menuClassName = "",
  emptyMessage = "No options found",
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return normalizedOptions;
    return normalizedOptions.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery) ||
        option.description?.toLocaleLowerCase().includes(normalizedQuery) ||
        option.value.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [normalizedOptions, query]);

  useDropdownDismiss(open, rootRef, () => {
    setOpen(false);
    setQuery("");
  });

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  const displayedValue = open ? query : selectedOption?.label ?? "";

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        disabled={disabled}
        value={displayedValue}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(event) => {
          if (disabled) return;
          setQuery("");
          setOpen(true);
          event.currentTarget.select();
        }}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const option = filteredOptions[activeIndex];
            if (option) choose(option);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
            inputRef.current?.blur();
          }
        }}
        className={`w-full outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7] focus:ring-1 focus:ring-[#007EA7]/20 disabled:cursor-not-allowed disabled:bg-[#F3F6F8] disabled:text-[#7288A3] ${className}`}
      />
      <button
        type="button"
        data-static-selection
        tabIndex={-1}
        disabled={disabled}
        aria-label={`Open ${ariaLabel} options`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (disabled) return;
          setQuery("");
          if (!open) inputRef.current?.focus();
          setOpen(!open);
        }}
        className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-[#7288A3] disabled:hidden"
      >
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className={`absolute left-0 right-0 top-[calc(100%+4px)] z-[100] max-h-[260px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)] ${menuClassName}`}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const selected = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  data-static-selection
                  aria-selected={selected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  className={`flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left font-montserrat text-[13px] font-medium text-[#10233A] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "bg-[#E5EDF9]" : activeIndex === index ? "bg-[#F2F7FC]" : "hover:bg-[#F8FDFF]"}`}
                >
                  <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${selected ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                    {selected && <Check size={12} strokeWidth={2.5} className="text-white" />}
                  </span>
                  <span className={`min-w-0 flex-1 ${option.description ? 'flex flex-col gap-1' : 'truncate'}`}>
                    <span className={option.description ? 'whitespace-normal break-words text-[14px] leading-5' : ''}>{option.label}</span>
                    {option.description && <span className="whitespace-normal break-words text-[12px] font-normal leading-[18px] text-[#7288A3]">{option.description}</span>}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
              {emptyMessage}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
