<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ConnectDrawer from '@/components/ConnectDrawer.vue';
import Layout from '@/components/Layout.vue';
import CrosschainView from '@/components/views/CrosschainView.vue';
import DefiView from '@/components/views/DefiView.vue';
import LaunchpadView from '@/components/views/LaunchpadView.vue';
import MoreView from '@/components/views/MoreView.vue';
import SwapView from '@/components/views/SwapView.vue';
import WalletView from '@/components/views/WalletView.vue';
import { useLiveConnectSession } from '@/composables/useLiveConnectSession';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { useToriiRuntime } from '@/composables/useToriiRuntime';
import { useWalletWatch } from '@/composables/useWalletWatch';
import { resolveAuthorityPublicKeyHex } from '@/services/accountAddress';
import {
  buildBridgeProofSubmitRequest,
  prepareBridgeProofSubmit,
  submitBridgeProofDetached
} from '@/services/bridge';
import { createConnectPreview, registerConnectSession } from '@/services/connect';
import { buildDetachedConnectSignatureRequest } from '@/services/connectSignature';
import { submitContractCallDetached } from '@/services/contracts';
import { resolveRuntimePreset, STORAGE_KEYS } from '@/services/env';
import { summarizeRegistryCoverage } from '@/services/registry';
import { waitForPipelineTransactionStatus } from '@/services/torii';
import { buildPath, getRoutePathFromLocation, isHashRouting, parseRoute, resolveHashRoutingEntryPath } from '@/viewRoutes';
import type {
  AppRuntimeConfig,
  BridgeProofKind,
  BridgeProofSubmitResult,
  ConnectPreview,
  ConnectSessionResponse,
  ContractCallDraftRequest,
  ContractCallResponse,
  ContractCallSubmitResult,
  DetachedSignablePayload,
  RouteState,
  RuntimePresetId,
  SccpBurnProofResponse,
  SccpGovernanceProofResponse,
  ThemeMode,
  ViewType
} from '@/types';

const safeGetItem = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};

const useHashRouting = isHashRouting();
const initialPath = typeof window !== 'undefined' ? getRoutePathFromLocation(window.location) : '/swap';
const routeState = ref<RouteState>(parseRoute(initialPath));
const activeView = computed(() => routeState.value.view);
const connectDrawerOpen = ref(false);

const toHistoryState = (state: RouteState): RouteState => ({
  view: state.view,
  ...(state.swapFrom ? { swapFrom: state.swapFrom } : {}),
  ...(state.swapTo ? { swapTo: state.swapTo } : {}),
  ...(state.launchpadMode ? { launchpadMode: state.launchpadMode } : {}),
  ...(state.launchpadId ? { launchpadId: state.launchpadId } : {})
});

const syncUrl = (nextState: RouteState, replace = false) => {
  if (typeof window === 'undefined') return;
  const path = buildPath(nextState);
  const targetPath = useHashRouting
    ? `${resolveHashRoutingEntryPath(window.location.pathname)}${window.location.search}${path}`
    : `${path}${window.location.search}${window.location.hash}`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history[replace || currentPath === targetPath ? 'replaceState' : 'pushState'](
    toHistoryState(nextState),
    '',
    targetPath
  );
};

const applyRoute = (path: string, replace = false) => {
  const parsed = parseRoute(path);
  routeState.value = parsed;
  syncUrl(parsed, replace);
};

const changeView = (view: ViewType, meta: Partial<RouteState> = {}, replace = false) => {
  routeState.value = {
    view,
    swapFrom: view === 'swap' ? meta.swapFrom ?? routeState.value.swapFrom : routeState.value.swapFrom,
    swapTo: view === 'swap' ? meta.swapTo ?? routeState.value.swapTo : routeState.value.swapTo,
    launchpadMode: view === 'launchpad' ? meta.launchpadMode ?? routeState.value.launchpadMode : undefined,
    launchpadId: view === 'launchpad' ? meta.launchpadId ?? routeState.value.launchpadId : undefined
  };
  syncUrl(routeState.value, replace);
};

const handlePopState = () => {
  if (typeof window === 'undefined') return;
  applyRoute(getRoutePathFromLocation(window.location), true);
};

const theme = ref<ThemeMode>((safeGetItem(STORAGE_KEYS.theme) as ThemeMode) || 'night');

