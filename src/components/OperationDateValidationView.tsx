import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { supabase, type Company } from "../lib/supabase";
import { PageActionButton, PageHeader } from "./PageHeader";
import OcrSearchField from "./OcrSearchField";
import SystemAddFilters from "./SystemAddFilters";
import RefreshAllButton from "./RefreshAllButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { BulkDeleteButton } from "./DeleteButtons";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import { usePersistentState } from "../hooks/usePersistentState";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";

export type OperationDateValidationRule = {
  enabled: boolean;
  cutoffDay: number;
  manualAdjustmentAllowed: boolean;
};

type OperationDateTemplate = OperationDateValidationRule & {
  id: string;
  name: string;
};

type TemplateDraft = {
  id: string;
  name: string;
  enabled: boolean;
  cutoffDay: number;
  manualAdjustmentAllowed: boolean;
  organizationIds: string[];
};

const LEGACY_STORAGE_PREFIX = "finansu-harmonija:v12:operation-date-validation:";
const TEMPLATES_STORAGE_KEY = `${LEGACY_STORAGE_PREFIX}templates`;
const ASSIGNMENTS_STORAGE_KEY = `${LEGACY_STORAGE_PREFIX}assignments`;
const DEFAULT_RULE: OperationDateValidationRule = {
  enabled: true,
  cutoffDay: 25,
  manualAdjustmentAllowed: true,
};
const DEFAULT_TEMPLATES: OperationDateTemplate[] = [
  { id: "operation-date-standard", name: "Standard monthly cutoff", enabled: true, cutoffDay: 25, manualAdjustmentAllowed: true },
  { id: "operation-date-early", name: "Early monthly cutoff", enabled: true, cutoffDay: 20, manualAdjustmentAllowed: true },
  { id: "operation-date-month-end", name: "Month-end cutoff", enabled: true, cutoffDay: 31, manualAdjustmentAllowed: true },
];
const DEFAULT_COLUMNS: ColConfig[] = [
  { key: "name", label: "Template name", width: 260, visible: true },
  { key: "cutoffDay", label: "Deadline day", width: 130, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
  { key: "manualAdjustment", label: "Manual adjustment", width: 180, visible: true },
  { key: "assignedOrganizations", label: "Assigned organizations", width: 190, visible: true },
];

function loadTemplates(): OperationDateTemplate[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TEMPLATES_STORAGE_KEY) || "null");
    return Array.isArray(parsed) ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function loadAssignments(): Record<string, string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ASSIGNMENTS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveConfiguration(
  templates: OperationDateTemplate[],
  assignments: Record<string, string>,
) {
  window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  window.localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
  window.dispatchEvent(new CustomEvent("operation-date-validation-updated"));
}

