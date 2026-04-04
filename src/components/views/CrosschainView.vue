<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ExecutionInspector from '@/components/ExecutionInspector.vue';
import {
  BRIDGE_DOMAINS,
  bridgeDomainLabel,
  commitmentRootsMatch,
  deriveBurnMessageId,
  normalizeBridgeHeight,
  normalizeBridgeMessageId,
  normalizeHex32Literal,
  proofKindLabel,
  readBridgeDestinations,
  readBridgeLookupHistory,
  rememberBridgeDestination,
  rememberBridgeLookup,
  removeBridgeDestination,
  summarizeBurnProof,
  summarizeGovernanceProof
} from '@/services/bridge';
import { formatRelativeTime, formatTimestamp, shorten } from '@/services/format';
import { toriiClient } from '@/services/torii';
import type {
  BridgeFinalityBundleResponse,
  BridgeFinalityProofResponse,
  BridgeLookupRecord,
  BridgeProofKind,
  BridgeProofSubmitResult,
  BridgeSavedDestination,
  SccpBurnProofResponse,
  SccpGovernanceProofResponse
} from '@/types';

const props = defineProps<{
  toriiUrl: string;
  authorityAccountId: string | null;
  connectReady: boolean;
  submitBridgeProofViaConnect: (input: {
    kind: BridgeProofKind;
    bundle: SccpBurnProofResponse | SccpGovernanceProofResponse;
  }) => Promise<BridgeProofSubmitResult>;
}>();

const emit = defineEmits<{
  (e: 'open-connect'): void;
}>();

const proofKind = ref<BridgeProofKind>('burn');
const messageIdInput = ref('');
const finalityHeightInput = ref('1');
const deriveSourceDomain = ref(0);
const deriveDestDomain = ref(1);
const deriveAssetId = ref('');
const deriveRecipient = ref('');
const deriveAmount = ref('');
const deriveNonce = ref('');
const destinationLabelInput = ref('');

const proofBusy = ref(false);
const proofError = ref<string | null>(null);
const burnProof = ref<SccpBurnProofResponse | null>(null);
const governanceProof = ref<SccpGovernanceProofResponse | null>(null);
const proofLoadedAt = ref<number | null>(null);
const submitBusy = ref(false);
const submitError = ref<string | null>(null);
const submitResponseJson = ref('');
const submitPipelineJson = ref('');
const submitPipelineNote = ref('');

const finalityBusy = ref(false);
const finalityError = ref<string | null>(null);
const finalityProof = ref<BridgeFinalityProofResponse | null>(null);
const finalityBundle = ref<BridgeFinalityBundleResponse | null>(null);
const finalityLoadedAt = ref<number | null>(null);

const recentLookups = ref<BridgeLookupRecord[]>(readBridgeLookupHistory());
const savedDestinations = ref<BridgeSavedDestination[]>(readBridgeDestinations());

const connectorRows = [
  {
    chain: 'Ethereum / EVM',
    primary: 'WalletConnect first',
    fallback: 'Injected EIP-1193 only when present',
    status: 'Protocol-first'
  },
  {
    chain: 'TON',
    primary: 'TON Connect',
    fallback: 'Deep link handoff',
    status: 'Protocol-native'
  },
  {
    chain: 'TRON',
    primary: 'WalletConnect TRON',
    fallback: 'TronLink when present',
    status: 'Protocol-first'
  },
  {
    chain: 'Solana',
    primary: 'Wallet Standard',
    fallback: 'External handoff',
    status: 'Browser support varies'
  },
  {
    chain: 'Polkadot / Kusama',
    primary: 'Extension interface',
    fallback: 'External handoff',
    status: 'No plugin-only path'
  }
] as const;

const resetSubmitState = () => {
  submitError.value = null;
  submitResponseJson.value = '';
  submitPipelineJson.value = '';
  submitPipelineNote.value = '';
};

const resetProofState = () => {
  proofError.value = null;
  burnProof.value = null;
  governanceProof.value = null;
  proofLoadedAt.value = null;
  resetSubmitState();
};

const resetFinalityState = () => {
  finalityError.value = null;
  finalityProof.value = null;
  finalityBundle.value = null;
  finalityLoadedAt.value = null;
};

watch(
  () => props.toriiUrl,
  () => {
    resetProofState();
    resetFinalityState();
  }
);

watch(proofKind, () => {
  proofError.value = null;
  burnProof.value = null;
  governanceProof.value = null;
  proofLoadedAt.value = null;
});

