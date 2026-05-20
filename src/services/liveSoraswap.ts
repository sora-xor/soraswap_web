import { fetchContractState } from '@/services/contracts';
import type {
  ContractStateEntry,
  LiveAutomationJob,
  LiveCoverPolicy,
  LiveFarmPosition,
  LiveLaunchpadAllocation,
  LiveLaunchpadSale,
  LiveOptionSeries,
  LiveOptionTicket,
  LivePerpsPosition
} from '@/types';

interface LogicalStateEntry {
  key: string;
  value: unknown;
}

const DEFAULT_PREFIX_LIMIT = 1000;

const logicalKeySuffix = (path: string, prefix: string) => {
  const expectedPrefix = `${prefix}/`;
  if (path.startsWith(expectedPrefix)) {
    return path.slice(expectedPrefix.length);
  }
  return null;
};

const normalizeNumberLike = (value: unknown, fallback = '0') => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return fallback;
};

const normalizeStringLike = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const normalizeFlag = (value: unknown) => normalizeNumberLike(value) !== '0';

const sortByKey = <T extends { id: string }>(items: T[]) =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));

const fetchLogicalMapEntries = async (baseUrl: string, prefix: string): Promise<LogicalStateEntry[]> => {
  let offset = 0;
  const entries: LogicalStateEntry[] = [];

  while (true) {
    const response = await fetchContractState(baseUrl, {
      prefix,
      offset,
      limit: DEFAULT_PREFIX_LIMIT,
      include_value: false,
      decode: 'json'
    });

    response.entries.forEach((entry: ContractStateEntry) => {
      const key = logicalKeySuffix(entry.path, prefix);
      if (!key) return;
      entries.push({
        key,
        value: entry.value_json
      });
    });

    if (response.next_offset === undefined || response.next_offset === null) {
      break;
    }
    offset = response.next_offset;
  }

  return entries;
};

const fetchLogicalMap = async (baseUrl: string, prefix: string) =>
  new Map((await fetchLogicalMapEntries(baseUrl, prefix)).map((entry) => [entry.key, entry.value]));

export const loadLaunchpadSales = async (baseUrl: string): Promise<LiveLaunchpadSale[]> => {
  const [
    saleAsset,
    paymentAsset,
    treasury,
    unitPrice,
    softCap,
    hardCap,
    raised,
    sold,
    seedInventory,
    seededPaymentUsed,
    seededSaleUsed,
    claimInventory,
    claimedSupply,
    refundedPayment,
    closed,
    successful,
    seeded,
    claimStartSlot,
    claimEndSlot
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'SaleAsset'),
    fetchLogicalMap(baseUrl, 'PaymentAsset'),
    fetchLogicalMap(baseUrl, 'Treasury'),
    fetchLogicalMap(baseUrl, 'UnitPrice'),
    fetchLogicalMap(baseUrl, 'SoftCap'),
    fetchLogicalMap(baseUrl, 'HardCap'),
    fetchLogicalMap(baseUrl, 'Raised'),
    fetchLogicalMap(baseUrl, 'Sold'),
    fetchLogicalMap(baseUrl, 'SeedInventory'),
    fetchLogicalMap(baseUrl, 'SeedPaymentUsed'),
    fetchLogicalMap(baseUrl, 'SeedSaleUsed'),
    fetchLogicalMap(baseUrl, 'ClaimInventory'),
    fetchLogicalMap(baseUrl, 'ClaimedSupply'),
    fetchLogicalMap(baseUrl, 'RefundedPayment'),
    fetchLogicalMap(baseUrl, 'Closed'),
    fetchLogicalMap(baseUrl, 'Successful'),
    fetchLogicalMap(baseUrl, 'Seeded'),
    fetchLogicalMap(baseUrl, 'ClaimStartSlot'),
    fetchLogicalMap(baseUrl, 'ClaimEndSlot')
  ]);

  const sales = Array.from(saleAsset.keys()).map((id) => ({
    id,
    saleAssetId: normalizeStringLike(saleAsset.get(id)) || '',
    paymentAssetId: normalizeStringLike(paymentAsset.get(id)) || '',
    treasuryAccountId: normalizeStringLike(treasury.get(id)),
    unitPrice: normalizeNumberLike(unitPrice.get(id)),
    softCap: normalizeNumberLike(softCap.get(id)),
    hardCap: normalizeNumberLike(hardCap.get(id)),
    raised: normalizeNumberLike(raised.get(id)),
    sold: normalizeNumberLike(sold.get(id)),
    seedInventory: normalizeNumberLike(seedInventory.get(id)),
    seededPaymentUsed: normalizeNumberLike(seededPaymentUsed.get(id)),
    seededSaleUsed: normalizeNumberLike(seededSaleUsed.get(id)),
    claimInventory: normalizeNumberLike(claimInventory.get(id)),
    claimedSupply: normalizeNumberLike(claimedSupply.get(id)),
    refundedPayment: normalizeNumberLike(refundedPayment.get(id)),
    closed: normalizeFlag(closed.get(id)),
    successful: normalizeFlag(successful.get(id)),
    seeded: normalizeFlag(seeded.get(id)),
    claimStartSlot: normalizeNumberLike(claimStartSlot.get(id)),
    claimEndSlot: normalizeNumberLike(claimEndSlot.get(id))
  }));

  return sortByKey(sales);
};

