import { useEffect, useState } from 'react';
import { supabase, type Company } from '../lib/supabase';
import SearchableSelect from './SearchableSelect';
import { PageActionButton } from './PageHeader';

export default function CompanySharePointSettings({ company }: { company: Company }) {
  const [values, setValues] = useState({
    sharepoint_client_id: company.sharepoint_client_id || '',
    sharepoint_client_secret: company.sharepoint_client_secret || '',
    sharepoint_tenant_id: company.sharepoint_tenant_id || '',
    sharepoint_urls: company.sharepoint_urls || '',
    sharepoint_sync_schedule: company.sharepoint_sync_schedule || 'Manual synchronization',
    sharepoint_sync_time: company.sharepoint_sync_time || '09:00',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: loadError } = await supabase.from('companies').select('*').eq('id', company.id);
      const stored = data?.[0];
      if (!cancelled && !loadError && stored) setValues(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, typeof stored[key] === 'string' ? stored[key] : value])) as typeof current);
    })();
    return () => { cancelled = true; };
  }, [company.id]);
  const change = (key: keyof typeof values, value: string) => { setValues(current => ({ ...current, [key]: value })); setMessage(''); setError(''); };
  const save = async () => {
    if (saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.from('companies').update(values).eq('id', company.id);
      if (saveError) throw new Error(saveError.message);
      setMessage('SharePoint settings saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save SharePoint settings.'); }
    finally { setSaving(false); }
  };
  const inputClass = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]';
  return <section className="rounded-lg border border-[#D3E1EC] p-5">
    <h3 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">SharePoint settings</h3>
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {([{ key: 'sharepoint_client_id', label: 'SharePoint Client ID' }, { key: 'sharepoint_client_secret', label: 'SharePoint Client secret' }, { key: 'sharepoint_tenant_id', label: 'SharePoint Tenant ID' }] as const).map(field => <label key={field.key} className="flex flex-col gap-2"><span className="font-semibold">{field.label}</span><input type={field.key === 'sharepoint_client_secret' ? 'password' : 'text'} autoComplete="off" value={values[field.key]} onChange={event => change(field.key, event.target.value)} className={inputClass} /></label>)}
      <div className="flex flex-col gap-2"><span className="font-semibold">Synchronization schedule</span><SearchableSelect ariaLabel="Synchronization schedule" value={values.sharepoint_sync_schedule} options={['Every 5 minutes', 'Every hour', 'Every day', 'Synchronization disabled', 'Manual synchronization']} onChange={value => change('sharepoint_sync_schedule', value)} /></div>
      {values.sharepoint_sync_schedule === 'Every day' && <label className="flex flex-col gap-2"><span className="font-semibold">Synchronization time</span><input type="time" value={values.sharepoint_sync_time} onChange={event => change('sharepoint_sync_time', event.target.value)} className={inputClass} /></label>}
      <label className="flex flex-col gap-2 md:col-span-2"><span className="font-semibold">SharePoint URLs</span><textarea rows={3} value={values.sharepoint_urls} onChange={event => change('sharepoint_urls', event.target.value)} className="w-full resize-y rounded-lg border border-[#D3E1EC] px-[14px] py-3 font-montserrat text-[14px] font-medium leading-5 text-[#10233A] outline-none focus:border-[#007EA7]" /></label>
    </div>
    <div className="mt-5 flex items-center justify-end gap-3"><span role="status" className="text-[12px] text-[#087A55]">{message}</span>{error && <span role="alert" className="text-[12px] text-red-600">{error}</span>}<PageActionButton disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</PageActionButton></div>
  </section>;
}
