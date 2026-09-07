import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import OcrSearchField from "./OcrSearchField";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import SystemAddFilters, { type SystemFilterColumn } from "./SystemAddFilters";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton, ImportDataButton } from "./ScopedActionButtons";
import RefreshAllButton from "./RefreshAllButton";
import { importMenuRecords } from "../lib/menuImport";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import {
  loadOcrFieldValidationRules,
  markOcrFieldValidationRulesDeleted,
  ocrConfidenceThreshold,
  saveOcrFieldValidationRules,
  type OcrFieldValidationLevel,
  type OcrFieldValidationRule,
} from "../lib/ocrFieldValidation";

const LEVELS: Array<{
  value: OcrFieldValidationLevel;
  label: string;
  dot: string;
  description: string;
}> = [
  { value: "red", label: "Red", dot: "#D92D20", description: "Mandatory MESO Worker review and processing." },
  { value: "yellow", label: "Yellow", dot: "#E6A700", description: "Stored for review and training; not sent to MESO Worker." },
  { value: "green", label: "Green", dot: "#12B886", description: "ADDINFO field; does not block processing." },
];

const WORKFLOW_STATUSES = [
  "Processing",
  "Accepted",
  "Rejected",
  "Provide additional data",
  "Exception",
];

const INITIAL_COLUMNS: ColConfig[] = [
  { key: "field", label: "Document field", width: 280, visible: true },
  { key: "type", label: "Type", width: 130, visible: true },
  { key: "trafficLight", label: "Traffic light", width: 210, visible: true },
  { key: "confidence", label: "Confidence threshold", width: 190, visible: true },
  { key: "rule", label: "Processing rule", width: 390, visible: true },
];

const SELECTION_COLUMN_WIDTH = 40;
const ACTION_COLUMN_WIDTH = 76;

type ValidationEditDraft = OcrFieldValidationRule & {
  description: string;
  confidenceThreshold: number;
};

