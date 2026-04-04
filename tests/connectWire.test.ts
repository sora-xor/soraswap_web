import { readFileSync } from 'fs';
import { describe, expect, test } from 'vitest';
import type { ConnectPreview } from '@/types';
import { toBase64Url } from '@/services/connect';
import {
  buildApprovePreimage,
  bytesToHex,
  decodeConnectEnvelope,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeConnectEnvelope,
  encryptConnectEnvelope,
  encodeOpenConnectFrame,
  hexToBytes
} from '@/services/connectWire';

const ANDROID_APPROVE_FIXTURE_HEX = readFileSync(
  new URL('../../iroha/crates/iroha_torii_shared/tests/fixtures/android_approve_frame.hex', import.meta.url),
  'utf8'
).trim();
const LIVE_SIGN_REQUEST_RAW_ENVELOPE_HEX =
  '4e5254300000f35017c774558f19f35017c774558f19006c00000000000000d9148a06a682358f00080000000000000002000000000000005400000000000000010000001800000000000000100000000000000046495f50524f504f53414c5f5349474e28000000000000002000000000000000086a72f402ddccae0559eacfefdd1403c3eb889eb3b920f0a614ede8888405d1';

const preview: ConnectPreview = {
  sid: toBase64Url(new Uint8Array(32).fill(0xab)),
  sidBytesHex: 'ab'.repeat(32),
  nonceHex: '11'.repeat(16),
  privateKeyHex: '22'.repeat(32),
  publicKeyHex: '33'.repeat(32),
  walletUri: '',
  appUri: '',
  wsUrl: '',
  createdAt: 0
};