watch(
  deriveDestDomain,
  (nextDomain) => {
    if (deriveRecipient.value.trim()) return;
    const match = savedDestinations.value.find((item) => item.domainId === nextDomain);
    if (match) {
      deriveRecipient.value = match.recipient;
      destinationLabelInput.value = match.label;
    }
  },
  { immediate: true }
);

const derivedPayload = computed(() => ({
  version: 1,
  source_domain: deriveSourceDomain.value,
  dest_domain: deriveDestDomain.value,
  nonce: deriveNonce.value.trim(),
  sora_asset_id: deriveAssetId.value.trim(),
  amount: deriveAmount.value.trim(),
  recipient: deriveRecipient.value.trim()
}));

const derivedMessageIdError = computed(() => {
  const payload = derivedPayload.value;
  if (!payload.nonce || !payload.sora_asset_id || !payload.amount || !payload.recipient) {
    return 'Enter nonce, asset id, amount, and recipient to derive a canonical burn message id.';
  }

  try {
    normalizeHex32Literal(payload.sora_asset_id, 'Sora asset id');
    normalizeHex32Literal(payload.recipient, 'Recipient');
    deriveBurnMessageId(payload);
    return null;
  } catch (caught) {
    return caught instanceof Error ? caught.message : String(caught);
  }
});

const derivedMessageId = computed(() => {
  if (derivedMessageIdError.value) return '';
  try {
    return deriveBurnMessageId(derivedPayload.value);
  } catch {
    return '';
  }
});
const destinationSaveError = computed(() => {
  if (!deriveRecipient.value.trim()) {
    return 'Enter a recipient hex32 before saving a destination wallet.';
  }
  try {
    normalizeHex32Literal(deriveRecipient.value, 'Recipient');
    return null;
  } catch (caught) {
    return caught instanceof Error ? caught.message : String(caught);
  }
});
const routeSummaryLabel = computed(
  () => `${bridgeDomainLabel(deriveSourceDomain.value)} -> ${bridgeDomainLabel(deriveDestDomain.value)}`
);
const routeDestinations = computed(() =>
  savedDestinations.value.filter((item) => item.domainId === deriveDestDomain.value)
);
const activeDestinationLabel = computed(() => {
  const active = routeDestinations.value.find((item) => item.recipient === deriveRecipient.value.trim());
  return active?.label || null;
});
const transferTrackerStatus = computed(() => {
  if (proofBusy.value) return 'Fetching proof';
  if (proofResult.value) return 'Proof loaded';
  if (derivedMessageId.value) return 'Route is ready to track';
  return 'Enter the transfer route to derive the canonical lookup key';
});

const proofResult = computed(() => (proofKind.value === 'burn' ? burnProof.value : governanceProof.value));
const loadedProofKind = computed<BridgeProofKind>(() =>
  proofKind.value === 'burn' || burnProof.value ? 'burn' : 'governance'
);
const burnSummary = computed(() => (burnProof.value ? summarizeBurnProof(burnProof.value) : null));
const governanceSummary = computed(() =>
  governanceProof.value ? summarizeGovernanceProof(governanceProof.value) : null
);
const submitActionLabel = computed(() => {
  if (submitBusy.value) return 'Submitting proof on Sora...';
  if (!proofResult.value) return 'Load a proof first';
  if (!props.authorityAccountId) return 'Connect a Sora account';
  if (!props.connectReady) return 'Connect wallet session';
  return `Submit ${proofKindLabel(loadedProofKind.value)} on Sora`;
});

const activeProofCommitmentRoot = computed(() => proofResult.value?.commitment_root || null);
const activeFinalityCommitmentRoot = computed(
  () => finalityProof.value?.block_header.sccp_commitment_root || finalityBundle.value?.block_header.sccp_commitment_root || null
);
const proofFinalityRootMatch = computed(() =>
  commitmentRootsMatch(activeProofCommitmentRoot.value, activeFinalityCommitmentRoot.value)
);

