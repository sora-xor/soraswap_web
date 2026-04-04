<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { resolveConnectLaunchUri } from '@/services/connect';
import { getRegistrySourceLabel } from '@/services/registry';
import type {
  AppRuntimeConfig,
  ConnectPreview,
  ConnectSessionResponse,
  LiveConnectState,
  RuntimePresetId,
  RuntimeSnapshot,
  ThemeMode
} from '@/types';

const props = defineProps<{
  runtime: RuntimeSnapshot | null;
  runtimeError: string | null;
  accountId: string | null;
  authorityPublicKeyHex: string;
  effectiveAuthorityPublicKeyHex: string;
  connectPreview: ConnectPreview | null;
  connectResponse: ConnectSessionResponse | null;
  connectBusy: boolean;
  connectError: string | null;
  liveConnect: LiveConnectState;
  theme: ThemeMode;
  runtimeConfig: AppRuntimeConfig;
  runtimePresetLabel: string;
  toriiUrl: string;
  appName: string;
  appUrl: string;
  writeGateReason: string;
  registryExpectedTotal: number;
  registryDiscoveredTotal: number;
  registryVerifiedTotal: number;
  registryMissingContractAddresses: string[];
}>();

const emit = defineEmits<{
  (e: 'generate-connect'): void;
  (e: 'set-account', value: string): void;
  (e: 'clear-account'): void;
  (e: 'set-authority-public-key', value: string): void;
  (e: 'set-theme', value: ThemeMode): void;
  (e: 'refresh-runtime'): void;
  (e: 'save-runtime-config', value: Partial<AppRuntimeConfig>): void;
  (e: 'apply-runtime-preset', value: RuntimePresetId): void;
  (e: 'reset-runtime-config'): void;
}>();

const accountInput = ref(props.accountId || '');
const authorityPublicKeyInput = ref(props.authorityPublicKeyHex || '');
const toriiUrlInput = ref(props.runtimeConfig.toriiUrl);
const dataspaceInput = ref(props.runtimeConfig.dataspace);
const chainIdInput = ref(props.runtimeConfig.connectChainId);
const appNameInput = ref(props.runtimeConfig.connectAppName);
const appUrlInput = ref(props.runtimeConfig.connectAppUrl);
const refreshMsInput = ref(String(props.runtimeConfig.refreshMs));
const copyState = ref('');

watch(
  () => props.accountId,
  (next) => {
    accountInput.value = next || '';
  }
);

watch(
  () => props.authorityPublicKeyHex,
  (next) => {
    authorityPublicKeyInput.value = next || '';
  }
);

watch(
  () => props.runtimeConfig,
  (next) => {
    toriiUrlInput.value = next.toriiUrl;
    dataspaceInput.value = next.dataspace;
    chainIdInput.value = next.connectChainId;
    appNameInput.value = next.connectAppName;
    appUrlInput.value = next.connectAppUrl;
    refreshMsInput.value = String(next.refreshMs);
  },
  { deep: true }
);

const responseJson = computed(() => (props.connectResponse ? JSON.stringify(props.connectResponse, null, 2) : ''));
const liveFrameJson = computed(() => (props.liveConnect.lastFrame ? JSON.stringify(props.liveConnect.lastFrame, null, 2) : ''));
const liveEnvelopeJson = computed(() => (props.liveConnect.lastEnvelope ? JSON.stringify(props.liveConnect.lastEnvelope, null, 2) : ''));
const registrySourceLabel = getRegistrySourceLabel();
const walletLaunchUri = computed(() => resolveConnectLaunchUri('wallet', props.connectPreview, props.connectResponse));
const appLaunchUri = computed(() => resolveConnectLaunchUri('app', props.connectPreview, props.connectResponse));

const copy = async (value: string, label: string) => {
  try {
    await navigator.clipboard.writeText(value);
    copyState.value = `${label} copied`;
    window.setTimeout(() => {
      if (copyState.value === `${label} copied`) copyState.value = '';
    }, 1500);
  } catch {
    copyState.value = `${label} copy failed`;
  }
};

const saveRuntimeConfig = () => {
  const refreshMs = Number.parseInt(refreshMsInput.value, 10);
  emit('save-runtime-config', {
    toriiUrl: toriiUrlInput.value,
    dataspace: dataspaceInput.value,
    connectChainId: chainIdInput.value,
    connectAppName: appNameInput.value,
    connectAppUrl: appUrlInput.value,
    refreshMs: Number.isFinite(refreshMs) ? refreshMs : props.runtimeConfig.refreshMs
  });
};