export default function OcrFieldValidationSettings() {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [rules, setRules] = useState<OcrFieldValidationRule[]>(() => loadOcrFieldValidationRules());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState("");
  const [openTrafficLight, setOpenTrafficLight] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ValidationEditDraft | null>(null);
  const [editTrafficLightOpen, setEditTrafficLightOpen] = useState(false);
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [columns, setColumns] = useState<ColConfig[]>(INITIAL_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [selectedRuleKeys, setSelectedRuleKeys] = useState<Set<string>>(new Set());
  const [deleteRuleKeys, setDeleteRuleKeys] = useState<string[]>([]);
  const { startResize } = useColumnResize(columns, setColumns);
  const levelByValue = useMemo(() => new Map(LEVELS.map((level) => [level.value, level])), []);

  useEffect(() => {
    setColumns((current) => {
      const currentByKey = new Map(current.map((column) => [column.key, column]));
      const nextColumns = INITIAL_COLUMNS.map((column) => currentByKey.get(column.key) ?? column);
      const unchanged = nextColumns.length === current.length && nextColumns.every(
        (column, index) => column === current[index],
      );
      return unchanged ? current : nextColumns;
    });
  }, []);

  const descriptionFor = useCallback((rule: OcrFieldValidationRule) => {
    const level = levelByValue.get(rule.level) ?? LEVELS[0];
    return rule.description?.trim() || level.description;
  }, [levelByValue]);

  const filterColumns = useMemo<SystemFilterColumn[]>(() => [
    { key: "field", label: "Document field", options: Array.from(new Set(rules.map((rule) => rule.label))) },
    { key: "type", label: "Type", options: Array.from(new Set(rules.map((rule) => rule.type))) },
    { key: "trafficLight", label: "Traffic light", options: LEVELS.map((level) => level.label) },
    { key: "confidence", label: "Confidence threshold", options: Array.from(new Set(rules.map((rule) => `${ocrConfidenceThreshold(rule)}%`))) },
    { key: "rule", label: "Processing rule", options: Array.from(new Set(rules.map(descriptionFor))) },
  ], [descriptionFor, rules]);

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return rules.filter((rule) => {
      const level = levelByValue.get(rule.level) ?? LEVELS[0];
      const description = descriptionFor(rule);
      const matchesSearch = !normalizedQuery || `${rule.label} ${rule.type} ${level.label} ${description}`.toLocaleLowerCase().includes(normalizedQuery);
      const valuesByColumn: Record<string, string> = {
        field: rule.label,
        type: rule.type,
        trafficLight: level.label,
        confidence: `${ocrConfidenceThreshold(rule)}%`,
        rule: description,
      };
      const matchesFilters = activeFilterKeys.every((key) => {
        const selectedValues = filterValues[key] ?? [];
        return selectedValues.length === 0 || selectedValues.includes(valuesByColumn[key]);
      });
      return matchesSearch && matchesFilters;
    });
  }, [activeFilterKeys, descriptionFor, filterValues, levelByValue, query, rules]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filteredRules, (rule, key) => {
    const level = levelByValue.get(rule.level) ?? LEVELS[0];
    if (key === "field") return rule.label;
    if (key === "type") return rule.type;
    if (key === "trafficLight") return level.label;
    if (key === "confidence") return ocrConfidenceThreshold(rule);
    if (key === "rule") return descriptionFor(rule);
    return "";
  });

  const pageSize = showAll ? Math.max(1, sortedRows.length) : 14;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayedRules = showAll ? sortedRows : sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleColumns = columns.filter((column) => column.visible);
  const tableWidth = visibleColumns.reduce(
    (total, column) => total + column.width,
    SELECTION_COLUMN_WIDTH + ACTION_COLUMN_WIDTH,
  );
  const columnWidth = (key: string) => columns.find((column) => column.key === key)?.width ?? 120;

  const setLevel = (key: string, level: OcrFieldValidationLevel) => {
    const description = LEVELS.find((option) => option.value === level)?.description;
    const nextRules = rules.map((rule) => rule.key === key ? { ...rule, level, description } : rule);
    setRules(nextRules);
    saveOcrFieldValidationRules(nextRules);
    setNotice("Field validation setting saved.");
  };

  const openEditor = (rule: OcrFieldValidationRule) => {
    setOpenTrafficLight(null);
    setEditTrafficLightOpen(false);
    setEditDraft({
      ...rule,
      description: descriptionFor(rule),
      confidenceThreshold: ocrConfidenceThreshold(rule),
    });
  };

  const saveEditedRule = () => {
    if (!editDraft || !editDraft.label.trim() || !editDraft.type.trim()) return;
    const nextRules = rules.map((rule) => rule.key === editDraft.key
      ? {
          ...rule,
          label: editDraft.label.trim(),
          type: editDraft.type.trim(),
          level: editDraft.level,
          description: editDraft.description.trim(),
          confidenceThreshold: Math.min(100, Math.max(0, Math.round(editDraft.confidenceThreshold))),
        }
      : rule);
    setRules(nextRules);
    saveOcrFieldValidationRules(nextRules);
    setNotice("OCR validation setting saved.");
    setEditDraft(null);
    setEditTrafficLightOpen(false);
  };

  const refreshRules = () => {
    setRules(loadOcrFieldValidationRules());
    setSelectedRuleKeys(new Set());
    setPage(1);
    setNotice("OCR validation settings refreshed.");
  };

  const importRules = () => {
    const count = importMenuRecords("ocr-human-task-types", rules.map((rule) => rule.key));
    setNotice(`${count} OCR validation setting${count === 1 ? "" : "s"} imported.`);
  };

  const confirmDeleteRules = () => {
    if (deleteRuleKeys.length === 0) return;
    const deletedKeys = new Set(deleteRuleKeys);
    const nextRules = rules.filter((rule) => !deletedKeys.has(rule.key));
    setRules(nextRules);
    saveOcrFieldValidationRules(nextRules);
    markOcrFieldValidationRulesDeleted(deleteRuleKeys);
    setSelectedRuleKeys((current) => new Set([...current].filter((key) => !deletedKeys.has(key))));
    setDeleteRuleKeys([]);
    setPage(1);
    setNotice(`${deletedKeys.size} OCR validation setting${deletedKeys.size === 1 ? "" : "s"} deleted.`);
  };

  const toggleRuleSelection = (key: string) => {
    setSelectedRuleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleRuleKeys = displayedRules.map((rule) => rule.key);
  const allVisibleSelected = visibleRuleKeys.length > 0 && visibleRuleKeys.every((key) => selectedRuleKeys.has(key));

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-8 font-montserrat" aria-label="OCR field validation">
      <div className="system-table-toolbar flex h-7 min-h-7 flex-nowrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
          <OcrSearchField ariaLabel="Search OCR Validation Settings" value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
          <SystemAddFilters
            columns={filterColumns}
            activeKeys={activeFilterKeys}
            values={filterValues}
            onActiveKeysChange={(keys) => { setActiveFilterKeys(keys); setPage(1); }}
            onValuesChange={(values) => { setFilterValues(values); setPage(1); }}
            persistenceKey="finansu-harmonija-v12-ocr-human-task-types-filters"
          />
        </div>
        <div className="ml-auto flex h-7 items-center gap-4">
          <button
            type="button"
            aria-label="DELETE ALL"
            title="DELETE ALL"
            disabled={selectedRuleKeys.size === 0}
            onClick={() => setDeleteRuleKeys([...selectedRuleKeys])}
            className="flex h-4 w-4 items-center justify-center text-[#7288A3] transition-colors hover:text-[#FF6200] disabled:cursor-not-allowed disabled:text-[#B4B6B8]"
          >
            <Trash2 size={16} />
          </button>
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <ImportDataButton onClick={importRules} disabled={rules.length === 0} />
          <RefreshAllButton onRefresh={refreshRules} />
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-3">
        {LEVELS.map((level) => (
          <div key={level.value} className="flex min-h-10 items-center gap-2 rounded-lg bg-[#F8FDFF] px-3 py-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: level.dot }} />
            <span className="flex-shrink-0 text-[12px] font-medium text-[#10233A]">{level.label}</span>
            <span className="min-w-0 text-[12px] font-normal leading-4 text-[#7288A3]">{level.description}</span>
          </div>
        ))}
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: tableWidth }}>
          <div className="mb-3 flex h-9 items-center font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]">
            <div data-table-header-select="true" style={{ width: SELECTION_COLUMN_WIDTH }} className="flex flex-shrink-0 items-center justify-center">
              <button
                type="button"
                aria-label="Select all OCR validation settings"
                onClick={() => setSelectedRuleKeys((current) => {
                  const next = new Set(current);
                  if (allVisibleSelected) visibleRuleKeys.forEach((key) => next.delete(key));
                  else visibleRuleKeys.forEach((key) => next.add(key));
                  return next;
                })}
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${allVisibleSelected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
              >
                {allVisibleSelected && <Check size={12} strokeWidth={2.5} className="text-white" />}
              </button>
            </div>
            {visibleColumns.map((column, visibleIndex) => {
              const columnIndex = columns.findIndex((item) => item.key === column.key);
              return (
              <div
                key={column.key}
                style={{ width: column.width }}
                className={`relative flex h-9 flex-shrink-0 items-center gap-1 px-3 leading-[18px] ${visibleIndex ? "border-l border-[#D3E1EC]" : ""}`}
              >
                <span className="min-w-0 whitespace-normal">{column.label}</span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key)}
                  onDirectionChange={(direction) => { changeSort(column.key, direction); setPage(1); }}
                />
                <ResizeHandle onMouseDown={(event) => startResize(columnIndex, event)} />
              </div>
              );
            })}
            <div aria-hidden="true" style={{ width: ACTION_COLUMN_WIDTH }} className="sticky right-0 z-20 h-9 flex-shrink-0 bg-white" />
          </div>

          <div className="flex flex-col gap-0.5">
            {displayedRules.map((rule, index) => {
              const level = levelByValue.get(rule.level) ?? LEVELS[0];
              const description = descriptionFor(rule);
              return (
                <div key={rule.key} className={`group flex min-h-10 items-center rounded-lg font-montserrat text-[12px] font-normal text-[#10233A] ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}>
                  <div style={{ width: SELECTION_COLUMN_WIDTH }} className="flex flex-shrink-0 items-center justify-center">
                    <button
                      type="button"
                      aria-label={`Select ${rule.label}`}
                      onClick={() => toggleRuleSelection(rule.key)}
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${selectedRuleKeys.has(rule.key) ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {selectedRuleKeys.has(rule.key) && <Check size={12} strokeWidth={2.5} className="text-white" />}
                    </button>
                  </div>
                  {visibleColumns.some((column) => column.key === "field") && <div style={{ width: columnWidth("field") }} className="flex-shrink-0 overflow-hidden px-3"><span className="block truncate">{rule.label}</span></div>}
                  {visibleColumns.some((column) => column.key === "type") && <div style={{ width: columnWidth("type") }} className="flex-shrink-0 overflow-hidden px-3"><span className="block truncate">{rule.type}</span></div>}
                  {visibleColumns.some((column) => column.key === "trafficLight") && <div style={{ width: columnWidth("trafficLight") }} className="relative flex-shrink-0 px-3 py-1">
                    <button
                      type="button"
                      aria-label={`${rule.label} traffic light`}
                      aria-expanded={openTrafficLight === rule.key}
                      onClick={() => setOpenTrafficLight((current) => current === rule.key ? null : rule.key)}
                      className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden bg-transparent p-0 text-left font-montserrat text-[12px] font-normal text-[#10233A] outline-none hover:text-[#007EA7]"
                    >
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: level.dot }} />
                      <span className="min-w-0 flex-1 truncate">{level.label}</span>
                      <ChevronDown size={15} className="ml-auto flex-shrink-0 text-[#7288A3]" />
                    </button>
                    {openTrafficLight === rule.key && (
                      <div
                        role="listbox"
                        aria-label={`${rule.label} traffic light options`}
                        className={`absolute left-3 z-50 w-[190px] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)] ${index >= displayedRules.length - 3 ? "bottom-9" : "top-9"}`}
                      >
                        {LEVELS.map((option) => {
                          const selected = option.value === rule.level;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => { setLevel(rule.key, option.value); setOpenTrafficLight(null); }}
                              className={`flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${selected ? "bg-[#E5EDF9]" : "hover:bg-[#F2F7FC]"}`}
                            >
                              <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>
                                {selected && <Check size={12} strokeWidth={2.5} className="text-white" />}
                              </span>
                              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: option.dot }} />
                              <span className="font-montserrat text-[12px] font-normal text-[#10233A]">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>}
                  {visibleColumns.some((column) => column.key === "confidence") && <div style={{ width: columnWidth("confidence") }} className="flex flex-shrink-0 items-center px-3">
                    <span>{ocrConfidenceThreshold(rule)}%</span>
                  </div>}
                  {visibleColumns.some((column) => column.key === "rule") && <div style={{ width: columnWidth("rule") }} className="flex-shrink-0 overflow-hidden px-3"><span className="block truncate" title={description}>{description}</span></div>}
                  <div style={{ width: ACTION_COLUMN_WIDTH }} className={`sticky right-0 z-10 flex min-h-10 flex-shrink-0 items-center justify-end gap-2 border-l border-[#E5EDF9] px-2 ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} group-hover:bg-[#E7F4F9]`}>
                    <button
                      type="button"
                      title="EDIT"
                      aria-label={`EDIT ${rule.label}`}
                      onClick={() => openEditor(rule)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="DELETE"
                      aria-label={`DELETE ${rule.label}`}
                      onClick={() => setDeleteRuleKeys([rule.key])}
                      className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#FF6200] hover:text-[#FF6200]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={safePage}
        totalPages={totalPages}
        itemCount={sortedRows.length}
        itemsPerPage={pageSize}
        onPageChange={setPage}
        onShowMore={() => { setShowAll((current) => !current); setPage(1); }}
        showMoreLabel={showAll ? "Default" : "Show more"}
        allItemsVisible={showAll}
      />

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={INITIAL_COLUMNS}
          onSave={(nextColumns) => {
            setColumns(nextColumns);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-montserrat text-[12px] font-semibold text-[#7288A3]">Workflow statuses:</span>
        {WORKFLOW_STATUSES.map((status) => <span key={status} className="rounded-full bg-[#F2F7FC] px-3 py-1 font-montserrat text-[12px] font-medium text-[#10233A]">{status}</span>)}
      </div>
      {notice && <div role="status" className="fixed bottom-6 right-6 z-[240] rounded-lg bg-[#E7F7EF] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#237A50] shadow-lg">{notice}</div>}

      {deleteRuleKeys.length > 0 && (
        <div className="fixed inset-0 z-[220] flex justify-end bg-[#10233A]/10" onMouseDown={() => setDeleteRuleKeys([])}>
          <aside role="dialog" aria-modal="true" aria-label="Delete OCR validation settings" className="flex h-full w-[340px] max-w-full flex-col bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Delete OCR validation setting{deleteRuleKeys.length === 1 ? "" : "s"}</h2>
              <button type="button" aria-label="Close delete OCR validation settings" onClick={() => setDeleteRuleKeys([])} className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={22} /></button>
            </div>
            <p className="mt-6 font-montserrat text-[13px] font-medium leading-5 text-[#10233A]">
              Are you sure you want to delete {deleteRuleKeys.length === 1 ? "this OCR validation setting" : `${deleteRuleKeys.length} selected OCR validation settings`}?
            </p>
            <p className="mt-2 font-montserrat text-[11px] font-medium leading-4 text-[#7288A3]">Deleted validation settings will no longer be applied to OCR documents.</p>
            <div className="mt-auto flex gap-4 border-t border-[#E5EDF9] pt-5">
              <button type="button" onClick={() => setDeleteRuleKeys([])} className="flex h-[42px] flex-1 items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#A1B6C6]">Cancel</button>
              <button type="button" onClick={confirmDeleteRules} className="flex h-[42px] flex-1 items-center justify-center rounded-lg bg-[#FF6200] px-4 font-montserrat text-[14px] font-semibold text-white hover:bg-[#E55700]">Delete</button>
            </div>
          </aside>
        </div>
      )}

      {editDraft && (
        <div className="fixed inset-0 z-[210] flex justify-end bg-[#10233A]/10" onMouseDown={() => setEditDraft(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editDraft.label}`}
            className="flex h-full w-[420px] max-w-full flex-col bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Edit OCR validation setting</h2>
                <p className="mt-1 font-montserrat text-[12px] font-medium text-[#7288A3]">Update the record and its OCR validation rule.</p>
              </div>
              <button type="button" aria-label="Close edit OCR validation setting" onClick={() => setEditDraft(null)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-[#7288A3] hover:text-[#007EA7]">
                <X size={22} />
              </button>
            </div>

            <div className="mt-8 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
              <label className="flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                <span>Document field <span className="text-[#D92D20]">*</span></span>
                <input value={editDraft.label} onChange={(event) => setEditDraft((current) => current ? { ...current, label: event.target.value } : current)} className="h-10 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
              </label>
              <label className="flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                <span>Type <span className="text-[#D92D20]">*</span></span>
                <input value={editDraft.type} onChange={(event) => setEditDraft((current) => current ? { ...current, type: event.target.value } : current)} className="h-10 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium text-[#10233A] outline-none focus:border-[#007EA7]" />
              </label>

              <div className="relative flex flex-col gap-2">
                <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">Traffic light</span>
                <button type="button" aria-haspopup="listbox" aria-expanded={editTrafficLightOpen} onClick={() => setEditTrafficLightOpen((current) => !current)} className="flex h-10 w-full items-center gap-3 rounded-lg border border-[#D3E1EC] bg-white px-3 text-left outline-none hover:border-[#007EA7]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: levelByValue.get(editDraft.level)?.dot }} />
                  <span className="min-w-0 flex-1 font-montserrat text-[13px] font-medium text-[#10233A]">{levelByValue.get(editDraft.level)?.label}</span>
                  <ChevronDown size={16} className={`text-[#7288A3] transition-transform ${editTrafficLightOpen ? "rotate-180" : ""}`} />
                </button>
                {editTrafficLightOpen && (
                  <div role="listbox" aria-label="Edit traffic light options" className="absolute left-0 right-0 top-[66px] z-10 rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]">
                    {LEVELS.map((option) => (
                      <button key={option.value} type="button" role="option" aria-selected={editDraft.level === option.value} onClick={() => { setEditDraft((current) => current ? { ...current, level: option.value, description: option.description } : current); setEditTrafficLightOpen(false); }} className={`flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${editDraft.level === option.value ? "bg-[#E5EDF9]" : "hover:bg-[#F2F7FC]"}`}>
                        <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${editDraft.level === option.value ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>{editDraft.level === option.value && <Check size={12} className="text-white" />}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.dot }} />
                        <span className="font-montserrat text-[12px] font-medium text-[#10233A]">{option.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                <span>Confidence threshold <span className="text-[#D92D20]">*</span></span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={editDraft.confidenceThreshold}
                    onChange={(event) => setEditDraft((current) => current ? {
                      ...current,
                      confidenceThreshold: Math.min(100, Math.max(0, Number(event.target.value))),
                    } : current)}
                    className="h-10 w-full rounded-lg border border-[#D3E1EC] px-3 pr-9 font-montserrat text-[13px] font-medium text-[#10233A] outline-none [appearance:textfield] focus:border-[#007EA7] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-montserrat text-[13px] font-semibold text-[#7288A3]">%</span>
                </div>
                <span className="font-montserrat text-[11px] font-medium leading-4 text-[#7288A3]">
                  {editDraft.level === "red"
                    ? `Below ${editDraft.confidenceThreshold}% → MESO Worker review. ${editDraft.confidenceThreshold}% or higher → Trusted.`
                    : editDraft.level === "yellow"
                      ? `Below ${editDraft.confidenceThreshold}% → Flagged for review and training; not sent to MESO Worker.`
                      : `ADDINFO field. Confidence below ${editDraft.confidenceThreshold}% does not block processing.`}
                </span>
              </label>

              <label className="flex flex-col gap-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                Processing rule
                <textarea value={editDraft.description} onChange={(event) => setEditDraft((current) => current ? { ...current, description: event.target.value } : current)} rows={5} className="resize-none rounded-lg border border-[#D3E1EC] px-3 py-2 font-montserrat text-[13px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#E5EDF9] pt-5">
              <button type="button" onClick={() => setEditDraft(null)} className="h-10 rounded-lg border-2 border-[#D3E1EC] bg-white px-5 font-montserrat text-[14px] font-semibold text-[#7288A3] hover:border-[#007EA7]">Cancel</button>
              <button type="button" disabled={!editDraft.label.trim() || !editDraft.type.trim()} onClick={saveEditedRule} className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Save</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
