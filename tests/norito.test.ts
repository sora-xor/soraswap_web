import { describe, expect, test } from 'vitest';
import { decodeNoritoMessage, readResponseMessage } from '@/services/norito';

const ZERO_PARAMETER_ENTRYPOINT_ERROR_HEX =
  '4e525430000060c93657c10f350760c93657c10f3507006c00000000000000cdcaf820c00d1083000300000060000000000000000100000054000000000000004c00000000000000636f6e7472616374207061796c6f6164206d75737420626520616e20656d707479204a534f4e206f626a65637420666f72207a65726f2d706172616d6574657220656e747279706f696e7473';
const MISSING_VAULT_ERROR_HEX =
  '4e525430000060c93657c10f350760c93657c10f35070074000000000000001a23f9aa1cd7a2f400030000006800000000000000010000005c0000000000000054000000000000006d697373696e6720636f6e7472616374207061796c6f6164206669656c6420607661756c746020666f7220656e747279706f696e7420606465706f7369745f616e645f6d696e745f776974685f61737365747360';

const hexToBytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));

describe('norito response helpers', () => {
  test('decodeNoritoMessage extracts the zero-parameter entrypoint error string', () => {
    expect(decodeNoritoMessage(hexToBytes(ZERO_PARAMETER_ENTRYPOINT_ERROR_HEX))).toBe(
      'contract payload must be an empty JSON object for zero-parameter entrypoints'
    );
  });

  test('decodeNoritoMessage extracts nested entrypoint field errors', () => {
    expect(decodeNoritoMessage(hexToBytes(MISSING_VAULT_ERROR_HEX))).toBe(
      'missing contract payload field `vault` for entrypoint `deposit_and_mint_with_assets`'
    );
  });

  test('readResponseMessage prefers decoded norito text over raw bytes', async () => {
    const response = new Response(hexToBytes(MISSING_VAULT_ERROR_HEX), {
      status: 400,
      statusText: 'Bad Request',
      headers: {
        'Content-Type': 'application/x-norito'
      }
    });

    await expect(readResponseMessage(response)).resolves.toBe(
      'missing contract payload field `vault` for entrypoint `deposit_and_mint_with_assets`'
    );
  });
});