export const loadLaunchpadAllocations = async (
  baseUrl: string,
  buyerAccountId: string
): Promise<LiveLaunchpadAllocation[]> => {
  const [
    allocationBuyer,
    allocationSale,
    allocationPaymentAmount,
    allocationSaleAmount,
    allocationClaimed,
    allocationRefunded
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'AllocationBuyer'),
    fetchLogicalMap(baseUrl, 'AllocationSale'),
    fetchLogicalMap(baseUrl, 'AllocationPaymentAmount'),
    fetchLogicalMap(baseUrl, 'AllocationSaleAmount'),
    fetchLogicalMap(baseUrl, 'AllocationClaimed'),
    fetchLogicalMap(baseUrl, 'AllocationRefunded')
  ]);

  const allocations = Array.from(allocationBuyer.entries())
    .filter(([, buyer]) => normalizeStringLike(buyer) === buyerAccountId)
    .map(([id, buyer]) => ({
      id,
      saleId: normalizeStringLike(allocationSale.get(id)) || '',
      buyerAccountId: normalizeStringLike(buyer) || buyerAccountId,
      paymentAmount: normalizeNumberLike(allocationPaymentAmount.get(id)),
      saleAmount: normalizeNumberLike(allocationSaleAmount.get(id)),
      claimedAmount: normalizeNumberLike(allocationClaimed.get(id)),
      refunded: normalizeFlag(allocationRefunded.get(id))
    }));

  return sortByKey(allocations);
};

