import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import useAppTableFooterPosition from "../hooks/useAppTableFooterPosition";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  itemCount?: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  onShowMore?: () => void;
  showMoreLabel?: string;
  allItemsVisible?: boolean;
  hideSummary?: boolean;
  className?: string;
}

/** Shared table footer: pagination on the left, item range and Show more on the right. */
export default function TablePagination({
  currentPage,
  totalPages,
  itemCount,
  itemsPerPage = 14,
  onPageChange,
  onShowMore,
  showMoreLabel = "Show more",
  allItemsVisible = false,
  hideSummary = false,
  className = "",
}: TablePaginationProps) {
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
  const normalizedPageSize = Number.isFinite(itemsPerPage)
    ? Math.max(1, Math.floor(itemsPerPage))
    : 14;
  const safeTotal = normalizedItemCount !== undefined
      ? Math.max(1, Math.ceil(normalizedItemCount / normalizedPageSize))
      : Math.max(1, normalizedTotal);
  const safeCurrent = Math.min(safeTotal, Math.max(1, normalizedCurrent));
  const pages = Array.from(
    { length: Math.min(5, safeTotal) },
    (_, index) => index + 1,
  );
  const hasMore = safeTotal > 5;
  const displayedItemCount =
    normalizedItemCount ?? Math.max(0, normalizedTotal * normalizedPageSize);
  const rangeStart =
    displayedItemCount === 0 ? 0 : (safeCurrent - 1) * normalizedPageSize + 1;
  const rangeEnd =
    displayedItemCount === 0
      ? 0
      : Math.min(safeCurrent * normalizedPageSize, displayedItemCount);

  return (
    <div
      ref={footerRef}
      style={fixedPosition}
      className={`unified-table-pagination ${fixedPosition ? "z-30 bg-white" : ""} flex h-8 w-full flex-row items-center justify-between gap-4 ${className}`}
    >
      <div
        className="order-first mr-auto flex h-8 flex-row items-center flex-shrink-0"
        aria-label="Table pages"
      >
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            aria-label={`Page ${page}`}
            aria-current={page === safeCurrent ? "page" : undefined}
            onClick={() => onPageChange(page)}
            className="flex h-8 w-8 items-center justify-center font-montserrat text-[14px] font-medium transition-colors"
            style={{ color: page === safeCurrent ? "#1B55E9" : "#7288A3" }}
          >
            {page}
          </button>
        ))}
        {hasMore && (
          <span className="flex h-8 w-8 items-center justify-center font-montserrat text-[14px] font-medium text-[#7288A3]">
            …
          </span>
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={safeCurrent >= safeTotal}
          onClick={() => onPageChange(Math.min(safeCurrent + 1, safeTotal))}
          className="flex h-8 w-8 items-center justify-center text-[#7288A3] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {!hideSummary && <div className="ml-auto flex h-8 flex-shrink-0 flex-row items-center gap-[14px]">
        <span className="whitespace-nowrap font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">
          {allItemsVisible
            ? `${displayedItemCount.toLocaleString()} from ${displayedItemCount.toLocaleString()} items`
            : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} from ${displayedItemCount.toLocaleString()} items`}
        </span>
        <button
          type="button"
          onClick={onShowMore}
          className="flex h-8 min-w-[107px] items-center justify-center whitespace-nowrap rounded-md border-2 border-[#D3E1EC] bg-white px-3 py-[6px] font-montserrat text-[14px] font-semibold leading-5 text-[#7288A3] transition-colors hover:border-[#007EA7] active:border-[#007EA7] active:text-[#007EA7]"
        >
          {showMoreLabel}
        </button>
      </div>}
    </div>
  );
}
