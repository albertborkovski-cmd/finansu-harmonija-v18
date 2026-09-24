import type { ReconciliationItem } from './reconciliation';

export function exchangeRate(item: ReconciliationItem): string {
  if (!Number.isFinite(item.exchangeRate) || !item.exchangeRate || item.exchangeRate <= 0 || !item.exchangeRateCurrency) return '—';
  return `1 ${item.currency} = ${item.exchangeRate} ${item.exchangeRateCurrency}`;
}

export function exchangeRates(items: ReconciliationItem[]): string {
  return [...new Set(items.map(exchangeRate))].join(' · ') || '—';
}
