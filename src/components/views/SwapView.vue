<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ExecutionInspector from '@/components/ExecutionInspector.vue';
import { Icons } from '@/components/ui/Icons';
import { DEFAULT_SWAP_TOKENS, TOKEN_ASSET_ALIASES, TOKEN_SYMBOLS } from '@/data/soraswap';
import {
  extractAssetDefinitionSelector,
  resolveAssetDefinitionMetadata,
  resolveTokenAssetMetadata,
  type TokenAssetMetadata
} from '@/services/assets';
import { formatBaseUnits, scaleDecimalToBaseUnits } from '@/services/amounts';
import {
  fetchDlmmMirrorState,
  fetchDlmmPoolConfig,
  prepareContractCallDraft,
  quoteDlmmActiveBin
} from '@/services/contracts';
import { formatNumber } from '@/services/format';
import { buildSwapIntent } from '@/services/intents';
import {
  loadOptionSeries,
  loadOptionTickets,
  loadPerpsPositions
} from '@/services/liveSoraswap';
import { resolveContractAddressForRole } from '@/services/registry';
import {
  fetchLatestSoraSwapOracleAttestation,
  type SoraSwapOracleAttestation
} from '@/services/soracles';
import type {
  AccountAssetItem,
  ContractCallDraftRequest,
  ContractCallResponse,
  ContractCallSubmitResult,
  DlmmMirrorState,
  DlmmPoolConfig,
  LiveOptionSeries,
  LiveOptionTicket,
  LivePerpsPosition,
  TradeMode
} from '@/types';

type TokenSymbol = (typeof TOKEN_SYMBOLS)[number];
type PickerTarget = 'pay' | 'receive' | null;
type RecentPair = { from: TokenSymbol; to: TokenSymbol };

interface TokenBalanceDetail {
  token: TokenSymbol;
  metadata: TokenAssetMetadata | null;
  rawQuantity: string;
  displayQuantity: string;
  formattedQuantity: string;
  sortableQuantity: number;
  scale: number | null;
  canUseShortcuts: boolean;
}

const STORAGE_KEYS = {
  favoriteTokens: 'soraswap.favoriteTokens',
  recentPairs: 'soraswap.recentPairs',
  tradeMode: 'soraswap.tradeMode'
} as const;

const readStoredJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeStoredJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

const props = defineProps<{
  payToken?: string;
  receiveToken?: string;
  writeGateReason: string;
  contractsTotal: number;
  toriiUrl: string;
  dataspace: string;
  authorityAccountId: string | null;
  connectReady: boolean;
  walletAssets: AccountAssetItem[];
  submitDraftViaConnect: (input: {
    request: ContractCallDraftRequest;
    draft: ContractCallResponse;
    domainTag: string;
  }) => Promise<ContractCallSubmitResult>;
}>();

const emit = defineEmits<{
  (e: 'update-route', payload: { swapFrom: string; swapTo: string; replace?: boolean }): void;
  (e: 'open-connect'): void;
}>();

const tokens = [...TOKEN_SYMBOLS] as TokenSymbol[];
const tokenAliasSymbols = tokens.filter((token) => Boolean(TOKEN_ASSET_ALIASES[token]));

const resolveToken = (value: string | undefined, fallback: TokenSymbol): TokenSymbol => {
  const normalized = (value || '').toUpperCase();
  return tokens.some((token) => token === normalized) ? (normalized as TokenSymbol) : fallback;
};

const resolveStoredMode = () => {
  const stored = readStoredJson<string | null>(STORAGE_KEYS.tradeMode, null);
  return stored === 'Perps' || stored === 'Options' || stored === 'Spot' ? stored : 'Spot';
};

const payToken = ref<TokenSymbol>(resolveToken(props.payToken, DEFAULT_SWAP_TOKENS.pay));
const receiveToken = ref<TokenSymbol>(resolveToken(props.receiveToken, DEFAULT_SWAP_TOKENS.receive));
const mode = ref<TradeMode>(resolveStoredMode());
const amountIn = ref('100');
const slippage = ref('0.50');
const perpsDirection = ref<'Long' | 'Short'>('Long');
const perpsAction = ref<'open' | 'modify' | 'addMargin' | 'removeMargin' | 'close' | 'syncFunding' | 'liquidationPass'>('open');
const perpsMarketId = ref('1');
const perpsPositionId = ref('');
const perpsSize = ref('300');
const perpsLeverageBps = ref('10000');
const perpsMaxPositions = ref('10');
const optionsAction = ref<'buyShout' | 'buyOutperformance' | 'exerciseShout' | 'exerciseOutperformance'>('buyShout');
const optionsSeriesId = ref('');
const optionsTicketId = ref('');
const optionsContracts = ref('1');
const optionsPayout = ref('0');
const resolvedOracleAttestation = ref<SoraSwapOracleAttestation | null>(null);
const pickerTarget = ref<PickerTarget>(null);
const pickerSearch = ref('');
const favoriteTokens = ref<TokenSymbol[]>(
  readStoredJson<string[]>(STORAGE_KEYS.favoriteTokens, []).filter((token) => tokens.includes(token as TokenSymbol)) as TokenSymbol[]
);
const recentPairs = ref<RecentPair[]>(
  readStoredJson<RecentPair[]>(STORAGE_KEYS.recentPairs, []).filter(
    (pair) => tokens.includes(pair.from as TokenSymbol) && tokens.includes(pair.to as TokenSymbol)
  )
);
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
const tokenMetadataLoaded = ref(false);
const tokenMetadata = ref<Record<string, TokenAssetMetadata | null>>(
  Object.fromEntries(tokens.map((token) => [token, null]))
);
const spotPoolConfig = ref<DlmmPoolConfig | null>(null);
const spotMirrorState = ref<DlmmMirrorState | null>(null);
const spotPoolConfigError = ref<string | null>(null);
const spotQuoteBaseUnits = ref<string | null>(null);
const spotQuoteError = ref<string | null>(null);
const livePerpsPositions = ref<LivePerpsPosition[]>([]);
const livePerpsError = ref<string | null>(null);
const liveOptionSeries = ref<LiveOptionSeries[]>([]);
const liveOptionsError = ref<string | null>(null);
const liveOptionTickets = ref<LiveOptionTicket[]>([]);

let tokenMetadataRequestId = 0;
let spotPoolRequestId = 0;
let spotQuoteRequestId = 0;

const selectAlternateToken = (selected: TokenSymbol, source: readonly TokenSymbol[]) =>
  source.find((token) => token !== selected) || selected;

const formatTokenQuantity = (rawQuantity: string, scale: number | null, digits = 4) => {
  if (scale === null) {
    return rawQuantity;
  }
  return formatNumber(formatBaseUnits(rawQuantity, scale), digits);
};

watch(
  () => props.toriiUrl,
  async (nextToriiUrl) => {
    const requestId = tokenMetadataRequestId + 1;
    tokenMetadataRequestId = requestId;
    tokenMetadataLoaded.value = false;

    const nextMetadata = Object.fromEntries(tokens.map((token) => [token, null])) as Record<string, TokenAssetMetadata | null>;
    await Promise.all(
      tokenAliasSymbols.map(async (token) => {
        try {
          nextMetadata[token] = await resolveTokenAssetMetadata(nextToriiUrl, token);
        } catch {
          nextMetadata[token] = null;
        }
      })
    );

    if (requestId !== tokenMetadataRequestId) return;
    tokenMetadata.value = nextMetadata;
    tokenMetadataLoaded.value = true;
  },
  { immediate: true }
);

