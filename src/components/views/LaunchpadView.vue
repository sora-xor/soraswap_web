<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ExecutionInspector from '@/components/ExecutionInspector.vue';
import { formatBaseUnits, scaleDecimalToBaseUnits } from '@/services/amounts';
import {
  resolveAssetDefinitionMetadata,
  type AssetDefinitionMetadata
} from '@/services/assets';
import { prepareContractCallDraft } from '@/services/contracts';
import { formatNumber } from '@/services/format';
import {
  buildLaunchpadClaimIntent,
  buildLaunchpadCloseIntent,
  buildLaunchpadContributeIntent,
  buildLaunchpadCreateIntent,
  buildLaunchpadRefundIntent,
  buildLaunchpadSeedIntent
} from '@/services/intents';
import {
  loadLaunchpadAllocations,
  loadLaunchpadSales
} from '@/services/liveSoraswap';
import { resolveContractAddressForRole } from '@/services/registry';
import { toriiClient } from '@/services/torii';
import type {
  ContractCallDraftRequest,
  ContractCallResponse,
  ContractCallSubmitResult,
  LiveLaunchpadAllocation,
  LiveLaunchpadSale
} from '@/types';

type LaunchpadAction = 'contribute' | 'claim' | 'refund' | 'close' | 'seed';

const props = defineProps<{
  route: {
    mode: 'list' | 'create' | 'detail';
    id?: string;
  };
  writeGateReason: string;
  toriiUrl: string;
  dataspace: string;
  authorityAccountId: string | null;
  connectReady: boolean;
  submitDraftViaConnect: (input: {
    request: ContractCallDraftRequest;
    draft: ContractCallResponse;
    domainTag: string;
  }) => Promise<ContractCallSubmitResult>;
}>();

const emit = defineEmits<{
  (e: 'navigate', payload: { mode: 'list' | 'create' | 'detail'; id?: string; replace?: boolean }): void;
  (e: 'open-connect'): void;
}>();

const createSaleId = ref('sora-index');
const createSaleAssetId = ref('sindex#soraswap.launchpad');
const createPaymentAssetId = ref('xor#universal');
const createTreasuryAccountId = ref('');
const createUnitPrice = ref('1');
const createSoftCap = ref('0');
const createHardCap = ref('120000');
const createClaimStartSlot = ref('0');
const createClaimEndSlot = ref('0');
const contributeAmount = ref('1000');
const seedClaimInventoryAmount = ref('0');
const detailAction = ref<LaunchpadAction>('contribute');

const launchpadContractKey = 'launchpad.sale_factory';
const launchpadContractAddress = computed(() => resolveContractAddressForRole('launchpadSaleFactory'));

const salesBusy = ref(false);
const salesError = ref<string | null>(null);
const sales = ref<LiveLaunchpadSale[]>([]);
const allocationsBusy = ref(false);
const allocationsError = ref<string | null>(null);
const allocations = ref<LiveLaunchpadAllocation[]>([]);
const currentSlot = ref<number | null>(null);
const assetMetadata = ref<Record<string, AssetDefinitionMetadata | null>>({});

const createIntent = ref('');
const reviewItems = ref<Array<{ label: string; value: string }>>([]);
const draftBusy = ref(false);
const draftError = ref<string | null>(null);
const draftResponseJson = ref('');
const draftRequest = ref<ContractCallDraftRequest | null>(null);
const draftResponse = ref<ContractCallResponse | null>(null);
const submitBusy = ref(false);
const submitError = ref<string | null>(null);
const submitResponseJson = ref('');
const submitPipelineJson = ref('');
const submitPipelineNote = ref('');

let assetRequestId = 0;

const resetExecutionState = (clearIntent = false) => {
  draftError.value = null;
  draftResponseJson.value = '';
  draftRequest.value = null;
  draftResponse.value = null;
  submitError.value = null;
  submitResponseJson.value = '';
  submitPipelineJson.value = '';
  submitPipelineNote.value = '';
  reviewItems.value = [];
  if (clearIntent) {
    createIntent.value = '';
  }
};