watch(
  theme,
  (next) => {
    const isDark = next === 'night';
    document.body.dataset.theme = next;
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    safeSetItem(STORAGE_KEYS.theme, next);
  },
  { immediate: true }
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  applyRoute(getRoutePathFromLocation(window.location), true);
  window.addEventListener('popstate', handlePopState);
  if (useHashRouting) {
    window.addEventListener('hashchange', handlePopState);
  }
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('popstate', handlePopState);
  if (useHashRouting) {
    window.removeEventListener('hashchange', handlePopState);
  }
});

const runtimeConfigStore = useRuntimeConfig();
const runtimeConfig = runtimeConfigStore.config;
const runtimePreset = computed(() => resolveRuntimePreset(runtimeConfig.value));

const runtime = useToriiRuntime(
  computed(() => runtimeConfig.value.toriiUrl),
  computed(() => runtimeConfig.value.dataspace),
  computed(() => runtimeConfig.value.refreshMs)
);
const walletWatch = useWalletWatch(computed(() => runtimeConfig.value.toriiUrl));
const runtimeSnapshot = runtime.snapshot;
const runtimeLoading = runtime.loading;
const runtimeError = runtime.error;
const walletState = walletWatch.state;
const registryCoverage = computed(() =>
  summarizeRegistryCoverage(runtimeSnapshot.value.contracts?.instances || [])
);
const liveConnect = useLiveConnectSession(computed(() => runtimeConfig.value.toriiUrl), {
  chainId: computed(() => runtimeConfig.value.connectChainId),
  appName: computed(() => runtimeConfig.value.connectAppName),
  appUrl: computed(() => runtimeConfig.value.connectAppUrl)
});

const connectPreview = ref<ConnectPreview | null>(null);
const connectResponse = ref<ConnectSessionResponse | null>(null);
const connectBusy = ref(false);
const connectError = ref<string | null>(null);
const authorityPublicKeyHex = ref(safeGetItem(STORAGE_KEYS.authorityPublicKey) || '');

watch(authorityPublicKeyHex, (next) => {
  safeSetItem(STORAGE_KEYS.authorityPublicKey, next.trim());
});

watch(
  () =>
    [
      runtimeConfig.value.toriiUrl,
      runtimeConfig.value.dataspace,
      runtimeConfig.value.connectChainId,
      runtimeConfig.value.connectAppName,
      runtimeConfig.value.connectAppUrl
    ] as const,
  () => {
    connectPreview.value = null;
    connectResponse.value = null;
    connectError.value = null;
  }
);

const generateConnect = async () => {
  connectDrawerOpen.value = true;
  connectBusy.value = true;
  connectError.value = null;
  try {
    const preview = createConnectPreview(
      runtimeConfig.value.connectChainId,
      runtimeConfig.value.toriiUrl
    );
    const response = await registerConnectSession(
      runtimeConfig.value.toriiUrl,
      preview.sid,
      runtimeConfig.value.toriiUrl
    );
    connectPreview.value = preview;
    connectResponse.value = response;
    liveConnect.start(preview, response);
  } catch (caught) {
    connectError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    connectBusy.value = false;
  }
};

const refreshAll = async () => {
  await Promise.all([runtime.refresh(), walletWatch.refresh()]);
};

const writeGateReason = computed(() => {
  const total = runtimeSnapshot.value.contracts?.total ?? 0;
  if (total === 0) {
    return `No live "${runtimeConfig.value.dataspace}" contract instances were discovered on ${runtimeConfig.value.toriiUrl}.`;
  }
  return 'Torii drafts, encrypted Connect sign requests, and detached contract-call submit are available. Single-key Ed25519 authorities can be derived from canonical I105 account ids; otherwise set a public key override in More.';
});

const currentAuthorityPublicKey = computed(() => {
  if (!walletState.value.accountId) {
    return authorityPublicKeyHex.value.trim();
  }
  try {
    return resolveAuthorityPublicKeyHex(walletState.value.accountId, authorityPublicKeyHex.value);
  } catch {
    return authorityPublicKeyHex.value.trim();
  }
});

const requestDetachedConnectSignature = async (
  authority: string,
  draft: DetachedSignablePayload,
  domainTag: string
) => {
  const publicKeyHex = resolveAuthorityPublicKeyHex(authority, authorityPublicKeyHex.value);
  const signature = await liveConnect.requestWalletSignature(
    buildDetachedConnectSignatureRequest(draft, domainTag)
  );
  if (signature.algorithmCode !== 0) {
    throw new Error(`Torii detached submit currently expects Ed25519 signatures, got ${signature.algorithmLabel}.`);
  }
  return {
    publicKeyHex,
    signatureBase64: signature.signatureBase64
  };
};

