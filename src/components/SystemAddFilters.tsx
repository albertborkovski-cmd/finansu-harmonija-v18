import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";

export interface SystemFilterColumn {
  key: string;
  label: string;
  options: string[];
}

export default function SystemAddFilters({
  columns,
  activeKeys,
  values,
  onActiveKeysChange,
  onValuesChange,
  showActiveFilters = true,
  persistenceKey,
  legacyDefaultKeys,
  onClearFilters,
}: {
  columns: SystemFilterColumn[];
  activeKeys: string[];
  values: Record<string, string[]>;
  onActiveKeysChange: (keys: string[]) => void;
  onValuesChange: (values: Record<string, string[]>) => void;
  showActiveFilters?: boolean;
  persistenceKey?: string;
  legacyDefaultKeys?: string[];
  onClearFilters?: () => void;
}) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[]>(activeKeys);
  const [optionQuery, setOptionQuery] = useState("");
  const [columnQuery, setColumnQuery] = useState("");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(columns);
  const onActiveKeysChangeRef = useRef(onActiveKeysChange);
  const onValuesChangeRef = useRef(onValuesChange);
  columnsRef.current = columns;
  onActiveKeysChangeRef.current = onActiveKeysChange;
  onValuesChangeRef.current = onValuesChange;

  useEffect(() => {
    if (!persistenceKey) return;
    setHydratedKey(null);
    try {
      const stored = window.localStorage.getItem(persistenceKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          activeKeys?: unknown;
          values?: unknown;
        };
        const availableKeys = new Set(
          columnsRef.current.map((column) => column.key),
        );
        const restoredKeys = Array.isArray(parsed.activeKeys)
          ? parsed.activeKeys.filter(
              (key): key is string =>
                typeof key === "string" && availableKeys.has(key),
            )
          : [];
        const restoredValues =
          parsed.values && typeof parsed.values === "object"
            ? Object.fromEntries(
                Object.entries(parsed.values).flatMap(([key, value]) =>
                  availableKeys.has(key) && Array.isArray(value)
                    ? [
                        [
                          key,
                          value.filter(
                            (item): item is string => typeof item === "string",
                          ),
                        ],
                      ]
                    : [],
                ),
              )
            : {};
        const isLegacyAutomaticDefault =
          Array.isArray(legacyDefaultKeys) &&
          legacyDefaultKeys.length > 0 &&
          restoredKeys.length === legacyDefaultKeys.length &&
          legacyDefaultKeys.every((key) => restoredKeys.includes(key)) &&
          Object.values(restoredValues).every((value) => value.length === 0);
        onActiveKeysChangeRef.current(
          isLegacyAutomaticDefault ? [] : restoredKeys,
        );
        onValuesChangeRef.current(restoredValues);
      }
    } catch {
      window.localStorage.removeItem(persistenceKey);
    }
    setHydratedKey(persistenceKey);
  }, [legacyDefaultKeys, persistenceKey]);

  useEffect(() => {
    if (!persistenceKey || hydratedKey !== persistenceKey) return;
    window.localStorage.setItem(
      persistenceKey,
      JSON.stringify({ activeKeys, values }),
    );
  }, [activeKeys, hydratedKey, persistenceKey, values]);

  useEffect(() => {
    if (!addOpen && openFilter === null) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !filterMenuRef.current?.contains(target)) {
        setAddOpen(false);
        setOpenFilter(null);
        setOptionQuery("");
        setColumnQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAddOpen(false);
      setOpenFilter(null);
      setOptionQuery("");
      setColumnQuery("");
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addOpen, openFilter]);

  const applyDraftFilters = () => {
    const nextValues = { ...values };
    activeKeys.forEach((key) => {
      if (!draftKeys.includes(key)) delete nextValues[key];
    });
    onValuesChange(nextValues);
    onActiveKeysChange(draftKeys);
    setAddOpen(false);
  };

  const clearAllFilters = () => {
    onValuesChange({});
    onActiveKeysChange([]);
    setDraftKeys([]);
    setAddOpen(false);
    setOpenFilter(null);
    setOptionQuery("");
    setColumnQuery("");
    onClearFilters?.();
  };

  return (
    <div ref={filterMenuRef} data-system-add-filters="true" className="system-add-filters flex flex-shrink-0 flex-nowrap items-center gap-1">
      {showActiveFilters &&
        activeKeys.map((key) => {
          const column = columns.find((item) => item.key === key);
          if (!column) return null;
          const selectedValues = values[key] ?? [];
          const isOpen = openFilter === key;
          return (
            <div key={key} className="relative flex-shrink-0">
              <button
                type="button"
                aria-label={`Filter by ${column.label}`}
                aria-expanded={isOpen}
                onClick={() => {
                  setOpenFilter(isOpen ? null : key);
                  setAddOpen(false);
                  setOptionQuery("");
                }}
                className="flex h-7 max-w-[240px] items-center gap-1 rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#7288A3] hover:bg-[#DCE7F6]"
              >
                <span className="truncate whitespace-nowrap">
                  {column.label}
                  {selectedValues.length > 0 && (
                    <span className="text-[#10233A]">
                      : {selectedValues.join(", ")}
                    </span>
                  )}
                </span>
                {selectedValues.length > 0 ? (
                  <X
                    size={14}
                    className="flex-shrink-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onValuesChange({ ...values, [key]: [] });
                    }}
                  />
                ) : (
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              {isOpen && (
                <div className="absolute left-0 top-[32px] z-50 min-w-[230px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                  <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-[#F2F7FC] px-2">
                    <input autoFocus aria-label={`Search ${column.label} options`} value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#7288A3]" />
                    <Search size={14} className="flex-shrink-0 text-[#7288A3]" />
                  </label>
                  <button
                    type="button"
                    onClick={() => onValuesChange({ ...values, [key]: [] })}
                    className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-[#F2F7FC]"
                  >
                    <FilterCheck checked={selectedValues.length === 0} />
                    <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                      All
                    </span>
                  </button>
                  <div className="max-h-60 overflow-y-auto">
                    {column.options.filter((option) => option.toLocaleLowerCase().includes(optionQuery.trim().toLocaleLowerCase())).map((option) => {
                      const checked = selectedValues.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            const current = values[key] ?? [];
                            onValuesChange({
                              ...values,
                              [key]: checked
                                ? current.filter((value) => value !== option)
                                : [...current, option],
                            });
                          }}
                          className="flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[#F2F7FC]"
                        >
                          <FilterCheck checked={checked} />
                          <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                            {option}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      <div className="relative flex-shrink-0">
        <button
          type="button"
          aria-label="Add filters"
          aria-expanded={addOpen}
          onClick={() => {
            setAddOpen((current) => {
              if (!current) {
                setDraftKeys(activeKeys);
                setColumnQuery("");
              }
              return !current;
            });
            setOpenFilter(null);
          }}
          className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
        >
          <Plus size={15} />
          <span>Add filters</span>
        </button>
        {addOpen && (
          <div
            className="absolute left-0 top-[32px] z-50 min-w-[240px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !(event.target instanceof HTMLInputElement)) {
                event.preventDefault();
                applyDraftFilters();
              }
            }}
          >
            <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-[#F2F7FC] px-2">
              <input autoFocus aria-label="Search available filters" value={columnQuery} onChange={(event) => setColumnQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#7288A3]" />
              <Search size={14} className="flex-shrink-0 text-[#7288A3]" />
            </label>
            <div className="max-h-[300px] overflow-y-auto">
              {columns.filter((column) => column.label.toLocaleLowerCase().includes(columnQuery.trim().toLocaleLowerCase())).map((column) => {
                const checked = draftKeys.includes(column.key);
                return (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() =>
                      setDraftKeys((current) =>
                        checked
                          ? current.filter((key) => key !== column.key)
                          : [...current, column.key],
                      )
                    }
                    className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-[#F2F7FC]"
                  >
                    <FilterCheck checked={checked} />
                    <span className="font-montserrat text-[13px] font-medium text-[#10233A]">
                      {column.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[#E5EDF9] px-2 pt-2">
              <span className="font-montserrat text-[11px] text-[#7288A3]">
                Enter to apply
              </span>
              <button
                type="button"
                onClick={applyDraftFilters}
                className="h-8 rounded-md bg-[#007EA7] px-3 font-montserrat text-[12px] font-semibold text-white hover:bg-[#006D91]"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clearAllFilters}
        className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
      >
        <X size={15} />
        <span>Clear filters</span>
      </button>
    </div>
  );
}

function FilterCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={12} strokeWidth={2.5} className="text-white" />}
    </span>
  );
}
