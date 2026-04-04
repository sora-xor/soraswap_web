import { describe, expect, test } from 'vitest';
import {
  buildContractCallConnectSignatureRequest,
  buildDetachedConnectSignatureRequest
} from '@/services/connectSignature';
import type { ContractCallResponse } from '@/types';

const makeDraft = (overrides: Partial<ContractCallResponse> = {}): ContractCallResponse => ({
  ok: true,
  submitted: false,
  dataspace: 'universal',
  contract_id: 'dlmm_pool',
  contract_address: 'sorac1example',
  code_hash_hex: 'aa',
  abi_hash_hex: 'bb',
  creation_time_ms: 1,
  ...overrides,
});

describe('connect signature request selection', () => {
  test('supports generic detached signing payloads outside contract calls', () => {
    expect(
      buildDetachedConnectSignatureRequest(
        {
          signing_message_b64: 'bridge-proof-message-b64'
        },
        'IROHA_TORII_BRIDGE_PROOF'
      )
    ).toEqual({
      type: 'raw',
      domainTag: 'IROHA_TORII_BRIDGE_PROOF',
      bytesBase64: 'bridge-proof-message-b64'
    });
  });

  test('prefers detached signing messages for detached submit', () => {
    expect(
      buildContractCallConnectSignatureRequest(
        makeDraft({
          transaction_scaffold_b64: 'explicit-scaffold-b64',
          signed_transaction_b64: 'legacy-scaffold-b64',
          signing_message_b64: 'detached-message-b64'
        }),
        'IROHA_TORII_CONTRACT_CALL'
      )
    ).toEqual({
      type: 'raw',
      domainTag: 'IROHA_TORII_CONTRACT_CALL',
      bytesBase64: 'detached-message-b64'
    });
  });

  test('falls back to transaction scaffolds when no detached signing message is present', () => {
    expect(
      buildContractCallConnectSignatureRequest(
        makeDraft({
          transaction_scaffold_b64: 'explicit-scaffold-b64',
          signed_transaction_b64: null,
          signing_message_b64: null,
        }),
        'IROHA_TORII_CONTRACT_CALL'
      )
    ).toEqual({
      type: 'tx',
      txBytesBase64: 'explicit-scaffold-b64'
    });
  });

  test('rejects drafts that contain no signable payload', () => {
    expect(() =>
      buildContractCallConnectSignatureRequest(
        makeDraft({
          signed_transaction_b64: null,
          signing_message_b64: null,
        }),
        'IROHA_TORII_CONTRACT_CALL'
      )
    ).toThrow(/did not include a detached signing message or signable transaction bytes/i);
  });
});
