import { ref, watch } from 'vue';
import { DEFAULT_RUNTIME_CONFIG, normalizeRuntimeConfig, RUNTIME_PRESETS, STORAGE_KEYS } from '@/services/env';
import type { AppRuntimeConfig, RuntimePresetId } from '@/types';

const safeReadStoredConfig = (): Partial<AppRuntimeConfig> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.runtimeConfig);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<AppRuntimeConfig>;
  } catch {
    return null;
  }
};

const safeWriteStoredConfig = (value: AppRuntimeConfig) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.runtimeConfig, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

export const useRuntimeConfig = () => {
  const config = ref<AppRuntimeConfig>(
    normalizeRuntimeConfig({
      ...DEFAULT_RUNTIME_CONFIG(),
      ...safeReadStoredConfig()
    })
  );

  watch(
    config,
    (next) => {
      safeWriteStoredConfig(next);
    },
    { deep: true }
  );

  const update = (input: Partial<AppRuntimeConfig>) => {
    config.value = normalizeRuntimeConfig({
      ...config.value,
      ...input
    });
  };

  const reset = () => {
    config.value = DEFAULT_RUNTIME_CONFIG();
  };

  const applyPreset = (presetId: RuntimePresetId) => {
    const preset = RUNTIME_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    config.value = normalizeRuntimeConfig({
      ...config.value,
      ...preset.config
    });
  };

  return {
    config,
    update,
    reset,
    applyPreset
  };
};
