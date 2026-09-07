import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

interface FixedFooterPosition {
  left: number;
  width: number;
  backdropLeft: number;
  backdropWidth: number;
}

/**
 * Keeps the shared table controls in one viewport position.
 *
 * OCR > Automation processes is the system reference: its content uses
 * `clamp(24px, 5vw, 72px)` horizontal padding. The position is intentionally
 * calculated from the application main area instead of the current page
 * wrapper, because some legacy screens still use different local paddings.
 * That prevents the scrollbar from jumping left/right while switching menus.
 */
export default function useAppTableFooterPosition(
  elementRef: RefObject<HTMLElement>,
  bottom: number,
  maxWidth = 1384,
): CSSProperties | undefined {
  const [position, setPosition] = useState<FixedFooterPosition>();

  const updatePosition = useCallback(() => {
    const element = elementRef.current;
    if (!element || element.parentElement?.closest('[role="dialog"], .fixed')) {
      setPosition(undefined);
      return;
    }

    const appMain = element.closest<HTMLElement>('[data-app-main]');
    if (!appMain) {
      setPosition(undefined);
      return;
    }

    const mainRect = appMain.getBoundingClientRect();
    const referencePadding = Math.min(72, Math.max(24, window.innerWidth * 0.05));
    const availableWidth = Math.max(0, mainRect.width - referencePadding * 2);
    const width = Math.min(maxWidth, availableWidth);
    const left = mainRect.left + referencePadding + Math.max(0, (availableWidth - width) / 2);

    setPosition(current => (
      current &&
      Math.abs(current.left - left) < 0.5 &&
      Math.abs(current.width - width) < 0.5 &&
      Math.abs(current.backdropLeft - mainRect.left) < 0.5 &&
      Math.abs(current.backdropWidth - mainRect.width) < 0.5
        ? current
        : {
            left,
            width,
            backdropLeft: mainRect.left,
            backdropWidth: mainRect.width,
          }
    ));
  }, [elementRef, maxWidth]);

  useLayoutEffect(() => {
    updatePosition();
    const element = elementRef.current;
    const appMain = element?.closest<HTMLElement>('[data-app-main]');
    if (!element || !appMain) return;

    const observer = new ResizeObserver(updatePosition);
    observer.observe(appMain);
    if (appMain.firstElementChild) observer.observe(appMain.firstElementChild);
    window.addEventListener('resize', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [elementRef, updatePosition]);

  return position
    ? ({
        position: 'fixed',
        left: position.left,
        width: position.width,
        bottom,
        '--table-footer-backdrop-left': `${position.backdropLeft}px`,
        '--table-footer-backdrop-width': `${position.backdropWidth}px`,
      } as CSSProperties)
    : undefined;
}
