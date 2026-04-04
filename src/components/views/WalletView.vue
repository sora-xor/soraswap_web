<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icons } from '@/components/ui/Icons';
import { formatBaseUnits } from '@/services/amounts';
import {
  extractAssetDefinitionSelector,
  resolveAssetDefinitionMetadata,
  type AssetDefinitionMetadata
} from '@/services/assets';
import { formatRelativeTime, formatTimestamp, shorten } from '@/services/format';
import type { ViewType, WatchAccountState } from '@/types';

const props = defineProps<{
  accountState: WatchAccountState;
  toriiUrl: string;
}>();

const emit = defineEmits<{
  (e: 'navigate', view: ViewType): void;
  (e: 'open-connect'): void;
}>();

const successfulTransactions = computed(
  () => props.accountState.transactions.filter((item) => item.result_ok).length
);

const assetMetadata = ref<Record<string, AssetDefinitionMetadata | null>>({});
let assetRequestId = 0;

watch(
  () => [props.toriiUrl, props.accountState.assets.map((asset) => asset.asset_id).join('|')],
  async () => {
    const selectors = [...new Set(props.accountState.assets.map((asset) => extractAssetDefinitionSelector(asset.asset_id)))];
    const missing = selectors.filter((selector) => !(selector in assetMetadata.value));
    if (!missing.length) return;

    const requestId = assetRequestId + 1;
    assetRequestId = requestId;
    const entries = await Promise.all(
      missing.map(async (selector) => {
        try {
          return [selector, await resolveAssetDefinitionMetadata(props.toriiUrl, selector)] as const;
        } catch {
          return [selector, null] as const;
        }
      })
    );
    if (requestId !== assetRequestId) return;
    assetMetadata.value = {
      ...assetMetadata.value,
      ...Object.fromEntries(entries)
    };
  },
  { immediate: true }
);

const assetRows = computed(() =>
  props.accountState.assets.map((asset) => {
    const selector = extractAssetDefinitionSelector(asset.asset_id);
    const metadata = assetMetadata.value[selector];
    const quantity =
      metadata?.scale === null || metadata?.scale === undefined
        ? asset.quantity
        : formatBaseUnits(asset.quantity, metadata.scale);
    return {
      id: asset.asset_id,
      label: metadata?.alias || metadata?.name || selector,
      quantity
    };
  })
);
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero">
      <p class="eyebrow">Wallet</p>
      <h2 class="panel-title">
        {{ accountState.accountId ? 'Direct account mirror' : 'Watch an account on Torii' }}
      </h2>
      <p class="panel-subtitle">
        No middleware. Balances and authored transaction history come straight from Sora Nexus account routes.
      </p>

      <div class="metric-grid">
        <article class="metric-card">
          <span class="metric-label">Tracked account</span>
          <strong class="metric-value mono">
            {{ accountState.accountId ? shorten(accountState.accountId, 16, 12) : 'Not set' }}
          </strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Assets loaded</span>
          <strong class="metric-value">{{ accountState.assets.length }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Successful txs</span>
          <strong class="metric-value">{{ successfulTransactions }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Last refresh</span>
          <strong class="metric-value">{{ formatRelativeTime(accountState.lastLoadedAt) }}</strong>
        </article>
      </div>

      <div class="action-row">
        <button class="button" type="button" @click="emit('open-connect')">
          <component :is="Icons.Wallet" :size="16" />
          Connect / watch
        </button>
        <button class="button is-ghost" type="button" @click="emit('navigate', 'swap')">
          <component :is="Icons.Swap" :size="16" />
          Spot surface
        </button>
        <button class="button is-ghost" type="button" @click="emit('navigate', 'defi')">
          <component :is="Icons.DeFi" :size="16" />
          Protocol modules
        </button>
      </div>
    </section>

    <div v-if="accountState.error" class="notice is-danger">
      {{ accountState.error }}
    </div>

      <section v-if="!accountState.accountId" class="panel empty-state">
        <p class="eyebrow">Read mode</p>
        <h3 class="panel-title">Set an authority account to load balances and prepare drafts</h3>
        <p class="panel-subtitle">
          Use the wallet drawer to connect a session or watch an account. The same account id flows straight into Swap, DeFi, and Launchpad draft prep.
        </p>
        <div class="action-row">
          <button class="button" type="button" @click="emit('open-connect')">
            Open wallet and account setup
          </button>
          <button class="button is-ghost" type="button" @click="emit('navigate', 'swap')">
            Go to Swap
          </button>
        </div>
      </section>

    <div v-else class="split-grid">
      <section class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Balances</p>
            <h3 class="panel-title">Account assets</h3>
          </div>
        </div>

        <div v-if="accountState.loading" class="notice">Loading account assets from Torii…</div>
        <div v-else-if="accountState.assets.length === 0" class="notice is-warn">
          No assets were returned for this account.
        </div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asset in assetRows" :key="asset.id">
                <td>
                  <div class="stack stack--tight">
                    <strong>{{ asset.label }}</strong>
                    <span class="mono">{{ shorten(asset.id, 16, 12) }}</span>
                  </div>
                </td>
                <td class="mono">{{ asset.quantity }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">History</p>
            <h3 class="panel-title">Authored transactions</h3>
          </div>
        </div>

        <div v-if="accountState.loading" class="notice">Loading authored transactions from Torii…</div>
        <div v-else-if="accountState.transactions.length === 0" class="notice is-warn">
          No transactions were returned for this account.
        </div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Hash</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="transaction in accountState.transactions" :key="transaction.entrypoint_hash">
                <td class="mono">{{ shorten(transaction.entrypoint_hash, 14, 10) }}</td>
                <td>
                  <span class="tag" :class="transaction.result_ok ? 'is-success' : 'is-danger'">
                    {{ transaction.result_ok ? 'ok' : 'failed' }}
                  </span>
                </td>
                <td :title="formatTimestamp(transaction.timestamp_ms)">
                  {{ formatRelativeTime(transaction.timestamp_ms) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
