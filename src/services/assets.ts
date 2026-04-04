import { TOKEN_ASSET_ALIASES } from '@/data/soraswap';
import type { AssetAliasResolveResponse, AssetDefinitionResponse } from '@/types';
import { readResponseMessage } from '@/services/norito';

const aliasResolutionCache = new Map<string, Promise<string>>();
const assetDefinitionCache = new Map<string, Promise<AssetDefinitionResponse>>();
const tokenMetadataCache = new Map<string, Promise<TokenAssetMetadata>>();

export interface AssetDefinitionMetadata {
  id: string;
  alias: string | null;
  scale: number | null;
  name: string;
}

export interface TokenAssetMetadata extends AssetDefinitionMetadata {
  token: string;
}

const fetchAliasResolution = async (baseUrl: string, alias: string): Promise<string> => {
  const cacheKey = `${baseUrl}::${alias}`;
  if (aliasResolutionCache.has(cacheKey)) {
    return aliasResolutionCache.get(cacheKey)!;
  }

  const pending = (async () => {
    const response = await fetch(new URL('/v1/assets/aliases/resolve', `${baseUrl}/`).toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alias })
    });

    if (response.status === 404) {
      throw new Error(`Asset alias is not registered on this Torii endpoint: ${alias}`);
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }

    const resolved = (await response.json()) as AssetAliasResolveResponse;
    return resolved.asset_definition_id;
  })();

  aliasResolutionCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (caught) {
    aliasResolutionCache.delete(cacheKey);
    throw caught;
  }
};

export const clearAssetAliasCache = () => {
  aliasResolutionCache.clear();
  assetDefinitionCache.clear();
  tokenMetadataCache.clear();
};

export const fetchAssetDefinition = async (
  baseUrl: string,
  selector: string,
  label = 'Asset'
): Promise<AssetDefinitionResponse> => {
  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const cacheKey = `${baseUrl}::${trimmed}`;
  if (assetDefinitionCache.has(cacheKey)) {
    return assetDefinitionCache.get(cacheKey)!;
  }

  const pending = (async () => {
    const response = await fetch(
      new URL(`/v1/assets/definitions/${encodeURIComponent(trimmed)}`, `${baseUrl}/`).toString(),
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (response.status === 404) {
      throw new Error(`${label} is not registered on this Torii endpoint: ${trimmed}`);
    }
    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
    }

    return (await response.json()) as AssetDefinitionResponse;
  })();

  assetDefinitionCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (caught) {
    assetDefinitionCache.delete(cacheKey);
    throw caught;
  }
};

export const resolveAssetDefinitionMetadata = async (
  baseUrl: string,
  selector: string,
  label = 'Asset'
): Promise<AssetDefinitionMetadata> => {
  const definition = await fetchAssetDefinition(baseUrl, selector, label);
  return {
    id: definition.id,
    alias: definition.alias || null,
    scale: definition.spec?.scale ?? null,
    name: definition.name || definition.alias || definition.id
  };
};

export const normalizeAssetDefinitionInput = async (
  baseUrl: string,
  value: string,
  label = 'Asset'
) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (!trimmed.includes('#')) {
    return trimmed;
  }
  return fetchAliasResolution(baseUrl, trimmed);
};

export const resolveTokenAssetDefinitionId = async (
  baseUrl: string,
  token: string
) => {
  const alias = TOKEN_ASSET_ALIASES[token as keyof typeof TOKEN_ASSET_ALIASES];
  if (!alias) {
    throw new Error(`No deployable asset alias is configured for ${token}.`);
  }
  return normalizeAssetDefinitionInput(baseUrl, alias, `${token} asset`);
};

export const resolveTokenAssetMetadata = async (
  baseUrl: string,
  token: string
): Promise<TokenAssetMetadata> => {
  const alias = TOKEN_ASSET_ALIASES[token as keyof typeof TOKEN_ASSET_ALIASES];
  if (!alias) {
    throw new Error(`No deployable asset alias is configured for ${token}.`);
  }

  const cacheKey = `${baseUrl}::${token}`;
  if (tokenMetadataCache.has(cacheKey)) {
    return tokenMetadataCache.get(cacheKey)!;
  }

  const pending = resolveAssetDefinitionMetadata(baseUrl, alias, `${token} asset`).then((definition) => ({
    ...definition,
    token
  }));

  tokenMetadataCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (caught) {
    tokenMetadataCache.delete(cacheKey);
    throw caught;
  }
};

export const extractAssetDefinitionSelector = (assetId: string) => assetId.split('##')[0]?.trim() || assetId.trim();
