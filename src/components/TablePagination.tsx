import { useRef, type RefObject } from "react";
import useAppTableFooterPosition from "../hooks/useAppTableFooterPosition";
import useInfiniteTableScroll from "../hooks/useInfiniteTableScroll";
import { TABLE_BATCH_SIZE, tableVisibleCount } from "../lib/tablePaging";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  itemCount?: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  hideSummary?: boolean;
  className?: string;
  scrollRef?: RefObject<HTMLElement>;
}

/** Shared infinite-list summary. currentPage represents the loaded batch count. */
export default function TablePagination({
  currentPage,
  totalPages,
  itemCount,
  onPageChange,
  hideSummary = false,
  className = "",
  scrollRef,
}: TablePaginationProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const fixedPosition = useAppTableFooterPosition(footerRef, 24);
  const normalizedTotal = Number.isFinite(totalPages)
    ? Math.floor(totalPages)
    : 0;
  const normalizedCurrent = Number.isFinite(currentPage)
    ? Math.floor(currentPage)
    : 1;
  const normalizedItemCount =
    itemCount !== undefined && Number.isFinite(itemCount)
      ? Math.max(0, Math.floor(itemCount))
      : undefined;
  const normalizedPageSize = TABLE_BATCH_SIZE;
  const safeTotal = normalizedItemCount !== undefined
      ? Math.max(1, Math.ceil(normalizedItemCount / normalizedPageSize))
      : Math.max(1, normalizedTotal);
  const safeCurrent = Math.min(safeTotal, Math.max(1, normalizedCurrent));
  const displayedItemCount =
    normalizedItemCount ?? Math.max(0, normalizedTotal * normalizedPageSize);
  const rangeStart =
    displayedItemCount === 0 ? 0 : 1;
  const rangeEnd =
    displayedItemCount === 0
      ? 0
      : tableVisibleCount(safeCurrent, displayedItemCount);

  useInfiniteTableScroll(scrollRef, markerRef, safeCurrent, rangeEnd < displayedItemCount, onPageChange);

  return (
    <div ref={markerRef} className="w-full min-h-px flex-shrink-0" data-infinite-table-end>
    <div
      ref={footerRef}
      style={fixedPosition}
      className={`unified-table-pagination ${fixedPosition ? "z-30 bg-white" : ""} flex h-8 w-full flex-row items-center justify-between gap-4 ${className}`}
    >
      {!hideSummary && <div role="status" aria-live="polite" className="ml-auto flex h-8 flex-shrink-0 flex-row items-center gap-[14px]">
        <span className="whitespace-nowrap font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">
          {`${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} from ${displayedItemCount.toLocaleString()}`}
        </span>
      </div>}
    </div>
    </div>
  );
}