export const loadOptionSeries = async (baseUrl: string): Promise<LiveOptionSeries[]> => {
  const [
    underlyingAsset,
    quoteAsset,
    managerStatus,
    factoryKind,
    maxNotional,
    premiumBps,
    strikeBps,
    collateralMultiplierBps,
    expirySlot,
    openNotional,
    utilisationBps,
    settlementReady
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'OptMgrSeriesUnderlyingAsset'),
    fetchLogicalMap(baseUrl, 'OptMgrSeriesQuoteAsset'),
    fetchLogicalMap(baseUrl, 'OptMgrSeriesStatus'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesKind'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesMaxNotional'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesPremiumBps'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesStrikeBps'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesCollateralMultiplierBps'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesExpirySlot'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesOpenNotional'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesUtilisationBps'),
    fetchLogicalMap(baseUrl, 'OptFactorySeriesSettlementReady')
  ]);

  const seriesIds = new Set([...underlyingAsset.keys(), ...factoryKind.keys()]);
  const series = Array.from(seriesIds).map((id) => {
    const status = normalizeNumberLike(managerStatus.get(id), normalizeFlag(factoryKind.get(id)) ? '1' : '0');
    const active = status === '1';
    const notional = normalizeNumberLike(openNotional.get(id));
    return {
    id,
    underlyingAssetId: normalizeStringLike(underlyingAsset.get(id)) || '',
      settlementAssetId: normalizeStringLike(quoteAsset.get(id)) || '',
      treasuryAccountId: null,
      kind: normalizeNumberLike(factoryKind.get(id)),
      maxNotional: normalizeNumberLike(maxNotional.get(id)),
      openNotional: notional,
      utilisationBps: normalizeNumberLike(utilisationBps.get(id)),
      collateralMultiplierBps: normalizeNumberLike(collateralMultiplierBps.get(id)),
      status,
      settlementReady: normalizeFlag(settlementReady.get(id)),
      strikePrice: normalizeNumberLike(strikeBps.get(id)),
      premium: normalizeNumberLike(premiumBps.get(id)),
    expirySlot: normalizeNumberLike(expirySlot.get(id)),
      active,
      ticketsIssued: notional,
      ticketsExercised: '0',
      ticketsVoided: '0',
      collateralInventory: '0',
      collateralReserved: normalizeNumberLike(openNotional.get(id))
    };
  });

  return sortByKey(series);
};

export const loadOptionTickets = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LiveOptionTicket[]> => {
  const [
    positionOwner,
    positionSeries,
    positionKind,
    positionNotional,
    positionPremiumPaid,
    positionCollateralLocked,
    positionStatus,
    positionRecordedPayout,
    positionSettlementReady
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'OptFactoryPositionOwner'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionSeriesId'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionKind'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionNotional'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionPremiumPaid'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionCollateralLocked'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionStatus'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionRecordedPayout'),
    fetchLogicalMap(baseUrl, 'OptFactoryPositionSettlementReady')
  ]);

  const tickets = Array.from(positionOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => {
      const status = normalizeNumberLike(positionStatus.get(id));
      const notional = normalizeNumberLike(positionNotional.get(id));
      const collateralLocked = normalizeNumberLike(positionCollateralLocked.get(id));
      const recordedPayout = normalizeNumberLike(positionRecordedPayout.get(id));
      return {
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
        seriesId: normalizeNumberLike(positionSeries.get(id)),
        kind: normalizeNumberLike(positionKind.get(id)),
        status,
        active: status === '1',
        premiumPaid: normalizeNumberLike(positionPremiumPaid.get(id)),
        contracts: notional,
        notional,
        collateralReserved: collateralLocked,
        collateralLocked,
        payoutPaid: recordedPayout,
        recordedPayout,
        settlementReady: normalizeFlag(positionSettlementReady.get(id))
      };
    });

  return sortByKey(tickets);
};

