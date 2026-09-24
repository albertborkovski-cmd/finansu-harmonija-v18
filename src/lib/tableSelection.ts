/** Select/deselect only the current filtered IDs; preserve selections outside the filter. */
export function toggleFilteredSelection<T>(selected: ReadonlySet<T>, filteredIds: readonly T[]): Set<T> {
  const next = new Set(selected);
  const deselect = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  for (const id of filteredIds) {
    if (deselect) next.delete(id);
    else next.add(id);
  }
  return next;
}
