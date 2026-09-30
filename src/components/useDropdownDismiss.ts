import { useEffect, useRef, type RefObject } from 'react';

/** Shared dismissal contract for dropdowns: outside pointer and Escape. */
export function useDropdownDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
  additionalRefs?: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[],
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const additionalRefsRef = useRef(additionalRefs);
  additionalRefsRef.current = additionalRefs;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const extra = additionalRefsRef.current;
      const refs = [ref, ...(Array.isArray(extra) ? extra : extra ? [extra] : [])];
      if (!refs.some((insideRef) => insideRef.current?.contains(event.target as Node))) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, ref]);
}
