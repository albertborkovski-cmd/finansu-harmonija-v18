import { useEffect, useState } from 'react';
import type { AppSession } from '../lib/accessControl';
import type { Company } from '../lib/supabase';
import type { RelatedObject } from '../lib/notifications';
import { loadTaskRelatedObjects } from '../lib/taskFormData';
import SearchableSelect from './SearchableSelect';
import RelatedObjectLink, { type OpenRelatedObject } from './RelatedObjectLink';

export default function NotificationRelatedObjectField({ organization, session, value, onChange, onOpen }: {
  organization?: Company;
  session: AppSession;
  value?: RelatedObject;
  onChange: (object: RelatedObject | undefined) => void;
  onOpen: OpenRelatedObject;
}) {
  const [result, setResult] = useState<{ organizationId?: string; rows: RelatedObject[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' });
  const [openError, setOpenError] = useState('');
  const sessionKey = JSON.stringify(session);
  useEffect(() => {
    let disposed = false;
    if (!organization) { setResult({ rows: [], loading: false, error: '' }); return; }
    setResult({ organizationId: organization.id, rows: [], loading: true, error: '' });
    void loadTaskRelatedObjects(organization, JSON.parse(sessionKey) as AppSession).then(rows => {
      if (!disposed) setResult({ organizationId: organization.id, rows, loading: false, error: '' });
    }).catch(() => {
      if (!disposed) setResult({ organizationId: organization.id, rows: [], loading: false, error: 'Related objects could not be loaded.' });
    });
    return () => { disposed = true; };
  }, [organization, sessionKey]);
  const rows = result.organizationId === organization?.id ? result.rows : [];
  return <div className="flex flex-col gap-1">
    <span>Related object <span className="text-[#7288A3]">(optional)</span></span>
    <SearchableSelect selectionIndicator="checkbox" ariaLabel="Related object" value={value?.id ?? ''}
      placeholder={result.loading ? 'Loading…' : 'Select related object'} disabled={!organization || result.loading}
      options={[{ value: '', label: 'None' }, ...rows.map(object => ({ value: object.id, label: object.label, description: object.type }))]}
      onChange={id => { onChange(rows.find(object => object.id === id)); setOpenError(''); }} />
    {value && <RelatedObjectLink object={value} organizationId={organization?.id} onOpen={onOpen} onError={setOpenError} />}
    {(result.error || openError) && <p role="alert" className="text-[12px] text-red-600">{openError || result.error}</p>}
  </div>;
}
