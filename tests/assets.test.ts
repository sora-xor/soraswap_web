import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  clearAssetAliasCache,
  extractAssetDefinitionSelector,
  normalizeAssetDefinitionInput,
  resolveTokenAssetDefinitionId,
  resolveTokenAssetMetadata
} from '@/services/assets';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearAssetAliasCache();
  vi.restoreAllMocks();
});

describe('asset id resolution helpers', () => {
  test('extracts the canonical asset definition selector from an account asset id', () => {
    expect(extractAssetDefinitionSelector('xor#universal##i105authority')).toBe('xor#universal');
    expect(extractAssetDefinitionSelector('xor#universal')).toBe('xor#universal');
  });

  test('returns canonical asset ids unchanged', async () => {
    await expect(
      normalizeAssetDefinitionInput('https://taira.sora.org', '6qLb5RYJbzychndCXgFa9aZzjWyx', 'XOR asset')
    ).resolves.toBe('6qLb5RYJbzychndCXgFa9aZzjWyx');
  });

  test('resolves configured token aliases through Torii and caches the result', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          alias: 'xor#universal',
          asset_definition_id: '6qLb5RYJbzychndCXgFa9aZzjWyx',
          asset_name: 'xor',
          source: 'world_state'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    globalThis.fetch = fetchMock;

    await expect(resolveTokenAssetDefinitionId('https://taira.sora.org', 'XOR')).resolves.toBe(
      '6qLb5RYJbzychndCXgFa9aZzjWyx'
    );
    await expect(resolveTokenAssetDefinitionId('https://taira.sora.org', 'XOR')).resolves.toBe(
      '6qLb5RYJbzychndCXgFa9aZzjWyx'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('surfaces a clear alias-not-found error', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 404,
        statusText: 'Not Found'
      })
    );

    await expect(
      normalizeAssetDefinitionInput('https://taira.sora.org', 'sindex#soraswap.launchpad', 'Sale asset')
    ).rejects.toThrow('Asset alias is not registered on this Torii endpoint: sindex#soraswap.launchpad');
  });

  test('resolves token metadata through asset definitions and caches the result', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'xor-id',
          alias: 'xor#universal',
          name: 'XOR',
          spec: { scale: 2 }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    globalThis.fetch = fetchMock;

    await expect(resolveTokenAssetMetadata('https://taira.sora.org', 'XOR')).resolves.toEqual({
      token: 'XOR',
      id: 'xor-id',
      alias: 'xor#universal',
      scale: 2,
      name: 'XOR'
    });
    await expect(resolveTokenAssetMetadata('https://taira.sora.org', 'XOR')).resolves.toEqual({
      token: 'XOR',
      id: 'xor-id',
      alias: 'xor#universal',
      scale: 2,
      name: 'XOR'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
