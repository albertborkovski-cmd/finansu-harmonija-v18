import type { ColConfig } from '../components/ColumnSettingsPanel';

/** Store layout only: labels and defaults continue to come from the current schema. */
export function restoreColumnLayout(columns: ColConfig[], stored: unknown): ColConfig[] {
  if (!Array.isArray(stored)) return columns;
  const remaining = new Map(columns.map(column => [column.key, column]));
  const result: ColConfig[] = [];
  for (const item of stored) {
    if (!item || typeof item.key !== 'string' || typeof item.visible !== 'boolean') continue;
    const column = remaining.get(item.key);
    if (!column) continue;
    result.push({ ...column, visible: item.visible });
    remaining.delete(item.key);
  }
  return [...result, ...remaining.values()];
}

export function readColumnLayout(key: string, columns: ColConfig[]) {
  try { return restoreColumnLayout(columns, JSON.parse(window.localStorage.getItem(key) ?? 'null')); }
  catch { return columns; }
}

export function saveColumnLayout(key: string, columns: ColConfig[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(columns.map(({ key, visible }) => ({ key, visible }))));
  } catch { /* Storage may be unavailable; keep the current table usable. */ }
}