watch(
  [() => props.toriiUrl, () => props.authorityAccountId],
  async ([nextToriiUrl, authorityAccountId]) => {
    const requestId = spotPoolRequestId + 1;
    spotPoolRequestId = requestId;
    spotPoolConfig.value = null;
    spotMirrorState.value = null;
    spotPoolConfigError.value = null;

    if (!authorityAccountId) {
      return;
    }

    const spotPoolContractAddress = resolveContractAddressForRole('spotPool');
    if (!spotPoolContractAddress) {
      spotPoolConfigError.value = 'No deployed spot pool address is configured for this runtime.';
      return;
    }

    try {
      const [config, mirrorState] = await Promise.all([
        fetchDlmmPoolConfig(nextToriiUrl, authorityAccountId, spotPoolContractAddress),
        fetchDlmmMirrorState(nextToriiUrl, authorityAccountId, spotPoolContractAddress)
      ]);
      if (requestId !== spotPoolRequestId) return;
      spotPoolConfig.value = config;
      spotMirrorState.value = mirrorState;
      spotPoolConfigError.value = null;
    } catch (caught) {
      if (requestId !== spotPoolRequestId) return;
      spotPoolConfigError.value = caught instanceof Error ? caught.message : String(caught);
    }
  },
  { immediate: true }
);

watch(
  () => props.toriiUrl,
  async (nextToriiUrl) => {
    try {
      liveOptionSeries.value = await loadOptionSeries(nextToriiUrl);
    } catch (caught) {
      liveOptionsError.value = caught instanceof Error ? caught.message : String(caught);
    }
  },
  { immediate: true }
);

watch(
  [() => props.toriiUrl, () => props.authorityAccountId],
  async ([nextToriiUrl, authorityAccountId]) => {
    if (!authorityAccountId) {
      livePerpsPositions.value = [];
      liveOptionTickets.value = [];
      return;
    }
    try {
      const [positions, tickets] = await Promise.all([
        loadPerpsPositions(nextToriiUrl, authorityAccountId),
        loadOptionTickets(nextToriiUrl, authorityAccountId)
      ]);
      livePerpsPositions.value = positions;
      liveOptionTickets.value = tickets;
      livePerpsError.value = null;
    } catch (caught) {
      livePerpsError.value = caught instanceof Error ? caught.message : String(caught);
    }
  },
  { immediate: true }
);

watch(
  () => [props.payToken, props.receiveToken],
  ([nextPay, nextReceive]) => {
    payToken.value = resolveToken(nextPay, DEFAULT_SWAP_TOKENS.pay);
    receiveToken.value = resolveToken(nextReceive, DEFAULT_SWAP_TOKENS.receive);
  },
  { immediate: true }
);

const recordRecentPair = (from: TokenSymbol, to: TokenSymbol) => {
  if (!from || !to || from === to) return;
  recentPairs.value = [{ from, to }, ...recentPairs.value.filter((pair) => pair.from !== from || pair.to !== to)].slice(0, 6);
  writeStoredJson(STORAGE_KEYS.recentPairs, recentPairs.value);
};

const resetExecutionState = (clearIntent = false) => {
  draftError.value = null;
  draftResponseJson.value = '';
  draftRequest.value = null;
  draftResponse.value = null;
  submitError.value = null;
  submitResponseJson.value = '';
  submitPipelineJson.value = '';
  submitPipelineNote.value = '';
  resolvedOracleAttestation.value = null;
  if (clearIntent) {
    intentJson.value = '';
  }
};

watch([payToken, receiveToken], ([from, to]) => {
  if (from === to) {
    receiveToken.value = from === DEFAULT_SWAP_TOKENS.receive ? DEFAULT_SWAP_TOKENS.pay : DEFAULT_SWAP_TOKENS.receive;
    return;
  }
  emit('update-route', { swapFrom: from, swapTo: to });
  recordRecentPair(from, to);
});

watch(mode, (next) => {
  writeStoredJson(STORAGE_KEYS.tradeMode, next);
});

watch(
  [
    mode,
    amountIn,
    slippage,
    perpsDirection,
    perpsAction,
    perpsMarketId,
    perpsPositionId,
    perpsSize,
    perpsLeverageBps,
    perpsMaxPositions,
    optionsAction,
    optionsSeriesId,
    optionsTicketId,
    optionsContracts,
    optionsPayout,
    () => props.authorityAccountId
  ],
  () => {
    resetExecutionState(true);
  }
);

const favoriteSet = computed(() => new Set(favoriteTokens.value));

const flipPair = () => {
  if (mode.value === 'Spot' && spotPickerTokens.value.length < 2) {
    return;
  }
  const currentPay = payToken.value;
  payToken.value = receiveToken.value;
  receiveToken.value = currentPay;
};

const openTokenPicker = (target: Exclude<PickerTarget, null>) => {
  pickerTarget.value = target;
  pickerSearch.value = '';
};

const closeTokenPicker = () => {
  pickerTarget.value = null;
  pickerSearch.value = '';
};

const toggleFavoriteToken = (token: TokenSymbol) => {
  favoriteTokens.value = favoriteSet.value.has(token)
    ? favoriteTokens.value.filter((item) => item !== token)
    : [token, ...favoriteTokens.value.filter((item) => item !== token)].slice(0, 6);
  writeStoredJson(STORAGE_KEYS.favoriteTokens, favoriteTokens.value);
};

const selectToken = (token: TokenSymbol) => {
  if (pickerTarget.value === 'pay') {
    payToken.value = token;
  } else if (pickerTarget.value === 'receive') {
    receiveToken.value = token;
  }
  closeTokenPicker();
};

const applyRecentPair = (pair: RecentPair) => {
  payToken.value = pair.from;
  receiveToken.value = pair.to;
};

const walletAssetsByDefinitionId = computed(() => {
  const map = new Map<string, AccountAssetItem>();
  props.walletAssets.forEach((asset) => {
    const selector = extractAssetDefinitionSelector(asset.asset_id);
    map.set(selector, asset);
    map.set(asset.asset_id.trim(), asset);
  });
  return map;
});

const tokenBalanceDetails = computed<Record<string, TokenBalanceDetail>>(() =>
  Object.fromEntries(
    tokens.map((token) => {
      const metadata = tokenMetadata.value[token] || null;
      const matchedAsset = metadata
        ? walletAssetsByDefinitionId.value.get(metadata.id) || (metadata.alias ? walletAssetsByDefinitionId.value.get(metadata.alias) : undefined)
        : undefined;
      const rawQuantity = matchedAsset?.quantity || '0';
      const scale = metadata?.scale ?? null;
      const displayQuantity = scale === null ? rawQuantity : formatBaseUnits(rawQuantity, scale);
      const sortableQuantity = Number(displayQuantity);

      return [
        token,
        {
          token,
          metadata,
          rawQuantity,
          displayQuantity,
          formattedQuantity: formatTokenQuantity(rawQuantity, scale),
          sortableQuantity: Number.isFinite(sortableQuantity) ? sortableQuantity : 0,
          scale,
          canUseShortcuts: scale !== null && BigInt(rawQuantity) > 0n
        } satisfies TokenBalanceDetail
      ];
    })
  )
);

const balanceNumber = (token: TokenSymbol) => tokenBalanceDetails.value[token]?.sortableQuantity || 0;
const currentPayBalanceDetail = computed(() => tokenBalanceDetails.value[payToken.value]);
const canUseAmountShortcuts = computed(() => currentPayBalanceDetail.value?.canUseShortcuts || false);
const currentPayBalanceLabel = computed(() => {
  if (!props.authorityAccountId) {
    return 'Set an account to load balances';
  }
  const detail = currentPayBalanceDetail.value;
  return `${detail.formattedQuantity} ${payToken.value}`;
});

const applyAmountShortcut = (percent: number) => {
  const detail = currentPayBalanceDetail.value;
  if (!detail || detail.scale === null) return;
  const scaledAmount = (BigInt(detail.rawQuantity) * BigInt(percent)) / 100n;
  amountIn.value = formatBaseUnits(scaledAmount, detail.scale);
};

