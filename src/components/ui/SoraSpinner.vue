<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    size?: number;
    label?: string;
  }>(),
  {
    size: 18,
    label: 'Loading'
  }
);

const sizePx = computed(() => `${Math.max(10, Math.trunc(props.size))}px`);
</script>

<template>
  <span class="sora-spinner" role="status" :aria-label="label" :style="{ width: sizePx, height: sizePx }">
    <span class="sora-spinner__ring" aria-hidden="true"></span>
    <span class="sora-spinner__core" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.sora-spinner {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sora-spinner__ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-top-color: rgba(255, 82, 82, 0.95);
  animation: sora-spin 900ms linear infinite;
}

.sora-spinner__core {
  width: 36%;
  height: 36%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 82, 82, 0.9) 100%);
  box-shadow: 0 0 18px rgba(255, 82, 82, 0.55);
}

@keyframes sora-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sora-spinner__ring {
    animation: none;
  }
}
</style>

