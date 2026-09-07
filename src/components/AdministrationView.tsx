import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardCopy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  ShieldCheck,
  X,
} from "lucide-react";
import { PageActionButton, PageHeader } from "./PageHeader";
import OcrSearchField from "./OcrSearchField";
import RefreshAllButton from "./RefreshAllButton";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import { getAdministrationGroupNames } from "./AutomationSecurityAccessView";
import { INITIAL_ADMINISTRATION_USERS } from "./administrationUsersStore";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import TablePagination from "./TablePagination";
import OcrFieldValidationSettings from "./OcrFieldValidationSettings";

export type AdministrationSection =
  | "human-task-types"
  | "users"
  | "notifications"
  | "monitoring"
  | "configuration"
  | "logs"
  | "activity"
  | "license";

type AdminRow = { id: string; [key: string]: string };
type Column = { key: string; label: string; width: number };
type TableConfig = {
  title: string;
  singular: string;
  columns: Column[];
  rows: AdminRow[];
  createFields: string[];
};

const TABLES: Partial<Record<AdministrationSection, TableConfig>> = {
  "human-task-types": {
    title: "OCR Validation Settings",
    singular: "OCR validation setting",
    columns: [
      { key: "name", label: "Name", width: 250 },
      { key: "description", label: "Description", width: 300 },
      { key: "version", label: "Version", width: 180 },
      { key: "createdBy", label: "Created by", width: 190 },
      { key: "creationDate", label: "Creation date", width: 180 },
    ],
    createFields: ["name", "description", "version"],
    rows: [],
  },
  users: {
    title: "User Management",
    singular: "user",
    columns: [
      { key: "username", label: "Name", width: 210 },
      { key: "email", label: "E-mail", width: 260 },
      { key: "fullName", label: "Full Name", width: 220 },
      { key: "status", label: "Status", width: 130 },
      { key: "groups", label: "Groups", width: 240 },
      { key: "createdBy", label: "Created by", width: 190 },
      { key: "creationDate", label: "Creation date", width: 180 },
    ],
    createFields: ["username", "email", "fullName", "status", "groups"],
    rows: INITIAL_ADMINISTRATION_USERS.map((user) => ({
      ...user,
      updatedBy: user.updatedBy ?? "",
      lastUpdate: user.lastUpdate ?? "",
    })),
  },
  notifications: {
    title: "Notification Management",
    singular: "notification channel",
    columns: [
      { key: "name", label: "Name", width: 270 },
      { key: "description", label: "Description", width: 350 },
      { key: "configName", label: "Config Name", width: 230 },
      { key: "channelType", label: "Channel Type", width: 170 },
      { key: "createdBy", label: "Created by", width: 190 },
      { key: "creationDate", label: "Creation date", width: 180 },
    ],
    createFields: ["name", "description", "configName", "channelType"],
    rows: [
      {
        id: "not-1",
        name: "rpaplatform",
        description: "Platform notification channel",
        configName: "platform_email",
        channelType: "email",
        createdBy: "RPA platform",
        creationDate: "24.08.2023 19:15",
      },
      {
        id: "not-2",
        name: "demo_matching_results_email",
        description: "PO matching results channel",
        configName: "matching_results_email",
        channelType: "email",
        createdBy: "Administrator",
        creationDate: "30.01.2024 14:47",
      },
    ],
  },
  configuration: {
    title: "Control Server Configuration",
    singular: "configuration parameter",
    columns: [
      { key: "key", label: "Key", width: 360 },
      { key: "value", label: "Value", width: 560 },
      { key: "scope", label: "Scope", width: 220 },
    ],
    createFields: ["key", "value", "scope"],
    rows: [
      {
        id: "cfg-1",
        key: "scheduler.enabled",
        value: "true",
        scope: "Control Server",
      },
      {
        id: "cfg-2",
        key: "notifications.default-channel",
        value: "rpaplatform",
        scope: "Global",
      },
      {
        id: "cfg-3",
        key: "runs.retention-days",
        value: "30",
        scope: "Control Server",
      },
    ],
  },
};

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