const submitDraftViaConnect = async (input: {
  request: ContractCallDraftRequest;
  draft: ContractCallResponse;
  domainTag: string;
}): Promise<ContractCallSubmitResult> => {
  const signature = await requestDetachedConnectSignature(
    input.request.authority,
    input.draft,
    input.domainTag
  );
  const response = await submitContractCallDetached(runtimeConfig.value.toriiUrl, {
    ...input.request,
    creation_time_ms: input.draft.creation_time_ms,
    public_key_hex: signature.publicKeyHex,
    signature_b64: signature.signatureBase64
  });
  if (!response.tx_hash_hex) {
    return {
      response,
      pipelineStatus: null,
      pipelineCompleted: false
    };
  }
  const pipeline = await waitForPipelineTransactionStatus(runtimeConfig.value.toriiUrl, response.tx_hash_hex, {
    maxAttempts: 6,
    baseDelayMs: 250,
    maxDelayMs: 2000
  });
  return {
    response,
    pipelineStatus: pipeline.status,
    pipelineCompleted: pipeline.completed
  };
};

const submitBridgeProofViaConnect = async (input: {
  kind: BridgeProofKind;
  bundle: SccpBurnProofResponse | SccpGovernanceProofResponse;
}): Promise<BridgeProofSubmitResult> => {
  const authority = walletState.value.accountId;
  if (!authority) {
    throw new Error('Choose a Sora account before submitting a bridge proof.');
  }
  const request = buildBridgeProofSubmitRequest({
    authority,
    kind: input.kind,
    bundle: input.bundle
  });
  const draft = await prepareBridgeProofSubmit(runtimeConfig.value.toriiUrl, request);
  const signature = await requestDetachedConnectSignature(
    authority,
    draft,
    'IROHA_TORII_BRIDGE_PROOF'
  );
  const response = await submitBridgeProofDetached(runtimeConfig.value.toriiUrl, {
    ...request,
    creation_time_ms: draft.creation_time_ms,
    public_key_hex: signature.publicKeyHex,
    signature_b64: signature.signatureBase64
  });
  if (!response.tx_hash_hex) {
    return {
      response,
      pipelineStatus: null,
      pipelineCompleted: false
    };
  }
  const pipeline = await waitForPipelineTransactionStatus(runtimeConfig.value.toriiUrl, response.tx_hash_hex, {
    maxAttempts: 6,
    baseDelayMs: 250,
    maxDelayMs: 2000
  });
  return {
    response,
    pipelineStatus: pipeline.status,
    pipelineCompleted: pipeline.completed
  };
};

const saveRuntimeConfig = async (input: Partial<AppRuntimeConfig>) => {
  runtimeConfigStore.update(input);
  await refreshAll();
};

const applyRuntimePreset = async (presetId: RuntimePresetId) => {
  runtimeConfigStore.applyPreset(presetId);
  await refreshAll();
};

const resetRuntimeConfig = async () => {
  runtimeConfigStore.reset();
  await refreshAll();
};

watch(
  () => liveConnect.state.approvedAccountId,
  (next) => {
    if (!next || walletState.value.accountId) return;
    walletWatch.setAccountId(next);
  }
);

watch(
  () => liveConnect.state.phase,
  (next) => {
    if (next === 'approved') {
      connectDrawerOpen.value = false;
    }
  }
);
</script>

