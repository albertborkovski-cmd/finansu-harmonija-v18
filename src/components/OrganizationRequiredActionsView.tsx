import { TABLE_BATCH_SIZE } from "../lib/tablePaging";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageHeader, PageActionButton } from './PageHeader';
import { SystemBreadcrumb } from './SystemNavigation';
import OcrSearchField from './OcrSearchField';
import NotificationRelativeTime from './NotificationRelativeTime';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import { ColumnSettingsButton } from './ScopedActionButtons';
import { ResizeHandle, useColumnResize } from './useColumnResize';
import ColumnSortButton, { useMultiColumnSort, type SortDirection } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import { useAttentionNotifications } from '../hooks/useAttentionNotifications';
import { useVisibleNotificationRecords } from '../hooks/useVisibleNotificationRecords';
import { getNotificationStatus, setNotificationStatus, getNotificationTabCounts, getRelevantActionsForTab, getTaskStatus, isNotificationRead, requiresAction, type AttentionNotification, type NotificationTab } from '../lib/notifications';
import SystemAddFilters from './SystemAddFilters';
import { canEditMenu, parseSession, type AppSession } from '../lib/accessControl';
import { Check, XCircle, CheckCircle2, RotateCcw, Pencil, RefreshCw, X, AlertTriangle, Info } from 'lucide-react';
import { RowDeleteButton } from './DeleteButtons';
import { isInactiveRecord, isRecordLinked, removeOrDeactivateRecords } from '../lib/recordLifecycle';
import SearchableSelect from './SearchableSelect';
import NewTaskForm from './NewTaskForm';
import NotificationRelatedObjectField from './NotificationRelatedObjectField';
import NotificationDetailsPanel from './NotificationDetailsPanel';
import RelatedObjectLink, { type OpenRelatedObject } from './RelatedObjectLink';
import { resolveRelatedObject } from '../lib/relatedObjects';
import { assertTaskUnchanged, TASK_TYPES } from '../lib/taskCreation';
import { getTaskActionVisibility, getTaskPermissions, transitionTask } from '../lib/taskPermissions';
import { getTaskDueGroup, matchesTaskQuickFilters, type TaskQuickPeriod } from '../lib/taskSchedule';
import { getTaskProvenance } from '../lib/taskProvenance';
import { useTaskToday } from '../hooks/useTaskToday';
import { canAccessAssignedOrganization } from '../lib/linkedSettingsData';
import { SAMPLE_NOTIFICATIONS, SAMPLE_REMINDERS, type NotificationRow, type ReminderRow } from '../lib/notifications';
import { matchesTextSearch } from '../utils/textSearch';
import { createNotificationColumns, formatNotificationDateTime, getNotificationActionLabel, getNotificationRelatedObjectLabel, getNotificationModuleLabel, getNotificationSourceTaskId, isSystemNotification, notificationMessage, NOTIFICATION_MODULE_LABELS, NOTIFICATION_OPEN_BUTTON_CLASS_NAME } from '../lib/notificationPresentation';
import { ensureReceivedEmailExample } from '../lib/chatNotificationExample';
import { ensureObjectNotificationExamples } from '../lib/notificationObjectExamples';
import { scopeNotificationRecords } from '../lib/notificationOrganizationScope';

const TASK_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Task name', width: 250, visible: true },
  { key: 'type', label: 'Task type', width: 140, visible: true },
  { key: 'organization', label: 'Organization', width: 220, visible: true },
  { key: 'assignedTo', label: 'Assigned to', width: 200, visible: true },
  { key: 'dueDate', label: 'Due date', width: 180, visible: true },
  { key: 'relatedObject', label: 'Related object', width: 240, visible: true },
  { key: 'status', label: 'Status', width: 140, visible: true },
  { key: 'priority', label: 'Priority', width: 110, visible: true },
  { key: 'source', label: 'Source', width: 150, visible: false },
  { key: 'createdBy', label: 'Created by', width: 200, visible: false },
  { key: 'message', label: 'Description', width: 380, visible: false },
];

const TASK_QUICK_PERIODS: TaskQuickPeriod[] = ['Overdue', 'Today', 'Upcoming', 'Completed'];

function editableTask(row: AttentionNotification): ReminderRow {
  const { category, ...record } = row;
  if (category !== 'reminders') throw new Error('Only tasks can be edited in this form.');
  return { ...record, type: (TASK_TYPES as readonly string[]).includes(record.type) ? record.type : 'To-do', daysTillRemind: 'daysTillRemind' in record ? record.daysTillRemind : '' };
}

