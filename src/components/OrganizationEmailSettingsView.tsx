import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import { BulkDeleteButton, RowDeleteButton } from './DeleteButtons';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import OcrSearchField from './OcrSearchField';
import { PageActionButton, PageHeader } from './PageHeader';
import RefreshAllButton from './RefreshAllButton';
import { ColumnSettingsButton } from './ScopedActionButtons';
import SystemAddFilters, { type SystemFilterColumn } from './SystemAddFilters';
import TablePagination from './TablePagination';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import {
  loadOrganizationEmailTemplates,
  saveOrganizationEmailTemplates,
  type OrganizationEmailTemplate,
} from '../lib/organizationEmail';

const EMPTY_TEMPLATE: OrganizationEmailTemplate = {
  id: '', name: '', language: 'LT', subject: '', body: '', active: true,
};

type TemplateColumnKey = 'name' | 'language' | 'subject' | 'status';

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Template name', width: 220, visible: true },
  { key: 'language', label: 'Language', width: 120, visible: true },
  { key: 'subject', label: 'Subject', width: 430, visible: true },
  { key: 'status', label: 'Status', width: 140, visible: true },
];

const PAGE_SIZE = 4;
const ACTION_COLUMN_WIDTH = 80;

function templateValue(template: OrganizationEmailTemplate, key: TemplateColumnKey) {
  if (key === 'status') return template.active ? 'Active' : 'Inactive';
  return template[key];
}

