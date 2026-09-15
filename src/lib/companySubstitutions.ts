import type { LinkedDirectoryUser, OrganizationSubstitution } from './linkedSettingsData';

type EligibleUser = Pick<LinkedDirectoryUser, 'id' | 'fullName' | 'username'>;

export type CompanySubstitutionEntry = {
  id: string;
  userId: string;
  label: string;
  from: string;
  to: string;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

/** Select current and scheduled periods; eligibility is supplied by the caller. */
export function selectCompanySubstitutions(
  organizationId: string,
  records: readonly OrganizationSubstitution[],
  eligibleUsers: readonly EligibleUser[],
  today: string,
): CompanySubstitutionEntry[] {
  if (!isIsoDate(today)) return [];

  const usersById = new Map<string, EligibleUser>();
  for (const user of eligibleUsers) {
    if (user && typeof user.id === 'string' && user.id && !usersById.has(user.id)) {
      usersById.set(user.id, user);
    }
  }

  const seenRanges = new Set<string>();
  const entries: CompanySubstitutionEntry[] = [];
  for (const record of records) {
    if (!record || record.organizationId !== organizationId
      || typeof record.id !== 'string' || !record.id.trim()
      || typeof record.userId !== 'string'
      || !isIsoDate(record.from) || !isIsoDate(record.to)
      || record.from > record.to || record.to < today) continue;

    const user = usersById.get(record.userId);
    if (!user) continue;
    const rangeKey = JSON.stringify([record.organizationId, record.userId, record.from, record.to]);
    if (seenRanges.has(rangeKey)) continue;
    seenRanges.add(rangeKey);

    entries.push({
      id: record.id,
      userId: record.userId,
      label: user.fullName?.trim() || user.username?.trim() || 'Unnamed user',
      from: record.from,
      to: record.to,
    });
  }

  return entries.sort((left, right) =>
    Number(left.from > today) - Number(right.from > today)
    || left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || left.userId.localeCompare(right.userId)
    || left.id.localeCompare(right.id));
}
