import { useEffect, type RefObject } from 'react';

/** Shared scrolling contract for system tables using the horizontal scrollbar. */
export default function useFrozenTableHeaders(scrollRef: RefObject<HTMLElement> | undefined, fallbackRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const viewport = scrollRef?.current ?? fallbackRef.current?.previousElementSibling as HTMLElement | null;
    if (!viewport) return;
    const headers = new Set<HTMLElement>();
    const markHeaders = () => {
      viewport.querySelectorAll<HTMLElement>('thead, .system-table-header-row, [role="row"]:has(> [role="columnheader"])').forEach(header => headers.add(header));
      viewport.querySelectorAll<HTMLElement>('[data-column-resize-handle="true"]').forEach(handle => {
        let row = handle.parentElement;
        while (row && row !== viewport) {
          if (row.querySelectorAll('[data-column-resize-handle="true"]').length > 1) {
            if (!row.matches('table, thead, tr') && !row.querySelector('tbody')) headers.add(row);
            break;
          }
          row = row.parentElement;
        }
      });
      headers.forEach(header => header.setAttribute('data-frozen-table-header', 'true'));
    };
    const previousHeight = viewport.style.maxHeight;
    const resize = () => {
      const top = viewport.getBoundingClientRect().top;
      if (viewport.getClientRects().length && top < window.innerHeight) {
        const available = Math.max(160, window.innerHeight - Math.max(0, top) - 140);
        viewport.style.maxHeight = `${available}px`;
      }
    };
    viewport.setAttribute('data-system-table-viewport', 'true');
    markHeaders();
    resize();
    const mutations = new MutationObserver(markHeaders);
    mutations.observe(viewport, { childList: true, subtree: true });
    window.addEventListener('resize', resize);
    return () => {
      mutations.disconnect();
      window.removeEventListener('resize', resize);
      viewport.removeAttribute('data-system-table-viewport');
      viewport.style.maxHeight = previousHeight;
      headers.forEach(header => header.removeAttribute('data-frozen-table-header'));
    };
  }, [scrollRef, fallbackRef]);
}