export default function OrganizationEmailSettingsView() {
  const [templates, setTemplates] = useState(loadOrganizationEmailTemplates);
  const [editing, setEditing] = useState<OrganizationEmailTemplate | null>(null);
  const [columns, setColumns] = useState<ColConfig[]>(() => DEFAULT_COLUMNS.map((column) => ({ ...column })));
  const [showColumns, setShowColumns] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  const filterColumns = useMemo<SystemFilterColumn[]>(() => [
    { key: 'name', label: 'Template name', options: [...new Set(templates.map((template) => template.name))].sort() },
    { key: 'language', label: 'Language', options: [...new Set(templates.map((template) => template.language))].sort() },
    { key: 'subject', label: 'Subject', options: [...new Set(templates.map((template) => template.subject))].sort() },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ], [templates]);

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      const matchesSearch = !normalizedSearch || [template.name, template.language, template.subject, template.active ? 'Active' : 'Inactive']
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
      const matchesFilters = activeFilterKeys.every((key) => {
        const selected = filterValues[key] ?? [];
        return selected.length === 0 || selected.includes(templateValue(template, key as TemplateColumnKey));
      });
      return matchesSearch && matchesFilters;
    });
  }, [activeFilterKeys, filterValues, search, templates]);

  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<OrganizationEmailTemplate, TemplateColumnKey>(filteredTemplates, templateValue);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const displayedTemplates = viewAll
    ? sortedRows
    : sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleColumns = columns.filter((column) => column.visible);
  const tableWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0) + 42 + ACTION_COLUMN_WIDTH;
  const allDisplayedSelected = displayedTemplates.length > 0 && displayedTemplates.every((template) => selectedIds.has(template.id));
  const someDisplayedSelected = !allDisplayedSelected && displayedTemplates.some((template) => selectedIds.has(template.id));

  useEffect(() => {
    if (!viewAll && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, viewAll]);

  const saveTemplate = (template: OrganizationEmailTemplate) => {
    const next = templates.some((item) => item.id === template.id)
      ? templates.map((item) => item.id === template.id ? template : item)
      : [...templates, { ...template, id: crypto.randomUUID() }];
    setTemplates(next);
    saveOrganizationEmailTemplates(next);
    setEditing(null);
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((template) => template.id !== id);
    setTemplates(next);
    saveOrganizationEmailTemplates(next);
    setSelectedIds((current) => {
      const updated = new Set(current);
      updated.delete(id);
      return updated;
    });
  };

  const deleteSelected = () => {
    const next = templates.filter((template) => !selectedIds.has(template.id));
    setTemplates(next);
    saveOrganizationEmailTemplates(next);
    setSelectedIds(new Set());
  };

  return (
    <main className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <PageHeader title="Email templates" actions={templates.length > 0 ? <PageActionButton onClick={() => setEditing({ ...EMPTY_TEMPLATE })}>Create new</PageActionButton> : undefined} />
      <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]"><span>Settings</span><span>/</span><span>Organizations</span><span>/</span><span className="text-[#A1B6C6]">Email templates</span></div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField ariaLabel="Search email templates" value={search} onChange={(value) => { setSearch(value); setCurrentPage(1); }} className="!w-[260px] !min-w-[260px] !max-w-[260px] !flex-none" />
          <SystemAddFilters persistenceKey="finansu-harmonija:v12:filters:organization-email-templates" columns={filterColumns} activeKeys={activeFilterKeys} values={filterValues} onActiveKeysChange={(keys) => { setActiveFilterKeys(keys); setCurrentPage(1); }} onValuesChange={(values) => { setFilterValues(values); setCurrentPage(1); }} />
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton selectedCount={selectedIds.size} onDelete={deleteSelected} />
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton onRefresh={() => setTemplates(loadOrganizationEmailTemplates())} />
        </div>
      </div>

      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: tableWidth }}>
          <div className="mb-3 flex h-9 items-start">
            <div data-table-header-select="true" className="flex h-9 w-[42px] flex-shrink-0 items-start justify-center px-3">
              <TableCheckbox checked={allDisplayedSelected} mixed={someDisplayedSelected} label="Select all email templates" onChange={() => setSelectedIds((current) => {
                const next = new Set(current);
                displayedTemplates.forEach((template) => allDisplayedSelected ? next.delete(template.id) : next.add(template.id));
                return next;
              })} />
            </div>
            {visibleColumns.map((column) => {
              const realIndex = columns.findIndex((item) => item.key === column.key);
              return <div key={column.key} style={{ width: column.width }} className="relative flex h-9 flex-shrink-0 items-start gap-1 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]"><span className="min-w-0 whitespace-normal">{column.label}</span><ColumnSortButton columnLabel={column.label} direction={directionFor(column.key as TemplateColumnKey)} onDirectionChange={(direction) => changeSort(column.key as TemplateColumnKey, direction)} /><ResizeHandle onMouseDown={(event) => startResize(realIndex, event)} /></div>;
            })}
            <div className="h-9 flex-shrink-0" style={{ width: ACTION_COLUMN_WIDTH }} />
          </div>

          <div className="flex flex-col gap-0.5">
            {displayedTemplates.map((template, index) => <div key={template.id} className={`group flex h-10 items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`}>
              <div className="flex w-[42px] flex-shrink-0 justify-center px-3"><TableCheckbox checked={selectedIds.has(template.id)} label={`Select ${template.name}`} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(template.id)) next.delete(template.id); else next.add(template.id); return next; })} /></div>
              {visibleColumns.map((column) => <div key={column.key} style={{ width: column.width }} className="flex-shrink-0 overflow-hidden px-3"><span className={`block truncate ${column.key === 'status' && template.active ? 'text-[#0A9F79]' : ''}`} title={String(templateValue(template, column.key as TemplateColumnKey))}>{templateValue(template, column.key as TemplateColumnKey)}</span></div>)}
              <div className="flex h-full flex-shrink-0 items-center justify-end gap-2 px-2" style={{ width: ACTION_COLUMN_WIDTH }}><button type="button" title="EDIT" aria-label={`EDIT ${template.name}`} onClick={() => setEditing({ ...template })} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7]"><Pencil size={14} /></button><RowDeleteButton label={`DELETE ${template.name}`} onDelete={() => deleteTemplate(template.id)} /></div>
            </div>)}
            {displayedTemplates.length === 0 && <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 text-center"><span className="font-montserrat text-[13px] font-medium text-[#7288A3]">No email templates</span>{templates.length === 0 && <PageActionButton onClick={() => setEditing({ ...EMPTY_TEMPLATE })}>Create new</PageActionButton>}</div>}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination currentPage={viewAll ? 1 : currentPage} totalPages={totalPages} itemCount={sortedRows.length} itemsPerPage={viewAll ? Math.max(1, sortedRows.length) : PAGE_SIZE} onPageChange={setCurrentPage} onShowMore={() => { setViewAll((current) => !current); setCurrentPage(1); }} showMoreLabel={viewAll ? 'Default' : 'Show more'} allItemsVisible={viewAll} />

      {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={(next) => { setColumns(next); setShowColumns(false); }} onClose={() => setShowColumns(false)} />}
      {editing && <TemplatePanel template={editing} onCancel={() => setEditing(null)} onSave={saveTemplate} />}
    </main>
  );
}

