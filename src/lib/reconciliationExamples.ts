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
  | 'Missing document'
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
  return augmentReconciliationExamples(state);
}

const expansionPrefix = (companyId: string) => `${companyId}:demo-expanded-v1:`;
const choiceExpansionPrefix = (companyId: string) => `${companyId}:demo-expanded-v2:`;
const depositExpansionPrefix = (companyId: string) => `${companyId}:demo-expanded-v3:`;
const accountingExpansionPrefix = (companyId: string) => `${companyId}:demo-expanded-v4:`;

/**
 * Add only the new showcase to an already parsed local test state. Existing
 * balances, deletions, and history are never replaced with fresh fixtures.
 * Each expansion has its own once-only marker. Any surviving item or batch for
 * that expansion prevents deleted records from being recreated on reload, while
 * previously expanded ledgers can still receive later additive fixture sets.
 */
export function augmentReconciliationExamples(state: ReconciliationState): ReconciliationState {
  let result = state;
  const expansions = [
    { prefix: expansionPrefix(state.organizationId), create: createExpandedReconciliationState },
    { prefix: choiceExpansionPrefix(state.organizationId), create: createChoiceReconciliationState },
    { prefix: depositExpansionPrefix(state.organizationId), create: createDepositReconciliationState },
    { prefix: accountingExpansionPrefix(state.organizationId), create: createAccountingReconciliationState },
    { prefix: `${state.organizationId}:demo-cash-v1:`, create: createCashReconciliationState },
    { prefix: `${state.organizationId}:demo-missing-v1:`, create: createMissingDocumentState },
  ];
  for (const expansion of expansions) {
    if (result.items.some(item => item.id.startsWith(expansion.prefix))
      || result.batches.some(batch => batch.id.startsWith(expansion.prefix))
      || result.glAssignments?.some(entry => entry.itemId.startsWith(expansion.prefix))) continue;
    const added = expansion.create(state.organizationId);
    result = {
      ...result,
      items: [...result.items, ...added.items],
      batches: [...result.batches, ...added.batches],
    };
  }
  return result;
}

