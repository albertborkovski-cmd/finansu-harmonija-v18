import { applyReconciliation, parseReconciliationState, reverseReconciliation, type ReconciliationProposal, type ReconciliationState } from './reconciliation';

/** Pure draft: reverse affected batches, then retain all unrelated allocations.
 * Persist only the final replacement state, never this intermediate result.
 */
export function prepareReconciliationCorrection(state: ReconciliationState, itemId: string, meta: { id: string; at: string; actor: string }) {
  parseReconciliationState(JSON.stringify(state), state.organizationId);
  const affected = state.batches.filter(batch => !batch.reversedAt && batch.allocations.some(a => a.invoiceId === itemId || a.fundingId === itemId));
  if (!affected.length) throw new Error('No active reconciliation is available to edit.');
  let draft = state;
  for (const batch of affected) draft = reverseReconciliation(draft, batch.id, meta.at);
  const retained = affected.flatMap(batch => batch.allocations.filter(a => a.invoiceId !== itemId && a.fundingId !== itemId));
  if (retained.length) {
    const byId = new Map(draft.items.map(item => [item.id, item]));
    const proposals: ReconciliationProposal[] = retained.map((allocation, index) => ({
      id: `${meta.id}:retained:${index}`, organizationId: state.organizationId, fundingId: allocation.fundingId,
      allocations: [{ invoiceId: allocation.invoiceId, amountMinor: allocation.amountMinor }], confidence: 'High',
      rule: 'Preserved during correction', reason: 'Unrelated allocation retained without changing its amount.',
      expectedRemaining: { [allocation.fundingId]: byId.get(allocation.fundingId)!.remainingMinor, [allocation.invoiceId]: byId.get(allocation.invoiceId)!.remainingMinor },
    }));
    draft = applyReconciliation(draft, proposals, { ...meta, id: `${meta.id}:retained` });
  }
  const amounts: Record<string, number> = Object.create(null);
  for (const batch of affected) for (const allocation of batch.allocations) {
    const partner = allocation.invoiceId === itemId ? allocation.fundingId : allocation.fundingId === itemId ? allocation.invoiceId : null;
    if (partner) amounts[partner] = (amounts[partner] ?? 0) + allocation.amountMinor;
  }
  return { state: draft, amounts };
}

export function replaceReconciliation(state: ReconciliationState, itemId: string, proposals: readonly ReconciliationProposal[], meta: { id: string; at: string; actor: string }) {
  if (!proposals.length) throw new Error('Select at least one replacement document.');
  if (proposals.some(p => p.fundingId !== itemId && p.allocations.some(a => a.invoiceId !== itemId))) throw new Error('Replacement must involve the selected document only.');
  const draft = prepareReconciliationCorrection(state, itemId, meta).state;
  const next = applyReconciliation(draft, proposals, { ...meta, id: `${meta.id}:replacement` });
  parseReconciliationState(JSON.stringify(next), state.organizationId);
  return next;
}
