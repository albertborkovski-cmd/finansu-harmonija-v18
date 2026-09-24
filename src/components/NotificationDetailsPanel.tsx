import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { getNotificationStatus, type AttentionNotification } from '../lib/notifications';
import { formatNotificationDateTime, getNotificationModuleLabel, getNotificationRelatedObjectLabel, notificationMessage } from '../lib/notificationPresentation';
import { PageActionButton } from './PageHeader';

interface Props {
  notification: AttentionNotification;
  organizationName: string;
  read: boolean;
  onClose: () => void;
}

/** Shows the notification itself without creating or changing a related source record. */
export default function NotificationDetailsPanel({ notification, organizationName, read, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus({ preventScroll: true });
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) panel.focus({ preventScroll: true });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const buttons = panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || !last) {
          event.preventDefault();
          panel.focus({ preventScroll: true });
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('focusin', keepFocusInside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const fields = [
    { label: 'Name', value: notification.name?.trim() || '—' },
    { label: 'Type', value: getNotificationModuleLabel(notification) },
    { label: 'Organization', value: organizationName.trim() || '—' },
    { label: 'Date / time', value: formatNotificationDateTime(notification) },
    { label: 'Status', value: getNotificationStatus(notification) },
    { label: 'Related object', value: getNotificationRelatedObjectLabel(notification) },
    { label: 'Read status', value: read ? 'Read' : 'Unread' },
    { label: 'Message', value: notificationMessage(notification) },
  ];

  return <div className="fixed inset-0 z-[140] flex justify-end bg-[#10233A]/10" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-full w-full max-w-[420px] flex-col border-l border-[#D3E1EC] bg-white font-montserrat text-[14px] text-[#10233A] outline-none">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#D3E1EC] p-6">
        <h2 id={titleId} className="text-[22px] font-semibold leading-7">Notification details</h2>
        <button type="button" aria-label="Close notification details" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7288A3] hover:bg-[#F8FDFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007EA7]"><X size={20} /></button>
      </header>
      <dl className="m-0 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        {fields.map(({ label, value }) => <div key={label} className="min-w-0">
          <dt className="text-[12px] font-medium leading-[18px] text-[#7288A3]">{label}</dt>
          <dd className="m-0 mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 [overflow-wrap:anywhere]">{value}</dd>
        </div>)}
      </dl>
      <footer className="flex shrink-0 justify-end border-t border-[#D3E1EC] p-6"><PageActionButton onClick={onClose}>Close</PageActionButton></footer>
    </section>
  </div>;
}
