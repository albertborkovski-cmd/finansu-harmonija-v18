import type { ReconciliationItem, ReconciliationProposal, ReconciliationState } from './reconciliation';

/** Per-document settlement movements, not general-ledger turnover.
 * Original document on its natural side; confirmed settlement on the opposite side.
 * The engine keeps an unsigned available amount; the view uses debit minus credit.
 */
export function reconciliationDocumentAmounts(item: ReconciliationItem) {
  const settledMinor = item.originalMinor - item.remainingMinor;
  const debitDocument = (item.side === 'Receivable') === (item.kind === 'Invoice');
  const debitMinor = debitDocument ? item.originalMinor : settledMinor;
  const creditMinor = debitDocument ? settledMinor : item.originalMinor;
  return { debitMinor, creditMinor, balanceMinor: debitMinor - creditMinor, settledMinor };
}

/** Suggestions reference current document balances; they are not postings. */
export function reconciliationSuggestionAmounts(funding: ReconciliationItem, proposal: ReconciliationProposal) {
  if (proposal.fundingId !== funding.id || proposal.organizationId !== funding.organizationId) throw new Error('Suggestion does not belong to this funding document.');
  const amounts = reconciliationDocumentAmounts(funding);
  const proposedMinor = proposal.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  if (!Number.isSafeInteger(proposedMinor) || proposedMinor < 0) throw new Error('Invalid suggestion amount.');
  return { debit: amounts.debitMinor, credit: amounts.creditMinor, remaining: amounts.balanceMinor, original: funding.originalMinor, settled: amounts.settledMinor, amount: proposedMinor };
}

/** Active allocations only: reversed batches must never appear as current matches. */
export function reconciliationPartners(state: ReconciliationState, itemId: string) {
  const amounts = new Map<string, number>();
  for (const batch of state.batches) {
    if (batch.reversedAt) continue;
    for (const allocation of batch.allocations) {
      const partnerId = allocation.invoiceId === itemId ? allocation.fundingId
        : allocation.fundingId === itemId ? allocation.invoiceId : null;
      if (partnerId) amounts.set(partnerId, (amounts.get(partnerId) ?? 0) + allocation.amountMinor);
    }
  }
  return state.items.filter(item => amounts.has(item.id)).map(item => ({ item, amountMinor: amounts.get(item.id)! }));
}

export function reconciliationEntryCount(reconciled: number, open: number, accounting: number, suggestions: number) {
  return reconciled + open + accounting + suggestions;
}
