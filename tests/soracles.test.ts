import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchLatestSoraSwapOracleAttestation, getSoraSwapOracleDomainId } from '@/services/soracles';

describe('soracles service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fetchLatestSoraSwapOracleAttestation normalizes native attestation bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: { domain: 3, subject_id: 77 },
          oracle_slot: 123,
          status_flags: 0,
          attestation_hash: 456,
          oracle_payload: [0x7b, 0x7d],
          oracle_signature: 'ABCD',
          source_events: [
            {
              feed_id: 'xor_usd',
              slot: 123,
              request_hash: '0xfeed',
              field: 'mark_price_bps'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const attestation = await fetchLatestSoraSwapOracleAttestation('https://taira.sora.org', 'options_shout', '77');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://taira.sora.org/v1/soracles/soraswap/attestations/latest?domain=3&subject_id=77&status=0',
      { headers: { Accept: 'application/json' } }
    );
    expect(attestation).toMatchObject({
      domain: 'options_shout',
      domainId: 3,
      subjectId: '77',
      oracleSlot: '123',
      statusFlags: '0',
      attestationHash: '456',
      oraclePayload: '0x7b7d',
      oracleSignature: '0xabcd'
    });
    expect(attestation.sourceEvents[0]).toMatchObject({
      feedId: 'xor_usd',
      slot: '123',
      field: 'mark_price_bps'
    });
  });

  test('getSoraSwapOracleDomainId exposes ABI-compatible domains', () => {
    expect(getSoraSwapOracleDomainId('perps_market')).toBe(1);
    expect(getSoraSwapOracleDomainId('options_series')).toBe(2);
    expect(getSoraSwapOracleDomainId('options_shout')).toBe(3);
    expect(getSoraSwapOracleDomainId('cover_policy')).toBe(4);
  });
});