/** A deterministic, isolated purchase / sales / bank test ledger. */
function createExpandedReconciliationState(companyId: string): ReconciliationState {
  if (!companyId.trim()) throw new Error('Organization ID is required for test data.');
  const prefix = expansionPrefix(companyId);
  let state: ReconciliationState = { version: 1, organizationId: companyId, items: [], batches: [] };
  let sequence = 0;
  const date = (day: number) => new Date(Date.UTC(2026, 6, 1 + day)).toISOString().slice(0, 10);
  const group = (key: string, name: string, side: ReconciliationItem['side'], day: number, currency = 'EUR') => {
    const add = (
      suffix: string,
      kind: ReconciliationItem['kind'],
      amountMinor: number,
      reference = '',
      dayOffset = 0,
      patch: Partial<Pick<ReconciliationItem, 'currency' | 'documentNumber' | 'dueDate'>> = {},
    ) => {
      sequence += 1;
      const series = kind === 'Invoice' ? (side === 'Payable' ? 'PUR' : 'SAL')
        : kind === 'Credit note' ? 'CRN' : kind === 'Advance' ? 'ADV' : 'BNK';
      const item: ReconciliationItem = {
        id: `${prefix}${key}:${suffix}`,
        organizationId: companyId,
        counterpartyId: `${prefix}counterparty:${key}`,
        counterpartyName: name,
        kind,
        side,
        documentNumber: `EX2-${series}-2026-${String(sequence).padStart(4, '0')}`,
        reference,
        documentDate: date(day + dayOffset),
        dueDate: kind === 'Invoice' ? date(day + dayOffset + (side === 'Payable' ? 14 : 30)) : '',
        currency,
        originalMinor: amountMinor,
        remainingMinor: amountMinor,
        ...patch,
      };
      state.items.push(item);
      return item;
    };
    return {
      invoice: (suffix: string, amount: number, offset = 0, patch: Parameters<typeof add>[5] = {}) => add(suffix, 'Invoice', amount, '', offset, patch),
      payment: (suffix: string, amount: number, reference: string, offset = 7, patch: Parameters<typeof add>[5] = {}) => add(suffix, 'Payment', amount, reference, offset, patch),
      credit: (suffix: string, amount: number, reference: string, offset = 3) => add(suffix, 'Credit note', amount, reference, offset),
      advance: (suffix: string, amount: number, reference: string, offset = -3) => add(suffix, 'Advance', amount, reference, offset),
    };
  };
  const side = (index: number): ReconciliationItem['side'] => index % 2 === 0 ? 'Receivable' : 'Payable';

  // Exact bank references, including cents, different terms and USD ledgers.
  const exactNames = ['Vilniaus Architektai UAB', 'Kauno Pakavimo Centras UAB', 'Baltijos Renginiai UAB', 'Nemuno Energija UAB', 'Klaipėdos Laivyba UAB', 'Šiaurės Telekomas UAB', 'Aukštaitijos Viešbučiai UAB', 'Dzūkijos Spaustuvė UAB', 'Amber Digital LLC', 'Atlantic Components LLC'];
  const exactAmounts = [185742, 48635, 1299000, 32187, 761230, 9900, 243675, 65849, 185050, 924075];
  exactNames.forEach((name, index) => {
    const rows = group(`exact-${index + 1}`, name, side(index), 9 + index * 4, index >= 8 ? 'USD' : 'EUR');
    const invoice = rows.invoice('invoice', exactAmounts[index]);
    rows.payment('payment', invoice.originalMinor, `Invoice ${invoice.documentNumber}; contract LT-${String(index + 1).padStart(3, '0')}`);
  });

  // No invoice reference: a unique amount is helpful but still needs review.
  ['Žaliasis Biuras UAB', 'Vakarų Kurjeriai UAB', 'Miesto Knygynai UAB', 'Skaitmeninė Apskaita UAB'].forEach((name, index) => {
    const rows = group(`unique-${index + 1}`, name, side(index), 18 + index * 8);
    const invoice = rows.invoice('invoice', [54321, 118590, 209999, 78400][index]);
    rows.payment('payment', invoice.originalMinor, ['Monthly service fee', 'Customer account settlement', 'July deliveries', 'Annual subscription'][index], 10);
  });

  // One bank line covers three sales or purchase invoices, sometimes with an
  // excess amount that must remain available after the allocation.
  ['Sostinės Prekyba UAB', 'Medžio Tiekimas UAB', 'Kuršių Turizmas UAB', 'Mechanikos Dalys UAB', 'Mokslo Sprendimai UAB', 'Šviežio Maisto Centras UAB'].forEach((name, index) => {
    const rows = group(`multi-${index + 1}`, name, side(index), 12 + index * 5);
    const invoices = [35470 + index * 817, 72839 + index * 2301, 18990 + index * 433]
      .map((amount, invoiceIndex) => rows.invoice(`invoice-${invoiceIndex + 1}`, amount, invoiceIndex * 5));
    const extra = index % 2 === 0 ? 0 : 15000 + index * 100;
    rows.payment('payment', invoices.reduce((sum, invoice) => sum + invoice.originalMinor, 0) + extra,
      `Consolidated transfer: ${invoices.map(invoice => invoice.documentNumber).join('; ')}`, 21);
  });

  // Underpayments include a one-cent discrepancy, a small bank-fee shortfall,
  // and ordinary installment payments; none is silently written off.
  ['Rytų Statyba UAB', 'Pramonės Įrankiai UAB', 'Ežerų Poilsis UAB', 'Lietaus Sistemos UAB', 'Kūrybinė Erdvė UAB', 'Saugios Patalpos UAB'].forEach((name, index) => {
    const rows = group(`partial-${index + 1}`, name, side(index), 25 + index * 5);
    const invoice = rows.invoice('invoice', [780000, 34999, 121050, 560000, 98050, 165000][index]);
    const paid = [250000, 34998, 120550, 140000, 32500, 100000][index];
    rows.payment('payment', paid, `Partial payment of ${invoice.documentNumber}`, 12);
  });

  ['Saulės Inžinerija UAB', 'Metalo Partneriai UAB', 'Šilko Dizainas UAB', 'Baltos Lentynos UAB'].forEach((name, index) => {
    const rows = group(`overpayment-${index + 1}`, name, side(index), 33 + index * 6);
    const invoice = rows.invoice('invoice', [89999, 143750, 247890, 56010][index]);
    rows.payment('payment', invoice.originalMinor + [1, 1250, 50000, 3990][index], `Settlement of ${invoice.documentNumber}; retain excess on account`, 8);
  });

  ['Gintaro Projektai UAB', 'Modernios Staklės UAB', 'Pilies Restoranas UAB', 'Krovinių Terminalas UAB'].forEach((name, index) => {
    const rows = group(`advance-${index + 1}`, name, side(index), 41 + index * 5);
    const invoice = rows.invoice('invoice', [450000, 980000, 71500, 358900][index]);
    rows.advance('advance', [150000, 1200000, 71500, 100000][index], `Prepayment for ${invoice.documentNumber}`);
  });

  // A credit note plus a bank payment can settle one invoice without either
  // source competing for more than its outstanding amount.
  ['Pušų Baldai UAB', 'Popieriaus Sandėlis UAB', 'Šviesos Studija UAB', 'Elektronikos Tiekimas UAB'].forEach((name, index) => {
    const rows = group(`credit-and-bank-${index + 1}`, name, side(index), 22 + index * 7);
    const invoice = rows.invoice('invoice', [121000, 483570, 96500, 720200][index]);
    const creditMinor = [12100, 83570, 16500, 20200][index];
    rows.credit('credit', creditMinor, `Returned goods / price correction for ${invoice.documentNumber}`);
    rows.payment('payment', invoice.originalMinor - creditMinor, `Balance after credit: ${invoice.documentNumber}`, 14);
  });

  ['Senamiesčio Galerija UAB', 'Aplinkos Tyrimai UAB', 'Dviračių Dirbtuvės UAB', 'Laiko Kontrolė UAB', 'Regiono Mokymai UAB'].forEach((name, index) => {
    const rows = group(`unpaid-${index + 1}`, name, side(index), 2 + index * 12);
    rows.invoice('invoice', [175500, 438690, 23640, 87777, 324500][index]);
  });
  ['Naujas Klientas UAB', 'Sandėlio Rezervas UAB', 'Sezoninė Prekyba UAB'].forEach((name, index) => {
    const rows = group(`bank-only-${index + 1}`, name, side(index), 55 + index * 3);
    rows.payment('payment', [50000, 275000, 123456][index], ['Deposit received; invoice not issued yet', 'Supplier deposit; invoice pending', 'Unidentified remittance, request allocation details'][index], 0);
  });

  ['Miesto Sportas UAB', 'Biuro Technika UAB', 'Vėjo Partneriai UAB'].forEach((name, index) => {
    const rows = group(`ambiguous-amount-${index + 1}`, name, side(index), 26 + index * 8);
    const amount = [49900, 165000, 24850][index];
    rows.invoice('invoice-1', amount);
    rows.invoice('invoice-2', amount, 7);
    rows.payment('payment', amount, 'Account payment without invoice number', 16);
  });

  ['Baltic Export LLC', 'Pacific Software LLC', 'North Sea Logistics LLC'].forEach((name, index) => {
    const rows = group(`currency-mismatch-${index + 1}`, name, side(index), 37 + index * 6, index % 2 === 0 ? 'EUR' : 'USD');
    const invoice = rows.invoice('invoice', [735400, 128050, 269900][index]);
    rows.payment('payment', invoice.originalMinor, `Payment for ${invoice.documentNumber}; currency must be reviewed`, 9,
      { currency: invoice.currency === 'EUR' ? 'USD' : 'EUR' });
  });

  ['Ryšio Sprendimai UAB', 'Kelių Statyba UAB'].forEach((name, index) => {
    const rows = group(`competing-${index + 1}`, name, side(index), 43 + index * 7);
    const invoice = rows.invoice('invoice', 180000 + index * 73000);
    rows.payment('payment-1', invoice.originalMinor, `Transfer for ${invoice.documentNumber}`, 6);
    rows.payment('payment-2', invoice.originalMinor, `Possible duplicate transfer for ${invoice.documentNumber}`, 7);
  });

  ['Namų Interjeras UAB', 'Statybų Nuoma UAB'].forEach((name, index) => {
    const rows = group(`duplicate-reference-${index + 1}`, name, side(index), 30 + index * 10);
    const invoice = rows.invoice('invoice-1', 37500 + index * 12000);
    rows.invoice('invoice-2', invoice.originalMinor + 5000, 4, { documentNumber: invoice.documentNumber });
    rows.payment('payment', invoice.originalMinor, `Invoice ${invoice.documentNumber}`, 12);
  });

  const apply = (key: string, funding: ReconciliationItem, allocations: { invoice: ReconciliationItem; amount: number }[], day: number) => {
    const current = new Map(state.items.map(item => [item.id, item]));
    const proposal: ReconciliationProposal = {
      id: `${prefix}${key}:proposal`,
      organizationId: companyId,
      fundingId: funding.id,
      allocations: allocations.map(({ invoice, amount }) => ({ invoiceId: invoice.id, amountMinor: amount })),
      confidence: 'Review required',
      rule: 'Reviewed test-ledger allocation',
      reason: 'Historical example confirmed by the demo accountant; original amounts and the audit trail are retained.',
      expectedRemaining: Object.fromEntries([funding, ...allocations.map(allocation => allocation.invoice)]
        .map(item => [item.id, current.get(item.id)!.remainingMinor])),
    };
    state = applyReconciliation(state, [proposal], { id: `${prefix}${key}:batch`, at: `${date(day)}T10:00:00.000Z`, actor: 'Demo accountant' });
  };

  const rent = group('history-rent', 'Miesto Patalpos UAB', 'Payable', 5);
  const rentInvoice = rent.invoice('invoice', 186340);
  const rentBank = rent.payment('payment', 186340, `Office rent: ${rentInvoice.documentNumber}`);
  apply('history-rent', rentBank, [{ invoice: rentInvoice, amount: 186340 }], 13);

  const training = group('history-training', 'Komandos Akademija UAB', 'Receivable', 17);
  const trainingInvoice = training.invoice('invoice', 453750);
  const trainingBank = training.payment('payment', 175000, `First installment: ${trainingInvoice.documentNumber}`);
  apply('history-training', trainingBank, [{ invoice: trainingInvoice, amount: 150000 }], 25);

  const wholesale = group('history-wholesale', 'Prekybos Aljansas UAB', 'Receivable', 8);
  const wholesaleInvoices = [245678, 98765, 43210].map((amount, index) => wholesale.invoice(`invoice-${index + 1}`, amount, index * 4));
  const wholesaleTotal = wholesaleInvoices.reduce((sum, invoice) => sum + invoice.originalMinor, 0);
  const wholesaleBank = wholesale.payment('payment', wholesaleTotal, `Monthly settlement: ${wholesaleInvoices.map(invoice => invoice.documentNumber).join(', ')}`, 20);
  apply('history-wholesale', wholesaleBank, wholesaleInvoices.map(invoice => ({ invoice, amount: invoice.originalMinor })), 29);

  const returns = group('history-returns', 'Pakuočių Fabrikas UAB', 'Payable', 24);
  const returnsInvoice = returns.invoice('invoice', 100000);
  const returnsCredit = returns.credit('credit', 15000, `Damaged goods returned: ${returnsInvoice.documentNumber}`);
  const returnsBank = returns.payment('payment', 85000, `Net payment: ${returnsInvoice.documentNumber}`, 10);
  apply('history-returns-credit', returnsCredit, [{ invoice: returnsInvoice, amount: 15000 }], 28);
  apply('history-returns-bank', returnsBank, [{ invoice: returnsInvoice, amount: 85000 }], 35);

  const correction = group('history-reversed', 'Transporto Nuoma UAB', 'Payable', 32);
  const correctionInvoice = correction.invoice('invoice', 66210);
  const correctionBank = correction.payment('payment', 66210, `Allocation correction: ${correctionInvoice.documentNumber}`);
  apply('history-reversed', correctionBank, [{ invoice: correctionInvoice, amount: 66210 }], 40);
  state = reverseReconciliation(state, `${prefix}history-reversed:batch`, `${date(41)}T14:30:00.000Z`);

  const installments = group('history-installments', 'Pažangios Sistemos UAB', 'Receivable', 14);
  const installmentsInvoice = installments.invoice('invoice', 312500);
  const firstInstallment = installments.payment('payment-1', 125000, `Installment 1: ${installmentsInvoice.documentNumber}`, 7);
  const finalInstallment = installments.payment('payment-2', 187500, `Final installment: ${installmentsInvoice.documentNumber}`, 28);
  apply('history-installments-first', firstInstallment, [{ invoice: installmentsInvoice, amount: 125000 }], 22);
  apply('history-installments-final', finalInstallment, [{ invoice: installmentsInvoice, amount: 187500 }], 43);

  const balance = group('history-overpayment', 'Tvarios Idėjos UAB', 'Receivable', 47);
  const balanceInvoice = balance.invoice('invoice', 99880);
  const balanceBank = balance.payment('payment', 110000, `Invoice ${balanceInvoice.documentNumber}; excess held on account`);
  apply('history-overpayment', balanceBank, [{ invoice: balanceInvoice, amount: 99880 }], 55);
  return state;
}

