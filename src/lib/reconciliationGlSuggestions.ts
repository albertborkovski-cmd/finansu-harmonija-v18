import type { ReconciliationGlAssignment, ReconciliationItem } from './reconciliation';

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function normalizedPayee(item: ReconciliationItem): string {
  const value = isText(item.payeeName) ? item.payeeName : item.counterpartyName;
  return isText(value) ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return undefined;
  const date = value.slice(0, 10);
  const day = Date.parse(date);
  const at = Date.parse(value);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date || !Number.isSafeInteger(at)) return undefined;
  return at;
}

/** Suggest only an already-audited, unanimous account for this exact payee.
 * This returns a draft choice; callers must still require explicit confirmation.
 */
export function suggestPreviousGlAccount(
  items: readonly ReconciliationItem[],
  target: ReconciliationItem,
  assignments: readonly ReconciliationGlAssignment[],
  activeCodes: readonly string[],
): string | undefined {
  if (!target || target.kind !== 'Payment' || !isText(target.id)
    || !isText(target.organizationId) || isText(target.glAccountCode)) return undefined;
  const payee = normalizedPayee(target);
  if (!payee) return undefined;

  const active = new Set(activeCodes.filter(isText));
  const itemIdCounts = new Map<string, number>();
  for (const item of items) {
    if (item && isText(item.id)) itemIdCounts.set(item.id, (itemIdCounts.get(item.id) ?? 0) + 1);
  }

  let suggested: string | undefined;
  for (const item of items) {
    if (!item || item.id === target.id || item.kind !== 'Payment'
      || item.organizationId !== target.organizationId || normalizedPayee(item) !== payee
      || !isText(item.glAccountCode)) continue;

    // Legacy assignments, inactive codes, and duplicate IDs cannot prove provenance.
    if (!isText(item.id) || itemIdCounts.get(item.id) !== 1 || !active.has(item.glAccountCode)) return undefined;
    let latest: { at: number; codes: Set<string> } | undefined;
    for (const assignment of assignments) {
      if (!assignment || assignment.itemId !== item.id) continue;
      const at = timestamp(assignment.at);
      if (!isText(assignment.id) || !isText(assignment.actor)
        || typeof assignment.fromAccount !== 'string' || !isText(assignment.toAccount)
        || (assignment.note !== undefined && typeof assignment.note !== 'string') || at === undefined) return undefined;
      if (!latest || at > latest.at) latest = { at, codes: new Set([assignment.toAccount]) };
      else if (at === latest.at) latest.codes.add(assignment.toAccount);
    }
    if (!latest || latest.codes.size !== 1 || !latest.codes.has(item.glAccountCode)) return undefined;
    if (suggested !== undefined && suggested !== item.glAccountCode) return undefined;
    suggested = item.glAccountCode;
  }
  return suggested;
}
