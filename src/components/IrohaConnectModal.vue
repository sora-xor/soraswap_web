<script setup lang="ts">
import QRCode from 'qrcode';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icons } from '@/components/ui/Icons';
import { resolveConnectLaunchUri } from '@/services/connect';
import type {
  AppRuntimeConfig,
  ConnectLivePhase,
  ConnectPreview,
  ConnectSessionResponse,
  LiveConnectState
} from '@/types';

interface SakuraPetal {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  rotate: number;
  opacity: string;
}

const props = defineProps<{
  open: boolean;
  accountId: string | null;
  connectPreview: ConnectPreview | null;
  connectResponse: ConnectSessionResponse | null;
  connectBusy: boolean;
  connectError: string | null;
  liveConnect: LiveConnectState;
  runtimeConfig: AppRuntimeConfig;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'generate-connect'): void;
  (e: 'set-account', value: string): void;
}>();

const qrDataUrl = ref('');
const qrError = ref<string | null>(null);
const copyState = ref('');
const sakuraPetals = ref<SakuraPetal[]>([]);

let qrGeneration = 0;
let sakuraPetalId = 0;
let sakuraEmissionTimer: number | undefined;
let sakuraSeedTimers: number[] = [];
let sakuraRemovalTimers: number[] = [];

const walletLaunchUri = computed(() => resolveConnectLaunchUri('wallet', props.connectPreview, props.connectResponse));
const appLaunchUri = computed(() => resolveConnectLaunchUri('app', props.connectPreview, props.connectResponse));
const sessionId = computed(() => props.connectPreview?.sid || props.connectResponse?.sid || '');
const approvedAccount = computed(() => props.liveConnect.approvedAccountId || props.accountId || '');
const walletPublicKey = computed(() => props.liveConnect.walletPublicKeyHex || '');
const statusKind = computed<'idle' | 'creating' | 'waiting' | 'connected' | 'failed'>(() => {
  if (props.connectBusy) return 'creating';
  if (props.liveConnect.phase === 'approved') return 'connected';
  if (props.connectError || props.liveConnect.lastError || props.liveConnect.phase === 'error' || props.liveConnect.phase === 'rejected') {
    return 'failed';
  }
  if (walletLaunchUri.value || isWaitingPhase(props.liveConnect.phase)) return 'waiting';
  return 'idle';
});

const statusText = computed(() => {
  if (statusKind.value === 'creating') return 'Creating session';
  if (statusKind.value === 'connected') return 'Wallet connected';
  if (statusKind.value === 'failed') return 'Connection needs attention';
  if (statusKind.value === 'waiting') return 'Waiting for wallet approval';
  return 'Create a session';
});

const qrPlaceholder = computed(() => {
  if (props.connectBusy) return 'Creating QR';
  if (walletLaunchUri.value) return 'Rendering QR';
  return 'No session';
});

const sessionButtonLabel = computed(() => {
  if (props.connectBusy) return 'Creating session';
  return sessionId.value ? 'Refresh session' : 'Create connect session';
});

function isWaitingPhase(phase: ConnectLivePhase) {
  return phase === 'registered' || phase === 'opening' || phase === 'awaiting_approval';
}

watch(
  walletLaunchUri,
  async (uri) => {
    const generation = ++qrGeneration;
    qrDataUrl.value = '';
    qrError.value = null;
    if (!uri) return;

    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 360,
        color: {
          dark: '#e4232d',
          light: '#fffafc'
        }
      });
      if (generation === qrGeneration) {
        qrDataUrl.value = dataUrl;
      }
    } catch {
      if (generation === qrGeneration) {
        qrError.value = 'Unable to render the IrohaConnect QR code.';
      }
    }
  },
  { immediate: true }
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      startSakuraEmission();
    } else {
      stopSakuraEmission();
      copyState.value = '';
    }
  },
  { immediate: true }
);

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

const useApprovedAccount = () => {
  if (!props.liveConnect.approvedAccountId) return;
  emit('set-account', props.liveConnect.approvedAccountId);
};

function emitSakuraPetal() {
  if (!props.open) return;

  const id = ++sakuraPetalId;
  const duration = 5200 + Math.random() * 3200;
  sakuraPetals.value = [
    ...sakuraPetals.value.slice(-54),
    {
      id,
      left: Math.random() * 100,
      size: 24 + Math.random() * 18,
      duration,
      delay: Math.random() * 140,
      drift: -90 + Math.random() * 180,
      rotate: Math.random() * 360,
      opacity: String(0.64 + Math.random() * 0.3)
    }
  ];

  const timer = window.setTimeout(() => {
    sakuraPetals.value = sakuraPetals.value.filter((petal) => petal.id !== id);
    sakuraRemovalTimers = sakuraRemovalTimers.filter((activeTimer) => activeTimer !== timer);
  }, duration + 900);
  sakuraRemovalTimers.push(timer);
}

function queueSakuraSeed(delay: number) {
  const timer = window.setTimeout(() => {
    sakuraSeedTimers = sakuraSeedTimers.filter((activeTimer) => activeTimer !== timer);
    emitSakuraPetal();
  }, delay);
  sakuraSeedTimers.push(timer);
}

function startSakuraEmission() {
  stopSakuraEmission();
  for (let index = 0; index < 14; index += 1) {
    queueSakuraSeed(index * 80);
  }
  sakuraEmissionTimer = window.setInterval(emitSakuraPetal, 360);
}

