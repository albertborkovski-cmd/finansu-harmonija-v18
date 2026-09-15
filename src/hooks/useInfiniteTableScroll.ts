import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Watches the actual list viewport, not the fixed summary below the table. */
export default function useInfiniteTableScroll(
  listRef: RefObject<HTMLElement> | undefined,
  fallbackRef: RefObject<HTMLElement>,
  batch: number,
  hasMore: boolean,
  onLoadMore: (batch: number) => void,
) {
  const latest = useRef({ batch, hasMore, onLoadMore });
  latest.current = { batch, hasMore, onLoadMore };
  const requestedBatch = useRef<number>();
  const previousBatch = useRef(batch);

  useLayoutEffect(() => {
    if (batch < previousBatch.current) {
      // Filters/context changes restart the list; appended batches never move it.
      const list = listRef?.current ?? fallbackRef.current;
      for (let element = list; element; element = element.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = 0;
      }
    }
    previousBatch.current = batch;
  }, [batch, listRef, fallbackRef]);

  useEffect(() => {
    requestedBatch.current = undefined;
    if (!hasMore) return;
    const list = listRef?.current ?? fallbackRef.current;
    if (!list) return;
    let frame = 0;

    const checkBottom = () => {
      frame = 0;
      const state = latest.current;
      if (!state.hasMore || requestedBatch.current === state.batch) return;
      const rect = list.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      let visibleTop = 0;
      let visibleBottom = window.innerHeight;
      for (let parent = list.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
          const parentRect = parent.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, parentRect.top + parent.clientTop);
          visibleBottom = Math.min(visibleBottom, parentRect.top + parent.clientTop + parent.clientHeight);
        }
      }
      if (rect.bottom <= visibleTop || rect.top >= visibleBottom) return;
      // A list can have its own vertical scroll, or grow inside a scrolling page.
      const isScrollContainer = /auto|scroll/.test(getComputedStyle(list).overflowY);
      const contentBottom = isScrollContainer
        ? rect.top + list.clientTop + list.scrollHeight - list.scrollTop
        : rect.bottom;
      const viewportBottom = isScrollContainer
        ? Math.min(visibleBottom, rect.top + list.clientTop + list.clientHeight)
        : visibleBottom;
      if (contentBottom > viewportBottom + 2) return;
      requestedBatch.current = state.batch;
      state.onLoadMore(state.batch + 1);
    };
    const scheduleCheck = () => {
      if (!frame) frame = requestAnimationFrame(checkBottom);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target === document || target === window || (target instanceof Element && (target === list || target.contains(list)))) {
        scheduleCheck();
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', scheduleCheck);
    const resizeObserver = new ResizeObserver(scheduleCheck);
    resizeObserver.observe(list);
    if (list.firstElementChild) resizeObserver.observe(list.firstElementChild);
    scheduleCheck();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', scheduleCheck);
      resizeObserver.disconnect();
    };
  }, [batch, hasMore, listRef, fallbackRef]);
}
