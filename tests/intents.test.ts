import { describe, expect, test } from 'vitest';
import {
  buildDefiIntent,
  buildLaunchpadContributeIntent,
  buildLaunchpadCreateIntent,
  buildSwapIntent
} from '@/services/intents';
import { resolveContractAddressForRole } from '@/services/registry';

const signedOracle = {
  perpsOracleAttestation: {
    oraclePayload: '0x7b22646f6d61696e223a317d',
    oracleSignature: '0xabcdef12'
  }
};

const signedOptionsOracle = {
  optionsOracleAttestation: {
    oraclePayload: '7B7D',
    oracleSignature: '0XABCD'
  }
};

describe('intent builders', () => {
  test('buildSwapIntent emits router spot payloads', () => {
    const spotRouterContractAddress = resolveContractAddressForRole('spotRouter');
    const intent = buildSwapIntent({
      mode: 'Spot',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      payAssetId: 'xor-id',
      receiveAssetId: 'usdt-id',
      spotBaseAssetId: 'xor-id',
      spotQuoteAssetId: 'usdt-id',
      amountIn: '100',
      slippage: '14',
      perpsDirection: 'Long',
      perpsPositionId: '1',
      perpsSize: '300',
      optionsSeriesId: '1',
      optionsPositionId: '1',
      gate: 'gate'
    });

    expect(intent.contractKey).toBe('dlmm.dlmm_router');
    expect(intent.contractAddress).toBe(spotRouterContractAddress);
    expect(intent.entrypoint).toBe('route_swap');
    expect(intent.payload).toEqual({
      amount_in: '100',
      input_is_base: 1,
      min_out: '14'
    });
  });

  test('buildLaunchpadCreateIntent maps to current init_sale fields', () => {
    const launchpadContractAddress = resolveContractAddressForRole('launchpadSaleFactory');
    const intent = buildLaunchpadCreateIntent({
      saleId: 'sora-index',
      saleAssetId: 'sale-asset-id',
      paymentAssetId: 'xor-id',
      treasuryAccountId: 'i105treasury',
      unitPrice: '1',
      softCap: '1000',
      hardCap: '120000',
      claimStartSlot: '10',
      claimEndSlot: '20',
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
      soft_cap: '1000',
      hard_cap: '120000',
      claim_start_slot: '10',
      claim_end_slot: '20'
    });
  });

  test('buildLaunchpadContributeIntent omits caller identity from authority-bound ABI', () => {
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
      sale: 'sora-index',
      payment_amount: '1000'
    });
  });

  test('buildDefiIntent maps n3x mint and farm claim to authority-bound payloads', () => {
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
      usdt_in: '100',
      usdc_in: '50',
      kusd_in: '25'
    });
    expect(claimIntent.contractKey).toBe('farms.farm');
    expect(claimIntent.contractAddress).toBe(farmContractAddress);
    expect(claimIntent.entrypoint).toBe('claim');
    expect(claimIntent.payload).toEqual({
      position: 'core-lp'
    });
  });

  test('buildSwapIntent maps perps and options to current entrypoints', () => {
    const perpsContractAddress = resolveContractAddressForRole('perpsEngine');
    const optionsContractAddress = resolveContractAddressForRole('optionsFactory');
    const perpsIntent = buildSwapIntent({
      mode: 'Perps',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      amountIn: '250',
      slippage: '0',
      perpsDirection: 'Short',
      perpsAction: 'open',
      perpsMarketId: '1',
      perpsPositionId: '1',
      perpsSize: '750',
      perpsMargin: '250',
      perpsLeverageBps: '10000',
      ...signedOracle,
      optionsSeriesId: '1',
      optionsPositionId: '1',
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
      perpsPositionId: '1',
      perpsSize: '750',
      optionsAction: 'buyShout',
      optionsSeriesId: '2',
      optionsPositionId: '1',
      optionsNotional: '500',
      optionsPremiumPaid: '25',
      optionsCollateralLocked: '100',
      gate: 'gate'
    });

    expect(perpsIntent.contractKey).toBe('perps.perps_engine');
    expect(perpsIntent.contractAddress).toBe(perpsContractAddress);
    expect(perpsIntent.entrypoint).toBe('open_position');
    expect(perpsIntent.payload).toEqual({
      market_id: '1',
      size: '-750',
      margin: '250',
      requested_leverage_bps: '10000',
      oracle_payload: '0x7b22646f6d61696e223a317d',
      oracle_signature: '0xabcdef12'
    });
    expect(optionsIntent.contractKey).toBe('options.factory');
    expect(optionsIntent.contractAddress).toBe(optionsContractAddress);
    expect(optionsIntent.entrypoint).toBe('buy_shout');
    expect(optionsIntent.payload).toEqual({
      series_id: '2',
      notional: '500',
      premium_paid: '25',
      collateral_locked: '100'
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
      perpsAction: 'open',
      perpsMarketId: '1',
      perpsPositionId: '1',
      perpsSize: '123456789012345678901234567890',
      perpsMargin: '250',
      perpsLeverageBps: '10000',
      ...signedOracle,
      optionsSeriesId: '1',
      optionsPositionId: '1',
      gate: 'gate'
    });

    expect(intent.payload).toMatchObject({
      size: '-123456789012345678901234567890',
      margin: '250'
    });
  });

  test('buildSwapIntent sends signed shout oracle bytes when exercising', () => {
    const intent = buildSwapIntent({
      mode: 'Options',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      payToken: 'XOR',
      receiveToken: 'USDT',
      amountIn: '250',
      slippage: '0',
      perpsDirection: 'Long',
      perpsPositionId: '1',
      perpsSize: '750',
      optionsAction: 'exerciseShout',
      optionsSeriesId: '2',
      optionsPositionId: '77',
      ...signedOptionsOracle,
      gate: 'gate'
    });

    expect(intent.entrypoint).toBe('exercise_shout_position');
    expect(intent.payload).toEqual({
      position_id: '77',
      oracle_payload: '0x7b7d',
      oracle_signature: '0xabcd'
    });
  });

  test('buildDefiIntent maps cover register to current on-chain ABI fields', () => {
    const intent = buildDefiIntent({
      kind: 'cover_register',
      authorityAccountId: 'i105authority',
      dataspace: 'universal',
      lowerBound: '9000',
      upperBound: '11000',
      payoutAmount: '1000000',
      monitoringWindowSlots: '100',
      requiredObservations: '3',
      coveredNotional: '10000000',
      premiumPaid: '0',
      gate: 'gate'
    });

    expect(intent.entrypoint).toBe('register_policy');
    expect(intent.payload).toEqual({
      lower_bound: '9000',
      upper_bound: '11000',
      payout_amount: '1000000',
      monitoring_window_slots: '100',
      required_observations: '3',
      covered_notional: '10000000',
      premium_paid: '0'
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
      usdt_in: '100',
      usdc_in: '0',
      kusd_in: '0'
    });
  });
});