/**
 * Dense, compatible manual-matching ledgers: each counterparty has 25 invoices
 * and 31 funding records (25 bank payments, three credits and three advances).
 * The large `*-100` invoice and bank line are starting points for multi-select
 * tests. Their balances cover all 24 ordinary counterpart records, and their
 * later dates keep those ordinary records first in the matching dialog.
 */
function createChoiceReconciliationState(companyId: string): ReconciliationState {
  if (!companyId.trim()) throw new Error('Organization ID is required for test data.');
  const prefix = choiceExpansionPrefix(companyId);
  const items: ReconciliationItem[] = [];
  const date = (day: number) => new Date(Date.UTC(2026, 6, 1 + day)).toISOString().slice(0, 10);
  const groups = [
    { key: 'sales-eur', name: 'Vilniaus Projektų Grupė UAB', side: 'Receivable', currency: 'EUR', series: 'SAL' },
    { key: 'purchases-eur', name: 'Baltijos Tiekimo Grupė UAB', side: 'Payable', currency: 'EUR', series: 'PUR' },
    { key: 'sales-usd', name: 'Atlantic Digital Services LLC', side: 'Receivable', currency: 'USD', series: 'SAL' },
    { key: 'purchases-usd', name: 'Pacific Industrial Supply LLC', side: 'Payable', currency: 'USD', series: 'PUR' },
  ] as const;

  groups.forEach((group, groupIndex) => {
    const add = (
      suffix: string,
      kind: ReconciliationItem['kind'],
      documentNumber: string,
      amountMinor: number,
      day: number,
      reference = '',
    ) => {
      items.push({
        id: `${prefix}${group.key}:${suffix}`,
        organizationId: companyId,
        counterpartyId: `${prefix}counterparty:${group.key}`,
        counterpartyName: group.name,
        kind,
        side: group.side,
        documentNumber,
        reference,
        documentDate: date(day),
        dueDate: kind === 'Invoice' ? date(day + (group.side === 'Payable' ? 14 : 30)) : '',
        currency: group.currency,
        originalMinor: amountMinor,
        remainingMinor: amountMinor,
      });
    };
    const document = (kind: ReconciliationItem['kind'], number: string) => {
      const category = kind === 'Invoice' ? '' : kind === 'Payment' ? 'BNK-' : kind === 'Credit note' ? 'CRN-' : 'ADV-';
      return `EX3-${category}${group.series}-${group.currency}-${number}`;
    };

    for (let index = 0; index < 24; index += 1) {
      const number = String(index + 1).padStart(3, '0');
      add(`invoice-${number}`, 'Invoice', document('Invoice', number),
        65000 + groupIndex * 18723 + index * 7137, index * 2);
      add(`payment-${number}`, 'Payment', document('Payment', number),
        25000 + groupIndex * 11519 + index * 2761, index * 2 + 3,
        `Account transfer ${number}; select the relevant open invoices manually`);
    }
    for (let index = 0; index < 3; index += 1) {
      const number = String(index + 1).padStart(3, '0');
      add(`credit-${number}`, 'Credit note', document('Credit note', number),
        8500 + groupIndex * 1749 + index * 3275, 51 + index * 3,
        ['Volume rebate awaiting allocation', 'Returned goods awaiting allocation', 'Service price correction awaiting allocation'][index]);
      add(`advance-${number}`, 'Advance', document('Advance', number),
        42500 + groupIndex * 8533 + index * 12275, 2 + index * 12,
        `Contract deposit ${number}; available for allocation to open invoices`);
    }
    add('invoice-100', 'Invoice', document('Invoice', '100'),
      6000000 + groupIndex * 811000, 76,
      'Consolidated project invoice; ample balance for matching 20 or more funding records');
    add('payment-100', 'Payment', document('Payment', '100'),
      5500000 + groupIndex * 733000, 77,
      'Quarterly consolidated settlement; ample balance for matching all 24 ordinary invoices');
  });
  return { version: 1, organizationId: companyId, items, batches: [] };
}

