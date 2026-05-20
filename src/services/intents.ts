import { resolveContractAddressForRole } from '@/services/registry';
import type { TradeMode } from '@/types';

export interface ContractIntentSpec {
  contractKey: string;
  contractAddress: string | null;
  entrypoint: string;
  payload: Record<string, unknown>;
}

interface SharedIntentInput {
  gate: string;
  dataspace?: string;
}

export interface SwapIntentInput extends SharedIntentInput {
  mode: TradeMode;
  authorityAccountId: string;
  payToken: string;
  receiveToken: string;
  payAssetId?: string;
  receiveAssetId?: string;
  spotBaseAssetId?: string;
  spotQuoteAssetId?: string;
  amountIn: string;
  slippage: string;
  perpsDirection: 'Long' | 'Short';
  perpsAction?: 'open' | 'modify' | 'addMargin' | 'removeMargin' | 'close' | 'syncFunding' | 'liquidationPass';
  perpsMarketId?: string;
  perpsPositionId: string;
  perpsSize: string;
  perpsMargin?: string;
  perpsLeverageBps?: string;
  perpsOraclePayload?: string;
  perpsOracleSignature?: string;
  perpsMaxPositions?: string;
  optionsAction?: 'buyShout' | 'buyOutperformance' | 'exerciseShout' | 'exerciseOutperformance';
  optionsSeriesId: string;
  optionsPositionId: string;
  optionsNotional?: string;
  optionsPremiumPaid?: string;
  optionsCollateralLocked?: string;
  optionsOraclePayload?: string;
  optionsOracleSignature?: string;
}

export interface LaunchpadCreateIntentInput extends SharedIntentInput {
  saleId: string;
  saleAssetId: string;
  paymentAssetId: string;
  treasuryAccountId: string;
  unitPrice: string;
  softCap: string;
  hardCap: string;
  claimStartSlot: string;
  claimEndSlot: string;
}

export interface LaunchpadContributeIntentInput extends SharedIntentInput {
  authorityAccountId: string;
  saleId: string;
  paymentAmount: string;
}

export interface LaunchpadClaimIntentInput extends SharedIntentInput {
  authorityAccountId: string;
  allocationId: string;
  currentSlot: string;
}

export interface LaunchpadRefundIntentInput extends SharedIntentInput {
  authorityAccountId: string;
  allocationId: string;
}

export interface LaunchpadCloseIntentInput extends SharedIntentInput {
  saleId: string;
}

export interface LaunchpadSeedIntentInput extends SharedIntentInput {
  saleId: string;
  claimInventoryAmount: string;
}

export type DefiOperationKind =
  | 'n3x_mint'
  | 'n3x_redeem'
  | 'farm_stake'
  | 'farm_claim'
  | 'cover_register'
  | 'cover_claim'
  | 'cover_expire'
  | 'automation_enqueue'
  | 'automation_configure'
  | 'automation_pause'
  | 'automation_resume'
  | 'automation_retry'
  | 'automation_cancel';

export type DefiIntentInput =
  | ({
      kind: 'n3x_mint';
      authorityAccountId: string;
      usdtIn: string;
      usdcIn: string;
      kusdIn: string;
    } & SharedIntentInput)
  | ({
      kind: 'n3x_redeem';
      authorityAccountId: string;
      n3xAmount: string;
    } & SharedIntentInput)
  | ({
      kind: 'farm_stake';
      authorityAccountId: string;
      position: string;
      amount: string;
    } & SharedIntentInput)
  | ({
      kind: 'farm_claim';
      authorityAccountId: string;
      position: string;
    } & SharedIntentInput)
  | ({
      kind: 'cover_register';
      authorityAccountId: string;
      lowerBound: string;
      upperBound: string;
      payoutAmount: string;
      monitoringWindowSlots: string;
      requiredObservations: string;
      coveredNotional: string;
      premiumPaid: string;
    } & SharedIntentInput)
  | ({
      kind: 'cover_claim';
      authorityAccountId: string;
      policyId: string;
    } & SharedIntentInput)
  | ({
      kind: 'cover_expire';
      authorityAccountId: string;
      policyId: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_enqueue';
      authorityAccountId: string;
      job: string;
      payloadHash: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_configure';
      authorityAccountId: string;
      job: string;
      nextSlot: string;
      maxRetries: string;
      retryDelaySlots: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_pause';
      authorityAccountId: string;
      job: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_resume';
      authorityAccountId: string;
      job: string;
      currentSlot: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_retry';
      authorityAccountId: string;
      job: string;
      currentSlot: string;
    } & SharedIntentInput)
  | ({
      kind: 'automation_cancel';
      authorityAccountId: string;
      job: string;
    } & SharedIntentInput);

