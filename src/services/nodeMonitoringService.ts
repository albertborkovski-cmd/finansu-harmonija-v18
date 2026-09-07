export type NodeAvailabilityStatus = 'Available' | 'Inactive' | 'Stopping' | 'Down';
export type NodeFeatureStatus = 'Enabled' | 'Disabled';

export interface NodeFeatureMonitoring {
  name: string;
  status: NodeFeatureStatus;
  healthy?: boolean;
  description?: string;
  configuration?: Record<string, unknown>;
}

export interface NodeMonitoringData {
  nodeId: string;
  nodeName: string;
  status: NodeAvailabilityStatus;
  version: string;
  cpu: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  ipAddresses: string[];
  features: NodeFeatureMonitoring[];
  updatedAt: string;
  source: 'api' | 'local';
}

export interface NodeMonitoringRequest {
  id: string;
  name: string;
  status: NodeAvailabilityStatus;
  description: string;
  capabilities: string;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function featureStatus(value: unknown, fallback: NodeFeatureStatus): NodeFeatureStatus {
  return String(value).toLowerCase() === 'enabled'
    ? 'Enabled'
    : String(value).toLowerCase() === 'disabled'
      ? 'Disabled'
      : fallback;
}

function availabilityStatus(value: unknown, fallback: NodeAvailabilityStatus): NodeAvailabilityStatus {
  const normalized = String(value).toLowerCase();
  return normalized === 'available'
    ? 'Available'
    : normalized === 'inactive'
      ? 'Inactive'
      : normalized === 'stopping'
        ? 'Stopping'
        : normalized === 'down'
          ? 'Down'
      : fallback;
}

function monitoringApiRoot(): string {
  return String(import.meta.env.VITE_NODE_MONITORING_API_URL ?? '').trim().replace(/\/+$/, '');
}

const LOCAL_FEATURES_KEY = 'finansu-harmonija-v6:node-feature-statuses';
const LOCAL_FEATURE_CONFIGURATIONS_KEY = 'finansu-harmonija-v6:node-feature-configurations';

function readLocalFeatureStatuses(): Record<string, Record<string, NodeFeatureStatus>> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_FEATURES_KEY) ?? '{}') as Record<string, Record<string, NodeFeatureStatus>>;
  } catch {
    return {};
  }
}

function saveLocalFeatureStatus(nodeId: string, featureName: string, status: NodeFeatureStatus) {
  if (typeof window === 'undefined') return;
  const stored = readLocalFeatureStatuses();
  stored[nodeId] = { ...(stored[nodeId] ?? {}), [featureName]: status };
  window.localStorage.setItem(LOCAL_FEATURES_KEY, JSON.stringify(stored));
}

function readLocalFeatureConfigurations(): Record<string, Record<string, Record<string, unknown>>> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_FEATURE_CONFIGURATIONS_KEY) ?? '{}') as Record<string, Record<string, Record<string, unknown>>>;
  } catch {
    return {};
  }
}

function applyLocalFeatureStatuses(nodeId: string, features: NodeFeatureMonitoring[]): NodeFeatureMonitoring[] {
  const statuses = readLocalFeatureStatuses()[nodeId] ?? {};
  const configurations = readLocalFeatureConfigurations()[nodeId] ?? {};
  return features.map(feature => {
    const status = statuses[feature.name] ?? feature.status;
    return { ...feature, status, configuration: configurations[feature.name] ?? feature.configuration, healthy: status === 'Enabled' ? feature.healthy ?? true : false };
  });
}

function normalizeFeatureList(payload: unknown, fallback: NodeFeatureMonitoring[]): NodeFeatureMonitoring[] {
  const rawFeatures = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).features)
      ? (payload as Record<string, unknown>).features as unknown[]
      : payload && typeof payload === 'object' && ('name' in payload || 'code' in payload)
        ? [payload]
      : [];
  const fallbackByName = new Map(fallback.map(feature => [feature.name, feature]));

  if (rawFeatures.length === 0) return fallback.map(feature => ({ ...feature }));

  return rawFeatures
    .filter(feature => feature && typeof feature === 'object')
    .map(feature => {
      const raw = feature as Record<string, unknown>;
      const name = String(raw.name ?? raw.code ?? '').trim() || 'UNKNOWN';
      const defaultFeature = fallbackByName.get(name);
      return {
        name,
        status: featureStatus(raw.status ?? raw.enabled, defaultFeature?.status ?? 'Disabled'),
        healthy: raw.healthy === undefined ? defaultFeature?.healthy : Boolean(raw.healthy),
        description: String(raw.description ?? raw.message ?? defaultFeature?.description ?? ''),
        configuration: raw.configuration && typeof raw.configuration === 'object' && !Array.isArray(raw.configuration)
          ? raw.configuration as Record<string, unknown>
          : defaultFeature?.configuration,
      };
    });
}

