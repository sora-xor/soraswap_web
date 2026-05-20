<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ExecutionInspector from '@/components/ExecutionInspector.vue';
import { SORASWAP_MODULES } from '@/data/soraswap';
import { formatBaseUnits, scaleDecimalToBaseUnits } from '@/services/amounts';
import {
  resolveAssetDefinitionMetadata,
  resolveTokenAssetMetadata,
  type AssetDefinitionMetadata
} from '@/services/assets';
import { fetchFarmConfig, prepareContractCallDraft } from '@/services/contracts';
import { formatNumber } from '@/services/format';
import { buildDefiIntent, type DefiOperationKind } from '@/services/intents';
import {
  loadAutomationJobs,
  loadCoverPolicies,
  loadFarmPositions
} from '@/services/liveSoraswap';
import { resolveContractAddressForRole, summarizeModuleRegistryCoverage } from '@/services/registry';
import { toriiClient } from '@/services/torii';
import type {
  ContractCallDraftRequest,
  ContractCallResponse,
  ContractCallSubmitResult,
  ContractInstancesResponse,
  FarmConfig,
  LiveAutomationJob,
  LiveCoverPolicy,
  LiveFarmPosition
} from '@/types';

const props = defineProps<{
  contracts: ContractInstancesResponse | null;
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
  (e: 'open-connect'): void;
}>();

const moduleCoverage = computed(() => {
  const instances = props.contracts?.instances || [];
  return Object.fromEntries(
    SORASWAP_MODULES.map((module) => [module.id, summarizeModuleRegistryCoverage(module.id, instances)])
  );
});
const getCoverage = (moduleId: string) => moduleCoverage.value[moduleId];
const isDiscovered = (moduleId: string) => getCoverage(moduleId)?.discoveredTotal > 0;
const isVerified = (moduleId: string) => {
  const coverage = getCoverage(moduleId);
  return Boolean(coverage && coverage.expectedTotal > 0 && coverage.verifiedTotal === coverage.expectedTotal);
};

const operation = ref<DefiOperationKind>('n3x_mint');
const n3xUsdt = ref('100');
const n3xUsdc = ref('0');
const n3xKusd = ref('0');
const n3xAmount = ref('250');
const farmPosition = ref('');
const farmAmount = ref('1000');
const coverPolicy = ref('');
const coverLowerBound = ref('9000');
const coverUpperBound = ref('11000');
const coverPayoutAmount = ref('100');
const coverMonitoringWindowSlots = ref('100');
const coverRequiredObservations = ref('3');
const coverNotional = ref('1000');
const coverPremiumPaid = ref('10');
const coverRegistrationSlot = ref('0');
const coverCurrentSlot = ref('0');
const automationJob = ref('job-001');
const automationPayloadHash = ref('1');
const automationNextSlot = ref('0');
const automationMaxRetries = ref('3');
const automationRetryDelaySlots = ref('10');

const intentJson = ref('');
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
const farmConfig = ref<FarmConfig | null>(null);
const reviewItems = ref<Array<{ label: string; value: string }>>([]);

const farmPositions = ref<LiveFarmPosition[]>([]);
const farmPositionsError = ref<string | null>(null);
const coverPolicies = ref<LiveCoverPolicy[]>([]);
const coverPoliciesError = ref<string | null>(null);
const automationJobs = ref<LiveAutomationJob[]>([]);
const automationJobsError = ref<string | null>(null);
const currentSlot = ref<number | null>(null);
const assetMetadata = ref<Record<string, AssetDefinitionMetadata | null>>({});

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
  farmConfig.value = null;
  if (clearIntent) {
    intentJson.value = '';
  }
};