const saleStage = (sale: LiveLaunchpadSale) => {
  if (!sale.closed) return 'active';
  if (!sale.successful) return 'failed';
  if (!sale.seeded) return 'successful';
  return 'seeded';
};

const stageTone = (stage: string) => {
  if (stage === 'active') return 'is-live';
  if (stage === 'failed') return 'is-danger';
  if (stage === 'seeded') return 'is-success';
  return 'is-warn';
};

const saleProgress = (sale: LiveLaunchpadSale) => {
  const raised = Number(sale.raised);
  const hardCap = Number(sale.hardCap);
  if (!Number.isFinite(raised) || !Number.isFinite(hardCap) || hardCap <= 0) return 0;
  return Math.min(1, Math.max(0, raised / hardCap));
};
const slotOffsetLabel = (targetSlot: number) => {
  if (currentSlot.value === null) return `slot ${targetSlot}`;
  const delta = targetSlot - currentSlot.value;
  if (delta > 0) return `in ${delta} slots`;
  if (delta === 0) return 'this slot';
  return `${Math.abs(delta)} slots ago`;
};
const claimWindowLabel = (sale: LiveLaunchpadSale) => {
  const claimStart = Number(sale.claimStartSlot);
  const claimEnd = Number(sale.claimEndSlot);
  if (!Number.isFinite(claimStart) || !Number.isFinite(claimEnd)) {
    return `Slots ${sale.claimStartSlot}-${sale.claimEndSlot}`;
  }
  if (currentSlot.value === null) {
    return `Slots ${sale.claimStartSlot}-${sale.claimEndSlot}`;
  }
  if (currentSlot.value < claimStart) {
    return `Opens ${slotOffsetLabel(claimStart)}`;
  }
  if (currentSlot.value <= claimEnd) {
    return `Live now · closes ${slotOffsetLabel(claimEnd)}`;
  }
  return `Closed ${slotOffsetLabel(claimEnd)}`;
};
const saleReadinessLabel = (sale: LiveLaunchpadSale, allocation?: LiveLaunchpadAllocation | null) => {
  if (!sale.closed) return 'Contribution window open';
  if (!sale.successful) return allocation ? 'Refund available' : 'Sale closed without refund position';
  if (!sale.seeded) return 'Seed inventory next';
  if (allocation) {
    return 'Claim path active';
  }
  return 'Sale seeded';
};

const ensureAssetMetadata = async (assetIds: string[]) => {
  const uniqueIds = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))];
  const missingIds = uniqueIds.filter((id) => !(id in assetMetadata.value));
  if (!missingIds.length) return;

  const requestId = assetRequestId + 1;
  assetRequestId = requestId;

  const nextEntries = await Promise.all(
    missingIds.map(async (assetId) => {
      try {
        return [assetId, await resolveAssetDefinitionMetadata(props.toriiUrl, assetId)] as const;
      } catch {
        return [assetId, null] as const;
      }
    })
  );

  if (requestId !== assetRequestId) return;
  assetMetadata.value = {
    ...assetMetadata.value,
    ...Object.fromEntries(nextEntries)
  };
};

const assetLabel = (assetId: string) => {
  const metadata = assetMetadata.value[assetId];
  return metadata?.alias || metadata?.name || assetId;
};

const formatAssetQuantity = (amount: string, assetId: string, digits = 4) => {
  const metadata = assetMetadata.value[assetId];
  if (metadata?.scale === null || metadata?.scale === undefined) {
    return `${amount} ${assetLabel(assetId)}`;
  }
  return `${formatNumber(formatBaseUnits(amount, metadata.scale), digits)} ${assetLabel(assetId)}`;
};

const loadSales = async () => {
  salesBusy.value = true;
  salesError.value = null;
  try {
    const nextSales = await loadLaunchpadSales(props.toriiUrl);
    sales.value = nextSales;
    await ensureAssetMetadata(nextSales.flatMap((sale) => [sale.saleAssetId, sale.paymentAssetId]));
  } catch (caught) {
    salesError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    salesBusy.value = false;
  }
};

