import { useState } from 'react';
import type { Company } from '../lib/supabase';
import { addAccountantToOrganizations, isMesoAccountant, loadLinkedDirectoryUsers, loadOrganizationSubstitutions, organizationAccessDate, organizationInternalUsers, setOrganizationSubstitution } from '../lib/linkedSettingsData';
import { useOrganizationAccessRevision } from './useOrganizationAccessRevision';
import SearchableSelect from './SearchableSelect';
import { PageActionButton } from './PageHeader';
import SettingsIdentityManagementView from './SettingsIdentityManagementView';
import { AUTH_SESSION_KEY } from '../lib/currentUser';
import { canEditMenu, parseSession } from '../lib/accessControl';
import OrganizationUsersSettings from './OrganizationUsersSettings';
import CompanySubstitutionsTable from './CompanySubstitutionsTable';
import { loadOrganizationUserIds, saveOrganizationUserIds, organizationAssignmentStorageKey } from '../lib/linkedSettingsData';

type Action = 'Add' | 'Remove' | 'Replace accountant' | 'Set substitution';

export default function CompanyAccessPanel({ company }: { company: Company }) {
  useOrganizationAccessRevision();
  const [, refreshSubstitutions] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editingSubstitutionIds, setEditingSubstitutionIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [usersOpen, setUsersOpen] = useState(false);
  const [directoryAudience, setDirectoryAudience] = useState<'Internal users' | 'External users'>('Internal users');
  const [createUser, setCreateUser] = useState(false);
  const session = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
  const canManage = Boolean(session && canEditMenu(session, 'dashboard'));
  const external = directoryAudience === 'External users';
  const internalUsers = loadLinkedDirectoryUsers('Internal users');
  const users = loadLinkedDirectoryUsers(directoryAudience);
  const externalIds = loadOrganizationUserIds(company.id, 'External users');
  const explicitExternal = window.localStorage.getItem(organizationAssignmentStorageKey(company.id, 'External users')) !== null;
  const assigned = external ? users.filter(user => externalIds.includes(user.id) || (!explicitExternal && user.organizations?.split(',').some(name => ['all organizations', company.id.toLowerCase(), company.name.toLowerCase()].includes(name.trim().toLowerCase())))) : organizationInternalUsers(company);
  const today = organizationAccessDate();
  const substitutions = loadOrganizationSubstitutions().filter(item => item.organizationId === company.id && item.to >= today);
  const options = users.filter(user => (!user.status || ['active', 'enabled'].includes(user.status.toLowerCase())) && user.id !== fromUser && (action !== 'Set substitution' || isMesoAccountant(user))).map(user => ({ value: user.id, label: `${user.fullName || user.username || user.id}${user.email ? ` (${user.email})` : ''}` }));
  const assignedOptions = assigned.map(user => ({ value: user.id, label: `${user.fullName || user.username || user.id}${user.email ? ` (${user.email})` : ''}` }));
  const valid = action === 'Remove' ? Boolean(fromUser) : action === 'Replace accountant' ? Boolean(fromUser && toUser && fromUser !== toUser) : action === 'Set substitution' ? Boolean(toUser && from && to && from <= to) : Boolean(toUser);
  const confirm = () => {
    if (!canManage || !valid) return;
    try {
      if (external) {
        if (action !== 'Add' && action !== 'Remove') return;
        const ids = new Set(assigned.map(user => user.id));
        if (action === 'Remove') ids.delete(fromUser);
        else if (options.some(option => option.value === toUser)) ids.add(toUser);
        else throw new Error('Select an available external user.');
        saveOrganizationUserIds(company.id, 'External users', ids);
      }
      else if (action === 'Set substitution') setOrganizationSubstitution(toUser, from, to, [company], editingSubstitutionIds);
      else if (action === 'Remove') addAccountantToOrganizations([], [company], [fromUser]);
      else addAccountantToOrganizations([toUser], [company], action === 'Replace accountant' ? [fromUser] : []);
      setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save assignment.'); }
  };
  const directoryView = usersOpen ? <div><div className="flex flex-wrap items-center justify-between gap-3"><PageActionButton onClick={() => setUsersOpen(false)}>Back to accountants & access</PageActionButton><span className="rounded-md bg-[#E6F2F6] px-3 py-2 font-montserrat text-[12px] text-[#007EA7]">Company: {company.name}</span></div><SettingsIdentityManagementView audience={directoryAudience} section="Users" organizationScope={company} createOnOpen={createUser} onCreateOpened={() => setCreateUser(false)} /></div> : null;
  return <section className="flex w-full min-w-0 flex-col gap-6 bg-white font-montserrat">
    {directoryView}
    <div className={usersOpen ? 'hidden' : 'flex min-w-0 flex-col gap-6'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-[16px] font-semibold text-[#10233A]">{external ? "External user actions" : "Accountant actions"}</h3>
      <div className="flex flex-wrap gap-2">{((external ? ['Add', 'Remove'] : ['Add', 'Remove', 'Replace accountant', 'Set substitution']) as Action[]).map(item => <PageActionButton key={item} disabled={!canManage || ((item === 'Remove' || item === 'Replace accountant') && !assigned.length)} onClick={() => { const existing = item === 'Set substitution' ? [...substitutions].sort((a, b) => Number(b.from <= today) - Number(a.from <= today) || b.to.localeCompare(a.to))[0] : undefined; setAction(item); setFromUser(''); setToUser(existing?.userId || ''); setFrom(existing?.from || ''); setTo(existing?.to || ''); setEditingSubstitutionIds(existing ? [existing.id] : []); setError(''); }}>{item}</PageActionButton>)}</div>
    </div>
    <OrganizationUsersSettings assignedOnly organizationId={company.id} organizationName={company.name} onAudienceChange={audience => { setDirectoryAudience(audience); setAction(null); setFromUser(''); setToUser(''); }} onCreateUser={audience => { setDirectoryAudience(audience); setCreateUser(true); setUsersOpen(true); }} />
    {!external && company.primary_accountant_id && <p className="text-[12px] text-[#7288A3]">Primary responsible: {users.find(user => user.id === company.primary_accountant_id)?.fullName || '—'}</p>}
    {!external && <CompanySubstitutionsTable rows={substitutions.map(item => ({ id: item.id, name: internalUsers.find(user => user.id === item.userId)?.fullName || internalUsers.find(user => user.id === item.userId)?.username || 'User unavailable', from: item.from, to: item.to, status: item.from <= today ? 'Active' : 'Scheduled' }))} onRefresh={() => refreshSubstitutions(value => value + 1)} />}
    {action && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 p-4"><section role="dialog" aria-modal="true" aria-label={action} className="w-full max-w-[480px] rounded-xl border border-[#D3E1EC] bg-white p-6 shadow-xl"><h2 className="text-[20px] font-semibold text-[#10233A]">{action}</h2><p className="mt-2 text-[12px] text-[#7288A3]">{company.name}</p><div className="mt-5 space-y-4">
      {(action === 'Remove' || action === 'Replace accountant') && <div><p className="mb-2 text-[12px]">{action === 'Remove' ? (external ? 'External user' : 'Internal user') : 'From accountant'} <span className="text-red-600">*</span></p><SearchableSelect selectionIndicator="checkbox" className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-3 pr-9 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]" menuClassName="!p-1 [&_button]:min-h-[42px] [&_button]:text-[12px] [&_button]:font-normal" ariaLabel="From accountant" value={fromUser} options={assignedOptions} onChange={setFromUser} /></div>}
      {action !== 'Remove' && <div><p className="mb-2 text-[12px]">{action === 'Set substitution' ? 'Substitute accountant' : action === 'Replace accountant' ? 'To accountant' : external ? 'External user' : 'Internal user'} <span className="text-red-600">*</span></p><SearchableSelect selectionIndicator="checkbox" className="h-[42px] rounded-lg border border-[#D3E1EC] bg-white px-3 pr-9 font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A]" menuClassName="!p-1 [&_button]:min-h-[42px] [&_button]:text-[12px] [&_button]:font-normal" ariaLabel={external ? 'Select external user' : 'Select internal user'} value={toUser} options={options} onChange={setToUser} /></div>}
      {action === 'Set substitution' && <div className="grid grid-cols-2 gap-3">{(['From', 'To'] as const).map(label => <label key={label} className="text-[12px]">{label} <span className="text-red-600">*</span><input type="date" value={label === 'From' ? from : to} min={label === 'To' ? from : undefined} onChange={event => label === 'From' ? setFrom(event.target.value) : setTo(event.target.value)} className="mt-2 h-[42px] w-full rounded-lg border border-[#D3E1EC] px-3" /></label>)}</div>}
      {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}</div><div className="mt-6 flex justify-end gap-2"><PageActionButton onClick={() => setAction(null)}>Cancel</PageActionButton><PageActionButton disabled={!valid} onClick={confirm}>Confirm</PageActionButton></div></section></div>}
    </div>
  </section>;
}
