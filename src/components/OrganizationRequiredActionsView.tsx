import { useRef, useState } from 'react';
import { PageHeader, PageActionButton } from './PageHeader';
import { SystemBreadcrumb } from './SystemNavigation';
import OcrSearchField from './OcrSearchField';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import { ColumnSettingsButton } from './ScopedActionButtons';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import { useAttentionNotifications } from '../hooks/useAttentionNotifications';
import { getRelevantActions, requiresAction, type AttentionNotification } from '../lib/notifications';
import SystemAddFilters from './SystemAddFilters';
import { canEditMenu, type AppSession } from '../lib/accessControl';
import { Pencil, Trash2, RefreshCw, X } from 'lucide-react';
import ImportButton from './ImportButton';
import SearchableSelect from './SearchableSelect';
import { SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS, type NotificationRow, type ReminderRow } from '../lib/notifications';
import { matchesTextSearch } from '../utils/textSearch';

const COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 260, visible: true },
  { key: 'organization', label: 'Organization', width: 220, visible: true },
  { key: 'category', label: 'Type', width: 140, visible: true },
  { key: 'message', label: 'Description', width: 380, visible: true },
  { key: 'status', label: 'Status', width: 140, visible: true },
  { key: 'requiresAction', label: 'Requires action', width: 150, visible: true },
];

