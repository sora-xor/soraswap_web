<script setup lang="ts">
import { computed } from 'vue';
import { Icons } from '@/components/ui/Icons';
import SoraSpinner from '@/components/ui/SoraSpinner.vue';
import { shorten } from '@/services/format';
import { getRegistrySourceLabel } from '@/services/registry';
import type { RuntimeSnapshot, ThemeMode, ViewType } from '@/types';

const props = defineProps<{
  activeView: ViewType;
  runtime: RuntimeSnapshot | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  toriiUrl: string;
  theme: ThemeMode;
  accountId: string | null;
}>();

const emit = defineEmits<{
  (e: 'change-view', view: ViewType): void;
  (e: 'request-connect'): void;
  (e: 'toggle-theme'): void;
  (e: 'refresh-runtime'): void;
}>();

const navItems = [
  { id: 'swap', label: 'Swap', icon: Icons.Swap },
  { id: 'launchpad', label: 'Launchpad', icon: Icons.Launchpad },
  { id: 'defi', label: 'DeFi', icon: Icons.DeFi },
  { id: 'wallet', label: 'Wallet', icon: Icons.Wallet },
  { id: 'crosschain', label: 'Crosschain', icon: Icons.Crosschain },
  { id: 'more', label: 'More', icon: Icons.More }
] satisfies Array<{ id: ViewType; label: string; icon: unknown }>;

const mobileTabs = computed(() =>
  (['wallet', 'defi', 'launchpad', 'crosschain', 'more'] as ViewType[])
    .map((view) => navItems.find((item) => item.id === view))
    .filter((item): item is (typeof navItems)[number] => Boolean(item))
);
const activeItem = computed(() => navItems.find((item) => item.id === props.activeView) || navItems[0]);
const connectLabel = computed(() => (props.accountId ? shorten(props.accountId, 10, 8) : 'Connect'));
const apiVersionLabel = computed(
  () => props.runtime?.versions?.default_version || props.runtime?.versions?.current_version || 'n/a'
);
const contractsCount = computed(() => props.runtime?.contracts?.total ?? 0);
const connectEnabled = computed(() => Boolean(props.runtime?.connectStatus?.enabled));
const registrySourceLabel = getRegistrySourceLabel();
const endpointHost = computed(() => {
  try {
    return new URL(props.toriiUrl).host;
  } catch {
    return props.toriiUrl;
  }
});
const themeLabel = computed(() => (props.theme === 'night' ? 'Light mode' : 'Dark mode'));

const goToView = (view: ViewType) => emit('change-view', view);
</script>