describe('connect wire codec', () => {
  test('encodes and decodes open frames', () => {
    const bytes = encodeOpenConnectFrame(preview, {
      chainId: '809574f5-fee7-5e69-bfcf-52451e42d50f',
      appName: 'SoraSwap',
      appUrl: 'https://example.test',
      permissions: {
        methods: ['SIGN_REQUEST_TX', 'SIGN_REQUEST_RAW'],
        events: ['DISPLAY_REQUEST'],
        resources: null
      }
    });

    const decoded = decodeConnectFrame(bytes);
    expect(decoded.kind).toBe('control');
    expect(decoded.direction).toBe('app_to_wallet');
    expect(decoded.seq).toBe(1);
    expect(decoded.control?.type).toBe('open');
    if (!decoded.control || decoded.control.type !== 'open') {
      throw new Error('expected open control');
    }
    expect(decoded.control.appPublicKeyHex).toBe(preview.publicKeyHex);
    expect(decoded.control.constraints.chainId).toBe('809574f5-fee7-5e69-bfcf-52451e42d50f');
    expect(decoded.control.appMeta?.name).toBe('SoraSwap');
    expect(decoded.control.appMeta?.url).toBe('https://example.test');
    expect(decoded.control.permissions?.methods).toEqual(['SIGN_REQUEST_TX', 'SIGN_REQUEST_RAW']);
    expect(decoded.control.permissions?.events).toEqual(['DISPLAY_REQUEST']);
  });

  test('decodes the android approve fixture', () => {
    const decoded = decodeConnectFrame(hexToBytes(ANDROID_APPROVE_FIXTURE_HEX));
    expect(decoded.kind).toBe('control');
    expect(decoded.direction).toBe('wallet_to_app');
    expect(decoded.seq).toBe(1);
    expect(decoded.control?.type).toBe('approve');
    if (!decoded.control || decoded.control.type !== 'approve') {
      throw new Error('expected approve control');
    }
    expect(decoded.control.walletPublicKeyHex).toBe('07'.repeat(32));
    expect(decoded.control.accountId).toBe('6cmzPVPX944pj7vVyADRpma2DCcBUsG1mhz8VrXArhXaGsjvRUcnbVn');
    expect(decoded.control.permissions).toBeNull();
    expect(decoded.control.proof).toBeNull();
    expect(decoded.control.signature.algorithmCode).toBe(0);
    expect(decoded.control.signature.signatureHex).toBe('09'.repeat(64));
  });

  test('encodes and decodes approve frames', () => {
    const bytes = encodeApproveConnectFrame(preview.sid, 1, {
      walletPublicKeyHex: '44'.repeat(32),
      accountId: '6cmzPVPX944pj7vVyADRpma2DCcBUsG1mhz8VrXArhXaGsjvRUcnbVn',
      permissions: {
        methods: ['SIGN_REQUEST_TX', 'SIGN_REQUEST_RAW'],
        events: ['DISPLAY_REQUEST'],
        resources: null
      },
      signature: {
        algorithmCode: 0,
        algorithmLabel: 'Ed25519',
        signatureHex: '55'.repeat(64),
        signatureBase64: Buffer.from('55'.repeat(64), 'hex').toString('base64')
      }
    });

    const decoded = decodeConnectFrame(bytes);
    expect(decoded.kind).toBe('control');
    expect(decoded.direction).toBe('wallet_to_app');
    expect(decoded.seq).toBe(1);
    expect(decoded.control?.type).toBe('approve');
    if (!decoded.control || decoded.control.type !== 'approve') {
      throw new Error('expected approve control');
    }
    expect(decoded.control.walletPublicKeyHex).toBe('44'.repeat(32));
    expect(decoded.control.accountId).toBe('6cmzPVPX944pj7vVyADRpma2DCcBUsG1mhz8VrXArhXaGsjvRUcnbVn');
    expect(decoded.control.permissions?.methods).toEqual(['SIGN_REQUEST_TX', 'SIGN_REQUEST_RAW']);
    expect(decoded.control.signature.signatureHex).toBe('55'.repeat(64));
  });

  test('derives stable direction keys and approval preimages', () => {
    const keys = deriveConnectDirectionKeys(preview, '44'.repeat(32));
    expect(keys.appKey).toHaveLength(32);
    expect(keys.walletKey).toHaveLength(32);

    const preimage = buildApprovePreimage({
      sid: preview.sid,
      appPublicKeyHex: preview.publicKeyHex,
      walletPublicKeyHex: '44'.repeat(32),
      accountId: '6cmzPVPX944pj7vVyADRpma2DCcBUsG1mhz8VrXArhXaGsjvRUcnbVn',
      permissions: {
        methods: ['SIGN_REQUEST_TX'],
        events: [],
        resources: null
      },
      proof: {
        domain: 'example.test',
        uri: 'https://example.test',
        statement: 'Approve this session',
        issuedAt: '2026-03-24T00:00:00Z',
        nonce: 'abc123'
      }
    });

    expect(preimage.length).toBeGreaterThan(32 * 3);
    expect(Array.from(preimage.slice(0, 22))).toEqual(
      Array.from(new TextEncoder().encode('iroha-connect|approve|'))
    );
  });

  test('decodes and re-encodes the current live sign-request envelope fixture', () => {
    const fixture = hexToBytes(LIVE_SIGN_REQUEST_RAW_ENVELOPE_HEX);
    const decoded = decodeConnectEnvelope(fixture);
    expect(decoded.seq).toBe(2);
    expect(decoded.payload.type).toBe('sign_request_raw');
    if (decoded.payload.type !== 'sign_request_raw') {
      throw new Error('expected sign_request_raw payload');
    }
    expect(decoded.payload.domainTag).toBe('FI_PROPOSAL_SIGN');
    expect(decoded.payload.bytesLength).toBe(32);
    expect(bytesToHex(encodeConnectEnvelope(decoded.seq, decoded.payload))).toBe(
      LIVE_SIGN_REQUEST_RAW_ENVELOPE_HEX
    );
  });

  test('encrypts and decrypts ciphertext envelopes with frame roundtrip', () => {
    const payload = {
      type: 'sign_request_raw' as const,
      domainTag: 'IROHA_TORII_CONTRACT_CALL',
      bytesHex: 'aa55',
      bytesBase64: 'qlU=',
      bytesLength: 2
    };
    const aead = encryptConnectEnvelope(new Uint8Array(32).fill(0x55), preview.sid, 'app_to_wallet', 1, payload);
    const frameBytes = encodeCiphertextConnectFrame({
      sid: preview.sid,
      direction: 'app_to_wallet',
      seq: 1,
      aead
    });
    const frame = decodeConnectFrame(frameBytes);
    expect(frame.kind).toBe('ciphertext');
    expect(frame.ciphertext?.direction).toBe('app_to_wallet');
    const decrypted = decryptConnectEnvelope(
      new Uint8Array(32).fill(0x55),
      preview.sid,
      'app_to_wallet',
      1,
      hexToBytes(frame.ciphertext?.aeadHex || '')
    );
    expect(decrypted.payload.type).toBe('sign_request_raw');
    if (decrypted.payload.type !== 'sign_request_raw') {
      throw new Error('expected decrypted sign_request_raw payload');
    }
    expect(decrypted.payload.domainTag).toBe('IROHA_TORII_CONTRACT_CALL');
    expect(decrypted.payload.bytesBase64).toBe('qlU=');
  });

  test('roundtrips encrypted sign_request_tx envelopes', () => {
    const payload = {
      type: 'sign_request_tx' as const,
      txBytesHex: 'aa55cc',
      txBytesBase64: 'qlXM',
      txBytesLength: 3
    };
    const aead = encryptConnectEnvelope(new Uint8Array(32).fill(0x66), preview.sid, 'app_to_wallet', 2, payload);
    const frameBytes = encodeCiphertextConnectFrame({
      sid: preview.sid,
      direction: 'app_to_wallet',
      seq: 2,
      aead
    });
    const frame = decodeConnectFrame(frameBytes);
    expect(frame.kind).toBe('ciphertext');
    expect(frame.ciphertext?.direction).toBe('app_to_wallet');
    const decrypted = decryptConnectEnvelope(
      new Uint8Array(32).fill(0x66),
      preview.sid,
      'app_to_wallet',
      2,
      hexToBytes(frame.ciphertext?.aeadHex || '')
    );
    expect(decrypted.payload.type).toBe('sign_request_tx');
    if (decrypted.payload.type !== 'sign_request_tx') {
      throw new Error('expected decrypted sign_request_tx payload');
    }
    expect(decrypted.payload.txBytesBase64).toBe('qlXM');
    expect(decrypted.payload.txBytesLength).toBe(3);
  });
});
