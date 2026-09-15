/** Number of records appended when a table reaches its bottom. */
export const TABLE_BATCH_SIZE = 50;

export function tableVisibleCount(batch: number, total: number) {
  return Math.min(Math.max(0, total), Math.max(1, batch) * TABLE_BATCH_SIZE);
}