export function loadOperationDateValidationRule(companyId: string): OperationDateValidationRule {
  if (!companyId) return DEFAULT_RULE;
  const templateId = loadAssignments()[companyId];
  const template = loadTemplates().find((item) => item.id === templateId);
  if (template) {
    return {
      enabled: template.enabled,
      cutoffDay: template.cutoffDay,
      manualAdjustmentAllowed: template.manualAdjustmentAllowed ?? true,
    };
  }

  try {
    const legacy = JSON.parse(
      window.localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${companyId}`) || "null",
    ) as Partial<OperationDateValidationRule> | null;
    return legacy
      ? {
          enabled: legacy.enabled ?? true,
          cutoffDay: legacy.cutoffDay ?? 25,
          manualAdjustmentAllowed: legacy.manualAdjustmentAllowed ?? true,
        }
      : DEFAULT_RULE;
  } catch {
    return DEFAULT_RULE;
  }
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function periodValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateValue(date: Date) {
  return `${periodValue(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

export function resolveOperationDate({
  companyId,
  documentDate,
  submittedDate,
}: {
  companyId: string;
  documentDate: string;
  submittedDate?: string;
}) {
  const rule = loadOperationDateValidationRule(companyId);
  if (!rule.enabled || !documentDate) return null;
  const sourceDate = new Date(`${documentDate}T12:00:00`);
  if (Number.isNaN(sourceDate.getTime())) return null;
  const received = submittedDate ? new Date(`${submittedDate}T12:00:00`) : new Date();
  const safeReceived = Number.isNaN(received.getTime()) ? new Date() : received;
  const afterDeadline = safeReceived.getDate() > rule.cutoffDay;
  const accountingDate = afterDeadline ? nextMonth(sourceDate) : sourceDate;
  const period = periodValue(accountingDate);

  return {
    operationDate: afterDeadline ? dateValue(accountingDate) : documentDate,
    period,
    message: afterDeadline
      ? `Submitted after day ${rule.cutoffDay}; registered in the next accounting period.`
      : `Submitted by day ${rule.cutoffDay}; registered in the document accounting period.`,
    warning: afterDeadline,
    requiresApproval: false,
    manualAdjustmentAllowed: rule.manualAdjustmentAllowed,
  };
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-[#007EA7]" : "bg-[#D3E1EC]"}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function SelectionCheckbox({
  checked,
  mixed = false,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label={label}
      aria-checked={mixed ? "mixed" : checked}
      onClick={onChange}
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors ${checked || mixed ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {(checked || mixed) && <Check size={12} strokeWidth={2.5} className="text-white" />}
    </button>
  );
}

export default function OperationDateValidationView() {
  const [organizations, setOrganizations] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<OperationDateTemplate[]>(loadTemplates);
  const [assignments, setAssignments] = useState<Record<string, string>>(loadAssignments);
  const [search, setSearch] = useState("");
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [columns, setColumns] = usePersistentState<ColConfig[]>(
    "finansu-harmonija:v12:operation-date-validation:columns",
    DEFAULT_COLUMNS,
  );
  const [showColumns, setShowColumns] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [error, setError] = useState("");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  useEffect(() => {
    let active = true;
    void supabase.from("companies").select("*").order("name").then(({ data }) => {
      if (!active) return;
      const records = ((data ?? []) as unknown as Company[]).filter(
        (company) => (company.company_status ?? "Active").toLowerCase() === "active",
      );
      setOrganizations(records);

      const nextTemplates = [...loadTemplates()];
      const nextAssignments = { ...loadAssignments() };
      let migrated = false;
      records.forEach((company) => {
        if (nextAssignments[company.id]) return;
        try {
          const legacy = JSON.parse(
            window.localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${company.id}`) || "null",
          ) as Partial<OperationDateValidationRule> | null;
          if (!legacy) return;
          const id = `operation-date-${company.id}`;
          if (!nextTemplates.some((item) => item.id === id)) {
            nextTemplates.push({
              id,
              name: `${company.name} rules`,
              enabled: legacy.enabled ?? true,
              cutoffDay: legacy.cutoffDay ?? 25,
              manualAdjustmentAllowed: legacy.manualAdjustmentAllowed ?? true,
            });
          }
          nextAssignments[company.id] = id;
          migrated = true;
        } catch {
          // Invalid legacy settings remain ignored and use the default rule.
        }
      });
      if (migrated) saveConfiguration(nextTemplates, nextAssignments);
      setTemplates(nextTemplates);
      setAssignments(nextAssignments);
    });
    return () => { active = false; };
  }, []);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      if (query && !template.name.toLocaleLowerCase().includes(query)) return false;
      const statusValues = filterValues.status ?? [];
      const manualValues = filterValues.manualAdjustment ?? [];
      const status = template.enabled ? "Enabled" : "Disabled";
      const manual = template.manualAdjustmentAllowed ?? true ? "Allowed" : "Not allowed";
      if (activeFilterKeys.includes("status") && statusValues.length > 0 && !statusValues.includes(status)) return false;
      if (activeFilterKeys.includes("manualAdjustment") && manualValues.length > 0 && !manualValues.includes(manual)) return false;
      return true;
    });
  }, [activeFilterKeys, filterValues, search, templates]);
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible),
    [columns],
  );
  const templateSorter = useMultiColumnSort<OperationDateTemplate, string>(
    visibleTemplates,
    (template, key) =>
      key === "name" ? template.name
        : key === "cutoffDay" ? template.cutoffDay
        : key === "status" ? (template.enabled ? "Enabled" : "Disabled")
        : key === "manualAdjustment" ? (template.manualAdjustmentAllowed ?? true ? "Allowed" : "Not allowed")
        : Object.values(assignments).filter((id) => id === template.id).length,
  );
  const displayedTemplates = templateSorter.sortedRows;
  const tableGridTemplate = `42px ${visibleColumns.map((column) => `${column.width}px`).join(" ")} 96px`;
  const tableWidth = visibleColumns.reduce((total, column) => total + column.width, 0) + 138;
  const allVisibleSelected = visibleTemplates.length > 0 && visibleTemplates.every((template) => selectedTemplateIds.has(template.id));
  const someVisibleSelected = visibleTemplates.some((template) => selectedTemplateIds.has(template.id)) && !allVisibleSelected;

  const openCreate = () => {
    setError("");
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      enabled: true,
      cutoffDay: 25,
      manualAdjustmentAllowed: true,
      organizationIds: [],
    });
  };

  const openEdit = (template: OperationDateTemplate) => {
    setError("");
    setDraft({
      ...template,
      organizationIds: Object.entries(assignments)
        .filter(([, templateId]) => templateId === template.id)
        .map(([organizationId]) => organizationId),
    });
  };

  const saveDraft = () => {
    if (!draft?.name.trim()) {
      setError("Template name is required.");
      return;
    }
    const normalizedName = draft.name.trim().toLocaleLowerCase();
    if (templates.some((item) => item.id !== draft.id && item.name.trim().toLocaleLowerCase() === normalizedName)) {
      setError("A template with this name already exists.");
      return;
    }
    const template: OperationDateTemplate = {
      id: draft.id,
      name: draft.name.trim(),
      enabled: draft.enabled,
      cutoffDay: Math.min(31, Math.max(1, draft.cutoffDay || 1)),
      manualAdjustmentAllowed: draft.manualAdjustmentAllowed,
    };
    const nextTemplates = templates.some((item) => item.id === template.id)
      ? templates.map((item) => (item.id === template.id ? template : item))
      : [...templates, template];
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).filter(([, templateId]) => templateId !== template.id),
    );
    draft.organizationIds.forEach((organizationId) => {
      nextAssignments[organizationId] = template.id;
    });
    setTemplates(nextTemplates);
    setAssignments(nextAssignments);
    saveConfiguration(nextTemplates, nextAssignments);
    setDraft(null);
  };

  const deleteTemplate = (templateId: string) => {
    const nextTemplates = templates.filter((item) => item.id !== templateId);
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).filter(([, assignedTemplateId]) => assignedTemplateId !== templateId),
    );
    setTemplates(nextTemplates);
    setAssignments(nextAssignments);
    setSelectedTemplateIds((current) => {
      const next = new Set(current);
      next.delete(templateId);
      return next;
    });
    saveConfiguration(nextTemplates, nextAssignments);
  };

  const deleteSelectedTemplates = () => {
    if (selectedTemplateIds.size === 0) return;
    const nextTemplates = templates.filter((template) => !selectedTemplateIds.has(template.id));
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).filter(([, templateId]) => !selectedTemplateIds.has(templateId)),
    );
    setTemplates(nextTemplates);
    setAssignments(nextAssignments);
    setSelectedTemplateIds(new Set());
    saveConfiguration(nextTemplates, nextAssignments);
  };

  const toggleOrganization = (organizationId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      organizationIds: draft.organizationIds.includes(organizationId)
        ? draft.organizationIds.filter((id) => id !== organizationId)
        : [...draft.organizationIds, organizationId],
    });
  };

  return (
    <div className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="Operation date validation"
        actions={templates.length > 0 ? <PageActionButton onClick={openCreate}>Create new</PageActionButton> : undefined}
      />

      <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
        <span>Settings</span><span className="text-[#A1B6C6]">/</span><span>Organizations</span><span className="text-[#A1B6C6]">/</span><span className="text-[#A1B6C6]">Operation date validation</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField ariaLabel="Search operation date validation templates" value={search} onChange={setSearch} />
          <SystemAddFilters
            persistenceKey="finansu-harmonija:v12:filters:operation-date-validation"
            columns={[
              { key: "status", label: "Status", options: ["Enabled", "Disabled"] },
              { key: "manualAdjustment", label: "Manual adjustment", options: ["Allowed", "Not allowed"] },
            ]}
            activeKeys={activeFilterKeys}
            values={filterValues}
            onActiveKeysChange={setActiveFilterKeys}
            onValuesChange={setFilterValues}
          />
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selectedTemplateIds.size}
            label="DELETE ALL selected operation date validation templates"
            onDelete={deleteSelectedTemplates}
          />
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton onRefresh={() => setTemplates((current) => [...current])} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: tableWidth }}>
            <div style={{ gridTemplateColumns: tableGridTemplate }} className="system-table-header-row mb-3 grid h-6 items-center font-montserrat text-[12px] font-medium text-[#10233A]">
              <div data-table-header-select="true" className="flex self-start px-3">
                <SelectionCheckbox
                  checked={allVisibleSelected}
                  mixed={someVisibleSelected}
                  label="Select all operation date validation templates"
                  onChange={() => {
                    setSelectedTemplateIds((current) => {
                      const next = new Set(current);
                      if (allVisibleSelected) {
                        visibleTemplates.forEach((template) => next.delete(template.id));
                      } else {
                        visibleTemplates.forEach((template) => next.add(template.id));
                      }
                      return next;
                    });
                  }}
                />
              </div>
              {visibleColumns.map((column) => {
                const realIndex = columns.findIndex((item) => item.key === column.key);
                return (
                  <div key={column.key} className="relative flex h-6 items-center gap-1 border-l border-[#D3E1EC] px-3">
                    <span className="min-w-0 whitespace-normal leading-[15px]">{column.label}</span>
                    <ColumnSortButton
                      columnLabel={column.label}
                      direction={templateSorter.directionFor(column.key)}
                      onDirectionChange={(direction) => templateSorter.changeSort(column.key, direction)}
                    />
                    <ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} />
                  </div>
                );
              })}
              <span />
            </div>
            <div className="flex flex-col gap-0.5">
            {displayedTemplates.map((template) => {
              const assignedCount = Object.values(assignments).filter((id) => id === template.id).length;
              return (
                <div key={template.id} style={{ gridTemplateColumns: tableGridTemplate }} className="grid h-10 items-center rounded-lg font-montserrat text-[12px] font-normal text-[#10233A] odd:bg-[#F8FDFF] hover:bg-[#E7F4F9]">
                  <div className="flex px-3">
                    <SelectionCheckbox
                      checked={selectedTemplateIds.has(template.id)}
                      label={`Select ${template.name}`}
                      onChange={() => {
                        setSelectedTemplateIds((current) => {
                          const next = new Set(current);
                          if (next.has(template.id)) next.delete(template.id);
                          else next.add(template.id);
                          return next;
                        });
                      }}
                    />
                  </div>
                  {visibleColumns.map((column) => (
                    <div key={column.key} className="min-w-0 overflow-hidden px-3">
                      <span className="block truncate">
                        {column.key === "name" ? template.name
                          : column.key === "cutoffDay" ? template.cutoffDay
                          : column.key === "status" ? (template.enabled ? "Enabled" : "Disabled")
                          : column.key === "manualAdjustment" ? (template.manualAdjustmentAllowed ?? true ? "Allowed" : "Not allowed")
                          : assignedCount}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-2 px-2">
                    <button type="button" aria-label={`EDIT ${template.name}`} onClick={() => openEdit(template)} className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Pencil size={14} /></button>
                    <button type="button" aria-label={`DELETE ${template.name}`} onClick={() => deleteTemplate(template.id)} className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#FF6200] hover:text-[#FF6200]"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
            {visibleTemplates.length === 0 && (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 font-montserrat text-[13px] text-[#7288A3]">
                <span>{templates.length ? "No templates match your search." : "No operation date validation templates."}</span>
                {!templates.length && <PageActionButton onClick={openCreate}>Create new</PageActionButton>}
              </div>
            )}
            </div>
          </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <div className="flex flex-shrink-0">
        <TablePagination currentPage={1} totalPages={1} itemCount={visibleTemplates.length} onPageChange={() => undefined} />
      </div>

      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={DEFAULT_COLUMNS}
          onSave={(nextColumns) => {
            setColumns(nextColumns);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}

      {draft && (
        <div className="fixed inset-0 z-[200] flex justify-end" onClick={() => setDraft(null)}>
          <aside className="flex h-full w-[520px] flex-col bg-white shadow-[-2px_0_0_#E5EDF9]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#D3E1EC] px-6 py-5">
              <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">{templates.some((item) => item.id === draft.id) ? "Edit template" : "New template"}</h2>
              <button type="button" aria-label="Close template" onClick={() => setDraft(null)} className="text-[#7288A3] hover:text-[#10233A]"><X size={24} /></button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 font-montserrat">
              <label className="flex flex-col gap-2 text-[12px] font-semibold text-[#10233A]">
                <span>Template name<span className="text-[#D90310]">*</span></span>
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-10 rounded-lg border border-[#D3E1EC] px-3 text-[13px] font-medium outline-none focus:border-[#007EA7]" placeholder="Enter template name" />
              </label>

              <div className="flex items-center justify-between rounded-lg border border-[#D3E1EC] px-4 py-3">
                <div><p className="text-[12px] font-semibold text-[#10233A]">Validation enabled</p><p className="mt-1 text-[11px] text-[#7288A3]">Apply this template to assigned organizations.</p></div>
                <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
              </div>

              <label className="flex flex-col gap-2 text-[12px] font-semibold text-[#10233A]">
                <span>Submission deadline day<span className="text-[#D90310]">*</span></span>
                <input type="number" min={1} max={31} value={draft.cutoffDay} onChange={(event) => setDraft({ ...draft, cutoffDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })} className="h-10 w-28 rounded-lg border border-[#D3E1EC] px-3 text-[13px] font-medium outline-none focus:border-[#007EA7]" />
                <span className="text-[11px] font-medium text-[#7288A3]">Documents submitted by this day remain in the same accounting period.</span>
              </label>

              <div className="flex items-center justify-between rounded-lg border border-[#D3E1EC] px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#10233A]">Allow manual period adjustment</p>
                  <p className="mt-1 text-[11px] text-[#7288A3]">Allow the calculated operation date to be moved manually to any accounting period.</p>
                </div>
                <Toggle checked={draft.manualAdjustmentAllowed} onChange={(manualAdjustmentAllowed) => setDraft({ ...draft, manualAdjustmentAllowed })} />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#10233A]">Assigned organizations</p>
                <p className="mt-1 text-[11px] text-[#7288A3]">Each organization can use one operation date validation template.</p>
                <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-[#D3E1EC] p-1.5">
                  {organizations.map((organization) => {
                    const selected = draft.organizationIds.includes(organization.id);
                    return (
                      <button key={organization.id} type="button" onClick={() => toggleOrganization(organization.id)} className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[12px] font-medium text-[#10233A] ${selected ? "bg-[#E7F4F9]" : "hover:bg-[#F8FDFF]"}`}>
                        <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}>{selected && <Check size={12} className="text-white" />}</span>
                        <span className="truncate">{organization.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {error && <p className="text-[12px] font-semibold text-[#D90310]">{error}</p>}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#D3E1EC] px-6 py-5">
              <button type="button" onClick={() => setDraft(null)} className="flex h-[42px] min-w-[110px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]">Cancel</button>
              <button data-system-action="true" type="button" onClick={saveDraft} className="flex h-[42px] min-w-[110px] items-center justify-center rounded-lg bg-[#007EA7] px-4 font-montserrat text-[14px] font-semibold text-white hover:bg-[#006B8F]">Save</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
