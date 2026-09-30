import { useSyncExternalStore } from 'react';
import type { NotificationRow } from '../lib/notifications';
import { formatNotificationAge, formatNotificationDateTime, notificationTimestamp } from '../lib/notificationPresentation';

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const getSnapshot = () => now;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach(update => update());
    }, 60000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); timer = undefined; }
  };
}

export default function NotificationRelativeTime({ row }: { row: Pick<NotificationRow, 'createdAt' | 'id'> }) {
  const currentTime = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const timestamp = notificationTimestamp(row);
  return <time dateTime={Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined} title={formatNotificationDateTime(row)} className="whitespace-nowrap text-[#7288A3]">{formatNotificationAge(row, currentTime)}</time>;
}
