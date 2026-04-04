import { describe, expect, test } from 'vitest';
import {
  getModuleContractAddresses,
  getRegistryEntry,
  getRegistrySourceLabel,
  normalizeHashHex,
  resolveContractAddressForRole,
  summarizeRegistryCoverage
} from '@/services/registry';

describe('registry helpers', () => {
  test('normalizeHashHex trims manifest prefixes and suffixes', () => {
    expect(normalizeHashHex('hash:B2EA5D38C9A83904#2948')).toBe('b2ea5d38c9a83904');
    expect(normalizeHashHex('B2EA5D38')).toBe('b2ea5d38');
  });

  test('role resolution and module grouping are backed by the generated registry', () => {
    const spotPool = getRegistryEntry('dlmm.dlmm_pool');
    const spotRouter = getRegistryEntry('dlmm.dlmm_router');
    const n3xHub = getRegistryEntry('n3x.n3x_hub');

    expect(spotPool?.contractKey).toBe('dlmm.dlmm_pool');
    expect(resolveContractAddressForRole('spotRouter')).toBe(spotRouter?.contractAddress || null);
    expect(getModuleContractAddresses('dlmm')).toEqual(
      [spotPool?.contractAddress, spotRouter?.contractAddress].filter(Boolean)
    );
    expect(n3xHub?.contractKey).toBe('n3x.n3x_hub');
    expect(n3xHub?.entrypoints).toContain('main');
    expect(getRegistrySourceLabel()).toMatch(/testnet|local|compiled fallback/);
  });

  test('registry coverage tracks only deploy-address-backed contracts', () => {
    const n3xHub = getRegistryEntry('n3x.n3x_hub');
    const spotRouter = getRegistryEntry('dlmm.dlmm_router');
    const launchpad = getRegistryEntry('launchpad.sale_factory');
    const deployable = [n3xHub, spotRouter, launchpad].filter(
      (entry): entry is NonNullable<typeof entry> & { contractAddress: string } => Boolean(entry?.contractAddress)
    );

    const discovered = deployable.slice(0, 2);
    const coverage = summarizeRegistryCoverage(
      discovered.map((entry) => ({
        contract_id: entry.contractAddress,
        code_hash_hex: entry.codeHashHex
      }))
    );

    expect(coverage.expectedTotal).toBeGreaterThanOrEqual(discovered.length);
    expect(coverage.discoveredTotal).toBe(discovered.length);
    expect(coverage.verifiedTotal).toBe(discovered.length);

    if (deployable.length > discovered.length) {
      expect(coverage.missingContractAddresses).toContain(deployable[discovered.length].contractAddress);
    } else {
      expect(coverage.missingContractAddresses).toEqual([]);
    }
  });
});
