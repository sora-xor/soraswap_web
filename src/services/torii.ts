import type {
  AccountAssetPage,
  AccountTransactionPage,
  ApiVersions,
  BridgeFinalityBundleResponse,
  BridgeFinalityProofResponse,
  ConnectStatus,
  ContractInstancesResponse,
  ExplorerMetrics,
  NodeCapabilities,
  PipelineStatusPollResult,
  PipelineStatusScope,
  PipelineTransactionKind,
  PipelineTransactionStatusResponse,
  SccpBurnProofResponse,
  SccpGovernanceProofResponse
} from '@/types';
import { readResponseMessage } from '@/services/norito';

const encodePathSegment = (value: string) => encodeURIComponent(value.trim());

const buildUrl = (baseUrl: string, path: string, params?: Record<string, string | number | boolean | undefined>) => {
  const url = new URL(path, `${baseUrl}/`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
  }
  return (await response.json()) as T;
};

const sleep = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const parseApiVersionHeaders = (headers: Headers): ApiVersions => {
  const currentVersion = headers.get('x-iroha-api-version')?.trim() || undefined;
  const supportedVersions = headers
    .get('x-iroha-api-supported')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    current_version: currentVersion,
    default_version: currentVersion,
    supported_versions: supportedVersions?.length ? supportedVersions : currentVersion ? [currentVersion] : undefined
  };
};

export const isPipelineStatusComplete = (
  kind: PipelineTransactionKind,
  acceptCommitted = false
) => kind === 'Applied' || kind === 'Rejected' || kind === 'Expired' || (acceptCommitted && kind === 'Committed');

export const toriiClient = {
  async fetchApiVersions(baseUrl: string) {
    const response = await fetch(buildUrl(baseUrl, '/v1/api/versions'), {
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as ApiVersions;
    }

    return parseApiVersionHeaders(response.headers);
  },

  fetchConnectStatus(baseUrl: string) {
    return fetchJson<ConnectStatus>(buildUrl(baseUrl, '/v1/connect/status'));
  },

  fetchNodeCapabilities(baseUrl: string) {
    return fetchJson<NodeCapabilities>(buildUrl(baseUrl, '/v1/node/capabilities'));
  },

  fetchExplorerMetrics(baseUrl: string) {
    return fetchJson<ExplorerMetrics>(buildUrl(baseUrl, '/v1/explorer/metrics'));
  },

  fetchContractInstances(baseUrl: string, dataspace: string) {
    return fetchJson<ContractInstancesResponse>(
      buildUrl(baseUrl, `/v1/contracts/instances/${encodePathSegment(dataspace)}`)
    );
  },

  fetchAccountAssets(baseUrl: string, accountId: string, limit = 24) {
    return fetchJson<AccountAssetPage>(
      buildUrl(baseUrl, `/v1/accounts/${encodePathSegment(accountId)}/assets`, { limit })
    );
  },

  fetchAccountTransactions(baseUrl: string, accountId: string, limit = 24) {
    return fetchJson<AccountTransactionPage>(
      buildUrl(baseUrl, `/v1/accounts/${encodePathSegment(accountId)}/transactions`, { limit })
    );
  },

  async fetchBridgeFinality(baseUrl: string, height: number) {
    const response = await fetch(buildUrl(baseUrl, `/v1/bridge/finality/${height}`), {
      headers: {
        Accept: 'application/json'
      }
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }
    return (await response.json()) as BridgeFinalityProofResponse;
  },

  async fetchBridgeFinalityBundle(baseUrl: string, height: number) {
    const response = await fetch(buildUrl(baseUrl, `/v1/bridge/finality/bundle/${height}`), {
      headers: {
        Accept: 'application/json'
      }
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }
    return (await response.json()) as BridgeFinalityBundleResponse;
  },

  async fetchSccpBurnProof(baseUrl: string, messageId: string) {
    const response = await fetch(
      buildUrl(baseUrl, `/v1/sccp/proofs/burn/${encodePathSegment(messageId)}`),
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }
    return (await response.json()) as SccpBurnProofResponse;
  },

  async fetchSccpGovernanceProof(baseUrl: string, messageId: string) {
    const response = await fetch(
      buildUrl(baseUrl, `/v1/sccp/proofs/governance/${encodePathSegment(messageId)}`),
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }
    return (await response.json()) as SccpGovernanceProofResponse;
  },

  async fetchPipelineTransactionStatus(
    baseUrl: string,
    hash: string,
    scope: PipelineStatusScope = 'auto'
  ) {
    const response = await fetch(
      buildUrl(baseUrl, '/v1/pipeline/transactions/status', { hash, scope }),
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }
    return (await response.json()) as PipelineTransactionStatusResponse;
  }
};

export const waitForPipelineTransactionStatus = async (
  baseUrl: string,
  hash: string,
  options?: {
    scope?: PipelineStatusScope;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    acceptCommitted?: boolean;
  }
): Promise<PipelineStatusPollResult> => {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 6);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options?.maxDelayMs ?? 4000);
  const scope = options?.scope ?? 'auto';
  const acceptCommitted = options?.acceptCommitted ?? false;
  let latest: PipelineTransactionStatusResponse | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    latest = await toriiClient.fetchPipelineTransactionStatus(baseUrl, hash, scope);
    if (latest && isPipelineStatusComplete(latest.content.status.kind, acceptCommitted)) {
      return {
        status: latest,
        completed: true,
        attempts: attempt
      };
    }
    if (attempt < maxAttempts) {
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delayMs);
    }
  }

  return {
    status: latest,
    completed: latest ? isPipelineStatusComplete(latest.content.status.kind, acceptCommitted) : false,
    attempts: maxAttempts
  };
};
