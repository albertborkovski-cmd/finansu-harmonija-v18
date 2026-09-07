import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Trash2, UsersRound, X } from 'lucide-react';
import { PageActionButton, PageHeader } from './PageHeader';
import OcrSearchField from './OcrSearchField';
import { BulkDeleteButton, RowDeleteButton } from './DeleteButtons';
import { ColumnSettingsButton } from './ScopedActionButtons';
import RefreshAllButton from './RefreshAllButton';
import ColumnSettingsPanel, { type ColConfig } from './ColumnSettingsPanel';
import ColumnSortButton, { useMultiColumnSort } from './ColumnSortButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import { getAdministrationUsers, saveAdministrationUsers, type AdministrationUserRecord } from './administrationUsersStore';
import { ResizeHandle, useColumnResize } from './useColumnResize';

interface RoleRecord {
  id: string;
  name: string;
  description: string;
  permissions: string;
  updatedBy?: string;
  lastUpdate?: string;
}

interface GroupPermission {
  id: string;
  context: string;
  contextName: string;
  permissions: string;
  updatedBy?: string;
  lastUpdate?: string;
}

export const GROUP_MANAGEMENT_STORAGE_KEY = 'finansu-harmonija-v6:administration:group-management';

const INITIAL_ROLES: RoleRecord[] = [
  { id: 'worker', name: 'Worker', description: 'Document processing workers', permissions: 'READ, UPDATE' },
  { id: 'team-lead', name: 'TeamLead', description: 'Document processing team leads', permissions: 'CREATE, READ, UPDATE, ACTION' },
  { id: '1', name: 'MESO', description: '—', permissions: 'CREATE' },
  { id: '2', name: 'Pwani Oil Products Limited', description: 'Students', permissions: 'CREATE' },
  { id: '3', name: 'Okanagan College', description: 'Okanagan College Students', permissions: 'CREATE' },
  { id: '4', name: 'RpaPlatform', description: 'Platform Shared resources', permissions: 'ACTION, UPDATE, DELETE, READ, CREATE' },
  { id: '5', name: 'AzerConnect Guests', description: 'Students from Azerconnect', permissions: 'CREATE' },
  { id: '6', name: 'PROD.IBA_INVOICE_PROCESSING', description: 'Internal automation role', permissions: 'CREATE' },
  { id: '7', name: 'OnlyOwnEntities', description: '—', permissions: 'CREATE' },
  { id: '8', name: 'Administrators', description: 'Administrators', permissions: 'CREATE, UPDATE, ACTION, DELETE, READ' },
  { id: '9', name: 'Monitors', description: 'Read-only system monitoring', permissions: 'READ' },
  { id: '10', name: 'Nodes', description: 'Nodes', permissions: 'ACTION, READ' },
];

export function getAdministrationGroupNames(): string[] {
  if (typeof window === 'undefined') return INITIAL_ROLES.map(role => role.name);
  try {
    const stored = window.localStorage.getItem(GROUP_MANAGEMENT_STORAGE_KEY);
    const roles = stored ? JSON.parse(stored) as RoleRecord[] : INITIAL_ROLES;
    return roles.map(role => role.name);
  } catch {
    return INITIAL_ROLES.map(role => role.name);
  }
}

const DEFAULT_COLUMNS: ColConfig[] = [
  { key: 'name', label: 'Name', width: 330, visible: true },
  { key: 'description', label: 'Description', width: 420, visible: true },
  { key: 'permissions', label: 'Permissions', width: 430, visible: true },
  { key: 'updatedBy', label: 'Updated By', width: 190, visible: false },
  { key: 'lastUpdate', label: 'Last Update', width: 180, visible: false },
];

const ROLE_DETAIL_COLUMNS: ColConfig[] = [
  { key: 'context', label: 'Menu item', width: 360, visible: true },
  { key: 'permissions', label: 'Permissions', width: 690, visible: true },
  { key: 'updatedBy', label: 'Updated By', width: 190, visible: false },
  { key: 'lastUpdate', label: 'Last Update', width: 180, visible: false },
];

