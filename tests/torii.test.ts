import { afterEach, describe, expect, test, vi } from 'vitest';
import { isPipelineStatusComplete, toriiClient, waitForPipelineTransactionStatus } from '@/services/torii';

const originalFetch = globalThis.fetch;
const MISSING_VAULT_ERROR_HEX =
  '4e525430000060c93657c10f350760c93657c10f35070074000000000000001a23f9aa1cd7a2f400030000006800000000000000010000005c0000000000000054000000000000006d697373696e6720636f6e7472616374207061796c6f6164206669656c6420607661756c746020666f7220656e747279706f696e7420606465706f7369745f616e645f6d696e745f776974685f61737365747360';

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('pipeline status helpers', () => {
  test('fetchApiVersions falls back to Iroha version headers when the endpoint returns norito', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('NRT0...', {
        status: 200,
        headers: {
          'Content-Type': 'application/x-norito',
          'x-iroha-api-version': '1.1',
          'x-iroha-api-supported': '1.0, 1.1'
        }
      })
    );

    await expect(toriiClient.fetchApiVersions('https://taira.sora.org')).resolves.toEqual({
      current_version: '1.1',
      default_version: '1.1',
      supported_versions: ['1.0', '1.1']
    });
  });

  test('fetchContractInstances surfaces decoded norito error bodies', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from(Buffer.from(MISSING_VAULT_ERROR_HEX, 'hex')), {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'Content-Type': 'application/x-norito'
        }
      })
    );

    await expect(
      toriiClient.fetchContractInstances('https://taira.sora.org', 'universal')
    ).rejects.toThrow(
      '400 Bad Request: missing contract payload field `vault` for entrypoint `deposit_and_mint_with_assets`'
    );
  });

  test('isPipelineStatusComplete respects Applied and optional Committed', () => {
    expect(isPipelineStatusComplete('Applied')).toBe(true);
    expect(isPipelineStatusComplete('Rejected')).toBe(true);
    expect(isPipelineStatusComplete('Committed')).toBe(false);
    expect(isPipelineStatusComplete('Committed', true)).toBe(true);
  });

  test('waitForPipelineTransactionStatus polls until a terminal status is returned', async () => {
    const queued = {
      kind: 'Transaction',
      content: {
        hash: 'abcd',
        status: {
          kind: 'Queued',
          content: null
        },
        scope: 'auto',
        resolved_from: 'queue'
      }
    };
    const applied = {
      kind: 'Transaction',
      content: {
        hash: 'abcd',
        status: {
          kind: 'Applied',
          block_height: 42,
          content: null
        },
        scope: 'auto',
        resolved_from: 'state'
      }
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(queued), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(applied), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

    globalThis.fetch = fetchMock;

    const result = await waitForPipelineTransactionStatus('https://taira.sora.org', 'abcd', {
      maxAttempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      status: applied,
      completed: true,
      attempts: 3
    });
  });
});
