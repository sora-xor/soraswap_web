import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { STORAGE_KEYS } from '@/services/env';
import { toriiClient } from '@/services/torii';
import type { WatchAccountState } from '@/types';

const readStored = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage failures
  }
};

export const useWalletWatch = (toriiUrl: MaybeRefOrGetter<string>) => {
  const state = ref<WatchAccountState>({
    accountId: readStored(STORAGE_KEYS.watchAccount),
    assets: [],
    transactions: [],
    loading: false,
    error: null,
    lastLoadedAt: null
  });

  const refresh = async () => {
    const currentToriiUrl = toValue(toriiUrl);
    if (!state.value.accountId) {
      state.value.assets = [];
      state.value.transactions = [];
      state.value.lastLoadedAt = null;
      state.value.error = null;
      return;
    }
    state.value.loading = true;
    state.value.error = null;
    try {
      const [assets, transactions] = await Promise.all([
        toriiClient.fetchAccountAssets(currentToriiUrl, state.value.accountId),
        toriiClient.fetchAccountTransactions(currentToriiUrl, state.value.accountId)
      ]);
      state.value.assets = assets.items;
      state.value.transactions = transactions.items;
      state.value.lastLoadedAt = Date.now();
    } catch (caught) {
      state.value.error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      state.value.loading = false;
    }
  };

  const setAccountId = (accountId: string | null) => {
    state.value.accountId = accountId?.trim() || null;
    writeStored(STORAGE_KEYS.watchAccount, state.value.accountId);
  };

  watch(
    () => [state.value.accountId, toValue(toriiUrl)] as const,
    () => {
      void refresh();
    },
    { immediate: true }
  );

  return {
    state,
    refresh,
    setAccountId
  };
};
