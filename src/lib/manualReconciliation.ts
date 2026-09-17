import { isClientReconciliationItem, type ReconciliationItem, type ReconciliationProposal } from './reconciliation';

export type ManualReconciliationAllocation = {
  itemId: string;
  amountMinor: number;
  remainingMinor: number;
};

export type ManualReconciliationPreview = {
  allocations: ManualReconciliationAllocation[];
  proposals: ReconciliationProposal[];
  totalMinor: number;
  sourceRemainingMinor: number;
};

const FUNDING_KINDS = new Set(['Payment', 'Credit note', 'Advance', 'Deposit']);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isMinor = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

function isOpenItem(item: ReconciliationItem | undefined): item is ReconciliationItem {
  return !!item && isText(item.id) && isText(item.organizationId)
    && isText(item.counterpartyId) && isText(item.counterpartyName)
    && isClientReconciliationItem(item)
    && (item.kind === 'Invoice' || FUNDING_KINDS.has(item.kind))
    && (item.side === 'Receivable' || item.side === 'Payable')
    && (item.currency === 'EUR' || item.currency === 'USD')
    && isText(item.documentNumber) && typeof item.reference === 'string'
    && isDate(item.documentDate) && (item.dueDate === '' || isDate(item.dueDate))
    && isMinor(item.originalMinor) && isMinor(item.remainingMinor)
    && item.remainingMinor > 0 && item.remainingMinor <= item.originalMinor;
}

function countIds(items: readonly ReconciliationItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item && typeof item.id === 'string') counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  }
  return counts;
}

function isCompatible(source: ReconciliationItem, candidate: ReconciliationItem) {
  return source.id !== candidate.id
    && source.organizationId === candidate.organizationId
    && source.counterpartyId === candidate.counterpartyId
    && source.currency === candidate.currency
    && source.side === candidate.side
    && (source.kind === 'Invoice') !== (candidate.kind === 'Invoice');
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** Parse a plain decimal amount exactly, without floating-point rounding. */
export function parseManualReconciliationAmount(value: string): number {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) {
    throw new Error('Enter an amount greater than zero with up to 2 decimal places.');
  }
  const [whole, fraction = ''] = normalized.split(/[.,]/);
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The amount must be greater than zero and within the supported range.');
  }
  return Number(minor);
}

/** All open, compatible rows; manual matching does not require a reference or exact amount. */
export function getManualReconciliationCandidates(items: readonly ReconciliationItem[], sourceId: string): ReconciliationItem[] {
  const counts = countIds(items);
  const source = items.find(item => item?.id === sourceId);
  if (!isOpenItem(source) || counts.get(sourceId) !== 1) return [];
  return items.filter(item => isOpenItem(item) && counts.get(item.id) === 1 && isCompatible(source, item))
    .sort((left, right) => compareText(left.dueDate || left.documentDate, right.dueDate || right.documentDate)
      || compareText(left.documentNumber, right.documentNumber)
      || compareText(left.id, right.id));
}

/** Browse all same-organization open records without weakening matching eligibility. */
export function getManualReconciliationOptions(items: readonly ReconciliationItem[], sourceId: string) {
  const source = items.find(item => item.id === sourceId);
  const counts = countIds(items);
  if (!isOpenItem(source) || counts.get(sourceId) !== 1) return [];
  const compatible = new Set(getManualReconciliationCandidates(items, sourceId).map(item => item.id));
  return items.filter(item => item.id !== sourceId && item.organizationId === source.organizationId
    && counts.get(item.id) === 1 && isMinor(item.remainingMinor) && item.remainingMinor > 0 && item.remainingMinor <= item.originalMinor)
    .map(item => {
      const reason = compatible.has(item.id) ? ''
        : !isClientReconciliationItem(item) ? 'Accounting operation — use GL assignment'
        : item.counterpartyId !== source.counterpartyId ? 'Different counterparty'
        : item.currency !== source.currency ? 'Different currency'
        : item.side !== source.side ? 'Different receivable / payable side'
        : (item.kind === 'Invoice') === (source.kind === 'Invoice') ? 'Requires an opposite document type'
        : 'Not eligible for reconciliation';
      return { item, reason };
    }).sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason))
      || compareText(a.item.dueDate || a.item.documentDate, b.item.dueDate || b.item.documentDate)
      || compareText(a.item.documentNumber, b.item.documentNumber));
}

