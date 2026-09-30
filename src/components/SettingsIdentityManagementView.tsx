import { toggleFilteredSelection } from '../lib/tableSelection';
import { isInactiveRecord, isRecordLinked, removeOrDeactivateRecords } from '../lib/recordLifecycle';
import { TABLE_BATCH_SIZE } from "../lib/tablePaging";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  FileText,
  ImagePlus,
  Mail,
  KeyRound,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { PageActionButton, PageHeader } from "./PageHeader";
import OcrSearchField from "./OcrSearchField";
import RefreshAllButton from "./RefreshAllButton";
import SearchableSelect from './SearchableSelect';
import { useDropdownDismiss } from './useDropdownDismiss';
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { supabase, type Company } from "../lib/supabase";
import { organizationInternalUsers, loadOrganizationUserIds } from '../lib/linkedSettingsData';
import {
  createFullAccess,
  createFullMenuAccess,
  createMenuAccessFromModules,
  deriveModuleAccess,
  flattenRoleAccessTree,
  isSystemAdministratorRole,
  migrateDocumentTypeMenuKey,
  ROLE_ACCESS_TREE,
  ROLE_MENU_ITEMS,
  parseMenuVisibility,
  type AccessMap,
  type MenuAccessMap,
  type RoleAccessNode,
} from "../lib/accessControl";
import {
  notifySettingsDataChanged,
  saveLinkedDirectoryUsers,
  setUserOrganizationsAndSyncCards,
} from "../lib/linkedSettingsData";

type Audience = "Internal users" | "External users";
type Section = "Roles" | "Users";
type DirectoryRow = { id: string; [key: string]: string };
type OrganizationOption = {
  id: string;
  name: string;
  company_status?: string;
  status?: string;
};

const ROLE_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", width: 270, visible: true },
  { key: "description", label: "Description", width: 360, visible: true },
  { key: "assignedUsers", label: "Assigned users", width: 300, visible: true },
  { key: "lastUpdate", label: "Last Update", width: 180, visible: true },
  { key: "createdBy", label: "Created by", width: 180, visible: true },
  { key: "permissions", label: "Permissions", width: 360, visible: false },
  { key: "creationDate", label: "Creation date", width: 180, visible: false },
  { key: "updatedBy", label: "Updated By", width: 180, visible: false },
];

const USER_COLUMNS: ColConfig[] = [
  { key: "username", label: "Name", width: 210, visible: true },
  { key: "email", label: "E-mail", width: 250, visible: true },
  { key: "phone", label: "Phone number", width: 180, visible: true },
  { key: "fullName", label: "Full Name", width: 220, visible: true },
  { key: "status", label: "Status", width: 130, visible: true },
  { key: "roles", label: "Roles", width: 260, visible: true },
  { key: "createdBy", label: "Created by", width: 180, visible: true },
  { key: "creationDate", label: "Creation date", width: 180, visible: true },
  { key: "updatedBy", label: "Updated By", width: 180, visible: false },
  { key: "lastUpdate", label: "Last Update", width: 180, visible: false },
];

const INTERNAL_USER_COLUMNS: ColConfig[] = [
  ...USER_COLUMNS.filter(column => column.key === 'fullName'),
  ...USER_COLUMNS.filter(column => column.key === 'email' || column.key === 'phone'),
  { key: "position", label: "Position", width: 190, visible: true },
  {
    key: "organizations",
    label: "Assigned organizations",
    width: 240,
    visible: true,
  },
  ...USER_COLUMNS.slice(4).map(column => ({
    ...column,
    visible: ['createdBy', 'creationDate', 'updatedBy', 'lastUpdate'].includes(column.key) ? false : column.visible,
  })),
  { key: 'lastLogin', label: 'Last login', width: 190, visible: true },
];

function internalUserStatus(status?: string): string {
  switch (status?.trim().toLowerCase()) {
    case 'enabled':
    case 'active': return 'Active';
    case 'inactive':
    case 'deactivated': return 'Inactive';
    case 'disabled':
    case 'blocked': return 'Blocked';
    default: return 'Unactivated';
  }
}

const PERMISSIONS = ["CREATE", "READ", "UPDATE", "DELETE", "ACTION"];
const VISIBLE_ACTION_PERMISSIONS = ['CREATE', 'DELETE'];
// Navigation groups, retained documents and audit records are not physically deletable.
const NON_DELETABLE_MENU_IDS = new Set([
  'global-dashboard', 'dashboard', 'uploaded-documents', 'notifications',
  'settings-analytics', 'ocr-all-documents-processed', 'ocr-all-documents-uploaded',
  'ocr-review-approve-documents', 'ocr-review-analytics', 'ocr-admin-activity',
]);
const allowsRoleDelete = (node: RoleAccessNode) => !node.children?.length && !NON_DELETABLE_MENU_IDS.has(node.id);
const DIRECTORY_ROWS_PER_PAGE = TABLE_BATCH_SIZE;
const INVITATION_TEMPLATES = [
  {
    id: "standard",
    label: "Standard invitation",
    message:
      "Hello,\n\nYou have been invited to join Finansų harmonija. Please use the invitation link to create your password and sign in to the system.\n\nBest regards,\nFinansų harmonija team",
  },
  {
    id: "organization-access",
    label: "Organization access",
    message:
      "Hello,\n\nAccess to your organization in Finansų harmonija has been prepared. Please use the invitation link to activate your account and review the assigned information.\n\nBest regards,\nFinansų harmonija team",
  },
  {
    id: "external-collaborator",
    label: "External collaborator",
    message:
      "Hello,\n\nYou have been invited as an external user of Finansų harmonija. Please follow the invitation link to activate your account and access the assigned workspace.\n\nBest regards,\nFinansų harmonija team",
  },
];
const audienceKey = (audience: Audience) =>
  audience === "Internal users" ? "internal" : "external";
const storageKey = (audience: Audience, section: Section) =>
  `finansu-harmonija:v7:settings:${audienceKey(audience)}:${section.toLowerCase()}`;
const deletedStorageKey = (audience: Audience, section: Section) =>
  `${storageKey(audience, section)}:deleted`;
const organizationAssignmentKey = (
  organizationId: string,
  audience: Audience,
) =>
  `finansu-harmonija:v7:organization-users:${organizationId}:${audienceKey(audience)}`;

function isActiveOrganization(organization: OrganizationOption) {
  const status = (
    organization.company_status ??
    organization.status ??
    "Active"
  )
    .trim()
    .toLowerCase();
  return status === "active" || status === "enabled";
}

function readOrganizationAssignments(
  organizationId: string,
  audience: Audience,
) {
  try {
    return new Set<string>(
      JSON.parse(
        localStorage.getItem(
          organizationAssignmentKey(organizationId, audience),
        ) ?? "[]",
      ) as string[],
    );
  } catch {
    return new Set<string>();
  }
}

const timestamp = () =>
  new Date().toLocaleString("lt-LT", {
    dateStyle: "short",
    timeStyle: "short",
  });

function builtInRows(audience: Audience, section: Section): DirectoryRow[] {
  if (audience !== "Internal users") return [];
  const administratorAccess = createFullAccess();
  const accountantAccess = createFullAccess();
  accountantAccess.ocr = { view: false, edit: false };
  if (section === "Roles") {
    return [
      {
        id: "role-system-administrator",
        name: "Administrator",
        description: "Full system access",
        permissions: PERMISSIONS.join(", "),
        moduleAccess: JSON.stringify(administratorAccess),
        createdBy: "System",
        creationDate: "11.08.2026",
        updatedBy: "System",
        lastUpdate: "11.08.2026",
      },
      {
        id: "role-system-meso-accountant",
        name: "Meso accountant",
        description: "All modules except OCR",
        permissions: PERMISSIONS.join(", "),
        moduleAccess: JSON.stringify(accountantAccess),
        createdBy: "System",
        creationDate: "11.08.2026",
        updatedBy: "System",
        lastUpdate: "11.08.2026",
      },
    ];
  }
  return [
    {
      id: "user-system-administrator",
      username: "albertborkvski",
      email: "albertborkvski@gmail.com",
      phone: "+370 670 00000",
      fullName: "Albert Borkovski",
      position: "Administrator",
      organizations: "All organizations",
      sodraUser: "",
      sodraPassword: "",
      edsUser: "",
      edsPassword: "",
      profileImage: "",
      lastLogin: "12.08.2026 09:14",
      loginHistory: JSON.stringify([
        {
          date: "12.08.2026 09:14",
          device: "Chrome · Vilnius",
          status: "Successful",
        },
        {
          date: "11.08.2026 16:42",
          device: "Chrome · Vilnius",
          status: "Successful",
        },
      ]),
      activityLog: JSON.stringify([
        {
          date: "12.08.2026 09:20",
          action: "Updated organization settings",
        },
        {
          date: "11.08.2026 14:08",
          action: "Edited document INV-2026-004",
        },
      ]),
      documentsCreated: "18",
      documentsEdited: "42",
      status: "Enabled",
      roles: "Administrator",
      createdBy: "System",
      creationDate: "11.08.2026",
      updatedBy: "System",
      lastUpdate: "11.08.2026",
    },
    {
      id: "user-system-meso-accountant",
      username: "albert.borkovski",
      email: "albert.borkovski@yahoo.com",
      phone: "+370 670 00001",
      fullName: "Albert Borkovski",
      position: "Meso accountant",
      organizations: "John Brick, Alice Stone",
      sodraUser: "",
      sodraPassword: "",
      edsUser: "",
      edsPassword: "",
      profileImage: "",
      lastLogin: "12.08.2026 08:57",
      loginHistory: JSON.stringify([
        {
          date: "12.08.2026 08:57",
          device: "Chrome · Vilnius",
          status: "Successful",
        },
      ]),
      activityLog: JSON.stringify([
        {
          date: "12.08.2026 09:05",
          action: "Reviewed document INV-2026-011",
        },
      ]),
      documentsCreated: "7",
      documentsEdited: "23",
      status: "Enabled",
      roles: "Meso accountant",
      createdBy: "System",
      creationDate: "11.08.2026",
      updatedBy: "System",
      lastUpdate: "11.08.2026",
    },
  ];
}