const tokenByDefinitionId = computed(() =>
  Object.fromEntries(
    tokenAliasSymbols
      .map((token) => {
        const metadata = tokenMetadata.value[token];
        return metadata ? [metadata.id, token] : null;
      })
      .filter(Boolean) as Array<[string, TokenSymbol]>
  )
);

const liveSpotPair = computed<readonly TokenSymbol[]>(() => {
  const config = spotPoolConfig.value;
  if (!config) return [];
  const baseToken = tokenByDefinitionId.value[config.baseAssetId];
  const quoteToken = tokenByDefinitionId.value[config.quoteAssetId];
  return baseToken && quoteToken && baseToken !== quoteToken ? [baseToken, quoteToken] : [];
});

const spotPickerTokens = computed<readonly TokenSymbol[]>(() => {
  if (liveSpotPair.value.length === 2) {
    return liveSpotPair.value;
  }
  const resolvedTokens = tokenAliasSymbols.filter((token) => Boolean(tokenMetadata.value[token]));
  if (resolvedTokens.length >= 2) {
    return resolvedTokens;
  }
  return tokenAliasSymbols;
});

watch(
  [mode, spotPickerTokens],
  () => {
    if (mode.value !== 'Spot' || spotPickerTokens.value.length === 0) return;

    const allowedTokens = new Set(spotPickerTokens.value);
    let nextPay = payToken.value;
    let nextReceive = receiveToken.value;

    if (!allowedTokens.has(nextPay)) {
      nextPay = spotPickerTokens.value.includes(DEFAULT_SWAP_TOKENS.pay) ? DEFAULT_SWAP_TOKENS.pay : spotPickerTokens.value[0];
    }
    if (!allowedTokens.has(nextReceive) || nextReceive === nextPay) {
      nextReceive = selectAlternateToken(nextPay, spotPickerTokens.value);
    }

    if (nextPay !== payToken.value) {
      payToken.value = nextPay;
    }
    if (nextReceive !== receiveToken.value) {
      receiveToken.value = nextReceive;
    }
  },
  { immediate: true }
);

const displayedRecentPairs = computed(() => {
  if (mode.value !== 'Spot') return recentPairs.value;
  const allowedTokens = new Set(spotPickerTokens.value);
  return recentPairs.value.filter((pair) => allowedTokens.has(pair.from) && allowedTokens.has(pair.to) && pair.from !== pair.to);
});
const spotPairLocked = computed(() => mode.value === 'Spot' && liveSpotPair.value.length === 2);

const visibleFavoriteTokens = computed(() => {
  if (mode.value !== 'Spot') return favoriteTokens.value;
  const allowedTokens = new Set(spotPickerTokens.value);
  return favoriteTokens.value.filter((token) => allowedTokens.has(token));
});

const pickerHeading = computed(() => (pickerTarget.value === 'pay' ? 'Choose pay token' : 'Choose receive token'));
const pickerTokens = computed(() => {
  const search = pickerSearch.value.trim().toLowerCase();
  const sourceTokens = mode.value === 'Spot' ? [...spotPickerTokens.value] : [...tokens];
  return sourceTokens
    .filter((token) => {
      if (!search) return true;
      const alias = tokenMetadata.value[token]?.alias || TOKEN_ASSET_ALIASES[token] || '';
      return token.toLowerCase().includes(search) || alias.toLowerCase().includes(search);
    })
    .sort((left, right) => {
      const favoriteDiff = Number(favoriteSet.value.has(right)) - Number(favoriteSet.value.has(left));
      if (favoriteDiff) return favoriteDiff;
      const balanceDiff = balanceNumber(right) - balanceNumber(left);
      if (balanceDiff) return balanceDiff;
      return tokens.indexOf(left) - tokens.indexOf(right);
    });
});

const selectedPerpsPosition = computed(
  () => livePerpsPositions.value.find((position) => position.id === perpsPositionId.value) || null
);
const selectedOptionsSeries = computed(
  () => liveOptionSeries.value.find((series) => series.id === optionsSeriesId.value) || null
);
const selectedOptionsTicket = computed(
  () => liveOptionTickets.value.find((ticket) => ticket.id === optionsTicketId.value) || null
);

watch(
  livePerpsPositions,
  (positions) => {
    if (!perpsPositionId.value && positions.length) {
      perpsPositionId.value = positions[0].id;
    }
  },
  { immediate: true }
);

watch(
  liveOptionSeries,
  (series) => {
    if (!optionsSeriesId.value && series.length) {
      optionsSeriesId.value = series[0].id;
    }
  },
  { immediate: true }
);

watch(
  liveOptionTickets,
  (tickets) => {
    if (optionsAction.value.startsWith('exercise') && tickets.length && !tickets.some((ticket) => ticket.id === optionsTicketId.value)) {
      optionsTicketId.value = tickets[0].id;
    }
  },
  { immediate: true }
);

watch(
  [selectedPerpsPosition, perpsAction],
  ([position]) => {
    if (!position) return;
    if (!perpsMarketId.value || perpsMarketId.value === '1') {
      perpsMarketId.value = position.marketId || perpsMarketId.value;
    }
  },
  { immediate: true }
);

watch(
  [selectedOptionsTicket, optionsAction],
  ([ticket, action]) => {
    if (!ticket) return;
    if (action.startsWith('exercise') && (!optionsPayout.value || optionsPayout.value === '0')) {
      optionsPayout.value = ticket.collateralReserved;
    }
  },
  { immediate: true }
);

watch(
  [selectedOptionsSeries, tokenByDefinitionId],
  ([series]) => {
    if (!series || mode.value !== 'Options') return;
    const nextPay = tokenByDefinitionId.value[series.settlementAssetId];
    const nextReceive = tokenByDefinitionId.value[series.underlyingAssetId];
    if (nextPay) {
      payToken.value = nextPay;
    }
    if (nextReceive && nextReceive !== payToken.value) {
      receiveToken.value = nextReceive;
    }
  },
  { immediate: true }
);

const marketTitle = computed(() => `${payToken.value} / ${receiveToken.value}`);
const liveSpotPairLabel = computed(() => (liveSpotPair.value.length === 2 ? `${liveSpotPair.value[0]} / ${liveSpotPair.value[1]}` : null));
const tradeDeskTitle = computed(() => {
  if (mode.value === 'Perps') return 'Perps desk';
  if (mode.value === 'Options') return 'Options desk';
  return 'Spot desk';
});
const tradePayLabel = computed(() => {
  if (mode.value === 'Perps') return 'Collateral';
  if (mode.value === 'Options') return optionsAction.value.startsWith('exercise') ? 'Position' : 'Premium';
  return 'You pay';
});
const tradeOutputHelper = computed(() => {
  if (mode.value === 'Spot') {
    return 'Updates from the live active-bin quote and your slippage guard.';
  }
  if (mode.value === 'Perps') {
    return 'The selected position card and action state drive the payload.';
  }
  return optionsAction.value.startsWith('buy')
    ? 'Live factory series cards set the contract context before you size the trade.'
    : 'Owned factory position cards set the exercise context before you submit.';
});
const modeSubtitle = computed(() => {
  switch (mode.value) {
    case 'Perps':
      return 'Open and manage live positions directly from the engine state instead of typing ad-hoc position ids.';
    case 'Options':
      return 'Work from live factory series and owned positions, then buy or exercise from the same trade surface.';
    default:
      return 'Quote the live deployed DLMM pool, see balances immediately, and move through the next required step without guessing.';
  }
});
const marketSupportCopy = computed(() => {
  if (mode.value === 'Spot') {
    if (liveSpotPairLabel.value) {
      return `Spot execution on this endpoint is pinned to the live DLMM pool ${liveSpotPairLabel.value}. Quotes come from the deployed active bin, so the main trade card only shows the executable market.`;
    }
    if (!props.authorityAccountId) {
      return 'Choose an account to resolve the live DLMM pair on this endpoint. Until then the trade surface stays in discovery mode.';
    }
    if (spotPoolConfigError.value) {
      return 'The app could not resolve the live DLMM pool from this endpoint yet, so Spot stays unavailable until pool metadata is readable.';
    }
    return 'Resolving the live DLMM pair and active-bin quote so Spot can clamp to the executable market before you submit.';
  }
  if (mode.value === 'Perps') {
    return 'Live position state comes from the perps engine, and the trade desk targets the selected position lifecycle step.';
  }
  return 'Live series and owned positions come from the options factory, so buy and exercise stay tied to contract-assigned ids.';
});
const amountNumeric = computed(() => {
  const numeric = Number(amountIn.value);
  return Number.isFinite(numeric) ? numeric : null;
});
const slippageBps = computed<bigint | null>(() => {
  try {
    const basisPoints = BigInt(scaleDecimalToBaseUnits(slippage.value, 2, 'Slippage %', { allowZero: true }));
    return basisPoints <= 10000n ? basisPoints : null;
  } catch {
    return null;
  }
});

