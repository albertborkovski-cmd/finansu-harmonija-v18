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
  try {
    let restored = restoreColumnLayout(columns, JSON.parse(window.localStorage.getItem(key) ?? 'null'));
    const reconciliationLayout = key.includes(':column-layout:reconciliation-examples-layout-');
    const glDefaultMigration = `${key}:optional-gl-account-v1`;
    if (reconciliationLayout && columns.some(column => column.key === 'glAccount' && !column.visible) && window.localStorage.getItem(glDefaultMigration) !== 'done') {
      restored = restored.map(column => column.key === 'glAccount' ? { ...column, visible: false } : column);
      saveColumnLayout(key, restored);
      window.localStorage.setItem(glDefaultMigration, 'done');
    }
    // Move the former leading reconciliation rate column without resetting
    // the user's other column positions or visibility preferences.
    if (reconciliationLayout && restored[0]?.key === 'exchangeRate') {
      const predecessor = columns[columns.findIndex(column => column.key === 'exchangeRate') - 1]?.key;
      const anchor = restored.findIndex(column => column.key === predecessor);
      if (anchor > 0) {
        const [rate, ...remaining] = restored;
        remaining.splice(anchor, 0, rate);
        return remaining;
      }
    }
    return restored;
  }
  catch { return columns; }
}

export function saveColumnLayout(key: string, columns: ColConfig[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(columns.map(({ key, visible }) => ({ key, visible }))));
  } catch { /* Storage may be unavailable; keep the current table usable. */ }
}
