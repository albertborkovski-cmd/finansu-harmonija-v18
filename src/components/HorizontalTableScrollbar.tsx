import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useAppTableFooterPosition from '../hooks/useAppTableFooterPosition';

interface HorizontalTableScrollbarProps {
  scrollRef?: RefObject<HTMLElement>;
  className?: string;
  fixed?: boolean;
}

/**
 * Shared system horizontal table scrollbar.
 *
 * Main application tables use the same viewport slot as OCR > Automation
 * processes. Dialogs and other fixed overlays automatically fall back to
 * their local document flow in useAppTableFooterPosition.
 */
export default function HorizontalTableScrollbar({ scrollRef, className = '', fixed = true }: HorizontalTableScrollbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0);
  const [thumbRatio, setThumbRatio] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);
  const calculatedFixedPosition = useAppTableFooterPosition(rootRef, 104);
  const fixedPosition = fixed ? calculatedFixedPosition : undefined;

  const update = useCallback(() => {
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    setRatio(maximum ? Math.min(1, Math.max(0, element.scrollLeft / maximum)) : 0);
    setThumbRatio(element.scrollWidth ? Math.min(1, element.clientWidth / element.scrollWidth) : 1);
  }, [scrollRef]);

  useEffect(() => {
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    if (!element) return;
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    update();
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [scrollRef, update]);

  const canScroll = thumbRatio < 0.999;
  const atStart = !canScroll || ratio <= 0.001;
  const atEnd = !canScroll || ratio >= 0.999;

  const scrollByStep = (direction: -1 | 1) => {
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    element?.scrollBy({ left: direction * Math.max(200, (element?.clientWidth ?? 0) * 0.55), behavior: 'smooth' });
  };

  const moveFromPointer = (clientX: number) => {
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    const track = trackRef.current;
    if (!element || !track || !canScroll) return;
    const rect = track.getBoundingClientRect();
    const thumbWidth = Math.max(40, rect.width * thumbRatio);
    const thumbTravel = Math.max(1, rect.width - thumbWidth);
    const nextRatio = Math.min(1, Math.max(0, (clientX - rect.left - thumbWidth / 2) / thumbTravel));
    element.scrollLeft = nextRatio * (element.scrollWidth - element.clientWidth);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    if (!element || !canScroll) return;
    dragStartX.current = event.clientX;
    dragStartScroll.current = element.scrollLeft;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = scrollRef?.current ?? rootRef.current?.previousElementSibling as HTMLElement | null;
    const track = trackRef.current;
    if (!dragging || !element || !track) return;
    const thumbWidth = Math.max(40, track.clientWidth * thumbRatio);
    const travel = Math.max(1, track.clientWidth - thumbWidth);
    const maximum = element.scrollWidth - element.clientWidth;
    element.scrollLeft = dragStartScroll.current + ((event.clientX - dragStartX.current) / travel) * maximum;
  };

  const thumbPercent = Math.min(100, Math.max(0, thumbRatio * 100));

  return (
    <div
      ref={rootRef}
      style={fixedPosition}
      data-table-scrollbar={fixedPosition ? 'fixed' : 'local'}
      className={`shared-table-scrollbar relative isolate ${fixedPosition ? 'shared-table-scrollbar--fixed z-30' : 'sticky bottom-0 left-0 z-20 mt-auto'} mx-auto flex min-h-11 w-full max-w-[1384px] flex-shrink-0 items-center gap-2 bg-white px-1 pb-3 pt-2 ${className}`}
      aria-label="Horizontal table scroll"
    >
      <button type="button" aria-label="Scroll table left" disabled={atStart} onClick={() => scrollByStep(-1)} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white transition-colors disabled:cursor-not-allowed" style={{ border: `2px solid ${atStart ? '#F5F5F5' : '#D3E1EC'}` }}>
        <ChevronLeft size={12} className={atStart ? 'text-[#D3E1EC]' : 'text-[#7288A3]'} />
      </button>
      <div ref={trackRef} role="scrollbar" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} onPointerDown={(event) => moveFromPointer(event.clientX)} className={`relative h-2 flex-1 rounded-full bg-[#D3E1EC] ${canScroll ? 'cursor-pointer' : 'cursor-default'}`}>
        <div onPointerDown={startDrag} onPointerMove={drag} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} className={`absolute top-px h-[6px] rounded-full bg-[#E5EDF9] ${canScroll ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`} style={{ width: `${thumbPercent}%`, minWidth: canScroll ? 40 : undefined, left: `calc(${ratio} * (100% - max(${thumbPercent}%, 40px)))` }} />
      </div>
      <button type="button" aria-label="Scroll table right" disabled={atEnd} onClick={() => scrollByStep(1)} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white transition-colors disabled:cursor-not-allowed" style={{ border: `2px solid ${atEnd ? '#F5F5F5' : '#D3E1EC'}` }}>
        <ChevronRight size={12} className={atEnd ? 'text-[#D3E1EC]' : 'text-[#7288A3]'} />
      </button>
    </div>
  );
}
