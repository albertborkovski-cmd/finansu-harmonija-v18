import type { AttentionNotification } from './notifications';

/** Apply organization scope only after the caller's role/access visibility checks. */
export function scopeNotificationRecords(
  visibleRecords: readonly AttentionNotification[],
  organizationId?: string,
  selectedOrganizationIds: readonly string[] = [],
): AttentionNotification[] {
  if (organizationId !== undefined) return visibleRecords.filter(row => row.organizationId === organizationId);
  if (!selectedOrganizationIds.length) return [...visibleRecords];
  const selected = new Set(selectedOrganizationIds);
  return visibleRecords.filter(row => Boolean(row.organizationId && selected.has(row.organizationId)));
}