/** Preview the selected order without changing any balances or applying a batch. */
export function buildManualReconciliation(
  items: readonly ReconciliationItem[],
  sourceId: string,
  selectedIds: readonly string[],
  amountOverrides: Readonly<Record<string, number>> = {},
): ManualReconciliationPreview {
  const counts = countIds(items);
  const source = items.find(item => item?.id === sourceId);
  if (!isOpenItem(source) || counts.get(sourceId) !== 1) {
    throw new Error('Manual matching requires a unique, valid source with an open balance in safe integer cents.');
  }
  const byId = new Map(items.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
  const seen = new Set<string>();
  const selected = selectedIds.map(id => {
    if (seen.has(id)) throw new Error('Duplicate selected item ID.');
    seen.add(id);
    const candidate = byId.get(id);
    if (!candidate) throw new Error('Selected item was not found.');
    if (counts.get(id) !== 1 || !isOpenItem(candidate) || !isCompatible(source, candidate)) {
      throw new Error('Selected item is not eligible for manual matching with this source.');
    }
    return candidate;
  });

  if (!amountOverrides || typeof amountOverrides !== 'object' || Array.isArray(amountOverrides)) {
    throw new Error('Manual amounts must be supplied by selected item ID.');
  }
  const explicitAmounts = new Map<string, number>();
  let sourceRemainingMinor = source.remainingMinor;
  // Reserve explicit requests before automatic allocations so selecting an earlier
  // row never silently reduces an amount entered for a later row.
  for (const [id, amountMinor] of Object.entries(amountOverrides)) {
    if (!seen.has(id)) throw new Error('A manual amount must belong to a selected item.');
    if (!isMinor(amountMinor) || amountMinor === 0) {
      throw new Error('The reconciliation amount must be positive safe integer cents.');
    }
    if (amountMinor > byId.get(id)!.remainingMinor) {
      throw new Error('The reconciliation amount exceeds the selected document\'s open balance.');
    }
    if (amountMinor > sourceRemainingMinor) {
      throw new Error('The entered amounts exceed the source document\'s open balance.');
    }
    sourceRemainingMinor -= amountMinor;
    explicitAmounts.set(id, amountMinor);
  }
  const allocations = selected.map(item => {
    const explicitAmount = explicitAmounts.get(item.id);
    const amountMinor = explicitAmount ?? Math.min(sourceRemainingMinor, item.remainingMinor);
    if (explicitAmount === undefined) sourceRemainingMinor -= amountMinor;
    return { itemId: item.id, amountMinor, remainingMinor: item.remainingMinor - amountMinor };
  });
  // Subtraction avoids overflowing while totaling several large selected balances.
  const totalMinor = source.remainingMinor - sourceRemainingMinor;
  const snapshot = Object.fromEntries([
    [source.id, source.remainingMinor],
    ...selected.map(item => [item.id, item.remainingMinor]),
  ]);
  const selectionKey = [source.organizationId, source.id, [...selectedIds], allocations, snapshot];
  const positive = allocations.filter(allocation => allocation.amountMinor > 0);
  const makeProposal = (funding: ReconciliationItem, invoiceAllocations: ReconciliationProposal['allocations']): ReconciliationProposal => ({
    id: `manual-proposal:${encodeURIComponent(JSON.stringify([...selectionKey, funding.id]))}`,
    organizationId: source.organizationId,
    fundingId: funding.id,
    allocations: invoiceAllocations,
    confidence: 'Review required',
    rule: 'Manual selection',
    reason: explicitAmounts.size > 0
      ? 'Entered amounts are reserved first; other selected records use the remaining balance in selection order. Any remainder stays open.'
      : 'The selected records are allocated in selection order, up to each available balance. Any remainder stays open.',
    // Every proposal checks the original snapshot, including when several funding
    // rows share the source invoice in a single atomic applyReconciliation call.
    expectedRemaining: Object.fromEntries([
      [funding.id, funding.remainingMinor],
      ...invoiceAllocations.map(allocation => [allocation.invoiceId, snapshot[allocation.invoiceId]]),
    ]),
  });
  const proposals = source.kind === 'Invoice'
    ? positive.map(allocation => makeProposal(byId.get(allocation.itemId)!, [{ invoiceId: source.id, amountMinor: allocation.amountMinor }]))
    : positive.length > 0
      ? [makeProposal(source, positive.map(allocation => ({ invoiceId: allocation.itemId, amountMinor: allocation.amountMinor })))]
      : [];

  return { allocations, proposals, totalMinor, sourceRemainingMinor };
}
