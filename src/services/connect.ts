import {
  buildConnectTokenProtocol as buildConnectTokenProtocolBase,
  buildConnectWebSocketUrl as buildConnectWebSocketUrlBase,
  createConnectSessionPreview,
  openConnectWebSocket as openConnectWebSocketBase,
  registerConnectSession as registerConnectSessionBase,
  toBase64Url,
  toHex,
} from '@iroha/iroha-js/connect-browser';
import type { ConnectPreview, ConnectSessionResponse } from '@/types';

export { toBase64Url };

const normalizeOptionalUri = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const shouldAllowInsecureConnectWebSocket = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
};

export const buildConnectWebSocketUrl = (
  baseUrl: string,
  sid: string,
  role: 'app' | 'wallet'
) => buildConnectWebSocketUrlBase(baseUrl, sid, role);

export const createConnectPreview = (chainId: string, node?: string): ConnectPreview => {
  const preview = createConnectSessionPreview({
    chainId,
    node: node || null,
  });

  return {
    sid: preview.sidBase64Url,
    sidBytesHex: toHex(preview.sidBytes),
    nonceHex: toHex(preview.nonce),
    privateKeyHex: toHex(preview.appKeyPair.privateKey),
    publicKeyHex: toHex(preview.appKeyPair.publicKey),
    walletUri: preview.walletUri,
    appUri: preview.appUri,
    wsUrl: preview.wsUrl,
    createdAt: preview.createdAt,
  };
};

export const registerConnectSession = async (
  toriiUrl: string,
  sid: string,
  node?: string
) =>
  (await registerConnectSessionBase(toriiUrl, sid, {
    node: node || null,
  })) as ConnectSessionResponse;

export const buildConnectTokenProtocol = (token: string) => buildConnectTokenProtocolBase(token);

export const resolveConnectLaunchUri = (
  role: 'wallet' | 'app',
  preview: Pick<ConnectPreview, 'walletUri' | 'appUri'> | null,
  session: Pick<ConnectSessionResponse, 'wallet_uri' | 'app_uri'> | null
) => {
  const canonical =
    role === 'wallet'
      ? normalizeOptionalUri(session?.wallet_uri)
      : normalizeOptionalUri(session?.app_uri);
  if (canonical) return canonical;
  return role === 'wallet'
    ? normalizeOptionalUri(preview?.walletUri) || ''
    : normalizeOptionalUri(preview?.appUri) || '';
};

export const openConnectWebSocket = (
  baseUrl: string,
  sid: string,
  token: string,
  role: 'app' | 'wallet'
) =>
  openConnectWebSocketBase(baseUrl, sid, token, role, {
    allowInsecure: shouldAllowInsecureConnectWebSocket(baseUrl),
  });
