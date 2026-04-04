import {
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_ETH,
  SCCP_DOMAIN_SOL,
  SCCP_DOMAIN_SORA,
  SCCP_DOMAIN_SORA_KUSAMA,
  SCCP_DOMAIN_SORA_POLKADOT,
  SCCP_DOMAIN_TON,
  SCCP_DOMAIN_TRON,
  sccpBurnMessageId,
  validateSccpBurnBundleSurface,
  validateSccpGovernanceBundleSurface
} from '@iroha/iroha-js/sccp';
import { STORAGE_KEYS } from '@/services/env';
import { shorten } from '@/services/format';
import { readResponseMessage } from '@/services/norito';
import type {
  BridgeDomainDescriptor,
  BridgeLookupRecord,
  BridgeProofKind,
  BridgeProofSubmitRequest,
  BridgeProofSubmitResponse,
  BridgeSavedDestination,
  SccpBurnPayloadResponse,
  SccpBurnProofResponse,
  SccpGovernanceProofResponse
} from '@/types';

const MAX_HISTORY_ITEMS = 12;
const MAX_DESTINATION_ITEMS = 16;

export const BRIDGE_DOMAINS: BridgeDomainDescriptor[] = [
  {
    id: SCCP_DOMAIN_SORA,
    key: 'sora',
    label: 'Sora',
    family: 'Sora',
    direction: 'local',
    shortLabel: 'SORA'
  },
  {
    id: SCCP_DOMAIN_ETH,
    key: 'ethereum',
    label: 'Ethereum',
    family: 'EVM',
    direction: 'remote',
    shortLabel: 'ETH'
  },
  {
    id: SCCP_DOMAIN_BSC,
    key: 'bsc',
    label: 'BNB Smart Chain',
    family: 'EVM',
    direction: 'remote',
    shortLabel: 'BSC'
  },
  {
    id: SCCP_DOMAIN_SOL,
    key: 'solana',
    label: 'Solana',
    family: 'Solana',
    direction: 'remote',
    shortLabel: 'SOL'
  },
  {
    id: SCCP_DOMAIN_TON,
    key: 'ton',
    label: 'TON',
    family: 'TON',
    direction: 'remote',
    shortLabel: 'TON'
  },
  {
    id: SCCP_DOMAIN_TRON,
    key: 'tron',
    label: 'TRON',
    family: 'TRON',
    direction: 'remote',
    shortLabel: 'TRON'
  },
  {
    id: SCCP_DOMAIN_SORA_KUSAMA,
    key: 'kusama',
    label: 'Sora / Kusama',
    family: 'Polkadot',
    direction: 'remote',
    shortLabel: 'KSM'
  },
  {
    id: SCCP_DOMAIN_SORA_POLKADOT,
    key: 'polkadot',
    label: 'Sora / Polkadot',
    family: 'Polkadot',
    direction: 'remote',
    shortLabel: 'DOT'
  }
];

const safeGetItem = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};

const normalizeHexLiteral = (value: string, label: string) => {
  const trimmed = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!trimmed || /[^0-9a-f]/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new Error(`${label} must be canonical hex.`);
  }
  return `0x${trimmed}`;
};

export const normalizeHex32Literal = (value: string, label: string) => {
  const normalized = normalizeHexLiteral(value, label);
  if (normalized.length !== 66) {
    throw new Error(`${label} must be 32-byte hex.`);
  }
  return normalized;
};

export const normalizeHashLikeHex32 = (value: string, label: string) => {
  const trimmed = value.trim();
  const candidate = trimmed.startsWith('hash:')
    ? trimmed.slice(5).split('#')[0] || ''
    : trimmed;
  return normalizeHex32Literal(candidate, label);
};

export const normalizeBridgeMessageId = (value: string) =>
  normalizeHex32Literal(value, 'Message id');

export const normalizeBridgeHeight = (value: string | number) => {
  const numeric =
    typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error('Block height must be a positive integer.');
  }
  return numeric;
};

export const resolveBridgeDomain = (domainId: number) =>
  BRIDGE_DOMAINS.find((domain) => domain.id === Number(domainId)) || null;

export const bridgeDomainLabel = (domainId: number) =>
  resolveBridgeDomain(domainId)?.label || `Domain ${domainId}`;

export const bridgeTransferLabel = (sourceDomain: number, destDomain: number) =>
  `${bridgeDomainLabel(sourceDomain)} -> ${bridgeDomainLabel(destDomain)}`;

export const deriveBurnMessageId = (payload: SccpBurnPayloadResponse) =>
  sccpBurnMessageId({
    version: payload.version,
    source_domain: Number(payload.source_domain),
    dest_domain: Number(payload.dest_domain),
    nonce: String(payload.nonce),
    sora_asset_id: normalizeHex32Literal(payload.sora_asset_id, 'Sora asset id'),
    amount: String(payload.amount),
    recipient: normalizeHex32Literal(payload.recipient, 'Recipient')
  });