watch(
  [mode, () => props.toriiUrl, () => props.authorityAccountId, payToken, receiveToken, amountIn, () => spotPoolConfig.value, () => spotMirrorState.value],
  async () => {
    const requestId = spotQuoteRequestId + 1;
    spotQuoteRequestId = requestId;
    spotQuoteBaseUnits.value = null;
    spotQuoteError.value = null;

    if (mode.value !== 'Spot' || !props.authorityAccountId || !spotPoolConfig.value || !spotMirrorState.value) {
      return;
    }

    const spotRouterContractAddress = resolveContractAddressForRole('spotRouter');
    if (!spotRouterContractAddress) {
      spotQuoteError.value = 'No deployed spot router address is configured for this runtime.';
      return;
    }

    try {
      const [payAssetMeta, receiveAssetMeta] = await Promise.all([
        tokenMetadata.value[payToken.value] || resolveTokenAssetMetadata(props.toriiUrl, payToken.value),
        tokenMetadata.value[receiveToken.value] || resolveTokenAssetMetadata(props.toriiUrl, receiveToken.value)
      ]);
      const poolConfig = spotPoolConfig.value;
      const mirrorState = spotMirrorState.value;
      if (!poolConfig || !mirrorState) return;

      const supportedAssets = new Set([poolConfig.baseAssetId, poolConfig.quoteAssetId]);
      if (!supportedAssets.has(payAssetMeta.id) || !supportedAssets.has(receiveAssetMeta.id) || payAssetMeta.id === receiveAssetMeta.id) {
        return;
      }

      const amountInBaseUnits = scaleDecimalToBaseUnits(amountIn.value, payAssetMeta.scale ?? 0, `${payToken.value} amount`);
      const quote = await quoteDlmmActiveBin(props.toriiUrl, props.authorityAccountId, spotRouterContractAddress, {
        reserveBase: mirrorState.reserveBase,
        reserveQuote: mirrorState.reserveQuote,
        amountIn: amountInBaseUnits,
        feePips: poolConfig.feePips,
        activeBin: poolConfig.activeBin,
        binStep: poolConfig.binStep,
        inputIsBase: payAssetMeta.id === poolConfig.baseAssetId,
        minReserveBase: mirrorState.minReserveBase,
        minReserveQuote: mirrorState.minReserveQuote
      });
      if (requestId !== spotQuoteRequestId) return;
      spotQuoteBaseUnits.value = quote;
    } catch (caught) {
      if (requestId !== spotQuoteRequestId) return;
      spotQuoteError.value = caught instanceof Error ? caught.message : String(caught);
    }
  },
  { immediate: true }
);

const spotMinOutBaseUnits = computed(() => {
  if (spotQuoteBaseUnits.value === null || slippageBps.value === null) return null;
  return ((BigInt(spotQuoteBaseUnits.value) * (10000n - slippageBps.value)) / 10000n).toString();
});
const liveSpotMid = computed(() => {
  const receiveScale = tokenBalanceDetails.value[receiveToken.value]?.scale;
  if (spotQuoteBaseUnits.value === null || receiveScale === null || amountNumeric.value === null || amountNumeric.value <= 0) {
    return null;
  }
  const quoteOut = Number(formatBaseUnits(spotQuoteBaseUnits.value, receiveScale));
  if (!Number.isFinite(quoteOut) || quoteOut <= 0) return null;
  return quoteOut / amountNumeric.value;
});
const estimatedOutDisplay = computed(() => {
  if (spotQuoteBaseUnits.value === null) return '--';
  const receiveScale = tokenBalanceDetails.value[receiveToken.value]?.scale;
  if (receiveScale === null) {
    return `${spotQuoteBaseUnits.value} ${receiveToken.value}`;
  }
  return `${formatTokenQuantity(spotQuoteBaseUnits.value, receiveScale, 6)} ${receiveToken.value}`;
});
const spotMinOutDisplay = computed(() => {
  const receiveScale = tokenBalanceDetails.value[receiveToken.value]?.scale;
  if (receiveScale === null || spotMinOutBaseUnits.value === null) return '--';
  return `${formatTokenQuantity(spotMinOutBaseUnits.value, receiveScale, 6)} ${receiveToken.value}`;
});
const oracleAttestationLabel = computed(() => {
  const attestation = resolvedOracleAttestation.value;
  if (!attestation) return 'Fetched on prepare';
  return `slot ${attestation.oracleSlot} / ${attestation.attestationHash}`;
});
const tradeOutputLabel = computed(() => {
  switch (mode.value) {
    case 'Perps':
      return perpsAction.value === 'open' || perpsAction.value === 'modify'
        ? 'Position size'
        : perpsAction.value === 'close' || perpsAction.value === 'syncFunding' || perpsAction.value === 'liquidationPass'
          ? 'Soracles attestation'
          : 'Collateral delta';
    case 'Options':
      return optionsAction.value.startsWith('buy') ? 'Notional' : 'Soracles attestation';
    default:
      return 'Estimated receive';
  }
});
const tradeOutputValue = computed(() => {
  switch (mode.value) {
    case 'Perps':
      return perpsAction.value === 'open' || perpsAction.value === 'modify'
        ? perpsSize.value || '--'
        : perpsAction.value === 'close' || perpsAction.value === 'syncFunding' || perpsAction.value === 'liquidationPass'
          ? oracleAttestationLabel.value
          : amountIn.value || '--';
    case 'Options':
      return optionsAction.value.startsWith('buy') ? optionsContracts.value || '--' : oracleAttestationLabel.value;
    default:
      return estimatedOutDisplay.value;
  }
});
const nextActionHint = computed(() => {
  if (!props.authorityAccountId) {
    return mode.value === 'Spot'
      ? 'Choose an account first so the app can load balances, resolve the live DLMM pair, and quote the active bin.'
      : 'Choose an account first so the app can load balances and prepare a real trade draft.';
  }
  if (mode.value === 'Spot' && !liveSpotPairLabel.value && !spotPoolConfigError.value) {
    return 'The app is resolving the live DLMM pair on this endpoint before locking Spot to the executable market.';
  }
  if (mode.value === 'Spot' && !spotQuoteBaseUnits.value && !spotQuoteError.value) {
    return 'The app is quoting the active bin on the deployed DLMM pool.';
  }
  if (!draftResponse.value) {
    return 'Prepare the trade once the pair and amount look right.';
  }
  if (!props.connectReady) {
    return 'Open a wallet session to sign the prepared draft.';
  }
  return 'The draft is ready. Sign it from your wallet when you are ready to submit.';
});
const executionState = computed(() => {
  if (!props.authorityAccountId) return 'Account needed';
  if (mode.value === 'Spot' && !liveSpotPairLabel.value && !spotPoolConfigError.value) return 'Resolving live pair';
  if (mode.value === 'Spot' && !spotQuoteBaseUnits.value && !spotQuoteError.value) return 'Quoting live pool';
  if (!draftResponse.value) return 'Trade not prepared';
  if (!props.connectReady) return 'Wallet session needed';
  return 'Ready to sign';
});
const primaryActionLabel = computed(() => {
  if (!props.authorityAccountId) return 'Connect wallet or watch account';
  if (!draftResponse.value) return draftBusy.value ? 'Preparing trade…' : 'Prepare trade';
  if (!props.connectReady) return 'Open wallet session';
  return submitBusy.value ? 'Submitting…' : 'Sign and submit';
});

