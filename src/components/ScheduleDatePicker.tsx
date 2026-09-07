import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEK_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type ScheduleDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  align?: "left" | "right";
  compact?: boolean;
};

export default function ScheduleDatePicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  align = "left",
  compact = false,
}: ScheduleDatePickerProps) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() =>
    selectedDate && !Number.isNaN(selectedDate.getTime())
      ? selectedDate
      : new Date(),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const years = Array.from(
    { length: 21 },
    (_, index) => new Date().getFullYear() - 10 + index,
  );
  const toIsoDate = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (selectedDate && !Number.isNaN(selectedDate.getTime())) {
            setViewDate(selectedDate);
          }
          setOpen((current) => !current);
        }}
        className={`flex w-full items-center justify-between bg-white font-montserrat font-medium transition-colors ${compact ? "h-6 rounded border border-transparent px-1 text-[10px] hover:bg-[#F7FAFC]" : `h-[42px] rounded-lg border px-[14px] text-[14px] ${open ? "border-[#007EA7] ring-[3px] ring-[#007EA7]/20" : "border-[#D3E1EC]"}`}`}
      >
        <span className={value ? "text-[#10233A]" : "text-[#A1B6C6]"}>
          {value && compact
            ? value.split("-").reverse().join("/")
            : value || placeholder}
        </span>
        <Calendar size={compact ? 14 : 16} className="flex-shrink-0 text-[#7288A3]" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${ariaLabel} calendar`}
          className={`absolute z-40 w-[292px] rounded-xl border border-[#D3E1EC] bg-white p-4 shadow-[0_8px_24px_rgba(16,35,58,0.16)] ${compact ? "top-[34px]" : "top-[48px]"} ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-4 flex items-center gap-2">
            <button type="button" aria-label="Previous month" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D3E1EC] text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><ChevronLeft size={16} /></button>
            <div className="min-w-0 flex-1">
              <SearchableSelect ariaLabel="Calendar month" value={String(month)} onChange={(nextMonth) => setViewDate(new Date(year, Number(nextMonth), 1))} options={MONTH_NAMES.map((name, index) => ({ value: String(index), label: name }))} className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-7 font-montserrat text-[12px] font-medium text-[#10233A]" />
            </div>
            <div className="w-[76px] flex-shrink-0">
              <SearchableSelect ariaLabel="Calendar year" value={String(year)} onChange={(nextYear) => setViewDate(new Date(Number(nextYear), month, 1))} options={years.map(String)} className="h-8 rounded-md border border-[#D3E1EC] bg-white px-2 pr-7 font-montserrat text-[12px] font-medium text-[#10233A]" />
            </div>
            <button type="button" aria-label="Next month" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D3E1EC] text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><ChevronRight size={16} /></button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((day) => <span key={day} className="flex h-7 items-center justify-center font-montserrat text-[11px] font-semibold text-[#7288A3]">{day}</span>)}
            {Array.from({ length: firstWeekDay }, (_, index) => <span key={`blank-${index}`} className="h-8" />)}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
              const isoDate = toIsoDate(day);
              const selected = isoDate === value;
              const today = isoDate === new Date().toISOString().slice(0, 10);
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={`Select ${isoDate}`}
                  onClick={() => { onChange(isoDate); setOpen(false); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-md font-montserrat text-[12px] font-medium transition-colors ${selected ? "bg-[#007EA7] text-white" : today ? "border border-[#007EA7] text-[#007EA7]" : "text-[#10233A] hover:bg-[#E5EDF9]"}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {value ? (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-3 font-montserrat text-[12px] font-semibold text-[#7288A3] hover:text-[#007EA7]">Clear date</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
