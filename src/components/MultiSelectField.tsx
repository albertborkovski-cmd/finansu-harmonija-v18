import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useDropdownDismiss } from './useDropdownDismiss';

interface MultiSelectFieldProps {
  label: string;
  options?: string[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  required?: boolean;
}

export default function MultiSelectField({
  label,
  options,
  value,
  onChange,
  placeholder,
  required = false,
}: MultiSelectFieldProps) {
  const selected = value ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useDropdownDismiss(open, ref, () => {
    setOpen(false);
    setQuery('');
  });

  const toggleOption = (option: string) => {
    onChange?.(
      selected.includes(option)
        ? selected.filter(item => item !== option)
        : [...selected, option],
    );
  };
  const availableOptions = [...new Set([...(options ?? []), ...selected])];
  const filteredOptions = availableOptions.filter(option =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div ref={ref} className="flex w-full min-w-0 flex-col gap-2">
      <span className="font-montserrat text-[14px] font-semibold leading-[140%] text-[#10233A]">
        {label}{required && <span className="ml-0.5 text-[#FF4550]">*</span>}
      </span>
      <div className="relative w-full min-w-0">
        <button
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          data-static-selection="true"
          onClick={() => {
            setQuery('');
            setOpen(current => !current);
          }}
          className={`box-border flex h-[42px] w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-[9px] text-left transition-colors ${open ? 'border-[#007EA7] ring-[3px] ring-[#007EA7]/20' : 'border-[#D3E1EC]'}`}
        >
          <span
            title={selected.join(', ')}
            className={`min-w-0 flex-1 truncate font-montserrat text-[14px] font-medium leading-5 ${selected.length ? 'text-[#10233A]' : 'text-[#A1B6C6]'}`}
          >
            {selected.length ? selected.join(', ') : placeholder ?? 'Choose'}
          </span>
          <ChevronDown
            size={16}
            className={`flex-shrink-0 text-[#7288A3] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_20px_rgba(161,182,198,0.35)]">
            <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-[#F2F7FC] px-2">
              <input
                autoFocus
                aria-label={`Search ${label.toLowerCase()}`}
                aria-controls={listboxId}
                value={query}
                placeholder="Search"
                onChange={event => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#7288A3]"
              />
              <Search size={14} className="flex-shrink-0 text-[#7288A3]" />
            </label>
            <div
              id={listboxId}
              role="listbox"
              aria-label={label}
              aria-multiselectable="true"
              className="max-h-[280px] overflow-y-auto"
            >
              {filteredOptions.map(option => {
                const checked = selected.includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    data-static-selection="true"
                    onClick={() => toggleOption(option)}
                    className={`flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${checked ? 'bg-[#E5EDF9]' : 'hover:bg-[#F2F7FC]'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}
                    >
                      {checked && <Check size={12} strokeWidth={2.5} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1 font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">
                      {option}
                    </span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="px-2 py-3 font-montserrat text-[12px] text-[#7288A3]">
                  No matching options
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