<template>
  <Layout
    :active-view="activeView"
    :runtime="runtimeSnapshot"
    :runtime-loading="runtimeLoading"
    :runtime-error="runtimeError"
    :torii-url="runtimeConfig.toriiUrl"
    :theme="theme"
    :account-id="walletState.accountId"
    @change-view="changeView"
    @request-connect="connectDrawerOpen = true"
    @toggle-theme="theme = theme === 'night' ? 'paper' : 'night'"
    @refresh-runtime="refreshAll"
  >
    <Transition name="view-stage" mode="out-in">
      <div :key="activeView" class="view-transition-shell">
        <WalletView
          v-if="activeView === 'wallet'"
          :account-state="walletState"
          :torii-url="runtimeConfig.toriiUrl"
          @navigate="changeView"
          @open-connect="connectDrawerOpen = true"
        />
        <DefiView
          v-else-if="activeView === 'defi'"
          :contracts="runtimeSnapshot.contracts"
          :write-gate-reason="writeGateReason"
          :torii-url="runtimeConfig.toriiUrl"
          :dataspace="runtimeConfig.dataspace"
          :authority-account-id="walletState.accountId"
          :connect-ready="liveConnect.state.phase === 'approved'"
          :submit-draft-via-connect="submitDraftViaConnect"
          @open-connect="connectDrawerOpen = true"
        />
        <SwapView
          v-else-if="activeView === 'swap'"
          :pay-token="routeState.swapFrom"
          :receive-token="routeState.swapTo"
          :write-gate-reason="writeGateReason"
          :contracts-total="runtimeSnapshot.contracts?.total ?? 0"
          :torii-url="runtimeConfig.toriiUrl"
          :dataspace="runtimeConfig.dataspace"
          :authority-account-id="walletState.accountId"
          :connect-ready="liveConnect.state.phase === 'approved'"
          :wallet-assets="walletState.assets"
          :submit-draft-via-connect="submitDraftViaConnect"
          @update-route="({ swapFrom, swapTo, replace }) => changeView('swap', { swapFrom, swapTo }, replace)"
          @open-connect="connectDrawerOpen = true"
        />
        <LaunchpadView
          v-else-if="activeView === 'launchpad'"
          :route="{ mode: routeState.launchpadMode || 'list', id: routeState.launchpadId }"
          :write-gate-reason="writeGateReason"
          :torii-url="runtimeConfig.toriiUrl"
          :dataspace="runtimeConfig.dataspace"
          :authority-account-id="walletState.accountId"
          :connect-ready="liveConnect.state.phase === 'approved'"
          :submit-draft-via-connect="submitDraftViaConnect"
          @navigate="({ replace, ...meta }) => changeView('launchpad', { launchpadMode: meta.mode, launchpadId: meta.id }, replace)"
          @open-connect="connectDrawerOpen = true"
        />
        <CrosschainView
          v-else-if="activeView === 'crosschain'"
          :torii-url="runtimeConfig.toriiUrl"
          :authority-account-id="walletState.accountId"
          :connect-ready="liveConnect.state.phase === 'approved'"
          :submit-bridge-proof-via-connect="submitBridgeProofViaConnect"
          @open-connect="connectDrawerOpen = true"
        />
        <MoreView
          v-else
          :runtime="runtimeSnapshot"
          :runtime-error="runtimeError"
          :account-id="walletState.accountId"
          :connect-preview="connectPreview"
          :connect-response="connectResponse"
          :connect-busy="connectBusy"
          :connect-error="connectError"
          :live-connect="liveConnect.state"
          :theme="theme"
          :authority-public-key-hex="authorityPublicKeyHex"
          :effective-authority-public-key-hex="currentAuthorityPublicKey"
          :runtime-config="runtimeConfig"
          :runtime-preset-label="runtimePreset?.label || 'Custom'"
          :torii-url="runtimeConfig.toriiUrl"
          :app-name="runtimeConfig.connectAppName"
          :app-url="runtimeConfig.connectAppUrl"
          :write-gate-reason="writeGateReason"
          :registry-expected-total="registryCoverage.expectedTotal"
          :registry-discovered-total="registryCoverage.discoveredTotal"
          :registry-verified-total="registryCoverage.verifiedTotal"
          :registry-missing-contract-addresses="registryCoverage.missingContractAddresses"
          @generate-connect="generateConnect"
          @set-account="walletWatch.setAccountId"
          @clear-account="walletWatch.setAccountId(null)"
          @set-authority-public-key="authorityPublicKeyHex = $event"
          @set-theme="theme = $event"
          @refresh-runtime="refreshAll"
          @save-runtime-config="saveRuntimeConfig"
          @apply-runtime-preset="applyRuntimePreset"
          @reset-runtime-config="resetRuntimeConfig"
        />
      </div>
    </Transition>
  </Layout>

  <ConnectDrawer
    :open="connectDrawerOpen"
    :runtime="runtimeSnapshot"
    :runtime-error="runtimeError"
    :account-id="walletState.accountId"
    :connect-preview="connectPreview"
    :connect-response="connectResponse"
    :connect-busy="connectBusy"
    :connect-error="connectError"
    :live-connect="liveConnect.state"
    :runtime-config="runtimeConfig"
    :runtime-preset-label="runtimePreset?.label || 'Custom'"
    @close="connectDrawerOpen = false"
    @generate-connect="generateConnect"
    @set-account="walletWatch.setAccountId"
    @clear-account="walletWatch.setAccountId(null)"
    @save-runtime-config="saveRuntimeConfig"
    @apply-runtime-preset="applyRuntimePreset"
    @refresh-runtime="refreshAll"
  />
</template>