const loadAllocations = async () => {
  allocationsBusy.value = true;
  allocationsError.value = null;
  try {
    if (!props.authorityAccountId) {
      allocations.value = [];
      return;
    }
    allocations.value = await loadLaunchpadAllocations(props.toriiUrl, props.authorityAccountId);
  } catch (caught) {
    allocationsError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    allocationsBusy.value = false;
  }
};

const loadCurrentSlot = async () => {
  try {
    const metrics = await toriiClient.fetchExplorerMetrics(props.toriiUrl);
    currentSlot.value = metrics.blockHeight || null;
  } catch {
    currentSlot.value = null;
  }
};

watch(
  () => props.toriiUrl,
  async () => {
    await Promise.all([loadSales(), loadCurrentSlot()]);
  },
  { immediate: true }
);

watch(
  () => props.authorityAccountId,
  () => {
    loadAllocations();
  },
  { immediate: true }
);

watch(
  () => [
    props.route.mode,
    props.route.id,
    detailAction.value,
    createSaleId.value,
    createSaleAssetId.value,
    createPaymentAssetId.value,
    createTreasuryAccountId.value,
    createUnitPrice.value,
    createSoftCap.value,
    createHardCap.value,
    createClaimStartSlot.value,
    createClaimEndSlot.value,
    contributeAmount.value,
    seedClaimInventoryAmount.value,
    props.authorityAccountId
  ],
  () => {
    resetExecutionState(true);
  }
);

const selected = computed(() => sales.value.find((sale) => sale.id === props.route.id) || null);
const selectedAllocation = computed(
  () => allocations.value.find((allocation) => allocation.saleId === selected.value?.id) || null
);

const availableActions = computed<LaunchpadAction[]>(() => {
  const sale = selected.value;
  if (!sale) return [];
  const actions: LaunchpadAction[] = [];
  if (!sale.closed) {
    actions.push('contribute', 'close');
  }
  if (selectedAllocation.value && sale.closed && sale.successful) {
    actions.push('claim');
  }
  if (selectedAllocation.value && sale.closed && !sale.successful) {
    actions.push('refund');
  }
  if (sale.closed && sale.successful && !sale.seeded) {
    actions.push('seed');
  }
  return [...new Set(actions)];
});

watch(
  [selected, selectedAllocation, availableActions],
  () => {
    if (!availableActions.value.length) return;
    if (!availableActions.value.includes(detailAction.value)) {
      detailAction.value = availableActions.value[0];
      return;
    }
    if (selectedAllocation.value && selected.value?.closed && selected.value.successful) {
      detailAction.value = 'claim';
      return;
    }
    if (selectedAllocation.value && selected.value?.closed && !selected.value.successful) {
      detailAction.value = 'refund';
    }
  },
  { immediate: true }
);

const currentFlowLabel = computed(() => {
  if (props.route.mode === 'create') return 'Create sale';
  if (props.route.mode === 'detail' && selected.value) {
    return `${detailAction.value} ${selected.value.id}`;
  }
  return 'Live sales';
});

const currentSummary = computed(() => {
  if (props.route.mode === 'create') {
    return 'Configure a sale with live asset metadata, normalize the on-chain quantities, and keep draft plus signature flow in one place.';
  }
  if (props.route.mode === 'detail' && selected.value) {
    return 'Review the live sale state, your allocation, and the next executable sale action without leaving the page.';
  }
  return 'The list now comes from live launchpad state instead of a static campaign catalog.';
});

const executionState = computed(() => {
  if (props.route.mode === 'list') return 'Choose a sale or create one';
  if (!props.authorityAccountId) return 'Account needed';
  if (!draftResponse.value) return 'Draft not prepared';
  if (!props.connectReady) return 'Wallet session needed';
  return 'Ready to sign';
});

