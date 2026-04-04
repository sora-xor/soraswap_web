<script setup lang="ts">
import { computed } from 'vue';

interface InspectorSummaryItem {
  label: string;
  value: string;
  mono?: boolean;
}

interface InspectorEntry {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    eyebrow?: string;
    title: string;
    subtitle?: string;
    summary?: InspectorSummaryItem[];
    entries?: InspectorEntry[];
    emptyCopy?: string;
  }>(),
  {
    eyebrow: 'Execution inspector',
    subtitle: '',
    summary: () => [],
    entries: () => [],
    emptyCopy: 'Prepare or submit a flow and the live payload stream will appear here.'
  }
);

const visibleEntries = computed(() => props.entries.filter((entry) => entry.value?.trim().length));
</script>

<template>
  <section class="panel panel--quiet execution-inspector">
    <div class="stack stack--tight">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h3 class="panel-title">{{ title }}</h3>
      <p v-if="subtitle" class="panel-subtitle">{{ subtitle }}</p>
    </div>

    <div v-if="summary.length" class="summary-list summary-list--dense">
      <div v-for="item in summary" :key="item.label">
        <span>{{ item.label }}</span>
        <strong :class="{ mono: item.mono }">{{ item.value }}</strong>
      </div>
    </div>

    <div v-if="visibleEntries.length" class="debug-stack">
      <div v-for="entry in visibleEntries" :key="entry.label" class="debug-block">
        <span class="debug-label">{{ entry.label }}</span>
        <div class="code-block mono">{{ entry.value }}</div>
      </div>
    </div>
    <div v-else class="notice">
      {{ emptyCopy }}
    </div>
  </section>
</template>
