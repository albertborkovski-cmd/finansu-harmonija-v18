import { recordAdministrativeAction } from './supabase';
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

export type OrganizationSubstitution = {
  id: string;
  organizationId: string;
  userId: string;
  from: string;
  to: string;
  createdAt: string;
};
const SUBSTITUTIONS_KEY = 'finansu-harmonija:v14:organization-substitutions';

export function organizationAccessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function loadOrganizationSubstitutions(): OrganizationSubstitution[] {
  const rows = readJson<OrganizationSubstitution[]>(SUBSTITUTIONS_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function isMesoAccountant(user: LinkedDirectoryUser) {
  return normalizeList(user.roles).some(role => role.toLowerCase() === 'meso accountant');
}

export function setOrganizationSubstitution(userId: string, from: string, to: string, organizations: LinkedOrganization[], editingIds: string[] = []) {
  const user = loadLinkedDirectoryUsers('Internal users').find(candidate => candidate.id === userId);
  if (!user || !isMesoAccountant(user) || (user.status && !['enabled', 'active'].includes(user.status.toLowerCase()))) throw new Error('Select an active Meso accountant.');
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Enter valid From and To dates. To must be on or after From.');
  const targets = [...new Set(organizations.map(organization => organization.id))];
  if (!targets.length) throw new Error('Select at least one organization.');
  const records = loadOrganizationSubstitutions();
  for (const organizationId of targets) {
    const existing = records.find(record => record.organizationId === organizationId && editingIds.includes(record.id));
    if (existing) { existing.userId = userId; existing.from = from; existing.to = to; continue; }
    if (records.some(record => record.organizationId === organizationId && record.userId === userId && record.from === from && record.to === to)) continue;
    records.push({ id: crypto.randomUUID(), organizationId, userId, from, to, createdAt: new Date().toISOString() });
  }
  window.localStorage.setItem(SUBSTITUTIONS_KEY, JSON.stringify(records));
  targets.forEach(id => { void recordAdministrativeAction(id, 'Substitutions', 'Set substitution', `${user.fullName || userId}: ${from} – ${to}.`); });
  notifySettingsDataChanged('relationships');
}

/** Effective access is evaluated by date, never copied into permanent membership. */
export function hasOrganizationSubstitution(organizationId: string, userId: string, now = new Date()) {
  const user = loadLinkedDirectoryUsers('Internal users').find(candidate => candidate.id === userId);
  if (!user || !isMesoAccountant(user) || (user.status && !['enabled', 'active'].includes(user.status.toLowerCase()))) return false;
  const today = organizationAccessDate(now);
  return loadOrganizationSubstitutions().some(record => record.organizationId === organizationId && record.userId === userId && record.from <= today && today <= record.to);
}

export function canAccessAssignedOrganization(organization: LinkedOrganization & { assigned_accountant?: string }, session: { email: string; roleNames: string[] }, now = new Date()) {
  if (session.roleNames.some(role => ['administrator', 'administration'].includes(role.toLowerCase()))) return true;
  // Preserve other existing audiences; substitution applies to Meso accountants only.
  if (!session.roleNames.some(role => role.toLowerCase() === 'meso accountant')) return true;
  const user = loadLinkedDirectoryUsers('Internal users').find(candidate => candidate.email?.toLowerCase() === session.email.toLowerCase());
  if (!user || (user.status && !['enabled', 'active'].includes(user.status.toLowerCase()))) return false;
  return isAccountantAssigned(organization, user) || hasOrganizationSubstitution(organization.id, user.id, now);
}

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
  const previousIds = loadOrganizationUserIds(organizationId, audience);
  const nextIds = Array.from(new Set(userIds));
  window.localStorage.setItem(
    organizationAssignmentStorageKey(organizationId, audience),
    JSON.stringify(nextIds),
  );
  if (JSON.stringify([...previousIds].sort()) !== JSON.stringify([...nextIds].sort())) void recordAdministrativeAction(organizationId, 'Access', 'Users updated', `${audience}. Added: ${nextIds.filter(id => !previousIds.includes(id)).join(', ') || 'None'}. Removed: ${previousIds.filter(id => !nextIds.includes(id)).join(', ') || 'None'}.`);
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

const accountantAssignmentKey = (organizationId: string) =>
  `finansu-harmonija:v14:organization-accountants:${organizationId}`;

export function isAccountantAssigned(organization: LinkedOrganization & { assigned_accountant?: string }, user: LinkedDirectoryUser) {
  if (readJson<string[]>(`${accountantAssignmentKey(organization.id)}:removed`, []).includes(user.id)) return false;
  if (readJson<string[]>(accountantAssignmentKey(organization.id), []).includes(user.id)) return true;
  const identities = [user.id, user.fullName, user.username, user.email].filter(Boolean).map((value) => value!.trim().toLocaleLowerCase());
  if (normalizeList(organization.assigned_accountant).some((name) => identities.includes(name.toLocaleLowerCase()))) return true;
  if (!(user.roles ?? '').toLocaleLowerCase().includes('accountant')) return false;
  const key = organizationAssignmentStorageKey(organization.id, 'Internal users');
  if (window.localStorage.getItem(key) !== null) return loadOrganizationUserIds(organization.id, 'Internal users').includes(user.id);
  return user.organizations?.trim().toLocaleLowerCase() === 'all organizations' || normalizeList(user.organizations).some((name) => [organization.id.toLocaleLowerCase(), organization.name.toLocaleLowerCase()].includes(name.toLocaleLowerCase()));
}

export function organizationAccountantEntries(organization: LinkedOrganization & { assigned_accountant?: string }) {
  const assigned = [...new Map(loadLinkedDirectoryUsers('Internal users')
    .filter((user) => isAccountantAssigned(organization, user))
    .map((user) => [user.id, user])).values()];
  return assigned.map((user) => ({
    id: user.id,
    label: user.fullName?.trim() || user.username || 'Unnamed user',
  }));
}

export function organizationAccountantNames(organization: LinkedOrganization & { assigned_accountant?: string }) {
  return organizationAccountantEntries(organization).map((entry) => entry.label).join(', ') || 'Not assigned';
}

export function organizationInternalUsers(organization: LinkedOrganization & { assigned_accountant?: string }) {
  const explicit = window.localStorage.getItem(organizationAssignmentStorageKey(organization.id, 'Internal users')) !== null;
  const ids = new Set(loadOrganizationUserIds(organization.id, 'Internal users'));
  return loadLinkedDirectoryUsers('Internal users').filter(user => {
    if (ids.has(user.id) || isAccountantAssigned(organization, user)) return true;
    if (explicit) return false;
    const names = normalizeList(user.organizations).map(name => name.toLowerCase());
    return user.organizations?.toLowerCase() === 'all organizations' || names.includes(organization.id.toLowerCase()) || names.includes(organization.name.toLowerCase());
  });
}

/** Preserve other assignments; remove only users explicitly unchecked by the caller. */
export function addAccountantToOrganizations(userIds: string | string[], organizations: LinkedOrganization[], removedUserIds: string[] = []) {
  const users = loadLinkedDirectoryUsers('Internal users');
  const selectedIds = new Set(typeof userIds === 'string' ? [userIds] : userIds);
  const removedIds = new Set(removedUserIds.filter((id) => !selectedIds.has(id)));
  if ((!selectedIds.size && !removedIds.size) || [...removedIds].some((id) => !users.some((user) => user.id === id)) || [...selectedIds].some((id) => {
    const user = users.find((candidate) => candidate.id === id);
    return !user || Boolean(user.status && !['enabled', 'active'].includes(user.status.toLowerCase()));
  })) {
    throw new Error('Select active internal users.');
  }
  const uniqueOrganizations = [...new Map(organizations.map((organization) => [organization.id, organization])).values()];
  if (!uniqueOrganizations.length) throw new Error('Select at least one organization.');
  const writes = new Map<string, string>();
  uniqueOrganizations.forEach((organization) => {
    const key = organizationAssignmentStorageKey(organization.id, 'Internal users');
    const assigned = new Set(loadOrganizationUserIds(organization.id, 'Internal users'));
    if (window.localStorage.getItem(key) === null) {
      users.forEach((existing) => {
        const legacy = normalizeList(existing.organizations).map((name) => name.toLowerCase());
        if (hasAdministratorRole(existing) || existing.organizations?.toLowerCase() === 'all organizations' || legacy.includes(organization.name.toLowerCase()) || legacy.includes(organization.id.toLowerCase())) assigned.add(existing.id);
      });
    }
    selectedIds.forEach((id) => assigned.add(id));
    removedIds.forEach((id) => assigned.delete(id));
    writes.set(key, JSON.stringify([...assigned]));
    const accountants = new Set(readJson<string[]>(accountantAssignmentKey(organization.id), []));
    selectedIds.forEach((id) => accountants.add(id));
    removedIds.forEach((id) => accountants.delete(id));
    writes.set(accountantAssignmentKey(organization.id), JSON.stringify([...accountants]));
    const removedKey = `${accountantAssignmentKey(organization.id)}:removed`;
    writes.set(removedKey, JSON.stringify([...new Set([...readJson<string[]>(removedKey, []), ...removedIds])].filter((id) => !selectedIds.has(id))));
  });
  const removedNames = new Set(uniqueOrganizations.flatMap((organization) => [organization.id.toLowerCase(), organization.name.toLowerCase()]));
  writes.set(directoryStorageKey('Internal users'), JSON.stringify(users.map((candidate) => {
    if (candidate.organizations?.toLowerCase() === 'all organizations') return candidate;
    if (removedIds.has(candidate.id)) return { ...candidate, organizations: normalizeList(candidate.organizations).filter((name) => !removedNames.has(name.toLowerCase())).join(', ') || 'Unassigned' };
    if (!selectedIds.has(candidate.id)) return candidate;
    return { ...candidate, organizations: [...new Set([...normalizeList(candidate.organizations), ...uniqueOrganizations.map((organization) => organization.name)])].join(', ') };
  })));
  const previous = new Map([...writes.keys()].map((key) => [key, window.localStorage.getItem(key)]));
  try {
    writes.forEach((value, key) => window.localStorage.setItem(key, value));
  } catch (error) {
    previous.forEach((value, key) => value === null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, value));
    throw error;
  }
  uniqueOrganizations.forEach(organization => { void recordAdministrativeAction(organization.id, 'Accountants', 'Assignments updated', `Selected: ${[...selectedIds].join(', ') || 'None'}. Removed: ${[...removedIds].join(', ') || 'None'}.`); });
  notifySettingsDataChanged('relationships');
}

/** Replace only the requested accountant in organizations where they are assigned. */
export function replaceAccountantInOrganizations(fromId: string, toId: string, organizations: Array<LinkedOrganization & { assigned_accountant?: string }>) {
  const users = loadLinkedDirectoryUsers('Internal users');
  const from = users.find((user) => user.id === fromId);
  const to = users.find((user) => user.id === toId);
  if (!from || !to || fromId === toId) throw new Error('Select two different internal users.');
  if (to.status && !['enabled', 'active'].includes(to.status.toLowerCase())) throw new Error('Select an active replacement accountant.');
  const targets = [...new Map(organizations.map((organization) => [organization.id, organization])).values()].filter((organization) => isAccountantAssigned(organization, from));
  if (!targets.length) throw new Error('The selected accountant is not assigned to these organizations.');
  const writes = new Map<string, string>();
  targets.forEach((organization) => {
    const userKey = organizationAssignmentStorageKey(organization.id, 'Internal users');
    const assigned = new Set(loadOrganizationUserIds(organization.id, 'Internal users'));
    if (window.localStorage.getItem(userKey) === null) {
      users.forEach((user) => {
        const legacy = normalizeList(user.organizations).map((name) => name.toLowerCase());
        if (hasAdministratorRole(user) || user.organizations?.toLowerCase() === 'all organizations' || legacy.includes(organization.name.toLowerCase()) || legacy.includes(organization.id.toLowerCase())) assigned.add(user.id);
      });
    }
    const accountants = new Set(users.filter((user) => isAccountantAssigned(organization, user)).map((user) => user.id));
    accountants.forEach((id) => assigned.add(id));
    assigned.delete(fromId);
    assigned.add(toId);
    accountants.delete(fromId);
    accountants.add(toId);
    writes.set(userKey, JSON.stringify([...assigned]));
    writes.set(accountantAssignmentKey(organization.id), JSON.stringify([...accountants]));
    const removedKey = `${accountantAssignmentKey(organization.id)}:removed`;
    const removed = new Set(readJson<string[]>(removedKey, []));
    removed.add(fromId);
    removed.delete(toId);
    writes.set(removedKey, JSON.stringify([...removed]));
  });
  const removedNames = new Set(targets.flatMap((organization) => [organization.id.toLowerCase(), organization.name.toLowerCase()]));
  writes.set(directoryStorageKey('Internal users'), JSON.stringify(users.map((user) => {
    if (user.organizations?.toLowerCase() === 'all organizations') return user;
    if (user.id === fromId) return { ...user, organizations: normalizeList(user.organizations).filter((name) => !removedNames.has(name.toLowerCase())).join(', ') || 'Unassigned' };
    if (user.id === toId) return { ...user, organizations: [...new Set([...normalizeList(user.organizations), ...targets.map((organization) => organization.name)])].join(', ') };
    return user;
  })));
  const previous = new Map([...writes.keys()].map((key) => [key, window.localStorage.getItem(key)]));
  try { writes.forEach((value, key) => window.localStorage.setItem(key, value)); }
  catch (error) {
    previous.forEach((value, key) => value === null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, value));
    throw error;
  }
  notifySettingsDataChanged('relationships');
  targets.forEach(organization => { void recordAdministrativeAction(organization.id, 'Accountants', 'Replace accountant', `From: ${fromId}. To: ${toId}.`); });
  return targets.length;
}