/**
 * Local deterministic adapter used when a monitoring API is not configured.
 * Every value is derived from the selected node, so different records already
 * demonstrate the same data flow that the real API adapter uses.
 */
export function createLocalNodeMonitoring(request: NodeMonitoringRequest): NodeMonitoringData {
  const numericId = Math.max(1, Number.parseInt(request.id, 10) || 1);
  const hasSelenium = /selenium/i.test(`${request.description} ${request.capabilities}`);
  const hasApRun = /ap_run/i.test(request.description);
  const totalMemoryMb = 512 + numericId * 56;
  const usedMemoryMb = request.status === 'Available' ? 62.41 + (numericId - 1) * 4.25 : 0;
  const freeMemoryMb = Math.max(0, totalMemoryMb - usedMemoryMb);

  return {
    nodeId: request.id,
    nodeName: request.name,
    status: request.status,
    version: `3.2.0-${109371 + numericId}`,
    cpu: numericId <= 3 ? 16 : 8,
    totalMemoryMb,
    freeMemoryMb: Number(freeMemoryMb.toFixed(2)),
    ipAddresses: [`172.23.0.${21 + numericId}`],
    updatedAt: new Date().toISOString(),
    source: 'local',
    features: [
      {
        name: 'AP_RUN',
        status: hasApRun ? 'Enabled' : 'Disabled',
        description: hasApRun
          ? 'Running in all AP run mode. AP: 0 active for 30 target capacity. Tasks: 0 active for 1 target capacity.'
          : 'AP run mode is not enabled for this node.',
        configuration: { mode: 'all', apTargetCapacity: 30, taskTargetCapacity: 1 },
      },
      {
        name: 'SELENIUM_DIRECT',
        status: hasSelenium ? 'Enabled' : 'Disabled',
        healthy: hasSelenium && request.status === 'Available',
        description: hasSelenium ? 'Enabled' : 'Disabled',
        configuration: { downloadFromLocalStorage: true },
      },
      {
        name: 'SELENIUM_STANDALONE',
        status: 'Disabled',
        configuration: { port: 4444 },
      },
    ],
  };
}

function normalizeApiResponse(payload: unknown, fallback: NodeMonitoringData): NodeMonitoringData {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Node monitoring API returned an invalid response.');
  }

  const data = payload as Record<string, unknown>;
  const rawFeatures = Array.isArray(data.features) ? data.features : [];
  const fallbackByName = new Map(fallback.features.map(feature => [feature.name, feature]));
  const features = rawFeatures.length
    ? rawFeatures
        .filter(feature => feature && typeof feature === 'object')
        .map(feature => {
          const raw = feature as Record<string, unknown>;
          const name = String(raw.name ?? raw.code ?? '').trim();
          const defaultFeature = fallbackByName.get(name);
          return {
            name: name || 'UNKNOWN',
            status: featureStatus(raw.status ?? raw.enabled, defaultFeature?.status ?? 'Disabled'),
            healthy: raw.healthy === undefined ? defaultFeature?.healthy : Boolean(raw.healthy),
            description: String(raw.description ?? raw.message ?? defaultFeature?.description ?? ''),
            configuration: raw.configuration && typeof raw.configuration === 'object' && !Array.isArray(raw.configuration)
              ? raw.configuration as Record<string, unknown>
              : defaultFeature?.configuration,
          };
        })
    : fallback.features;

  const rawAddresses = data.ipAddresses ?? data.ip_addresses ?? data.addresses;
  const ipAddresses = Array.isArray(rawAddresses)
    ? rawAddresses.map(String).filter(Boolean)
    : typeof rawAddresses === 'string'
      ? rawAddresses.split(',').map(value => value.trim()).filter(Boolean)
      : fallback.ipAddresses;

  return {
    nodeId: String(data.nodeId ?? data.node_id ?? data.id ?? fallback.nodeId),
    nodeName: String(data.nodeName ?? data.node_name ?? data.name ?? fallback.nodeName),
    status: availabilityStatus(data.status ?? data.nodeStatus ?? data.node_status, fallback.status),
    version: String(data.version ?? data.agentVersion ?? data.agent_version ?? fallback.version),
    cpu: numberValue(data.cpu ?? data.cpuCount ?? data.cpu_count, fallback.cpu),
    totalMemoryMb: numberValue(data.totalMemoryMb ?? data.total_memory_mb ?? data.totalMemory, fallback.totalMemoryMb),
    freeMemoryMb: numberValue(data.freeMemoryMb ?? data.free_memory_mb ?? data.freeMemory, fallback.freeMemoryMb),
    ipAddresses,
    features,
    updatedAt: String(data.updatedAt ?? data.updated_at ?? new Date().toISOString()),
    source: 'api',
  };
}