const nextActionHint = computed(() => {
  if (props.route.mode === 'list') {
    return 'Browse a live sale, open the create flow, or connect an account to load your allocations.';
  }
  if (!props.authorityAccountId) {
    return 'Open the wallet drawer to connect a session or choose a watch account before preparing a sale action.';
  }
  if (!draftResponse.value) {
    return 'Review the sale state and prepare the next contract-call draft.';
  }
  if (!props.connectReady) {
    return 'Open or resume the wallet session so the prepared launchpad draft can be signed.';
  }
  return 'The draft is ready. Sign it from the connected wallet when you want to submit.';
});
const launchpadInspectorSummary = computed(() => [
  { label: 'Contract', value: launchpadContractKey, mono: true },
  { label: 'Authority', value: props.authorityAccountId || '--', mono: Boolean(props.authorityAccountId) },
  { label: 'Wallet session', value: props.connectReady ? 'Ready' : 'Needed' },
  { label: 'Current slot', value: currentSlot.value === null ? '--' : String(currentSlot.value) }
]);
const launchpadInspectorEntries = computed(() => [
  { label: 'Intent payload', value: createIntent.value },
  { label: 'Draft response', value: draftResponseJson.value },
  { label: 'Submitted response', value: submitResponseJson.value },
  { label: 'Pipeline status', value: submitPipelineJson.value }
]);

const primaryActionLabel = computed(() => {
  if (props.route.mode === 'list') return 'Choose a sale';
  if (!props.authorityAccountId) return 'Connect wallet or watch account';
  if (!draftResponse.value) return draftBusy.value ? 'Preparing draft…' : 'Prepare draft';
  if (!props.connectReady) return 'Open wallet session';
  return submitBusy.value ? 'Submitting…' : 'Sign and submit';
});

const buildCreateIntent = async () => {
  const [saleAssetMeta, paymentAssetMeta] = await Promise.all([
    resolveAssetDefinitionMetadata(props.toriiUrl, createSaleAssetId.value, 'Sale asset'),
    resolveAssetDefinitionMetadata(props.toriiUrl, createPaymentAssetId.value, 'Payment asset')
  ]);
  const paymentScale = paymentAssetMeta.scale ?? 0;
  const unitPrice = scaleDecimalToBaseUnits(createUnitPrice.value, paymentScale, 'Unit price');
  const softCap = scaleDecimalToBaseUnits(createSoftCap.value, paymentScale, 'Soft cap', { allowZero: true });
  const hardCap = scaleDecimalToBaseUnits(createHardCap.value, paymentScale, 'Hard cap');
  const intent = buildLaunchpadCreateIntent({
    saleId: createSaleId.value,
    dataspace: props.dataspace,
    saleAssetId: saleAssetMeta.id,
    paymentAssetId: paymentAssetMeta.id,
    treasuryAccountId: createTreasuryAccountId.value,
    unitPrice,
    softCap,
    hardCap,
    claimStartSlot: createClaimStartSlot.value,
    claimEndSlot: createClaimEndSlot.value,
    gate: props.writeGateReason
  });
  reviewItems.value = [
    { label: 'Sale asset', value: saleAssetMeta.alias || saleAssetMeta.id },
    { label: 'Payment asset', value: paymentAssetMeta.alias || paymentAssetMeta.id },
    { label: 'Unit price', value: `${createUnitPrice.value} -> ${unitPrice}` },
    { label: 'Soft cap', value: `${createSoftCap.value} -> ${softCap}` },
    { label: 'Hard cap', value: `${createHardCap.value} -> ${hardCap}` },
    { label: 'Claim slots', value: `${createClaimStartSlot.value} - ${createClaimEndSlot.value}` }
  ];
  createIntent.value = JSON.stringify(intent.payload, null, 2);
  return intent;
};

