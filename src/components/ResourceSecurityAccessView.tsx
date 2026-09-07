import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { PageHeader } from './PageHeader';
import OcrSearchField from './OcrSearchField';
import RefreshAllButton from './RefreshAllButton';
import HorizontalTableScrollbar from './HorizontalTableScrollbar';
import TablePagination from './TablePagination';
import { getAdministrationGroupNames } from './AutomationSecurityAccessView';

export interface SecurityAccessTarget {
  module: string;
  resourceType: string;
  id: string;
  name: string;
}

interface SecurityRule {
  id: string;
  group: string;
  canView: boolean;
  permissions: string[];
}

const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ACTION'];

function storageKey(target: SecurityAccessTarget) {
  return `finansu-harmonija-v6:security-access:${target.module}:${target.resourceType}:${target.id}`;
}

function loadRules(target: SecurityAccessTarget): SecurityRule[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(target)) ?? '[]') as SecurityRule[];
  } catch {
    return [];
  }
}

function SquareCheck({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] border ${checked ? 'border-[#007EA7] bg-[#007EA7]' : 'border-[#A1B6C6] bg-white'}`}>
      {checked && <Check size={12} className="text-white" />}
    </span>
  );
}

export default function ResourceSecurityAccessView({ target, onBack }: { target: SecurityAccessTarget; onBack: () => void }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [rules, setRules] = useState<SecurityRule[]>(() => loadRules(target));
  const [query, setQuery] = useState('');
  const groups = getAdministrationGroupNames();

  const filteredGroups = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? groups.filter(group => group.toLowerCase().includes(value)) : groups;
  }, [groups, query]);

  const persist = (next: SecurityRule[]) => {
    setRules(next);
    localStorage.setItem(storageKey(target), JSON.stringify(next));
  };

  const findRule = (group: string) => rules.find(rule => rule.group === group);

  const toggleGroup = (group: string) => {
    const existing = findRule(group);
    if (existing) {
      persist(rules.filter(rule => rule.group !== group));
      return;
    }
    persist([...rules, { id: `${target.id}:${group}`, group, canView: true, permissions: ['READ'] }]);
  };

  const updateRule = (group: string, updater: (rule: SecurityRule) => SecurityRule) => {
    persist(rules.map(rule => rule.group === group ? updater(rule) : rule));
  };

  const togglePermission = (group: string, action: string) => {
    updateRule(group, rule => ({
      ...rule,
      permissions: rule.permissions.includes(action)
        ? rule.permissions.filter(permission => permission !== action)
        : [...rule.permissions, action],
    }));
  };

  return (
    <div className="flex min-h-full flex-col gap-8 bg-white px-9 py-14" style={{ paddingLeft: 'clamp(24px, 5vw, 72px)', paddingRight: 'clamp(24px, 5vw, 72px)' }}>
      <PageHeader
        title={`Security access — ${target.name}`}
        leading={<button type="button" aria-label="Back" onClick={onBack} className="text-[#7288A3] hover:text-[#007EA7]"><ArrowLeft size={20} /></button>}
      />

      <div className="flex flex-wrap items-center gap-2 font-montserrat text-[12px] font-medium">
        <span className="text-[#7288A3]">OCR</span><span className="text-[#A1B6C6]">/</span>
        <span className="text-[#7288A3]">Administration</span><span className="text-[#A1B6C6]">/</span>
        <span className="text-[#7288A3]">Group Management</span><span className="text-[#A1B6C6]">/</span>
        <span className="text-[#A1B6C6]">{target.resourceType}: {target.name}</span>
      </div>

      <div className="rounded-lg border border-[#E5EDF9] bg-[#F8FDFF] px-4 py-3">
        <div className="font-montserrat text-[12px] font-semibold text-[#10233A]">Protected record</div>
        <div className="mt-1 font-montserrat text-[12px] text-[#7288A3]">{target.module} / {target.resourceType} / {target.name}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <OcrSearchField ariaLabel="Search groups" value={query} onChange={setQuery} />
        <RefreshAllButton onRefresh={() => setRules(loadRules(target))} />
      </div>

      <div className="flex min-h-[420px] flex-1 flex-col gap-6">
        <div ref={tableRef} className="min-h-[420px] w-full overflow-x-auto scrollbar-hide">
          <div className="min-w-[1060px]">
            <div className="grid h-10 grid-cols-[52px_290px_170px_1fr] items-center border-b border-[#E5EDF9] px-3 font-montserrat text-[12px] font-medium text-[#7288A3]">
              <span /><span className="text-[#10233A]">Group</span><span>Can view</span><span>Permissions for this record</span>
            </div>

            {filteredGroups.map((group, index) => {
              const rule = findRule(group);
              const assigned = Boolean(rule);
              return (
                <div key={group} className={`grid min-h-12 grid-cols-[52px_290px_170px_1fr] items-center rounded-lg px-3 py-2 ${index % 2 ? 'bg-white' : 'bg-[#F8FDFF]'}`}>
                  <button type="button" role="checkbox" aria-checked={assigned} aria-label={`Assign ${group} to ${target.name}`} onClick={() => toggleGroup(group)} className="flex h-8 items-center">
                    <SquareCheck checked={assigned} />
                  </button>
                  <button type="button" onClick={() => toggleGroup(group)} className="truncate text-left font-montserrat text-[12px] font-medium text-[#10233A]">{group}</button>
                  <button
                    type="button"
                    role="checkbox"
                    disabled={!rule}
                    aria-checked={rule?.canView ?? false}
                    aria-label={`${group} can view ${target.name}`}
                    onClick={() => rule && updateRule(group, current => ({ ...current, canView: !current.canView }))}
                    className="flex items-center gap-2 text-left font-montserrat text-[12px] text-[#10233A] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <SquareCheck checked={rule?.canView ?? false} />
                    {rule?.canView ? 'Allowed' : 'Denied'}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS.map(action => {
                      const checked = rule?.permissions.includes(action) ?? false;
                      return (
                        <button
                          key={action}
                          type="button"
                          role="checkbox"
                          disabled={!rule}
                          aria-checked={checked}
                          aria-label={`${action} permission for ${group}`}
                          onClick={() => rule && togglePermission(group, action)}
                          className={`flex h-8 items-center gap-2 rounded-md border px-2.5 font-montserrat text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${checked ? 'border-[#8CC7DB] bg-[#E7F4F9] text-[#007EA7]' : 'border-[#D3E1EC] bg-white text-[#7288A3]'}`}
                        >
                          <SquareCheck checked={checked} />{action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <HorizontalTableScrollbar scrollRef={tableRef} />
        <div>
          <TablePagination currentPage={1} totalPages={1} itemCount={filteredGroups.length} onPageChange={() => undefined} />
        </div>
      </div>
    </div>
  );
}