/**
 * Set VITE_NODE_MONITORING_API_URL to the API root, for example:
 * https://example.com/api
 *
 * The service requests:
 * GET {VITE_NODE_MONITORING_API_URL}/nodes/{nodeId}/monitoring
 */
export async function getNodeMonitoring(
  request: NodeMonitoringRequest,
  signal?: AbortSignal,
): Promise<NodeMonitoringData> {
  const fallback = createLocalNodeMonitoring(request);
  const apiRoot = monitoringApiRoot();

  if (!apiRoot) {
    await Promise.resolve();
    return fallback;
  }

  const response = await fetch(`${apiRoot}/nodes/${encodeURIComponent(request.id)}/monitoring`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Node monitoring request failed (${response.status}).`);
  }

  return normalizeApiResponse(await response.json(), fallback);
}

/**
 * Feature data is intentionally loaded through its own API route so the
 * Features tab is the source of truth. The General tab only renders the
 * shared feature state maintained by the caller.
 *
 * GET {VITE_NODE_MONITORING_API_URL}/nodes/{nodeId}/features
 */
export async function getNodeFeatures(
  request: NodeMonitoringRequest,
  signal?: AbortSignal,
): Promise<NodeFeatureMonitoring[]> {
  const fallback = createLocalNodeMonitoring(request).features;
  const apiRoot = monitoringApiRoot();

  if (!apiRoot) {
    await Promise.resolve();
    return applyLocalFeatureStatuses(request.id, fallback);
  }

  const response = await fetch(`${apiRoot}/nodes/${encodeURIComponent(request.id)}/features`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Node features request failed (${response.status}).`);
  }

  return applyLocalFeatureStatuses(request.id, normalizeFeatureList(await response.json(), fallback));
}

/** PATCH .../nodes/{nodeId}/features/{featureName} */
export async function updateNodeFeatureStatus(
  nodeId: string,
  featureName: string,
  status: NodeFeatureStatus,
): Promise<NodeFeatureMonitoring> {
  // Keep the user's STOP/ENABLE action stable immediately. The API response
  // can enrich the row, but a later monitoring refresh must not undo it.
  saveLocalFeatureStatus(nodeId, featureName, status);
  const apiRoot = monitoringApiRoot();
  if (!apiRoot) {
    await Promise.resolve();
    return { name: featureName, status, healthy: status === 'Enabled' };
  }

  const response = await fetch(`${apiRoot}/nodes/${encodeURIComponent(nodeId)}/features/${encodeURIComponent(featureName)}`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error(`Node feature update failed (${response.status}).`);
  }

  const [updated] = normalizeFeatureList(await response.json(), [{ name: featureName, status }]);
  saveLocalFeatureStatus(nodeId, featureName, updated.status);
  return updated;
}

/** PATCH .../nodes/{nodeId}/features/{featureName}/configuration */
export async function updateNodeFeatureConfiguration(
  nodeId: string,
  featureName: string,
  configuration: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiRoot = monitoringApiRoot();
  if (!apiRoot) {
    await Promise.resolve();
    if (typeof window !== 'undefined') {
      const stored = readLocalFeatureConfigurations();
      stored[nodeId] = { ...(stored[nodeId] ?? {}), [featureName]: configuration };
      window.localStorage.setItem(LOCAL_FEATURE_CONFIGURATIONS_KEY, JSON.stringify(stored));
    }
    return configuration;
  }

  const response = await fetch(`${apiRoot}/nodes/${encodeURIComponent(nodeId)}/features/${encodeURIComponent(featureName)}/configuration`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuration }),
  });

  if (!response.ok) {
    throw new Error(`Node feature configuration update failed (${response.status}).`);
  }

  const payload = await response.json();
  const raw = payload && typeof payload === 'object' && 'configuration' in payload
    ? (payload as Record<string, unknown>).configuration
    : payload;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : configuration;
}

/** POST .../nodes/{nodeId}/features/redo with the selected feature names. */
export async function redoNodeFeatures(nodeId: string, featureNames: string[]): Promise<void> {
  const apiRoot = monitoringApiRoot();
  if (!apiRoot) {
    await Promise.resolve();
    if (typeof window !== 'undefined') {
      const stored = readLocalFeatureStatuses();
      const current = { ...(stored[nodeId] ?? {}) };
      featureNames.forEach(featureName => { current[featureName] = 'Enabled'; });
      stored[nodeId] = current;
      window.localStorage.setItem(LOCAL_FEATURES_KEY, JSON.stringify(stored));
    }
    return;
  }

  const response = await fetch(`${apiRoot}/nodes/${encodeURIComponent(nodeId)}/features/redo`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ features: featureNames }),
  });

  if (!response.ok) {
    throw new Error(`Node features redo failed (${response.status}).`);
  }
}