const liveSpotReserveLabel = computed(() => {
  const config = spotPoolConfig.value;
  const mirrorState = spotMirrorState.value;
  if (!config || !mirrorState) return '--';
  const baseToken = tokenByDefinitionId.value[config.baseAssetId];
  const quoteToken = tokenByDefinitionId.value[config.quoteAssetId];
  const baseScale = baseToken ? tokenBalanceDetails.value[baseToken]?.scale ?? null : null;
  const quoteScale = quoteToken ? tokenBalanceDetails.value[quoteToken]?.scale ?? null : null;
  const baseReserve = baseScale === null ? mirrorState.reserveBase : formatTokenQuantity(mirrorState.reserveBase, baseScale, 4);
  const quoteReserve = quoteScale === null ? mirrorState.reserveQuote : formatTokenQuantity(mirrorState.reserveQuote, quoteScale, 4);
  return `${baseReserve} ${baseToken || 'base'} / ${quoteReserve} ${quoteToken || 'quote'}`;
});

const marketHighlights = computed(() => {
  if (mode.value === 'Spot') {
    return [
      { label: 'Live pair', value: liveSpotPairLabel.value || '--' },
      { label: 'Mid price', value: formatNumber(liveSpotMid.value, 6) },
      { label: 'Fee', value: spotPoolConfig.value ? `${spotPoolConfig.value.feePips} pips` : '--' },
      { label: 'Active bin', value: spotPoolConfig.value ? String(spotPoolConfig.value.activeBin) : '--' }
    ];
  }
  if (mode.value === 'Perps') {
    return [
      { label: 'Open positions', value: String(livePerpsPositions.value.length) },
      { label: 'Selected', value: perpsPositionId.value || '--' },
      { label: 'Collateral', value: selectedPerpsPosition.value?.collateral || '--' },
      { label: 'Realized PnL', value: selectedPerpsPosition.value?.realizedPnl || '--' }
    ];
  }
  return [
    { label: 'Live series', value: String(liveOptionSeries.value.length) },
    { label: 'Owned positions', value: String(liveOptionTickets.value.length) },
    { label: 'Selected series', value: optionsSeriesId.value || '--' },
    { label: 'Premium', value: selectedOptionsSeries.value?.premium || '--' }
  ];
});
const tradeInspectorSummary = computed(() => [
  { label: 'Account', value: props.authorityAccountId || '--', mono: Boolean(props.authorityAccountId) },
  { label: 'Wallet session', value: props.connectReady ? 'Ready' : 'Needed' },
  { label: 'Prepared trade', value: draftResponse.value ? 'Yes' : 'No' },
  { label: 'Pipeline', value: submitPipelineJson.value ? 'Visible' : 'Waiting' }
]);
const tradeInspectorEntries = computed(() => [
  { label: 'Intent payload', value: intentJson.value },
  {
    label: 'Soracles attestation',
    value: resolvedOracleAttestation.value
      ? JSON.stringify(
          {
            domain: resolvedOracleAttestation.value.domain,
            subjectId: resolvedOracleAttestation.value.subjectId,
            oracleSlot: resolvedOracleAttestation.value.oracleSlot,
            statusFlags: resolvedOracleAttestation.value.statusFlags,
            attestationHash: resolvedOracleAttestation.value.attestationHash,
            feeds: resolvedOracleAttestation.value.sourceEvents.map((source) => ({
              feedId: source.feedId,
              slot: source.slot,
              field: source.field
            }))
          },
          null,
          2
        )
      : ''
  },
  { label: 'Prepared trade', value: draftResponseJson.value },
  { label: 'Submitted response', value: submitResponseJson.value },
  { label: 'Pipeline status', value: submitPipelineJson.value }
]);

const tokenAliasLabel = (token: TokenSymbol) =>
  tokenMetadata.value[token]?.alias || TOKEN_ASSET_ALIASES[token] || 'Reference token';

const tokenBalanceLabel = (token: TokenSymbol) => {
  if (!props.authorityAccountId) return '--';
  return tokenBalanceDetails.value[token]?.formattedQuantity || '--';
};

const resolveSpotPoolConfiguration = async () => {
  if (spotPoolConfig.value && spotMirrorState.value) {
    return spotPoolConfig.value;
  }
  if (!props.authorityAccountId) {
    throw new Error('Choose an account before preparing a live spot trade.');
  }
  const spotPoolContractAddress = resolveContractAddressForRole('spotPool');
  if (!spotPoolContractAddress) {
    throw new Error('No live spot pool address is configured yet. Sync the registry from a deployed environment first.');
  }
  const [config, mirrorState] = await Promise.all([
    fetchDlmmPoolConfig(props.toriiUrl, props.authorityAccountId, spotPoolContractAddress),
    fetchDlmmMirrorState(props.toriiUrl, props.authorityAccountId, spotPoolContractAddress)
  ]);
  spotPoolConfig.value = config;
  spotMirrorState.value = mirrorState;
  spotPoolConfigError.value = null;
  return config;
};

const buildSpotMinimumOut = () => {
  if (spotQuoteBaseUnits.value === null || BigInt(spotQuoteBaseUnits.value) <= 0n) {
    throw new Error('No live quote is available for this pair yet, so minimum output cannot be derived.');
  }
  const basisPoints = slippageBps.value;
  if (basisPoints === null) {
    throw new Error('Slippage must be a plain percent between 0 and 100.');
  }
  const minOut = (BigInt(spotQuoteBaseUnits.value) * (10000n - basisPoints)) / 10000n;
  if (minOut <= 0n) {
    throw new Error('The estimated minimum output is zero. Increase the amount or reduce slippage.');
  }
  return minOut.toString();
};

const buildIntentInput = () => ({
  mode: mode.value,
  authorityAccountId: props.authorityAccountId || '<authority-account-id>',
  dataspace: props.dataspace,
  payToken: payToken.value,
  receiveToken: receiveToken.value,
  amountIn: amountIn.value,
  slippage: String(spotMinOutBaseUnits.value ?? ''),
  perpsDirection: perpsDirection.value,
  perpsAction: perpsAction.value,
  perpsMarketId: perpsMarketId.value,
  perpsPositionId: perpsPositionId.value,
  perpsSize: perpsSize.value,
  perpsMargin: amountIn.value,
  perpsLeverageBps: perpsLeverageBps.value,
  perpsMaxPositions: perpsMaxPositions.value,
  optionsAction: optionsAction.value,
  optionsSeriesId: optionsSeriesId.value,
  optionsPositionId: optionsTicketId.value,
  optionsNotional: optionsContracts.value,
  optionsPremiumPaid: amountIn.value,
  optionsCollateralLocked: optionsPayout.value,
  gate: props.writeGateReason
});

