import type { ReconciliationItem } from './reconciliation';

export function paymentPurpose(item: ReconciliationItem): string {
  if (item.paymentPurpose?.trim()) return item.paymentPurpose.trim();
  // Legacy bank examples store the statement narrative in reference.
  return ['Payment', 'Advance', 'Deposit'].includes(item.kind) ? item.reference?.trim() || '—' : '—';
}

export function paymentPurposes(items: ReconciliationItem[]): string {
  return [...new Set(items.map(paymentPurpose).filter(value => value !== '—'))].join(' · ') || '—';
}