const ROLE_USER_COLUMNS: ColConfig[] = [
  { key: 'username', label: 'Username', width: 220, visible: true },
  { key: 'fullName', label: 'Full Name', width: 260, visible: true },
  { key: 'email', label: 'E-mail', width: 290, visible: true },
  { key: 'status', label: 'Status', width: 150, visible: true },
  { key: 'groups', label: 'Groups', width: 280, visible: true },
  { key: 'updatedBy', label: 'Updated By', width: 190, visible: false },
  { key: 'lastUpdate', label: 'Last Update', width: 180, visible: false },
];

const ROLE_MENU_ITEMS = [
  'Automation processes',
  'Runs management',
  'Schedules',
  'Secret vault',
  'Node management',
  'Workspace',
  'Machine learning / Document sets',
  'Machine learning / Models',
  'Dashboards',
  'Administration',
];

const PERMISSION_ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ACTION'];

function buildRoleMenuPermissions(role: RoleRecord, stored?: GroupPermission[]): GroupPermission[] {
  return ROLE_MENU_ITEMS.map((menuItem, index) => {
    const saved = stored?.find(item => item.context === menuItem);
    return saved ?? {
      id: `menu-${index + 1}`,
      context: menuItem,
      contextName: 'OCR',
      permissions: role.permissions,
      updatedBy: 'Administrator',
      lastUpdate: '04.08.2026 15:24',
    };
  });
}

function RoleCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={event => { event.stopPropagation(); onChange(); }} className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
      {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

function RoleDetails({ role, onBack }: { role: RoleRecord; onBack: () => void }) {
  const permissionStorageKey = `finansu-harmonija-v6:group-permissions:${role.id}`;
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'third-party'>('roles');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(ROLE_DETAIL_COLUMNS);
  const [userColumns, setUserColumns] = useState<ColConfig[]>(ROLE_USER_COLUMNS);
  const [users, setUsers] = useState<AdministrationUserRecord[]>(getAdministrationUsers);
  const [permissions, setPermissions] = useState<GroupPermission[]>(() => {
    if (typeof window === 'undefined') return buildRoleMenuPermissions(role);
    try {
      const stored = window.localStorage.getItem(permissionStorageKey);
      return buildRoleMenuPermissions(role, stored ? JSON.parse(stored) as GroupPermission[] : undefined);
    } catch {
      return buildRoleMenuPermissions(role);
    }
  });
  const [newRole, setNewRole] = useState({ context: '', contextName: '', permissions: '' });
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);
  const visibleColumns = columns.filter(column => column.visible);
  const visibleUserColumns = userColumns.filter(column => column.visible);
  const filteredDetails = activeTab === 'roles'
    ? permissions.filter(item => `${item.context} ${item.contextName} ${item.permissions}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const { sortedRows: visibleDetails, changeSort: changeDetailSort, directionFor: detailDirectionFor } = useMultiColumnSort(filteredDetails, (row, key) => row[key as keyof GroupPermission] as string | number | undefined);
  const assignedUsers = useMemo(() => {
    const roleName = role.name.trim().toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter(user => {
      const assignedGroups = user.groups.split(',').map(group => group.trim().toLowerCase()).filter(Boolean);
      const belongsToRole = assignedGroups.includes(roleName);
      const matchesQuery = !normalizedQuery || `${user.username} ${user.fullName} ${user.email} ${user.status} ${user.groups}`.toLowerCase().includes(normalizedQuery);
      return belongsToRole && matchesQuery;
    });
  }, [query, role.name, users]);
  const currentRows = activeTab === 'roles' ? visibleDetails : activeTab === 'users' ? assignedUsers : [];
  const allSelected = currentRows.length > 0 && currentRows.every(item => selected.has(item.id));
  const isNewRoleValid = newRole.context.trim() !== '' && newRole.contextName.trim() !== '' && newRole.permissions.trim() !== '';

  const togglePermission = (rowId: string, action: string) => {
    setPermissions(current => current.map(item => {
      if (item.id !== rowId) return item;
      const selectedActions = item.permissions.split(',').map(value => value.trim()).filter(Boolean);
      const nextActions = selectedActions.includes(action) ? selectedActions.filter(value => value !== action) : [...selectedActions, action];
      return { ...item, permissions: PERMISSION_ACTIONS.filter(value => nextActions.includes(value)).join(', '), updatedBy: 'Administrator', lastUpdate: new Date().toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }) };
    }));
  };

  useEffect(() => {
    window.localStorage.setItem(permissionStorageKey, JSON.stringify(permissions));
  }, [permissionStorageKey, permissions]);

  const refreshUsers = () => setUsers(getAdministrationUsers());
  const removeSelectedUsersFromGroup = () => {
    const roleName = role.name.trim().toLowerCase();
    const nextUsers = users.map(user => selected.has(user.id)
      ? {
          ...user,
          groups: user.groups.split(',').map(group => group.trim()).filter(group => group && group.toLowerCase() !== roleName).join(', '),
          updatedBy: 'Administrator',
          lastUpdate: new Date().toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }),
        }
      : user);
    setUsers(nextUsers);
    saveAdministrationUsers(nextUsers);
    setSelected(new Set());
  };

  const tabs = [
    { id: 'roles' as const, label: 'Roles' },
    { id: 'users' as const, label: 'Users' },
    { id: 'third-party' as const, label: 'Third Party Roles' },
  ];

  return (
    <div className="flex min-h-full flex-col gap-7 bg-white px-9 py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <PageHeader
        title={`Group Details (${role.name})`}
        leading={(
          <button type="button" onClick={onBack} aria-label="Back to role list" className="text-[#7288A3] transition-colors hover:text-[#007EA7]">
            <ArrowLeft size={20} />
          </button>
        )}
        actions={<PageActionButton onClick={() => setShowAddRole(true)}>Add role</PageActionButton>}
      />

      <button type="button" onClick={onBack} className="flex w-fit items-center gap-2 font-montserrat text-[12px] font-semibold text-[#007EA7] hover:underline">
        <ArrowLeft size={16} />
        Back to list
      </button>

      <div className="flex h-10 items-end gap-10 border-b border-[#E5EDF9]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setSelected(new Set());
              setQuery('');
              if (tab.id === 'users') refreshUsers();
            }}
            className={`h-10 border-b-2 px-1 font-montserrat text-[13px] font-medium transition-colors ${
              activeTab === tab.id ? 'border-[#007EA7] text-[#007EA7]' : 'border-transparent text-[#7288A3] hover:text-[#10233A]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-montserrat text-[11px] font-medium text-[#7288A3]">Search by text</span>
            <OcrSearchField ariaLabel="Search group details" value={query} onChange={setQuery} />
          </div>
          <div className="flex h-7 items-center gap-4">
            <RefreshAllButton onRefresh={activeTab === 'users' ? refreshUsers : () => setPermissions(current => current.map(permission => ({ ...permission })))} />
            <BulkDeleteButton
              selectedCount={selected.size}
              onDelete={activeTab === 'users' ? removeSelectedUsersFromGroup : () => {
                  setPermissions(current => current.filter(item => !selected.has(item.id)));
                  setSelected(new Set());
                }}
            />
          </div>
        </div>
        <ColumnSettingsButton onClick={() => setShowColumns(true)} />
      </div>

      <div className="flex min-h-[540px] flex-col gap-6">
        <div ref={tableScrollRef} className="min-h-[500px] overflow-x-auto scrollbar-hide">
          {activeTab === 'roles' ? <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) + 88 }}>
            <div className="flex h-11 items-center border-b border-[#E5EDF9]">
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 items-center px-3">
                <RoleCheckbox
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visibleDetails.map(item => item.id)))}
                  label="Select all group permissions"
                />
              </div>
              {visibleColumns.map((column, index) => { const realIndex = columns.findIndex(item => item.key === column.key); return (
                <div key={column.key} className="relative flex h-11 flex-shrink-0 items-center gap-1 px-3" style={{ width: column.width }}>
                  <span className={`truncate font-montserrat text-[12px] font-medium leading-[18px] ${index === 0 ? 'text-[#10233A]' : 'text-[#7288A3]'}`}>{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={detailDirectionFor(column.key)} onDirectionChange={direction => changeDetailSort(column.key, direction)} />
                  <ResizeHandle onMouseDown={event => startResize(realIndex, event)} />
                </div>
              )})}
              <div className="w-[46px] flex-shrink-0" />
            </div>

            {visibleDetails.map(detailRow => (
              <div key={detailRow.id} className="flex h-11 items-center border-b border-[#E5EDF9] bg-white transition-colors hover:bg-[#F8FDFF]">
                <div className="flex w-[42px] flex-shrink-0 items-center px-3">
                  <RoleCheckbox
                    checked={selected.has(detailRow.id)}
                    onChange={() => setSelected(current => {
                      const next = new Set(current);
                      if (next.has(detailRow.id)) next.delete(detailRow.id);
                      else next.add(detailRow.id);
                      return next;
                    })}
                    label={`Select ${detailRow.context} permission`}
                  />
                </div>
                {visibleColumns.map(column => (
                  <div key={column.key} className="flex h-10 flex-shrink-0 items-center overflow-hidden px-3" style={{ width: column.width }}>
                    {column.key === 'permissions' ? <div className="flex items-center gap-4">{PERMISSION_ACTIONS.map(action => {
                      const checked = detailRow.permissions.split(',').map(value => value.trim()).includes(action);
                      return <button key={action} type="button" onClick={() => togglePermission(detailRow.id, action)} className="flex items-center gap-1.5 font-montserrat text-[11px] font-medium text-[#10233A]"><span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>{checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>{action}</button>;
                    })}</div> : <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{detailRow[column.key as keyof typeof detailRow]}</span>}
                  </div>
                ))}
                <div className="flex w-[46px] flex-shrink-0 justify-end pr-1">
                  <button
                    type="button"
                    aria-label="Delete group permission"
                    title="DELETE"
                    onClick={() => {
                      setPermissions(current => current.filter(item => item.id !== detailRow.id));
                      setSelected(current => {
                        const next = new Set(current);
                        next.delete(detailRow.id);
                        return next;
                      });
                    }}
                    className="flex h-7 w-7 items-center justify-center text-[#A1B6C6] transition-colors hover:text-[#D64545]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            {visibleDetails.length === 0 && (
              <div className="flex min-h-[180px] items-center justify-center font-montserrat text-[13px] font-medium text-[#7288A3]">
                No records
              </div>
            )}
          </div> : activeTab === 'users' ? <div style={{ minWidth: visibleUserColumns.reduce((sum, column) => sum + column.width, 0) + 88 }}>
            <div className="flex h-11 items-center border-b border-[#E5EDF9]">
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 items-center px-3">
                <RoleCheckbox checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(assignedUsers.map(user => user.id)))} label="Select all assigned users" />
              </div>
              {visibleUserColumns.map((column, index) => (
                <div key={column.key} className="flex h-11 flex-shrink-0 items-center px-3" style={{ width: column.width }}>
                  <span className={`truncate font-montserrat text-[12px] font-medium leading-[18px] ${index === 0 ? 'text-[#10233A]' : 'text-[#7288A3]'}`}>{column.label}</span>
                </div>
              ))}
              <div className="w-[46px] flex-shrink-0" />
            </div>

            {assignedUsers.map((user, index) => (
              <div key={user.id} className={`flex h-11 items-center border-b border-[#E5EDF9] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                <div className="flex w-[42px] flex-shrink-0 items-center px-3">
                  <RoleCheckbox checked={selected.has(user.id)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(user.id)) next.delete(user.id); else next.add(user.id); return next; })} label={`Select ${user.username}`} />
                </div>
                {visibleUserColumns.map(column => (
                  <div key={column.key} className="flex h-10 flex-shrink-0 items-center overflow-hidden px-3" style={{ width: column.width }}>
                    {column.key === 'status' ? <span className="flex items-center gap-2 font-montserrat text-[12px] text-[#10233A]"><span className={`h-2 w-2 rounded-full ${user.status === 'Enabled' ? 'bg-[#45B759]' : 'bg-[#A1B6C6]'}`} />{user.status}</span> : <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{column.key === 'updatedBy' ? (user.updatedBy || user.createdBy) : column.key === 'lastUpdate' ? (user.lastUpdate || user.creationDate) : user[column.key as 'username' | 'fullName' | 'email' | 'groups']}</span>}
                  </div>
                ))}
                <div className="w-[46px] flex-shrink-0" />
              </div>
            ))}

            {assignedUsers.length === 0 && <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center"><UsersRound size={30} className="text-[#A1B6C6]" /><span className="font-montserrat text-[14px] font-semibold text-[#7288A3]">No users assigned to {role.name}</span><span className="font-montserrat text-[12px] text-[#A1B6C6]">Assign this group in Administration / User Management.</span></div>}
          </div> : <div className="flex min-h-[300px] items-center justify-center font-montserrat text-[13px] font-medium text-[#7288A3]">No third party roles assigned</div>}
        </div>

        <HorizontalTableScrollbar scrollRef={tableScrollRef} />
        <div className="flex h-8 items-center justify-between">
          <TablePagination currentPage={1} totalPages={1} itemCount={currentRows.length} onPageChange={() => undefined} />
        </div>
      </div>

      {showColumns && <ColumnSettingsPanel columns={activeTab === 'users' ? userColumns : columns} defaultColumns={activeTab === 'users' ? ROLE_USER_COLUMNS : ROLE_DETAIL_COLUMNS} onSave={activeTab === 'users' ? setUserColumns : setColumns} onClose={() => setShowColumns(false)} />}
      {showAddRole && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#10233A]/20">
          <div className="flex h-full w-[380px] max-w-full flex-col bg-white p-6 shadow-[-2px_0_0_#E5EDF9]">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-montserrat text-[22px] font-semibold leading-8 text-[#10233A]">Add role</h2>
              <button type="button" aria-label="Close add role" onClick={() => setShowAddRole(false)} className="text-[#7288A3] transition-colors hover:text-[#10233A]">
                <X size={24} />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {[
                { key: 'context' as const, label: 'Context', placeholder: 'Enter context' },
                { key: 'contextName' as const, label: 'Context Name', placeholder: 'Enter context name' },
                { key: 'permissions' as const, label: 'Permissions', placeholder: 'Enter permissions' },
              ].map(field => (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                    {field.label} <span className="text-[#D64545]">*</span>
                  </span>
                  <input
                    value={newRole[field.key]}
                    onChange={event => setNewRole(current => ({ ...current, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                    className="h-10 rounded border border-[#D3E1EC] px-3 font-montserrat text-[13px] text-[#10233A] outline-none transition-colors placeholder:text-[#A1B6C6] focus:border-[#007EA7]"
                  />
                </label>
              ))}
            </div>

            <div className="mt-auto flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddRole(false);
                  setNewRole({ context: '', contextName: '', permissions: '' });
                }}
                className="h-10 rounded-lg border-2 border-[#D3E1EC] bg-white px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isNewRoleValid}
                onClick={() => {
                  setPermissions(current => [...current, {
                    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
                    context: newRole.context.trim(),
                    contextName: newRole.contextName.trim(),
                    permissions: newRole.permissions.trim(),
                  }]);
                  setNewRole({ context: '', contextName: '', permissions: '' });
                  setShowAddRole(false);
                  setActiveTab('roles');
                  setQuery('');
                }}
                className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AutomationSecurityAccessView() {
  const [roles, setRoles] = useState<RoleRecord[]>(() => {
    if (typeof window === 'undefined') return INITIAL_ROLES;
    try {
      const stored = window.localStorage.getItem(GROUP_MANAGEMENT_STORAGE_KEY);
      return stored ? JSON.parse(stored) as RoleRecord[] : INITIAL_ROLES;
    } catch {
      return INITIAL_ROLES;
    }
  });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColConfig[]>(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  useEffect(() => {
    window.localStorage.setItem(GROUP_MANAGEMENT_STORAGE_KEY, JSON.stringify(roles));
  }, [roles]);

  const visibleColumns = columns.filter(column => column.visible);
  const filteredRoles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? roles.filter(role => `${role.name} ${role.description} ${role.permissions}`.toLowerCase().includes(normalized)) : [...roles];
  }, [query, roles]);
  const { sortedRows: displayedRoles, changeSort, directionFor } = useMultiColumnSort(filteredRoles, (row, key) => row[key as keyof RoleRecord] as string | number | undefined);

  const allSelected = displayedRoles.length > 0 && displayedRoles.every(role => selected.has(role.id));
  const toggleAll = () => setSelected(current => {
    const next = new Set(current);
    displayedRoles.forEach(role => allSelected ? next.delete(role.id) : next.add(role.id));
    return next;
  });
  const toggleRole = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const removeRoles = (ids: Set<string>) => {
    setRoles(current => current.filter(role => !ids.has(role.id)));
    setSelected(current => new Set([...current].filter(id => !ids.has(id))));
  };

  if (selectedRole) {
    return <RoleDetails role={selectedRole} onBack={() => setSelectedRole(null)} />;
  }

  return (
    <div className="flex min-h-full flex-col gap-8 bg-white px-9 py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <PageHeader
        title="Group Management"
        actions={<><PageActionButton icon={<UsersRound size={16} />} onClick={() => { setQuery(''); setSelected(new Set()); setPage(1); }}>Show all groups</PageActionButton><PageActionButton disabled>Add</PageActionButton><PageActionButton disabled>Create new</PageActionButton></>}
      />

      <div className="flex items-center gap-2">
        <span className="font-montserrat text-[12px] font-medium text-[#7288A3]">OCR</span>
        <span className="text-[#A1B6C6]">/</span>
        <span className="font-montserrat text-[12px] font-medium text-[#A1B6C6]">Administration</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <OcrSearchField ariaLabel="Search roles" value={query} onChange={value => { setQuery(value); setPage(1); }} />
        <div className="flex items-center gap-4">
          <BulkDeleteButton selectedCount={selected.size} onDelete={() => removeRoles(selected)} />
          <RefreshAllButton onRefresh={() => setRoles(current => current.map(role => ({ ...role })))} />
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
          <div style={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 0) + 88 }}>
            <div className="mb-4 flex h-5 items-center">
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 items-center px-3"><RoleCheckbox checked={allSelected} onChange={toggleAll} label="Select all roles" /></div>
              {visibleColumns.map((column, index) => { const realIndex = columns.findIndex(item => item.key === column.key); return (
                <div key={column.key} className={`relative flex h-5 flex-shrink-0 items-center gap-1 px-3 ${index > 0 ? 'border-l border-[#D3E1EC]' : ''}`} style={{ width: column.width }}>
                  <span className={`truncate font-montserrat text-[12px] font-medium leading-[18px] ${index === 0 ? 'text-[#10233A]' : 'text-[#7288A3]'}`}>{column.label}</span>
                  <ColumnSortButton columnLabel={column.label} direction={directionFor(column.key)} onDirectionChange={direction => changeSort(column.key, direction)} />
                  <ResizeHandle onMouseDown={event => startResize(realIndex, event)} />
                </div>
              )})}
              <div className="w-[46px] flex-shrink-0" />
            </div>

            <div className="flex flex-col">
              {displayedRoles.map((role, index) => (
                <div
                  key={role.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${role.name} group details`}
                  onClick={() => setSelectedRole(role)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRole(role);
                    }
                  }}
                  className={`flex h-10 cursor-pointer items-center rounded-lg transition-colors ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'} hover:bg-[#E7F4F9]`}
                >
                  <div className="flex w-[42px] flex-shrink-0 items-center px-3"><RoleCheckbox checked={selected.has(role.id)} onChange={() => toggleRole(role.id)} label={`Select role ${role.name}`} /></div>
                  {visibleColumns.map(column => (
                    <div key={column.key} className="flex h-10 flex-shrink-0 items-center overflow-hidden px-3" style={{ width: column.width }}>
                      {column.key === 'name'
                        ? <button type="button" onClick={() => setSelectedRole(role)} className="truncate text-left font-montserrat text-[12px] font-medium leading-[18px] text-[#007EA7] hover:underline">{role.name}</button>
                        : <span className="truncate font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]">{column.key === 'updatedBy' ? (role.updatedBy || 'Administrator') : column.key === 'lastUpdate' ? (role.lastUpdate || '04.08.2026 15:24') : role[column.key as 'description' | 'permissions']}</span>}
                    </div>
                  ))}
                  <div className="flex w-[46px] flex-shrink-0 justify-end pr-1"><RowDeleteButton label={`Delete role ${role.name}`} onDelete={() => removeRoles(new Set([role.id]))} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <HorizontalTableScrollbar scrollRef={tableScrollRef} />
        <div className="flex h-8 items-center justify-between">
          <TablePagination currentPage={page} totalPages={1} itemCount={displayedRoles.length} onPageChange={setPage} />
        </div>
      </div>

      {showColumns && <ColumnSettingsPanel columns={columns} defaultColumns={DEFAULT_COLUMNS} onSave={setColumns} onClose={() => setShowColumns(false)} />}
    </div>
  );
}
