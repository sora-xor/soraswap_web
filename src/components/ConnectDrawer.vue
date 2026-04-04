<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icons } from '@/components/ui/Icons';
import { resolveConnectLaunchUri } from '@/services/connect';
import type {
  AppRuntimeConfig,
  ConnectPreview,
  ConnectSessionResponse,
  LiveConnectState,
  RuntimePresetId,
  RuntimeSnapshot
} from '@/types';

const props = defineProps<{
  open: boolean;
  runtime: RuntimeSnapshot | null;
  runtimeError: string | null;
  accountId: string | null;
  connectPreview: ConnectPreview | null;
  connectResponse: ConnectSessionResponse | null;
  connectBusy: boolean;
  connectError: string | null;
  liveConnect: LiveConnectState;
  runtimeConfig: AppRuntimeConfig;
  runtimePresetLabel: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'generate-connect'): void;
  (e: 'set-account', value: string): void;
  (e: 'clear-account'): void;
  (e: 'save-runtime-config', value: Partial<AppRuntimeConfig>): void;
  (e: 'apply-runtime-preset', value: RuntimePresetId): void;
  (e: 'refresh-runtime'): void;
}>();

const accountInput = ref(props.accountId || '');
const toriiUrlInput = ref(props.runtimeConfig.toriiUrl);
const dataspaceInput = ref(props.runtimeConfig.dataspace);
const copyState = ref('');

watch(
  () => props.accountId,
  (next) => {
    accountInput.value = next || '';
  }
);

watch(
  () => props.runtimeConfig,
  (next) => {
    toriiUrlInput.value = next.toriiUrl;
    dataspaceInput.value = next.dataspace;
  },
  { deep: true }
);

const walletLaunchUri = computed(() => resolveConnectLaunchUri('wallet', props.connectPreview, props.connectResponse));
const appLaunchUri = computed(() => resolveConnectLaunchUri('app', props.connectPreview, props.connectResponse));
const sessionNextStep = computed(() => {
  if (props.accountId && props.liveConnect.approvedAccountId === props.accountId) {
    return 'Approved wallet is already driving the app.';
  }
  if (props.liveConnect.approvedAccountId) {
    return 'Use the approved wallet as the active account for Swap, DeFi, and Launchpad.';
  }
  if (walletLaunchUri.value) {
    return 'Open Iroha Connect and approve the requested session.';
  }
  return 'Start a wallet session to generate the connect handoff first.';
});

const copy = async (value: string, label: string) => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copyState.value = `${label} copied`;
    window.setTimeout(() => {
      if (copyState.value === `${label} copied`) {
        copyState.value = '';
      }
    }, 1500);
  } catch {
    copyState.value = `${label} copy failed`;
  }
};

const openUri = (value: string) => {
  if (!value || typeof window === 'undefined') return;
  window.location.href = value;
};

const saveNetwork = () => {
  emit('save-runtime-config', {
    toriiUrl: toriiUrlInput.value.trim(),
    dataspace: dataspaceInput.value.trim()
  });
};

const useApprovedAccount = () => {
  if (!props.liveConnect.approvedAccountId) return;
  emit('set-account', props.liveConnect.approvedAccountId);
};
</script>

