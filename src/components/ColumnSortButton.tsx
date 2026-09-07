import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;
export type SortValue = string | number | Date | null | undefined;

export function nextSortDirection(direction: SortDirection): SortDirection {
  if (direction === null) return 'asc';
  if (direction === 'asc') return 'desc';
  return null;
}

function comparable(value: SortValue): string | number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return String(value ?? '');
}

export function useColumnSort<T>(
  rows: readonly T[],
  getValue: (row: T) => SortValue,
  initialDirection: SortDirection = null,
) {
  const [direction, setDirection] = useState<SortDirection>(initialDirection);
  const sortedRows = useMemo(() => {
    if (!direction) return [...rows];
    const multiplier = direction === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = comparable(getValue(left));
      const b = comparable(getValue(right));
      const primary = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      if (primary !== 0) return primary * multiplier;

      // Identical visible values are common in prototype data. Use a stable record ID
      // as a secondary key so ascending/descending always produces an observable order.
      const leftId = comparable((left as { id?: SortValue }).id);
      const rightId = comparable((right as { id?: SortValue }).id);
      return String(leftId).localeCompare(String(rightId), undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
    });
  }, [direction, getValue, rows]);

  return {
    direction,
    setDirection,
    sortedRows,
    toggleDirection: () => setDirection(current => nextSortDirection(current)),
  };
}

export function useMultiColumnSort<T, K extends string>(
  rows: readonly T[],
  getValue: (row: T, key: K) => SortValue,
) {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [direction, setDirection] = useState<SortDirection>(null);

  const sortedRows = useMemo(() => {
    if (!sortKey || !direction) return [...rows];
    const multiplier = direction === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = comparable(getValue(left, sortKey));
      const b = comparable(getValue(right, sortKey));
      const primary = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      if (primary !== 0) return primary * multiplier;
      const leftId = comparable((left as { id?: SortValue }).id);
      const rightId = comparable((right as { id?: SortValue }).id);
      return String(leftId).localeCompare(String(rightId), undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
    });
  }, [direction, getValue, rows, sortKey]);

  const changeSort = (key: K, nextDirection: SortDirection) => {
    setSortKey(nextDirection ? key : null);
    setDirection(nextDirection);
  };

  return {
    sortKey,
    direction,
    sortedRows,
    changeSort,
    directionFor: (key: K): SortDirection => sortKey === key ? direction : null,
  };
}

interface ColumnSortButtonProps {
  columnLabel: string;
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
  className?: string;
}

export default function ColumnSortButton({ columnLabel, direction, onDirectionChange, className = '' }: ColumnSortButtonProps) {
  const nextDirection = nextSortDirection(direction);
  const action = nextDirection === 'asc' ? 'ascending' : nextDirection === 'desc' ? 'descending' : 'unsorted';
  const active = direction !== null;

  return (
    <button
      type="button"
      data-button-family="column-sort"
      aria-label={`Sort ${columnLabel} ${action}`}
      aria-pressed={active}
      title={nextDirection === 'asc' ? 'Sort A–Z' : nextDirection === 'desc' ? 'Sort Z–A' : 'Clear sorting'}
      onClick={() => onDirectionChange(nextDirection)}
      className={`relative flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007EA7] ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        className="transition-transform"
        style={{ transform: direction === 'desc' ? 'scaleY(-1)' : undefined }}
      >
        <line x1="2" y1="1" x2="2" y2="13" stroke={active ? '#007EA7' : '#10233A'} strokeWidth="1.35" strokeLinecap="round" />
        <line x1="7" y1="2" x2="13" y2="2" stroke={active ? '#007EA7' : '#10233A'} strokeWidth="1.35" strokeLinecap="round" />
        <line x1="7" y1="5.5" x2="11" y2="5.5" stroke={active ? '#007EA7' : '#10233A'} strokeWidth="1.35" strokeLinecap="round" />
        <line x1="7" y1="9" x2="10" y2="9" stroke={active ? '#007EA7' : '#10233A'} strokeWidth="1.35" strokeLinecap="round" />
        <line x1="7" y1="12.5" x2="8" y2="12.5" stroke={active ? '#007EA7' : '#10233A'} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
