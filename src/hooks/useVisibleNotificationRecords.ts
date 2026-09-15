import { useEffect, useState } from 'react';
import { canViewMenu, parseSession, type AppSession } from '../lib/accessControl';
import { canAccessAssignedOrganization } from '../lib/linkedSettingsData';
import { supabase, type Company } from '../lib/supabase';
import type { AttentionNotification } from '../lib/notifications';
import { useOrganizationAccessRevision } from '../components/useOrganizationAccessRevision';

/** Local to Notifications & Tasks: list and badges must use the same current access scope. */
export function useVisibleNotificationRecords(records: AttentionNotification[], session: AppSession) {
  const revision = useOrganizationAccessRevision();
  const [companies, setCompanies] = useState<Company[]>([]);
  const currentSession = parseSession(JSON.stringify(session));

  useEffect(() => {
    let disposed = false;
    let request = 0;
    const load = async () => {
      const latest = ++request;
      try {
        const { data, error } = await supabase.from('companies').select('*');
        if (!disposed && latest === request) setCompanies(error ? [] : (data ?? []) as unknown as Company[]);
      } catch {
        if (!disposed && latest === request) setCompanies([]);
      }
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ table?: string }>).detail?.table === 'companies') void load();
    };
    void load();
    window.addEventListener('finansu-harmonija:data-changed', changed);
    return () => { disposed = true; window.removeEventListener('finansu-harmonija:data-changed', changed); };
  }, [revision]);

  const visible = currentSession && canViewMenu(currentSession, 'notifications');
  const organizations = visible ? companies.filter(company => currentSession && canAccessAssignedOrganization(company, currentSession)) : [];
  const accessibleIds = new Set(organizations.map(company => company.id));
  return {
    session: currentSession,
    organizations,
    canAccessOrganization: (id: string) => Boolean(visible && accessibleIds.has(id)),
    records: visible ? records.filter(row => !row.organizationId || accessibleIds.has(row.organizationId)) : [],
  };
}
