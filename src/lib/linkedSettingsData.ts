export type SettingsAudience = "Internal users" | "External users";

export type LinkedDirectoryUser = {
  id: string;
  username?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  roles?: string;
  status?: string;
  organizations?: string;
  [key: string]: string | undefined;
};

export type LinkedOrganization = {
  id: string;
  name: string;
  company_status?: string;
  status?: string;
};

export const SETTINGS_DATA_CHANGED_EVENT =
  "finansu-harmonija:settings-data-changed";

export const INTERNAL_USER_DEFAULTS: LinkedDirectoryUser[] = [
  {
    id: "user-system-administrator",
    username: "albertborkvski",
    fullName: "Albert Borkovski",
    email: "albertborkvski@gmail.com",
    phone: "+370 670 00000",
    position: "Administrator",
    roles: "Administrator",
    organizations: "All organizations",
    status: "Enabled",
  },
  {
    id: "user-system-meso-accountant",
    username: "albert.borkovski",
    fullName: "Albert Borkovski",
    email: "albert.borkovski@yahoo.com",
    phone: "+370 670 00001",
    position: "Meso accountant",
    roles: "Meso accountant",
    organizations: "Unassigned",
    status: "Enabled",
  },
];

const audienceKey = (audience: SettingsAudience) =>
  audience === "Internal users" ? "internal" : "external";

export const directoryStorageKey = (audience: SettingsAudience) =>
  `finansu-harmonija:v7:settings:${audienceKey(audience)}:users`;

export const organizationAssignmentStorageKey = (
  organizationId: string,
  audience: SettingsAudience,
) =>
  `finansu-harmonija:v7:organization-users:${organizationId}:${audienceKey(audience)}`;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

function normalizeList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item) =>
        item &&
        item.toLocaleLowerCase() !== "unassigned" &&
        item.toLocaleLowerCase() !== "all organizations",
    );
}

export function hasAdministratorRole(user: LinkedDirectoryUser) {
  return (user.roles ?? "")
    .split(",")
    .map((role) => role.trim().toLocaleLowerCase())
    .some((role) => role === "administrator" || role === "administration");
}

export function isActiveLinkedOrganization(
  organization: LinkedOrganization,
) {
  const status = (
    organization.company_status ??
    organization.status ??
    "Active"
  )
    .trim()
    .toLocaleLowerCase();
  return status === "active" || status === "enabled";
}

export function notifySettingsDataChanged(scope = "all") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SETTINGS_DATA_CHANGED_EVENT, { detail: { scope } }),
  );
}

export function loadLinkedDirectoryUsers(
  audience: SettingsAudience,
): LinkedDirectoryUser[] {
  const stored = readJson<LinkedDirectoryUser[]>(
    directoryStorageKey(audience),
    [],
  );
  const deleted = new Set(
    readJson<string[]>(`${directoryStorageKey(audience)}:deleted`, []),
  );
  const merged = stored.filter((user) => !deleted.has(user.id));
  const defaults =
    audience === "Internal users" ? INTERNAL_USER_DEFAULTS : [];
  defaults.forEach((defaultUser) => {
    if (deleted.has(defaultUser.id)) return;
    const index = merged.findIndex(
      (user) =>
        user.id === defaultUser.id ||
        Boolean(
          user.email &&
            defaultUser.email &&
            user.email.trim().toLocaleLowerCase() ===
              defaultUser.email.trim().toLocaleLowerCase(),
        ),
    );
    if (index < 0) merged.unshift({ ...defaultUser });
    else merged[index] = { ...defaultUser, ...merged[index] };
  });
  return merged;
}

export function saveLinkedDirectoryUsers(
  audience: SettingsAudience,
  users: LinkedDirectoryUser[],
  notify = true,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    directoryStorageKey(audience),
    JSON.stringify(users),
  );
  if (notify) notifySettingsDataChanged("users");
}

export function loadOrganizationUserIds(
  organizationId: string,
  audience: SettingsAudience,
) {
  return readJson<string[]>(
    organizationAssignmentStorageKey(organizationId, audience),
    [],
  );
}

