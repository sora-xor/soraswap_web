import type { ModuleSpec } from '@/types';

export const TOKEN_SYMBOLS = ['XOR', 'N3X', 'USDT', 'USDC', 'KUSD', 'SORA', 'VAL'] as const;
export const TOKEN_ASSET_ALIASES: Partial<Record<(typeof TOKEN_SYMBOLS)[number], string>> = {
  XOR: 'xor#universal',
  N3X: 'n3x#soraswap.universal',
  USDT: 'usdt#soraswap.universal',
  USDC: 'usdc#soraswap.universal',
  KUSD: 'kusd#soraswap.universal'
};

export const DEFAULT_SWAP_TOKENS = {
  pay: 'XOR',
  receive: 'USDT'
} as const;

export const SORASWAP_MODULES: ModuleSpec[] = [
  {
    id: 'n3x',
    label: 'n3x Hub',
    contract: 'contracts/n3x/n3x_hub.ko',
    status: 'adapted',
    summary: 'Basket mint and redeem surface for the renamed stable hub.',
    capability: 'Mint and redeem are gated until live instances are deployed.'
  },
  {
    id: 'dlmm',
    label: 'DLMM Spot',
    contract: 'contracts/dlmm/dlmm_pool.ko',
    status: 'adapted',
    summary: 'Primary AMM venue for Spot routing and liquidity.',
    capability: 'Pool execution is wired; the router remains quote-only until cross-contract routing exists.'
  },
  {
    id: 'perps',
    label: 'Perps Engine',
    contract: 'contracts/perps/perps_engine.ko',
    status: 'adapted',
    summary: 'Collateral, funding, and position lifecycle surface.',
    capability: 'Open-position drafts now target the real engine entrypoint and current on-chain position model.'
  },
  {
    id: 'options',
    label: 'Options Series',
    contract: 'contracts/options/series_manager.ko',
    status: 'adapted',
    summary: 'Series discovery, buy, and exercise workflow.',
    capability: 'Reference pricing is available even when no live contracts are discovered.'
  },
  {
    id: 'farms',
    label: 'Farms',
    contract: 'contracts/farms/farm.ko',
    status: 'adapted',
    summary: 'Stake and reward claims for LP incentives.',
    capability: 'Portfolio surfaces are read-ready once instances are present.'
  },
  {
    id: 'cover',
    label: 'Cover',
    contract: 'contracts/cover/policy_manager.ko',
    status: 'adapted',
    summary: 'Policy issuance, breach flags, and claim lifecycle.',
    capability: 'Read surfaces are present; no public deployment discovered yet.'
  },
  {
    id: 'launchpad',
    label: 'Launchpad',
    contract: 'contracts/launchpad/sale_factory.ko',
    status: 'adapted',
    summary: 'Sale lifecycle and bootstrap surface for new assets.',
    capability: 'Create and contribute drafts target the real init/contribute entrypoints and require explicit sale metadata.'
  },
  {
    id: 'automation',
    label: 'Automation',
    contract: 'contracts/automation/job_queue.ko',
    status: 'adapted',
    summary: 'Job queue and retry semantics for protocol operations.',
    capability: 'Operational readiness depends on queue deployment plus governance hooks.'
  },
  {
    id: 'crosschain',
    label: 'Crosschain',
    contract: 'N/A',
    status: 'blocked',
    summary: 'No Nexus bridge contract is published for a trustable public flow yet.',
    capability: 'The tab remains non-executable by design.'
  }
];
