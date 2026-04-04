import type { AppRuntimeConfig, RuntimePreset } from '@/types';

const TAIRA_CHAIN_ID = '809574f5-fee7-5e69-bfcf-52451e42d50f';
const LOCAL_CHAIN_ID = '00000000-0000-0000-0000-000000000000';
const DEFAULT_RUNTIME_DATASPACE = 'universal';

const parsePositiveInt = (value: string | number | undefined, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const fallbackAppUrl = () => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
};

export const DEFAULT_RUNTIME_CONFIG = (): AppRuntimeConfig => ({
  toriiUrl: trimTrailingSlash(import.meta.env.VITE_TORII_URL || 'https://taira.sora.org'),
  dataspace: (import.meta.env.VITE_SORASWAP_DATASPACE || DEFAULT_RUNTIME_DATASPACE).trim(),
  connectChainId: (import.meta.env.VITE_CONNECT_CHAIN_ID || TAIRA_CHAIN_ID).trim(),
  connectAppName: (import.meta.env.VITE_CONNECT_APP_NAME || 'SoraSwap').trim(),
  connectAppUrl: (import.meta.env.VITE_CONNECT_APP_URL || fallbackAppUrl()).trim(),
  refreshMs: parsePositiveInt(import.meta.env.VITE_REFRESH_MS, 15000)
});

export const normalizeRuntimeConfig = (
  input: Partial<AppRuntimeConfig> | null | undefined
): AppRuntimeConfig => {
  const defaults = DEFAULT_RUNTIME_CONFIG();
  return {
    toriiUrl: trimTrailingSlash((input?.toriiUrl || defaults.toriiUrl).trim()) || defaults.toriiUrl,
    dataspace: (input?.dataspace || defaults.dataspace).trim() || defaults.dataspace,
    connectChainId: (input?.connectChainId || defaults.connectChainId).trim() || defaults.connectChainId,
    connectAppName: (input?.connectAppName || defaults.connectAppName).trim() || defaults.connectAppName,
    connectAppUrl: (input?.connectAppUrl || defaults.connectAppUrl).trim() || defaults.connectAppUrl,
    refreshMs: parsePositiveInt(input?.refreshMs, defaults.refreshMs)
  };
};

export const RUNTIME_PRESETS: RuntimePreset[] = [
  {
    id: 'taira',
    label: 'TAIRA testnet',
    description: 'Public Sora Nexus testnet endpoint.',
    config: {
      toriiUrl: 'https://taira.sora.org',
      dataspace: DEFAULT_RUNTIME_DATASPACE,
      connectChainId: TAIRA_CHAIN_ID
    }
  },
  {
    id: 'local',
    label: 'Local sibling stack',
    description: 'Sibling ../soraswap localnet on http://127.0.0.1:8080.',
    config: {
      toriiUrl: 'http://127.0.0.1:8080',
      dataspace: DEFAULT_RUNTIME_DATASPACE,
      connectChainId: LOCAL_CHAIN_ID
    }
  }
];

export const resolveRuntimePreset = (config: Pick<AppRuntimeConfig, 'toriiUrl' | 'dataspace' | 'connectChainId'>) =>
  RUNTIME_PRESETS.find(
    (preset) =>
      preset.config.toriiUrl === trimTrailingSlash(config.toriiUrl) &&
      preset.config.dataspace === config.dataspace &&
      preset.config.connectChainId === config.connectChainId
  ) || null;

export const STORAGE_KEYS = {
  theme: 'soraswap.theme',
  watchAccount: 'soraswap.watch-account',
  authorityPublicKey: 'soraswap.authority-public-key',
  runtimeConfig: 'soraswap.runtime-config.v2',
  bridgeLookups: 'soraswap.bridge-lookups.v1',
  bridgeDestinations: 'soraswap.bridge-destinations.v1'
} as const;