const resolveContractBinding = (contractKey: string) => {
  const role = Object.entries(ROLE_BY_CONTRACT_KEY).find(([, key]) => key === contractKey)?.[0];
  if (!role) {
    return {
      contractKey,
      contractAddress: null
    };
  }
  return {
    contractKey,
    contractAddress: resolveContractAddressForRole(role as keyof typeof ROLE_BY_CONTRACT_KEY)
  };
};

const requireNonEmptyString = (label: string, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
};

const requireIntegerString = (label: string, value: string) => {
  const trimmed = requireNonEmptyString(label, value);
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return trimmed;
};

const requirePositiveIntegerString = (label: string, value: string) => {
  const normalized = requireIntegerString(label, value);
  if (BigInt(normalized) <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return normalized;
};

const requireNonNegativeIntegerString = (label: string, value: string) => {
  const normalized = requireIntegerString(label, value);
  if (BigInt(normalized) < 0n) {
    throw new Error(`${label} cannot be negative.`);
  }
  return normalized;
};

const HEX_BYTES_PATTERN = /^(?:0[xX])?[0-9a-fA-F]+$/;

const requireHexBytes = (label: string, value: string) => {
  const raw = requireNonEmptyString(label, value);
  if (!HEX_BYTES_PATTERN.test(raw)) {
    throw new Error(`${label} must be hex bytes.`);
  }
  const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error(`${label} must contain an even number of hex digits.`);
  }
  return `0x${hex.toLowerCase()}`;
};

const requireSignedOracleFields = (prefix: string, payload?: string, signature?: string) => ({
  oracle_payload: requireHexBytes(`${prefix} payload`, payload || ''),
  oracle_signature: requireHexBytes(`${prefix} signature`, signature || '')
});