function TableCheckbox({ checked, mixed = false, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="checkbox" aria-checked={mixed ? 'mixed' : checked} aria-label={label} onClick={onChange} className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked || mixed ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{mixed ? <span className="h-0.5 w-2 rounded bg-white" /> : checked ? <Check size={12} strokeWidth={2.5} className="text-white" /> : null}</button>;
}

function TemplatePanel({ template, onCancel, onSave }: { template: OrganizationEmailTemplate; onCancel: () => void; onSave: (template: OrganizationEmailTemplate) => void }) {
  const [draft, setDraft] = useState(template);
  const set = <K extends keyof OrganizationEmailTemplate>(key: K, value: OrganizationEmailTemplate[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const valid = Boolean(draft.name.trim() && draft.language.trim() && draft.subject.trim() && draft.body.trim());
  return <div className="fixed inset-0 z-[90] flex justify-end bg-transparent"><aside className="flex h-full w-full max-w-[560px] flex-col border-l border-[#E5EDF9] bg-white shadow-[-8px_0_24px_rgba(16,35,58,0.10)]"><header className="flex min-h-[72px] items-center justify-between border-b border-[#E5EDF9] px-6"><h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">{template.id ? 'Edit email template' : 'New email template'}</h2><button type="button" onClick={onCancel} aria-label="Close template" className="text-[#7288A3] hover:text-[#10233A]"><X size={22} /></button></header><div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6"><Input label="Template name" value={draft.name} onChange={(value) => set('name', value)} /><Input label="Language" value={draft.language} onChange={(value) => set('language', value)} placeholder="LT, EN…" /><Input label="Subject" value={draft.subject} onChange={(value) => set('subject', value)} /><label className="flex flex-col gap-1.5"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">Message template</span><textarea rows={14} value={draft.body} onChange={(event) => set('body', event.target.value)} className="rounded-md border border-[#D3E1EC] px-3 py-2 font-montserrat text-[12px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" /></label><div className="rounded-lg bg-[#F8FDFF] p-3 font-montserrat text-[11px] font-medium leading-5 text-[#7288A3]">Available fields: {'{{sender}}'}, {'{{recipient}}'}, {'{{reconciliationDate}}'}, {'{{debtBalance}}'}, {'{{portalUrl}}'}, {'{{documentReference}}'}</div><label className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#10233A]"><button type="button" onClick={() => set('active', !draft.active)} className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${draft.active ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{draft.active && <Check size={12} className="text-white" />}</button>Active template</label></div><footer className="flex justify-end gap-3 border-t border-[#E5EDF9] p-6"><button type="button" onClick={onCancel} className="h-9 rounded-md border-2 border-[#D3E1EC] px-4 font-montserrat text-[13px] font-semibold text-[#7288A3]">Cancel</button><button type="button" disabled={!valid} onClick={() => valid && onSave(draft)} className="h-9 rounded-md bg-[#007EA7] px-4 font-montserrat text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-[#B4B6B8]">Save template</button></footer></aside></div>;
}

function Input({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="flex flex-col gap-1.5"><span className="font-montserrat text-[12px] font-medium text-[#7288A3]">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A] outline-none placeholder:text-[#A1B6C6] focus:border-[#007EA7]" /></label>;
}