function Breadcrumb({ current }: { current: string }) {
  return (
    <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium">
      <span className="text-[#7288A3]">OCR</span>
      <span className="text-[#A1B6C6]">/</span>
      <span className="text-[#7288A3]">Administration</span>
      <span className="text-[#A1B6C6]">/</span>
      <span className="text-[#A1B6C6]">{current}</span>
    </div>
  );
}

function EditPanel({
  title,
  columns,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  columns: Column[];
  initial?: AdminRow;
  onClose: () => void;
  onSave: (values: AdminRow) => void;
}) {
  const [values, setValues] = useState<AdminRow>(() =>
    initial ? { ...initial } : { id: `${Date.now()}` },
  );
  const required = columns.filter(
    (column) => !["createdBy", "creationDate"].includes(column.key),
  );
  const valid = required.every((column) => (values[column.key] ?? "").trim());
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-[#10233A]/20"
      onMouseDown={onClose}
    >
      <div
        className="flex h-full w-[420px] max-w-full flex-col bg-white p-6 shadow-[-2px_0_0_#E5EDF9]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-7 flex items-center justify-between">
          <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-[#7288A3] hover:text-[#10233A]"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto">
          {required.map((column) => (
            <label key={column.key} className="flex flex-col gap-1.5">
              <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
                {column.label} <span className="text-[#D64545]">*</span>
              </span>
              {column.key === "description" || column.key === "value" ? (
                <textarea
                  value={values[column.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [column.key]: event.target.value,
                    }))
                  }
                  className="min-h-[96px] rounded-lg border border-[#D3E1EC] p-3 font-montserrat text-[13px] text-[#10233A] outline-none focus:border-[#007EA7]"
                />
              ) : (
                <input
                  value={values[column.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [column.key]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] text-[#10233A] outline-none focus:border-[#007EA7]"
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-auto flex justify-end gap-3 pt-6">
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
            onClick={() =>
              onSave({
                ...values,
                createdBy: values.createdBy || "Administrator",
                creationDate:
                  values.creationDate ||
                  new Date().toLocaleString("lt-LT", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
              })
            }
            className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function UserEditPanel({
  initial,
  onClose,
  onSave,
}: {
  initial?: AdminRow;
  onClose: () => void;
  onSave: (values: AdminRow) => void;
}) {
  const availableGroups = useMemo(() => getAdministrationGroupNames(), []);
  const [firstName = "", ...lastNameParts] = (initial?.fullName ?? "").split(
    " ",
  );
  const [values, setValues] = useState({
    username: initial?.username ?? "",
    password: "",
    confirmPassword: "",
    firstName,
    lastName: lastNameParts.join(" "),
    email: initial?.email ?? "",
    groups: initial?.groups
      ? initial.groups
          .split(",")
          .map((group) => group.trim())
          .filter((group) => availableGroups.includes(group))
      : ([] as string[]),
    defaultGroup:
      initial?.groups?.split(",")[0]?.trim() &&
      availableGroups.includes(initial.groups.split(",")[0].trim())
        ? initial.groups.split(",")[0].trim()
        : "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [defaultGroupOpen, setDefaultGroupOpen] = useState(false);
  const valid =
    values.username.trim() !== "" &&
    values.firstName.trim() !== "" &&
    values.lastName.trim() !== "" &&
    values.email.trim() !== "" &&
    values.groups.length > 0 &&
    values.password === values.confirmPassword;
  const toggleGroup = (group: string) =>
    setValues((current) => ({
      ...current,
      groups: current.groups.includes(group)
        ? current.groups.filter((value) => value !== group)
        : [...current.groups, group],
    }));
  const fieldClass =
    "h-10 w-full rounded-lg border border-[#D3E1EC] bg-white px-3 font-montserrat text-[13px] text-[#10233A] outline-none transition-colors focus:border-[#007EA7]";

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-[#10233A]/20"
      onMouseDown={onClose}
    >
      <div
        className="flex h-full w-[440px] max-w-full flex-col bg-white p-6 shadow-[-2px_0_0_#E5EDF9]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-7 flex items-center justify-between">
          <h2 className="font-montserrat text-[22px] font-semibold text-[#10233A]">
            {initial ? "Edit User" : "Create User"}
          </h2>
          <button
            type="button"
            aria-label="Close user form"
            onClick={onClose}
            className="text-[#7288A3] hover:text-[#10233A]"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Username <span className="text-[#D64545]">*</span>
            </span>
            <input
              value={values.username}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Password
            </span>
            <span className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={values.password}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                className={`${fieldClass} pr-11`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3] hover:text-[#007EA7]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Confirm Password
            </span>
            <span className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={values.confirmPassword}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                className={`${fieldClass} pr-11`}
              />
              <button
                type="button"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirmed password"
                    : "Show confirmed password"
                }
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7288A3] hover:text-[#007EA7]"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              First Name <span className="text-[#D64545]">*</span>
            </span>
            <input
              value={values.firstName}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Last Name <span className="text-[#D64545]">*</span>
            </span>
            <input
              value={values.lastName}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              E-mail <span className="text-[#D64545]">*</span>
            </span>
            <input
              type="email"
              value={values.email}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </label>
          <div className="relative flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Groups
            </span>
            <button
              type="button"
              onClick={() => {
                setGroupsOpen((value) => !value);
                setDefaultGroupOpen(false);
              }}
              className="flex min-h-10 w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 text-left"
            >
              <span className="flex flex-wrap gap-1.5">
                {values.groups.length ? (
                  values.groups.map((group) => (
                    <span
                      key={group}
                      className="flex items-center gap-1 rounded-md border border-[#D3E1EC] bg-[#F8FDFF] px-2 py-1 font-montserrat text-[12px] text-[#10233A]"
                    >
                      {group}
                      <X
                        size={12}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleGroup(group);
                        }}
                      />
                    </span>
                  ))
                ) : (
                  <span className="font-montserrat text-[12px] text-[#A1B6C6]">
                    Choose groups
                  </span>
                )}
              </span>
              <ChevronDown
                size={17}
                className={`flex-shrink-0 text-[#7288A3] transition-transform ${groupsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {groupsOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_10px_28px_rgba(16,35,58,0.16)]">
                {availableGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${values.groups.includes(group) ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {values.groups.includes(group) && (
                        <Check size={12} className="text-white" />
                      )}
                    </span>
                    <span className="font-montserrat text-[13px] text-[#10233A]">
                      {group}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative flex flex-col gap-1.5">
            <span className="font-montserrat text-[12px] font-medium text-[#10233A]">
              Default group
            </span>
            <button
              type="button"
              onClick={() => {
                setDefaultGroupOpen((value) => !value);
                setGroupsOpen(false);
              }}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-[#D3E1EC] bg-white px-3 text-left"
            >
              <span
                className={`font-montserrat text-[13px] ${values.defaultGroup ? "text-[#10233A]" : "text-[#A1B6C6]"}`}
              >
                {values.defaultGroup || "Choose default group"}
              </span>
              <ChevronDown
                size={17}
                className={`text-[#7288A3] transition-transform ${defaultGroupOpen ? "rotate-180" : ""}`}
              />
            </button>
            {defaultGroupOpen && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-2 shadow-[0_10px_28px_rgba(16,35,58,0.16)]">
                {availableGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setValues((current) => ({
                        ...current,
                        defaultGroup: group,
                        groups: current.groups.includes(group)
                          ? current.groups
                          : [...current.groups, group],
                      }));
                      setDefaultGroupOpen(false);
                    }}
                    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#F8FDFF]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${values.defaultGroup === group ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {values.defaultGroup === group && (
                        <Check size={12} className="text-white" />
                      )}
                    </span>
                    <span className="font-montserrat text-[13px] text-[#10233A]">
                      {group}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
            onClick={() =>
              onSave({
                id: initial?.id ?? `${Date.now()}`,
                username: values.username.trim(),
                email: values.email.trim(),
                fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
                status: initial?.status ?? "Enabled",
                groups: values.groups.join(", "),
                createdBy: initial?.createdBy ?? "Administrator",
                creationDate:
                  initial?.creationDate ??
                  new Date().toLocaleString("lt-LT", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                updatedBy: "Administrator",
                lastUpdate: new Date().toLocaleString("lt-LT", {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              })
            }
            className="h-10 rounded-lg bg-[#007EA7] px-5 font-montserrat text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E5EDF9] disabled:text-[#A1B6C6]"
          >
            {initial ? "Save" : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminTablePage({
  section,
  config,
}: {
  section: AdministrationSection;
  config: TableConfig;
}) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const defaultColumnSettings = useMemo<ColConfig[]>(
    () => [
      ...config.columns.map((column) => ({ ...column, visible: true })),
      { key: "updatedBy", label: "Updated By", width: 190, visible: false },
      { key: "lastUpdate", label: "Last Update", width: 180, visible: false },
    ],
    [config],
  );
  const storageKey = `finansu-harmonija-v6:administration:${section}`;
  const [rows, setRows] = useState<AdminRow[]>(() => {
    let initialRows = config.rows;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as AdminRow[];
        const matchesSection =
          Array.isArray(parsed) &&
          parsed.every((row) =>
            config.columns.every((column) => column.key in row),
          );
        if (matchesSection) initialRows = parsed;
      }
    } catch {
      /* Use the supplied table records. */
    }
    if (section !== "users") return initialRows;
    return initialRows.map((row, index) => ({
      ...row,
      username:
        row.username?.trim() || row.fullName?.trim() || `User ${index + 1}`,
      email: row.email?.trim() || "Not provided",
      fullName:
        row.fullName?.trim() || row.username?.trim() || `User ${index + 1}`,
      status: row.status?.trim() || "Enabled",
      groups: row.groups?.trim() || "Unassigned",
      createdBy: row.createdBy?.trim() || "Administrator",
      creationDate: row.creationDate?.trim() || "Not available",
    }));
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminRow | "new" | null>(null);
  const [columnSettings, setColumnSettings] = useState<ColConfig[]>(
    defaultColumnSettings,
  );
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { startResize } = useColumnResize(columnSettings, setColumnSettings);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }, [rows, storageKey]);
  useEffect(() => {
    setColumnSettings(defaultColumnSettings);
    setShowColumnSettings(false);
  }, [defaultColumnSettings]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? rows.filter((row) =>
          Object.values(row).join(" ").toLowerCase().includes(normalized),
        )
      : rows;
  }, [query, rows]);
  const displayValue = (row: AdminRow, key: string) =>
    key === "updatedBy"
      ? row.updatedBy || row.createdBy || "Administrator"
      : key === "lastUpdate"
        ? row.lastUpdate || row.creationDate || "Not available"
        : row[key]?.trim() || "Not provided";
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filtered,
    displayValue,
  );
  const allSelected =
    filtered.length > 0 && filtered.every((row) => selected.has(row.id));
  const columns = columnSettings.filter((column) => column.visible);
  const remove = (ids: Set<string>) => {
    setRows((current) => current.filter((row) => !ids.has(row.id)));
    setSelected(new Set());
  };
  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title={config.title}
        actions={
          <PageActionButton onClick={() => setEditing("new")}>
            Create new
          </PageActionButton>
        }
      />
      <Breadcrumb current={config.title} />
      {section === "notifications" && (
        <div className="flex h-10 items-end gap-8 border-b border-[#E5EDF9]">
          <button
            type="button"
            className="h-10 border-b-2 border-[#007EA7] px-1 font-montserrat text-[13px] font-semibold text-[#007EA7]"
          >
            Channels
          </button>
          <button
            type="button"
            className="h-10 border-b-2 border-transparent px-1 font-montserrat text-[13px] font-medium text-[#7288A3]"
          >
            Templates
          </button>
        </div>
      )}
      <div className="system-table-toolbar flex h-7 min-h-7 flex-nowrap items-center justify-between gap-4">
        <OcrSearchField
          ariaLabel={`Search ${config.title}`}
          value={query}
          onChange={setQuery}
        />
        <div className="flex items-center gap-4">
          <BulkDeleteButton
            selectedCount={selected.size}
            onDelete={() => remove(selected)}
          />
          <ColumnSettingsButton onClick={() => setShowColumnSettings(true)} />
          <RefreshAllButton
            onRefresh={() =>
              setRows((current) => current.map((row) => ({ ...row })))
            }
          />
        </div>
      </div>
      <div
        ref={tableScrollRef}
        className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
      >
        <div
          style={{
            minWidth:
              columns.reduce((sum, column) => sum + column.width, 0) + 90,
          }}
        >
          <div className="mb-3 flex h-6 items-center">
            <div data-table-header-select="true" className="flex w-[42px] px-3">
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
            {columns.map((column, index) => {
              const realIndex = columnSettings.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium ${index ? "border-l border-[#D3E1EC] text-[#7288A3]" : "text-[#10233A]"}`}
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
                    onMouseDown={(event) => startResize(realIndex, event)}
                  />
                </div>
              );
            })}
            <div className="w-[48px]" />
          </div>
          <div className="flex flex-col gap-0.5">
            {sortedRows.map((row, index) => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(row)}
                className={`flex h-10 cursor-pointer items-center rounded-lg ${index % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
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
                {columns.map((column, columnIndex) => (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className="flex-shrink-0 overflow-hidden px-3"
                  >
                    <span
                      className={`block truncate font-montserrat text-[12px] ${columnIndex === 0 ? "font-medium text-[#007EA7]" : "text-[#10233A]"}`}
                    >
                      {column.key === "updatedBy"
                        ? row.updatedBy || row.createdBy || "Administrator"
                        : column.key === "lastUpdate"
                          ? row.lastUpdate || row.creationDate || "—"
                          : row[column.key]}
                    </span>
                  </div>
                ))}
                <div className="flex w-[48px] justify-end">
                  <RowDeleteButton
                    label={`Delete ${row.id}`}
                    onDelete={() => remove(new Set([row.id]))}
                  />
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
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
      <TablePagination
        currentPage={currentPage}
        totalPages={Math.max(1, Math.ceil(filtered.length / 14))}
        itemCount={filtered.length}
        onPageChange={setCurrentPage}
      />
      {editing &&
        (section === "users" ? (
          <UserEditPanel
            initial={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
            onSave={(values) => {
              setRows((current) =>
                editing === "new"
                  ? [...current, values]
                  : current.map((row) => (row.id === values.id ? values : row)),
              );
              setEditing(null);
            }}
          />
        ) : (
          <EditPanel
            title={`${editing === "new" ? "Create" : "Edit"} ${config.singular}`}
            columns={config.columns.filter((column) =>
              config.createFields.includes(column.key),
            )}
            initial={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
            onSave={(values) => {
              setRows((current) =>
                editing === "new"
                  ? [...current, values]
                  : current.map((row) => (row.id === values.id ? values : row)),
              );
              setEditing(null);
            }}
          />
        ))}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={columnSettings}
          defaultColumns={defaultColumnSettings}
          onSave={(next) => {
            setColumnSettings(next);
            setShowColumnSettings(false);
          }}
          onClose={() => setShowColumnSettings(false)}
        />
      )}
    </div>
  );
}

const LOGS = [
  {
    timestamp: "2026-08-04 15:16:42.118",
    severity: "INFO",
    domain: "CONTROL_SERVER",
    message: "Automation process run 9431 was submitted.",
  },
  {
    timestamp: "2026-08-04 15:17:03.581",
    severity: "WARN",
    domain: "SCHEDULER",
    message: "Node target capacity is nearly reached.",
  },
  {
    timestamp: "2026-08-04 15:18:25.064",
    severity: "ERROR",
    domain: "NOTIFICATIONS",
    message: "Notification delivery retry scheduled.",
  },
  {
    timestamp: "2026-08-04 15:19:08.773",
    severity: "DEBUG",
    domain: "SECURITY",
    message: "Permissions cache successfully refreshed.",
  },
];

function LogsView() {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const [domain, setDomain] = useState("ALL");
  const [domainOpen, setDomainOpen] = useState(false);
  const [severityOpen, setSeverityOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const rows = LOGS.filter(
    (log) =>
      (severity === "ALL" || log.severity === severity) &&
      (domain === "ALL" || log.domain === domain) &&
      `${log.timestamp} ${log.severity} ${log.domain} ${log.message}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Logs" />
      <Breadcrumb current="Logs" />
      <div className="grid items-end gap-4 lg:grid-cols-[minmax(260px,1fr)_210px_210px]">
        <label className="flex flex-col gap-1">
          <span className="font-montserrat text-[11px] text-[#7288A3]">
            Search query
          </span>
          <OcrSearchField
            ariaLabel="Search administration logs"
            value={query}
            onChange={setQuery}
          />
        </label>
        <LogsFilterDropdown
          label="Filter by domain"
          value={domain}
          options={[
            "ALL",
            "CONTROL_SERVER",
            "SCHEDULER",
            "NOTIFICATIONS",
            "SECURITY",
          ]}
          ariaLabel="Filter logs by domain"
          open={domainOpen}
          onToggle={() => {
            setSeverityOpen(false);
            setDomainOpen((open) => !open);
          }}
          onSelect={(value) => {
            setDomain(value);
            setDomainOpen(false);
          }}
        />
        <LogsFilterDropdown
          label="Filter by severity"
          value={severity}
          options={["ALL", "TRACE", "DEBUG", "INFO", "WARN", "ERROR"]}
          ariaLabel="Filter logs by severity"
          open={severityOpen}
          onToggle={() => {
            setDomainOpen(false);
            setSeverityOpen((open) => !open);
          }}
          onSelect={(value) => {
            setSeverity(value);
            setSeverityOpen(false);
          }}
        />
      </div>
      <div
        ref={tableScrollRef}
        className="min-h-[420px] overflow-x-auto rounded-xl border border-[#E5EDF9] bg-[#FBFDFF] p-5 font-mono text-[12px] leading-7 text-[#10233A] scrollbar-hide"
      >
        <div className="min-w-[900px]">
          {rows.map((log) => (
            <div
              key={`${log.timestamp}-${log.domain}`}
              className="whitespace-pre-wrap"
            >
              <span className="text-[#7288A3]">[{log.timestamp}]</span>{" "}
              <span
                className={
                  log.severity === "ERROR"
                    ? "text-[#D64545]"
                    : log.severity === "WARN"
                      ? "text-[#D98900]"
                      : "text-[#007EA7]"
                }
              >
                [{log.severity}]
              </span>{" "}
              <span className="text-[#7288A3]">[{log.domain}]</span>{" "}
              {log.message}
            </div>
          ))}
          {!rows.length && (
            <div className="flex min-h-[360px] items-center justify-center font-montserrat text-[#7288A3]">
              No log entries found
            </div>
          )}
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={currentPage}
        totalPages={Math.max(1, Math.ceil(rows.length / 14))}
        itemCount={rows.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

function LogsFilterDropdown({
  label,
  value,
  options,
  ariaLabel,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  ariaLabel: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="relative flex min-w-0 flex-col">
      <span className="font-montserrat text-[13px] font-medium leading-5 text-[#7288A3]">
        {label}
      </span>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-10 w-full items-center justify-between gap-3 border-b-2 border-[#D3E1EC] bg-white px-0 font-montserrat text-[15px] font-medium leading-6 text-[#10233A] outline-none transition-colors hover:border-[#A1B6C6] focus:border-[#007EA7]"
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          size={17}
          className={`flex-shrink-0 text-[#7288A3] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className="absolute left-0 right-0 top-[64px] z-50 max-h-[220px] overflow-y-auto rounded-lg border border-[#D3E1EC] bg-white p-1 shadow-[0_10px_24px_rgba(16,35,58,0.14)]"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(option)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left font-montserrat text-[13px] font-semibold text-[#10233A] transition-colors ${selected ? "bg-[#E5EDF9]" : "hover:bg-[#F8FDFF]"}`}
              >
                <span
                  className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border ${selected ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                >
                  {selected && (
                    <Check size={12} strokeWidth={2.5} className="text-white" />
                  )}
                </span>
                <span className="truncate">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonitoringView() {
  const [tab, setTab] = useState("OCR");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const metrics =
    tab === "OCR"
      ? [
          ["Runs", 68],
          ["Tasks", 82],
          ["OCR documents", 54],
        ]
      : tab === "ML"
        ? [
            ["Training jobs", 36],
            ["Models", 62],
            ["Predictions", 78],
          ]
        : [
            ["CPU", 42],
            ["Memory", 67],
            ["Active nodes", 75],
          ];
  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Monitoring" />
      <Breadcrumb current="Monitoring" />
      <div className="flex h-10 items-end gap-8 border-b border-[#E5EDF9]">
        {["OCR", "ML", "Control Server"].map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`h-10 border-b-2 px-1 font-montserrat text-[13px] font-semibold ${tab === item ? "border-[#007EA7] text-[#007EA7]" : "border-transparent text-[#7288A3]"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div className="min-w-[920px]">
          <div className="grid gap-5 lg:grid-cols-3">
            {metrics.map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[#D3E1EC] bg-white p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-montserrat text-[14px] font-semibold text-[#10233A]">
                    {label}
                  </span>
                  <span className="font-montserrat text-[22px] font-semibold text-[#007EA7]">
                    {value}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#E5EDF9]">
                  <div
                    className="h-2 rounded-full bg-[#007EA7]"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-[#D3E1EC] p-5">
            <h2 className="mb-6 font-montserrat text-[16px] font-semibold text-[#10233A]">
              {tab} activity
            </h2>
            <div className="flex h-[260px] items-end gap-3 border-b border-l border-[#E5EDF9] px-5">
              {[34, 54, 42, 78, 61, 88, 64, 73, 52, 82, 69, 91].map(
                (height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t bg-[#8CC7DB] transition-colors hover:bg-[#007EA7]"
                    style={{ height: `${height}%` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={currentPage}
        totalPages={1}
        itemCount={metrics.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

function ActivityView() {
  const [query, setQuery] = useState("");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activityColumns, setActivityColumns] = useState<ColConfig[]>([
    { key: "id", label: "Record ID", width: 150, visible: true },
    { key: "change", label: "Change Type", width: 150, visible: true },
    { key: "version", label: "Version", width: 100, visible: true },
    { key: "name", label: "Name", width: 230, visible: true },
    { key: "user", label: "Updated By", width: 180, visible: true },
    { key: "fields", label: "Updated Fields", width: 250, visible: true },
    { key: "date", label: "Event Date", width: 180, visible: true },
  ]);
  const { startResize: startActivityColumnResize } = useColumnResize(
    activityColumns,
    setActivityColumns,
  );
  const activityRows = [
    {
      id: "9431",
      change: "CREATE",
      version: "1",
      name: "AutomationProcessRun",
      user: "Run user",
      fields: "status, creationDate",
      date: "04.08.2026 15:16",
    },
    {
      id: "1259",
      change: "UPDATE",
      version: "12",
      name: "AutomationProcess",
      user: "Administrator",
      fields: "configuration",
      date: "04.08.2026 14:58",
    },
    {
      id: "node-01",
      change: "ACTION",
      version: "4",
      name: "Node",
      user: "Administrator",
      fields: "status",
      date: "04.08.2026 14:41",
    },
  ];
  type ActivityColumnKey =
    "id" | "change" | "version" | "name" | "user" | "fields" | "date";
  const activityGridTemplate = activityColumns
    .map((column) => `${column.width}px`)
    .join(" ");
  const activityTableWidth = activityColumns.reduce(
    (total, column) => total + column.width,
    0,
  );
  const filteredRows = activityRows.filter((row) =>
    Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort(
    filteredRows,
    (row, key: ActivityColumnKey) => row[key],
  );

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader title="Activity Log" />
      <Breadcrumb current="Activity Log" />
      <div className="system-table-toolbar flex h-7 min-h-7 flex-nowrap items-center gap-1">
        <OcrSearchField
          ariaLabel="Search activity log"
          value={query}
          onChange={setQuery}
        />
      </div>
      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div style={{ minWidth: activityTableWidth }}>
          <div
            className="grid h-10 items-center px-3"
            style={{ gridTemplateColumns: activityGridTemplate }}
          >
            {activityColumns.map((column, index) => (
              <div
                key={column.key}
                className="relative flex min-w-0 items-center gap-[6px]"
              >
                <span className="truncate font-montserrat text-[12px] font-medium text-[#10233A]">
                  {column.label}
                </span>
                <ColumnSortButton
                  columnLabel={column.label}
                  direction={directionFor(column.key as ActivityColumnKey)}
                  onDirectionChange={(direction) =>
                    changeSort(column.key as ActivityColumnKey, direction)
                  }
                />
                <ResizeHandle
                  onMouseDown={(event) =>
                    startActivityColumnResize(index, event)
                  }
                />
              </div>
            ))}
          </div>
          {sortedRows.map((row, index) => (
            <div
              key={`${row.id}-${row.date}`}
              className={`grid h-11 items-center rounded-lg px-3 ${index % 2 ? "bg-white" : "bg-[#F8FDFF]"}`}
              style={{ gridTemplateColumns: activityGridTemplate }}
            >
              {activityColumns.map((column) => (
                <span
                  key={column.key}
                  className="truncate font-montserrat text-[12px] text-[#10233A]"
                >
                  {row[column.key as ActivityColumnKey]}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={currentPage}
        totalPages={Math.max(1, Math.ceil(sortedRows.length / 14))}
        itemCount={sortedRows.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

function LicenseView() {
  const [toast, setToast] = useState("");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const systemId = "FH-V6-CS-8F4D-2A91";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(systemId);
    } catch {
      /* browser can deny clipboard access */
    }
    setToast("System ID copied");
    setTimeout(() => setToast(""), 2200);
  };
  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
      <PageHeader
        title="License Management"
        actions={
          <>
            <PageActionButton
              onClick={() => setToast("License change form opened")}
            >
              Change license
            </PageActionButton>
            <PageActionButton
              onClick={() => setToast("Online license validation completed")}
            >
              Change online
            </PageActionButton>
          </>
        }
      />
      <Breadcrumb current="License Management" />
      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div className="grid min-w-[820px] max-w-[900px] gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-[#D3E1EC] p-6">
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck className="text-[#007EA7]" />
              <h2 className="font-montserrat text-[18px] font-semibold text-[#10233A]">
                Active license
              </h2>
            </div>
            <dl className="grid grid-cols-[150px_1fr] gap-y-4 font-montserrat text-[13px]">
              <dt className="text-[#7288A3]">Status</dt>
              <dd className="font-semibold text-[#2E9B65]">Active</dd>
              <dt className="text-[#7288A3]">Edition</dt>
              <dd>Enterprise</dd>
              <dt className="text-[#7288A3]">Valid until</dt>
              <dd>31.12.2027</dd>
              <dt className="text-[#7288A3]">Licensed nodes</dt>
              <dd>30</dd>
            </dl>
          </div>
          <div className="rounded-xl border border-[#D3E1EC] p-6">
            <div className="mb-4 flex items-center gap-3">
              <KeyRound className="text-[#007EA7]" />
              <h2 className="font-montserrat text-[18px] font-semibold text-[#10233A]">
                System ID
              </h2>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FDFF] px-4 py-3">
              <code className="text-[13px] text-[#10233A]">{systemId}</code>
              <button
                type="button"
                onClick={copy}
                title="Copy System ID"
                className="text-[#7288A3] hover:text-[#007EA7]"
              >
                <ClipboardCopy size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} />
      <TablePagination
        currentPage={currentPage}
        totalPages={1}
        itemCount={2}
        onPageChange={setCurrentPage}
      />
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 rounded-lg bg-[#E7F7EF] px-5 py-3 font-montserrat text-[13px] font-semibold text-[#237A50] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function AdministrationView({
  section,
}: {
  section: AdministrationSection;
}) {
  if (section === "human-task-types") {
    return (
      <div className="relative flex min-h-full min-w-0 flex-col gap-8 bg-white px-4 py-14 sm:px-8 lg:px-[72px]">
        <PageHeader title="OCR Validation Settings" />
        <Breadcrumb current="OCR Validation Settings" />
        <OcrFieldValidationSettings />
      </div>
    );
  }
  const config = TABLES[section];
  if (config)
    return <AdminTablePage key={section} section={section} config={config} />;
  if (section === "monitoring") return <MonitoringView />;
  if (section === "logs") return <LogsView />;
  if (section === "activity") return <ActivityView />;
  if (section === "license") return <LicenseView />;
  return null;
}