export const loadPerpsPositions = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LivePerpsPosition[]> => {
  const [
    positionOwner,
    positionMarketId,
    positionSize,
    positionMargin,
    entryPrice,
    markPrice,
    indexPrice,
    fundingAccrued,
    realizedPnl,
    status,
    activeSlot,
    queuedSlot
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'PerpsPositionOwner'),
    fetchLogicalMap(baseUrl, 'PerpsPositionMarketId'),
    fetchLogicalMap(baseUrl, 'PerpsPositionSize'),
    fetchLogicalMap(baseUrl, 'PerpsPositionMargin'),
    fetchLogicalMap(baseUrl, 'PerpsPositionEntryPrice'),
    fetchLogicalMap(baseUrl, 'PerpsPositionMarkPrice'),
    fetchLogicalMap(baseUrl, 'PerpsPositionIndexPrice'),
    fetchLogicalMap(baseUrl, 'PerpsPositionFundingAccrued'),
    fetchLogicalMap(baseUrl, 'PerpsPositionRealizedPnl'),
    fetchLogicalMap(baseUrl, 'PerpsPositionStatus'),
    fetchLogicalMap(baseUrl, 'PerpsPositionActiveSlot'),
    fetchLogicalMap(baseUrl, 'PerpsPositionQueuedSlot')
  ]);

  const positions = Array.from(positionOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => {
      const margin = normalizeNumberLike(positionMargin.get(id));
      const positionStatus = normalizeNumberLike(status.get(id));
      return {
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
        marketId: normalizeNumberLike(positionMarketId.get(id)),
      size: normalizeNumberLike(positionSize.get(id)),
        collateral: margin,
        margin,
      entryPrice: normalizeNumberLike(entryPrice.get(id)),
      markPrice: normalizeNumberLike(markPrice.get(id)),
      indexPrice: normalizeNumberLike(indexPrice.get(id)),
      fundingAccrued: normalizeNumberLike(fundingAccrued.get(id)),
      realizedPnl: normalizeNumberLike(realizedPnl.get(id)),
        status: positionStatus,
        activeSlot: normalizeNumberLike(activeSlot.get(id)),
        queuedSlot: normalizeNumberLike(queuedSlot.get(id)),
        liquidated: positionStatus === '4'
      };
    });

  return sortByKey(positions);
};

export const loadFarmPositions = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LiveFarmPosition[]> => {
  const [positionOwner, stakeOf, accrued, claimed] = await Promise.all([
    fetchLogicalMap(baseUrl, 'PositionOwner'),
    fetchLogicalMap(baseUrl, 'StakeOf'),
    fetchLogicalMap(baseUrl, 'Accrued'),
    fetchLogicalMap(baseUrl, 'PositionClaimed')
  ]);

  const positions = Array.from(positionOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => ({
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
      stakeAmount: normalizeNumberLike(stakeOf.get(id)),
      accruedRewards: normalizeNumberLike(accrued.get(id)),
      claimedRewards: normalizeNumberLike(claimed.get(id))
    }));

  return sortByKey(positions);
};

export const loadCoverPolicies = async (baseUrl: string): Promise<LiveCoverPolicy[]> => {
  const [
    policyOwner,
    lowerBound,
    upperBound,
    payoutAmount,
    monitoringWindowSlots,
    requiredObservations,
    coveredNotional,
    premiumPaid,
    status,
    registrationSlot,
    breachElapsed,
    observationCount,
    lastObservationSlot,
    lastObservedPrice,
    claimPayout,
    claimCount
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'CoverPolicyOwner'),
    fetchLogicalMap(baseUrl, 'CoverPolicyLowerBound'),
    fetchLogicalMap(baseUrl, 'CoverPolicyUpperBound'),
    fetchLogicalMap(baseUrl, 'CoverPolicyPayoutAmount'),
    fetchLogicalMap(baseUrl, 'CoverPolicyMonitoringWindowSlots'),
    fetchLogicalMap(baseUrl, 'CoverPolicyRequiredObservations'),
    fetchLogicalMap(baseUrl, 'CoverPolicyCoveredNotional'),
    fetchLogicalMap(baseUrl, 'CoverPolicyPremiumPaid'),
    fetchLogicalMap(baseUrl, 'CoverPolicyStatus'),
    fetchLogicalMap(baseUrl, 'CoverPolicyRegistrationSlot'),
    fetchLogicalMap(baseUrl, 'CoverPolicyBreachElapsedSlots'),
    fetchLogicalMap(baseUrl, 'CoverPolicyObservationCount'),
    fetchLogicalMap(baseUrl, 'CoverPolicyLastObservationSlot'),
    fetchLogicalMap(baseUrl, 'CoverPolicyLastObservedPrice'),
    fetchLogicalMap(baseUrl, 'CoverPolicyClaimPayout'),
    fetchLogicalMap(baseUrl, 'CoverPolicyClaimCount')
  ]);

  const policies = Array.from(policyOwner.keys()).map((id) => {
    const policyStatus = normalizeNumberLike(status.get(id));
    const covered = normalizeNumberLike(coveredNotional.get(id));
    const monitoringWindow = normalizeNumberLike(monitoringWindowSlots.get(id));
    const payout = normalizeNumberLike(payoutAmount.get(id));
    const premium = normalizeNumberLike(premiumPaid.get(id));
    return {
    id,
      settlementAssetId: '',
      vaultAccountId: null,
    ownerAccountId: normalizeStringLike(policyOwner.get(id)),
      lowerBound: normalizeNumberLike(lowerBound.get(id)),
      upperBound: normalizeNumberLike(upperBound.get(id)),
      payoutAmount: payout,
      durationSlots: monitoringWindow,
      monitoringWindowSlots: monitoringWindow,
      requiredObservations: normalizeNumberLike(requiredObservations.get(id)),
      payoutBps: '0',
      premium,
      notional: covered,
      coveredNotional: covered,
      premiumPaid: premium,
      registrationSlot: normalizeNumberLike(registrationSlot.get(id)),
    breachElapsed: normalizeNumberLike(breachElapsed.get(id)),
      observationCount: normalizeNumberLike(observationCount.get(id)),
      lastObservationSlot: normalizeNumberLike(lastObservationSlot.get(id)),
      lastObservedPrice: normalizeNumberLike(lastObservedPrice.get(id)),
    claimPayout: normalizeNumberLike(claimPayout.get(id)),
    claimCount: normalizeNumberLike(claimCount.get(id)),
      status: policyStatus,
      active: policyStatus === '1' || policyStatus === '2' || policyStatus === '3',
      expired: policyStatus === '5'
    };
  });

  return sortByKey(policies);
};