function isProtectedSystemRole(audience: Audience, row?: DirectoryRow): boolean {
  if (!row) return false;
  return isSystemAdministratorRole(row.name) || builtInRows(audience, 'Roles').some(
    base => base.id === row.id || base.name.toLowerCase() === row.name?.trim().toLowerCase(),
  );
}

function loadRows(audience: Audience, section: Section): DirectoryRow[] {
  let stored: DirectoryRow[] = [];
  let deletedIds = new Set<string>();
  try {
    stored = JSON.parse(
      localStorage.getItem(storageKey(audience, section)) ?? "[]",
    ) as DirectoryRow[];
    deletedIds = new Set(
      JSON.parse(
        localStorage.getItem(deletedStorageKey(audience, section)) ?? "[]",
      ) as string[],
    );
  } catch {
    stored = [];
    deletedIds = new Set();
  }
  const merged = stored.filter((row) => !deletedIds.has(row.id));
  builtInRows(audience, section).forEach((systemRow) => {
    const protectedAdministrator =
      section === "Roles" && isProtectedSystemRole(audience, systemRow);
    if (deletedIds.has(systemRow.id) && !protectedAdministrator) return;
    const matchIndex = merged.findIndex(
      (row) =>
        row.id === systemRow.id ||
        (section === "Roles"
          ? row.name === systemRow.name
          : row.email?.toLowerCase() === systemRow.email?.toLowerCase()),
    );
    if (matchIndex < 0) {
      merged.unshift(systemRow);
    } else {
      merged[matchIndex] = { ...systemRow, ...merged[matchIndex] };
    }
  });
  return merged.map((row) => {
    if (section === "Users") return { ...row, status: internalUserStatus(row.status) };
    if (!isSystemAdministratorRole(row.name)) return row;
    return {
      ...row,
      description: "Full system access · all current and future records",
      permissions: PERMISSIONS.join(", "),
      moduleAccess: JSON.stringify(createFullAccess()),
      managedOrganizations: "ALL",
      managedUsers: "ALL",
      managedRoles: "ALL",
    };
  });
}

function persistRows(
  audience: Audience,
  section: Section,
  rows: DirectoryRow[],
) {
  localStorage.setItem(storageKey(audience, section), JSON.stringify(rows));
  if (section === "Users") {
    saveLinkedDirectoryUsers(audience, rows, false);
  }
  notifySettingsDataChanged(section.toLowerCase());
}

function isDirectoryRowLinked(audience: Audience, section: Section, row: DirectoryRow): boolean {
  if (isRecordLinked(row, storageKey(audience, section))) return true;
  if (section === 'Roles') {
    const roleName = row.name?.trim().toLocaleLowerCase();
    return loadRows(audience, 'Users').some((user) => (user.roles ?? '').split(',')
      .some((role) => role.trim().toLocaleLowerCase() === roleName));
  }
  const hasAssignment = (value: string | undefined) => Boolean(value?.split(',')
    .some((item) => !['', 'unassigned', 'none', '—'].includes(item.trim().toLocaleLowerCase())));
  if (hasAssignment(row.roles) || hasAssignment(row.organizations)
    || Number(row.documentsCreated) > 0 || Number(row.documentsEdited) > 0) return true;
  return ['activityLog', 'loginHistory'].some((field) => {
    try {
      const entries: unknown = JSON.parse(row[field] || '[]');
      return Array.isArray(entries) && entries.length > 0;
    } catch { return Boolean(row[field]); }
  });
}

function readDeletedIds(audience: Audience, section: Section) {
  try {
    return new Set<string>(
      JSON.parse(
        localStorage.getItem(deletedStorageKey(audience, section)) ?? "[]",
      ) as string[],
    );
  } catch {
    return new Set<string>();
  }
}

function persistDeletedIds(
  audience: Audience,
  section: Section,
  ids: Set<string>,
) {
  localStorage.setItem(
    deletedStorageKey(audience, section),
    JSON.stringify(Array.from(ids)),
  );
}