<template>
  <Transition name="drawer-fade">
    <div v-if="open" class="drawer-backdrop" @click.self="emit('close')">
      <aside class="connect-drawer panel">
        <div class="drawer-head">
          <div>
            <p class="eyebrow">Wallet and network</p>
            <h2 class="panel-title">Get ready to trade</h2>
            <p class="panel-subtitle">
              Start or continue a wallet session, choose an account to watch, and switch the current Torii endpoint without leaving the trading flow.
            </p>
          </div>
          <button class="icon-button" type="button" aria-label="Close drawer" @click="emit('close')">
            <component :is="Icons.X" :size="18" />
          </button>
        </div>

        <div v-if="copyState" class="notice is-success">{{ copyState }}</div>
        <div v-if="connectError" class="notice is-danger">{{ connectError }}</div>
        <div v-if="runtimeError" class="notice is-danger">{{ runtimeError }}</div>
        <div v-if="liveConnect.lastError" class="notice is-danger">{{ liveConnect.lastError }}</div>

        <section class="panel drawer-card drawer-card--primary">
          <p class="eyebrow">Quick start</p>
          <h3 class="panel-title">Start a wallet session, approve it, then use that account everywhere</h3>
          <p class="panel-subtitle">
            This is the default path. Manual watch mode and endpoint overrides still stay below, but they no longer have to compete with the happy path.
          </p>
          <div class="summary-list summary-list--dense">
            <div>
              <span>Session</span>
              <strong>{{ liveConnect.phase }}</strong>
            </div>
            <div>
              <span>Socket</span>
              <strong>{{ liveConnect.socketState }}</strong>
            </div>
            <div>
              <span>Approved account</span>
              <strong class="mono">{{ liveConnect.approvedAccountId || '--' }}</strong>
            </div>
            <div>
              <span>Next step</span>
              <strong>{{ sessionNextStep }}</strong>
            </div>
          </div>

          <div class="action-row">
            <button class="button" type="button" :disabled="connectBusy" @click="emit('generate-connect')">
              {{ connectBusy ? 'Creating session…' : 'Start wallet session' }}
            </button>
            <button
              class="button is-soft"
              type="button"
              :disabled="!walletLaunchUri"
              @click="openUri(walletLaunchUri)"
            >
              Open Iroha Connect
            </button>
            <button
              class="button"
              type="button"
              :disabled="!liveConnect.approvedAccountId"
              @click="useApprovedAccount"
            >
              Use approved wallet
            </button>
          </div>

          <div class="action-row">
            <button
              class="button is-ghost"
              type="button"
              :disabled="!walletLaunchUri"
              @click="copy(walletLaunchUri, 'Wallet URI')"
            >
              Copy wallet link
            </button>
            <button
              class="button is-ghost"
              type="button"
              :disabled="!appLaunchUri"
              @click="copy(appLaunchUri, 'App URI')"
            >
              Copy app link
            </button>
          </div>
        </section>

        <div class="drawer-grid drawer-grid--secondary">
          <section class="panel panel--quiet drawer-card">
            <p class="eyebrow">Session details</p>
            <h3 class="panel-title">Connect or resume</h3>
            <div class="summary-list summary-list--dense">
              <div>
                <span>Status</span>
                <strong>{{ liveConnect.phase }}</strong>
              </div>
              <div>
                <span>Socket</span>
                <strong>{{ liveConnect.socketState }}</strong>
              </div>
              <div>
                <span>Approved account</span>
                <strong class="mono">{{ liveConnect.approvedAccountId || '--' }}</strong>
              </div>
              <div>
                <span>Session id</span>
                <strong class="mono">{{ connectPreview?.sid || '--' }}</strong>
              </div>
            </div>
          </section>

          <section class="panel panel--quiet drawer-card">
            <p class="eyebrow">Read mode</p>
            <h3 class="panel-title">Choose what the app should use</h3>
            <p class="panel-subtitle">
              Use the approved wallet when you want one-click continuity. Keep watch mode here for read-only and draft-prep workflows.
            </p>
            <label class="field">
              <span>Watch account</span>
              <input v-model="accountInput" class="input mono" placeholder="i105..." />
            </label>
            <div class="action-row">
              <button
                class="button is-soft"
                type="button"
                :disabled="!liveConnect.approvedAccountId"
                @click="useApprovedAccount"
              >
                Use approved wallet
              </button>
              <button class="button" type="button" @click="emit('set-account', accountInput)">
                Use this account
              </button>
              <button class="button is-ghost" type="button" @click="emit('clear-account')">
                Clear
              </button>
            </div>
          </section>

          <section class="panel panel--quiet drawer-card">
            <p class="eyebrow">Network</p>
            <h3 class="panel-title">Switch endpoint fast</h3>
            <p class="panel-subtitle">Current preset: {{ runtimePresetLabel }}. Taira stays the default public path for the app.</p>

            <div class="action-row">
              <button class="button is-soft" type="button" @click="emit('apply-runtime-preset', 'taira')">
                TAIRA
              </button>
              <button class="button is-soft" type="button" @click="emit('apply-runtime-preset', 'local')">
                Local
              </button>
              <button class="button is-ghost" type="button" @click="emit('refresh-runtime')">
                Refresh runtime
              </button>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Torii URL</span>
                <input v-model="toriiUrlInput" class="input mono" placeholder="https://taira.sora.org" />
              </label>
              <label class="field">
                <span>Dataspace</span>
                <input v-model="dataspaceInput" class="input mono" placeholder="universal" />
              </label>
            </div>

            <div class="action-row">
              <button class="button" type="button" @click="saveNetwork">Save network</button>
            </div>

            <div class="summary-list summary-list--dense">
              <div>
                <span>Connect</span>
                <strong>{{ runtime?.connectStatus?.enabled ? 'Live' : 'Offline' }}</strong>
              </div>
              <div>
                <span>Contracts</span>
                <strong>{{ runtime?.contracts?.total ?? 0 }}</strong>
              </div>
              <div>
                <span>API</span>
                <strong>{{ runtime?.versions?.default_version || runtime?.versions?.current_version || '--' }}</strong>
              </div>
              <div>
                <span>Endpoint</span>
                <strong class="mono">{{ runtimeConfig.toriiUrl }}</strong>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>