export const summarizeBurnProof = (proof: SccpBurnProofResponse) => {
  const validation = validateSccpBurnBundleSurface(proof);
  return {
    validation,
    directionLabel: bridgeTransferLabel(
      Number(proof.payload.source_domain),
      Number(proof.payload.dest_domain)
    ),
    messageIdShort: shorten(proof.commitment.message_id, 12, 10),
    assetIdShort: shorten(proof.payload.sora_asset_id, 12, 8),
    recipientShort: shorten(proof.payload.recipient, 12, 8)
  };
};

export const summarizeGovernanceProof = (proof: SccpGovernanceProofResponse) => {
  const validation = validateSccpGovernanceBundleSurface(proof);
  return {
    validation,
    targetDomainLabel: bridgeDomainLabel(Number(proof.commitment.target_domain)),
    messageIdShort: shorten(proof.commitment.message_id, 12, 10)
  };
};

export const readBridgeLookupHistory = (): BridgeLookupRecord[] => {
  const raw = safeGetItem(STORAGE_KEYS.bridgeLookups);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BridgeLookupRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.kind === 'string' &&
          typeof item.value === 'string' &&
          typeof item.label === 'string' &&
          typeof item.subtitle === 'string' &&
          typeof item.success === 'boolean' &&
          typeof item.lookedUpAt === 'number'
      )
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
};

export const writeBridgeLookupHistory = (items: BridgeLookupRecord[]) => {
  safeSetItem(STORAGE_KEYS.bridgeLookups, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
};

export const readBridgeDestinations = (): BridgeSavedDestination[] => {
  const raw = safeGetItem(STORAGE_KEYS.bridgeDestinations);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BridgeSavedDestination[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          Number.isInteger(item.domainId) &&
          typeof item.label === 'string' &&
          typeof item.recipient === 'string' &&
          typeof item.updatedAt === 'number'
      )
      .slice(0, MAX_DESTINATION_ITEMS);
  } catch {
    return [];
  }
};

export const writeBridgeDestinations = (items: BridgeSavedDestination[]) => {
  safeSetItem(
    STORAGE_KEYS.bridgeDestinations,
    JSON.stringify(items.slice(0, MAX_DESTINATION_ITEMS))
  );
};

export const rememberBridgeDestination = (record: BridgeSavedDestination) => {
  const next = [
    record,
    ...readBridgeDestinations().filter(
      (item) => !(item.domainId === record.domainId && item.recipient === record.recipient)
    )
  ];
  writeBridgeDestinations(next);
  return next.slice(0, MAX_DESTINATION_ITEMS);
};

export const removeBridgeDestination = (domainId: number, recipient: string) => {
  const next = readBridgeDestinations().filter(
    (item) => !(item.domainId === domainId && item.recipient === recipient)
  );
  writeBridgeDestinations(next);
  return next;
};

export const rememberBridgeLookup = (record: BridgeLookupRecord) => {
  const next = [record, ...readBridgeLookupHistory().filter((item) => !(item.kind === record.kind && item.value === record.value))];
  writeBridgeLookupHistory(next);
  return next.slice(0, MAX_HISTORY_ITEMS);
};

export const proofKindLabel = (kind: BridgeProofKind) =>
  kind === 'burn' ? 'Burn proof' : 'Governance proof';

export const commitmentRootsMatch = (left: string | null | undefined, right: string | null | undefined) => {
  if (!left || !right) return null;
  try {
    return normalizeHashLikeHex32(left, 'Commitment root') === normalizeHashLikeHex32(right, 'Commitment root');
  } catch {
    return null;
  }
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

export const buildBridgeProofSubmitRequest = (input: {
  authority: string;
  kind: BridgeProofKind;
  bundle: SccpBurnProofResponse | SccpGovernanceProofResponse;
  creationTimeMs?: number;
}): BridgeProofSubmitRequest => ({
  authority: input.authority,
  ...(input.kind === 'burn'
    ? { burn_bundle: input.bundle as SccpBurnProofResponse }
    : { governance_bundle: input.bundle as SccpGovernanceProofResponse }),
  ...(typeof input.creationTimeMs === 'number' ? { creation_time_ms: input.creationTimeMs } : {})
});

const postBridgeProofSubmit = (baseUrl: string, request: BridgeProofSubmitRequest) =>
  fetchJson<BridgeProofSubmitResponse>(new URL('/v1/bridge/proofs/submit', `${baseUrl}/`).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

export const prepareBridgeProofSubmit = (baseUrl: string, request: BridgeProofSubmitRequest) =>
  postBridgeProofSubmit(baseUrl, request);

export const submitBridgeProofDetached = (baseUrl: string, request: BridgeProofSubmitRequest) =>
  postBridgeProofSubmit(baseUrl, request);
