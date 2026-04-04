import { ed25519 } from '@noble/curves/ed25519';
import { reactive, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { decodeSingleKeyEd25519AccountPublicKey } from '@/services/accountAddress';
import { openConnectWebSocket } from '@/services/connect';
import {
  base64ToBytes,
  buildApprovePreimage,
  bytesToHex,
  decodeConnectEnvelope,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeCiphertextConnectFrame,
  encodeOpenConnectFrame,
  encodePongConnectFrame,
  encryptConnectEnvelope,
  hexToBytes
} from '@/services/connectWire';
import type {
  ConnectEnvelopePayload,
  ConnectPermissions,
  ConnectPreview,
  ConnectSessionResponse,
  ConnectWalletSignature,
  LiveConnectState
} from '@/types';
import type { ConnectWalletSignatureRequest } from '@/services/connectSignature';

const DEFAULT_PERMISSIONS: ConnectPermissions = {
  methods: ['SIGN_REQUEST_TX', 'SIGN_REQUEST_RAW'],
  events: ['DISPLAY_REQUEST'],
  resources: null
};

const createInitialState = (): LiveConnectState => ({
  phase: 'idle',
  socketState: 'closed',
  sessionId: null,
  approvedAccountId: null,
  walletPublicKeyHex: null,
  openSent: false,
  pendingRequest: false,
  approvalVerified: null,
  lastFrame: null,
  lastEnvelope: null,
  lastError: null,
  lastUpdatedAt: null
});

const touch = (state: LiveConnectState) => {
  state.lastUpdatedAt = Date.now();
};

const readMessageBytes = async (value: Blob | ArrayBuffer | Uint8Array | string) => {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  throw new Error('unsupported WebSocket message type');
};

const buildSignatureRequestPayload = (
  input: ConnectWalletSignatureRequest
): Extract<ConnectEnvelopePayload, { type: 'sign_request_raw' | 'sign_request_tx' }> => {
  if (input.type === 'tx') {
    const txBytes = base64ToBytes(input.txBytesBase64);
    return {
      type: 'sign_request_tx',
      txBytesHex: bytesToHex(txBytes),
      txBytesBase64: input.txBytesBase64,
      txBytesLength: txBytes.length
    };
  }

  const requestBytes = base64ToBytes(input.bytesBase64);
  return {
    type: 'sign_request_raw',
    domainTag: input.domainTag,
    bytesHex: bytesToHex(requestBytes),
    bytesBase64: input.bytesBase64,
    bytesLength: requestBytes.length
  };
};

export const useLiveConnectSession = (
  toriiUrl: MaybeRefOrGetter<string>,
  input: {
    chainId: MaybeRefOrGetter<string>;
    appName: MaybeRefOrGetter<string>;
    appUrl: MaybeRefOrGetter<string>;
  }
) => {
  const state = reactive<LiveConnectState>(createInitialState());
  let socket: WebSocket | null = null;
  let currentPreview: ConnectPreview | null = null;
  let nextOutgoingSeq = 1;
  let directionKeys: { appKey: Uint8Array; walletKey: Uint8Array } | null = null;
  let pendingSignatureRequest:
    | {
        resolve: (signature: ConnectWalletSignature) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  const reset = () => {
    Object.assign(state, createInitialState());
  };

  const rejectPendingRequest = (message: string) => {
    if (!pendingSignatureRequest) return;
    pendingSignatureRequest.reject(new Error(message));
    pendingSignatureRequest = null;
    state.pendingRequest = false;
    touch(state);
  };

  const close = (code = 1000, reason = 'app closed connect session') => {
    rejectPendingRequest(reason);
    directionKeys = null;
    if (socket) {
      socket.close(code, reason);
      socket = null;
    }
    currentPreview = null;
    reset();
    state.phase = 'closed';
    touch(state);
  };

  const sendBytes = (bytes: Uint8Array) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Connect socket is not open');
    }
    socket.send(bytes);
  };

  const takeNextOutgoingSeq = () => {
    const seq = nextOutgoingSeq;
    nextOutgoingSeq += 1;
    return seq;
  };

  const verifyApproval = (
    preview: ConnectPreview,
    accountId: string,
    walletPublicKeyHex: string,
    signature: ConnectWalletSignature,
    permissions: ConnectPermissions | null,
    proof: { domain: string; uri: string; statement: string; issuedAt: string; nonce: string } | null
  ) => {
    try {
      const accountPublicKey = decodeSingleKeyEd25519AccountPublicKey(accountId);
      const preimage = buildApprovePreimage({
        sid: preview.sid,
        appPublicKeyHex: preview.publicKeyHex,
        walletPublicKeyHex,
        accountId,
        permissions,
        proof
      });
      return ed25519.verify(hexToBytes(signature.signatureHex), preimage, accountPublicKey);
    } catch {
      return null;
    }
  };

  const handleEnvelope = (envelope: ReturnType<typeof decodeConnectEnvelope>) => {
    state.lastEnvelope = envelope;
    touch(state);

    switch (envelope.payload.type) {
      case 'sign_result_ok':
        if (!pendingSignatureRequest) {
          state.lastError = 'wallet returned an unexpected signature result';
          return;
        }
        state.pendingRequest = false;
        pendingSignatureRequest.resolve(envelope.payload.signature);
        pendingSignatureRequest = null;
        return;
      case 'sign_result_err':
        rejectPendingRequest(`${envelope.payload.code}: ${envelope.payload.message}`);
        state.lastError = `${envelope.payload.code}: ${envelope.payload.message}`;
        return;
      case 'control_close':
        rejectPendingRequest(`${envelope.payload.code}: ${envelope.payload.reason}`);
        state.phase = 'closed';
        state.lastError = `${envelope.payload.code}: ${envelope.payload.reason}`;
        return;
      case 'control_reject':
        rejectPendingRequest(`${envelope.payload.codeId}: ${envelope.payload.reason}`);
        state.phase = 'error';
        state.lastError = `${envelope.payload.codeId}: ${envelope.payload.reason}`;
        return;
      default:
        return;
    }
  };

  const handleFrame = (frame: ReturnType<typeof decodeConnectFrame>) => {
    state.lastFrame = frame;
    touch(state);

    if (frame.kind === 'ciphertext' && frame.ciphertext && currentPreview) {
      if (!directionKeys) {
        throw new Error('received encrypted Connect frame before approval');
      }
      const envelope = decryptConnectEnvelope(
        directionKeys.walletKey,
        currentPreview.sid,
        frame.direction,
        frame.seq,
        hexToBytes(frame.ciphertext.aeadHex)
      );
      handleEnvelope(envelope);
      return;
    }

    if (!frame.control) {
      return;
    }

    if (frame.control.type === 'ping' && currentPreview) {
      sendBytes(encodePongConnectFrame(currentPreview.sid, takeNextOutgoingSeq(), frame.control.nonce));
      return;
    }

    if (frame.control.type === 'approve' && currentPreview) {
      directionKeys = deriveConnectDirectionKeys(currentPreview, frame.control.walletPublicKeyHex);
      state.phase = 'approved';
      state.approvedAccountId = frame.control.accountId;
      state.walletPublicKeyHex = frame.control.walletPublicKeyHex;
      state.approvalVerified = verifyApproval(
        currentPreview,
        frame.control.accountId,
        frame.control.walletPublicKeyHex,
        frame.control.signature,
        frame.control.permissions,
        frame.control.proof
      );
      return;
    }

    if (frame.control.type === 'reject') {
      rejectPendingRequest(`${frame.control.codeId}: ${frame.control.reason}`);
      state.phase = 'rejected';
      state.lastError = `${frame.control.codeId}: ${frame.control.reason}`;
      return;
    }

    if (frame.control.type === 'close') {
      rejectPendingRequest(`${frame.control.code}: ${frame.control.reason}`);
      state.phase = 'closed';
      state.lastError = `${frame.control.code}: ${frame.control.reason}`;
    }
  };

  const start = (preview: ConnectPreview, session: ConnectSessionResponse) => {
    if (!session.token_app) {
      throw new Error('Torii Connect session did not return token_app');
    }

    rejectPendingRequest('replaced by newer connect session');
    directionKeys = null;
    nextOutgoingSeq = 1;

    if (socket) {
      socket.close(1000, 'replaced by newer connect session');
      socket = null;
    }

    currentPreview = preview;
    reset();
    state.phase = 'registered';
    state.socketState = 'opening';
    state.sessionId = preview.sid;
    touch(state);

    const ws = openConnectWebSocket(toValue(toriiUrl), preview.sid, session.token_app, 'app');
    socket = ws;
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      if (socket !== ws || !currentPreview) return;
      try {
        sendBytes(
          encodeOpenConnectFrame(currentPreview, {
            chainId: toValue(input.chainId),
            appName: toValue(input.appName),
            appUrl: toValue(input.appUrl) || null,
            permissions: DEFAULT_PERMISSIONS
          })
        );
        nextOutgoingSeq = 2;
        state.openSent = true;
        state.phase = 'awaiting_approval';
        state.socketState = 'open';
        touch(state);
      } catch (error) {
        state.phase = 'error';
        state.socketState = 'open';
        state.lastError = error instanceof Error ? error.message : String(error);
        touch(state);
      }
    });

    ws.addEventListener('message', async (event) => {
      if (socket !== ws) return;
      try {
        const bytes = await readMessageBytes(event.data as Blob | ArrayBuffer | Uint8Array | string);
        handleFrame(decodeConnectFrame(bytes));
      } catch (error) {
        rejectPendingRequest(error instanceof Error ? error.message : String(error));
        state.phase = 'error';
        state.lastError = error instanceof Error ? error.message : String(error);
        touch(state);
      }
    });

    ws.addEventListener('error', () => {
      if (socket !== ws) return;
      state.phase = state.phase === 'approved' ? state.phase : 'error';
      state.lastError = state.lastError || 'Connect WebSocket error';
      touch(state);
    });

    ws.addEventListener('close', (event) => {
      if (socket !== ws) return;
      socket = null;
      rejectPendingRequest(event.reason || 'Connect socket closed');
      state.socketState = 'closed';
      if (state.phase !== 'approved' && state.phase !== 'rejected') {
        state.phase = 'closed';
      }
      if (event.reason && !state.lastError) {
        state.lastError = event.reason;
      }
      touch(state);
    });
  };

  watch(
    () => [toValue(toriiUrl), toValue(input.chainId), toValue(input.appName), toValue(input.appUrl)] as const,
    () => {
      if (!state.sessionId && state.phase === 'idle') return;
      close(1000, 'runtime settings changed');
    }
  );

  const requestWalletSignature = async (input: ConnectWalletSignatureRequest) => {
    if (!currentPreview || !directionKeys) {
      throw new Error('Approve the Connect session before requesting signatures.');
    }
    if (state.phase !== 'approved') {
      throw new Error(`Connect session is not ready for signing (${state.phase}).`);
    }
    if (pendingSignatureRequest) {
      throw new Error('another wallet signature request is already in flight');
    }

    const seq = takeNextOutgoingSeq();
    const preview = currentPreview;
    const aead = encryptConnectEnvelope(
      directionKeys.appKey,
      preview.sid,
      'app_to_wallet',
      seq,
      buildSignatureRequestPayload(input)
    );

    state.pendingRequest = true;
    touch(state);

    return await new Promise<ConnectWalletSignature>((resolve, reject) => {
      pendingSignatureRequest = { resolve, reject };
      try {
        sendBytes(
          encodeCiphertextConnectFrame({
            sid: preview.sid,
            direction: 'app_to_wallet',
            seq,
            aead
          })
        );
      } catch (error) {
        pendingSignatureRequest = null;
        state.pendingRequest = false;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  return {
    state,
    start,
    close,
    requestWalletSignature
  };
};