const proofJson = computed(() =>
  proofResult.value ? JSON.stringify(proofResult.value, null, 2) : ''
);
const finalityJson = computed(() =>
  finalityProof.value || finalityBundle.value
    ? JSON.stringify(
        {
          proof: finalityProof.value,
          bundle: finalityBundle.value
        },
        null,
        2
      )
    : ''
);
const bridgeInspectorSummary = computed(() => [
  { label: 'Sora account', value: props.authorityAccountId || '--', mono: Boolean(props.authorityAccountId) },
  { label: 'Wallet session', value: props.connectReady ? 'Ready' : 'Needed' },
  { label: 'Route', value: routeSummaryLabel.value },
  { label: 'Tracker', value: transferTrackerStatus.value }
]);
const bridgeInspectorEntries = computed(() => [
  { label: 'Proof payload', value: proofJson.value },
  { label: 'Bridge submit response', value: submitResponseJson.value },
  { label: 'Pipeline status', value: submitPipelineJson.value },
  { label: 'Finality payload', value: finalityJson.value }
]);

const governancePayloadKind = (payload: SccpGovernanceProofResponse['payload']) => {
  if ('Add' in payload) return 'Add';
  if ('Pause' in payload) return 'Pause';
  return 'Resume';
};

const governancePayloadAssetId = (payload: SccpGovernanceProofResponse['payload']) => {
  if ('Add' in payload) return payload.Add.sora_asset_id;
  if ('Pause' in payload) return payload.Pause.sora_asset_id;
  return payload.Resume.sora_asset_id;
};

const governancePayloadTargetDomain = (payload: SccpGovernanceProofResponse['payload']) => {
  if ('Add' in payload) return payload.Add.target_domain;
  if ('Pause' in payload) return payload.Pause.target_domain;
  return payload.Resume.target_domain;
};

const rememberLookup = (record: BridgeLookupRecord) => {
  recentLookups.value = rememberBridgeLookup(record);
};

const applySavedDestination = (destination: BridgeSavedDestination) => {
  deriveDestDomain.value = destination.domainId;
  deriveRecipient.value = destination.recipient;
  destinationLabelInput.value = destination.label;
};

const saveCurrentDestination = () => {
  if (destinationSaveError.value) return;
  const normalizedRecipient = normalizeHex32Literal(deriveRecipient.value, 'Recipient');
  deriveRecipient.value = normalizedRecipient;
  const label =
    destinationLabelInput.value.trim() || `${bridgeDomainLabel(deriveDestDomain.value)} wallet`;
  destinationLabelInput.value = label;
  savedDestinations.value = rememberBridgeDestination({
    domainId: deriveDestDomain.value,
    label,
    recipient: normalizedRecipient,
    updatedAt: Date.now()
  });
};

const deleteSavedDestination = (destination: BridgeSavedDestination) => {
  const next = removeBridgeDestination(destination.domainId, destination.recipient);
  savedDestinations.value = next;
  if (
    deriveDestDomain.value === destination.domainId &&
    deriveRecipient.value.trim() === destination.recipient
  ) {
    const replacement = next.find((item) => item.domainId === destination.domainId) || null;
    deriveRecipient.value = replacement?.recipient || '';
    destinationLabelInput.value = replacement?.label || '';
  }
};

const fetchProof = async () => {
  let messageId = '';
  try {
    messageId = normalizeBridgeMessageId(messageIdInput.value);
    messageIdInput.value = messageId;
  } catch (caught) {
    proofError.value = caught instanceof Error ? caught.message : String(caught);
    return;
  }

  proofBusy.value = true;
  proofError.value = null;
  burnProof.value = null;
  governanceProof.value = null;
  proofLoadedAt.value = null;
  resetSubmitState();

  try {
    if (proofKind.value === 'burn') {
      const nextProof = await toriiClient.fetchSccpBurnProof(props.toriiUrl, messageId);
      if (!nextProof) {
        rememberLookup({
          kind: 'burn',
          value: messageId,
          label: 'Burn proof',
          subtitle: 'Not found on this endpoint',
          success: false,
          lookedUpAt: Date.now()
        });
        throw new Error(`No burn proof was found for ${messageId} on ${props.toriiUrl}.`);
      }
      burnProof.value = nextProof;
      proofLoadedAt.value = Date.now();
      rememberLookup({
        kind: 'burn',
        value: messageId,
        label: 'Burn proof',
        subtitle: `${bridgeDomainLabel(nextProof.payload.source_domain)} -> ${bridgeDomainLabel(nextProof.payload.dest_domain)}`,
        success: true,
        lookedUpAt: Date.now()
      });
      return;
    }

    const nextProof = await toriiClient.fetchSccpGovernanceProof(props.toriiUrl, messageId);
    if (!nextProof) {
      rememberLookup({
        kind: 'governance',
        value: messageId,
        label: 'Governance proof',
        subtitle: 'Not found on this endpoint',
        success: false,
        lookedUpAt: Date.now()
      });
      throw new Error(`No governance proof was found for ${messageId} on ${props.toriiUrl}.`);
    }
    governanceProof.value = nextProof;
    proofLoadedAt.value = Date.now();
    rememberLookup({
      kind: 'governance',
      value: messageId,
      label: 'Governance proof',
      subtitle: `${governancePayloadKind(nextProof.payload)} -> ${bridgeDomainLabel(governancePayloadTargetDomain(nextProof.payload))}`,
      success: true,
      lookedUpAt: Date.now()
    });
  } catch (caught) {
    proofError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    proofBusy.value = false;
  }
};

