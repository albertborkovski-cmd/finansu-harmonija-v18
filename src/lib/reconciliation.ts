export type ReconciliationItem = {
  id: string;
  organizationId: string;
  counterpartyId: string;
  counterpartyName: string;
  payeeName?: string;
  glAccountCode?: string;
  kind: 'Invoice' | 'Payment' | 'Credit note' | 'Advance' | 'Deposit';
  side: 'Receivable' | 'Payable';
  documentNumber: string;
  reference: string;
  documentDate: string;
  dueDate: string;
  currency: string;
  originalMinor: number;
  remainingMinor: number;
};

export type ReconciliationRules = {
  uniqueAmount: boolean;
  partialReference: boolean;
  multipleReferences: boolean;
};

export const DEFAULT_RECONCILIATION_RULES: ReconciliationRules = {
  uniqueAmount: true,
  partialReference: true,
  multipleReferences: true,
};

export type ReconciliationProposal = {
  id: string;
  organizationId: string;
  fundingId: string;
  allocations: { invoiceId: string; amountMinor: number }[];
  confidence: 'High' | 'Review required';
  rule: string;
  reason: string;
  expectedRemaining: Record<string, number>;
};

export type ReconciliationBatch = {
  id: string;
  at: string;
  actor: string;
  proposalIds: string[];
  allocations: { fundingId: string; invoiceId: string; amountMinor: number }[];
  reversedAt?: string;
};

export type ReconciliationState = {
  version: 1;
  organizationId: string;
  items: ReconciliationItem[];
  batches: ReconciliationBatch[];
  glAssignments?: ReconciliationGlAssignment[];
};

export type ReconciliationGlAssignment = {
  id: string;
  itemId: string;
  fromAccount: string;
  toAccount: string;
  at: string;
  actor: string;
  note: string;
};

export type ReconciliationRoute = {
  kind: 'client' | 'accounting' | 'unidentified';
  category: string;
  reason: string;
};

export type ReconciliationSuggestions = {
  proposals: ReconciliationProposal[];
  unmatched: { itemId: string; reason: string }[];
};

const FUNDING_KINDS = new Set(['Payment', 'Credit note', 'Advance', 'Deposit']);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isMinor = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isAccountCode = (value: unknown): value is string => isText(value) && value === value.trim();
const isIsoDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const isTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  && isIsoDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

export function hasReconciliationClient(item: ReconciliationItem): boolean {
  return isText(item.counterpartyId) && isText(item.counterpartyName);
}

/** Explicit authority/payroll/bank terms take priority over an assigned client.
 * Generic VAT, tax, invoice or commission wording never reroutes a payment.
 */
