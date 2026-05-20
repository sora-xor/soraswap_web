import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fetchCoverManagerConfig,
  fetchDlmmPoolConfig,
  fetchFarmConfig,
  prepareContractCallDraft
} from '@/services/contracts';

const originalFetch = globalThis.fetch;
const ZERO_PARAMETER_ENTRYPOINT_ERROR_HEX =
  '4e525430000060c93657c10f350760c93657c10f3507006c00000000000000cdcaf820c00d1083000300000060000000000000000100000054000000000000004c00000000000000636f6e7472616374207061796c6f6164206d75737420626520616e20656d707479204a534f4e206f626a65637420666f72207a65726f2d706172616d6574657220656e747279706f696e7473';

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('contract call fetch helpers', () => {
  test('prepareContractCallDraft surfaces decoded norito error bodies', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from(ZERO_PARAMETER_ENTRYPOINT_ERROR_HEX, 'hex')), {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'application/x-norito'
        }
      })
    );

    await expect(
      prepareContractCallDraft('https://taira.sora.org', {
        authority: 'authority',
        contract_address: 'contract',
        entrypoint: 'main',
        payload: {},
        gas_limit: 5000
      })
    ).rejects.toThrow(
      '400 Bad Request: contract payload must be an empty JSON object for zero-parameter entrypoints'
    );
  });

  test('fetchDlmmPoolConfig decodes the pool_config tuple into named fields', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          dataspace: 'universal',
          contract_id: 'pool',
          contract_address: 'pool',
          code_hash_hex: 'hash',
          abi_hash_hex: 'abi',
          entrypoint: 'pool_config',
          result: ['xor-id', 'usdt-id', 'vault-account', 3000, 1, 0]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    await expect(fetchDlmmPoolConfig('https://taira.sora.org', 'authority', 'pool')).resolves.toEqual({
      baseAssetId: 'xor-id',
      quoteAssetId: 'usdt-id',
      vaultAccountId: 'vault-account',
      feePips: 3000,
      binStep: 1,
      activeBin: 0
    });
  });

  test('fetchFarmConfig decodes the farm tuple into named fields', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          dataspace: 'universal',
          contract_id: 'farm',
          contract_address: 'farm',
          code_hash_hex: 'hash',
          abi_hash_hex: 'abi',
          entrypoint: 'farm_config',
          result: ['lp-id', 'reward-id', 'i105treasury', 25]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    await expect(fetchFarmConfig('https://taira.sora.org', 'authority', 'farm')).resolves.toEqual({
      stakeAssetId: 'lp-id',
      rewardAssetId: 'reward-id',
      treasuryAccountId: 'i105treasury',
      rewardRate: 25
    });
  });

  test('fetchCoverManagerConfig decodes the manager_config tuple into named fields', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          dataspace: 'universal',
          contract_id: 'cover',
          contract_address: 'cover',
          code_hash_hex: 'hash',
          abi_hash_hex: 'abi',
          entrypoint: 'manager_config',
          result: ['usdt-id', '0x7269736b', 0, 3, 12, 44, 10, 25, 1]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    await expect(fetchCoverManagerConfig('https://taira.sora.org', 'authority', 'cover')).resolves.toEqual({
      settlementAssetId: 'usdt-id',
      riskVaultContractHex: '0x7269736b',
      withdrawalOnly: false,
      defaultRequiredObservations: '3',
      oracleStaleSlots: '12',
      observationJobId: '44',
      automationCadence: '10',
      automationBacklogCap: '25',
      automationSafeMode: true
    });
  });
});