const fetchFinality = async () => {
  let height = 0;
  try {
    height = normalizeBridgeHeight(finalityHeightInput.value);
    finalityHeightInput.value = String(height);
  } catch (caught) {
    finalityError.value = caught instanceof Error ? caught.message : String(caught);
    return;
  }

  finalityBusy.value = true;
  finalityError.value = null;
  finalityProof.value = null;
  finalityBundle.value = null;
  finalityLoadedAt.value = null;

  try {
    const [nextProof, nextBundle] = await Promise.all([
      toriiClient.fetchBridgeFinality(props.toriiUrl, height),
      toriiClient.fetchBridgeFinalityBundle(props.toriiUrl, height)
    ]);
    if (!nextProof && !nextBundle) {
      rememberLookup({
        kind: 'finality',
        value: String(height),
        label: `Height ${height}`,
        subtitle: 'No finality data found',
        success: false,
        lookedUpAt: Date.now()
      });
      throw new Error(`No bridge finality payload was found for block ${height} on ${props.toriiUrl}.`);
    }
    finalityProof.value = nextProof;
    finalityBundle.value = nextBundle;
    finalityLoadedAt.value = Date.now();
    rememberLookup({
      kind: 'finality',
      value: String(height),
      label: `Height ${height}`,
      subtitle: nextProof?.block_hash ? shorten(nextProof.block_hash, 16, 8) : 'Bundle only',
      success: true,
      lookedUpAt: Date.now()
    });
  } catch (caught) {
    finalityError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    finalityBusy.value = false;
  }
};

const useDerivedMessageId = () => {
  if (!derivedMessageId.value) return;
  proofKind.value = 'burn';
  messageIdInput.value = derivedMessageId.value;
};

const trackDerivedTransfer = async () => {
  if (!derivedMessageId.value) return;
  useDerivedMessageId();
  await fetchProof();
};

const replayLookup = async (lookup: BridgeLookupRecord) => {
  if (lookup.kind === 'finality') {
    finalityHeightInput.value = lookup.value;
    await fetchFinality();
    return;
  }
  proofKind.value = lookup.kind;
  messageIdInput.value = lookup.value;
  await fetchProof();
};

