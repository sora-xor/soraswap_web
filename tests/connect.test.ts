import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  createConnectPreview,
  registerConnectSession,
  resolveConnectLaunchUri,
  toBase64Url,
} from '@/services/connect';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('connect helpers', () => {
  test('encodes base64url without padding', () => {
    expect(toBase64Url(new Uint8Array([255, 0, 254]))).toBe('_wD-');
  });

  test('builds websocket urls from torii base urls', () => {
    expect(buildConnectWebSocketUrl('https://taira.sora.org', 'sid123', 'app')).toBe(
      'wss://taira.sora.org/v1/connect/ws?sid=sid123&role=app'
    );
  });

  test('maps browser connect previews into the app preview shape', () => {
    const preview = createConnectPreview('809574f5-fee7-5e69-bfcf-52451e42d50f', 'https://taira.sora.org');

    expect(preview.sid).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(preview.sidBytesHex).toHaveLength(64);
    expect(preview.nonceHex).toHaveLength(32);
    expect(preview.privateKeyHex).toHaveLength(64);
    expect(preview.publicKeyHex).toHaveLength(64);
    expect(preview.walletUri).toContain(`sid=${preview.sid}`);
    expect(preview.appUri).toContain(`sid=${preview.sid}`);
    expect(preview.wsUrl).toBe(`wss://taira.sora.org/v1/connect/ws?sid=${preview.sid}&role=app`);
  });

  test('registers connect sessions through Torii', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: 'sid123',
          wallet_uri: 'iroha://connect?sid=sid123&role=wallet&token=wallet-token',
          app_uri: 'iroha://connect?sid=sid123&role=app&token=app-token',
          token_app: 'app-token',
          token_wallet: 'wallet-token',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    globalThis.fetch = fetchMock;

    const response = await registerConnectSession('https://taira.sora.org', 'sid123', 'https://taira.sora.org');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe('https://taira.sora.org/v1/connect/session');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ sid: 'sid123', node: 'https://taira.sora.org' }),
    });
    expect(response.token_app).toBe('app-token');
  });

  test('prefers canonical session deeplinks over preview deeplinks', () => {
    expect(
      resolveConnectLaunchUri(
        'wallet',
        {
          walletUri: 'iroha://connect?sid=preview',
          appUri: 'iroha://connect/app?sid=preview',
        },
        {
          wallet_uri: 'iroha://connect?sid=session&role=wallet&token=wallet-token',
          app_uri: 'iroha://connect?sid=session&role=app&token=app-token',
        }
      )
    ).toBe('iroha://connect?sid=session&role=wallet&token=wallet-token');

    expect(
      resolveConnectLaunchUri(
        'app',
        {
          walletUri: 'iroha://connect?sid=preview',
          appUri: 'iroha://connect/app?sid=preview',
        },
        {
          wallet_uri: 'iroha://connect?sid=session&role=wallet&token=wallet-token',
          app_uri: 'iroha://connect?sid=session&role=app&token=app-token',
        }
      )
    ).toBe('iroha://connect?sid=session&role=app&token=app-token');
  });

  test('falls back to preview deeplinks when the session response does not provide them', () => {
    expect(
      resolveConnectLaunchUri(
        'wallet',
        {
          walletUri: 'iroha://connect?sid=preview',
          appUri: 'iroha://connect/app?sid=preview',
        },
        null
      )
    ).toBe('iroha://connect?sid=preview');
  });

  test('encodes websocket protocol tokens for browser sockets', () => {
    expect(buildConnectTokenProtocol('token-app')).toBe('iroha-connect.token.v1.dG9rZW4tYXBw');
  });
});
