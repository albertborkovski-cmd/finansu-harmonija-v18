import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { PageActionButton, PageHeader } from "./PageHeader";
import OcrSearchField from "./OcrSearchField";
import RefreshAllButton from "./RefreshAllButton";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import TablePagination from "./TablePagination";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { supabase } from "../lib/supabase";
import {
  createFullAccess,
  createFullMenuAccess,
  createMenuAccessFromModules,
  deriveModuleAccess,
  flattenRoleAccessTree,
  isSystemAdministratorRole,
  ROLE_ACCESS_TREE,
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
  { key: "permissions", label: "Permissions", width: 360, visible: true },
  { key: "createdBy", label: "Created by", width: 180, visible: true },
  { key: "creationDate", label: "Creation date", width: 180, visible: true },
  { key: "updatedBy", label: "Updated By", width: 180, visible: false },
  { key: "lastUpdate", label: "Last Update", width: 180, visible: false },
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
  ...USER_COLUMNS.slice(0, 4),
  { key: "position", label: "Position", width: 190, visible: true },
  {
    key: "organizations",
    label: "Assigned organizations",
    width: 240,
    visible: true,
  },
  ...USER_COLUMNS.slice(4),
];

const PERMISSIONS = ["CREATE", "READ", "UPDATE", "DELETE", "ACTION"];
const DIRECTORY_ROWS_PER_PAGE = 14;
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
      section === "Roles" && isSystemAdministratorRole(systemRow.name);
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
    if (section === "Users") return row;
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

function CheckBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={12} className="text-white" />}
    </button>
  );
}

function readRoles(audience: Audience) {
  return loadRows(audience, "Roles")
    .map((role) => role.name)
    .filter(Boolean);
}

