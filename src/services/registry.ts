import { generatedSoraswapRegistry } from '@/generated/soraswapRegistry';
import type {
  ContractInstance,
  ModuleRegistrySummary,
  RegistryCoverageSummary,
  SoraswapRegistryEntry
} from '@/types';

export type ContractRole =
  | 'automationQueue'
  | 'coverPolicyManager'
  | 'farm'
  | 'launchpadSaleFactory'
  | 'n3xHub'
  | 'optionsSeriesManager'
  | 'perpsEngine'
  | 'referralRegistry'
  | 'spotPool'
  | 'spotRouter';

const ROLE_FALLBACKS: Record<ContractRole, string> = {
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
};

const MODULE_ROLE_MAP: Record<string, ContractRole[]> = {
  automation: ['automationQueue'],
  cover: ['coverPolicyManager'],
  crosschain: [],
  dlmm: ['spotPool', 'spotRouter'],
  farms: ['farm'],
  launchpad: ['launchpadSaleFactory'],
  n3x: ['n3xHub'],
  options: ['optionsSeriesManager'],
  perps: ['perpsEngine'],
  referral: ['referralRegistry']
};

const registryEntries = generatedSoraswapRegistry.contracts;
const registryByContractKey = new Map(registryEntries.map((entry) => [entry.contractKey, entry]));
const registryByContractAddress = new Map(
  registryEntries
    .filter((entry): entry is SoraswapRegistryEntry & { contractAddress: string } => Boolean(entry.contractAddress))
    .map((entry) => [entry.contractAddress, entry])
);
const deployableEntries = registryEntries.filter(
  (entry): entry is SoraswapRegistryEntry & { contractAddress: string } => Boolean(entry.contractAddress)
);

export const normalizeHashHex = (value: string | null | undefined) =>
  value ? value.replace(/^hash:/i, '').replace(/#.*$/, '').toLowerCase() : null;

export const getSoraswapRegistry = () => generatedSoraswapRegistry;

export const getRegistrySourceLabel = () =>
  generatedSoraswapRegistry.sourceEnv === 'compiled'
    ? 'compiled fallback'
    : generatedSoraswapRegistry.sourceEnv;

export const getRegistryEntry = (contractAddressOrKey: string) =>
  registryByContractAddress.get(contractAddressOrKey) ||
  registryByContractKey.get(contractAddressOrKey) ||
  null;

export const resolveContractAddressForRole = (role: ContractRole) => {
  const fallback = ROLE_FALLBACKS[role];
  return registryByContractKey.get(fallback)?.contractAddress || null;
};

export const getModuleContractAddresses = (moduleId: string) =>
  (MODULE_ROLE_MAP[moduleId] || [])
    .map((role) => resolveContractAddressForRole(role))
    .filter((value): value is string => Boolean(value));

export const findRuntimeContract = (
  instances: ContractInstance[] | null | undefined,
  contractAddress: string
) => (instances || []).find((item) => item.contract_id === contractAddress) || null;

export const isRegistryRuntimeHashMatch = (
  entry: SoraswapRegistryEntry | null,
  runtime: ContractInstance | null
) => {
  if (!entry || !runtime?.code_hash_hex) return null;
  return normalizeHashHex(entry.codeHashHex) === normalizeHashHex(runtime.code_hash_hex);
};

export const summarizeRegistryCoverage = (
  instances: ContractInstance[] | null | undefined
): RegistryCoverageSummary => {
  const discovered = deployableEntries.filter((entry) => findRuntimeContract(instances, entry.contractAddress));
  const verified = discovered.filter((entry) =>
    isRegistryRuntimeHashMatch(entry, findRuntimeContract(instances, entry.contractAddress))
  );
  const discoveredAddresses = new Set(discovered.map((entry) => entry.contractAddress));
  return {
    expectedTotal: deployableEntries.length,
    discoveredTotal: discovered.length,
    verifiedTotal: verified.length,
    missingContractAddresses: deployableEntries
      .map((entry) => entry.contractAddress)
      .filter((contractAddress) => !discoveredAddresses.has(contractAddress))
  };
};

export const summarizeModuleRegistryCoverage = (
  moduleId: string,
  instances: ContractInstance[] | null | undefined
): ModuleRegistrySummary => {
  const contractAddresses = getModuleContractAddresses(moduleId);
  const expectedEntries = contractAddresses
    .map((contractAddress) => getRegistryEntry(contractAddress))
    .filter((entry): entry is SoraswapRegistryEntry => Boolean(entry));
  const discoveredEntries = expectedEntries.filter(
    (entry) => entry.contractAddress && findRuntimeContract(instances, entry.contractAddress)
  );
  const verifiedEntries = discoveredEntries.filter((entry) =>
    entry.contractAddress
      ? isRegistryRuntimeHashMatch(entry, findRuntimeContract(instances, entry.contractAddress))
      : false
  );
  return {
    moduleId,
    expectedTotal: expectedEntries.length,
    discoveredTotal: discoveredEntries.length,
    verifiedTotal: verifiedEntries.length
  };
};
