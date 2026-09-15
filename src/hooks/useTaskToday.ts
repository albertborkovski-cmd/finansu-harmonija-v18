import { useEffect, useState } from 'react';
import { getLocalDateKey } from '../lib/taskSchedule';

/** Refresh calendar-based filters after midnight and when a sleeping tab returns. */
export function useTaskToday() {
  const [today, setToday] = useState(() => getLocalDateKey());
  useEffect(() => {
    const refresh = () => setToday(getLocalDateKey());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