export default function OrganizationRequiredActionsView({ organization, session, onBack, onOpenRelatedObject, onOpenModule, initialQuery = '', initialTab = 'notifications', initialRequiresAction = false, initialOpenTasksOnly = false }: { organization?: { id: string; name: string }; session: AppSession; onBack?: () => void; onOpenRelatedObject: OpenRelatedObject; onOpenModule?: (organizationId: string, menu: string) => Promise<void>; initialQuery?: string; initialTab?: NotificationTab; initialRequiresAction?: boolean; initialOpenTasksOnly?: boolean }) {
  const [activeTab, setActiveTab] = useState<NotificationTab>(initialTab);
  const [myTasks, setMyTasks] = useState(false);
  const [quickPeriod, setQuickPeriod] = useState<TaskQuickPeriod | null>(null);
  const today = useTaskToday();
  const records = useAttentionNotifications(true);
  const { records: source, session: currentSession, canAccessOrganization, organizations } = useVisibleNotificationRecords(records, session);
  const effectiveSession = currentSession ?? session;
  const canEdit = Boolean(currentSession && canEditMenu(currentSession, 'notifications'));
  const [editor, setEditor] = useState<AttentionNotification | null>(null);
  const [openedNotification, setOpenedNotification] = useState<{ id: string; organizationId?: string } | null>(null);
  const editorOriginal = useRef<AttentionNotification | null>(null);
  const [savingNotification, setSavingNotification] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [error, setError] = useState('');
  const demoContext = useRef({ organizations, session: currentSession });
  demoContext.current = { organizations, session: currentSession };
  const demoScopeKey = JSON.stringify([currentSession?.email, organizations.map(company => company.id).sort()]);
  const organizationContextId = organization?.id;
  useEffect(() => {
    const context = demoContext.current;
    if (!import.meta.env.DEV || activeTab !== 'notifications' || organizationContextId || !context.session
      || !context.organizations.length) return;
    const demoSession = context.session;
    let disposed = false;
    const createExamples = async () => {
      try {
        ensureReceivedEmailExample(context.organizations, demoSession);
        await ensureObjectNotificationExamples(context.organizations, demoSession);
      } catch (error) {
        if (!disposed) setError(error instanceof Error ? error.message : 'Unable to prepare notification examples.');
      }
    };
    void createExamples();
    return () => { disposed = true; };
  }, [activeTab, organizationContextId, demoScopeKey]);
  const refresh = () => window.dispatchEvent(new CustomEvent('finansu-harmonija:persistent-state-changed'));
  const writeRecords = (category: 'notifications' | 'reminders', update: (rows: (NotificationRow | ReminderRow)[]) => (NotificationRow | ReminderRow)[]) => {
    const key = `finansu-harmonija:v7:${category}`;
    const saved = localStorage.getItem(key);
    const rows = saved === null ? category === 'notifications' ? SAMPLE_NOTIFICATIONS : SAMPLE_REMINDERS : JSON.parse(saved);
    if (!Array.isArray(rows)) throw new Error('Unable to read records.');
    localStorage.setItem(key, JSON.stringify(update(rows)));
    refresh();
  };
  const updateRecords: typeof writeRecords = (category, update) => {
    if (!canEdit) throw new Error('You do not have permission to edit notifications.');
    writeRecords(category, update);
  };
  const toggleNotificationStatus = (row: AttentionNotification) => {
    if (!canEdit || !currentSession || row.category !== 'notifications' || !sectionActions.notifications.some(item => item.id === row.id && item.organizationId === row.organizationId)) return;
    try {
      updateRecords('notifications', rows => {
        const current = rows.find(item => item.id === row.id && item.organizationId === row.organizationId);
        if (!current || (current.organizationId && !canAccessOrganization(current.organizationId)) || !getRelevantActionsForTab([{ ...current, category: 'notifications' }], currentSession, 'notifications').length) throw new Error('This notification is no longer accessible. Refresh the list.');
        const nextStatus = getNotificationStatus(current) === 'Active' ? 'Resolved' : 'Active';
        return rows.map(item => item === current ? setNotificationStatus(item, nextStatus) : item);
      });
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update notification status.'); }
  };
  const deleteNotification = (row: AttentionNotification) => {
    if (row.category !== 'notifications' || isSystemNotification(row) || !canEdit) return;
    if (!window.confirm(`Remove ${row.name}? Linked records will be deactivated and retained.`)) return;
    try {
      updateRecords('notifications', rows => {
        const current = rows.find(item => item.id === row.id && item.organizationId === row.organizationId);
        if (!current || isSystemNotification(current) || !currentSession
          || (current.organizationId && !canAccessOrganization(current.organizationId))
          || !getRelevantActionsForTab([{ ...current, category: 'notifications' }], currentSession, 'notifications').length) {
          throw new Error('This notification cannot be deleted. Refresh the list.');
        }
        return removeOrDeactivateRecords(rows, new Set([current.id]), 'finansu-harmonija:v7:notifications', item => ({ ...setNotificationStatus(item, 'Resolved'), active: false, inactive: true }));
      });
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete record.'); }
  };
  const hasTaskOrganizationAccess = (task: ReminderRow, candidate: AppSession) => !task.organizationId || organizations.some(company => company.id === task.organizationId && canAccessAssignedOrganization(company, candidate));
  const changeTaskStatus = (row: AttentionNotification, action: 'complete' | 'cancel') => {
    if (row.category !== 'reminders') return;
    try {
      const saveSession = parseSession(JSON.stringify(effectiveSession));
      if (!saveSession) throw new Error('Your session is no longer valid.');
      writeRecords('reminders', rows => {
        const current = rows.find(item => item.id === row.id && item.organizationId === row.organizationId);
        if (!current) throw new Error('This task is no longer available. Refresh the list.');
        const task = { ...current, daysTillRemind: 'daysTillRemind' in current ? current.daysTillRemind : '' };
        if (!hasTaskOrganizationAccess(task, saveSession)) throw new Error('This task is no longer accessible.');
        const updated = transitionTask(task, saveSession, action);
        return rows.map(item => item === current ? updated : item);
      });
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update task status.'); }
  };
  const createTask = () => {
    if (activeTab !== 'reminders' || !canEdit || (organization && !canAccessOrganization(organization.id))) return;
    setError(''); setNewTaskOpen(true);
  };
  const [query, setQuery] = useState(initialQuery);
  const [sourceTaskFocus, setSourceTaskFocus] = useState<{ id: string; organizationId: string } | null>(null);
  const notificationReturn = useRef<{ query: string; activeFilters: string[]; filters: Record<string, string[]>; page: number; top: number; left: number; sortKey: string | null; sortDirection: SortDirection } | null>(null);
  const pendingScrollRestore = useRef<{ top: number; left: number } | null>(null);
  const organizationLabel = (row: AttentionNotification) => row.organizationId === organization?.id && organization ? organization.name : row.organizationName || row.organizationId || '—';
  const valueFor = (row: AttentionNotification, key: string) => {
    if (key === 'organization') return organizationLabel(row);
    if (key === 'requiresAction') return requiresAction(row) ? 'Yes' : 'No';
    if (key === 'category') return row.category === 'reminders' ? 'Task' : 'Notification';
    if (key === 'createdAt') return formatNotificationDateTime(row);
    if (key === 'severity') return 'severity' in row ? row.severity || '—' : '—';
    if (key === 'type' && row.category === 'notifications') return getNotificationModuleLabel(row);
    if (key === 'message' && row.category === 'notifications') return notificationMessage(row);
    if (key === 'status') return row.category === 'reminders' ? getTaskStatus(row) : getNotificationStatus(row);
    if (key === 'dueDate') return row.category === 'reminders' && 'dueDate' in row ? row.dueDate || '—' : '—';
    if (key === 'relatedObject') {
      if (row.category === 'notifications') return getNotificationRelatedObjectLabel(row, sectionActions.reminders);
      return row.relatedObject?.label || '—';
    }
    if (row.category === 'reminders') {
      const task = editableTask(row);
      if (key === 'priority') return task.priority ?? 'Normal';
      if (key === 'type') return task.type || '—';
      if (key === 'assignedTo') return task.assignedToName?.trim() || task.assignedToEmail?.trim() || '—';
      if (key === 'source') return getTaskProvenance(task).source;
      if (key === 'createdBy') return getTaskProvenance(task).createdBy;
    }
    return String(row[key as keyof AttentionNotification] ?? '');
  };
  const [activeFilters, setActiveFilters] = useState<string[]>([...(!organization ? ['organization'] : []), ...((initialOpenTasksOnly || initialRequiresAction) && initialTab === 'reminders' ? ['status'] : [])]);
  const [filters, setFilters] = useState<Record<string, string[]>>({ ...((initialOpenTasksOnly || initialRequiresAction) && initialTab === 'reminders' ? { status: ['Open'] } : {}) });
  const filterValue = (row: AttentionNotification, key: string) => key === 'organization' ? row.organizationId ?? '' : valueFor(row, key);
  const [page, setPage] = useState(1);
  const [notificationColumns, setNotificationColumns] = useState(() => createNotificationColumns(Boolean(organization)));
  const taskDefaultColumns = TASK_COLUMNS.map(column => organization && column.key === 'organization' ? { ...column, visible: false } : column);
  const [taskColumns, setTaskColumns] = useState(taskDefaultColumns);
  const columns = activeTab === 'reminders' ? taskColumns : notificationColumns;
  const setColumns = activeTab === 'reminders' ? setTaskColumns : setNotificationColumns;
  const defaultColumns = activeTab === 'reminders' ? taskDefaultColumns : createNotificationColumns(Boolean(organization));
  const [showColumns, setShowColumns] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The signal list has its own schema; old task-like layouts cannot hide its new defaults.
  const notificationResize = useColumnResize(notificationColumns, setNotificationColumns, `notification-signals-v15-${organization ? 'organization' : 'global'}`);
  const taskResize = useColumnResize(taskColumns, setTaskColumns, organization ? 'organization-tasks-v15-scoped-columns' : 'organization-tasks-v15-default-columns');
  const { startResize } = activeTab === 'reminders' ? taskResize : notificationResize;
  const organizationSource = scopeNotificationRecords(source, organization?.id, filters.organization ?? []);
  const sectionActions = {
    notifications: getRelevantActionsForTab(organizationSource, effectiveSession, 'notifications'),
    reminders: getRelevantActionsForTab(organizationSource, effectiveSession, 'reminders'),
  };
  const editorAccessible = editor && sectionActions[editor.category].some(row => row.id === editor.id && row.organizationId === (editorOriginal.current ?? editor).organizationId && (row.category !== 'notifications' || !isSystemNotification(row)));
  const detailsNotification = activeTab === 'notifications' && openedNotification
    ? sectionActions.notifications.find(row => row.id === openedNotification.id && row.organizationId === openedNotification.organizationId) : undefined;
  const tabCounts = getNotificationTabCounts(organizationSource, effectiveSession);
  const actions = sectionActions[activeTab];
  // 80px Open + 28px read toggle + 4px gap + 8px padding on each side.
  // Only reserve the extra edit/delete space when legacy manual records need it.
  const actionWidth = activeTab === 'notifications' ? 128 + (actions.some(row => !isSystemNotification(row)) ? 64 : 0) : 108;
  const tabColumns = columns;
  const filterKeys = (activeTab === 'reminders' ? ['organization', 'assignedTo', 'type', 'status'] : ['organization', 'type', 'status']).filter(key => !organization || key !== 'organization');
  const filterColumns = filterKeys.map(key => key === 'organization' ? {
    key, label: 'Organization', options: organizations.map(company => company.id),
    optionLabels: Object.fromEntries(organizations.map(company => [company.id, `${company.name}${company.company_code ? ` · ${company.company_code}` : ''}`])),
  } : { key, label: key === 'requiresAction' ? 'Requires action' : defaultColumns.find(column => column.key === key)!.label, options: key === 'requiresAction' ? ['Yes', 'No'] : key === 'status' && activeTab === 'reminders' ? ['Open', 'Completed', 'Cancelled'] : [...new Set([...actions.map(row => filterValue(row, key)), ...(filters[key] ?? [])])].sort() });
  const matchesFilters = (row: AttentionNotification) => {
    if (row.category === 'reminders' && sourceTaskFocus && (row.id !== sourceTaskFocus.id || row.organizationId !== sourceTaskFocus.organizationId)) return false;
    if (row.category === 'reminders' && !matchesTaskQuickFilters(editableTask(row), { myTasks, period: quickPeriod }, effectiveSession.email, today)) return false;
    const searchValues = tabColumns.filter(column => column.visible).map(column => valueFor(row, column.key));
    // Dashboard links use the stored signal title, even when only its message is a visible column.
    if (row.category === 'notifications') {
      searchValues.push(row.name);
      const sourceTaskId = getNotificationSourceTaskId(row);
      searchValues.push(getNotificationActionLabel(row) ?? '', sourceTaskId
        ? sectionActions.reminders.find(task => task.id === sourceTaskId && task.organizationId === row.organizationId)?.name ?? ''
        : getNotificationActionLabel(row) ? row.relatedObject?.label ?? '' : '');
    }
    if (row.category === 'reminders' && tabColumns.some(column => column.key === 'dueDate' && column.visible)) searchValues.push(getTaskDueGroup(editableTask(row), today) ?? '');
    return activeFilters.every(key => !filters[key]?.length || filters[key].includes(filterValue(row, key))) && matchesTextSearch(searchValues, query);
  };
  const filtered = actions.filter(matchesFilters);
  const { sortedRows, changeSort, directionFor, sortKey, direction } = useMultiColumnSort(filtered, valueFor);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / TABLE_BATCH_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = tabColumns.filter(column => column.visible);
  const changeTab = (tab: NotificationTab) => {
    setOpenedNotification(null);
    setSourceTaskFocus(null);
    setActiveTab(tab); setPage(1); setError(''); setShowColumns(false);
    setActiveFilters(keys => [...(!organization ? ['organization'] : []), ...keys.filter(key => !['organization', 'category', 'status', 'type', 'assignedTo'].includes(key))]);
    setFilters(values => { const next = { ...values }; for (const key of ['category', 'status', 'type', 'assignedTo']) delete next[key]; return next; });
    if (scrollRef.current) { scrollRef.current.scrollTop = 0; scrollRef.current.scrollLeft = 0; }
  };
  const openSourceTask = (notification: AttentionNotification) => {
    const id = getNotificationSourceTaskId(notification);
    const task = sectionActions.reminders.find(row => row.id === id && row.organizationId === notification.organizationId);
    if (!currentSession || !id || !notification.organizationId || !canAccessOrganization(notification.organizationId)
      || !sectionActions.notifications.some(row => row.id === notification.id && row.organizationId === notification.organizationId) || !task) {
      setError('The source task was removed or is no longer accessible.');
      return;
    }
    notificationReturn.current = { query, activeFilters, filters, page, top: scrollRef.current?.scrollTop ?? 0, left: scrollRef.current?.scrollLeft ?? 0, sortKey, sortDirection: direction };
    changeTab('reminders'); setQuery(''); setMyTasks(false); setQuickPeriod(null); setActiveFilters(organization ? [] : ['organization']); setFilters({});
    setSourceTaskFocus({ id, organizationId: notification.organizationId });
  };
  const returnToNotifications = () => {
    const previous = notificationReturn.current;
    changeTab('notifications');
    if (previous) {
      setQuery(previous.query); setActiveFilters(previous.activeFilters); setFilters(previous.filters); setPage(previous.page);
      changeSort(previous.sortKey ?? '', previous.sortDirection);
      pendingScrollRestore.current = previous;
    }
    notificationReturn.current = null;
  };
  const renderRelatedObject = (row: AttentionNotification, asButton = false) => {
    const label = row.category === 'notifications' ? getNotificationActionLabel(row) : undefined;
    if (row.category === 'notifications') {
      if (!label) {
        const destination = ({ Bank: ['bank', 'Open bank'], OCR: ['documents', 'Open documents'], Documents: ['documents', 'Open documents'], Invoices: ['documents', 'Open invoices'], Reconciliation: ['services', 'Open reconciliation'] } as Record<string, string[]>)[getNotificationModuleLabel(row)];
        return asButton ? <button type="button" title={row.name} className={NOTIFICATION_OPEN_BUTTON_CLASS_NAME} onClick={async () => {
          setError('');
          if (destination && onOpenModule && row.organizationId) {
            try { await onOpenModule(row.organizationId, destination[0]); } catch (error) { setError(error instanceof Error ? error.message : 'This module is unavailable.'); }
          } else setOpenedNotification({ id: row.id, organizationId: row.organizationId });
        }}>Open</button> : '—';
      }
      const sourceTaskId = getNotificationSourceTaskId(row);
      if (sourceTaskId) {
        const taskName = getNotificationRelatedObjectLabel(row, sectionActions.reminders);
        return <button type="button" role={asButton ? undefined : 'link'} aria-label={`${label}: ${taskName}`} title={taskName} className={asButton
          ? NOTIFICATION_OPEN_BUTTON_CLASS_NAME
          : 'max-w-full truncate text-left text-[#007EA7] hover:underline'} onClick={() => openSourceTask(row)}>{asButton ? 'Open' : taskName}</button>;
      }
    }
    return row.relatedObject ? <RelatedObjectLink object={row.relatedObject} organizationId={row.organizationId} label={asButton ? label : row.category === 'notifications' ? getNotificationRelatedObjectLabel(row) : undefined} variant={asButton ? 'button' : 'link'} onOpen={onOpenRelatedObject} onError={setError} /> : asButton ? null : '—';
  };
  useLayoutEffect(() => {
    if (activeTab === 'notifications' && pendingScrollRestore.current && scrollRef.current) {
      scrollRef.current.scrollTop = pendingScrollRestore.current.top;
      scrollRef.current.scrollLeft = pendingScrollRestore.current.left;
      pendingScrollRestore.current = null;
    }
  }, [activeTab]);
  return <div className="flex min-h-screen flex-col gap-6 pb-24 pt-12" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
    <PageHeader title={<span className="inline-flex items-center gap-3"><span>{activeTab === 'notifications' ? 'Notifications' : 'Tasks'}</span><span aria-live="polite" aria-label={activeTab === 'notifications' ? `${tabCounts.notifications} unread notifications` : `${tabCounts.reminders} open tasks`} title={activeTab === 'notifications' ? 'Unread notifications' : 'Open tasks'} className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#E65050] px-2 font-montserrat text-[12px] font-semibold leading-6 tabular-nums text-white">{tabCounts[activeTab]}</span></span>} actions={<>{onBack && <PageActionButton onClick={onBack}>Back</PageActionButton>}{activeTab === 'reminders' && <PageActionButton disabled={!canEdit || Boolean(organization && !canAccessOrganization(organization.id))} onClick={createTask}>+ New task</PageActionButton>}</>} />
    <SystemBreadcrumb items={[...(organization ? ['Companies', organization.name] : []), activeTab === 'notifications' ? 'Notifications' : 'Tasks']} />
    <div id="notification-section-content" className="flex min-h-0 flex-1 flex-col gap-6">
    {activeTab === 'reminders' && sourceTaskFocus && <div className="flex items-center gap-3"><PageActionButton onClick={returnToNotifications}>Back to notifications</PageActionButton><span className="font-montserrat text-[12px] text-[#7288A3]">Source task · {organizations.find(company => company.id === sourceTaskFocus.organizationId)?.name ?? '—'}</span></div>}
    <div className="flex flex-wrap items-center gap-1">
      <OcrSearchField value={query} onChange={value => { setQuery(value); setPage(1); }} />
      {activeTab === 'reminders' && <div role="group" aria-label="Task quick filters" className="flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={myTasks} onClick={() => { setMyTasks(value => !value); setPage(1); }} className={`flex h-7 items-center whitespace-nowrap rounded px-3 font-montserrat text-[12px] font-medium leading-[18px] transition-colors ${myTasks ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3] hover:bg-[#DCE7F6]'}`}>My tasks</button>
        {TASK_QUICK_PERIODS.map(period => <button key={period} type="button" aria-pressed={quickPeriod === period} onClick={() => { setQuickPeriod(value => value === period ? null : period); setPage(1); }} className={`flex h-7 items-center whitespace-nowrap rounded px-3 font-montserrat text-[12px] font-medium leading-[18px] transition-colors ${quickPeriod === period ? 'bg-[#007EA7] text-white' : 'bg-[#E5EDF9] text-[#7288A3] hover:bg-[#DCE7F6]'}`}>{period}</button>)}
      </div>}
      <SystemAddFilters columns={filterColumns} activeKeys={activeFilters} values={filters} onActiveKeysChange={keys => { setActiveFilters([...(!organization ? ['organization'] : []), ...keys.filter(key => key !== 'organization')]); setPage(1); }} onValuesChange={values => { setFilters(values); setPage(1); }} onClearFilters={() => { setActiveFilters(organization ? [] : ['organization']); setFilters({}); setQuery(''); setMyTasks(false); setQuickPeriod(null); setPage(1); }} />
      <div className="ml-auto flex items-center gap-4"><ColumnSettingsButton onClick={() => setShowColumns(true)} /><button type="button" title="REFRESH ALL" aria-label="Refresh all" onClick={refresh} className="text-[#7288A3] hover:text-[#007EA7]"><RefreshCw size={16} /></button></div>
    </div>
    <div ref={scrollRef} className="min-h-0 overflow-auto scrollbar-hide">
      <div style={{ minWidth: visible.reduce((sum, column) => sum + column.width, 0) + actionWidth }}>
        <div className="flex h-12 items-center">
          {visible.map(column => <div key={column.key} className="relative flex flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] text-[#10233A]" style={{ width: column.width }}>
            <span className="truncate">{column.label}</span>
            <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => changeSort(column.key, direction)} />
            <ResizeHandle onMouseDown={event => startResize(columns.findIndex(item => item.key === column.key), event)} />
          </div>)}
          <div aria-hidden="true" className="min-w-0 flex-1" />
          <div style={{ width: actionWidth }} className="system-table-row-actions shrink-0 bg-white px-2"><span className="sr-only">Actions</span></div>
        </div>
        {sortedRows.slice(0, currentPage * TABLE_BATCH_SIZE).map((row, index) => {
          const notificationResolved = row.category === 'notifications' && getNotificationStatus(row) === 'Resolved';
          const task = row.category === 'reminders' ? editableTask(row) : null;
          const dueGroup = task ? getTaskDueGroup(task, today) : null;
          const permissions = task && currentSession ? getTaskPermissions(task, currentSession) : null;
          const actionVisibility = task && currentSession ? getTaskActionVisibility(task, currentSession) : null;
          return <div data-record-inactive={('inactive' in row && row.inactive === true) || undefined} key={row.category === 'notifications' ? JSON.stringify([row.category, row.organizationId ?? '', row.id]) : `${row.organizationId ?? ''}:${row.actionId || `${row.category}:${row.id}`}`} className={`flex h-9 items-center rounded-lg ${index % 2 === 0 ? 'bg-[#F8FDFF]' : ''}`}>
          {visible.map(column => <div key={column.key} title={valueFor(row, column.key)} className="flex-shrink-0 truncate px-3 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]" style={{ width: column.width }}>{column.key === 'severity' ? <span className={`inline-flex items-center gap-1.5 ${valueFor(row, column.key) === 'Critical' ? 'text-[#B93846]' : valueFor(row, column.key) === 'Warning' ? 'text-[#966000]' : 'text-[#7288A3]'}`}>{['Critical', 'Warning'].includes(valueFor(row, column.key)) ? <AlertTriangle size={15} /> : <Info size={15} />}{valueFor(row, column.key)}</span> : column.key === 'dueDate' && task ? <>
            <span>{valueFor(row, column.key)}</span>{dueGroup && <span className={`ml-2 text-[10px] ${dueGroup === 'Overdue' ? 'text-[#D75B67]' : 'text-[#7288A3]'}`}>{dueGroup}</span>}
          </> : column.key === 'priority' && task ? <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${task.priority === 'Urgent' ? 'bg-[#FDEBEC] text-[#B93846]' : task.priority === 'High' ? 'bg-[#FFF3DE] text-[#966000]' : task.priority === 'Low' ? 'bg-[#F0F3F6] text-[#7288A3]' : 'bg-[#E6F2F6] text-[#007EA7]'}`}>{task.priority ?? 'Normal'}</span> : column.key === 'createdAt' && row.category === 'notifications' ? <NotificationRelativeTime row={row} /> : column.key === 'relatedObject' ? renderRelatedObject(row) : valueFor(row, column.key)}</div>)}
          <div aria-hidden="true" className="min-w-0 flex-1" />
          <div style={{ width: actionWidth }} className={`system-table-row-actions flex shrink-0 items-center justify-end gap-1 px-2 ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
            {row.category === 'notifications' && renderRelatedObject(row, true)}
            {row.category === 'notifications' && <button type="button" disabled={!canEdit} title={notificationResolved ? 'Mark as Active' : 'Mark as Resolved'} aria-label={`${notificationResolved ? 'Mark as Active' : 'Mark as Resolved'}: ${row.name}`} onClick={() => toggleNotificationStatus(row)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] enabled:hover:border-[#007EA7] enabled:hover:text-[#007EA7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007EA7] disabled:cursor-not-allowed disabled:opacity-40">{notificationResolved ? <RotateCcw size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}</button>}
            {((row.category === 'notifications' && !isSystemNotification(row)) || permissions?.edit) && <button type="button" disabled={row.category === 'notifications' && !canEdit} title="EDIT" aria-label={`Edit ${row.name}`} onClick={() => {
              if (row.category === 'notifications' && (isSystemNotification(row) || !canEdit)) return;
              editorOriginal.current = row; setEditor({ ...row }); setError('');
            }} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] hover:border-[#007EA7] disabled:opacity-40"><Pencil size={14} /></button>}
            {actionVisibility?.complete && <button type="button" disabled={!permissions?.complete} title="Complete" aria-label={`Complete ${row.name}`} onClick={() => changeTaskStatus(row, 'complete')} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] enabled:hover:border-[#007EA7] enabled:hover:text-[#007EA7] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"><Check size={14} /></button>}
            {actionVisibility?.cancel && <button type="button" disabled={!permissions?.cancel} title="Cancel task" aria-label={`Cancel task ${row.name}`} onClick={() => changeTaskStatus(row, 'cancel')} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] text-[#7288A3] enabled:hover:border-[#D75B67] enabled:hover:text-[#D75B67] disabled:cursor-not-allowed disabled:border-[#E5EDF9] disabled:text-[#B4B6B8]"><XCircle size={14} /></button>}
            {row.category === 'notifications' && !isSystemNotification(row) && <RowDeleteButton disabled={!canEdit} linked={isRecordLinked(row, 'finansu-harmonija:v7:notifications')} inactive={isInactiveRecord(row)} label={`Delete ${row.name}`} onDelete={() => deleteNotification(row)} />}
          </div>
        </div>; })}
        {!sortedRows.length && <p className="py-12 text-center font-montserrat text-[12px] text-[#7288A3]">No {activeTab === 'notifications' ? 'notifications' : 'tasks'} match the selected filters.</p>}
      </div>
    </div>
    <HorizontalTableScrollbar scrollRef={scrollRef} />
    <TablePagination scrollRef={scrollRef} currentPage={currentPage} totalPages={totalPages} itemCount={sortedRows.length} itemsPerPage={TABLE_BATCH_SIZE} onPageChange={setPage} />
    </div>
    {showColumns && <ColumnSettingsPanel key={activeTab} columns={tabColumns} defaultColumns={defaultColumns} onSave={setColumns} onClose={() => setShowColumns(false)} />}
    {detailsNotification && <NotificationDetailsPanel notification={detailsNotification} organizationName={organizationLabel(detailsNotification)} read={isNotificationRead(detailsNotification, effectiveSession.email)} onClose={() => setOpenedNotification(null)} />}
    {error && !editor && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    {newTaskOpen && <NewTaskForm session={effectiveSession} organizations={organizations} organizationContext={organization} onOpenRelatedObject={onOpenRelatedObject} onClose={() => setNewTaskOpen(false)} onSave={record => {
      if (!canAccessOrganization(record.organizationId ?? '')) throw new Error('This organization is no longer accessible.');
      updateRecords('reminders', rows => [...rows, record]);
      setNewTaskOpen(false); setQuery(''); changeTab('reminders');
    }} />}
    {editor?.category === 'reminders' && <NewTaskForm key={`edit:${editor.id}`} task={editableTask(editor)} session={effectiveSession} organizations={organizations} organizationContext={organization} onOpenRelatedObject={onOpenRelatedObject} onClose={() => setEditor(null)} onSave={record => {
      const saveSession = parseSession(JSON.stringify(effectiveSession));
      if (!saveSession || !getTaskPermissions(editableTask(editor), saveSession).edit || !editorAccessible) throw new Error('This task is no longer accessible. Close the editor and refresh the list.');
      if (!hasTaskOrganizationAccess(record, saveSession)) throw new Error('This organization is no longer accessible.');
      writeRecords('reminders', rows => {
        const current = rows.find(row => row.id === editor.id && row.organizationId === editor.organizationId);
        const currentTask = current ? { ...current, daysTillRemind: 'daysTillRemind' in current ? current.daysTillRemind : '' } : null;
        if (!currentTask || !hasTaskOrganizationAccess(currentTask, saveSession) || !getTaskPermissions(currentTask, saveSession).edit) throw new Error('This task is no longer accessible. Close the editor and refresh the list.');
        assertTaskUnchanged(currentTask, { ...editableTask(editor), type: editor.type });
        return rows.map(row => row === current ? { ...row, ...record, status: row.status, taskStatus: row.taskStatus, resolvedAt: row.resolvedAt, readAtByEmail: row.readAtByEmail } : row);
      });
      setEditor(null);
      if (!sourceTaskFocus) changeTab('reminders');
    }} />}
    {editor?.category === 'notifications' && !isSystemNotification(editor) && <div className="fixed inset-0 z-[140] flex justify-end bg-[#10233A]/10" onClick={() => { if (!savingNotification) setEditor(null); }}>
      <form role="dialog" aria-modal="true" aria-label="Edit notification" className="flex h-full w-full max-w-[340px] flex-col gap-4 overflow-y-auto border-l border-[#D3E1EC] bg-white p-6 font-montserrat text-[14px] text-[#10233A]" onClick={event => event.stopPropagation()} onSubmit={async event => {
        event.preventDefault();
        if (savingNotification) return;
        const original = editorOriginal.current ?? editor;
        setSavingNotification(true);
        try {
          if (!editorAccessible || isSystemNotification(original) || isSystemNotification(editor)) throw new Error('This record is no longer editable. Close the editor and refresh the list.');
          const saveSession = parseSession(JSON.stringify(effectiveSession));
          if (!saveSession || !canEditMenu(saveSession, 'notifications')) throw new Error('You no longer have permission to edit notifications.');
          const { category, ...record } = editor;
          const targetOrganization = organizations.find(company => company.id === record.organizationId);
          if (record.organizationId && (!targetOrganization || !canAccessAssignedOrganization(targetOrganization, saveSession))) throw new Error('This organization is no longer accessible.');
          const relatedObject = record.relatedObject && targetOrganization ? await resolveRelatedObject(record.relatedObject, targetOrganization, saveSession) : undefined;
          if (record.relatedObject && !relatedObject) throw new Error('The related object is no longer available in this organization.');
          const latestSession = parseSession(JSON.stringify(effectiveSession));
          if (!latestSession || !canEditMenu(latestSession, 'notifications') || (targetOrganization && !canAccessAssignedOrganization(targetOrganization, latestSession))) throw new Error('This notification is no longer accessible.');
          updateRecords(category, rows => {
            const current = rows.find(row => row.id === original.id && row.organizationId === original.organizationId);
            if (!current || isSystemNotification(current) || !getRelevantActionsForTab([{ ...current, category }], latestSession, category).length) throw new Error('This notification is no longer editable. Refresh the list.');
            const fields = new Set([...Object.keys(current), ...Object.keys(original)]);
            fields.delete('category'); fields.delete('readAtByEmail');
            if ([...fields].some(key => JSON.stringify(current[key as keyof typeof current]) !== JSON.stringify(original[key as keyof typeof original]))) throw new Error('This notification changed while the editor was open. Close the editor and refresh the list.');
            return rows.map(row => row === current ? { ...row, ...record, relatedObject, readAtByEmail: row.readAtByEmail, name: record.name.trim() } : row);
          });
          changeTab(category);
          setEditor(null);
        } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save record.'); }
        finally { setSavingNotification(false); }
      }}>
        <header className="flex justify-between gap-3"><h2 className="text-[22px] font-semibold">Edit record</h2><button type="button" disabled={savingNotification} aria-label="Close editor" onClick={() => setEditor(null)}><X size={20} /></button></header>
        <fieldset disabled={savingNotification} className="contents">
        <label>Record type<SearchableSelect ariaLabel="Record type" disabled value={editor.category} options={[{ value: 'notifications', label: 'Notification' }, { value: 'reminders', label: 'Task' }]} onChange={value => setEditor({ ...editor, category: value as 'notifications' | 'reminders', type: '' })} /></label>
        <label>Name <span className="text-red-600">*</span><input required className="mt-1 h-[42px] w-full rounded-lg border border-[#D3E1EC] px-3" value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        <label>Type <span className="text-red-600">*</span><SearchableSelect ariaLabel="Type" value={getNotificationModuleLabel(editor)} options={[...NOTIFICATION_MODULE_LABELS]} onChange={value => setEditor({ ...editor, type: value })} /></label>
        <div className="flex flex-col gap-1"><span>Organization</span><SearchableSelect selectionIndicator="checkbox" ariaLabel="Organization" value={editor.organizationId ?? ''} disabled={Boolean(organization || editorOriginal.current?.organizationId) || savingNotification} options={organizations.map(company => ({ value: company.id, label: company.name, description: company.company_code }))} placeholder="Select organization" onChange={id => { const company = organizations.find(item => item.id === id); setEditor({ ...editor, organizationId: company?.id, organizationName: company?.name, relatedObject: undefined }); }} /></div>
        <NotificationRelatedObjectField organization={organizations.find(company => company.id === editor.organizationId)} session={effectiveSession} value={editor.relatedObject} onChange={relatedObject => setEditor({ ...editor, relatedObject })} onOpen={onOpenRelatedObject} />
        <label>Description <span className="text-red-600">*</span><textarea required rows={5} className="mt-1 w-full rounded-lg border border-[#D3E1EC] p-3" value={editor.message} onChange={event => setEditor({ ...editor, message: event.target.value })} /></label>
        <label className="flex flex-col gap-1">Status<SearchableSelect ariaLabel="Notification status" value={getNotificationStatus(editor)} options={['Active', 'Resolved'].map(value => ({ value, label: value }))} onChange={value => setEditor({ ...editor, notificationStatus: value === 'Active' ? 'Active' : 'Resolved', status: value === 'Active' ? 'Active' : 'Inactive', resolvedAt: value === 'Active' ? undefined : new Date().toISOString() })} /></label>
        {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
        <footer className="mt-auto flex justify-end gap-2"><PageActionButton disabled={savingNotification} onClick={() => setEditor(null)}>Cancel</PageActionButton><button type="submit" disabled={savingNotification || !canEdit || !editorAccessible || !editor.name.trim() || !editor.type || !editor.message.trim()} className="rounded-md border-2 border-[#D3E1EC] px-3 py-1 font-semibold text-[#7288A3] disabled:opacity-40">{savingNotification ? 'Saving…' : 'Save'}</button></footer>
        </fieldset>
      </form>
    </div>}
  </div>;
}