/** Manual-only contract deposits, added without changing existing test balances. */
function createDepositReconciliationState(companyId: string): ReconciliationState {
  if (!companyId.trim()) throw new Error('Organization ID is required for test data.');
  const groups = [
    { key: 'sales-eur', name: 'Vilniaus Projektų Grupė UAB', side: 'Receivable', currency: 'EUR', series: 'SAL' },
    { key: 'purchases-eur', name: 'Baltijos Tiekimo Grupė UAB', side: 'Payable', currency: 'EUR', series: 'PUR' },
    { key: 'sales-usd', name: 'Atlantic Digital Services LLC', side: 'Receivable', currency: 'USD', series: 'SAL' },
    { key: 'purchases-usd', name: 'Pacific Industrial Supply LLC', side: 'Payable', currency: 'USD', series: 'PUR' },
  ] as const;
  const items = groups.flatMap((group, index): ReconciliationItem[] => [
    { number: '001', amountMinor: 75000 + index * 18500, purpose: 'Partial contract deposit available for manual release' },
    { number: '002', amountMinor: 4000000 + index * 450000, purpose: 'Long-term contract deposit; select one or multiple invoices and enter the amount to release' },
  ].map(deposit => ({
    id: `${depositExpansionPrefix(companyId)}${group.key}:deposit-${deposit.number}`,
    organizationId: companyId,
    counterpartyId: `${choiceExpansionPrefix(companyId)}counterparty:${group.key}`,
    counterpartyName: group.name,
    kind: 'Deposit',
    side: group.side,
    documentNumber: `EX4-DEP-${group.series}-${group.currency}-${deposit.number}`,
    reference: `Contract LT-2026-${group.series}-${group.currency}; ${deposit.purpose}`,
    documentDate: deposit.number === '001' ? '2026-09-24' : '2026-09-25',
    dueDate: '',
    currency: group.currency,
    originalMinor: deposit.amountMinor,
    remainingMinor: deposit.amountMinor,
  })));
  return { version: 1, organizationId: companyId, items, batches: [] };
}

