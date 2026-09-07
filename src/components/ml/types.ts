export interface DocumentSet {
  id: string;
  name: string;
  description: string;
  platform: string;
  date: string;
  documentType?: string;
  documentProcessor?: string;
  trainingModel?: string;
  executionModel?: string;
  settings?: string;
  zipFile?: string;
}

export interface DocumentEntry {
  id: string;
  name: string;
  status: 'success' | 'pending' | 'error' | 'processing';
}

export interface DocumentTypeEntry {
  id: string;
  name: string;
  description: string;
}

export interface LogEntry {
  id: string;
  name: string;
  description: string;
  status: 'success' | 'error' | 'warning' | 'info';
  date: string;
}

export interface StatMetric {
  label: string;
  value: string | null;
}

export type DetailTab = 'general' | 'documents' | 'document-types' | 'logs' | 'stats';
