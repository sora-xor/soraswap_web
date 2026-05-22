import { readResponseMessage } from '@/services/norito';

export type SoraSwapOracleDomain = 'perps_market' | 'options_series' | 'options_shout' | 'cover_policy';

const DOMAIN_IDS: Record<SoraSwapOracleDomain, number> = {
  perps_market: 1,
  options_series: 2,
  options_shout: 3,
  cover_policy: 4
};

const DOMAIN_LABELS: Record<number, SoraSwapOracleDomain> = {
  1: 'perps_market',
  2: 'options_series',
  3: 'options_shout',
  4: 'cover_policy'
};

export interface SoraSwapOracleAttestation {
  domain: SoraSwapOracleDomain;
  domainId: number;
  subjectId: string;
  oracleSlot: string;
  statusFlags: string;
  attestationHash: string;
  oraclePayload: string;
  oracleSignature: string;
  sourceEvents: Array<{
    feedId: string;
    slot: string;
    requestHash: string;
    field: string;
  }>;
}

const buildUrl = (baseUrl: string, path: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(path, `${baseUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const readPath = (value: Record<string, unknown>, ...paths: string[]) => {
  for (const path of paths) {
    const parts = path.split('.');
    let current: unknown = value;
    for (const part of parts) {
      current = asRecord(current)[part];
    }
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
};

const bytesToHex = (label: string, value: unknown) => {
  if (typeof value === 'string') {
    const raw = value.trim();
    const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return `0x${hex.toLowerCase()}`;
    }
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return `0x${value.map((item) => Number(item).toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error(`${label} was not returned as hex or bytes.`);
};

const stringValue = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return fallback;
};

const normalizeAttestation = (
  domain: SoraSwapOracleDomain,
  subjectId: string,
  raw: unknown
): SoraSwapOracleAttestation => {
  const root = asRecord(raw);
  const source = asRecord(readPath(root, 'attestation') || root);
  const key = asRecord(source.key);
  const domainId = Number(readPath(source, 'domain', 'domain_id', 'key.domain') ?? DOMAIN_IDS[domain]);
  const sourceEventsRaw = readPath(source, 'source_events', 'sourceEvents');
  const sourceEvents = Array.isArray(sourceEventsRaw)
    ? sourceEventsRaw.map((item) => {
        const sourceEvent = asRecord(item);
        return {
          feedId: stringValue(readPath(sourceEvent, 'feed_id', 'feedId')),
          slot: stringValue(sourceEvent.slot),
          requestHash: stringValue(readPath(sourceEvent, 'request_hash', 'requestHash')),
          field: stringValue(sourceEvent.field)
        };
      })
    : [];

  return {
    domain: DOMAIN_LABELS[domainId] || domain,
    domainId,
    subjectId: stringValue(readPath(source, 'subject_id', 'subjectId', 'key.subject_id'), subjectId || stringValue(key.subject_id)),
    oracleSlot: stringValue(readPath(source, 'oracle_slot', 'oracleSlot')),
    statusFlags: stringValue(readPath(source, 'status_flags', 'statusFlags'), '0'),
    attestationHash: stringValue(readPath(source, 'attestation_hash', 'attestationHash')),
    oraclePayload: bytesToHex('SoraSwap oracle payload', readPath(source, 'oracle_payload', 'oraclePayload')),
    oracleSignature: bytesToHex('SoraSwap oracle signature', readPath(source, 'oracle_signature', 'oracleSignature')),
    sourceEvents
  };
};

export const getSoraSwapOracleDomainId = (domain: SoraSwapOracleDomain) => DOMAIN_IDS[domain];

export const fetchLatestSoraSwapOracleAttestation = async (
  toriiUrl: string,
  domain: SoraSwapOracleDomain,
  subjectId: string,
  status = 0
): Promise<SoraSwapOracleAttestation> => {
  const response = await fetch(
    buildUrl(toriiUrl, '/v1/soracles/soraswap/attestations/latest', {
      domain: DOMAIN_IDS[domain],
      subject_id: subjectId,
      status
    }),
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || 'SoraSwap oracle attestation not found'}`);
  }
  return normalizeAttestation(domain, subjectId, await response.json());
};
