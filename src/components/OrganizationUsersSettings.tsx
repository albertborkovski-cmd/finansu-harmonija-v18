import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton } from "./PageHeader";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import RefreshAllButton from "./RefreshAllButton";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import { supabase } from "../lib/supabase";
import {
  loadLinkedDirectoryUsers,
  loadOrganizationUserIds,
  reconcileOrganizationUserLinks,
  setOrganizationAssignmentsAndSyncUsers,
  SETTINGS_DATA_CHANGED_EVENT,
  type LinkedDirectoryUser,
} from "../lib/linkedSettingsData";

type Audience = "Internal users" | "External users";

type DirectoryUser = LinkedDirectoryUser & { email: string };

function usersWithEmail<T extends LinkedDirectoryUser>(
  users: T[],
): Array<T & { email: string }> {
  return users.flatMap((user) =>
    typeof user.email === "string" && user.email.trim()
      ? [{ ...user, email: user.email }]
      : [],
  );
}

type UserColumnKey = "name" | "email" | "phone" | "roles";

const USER_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", width: 260, visible: true },
  { key: "email", label: "E-mail", width: 310, visible: true },
  { key: "phone", label: "Phone", width: 180, visible: true },
  { key: "roles", label: "Role", width: 210, visible: true },
];

function loadDirectory(audience: Audience): DirectoryUser[] {
  return usersWithEmail(loadLinkedDirectoryUsers(audience));
}

function loadAssignments(
  organizationId: string,
  audience: Audience,
) {
  if (typeof window === "undefined") return new Set<string>();
  return new Set(loadOrganizationUserIds(organizationId, audience));
}

