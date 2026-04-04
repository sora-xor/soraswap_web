import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { toriiClient } from '@/services/torii';
import type { RuntimeSnapshot } from '@/types';

export const useToriiRuntime = (
  toriiUrl: MaybeRefOrGetter<string>,
  dataspace: MaybeRefOrGetter<string>,
  refreshMs: MaybeRefOrGetter<number>
) => {
  const snapshot = ref<RuntimeSnapshot>({
    versions: null,
    connectStatus: null,
    capabilities: null,
    contracts: null,
    lastUpdatedAt: null
  });
  const loading = ref(true);
  const error = ref<string | null>(null);
  let timer: number | null = null;

  const refresh = async () => {
    const currentToriiUrl = toValue(toriiUrl);
    const currentDataspace = toValue(dataspace);
    try {
      loading.value = snapshot.value.lastUpdatedAt === null;
      error.value = null;
      const [versions, connectStatus, capabilities, contracts] = await Promise.all([
        toriiClient.fetchApiVersions(currentToriiUrl),
        toriiClient.fetchConnectStatus(currentToriiUrl),
        toriiClient.fetchNodeCapabilities(currentToriiUrl),
        toriiClient.fetchContractInstances(currentToriiUrl, currentDataspace)
      ]);
      snapshot.value = {
        versions,
        connectStatus,
        capabilities,
        contracts,
        lastUpdatedAt: Date.now()
      };
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  };

  const resetTimer = () => {
    if (typeof window === 'undefined') return;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    timer = window.setInterval(() => {
      void refresh();
    }, toValue(refreshMs));
  };

  watch(
    () => [toValue(toriiUrl), toValue(dataspace)] as const,
    () => {
      void refresh();
    },
    { immediate: true }
  );

  watch(
    () => toValue(refreshMs),
    () => {
      resetTimer();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  });

  return {
    snapshot,
    loading,
    error,
    refresh
  };
};