function saveRoleAssignments(
  audience: Audience,
  previousRoleName: string,
  roleName: string,
  assignedUserIds: string[],
) {
  const users = loadRows(audience, "Users").map((user) => {
    const roles = (user.roles ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(
        (value) =>
          value && value !== "Unassigned" && value !== previousRoleName,
      );
    if (assignedUserIds.includes(user.id)) roles.push(roleName);
    return {
      ...user,
      roles: Array.from(new Set(roles)).join(", ") || "Unassigned",
      updatedBy: "Administrator",
      lastUpdate: timestamp(),
    };
  });
  localStorage.setItem(storageKey(audience, "Users"), JSON.stringify(users));
  notifySettingsDataChanged("role-assignments");
}

function FittingSelection({ values, placeholder }: { values: string[]; placeholder: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const measurements = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(0);
  const chip = 'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded border border-[#E5EDF9] bg-white px-2 font-medium';
  useLayoutEffect(() => {
    const measure = () => {
      if (!container.current || !measurements.current) return;
      const nodes = measurements.current.children;
      const width = container.current.clientWidth;
      let used = 0;
      let fitting = 0;
      for (let i = 0; i < values.length; i++) {
        used += (nodes[i] as HTMLElement).getBoundingClientRect().width + (i ? 4 : 0);
        const remaining = values.length - i - 1;
        const badge = remaining ? (nodes[values.length + remaining - 1] as HTMLElement).getBoundingClientRect().width + 4 : 0;
        if (used + badge <= width) fitting = i + 1;
      }
      setCount(fitting);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    if (measurements.current) observer.observe(measurements.current);
    return () => observer.disconnect();
  }, [values]);
  return <span ref={container} className="relative flex h-6 min-w-0 flex-1 items-center gap-1 overflow-hidden font-montserrat text-[12px] text-[#10233A]" title={values.join(', ')}>
    {!values.length && <span className="text-[#A1B6C6]">{placeholder}</span>}
    {values.slice(0, count).map(value => <span key={value} className={chip}>{value}</span>)}
    {values.length > count && <span className={`${chip} bg-[#F8FDFF] text-[#007EA7]`}>+{values.length - count}</span>}
    <span ref={measurements} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1">
      {values.map(value => <span key={value} className={chip}>{value}</span>)}
      {values.map((_, index) => <span key={`count-${index}`} className={chip}>+{index + 1}</span>)}
    </span>
  </span>;
}

function CheckBox({
  checked,
  onChange,
  label,
  disabled = false,
  disabledReason = 'Physical deletion is not available for this item',
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border disabled:cursor-not-allowed disabled:border-[#D3E1EC] disabled:bg-[#E5EDF9] ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={12} className={disabled ? 'text-[#7288A3]' : 'text-white'} />}
    </button>
  );
}

function readRoles(audience: Audience) {
  return loadRows(audience, "Roles")
    .filter((role) => !isInactiveRecord(role))
    .map((role) => role.name)
    .filter(Boolean);
}

function RoleAccessTree({
  nodes,
  access,
  locked,
  depth = 0,
  onToggle,
  actionPermissions,
  onToggleAction,
}: {
  nodes: RoleAccessNode[];
  access: MenuAccessMap;
  locked: boolean;
  depth?: number;
  onToggle: (node: RoleAccessNode, key: "view" | "edit") => void;
  actionPermissions: Record<string, string[]>;
  onToggleAction: (nodeId: string, action: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {nodes.filter(node => node.label?.trim() && node.id !== 'info').map((node) => {
        const permission = access[node.id] ?? { view: false, edit: false };
        const hasChildren = Boolean(node.children?.length);
        return (
          <div key={node.id}>
            <div
              className={`grid min-h-10 grid-cols-[minmax(240px,1fr)_repeat(4,76px)] items-center rounded-md border [&>button]:justify-self-center ${depth === 0 ? "border-[#D3E1EC] bg-white" : "border-transparent bg-[#F8FBFD]"}`}
            >
              <div className="flex min-w-0 items-center gap-2 px-3" style={{ paddingLeft: 12 + depth * 22 }}>
                {hasChildren ? (
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 text-[#7288A3] transition-transform ${permission.view ? "rotate-180" : ""}`}
                  />
                ) : (
                  <span className="h-[14px] w-[14px] flex-shrink-0" />
                )}
                <span className="truncate font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A]" title={node.label}>
                  {node.label}
                </span>
              </div>
              <div className="flex h-10 items-center justify-center border-l border-[#E5EDF9]"><CheckBox
                checked={locked || permission.view}
                disabled={locked}
                disabledReason="Administrator permissions are protected and cannot be removed"
                label={`View ${node.label}`}
                onChange={() => {
                  if (!locked) onToggle(node, "view");
                }}
              /></div>
              <div className="flex h-10 items-center justify-center border-l border-[#E5EDF9]"><CheckBox
                checked={locked || permission.edit}
                disabled={locked}
                disabledReason="Administrator permissions are protected and cannot be removed"
                label={`Edit ${node.label}`}
                onChange={() => {
                  if (!locked) onToggle(node, "edit");
                }}
              /></div>
              {VISIBLE_ACTION_PERMISSIONS.map(action => {
                const unavailable = action === 'DELETE' && !allowsRoleDelete(node);
                return <div key={action} className="flex h-10 items-center justify-center border-l border-[#E5EDF9]"><CheckBox disabled={locked || unavailable} disabledReason={unavailable ? 'Physical deletion is not available for this item' : 'Administrator permissions are protected and cannot be removed'} checked={!unavailable && (locked || (actionPermissions[node.id] ?? []).includes(action))} label={`${action} ${node.label}`} onChange={() => { if (!locked && !unavailable) onToggleAction(node.id, action); }} /></div>;
              })}
            </div>
            {hasChildren && permission.view && (
              <div className="mt-1">
                <RoleAccessTree
                  nodes={node.children ?? []}
                  access={access}
                  locked={locked}
                  depth={depth + 1}
                  onToggle={onToggle}
                  actionPermissions={actionPermissions}
                  onToggleAction={onToggleAction}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RolePanel({
  audience = "Internal users",
  initial,
  template,
  onClose,
  onSave,
}: {
  audience?: Audience;
  initial?: DirectoryRow;
  template?: DirectoryRow;
  onClose: () => void;
  onSave: (row: DirectoryRow) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const isSystemAdministrator = isSystemAdministratorRole(
    initial?.name ?? name,
  );
  const configuration = initial ?? template;
  const [actionPermissions, setActionPermissions] = useState<Record<string, string[]>>(() => {
    try {
      if (configuration?.actionPermissions) return migrateDocumentTypeMenuKey(JSON.parse(configuration.actionPermissions) as Record<string, string[]>);
    } catch { /* Older roles use the shared action configuration. */ }
    const inherited = (configuration?.permissions ?? '').split(',').map(value => value.trim()).filter(value => PERMISSIONS.includes(value));
    return Object.fromEntries(flattenRoleAccessTree(ROLE_ACCESS_TREE).map(node => [node.id, [...inherited]]));
  });
  const [description, setDescription] = useState(configuration?.description ?? "");
  const [permissions, setPermissions] = useState(
    (configuration?.permissions ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>(() => {
    try {
      const moduleAccess = configuration?.moduleAccess
        ? (JSON.parse(configuration.moduleAccess) as AccessMap)
        : deriveModuleAccess({});
      return configuration?.menuAccess
        ? migrateDocumentTypeMenuKey(JSON.parse(configuration.menuAccess) as MenuAccessMap)
        : createMenuAccessFromModules(moduleAccess);
    } catch {
      return createMenuAccessFromModules(deriveModuleAccess({}));
    }
  });
  const [menuVisibility, setMenuVisibility] = useState(() => parseMenuVisibility(configuration?.menuVisibility, menuAccess));
  const availableUsers = useMemo(
    () => loadRows(audience, "Users").filter((user) => !isInactiveRecord(user)
      || Boolean(initial?.name && (user.roles ?? '').split(',').map((role) => role.trim()).includes(initial.name))),
    [audience, initial?.name],
  );
  const [assignedUsersOpen, setAssignedUsersOpen] = useState(false);
  const [assignedUsersQuery, setAssignedUsersQuery] = useState('');
  const assignedUsersRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(assignedUsersOpen, assignedUsersRef, () => setAssignedUsersOpen(false));
  const filteredAssignedUsers = availableUsers.filter(user =>
    `${user.fullName ?? ''} ${user.username ?? ''} ${user.email ?? ''}`.toLocaleLowerCase().includes(assignedUsersQuery.trim().toLocaleLowerCase()),
  );
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(() =>
    initial ? availableUsers
      .filter((user) =>
        (user.roles ?? "")
          .split(",")
          .map((value) => value.trim())
          .includes(initial?.name ?? ""),
      )
      .map((user) => user.id) : [],
  );
  useEffect(() => {
    if (isSystemAdministrator) {
      setPermissions(PERMISSIONS);
      setMenuAccess(createFullMenuAccess());
    }
  }, [isSystemAdministrator]);
  const toggleUser = (userId: string) =>
    setAssignedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  const setMenuPermission = (node: RoleAccessNode, key: "view" | "edit") => {
    const enabling = !menuAccess[node.id]?.[key];
    setActionPermissions(current => {
      const next = { ...current };
      const actions = new Set(next[node.id] ?? []);
      if (enabling) {
        actions.add('READ');
        if (key === 'edit') actions.add('UPDATE');
      } else if (key === 'edit') actions.delete('UPDATE');
      else {
        ['READ', 'UPDATE', 'CREATE', 'DELETE'].forEach(action => actions.delete(action));
        flattenRoleAccessTree(node.children ?? []).forEach(child => { next[child.id] = (next[child.id] ?? []).filter(action => !['READ', 'UPDATE', 'CREATE', 'DELETE'].includes(action)); });
      }
      next[node.id] = [...actions];
      return next;
    });
    setMenuAccess((current) => {
      const next = { ...current };
      const currentPermission = next[node.id] ?? { view: false, edit: false };
      next[node.id] = { ...currentPermission, [key]: !currentPermission[key] };
      if (key === "edit" && next[node.id].edit) next[node.id].view = true;
      if (key === "view" && !next[node.id].view) {
        next[node.id].edit = false;
        flattenRoleAccessTree(node.children ?? []).forEach(child => {
          next[child.id] = { view: false, edit: false };
        });
      }
      return next;
    });
  };
  const setActionPermission = (nodeId: string, action: string) => {
    const selected = actionPermissions[nodeId] ?? [];
    const enabling = !selected.includes(action);
    setActionPermissions(current => {
      const next = new Set(current[nodeId] ?? []);
      if (enabling) {
        next.add(action);
        if (action === 'CREATE' || action === 'DELETE' || action === 'UPDATE') next.add('READ');
      } else {
        next.delete(action);
        if (action === 'READ') {
          next.delete('CREATE');
          next.delete('DELETE');
          next.delete('UPDATE');
        }
      }
      return { ...current, [nodeId]: [...next] };
    });
    if (action === 'READ' && !enabling) {
      setMenuAccess(current => ({ ...current, [nodeId]: { ...current[nodeId], edit: false } }));
    }
    if (enabling) setMenuAccess(current => ({ ...current, [nodeId]: { ...current[nodeId], view: true } }));
  };
  return (
    <div className="relative flex min-h-full min-w-0 flex-col items-start gap-8 overflow-y-auto bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <div className="flex w-full max-w-[1440px] flex-col gap-6">
        <PageHeader
          title={initial ? "Edit Role" : "Create new role"}
          leading={
            <button
              type="button"
              aria-label="Back to roles"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
            >
              <ArrowLeft size={20} />
            </button>
          }
        />
        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
          <span>Settings</span>
          <span>/</span>
          <span>{audience}</span>
          <span>/</span>
          <span>Roles</span>
          <span>/</span>
          <span>{initial ? "Edit Role" : "Create new role"}</span>
        </div>
        <div className="flex w-full max-w-[1180px] flex-col gap-5 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Close role form"
              onClick={onClose}
              className="text-[#7288A3]"
            >
              <X size={24} />
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Role name <span className="text-[#D64545]">*</span>
            </span>
            <input
              required
              value={name}
              readOnly={isSystemAdministrator}
              aria-readonly={isSystemAdministrator}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] outline-none focus:border-[#007EA7] read-only:cursor-not-allowed read-only:bg-[#F4F7FA] read-only:text-[#7288A3]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[76px] rounded-lg border border-[#D3E1EC] p-3 font-montserrat text-[13px] outline-none focus:border-[#007EA7]"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
              Assigned users
            </span>
            {isSystemAdministrator && (
              <span className="font-montserrat text-[11px] text-[#7288A3]">
                This role can manage every current and future record. Role
                membership remains explicit per user.
              </span>
            )}
            <div ref={assignedUsersRef} className="relative">
              <div className="relative h-10 w-full rounded-lg border border-[#D3E1EC] bg-white hover:border-[#007EA7] focus-within:border-[#007EA7]">
                <input
                  aria-label="Assigned users"
                  aria-expanded={assignedUsersOpen}
                  autoComplete="off"
                  placeholder="Select users"
                  value={assignedUsersQuery}
                  onFocus={() => setAssignedUsersOpen(true)}
                  onClick={() => setAssignedUsersOpen(true)}
                  onChange={event => { setAssignedUsersQuery(event.target.value); setAssignedUsersOpen(true); }}
                  className="h-full w-full rounded-lg bg-transparent pl-3 pr-36 font-montserrat text-[13px] text-[#10233A] outline-none placeholder:text-[#7288A3]"
                />
                <span className="pointer-events-none absolute right-10 top-0 flex h-full w-24 items-center justify-end font-montserrat text-[12px] tabular-nums text-[#7288A3]">
                  {assignedUserIds.length ? `${assignedUserIds.length} selected` : ''}
                </span>
                <button type="button" aria-label="Toggle assigned users" aria-expanded={assignedUsersOpen} onClick={() => setAssignedUsersOpen(value => !value)} className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-[#7288A3]">
                  <ChevronDown size={17} className={assignedUsersOpen ? 'rotate-180' : ''} />
                </button>
              </div>
              {assignedUsersOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
                <div className="max-h-60 overflow-y-auto overscroll-contain">
              {filteredAssignedUsers.length ? (
                filteredAssignedUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    data-record-inactive={isInactiveRecord(user)}
                    aria-pressed={assignedUserIds.includes(user.id)}
                    aria-label={`Assign ${user.fullName || user.username}`}
                    aria-disabled={isSystemAdministrator || (isInactiveRecord(user) && !assignedUserIds.includes(user.id))}
                    data-static-selection="true"
                    onClick={() => {
                      if (!isSystemAdministrator && (!isInactiveRecord(user) || assignedUserIds.includes(user.id))) toggleUser(user.id);
                    }}
                    className={`grid h-10 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 text-left ${assignedUserIds.includes(user.id) ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                  >
                    <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${assignedUserIds.includes(user.id) ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                      {assignedUserIds.includes(user.id) && <Check size={12} strokeWidth={2.5} className="text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-montserrat text-[13px] font-medium text-[#10233A]">
                        {user.fullName || user.username}
                      </span>
                      <span className="block truncate font-montserrat text-[11px] text-[#7288A3]">
                        {user.email}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <span className="block px-2 py-3 font-montserrat text-[12px] text-[#7288A3]">
                  {availableUsers.length ? 'No users found' : 'No users available'}
                </span>
              )}
                </div>
              </div>}
            </div>
          </div>
          {!(audience === 'Internal users' && initial) && <section className="flex flex-col gap-3">
            <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">Menu access</h3>
            <div className="overflow-hidden rounded-md border border-[#D3E1EC] font-montserrat text-[12px]">
              <div className="grid grid-cols-[1fr_76px] items-center bg-[#F0F6FA] text-[#7288A3] font-medium">
                <span className="px-3 py-3">Menu item</span><span className="border-l border-[#D3E1EC] py-3 text-center">Visible</span>
              </div>
              {ROLE_MENU_ITEMS.map(item => <div key={item.id} className="grid min-h-10 grid-cols-[1fr_76px] items-center border-t border-[#E5EDF9] bg-white">
                <span className="px-3 font-medium text-[#10233A]">{item.label}</span>
                <div className="flex h-10 items-center justify-center border-l border-[#E5EDF9]">
                  <CheckBox checked={isSystemAdministrator || menuVisibility[item.id]} disabled={isSystemAdministrator} disabledReason="Administrator menu access is protected and cannot be removed" label={`Visible ${item.label}`} onChange={() => setMenuVisibility(current => ({ ...current, [item.id]: !current[item.id] }))} />
                </div>
              </div>)}
            </div>
          </section>}
          <section className="flex flex-col gap-3">
            <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">Access Rights</h3>
            {isSystemAdministrator && <p className="font-montserrat text-[12px] text-[#7288A3]">Administrator permissions are protected. Settings, Internal Users, Roles and Users access cannot be removed.</p>}
          <div className="overflow-x-auto">
            <div className="flex min-w-[544px] flex-col gap-2">
              <div className="grid min-h-10 grid-cols-[minmax(240px,1fr)_repeat(4,76px)] items-center rounded-md border border-[#D3E1EC] bg-[#F0F6FA] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                <span className="px-3 text-[#10233A]">Object / Area</span>
                {['View', 'Edit', 'Create', 'Delete'].map(label => <span key={label} className="flex h-10 items-center justify-center border-l border-[#D3E1EC]">{label}</span>)}
              </div>
              <RoleAccessTree
                nodes={ROLE_ACCESS_TREE}
                access={menuAccess}
                locked={isSystemAdministrator}
                onToggle={setMenuPermission}
                actionPermissions={actionPermissions}
                onToggleAction={setActionPermission}
              />
            </div>
          </div>
          </section>
          {isSystemAdministrator && (
            <div className="grid gap-2 rounded-lg border border-[#C9E3ED] bg-[#F4FBFD] p-3 font-montserrat text-[12px] text-[#10233A] sm:grid-cols-3">
              <span>Organizations: <b>All</b></span>
              <span>Users: <b>All internal and external</b></span>
              <span>Roles: <b>All internal and external</b></span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border-2 border-[#D3E1EC] px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const roleName = name.trim();
              const savedMenuAccess = {
                ...menuAccess,
                info: { view: true, edit: true },
              };
              const savedActionPermissions: Record<string, string[]> = {
                ...actionPermissions,
                info: [...PERMISSIONS],
              };
              const normalizedActionPermissions = Object.fromEntries(flattenRoleAccessTree(ROLE_ACCESS_TREE).map(node => [
                node.id,
                (isSystemAdministrator ? PERMISSIONS : savedActionPermissions[node.id] ?? []).filter(action => action !== 'DELETE' || allowsRoleDelete(node)),
              ]));
              saveRoleAssignments(
                audience,
                initial?.name ?? roleName,
                roleName,
                assignedUserIds,
              );
              onSave({
                id: initial?.id ?? `role-${Date.now()}`,
                name: roleName,
                menuVisibility: JSON.stringify(isSystemAdministrator ? Object.fromEntries(ROLE_MENU_ITEMS.map(item => [item.id, true])) : menuVisibility),
                actionPermissions: JSON.stringify(normalizedActionPermissions),
                description: description.trim() || "—",
                permissions: isSystemAdministrator
                  ? PERMISSIONS.join(", ")
                  : PERMISSIONS.filter((value) =>
                      permissions.includes(value),
                    ).join(", ") || "—",
                moduleAccess: JSON.stringify(
                  isSystemAdministrator
                    ? createFullAccess()
                    : deriveModuleAccess(savedMenuAccess),
                ),
                menuAccess: JSON.stringify(
                  isSystemAdministrator ? createFullMenuAccess() : savedMenuAccess,
                ),
                managedOrganizations: isSystemAdministrator ? "ALL" : configuration?.managedOrganizations ?? "—",
                managedUsers: isSystemAdministrator ? "ALL" : configuration?.managedUsers ?? "—",
                managedRoles: isSystemAdministrator ? "ALL" : configuration?.managedRoles ?? "—",
                createdBy: initial?.createdBy ?? "Administrator",
                creationDate: initial?.creationDate ?? timestamp(),
                updatedBy: "Administrator",
                lastUpdate: timestamp(),
              });
            }}
            className={`h-10 rounded-lg px-5 font-montserrat text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6] ${initial ? 'border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#A1B6C6] enabled:active:border-[#007EA7] enabled:active:bg-[#007EA7] enabled:active:text-white' : 'bg-[#007EA7] text-white'}`}
          >
            {initial ? 'Save change' : 'Save role'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserPanel({
  audience,
  initial,
  onClose,
  onSave,
}: {
  audience: Audience;
  initial?: DirectoryRow;
  onClose: () => void;
  onSave: (row: DirectoryRow) => void;
}) {
  const availableRoles = useMemo(() => readRoles(audience), [audience]);
  const copySourceUsers = useMemo(() => loadRows(audience, 'Users'), [audience]);
  const [copySourceId, setCopySourceId] = useState('');
  const profileFileRef = useRef<HTMLInputElement>(null);
  const [firstName = "", ...lastNameParts] = (initial?.fullName ?? "").split(
    " ",
  );
  const [values, setValues] = useState({
    username: initial?.username ?? "",
    firstName,
    lastName: lastNameParts.join(" "),
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    position: initial?.position ?? "",
    organizations: (initial?.organizations ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    profileImage: initial?.profileImage ?? "",
    lastLogin: initial?.lastLogin ?? "No login recorded",
    loginHistory: initial?.loginHistory ?? "[]",
    activityLog: initial?.activityLog ?? "[]",
    documentsCreated: initial?.documentsCreated ?? "0",
    documentsEdited: initial?.documentsEdited ?? "0",
    roles: (initial?.roles ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    status: internalUserStatus(initial?.status),
  });
  const [rolesOpen, setRolesOpen] = useState(false);
  const [organizationsOpen, setOrganizationsOpen] = useState(false);
  const rolesRef = useRef<HTMLDivElement>(null);
  const organizationsRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusLocked = internalUserStatus(initial?.status) === 'Unactivated';
  useDropdownDismiss(statusOpen, statusRef, () => setStatusOpen(false));
  useDropdownDismiss(rolesOpen, rolesRef, () => setRolesOpen(false));
  useDropdownDismiss(organizationsOpen, organizationsRef, () => setOrganizationsOpen(false));
  const [invitationTemplateOpen, setInvitationTemplateOpen] = useState(false);
  const invitationTemplateRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(invitationTemplateOpen, invitationTemplateRef, () => setInvitationTemplateOpen(false));
  const [invitationTemplate, setInvitationTemplate] = useState(
    initial?.invitationTemplate ?? INVITATION_TEMPLATES[0].id,
  );
  const [invitationMessage, setInvitationMessage] = useState(
    initial?.invitationMessage ?? INVITATION_TEMPLATES[0].message,
  );
  const [organizationRecords, setOrganizationRecords] = useState<
    OrganizationOption[]
  >([]);
  const organizationOptions = organizationRecords.map(
    (organization) => organization.name,
  );
  useEffect(() => {
    let active = true;
    void supabase
      .from("companies")
      .select("*")
      .then(({ data }) => {
        if (!active) return;
        const activeOrganizations = (data ?? [])
          .map((company) => ({
            id: String(company.id ?? "").trim(),
            name: String(company.name ?? "").trim(),
            company_status: String(company.company_status ?? "Active"),
            status: String(company.status ?? ""),
          }))
          .filter(
            (organization) =>
              organization.id &&
              organization.name &&
              isActiveOrganization(organization),
          );
        setOrganizationRecords(activeOrganizations);
        setValues((current) => {
          const validNames = activeOrganizations
            .filter((organization) => {
              const assignments = initial?.id
                ? readOrganizationAssignments(organization.id, audience)
                : new Set<string>();
              return Boolean(initial?.id && assignments.has(initial.id));
            })
            .map((organization) => organization.name);
          return { ...current, organizations: validNames };
        });
      });
    return () => {
      active = false;
    };
  }, [audience, initial?.id]);
  const toggleRole = (role: string) =>
    setValues((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((value) => value !== role)
        : [...current.roles, role],
    }));
  const toggleOrganization = (organization: string) =>
    setValues((current) => ({
      ...current,
      organizations: current.organizations.includes(organization)
        ? current.organizations.filter((value) => value !== organization)
        : [...current.organizations, organization],
    }));
  const parseHistory = (value: string): Array<Record<string, string>> => {
    try {
      const parsed = JSON.parse(value) as Array<Record<string, string>>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const loginHistory = parseHistory(values.loginHistory);
  const activityLog = parseHistory(values.activityLog);
  const handleProfileImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () =>
      setValues((current) => ({
        ...current,
        profileImage: String(reader.result ?? ""),
      }));
    reader.readAsDataURL(file);
  };
  const valid =
    values.firstName.trim() &&
    values.lastName.trim() &&
    values.email.trim() &&
    values.roles.some(role => availableRoles.includes(role)) &&
    values.position.trim() &&
    (Boolean(initial) || invitationMessage.trim());
  const fieldClass =
    "h-10 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] outline-none focus:border-[#007EA7]";
  return (
    <div className="relative flex min-h-full min-w-0 flex-col items-start gap-8 overflow-y-auto bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <div className="flex w-full max-w-[1440px] flex-col gap-6">
        <PageHeader
          title={initial ? "Edit User" : "Create User"}
          leading={
            <button
              type="button"
              aria-label="Back to users"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F0F7FA] hover:text-[#007EA7]"
            >
              <ArrowLeft size={20} />
            </button>
          }
        />
        <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
          <span>Settings</span>
          <span>/</span>
          <span>{audience}</span>
          <span>/</span>
          <span>Users</span>
          <span>/</span>
          <span>{initial ? "Edit User" : "Create User"}</span>
        </div>
        <div className="flex w-full max-w-[1180px] flex-col gap-4 rounded-xl border border-[#DDE7F0] bg-[#FBFDFE] p-5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Close user form"
              onClick={onClose}
              className="text-[#7288A3]"
            >
              <X size={24} />
            </button>
          </div>
          {[
                        ["First Name", "firstName"],
            ["Last Name", "lastName"],
            ["E-mail", "email"],
            ["Phone number", "phone"],
          ].map(([label, key]) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                {label}
                {key !== "phone" && (
                  <>
                    {" "}
                    <span className="text-[#D64545]">*</span>
                  </>
                )}
              </span>
              <input
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                value={values[key as keyof typeof values] as string}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
          ))}
          {!initial && <div className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">Copy access from user (optional)</span>
            <SearchableSelect
              value={copySourceId}
              ariaLabel="Copy access from user"
              placeholder="Select user"
              disabled={!organizationRecords.length}
              options={[{ value: '', label: 'None' }, ...copySourceUsers.map(user => ({ value: user.id, label: user.fullName || user.email || user.username, description: user.email }))]}
              onChange={id => {
                setCopySourceId(id);
                const source = copySourceUsers.find(user => user.id === id);
                if (!source) return;
                const roles = (source.roles ?? '').split(',').map(role => role.trim()).filter(role => availableRoles.includes(role));
                const names = (source.organizations ?? '').split(',').map(name => name.trim());
                const organizations = organizationRecords.filter(organization =>
                  source.organizations === 'All organizations' || names.includes(organization.name) || readOrganizationAssignments(organization.id, audience).has(source.id),
                ).map(organization => organization.name);
                setValues(current => ({ ...current, roles: [...new Set(roles)], organizations: [...new Set(organizations)] }));
              }}
              className="h-10 rounded-lg border border-[#D3E1EC] bg-white px-3 pr-9 font-montserrat text-[12px] text-[#10233A]"
            />
          </div>}
          <div ref={rolesRef} className="relative flex min-w-0 flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
              Role <span className="text-[#D64545]">*</span>
            </span>
            <button
              type="button"
              aria-label="Role"
              aria-expanded={rolesOpen}
              data-static-selection="true"
              onClick={() => setRolesOpen((value) => !value)}
              className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#D3E1EC] px-3 text-left [&>svg]:shrink-0"
            >
              <FittingSelection values={values.roles} placeholder="Select roles" />
              <ChevronDown
                size={17}
                className={`text-[#7288A3] ${rolesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {rolesOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
                {availableRoles.length ? (
                  availableRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={values.roles.includes(role)}
                      data-static-selection="true"
                      onClick={() => toggleRole(role)}
                      className={`grid h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left ${values.roles.includes(role) ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                    >
                      <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${values.roles.includes(role) ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}><Check size={12} strokeWidth={2.5} className={values.roles.includes(role) ? 'text-white' : 'invisible'} /></span>
                      <span className="truncate font-montserrat text-[13px] font-normal leading-5 text-[#10233A]">
                        {role}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-3 font-montserrat text-[12px] text-[#7288A3]">
                    Create a role first
                  </div>
                )}
              </div>
            )}
          </div>
          {(
            <>
              <label className="flex flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                  Position <span className="text-[#D64545]">*</span>
                </span>
                <input
                  value={values.position}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>
              <div ref={organizationsRef} className="relative flex min-w-0 flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Assigned organizations
                </span>
                <button
                  type="button"
                  aria-label="Assigned organizations"
                  aria-expanded={organizationsOpen}
                  data-static-selection="true"
                  onClick={() => setOrganizationsOpen((value) => !value)}
                  className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#D3E1EC] px-3 text-left [&>svg]:shrink-0"
                >
                  <FittingSelection values={values.organizations} placeholder="Select organizations" />
                  <ChevronDown
                    size={17}
                    className={`text-[#7288A3] ${organizationsOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {organizationsOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
                    {organizationOptions.length ? (
                      organizationOptions.map((organization) => (
                        <button
                          key={organization}
                          type="button"
                          aria-pressed={values.organizations.includes(organization)}
                          data-static-selection="true"
                          onClick={() => toggleOrganization(organization)}
                          className={`grid h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left ${values.organizations.includes(organization) ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                        >
                          <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${values.organizations.includes(organization) ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}><Check size={12} strokeWidth={2.5} className={values.organizations.includes(organization) ? 'text-white' : 'invisible'} /></span>
                          <span className="truncate font-montserrat text-[13px] font-normal leading-5 text-[#10233A]">
                            {organization}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-3 font-montserrat text-[12px] text-[#7288A3]">
                        No organizations available
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {initial && (
            <div className="mt-2 flex flex-col gap-5 border-t border-[#E5EDF9] pt-5">
              <div>
                <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                  Profile &amp; analytics
                </h3>
                <p className="mt-1 font-montserrat text-[11px] text-[#7288A3]">
                  User profile, activity and access control data.
                </p>
              </div>

              <div className="rounded-xl border border-[#D3E1EC] bg-[#F8FDFF] p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D3E1EC] bg-white">
                    {values.profileImage ? (
                      <img
                        src={values.profileImage}
                        alt="User profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-montserrat text-[18px] font-semibold text-[#7288A3]">
                        {(values.firstName[0] ?? "") +
                          (values.lastName[0] ?? "")}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-montserrat text-[13px] font-semibold text-[#10233A]">
                      {`${values.firstName} ${values.lastName}`.trim() ||
                        "Internal user"}
                    </p>
                    <p className="mt-1 truncate font-montserrat text-[11px] text-[#7288A3]">
                      {values.position || "Position not specified"}
                    </p>
                    <button
                      type="button"
                      onClick={() => profileFileRef.current?.click()}
                      className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-[#D3E1EC] bg-white px-3 font-montserrat text-[11px] font-semibold text-[#007EA7] hover:bg-[#EAF4FB]"
                    >
                      <ImagePlus size={15} />
                      Upload profile photo
                    </button>
                    <input
                      ref={profileFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) =>
                        handleProfileImage(event.target.files?.[0])
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Last login", values.lastLogin],
                  ["Assigned roles", String(values.roles.length)],
                  ["Organizations", String(values.organizations.length)],
                  ["Documents created", values.documentsCreated],
                  ["Documents edited", values.documentsEdited],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-[#D3E1EC] bg-white p-3"
                  >
                    <p className="font-montserrat text-[10px] font-medium uppercase tracking-[0.04em] text-[#7288A3]">
                      {label}
                    </p>
                    <p className="mt-1 font-montserrat text-[12px] font-semibold text-[#10233A]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>


              <div className="rounded-xl border border-[#D3E1EC] p-4">
                <h4 className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Login history
                </h4>
                <div className="mt-3 flex flex-col divide-y divide-[#E5EDF9]">
                  {loginHistory.length ? (
                    loginHistory.map((entry, index) => (
                      <div
                        key={`${entry.date}-${index}`}
                        className="grid grid-cols-[1fr_auto] gap-3 py-2"
                      >
                        <span>
                          <span className="block font-montserrat text-[11px] font-medium text-[#10233A]">
                            {entry.date}
                          </span>
                          <span className="block font-montserrat text-[10px] text-[#7288A3]">
                            {entry.device}
                          </span>
                        </span>
                        <span className="self-center font-montserrat text-[10px] font-semibold text-[#1B9E77]">
                          {entry.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 font-montserrat text-[11px] text-[#7288A3]">
                      No login history
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#D3E1EC] p-4">
                <h4 className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Activity Log
                </h4>
                <div className="mt-3 flex flex-col divide-y divide-[#E5EDF9]">
                  {activityLog.length ? (
                    activityLog.map((entry, index) => (
                      <div
                        key={`${entry.date}-${index}`}
                        className="grid grid-cols-[110px_1fr] gap-3 py-2"
                      >
                        <span className="font-montserrat text-[10px] text-[#7288A3]">
                          {entry.date}
                        </span>
                        <span className="font-montserrat text-[11px] font-medium text-[#10233A]">
                          {entry.action}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 font-montserrat text-[11px] text-[#7288A3]">
                      No activity recorded
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {!initial && (
            <div className="flex flex-col gap-4 rounded-xl border border-[#D3E1EC] bg-white p-4">
              <div>
                <h3 className="font-montserrat text-[13px] font-semibold text-[#10233A]">
                  Invitation message
                </h3>
                <p className="mt-1 font-montserrat text-[11px] text-[#7288A3]">
                  Choose a template and adjust the message that will be sent
                  with the invitation.
                </p>
              </div>
              <div ref={invitationTemplateRef} className="relative flex min-w-0 flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                  Message template
                </span>
                <button
                  type="button"
                  aria-label="Message template"
                  aria-haspopup="listbox"
                  aria-expanded={invitationTemplateOpen}
                  data-static-selection="true"
                  onClick={() =>
                    setInvitationTemplateOpen((current) => !current)
                  }
                  className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-[#D3E1EC] bg-white px-3 text-left outline-none focus:border-[#007EA7]"
                >
                  <span className="min-w-0 truncate font-montserrat text-[13px] text-[#10233A]">
                    {INVITATION_TEMPLATES.find(
                      (template) => template.id === invitationTemplate,
                    )?.label ?? "Choose template"}
                  </span>
                  <ChevronDown
                    size={17}
                    className={`shrink-0 text-[#7288A3] ${invitationTemplateOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {invitationTemplateOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-lg"
                  >
                    {INVITATION_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        role="option"
                        aria-selected={invitationTemplate === template.id}
                        data-static-selection="true"
                        onClick={() => {
                          setInvitationTemplate(template.id);
                          setInvitationMessage(template.message);
                          setInvitationTemplateOpen(false);
                        }}
                        className={`grid h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left ${invitationTemplate === template.id ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                      >
                        <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${invitationTemplate === template.id ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                          {invitationTemplate === template.id && (
                            <Check size={12} strokeWidth={2.5} className="text-white" />
                          )}
                        </span>
                        <span className="truncate font-montserrat text-[12px] text-[#10233A]">
                          {template.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                  Invitation text <span className="text-[#D64545]">*</span>
                </span>
                <textarea
                  rows={7}
                  value={invitationMessage}
                  onChange={(event) => setInvitationMessage(event.target.value)}
                  className="min-h-[148px] resize-y rounded-lg border border-[#D3E1EC] bg-white px-3 py-2.5 font-montserrat text-[13px] leading-5 text-[#10233A] outline-none focus:border-[#007EA7]"
                  placeholder="Write the invitation message"
                />
              </label>
            </div>
          )}
          <div ref={statusRef} className="relative flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">Status</span>
            <button type="button" aria-label="User status" aria-haspopup="listbox" aria-expanded={statusOpen} disabled={statusLocked} data-static-selection="true" onClick={() => setStatusOpen(open => !open)} className="flex h-10 w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 text-left font-montserrat text-[12px] text-[#10233A] disabled:cursor-not-allowed disabled:bg-[#F0F6FA] disabled:text-[#7288A3]">
              <span>{values.status}</span><ChevronDown size={17} className={`shrink-0 text-[#7288A3] ${statusOpen ? 'rotate-180' : ''}`} />
            </button>
            {statusOpen && !statusLocked && <div role="listbox" aria-label="User status options" className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
              {['Active', 'Blocked'].map(status => <button key={status} type="button" role="option" aria-selected={values.status === status} data-static-selection="true" onClick={() => { setValues(current => ({ ...current, status })); setStatusOpen(false); }} className={`grid h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left font-montserrat text-[12px] text-[#10233A] ${values.status === status ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}>
                <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${values.status === status ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}><Check size={12} strokeWidth={2.5} className={values.status === status ? 'text-white' : 'invisible'} /></span><span className="truncate">{status}</span>
              </button>)}
            </div>}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border-2 border-[#D3E1EC] px-4 font-montserrat text-[14px] font-semibold text-[#7288A3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              const userId = initial?.id ?? `user-${Date.now()}`;
              setUserOrganizationsAndSyncCards(
                userId,
                audience,
                organizationRecords,
                values.organizations,
              );
              onSave({
                id: userId,
                username: values.email.trim(),
                email: values.email.trim(),
                phone: values.phone.trim(),
                fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
                position: values.position.trim(),
                organizations: audience === "Internal users" && values.roles.some((role) =>
                  isSystemAdministratorRole(role),
                )
                  ? "All organizations"
                  : values.organizations.join(", ") || "Unassigned",
                profileImage: values.profileImage,
                lastLogin: values.lastLogin,
                loginHistory: values.loginHistory,
                activityLog: JSON.stringify([
                  {
                    date: timestamp(),
                    action: initial
                      ? "Updated user profile"
                      : "Created user profile",
                  },
                  ...activityLog,
                ]),
                documentsCreated: values.documentsCreated,
                documentsEdited: values.documentsEdited,
                status: values.status,
                roles: values.roles.join(", ") || "Unassigned",
                invitationTemplate:
                  initial?.invitationTemplate ?? invitationTemplate,
                invitationMessage:
                  initial?.invitationMessage ?? invitationMessage.trim(),
                createdBy: initial?.createdBy ?? "Administrator",
                creationDate: initial?.creationDate ?? timestamp(),
                updatedBy: "Administrator",
                lastUpdate: timestamp(),
              });
            }}
            className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6]"
          >
            {initial ? "Save" : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsIdentityManagementView({
  audience,
  section,
  createOnOpen = false,
  onCreateOpened,
  organizationScope,
  initialRoleFilter,
  onOpenRoleUsers,
}: {
  audience: Audience;
  section: Section;
  createOnOpen?: boolean;
  onCreateOpened?: () => void;
  organizationScope?: Company;
  initialRoleFilter?: string;
  onOpenRoleUsers?: (roleName: string) => void;
}) {
  const key = storageKey(audience, section);
  const defaults =
    section === "Roles"
      ? ROLE_COLUMNS
      : INTERNAL_USER_COLUMNS;
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<DirectoryRow[]>(() =>
    loadRows(audience, section),
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DirectoryRow | "new" | null>(null);
  const [roleTemplate, setRoleTemplate] = useState<DirectoryRow | undefined>();
  const [invitationUser, setInvitationUser] = useState<DirectoryRow | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<DirectoryRow | null>(null);
  const [columns, setColumns] = useState<ColConfig[]>(defaults);
  const [showColumns, setShowColumns] = useState(false);
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [openValueFilter, setOpenValueFilter] = useState<string | null>(null);
  const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
  const [pendingFilterKeys, setPendingFilterKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>(
    {},
  );
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, activeFilterKeys, filterValues, organizationScope?.id]);
  const { startResize } = useColumnResize(columns, setColumns);
  useDropdownDismiss(addFilterOpen || openValueFilter !== null, filterMenuRef, () => {
    setAddFilterOpen(false);
    setOpenValueFilter(null);
  });
  useEffect(() => {
    if (!createOnOpen || section !== "Users") return;
    setEditing("new");
    onCreateOpened?.();
  }, [createOnOpen, onCreateOpened, section]);
  useEffect(() => {
    setRows(loadRows(audience, section));
    setColumns(defaults);
    setSelected(new Set());
    setQuery("");
    setActiveFilterKeys(section === 'Users' && initialRoleFilter ? ['roles'] : []);
    setPendingFilterKeys([]);
    setFilterValues(section === 'Users' && initialRoleFilter ? { roles: [initialRoleFilter] } : {});
    setAddFilterOpen(false);
    setOpenValueFilter(null);
    setPage(1);
  }, [audience, defaults, key, section, initialRoleFilter]);
  useEffect(() => {
    const refreshRelationships = () => setRows(loadRows(audience, section));
    window.addEventListener(
      "finansu-harmonija:settings-data-changed",
      refreshRelationships,
    );
    window.addEventListener("storage", refreshRelationships);
    return () => {
      window.removeEventListener(
        "finansu-harmonija:settings-data-changed",
        refreshRelationships,
      );
      window.removeEventListener("storage", refreshRelationships);
    };
  }, [audience, section]);
  const rowsWithRelationships = useMemo(() => {
    if (section !== "Roles") return rows;
    const users = loadRows(audience, "Users");
    return rows.map((role) => ({
      ...role,
      assignedUsers: String(
        users.filter((user) =>
              (user.roles ?? "")
                .split(",")
                .map((value) => value.trim())
                .includes(role.name),
            ).length,
      ),
    }));
  }, [audience, rows, section]);
  const filterOptionsByKey = useMemo(() => {
    const result: Record<
      string,
      Array<{ value: string; label: string; detail?: string }>
    > = {};
    defaults.forEach((column) => {
      if (column.key === "assignedUsers") {
        result[column.key] = loadRows(audience, "Users").map((user) => ({
          value: user.id,
          label: user.fullName || user.username || user.email,
          detail: user.email,
        }));
      } else if (column.key === "roles") {
        result[column.key] = loadRows(audience, "Roles").map((role) => ({
          value: role.name,
          label: role.name,
          detail: role.description,
        }));
      } else {
        result[column.key] = Array.from(
          new Set(
            rowsWithRelationships
              .map(
                (row) =>
                  (row as unknown as Record<string, string>)[column.key],
              )
              .filter((value) => value && value !== "—"),
          ),
        ).map((value) => ({ value, label: value }));
      }
    });
    return result;
  }, [audience, defaults, rowsWithRelationships]);
  const columnFilteredRows = useMemo(() => {
    return rowsWithRelationships.filter((row) =>
      activeFilterKeys.every((filterKey) => {
        const selectedValues = filterValues[filterKey] ?? [];
        if (!selectedValues.length) return true;
        if (filterKey === "assignedUsers") {
          const users = loadRows(audience, "Users").filter((user) =>
            selectedValues.includes(user.id),
          );
          return users.some((user) =>
            (user.roles ?? "")
              .split(",")
              .map((value) => value.trim())
              .includes(row.name),
          );
        }
        if (filterKey === "roles") {
          const roles = (row.roles ?? "")
            .split(",")
            .map((value) => value.trim());
          return selectedValues.some((role) => roles.includes(role));
        }
        return selectedValues.includes(row[filterKey]);
      }),
    );
  }, [activeFilterKeys, audience, filterValues, rowsWithRelationships]);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const organizationUserIds = organizationScope ? new Set(audience === 'Internal users' ? organizationInternalUsers(organizationScope).map(user => user.id) : loadOrganizationUserIds(organizationScope.id, 'External users')) : null;
    const scopedRows = organizationUserIds ? columnFilteredRows.filter(row => organizationUserIds.has(row.id)) : columnFilteredRows;
    return value
      ? scopedRows.filter((row) =>
          Object.values(row).join(" ").toLowerCase().includes(value),
        )
      : scopedRows;
  }, [columnFilteredRows, query, organizationScope, audience]);
  const visibleColumns = columns.filter((column) => column.visible);
  const actionColumnWidth = section === 'Users' || audience === 'Internal users' ? 104 : 72;
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filtered,
    (row, column) => row[column],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / DIRECTORY_ROWS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages);
  const displayedRows = sortedRows.slice(0, safePage * DIRECTORY_ROWS_PER_PAGE);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const allSelected =
    filtered.length > 0 && filtered.every((row) => selected.has(row.id));
  const isEmptyDirectory = rows.length === 0;
  const pageTitle =
    section === "Roles"
      ? `${audience === "Internal users" ? "Internal" : "External"} Roles`
      : `${audience === "Internal users" ? "Internal" : "External"} Users`;
  const audienceLabel =
    audience === "Internal users" ? "Internal Users" : "External Users";
  const selectedRemovableRows = rows.filter((row) => selected.has(row.id)
    && !(section === 'Roles' && isProtectedSystemRole(audience, row)));
  const remove = (ids: Set<string>) => {
    // Re-read the directory and its relationships at action time. Assigned roles
    // and users are retained; deactivation must never erase their assignments.
    const current = loadRows(audience, section);
    const removableIds = new Set(current.filter((row) => ids.has(row.id)
      && !(section === 'Roles' && isProtectedSystemRole(audience, row))).map((row) => row.id));
    const nextRows = removeOrDeactivateRecords(current, removableIds, key, undefined,
      (row) => isDirectoryRowLinked(audience, section, row));
    const retainedIds = new Set(nextRows.map((row) => row.id));
    const deletedIds = readDeletedIds(audience, section);
    removableIds.forEach((id) => { if (!retainedIds.has(id)) deletedIds.add(id); });
    persistDeletedIds(audience, section, deletedIds);
    persistRows(audience, section, nextRows);
    setRows(nextRows);
    setSelected(new Set());
  };
  const duplicateRole = (source: DirectoryRow) => {
    setRoleTemplate({
      ...source,
      ...(isSystemAdministratorRole(source.name) ? { menuAccess: JSON.stringify(createFullMenuAccess()) } : {}),
    });
    setEditing('new');
  };
  const save = (row: DirectoryRow) => {
    setRows((current) => {
      // Personal integration credentials are not editable through user administration.
      const existing = current.find((item) => item.id === row.id);
      const savedRow = { ...existing, ...row };
      if (section === 'Users') {
        const existingStatus = internalUserStatus(existing?.status);
        savedRow.status = !existing || existingStatus === 'Unactivated'
          ? 'Unactivated'
          : ['Active', 'Blocked'].includes(savedRow.status) ? savedRow.status : existingStatus;
        if (existing && isInactiveRecord(existing) && savedRow.status === 'Active') {
          savedRow.inactive = 'false';
          savedRow.active = 'true';
        }
        for (const field of ['sodraUser', 'sodraPassword', 'edsUser', 'edsPassword', 'password', 'confirmPassword']) {
          delete savedRow[field];
          if (existing && Object.prototype.hasOwnProperty.call(existing, field)) savedRow[field] = existing[field];
        }
      }
      const nextRows =
        editing === "new"
          ? [...current, savedRow]
          : current.map((value) => (value.id === row.id ? savedRow : value));
      persistRows(audience, section, nextRows);
      const deletedIds = readDeletedIds(audience, section);
      if (deletedIds.delete(row.id)) {
        persistDeletedIds(audience, section, deletedIds);
      }
      return nextRows;
    });
    setEditing(null);
    setRoleTemplate(undefined);
  };

  if (editing) {
    return section === "Roles" ? (
      <RolePanel
        audience={audience}
        initial={editing === "new" ? undefined : editing}
        template={editing === 'new' ? roleTemplate : undefined}
        onClose={() => { setEditing(null); setRoleTemplate(undefined); }}
        onSave={save}
      />
    ) : (
      <UserPanel
        audience={audience}
        initial={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    );
  }

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title={pageTitle}
        actions={
          !isEmptyDirectory ? (
            <PageActionButton onClick={() => setEditing("new")}>
              {section === 'Users' ? 'Create user & send invitation' : 'Create new'}
            </PageActionButton>
          ) : undefined
        }
      />
      <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
        <span>Settings</span>
        <span className="text-[#A1B6C6]">/</span>
        <span>{audienceLabel}</span>
        <span className="text-[#A1B6C6]">/</span>
        <span className="text-[#A1B6C6]">{section}</span>
      </div>
      <div className="system-table-toolbar flex h-7 min-h-7 flex-nowrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
          <OcrSearchField
            ariaLabel={`Search ${section.toLowerCase()}`}
            value={query}
            onChange={setQuery}
          />
          {activeFilterKeys.map((filterKey) => {
            const column = defaults.find((item) => item.key === filterKey);
            if (!column) return null;
            const selectedValues = filterValues[filterKey] ?? [];
            const options = filterOptionsByKey[filterKey] ?? [];
            const toggleValue = (value: string) =>
              setFilterValues((current) => {
                const values = current[filterKey] ?? [];
                return {
                  ...current,
                  [filterKey]: values.includes(value)
                    ? values.filter((item) => item !== value)
                    : [...values, value],
                };
              });
            return (
              <div key={filterKey} ref={openValueFilter === filterKey ? filterMenuRef : undefined} className="relative">
                <button
                  type="button"
                  aria-expanded={openValueFilter === filterKey}
                  onClick={() => {
                    setAddFilterOpen(false);
                    setOpenValueFilter((current) =>
                      current === filterKey ? null : filterKey,
                    );
                  }}
                  className="flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-[#E5EDF9] px-2 font-montserrat text-[12px] font-medium text-[#10233A] hover:bg-[#DCE7F6]"
                >
                  <span>{column.label}</span>
                  {selectedValues.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#007EA7] px-1 text-[10px] font-semibold text-white">
                      {selectedValues.length}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={
                      openValueFilter === filterKey ? "rotate-180" : ""
                    }
                  />
                </button>
                {openValueFilter === filterKey && (
                  <div className="absolute left-0 top-full z-40 mt-1 w-[310px] max-w-[calc(100vw-48px)] rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
                    <div className="border-b border-[#E5EDF9] px-2 pb-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
                      Filter by {column.label}
                    </div>
                    <div className="max-h-60 overflow-y-auto pt-1">
                      {options.length ? (
                        options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selectedValues.includes(option.value)}
                            aria-label={`Filter by ${option.label}`}
                            data-static-selection="true"
                            className={`grid h-10 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 text-left ${selectedValues.includes(option.value) ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                            onClick={() => toggleValue(option.value)}
                          >
                            <span aria-hidden="true" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${selectedValues.includes(option.value) ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
                              {selectedValues.includes(option.value) && <Check size={12} strokeWidth={2.5} className="text-white" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-montserrat text-[12px] font-medium text-[#10233A]">
                                {option.label}
                              </span>
                              {option.detail && (
                                <span className="block truncate font-montserrat text-[10px] text-[#7288A3]">
                                  {option.detail}
                                </span>
                              )}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-3 font-montserrat text-[12px] text-[#7288A3]">
                          No filter values
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveFilterKeys((current) =>
                          current.filter((keyValue) => keyValue !== filterKey),
                        );
                        setFilterValues((current) => {
                          const next = { ...current };
                          delete next[filterKey];
                          return next;
                        });
                        setOpenValueFilter(null);
                      }}
                      className="mt-1 h-8 w-full rounded-md border border-[#D3E1EC] font-montserrat text-[11px] font-semibold text-[#7288A3] hover:bg-[#F8FDFF]"
                    >
                      Remove filter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={addFilterOpen ? filterMenuRef : undefined} className="relative flex-shrink-0">
            <button
              type="button"
              aria-expanded={addFilterOpen}
              onClick={() => {
                setOpenValueFilter(null);
                setAddFilterOpen((current) => {
                  if (!current) setPendingFilterKeys(activeFilterKeys);
                  return !current;
                });
              }}
              className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
            >
              <Plus size={15} />
              <span>Add filters</span>
            </button>
            {addFilterOpen && (
              <div
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setFilterValues((current) =>
                      Object.fromEntries(
                        pendingFilterKeys.map((key) => [
                          key,
                          current[key] ?? [],
                        ]),
                      ),
                    );
                    setActiveFilterKeys(pendingFilterKeys);
                    setAddFilterOpen(false);
                  }
                }}
                className="absolute left-0 top-[32px] z-40 min-w-[240px] max-w-[calc(100vw-48px)] overflow-hidden rounded-lg border border-[#D3E1EC] bg-white p-1.5 shadow-[0_8px_24px_rgba(16,35,58,0.14)]"
              >
                <div className="max-h-[300px] overflow-y-auto">
                  {defaults.map((column) => {
                    const checked = pendingFilterKeys.includes(column.key);
                    return (
                      <button
                        key={column.key}
                        type="button"
                        aria-pressed={checked}
                        data-static-selection="true"
                        onClick={() => {
                          setPendingFilterKeys((current) =>
                            checked
                              ? current.filter((key) => key !== column.key)
                              : [...current, column.key],
                          );
                          setOpenValueFilter(null);
                        }}
                        className={`grid h-9 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 rounded-md px-3 text-left ${checked ? 'bg-[#E5EDF9]' : 'hover:bg-[#F8FDFF]'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                        >
                          {checked && (
                            <Check
                              size={12}
                              strokeWidth={2.5}
                              className="text-white"
                            />
                          )}
                        </span>
                        <span className="truncate font-montserrat text-[13px] font-medium text-[#10233A]">
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
                    onClick={() => {
                      setFilterValues((current) =>
                        Object.fromEntries(
                          pendingFilterKeys.map((key) => [
                            key,
                            current[key] ?? [],
                          ]),
                        ),
                      );
                      setActiveFilterKeys(pendingFilterKeys);
                      setAddFilterOpen(false);
                    }}
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
            onClick={() => {
              setQuery("");
              setActiveFilterKeys([]);
              setPendingFilterKeys([]);
              setFilterValues({});
              setAddFilterOpen(false);
              setOpenValueFilter(null);
              setPage(1);
            }}
            className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
          >
            <X size={15} />
            <span>Clear filters</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selectedRemovableRows.length}
            linked={selectedRemovableRows.some((row) => isInactiveRecord(row) || isDirectoryRowLinked(audience, section, row))}
            inactive={selectedRemovableRows.length > 0 && selectedRemovableRows.every(isInactiveRecord)}
            onDelete={() => remove(selected)}
          />
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton
            onRefresh={() =>
              setRows((current) => current.map((row) => ({ ...row })))
            }
          />
        </div>
      </div>
      {isEmptyDirectory ? (
        <>
          <div className="relative min-h-[320px] flex-1">
            <div
              ref={tableScrollRef}
              className="absolute inset-0 overflow-x-auto scrollbar-hide"
            >
              <div
                className="h-full"
                style={{
                  minWidth:
                    visibleColumns.reduce(
                      (sum, column) => sum + column.width,
                      0,
                    ) + 42 + actionColumnWidth,
                }}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center text-[#7288A3]">
              <FileText size={34} strokeWidth={1.6} />
              <span className="font-montserrat text-[14px] font-semibold">
                No {section.toLowerCase()} found
              </span>
              <span className="pointer-events-auto">
                <PageActionButton onClick={() => setEditing("new")}>
                  {section === 'Users' ? 'Create user & send invitation' : 'Create new'}
                </PageActionButton>
              </span>
            </div>
          </div>
          <HorizontalTableScrollbar scrollRef={tableScrollRef} />
          <TablePagination scrollRef={tableScrollRef}
            currentPage={1}
            totalPages={1}
            itemCount={0}
            itemsPerPage={DIRECTORY_ROWS_PER_PAGE}
            onPageChange={() => undefined}
          />
        </>
      ) : (
        <>
          <div
            ref={tableScrollRef}
            className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
          >
            <div
              style={{
                minWidth:
                  visibleColumns.reduce(
                    (sum, column) => sum + column.width,
                    0,
                  ) + 42 + actionColumnWidth,
              }}
            >
              <div className="mb-3 flex h-6 items-center">
                <div data-table-header-select="true" className="flex h-9 w-[42px] items-start justify-center px-3">
                  <CheckBox
                    checked={allSelected}
                    label="Select all records"
                    onChange={() =>
                      setSelected(current => toggleFilteredSelection(current, filtered.map((row) => row.id)),
                      )
                    }
                  />
                </div>
                {visibleColumns.map((column) => {
                  const index = columns.findIndex(
                    (item) => item.key === column.key,
                  );
                  return (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="relative flex flex-shrink-0 items-center gap-1 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A]"
                    >
                      {column.label}
                      <ColumnSortButton
                        columnLabel={column.label}
                        direction={directionFor(column.key)}
                        onDirectionChange={(direction) =>
                          changeSort(column.key, direction)
                        }
                      />
                      <ResizeHandle
                        onMouseDown={(event) => startResize(index, event)}
                      />
                    </div>
                  );
                })}
                <div className={`system-table-row-actions h-full flex-shrink-0 bg-white ${section === 'Users' || audience === 'Internal users' ? 'w-[104px]' : 'w-[72px]'}`} />
              </div>
              <div className="flex flex-col gap-0.5">
                {displayedRows.map((row, index) => (
                  <div
                    key={row.id}
                    data-record-inactive={isInactiveRecord(row)}
                    className={`group flex h-10 cursor-default items-center rounded-lg ${index % 2 ? "bg-white" : "bg-[#F8FDFF]"} hover:bg-[#E7F4F9]`}
                  >
                    <div className="flex w-[42px] px-3">
                      <CheckBox
                        checked={selected.has(row.id)}
                        label={`Select ${row.id}`}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                      />
                    </div>
                    {visibleColumns.map((column) => (
                      <div
                        key={column.key}
                        style={{ width: column.width }}
                        className="flex-shrink-0 overflow-hidden px-3"
                      >
                        {section === 'Users' && column.key === 'fullName' ? <button type="button" className="block max-w-full truncate text-left font-montserrat text-[12px] font-normal text-[#007EA7] hover:underline" aria-label={`Edit ${row.fullName}`} title={row.fullName} onClick={() => setEditing(row)}>{row.fullName || '—'}</button> : section === 'Roles' && column.key === 'assignedUsers' && onOpenRoleUsers ? <button type="button" className="font-montserrat text-[12px] text-[#007EA7] hover:underline" aria-label={`View users assigned to ${row.name}`} onClick={() => onOpenRoleUsers(row.name)}>{row.assignedUsers || '0'}</button> : <span className="block truncate font-montserrat text-[12px] font-normal text-[#10233A]">
                          {row[column.key] || "—"}
                        </span>}
                      </div>
                    ))}
                    <div
                      className={`system-table-row-actions flex h-full ${section === 'Users' || audience === 'Internal users' ? 'w-[104px]' : 'w-[72px]'} flex-shrink-0 items-center justify-end gap-1 pr-1 ${index % 2 ? "bg-white" : "bg-[#F8FDFF]"} group-hover:bg-[#E7F4F9]`}
                    >
                      {section === 'Users' && row.status === 'Unactivated' && <button type="button" title="Resend invitation" aria-label={`Resend invitation to ${row.email}`} onClick={() => setInvitationUser(row)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Mail size={15} /></button>}
                      {section === 'Users' && row.status === 'Active' && <button type="button" title="Send password reset" aria-label={`Send password reset to ${row.email}`} onClick={() => setPasswordResetUser(row)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><KeyRound size={15} /></button>}
                      {section === 'Roles' && audience === 'Internal users' && (
                        <button
                          type="button"
                          aria-label={`Duplicate ${row.name}`}
                          title="Duplicate"
                          onClick={() => duplicateRole(row)}
                          className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] group-hover:bg-[#E7F4F9]"
                        >
                          <Copy size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Edit ${row.name || row.fullName || row.username || row.email}`}
                        title="EDIT"
                        onClick={() => setEditing(row)}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] group-hover:bg-[#E7F4F9]"
                      >
                        <Pencil size={15} />
                      </button>
                      {!(section === 'Roles' && isProtectedSystemRole(audience, row)) && <RowDeleteButton
                        label={`Delete ${row.id}`}
                        linked={isDirectoryRowLinked(audience, section, row)}
                        inactive={isInactiveRecord(row)}
                        title={
                          isSystemAdministratorRole(row.name)
                            ? "SYSTEM ROLE CANNOT BE DELETED"
                            : "DELETE"
                        }
                        disabled={isSystemAdministratorRole(row.name)}
                        className="group-hover:bg-[#E7F4F9]"
                        onDelete={() => remove(new Set([row.id]))}
                      />}
                    </div>
                  </div>
                ))}
                {!filtered.length && (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                    <FileText size={30} />
                    <span className="font-montserrat text-[14px] font-semibold">
                      No records
                    </span>
                    <PageActionButton onClick={() => setEditing("new")}>
                      {section === 'Users' ? 'Create user & send invitation' : 'Create new'}
                    </PageActionButton>
                  </div>
                )}
              </div>
            </div>
          </div>
          <HorizontalTableScrollbar scrollRef={tableScrollRef} />
          <div className="contents">
            <TablePagination scrollRef={tableScrollRef}
              currentPage={safePage}
              totalPages={totalPages}
              itemCount={filtered.length}
              itemsPerPage={DIRECTORY_ROWS_PER_PAGE}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
      {passwordResetUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={() => setPasswordResetUser(null)}>
        <div role="dialog" aria-modal="true" aria-label="Send password reset" className="w-full max-w-md rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
          <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">Send password reset</h3>
          <p className="mt-3 break-words font-montserrat text-[13px] text-[#10233A]">{passwordResetUser.email}</p>
          <p className="mt-3 font-montserrat text-[12px] text-[#7288A3]">Password reset email delivery is not configured. No email has been sent and the password has not been changed. The user must set their own password using a secure reset link.</p>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => setPasswordResetUser(null)} className="h-9 rounded-lg border border-[#D3E1EC] px-4 font-montserrat text-[12px] text-[#7288A3]">Close</button></div>
        </div>
      </div>}
      {invitationUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={() => setInvitationUser(null)}>
        <div role="dialog" aria-modal="true" aria-label="Resend invitation" className="w-full max-w-md rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
          <h3 className="font-montserrat text-[16px] font-semibold text-[#10233A]">Resend invitation</h3>
          <p className="mt-3 break-words font-montserrat text-[13px] text-[#10233A]">{invitationUser.email}</p>
          <p className="mt-3 font-montserrat text-[12px] text-[#7288A3]">Invitation delivery is not configured. No email has been sent. Connect the invitation service to send a secure account activation link.</p>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => setInvitationUser(null)} className="h-9 rounded-lg border border-[#D3E1EC] px-4 font-montserrat text-[12px] text-[#7288A3]">Close</button></div>
        </div>
      </div>}
      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={defaults}
          onSave={(next) => {
            setColumns(next);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
    </div>
  );
}