/** Tax, payroll and bank charges are classifications, never client settlements. */
function createMissingDocumentState(companyId: string): ReconciliationState {
  const examples: { kind: ReconciliationItem['kind']; side: ReconciliationItem['side']; name: string; amount: number; reference: string }[] = [
    { kind: 'Payment', side: 'Payable', name: 'Test Supplier A', amount: 121000, reference: 'Supplier invoice not provided for this bank payment.' },
    { kind: 'Invoice', side: 'Receivable', name: 'Test Customer B', amount: 84500, reference: 'Customer reports payment; bank payment document not provided.' },
    { kind: 'Advance', side: 'Payable', name: 'Test Supplier C', amount: 50000, reference: 'Supporting invoice for the advance has not been provided.' },
  ];
  return { version: 1, organizationId: companyId, batches: [], items: examples.map((example, index) => ({
    id: `${companyId}:demo-missing-v1:${index + 1}`, organizationId: companyId,
    counterpartyId: `${companyId}:demo-missing-counterparty:${index + 1}`, counterpartyName: example.name,
    kind: example.kind, side: example.side, documentNumber: `TEST-MISSING-2026-${String(index + 1).padStart(3, '0')}`,
    reference: example.reference, documentDate: `2026-09-${15 + index}`, dueDate: '2026-09-30', currency: 'EUR',
    originalMinor: example.amount, remainingMinor: example.amount, missingDocument: true,
    missingDocumentMarkedAt: '2026-09-22T08:00:00.000Z', missingDocumentMarkedBy: 'Demo accountant',
  })) };
}

