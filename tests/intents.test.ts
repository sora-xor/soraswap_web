import { describe, expect, test } from 'vitest';
import {
  buildDefiIntent,
  buildLaunchpadContributeIntent,
  buildLaunchpadCreateIntent,
  buildSwapIntent
} from '@/services/intents';
import { resolveContractAddressForRole } from '@/services/registry';

describe('intent builders', () => {
  test('buildSwapIntent emits spot pool payloads with live pool fields', () => {
    const spotPoolContractAddress = resolveContractAddressForRole('spotPool');
    const intent = buildSwapIntent({
      mode: 'Spot',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      payAssetId: 'xor-id',
      receiveAssetId: 'usdt-id',
      spotVaultAccountId: 'vault-account',
      spotBaseAssetId: 'xor-id',
      spotQuoteAssetId: 'usdt-id',
      amountIn: '100',
      slippage: '14',
      perpsDirection: 'Long',
      perpsPositionId: 'xor-usdt-main',
      perpsSize: '300',
      optionsSeriesId: 'xor-usdt-apr',
      optionsTicketId: 'ticket-001',
      gate: 'gate'
    });

    expect(intent.contractKey).toBe('dlmm.dlmm_pool');
    expect(intent.contractAddress).toBe(spotPoolContractAddress);
    expect(intent.entrypoint).toBe('swap_exact_in_with_assets');
    expect(intent.payload).toEqual({
      trader: 'i105authority',
      input_asset: 'xor-id',
      vault: 'vault-account',
      base_asset: 'xor-id',
      quote_asset: 'usdt-id',
      amount_in: '100',
      min_out: '14'
    });
  });

  test('buildLaunchpadCreateIntent maps to init_sale fields', () => {
    const launchpadContractAddress = resolveContractAddressForRole('launchpadSaleFactory');
    const intent = buildLaunchpadCreateIntent({
      saleId: 'sora-index',
      saleAssetId: 'sale-asset-id',
      paymentAssetId: 'xor-id',
      treasuryAccountId: 'i105treasury',
      unitPrice: '1',
      hardCap: '120000',
      dataspace: 'universal',
      gate: 'gate'
    });

    expect(intent.contractKey).toBe('launchpad.sale_factory');
    expect(intent.contractAddress).toBe(launchpadContractAddress);
    expect(intent.entrypoint).toBe('init_sale');
    expect(intent.payload).toEqual({
      sale: 'sora-index',
      sale_asset: 'sale-asset-id',
      payment_asset: 'xor-id',
      treasury: 'i105treasury',
      unit_price: '1',
      hard_cap: '120000'
    });
  });

  test('buildLaunchpadContributeIntent emits sale reference payloads', () => {
    const launchpadContractAddress = resolveContractAddressForRole('launchpadSaleFactory');
    const intent = buildLaunchpadContributeIntent({
      authorityAccountId: 'i105authority',
      saleId: 'sora-index',
      paymentAmount: '1000',
      dataspace: 'universal',
      gate: 'gate'
    });

    expect(intent.contractKey).toBe('launchpad.sale_factory');
    expect(intent.contractAddress).toBe(launchpadContractAddress);
    expect(intent.entrypoint).toBe('contribute');
    expect(intent.payload).toEqual({
      buyer: 'i105authority',
      sale: 'sora-index',
      payment_amount: '1000'
    });
  });

  test('buildDefiIntent maps n3x mint and farm claim to their contract payloads', () => {
    const n3xContractAddress = resolveContractAddressForRole('n3xHub');
    const farmContractAddress = resolveContractAddressForRole('farm');
    const mintIntent = buildDefiIntent({
      kind: 'n3x_mint',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      usdtIn: '100',
      usdcIn: '50',
      kusdIn: '25',
      gate: 'gate'
    });
    const claimIntent = buildDefiIntent({
      kind: 'farm_claim',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      position: 'core-lp',
      gate: 'gate'
    });

    expect(mintIntent.contractKey).toBe('n3x.n3x_hub');
    expect(mintIntent.contractAddress).toBe(n3xContractAddress);
    expect(mintIntent.entrypoint).toBe('deposit_and_mint');
    expect(mintIntent.payload).toEqual({
      user: 'i105authority',
      usdt_in: '100',
      usdc_in: '50',
      kusd_in: '25'
    });
    expect(claimIntent.contractKey).toBe('farms.farm');
    expect(claimIntent.contractAddress).toBe(farmContractAddress);
    expect(claimIntent.entrypoint).toBe('claim');
    expect(claimIntent.payload).toEqual({
      staker: 'i105authority',
      position: 'core-lp'
    });
  });

  test('buildSwapIntent maps perps and options to direct entrypoints', () => {
    const perpsContractAddress = resolveContractAddressForRole('perpsEngine');
    const optionsContractAddress = resolveContractAddressForRole('optionsSeriesManager');
    const perpsIntent = buildSwapIntent({
      mode: 'Perps',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      amountIn: '250',
      slippage: '0',
      perpsDirection: 'Short',
      perpsPositionId: 'xor-usdt-main',
      perpsSize: '750',
      optionsSeriesId: 'xor-usdt-apr',
      optionsTicketId: 'ticket-001',
      gate: 'gate'
    });
    const optionsIntent = buildSwapIntent({
      mode: 'Options',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      amountIn: '250',
      slippage: '0',
      perpsDirection: 'Long',
      perpsPositionId: 'xor-usdt-main',
      perpsSize: '750',
      optionsSeriesId: 'xor-usdt-apr',
      optionsTicketId: 'ticket-001',
      optionsContracts: '2',
      gate: 'gate'
    });

    expect(perpsIntent.contractKey).toBe('perps.perps_engine');
    expect(perpsIntent.contractAddress).toBe(perpsContractAddress);
    expect(perpsIntent.entrypoint).toBe('open_position');
    expect(perpsIntent.payload).toEqual({
      trader: 'i105authority',
      position: 'xor-usdt-main',
      size: '-750',
      collateral: '250'
    });
    expect(optionsIntent.contractKey).toBe('options.series_manager');
    expect(optionsIntent.contractAddress).toBe(optionsContractAddress);
    expect(optionsIntent.entrypoint).toBe('buy_option_sized');
    expect(optionsIntent.payload).toEqual({
      buyer: 'i105authority',
      series: 'xor-usdt-apr',
      ticket: 'ticket-001',
      contracts: '2'
    });
  });

  test('buildSwapIntent preserves large short sizes without Number overflow', () => {
    const intent = buildSwapIntent({
      mode: 'Perps',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      amountIn: '250',
      slippage: '0',
      perpsDirection: 'Short',
      perpsPositionId: 'xor-usdt-main',
      perpsSize: '123456789012345678901234567890',
      optionsSeriesId: 'xor-usdt-apr',
      optionsTicketId: 'ticket-001',
      gate: 'gate'
    });

    expect(intent.payload).toMatchObject({
      size: '-123456789012345678901234567890',
      collateral: '250'
    });
  });

  test('buildDefiIntent allows zero on unused n3x stable legs', () => {
    const intent = buildDefiIntent({
      kind: 'n3x_mint',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      usdtIn: '100',
      usdcIn: '0',
      kusdIn: '0',
      gate: 'gate'
    });

    expect(intent.payload).toEqual({
      user: 'i105authority',
      usdt_in: '100',
      usdc_in: '0',
      kusd_in: '0'
    });
  });
});
