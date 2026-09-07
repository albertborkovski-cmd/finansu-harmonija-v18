const NODE_NAMES_STORAGE_KEY = 'finansu-harmonija-v6:node-names';

const DEFAULT_NODE_NAMES = ['LX 1', 'LX 2', 'LX 3', 'LX 4', 'LX 5', 'LX 6', 'LX 7', 'LX 8'];

export function getNodeNames(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_NODE_NAMES];
  try {
    const stored = JSON.parse(window.localStorage.getItem(NODE_NAMES_STORAGE_KEY) ?? 'null');
    return Array.isArray(stored) && stored.length > 0
      ? stored.map(String).filter(Boolean)
      : [...DEFAULT_NODE_NAMES];
  } catch {
    return [...DEFAULT_NODE_NAMES];
  }
}

export function saveNodeNames(names: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NODE_NAMES_STORAGE_KEY, JSON.stringify([...new Set(names.filter(Boolean))]));
  window.dispatchEvent(new CustomEvent('finansu-harmonija:nodes-changed'));
}