<template>
  <div class="app-shell">
    <aside class="desktop-sidebar glass-panel">
      <div class="desktop-sidebar__top">
        <button class="brand-lockup" type="button" @click="goToView('swap')">
          <span class="brand-emblem" aria-hidden="true"></span>
          <span class="brand-copy">
            <span class="brand-caption">Sora Nexus direct venue</span>
            <strong>SoraSwap</strong>
          </span>
        </button>

        <div class="sidebar-intro">
          <span class="sidebar-intro__label">Active venue</span>
          <strong>{{ activeItem.label }}</strong>
          <p class="mono">{{ endpointHost }}</p>
        </div>

        <div class="desktop-actions">
          <button class="button topbar-connect desktop-connect" type="button" @click="emit('request-connect')">
            <component :is="Icons.Wallet" :size="16" />
            {{ connectLabel }}
          </button>
          <div class="desktop-actions__row">
            <button class="icon-button" type="button" aria-label="Refresh runtime" @click="emit('refresh-runtime')">
              <component :is="Icons.Refresh" :size="17" />
            </button>
            <button class="icon-button" type="button" :aria-label="themeLabel" @click="emit('toggle-theme')">
              <component :is="theme === 'night' ? Icons.Sun : Icons.Moon" :size="17" />
            </button>
          </div>
        </div>
      </div>

      <div class="desktop-sidebar__section">
        <span class="sidebar-section-label">Workspace</span>
        <nav class="desktop-nav" aria-label="Primary">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-link"
            :class="{ 'is-active': item.id === activeView }"
            type="button"
            @click="goToView(item.id)"
          >
            <span class="nav-icon-wrap">
              <component :is="item.icon" :size="17" />
            </span>
            <span class="nav-title">{{ item.label }}</span>
          </button>
        </nav>
      </div>

      <div class="desktop-sidebar__section desktop-sidebar__section--grow">
        <span class="sidebar-section-label">Runtime</span>
        <div class="status-ribbon" aria-label="Runtime status">
          <div class="status-chip">
            <span>View</span>
            <strong>{{ activeItem.label }}</strong>
          </div>
          <div class="status-chip">
            <span>Endpoint</span>
            <strong class="mono">{{ endpointHost }}</strong>
          </div>
          <div class="status-chip">
            <span>Contracts</span>
            <strong>{{ contractsCount }}</strong>
          </div>
          <div class="status-chip">
            <span>Connect</span>
            <strong :class="connectEnabled ? 'text-success' : 'text-danger'">
              {{ connectEnabled ? 'Live' : 'Offline' }}
            </strong>
          </div>
          <div class="status-chip">
            <span>API</span>
            <strong class="mono">{{ apiVersionLabel }}</strong>
          </div>
          <div class="status-chip">
            <span>Registry</span>
            <strong>{{ registrySourceLabel }}</strong>
          </div>
          <div v-if="runtimeLoading" class="status-chip">
            <span>Runtime</span>
            <strong class="status-chip__inline">
              <SoraSpinner :size="14" />
              Polling
            </strong>
          </div>
        </div>
      </div>

      <div v-if="runtimeError" class="notice is-danger shell-inline-notice">{{ runtimeError }}</div>
    </aside>

    <div class="app-workspace">
      <header class="mobile-topbar glass-panel">
        <div class="topbar__main">
          <button class="brand-lockup" type="button" @click="goToView('swap')">
            <span class="brand-emblem" aria-hidden="true"></span>
            <span class="brand-copy">
              <span class="brand-caption">Sora Nexus direct venue</span>
              <strong>SoraSwap</strong>
            </span>
          </button>

          <div class="desktop-actions">
            <button class="icon-button" type="button" aria-label="Refresh runtime" @click="emit('refresh-runtime')">
              <component :is="Icons.Refresh" :size="17" />
            </button>
            <button class="icon-button" type="button" :aria-label="themeLabel" @click="emit('toggle-theme')">
              <component :is="theme === 'night' ? Icons.Sun : Icons.Moon" :size="17" />
            </button>
            <button class="button topbar-connect" type="button" @click="emit('request-connect')">
              <component :is="Icons.Wallet" :size="16" />
              {{ connectLabel }}
            </button>
          </div>
        </div>

        <div class="status-ribbon no-scrollbar" aria-label="Runtime status">
          <div class="status-chip">
            <span>View</span>
            <strong>{{ activeItem.label }}</strong>
          </div>
          <div class="status-chip">
            <span>Endpoint</span>
            <strong class="mono">{{ endpointHost }}</strong>
          </div>
          <div class="status-chip">
            <span>Contracts</span>
            <strong>{{ contractsCount }}</strong>
          </div>
          <div class="status-chip">
            <span>Connect</span>
            <strong :class="connectEnabled ? 'text-success' : 'text-danger'">
              {{ connectEnabled ? 'Live' : 'Offline' }}
            </strong>
          </div>
          <div class="status-chip">
            <span>API</span>
            <strong class="mono">{{ apiVersionLabel }}</strong>
          </div>
          <div class="status-chip">
            <span>Registry</span>
            <strong>{{ registrySourceLabel }}</strong>
          </div>
          <div v-if="runtimeLoading" class="status-chip">
            <span>Runtime</span>
            <strong class="status-chip__inline">
              <SoraSpinner :size="14" />
              Polling
            </strong>
          </div>
        </div>

        <div v-if="runtimeError" class="notice is-danger shell-inline-notice">{{ runtimeError }}</div>
      </header>

      <main class="app-main-glass">
        <div class="page-scroll no-scrollbar">
          <section class="page-frame">
            <main class="page">
              <slot />
            </main>
          </section>
        </div>

        <nav class="mobile-tabbar" aria-label="Primary">
          <div class="mobile-tabbar__inner pb-safe">
            <button
              v-for="item in mobileTabs"
              :key="item.id"
              class="mobile-tab"
              :class="{ 'is-active': activeView === item.id }"
              type="button"
              @click="goToView(item.id)"
            >
              <component :is="item.icon" :size="18" />
              <span class="mobile-tab-label">{{ item.label }}</span>
            </button>
          </div>

          <div class="mobile-tabbar-fab">
            <button
              class="mobile-swap-fab"
              :class="{ 'is-active': activeView === 'swap' }"
              type="button"
              aria-label="Open swap"
              @click="goToView('swap')"
            >
              <component :is="Icons.Swap" :size="20" />
            </button>
          </div>
        </nav>
      </main>
    </div>
  </div>
</template>
