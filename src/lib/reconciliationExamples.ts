import {
  applyReconciliation,
  createDemoReconciliationState,
  reverseReconciliation,
  type ReconciliationItem,
  type ReconciliationProposal,
  type ReconciliationState,
  type ReconciliationSuggestions,
} from './reconciliation';

export type ReconciliationItemStatus =
  | 'Reconciled'
  | 'Partially reconciled'
  | 'Suggested'
  | 'Needs review'
  | 'Not reconciled'
  | 'Reversed';

/**
 * A separate, explicitly test-only showcase. The original open-item fixtures are
 * preserved, and historical examples are produced through the same validated
 * apply/reverse functions used by the UI, rather than by faking their balances.
 */
export function createReconciliationExamples(companyId: string): ReconciliationState {
  let state = createDemoReconciliationState(companyId);
  const prefix = `${companyId}:demo-examples`;
  const pair = (
    key: string,
    counterpartyName: string,
    invoiceNumber: string,
    fundingNumber: string,
    invoiceMinor: number,
    fundingMinor: number,
    patch: Partial<Pick<ReconciliationItem, 'side' | 'currency'>> = {},
    fundingKind: Exclude<ReconciliationItem['kind'], 'Invoice'> = 'Payment',
  ): [ReconciliationItem, ReconciliationItem] => {
    const common = {
      organizationId: companyId,
      counterpartyId: `${prefix}:counterparty:${key}`,
      counterpartyName,
      side: 'Receivable' as const,
      documentDate: '2026-09-02',
      currency: 'EUR',
      ...patch,
    };
    return [
      {
        ...common,
        id: `${prefix}:${key}:invoice`,
        kind: 'Invoice',
        documentNumber: invoiceNumber,
        reference: '',
        dueDate: '2026-09-30',
        originalMinor: invoiceMinor,
        remainingMinor: invoiceMinor,
      },
      {
        ...common,
        id: `${prefix}:${key}:funding`,
        kind: fundingKind,
        documentNumber: fundingNumber,
        reference: `Settlement for ${invoiceNumber}`,
        dueDate: '',
        originalMinor: fundingMinor,
        remainingMinor: fundingMinor,
      },
    ];
  };

  const settled = pair('settled', 'Amber Consulting UAB', 'EX-INV-201', 'EX-BNK-601', 125000, 125000);
  const partial = pair('partial', 'River Transport UAB', 'EX-INV-202', 'EX-BNK-602', 95000, 70000);
  const reversed = pair('reversed', 'Sunrise Studio UAB', 'EX-INV-203', 'EX-BNK-603', 36000, 36000);
  const credited = pair('credited', 'Paper Supply UAB', 'EX-SUP-204', 'EX-CN-604', 24000, 24000, { side: 'Payable' }, 'Credit note');
  state = { ...state, items: [...state.items, ...settled, ...partial, ...reversed, ...credited] };

  const applyExample = (key: string, items: [ReconciliationItem, ReconciliationItem], amountMinor: number, at: string) => {
    const [invoice, funding] = items;
    const proposal: ReconciliationProposal = {
      id: `${prefix}:${key}:proposal`,
      organizationId: companyId,
      fundingId: funding.id,
      allocations: [{ invoiceId: invoice.id, amountMinor }],
      confidence: key === 'partial' ? 'Review required' : 'High',
      rule: key === 'partial' ? 'Manual partial settlement' : 'Exact reference and amount',
      reason: key === 'partial'
        ? 'Demonstration of a reviewed partial allocation. Both remaining balances stay open.'
        : 'Demonstration of a confirmed matching reference and amount.',
      expectedRemaining: { [invoice.id]: invoice.remainingMinor, [funding.id]: funding.remainingMinor },
    };
    state = applyReconciliation(state, [proposal], { id: `${prefix}:${key}:batch`, at, actor: 'Demo accountant' });
  };

  applyExample('settled', settled, 125000, '2026-09-03T09:00:00.000Z');
  applyExample('partial', partial, 40000, '2026-09-04T10:15:00.000Z');
  applyExample('reversed', reversed, 36000, '2026-09-05T08:30:00.000Z');
  state = reverseReconciliation(state, `${prefix}:reversed:batch`, '2026-09-06T11:00:00.000Z');
  applyExample('credited', credited, 24000, '2026-09-07T12:20:00.000Z');
  return state;
}

/** Derive a display status from actual balances, allocation history and proposals. */
export function getReconciliationItemStatus(
  item: ReconciliationItem,
  state: ReconciliationState,
  suggestions: ReconciliationSuggestions,
): ReconciliationItemStatus {
  if (item.remainingMinor === 0) return 'Reconciled';
  if (item.remainingMinor < item.originalMinor) return 'Partially reconciled';

  // A later confirmed allocation supersedes an older reversal. An item that was
  // completely reopened keeps that explanation until it is reconciled again.
  const latestEvent = state.batches
    .filter(batch => batch.allocations.some(allocation => allocation.invoiceId === item.id || allocation.fundingId === item.id))
    .map(batch => ({ reversed: Boolean(batch.reversedAt), at: batch.reversedAt ?? batch.at }))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
  if (latestEvent?.reversed) return 'Reversed';

  const related = suggestions.proposals.filter(proposal => proposal.organizationId === item.organizationId
    && (proposal.fundingId === item.id || proposal.allocations.some(allocation => allocation.invoiceId === item.id)));
  // If more than one safe partial proposal relates to the same item, any
  // reviewed allocation keeps the overall item marked for review.
  if (related.some(proposal => proposal.confidence === 'Review required')) return 'Needs review';
  if (related.some(proposal => proposal.confidence === 'High')) return 'Suggested';
  if (suggestions.unmatched.some(entry => entry.itemId === item.id
    && /\b(?:ambiguous|ambiguity|competing)\b/i.test(entry.reason))) return 'Needs review';
  return 'Not reconciled';
}
