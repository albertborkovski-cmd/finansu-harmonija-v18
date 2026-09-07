export interface WorkspaceHumanCorrection {
  taskId: string;
  runId: string;
  savedAt: string;
  saveCount: number;
}

const STORAGE_KEY = 'finansu-harmonija-v6:workspace-human-corrections';
const CHANGE_EVENT = 'finansu-harmonija:human-corrections-changed';

function readCorrections(): WorkspaceHumanCorrection[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as WorkspaceHumanCorrection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordWorkspaceHumanCorrection(taskId: string, runId: string) {
  if (typeof window === 'undefined') return;
  const corrections = readCorrections();
  const existingIndex = corrections.findIndex(correction => correction.taskId === taskId);
  const nextCorrection: WorkspaceHumanCorrection = {
    taskId,
    runId,
    savedAt: new Date().toISOString(),
    saveCount: existingIndex >= 0 ? corrections[existingIndex].saveCount + 1 : 1,
  };
  if (existingIndex >= 0) corrections[existingIndex] = nextCorrection;
  else corrections.push(nextCorrection);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: nextCorrection }));
}

export function getWorkspaceHumanCorrectionCount(runId?: string) {
  const corrections = readCorrections();
  return runId ? corrections.filter(correction => correction.runId === runId).length : corrections.length;
}

export function subscribeToWorkspaceHumanCorrections(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
