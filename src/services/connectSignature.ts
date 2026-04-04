import type { ContractCallResponse, DetachedSignablePayload } from '@/types';

export type ConnectWalletSignatureRequest =
  | {
      type: 'raw';
      domainTag: string;
      bytesBase64: string;
    }
  | {
      type: 'tx';
      txBytesBase64: string;
    };

export const buildDetachedConnectSignatureRequest = (
  draft: DetachedSignablePayload,
  domainTag: string
): ConnectWalletSignatureRequest => {
  const signingMessage = draft.signing_message_b64?.trim();
  if (signingMessage) {
    return {
      type: 'raw',
      domainTag,
      bytesBase64: signingMessage
    };
  }

  const scaffoldBytes =
    draft.transaction_scaffold_b64?.trim() || draft.signed_transaction_b64?.trim();
  if (scaffoldBytes) {
    return {
      type: 'tx',
      txBytesBase64: scaffoldBytes
    };
  }

  throw new Error('Torii draft did not include a detached signing message or signable transaction bytes.');
};

export const buildContractCallConnectSignatureRequest = (
  draft: ContractCallResponse,
  domainTag: string
) => buildDetachedConnectSignatureRequest(draft, domainTag);