const submitLoadedProof = async () => {
  if (!proofResult.value) {
    submitError.value = 'Load a burn or governance proof before submitting it on Sora.';
    return;
  }
  if (!props.authorityAccountId || !props.connectReady) {
    emit('open-connect');
    return;
  }

  submitBusy.value = true;
  submitError.value = null;
  submitResponseJson.value = '';
  submitPipelineJson.value = '';
  submitPipelineNote.value = '';

  try {
    const response = await props.submitBridgeProofViaConnect({
      kind: loadedProofKind.value,
      bundle: proofResult.value
    });
    submitResponseJson.value = JSON.stringify(response.response, null, 2);
    if (response.pipelineStatus) {
      submitPipelineJson.value = JSON.stringify(response.pipelineStatus, null, 2);
      submitPipelineNote.value = response.pipelineCompleted
        ? `Pipeline confirmation reached ${response.pipelineStatus.content.status.kind}.`
        : `Latest pipeline status is ${response.pipelineStatus.content.status.kind}.`;
    } else if (response.response.tx_hash_hex) {
      submitPipelineNote.value = 'Detached submit returned a transaction hash, but pipeline status is not visible yet.';
    }
  } catch (caught) {
    submitError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    submitBusy.value = false;
  }
};
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero">
      <p class="eyebrow">Crosschain</p>
      <h2 class="panel-title">Transfer tracker</h2>
      <p class="panel-subtitle">
        Start from route, token, amount, and recipient. The page derives the canonical lookup key, pulls live SCCP bundles from Torii, compares finality, and can submit the Sora-side proof path when a bundle is ready.
      </p>
      <div class="metric-grid">
        <article class="metric-card">
          <span class="metric-label">Route</span>
          <strong class="metric-value">{{ routeSummaryLabel }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Sora account</span>
          <strong class="metric-value mono">{{ authorityAccountId || '--' }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Tracker</span>
          <strong class="metric-value">{{ transferTrackerStatus }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Recent lookups</span>
          <strong class="metric-value">{{ recentLookups.length }}</strong>
        </article>
      </div>
      <div class="action-row">
        <button class="button" type="button" @click="emit('open-connect')">
          {{ connectReady ? 'Review wallet session' : 'Open wallet and account setup' }}
        </button>
      </div>
    </section>

    <div class="split-grid">
      <section class="panel">
        <p class="eyebrow">Route planner</p>
        <div class="section-head section-head--spread">
          <div class="stack stack--tight">
            <h3 class="panel-title">Start with the transfer route</h3>
            <p class="panel-subtitle">
              Fill the burn route first. The tracker derives the canonical burn message id that Torii uses for proof lookup, then you can fetch the live bundle in one step.
            </p>
          </div>
        </div>

        <div class="form-grid">
          <label class="field">
            <span>Source domain</span>
            <select v-model.number="deriveSourceDomain" class="select">
              <option v-for="domain in BRIDGE_DOMAINS" :key="domain.id" :value="domain.id">
                {{ domain.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>Destination domain</span>
            <select v-model.number="deriveDestDomain" class="select">
              <option v-for="domain in BRIDGE_DOMAINS" :key="`dest-${domain.id}`" :value="domain.id">
                {{ domain.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>Nonce</span>
            <input v-model="deriveNonce" class="input mono" type="text" placeholder="7" spellcheck="false" />
          </label>
          <label class="field">
            <span>Amount</span>
            <input v-model="deriveAmount" class="input mono" type="text" placeholder="42" spellcheck="false" />
          </label>
          <label class="field">
            <span>Sora asset id hex32</span>
            <input
              v-model="deriveAssetId"
              class="input mono"
              type="text"
              placeholder="0x..."
              spellcheck="false"
              autocomplete="off"
            />
          </label>
          <label class="field">
            <span>Recipient hex32</span>
            <input
              v-model="deriveRecipient"
              class="input mono"
              type="text"
              placeholder="0x..."
              spellcheck="false"
              autocomplete="off"
            />
          </label>
        </div>

        <div class="panel panel--quiet">
          <p class="eyebrow">Canonical lookup key</p>
          <strong v-if="derivedMessageId" class="bridge-derived-id mono">{{ derivedMessageId }}</strong>
          <p v-else class="panel-subtitle bridge-inline-copy">{{ derivedMessageIdError }}</p>
        </div>

        <div class="summary-list summary-list--dense">
          <div>
            <span>Route</span>
            <strong>{{ routeSummaryLabel }}</strong>
          </div>
          <div>
            <span>Destination wallet</span>
            <strong>{{ activeDestinationLabel || 'Manual entry' }}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{{ transferTrackerStatus }}</strong>
          </div>
          <div>
            <span>What this key does</span>
            <strong>Direct Torii proof lookup for burn transfers</strong>
          </div>
          <div>
            <span>Sora endpoint</span>
            <strong class="mono">{{ toriiUrl }}</strong>
          </div>
        </div>

        <div class="panel panel--quiet">
          <p class="eyebrow">Linked destination wallets</p>
          <div class="section-head section-head--spread">
            <div class="stack stack--tight">
              <h3 class="panel-title">Reuse the remote recipient by route</h3>
              <p class="panel-subtitle">
                Save the destination wallet once for each remote domain and the tracker can start from a known route target instead of a pasted hex32 every time.
              </p>
            </div>
          </div>

          <div v-if="routeDestinations.length" class="market-list">
            <article
              v-for="destination in routeDestinations"
              :key="`${destination.domainId}:${destination.recipient}`"
              class="market-list__item is-active bridge-destination-item"
            >
              <div>
                <span class="market-list__pair">{{ destination.label }}</span>
                <span class="market-list__route">
                  {{ bridgeDomainLabel(destination.domainId) }} • {{ formatRelativeTime(destination.updatedAt) }}
                </span>
                <strong class="mono bridge-destination-recipient">
                  {{ shorten(destination.recipient, 18, 10) }}
                </strong>
              </div>
              <div class="bridge-destination-actions">
                <button class="button is-ghost" type="button" @click="applySavedDestination(destination)">
                  Use
                </button>
                <button class="button is-ghost" type="button" @click="deleteSavedDestination(destination)">
                  Remove
                </button>
              </div>
            </article>
          </div>
          <p v-else class="panel-subtitle">
            No saved destination wallet for {{ bridgeDomainLabel(deriveDestDomain) }} yet.
          </p>

          <div class="form-grid">
            <label class="field">
              <span>Destination label</span>
              <input
                v-model="destinationLabelInput"
                class="input"
                type="text"
                placeholder="Main Ethereum wallet"
                spellcheck="false"
                autocomplete="off"
              />
            </label>
          </div>

          <p class="panel-subtitle bridge-inline-copy">{{ destinationSaveError || 'Saved recipients stay on this device and are scoped by destination domain.' }}</p>

          <div class="action-row">
            <button
              class="button is-ghost"
              type="button"
              :disabled="Boolean(destinationSaveError)"
              @click="saveCurrentDestination"
            >
              Save destination wallet
            </button>
          </div>
        </div>

        <div class="action-row">
          <button class="button" type="button" :disabled="!derivedMessageId || proofBusy" @click="trackDerivedTransfer">
            {{ proofBusy ? 'Fetching proof...' : 'Track derived transfer' }}
          </button>
          <button class="button is-ghost" type="button" :disabled="!derivedMessageId" @click="useDerivedMessageId">
            Use derived message id
          </button>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Transfer evidence</p>
        <div class="section-head section-head--spread">
          <div class="stack stack--tight">
            <h3 class="panel-title">Fetch a live SCCP bundle</h3>
            <p class="panel-subtitle">
              Use the derived burn key above or paste any canonical message id to inspect the current bridge evidence directly from Torii.
            </p>
          </div>
          <div class="subtabs">
            <button
              class="subtab"
              :class="{ 'is-active': proofKind === 'burn' }"
              type="button"
              @click="proofKind = 'burn'"
            >
              Burn
            </button>
            <button
              class="subtab"
              :class="{ 'is-active': proofKind === 'governance' }"
              type="button"
              @click="proofKind = 'governance'"
            >
              Governance
            </button>
          </div>
        </div>

        <div class="field">
          <span>{{ proofKindLabel(proofKind) }} message id</span>
          <input
            v-model="messageIdInput"
            class="input mono"
            type="text"
            placeholder="0x..."
            spellcheck="false"
            autocomplete="off"
          />
        </div>

        <div class="action-row">
          <button class="button" type="button" :disabled="proofBusy" @click="fetchProof">
            {{ proofBusy ? 'Fetching proof...' : `Fetch ${proofKindLabel(proofKind)}` }}
          </button>
        </div>

        <p v-if="proofError" class="inline-error">{{ proofError }}</p>

        <template v-if="burnProof && burnSummary">
          <div class="summary-list summary-list--dense">
            <div>
              <span>Direction</span>
              <strong>{{ burnSummary.directionLabel }}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong class="mono">{{ burnProof.payload.amount }}</strong>
            </div>
            <div>
              <span>Asset id</span>
              <strong class="mono">{{ burnSummary.assetIdShort }}</strong>
            </div>
            <div>
              <span>Recipient</span>
              <strong class="mono">{{ burnSummary.recipientShort }}</strong>
            </div>
            <div>
              <span>Commitment root</span>
              <strong class="mono">{{ shorten(burnProof.commitment_root, 18, 10) }}</strong>
            </div>
            <div>
              <span>Loaded</span>
              <strong>{{ formatTimestamp(proofLoadedAt) }}</strong>
            </div>
          </div>

          <div class="bridge-checks">
            <div
              v-for="(passed, key) in burnSummary.validation.checks"
              :key="key"
              class="bridge-check"
              :class="{ 'is-pass': passed, 'is-fail': !passed }"
            >
              <span>{{ key }}</span>
              <strong>{{ passed ? 'Pass' : 'Fail' }}</strong>
            </div>
          </div>

          <div class="panel panel--quiet">
            <p class="eyebrow">Derived integrity</p>
            <div class="summary-list summary-list--dense">
              <div>
                <span>Expected message id</span>
                <strong class="mono">{{ shorten(burnSummary.validation.expectedMessageId, 18, 10) }}</strong>
              </div>
              <div>
                <span>Expected payload hash</span>
                <strong class="mono">{{ shorten(burnSummary.validation.expectedPayloadHash, 18, 10) }}</strong>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="governanceProof && governanceSummary">
          <div class="summary-list summary-list--dense">
            <div>
              <span>Payload kind</span>
              <strong>{{ governancePayloadKind(governanceProof.payload) }}</strong>
            </div>
            <div>
              <span>Target domain</span>
              <strong>{{ governanceSummary.targetDomainLabel }}</strong>
            </div>
            <div>
              <span>Asset id</span>
              <strong class="mono">{{ shorten(governancePayloadAssetId(governanceProof.payload), 18, 10) }}</strong>
            </div>
            <div>
              <span>Loaded</span>
              <strong>{{ formatTimestamp(proofLoadedAt) }}</strong>
            </div>
            <div>
              <span>Commitment root</span>
              <strong class="mono">{{ shorten(governanceProof.commitment_root, 18, 10) }}</strong>
            </div>
            <div>
              <span>Certificate hash</span>
              <strong class="mono">
                {{ governanceSummary.validation.expectedCertificateHash ? shorten(governanceSummary.validation.expectedCertificateHash, 18, 10) : '--' }}
              </strong>
            </div>
          </div>

          <div class="bridge-checks">
            <div
              v-for="(passed, key) in governanceSummary.validation.checks"
              :key="key"
              class="bridge-check"
              :class="{ 'is-pass': passed, 'is-fail': !passed }"
            >
              <span>{{ key }}</span>
              <strong>{{ passed ? 'Pass' : 'Fail' }}</strong>
            </div>
          </div>

        </template>

        <template v-if="proofResult">
          <div class="panel panel--quiet">
            <p class="eyebrow">Sora submit</p>
            <div class="summary-list summary-list--dense">
              <div>
                <span>Proof kind</span>
                <strong>{{ proofKindLabel(loadedProofKind) }}</strong>
              </div>
              <div>
                <span>Authority</span>
                <strong class="mono">{{ authorityAccountId || '--' }}</strong>
              </div>
              <div>
                <span>Wallet session</span>
                <strong>{{ connectReady ? 'Ready for detached signing' : 'Connect required' }}</strong>
              </div>
              <div>
                <span>Submit model</span>
                <strong>Torii draft, Connect signature, Torii submit</strong>
              </div>
            </div>
          </div>

          <div class="action-row">
            <button class="button" type="button" :disabled="submitBusy" @click="submitLoadedProof">
              {{ submitActionLabel }}
            </button>
          </div>

          <p v-if="submitError" class="inline-error">{{ submitError }}</p>

          <div v-if="submitPipelineNote" class="bridge-match-note" :class="{ 'is-pass': !submitError, 'is-fail': Boolean(submitError) }">
            <strong>{{ submitPipelineNote }}</strong>
            <span>Bridge proof submit uses the live Torii bridge-proof route on {{ toriiUrl }}.</span>
          </div>
        </template>
      </section>
    </div>

    <section class="panel">
      <p class="eyebrow">Block finality</p>
      <div class="section-head section-head--spread">
        <div class="stack stack--tight">
          <h3 class="panel-title">Inspect bridge finality for a block height</h3>
          <p class="panel-subtitle">
            Pull the self-contained proof and the commitment bundle together, then compare their SCCP root against the active proof bundle when both are loaded.
          </p>
        </div>
        <div class="action-row">
          <input
            v-model="finalityHeightInput"
            class="input mono bridge-height-input"
            type="text"
            inputmode="numeric"
            spellcheck="false"
            placeholder="1"
          />
          <button class="button" type="button" :disabled="finalityBusy" @click="fetchFinality">
            {{ finalityBusy ? 'Fetching finality...' : 'Fetch finality' }}
          </button>
        </div>
      </div>

      <p v-if="finalityError" class="inline-error">{{ finalityError }}</p>

      <template v-if="finalityProof || finalityBundle">
        <div class="summary-list">
          <div>
            <span>Height</span>
            <strong>{{ finalityProof?.height || finalityBundle?.commitment.block_height || '--' }}</strong>
          </div>
          <div>
            <span>Chain id</span>
            <strong class="mono">{{ finalityProof?.chain_id || finalityBundle?.commitment.chain_id || '--' }}</strong>
          </div>
          <div>
            <span>Block hash</span>
            <strong class="mono">{{ shorten(finalityProof?.block_hash || finalityBundle?.commitment.block_hash || '--', 18, 8) }}</strong>
          </div>
          <div>
            <span>Validator set</span>
            <strong>{{ finalityProof?.commit_qc.validator_set.length || finalityBundle?.commitment.authority_set.validator_set.length || 0 }} validators</strong>
          </div>
          <div>
            <span>SCCP root</span>
            <strong class="mono">{{ shorten(activeFinalityCommitmentRoot || '--', 18, 10) }}</strong>
          </div>
          <div>
            <span>Loaded</span>
            <strong>{{ formatTimestamp(finalityLoadedAt) }}</strong>
          </div>
        </div>

        <div class="summary-list summary-list--dense">
          <div>
            <span>MMR root</span>
            <strong class="mono">{{ shorten(finalityBundle?.commitment.mmr_root || '--', 18, 8) }}</strong>
          </div>
          <div>
            <span>Bundle signatures</span>
            <strong>{{ finalityBundle?.justification.signatures.length || 0 }}</strong>
          </div>
          <div>
            <span>Commit QC view</span>
            <strong>{{ finalityProof?.commit_qc.view ?? finalityBundle?.commit_qc.view ?? '--' }}</strong>
          </div>
          <div>
            <span>Commit QC epoch</span>
            <strong>{{ finalityProof?.commit_qc.epoch ?? finalityBundle?.commit_qc.epoch ?? '--' }}</strong>
          </div>
        </div>

        <div
          v-if="proofFinalityRootMatch !== null"
          class="bridge-match-note"
          :class="{ 'is-pass': proofFinalityRootMatch, 'is-fail': !proofFinalityRootMatch }"
        >
          <strong>{{ proofFinalityRootMatch ? 'Commitment roots line up.' : 'Commitment roots do not line up.' }}</strong>
          <span>
            Active proof root {{ proofFinalityRootMatch ? 'matches' : 'does not match' }} the fetched block finality root.
          </span>
        </div>

        <div class="notice">
          Raw finality payload stays in the inspector below so this surface can stay focused on the bridge checks and the commitment match.
        </div>
      </template>
    </section>

    <div class="split-grid">
      <section class="panel">
        <p class="eyebrow">Recent lookups</p>
        <h3 class="panel-title">Jump back into a transfer or block</h3>
        <div v-if="recentLookups.length" class="market-list">
          <button
            v-for="lookup in recentLookups"
            :key="`${lookup.kind}:${lookup.value}`"
            class="market-list__item bridge-history-item"
            :class="{ 'is-active': lookup.success }"
            type="button"
            @click="replayLookup(lookup)"
          >
            <div>
              <span class="market-list__pair">{{ lookup.label }}</span>
              <span class="market-list__route">{{ lookup.subtitle }}</span>
            </div>
            <div class="market-list__stats">
              <strong class="mono">
                {{ lookup.kind === 'finality' ? `#${lookup.value}` : shorten(lookup.value, 12, 8) }}
              </strong>
              <span>{{ formatRelativeTime(lookup.lookedUpAt) }}</span>
            </div>
          </button>
        </div>
        <p v-else class="panel-subtitle">
          Proof and finality lookups you complete here stay on this device so you can jump back into them quickly.
        </p>
      </section>

      <section class="panel">
        <p class="eyebrow">Connector policy</p>
        <h3 class="panel-title">Protocol connectors still define the real bridge path</h3>
        <p class="panel-subtitle">
          Browser plugins are optional acceleration paths, not the product model. This page keeps route destinations on-device today while the actual protocol connector layer catches up.
        </p>
        <div class="market-list">
          <article v-for="row in connectorRows" :key="row.chain" class="market-list__item is-active">
            <div>
              <span class="market-list__pair">{{ row.chain }}</span>
              <span class="market-list__route">{{ row.status }}</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ row.primary }}</strong>
              <span>{{ row.fallback }}</span>
            </div>
          </article>
        </div>
      </section>
    </div>

    <ExecutionInspector
      title="Bridge inspector"
      subtitle="Raw proof, finality, and submit payloads stay visible here while the main workspace stays focused on route planning and proof checks."
      :summary="bridgeInspectorSummary"
      :entries="bridgeInspectorEntries"
      empty-copy="Track a transfer or fetch finality and the bridge payload stream will appear here."
    />
  </div>
</template>
