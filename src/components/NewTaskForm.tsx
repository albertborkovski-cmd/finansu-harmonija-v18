import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { canEditMenu, parseSession, type AppSession } from '../lib/accessControl';
import { canAccessAssignedOrganization } from '../lib/linkedSettingsData';
import type { Company } from '../lib/supabase';
import { getTaskStatus, type ReminderRow } from '../lib/notifications';
import { getTaskPermissions } from '../lib/taskPermissions';
import { getTaskProvenance } from '../lib/taskProvenance';
import { createTaskRecord, updateTaskRecord, TASK_TYPES, validateTaskDraft, type TaskDraft, type TaskRelatedObject } from '../lib/taskCreation';
import { loadTaskAssignees, loadTaskRelatedObjects } from '../lib/taskFormData';
import { TASK_REMINDER_OPTIONS } from '../lib/taskSchedule';
import SearchableSelect from './SearchableSelect';
import ScheduleDatePicker from './ScheduleDatePicker';
import { PageActionButton } from './PageHeader';
import RelatedObjectLink, { type OpenRelatedObject } from './RelatedObjectLink';

type Props = {
  session: AppSession;
  organizations: Company[];
  organizationContext?: { id: string; name: string };
  task?: ReminderRow;
  onSave: (record: ReminderRow) => void;
  onClose: () => void;
  onOpenRelatedObject: OpenRelatedObject;
};

const Required = () => <span aria-hidden="true" className="text-red-600">*</span>;
const INPUT = 'h-[42px] w-full rounded-lg border border-[#D3E1EC] bg-white px-[14px] text-[14px] outline-none focus:border-[#007EA7]';