const buildDetailIntent = async () => {
  const sale = selected.value;
  if (!sale) {
    throw new Error('Choose a live sale before preparing a launchpad draft.');
  }

  switch (detailAction.value) {
    case 'contribute': {
      if (!props.authorityAccountId) {
        throw new Error('Choose an account before preparing a contribution.');
      }
      const paymentMeta = await resolveAssetDefinitionMetadata(props.toriiUrl, sale.paymentAssetId, 'Payment asset');
      const paymentScale = paymentMeta.scale ?? 0;
      const paymentAmount = scaleDecimalToBaseUnits(contributeAmount.value, paymentScale, 'Payment amount');
      const intent = buildLaunchpadContributeIntent({
        authorityAccountId: props.authorityAccountId,
        dataspace: props.dataspace,
        saleId: sale.id,
        paymentAmount,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Sale', value: sale.id },
        { label: 'Status', value: saleStage(sale) },
        { label: 'Payment amount', value: `${contributeAmount.value} -> ${paymentAmount}` }
      ];
      createIntent.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'claim': {
      if (!props.authorityAccountId) {
        throw new Error('Choose an account before preparing a claim.');
      }
      if (!selectedAllocation.value) {
        throw new Error('No allocation was found for this sale on the selected account.');
      }
      const intent = buildLaunchpadClaimIntent({
        authorityAccountId: props.authorityAccountId,
        allocationId: selectedAllocation.value.id,
        dataspace: props.dataspace,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Allocation', value: selectedAllocation.value.id },
        { label: 'Claimable sale amount', value: formatAssetQuantity(selectedAllocation.value.saleAmount, sale.saleAssetId) }
      ];
      createIntent.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'refund': {
      if (!props.authorityAccountId) {
        throw new Error('Choose an account before preparing a refund.');
      }
      if (!selectedAllocation.value) {
        throw new Error('No allocation was found for this sale on the selected account.');
      }
      const intent = buildLaunchpadRefundIntent({
        authorityAccountId: props.authorityAccountId,
        allocationId: selectedAllocation.value.id,
        dataspace: props.dataspace,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Allocation', value: selectedAllocation.value.id },
        {
          label: 'Refund amount',
          value: formatAssetQuantity(selectedAllocation.value.paymentAmount, sale.paymentAssetId)
        }
      ];
      createIntent.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'close': {
      const intent = buildLaunchpadCloseIntent({
        saleId: sale.id,
        dataspace: props.dataspace,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Sale', value: sale.id },
        { label: 'Raised', value: formatAssetQuantity(sale.raised, sale.paymentAssetId) }
      ];
      createIntent.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'seed': {
      const saleAssetMeta = await resolveAssetDefinitionMetadata(props.toriiUrl, sale.saleAssetId, 'Sale asset');
      const claimInventoryAmount = scaleDecimalToBaseUnits(
        seedClaimInventoryAmount.value,
        saleAssetMeta.scale ?? 0,
        'Claim inventory amount',
        { allowZero: true }
      );
      const intent = buildLaunchpadSeedIntent({
        saleId: sale.id,
        claimInventoryAmount,
        dataspace: props.dataspace,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Sale', value: sale.id },
        { label: 'Claim inventory amount', value: `${seedClaimInventoryAmount.value} -> ${claimInventoryAmount}` }
      ];
      createIntent.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
  }
};

const buildIntent = async () => {
  if (props.route.mode === 'create') {
    return buildCreateIntent();
  }
  if (props.route.mode === 'detail') {
    return buildDetailIntent();
  }
  throw new Error('Choose a sale or switch to create before preparing a launchpad draft.');
};

const previewPayload = async () => {
  draftError.value = null;
  try {
    await buildIntent();
  } catch (caught) {
    draftError.value = caught instanceof Error ? caught.message : String(caught);
  }
};

const prepareDraft = async () => {
  draftBusy.value = true;
  draftError.value = null;
  draftResponseJson.value = '';
  draftRequest.value = null;
  draftResponse.value = null;
  submitError.value = null;
  submitResponseJson.value = '';
  submitPipelineJson.value = '';
  submitPipelineNote.value = '';
  try {
    if (!props.authorityAccountId) {
      throw new Error('Open the wallet drawer and choose an account before preparing a launchpad draft.');
    }
    if (!launchpadContractAddress.value) {
      throw new Error(
        `No deployed contract address is configured for ${launchpadContractKey}. Sync the registry from a live deployment before preparing Torii drafts.`
      );
    }
    const intent = await buildIntent();
    const request: ContractCallDraftRequest = {
      authority: props.authorityAccountId,
      contract_address: launchpadContractAddress.value,
      entrypoint: intent.entrypoint,
      payload: intent.payload,
      gas_limit: 5000
    };
    const response = await prepareContractCallDraft(props.toriiUrl, request);
    draftRequest.value = request;
    draftResponse.value = response;
    draftResponseJson.value = JSON.stringify(response, null, 2);
  } catch (caught) {
    draftError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    draftBusy.value = false;
  }
};

const submitViaConnect = async () => {
  submitBusy.value = true;
  submitError.value = null;
  submitResponseJson.value = '';
  try {
    if (!draftRequest.value || !draftResponse.value) {
      throw new Error('Prepare a draft before requesting a wallet signature.');
    }
    const response = await props.submitDraftViaConnect({
      request: draftRequest.value,
      draft: draftResponse.value,
      domainTag: 'IROHA_TORII_CONTRACT_CALL'
    });
    submitResponseJson.value = JSON.stringify(response.response, null, 2);
    if (response.pipelineStatus) {
      submitPipelineJson.value = JSON.stringify(response.pipelineStatus, null, 2);
      submitPipelineNote.value = response.pipelineCompleted
        ? `Pipeline confirmation reached ${response.pipelineStatus.content.status.kind}.`
        : `Latest pipeline status is ${response.pipelineStatus.content.status.kind}; waiting for Applied can continue after refresh.`;
    } else if (response.response.tx_hash_hex) {
      submitPipelineNote.value = 'Detached submit returned a transaction hash, but pipeline status is not visible yet.';
    }
  } catch (caught) {
    submitError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    submitBusy.value = false;
  }
};

const handlePrimaryAction = async () => {
  if (props.route.mode === 'list') return;
  if (!props.authorityAccountId) {
    emit('open-connect');
    return;
  }
  if (!draftResponse.value) {
    await prepareDraft();
    return;
  }
  if (!props.connectReady) {
    emit('open-connect');
    return;
  }
  await submitViaConnect();
};
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero">
      <p class="eyebrow">Launchpad</p>
      <h2 class="panel-title">{{ currentFlowLabel }}</h2>
      <p class="panel-subtitle">{{ currentSummary }}</p>
      <div class="action-row">
        <button class="button is-ghost" type="button" @click="emit('navigate', { mode: 'list' })">Browse sales</button>
        <button class="button" type="button" @click="emit('navigate', { mode: 'create' })">Create sale</button>
      </div>
    </section>

    <div class="notice is-warn">{{ writeGateReason }}</div>
    <div v-if="salesError" class="notice is-danger">{{ salesError }}</div>
    <div v-if="allocationsError" class="notice is-danger">{{ allocationsError }}</div>

    <section v-if="route.mode === 'list'" class="list-grid">
      <article v-for="sale in sales" :key="sale.id" class="panel module-card">
        <div class="module-meta">
          <p class="eyebrow">{{ assetLabel(sale.saleAssetId) }}</p>
          <span class="tag" :class="stageTone(saleStage(sale))">
            {{ saleStage(sale) }}
          </span>
        </div>
        <h3 class="panel-title">{{ sale.id }}</h3>
        <p class="panel-subtitle">
          Raise {{ formatAssetQuantity(sale.hardCap, sale.paymentAssetId) }} against
          {{ assetLabel(sale.saleAssetId) }} inventory.
        </p>
        <div class="summary-list">
          <div>
            <span>Raised</span>
            <strong>{{ formatAssetQuantity(sale.raised, sale.paymentAssetId) }}</strong>
          </div>
          <div>
            <span>Sold</span>
            <strong>{{ formatAssetQuantity(sale.sold, sale.saleAssetId) }}</strong>
          </div>
          <div>
            <span>Claim window</span>
            <strong>{{ claimWindowLabel(sale) }}</strong>
          </div>
          <div>
            <span>Readiness</span>
            <strong>{{ saleReadinessLabel(sale, allocations.find((allocation) => allocation.saleId === sale.id)) }}</strong>
          </div>
        </div>
        <div class="progress">
          <span :style="{ width: `${saleProgress(sale) * 100}%` }"></span>
        </div>
        <button class="button" type="button" @click="emit('navigate', { mode: 'detail', id: sale.id })">
          Open sale
        </button>
      </article>

      <article v-if="!salesBusy && !sales.length" class="panel module-card">
        <div class="module-meta">
          <p class="eyebrow">Empty</p>
          <span class="tag is-muted">No live sales</span>
        </div>
        <h3 class="panel-title">No launchpad sales found</h3>
        <p class="panel-subtitle">
          This endpoint is readable, but no sale state was discovered under the launchpad factory yet.
        </p>
      </article>
    </section>

    <div v-else class="split-grid split-grid--trade">
      <section class="panel">
        <div v-if="!authorityAccountId" class="notice is-warn onboarding-note">
          <div class="stack stack--tight">
            <strong>Connect a wallet or choose a watch account before preparing a launchpad action.</strong>
            <span>{{ nextActionHint }}</span>
          </div>
          <button class="button is-soft" type="button" @click="emit('open-connect')">
            Open wallet and account setup
          </button>
        </div>

        <template v-if="route.mode === 'detail' && selected">
          <div class="section-head section-head--spread">
            <div>
              <p class="eyebrow">{{ assetLabel(selected.saleAssetId) }}</p>
              <h3 class="panel-title">{{ selected.id }}</h3>
              <p class="panel-subtitle">
                Raise {{ formatAssetQuantity(selected.hardCap, selected.paymentAssetId) }} using
                {{ assetLabel(selected.paymentAssetId) }}.
              </p>
            </div>
          </div>

          <div class="summary-list">
            <div>
              <span>Status</span>
              <strong>{{ saleStage(selected) }}</strong>
            </div>
            <div>
              <span>Raised</span>
              <strong>{{ formatAssetQuantity(selected.raised, selected.paymentAssetId) }}</strong>
            </div>
            <div>
              <span>Sold</span>
              <strong>{{ formatAssetQuantity(selected.sold, selected.saleAssetId) }}</strong>
            </div>
            <div>
              <span>Claim inventory</span>
              <strong>{{ formatAssetQuantity(selected.claimInventory, selected.saleAssetId) }}</strong>
            </div>
            <div>
              <span>Claim window</span>
              <strong>{{ claimWindowLabel(selected) }}</strong>
            </div>
            <div>
              <span>Next action</span>
              <strong>{{ saleReadinessLabel(selected, selectedAllocation) }}</strong>
            </div>
          </div>

          <div v-if="selectedAllocation" class="summary-list">
            <div>
              <span>Your allocation</span>
              <strong class="mono">{{ selectedAllocation.id }}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>{{ formatAssetQuantity(selectedAllocation.paymentAmount, selected.paymentAssetId) }}</strong>
            </div>
            <div>
              <span>Sale amount</span>
              <strong>{{ formatAssetQuantity(selectedAllocation.saleAmount, selected.saleAssetId) }}</strong>
            </div>
            <div>
              <span>Claimed</span>
              <strong>{{ formatAssetQuantity(selectedAllocation.claimedAmount, selected.saleAssetId) }}</strong>
            </div>
          </div>

          <div v-if="availableActions.length" class="subtabs">
            <button
              v-for="action in availableActions"
              :key="action"
              class="subtab"
              :class="{ 'is-active': detailAction === action }"
              type="button"
              @click="detailAction = action"
            >
              {{ action }}
            </button>
          </div>

          <label v-if="detailAction === 'contribute'" class="field">
            <span>Payment amount</span>
            <input v-model="contributeAmount" class="input" inputmode="decimal" />
          </label>
          <label v-if="detailAction === 'seed'" class="field">
            <span>Claim inventory amount</span>
            <input v-model="seedClaimInventoryAmount" class="input" inputmode="decimal" />
          </label>
        </template>

        <template v-else-if="route.mode === 'create'">
          <div class="section-head section-head--spread">
            <div>
              <p class="eyebrow">Create</p>
              <h3 class="panel-title">Configure sale</h3>
              <p class="panel-subtitle">The fields stay human-readable while the normalized payload remains visible beside them.</p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Sale id</span>
              <input v-model="createSaleId" class="input" placeholder="sora-index" />
            </label>
            <label class="field">
              <span>Sale asset id or alias</span>
              <input v-model="createSaleAssetId" class="input mono" placeholder="sindex#soraswap.launchpad" />
            </label>
            <label class="field">
              <span>Payment asset id or alias</span>
              <input v-model="createPaymentAssetId" class="input mono" placeholder="xor#universal" />
            </label>
            <label class="field">
              <span>Treasury account</span>
              <input v-model="createTreasuryAccountId" class="input mono" placeholder="i105..." />
            </label>
            <label class="field">
              <span>Unit price</span>
              <input v-model="createUnitPrice" class="input" inputmode="decimal" />
            </label>
            <label class="field">
              <span>Soft cap</span>
              <input v-model="createSoftCap" class="input" inputmode="decimal" />
            </label>
            <label class="field">
              <span>Hard cap</span>
              <input v-model="createHardCap" class="input" inputmode="decimal" />
            </label>
            <label class="field">
              <span>Claim start slot</span>
              <input v-model="createClaimStartSlot" class="input mono" inputmode="numeric" />
            </label>
            <label class="field">
              <span>Claim end slot</span>
              <input v-model="createClaimEndSlot" class="input mono" inputmode="numeric" />
            </label>
          </div>
        </template>

        <div class="action-row action-row--trade">
          <button class="button is-ghost" type="button" @click="previewPayload">
            Preview payload
          </button>
          <button class="button" type="button" :disabled="draftBusy || submitBusy" @click="handlePrimaryAction">
            {{ primaryActionLabel }}
          </button>
        </div>

        <div v-if="draftError" class="notice is-danger">{{ draftError }}</div>
        <div v-if="submitError" class="notice is-danger">{{ submitError }}</div>
        <div v-if="submitPipelineNote" class="notice" :class="submitPipelineJson && submitPipelineNote.includes('reached') ? 'is-success' : 'is-warn'">
          {{ submitPipelineNote }}
        </div>

        <div class="summary-list">
          <div>
            <span>State</span>
            <strong>{{ executionState }}</strong>
          </div>
          <div>
            <span>Next step</span>
            <strong>{{ nextActionHint }}</strong>
          </div>
          <div>
            <span>Current slot</span>
            <strong>{{ currentSlot ?? '--' }}</strong>
          </div>
        </div>
      </section>

      <section class="panel trade-sidebar">
        <div class="stack stack--tight">
          <p class="eyebrow">Review</p>
          <h3 class="panel-title">{{ currentFlowLabel }}</h3>
          <p class="panel-subtitle">Human-readable sale state stays first, and the raw payload plus responses remain visible underneath it.</p>
        </div>

        <div class="summary-list">
          <div>
            <span>Contract</span>
            <strong class="mono">{{ launchpadContractKey }}</strong>
          </div>
          <div>
            <span>Authority</span>
            <strong class="mono">{{ authorityAccountId || '--' }}</strong>
          </div>
          <div>
            <span>Connect</span>
            <strong>{{ connectReady ? 'ready' : 'needed' }}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{{ route.mode === 'detail' ? detailAction : route.mode }}</strong>
          </div>
        </div>

        <div v-if="reviewItems.length" class="summary-list">
          <div v-for="item in reviewItems" :key="item.label">
            <span>{{ item.label }}</span>
            <strong class="mono">{{ item.value }}</strong>
          </div>
        </div>
      </section>
    </div>

    <ExecutionInspector
      title="Launchpad inspector"
      subtitle="Human sale state stays in the main surface, while the raw payload and Torii responses remain visible here."
      :summary="launchpadInspectorSummary"
      :entries="launchpadInspectorEntries"
      empty-copy="Preview or prepare a launchpad flow and the payload stream will appear here."
    />
  </div>
</template>