export const loadOwnedCoverPolicies = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LiveCoverPolicy[]> => {
  const policies = await loadCoverPolicies(baseUrl);
  return policies.filter((policy) => policy.ownerAccountId === ownerAccountId);
};

export const loadAutomationJobs = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LiveAutomationJob[]> => {
  const [
    jobOwner,
    jobExecutor,
    payloadHash,
    status,
    retryCount,
    nextSlot,
    cronIntervalSlots,
    maxRetries,
    retryDelaySlots,
    lastRunSlot,
    runCount
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'JobOwner'),
    fetchLogicalMap(baseUrl, 'JobExecutor'),
    fetchLogicalMap(baseUrl, 'JobPayloadHash'),
    fetchLogicalMap(baseUrl, 'JobStatus'),
    fetchLogicalMap(baseUrl, 'RetryCount'),
    fetchLogicalMap(baseUrl, 'JobNextSlot'),
    fetchLogicalMap(baseUrl, 'JobCronIntervalSlots'),
    fetchLogicalMap(baseUrl, 'JobMaxRetries'),
    fetchLogicalMap(baseUrl, 'JobRetryDelaySlots'),
    fetchLogicalMap(baseUrl, 'JobLastRunSlot'),
    fetchLogicalMap(baseUrl, 'JobRunCount')
  ]);

  const jobs = Array.from(jobOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => ({
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
      executorAccountId: normalizeStringLike(jobExecutor.get(id)),
      payloadHash: normalizeNumberLike(payloadHash.get(id)),
      status: normalizeNumberLike(status.get(id)),
      retryCount: normalizeNumberLike(retryCount.get(id)),
      nextSlot: normalizeNumberLike(nextSlot.get(id)),
      cronIntervalSlots: normalizeNumberLike(cronIntervalSlots.get(id)),
      maxRetries: normalizeNumberLike(maxRetries.get(id)),
      retryDelaySlots: normalizeNumberLike(retryDelaySlots.get(id)),
      lastRunSlot: normalizeNumberLike(lastRunSlot.get(id)),
      runCount: normalizeNumberLike(runCount.get(id))
    }));

  return sortByKey(jobs);
};
