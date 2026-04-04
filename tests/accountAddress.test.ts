import { describe, expect, test } from 'vitest';
import {
  decodeSingleKeyEd25519AccountPublicKey,
  resolveAuthorityPublicKeyHex
} from '@/services/accountAddress';

const VALID_I105_ACCOUNT = '6cmzPVPX4mgve9qwkDNJetJcz16ZUMJekmp8B1RYS7jX8iBPMCK9shi';
const CANONICAL_I105_ACCOUNT = 'sorauロ1NhkキqオHネDvHRZスcルiロrタサoホycヨツヌレヲfhu7ウヌユAb86P2E1';

describe('account address helpers', () => {
  test('decodes canonical single-key Ed25519 account ids', () => {
    const publicKey = decodeSingleKeyEd25519AccountPublicKey(VALID_I105_ACCOUNT);
    expect(publicKey).toHaveLength(32);
    expect(resolveAuthorityPublicKeyHex(VALID_I105_ACCOUNT)).toBe('11'.repeat(32));
  });

  test('decodes modern sentinel-prefixed canonical i105 account ids', () => {
    const publicKey = decodeSingleKeyEd25519AccountPublicKey(CANONICAL_I105_ACCOUNT);
    expect(publicKey).toHaveLength(32);
    expect(resolveAuthorityPublicKeyHex(CANONICAL_I105_ACCOUNT)).toBe('07'.repeat(32));
  });

  test('prefers explicit public key overrides', () => {
    expect(resolveAuthorityPublicKeyHex(VALID_I105_ACCOUNT, 'aa'.repeat(32))).toBe('aa'.repeat(32));
  });
});
