import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';

export interface ModelRecord {
  id: string;
  name: string;
  description: string;
  usage: number;
  platform: string;
  updatedAt: string;
  status: 'Active' | 'Draft';
}

export const INITIAL_MODELS: ModelRecord[] = [
  { id: 'model-1', name: 'demo.catering.mailbox', description: 'IE HTML Invoice', usage: 86, platform: 'RPA platform', updatedAt: '10.04.2026 12:22', status: 'Active' },
  { id: 'model-2', name: 'invoice-information-extraction', description: 'IDP Sample invoice information extraction model', usage: 74, platform: 'RPA platform', updatedAt: '09.04.2026 16:08', status: 'Active' },
  { id: 'model-3', name: 'receipt-reader-eu', description: 'Receipt fields and totals extraction', usage: 53, platform: 'ML platform', updatedAt: '08.04.2026 09:14', status: 'Draft' },
  { id: 'model-4', name: 'contract-classifier', description: 'Contract document classification', usage: 41, platform: 'ML platform', updatedAt: '07.04.2026 18:05', status: 'Active' },
];

const STORAGE_KEY = 'finansu-harmonija-v6-model-catalog';
const listeners = new Set<() => void>();

function loadModels(): ModelRecord[] {
  if (typeof window === 'undefined') return INITIAL_MODELS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : INITIAL_MODELS;
  } catch {
    return INITIAL_MODELS;
  }
}

let modelCatalog = loadModels();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return modelCatalog;
}

function updateModelCatalog(update: SetStateAction<ModelRecord[]>) {
  modelCatalog = typeof update === 'function' ? update(modelCatalog) : update;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modelCatalog));
  } catch {
    // The in-memory catalog still keeps Models and Train model synchronized.
  }
  listeners.forEach((listener) => listener());
}

export function useModelCatalog() {
  const models = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setModels = useCallback((update: SetStateAction<ModelRecord[]>) => updateModelCatalog(update), []);
  return [models, setModels] as const;
}
