import {
  canonicalSccpBurnPayloadBytes,
  canonicalSccpGovernancePayloadBytes,
  sccpCommitmentLeafHash,
  sccpGovernanceMessageId,
  sccpParliamentCertificateHash,
  sccpPayloadHash
} from '@iroha/iroha-js/sccp';
import { describe, expect, it } from 'vitest';
import {
  buildBridgeProofSubmitRequest,
  commitmentRootsMatch,
  deriveBurnMessageId,
  summarizeBurnProof,
  summarizeGovernanceProof
} from '@/services/bridge';
import type { SccpBurnProofResponse, SccpGovernanceProofResponse } from '@/types';

describe('bridge helpers', () => {
  it('derives the canonical burn message id from SCCP payload fields', () => {
    expect(
      deriveBurnMessageId({
        version: 1,
        source_domain: 0,
        dest_domain: 1,
        nonce: '7',
        sora_asset_id: `0x${'11'.repeat(32)}`,
        amount: '42',
        recipient: `0x${'22'.repeat(32)}`
      })
    ).toBe('0x514a58df512d89a0e83bf97514a4bb102ba38f5f1617ec62e4b253820032566b');
  });

  it('summarizes a structurally valid burn bundle', () => {
    const payload = {
      version: 1,
      source_domain: 0,
      dest_domain: 1,
      nonce: '7',
      sora_asset_id: `0x${'11'.repeat(32)}`,
      amount: '42',
      recipient: `0x${'22'.repeat(32)}`
    } as const;
    const commitment = {
      version: 1,
      kind: 'Burn' as const,
      target_domain: 1,
      message_id: '0x514a58df512d89a0e83bf97514a4bb102ba38f5f1617ec62e4b253820032566b',
      payload_hash: sccpPayloadHash(canonicalSccpBurnPayloadBytes(payload)),
      parliament_certificate_hash: null
    };
    const proof: SccpBurnProofResponse = {
      version: 1,
      commitment_root: sccpCommitmentLeafHash(commitment),
      commitment,
      merkle_proof: { steps: [] },
      payload: { ...payload },
      finality_proof: '0x01'
    };

    const summary = summarizeBurnProof(proof);
    expect(summary.validation.ok).toBe(true);
    expect(Object.values(summary.validation.checks).every(Boolean)).toBe(true);

    expect(
      buildBridgeProofSubmitRequest({
        authority: 'alice@sora',
        kind: 'burn',
        bundle: proof,
        creationTimeMs: 99
      })
    ).toEqual({
      authority: 'alice@sora',
      burn_bundle: proof,
      creation_time_ms: 99
    });
  });

  it('summarizes a structurally valid governance bundle', () => {
    const parliamentCertificate = '0x1234';
    const payload = {
      Pause: {
        version: 1,
        target_domain: 1,
        nonce: '9',
        sora_asset_id: `0x${'44'.repeat(32)}`
      }
    } as const;
    const commitment = {
      version: 1,
      kind: 'TokenPause' as const,
      target_domain: 1,
      message_id: sccpGovernanceMessageId(payload),
      payload_hash: sccpPayloadHash(canonicalSccpGovernancePayloadBytes(payload)),
      parliament_certificate_hash: sccpParliamentCertificateHash(parliamentCertificate)
    };
    const proof: SccpGovernanceProofResponse = {
      version: 1,
      commitment_root: sccpCommitmentLeafHash(commitment),
      commitment,
      merkle_proof: { steps: [] },
      payload,
      parliament_certificate: parliamentCertificate,
      finality_proof: '0x02'
    };

    const summary = summarizeGovernanceProof(proof);
    expect(summary.validation.ok).toBe(true);
    expect(summary.validation.expectedCertificateHash).toBe(commitment.parliament_certificate_hash);

    expect(
      buildBridgeProofSubmitRequest({
        authority: 'alice@sora',
        kind: 'governance',
        bundle: proof
      })
    ).toEqual({
      authority: 'alice@sora',
      governance_bundle: proof
    });
  });

  it('matches hash-literal commitment roots against hex32 roots', () => {
    const hex = `0x${'ab'.repeat(32)}`;
    expect(commitmentRootsMatch(`hash:${'AB'.repeat(32)}#C50E`, hex)).toBe(true);
    expect(commitmentRootsMatch(`hash:${'AB'.repeat(32)}#C50E`, `0x${'cd'.repeat(32)}`)).toBe(false);
  });
});
