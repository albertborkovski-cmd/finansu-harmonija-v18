# Reconciliation test mode (V15)

Entry: Companies → Alice Stone → Reconciliation.

This is an isolated, working test workflow. Documents, payments, credit notes and advances are demonstrative. Confirming and reversing only change the selected company's reconciliation test data in this browser's local storage. They do not post accounting entries, change real company documents, move money, or call an ERP. Browser data is not a production audit log or shared backend.

## Quick test

1. **All items** opens with 30 example items. Its first six rows demonstrate Reconciled, Not reconciled, Suggested, Partially reconciled, Needs review and Reversed. **Reset examples** restores this dataset after explicit confirmation.
2. **Open items** contains 26 items with a remaining balance. **Suggestions** starts with 8 proposals: 3 High and 5 Review required. **Auto match** recalculates proposals within the selected/filtered scope; only High proposals are preselected.
3. Click **Apply selected**. Check each funding/invoice pair, reason, allocated amount and both remaining balances. Confirm explicitly.
4. **History** starts with 4 example batches (3 applied and 1 reversed), and shows new confirmation batches, actor, time and amounts. Refresh or leave and return: saved test balances/history remain.
5. Use the batch's **Reverse** icon. Confirming restores that batch's allocations, leaves other batches unchanged, and keeps a Reversed history record.

## Scenarios

| Scenario | Test data | Expected behavior |
| --- | --- | --- |
| Already reconciled | Amber Consulting, EX-INV-201 / EX-BNK-601 | 1,250.00 EUR settled, zero balance; review opens the existing batch |
| Existing partial reconciliation | River Transport, EX-INV-202 / EX-BNK-602 | 400.00 EUR settled; invoice balance 550.00 and payment balance 300.00 EUR |
| Reversed reconciliation | Sunrise Studio, EX-INV-203 / EX-BNK-603 | 360.00 EUR balances restored; reversed batch and actor/time remain in History |
| Already reconciled credit note | Paper Supply, EX-SUP-204 / EX-CN-604 | 240.00 EUR settled against the payable invoice |
| Exact reference and amount | Baltic Office, INV-2026-101 / BNK-2026-501 | High; 1,250.10 EUR allocated once |
| Credit note | Office Supplies, SUP-2026-109 / CN-2026-201 | High; payable credit against payable invoice |
| Unique amount only | Green Park | Review required |
| Partially paid invoice | Northstar, INV-2026-103 / BNK-2026-503 | Open 600.00, allocation 250.00, remainder 350.00 EUR |
| Multiple explicit references | City Retail, BNK-2026-504 | 650.00 EUR across two invoices; review required |
| Advance / excess payment | Craft Works | Invoice settled for 220.00; advance retains 80.00 EUR |
| Ambiguous equal amounts | Studio Forma | No arbitrary automatic choice; Review an item to choose manually |
| Different currency or side | Export Partners / Market Group | Not automatically matched across incompatible scopes |

Search and active filters define the matching scope; selected rows override it. Both sides of a match must be in scope. The header checkbox selects all filtered open rows, including later 50-row loading batches; fully reconciled rows cannot be selected. Use a counterparty filter to keep its invoices and payments together. **Add filters → Status** allows an exact status selection. The status summary counts items, not reconciliation batches or proposals.

For manual matching, click **Match** beside an open item. **Match open items** shows the complete compatible list, with search and a checkbox for each record. Tick one or more records: amounts are allocated in selection order, capped by the source and counterpart balances. The table shows Open amount, To match and Remaining; the summary shows the source balance before/after. Once the source is fully covered, unticked records are disabled until an existing selection is cleared. Search does not remove selected records.

Click **Reconcile selected** once to save the displayed allocations directly. There is no intermediate proposal-creation form or second confirmation screen for this deliberately selected manual action. This updates only local test balances, recalculates automatic suggestions and records an auditable test batch. The existing automatic proposal review/confirmation flow is unchanged. Cancel or closing the manual list never changes balances.

**Matching rules** affect the next run; existing proposals and confirmed batches remain unchanged. Same organization, counterparty identity, currency and receivable/payable side are mandatory. There is zero tolerance and no automatic write-off. All amounts are integer cents internally. EUR and USD are the supported demo currencies; totals are kept separate by currency.

Columns can be resized, reordered and hidden using the system controls. Monetary sorting uses numeric values, while search/CSV export use displayed currency-unit values. Test data is company-scoped and validated on load. Stale balances, duplicate confirmation, conflicting allocations and malformed persisted data are rejected; cross-tab changes invalidate open reviews.

All/Open items share column preferences and display Amount, Settled and Balance separately. Header and row widths use the same sizing contract; numeric values align right and action icons remain the final column. Long text is truncated with the full value available on hover. Seeded history uses the same apply/reverse engine as interactive actions. The expanded examples use the separate `finansu-harmonija:v15:reconciliation-examples-v2:<companyId>` local-storage key; earlier reconciliation test data is preserved.

## Automated verification

Run `node --test tests/reconciliation.test.mjs tests/reconciliation-examples.test.mjs tests/manual-reconciliation.test.mjs` for the pure matching, checkbox allocation, atomic application, reversal, persisted-state parsing and example consistency tests. Also run `npm run typecheck`, targeted ESLint and `npm run build`.

Before production use, connect authoritative document/payment balances and implement server-side authorization, transactional allocation, shared audit history, concurrency control and ERP posting. Local test state must not be treated as production accounting data.