const resolveSoraSwapOracleAttestationForIntent = async () => {
  if (mode.value === 'Perps' && perpsAction.value !== 'addMargin') {
    const subjectId = perpsMarketId.value.trim();
    if (!subjectId) throw new Error('Choose a Perps market before resolving a Soracles attestation.');
    const attestation = await fetchLatestSoraSwapOracleAttestation(props.toriiUrl, 'perps_market', subjectId);
    resolvedOracleAttestation.value = attestation;
    return { perpsOracleAttestation: { oraclePayload: attestation.oraclePayload, oracleSignature: attestation.oracleSignature } };
  }
  if (mode.value === 'Options' && optionsAction.value === 'exerciseShout') {
    const subjectId = optionsTicketId.value.trim();
    if (!subjectId) throw new Error('Choose an options position before resolving a Soracles attestation.');
    const attestation = await fetchLatestSoraSwapOracleAttestation(props.toriiUrl, 'options_shout', subjectId);
    resolvedOracleAttestation.value = attestation;
    return { optionsOracleAttestation: { oraclePayload: attestation.oraclePayload, oracleSignature: attestation.oracleSignature } };
  }
  resolvedOracleAttestation.value = null;
  return {};
};

const buildIntent = async () => {
  const intentInput = buildIntentInput();
  if (mode.value !== 'Spot') {
    let scaledIntentInput = { ...intentInput };
    if (mode.value === 'Perps') {
      const collateralMeta = tokenMetadata.value[payToken.value] || (await resolveTokenAssetMetadata(props.toriiUrl, payToken.value));
      if (perpsAction.value === 'open' || perpsAction.value === 'modify' || perpsAction.value === 'addMargin' || perpsAction.value === 'removeMargin') {
        scaledIntentInput = {
          ...scaledIntentInput,
          amountIn: scaleDecimalToBaseUnits(amountIn.value, collateralMeta.scale ?? 0, `${payToken.value} collateral`),
          perpsMargin: scaleDecimalToBaseUnits(amountIn.value, collateralMeta.scale ?? 0, `${payToken.value} margin`)
        };
      }
      if (perpsAction.value === 'open' || perpsAction.value === 'modify') {
        const sizeScale = tokenMetadata.value[receiveToken.value]?.scale ?? 0;
        scaledIntentInput = {
          ...scaledIntentInput,
          perpsSize: scaleDecimalToBaseUnits(perpsSize.value, sizeScale, 'Position size')
        };
      }
    }
    if (mode.value === 'Options') {
      const series = liveOptionSeries.value.find((item) => item.id === selectedOptionsTicket.value?.seriesId) || selectedOptionsSeries.value;
      const settlementScale = series?.settlementAssetId
        ? (await resolveAssetDefinitionMetadata(props.toriiUrl, series.settlementAssetId, 'Settlement asset')).scale ?? 0
        : 0;
      if (optionsAction.value.startsWith('buy')) {
        scaledIntentInput = {
          ...scaledIntentInput,
          amountIn: scaleDecimalToBaseUnits(amountIn.value, settlementScale, 'Premium'),
          optionsPremiumPaid: scaleDecimalToBaseUnits(amountIn.value, settlementScale, 'Premium'),
          optionsNotional: scaleDecimalToBaseUnits(optionsContracts.value, settlementScale, 'Notional'),
          optionsCollateralLocked: scaleDecimalToBaseUnits(optionsPayout.value, settlementScale, 'Collateral locked')
        };
      }
    }
    scaledIntentInput = {
      ...scaledIntentInput,
      ...(await resolveSoraSwapOracleAttestationForIntent())
    };
    const intent = buildSwapIntent(scaledIntentInput);
    intentJson.value = JSON.stringify(intent.payload, null, 2);
    return intent;
  }

  if (!props.authorityAccountId) {
    throw new Error('Choose an account before preparing a live spot trade.');
  }

  const [payAssetMeta, receiveAssetMeta, poolConfig] = await Promise.all([
    tokenMetadata.value[payToken.value] || resolveTokenAssetMetadata(props.toriiUrl, payToken.value),
    tokenMetadata.value[receiveToken.value] || resolveTokenAssetMetadata(props.toriiUrl, receiveToken.value),
    resolveSpotPoolConfiguration()
  ]);

  if (payAssetMeta.scale === null) {
    throw new Error(`The live asset metadata for ${payToken.value} does not expose a numeric scale yet.`);
  }
  if (receiveAssetMeta.scale === null) {
    throw new Error(`The live asset metadata for ${receiveToken.value} does not expose a numeric scale yet.`);
  }

  const supportedAssets = new Set([poolConfig.baseAssetId, poolConfig.quoteAssetId]);
  if (!supportedAssets.has(payAssetMeta.id) || !supportedAssets.has(receiveAssetMeta.id) || payAssetMeta.id === receiveAssetMeta.id) {
    throw new Error('The live DLMM pool on this endpoint only supports its deployed base and quote pair.');
  }

  const scaledAmountIn = scaleDecimalToBaseUnits(amountIn.value, payAssetMeta.scale, `${payToken.value} amount`);
  const minOut = buildSpotMinimumOut();

  const intent = buildSwapIntent({
    ...intentInput,
    authorityAccountId: props.authorityAccountId,
    payAssetId: payAssetMeta.id,
    receiveAssetId: receiveAssetMeta.id,
    spotBaseAssetId: poolConfig.baseAssetId,
    spotQuoteAssetId: poolConfig.quoteAssetId,
    amountIn: scaledAmountIn,
    slippage: minOut
  });
  intentJson.value = JSON.stringify(intent.payload, null, 2);
  return intent;
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
      throw new Error('Choose an account before preparing a trade.');
    }
    const intent = await buildIntent();
    if (!intent.contractAddress) {
      throw new Error(`No deployed contract address is configured for ${intent.contractKey} yet.`);
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
      throw new Error('Prepare a trade before requesting a wallet signature.');
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
        : `Latest pipeline status is ${response.pipelineStatus.content.status.kind}.`;
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

const perpsActionTabs: Array<{ value: typeof perpsAction.value; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'modify', label: 'Modify' },
  { value: 'addMargin', label: 'Add margin' },
  { value: 'removeMargin', label: 'Remove margin' },
  { value: 'close', label: 'Close' },
  { value: 'syncFunding', label: 'Funding' },
  { value: 'liquidationPass', label: 'Liquidation' }
];

const selectPerpsPosition = (positionId: string) => {
  perpsPositionId.value = positionId;
  if (perpsAction.value === 'open') {
    perpsAction.value = 'addMargin';
  }
};

const selectOptionsSeries = (seriesId: string) => {
  optionsAction.value = 'buyShout';
  optionsSeriesId.value = seriesId;
};

const selectOptionsTicket = (ticketId: string) => {
  optionsAction.value = 'exerciseShout';
  optionsTicketId.value = ticketId;
  const ticket = liveOptionTickets.value.find((item) => item.id === ticketId);
  if (ticket?.seriesId) {
    optionsSeriesId.value = ticket.seriesId;
  }
};
</script>