export function saveOrganizationUserIds(
  organizationId: string,
  audience: SettingsAudience,
  userIds: Iterable<string>,
  notify = true,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    organizationAssignmentStorageKey(organizationId, audience),
    JSON.stringify(Array.from(new Set(userIds))),
  );
  if (notify) notifySettingsDataChanged("organization-users");
}

/**
 * Reconciles the two editable relationship surfaces into one canonical set of
 * organization -> user-id assignments. Legacy text values are used only when
 * an organization has no saved assignment record yet. Afterwards both the
 * organization card and the user card are written from the same assignment
 * sets, so changing either side is immediately reflected on the other side.
 */
export function reconcileOrganizationUserLinks(
  organizations: LinkedOrganization[],
  audience: SettingsAudience,
  notify = true,
) {
  const users = loadLinkedDirectoryUsers(audience);
  const validUserIds = new Set(users.map((user) => user.id));
  const activeOrganizations = organizations.filter(isActiveLinkedOrganization);
  const assignments = new Map<string, Set<string>>();

  activeOrganizations.forEach((organization) => {
    const key = organizationAssignmentStorageKey(organization.id, audience);
    const hasExplicitValue =
      typeof window !== "undefined" && window.localStorage.getItem(key) !== null;
    const assigned = new Set(
      loadOrganizationUserIds(organization.id, audience).filter((id) =>
        validUserIds.has(id),
      ),
    );

    users.forEach((user) => {
      const legacyOrganizations = new Set(
        normalizeList(user.organizations).map((name) =>
          name.toLocaleLowerCase(),
        ),
      );
      const legacyAll =
        (user.organizations ?? "").trim().toLocaleLowerCase() ===
        "all organizations";
      if (
        (audience === "Internal users" && hasAdministratorRole(user)) ||
        (!hasExplicitValue &&
          (legacyAll ||
            legacyOrganizations.has(organization.name.trim().toLocaleLowerCase()) ||
            legacyOrganizations.has(organization.id.trim().toLocaleLowerCase())))
      ) {
        assigned.add(user.id);
      }
    });

    assignments.set(organization.id, assigned);
    saveOrganizationUserIds(organization.id, audience, assigned, false);
  });

  const nextUsers = users.map((user) => {
    const assignedNames = activeOrganizations
      .filter((organization) => assignments.get(organization.id)?.has(user.id))
      .map((organization) => organization.name);
    return {
      ...user,
      organizations:
        audience === "Internal users" && hasAdministratorRole(user)
          ? "All organizations"
          : assignedNames.join(", ") || "Unassigned",
    };
  });
  saveLinkedDirectoryUsers(audience, nextUsers, false);
  if (notify) notifySettingsDataChanged("relationships");
  return { users: nextUsers, assignments };
}

export function setOrganizationAssignmentsAndSyncUsers(
  organization: LinkedOrganization,
  allOrganizations: LinkedOrganization[],
  audience: SettingsAudience,
  selectedUserIds: Iterable<string>,
) {
  saveOrganizationUserIds(
    organization.id,
    audience,
    selectedUserIds,
    false,
  );
  return reconcileOrganizationUserLinks(allOrganizations, audience);
}

export function setUserOrganizationsAndSyncCards(
  userId: string,
  audience: SettingsAudience,
  organizations: LinkedOrganization[],
  selectedOrganizationNames: string[],
) {
  const selected = new Set(
    selectedOrganizationNames.map((name) => name.trim().toLocaleLowerCase()),
  );
  organizations.forEach((organization) => {
    const assigned = new Set(
      loadOrganizationUserIds(organization.id, audience),
    );
    if (
      selected.has(organization.name.trim().toLocaleLowerCase()) ||
      selected.has(organization.id.trim().toLocaleLowerCase())
    ) {
      assigned.add(userId);
    } else {
      assigned.delete(userId);
    }
    saveOrganizationUserIds(organization.id, audience, assigned, false);
  });
  return reconcileOrganizationUserLinks(organizations, audience);
}
