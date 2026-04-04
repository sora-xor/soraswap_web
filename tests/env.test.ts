import { describe, expect, test } from 'vitest';
import { normalizeRuntimeConfig, resolveRuntimePreset } from '@/services/env';

describe('runtime config helpers', () => {
  test('normalizeRuntimeConfig trims urls and restores sane defaults', () => {
    const config = normalizeRuntimeConfig({
      toriiUrl: 'https://taira.sora.org///',
      dataspace: '  soraswap  ',
      connectChainId: ' chain-id ',
      connectAppName: '  SoraSwap  ',
      connectAppUrl: ' https://app.example/ipfs/soraswap ',
      refreshMs: 0
    });

    expect(config).toMatchObject({
      toriiUrl: 'https://taira.sora.org',
      dataspace: 'soraswap',
      connectChainId: 'chain-id',
      connectAppName: 'SoraSwap',
      connectAppUrl: 'https://app.example/ipfs/soraswap'
    });
    expect(config.refreshMs).toBeGreaterThan(0);
  });

  test('resolveRuntimePreset detects the built-in TAIRA and local presets', () => {
    expect(
      resolveRuntimePreset({
        toriiUrl: 'https://taira.sora.org/',
        dataspace: 'universal',
        connectChainId: '809574f5-fee7-5e69-bfcf-52451e42d50f'
      })?.id
    ).toBe('taira');

    expect(
      resolveRuntimePreset({
        toriiUrl: 'http://127.0.0.1:8080/',
        dataspace: 'universal',
        connectChainId: '00000000-0000-0000-0000-000000000000'
      })?.id
    ).toBe('local');
  });
});