export default function NewTaskForm({ session, organizations, organizationContext, task, onSave, onClose, onOpenRelatedObject }: Props) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    name: task?.name ?? '',
    type: task && (TASK_TYPES as readonly string[]).includes(task.type) ? task.type : '',
    organizationId: task?.organizationId ?? organizationContext?.id ?? '',
    assignedToId: task?.assignedToId ?? '',
    dueDate: task?.dueDate ?? '',
    reminder: task?.reminder ?? 'none',
    relatedObjectId: task?.relatedObject?.id ?? '',
    description: task?.message ?? '',
  }));
  const [related, setRelated] = useState<{ organizationId: string; rows: TaskRelatedObject[]; loading: boolean; error: string }>({ organizationId: '', rows: [], loading: false, error: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const organization = organizations.find(item => item.id === draft.organizationId);
  const assignees = organization ? loadTaskAssignees(organization) : [];
  const relatedObjects = related.organizationId === organization?.id ? related.rows : [];
  const context = { session, organizations, assignees, relatedObjects, organizationContextId: organizationContext?.id };
  const valid = Object.keys(validateTaskDraft(draft, context)).length === 0;
  const mayEdit = (candidate: AppSession) => task ? getTaskPermissions(task, candidate).edit : canEditMenu(candidate, 'notifications');
  const canSave = mayEdit(session) && valid && !saving;
  const title = task ? 'Edit task' : 'New task';
  const provenance = task ? getTaskProvenance(task) : {
    source: 'Manual', createdBy: session.fullName || session.email, createdByEmail: session.email, legacy: false,
  };

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    let disposed = false;
    if (!organization) { setRelated({ organizationId: '', rows: [], loading: false, error: '' }); return; }
    setRelated({ organizationId: organization.id, rows: [], loading: true, error: '' });
    void loadTaskRelatedObjects(organization, session).then(rows => {
      if (!disposed) setRelated({ organizationId: organization.id, rows, loading: false, error: '' });
    }).catch(() => {
      if (!disposed) setRelated({ organizationId: organization.id, rows: [], loading: false, error: 'Related objects could not be loaded. You can save a task without a related object.' });
    });
    return () => { disposed = true; };
  }, [organization, session]);

  const close = () => { if (!saving) onClose(); };
  return <div className="fixed inset-0 z-[140] flex justify-end bg-[#10233A]/10" onClick={close}>
    <form role="dialog" aria-modal="true" aria-label={title} className="flex h-full w-full max-w-[340px] flex-col overflow-y-auto border-l border-[#D3E1EC] bg-white p-6 font-montserrat text-[14px] text-[#10233A]" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape' && !(event.target instanceof HTMLElement && event.target.getAttribute('aria-expanded') === 'true')) close(); }} onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      setError(''); setSaving(true);
      try {
        const latestSession = parseSession(JSON.stringify(session));
        if (!latestSession || !mayEdit(latestSession) || !organization || !canAccessAssignedOrganization(organization, latestSession)) throw new Error('You no longer have permission to save a task for this organization.');
        const freshRelated = draft.relatedObjectId ? await loadTaskRelatedObjects(organization, latestSession) : [];
        const saveSession = parseSession(JSON.stringify(latestSession));
        if (!saveSession || !mayEdit(saveSession) || !canAccessAssignedOrganization(organization, saveSession)) throw new Error('You no longer have permission to save a task for this organization.');
        const saveContext = { ...context, session: saveSession, assignees: loadTaskAssignees(organization), relatedObjects: freshRelated };
        const record = task ? updateTaskRecord(task, draft, saveContext) : createTaskRecord(draft, saveContext);
        onSave(record);
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save task.'); setSaving(false); }
    }}>
      <header className="mb-6 flex items-center justify-between gap-3"><h2 className="text-[22px] font-semibold">{title}</h2><button type="button" disabled={saving} aria-label={task ? 'Close task editor' : 'Close new task'} onClick={close} className="text-[#7288A3] hover:text-[#007EA7]"><X size={20} /></button></header>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1"><span>Task name <Required /></span><input ref={nameRef} required aria-label="Task name" disabled={saving} className={INPUT} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <div className="flex flex-col gap-1"><span>Task type <Required /></span><SearchableSelect selectionIndicator="checkbox" ariaLabel="Task type" value={draft.type} options={[...TASK_TYPES]} placeholder="Select task type" disabled={saving} onChange={type => setDraft({ ...draft, type })} />{task && !(TASK_TYPES as readonly string[]).includes(task.type) && !draft.type && <p className="text-[12px] text-[#7288A3]">Select a task type to replace the previous classification.</p>}</div>
        <div className="flex flex-col gap-1"><span>Organization <Required /></span>{organizationContext
          ? <input aria-label="Organization" readOnly className={INPUT} style={{ backgroundColor: '#F5F5F5', color: '#7288A3' }} value={organization?.name ?? organizationContext.name} title={organization?.name ?? organizationContext.name} />
          : <SearchableSelect selectionIndicator="checkbox" ariaLabel="Organization" value={draft.organizationId} options={organizations.map(org => ({ value: org.id, label: org.name, description: org.company_code || undefined }))} placeholder="Select organization" disabled={saving} onChange={organizationId => { setDraft({ ...draft, organizationId, assignedToId: '', relatedObjectId: '' }); setError(''); }} />}</div>
        <div className="flex flex-col gap-1"><span>Assigned to <Required /></span><SearchableSelect selectionIndicator="checkbox" ariaLabel="Assigned to" value={draft.assignedToId} options={assignees.map(user => ({ value: user.id, label: user.name, description: `${user.audience} · ${user.email}` }))} placeholder="Select user" disabled={!organization || saving} emptyMessage="No active assigned users" onChange={assignedToId => setDraft({ ...draft, assignedToId })} />{!organization && <p className="text-[12px] text-[#7288A3]">Select an organization first.</p>}</div>
        <div className="flex flex-col gap-1"><span>Due date <Required /></span><fieldset disabled={saving} className="min-w-0"><ScheduleDatePicker value={draft.dueDate} onChange={dueDate => setDraft({ ...draft, dueDate })} ariaLabel="Due date" placeholder="YYYY-MM-DD" align="right" /></fieldset></div>
        <div className="flex flex-col gap-1"><span>Reminder <span className="text-[#7288A3]">(optional)</span></span><SearchableSelect selectionIndicator="checkbox" ariaLabel="Reminder" value={draft.reminder ?? 'none'} options={TASK_REMINDER_OPTIONS} disabled={saving} onChange={reminder => setDraft({ ...draft, reminder })} /></div>
        <div className="flex flex-col gap-1"><span>Related object <span className="text-[#7288A3]">(optional)</span></span><SearchableSelect selectionIndicator="checkbox" ariaLabel="Related object" value={draft.relatedObjectId} options={[{ value: '', label: 'None' }, ...relatedObjects.map(object => ({ value: object.id, label: object.label, description: object.type }))]} placeholder={related.loading ? 'Loading…' : 'Select related object'} disabled={!organization || related.loading || saving} onChange={relatedObjectId => setDraft({ ...draft, relatedObjectId })} />{related.error && <p className="text-[12px] text-[#7288A3]">{related.error}</p>}</div>
        {relatedObjects.filter(object => object.id === draft.relatedObjectId).map(object => <RelatedObjectLink key={object.id} object={object} organizationId={draft.organizationId} onOpen={onOpenRelatedObject} onError={setError} />)}
        <label className="flex flex-col gap-1"><span>Description <span className="text-[#7288A3]">(optional)</span></span><textarea aria-label="Description" rows={3} disabled={saving} className="w-full resize-y rounded-lg border border-[#D3E1EC] p-3 outline-none focus:border-[#007EA7]" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        {task && <div className="flex flex-col gap-1"><span>Status</span><p aria-label="Task status" className="py-2">{getTaskStatus(task)}</p></div>}
        <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg bg-[#F8FDFF] p-3 text-[12px]"><dt className="text-[#7288A3]">Source</dt><dd>{provenance.source}</dd><dt className="text-[#7288A3]">Created by</dt><dd className="break-words" title={provenance.createdByEmail}>{provenance.createdBy}</dd></dl>
      </div>
      {error && <p role="alert" className="mt-4 text-[12px] text-red-600">{error}</p>}
      <footer className="mt-6 flex justify-end gap-2"><PageActionButton disabled={saving} onClick={close}>Cancel</PageActionButton><button type="submit" disabled={!canSave} className="flex h-8 items-center justify-center rounded-md border-2 border-[#D3E1EC] px-3 font-semibold text-[#7288A3] hover:border-[#A1B6C6] active:border-[#007EA7] active:bg-[#007EA7] active:text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button></footer>
    </form>
  </div>;
}
