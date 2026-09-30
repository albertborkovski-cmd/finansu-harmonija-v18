import { useState } from 'react';
import { type AppSession } from '../lib/accessControl';
import { isControlAdmin, loadAdminControls, updateAdminControls, type AdminControls } from '../lib/adminControls';
import { loadLinkedDirectoryUsers } from '../lib/linkedSettingsData';
import { PageHeader, PageActionButton } from './PageHeader';
import SearchableSelect from './SearchableSelect';

const input = 'h-10 w-full rounded-lg border border-[#D3E1EC] bg-white px-3 text-[13px] outline-none focus:border-[#007EA7]';
export default function AdministratorSettings({ session }: { session: AppSession }) {
  const [policy, setPolicy] = useState(loadAdminControls);
  const [tab, setTab] = useState('Scheduled maintenance');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reminder, setReminder] = useState('15');
  const [message, setMessage] = useState('Scheduled maintenance. Please save your work before you are signed out.');
  const [target, setTarget] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const users = [...loadLinkedDirectoryUsers('Internal users'), ...loadLinkedDirectoryUsers('External users')];
  const options = [...new Map(users.filter(user => user.email).map(user => [user.email!.toLowerCase(), { value: user.email!.toLowerCase(), label: user.fullName || user.email!, description: user.email }])).values()];
  if (!isControlAdmin(session)) return <div className="p-10">Administrator access required.</div>;
  const save = (action: string, change: (current: AdminControls) => AdminControls) => {
    try { setPolicy(updateAdminControls(session, action, change)); setFeedback('Saved.'); }
    catch { setFeedback('Unable to save. Please try again.'); }
  };
  const schedule = () => {
    const from = Date.parse(start), to = Date.parse(end);
    if (!Number.isFinite(from) || from <= Date.now() || !Number.isFinite(to) || to <= from || !message.trim()) { setFeedback('Choose a future start, a later end and enter a message.'); return; }
    save('Scheduled maintenance', current => ({ ...current, maintenance: { id: crypto.randomUUID(), start: from, end: to, reminderMinutes: Number(reminder), message: message.trim() } }));
  };
  return <main className="min-h-full space-y-6 bg-white px-9 py-14 font-montserrat text-[13px] text-[#10233A]">
    <PageHeader title="Administrator settings" />
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
      <span>Settings</span><span aria-hidden="true">/</span>
      <span>General settings</span><span aria-hidden="true">/</span>
      <span aria-current="page" className="text-[#A1B6C6]">Administrator settings</span>
    </nav>
    <div className="flex gap-1 border-b border-[#D3E1EC]">{['Scheduled maintenance', 'User sessions', 'Access restrictions'].map(item => <button key={item} onClick={() => { setTab(item); setFeedback(''); }} className={`px-4 py-3 font-medium ${tab === item ? 'border-b-2 border-[#007EA7] text-[#007EA7]' : 'text-[#7288A3]'}`}>{item}</button>)}</div>
    {feedback && <p role="status">{feedback}</p>}
    {tab === 'Scheduled maintenance' && <section className="max-w-4xl space-y-5 rounded-lg border border-[#D3E1EC] p-6">
      <h2 className="font-semibold">Schedule sign-out & login restriction</h2>
      {policy.maintenance && <div className="rounded bg-[#F0F6FA] p-3">{new Date(policy.maintenance.start).toLocaleString()} – {new Date(policy.maintenance.end).toLocaleString()} · {policy.maintenance.message}<div className="mt-3"><PageActionButton onClick={() => save('Cancelled maintenance', current => ({ ...current, maintenance: null }))}>Cancel maintenance</PageActionButton></div></div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 block">From *<input aria-label="Maintenance start" type="datetime-local" className={input} value={start} onChange={e => setStart(e.target.value)} /></label><label className="space-y-2 block">To *<input aria-label="Maintenance end" type="datetime-local" className={input} value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <div>Show reminder before start<SearchableSelect ariaLabel="Reminder before maintenance" value={reminder} onChange={setReminder} options={[{ value:'5',label:'5 minutes' },{ value:'15',label:'15 minutes' },{ value:'30',label:'30 minutes' },{ value:'60',label:'1 hour' },{ value:'1440',label:'1 day' }]} /></div>
      <label className="block">Message *<textarea className={`${input} !h-24 py-3`} value={message} onChange={e => setMessage(e.target.value)} /></label>
      <PageActionButton onClick={schedule}>Schedule maintenance</PageActionButton>
    </section>}
    {(tab === 'User sessions' || tab === 'Access restrictions') && <section className="max-w-4xl space-y-5 rounded-lg border border-[#D3E1EC] p-6">
      <div>User<SearchableSelect ariaLabel="Select user" value={target} onChange={setTarget} options={options} /></div>
      <label className="block">Reason *<input className={input} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {tab === 'User sessions' ? <><p className="text-[#7288A3]">Ends existing sessions. Users can sign in again unless a restriction is active. Administrator sessions are excluded.</p><div className="flex gap-3"><PageActionButton disabled={!target || !reason.trim()} onClick={() => { if (window.confirm(`Sign out ${target}?`)) save(`Sign out ${target}: ${reason}`, current => ({ ...current, revokedBefore: { ...current.revokedBefore, [target]: Date.now() } })); }}>Sign out user</PageActionButton><PageActionButton disabled={!reason.trim()} onClick={() => { if (window.confirm('Sign out all non-administrator users in this demo?')) save(`Sign out all: ${reason}`, current => ({ ...current, revokedBefore: { ...current.revokedBefore, '*': Date.now() } })); }}>Sign out all users</PageActionButton></div></> : <>
        <label className="block">Blocked until *<input type="datetime-local" className={input} value={until} onChange={e => setUntil(e.target.value)} /></label>
        <PageActionButton disabled={!target || !reason.trim() || !until} onClick={() => { const expires = Date.parse(until); if (!Number.isFinite(expires) || expires <= Date.now()) { setFeedback('Choose a future end time.'); return; } if (window.confirm(`Temporarily block ${target}? Administrator access is exempt.`)) save(`Block ${target}: ${reason}`, current => ({ ...current, blocks: { ...current.blocks, [target]: { until: expires, reason } } })); }}>Block login</PageActionButton>
        {Object.entries(policy.blocks).filter(([, block]) => block.until > Date.now()).map(([email, block]) => <div key={email} className="flex items-center justify-between rounded bg-[#F8FDFF] p-3"><span>{email} · Until {new Date(block.until).toLocaleString()}</span><PageActionButton onClick={() => save(`Unblock ${email}`, current => { const blocks = { ...current.blocks }; delete blocks[email]; return { ...current, blocks }; })}>Unblock</PageActionButton></div>)}
      </>}
    </section>}
  </main>;
}
