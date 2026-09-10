import { useEffect, useState } from 'react';
import { organizationAccessDate, SETTINGS_DATA_CHANGED_EVENT } from '../lib/linkedSettingsData';

/** Refresh open screens at the date boundary and after local/cross-tab changes. */
export function useOrganizationAccessRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let date = organizationAccessDate();
    const changed = () => setRevision(value => value + 1);
    const checkDate = () => {
      const next = organizationAccessDate();
      if (date !== next) { date = next; changed(); }
    };
    const timer = window.setInterval(checkDate, 1000);
    window.addEventListener('focus', checkDate);
    document.addEventListener('visibilitychange', checkDate);
    window.addEventListener('storage', changed);
    window.addEventListener(SETTINGS_DATA_CHANGED_EVENT, changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkDate);
      document.removeEventListener('visibilitychange', checkDate);
      window.removeEventListener('storage', changed);
      window.removeEventListener(SETTINGS_DATA_CHANGED_EVENT, changed);
    };
  }, []);
  return revision;
}
