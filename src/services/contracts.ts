import type {
  ContractCallDraftRequest,
  ContractCallResponse,
  ContractStateQuery,
  ContractStateResponse,
  ContractViewRequest,
  ContractViewResponse,
  CoverManagerConfig,
  DlmmMirrorState,
  DlmmPoolConfig,
  FarmConfig
} from '@/types';
import { readResponseMessage } from '@/services/norito';

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || 'request failed'}`);
  }
  return (await response.json()) as T;
};

const postContractCall = (baseUrl: string, request: ContractCallDraftRequest) =>
  fetchJson<ContractCallResponse>(new URL('/v1/contracts/call', `${baseUrl}/`).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

export const prepareContractCallDraft = (baseUrl: string, request: ContractCallDraftRequest) =>
  postContractCall(baseUrl, request);

export const submitContractCallDetached = (baseUrl: string, request: ContractCallDraftRequest) =>
  postContractCall(baseUrl, request);

export const viewContract = (baseUrl: string, request: ContractViewRequest) =>
  fetchJson<ContractViewResponse>(new URL('/v1/contracts/view', `${baseUrl}/`).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

export const fetchContractState = (baseUrl: string, query: ContractStateQuery) => {
  const url = new URL('/v1/contracts/state', `${baseUrl}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return fetchJson<ContractStateResponse>(url.toString());
};