const openUri = (value: string) => {
  if (!value || typeof window === 'undefined') return;
  window.location.href = value;
};
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero">
      <p class="eyebrow">More</p>
      <h2 class="panel-title">Connect, diagnostics, and runtime controls</h2>
      <p class="panel-subtitle">
        This app now supports Iroha Connect session bootstrap, the live encrypted approval and signing channel, direct watch mode, and detached contract-call submit. Endpoint settings are runtime-editable so the same static bundle can target TAIRA or a local sibling node.
      </p>
      <div class="action-row">
        <button class="button" type="button" :disabled="connectBusy" @click="emit('generate-connect')">
          {{ connectBusy ? 'Creating session…' : 'Create Iroha Connect session' }}
        </button>
        <button class="button is-ghost" type="button" @click="emit('refresh-runtime')">Refresh runtime</button>
      </div>
    </section>

    <div v-if="copyState" class="notice is-success">{{ copyState }}</div>
    <div v-if="connectError" class="notice is-danger">{{ connectError }}</div>
    <div v-if="runtimeError" class="notice is-danger">{{ runtimeError }}</div>
    <div v-if="liveConnect.lastError" class="notice is-danger">{{ liveConnect.lastError }}</div>
    <div class="notice is-warn">{{ writeGateReason }}</div>
    <div v-if="liveConnect.phase === 'approved' && liveConnect.approvedAccountId" class="notice is-success">
      Wallet approval received for {{ liveConnect.approvedAccountId }}.
    </div>

    <div class="split-grid">
      <section class="panel">
        <p class="eyebrow">Endpoint</p>
        <h3 class="panel-title">Runtime Torii target</h3>
        <p class="panel-subtitle">
          Current preset: {{ runtimePresetLabel }}. Changing any of these values resets the live Connect session and refreshes runtime discovery.
        </p>
        <div class="form-grid">
          <label class="field">
            <span>Torii URL</span>
            <input v-model="toriiUrlInput" class="input mono" placeholder="https://taira.sora.org" />
          </label>
          <label class="field">
            <span>Dataspace</span>
            <input v-model="dataspaceInput" class="input mono" placeholder="universal" />
          </label>
          <label class="field">
            <span>Connect chain id</span>
            <input v-model="chainIdInput" class="input mono" placeholder="809574f5-fee7-5e69-bfcf-52451e42d50f" />
          </label>
          <label class="field">
            <span>Refresh ms</span>
            <input v-model="refreshMsInput" class="input" inputmode="numeric" />
          </label>
          <label class="field">
            <span>Connect app name</span>
            <input v-model="appNameInput" class="input" placeholder="SoraSwap" />
          </label>
          <label class="field">
            <span>Connect app url</span>
            <input v-model="appUrlInput" class="input mono" placeholder="https://ipfs-gateway.example/ipfs/..." />
          </label>
        </div>
        <div class="action-row">
          <button class="button" type="button" @click="saveRuntimeConfig">Save runtime config</button>
          <button class="button is-ghost" type="button" @click="emit('apply-runtime-preset', 'taira')">Use TAIRA</button>
          <button class="button is-ghost" type="button" @click="emit('apply-runtime-preset', 'local')">Use local</button>
          <button class="button is-ghost" type="button" @click="emit('reset-runtime-config')">Reset defaults</button>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Watch mode</p>
        <h3 class="panel-title">Read any account directly and prepare detached authorities</h3>
        <label class="field">
          <span>Account ID</span>
          <input
            v-model="accountInput"
            class="input mono"
            placeholder="i105..."
          />
        </label>
        <div class="action-row">
          <button class="button" type="button" @click="emit('set-account', accountInput)">
            Save watch account
          </button>
          <button class="button is-ghost" type="button" @click="emit('clear-account')">
            Clear
          </button>
        </div>
        <label class="field">
          <span>Authority public key override</span>
          <input
            v-model="authorityPublicKeyInput"
            class="input mono"
            placeholder="32-byte Ed25519 public key hex"
          />
        </label>
        <div class="action-row">
          <button class="button is-ghost" type="button" @click="emit('set-authority-public-key', authorityPublicKeyInput)">
            Save public key
          </button>
          <button class="button is-ghost" type="button" @click="emit('set-authority-public-key', '')">
            Clear public key
          </button>
        </div>
        <div class="summary-list">
          <div>
            <span>Effective public key</span>
            <strong class="mono">{{ effectiveAuthorityPublicKeyHex || '--' }}</strong>
          </div>
        </div>
      </section>
    </div>

    <div class="split-grid">
      <section class="panel">
        <p class="eyebrow">Display</p>
        <h3 class="panel-title">Theme and deployment metadata</h3>
        <div class="summary-list">
          <div>
            <span>Theme</span>
            <strong>{{ theme }}</strong>
          </div>
          <div>
            <span>App name</span>
            <strong>{{ appName }}</strong>
          </div>
          <div>
            <span>App URL</span>
            <strong class="mono">{{ appUrl || '--' }}</strong>
          </div>
        </div>
        <div class="action-row">
          <button class="button is-ghost" type="button" @click="emit('set-theme', 'night')">Night</button>
          <button class="button is-ghost" type="button" @click="emit('set-theme', 'paper')">Paper</button>
        </div>
      </section>

      <section class="panel">
        <p class="eyebrow">Runtime</p>
        <h3 class="panel-title">Current endpoint diagnostics</h3>
        <div class="summary-list">
          <div>
            <span>Torii URL</span>
            <strong class="mono">{{ toriiUrl }}</strong>
          </div>
          <div>
            <span>Connect enabled</span>
            <strong>{{ runtime?.connectStatus?.enabled ? 'yes' : 'no' }}</strong>
          </div>
          <div>
            <span>Dataspace instances</span>
            <strong>{{ runtime?.contracts?.total ?? 0 }}</strong>
          </div>
          <div>
            <span>API version</span>
            <strong>{{ runtime?.versions?.default_version || runtime?.versions?.current_version || '--' }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="panel" v-if="connectPreview">
      <p class="eyebrow">Connect session</p>
      <h3 class="panel-title">Wallet pairing bootstrap and live app channel</h3>
      <div class="summary-list">
        <div>
          <span>SID</span>
          <strong class="mono">{{ connectPreview.sid }}</strong>
        </div>
        <div>
          <span>WebSocket</span>
          <strong class="mono">{{ connectPreview.wsUrl }}</strong>
        </div>
        <div>
          <span>Transport phase</span>
          <strong>{{ liveConnect.phase }}</strong>
        </div>
        <div>
          <span>Socket</span>
          <strong>{{ liveConnect.socketState }}</strong>
        </div>
      </div>
      <div class="stack">
        <div class="code-block mono">{{ walletLaunchUri }}</div>
        <div class="code-block mono">{{ appLaunchUri }}</div>
        <div class="action-row">
          <button
            class="button"
            type="button"
            :disabled="!walletLaunchUri"
            @click="openUri(walletLaunchUri)"
          >
            Open Iroha Connect
          </button>
          <button
            class="button is-ghost"
            type="button"
            :disabled="!walletLaunchUri"
            @click="copy(walletLaunchUri, 'Wallet URI')"
          >
            Copy wallet URI
          </button>
          <button
            class="button is-ghost"
            type="button"
            :disabled="!appLaunchUri"
            @click="copy(appLaunchUri, 'App URI')"
          >
            Copy app URI
          </button>
          <button class="button is-ghost" type="button" @click="copy(connectPreview.sid, 'SID')">Copy SID</button>
        </div>
      </div>
    </section>

    <section class="panel" v-if="connectPreview">
      <p class="eyebrow">Live connect state</p>
      <h3 class="panel-title">Open and approval status</h3>
      <div class="summary-list">
        <div>
          <span>Open sent</span>
          <strong>{{ liveConnect.openSent ? 'yes' : 'no' }}</strong>
        </div>
        <div>
          <span>Approved account</span>
          <strong class="mono">{{ liveConnect.approvedAccountId || '--' }}</strong>
        </div>
        <div>
          <span>Wallet X25519 key</span>
          <strong class="mono">{{ liveConnect.walletPublicKeyHex || '--' }}</strong>
        </div>
        <div>
          <span>Approval signature verified</span>
          <strong>{{ liveConnect.approvalVerified === null ? 'pending' : liveConnect.approvalVerified ? 'yes' : 'no' }}</strong>
        </div>
        <div>
          <span>Pending sign request</span>
          <strong>{{ liveConnect.pendingRequest ? 'yes' : 'no' }}</strong>
        </div>
      </div>
    </section>

    <section class="panel" v-if="responseJson">
      <p class="eyebrow">Torii session response</p>
      <div class="code-block mono">{{ responseJson }}</div>
    </section>

    <section class="panel" v-if="liveFrameJson">
      <p class="eyebrow">Last connect frame</p>
      <div class="code-block mono">{{ liveFrameJson }}</div>
    </section>

    <section class="panel" v-if="liveEnvelopeJson">
      <p class="eyebrow">Last decrypted envelope</p>
      <div class="code-block mono">{{ liveEnvelopeJson }}</div>
    </section>

    <section class="panel">
      <p class="eyebrow">Registry</p>
      <h3 class="panel-title">SoraSwap deployment manifest coverage</h3>
      <div class="summary-list">
        <div>
          <span>Manifest source</span>
          <strong>{{ registrySourceLabel }}</strong>
        </div>
        <div>
          <span>Deploy-address-backed contracts</span>
          <strong>{{ registryExpectedTotal }}</strong>
        </div>
        <div>
          <span>Discovered on endpoint</span>
          <strong>{{ registryDiscoveredTotal }}</strong>
        </div>
        <div>
          <span>Code-hash verified</span>
          <strong>{{ registryVerifiedTotal }}</strong>
        </div>
      </div>
      <div v-if="registryMissingContractAddresses.length" class="code-block mono">
        {{ registryMissingContractAddresses.join('\n') }}
      </div>
    </section>
  </div>
</template>