function stopSakuraEmission() {
  if (sakuraEmissionTimer !== undefined) {
    window.clearInterval(sakuraEmissionTimer);
    sakuraEmissionTimer = undefined;
  }
  for (const timer of sakuraSeedTimers) {
    window.clearTimeout(timer);
  }
  sakuraSeedTimers = [];
}

onBeforeUnmount(() => {
  stopSakuraEmission();
  for (const timer of sakuraRemovalTimers) {
    window.clearTimeout(timer);
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open || sakuraPetals.length > 0" class="connect-modal-layer">
      <div v-if="open" class="connect-modal-backdrop" @click="emit('close')"></div>
      <div v-if="sakuraPetals.length > 0" class="connect-sakura-field" aria-hidden="true">
        <svg
          v-for="petal in sakuraPetals"
          :key="petal.id"
          class="connect-sakura-petal"
          viewBox="-12 -16 24 34"
          :style="{
            '--petal-left': `${petal.left}%`,
            '--petal-size': `${petal.size}px`,
            '--petal-duration': `${petal.duration}ms`,
            '--petal-delay': `${petal.delay}ms`,
            '--petal-drift': `${petal.drift}px`,
            '--petal-rotate': `${petal.rotate}deg`,
            '--petal-opacity': petal.opacity
          }"
        >
          <path
            d="M0-10.7C2.1-14.2 6.3-13.1 7.7-7.6C10.2-1.1 6.8 5.8 2.4 13.2C1 15.3 .3 16.4 0 16.8C-.7 15.9-2.4 14-4.1 11.9C-9.1 5.5-10.6-.5-7.4-7.9C-6.1-12.7-2.2-14.1 0-10.7Z"
          />
        </svg>
      </div>

      <Transition name="connect-modal-pop">
        <section
          v-if="open"
          class="connect-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-modal-title"
        >
          <header class="connect-modal-header">
            <div class="connect-brand-lockup">
              <span class="connect-logo-badge" aria-hidden="true">
                <component :is="Icons.Wallet" :size="34" />
              </span>
              <div class="connect-title-stack">
                <p class="eyebrow">TAIRA wallet pairing</p>
                <h2 id="connect-modal-title">IROHA CONNECT</h2>
              </div>
            </div>
            <button class="connect-modal-close" type="button" aria-label="Close connect wallet" @click="emit('close')">
              <component :is="Icons.X" :size="18" />
            </button>
          </header>

          <div class="connect-modal-body">
            <div v-if="connectError || liveConnect.lastError || qrError || copyState" class="connect-modal-notices">
              <div v-if="copyState" class="notice is-success">{{ copyState }}</div>
              <div v-if="connectError" class="notice is-danger">{{ connectError }}</div>
              <div v-if="liveConnect.lastError" class="notice is-danger">{{ liveConnect.lastError }}</div>
              <div v-if="qrError" class="notice is-danger">{{ qrError }}</div>
            </div>

            <div class="connect-qr-stack">
              <div class="connect-qr-stage">
                <div class="connect-qr-surface">
                  <img
                    v-if="qrDataUrl"
                    :src="qrDataUrl"
                    alt="IrohaConnect wallet QR"
                    class="connect-qr-image"
                  />
                  <div v-else class="connect-qr-placeholder">
                    <component v-if="connectBusy" :is="Icons.Loader" :size="22" class="spin" />
                    {{ qrPlaceholder }}
                  </div>
                </div>
              </div>
              <div class="connect-session-actions">
                <a
                  class="button"
                  :class="{ 'is-disabled': !walletLaunchUri }"
                  :href="walletLaunchUri || undefined"
                  :aria-disabled="!walletLaunchUri"
                >
                  <component :is="Icons.External" :size="16" />
                  Open wallet link
                </a>
                <button class="button is-soft" type="button" :disabled="!walletLaunchUri" @click="copy(walletLaunchUri, 'Wallet link')">
                  <component :is="Icons.Copy" :size="16" />
                  Copy link
                </button>
              </div>
            </div>

            <div class="connect-session-grid">
              <div class="connect-session-cell connect-status-cell" :data-state="statusKind">
                <span>Wallet status</span>
                <strong>{{ statusText }}</strong>
              </div>
              <div class="connect-session-cell">
                <span>Endpoint</span>
                <strong class="mono">{{ runtimeConfig.toriiUrl }}</strong>
              </div>
              <div v-if="sessionId" class="connect-session-cell">
                <span>Session</span>
                <strong class="mono">{{ sessionId }}</strong>
              </div>
              <div class="connect-session-cell">
                <span>App public key</span>
                <strong class="mono">{{ connectPreview?.publicKeyHex || '--' }}</strong>
              </div>
              <button class="button is-ghost" type="button" :disabled="connectBusy" @click="emit('generate-connect')">
                <component :is="Icons.Refresh" :size="16" />
                {{ sessionButtonLabel }}
              </button>
            </div>

            <div class="connect-account-panel">
              <span>Connected account</span>
              <strong class="mono">{{ approvedAccount || 'No wallet connected' }}</strong>
              <code v-if="walletPublicKey">{{ walletPublicKey }}</code>
              <div class="connect-account-actions">
                <button
                  class="button is-soft"
                  type="button"
                  :disabled="!liveConnect.approvedAccountId"
                  @click="useApprovedAccount"
                >
                  Use approved wallet
                </button>
                <button class="button is-ghost" type="button" :disabled="!appLaunchUri" @click="copy(appLaunchUri, 'App link')">
                  Copy app link
                </button>
              </div>
            </div>
          </div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>
