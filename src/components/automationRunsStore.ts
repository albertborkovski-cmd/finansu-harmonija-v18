export const RUN_STATUSES = [
  'Submitted',
  'Failed',
  'Completed',
  'In Progress',
  'Stopped',
  'Stopped Idle',
  'Queued',
  'Deploying on Node',
  'Stopping',
] as const;

export type RunStatus = typeof RUN_STATUSES[number];

export interface RunRecord {
  id: string;
  tasks: number;
  status: RunStatus;
  node: string;
  created: string;
  processId?: string;
  processName?: string;
}

export interface AutomationProcessReference {
  id: string;
  name: string;
}

export interface AggregatedRun extends RunRecord {
  processId: string;
  processName: string;
}

const RUNS_STORAGE_KEY = 'finansu-harmonija-v4:automation-process-runs';
const PROCESS_STORAGE_KEY = 'finansu-harmonija-v4:automation-processes';

const FALLBACK_PROCESSES: AutomationProcessReference[] = [
  { id: '1', name: 'IDP' },
  { id: '2', name: 'IDP' },
  { id: '3', name: 'IDP' },
  { id: '4', name: 'IDP' },
];

const DEFAULT_RUNS: RunRecord[] = [
  { id: 'RUN-001', tasks: 12, status: 'In Progress', node: 'Node-01', created: '10.04.2026 12:22' },
  { id: 'RUN-002', tasks: 8, status: 'Completed', node: 'Node-02', created: '10.04.2026 11:45' },
  { id: 'RUN-003', tasks: 5, status: 'Failed', node: 'Node-01', created: '09.04.2026 16:30' },
  { id: 'RUN-004', tasks: 20, status: 'Stopped', node: 'Node-03', created: '09.04.2026 14:10' },
];

function normalizeRunStatus(status: unknown): RunStatus {
  if (status === 'Started') return 'In Progress';
  return RUN_STATUSES.includes(status as RunStatus) ? status as RunStatus : 'Submitted';
}

function normalizeRun(run: RunRecord): RunRecord {
  return { ...run, status: normalizeRunStatus(run.status) };
}

function cloneDefaultRuns(): RunRecord[] {
  return DEFAULT_RUNS.map(normalizeRun);
}

function formatRunId(value: number) {
  return `RUN-${String(value).padStart(3, '0')}`;
}

function readRunsMap(): Record<string, RunRecord[]> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(RUNS_STORAGE_KEY) ?? '{}') as Record<string, RunRecord[]>;
  } catch {
    return {};
  }
}

function writeRunsMap(value: Record<string, RunRecord[]>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('finansu-harmonija:runs-changed'));
}

export function getAutomationProcesses(): AutomationProcessReference[] {
  if (typeof window === 'undefined') return FALLBACK_PROCESSES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROCESS_STORAGE_KEY) ?? 'null') as Array<{ id?: string; name?: string }> | null;
    if (!Array.isArray(stored)) return FALLBACK_PROCESSES;
    const processes = stored
      .filter(process => process.id && process.name)
      .map(process => ({ id: String(process.id), name: String(process.name) }));
    const seenIds = new Set<string>();
    return processes.filter(process => {
      if (seenIds.has(process.id)) return false;
      seenIds.add(process.id);
      return true;
    });
  } catch {
    return FALLBACK_PROCESSES;
  }
}

function getDefaultRunsForProcess(processId: string, processes: AutomationProcessReference[]): RunRecord[] {
  const processIndex = Math.max(0, processes.findIndex(process => process.id === processId));
  const offset = processIndex * DEFAULT_RUNS.length;
  return cloneDefaultRuns().map((run, index) => ({ ...run, id: formatRunId(offset + index + 1) }));
}

function getCompleteRunsMap() {
  const processes = getAutomationProcesses();
  const stored = readRunsMap();
  const complete: Record<string, RunRecord[]> = {};
  let hasNormalizedStatuses = false;

  processes.forEach(process => {
    const processRuns = stored[process.id];
    if (Array.isArray(processRuns)) {
      complete[process.id] = processRuns.map(run => {
        const normalized = normalizeRun(run);
        if (normalized.status !== run.status) hasNormalizedStatuses = true;
        return normalized;
      });
    } else {
      complete[process.id] = getDefaultRunsForProcess(process.id, processes);
    }
  });

  const seenIds = new Set<string>();
  const hasDuplicateIds = processes.some(process => complete[process.id].some(run => {
    if (seenIds.has(run.id)) return true;
    seenIds.add(run.id);
    return false;
  }));

  if (!hasDuplicateIds) {
    if (hasNormalizedStatuses) writeRunsMap(complete);
    return complete;
  }

  let nextId = 1;
  processes.forEach(process => {
    const runs = complete[process.id];
    const order = runs
      .map((run, index) => ({ index, value: Number(run.id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER) }))
      .sort((left, right) => left.value - right.value || left.index - right.index);
    const assignedIds = new Map<number, string>();
    order.forEach(({ index }) => assignedIds.set(index, formatRunId(nextId++)));
    complete[process.id] = runs.map((run, index) => ({ ...run, id: assignedIds.get(index) ?? formatRunId(nextId++) }));
  });
  writeRunsMap(complete);
  return complete;
}

export function getProcessRuns(processId: string): RunRecord[] {
  const processes = getAutomationProcesses();
  const runs = getCompleteRunsMap()[processId];
  return Array.isArray(runs) ? runs.map(run => ({ ...run })) : getDefaultRunsForProcess(processId, processes);
}

export function getNextGlobalRunId(): string {
  const largestId = Object.values(getCompleteRunsMap()).flat().reduce((largest, run) => {
    const value = Number(run.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(largest, value);
  }, 0);
  return formatRunId(largestId + 1);
}

export function saveProcessRuns(processId: string, runs: RunRecord[]) {
  const stored = readRunsMap();
  stored[processId] = runs.map(normalizeRun);
  writeRunsMap(stored);
}

export function getAggregatedRuns(): AggregatedRun[] {
  const runsMap = getCompleteRunsMap();
  const aggregated = getAutomationProcesses().flatMap(process =>
    (runsMap[process.id] ?? []).map(run => ({
      ...run,
      processId: process.id,
      processName: process.name,
    })),
  );
  const seenRuns = new Set<string>();
  return aggregated.filter(run => {
    const key = `${run.processId}:${run.id}`;
    if (seenRuns.has(key)) return false;
    seenRuns.add(key);
    return true;
  });
}

export function updateAggregatedRun(processId: string, runId: string, update: (run: RunRecord) => RunRecord) {
  saveProcessRuns(processId, getProcessRuns(processId).map(run => run.id === runId ? update(run) : run));
}

export function deleteAggregatedRuns(keys: Array<{ processId: string; runId: string }>) {
  const grouped = new Map<string, Set<string>>();
  keys.forEach(({ processId, runId }) => {
    const ids = grouped.get(processId) ?? new Set<string>();
    ids.add(runId);
    grouped.set(processId, ids);
  });
  grouped.forEach((ids, processId) => {
    saveProcessRuns(processId, getProcessRuns(processId).filter(run => !ids.has(run.id)));
  });
}