function RoleAccessTree({
  nodes,
  access,
  locked,
  depth = 0,
  onToggle,
}: {
  nodes: RoleAccessNode[];
  access: MenuAccessMap;
  locked: boolean;
  depth?: number;
  onToggle: (node: RoleAccessNode, key: "view" | "edit") => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => {
        const permission = access[node.id] ?? { view: false, edit: false };
        const hasChildren = Boolean(node.children?.length);
        return (
          <div key={node.id}>
            <div
              className={`grid min-h-10 grid-cols-[minmax(0,1fr)_70px_70px] items-center rounded-lg border ${depth === 0 ? "border-[#D3E1EC] bg-white" : "border-transparent bg-[#F8FBFD]"}`}
              style={{ marginLeft: depth * 22 }}
            >
              <div className="flex min-w-0 items-center gap-2 px-3">
                {hasChildren ? (
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 text-[#7288A3] transition-transform ${permission.view ? "rotate-180" : ""}`}
                  />
                ) : (
                  <span className="h-[14px] w-[14px] flex-shrink-0" />
                )}
                <span className={`truncate font-montserrat text-[13px] text-[#10233A] ${hasChildren ? "font-semibold" : "font-medium"}`}>
                  {node.label}
                </span>
              </div>
              <CheckBox
                checked={permission.view}
                label={`View ${node.label}`}
                onChange={() => {
                  if (!locked) onToggle(node, "view");
                }}
              />
              <CheckBox
                checked={permission.edit}
                label={`Edit ${node.label}`}
                onChange={() => {
                  if (!locked) onToggle(node, "edit");
                }}
              />
            </div>
            {hasChildren && permission.view && (
              <div className="mt-1">
                <RoleAccessTree
                  nodes={node.children ?? []}
                  access={access}
                  locked={locked}
                  depth={depth + 1}
                  onToggle={onToggle}
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
  onClose,
  onSave,
}: {
  audience?: Audience;
  initial?: DirectoryRow;
  onClose: () => void;
  onSave: (row: DirectoryRow) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const isSystemAdministrator = isSystemAdministratorRole(
    initial?.name ?? name,
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [permissions, setPermissions] = useState(
    (initial?.permissions ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const [menuAccess, setMenuAccess] = useState<MenuAccessMap>(() => {
    try {
      const moduleAccess = initial?.moduleAccess
        ? (JSON.parse(initial.moduleAccess) as AccessMap)
        : deriveModuleAccess({});
      return initial?.menuAccess
        ? (JSON.parse(initial.menuAccess) as MenuAccessMap)
        : createMenuAccessFromModules(moduleAccess);
    } catch {
      return createMenuAccessFromModules(deriveModuleAccess({}));
    }
  });
  const availableUsers = useMemo(
    () => loadRows(audience, "Users"),
    [audience],
  );
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(() =>
    availableUsers
      .filter((user) =>
        (user.roles ?? "")
          .split(",")
          .map((value) => value.trim())
          .includes(initial?.name ?? ""),
      )
      .map((user) => user.id),
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
  const toggle = (permission: string) =>
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission],
    );
  const setMenuPermission = (node: RoleAccessNode, key: "view" | "edit") =>
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
  return (
    <div className="relative flex min-h-full min-w-0 flex-col items-start gap-8 overflow-y-auto bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <div className="flex w-full max-w-[1440px] flex-col gap-6">
        <PageHeader
          title={initial ? "Edit Role" : "Create Role"}
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
          <span>{initial ? "Edit Role" : "Create Role"}</span>
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
              Name <span className="text-[#D64545]">*</span>
            </span>
            <input
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
            <div className="grid grid-cols-[1fr_70px_70px] items-center border-b border-[#D3E1EC] pb-2 font-montserrat text-[12px] font-semibold text-[#10233A]">
              <span>Menu access</span>
              <span>VIEW</span>
              <span>EDIT</span>
            </div>
            <RoleAccessTree
              nodes={ROLE_ACCESS_TREE}
              access={menuAccess}
              locked={isSystemAdministrator}
              onToggle={setMenuPermission}
            />
          </div>
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
            <div className="rounded-lg border border-[#D3E1EC] p-2">
              {availableUsers.length ? (
                availableUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      if (!isSystemAdministrator) toggleUser(user.id);
                    }}
                    className="flex min-h-10 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                  >
                    <CheckBox
                      checked={assignedUserIds.includes(user.id)}
                      label={`Assign ${user.fullName || user.username}`}
                      onChange={() => {
                        if (!isSystemAdministrator) toggleUser(user.id);
                      }}
                    />
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
                  No users available
                </span>
              )}
            </div>
          </div>
          {isSystemAdministrator && (
            <div className="grid gap-2 rounded-lg border border-[#C9E3ED] bg-[#F4FBFD] p-3 font-montserrat text-[12px] text-[#10233A] sm:grid-cols-3">
              <span>Organizations: <b>All</b></span>
              <span>Users: <b>All internal and external</b></span>
              <span>Roles: <b>All internal and external</b></span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Action permissions
            </span>
            <div className="grid grid-cols-2">
              {PERMISSIONS.map((permission) => (
                <button
                  key={permission}
                  type="button"
                  onClick={() => {
                    if (!isSystemAdministrator) toggle(permission);
                  }}
                  className="flex h-9 items-center gap-2 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                >
                  <CheckBox
                    checked={permissions.includes(permission)}
                    label={`${permission} permission`}
                    onChange={() => {
                      if (!isSystemAdministrator) toggle(permission);
                    }}
                  />
                  <span className="font-montserrat text-[13px] text-[#10233A]">
                    {permission}
                  </span>
                </button>
              ))}
            </div>
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
            disabled={!name.trim()}
            onClick={() => {
              const roleName = name.trim();
              saveRoleAssignments(
                audience,
                initial?.name ?? roleName,
                roleName,
                assignedUserIds,
              );
              onSave({
                id: initial?.id ?? `role-${Date.now()}`,
                name: roleName,
                description: description.trim() || "—",
                permissions: isSystemAdministrator
                  ? PERMISSIONS.join(", ")
                  : PERMISSIONS.filter((value) =>
                      permissions.includes(value),
                    ).join(", ") || "—",
                moduleAccess: JSON.stringify(
                  isSystemAdministrator
                    ? createFullAccess()
                    : deriveModuleAccess(menuAccess),
                ),
                menuAccess: JSON.stringify(
                  isSystemAdministrator ? createFullMenuAccess() : menuAccess,
                ),
                managedOrganizations: isSystemAdministrator ? "ALL" : "—",
                managedUsers: isSystemAdministrator ? "ALL" : "—",
                managedRoles: isSystemAdministrator ? "ALL" : "—",
                createdBy: initial?.createdBy ?? "Administrator",
                creationDate: initial?.creationDate ?? timestamp(),
                updatedBy: "Administrator",
                lastUpdate: timestamp(),
              });
            }}
            className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6]"
          >
            Save
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
    sodraUser: initial?.sodraUser ?? "",
    sodraPassword: initial?.sodraPassword ?? "",
    edsUser: initial?.edsUser ?? "",
    edsPassword: initial?.edsPassword ?? "",
    profileImage: initial?.profileImage ?? "",
    lastLogin: initial?.lastLogin ?? "No login recorded",
    loginHistory: initial?.loginHistory ?? "[]",
    activityLog: initial?.activityLog ?? "[]",
    documentsCreated: initial?.documentsCreated ?? "0",
    documentsEdited: initial?.documentsEdited ?? "0",
    password: "",
    confirmPassword: "",
    roles: (initial?.roles ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    status: initial?.status ?? "Enabled",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSodraPassword, setShowSodraPassword] = useState(false);
  const [showEdsPassword, setShowEdsPassword] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [organizationsOpen, setOrganizationsOpen] = useState(false);
  const [invitationTemplateOpen, setInvitationTemplateOpen] = useState(false);
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
    if (audience !== "Internal users") return;
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
  const assignedPermissionDetails = useMemo(() => {
    const roleRows = loadRows(audience, "Roles");
    return values.roles.map((roleName) => {
      const role = roleRows.find((item) => item.name === roleName);
      return {
        name: roleName,
        permissions: role?.permissions ?? "No permissions assigned",
      };
    });
  }, [audience, values.roles]);
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
    values.username.trim() &&
    values.firstName.trim() &&
    values.lastName.trim() &&
    values.email.trim() &&
    (audience !== "Internal users" || values.position.trim()) &&
    values.password === values.confirmPassword &&
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
            ["Username", "username"],
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
          {audience === "Internal users" && (
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
              <div className="relative flex flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Assigned organizations
                </span>
                <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-[#D3E1EC] p-2">
                  {values.organizations.length ? (
                    values.organizations.map((organization) => (
                      <span
                        key={organization}
                        className="inline-flex h-7 items-center gap-2 rounded-md border border-[#D3E1EC] bg-[#F8FDFF] px-2 font-montserrat text-[12px] text-[#10233A]"
                      >
                        {organization}
                        <button
                          type="button"
                          aria-label={`Remove ${organization}`}
                          onClick={() => toggleOrganization(organization)}
                          className="text-[#7288A3] hover:text-[#10233A]"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="px-1 font-montserrat text-[12px] leading-6 text-[#7288A3]">
                      No organizations assigned
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOrganizationsOpen((value) => !value)}
                  className="flex min-h-10 items-center justify-between rounded-lg border border-[#D3E1EC] px-3 text-left"
                >
                  <span className="font-montserrat text-[12px] text-[#10233A]">
                    Choose organizations
                  </span>
                  <ChevronDown
                    size={17}
                    className={`text-[#7288A3] ${organizationsOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {organizationsOpen && (
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-lg">
                    {organizationOptions.length ? (
                      organizationOptions.map((organization) => (
                        <button
                          key={organization}
                          type="button"
                          onClick={() => toggleOrganization(organization)}
                          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                        >
                          <CheckBox
                            checked={values.organizations.includes(
                              organization,
                            )}
                            label={`Assign ${organization}`}
                            onChange={() => toggleOrganization(organization)}
                          />
                          <span className="font-montserrat text-[13px] text-[#10233A]">
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
          {[
            ["Password", "password", showPassword, setShowPassword],
            [
              "Confirm Password",
              "confirmPassword",
              showConfirm,
              setShowConfirm,
            ],
          ].map(([label, key, visible, toggle]) => (
            <label key={key as string} className="flex flex-col gap-1.5">
              <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                {label as string}
              </span>
              <span className="relative">
                <input
                  type={visible ? "text" : "password"}
                  value={values[key as "password" | "confirmPassword"]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [key as string]: event.target.value,
                    }))
                  }
                  className={`${fieldClass} w-full pr-11`}
                />
                <button
                  type="button"
                  onClick={() =>
                    (toggle as React.Dispatch<React.SetStateAction<boolean>>)(
                      (value) => !value,
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3]"
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
          ))}
          {audience === "Internal users" && (
            <div className="mt-2 flex flex-col gap-4 border-t border-[#E5EDF9] pt-5">
              <div>
                <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                  Government integrations
                </h3>
                <p className="mt-1 font-montserrat text-[11px] text-[#7288A3]">
                  Optional credentials for SODRA and VMI (EDS) API integrations.
                </p>
              </div>
              {[
                ["SODRA username", "sodraUser", false, null],
                [
                  "SODRA password",
                  "sodraPassword",
                  showSodraPassword,
                  setShowSodraPassword,
                ],
                ["VMI (EDS) username", "edsUser", false, null],
                [
                  "VMI (EDS) password",
                  "edsPassword",
                  showEdsPassword,
                  setShowEdsPassword,
                ],
              ].map(([label, key, visible, toggle]) => (
                <label key={key as string} className="flex flex-col gap-1.5">
                  <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                    {label as string}
                  </span>
                  <span className="relative">
                    <input
                      type={
                        String(key).toLowerCase().includes("password") &&
                        !visible
                          ? "password"
                          : "text"
                      }
                      value={
                        values[
                          key as
                            | "sodraUser"
                            | "sodraPassword"
                            | "edsUser"
                            | "edsPassword"
                        ]
                      }
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [key as string]: event.target.value,
                        }))
                      }
                      className={`${fieldClass} w-full ${toggle ? "pr-11" : ""}`}
                    />
                    {toggle && (
                      <button
                        type="button"
                        aria-label={`Show ${label as string}`}
                        onClick={() =>
                          (
                            toggle as React.Dispatch<
                              React.SetStateAction<boolean>
                            >
                          )((value) => !value)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3]"
                      >
                        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          {audience === "Internal users" && (
            <div className="mt-2 flex flex-col gap-5 border-t border-[#E5EDF9] pt-5">
              <div>
                <h3 className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                  Profile &amp; analytics
                </h3>
                <p className="mt-1 font-montserrat text-[11px] text-[#7288A3]">
                  Meso accountant profile, activity and access control data.
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
                  Assigned permissions and roles
                </h4>
                <div className="mt-3 flex flex-col gap-2">
                  {assignedPermissionDetails.length ? (
                    assignedPermissionDetails.map((role) => (
                      <div
                        key={role.name}
                        className="rounded-md bg-[#F8FDFF] px-3 py-2"
                      >
                        <p className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                          {role.name}
                        </p>
                        <p className="mt-0.5 font-montserrat text-[10px] text-[#7288A3]">
                          {role.permissions}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="font-montserrat text-[11px] text-[#7288A3]">
                      No roles or permissions assigned
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#D3E1EC] p-4">
                <h4 className="font-montserrat text-[12px] font-semibold text-[#10233A]">
                  Assigned organizations
                </h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {values.organizations.length ? (
                    values.organizations.map((organization) => (
                      <span
                        key={organization}
                        className="rounded-md bg-[#EAF4FB] px-2.5 py-1 font-montserrat text-[11px] font-medium text-[#10233A]"
                      >
                        {organization}
                      </span>
                    ))
                  ) : (
                    <span className="font-montserrat text-[11px] text-[#7288A3]">
                      No organizations assigned
                    </span>
                  )}
                </div>
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
          <div className="relative flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-semibold text-[#10233A]">
              Assigned roles
            </span>
            <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-[#D3E1EC] p-2">
              {values.roles.length ? (
                values.roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex h-7 items-center gap-2 rounded-md border border-[#D3E1EC] bg-[#F8FDFF] px-2 font-montserrat text-[12px] text-[#10233A]"
                  >
                    {role}
                    <button
                      type="button"
                      aria-label={`Remove ${role}`}
                      onClick={() => toggleRole(role)}
                      className="text-[#7288A3] hover:text-[#10233A]"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="px-1 font-montserrat text-[12px] leading-6 text-[#7288A3]">
                  No roles assigned
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRolesOpen((value) => !value)}
              className="flex min-h-10 items-center justify-between rounded-lg border border-[#D3E1EC] px-3 text-left"
            >
              <span className="font-montserrat text-[12px] text-[#10233A]">
                Choose roles
              </span>
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
                      onClick={() => toggleRole(role)}
                      className="flex h-9 w-full items-center gap-2 rounded-md px-2 hover:bg-[#F8FDFF]"
                    >
                      <CheckBox
                        checked={values.roles.includes(role)}
                        label={`Assign ${role}`}
                        onChange={() => toggleRole(role)}
                      />
                      <span className="font-montserrat text-[13px]">
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
              <div className="relative flex flex-col gap-1.5">
                <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                  Message template
                </span>
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={invitationTemplateOpen}
                  onClick={() =>
                    setInvitationTemplateOpen((current) => !current)
                  }
                  className="flex h-10 items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 text-left outline-none focus:border-[#007EA7]"
                >
                  <span className="font-montserrat text-[13px] text-[#10233A]">
                    {INVITATION_TEMPLATES.find(
                      (template) => template.id === invitationTemplate,
                    )?.label ?? "Choose template"}
                  </span>
                  <ChevronDown
                    size={17}
                    className={`text-[#7288A3] ${invitationTemplateOpen ? "rotate-180" : ""}`}
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
                        onClick={() => {
                          setInvitationTemplate(template.id);
                          setInvitationMessage(template.message);
                          setInvitationTemplateOpen(false);
                        }}
                        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#F0F7FA]"
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded border border-[#A9BED0]">
                          {invitationTemplate === template.id && (
                            <Check size={12} className="text-[#007EA7]" />
                          )}
                        </span>
                        <span className="font-montserrat text-[12px] text-[#10233A]">
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
                username: values.username.trim(),
                email: values.email.trim(),
                phone: values.phone.trim(),
                fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
                position: values.position.trim(),
                organizations: values.roles.some((role) =>
                  isSystemAdministratorRole(role),
                )
                  ? "All organizations"
                  : values.organizations.join(", ") || "Unassigned",
                sodraUser: values.sodraUser.trim(),
                sodraPassword: values.sodraPassword,
                edsUser: values.edsUser.trim(),
                edsPassword: values.edsPassword,
                profileImage: values.profileImage,
                lastLogin: values.lastLogin,
                loginHistory: values.loginHistory,
                activityLog: JSON.stringify([
                  {
                    date: timestamp(),
                    action: initial
                      ? "Updated internal user profile"
                      : "Created internal user profile",
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
}: {
  audience: Audience;
  section: Section;
  createOnOpen?: boolean;
  onCreateOpened?: () => void;
}) {
  const key = storageKey(audience, section);
  const defaults =
    section === "Roles"
      ? ROLE_COLUMNS
      : audience === "Internal users"
        ? INTERNAL_USER_COLUMNS
        : USER_COLUMNS;
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<DirectoryRow[]>(() =>
    loadRows(audience, section),
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DirectoryRow | "new" | null>(null);
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
  const [viewAll, setViewAll] = useState(false);
  const { startResize } = useColumnResize(columns, setColumns);
  useEffect(() => {
    if (!addFilterOpen && openValueFilter === null) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !filterMenuRef.current?.contains(target)) {
        setAddFilterOpen(false);
        setOpenValueFilter(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAddFilterOpen(false);
      setOpenValueFilter(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addFilterOpen, openValueFilter]);
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
    setActiveFilterKeys([]);
    setPendingFilterKeys([]);
    setFilterValues({});
    setAddFilterOpen(false);
    setOpenValueFilter(null);
    setPage(1);
    setViewAll(false);
  }, [audience, defaults, key, section]);
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
    return value
      ? columnFilteredRows.filter((row) =>
          Object.values(row).join(" ").toLowerCase().includes(value),
        )
      : columnFilteredRows;
  }, [columnFilteredRows, query]);
  const visibleColumns = columns.filter((column) => column.visible);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filtered,
    (row, column) => row[column],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / DIRECTORY_ROWS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages);
  const displayedRows = viewAll
    ? sortedRows
    : sortedRows.slice(
        (safePage - 1) * DIRECTORY_ROWS_PER_PAGE,
        safePage * DIRECTORY_ROWS_PER_PAGE,
      );
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
  const remove = (ids: Set<string>) => {
    setRows((current) => {
      const removableIds = new Set(
        Array.from(ids).filter((id) => {
          const row = current.find((candidate) => candidate.id === id);
          return !(
            section === "Roles" && isSystemAdministratorRole(row?.name)
          );
        }),
      );
      const nextRows = current.filter((row) => !removableIds.has(row.id));
      persistRows(audience, section, nextRows);
      const deletedIds = readDeletedIds(audience, section);
      removableIds.forEach((id) => deletedIds.add(id));
      persistDeletedIds(audience, section, deletedIds);

      if (section === "Roles") {
        const deletedRoleNames = current
          .filter((row) => removableIds.has(row.id))
          .map((row) => row.name);
        const users = loadRows(audience, "Users").map((user) => ({
          ...user,
          roles:
            (user.roles ?? "")
              .split(",")
              .map((role) => role.trim())
              .filter((role) => role && !deletedRoleNames.includes(role))
              .join(", ") || "Unassigned",
        }));
        persistRows(audience, "Users", users);
      }
      return nextRows;
    });
    setSelected(new Set());
  };
  const save = (row: DirectoryRow) => {
    setRows((current) => {
      const nextRows =
        editing === "new"
          ? [...current, row]
          : current.map((value) => (value.id === row.id ? row : value));
      persistRows(audience, section, nextRows);
      const deletedIds = readDeletedIds(audience, section);
      if (deletedIds.delete(row.id)) {
        persistDeletedIds(audience, section, deletedIds);
      }
      return nextRows;
    });
    setEditing(null);
  };

  if (editing) {
    return section === "Roles" ? (
      <RolePanel
        audience={audience}
        initial={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
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
              Create new
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
        <div ref={filterMenuRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
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
              <div key={filterKey} className="relative">
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
                          <div
                            key={option.value}
                            className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                            onClick={() => toggleValue(option.value)}
                          >
                            <CheckBox
                              checked={selectedValues.includes(option.value)}
                              label={`Filter by ${option.label}`}
                              onChange={() => toggleValue(option.value)}
                            />
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
                          </div>
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
          <div className="relative flex-shrink-0">
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
                        onClick={() => {
                          setPendingFilterKeys((current) =>
                            checked
                              ? current.filter((key) => key !== column.key)
                              : [...current, column.key],
                          );
                          setOpenValueFilter(null);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#F2F7FC]"
                      >
                        <span
                          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                        >
                          {checked && (
                            <Check
                              size={13}
                              strokeWidth={2.5}
                              className="text-white"
                            />
                          )}
                        </span>
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
              setViewAll(false);
            }}
            className="flex h-7 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[#E5EDF9] px-2 py-[5px] font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3] hover:bg-[#DCE7F6]"
          >
            <X size={15} />
            <span>Clear filters</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selected.size}
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
                    ) + 114,
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
                  Create new
                </PageActionButton>
              </span>
            </div>
          </div>
          <HorizontalTableScrollbar scrollRef={tableScrollRef} />
          <TablePagination
            currentPage={1}
            totalPages={1}
            itemCount={0}
            itemsPerPage={DIRECTORY_ROWS_PER_PAGE}
            onPageChange={() => undefined}
            onShowMore={() => setViewAll((current) => !current)}
            showMoreLabel={viewAll ? "Default" : "Show more"}
            allItemsVisible={viewAll}
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
                  ) + 114,
              }}
            >
              <div className="mb-3 flex h-6 items-center">
                <div data-table-header-select="true" className="flex h-9 w-[42px] items-start justify-center px-3">
                  <CheckBox
                    checked={allSelected}
                    label="Select all records"
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(filtered.map((row) => row.id)),
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
                <div className="sticky right-0 z-20 h-full w-[72px] flex-shrink-0 bg-white" />
              </div>
              <div className="flex flex-col gap-0.5">
                {displayedRows.map((row, index) => (
                  <div
                    key={row.id}
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
                        <span className="block truncate font-montserrat text-[12px] font-normal text-[#10233A]">
                          {row[column.key] || "—"}
                        </span>
                      </div>
                    ))}
                    <div
                      className={`sticky right-0 z-10 flex h-full w-[72px] flex-shrink-0 items-center justify-end gap-1 pr-1 ${index % 2 ? "bg-white" : "bg-[#F8FDFF]"} group-hover:bg-[#E7F4F9]`}
                    >
                      <button
                        type="button"
                        aria-label={`Edit ${row.name || row.fullName || row.username || row.email}`}
                        title="EDIT"
                        onClick={() => setEditing(row)}
                        className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] transition-colors hover:border-[#007EA7] hover:text-[#007EA7] group-hover:bg-[#E7F4F9]"
                      >
                        <Pencil size={15} />
                      </button>
                      <RowDeleteButton
                        label={`Delete ${row.id}`}
                        title={
                          isSystemAdministratorRole(row.name)
                            ? "SYSTEM ROLE CANNOT BE DELETED"
                            : "DELETE"
                        }
                        disabled={isSystemAdministratorRole(row.name)}
                        className="group-hover:bg-[#E7F4F9]"
                        onDelete={() => remove(new Set([row.id]))}
                      />
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
                      Create new
                    </PageActionButton>
                  </div>
                )}
              </div>
            </div>
          </div>
          <HorizontalTableScrollbar scrollRef={tableScrollRef} />
          <div className="contents">
            <TablePagination
              currentPage={viewAll ? 1 : safePage}
              totalPages={viewAll ? 1 : totalPages}
              itemCount={filtered.length}
              itemsPerPage={
                viewAll
                  ? Math.max(1, filtered.length)
                  : DIRECTORY_ROWS_PER_PAGE
              }
              onPageChange={viewAll ? () => undefined : setPage}
              onShowMore={() => {
                setViewAll((current) => !current);
                setPage(1);
              }}
              showMoreLabel={viewAll ? "Default" : "Show more"}
              allItemsVisible={viewAll}
            />
          </div>
        </>
      )}
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