export const buildSwapIntent = (input: SwapIntentInput): ContractIntentSpec => {
  switch (input.mode) {
    case 'Spot': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.spotRouter);
      const inputAssetId = requireNonEmptyString('Input asset', input.payAssetId || '');
      const baseAssetId = requireNonEmptyString('Live DLMM base asset', input.spotBaseAssetId || '');
      return {
        contractKey,
        contractAddress,
        entrypoint: 'route_swap',
        payload: {
          amount_in: requirePositiveIntegerString('Amount in', input.amountIn),
          input_is_base: inputAssetId === baseAssetId ? 1 : 0,
          min_out: requirePositiveIntegerString('Minimum output', input.slippage)
        }
      };
    }
    case 'Perps': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.perpsEngine);
      const action = input.perpsAction || 'open';
      const signedOracle = () =>
        requireSignedOracleFields('Perps oracle', input.perpsOraclePayload, input.perpsOracleSignature);
      const positionId = () => requirePositiveIntegerString('Position id', input.perpsPositionId);
      const marketId = () => requirePositiveIntegerString('Market id', input.perpsMarketId || '');
      return {
        contractKey,
        contractAddress,
        entrypoint:
          action === 'modify'
            ? 'modify_position'
            : action === 'addMargin'
              ? 'add_margin'
              : action === 'removeMargin'
                ? 'remove_margin'
                : action === 'close'
                  ? 'close_position'
                  : action === 'syncFunding'
                    ? 'sync_funding'
                    : action === 'liquidationPass'
                      ? 'run_liquidation_pass'
                      : 'open_position',
        payload:
          action === 'modify'
            ? {
                position_id: positionId(),
                size_delta: input.perpsDirection === 'Short'
                  ? (-BigInt(requirePositiveIntegerString('Size delta', input.perpsSize))).toString()
                  : requirePositiveIntegerString('Size delta', input.perpsSize),
                margin_delta: requireIntegerString('Margin delta', input.perpsMargin || input.amountIn),
                requested_leverage_bps: requirePositiveIntegerString('Requested leverage bps', input.perpsLeverageBps || ''),
                ...signedOracle()
              }
            : action === 'addMargin'
              ? {
                  position_id: positionId(),
                  amount: requirePositiveIntegerString('Margin amount', input.perpsMargin || input.amountIn)
                }
              : action === 'removeMargin'
                ? {
                    position_id: positionId(),
                    amount: requirePositiveIntegerString('Margin amount', input.perpsMargin || input.amountIn),
                    ...signedOracle()
                  }
                : action === 'close'
                  ? {
                      position_id: positionId(),
                      ...signedOracle()
                    }
                  : action === 'syncFunding'
                    ? {
                        market_id: marketId(),
                        ...signedOracle()
                      }
                    : action === 'liquidationPass'
                      ? {
                          market_id: marketId(),
                          max_positions: requirePositiveIntegerString('Max positions', input.perpsMaxPositions || ''),
                          ...signedOracle()
                        }
                      : (() => {
                          const size = requirePositiveIntegerString('Position size', input.perpsSize);
                          const signedSize = input.perpsDirection === 'Short' ? (-BigInt(size)).toString() : size;
                          return {
                            market_id: marketId(),
                            size: signedSize,
                            margin: requirePositiveIntegerString('Margin', input.perpsMargin || input.amountIn),
                            requested_leverage_bps: requirePositiveIntegerString('Requested leverage bps', input.perpsLeverageBps || ''),
                            ...signedOracle()
                          };
                        })()
      };
    }
    case 'Options': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.optionsFactory);
      const action = input.optionsAction || 'buyShout';
      return {
        contractKey,
        contractAddress,
        entrypoint:
          action === 'buyOutperformance'
            ? 'buy_outperformance'
            : action === 'exerciseShout'
              ? 'exercise_shout_position'
              : action === 'exerciseOutperformance'
                ? 'exercise_outperformance_position'
                : 'buy_shout',
        payload:
          action === 'exerciseShout'
            ? {
                position_id: requirePositiveIntegerString('Position id', input.optionsPositionId),
                ...requireSignedOracleFields('Options oracle', input.optionsOraclePayload, input.optionsOracleSignature)
              }
            : action === 'exerciseOutperformance'
              ? {
                  position_id: requirePositiveIntegerString('Position id', input.optionsPositionId)
                }
              : {
                  series_id: requirePositiveIntegerString('Series id', input.optionsSeriesId),
                  notional: requirePositiveIntegerString('Notional', input.optionsNotional || ''),
                  premium_paid: requirePositiveIntegerString('Premium paid', input.optionsPremiumPaid || input.amountIn),
                  collateral_locked: requirePositiveIntegerString('Collateral locked', input.optionsCollateralLocked || '')
                }
      };
    }
  }
};

export const buildLaunchpadCreateIntent = (input: LaunchpadCreateIntentInput): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'init_sale',
    payload: {
      sale: requireNonEmptyString('Sale id', input.saleId),
      sale_asset: requireNonEmptyString('Sale asset', input.saleAssetId),
      payment_asset: requireNonEmptyString('Payment asset', input.paymentAssetId),
      treasury: requireNonEmptyString('Treasury account', input.treasuryAccountId),
      unit_price: requirePositiveIntegerString('Unit price', input.unitPrice),
      soft_cap: requireNonNegativeIntegerString('Soft cap', input.softCap),
      hard_cap: requirePositiveIntegerString('Hard cap', input.hardCap),
      claim_start_slot: requireNonNegativeIntegerString('Claim start slot', input.claimStartSlot),
      claim_end_slot: requireNonNegativeIntegerString('Claim end slot', input.claimEndSlot)
    }
  };
};

export const buildLaunchpadContributeIntent = (
  input: LaunchpadContributeIntentInput
): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'contribute',
    payload: {
      sale: requireNonEmptyString('Sale id', input.saleId),
      payment_amount: requirePositiveIntegerString('Payment amount', input.paymentAmount)
    }
  };
};

export const buildLaunchpadClaimIntent = (input: LaunchpadClaimIntentInput): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'claim_allocation',
    payload: {
      allocation: requireNonEmptyString('Allocation id', input.allocationId),
      current_slot: requireNonNegativeIntegerString('Current slot', input.currentSlot)
    }
  };
};

export const buildLaunchpadRefundIntent = (input: LaunchpadRefundIntentInput): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'refund_allocation',
    payload: {
      allocation: requireNonEmptyString('Allocation id', input.allocationId)
    }
  };
};

export const buildLaunchpadCloseIntent = (input: LaunchpadCloseIntentInput): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'close_sale',
    payload: {
      sale: requireNonEmptyString('Sale id', input.saleId)
    }
  };
};

