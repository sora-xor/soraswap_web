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
  spotVaultAccountId?: string;
  spotBaseAssetId?: string;
  spotQuoteAssetId?: string;
  amountIn: string;
  slippage: string;
  perpsDirection: 'Long' | 'Short';
  perpsAction?: 'open' | 'addCollateral' | 'removeCollateral' | 'closeMarked' | 'liquidateMarked';
  perpsPositionId: string;
  perpsSize: string;
  perpsMarkPrice?: string;
  optionsAction?: 'buy' | 'exercise';
  optionsSeriesId: string;
  optionsTicketId: string;
  optionsContracts?: string;
  optionsPayout?: string;
}

export interface LaunchpadCreateIntentInput extends SharedIntentInput {
  saleId: string;
  saleAssetId: string;
  paymentAssetId: string;
  treasuryAccountId: string;
  unitPrice: string;
  hardCap: string;
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
}

export type DefiOperationKind =
  | 'n3x_mint'
  | 'n3x_redeem'
  | 'farm_stake'
  | 'farm_claim'
  | 'cover_buy'
  | 'cover_claim'
  | 'cover_cancel'
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
      kind: 'cover_buy';
      authorityAccountId: string;
      policy: string;
      coveredNotional: string;
    } & SharedIntentInput)
  | ({
      kind: 'cover_claim';
      authorityAccountId: string;
      policy: string;
      coveredNotional: string;
    } & SharedIntentInput)
  | ({
      kind: 'cover_cancel';
      authorityAccountId: string;
      policy: string;
      refundBps: string;
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

export const buildSwapIntent = (input: SwapIntentInput): ContractIntentSpec => {
  switch (input.mode) {
    case 'Spot': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.spotPool);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'swap_exact_in_with_assets',
        payload: {
          trader: requireNonEmptyString('Authority account', input.authorityAccountId),
          input_asset: requireNonEmptyString('Input asset', input.payAssetId || ''),
          vault: requireNonEmptyString('Live DLMM vault', input.spotVaultAccountId || ''),
          base_asset: requireNonEmptyString('Live DLMM base asset', input.spotBaseAssetId || ''),
          quote_asset: requireNonEmptyString('Live DLMM quote asset', input.spotQuoteAssetId || ''),
          amount_in: requirePositiveIntegerString('Amount in', input.amountIn),
          min_out: requirePositiveIntegerString('Minimum output', input.slippage)
        }
      };
    }
    case 'Perps': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.perpsEngine);
      const action = input.perpsAction || 'open';
      const position = requireNonEmptyString('Position id', input.perpsPositionId);
      return {
        contractKey,
        contractAddress,
        entrypoint:
          action === 'addCollateral'
            ? 'add_collateral'
            : action === 'removeCollateral'
              ? 'remove_collateral'
              : action === 'closeMarked'
                ? 'close_position_marked'
                : action === 'liquidateMarked'
                  ? 'liquidate_position_marked'
                  : 'open_position',
        payload:
          action === 'addCollateral'
            ? {
                trader: requireNonEmptyString('Authority account', input.authorityAccountId),
                position,
                amount: requirePositiveIntegerString('Collateral amount', input.amountIn)
              }
            : action === 'removeCollateral'
              ? {
                  trader: requireNonEmptyString('Authority account', input.authorityAccountId),
                  position,
                  amount: requirePositiveIntegerString('Collateral amount', input.amountIn)
                }
              : action === 'closeMarked'
                ? {
                    trader: requireNonEmptyString('Authority account', input.authorityAccountId),
                    position,
                    mark_price: requirePositiveIntegerString('Mark price', input.perpsMarkPrice || '')
                  }
                : action === 'liquidateMarked'
                  ? {
                      liquidator: requireNonEmptyString('Authority account', input.authorityAccountId),
                      position,
                      mark_price: requirePositiveIntegerString('Mark price', input.perpsMarkPrice || '')
                    }
                  : (() => {
                      const size = requirePositiveIntegerString('Position size', input.perpsSize);
                      const signedSize = input.perpsDirection === 'Short' ? (-BigInt(size)).toString() : size;
                      return {
                        trader: requireNonEmptyString('Authority account', input.authorityAccountId),
                        position,
                        size: signedSize,
                        collateral: requirePositiveIntegerString('Collateral', input.amountIn)
                      };
                    })()
      };
    }
    case 'Options': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.optionsSeriesManager);
      const action = input.optionsAction || 'buy';
      return {
        contractKey,
        contractAddress,
        entrypoint: action === 'exercise' ? 'exercise' : 'buy_option_sized',
        payload:
          action === 'exercise'
            ? {
                buyer: requireNonEmptyString('Authority account', input.authorityAccountId),
                ticket: requireNonEmptyString('Ticket id', input.optionsTicketId),
                payout: requireNonNegativeIntegerString('Payout', input.optionsPayout || '')
              }
            : {
                buyer: requireNonEmptyString('Authority account', input.authorityAccountId),
                series: requireNonEmptyString('Series id', input.optionsSeriesId),
                ticket: requireNonEmptyString('Ticket id', input.optionsTicketId),
                contracts: requirePositiveIntegerString('Contracts', input.optionsContracts || '1')
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
      hard_cap: requirePositiveIntegerString('Hard cap', input.hardCap)
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
      buyer: requireNonEmptyString('Authority account', input.authorityAccountId),
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
      buyer: requireNonEmptyString('Authority account', input.authorityAccountId),
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
      buyer: requireNonEmptyString('Authority account', input.authorityAccountId),
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
    entrypoint: 'seed_liquidity',
    payload: {
      sale: requireNonEmptyString('Sale id', input.saleId)
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
          user: input.authorityAccountId,
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
          user: input.authorityAccountId,
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
          staker: input.authorityAccountId,
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
          staker: input.authorityAccountId,
          position: input.position
        }
      };
    }
    case 'cover_buy': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'buy_policy_sized',
        payload: {
          buyer: input.authorityAccountId,
          policy: requireNonEmptyString('Policy id', input.policy),
          covered_notional: requirePositiveIntegerString('Covered notional', input.coveredNotional)
        }
      };
    }
    case 'cover_claim': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'settle_claim',
        payload: {
          claimant: input.authorityAccountId,
          policy: requireNonEmptyString('Policy id', input.policy),
          covered_notional: requirePositiveIntegerString('Covered notional', input.coveredNotional)
        }
      };
    }
    case 'cover_cancel': {
      const { contractKey, contractAddress } = resolveContractBinding(ROLE_BY_CONTRACT_KEY.coverPolicyManager);
      return {
        contractKey,
        contractAddress,
        entrypoint: 'cancel_policy',
        payload: {
          buyer: input.authorityAccountId,
          policy: requireNonEmptyString('Policy id', input.policy),
          refund_bps: requireNonNegativeIntegerString('Refund bps', input.refundBps)
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
          owner: input.authorityAccountId,
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
  optionsSeriesManager: 'options.series_manager',
  perpsEngine: 'perps.perps_engine',
  referralRegistry: 'referral.registry',
  spotPool: 'dlmm.dlmm_pool',
  spotRouter: 'dlmm.dlmm_router'
} as const;