export function getReconciliationRoute(item: ReconciliationItem): ReconciliationRoute {
  if (item.kind !== 'Payment') return { kind: 'client', category: 'Counterparty settlement', reason: 'This document belongs to counterparty debt reconciliation.' };
  const text = [item.payeeName, item.counterpartyName, item.reference]
    .filter(value => typeof value === 'string')
    .join('\n').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const matches = (pattern: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])(?:${pattern})(?=$|[^\\p{L}\\p{N}_])`, 'u').test(text);
  if (matches('vmi|valstybine mokesciu inspekcija|state tax inspectorate|tax authority')) {
    return { kind: 'accounting', category: 'Tax authority', reason: 'Tax authority payment recognized from the payee or payment reference; assign a general-ledger account.' };
  }
  if (matches('sodra|social insurance|valstybinio socialinio draudimo')) {
    return { kind: 'accounting', category: 'Social insurance', reason: 'Social insurance payment recognized from the payee or payment reference; assign a general-ledger account.' };
  }
  if (matches('payroll|salary|salaries|darbo uzmokestis|darbo uzmokescio')) {
    return { kind: 'accounting', category: 'Payroll', reason: 'Payroll payment recognized from the payee or payment reference; assign a general-ledger account.' };
  }
  if (matches('bank (?:service )?(?:fees?|charges?|commissions?)|banko (?:komisinis mokestis|komisiniai|mokesciai|mokestis)')) {
    return { kind: 'accounting', category: 'Bank fees', reason: 'Bank fee or commission recognized from the payee or payment reference; assign a general-ledger account.' };
  }
  if (!hasReconciliationClient(item)) {
    return { kind: 'unidentified', category: 'Unidentified payment', reason: 'No counterparty is assigned and the payment purpose was not recognized; review the payee and assign a general-ledger account.' };
  }
  return { kind: 'client', category: 'Counterparty settlement', reason: 'An identified counterparty is available for debt reconciliation.' };
}

export function isClientReconciliationItem(item: ReconciliationItem): boolean {
  return getReconciliationRoute(item).kind === 'client';
}

function itemError(item: ReconciliationItem): string | undefined {
  if (!item || !isText(item.id)) return 'Missing item ID.';
  if (!isText(item.organizationId)) return 'Missing organization ID.';
  if (!hasReconciliationClient(item) && !(item.kind === 'Payment' && item.counterpartyId === '' && item.counterpartyName === '')) return 'A client ID and name are required together, except for payments without a client.';
  if (Object.hasOwn(item, 'payeeName') && !isText(item.payeeName)) return 'Payee name must be a non-empty string when supplied.';
  if (Object.hasOwn(item, 'glAccountCode') && !isAccountCode(item.glAccountCode)) return 'GL account must be a non-empty account code without outer whitespace when supplied.';
  if (item.kind !== 'Invoice' && !FUNDING_KINDS.has(item.kind)) return 'Unsupported item kind.';
  if (item.side !== 'Receivable' && item.side !== 'Payable') return 'Unsupported receivable/payable side.';
  if (item.currency !== 'EUR' && item.currency !== 'USD') return 'Test mode supports EUR and USD only.';
  if (!isText(item.documentNumber) || typeof item.reference !== 'string') return 'Invalid document number or reference.';
  if (!isMinor(item.originalMinor) || !isMinor(item.remainingMinor)) return 'Amounts must be non-negative safe integer cents.';
  if (item.remainingMinor > item.originalMinor) return 'Remaining amount exceeds the original amount.';
  return undefined;
}

function sameScope(left: ReconciliationItem, right: ReconciliationItem) {
  return left.organizationId === right.organizationId
    && left.counterpartyId === right.counterpartyId
    && left.currency === right.currency
    && left.side === right.side;
}

function referencesDocument(reference: string, documentNumber: string) {
  const escaped = documentNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Letters, numbers and document-code separators cannot extend either edge.
  return new RegExp(`(^|[^\\p{L}\\p{N}_./-])${escaped}(?=$|[^\\p{L}\\p{N}_./-]|\\.(?=$|[^\\p{L}\\p{N}]))`, 'iu').test(reference);
}

function checkedAdd(current: number, amount: number) {
  const next = current + amount;
  if (!Number.isSafeInteger(next)) throw new Error('Allocation total exceeds safe integer cents.');
  return next;
}

export function suggestReconciliation(items: readonly ReconciliationItem[], rules: ReconciliationRules = DEFAULT_RECONCILIATION_RULES): ReconciliationSuggestions {
  const unmatched = new Map<string, string>();
  const idCounts = new Map<string, number>();
  for (const item of items) {
    if (item && typeof item.id === 'string') idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  }
  const valid = items.filter((item, index) => {
    const error = itemError(item);
    const id = item && typeof item.id === 'string' ? item.id : `invalid-item-${index + 1}`;
    if (error) { unmatched.set(id, error); return false; }
    if ((idCounts.get(item.id) ?? 0) > 1) { unmatched.set(id, 'Duplicate item ID.'); return false; }
    const route = getReconciliationRoute(item);
    if (route.kind !== 'client') { unmatched.set(id, route.reason); return false; }
    if (item.remainingMinor === 0) unmatched.set(id, 'No remaining balance.');
    else if (item.kind === 'Deposit') unmatched.set(id, 'Deposits require manual allocation through Advances & deposits.');
    return true;
  }).sort((left, right) => left.id.localeCompare(right.id));
  const invoices = valid.filter(item => item.kind === 'Invoice');
  // Deposits can be contractually restricted. Only an explicit manual selection
  // may release them against an invoice; an amount/reference match is not enough.
  const fundingItems = valid.filter(item => item.kind !== 'Invoice' && item.kind !== 'Deposit' && item.remainingMinor > 0);
  const candidates: ReconciliationProposal[] = [];

  const propose = (funding: ReconciliationItem, allocations: { invoiceId: string; amountMinor: number }[], confidence: ReconciliationProposal['confidence'], rule: string, reason: string) => {
    const expectedRemaining: Record<string, number> = Object.fromEntries([
      [funding.id, funding.remainingMinor],
      ...allocations.map(allocation => [allocation.invoiceId, invoices.find(invoice => invoice.id === allocation.invoiceId)!.remainingMinor]),
    ]);
    candidates.push({
      id: `proposal:${encodeURIComponent(JSON.stringify([funding.organizationId, funding.id, allocations, expectedRemaining]))}`,
      organizationId: funding.organizationId,
      fundingId: funding.id,
      allocations,
      confidence,
      rule,
      reason,
      expectedRemaining,
    });
  };

  for (const funding of fundingItems) {
    const allReferenced = invoices.filter(invoice => referencesDocument(funding.reference, invoice.documentNumber));
    const referenced = allReferenced.filter(invoice => sameScope(funding, invoice));
    const scopedNumbers = new Set(referenced.map(invoice => invoice.documentNumber.trim().toLocaleLowerCase()));
    if (allReferenced.some(invoice => !sameScope(funding, invoice) && !scopedNumbers.has(invoice.documentNumber.trim().toLocaleLowerCase()))) {
      unmatched.set(funding.id, 'An explicit invoice reference belongs to a different organization, counterparty, currency or side.');
      continue;
    }
    if (referenced.some(invoice => invoice.remainingMinor === 0)) {
      unmatched.set(funding.id, 'A referenced invoice has no remaining balance.');
      continue;
    }
    const referenceNumbers = new Set(referenced.map(invoice => invoice.documentNumber.trim().toLocaleLowerCase()));
    if (referenceNumbers.size < referenced.length) {
      unmatched.set(funding.id, 'Ambiguous reference: multiple invoices share that document number.');
      continue;
    }
    if (referenced.length > 1) {
      if (!rules.multipleReferences) {
        unmatched.set(funding.id, 'Multiple-reference matching is disabled.');
        continue;
      }
      const total = referenced.reduce((sum, invoice) => sum + invoice.remainingMinor, 0);
      if (!Number.isSafeInteger(total) || total > funding.remainingMinor) {
        unmatched.set(funding.id, 'Funding does not cover all explicitly referenced invoice balances; no allocation order was assumed.');
        continue;
      }
      propose(funding, referenced.map(invoice => ({ invoiceId: invoice.id, amountMinor: invoice.remainingMinor })), 'Review required', 'Multiple references', 'All explicitly referenced invoice balances are covered. Any excess funding remains open.');
      continue;
    }
    if (referenced.length === 1) {
      const invoice = referenced[0];
      if (funding.remainingMinor === invoice.remainingMinor) {
        propose(funding, [{ invoiceId: invoice.id, amountMinor: invoice.remainingMinor }], 'High', 'Exact reference and amount', 'The full invoice reference and remaining amount match exactly.');
      } else if (rules.partialReference) {
        propose(funding, [{ invoiceId: invoice.id, amountMinor: Math.min(funding.remainingMinor, invoice.remainingMinor) }], 'Review required', 'Partial settlement / overpayment', funding.remainingMinor < invoice.remainingMinor ? 'One explicit invoice reference matches; the unpaid invoice remainder stays open.' : 'One explicit invoice reference matches; excess funding stays open.');
      } else unmatched.set(funding.id, 'Partial-reference and overpayment matching is disabled.');
      continue;
    }
    if (!rules.uniqueAmount) {
      unmatched.set(funding.id, 'No explicit invoice reference; unique-amount matching is disabled.');
      continue;
    }
    const matchingAmounts = invoices.filter(invoice => invoice.remainingMinor > 0 && sameScope(funding, invoice) && invoice.remainingMinor === funding.remainingMinor);
    if (matchingAmounts.length === 1) {
      propose(funding, [{ invoiceId: matchingAmounts[0].id, amountMinor: funding.remainingMinor }], 'Review required', 'Unique amount', 'Exactly one invoice has this remaining amount in the same organization, counterparty, currency and side.');
    } else unmatched.set(funding.id, matchingAmounts.length > 1 ? 'Ambiguous amount: multiple invoices match; no invoice was selected automatically.' : 'No compatible invoice matches the reference or exact remaining amount.');
  }

  // Reserve complete proposal allocations together. If they compete beyond an
  // invoice balance, retain neither competitor rather than choosing by FIFO.
  const requested = new Map<string, number>();
  for (const proposal of candidates) {
    for (const allocation of proposal.allocations) {
      requested.set(allocation.invoiceId, (requested.get(allocation.invoiceId) ?? 0) + allocation.amountMinor);
    }
  }
  const conflicts = new Set(invoices.filter(invoice => {
    const total = requested.get(invoice.id) ?? 0;
    return !Number.isSafeInteger(total) || total > invoice.remainingMinor;
  }).map(invoice => invoice.id));
  const proposals = candidates.filter(proposal => {
    if (!proposal.allocations.some(allocation => conflicts.has(allocation.invoiceId))) return true;
    unmatched.set(proposal.fundingId, 'Competing funding records would over-allocate an invoice; review the ambiguity manually.');
    return false;
  });
  const allocated = new Map<string, number>();
  for (const proposal of proposals) {
    for (const allocation of proposal.allocations) {
      allocated.set(allocation.invoiceId, (allocated.get(allocation.invoiceId) ?? 0) + allocation.amountMinor);
      allocated.set(proposal.fundingId, (allocated.get(proposal.fundingId) ?? 0) + allocation.amountMinor);
    }
  }
  for (const item of valid) {
    if (item.remainingMinor > (allocated.get(item.id) ?? 0) && !unmatched.has(item.id)) {
      unmatched.set(item.id, allocated.has(item.id) ? 'Part of this balance remains open after the suggested allocation.' : 'No unambiguous compatible funding was found.');
    }
  }
  return { proposals, unmatched: [...unmatched].map(([itemId, reason]) => ({ itemId, reason })).sort((left, right) => left.itemId.localeCompare(right.itemId)) };
}

function stateItems(state: ReconciliationState) {
  if (state.version !== 1 || !isText(state.organizationId) || !Array.isArray(state.items) || !Array.isArray(state.batches)) throw new Error('Invalid reconciliation state.');
  const byId = new Map<string, ReconciliationItem>();
  for (const item of state.items) {
    if (!item || !isText(item.id) || byId.has(item.id)) throw new Error('State contains missing or duplicate item IDs.');
    if (item.organizationId !== state.organizationId) throw new Error('State contains another organization.');
    byId.set(item.id, item);
  }
  const batchIds = new Set<string>();
  for (const batch of state.batches) {
    if (!batch || !isText(batch.id) || batchIds.has(batch.id)) throw new Error('State contains missing or duplicate batch IDs.');
    batchIds.add(batch.id);
  }
  return byId;
}

function validateAllocation(byId: Map<string, ReconciliationItem>, fundingId: string, invoiceId: string, amountMinor: number) {
  const funding = byId.get(fundingId);
  const invoice = byId.get(invoiceId);
  if (!funding || !invoice || itemError(funding) || itemError(invoice)) throw new Error('Allocation references a missing or invalid item.');
  if (!FUNDING_KINDS.has(funding.kind) || invoice.kind !== 'Invoice') throw new Error('Allocations must connect funding to an invoice.');
  if (!sameScope(funding, invoice)) throw new Error('Allocation organization, counterparty, currency and side must match.');
  if (!isMinor(amountMinor) || amountMinor === 0) throw new Error('Allocation amounts must be positive safe integer cents.');
  return { funding, invoice };
}

function addDelta(deltas: Map<string, number>, id: string, amount: number) {
  deltas.set(id, checkedAdd(deltas.get(id) ?? 0, amount));
}

export function applyReconciliation(state: ReconciliationState, proposals: readonly ReconciliationProposal[], batch: { id: string; at: string; actor: string }): ReconciliationState {
  const byId = stateItems(state);
  if (!isText(batch.id) || !isText(batch.at) || !isText(batch.actor)) throw new Error('Batch ID, timestamp and actor are required.');
  if (state.batches.some(existing => existing.id === batch.id)) throw new Error('Batch ID already exists.');
  if (!proposals.length) throw new Error('Select at least one proposal.');
  const proposalIds = new Set(state.batches.filter(existing => !existing.reversedAt).flatMap(existing => existing.proposalIds));
  const selectedIds: string[] = [];
  const allocations: ReconciliationBatch['allocations'] = [];
  const deltas = new Map<string, number>();

  for (const proposal of proposals) {
    if (!isText(proposal.id) || proposalIds.has(proposal.id)) throw new Error('Duplicate or already applied active proposal.');
    proposalIds.add(proposal.id);
    selectedIds.push(proposal.id);
    if (proposal.organizationId !== state.organizationId) throw new Error('Proposal belongs to a different organization.');
    if (!proposal.allocations.length) throw new Error('Proposal has no allocations.');
    const invoiceIds = new Set<string>();
    for (const allocation of proposal.allocations) {
      if (invoiceIds.has(allocation.invoiceId)) throw new Error('Duplicate invoice allocation in one proposal.');
      invoiceIds.add(allocation.invoiceId);
      const { funding, invoice } = validateAllocation(byId, proposal.fundingId, allocation.invoiceId, allocation.amountMinor);
      if (!isClientReconciliationItem(funding) || !isClientReconciliationItem(invoice)) throw new Error('Accounting-only and unidentified payments cannot be matched to client invoices.');
      for (const item of [funding, invoice]) {
        if (!proposal.expectedRemaining || !Object.hasOwn(proposal.expectedRemaining, item.id)
          || proposal.expectedRemaining[item.id] !== item.remainingMinor) throw new Error('Stale proposal: a remaining balance changed. Generate suggestions again.');
      }
      addDelta(deltas, funding.id, allocation.amountMinor);
      addDelta(deltas, invoice.id, allocation.amountMinor);
      allocations.push({ fundingId: funding.id, invoiceId: invoice.id, amountMinor: allocation.amountMinor });
    }
  }
  for (const [id, amount] of deltas) {
    if (amount > byId.get(id)!.remainingMinor) throw new Error('Selected allocations exceed a remaining balance.');
  }
  return {
    ...state,
    items: state.items.map(item => deltas.has(item.id) ? { ...item, remainingMinor: item.remainingMinor - deltas.get(item.id)! } : item),
    batches: [...state.batches, { id: batch.id, at: batch.at, actor: batch.actor, proposalIds: selectedIds, allocations }],
  };
}

export function reverseReconciliation(state: ReconciliationState, batchId: string, at: string): ReconciliationState {
  const byId = stateItems(state);
  if (!isText(at)) throw new Error('Reversal timestamp is required.');
  const batch = state.batches.find(entry => entry.id === batchId);
  if (!batch) throw new Error('Reconciliation batch was not found.');
  if (batch.reversedAt) throw new Error('This batch has already been reversed.');
  if (!batch.allocations.length) throw new Error('Batch has no allocations to reverse.');
  const deltas = new Map<string, number>();
  for (const allocation of batch.allocations) {
    const { funding, invoice } = validateAllocation(byId, allocation.fundingId, allocation.invoiceId, allocation.amountMinor);
    addDelta(deltas, funding.id, allocation.amountMinor);
    addDelta(deltas, invoice.id, allocation.amountMinor);
  }
  for (const [id, amount] of deltas) {
    const item = byId.get(id)!;
    if (checkedAdd(item.remainingMinor, amount) > item.originalMinor) throw new Error('Reversal would exceed an original balance.');
  }
  return {
    ...state,
    items: state.items.map(item => deltas.has(item.id) ? { ...item, remainingMinor: item.remainingMinor + deltas.get(item.id)! } : item),
    batches: state.batches.map(entry => entry.id === batchId ? { ...entry, reversedAt: at } : entry),
  };
}

/** Record a local accounting classification without settling or posting money. */
export function assignReconciliationGlAccount(
  state: ReconciliationState,
  itemId: string,
  accountCode: string,
  allowedAccountCodes: string[],
  meta: { id: string; at: string; actor: string; note: string },
): ReconciliationState {
  // Validate persisted history as well as the selected item before appending an
  // auditable edit. Keep the original objects for every unaffected ledger row.
  parseReconciliationState(JSON.stringify(state), state.organizationId);
  const byId = stateItems(state);
  const item = byId.get(itemId);
  if (!item || itemError(item)) throw new Error('GL assignment references a missing or invalid item.');
  if (item.kind !== 'Payment' || isClientReconciliationItem(item)) throw new Error('GL assignment is only available for accounting-only or unidentified payments.');
  if (!isAccountCode(accountCode) || !Array.isArray(allowedAccountCodes)
    || !allowedAccountCodes.every(isAccountCode) || !allowedAccountCodes.includes(accountCode)) throw new Error('Select an active general-ledger account from this company.');
  if (!meta || !isText(meta.id) || !isTimestamp(meta.at) || !isText(meta.actor) || typeof meta.note !== 'string') throw new Error('GL assignment ID, valid timestamp, actor and a note string are required.');
  const history = state.glAssignments ?? [];
  if (history.some(entry => entry.id === meta.id)) throw new Error('GL assignment ID already exists.');
  const previous = history.filter(entry => entry.itemId === itemId).at(-1);
  if (previous && Date.parse(meta.at) < Date.parse(previous.at)) throw new Error('GL assignment timestamp precedes the previous edit.');
  const fromAccount = item.glAccountCode ?? '';
  if (fromAccount === accountCode) throw new Error('Select a different general-ledger account.');
  const assignment: ReconciliationGlAssignment = { id: meta.id, itemId, fromAccount, toAccount: accountCode, at: meta.at, actor: meta.actor, note: meta.note };
  return {
    ...state,
    items: state.items.map(row => row.id === itemId ? { ...row, glAccountCode: accountCode } : row),
    glAssignments: [...history, assignment],
  };
}

/** Validate local test-mode persistence before it reaches rendering or mutation. */
export function parseReconciliationState(raw: string, companyId: string): ReconciliationState {
  const fail = (message: string): never => { throw new Error(`Saved reconciliation data: ${message}`); };
  const object = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label} must be an object.`);
    return value as Record<string, unknown>;
  };
  const array = (value: unknown, label: string): unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array.`);
  const requiredText = (value: unknown, label: string): string => isText(value) ? value : fail(`${label} must be a non-empty string.`);
  const timestamp = (value: unknown, label: string): string => {
    if (!isTimestamp(value)) return fail(`${label} must be a valid ISO timestamp with a timezone.`);
    return value;
  };

  if (!isText(companyId)) return fail('An organization ID is required.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return fail('The saved value is not valid JSON.'); }
  const data = object(parsed, 'State');
  if (data.version !== 1) return fail('The state version is unsupported.');
  if (data.organizationId !== companyId) return fail('The state belongs to a different organization.');

  const itemIds = new Set<string>();
  const items = array(data.items, 'Items').map((value, index): ReconciliationItem => {
    const label = `Item ${index + 1}`;
    const row = object(value, label);
    const id = requiredText(row.id, `${label} ID`);
    if (itemIds.has(id)) return fail(`Duplicate item ID ${id}.`);
    itemIds.add(id);
    if (row.organizationId !== companyId) return fail(`${label} belongs to a different organization.`);
    if (!isIsoDate(row.documentDate)) return fail(`${label} document date must be a real ISO date.`);
    if (typeof row.dueDate !== 'string' || (row.dueDate !== '' && !isIsoDate(row.dueDate))) return fail(`${label} due date must be blank or a real ISO date.`);
    if (typeof row.reference !== 'string') return fail(`${label} reference must be a string.`);
    if (!isMinor(row.originalMinor) || !isMinor(row.remainingMinor)) return fail(`${label} amounts must be non-negative safe integer cents.`);
    const item: ReconciliationItem = {
      id,
      organizationId: companyId,
      counterpartyId: row.kind === 'Payment' && row.counterpartyId === '' ? '' : requiredText(row.counterpartyId, `${label} counterparty ID`),
      counterpartyName: row.kind === 'Payment' && row.counterpartyName === '' ? '' : requiredText(row.counterpartyName, `${label} counterparty name`),
      ...(Object.hasOwn(row, 'payeeName') ? { payeeName: requiredText(row.payeeName, `${label} payee name`) } : {}),
      ...(Object.hasOwn(row, 'glAccountCode') ? { glAccountCode: requiredText(row.glAccountCode, `${label} GL account`) } : {}),
      kind: requiredText(row.kind, `${label} kind`) as ReconciliationItem['kind'],
      side: requiredText(row.side, `${label} side`) as ReconciliationItem['side'],
      documentNumber: requiredText(row.documentNumber, `${label} document number`),
      reference: row.reference,
      documentDate: row.documentDate,
      dueDate: row.dueDate,
      currency: requiredText(row.currency, `${label} currency`),
      originalMinor: row.originalMinor,
      remainingMinor: row.remainingMinor,
    };
    const error = itemError(item);
    if (error) return fail(`${label}: ${error}`);
    return item;
  });
  const byId = new Map(items.map(item => [item.id, item]));
  const batchIds = new Set<string>();
  const activeProposalIds = new Set<string>();
  const activeDeltas = new Map<string, number>();
  const batches = array(data.batches, 'Batches').map((value, index): ReconciliationBatch => {
    const label = `Batch ${index + 1}`;
    const row = object(value, label);
    const id = requiredText(row.id, `${label} ID`);
    if (batchIds.has(id)) return fail(`Duplicate batch ID ${id}.`);
    batchIds.add(id);
    const at = timestamp(row.at, `${label} timestamp`);
    const actor = requiredText(row.actor, `${label} actor`);
    const reversedAt = Object.hasOwn(row, 'reversedAt') ? timestamp(row.reversedAt, `${label} reversal timestamp`) : undefined;
    if (reversedAt && Date.parse(reversedAt) < Date.parse(at)) return fail(`${label} was reversed before it was applied.`);
    const localProposalIds = new Set<string>();
    const proposalIds = array(row.proposalIds, `${label} proposal IDs`).map((proposalId): string => {
      const proposal = requiredText(proposalId, `${label} proposal ID`);
      if (localProposalIds.has(proposal)) return fail(`${label} contains a duplicate proposal ID.`);
      localProposalIds.add(proposal);
      if (!reversedAt) {
        if (activeProposalIds.has(proposal)) return fail('A proposal appears in multiple active batches.');
        activeProposalIds.add(proposal);
      }
      return proposal;
    });
    if (!proposalIds.length) return fail(`${label} must contain at least one proposal ID.`);
    const batchDeltas = new Map<string, number>();
    const allocations = array(row.allocations, `${label} allocations`).map((allocationValue, allocationIndex) => {
      const allocationLabel = `${label} allocation ${allocationIndex + 1}`;
      const allocation = object(allocationValue, allocationLabel);
      const fundingId = requiredText(allocation.fundingId, `${allocationLabel} funding ID`);
      const invoiceId = requiredText(allocation.invoiceId, `${allocationLabel} invoice ID`);
      if (!isMinor(allocation.amountMinor) || allocation.amountMinor === 0) return fail(`${allocationLabel} amount must be positive safe integer cents.`);
      const amountMinor = allocation.amountMinor;
      validateAllocation(byId, fundingId, invoiceId, amountMinor);
      addDelta(batchDeltas, fundingId, amountMinor);
      addDelta(batchDeltas, invoiceId, amountMinor);
      return { fundingId, invoiceId, amountMinor };
    });
    if (!allocations.length || proposalIds.length > allocations.length) return fail(`${label} must have at least one allocation for each proposal.`);
    for (const [itemId, amount] of batchDeltas) {
      if (amount > byId.get(itemId)!.originalMinor) return fail(`${label} allocations exceed an original item amount.`);
      if (!reversedAt) addDelta(activeDeltas, itemId, amount);
    }
    return { id, at, actor, proposalIds, allocations, ...(reversedAt ? { reversedAt } : {}) };
  });
  for (const [itemId, amount] of activeDeltas) {
    const item = byId.get(itemId)!;
    if (checkedAdd(item.remainingMinor, amount) > item.originalMinor) return fail(`Active history for ${itemId} is inconsistent with its remaining balance.`);
  }
  const assignmentIds = new Set<string>();
  const lastAssignment = new Map<string, ReconciliationGlAssignment>();
  const glAssignments = Object.hasOwn(data, 'glAssignments') ? array(data.glAssignments, 'GL assignments').map((value, index): ReconciliationGlAssignment => {
    const label = `GL assignment ${index + 1}`;
    const row = object(value, label);
    const id = requiredText(row.id, `${label} ID`);
    if (assignmentIds.has(id)) return fail(`Duplicate GL assignment ID ${id}.`);
    assignmentIds.add(id);
    const itemId = requiredText(row.itemId, `${label} item ID`);
    if (byId.get(itemId)?.kind !== 'Payment') return fail(`${label} must reference a payment in this organization.`);
    if (row.fromAccount !== '' && !isAccountCode(row.fromAccount)) return fail(`${label} previous account must be blank or a valid account code.`);
    if (!isAccountCode(row.toAccount) || row.toAccount === row.fromAccount) return fail(`${label} must change to a valid account code.`);
    if (typeof row.note !== 'string') return fail(`${label} note must be a string.`);
    const entry: ReconciliationGlAssignment = {
      id, itemId, fromAccount: row.fromAccount, toAccount: row.toAccount,
      at: timestamp(row.at, `${label} timestamp`),
      actor: requiredText(row.actor, `${label} actor`),
      note: row.note,
    };
    const previous = lastAssignment.get(itemId);
    if (previous && (entry.fromAccount !== previous.toAccount || Date.parse(entry.at) < Date.parse(previous.at))) return fail(`${label} is inconsistent with the previous account edit.`);
    lastAssignment.set(itemId, entry);
    return entry;
  }) : undefined;
  for (const [itemId, entry] of lastAssignment) {
    if (byId.get(itemId)!.glAccountCode !== entry.toAccount) return fail(`GL account for ${itemId} does not match its latest audit entry.`);
  }
  return { version: 1, organizationId: companyId, items, batches, ...(glAssignments ? { glAssignments } : {}) };
}

export function createDemoReconciliationState(companyId: string): ReconciliationState {
  if (!isText(companyId)) throw new Error('Organization ID is required for test data.');
  const item = (id: string, counterpartyId: string, counterpartyName: string, kind: ReconciliationItem['kind'], documentNumber: string, amount: number, reference = '', patch: Partial<ReconciliationItem> = {}): ReconciliationItem => ({
    id: `${companyId}:demo:${id}`,
    organizationId: companyId,
    counterpartyId,
    counterpartyName,
    kind,
    side: 'Receivable',
    documentNumber,
    reference,
    documentDate: '2026-09-01',
    dueDate: kind === 'Invoice' ? '2026-09-30' : '',
    currency: 'EUR',
    originalMinor: amount,
    remainingMinor: amount,
    ...patch,
  });
  return {
    version: 1,
    organizationId: companyId,
    batches: [],
    items: [
      item('invoice-exact', 'demo-baltic-office', 'Baltic Office UAB', 'Invoice', 'INV-2026-101', 125010),
      item('payment-exact', 'demo-baltic-office', 'Baltic Office UAB', 'Payment', 'BNK-2026-501', 125010, 'Payment for INV-2026-101'),
      item('invoice-unique', 'demo-green-park', 'Green Park UAB', 'Invoice', 'INV-2026-102', 48000),
      item('payment-unique', 'demo-green-park', 'Green Park UAB', 'Payment', 'BNK-2026-502', 48000, 'September services'),
      item('invoice-partial', 'demo-northstar', 'Northstar Logistics UAB', 'Invoice', 'INV-2026-103', 100000, '', { remainingMinor: 60000 }),
      item('payment-partial', 'demo-northstar', 'Northstar Logistics UAB', 'Payment', 'BNK-2026-503', 25000, 'Part payment INV-2026-103'),
      item('invoice-multi-a', 'demo-city-retail', 'City Retail UAB', 'Invoice', 'INV-2026-104', 40000),
      item('invoice-multi-b', 'demo-city-retail', 'City Retail UAB', 'Invoice', 'INV-2026-105', 25000),
      item('payment-multi', 'demo-city-retail', 'City Retail UAB', 'Payment', 'BNK-2026-504', 65000, 'Invoices INV-2026-104 and INV-2026-105'),
      item('invoice-ambiguous-a', 'demo-studio', 'Studio Forma UAB', 'Invoice', 'INV-2026-106', 30000),
      item('invoice-ambiguous-b', 'demo-studio', 'Studio Forma UAB', 'Invoice', 'INV-2026-107', 30000),
      item('payment-ambiguous', 'demo-studio', 'Studio Forma UAB', 'Payment', 'BNK-2026-505', 30000, 'Monthly account payment'),
      item('invoice-currency', 'demo-export', 'Export Partners UAB', 'Invoice', 'INV-2026-108', 73000),
      item('payment-currency', 'demo-export', 'Export Partners UAB', 'Payment', 'BNK-2026-506', 73000, 'INV-2026-108', { currency: 'USD' }),
      item('invoice-credit', 'demo-supplies', 'Office Supplies UAB', 'Invoice', 'SUP-2026-109', 18000, '', { side: 'Payable' }),
      item('credit-note', 'demo-supplies', 'Office Supplies UAB', 'Credit note', 'CN-2026-201', 18000, 'Credit against SUP-2026-109', { side: 'Payable' }),
      item('invoice-advance', 'demo-craft', 'Craft Works UAB', 'Invoice', 'INV-2026-110', 22000),
      item('advance-overpayment', 'demo-craft', 'Craft Works UAB', 'Advance', 'ADV-2026-301', 30000, 'Advance for INV-2026-110'),
      item('invoice-unmatched', 'demo-design', 'Design House UAB', 'Invoice', 'INV-2026-111', 67000),
      item('payment-unmatched', 'demo-cafe', 'Old Town Cafe UAB', 'Payment', 'BNK-2026-507', 11900, 'Deposit; invoice pending'),
      item('invoice-side', 'demo-market', 'Market Group UAB', 'Invoice', 'INV-2026-112', 10000),
      item('payment-side', 'demo-market', 'Market Group UAB', 'Payment', 'BNK-2026-508', 10000, 'INV-2026-112', { side: 'Payable' }),
    ],
  };
}