<template>
  <div class="view-frame stack">
    <section class="panel is-hero market-hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Swap</p>
          <h2 class="panel-title">{{ marketTitle }}</h2>
          <p class="panel-subtitle">{{ modeSubtitle }}</p>
        </div>

        <div class="stat-ticker">
          <article class="stat-chip">
            <span>{{ marketHighlights[0].label }}</span>
            <strong>{{ marketHighlights[0].value }}</strong>
          </article>
          <article class="stat-chip">
            <span>{{ marketHighlights[1].label }}</span>
            <strong>{{ marketHighlights[1].value }}</strong>
          </article>
          <article class="stat-chip">
            <span>{{ marketHighlights[2].label }}</span>
            <strong>{{ marketHighlights[2].value }}</strong>
          </article>
          <article class="stat-chip">
            <span>{{ marketHighlights[3].label }}</span>
            <strong>{{ marketHighlights[3].value }}</strong>
          </article>
        </div>
      </div>

      <div v-if="displayedRecentPairs.length" class="chip-row">
        <button
          v-for="pair in displayedRecentPairs"
          :key="`${pair.from}-${pair.to}`"
          class="pair-chip"
          :class="{ 'is-active': pair.from === payToken && pair.to === receiveToken }"
          type="button"
          @click="applyRecentPair(pair)"
        >
          {{ pair.from }}/{{ pair.to }}
        </button>
      </div>
    </section>

    <div class="split-grid split-grid--trade">
      <section class="panel trade-panel">
        <div class="section-head section-head--spread">
          <div>
            <p class="eyebrow">Trade</p>
            <h3 class="panel-title">{{ tradeDeskTitle }}</h3>
          </div>

          <div class="subtabs">
            <button
              v-for="tab in ['Spot', 'Perps', 'Options']"
              :key="tab"
              class="subtab"
              :class="{ 'is-active': mode === tab }"
              type="button"
              @click="mode = tab as TradeMode"
            >
              {{ tab }}
            </button>
          </div>
        </div>

        <div class="balance-strip">
          <div>
            <span class="balance-strip__label">Available</span>
            <strong>{{ currentPayBalanceLabel }}</strong>
          </div>
          <div class="shortcut-row">
            <button class="shortcut-chip" type="button" :disabled="!canUseAmountShortcuts" @click="applyAmountShortcut(25)">
              25%
            </button>
            <button class="shortcut-chip" type="button" :disabled="!canUseAmountShortcuts" @click="applyAmountShortcut(50)">
              50%
            </button>
            <button class="shortcut-chip" type="button" :disabled="!canUseAmountShortcuts" @click="applyAmountShortcut(100)">
              Max
            </button>
          </div>
        </div>

        <div v-if="!authorityAccountId" class="notice is-warn onboarding-note">
          <div class="stack stack--tight">
            <strong>Connect a wallet or choose a watch account to load balances and prepare a trade.</strong>
            <span>{{ nextActionHint }}</span>
          </div>
          <button class="button is-soft" type="button" @click="emit('open-connect')">
            Open wallet and account setup
          </button>
        </div>

        <div class="trade-stack">
          <section class="token-panel">
            <div class="token-panel__top">
              <span class="token-panel__label">{{ tradePayLabel }}</span>
              <span class="token-panel__meta">{{ payToken }}</span>
            </div>
            <div class="token-panel__body">
              <input v-model="amountIn" class="input input--amount" :inputmode="mode === 'Spot' ? 'decimal' : 'numeric'" />
              <button class="token-trigger" type="button" :disabled="spotPairLocked" @click="openTokenPicker('pay')">
                <span class="token-trigger__label">{{ spotPairLocked ? 'Live route' : 'Token' }}</span>
                <strong>{{ payToken }}</strong>
              </button>
            </div>
          </section>

          <button class="swap-arrow-button" type="button" aria-label="Flip pair" @click="flipPair">
            <component :is="Icons.Swap" :size="18" />
          </button>

          <section class="token-panel token-panel--receive">
            <div class="token-panel__top">
              <span class="token-panel__label">{{ tradeOutputLabel }}</span>
              <span class="token-panel__meta">{{ receiveToken }}</span>
            </div>
            <div class="token-panel__body token-panel__body--output">
              <div class="token-panel__output">
                <strong>{{ tradeOutputValue }}</strong>
                <span class="token-panel__output-label">{{ tradeOutputHelper }}</span>
              </div>
              <button class="token-trigger" type="button" :disabled="spotPairLocked" @click="openTokenPicker('receive')">
                <span class="token-trigger__label">{{ spotPairLocked ? 'Live route' : 'Token' }}</span>
                <strong>{{ receiveToken }}</strong>
              </button>
            </div>
          </section>

          <div class="form-grid form-grid--trade-meta">
            <label v-if="mode === 'Spot'" class="field">
              <span>Slippage %</span>
              <input v-model="slippage" class="input" inputmode="decimal" />
            </label>

            <div v-if="mode === 'Perps'" class="field">
              <span>Action</span>
              <div class="subtabs">
                <button
                  v-for="action in perpsActionTabs"
                  :key="action.value"
                  class="subtab"
                  :class="{ 'is-active': perpsAction === action.value }"
                  type="button"
                  @click="perpsAction = action.value"
                >
                  {{ action.label }}
                </button>
              </div>
            </div>

            <div v-if="mode === 'Perps'" class="field">
              <span>Direction</span>
              <div class="subtabs">
                <button
                  class="subtab"
                  :class="{ 'is-active': perpsDirection === 'Long' }"
                  type="button"
                  :disabled="perpsAction !== 'open'"
                  @click="perpsDirection = 'Long'"
                >
                  Long
                </button>
                <button
                  class="subtab"
                  :class="{ 'is-active': perpsDirection === 'Short' }"
                  type="button"
                  :disabled="perpsAction !== 'open'"
                  @click="perpsDirection = 'Short'"
                >
                  Short
                </button>
              </div>
            </div>

            <label v-if="mode === 'Perps'" class="field">
              <span>Market id</span>
              <input v-model="perpsMarketId" class="input mono" inputmode="numeric" />
            </label>

            <label v-if="mode === 'Perps' && perpsAction !== 'open' && perpsAction !== 'syncFunding' && perpsAction !== 'liquidationPass'" class="field">
              <span>Selected position</span>
              <input :value="perpsPositionId || 'Choose from live positions'" class="input mono" readonly />
            </label>

            <label v-if="mode === 'Perps' && (perpsAction === 'open' || perpsAction === 'modify')" class="field">
              <span>Position size</span>
              <input v-model="perpsSize" class="input" inputmode="decimal" />
            </label>

            <label v-if="mode === 'Perps' && (perpsAction === 'open' || perpsAction === 'modify')" class="field">
              <span>Leverage bps</span>
              <input v-model="perpsLeverageBps" class="input mono" inputmode="numeric" />
            </label>

            <label v-if="mode === 'Perps' && perpsAction === 'liquidationPass'" class="field">
              <span>Max positions</span>
              <input v-model="perpsMaxPositions" class="input mono" inputmode="numeric" />
            </label>

            <div v-if="mode === 'Perps' && perpsAction !== 'addMargin'" class="field">
              <span>Soracles attestation</span>
              <input :value="oracleAttestationLabel" class="input mono" readonly />
            </div>

            <div v-if="mode === 'Options'" class="field">
              <span>Action</span>
              <div class="subtabs">
                <button
                  class="subtab"
                  :class="{ 'is-active': optionsAction === 'buyShout' }"
                  type="button"
                  @click="optionsAction = 'buyShout'"
                >
                  Buy shout
                </button>
                <button
                  class="subtab"
                  :class="{ 'is-active': optionsAction === 'buyOutperformance' }"
                  type="button"
                  @click="optionsAction = 'buyOutperformance'"
                >
                  Buy outperf
                </button>
                <button
                  class="subtab"
                  :class="{ 'is-active': optionsAction === 'exerciseShout' }"
                  type="button"
                  @click="optionsAction = 'exerciseShout'"
                >
                  Exercise shout
                </button>
                <button
                  class="subtab"
                  :class="{ 'is-active': optionsAction === 'exerciseOutperformance' }"
                  type="button"
                  @click="optionsAction = 'exerciseOutperformance'"
                >
                  Exercise outperf
                </button>
              </div>
            </div>

            <label v-if="mode === 'Options'" class="field">
              <span>Series</span>
              <input :value="optionsSeriesId || 'Choose from live series'" class="input mono" readonly />
            </label>

            <label v-if="mode === 'Options' && optionsAction.startsWith('exercise')" class="field">
              <span>Position</span>
              <input :value="optionsTicketId || 'Choose from owned positions'" class="input mono" readonly />
            </label>

            <label v-if="mode === 'Options' && optionsAction.startsWith('buy')" class="field">
              <span>Notional</span>
              <input v-model="optionsContracts" class="input" inputmode="numeric" />
            </label>

            <label v-if="mode === 'Options' && optionsAction.startsWith('buy')" class="field">
              <span>Collateral locked</span>
              <input v-model="optionsPayout" class="input" inputmode="decimal" />
            </label>

            <div v-if="mode === 'Options' && optionsAction === 'exerciseShout'" class="field">
              <span>Soracles attestation</span>
              <input :value="oracleAttestationLabel" class="input mono" readonly />
            </div>
          </div>
        </div>

        <div class="action-row action-row--trade">
          <button class="button is-ghost" type="button" @click="previewPayload">Preview payload</button>
          <button class="button" type="button" :disabled="draftBusy || submitBusy" @click="handlePrimaryAction">
            {{ primaryActionLabel }}
          </button>
        </div>

        <p class="panel-copy">{{ nextActionHint }}</p>
      </section>

      <section class="panel trade-sidebar">
        <p class="eyebrow">Trade details</p>
        <h3 class="panel-title">Price, route, and readiness</h3>
        <p class="panel-subtitle">{{ marketSupportCopy }}</p>

        <div v-if="mode === 'Spot' && spotPoolConfigError" class="notice is-warn">
          {{ spotPoolConfigError }}
        </div>
        <div v-if="mode === 'Spot' && spotQuoteError" class="notice is-warn">
          {{ spotQuoteError }}
        </div>
        <div v-if="mode === 'Perps' && livePerpsError" class="notice is-warn">
          {{ livePerpsError }}
        </div>
        <div v-if="mode === 'Options' && liveOptionsError" class="notice is-warn">
          {{ liveOptionsError }}
        </div>

        <div class="summary-list summary-list--dense">
          <div v-if="mode === 'Spot'">
            <span>Live pair</span>
            <strong>{{ liveSpotPairLabel || '--' }}</strong>
          </div>
          <div v-if="mode === 'Spot'">
            <span>Active reserves</span>
            <strong>{{ liveSpotReserveLabel }}</strong>
          </div>
          <div v-if="mode === 'Perps'">
            <span>Selected position</span>
            <strong>{{ perpsPositionId || '--' }}</strong>
          </div>
          <div v-if="mode === 'Options'">
            <span>Selected series</span>
            <strong>{{ optionsSeriesId || '--' }}</strong>
          </div>
          <div>
            <span>Amount in</span>
            <strong>{{ formatNumber(amountNumeric, 4) }} {{ payToken }}</strong>
          </div>
          <div>
            <span>{{ mode === 'Spot' ? 'Estimated out' : tradeOutputLabel }}</span>
            <strong>{{ mode === 'Spot' ? estimatedOutDisplay : tradeOutputValue }}</strong>
          </div>
          <div v-if="mode === 'Spot'">
            <span>Min out</span>
            <strong>{{ spotMinOutDisplay }}</strong>
          </div>
          <div>
            <span>Fee</span>
            <strong>{{ spotPoolConfig ? `${spotPoolConfig.feePips} pips` : '--' }}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{{ executionState }}</strong>
          </div>
        </div>

        <div v-if="draftError" class="notice is-danger">{{ draftError }}</div>
        <div v-if="submitError" class="notice is-danger">{{ submitError }}</div>
        <div
          v-if="submitPipelineNote"
          class="notice"
          :class="submitPipelineJson && submitPipelineNote.includes('reached') ? 'is-success' : 'is-warn'"
        >
          {{ submitPipelineNote }}
        </div>

        <div class="market-list">
          <article v-if="mode === 'Spot'" class="market-list__item is-active">
            <div>
              <span class="market-list__pair">{{ liveSpotPairLabel || '--' }}</span>
              <span class="market-list__route">active bin quote</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ formatNumber(liveSpotMid, 6) }}</strong>
              <span>{{ liveSpotReserveLabel }}</span>
            </div>
          </article>
          <button
            v-for="position in mode === 'Perps' ? livePerpsPositions : []"
            :key="position.id"
            class="market-list__item"
            :class="{ 'is-active': position.id === perpsPositionId }"
            type="button"
            @click="selectPerpsPosition(position.id)"
          >
            <div>
              <span class="market-list__pair">{{ position.id }}</span>
              <span class="market-list__route">position</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ position.size }}</strong>
              <span>{{ position.collateral }}</span>
            </div>
          </button>
          <button
            v-for="series in mode === 'Options' ? liveOptionSeries : []"
            :key="series.id"
            class="market-list__item"
            :class="{ 'is-active': series.id === optionsSeriesId && optionsAction.startsWith('buy') }"
            type="button"
            @click="selectOptionsSeries(series.id)"
          >
            <div>
              <span class="market-list__pair">{{ series.id }}</span>
              <span class="market-list__route">{{ series.active ? 'active' : 'inactive' }}</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ series.premium }}</strong>
              <span>{{ series.openNotional }} open</span>
            </div>
          </button>
          <button
            v-for="ticket in mode === 'Options' && optionsAction.startsWith('exercise') ? liveOptionTickets : []"
            :key="ticket.id"
            class="market-list__item"
            :class="{ 'is-active': ticket.id === optionsTicketId }"
            type="button"
            @click="selectOptionsTicket(ticket.id)"
          >
            <div>
              <span class="market-list__pair">{{ ticket.id }}</span>
              <span class="market-list__route">{{ ticket.seriesId }}</span>
            </div>
            <div class="market-list__stats">
              <strong>{{ ticket.notional }} notional</strong>
              <span>{{ ticket.collateralLocked }} locked</span>
            </div>
          </button>
        </div>
      </section>
    </div>

    <ExecutionInspector
      title="Trade inspector"
      subtitle="Raw Torii payloads stay visible here, but the trade decision path stays focused on market state and the next required action."
      :summary="tradeInspectorSummary"
      :entries="tradeInspectorEntries"
      empty-copy="Preview or prepare a trade and the live payload stream will appear here."
    />

    <Transition name="drawer-fade">
      <div v-if="pickerTarget" class="drawer-backdrop token-picker-backdrop" @click.self="closeTokenPicker">
        <section class="token-picker panel">
          <div class="drawer-head">
            <div>
              <p class="eyebrow">Token picker</p>
              <h3 class="panel-title">{{ pickerHeading }}</h3>
            </div>
            <button class="icon-button" type="button" aria-label="Close picker" @click="closeTokenPicker">
              <component :is="Icons.X" :size="18" />
            </button>
          </div>

          <label class="field">
            <span>Search</span>
            <div class="search-input">
              <component :is="Icons.Search" :size="16" />
              <input v-model="pickerSearch" class="input search-input__field" placeholder="Search symbol or alias" />
            </div>
          </label>

          <div v-if="visibleFavoriteTokens.length" class="chip-row chip-row--tight">
            <button
              v-for="token in visibleFavoriteTokens"
              :key="token"
              class="pair-chip"
              type="button"
              @click="selectToken(token)"
            >
              {{ token }}
            </button>
          </div>

          <div class="token-picker__list no-scrollbar">
            <div v-for="token in pickerTokens" :key="token" class="token-option">
              <button class="token-option__main" type="button" @click="selectToken(token)">
                <div class="token-option__copy">
                  <strong>{{ token }}</strong>
                  <span class="mono">{{ tokenAliasLabel(token) }}</span>
                </div>
                <div class="token-option__meta">
                  <span>{{ tokenBalanceLabel(token) }}</span>
                </div>
              </button>
              <button
                class="token-option__pin"
                :class="{ 'is-active': favoriteSet.has(token) }"
                type="button"
                :aria-label="favoriteSet.has(token) ? `Unpin ${token}` : `Pin ${token}`"
                @click="toggleFavoriteToken(token)"
              >
                <component :is="Icons.Star" :size="16" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>