export const buildLaunchpadSeedIntent = (input: LaunchpadSeedIntentInput): ContractIntentSpec => {
  const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.launchpadSaleFactory);
  return {
    contractKey,
    contractAddress,
    entrypoint: 'finalize_sale_activation',
    payload: {
      sale: requireNonEmptyString('Sale id', input.saleId),
      claim_inventory_amount: requireNonNegativeIntegerString('Claim inventory amount', input.claimInventoryAmount)
    }
  };
};

export const buildDefiIntent = (input: DefiIntentInput): ContractIntentSpec => {
  switch (input.kind) {
    case 'n3x_mint': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.n3xHub);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'deposit_and_mint',
        payload: {
          usdt_in: requireNonNegativeIntegerString('USDT in', input.usdtIn),
          usdc_in: requireNonNegativeIntegerString('USDC in', input.usdcIn),
          kusd_in: requireNonNegativeIntegerString('KUSD in', input.kusdIn)
        }
      };
    }
    case 'n3x_redeem': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.n3xHub);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'burn_and_redeem',
        payload: {
          n3x_amount: requirePositiveIntegerString('n3x amount', input.n3xAmount)
        }
      };
    }
    case 'farm_stake': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.farm);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'stake',
        payload: {
          position: input.position,
          amount: requirePositiveIntegerString('Amount', input.amount)
        }
      };
    }
    case 'farm_claim': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.farm);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'claim',
        payload: {
          position: input.position
        }
      };
    }
    case 'cover_register': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'register_policy',
        payload: {
          lower_bound: requireIntegerString('Lower bound', input.lowerBound),
          upper_bound: requireIntegerString('Upper bound', input.upperBound),
          payout_amount: requirePositiveIntegerString('Payout amount', input.payoutAmount),
          monitoring_window_slots: requirePositiveIntegerString('Monitoring window slots', input.monitoringWindowSlots),
          required_observations: requirePositiveIntegerString('Required observations', input.requiredObservations),
          covered_notional: requirePositiveIntegerString('Covered notional', input.coveredNotional),
          premium_paid: requireNonNegativeIntegerString('Premium paid', input.premiumPaid)
        }
      };
    }
    case 'cover_claim': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'route_claim',
        payload: {
          policy_id: requirePositiveIntegerString('Policy id', input.policyId)
        }
      };
    }
    case 'cover_expire': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'expire_policy',
        payload: {
          policy_id: requirePositiveIntegerString('Policy id', input.policyId)
        }
      };
    }
    case 'automation_enqueue': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'enqueue',
        payload: {
          job: requireNonEmptyString('Job id', input.job),
          payload_hash: requirePositiveIntegerString('Payload hash', input.payloadHash)
        }
      };
    }
    case 'automation_configure': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'configure_job',
        payload: {
          job: requireNonEmptyString('Job id', input.job),
          next_slot: requireNonNegativeIntegerString('Next slot', input.nextSlot),
          max_retries: requireNonNegativeIntegerString('Max retries', input.maxRetries),
          retry_delay_slots: requireNonNegativeIntegerString('Retry delay slots', input.retryDelaySlots)
        }
      };
    }
    case 'automation_pause': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'pause_job',
        payload: {
          job: requireNonEmptyString('Job id', input.job)
        }
      };
    }
    case 'automation_resume': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'resume_job',
        payload: {
          job: requireNonEmptyString('Job id', input.job),
          current_slot: requireNonNegativeIntegerString('Current slot', input.currentSlot)
        }
      };
    }
    case 'automation_retry': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'retry_at',
        payload: {
          job: requireNonEmptyString('Job id', input.job),
          current_slot: requireNonNegativeIntegerString('Current slot', input.currentSlot)
        }
      };
    }
    case 'automation_cancel': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.automationQueue);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'cancel_job',
        payload: {
          job: requireNonEmptyString('Job id', input.job)
        }
      };
    }
  }
};

const ROLE_BY_CONTRACT_KEY = {
  automationQueue: 'automation.job_queue',
  coverPolicyManager: 'cover.policy_manager',
  farm: 'farms.farm',
  launchpadSaleFactory: 'launchpad.sale_factory',
  n3xHub: 'n3x.n3x_hub',
  optionsFactory: 'options.factory',
  perpsEngine: 'perps.perps_engine',
  referralRegistry: 'referral.registry',
  spotPool: 'dlmm.dlmm_pool',
  spotRouter: 'dlmm.dlmm_router'
} as const;