function createCashReconciliationState(companyId: string): ReconciliationState {
  const examples = [
    { purpose: 'Grynųjų pinigų įnešimas į banko sąskaitą', side: 'Receivable' as const, amount: 150000, currency: 'EUR' },
    { purpose: 'Cash deposit at branch', side: 'Receivable' as const, amount: 320000, currency: 'EUR' },
    { purpose: 'Grynųjų pinigų išėmimas bankomate', side: 'Payable' as const, amount: 50000, currency: 'EUR' },
    { purpose: 'ATM withdrawal', side: 'Payable' as const, amount: 20000, currency: 'USD' },
  ];
  return { version: 1, organizationId: companyId, batches: [], items: examples.map((example, index) => ({
    id: `${companyId}:demo-cash-v1:${index + 1}`, organizationId: companyId,
    counterpartyId: '', counterpartyName: '', kind: 'Payment', side: example.side,
    documentNumber: `TEST-CASH-2026-${String(index + 1).padStart(3, '0')}`,
    reference: example.purpose, paymentPurpose: example.purpose,
    documentDate: `2026-09-${18 + index}`, dueDate: '', currency: example.currency,
    originalMinor: example.amount, remainingMinor: example.amount,
  })) };
}

function createAccountingReconciliationState(companyId: string): ReconciliationState {
  if (!companyId.trim()) throw new Error('Organization ID is required for test data.');
  const examples = [
    { key: 'vmi-vat', payeeName: 'VMI prie Lietuvos Respublikos finansų ministerijos', reference: 'PVM įmoka už 2026-08; įmokos kodas 1001', amount: 247850 },
    { key: 'vmi-tax', payeeName: 'Valstybinė mokesčių inspekcija', reference: 'Pelno mokesčio avansinė įmoka', amount: 125000 },
    { key: 'sodra-monthly', payeeName: 'Sodra', reference: 'Socialinio draudimo įmokos 2026-08', amount: 389240 },
    { key: 'sodra-adjustment', payeeName: 'Valstybinio socialinio draudimo fondo valdyba', reference: 'Social insurance contribution adjustment', amount: 12550 },
    { key: 'payroll-batch', payeeName: 'Darbuotojų mokėjimų paketas', reference: 'Darbo užmokestis už 2026-08', amount: 1245890 },
    { key: 'salary', payeeName: 'Jonas Jonaitis', reference: 'Salary September 2026 advance', amount: 65000 },
    { key: 'bank-fee', payeeName: 'Swedbank AB', reference: 'Banko komisinis mokestis už pavedimą', amount: 85 },
    { key: 'bank-monthly', payeeName: 'AB SEB bankas', reference: 'Monthly bank service fee', amount: 1200 },
    { key: 'unidentified-transfer', payeeName: 'Neatpažintas gavėjas', reference: 'Pavedimas 2026-09-15; paskirtis nepatikslinta', amount: 47500 },
    { key: 'unidentified-vat', payeeName: 'Nepriskirtas tiekėjas', reference: 'VAT invoice payment; awaiting counterparty identification', amount: 142750 },
    { key: 'identified-bank-fee', payeeName: 'AB SEB bankas', reference: 'Bank commission for international transfer', amount: 1850, client: true },
  ];
  const items: ReconciliationItem[] = examples.map((example, index) => ({
    id: `${accountingExpansionPrefix(companyId)}${example.key}`,
    organizationId: companyId,
    counterpartyId: example.client ? `${accountingExpansionPrefix(companyId)}counterparty:bank` : '',
    counterpartyName: example.client ? 'AB SEB bankas' : '',
    payeeName: example.payeeName,
    kind: 'Payment',
    side: 'Payable',
    documentNumber: `EX5-BNK-2026-${String(index + 1).padStart(3, '0')}`,
    reference: example.reference,
    documentDate: `2026-09-${String(4 + index).padStart(2, '0')}`,
    dueDate: '',
    currency: 'EUR',
    originalMinor: example.amount,
    remainingMinor: example.amount,
  }));
  return { version: 1, organizationId: companyId, items, batches: [] };
}

/** Derive a display status from actual balances, allocation history and proposals. */
export function getReconciliationItemStatus(
  item: ReconciliationItem,
  state: ReconciliationState,
  suggestions: ReconciliationSuggestions,
): ReconciliationItemStatus {
  if (item.missingDocument) return 'Missing document';
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