const asFiniteNumber = (label: string, value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} returned an unexpected numeric value from pool_config.`);
  }
  return value;
};

const asIntegerString = (label: string, value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return value.trim();
  }
  throw new Error(`${label} returned an unexpected integer value.`);
};

export const fetchDlmmPoolConfig = async (
  baseUrl: string,
  authority: string,
  contractAddress: string,
  gasLimit = 5000
): Promise<DlmmPoolConfig> => {
  const response = await viewContract(baseUrl, {
    authority,
    contract_address: contractAddress,
    entrypoint: 'pool_config',
    gas_limit: gasLimit
  });

  if (!Array.isArray(response.result) || response.result.length < 6) {
    throw new Error('DLMM pool_config returned an unexpected tuple shape.');
  }

  const [baseAssetId, quoteAssetId, vaultAccountId, feePips, binStep, activeBin] = response.result;
  if (
    typeof baseAssetId !== 'string' ||
    typeof quoteAssetId !== 'string' ||
    typeof vaultAccountId !== 'string'
  ) {
    throw new Error('DLMM pool_config returned unexpected asset or vault identifiers.');
  }

  return {
    baseAssetId,
    quoteAssetId,
    vaultAccountId,
    feePips: asFiniteNumber('fee_pips', feePips),
    binStep: asFiniteNumber('bin_step', binStep),
    activeBin: asFiniteNumber('active_bin', activeBin)
  };
};

export const fetchDlmmMirrorState = async (
  baseUrl: string,
  authority: string,
  contractAddress: string,
  gasLimit = 5000
): Promise<DlmmMirrorState> => {
  const response = await viewContract(baseUrl, {
    authority,
    contract_address: contractAddress,
    entrypoint: 'mirror_state',
    gas_limit: gasLimit
  });

  if (!Array.isArray(response.result) || response.result.length < 13) {
    throw new Error('DLMM mirror_state returned an unexpected tuple shape.');
  }

  const [
    poolInitialized,
    activeBin,
    feePips,
    binStep,
    reserveBase,
    reserveQuote,
    totalReserves,
    binShareSupply,
    impactCapBps,
    minReserveBase,
    minReserveQuote,
    maxBinsPerSwap,
    binLiquidityCap
  ] = response.result;

  return {
    poolInitialized: asIntegerString('pool_initialized', poolInitialized) === '1',
    activeBin: asFiniteNumber('active_bin', activeBin),
    feePips: asFiniteNumber('fee_pips', feePips),
    binStep: asFiniteNumber('bin_step', binStep),
    reserveBase: asIntegerString('reserve_base', reserveBase),
    reserveQuote: asIntegerString('reserve_quote', reserveQuote),
    totalReserves: asIntegerString('total_reserves', totalReserves),
    binShareSupply: asIntegerString('bin_share_supply', binShareSupply),
    impactCapBps: asIntegerString('impact_cap_bps', impactCapBps),
    minReserveBase: asIntegerString('min_reserve_base', minReserveBase),
    minReserveQuote: asIntegerString('min_reserve_quote', minReserveQuote),
    maxBinsPerSwap: asIntegerString('max_bins_per_swap', maxBinsPerSwap),
    binLiquidityCap: asIntegerString('bin_liquidity_cap', binLiquidityCap)
  };
};

export const quoteDlmmActiveBin = async (
  baseUrl: string,
  authority: string,
  contractAddress: string,
  input: {
    reserveBase: string;
    reserveQuote: string;
    amountIn: string;
    feePips: number;
    activeBin: number;
    binStep: number;
    inputIsBase: boolean;
    minReserveBase: string;
    minReserveQuote: string;
  },
  gasLimit = 5000
) => {
  const response = await viewContract(baseUrl, {
    authority,
    contract_address: contractAddress,
    entrypoint: 'quote_bin',
    payload: {
      reserve_base: input.reserveBase,
      reserve_quote: input.reserveQuote,
      amount_in: input.amountIn,
      fee_pips: input.feePips,
      bin_id: input.activeBin,
      bin_step: input.binStep,
      input_is_base: input.inputIsBase ? 1 : 0,
      min_reserve_base: input.minReserveBase,
      min_reserve_quote: input.minReserveQuote
    },
    gas_limit: gasLimit
  });

  return asIntegerString('quote_bin', response.result);
};

export const fetchFarmConfig = async (
  baseUrl: string,
  authority: string,
  contractAddress: string,
  gasLimit = 5000
): Promise<FarmConfig> => {
  const response = await viewContract(baseUrl, {
    authority,
    contract_address: contractAddress,
    entrypoint: 'farm_config',
    gas_limit: gasLimit
  });

  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error('Farm config returned an unexpected tuple shape.');
  }

  const [stakeAssetId, rewardAssetId, treasuryAccountId, rewardRate] = response.result;
  if (
    typeof stakeAssetId !== 'string' ||
    typeof rewardAssetId !== 'string' ||
    typeof treasuryAccountId !== 'string'
  ) {
    throw new Error('Farm config returned unexpected asset or treasury identifiers.');
  }

  return {
    stakeAssetId,
    rewardAssetId,
    treasuryAccountId,
    rewardRate: asFiniteNumber('reward_rate', rewardRate)
  };
};

export const fetchCoverManagerConfig = async (
  baseUrl: string,
  authority: string,
  contractAddress: string,
  gasLimit = 5000
): Promise<CoverManagerConfig> => {
  const response = await viewContract(baseUrl, {
    authority,
    contract_address: contractAddress,
    entrypoint: 'manager_config',
    gas_limit: gasLimit
  });

  if (!Array.isArray(response.result) || response.result.length < 9) {
    throw new Error('Cover manager_config returned an unexpected tuple shape.');
  }

  const [
    settlementAssetId,
    riskVaultContractHex,
    withdrawalOnly,
    defaultRequiredObservations,
    oracleStaleSlots,
    observationJobId,
    automationCadence,
    automationBacklogCap,
    automationSafeMode
  ] = response.result;
  if (typeof settlementAssetId !== 'string') {
    throw new Error('Cover manager_config returned an unexpected settlement asset identifier.');
  }

  return {
    settlementAssetId,
    riskVaultContractHex: typeof riskVaultContractHex === 'string' ? riskVaultContractHex : null,
    withdrawalOnly: asIntegerString('cover_withdrawal_only', withdrawalOnly) !== '0',
    defaultRequiredObservations: asIntegerString('cover_default_required_observations', defaultRequiredObservations),
    oracleStaleSlots: asIntegerString('cover_oracle_stale_slots', oracleStaleSlots),
    observationJobId: asIntegerString('cover_observation_job_id', observationJobId),
    automationCadence: asIntegerString('cover_automation_cadence', automationCadence),
    automationBacklogCap: asIntegerString('cover_automation_backlog_cap', automationBacklogCap),
    automationSafeMode: asIntegerString('cover_automation_safe_mode', automationSafeMode) !== '0'
  };
};