export default function OrganizationUsersSettings({
  organizationId,
  organizationName,
  onCreateUser,
}: {
  organizationId: string;
  organizationName: string;
  onCreateUser: (audience: Audience) => void;
}) {
  const [audience, setAudience] = useState<Audience>("Internal users");
  const [directories, setDirectories] = useState<Record<Audience, DirectoryUser[]>>(() => ({
    "Internal users": loadDirectory("Internal users"),
    "External users": loadDirectory("External users"),
  }));
  const [assignments, setAssignments] = useState<Record<Audience, Set<string>>>(
    () => {
      return {
        "Internal users": loadAssignments(
          organizationId,
          "Internal users",
        ),
        "External users": loadAssignments(
          organizationId,
          "External users",
        ),
      };
    },
  );
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [columns, setColumns] = useState<ColConfig[]>(USER_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { startResize } = useColumnResize(columns, setColumns);

  const loadLinkedState = useCallback(async () => {
    const { data } = await supabase.from("companies").select("*");
    const organizations = (data ?? []).map((company) => ({
      id: String(company.id ?? ""),
      name: String(company.name ?? ""),
      company_status: String(company.company_status ?? "Active"),
      status: String(company.status ?? ""),
    }));
    const internal = reconcileOrganizationUserLinks(
      organizations,
      "Internal users",
      false,
    );
    const external = reconcileOrganizationUserLinks(
      organizations,
      "External users",
      false,
    );
    const nextDirectories = {
      "Internal users": usersWithEmail(internal.users),
      "External users": usersWithEmail(external.users),
    };
    setDirectories(nextDirectories);
    setAssignments({
      "Internal users":
        internal.assignments.get(organizationId) ?? new Set<string>(),
      "External users":
        external.assignments.get(organizationId) ?? new Set<string>(),
    });
    return organizations;
  }, [organizationId]);

  useEffect(() => {
    void loadLinkedState();
    const refresh = () => void loadLinkedState();
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [loadLinkedState]);

  const users = directories[audience];
  const selected = assignments[audience];
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      [user.fullName, user.username, user.email, user.phone, user.roles]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [query, users]);
  const { sortedRows, changeSort, directionFor } = useMultiColumnSort<
    DirectoryUser,
    UserColumnKey
  >(filteredUsers, (user, key) =>
    key === "name" ? (user.fullName ?? user.username ?? "") : (user[key] ?? ""),
  );
  const visibleColumns = columns.filter((column) => column.visible);

  const refreshDirectories = () => void loadLinkedState();

  const persistAssignments = async (next: Set<string>) => {
    const { data } = await supabase.from("companies").select("*");
    const organizations = (data ?? []).map((company) => ({
      id: String(company.id ?? ""),
      name: String(company.name ?? ""),
      company_status: String(company.company_status ?? "Active"),
      status: String(company.status ?? ""),
    }));
    const currentOrganization =
      organizations.find((organization) => organization.id === organizationId) ??
      { id: organizationId, name: organizationName, company_status: "Active" };
    const linked = setOrganizationAssignmentsAndSyncUsers(
      currentOrganization,
      organizations,
      audience,
      next,
    );
    setAssignments((current) => ({
      ...current,
      [audience]: linked.assignments.get(organizationId) ?? new Set<string>(),
    }));
    setDirectories((current) => ({
      ...current,
      [audience]: usersWithEmail(linked.users),
    }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const toggleAssignment = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    void persistAssignments(next);
  };

  return (
    <section className="flex w-full flex-col gap-6 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-montserrat text-[16px] font-semibold text-[#10233A]">
            Organization users
          </h2>
          <p className="mt-1 font-montserrat text-[12px] font-medium text-[#7288A3]">
            Assign users to {organizationName} or create a new user.
          </p>
        </div>
        <PageActionButton onClick={() => onCreateUser(audience)}>
          Create new
        </PageActionButton>
      </div>

      <div className="flex border-b border-[#DDE7F0]" role="tablist">
        {(["Internal users", "External users"] as Audience[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={audience === item}
            onClick={() => {
              setAudience(item);
              setQuery("");
            }}
            className={`border-b-2 px-4 py-2.5 font-montserrat text-[13px] font-semibold ${
              audience === item
                ? "border-[#007EA7] text-[#007EA7]"
                : "border-transparent text-[#7288A3] hover:text-[#10233A]"
            }`}
          >
            {item}
            <span className="ml-2 rounded-full bg-[#F0F7FA] px-2 py-0.5 text-[11px] text-[#56708C]">
              {assignments[item].size}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <OcrSearchField
          value={query}
          onChange={setQuery}
          ariaLabel={`Search ${audience.toLowerCase()}`}
          className="w-full max-w-[420px]"
        />
        <div className="flex items-center gap-4">
          {saved && (
            <span
              role="status"
              className="font-montserrat text-[12px] font-semibold text-[#2EA96B]"
            >
              Assignments saved
            </span>
          )}
          <ColumnSettingsButton onClick={() => setShowColumns(true)} />
          <RefreshAllButton onRefresh={refreshDirectories} />
        </div>
      </div>

      <div ref={tableScrollRef} className="overflow-x-auto scrollbar-hide">
        <div
          style={{
            minWidth:
              visibleColumns.reduce((sum, column) => sum + column.width, 0) +
              42,
          }}
        >
          <div className="mb-3 flex h-6 items-center">
            <div className="w-[42px] flex-shrink-0" />
            {visibleColumns.map((column, visibleIndex) => {
              const realIndex = columns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex > 0 ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="whitespace-nowrap">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={directionFor(column.key as UserColumnKey)}
                    onDirectionChange={(direction) =>
                      changeSort(column.key as UserColumnKey, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) => startResize(realIndex, event)}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-0.5">
            {sortedRows.map((user, rowIndex) => {
              const checked = selected.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleAssignment(user.id)}
                  className={`flex h-10 w-full items-center rounded-lg text-left font-montserrat text-[12px] font-medium text-[#10233A] ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                >
                  <span className="flex w-[42px] flex-shrink-0 justify-center">
                    <span
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`Assign ${user.fullName ?? user.username ?? user.email}`}
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
                    >
                      {checked && <Check size={12} className="text-white" />}
                    </span>
                  </span>
                  {visibleColumns.map((column) => {
                    const value =
                      column.key === "name"
                        ? (user.fullName ?? user.username ?? "—")
                        : column.key === "roles"
                          ? user.roles || "Unassigned"
                          : user[column.key as "email" | "phone"] || "—";
                    return (
                      <span
                        key={column.key}
                        style={{ width: column.width }}
                        className="block flex-shrink-0 truncate px-3"
                      >
                        {value}
                      </span>
                    );
                  })}
                </button>
              );
            })}
            {sortedRows.length === 0 && (
              <div className="sticky left-0 flex min-h-40 w-[min(100%,calc(100vw-48px))] flex-col items-center justify-center gap-2 text-center">
                <UserPlus size={26} className="text-[#A1B6C6]" />
                <span className="font-montserrat text-[13px] font-semibold text-[#7288A3]">
                  No {audience.toLowerCase()} found
                </span>
                <PageActionButton onClick={() => onCreateUser(audience)}>
                  Create new
                </PageActionButton>
              </div>
            )}
          </div>
        </div>
      </div>
      <HorizontalTableScrollbar scrollRef={tableScrollRef} fixed={false} />
      {showColumns && (
        <ColumnSettingsPanel
          columns={columns}
          defaultColumns={USER_COLUMNS}
          onSave={(next) => {
            setColumns(next);
            setShowColumns(false);
          }}
          onClose={() => setShowColumns(false)}
        />
      )}
    </section>
  );
}