export default function OrganizationRequiredActionsView({ organization, session, onBack, initialQuery = '' }: { organization?: { id: string; name: string }; session: AppSession; onBack?: () => void; initialQuery?: string }) {
  const source = useAttentionNotifications(true);
  const canEdit = canEditMenu(session, 'notifications');
  const [editor, setEditor] = useState<AttentionNotification | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed'));
  const updateRecords = (category: 'notifications' | 'reminders', update: (rows: (NotificationRow | ReminderRow)[]) => (NotificationRow | ReminderRow)[]) => {
    if (!canEdit) throw new Error('You do not have permission to edit notifications.');
    const key = `finansu-harmonija:v7:${category}`;
    const saved = localStorage.getItem(key);
    const rows = saved === null ? category === 'notifications' ? SAMPLE_NOTIFICATIONS : SAMPLE_REMINDERS : JSON.parse(saved);
    if (!Array.isArray(rows)) throw new Error('Unable to read records.');
    localStorage.setItem(key, JSON.stringify(update(rows)));
    refresh();
  };
  const createRecord = () => {
    setIsNew(true); setError('');
    setEditor({ id: crypto.randomUUID(), category: 'notifications', name: '', type: '', message: '', status: 'Active', createdAt: new Date().toISOString(),
      ...(organization ? { organizationId: organization.id, organizationName: organization.name, requiresAction: true } : {}) });
  };
  const [query, setQuery] = useState(initialQuery);
  const organizationLabel = (row: AttentionNotification) => row.organizationId === organization?.id && organization ? organization.name : row.organizationName || row.organizationId || '—';
  const valueFor = (row: AttentionNotification, key: string) => {
    if (key === 'organization') return organizationLabel(row);
    if (key === 'requiresAction') return requiresAction(row) ? 'Yes' : 'No';
    if (key === 'category') return row.category === 'reminders' ? 'Task' : 'Notification';
    if (key === 'status' && row.resolvedAt) return 'Resolved';
    return String(row[key as keyof AttentionNotification] ?? '');
  };
  const [activeFilters, setActiveFilters] = useState<string[]>(organization ? ['organization', 'requiresAction'] : []);
  const [filters, setFilters] = useState<Record<string, string[]>>(organization ? { organization: [`${organization.name} (${organization.id})`], requiresAction: ['Yes'] } : {});
  const filterValue = (row: AttentionNotification, key: string) => key === 'organization' && row.organizationId ? `${organizationLabel(row)} (${row.organizationId})` : valueFor(row, key);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns, 'organization-required-actions');
  const actions = getRelevantActions(source, session);
  const filterColumns = ['organization', 'requiresAction', 'category', 'status'].map(key => ({ key, label: COLUMNS.find(column => column.key === key)!.label, options: key === 'requiresAction' ? ['Yes', 'No'] : [...new Set([...actions.map(row => filterValue(row, key)), ...(filters[key] ?? [])])].sort() }));
  const filtered = actions.filter(row => activeFilters.every(key => !filters[key]?.length || filters[key].includes(filterValue(row, key))) && matchesTextSearch(columns.filter(column => column.visible).map(column => valueFor(row, column.key)), query));
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(filtered, valueFor);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visible = columns.filter(column => column.visible);
  return <div className="flex min-h-screen flex-col gap-6 pb-24 pt-12" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
    <PageHeader title="Notifications & Tasks" actions={<>{onBack && <PageActionButton onClick={onBack}>Back</PageActionButton>}<PageActionButton disabled={!canEdit} onClick={createRecord}>Create new</PageActionButton></>} />
    <SystemBreadcrumb items={['Notifications & Tasks']} />
    <div className="flex items-center gap-1">
      <OcrSearchField value={query} onChange={value => { setQuery(value); setPage(1); }} />
      <SystemAddFilters columns={filterColumns} activeKeys={activeFilters} values={filters} onActiveKeysChange={keys => { setActiveFilters(keys); setPage(1); }} onValuesChange={values => { setFilters(values); setPage(1); }} onClearFilters={() => { setActiveFilters([]); setFilters({}); setQuery(''); setPage(1); }} />
      <div className="ml-auto flex items-center gap-4"><ColumnSettingsButton onClick={() => setShowColumns(true)} /><ImportButton scope="Notifications & Tasks" disabled={!canEdit} /><button type="button" title="REFRESH ALL" aria-label="Refresh all" onClick={refresh} className="text-[#7288A3] hover:text-[#007EA7]"><RefreshCw size={16} /></button></div>
    </div>
    <div ref={scrollRef} className="min-h-0 overflow-auto">
      <div style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0) + 76 }}>
        <div className="flex h-12 items-center">
          {visible.map(column => <div key={column.key} className="relative flex flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] text-[#10233A]" style={{ width: column.width }}>
            <span className="truncate">{column.label}</span>
            <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => changeSort(column.key, direction)} />
            <ResizeHandle onMouseDown={event => startResize(columns.findIndex(item => item.key === column.key), event)} />
          </div>)}
        </div>
        {sortedRows.slice((currentPage - 1) * 20, currentPage * 20).map((row, index) => <div key={`${row.organizationId ?? ''}:${row.actionId || `${row.category}:${row.id}`}`} className={`flex h-9 items-center rounded-lg ${index % 2 === 0 ? 'bg-[#F8FDFF]' : ''}`}>
          {visible.map(column => <div key={column.key} title={valueFor(row, column.key)} className="flex-shrink-0 truncate px-3 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]" style={{ width: column.width }}>{valueFor(row, column.key)}</div>)}
          <div className={`sticky right-0 ml-auto flex w-[76px] shrink-0 justify-center gap-1 ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
            <button type="button" disabled={!canEdit} title="EDIT" aria-label={`Edit ${row.name}`} onClick={() => { setEditor({ ...row }); setIsNew(false); setError(''); }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] hover:border-[#007EA7] disabled:opacity-40"><Pencil size={14} /></button>
            <button type="button" disabled={!canEdit} title="DELETE" aria-label={`Delete ${row.name}`} onClick={() => { if (!window.confirm(`Delete ${row.name}?`)) return; try { updateRecords(row.category, rows => rows.filter(item => item.id !== row.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete record.'); } }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] hover:border-[#D75B67] disabled:opacity-40"><Trash2 size={14} /></button>
          </div>
        </div>)}
        {!sortedRows.length && <p className="py-12 text-center font-montserrat text-[12px] text-[#7288A3]">No notifications or tasks match the selected filters.</p>}
      </div>
    </div>
    <HorizontalTableScrollbar scrollRef={scrollRef} />
    <TablePagination currentPage={currentPage} totalPages={totalPages} itemCount={sortedRows.length} itemsPerPage={20} onPageChange={setPage} />
    {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={COLUMNS} onSave={setColumns} onClose={() => setShowColumns(false)} />}
    {error && !editor && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    {editor && <div className="fixed inset-0 z-[140] flex justify-end bg-[#10233A]/10" onClick={() => setEditor(null)}>
      <form role="dialog" aria-modal="true" aria-label={isNew ? 'Create notification or task' : 'Edit notification or task'} className="flex h-full w-full max-w-[340px] flex-col gap-4 overflow-y-auto border-l border-[#D3E1EC] bg-white p-6 font-montserrat text-[14px] text-[#10233A]" onClick={event => event.stopPropagation()} onSubmit={event => {
        event.preventDefault();
        try {
          const { category, ...record } = editor;
          updateRecords(category, rows => isNew ? [...rows, { ...record, name: record.name.trim() }] : rows.map(row => row.id === record.id ? { ...row, ...record, name: record.name.trim() } : row));
          setEditor(null);
        } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save record.'); }
      }}>
        <header className="flex justify-between gap-3"><h2 className="text-[22px] font-semibold">{isNew ? 'Create new' : 'Edit record'}</h2><button type="button" aria-label="Close editor" onClick={() => setEditor(null)}><X size={20} /></button></header>
        <label>Record type<SearchableSelect ariaLabel="Record type" disabled={!isNew} value={editor.category} options={[{ value: 'notifications', label: 'Notification' }, { value: 'reminders', label: 'Task / Reminder' }]} onChange={value => setEditor({ ...editor, category: value as 'notifications' | 'reminders', type: '' })} /></label>
        <label>Name <span className="text-red-600">*</span><input required className="mt-1 h-[42px] w-full rounded-lg border border-[#D3E1EC] px-3" value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        <label>Type <span className="text-red-600">*</span><SearchableSelect ariaLabel="Type" value={editor.type} options={editor.category === 'notifications' ? ['Transaction', 'System', 'Billing', 'Document'] : ['Scheduled', 'Deadline', 'Recurring', 'Maintenance']} onChange={value => setEditor({ ...editor, type: value })} /></label>
        {editor.category === 'reminders' && <label>Days till remind<SearchableSelect ariaLabel="Days till remind" value={'daysTillRemind' in editor ? editor.daysTillRemind : ''} options={['1', '3', '7', '14', '30']} onChange={value => setEditor({ ...editor, daysTillRemind: value })} /></label>}
        <label>Description <span className="text-red-600">*</span><textarea required rows={5} className="mt-1 w-full rounded-lg border border-[#D3E1EC] p-3" value={editor.message} onChange={event => setEditor({ ...editor, message: event.target.value })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={editor.status === 'Active'} onChange={event => setEditor({ ...editor, status: event.target.checked ? 'Active' : 'Inactive' })} />Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(editor.requiresAction)} onChange={event => setEditor({ ...editor, requiresAction: event.target.checked })} />Requires action</label>
        {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
        <footer className="mt-auto flex justify-end gap-2"><PageActionButton onClick={() => setEditor(null)}>Cancel</PageActionButton><button type="submit" disabled={!canEdit || !editor.name.trim() || !editor.type || !editor.message.trim() || (editor.category === 'reminders' && !('daysTillRemind' in editor && editor.daysTillRemind))} className="rounded-md border-2 border-[#D3E1EC] px-3 py-1 font-semibold text-[#7288A3] disabled:opacity-40">Save</button></footer>
      </form>
    </div>}
  </div>;
}
