import { applyReconciliation, isClientReconciliationItem, parseReconciliationState, type ReconciliationProposal, type ReconciliationState } from './reconciliation';

/** An unsaved selection draft. Opening or cancelling the dialog never receives a document. */
export function prepareMissingDocumentReconciliation(state: ReconciliationState, itemId: string): ReconciliationState {
  const draft = parseReconciliationState(JSON.stringify(state), state.organizationId);
  const item = draft.items.find(record => record.id === itemId);
  if (!item?.missingDocument) throw new Error('This record is no longer marked as Missing document. Refresh and try again.');
  if (item.remainingMinor <= 0 || !isClientReconciliationItem(item)) throw new Error('Only an open counterparty record can be reconciled.');
  return { ...draft, items: draft.items.map(record => record.id === itemId ? { ...record, missingDocument: false } : record) };
}

/** Receipt and reconciliation are committed together, after every allocation is validated. */
export function receiveAndReconcileDocument(
  state: ReconciliationState,
  itemId: string,
  proposals: readonly ReconciliationProposal[],
  meta: { id: string; at: string; actor: string },
): ReconciliationState {
  if (!proposals.length) throw new Error('Select at least one received document to reconcile.');
  if (proposals.some(proposal => !proposal.allocations.length || proposal.allocations.some(allocation => proposal.fundingId !== itemId && allocation.invoiceId !== itemId))) {
    throw new Error('Every reconciliation must involve the selected Missing document record.');
  }
  const draft = prepareMissingDocumentReconciliation(state, itemId);
  return applyReconciliation(draft, proposals, meta);
}