const ensureAssetMetadata = async (assetIds: string[]) => {
  const uniqueIds = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))];
  const missingIds = uniqueIds.filter((id) => !(id in assetMetadata.value));
  if (!missingIds.length) return;

  const requestId = assetRequestId + 1;
  assetRequestId = requestId;
  const entries = await Promise.all(
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
    ...Object.fromEntries(entries)
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

const loadCurrentSlot = async () => {
  try {
    const metrics = await toriiClient.fetchExplorerMetrics(props.toriiUrl);
    currentSlot.value = metrics.blockHeight || null;
  } catch {
    currentSlot.value = null;
  }
};

const loadFarmPortfolio = async () => {
  farmPositionsError.value = null;
  try {
    if (!props.authorityAccountId) {
      farmPositions.value = [];
      return;
    }
    farmPositions.value = await loadFarmPositions(props.toriiUrl, props.authorityAccountId);
  } catch (caught) {
    farmPositionsError.value = caught instanceof Error ? caught.message : String(caught);
  }
};

const loadCoverPortfolio = async () => {
  coverPoliciesError.value = null;
  try {
    const nextPolicies = await loadCoverPolicies(props.toriiUrl);
    coverPolicies.value = nextPolicies;
    await ensureAssetMetadata(nextPolicies.map((policy) => policy.settlementAssetId).filter(Boolean));
  } catch (caught) {
    coverPoliciesError.value = caught instanceof Error ? caught.message : String(caught);
  }
};

const loadAutomationPortfolio = async () => {
  automationJobsError.value = null;
  try {
    if (!props.authorityAccountId) {
      automationJobs.value = [];
      return;
    }
    automationJobs.value = await loadAutomationJobs(props.toriiUrl, props.authorityAccountId);
  } catch (caught) {
    automationJobsError.value = caught instanceof Error ? caught.message : String(caught);
  }
};

watch(
  () => props.toriiUrl,
  async () => {
    await Promise.all([loadCurrentSlot(), loadCoverPortfolio()]);
  },
  { immediate: true }
);

watch(
  () => props.authorityAccountId,
  async () => {
    await Promise.all([loadFarmPortfolio(), loadAutomationPortfolio()]);
  },
  { immediate: true }
);

watch(
  [
    operation,
    n3xUsdt,
    n3xUsdc,
    n3xKusd,
    n3xAmount,
    farmPosition,
    farmAmount,
    coverPolicy,
    coverLowerBound,
    coverUpperBound,
    coverPayoutAmount,
    coverMonitoringWindowSlots,
    coverRequiredObservations,
    coverNotional,
    coverPremiumPaid,
    coverRegistrationSlot,
    coverCurrentSlot,
    automationJob,
    automationPayloadHash,
    automationNextSlot,
    automationMaxRetries,
    automationRetryDelaySlots,
    () => props.authorityAccountId
  ],
  () => {
    resetExecutionState(true);
  }
);

watch(
  farmPositions,
  (positions) => {
    if (!farmPosition.value && positions.length) {
      farmPosition.value = positions[0].id;
    }
  },
  { immediate: true }
);

watch(
  coverPolicies,
  (policies) => {
    if (!coverPolicy.value && policies.length) {
      coverPolicy.value = policies[0].id;
    }
  },
  { immediate: true }
);

watch(
  automationJobs,
  (jobs) => {
    if (!automationJob.value && jobs.length) {
      automationJob.value = jobs[0].id;
    }
  },
  { immediate: true }
);

const activeModuleId = computed(() => {
  if (operation.value.startsWith('farm')) return 'farms';
  if (operation.value.startsWith('cover')) return 'cover';
  if (operation.value.startsWith('automation')) return 'automation';
  return 'n3x';
});
const moduleTabs = [
  { id: 'n3x', label: 'n3x' },
  { id: 'farms', label: 'Farms' },
  { id: 'cover', label: 'Cover' },
  { id: 'automation', label: 'Automation' }
] as const;
const moduleActions: Record<(typeof moduleTabs)[number]['id'], Array<{ value: DefiOperationKind; label: string }>> = {
  n3x: [
    { value: 'n3x_mint', label: 'Mint' },
    { value: 'n3x_redeem', label: 'Redeem' }
  ],
  farms: [
    { value: 'farm_stake', label: 'Stake' },
    { value: 'farm_claim', label: 'Claim' }
  ],
  cover: [
    { value: 'cover_register', label: 'Register' },
    { value: 'cover_claim', label: 'Claim' },
    { value: 'cover_expire', label: 'Expire' }
  ],
  automation: [
    { value: 'automation_enqueue', label: 'Enqueue' },
    { value: 'automation_configure', label: 'Configure' },
    { value: 'automation_pause', label: 'Pause' },
    { value: 'automation_resume', label: 'Resume' },
    { value: 'automation_retry', label: 'Retry' },
    { value: 'automation_cancel', label: 'Cancel' }
  ]
};

const activeContractLabel = computed(() => {
  if (activeModuleId.value === 'farms') return 'farms.farm';
  if (activeModuleId.value === 'cover') return 'cover.policy_manager';
  if (activeModuleId.value === 'automation') return 'automation.job_queue';
  return 'n3x.n3x_hub';
});
const activeModuleActions = computed(() => moduleActions[activeModuleId.value]);

const activeOperationLabel = computed(() => {
  switch (operation.value) {
    case 'n3x_mint':
      return 'n3x mint';
    case 'n3x_redeem':
      return 'n3x redeem';
    case 'farm_stake':
      return 'farm stake';
    case 'farm_claim':
      return 'farm claim';
    case 'cover_register':
      return 'cover register';
    case 'cover_claim':
      return 'cover claim';
    case 'cover_expire':
      return 'cover expire';
    case 'automation_enqueue':
      return 'automation enqueue';
    case 'automation_configure':
      return 'automation configure';
    case 'automation_pause':
      return 'automation pause';
    case 'automation_resume':
      return 'automation resume';
    case 'automation_retry':
      return 'automation retry';
    case 'automation_cancel':
      return 'automation cancel';
  }
});

const flowSummary = computed(() => {
  switch (operation.value) {
    case 'n3x_mint':
      return 'Deposit one or more stable inputs and mint basket exposure from the same DeFi surface.';
    case 'n3x_redeem':
      return 'Redeem n3x back into the live basket using the current hub ratios.';
    case 'farm_stake':
      return 'Stake the configured farm asset into a live position from the same wallet session path as Swap.';
    case 'farm_claim':
      return 'Claim accrued rewards for an existing farm position without bouncing back into diagnostics.';
    case 'cover_register':
      return 'Register a new policy with explicit bounds, payout, window, and premium inputs.';
    case 'cover_claim':
      return 'Claim against an owned live policy using the current policy state and payout rules.';
    case 'cover_expire':
      return 'Expire an active policy at the current chain slot without routing a payout.';
    case 'automation_enqueue':
      return 'Queue a job for the selected owner account and keep the scheduling metadata in the same view.';
    case 'automation_configure':
      return 'Adjust the next slot, retry limit, and retry delay of a live automation job.';
    case 'automation_pause':
      return 'Pause a live queued or running automation job.';
    case 'automation_resume':
      return 'Resume a paused automation job at the current chain slot.';
    case 'automation_retry':
      return 'Re-queue a job at the current chain slot without leaving the product flow.';
    case 'automation_cancel':
      return 'Cancel a live job and keep the resulting draft plus pipeline status visible.';
  }
});

const executionState = computed(() => {
  if (!props.authorityAccountId) return 'Account needed';
  if (!draftResponse.value) return 'Draft not prepared';
  if (!props.connectReady) return 'Wallet session needed';
  return 'Ready to sign';
});

const nextActionHint = computed(() => {
  if (!props.authorityAccountId) {
    return 'Open the wallet drawer to connect a session or choose a watch account first.';
  }
  if (!draftResponse.value) {
    return 'Review the live portfolio state, then prepare the contract-call draft.';
  }
  if (!props.connectReady) {
    return 'Open or resume the wallet session so the prepared draft can be signed.';
  }
  return 'The draft is ready. Sign it from the connected wallet when you want to submit.';
});

const primaryActionLabel = computed(() => {
  if (!props.authorityAccountId) return 'Connect wallet or watch account';
  if (!draftResponse.value) return draftBusy.value ? 'Preparing draft…' : 'Prepare draft';
  if (!props.connectReady) return 'Open wallet session';
  return submitBusy.value ? 'Submitting…' : 'Sign and submit';
});

const selectedFarmPosition = computed(
  () => farmPositions.value.find((position) => position.id === farmPosition.value) || null
);
const selectedCoverPolicy = computed(
  () => coverPolicies.value.find((policy) => policy.id === coverPolicy.value) || null
);
const selectedAutomationJob = computed(
  () => automationJobs.value.find((job) => job.id === automationJob.value) || null
);
const ownedCoverPolicies = computed(() =>
  coverPolicies.value.filter((policy) => policy.ownerAccountId === props.authorityAccountId)
);

const automationStatusLabel = (status: string) => {
  switch (status) {
    case '1':
      return 'queued';
    case '2':
      return 'running';
    case '3':
      return 'done';
    case '4':
      return 'paused';
    case '5':
      return 'canceled';
    default:
      return `status ${status}`;
  }
};
const coverStatusLabel = (policy: LiveCoverPolicy) => {
  switch (policy.status) {
    case '1':
      return 'active';
    case '2':
      return 'breaching';
    case '3':
      return 'claimable';
    case '4':
      return 'claimed';
    case '5':
      return 'expired';
    default:
      return `status ${policy.status}`;
  }
};
const useFarmSelectionCards = computed(() => farmPositions.value.length > 0);
const useAutomationSelectionCards = computed(
  () => operation.value !== 'automation_enqueue' && automationJobs.value.length > 0
);
const defiInspectorSummary = computed(() => [
  { label: 'Contract', value: activeContractLabel.value, mono: true },
  { label: 'Authority', value: props.authorityAccountId || '--', mono: Boolean(props.authorityAccountId) },
  { label: 'Wallet session', value: props.connectReady ? 'Ready' : 'Needed' },
  { label: 'Current slot', value: currentSlot.value === null ? '--' : String(currentSlot.value) }
]);
const defiInspectorEntries = computed(() => [
  { label: 'Intent payload', value: intentJson.value },
  { label: 'Draft response', value: draftResponseJson.value },
  { label: 'Submitted response', value: submitResponseJson.value },
  { label: 'Pipeline status', value: submitPipelineJson.value }
]);

const buildIntent = async () => {
  const authorityAccountId = props.authorityAccountId || '<authority-account-id>';

  switch (operation.value) {
    case 'n3x_mint': {
      const [usdtMeta, usdcMeta, kusdMeta] = await Promise.all([
        resolveTokenAssetMetadata(props.toriiUrl, 'USDT'),
        resolveTokenAssetMetadata(props.toriiUrl, 'USDC'),
        resolveTokenAssetMetadata(props.toriiUrl, 'KUSD')
      ]);
      const usdtIn = scaleDecimalToBaseUnits(n3xUsdt.value, usdtMeta.scale ?? 0, 'USDT in', { allowZero: true });
      const usdcIn = scaleDecimalToBaseUnits(n3xUsdc.value, usdcMeta.scale ?? 0, 'USDC in', { allowZero: true });
      const kusdIn = scaleDecimalToBaseUnits(n3xKusd.value, kusdMeta.scale ?? 0, 'KUSD in', { allowZero: true });
      if (BigInt(usdtIn) + BigInt(usdcIn) + BigInt(kusdIn) <= 0n) {
        throw new Error('Enter at least one stable input greater than zero.');
      }
      const intent = buildDefiIntent({
        kind: 'n3x_mint',
        authorityAccountId,
        dataspace: props.dataspace,
        usdtIn,
        usdcIn,
        kusdIn,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'USDT in', value: `${n3xUsdt.value} -> ${usdtIn}` },
        { label: 'USDC in', value: `${n3xUsdc.value} -> ${usdcIn}` },
        { label: 'KUSD in', value: `${n3xKusd.value} -> ${kusdIn}` }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'n3x_redeem': {
      const n3xMeta = await resolveTokenAssetMetadata(props.toriiUrl, 'N3X');
      const n3xScaled = scaleDecimalToBaseUnits(n3xAmount.value, n3xMeta.scale ?? 0, 'n3x amount');
      const intent = buildDefiIntent({
        kind: 'n3x_redeem',
        authorityAccountId,
        dataspace: props.dataspace,
        n3xAmount: n3xScaled,
        gate: props.writeGateReason
      });
      reviewItems.value = [{ label: 'n3x amount', value: `${n3xAmount.value} -> ${n3xScaled}` }];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'farm_stake': {
      if (!props.authorityAccountId) {
        throw new Error('Choose an account before preparing a farm draft.');
      }
      const farmAddress = resolveContractAddressForRole('farm');
      if (!farmAddress) {
        throw new Error('No deployed farm contract address is configured yet. Sync the registry from a live deployment first.');
      }
      const config = await fetchFarmConfig(props.toriiUrl, props.authorityAccountId, farmAddress);
      const stakeMeta = await resolveAssetDefinitionMetadata(props.toriiUrl, config.stakeAssetId, 'Stake asset');
      const stakeAmount = scaleDecimalToBaseUnits(farmAmount.value, stakeMeta.scale ?? 0, 'Stake amount');
      farmConfig.value = config;
      await ensureAssetMetadata([config.stakeAssetId, config.rewardAssetId]);
      const intent = buildDefiIntent({
        kind: 'farm_stake',
        authorityAccountId,
        dataspace: props.dataspace,
        position: farmPosition.value,
        amount: stakeAmount,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Position', value: farmPosition.value },
        { label: 'Stake asset', value: assetLabel(config.stakeAssetId) },
        { label: 'Stake amount', value: `${farmAmount.value} -> ${stakeAmount}` }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'farm_claim': {
      const intent = buildDefiIntent({
        kind: 'farm_claim',
        authorityAccountId,
        dataspace: props.dataspace,
        position: farmPosition.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [{ label: 'Position', value: farmPosition.value }];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'cover_register': {
      const intent = buildDefiIntent({
        kind: 'cover_register',
        authorityAccountId,
        dataspace: props.dataspace,
        lowerBound: coverLowerBound.value,
        upperBound: coverUpperBound.value,
        payoutAmount: coverPayoutAmount.value,
        monitoringWindowSlots: coverMonitoringWindowSlots.value,
        requiredObservations: coverRequiredObservations.value,
        coveredNotional: coverNotional.value,
        premiumPaid: coverPremiumPaid.value,
        registrationSlot: coverRegistrationSlot.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Bounds', value: `${coverLowerBound.value} - ${coverUpperBound.value}` },
        { label: 'Payout', value: coverPayoutAmount.value },
        { label: 'Covered notional', value: coverNotional.value },
        { label: 'Premium paid', value: coverPremiumPaid.value }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'cover_claim': {
      if (!selectedCoverPolicy.value) {
        throw new Error('Choose a live cover policy before preparing a claim.');
      }
      const intent = buildDefiIntent({
        kind: 'cover_claim',
        authorityAccountId,
        dataspace: props.dataspace,
        policyId: selectedCoverPolicy.value.id,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Policy', value: selectedCoverPolicy.value.id },
        { label: 'Breach elapsed', value: selectedCoverPolicy.value.breachElapsed },
        { label: 'Claim payout', value: selectedCoverPolicy.value.claimPayout }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'cover_expire': {
      if (!selectedCoverPolicy.value) {
        throw new Error('Choose a live cover policy before preparing an expiry.');
      }
      const intent = buildDefiIntent({
        kind: 'cover_expire',
        authorityAccountId,
        dataspace: props.dataspace,
        policyId: selectedCoverPolicy.value.id,
        currentSlot: coverCurrentSlot.value || String(currentSlot.value ?? 0),
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Policy', value: selectedCoverPolicy.value.id },
        { label: 'Current slot', value: coverCurrentSlot.value || String(currentSlot.value ?? 0) }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_enqueue': {
      const intent = buildDefiIntent({
        kind: 'automation_enqueue',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        payloadHash: automationPayloadHash.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Job', value: automationJob.value },
        { label: 'Payload hash', value: automationPayloadHash.value }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_configure': {
      const intent = buildDefiIntent({
        kind: 'automation_configure',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        nextSlot: automationNextSlot.value,
        maxRetries: automationMaxRetries.value,
        retryDelaySlots: automationRetryDelaySlots.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Job', value: automationJob.value },
        { label: 'Next slot', value: automationNextSlot.value },
        { label: 'Max retries', value: automationMaxRetries.value },
        { label: 'Retry delay', value: automationRetryDelaySlots.value }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_pause': {
      const intent = buildDefiIntent({
        kind: 'automation_pause',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [{ label: 'Job', value: automationJob.value }];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_resume': {
      if (currentSlot.value === null) {
        throw new Error('The current chain slot is not readable from this endpoint yet.');
      }
      const intent = buildDefiIntent({
        kind: 'automation_resume',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        currentSlot: String(currentSlot.value),
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Job', value: automationJob.value },
        { label: 'Current slot', value: String(currentSlot.value) }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_retry': {
      if (currentSlot.value === null) {
        throw new Error('The current chain slot is not readable from this endpoint yet.');
      }
      const intent = buildDefiIntent({
        kind: 'automation_retry',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        currentSlot: String(currentSlot.value),
        gate: props.writeGateReason
      });
      reviewItems.value = [
        { label: 'Job', value: automationJob.value },
        { label: 'Current slot', value: String(currentSlot.value) }
      ];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
    case 'automation_cancel': {
      const intent = buildDefiIntent({
        kind: 'automation_cancel',
        authorityAccountId,
        dataspace: props.dataspace,
        job: automationJob.value,
        gate: props.writeGateReason
      });
      reviewItems.value = [{ label: 'Job', value: automationJob.value }];
      intentJson.value = JSON.stringify(intent.payload, null, 2);
      return intent;
    }
  }
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
      throw new Error('Open the wallet drawer and choose an account before preparing a DeFi draft.');
    }
    const intent = await buildIntent();
    if (!intent.contractAddress) {
      throw new Error(
        `No deployed contract address is configured for ${intent.contractKey}. Sync the registry from a live deployment before preparing Torii drafts.`
      );
    }
    const request: ContractCallDraftRequest = {
      authority: props.authorityAccountId,
      contract_address: intent.contractAddress,
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

const selectModule = (moduleId: (typeof moduleTabs)[number]['id']) => {
  operation.value = moduleActions[moduleId][0].value;
};

const selectFarmPosition = (positionId: string) => {
  farmPosition.value = positionId;
  if (operation.value === 'farm_claim') return;
  operation.value = 'farm_stake';
};

const selectCoverPolicy = (policyId: string) => {
  coverPolicy.value = policyId;
};

const selectAutomationJob = (jobId: string) => {
  automationJob.value = jobId;
  if (operation.value === 'automation_enqueue') {
    operation.value = 'automation_configure';
  }
};
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero">
      <p class="eyebrow">DeFi</p>
      <h2 class="panel-title">Live protocol surface</h2>
      <p class="panel-subtitle">
        Registry coverage stays visible, but the main surface now works from live farms, cover policies, and automation jobs instead of module placeholders.
      </p>
      <div class="metric-grid">
        <article class="metric-card">
          <span class="metric-label">Dataspace</span>
          <strong class="metric-value mono">{{ contracts?.dataspace || dataspace }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Instances discovered</span>
          <strong class="metric-value">{{ contracts?.total ?? 0 }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Selected flow</span>
          <strong class="metric-value">{{ activeOperationLabel }}</strong>
        </article>
        <article class="metric-card">
          <span class="metric-label">Current slot</span>
          <strong class="metric-value">{{ currentSlot ?? '--' }}</strong>
        </article>
      </div>
    </section>

    <div class="notice is-warn">{{ writeGateReason }}</div>
    <div v-if="farmPositionsError" class="notice is-danger">{{ farmPositionsError }}</div>
    <div v-if="coverPoliciesError" class="notice is-danger">{{ coverPoliciesError }}</div>
    <div v-if="automationJobsError" class="notice is-danger">{{ automationJobsError }}</div>

    <section class="list-grid">
      <article v-for="module in SORASWAP_MODULES" :key="module.id" class="panel module-card">
        <div class="module-meta">
          <p class="eyebrow">{{ module.label }}</p>
          <span
            class="tag"
            :class="
              isVerified(module.id)
                ? 'is-success'
                : isDiscovered(module.id)
                  ? 'is-live'
                  : module.status === 'blocked'
                    ? 'is-danger'
                    : 'is-warn'
            "
          >
            {{
              isVerified(module.id)
                ? 'manifest verified'
                : isDiscovered(module.id)
                  ? 'instance discovered'
                  : module.status
            }}
          </span>
        </div>
        <h3 class="panel-title">{{ module.contract }}</h3>
        <p class="panel-subtitle">{{ module.summary }}</p>
        <div class="keyline"></div>
        <p class="muted">{{ module.capability }}</p>
      </article>
    </section>

    <div class="split-grid split-grid--trade">
      <section class="panel">
        <div class="section-head section-head--spread">
          <div>
            <p class="eyebrow">Execution</p>
            <h3 class="panel-title">Prepare {{ activeOperationLabel }}</h3>
            <p class="panel-subtitle">{{ flowSummary }}</p>
          </div>
        </div>

        <div class="stack stack--tight">
          <div class="subtabs">
            <button
              v-for="module in moduleTabs"
              :key="module.id"
              class="subtab"
              :class="{ 'is-active': activeModuleId === module.id }"
              type="button"
              @click="selectModule(module.id)"
            >
              {{ module.label }}
            </button>
          </div>

          <div class="subtabs">
            <button
              v-for="action in activeModuleActions"
              :key="action.value"
              class="subtab"
              :class="{ 'is-active': operation === action.value }"
              type="button"
              @click="operation = action.value"
            >
              {{ action.label }}
            </button>
          </div>
        </div>

        <div v-if="!authorityAccountId" class="notice is-warn onboarding-note">
          <div class="stack stack--tight">
            <strong>Connect a wallet or choose a watch account to prepare live DeFi drafts.</strong>
            <span>{{ nextActionHint }}</span>
          </div>
          <button class="button is-soft" type="button" @click="emit('open-connect')">
            Open wallet and account setup
          </button>
        </div>

        <div class="form-grid">
          <template v-if="operation === 'n3x_mint'">
            <label class="field">
              <span>USDT in</span>
              <input v-model="n3xUsdt" class="input" inputmode="decimal" />
            </label>
            <label class="field">
              <span>USDC in</span>
              <input v-model="n3xUsdc" class="input" inputmode="decimal" />
            </label>
            <label class="field">
              <span>KUSD in</span>
              <input v-model="n3xKusd" class="input" inputmode="decimal" />
            </label>
          </template>

          <template v-else-if="operation === 'n3x_redeem'">
            <label class="field">
              <span>n3x amount</span>
              <input v-model="n3xAmount" class="input" inputmode="decimal" />
            </label>
          </template>

          <template v-else-if="operation === 'farm_stake' || operation === 'farm_claim'">
            <label v-if="useFarmSelectionCards" class="field">
              <span>Selected position</span>
              <input :value="farmPosition || 'Choose from live positions'" class="input mono" readonly />
            </label>
            <label v-else class="field">
              <span>Position id</span>
              <input v-model="farmPosition" class="input mono" placeholder="farm-position-001" />
            </label>
            <label v-if="operation === 'farm_stake'" class="field">
              <span>Stake amount</span>
              <input v-model="farmAmount" class="input" inputmode="decimal" />
            </label>
          </template>

          <template v-else-if="operation.startsWith('cover')">
            <label v-if="operation !== 'cover_register'" class="field">
              <span>Selected policy</span>
              <input :value="coverPolicy || 'Choose from live policies'" class="input mono" readonly />
            </label>
            <template v-if="operation === 'cover_register'">
              <label class="field">
                <span>Lower bound</span>
                <input v-model="coverLowerBound" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Upper bound</span>
                <input v-model="coverUpperBound" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Payout amount</span>
                <input v-model="coverPayoutAmount" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Window slots</span>
                <input v-model="coverMonitoringWindowSlots" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Required observations</span>
                <input v-model="coverRequiredObservations" class="input mono" inputmode="numeric" />
              </label>
            </template>
            <label v-if="operation === 'cover_register'" class="field">
              <span>Covered notional</span>
              <input v-model="coverNotional" class="input" inputmode="decimal" />
            </label>
            <label v-if="operation === 'cover_register'" class="field">
              <span>Premium paid</span>
              <input v-model="coverPremiumPaid" class="input" inputmode="decimal" />
            </label>
            <label v-if="operation === 'cover_register'" class="field">
              <span>Registration slot</span>
              <input v-model="coverRegistrationSlot" class="input mono" inputmode="numeric" />
            </label>
            <label v-if="operation === 'cover_expire'" class="field">
              <span>Current slot</span>
              <input v-model="coverCurrentSlot" class="input mono" inputmode="numeric" />
            </label>
          </template>

          <template v-else>
            <label class="field">
              <span>{{ operation === 'automation_enqueue' ? 'New job id' : 'Selected job' }}</span>
              <input
                v-if="operation === 'automation_enqueue' || !useAutomationSelectionCards"
                v-model="automationJob"
                class="input mono"
                :placeholder="operation === 'automation_enqueue' ? 'job-001' : 'Choose from live jobs or enter an id'"
              />
              <input
                v-else
                :value="automationJob || 'Choose from live jobs'"
                class="input mono"
                readonly
              />
            </label>
            <label v-if="operation === 'automation_enqueue'" class="field">
              <span>Payload hash</span>
              <input v-model="automationPayloadHash" class="input mono" inputmode="numeric" />
            </label>
            <template v-if="operation === 'automation_configure'">
              <label class="field">
                <span>Next slot</span>
                <input v-model="automationNextSlot" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Max retries</span>
                <input v-model="automationMaxRetries" class="input mono" inputmode="numeric" />
              </label>
              <label class="field">
                <span>Retry delay slots</span>
                <input v-model="automationRetryDelaySlots" class="input mono" inputmode="numeric" />
              </label>
            </template>
          </template>
        </div>

        <div class="action-row action-row--trade">
          <button class="button is-ghost" type="button" @click="previewPayload">Preview payload</button>
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
        </div>
      </section>

      <section class="panel trade-sidebar">
        <div class="stack stack--tight">
          <p class="eyebrow">Review</p>
          <h3 class="panel-title">{{ activeOperationLabel }}</h3>
          <p class="panel-subtitle">Normalized values stay visible, and the side rail now acts like a product picker for the active protocol family.</p>
        </div>

        <div class="summary-list">
          <div>
            <span>Contract</span>
            <strong class="mono">{{ activeContractLabel }}</strong>
          </div>
          <div>
            <span>Instance discovered</span>
            <strong>{{ isDiscovered(activeModuleId) ? 'yes' : 'no' }}</strong>
          </div>
          <div>
            <span>Authority</span>
            <strong class="mono">{{ authorityAccountId || '--' }}</strong>
          </div>
          <div>
            <span>Current slot</span>
            <strong>{{ currentSlot ?? '--' }}</strong>
          </div>
          <div v-if="farmConfig">
            <span>Reward rate</span>
            <strong>{{ formatNumber(farmConfig.rewardRate, 0) }}</strong>
          </div>
        </div>

        <div v-if="reviewItems.length" class="summary-list">
          <div v-for="item in reviewItems" :key="item.label">
            <span>{{ item.label }}</span>
            <strong class="mono">{{ item.value }}</strong>
          </div>
        </div>

        <div v-if="activeModuleId === 'farms' && farmPositions.length" class="market-list">
          <button
            v-for="position in farmPositions"
            :key="position.id"
            class="market-list__item"
            :class="{ 'is-active': position.id === farmPosition }"
            type="button"
            @click="selectFarmPosition(position.id)"
          >
            <div>
              <span class="market-list__pair">{{ position.id }}</span>
              <span class="market-list__route">farm position</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ position.stakeAmount }}</strong>
              <span>{{ position.accruedRewards }} rewards</span>
            </div>
          </button>
        </div>

        <div v-if="activeModuleId === 'farms' && selectedFarmPosition" class="summary-list">
          <div>
            <span>Staked</span>
            <strong class="mono">{{ selectedFarmPosition.stakeAmount }}</strong>
          </div>
          <div>
            <span>Accrued</span>
            <strong class="mono">{{ selectedFarmPosition.accruedRewards }}</strong>
          </div>
          <div>
            <span>Claimed</span>
            <strong class="mono">{{ selectedFarmPosition.claimedRewards }}</strong>
          </div>
        </div>

        <div v-if="activeModuleId === 'cover' && coverPolicies.length" class="market-list">
          <button
            v-for="policy in coverPolicies"
            :key="policy.id"
            class="market-list__item"
            :class="{ 'is-active': policy.id === coverPolicy }"
            type="button"
            @click="selectCoverPolicy(policy.id)"
          >
            <div>
              <span class="market-list__pair">{{ policy.id }}</span>
              <span class="market-list__route">{{ coverStatusLabel(policy) }}</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ policy.premiumPaid }} premium</strong>
              <span>{{ policy.coveredNotional }} notional</span>
            </div>
          </button>
        </div>

        <div v-if="activeModuleId === 'cover' && selectedCoverPolicy" class="summary-list">
          <div>
            <span>Bounds</span>
            <strong>{{ selectedCoverPolicy.lowerBound }} - {{ selectedCoverPolicy.upperBound }}</strong>
          </div>
          <div>
            <span>Premium</span>
            <strong>{{ selectedCoverPolicy.premiumPaid }}</strong>
          </div>
          <div>
            <span>Payout</span>
            <strong>{{ selectedCoverPolicy.payoutAmount }}</strong>
          </div>
          <div>
            <span>Observations</span>
            <strong>{{ selectedCoverPolicy.observationCount }}/{{ selectedCoverPolicy.requiredObservations }}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{{ coverStatusLabel(selectedCoverPolicy) }}</strong>
          </div>
        </div>

        <div v-if="activeModuleId === 'cover' && ownedCoverPolicies.length" class="summary-list">
          <div>
            <span>Owned policies</span>
            <strong>{{ ownedCoverPolicies.length }}</strong>
          </div>
        </div>

        <div v-if="activeModuleId === 'automation' && automationJobs.length" class="market-list">
          <button
            v-for="job in automationJobs"
            :key="job.id"
            class="market-list__item"
            :class="{ 'is-active': job.id === automationJob }"
            type="button"
            @click="selectAutomationJob(job.id)"
          >
            <div>
              <span class="market-list__pair">{{ job.id }}</span>
              <span class="market-list__route">{{ automationStatusLabel(job.status) }}</span>
            </div>
            <div class="market-list__stats">
              <strong>#{{ job.nextSlot }}</strong>
              <span>{{ job.retryCount }}/{{ job.maxRetries }} retries</span>
            </div>
          </button>
        </div>

        <div v-if="activeModuleId === 'automation' && selectedAutomationJob" class="summary-list">
          <div>
            <span>Status</span>
            <strong>{{ automationStatusLabel(selectedAutomationJob.status) }}</strong>
          </div>
          <div>
            <span>Next slot</span>
            <strong>{{ selectedAutomationJob.nextSlot }}</strong>
          </div>
          <div>
            <span>Retries</span>
            <strong>{{ selectedAutomationJob.retryCount }} / {{ selectedAutomationJob.maxRetries }}</strong>
          </div>
          <div>
            <span>Run count</span>
            <strong>{{ selectedAutomationJob.runCount }}</strong>
          </div>
        </div>
      </section>
    </div>

    <ExecutionInspector
      title="DeFi inspector"
      subtitle="The raw Torii draft and submit stream stays visible here while the main surface stays focused on live protocol state and the next executable action."
      :summary="defiInspectorSummary"
      :entries="defiInspectorEntries"
      empty-copy="Preview or prepare a DeFi flow and the payload stream will appear here."
    />
  </div>
</template>
