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
    hardCap,
    raised,
    sold,
    claimInventory,
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
    fetchLogicalMap(baseUrl, 'HardCap'),
    fetchLogicalMap(baseUrl, 'Raised'),
    fetchLogicalMap(baseUrl, 'Sold'),
    fetchLogicalMap(baseUrl, 'ClaimInventory'),
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
    hardCap: normalizeNumberLike(hardCap.get(id)),
    raised: normalizeNumberLike(raised.get(id)),
    sold: normalizeNumberLike(sold.get(id)),
    claimInventory: normalizeNumberLike(claimInventory.get(id)),
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
    settlementAsset,
    treasury,
    strikePrice,
    premium,
    expirySlot,
    active,
    ticketsIssued,
    ticketsExercised,
    ticketsVoided,
    collateralInventory,
    collateralReserved
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'UnderlyingAsset'),
    fetchLogicalMap(baseUrl, 'SettlementAsset'),
    fetchLogicalMap(baseUrl, 'Treasury'),
    fetchLogicalMap(baseUrl, 'StrikePrice'),
    fetchLogicalMap(baseUrl, 'Premium'),
    fetchLogicalMap(baseUrl, 'SeriesExpirySlot'),
    fetchLogicalMap(baseUrl, 'SeriesActive'),
    fetchLogicalMap(baseUrl, 'TicketsIssued'),
    fetchLogicalMap(baseUrl, 'TicketsExercised'),
    fetchLogicalMap(baseUrl, 'TicketsVoided'),
    fetchLogicalMap(baseUrl, 'SeriesCollateralInventory'),
    fetchLogicalMap(baseUrl, 'SeriesCollateralReserved')
  ]);

  const series = Array.from(underlyingAsset.keys()).map((id) => ({
    id,
    underlyingAssetId: normalizeStringLike(underlyingAsset.get(id)) || '',
    settlementAssetId: normalizeStringLike(settlementAsset.get(id)) || '',
    treasuryAccountId: normalizeStringLike(treasury.get(id)),
    strikePrice: normalizeNumberLike(strikePrice.get(id)),
    premium: normalizeNumberLike(premium.get(id)),
    expirySlot: normalizeNumberLike(expirySlot.get(id)),
    active: normalizeFlag(active.get(id)),
    ticketsIssued: normalizeNumberLike(ticketsIssued.get(id)),
    ticketsExercised: normalizeNumberLike(ticketsExercised.get(id)),
    ticketsVoided: normalizeNumberLike(ticketsVoided.get(id)),
    collateralInventory: normalizeNumberLike(collateralInventory.get(id)),
    collateralReserved: normalizeNumberLike(collateralReserved.get(id))
  }));

  return sortByKey(series);
};

export const loadOptionTickets = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LiveOptionTicket[]> => {
  const [
    ticketOwner,
    ticketSeries,
    ticketActive,
    ticketPremiumPaid,
    ticketContracts,
    ticketCollateralReserved,
    ticketPayoutPaid
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'TicketOwner'),
    fetchLogicalMap(baseUrl, 'TicketSeries'),
    fetchLogicalMap(baseUrl, 'TicketActive'),
    fetchLogicalMap(baseUrl, 'TicketPremiumPaid'),
    fetchLogicalMap(baseUrl, 'TicketContracts'),
    fetchLogicalMap(baseUrl, 'TicketCollateralReserved'),
    fetchLogicalMap(baseUrl, 'TicketPayoutPaid')
  ]);

  const tickets = Array.from(ticketOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => ({
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
      seriesId: normalizeStringLike(ticketSeries.get(id)) || '',
      active: normalizeFlag(ticketActive.get(id)),
      premiumPaid: normalizeNumberLike(ticketPremiumPaid.get(id)),
      contracts: normalizeNumberLike(ticketContracts.get(id)),
      collateralReserved: normalizeNumberLike(ticketCollateralReserved.get(id)),
      payoutPaid: normalizeNumberLike(ticketPayoutPaid.get(id))
    }));

  return sortByKey(tickets);
};

export const loadPerpsPositions = async (
  baseUrl: string,
  ownerAccountId: string
): Promise<LivePerpsPosition[]> => {
  const [
    positionOwner,
    positionSize,
    positionCollateral,
    entryPrice,
    markPrice,
    indexPrice,
    fundingAccrued,
    realizedPnl,
    liquidated
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'PositionOwner'),
    fetchLogicalMap(baseUrl, 'PositionSize'),
    fetchLogicalMap(baseUrl, 'PositionCollateral'),
    fetchLogicalMap(baseUrl, 'PositionEntryPrice'),
    fetchLogicalMap(baseUrl, 'PositionMarkPrice'),
    fetchLogicalMap(baseUrl, 'PositionIndexPrice'),
    fetchLogicalMap(baseUrl, 'FundingAccrued'),
    fetchLogicalMap(baseUrl, 'RealizedPnl'),
    fetchLogicalMap(baseUrl, 'Liquidated')
  ]);

  const positions = Array.from(positionOwner.entries())
    .filter(([, owner]) => normalizeStringLike(owner) === ownerAccountId)
    .map(([id, owner]) => ({
      id,
      ownerAccountId: normalizeStringLike(owner) || ownerAccountId,
      size: normalizeNumberLike(positionSize.get(id)),
      collateral: normalizeNumberLike(positionCollateral.get(id)),
      entryPrice: normalizeNumberLike(entryPrice.get(id)),
      markPrice: normalizeNumberLike(markPrice.get(id)),
      indexPrice: normalizeNumberLike(indexPrice.get(id)),
      fundingAccrued: normalizeNumberLike(fundingAccrued.get(id)),
      realizedPnl: normalizeNumberLike(realizedPnl.get(id)),
      liquidated: normalizeFlag(liquidated.get(id))
    }));

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
    settlementAsset,
    vaultAccount,
    policyOwner,
    durationSlots,
    payoutBps,
    premium,
    notional,
    premiumPaid,
    breachElapsed,
    claimPayout,
    claimCount,
    active,
    expired
  ] = await Promise.all([
    fetchLogicalMap(baseUrl, 'SettlementAsset'),
    fetchLogicalMap(baseUrl, 'VaultAccount'),
    fetchLogicalMap(baseUrl, 'PolicyOwner'),
    fetchLogicalMap(baseUrl, 'DurationSlots'),
    fetchLogicalMap(baseUrl, 'PayoutBps'),
    fetchLogicalMap(baseUrl, 'Premium'),
    fetchLogicalMap(baseUrl, 'PolicyNotional'),
    fetchLogicalMap(baseUrl, 'PremiumPaid'),
    fetchLogicalMap(baseUrl, 'BreachElapsed'),
    fetchLogicalMap(baseUrl, 'ClaimPayout'),
    fetchLogicalMap(baseUrl, 'ClaimCount'),
    fetchLogicalMap(baseUrl, 'Active'),
    fetchLogicalMap(baseUrl, 'Expired')
  ]);

  const policies = Array.from(settlementAsset.keys()).map((id) => ({
    id,
    settlementAssetId: normalizeStringLike(settlementAsset.get(id)) || '',
    vaultAccountId: normalizeStringLike(vaultAccount.get(id)),
    ownerAccountId: normalizeStringLike(policyOwner.get(id)),
    durationSlots: normalizeNumberLike(durationSlots.get(id)),
    payoutBps: normalizeNumberLike(payoutBps.get(id)),
    premium: normalizeNumberLike(premium.get(id)),
    notional: normalizeNumberLike(notional.get(id)),
    premiumPaid: normalizeNumberLike(premiumPaid.get(id)),
    breachElapsed: normalizeNumberLike(breachElapsed.get(id)),
    claimPayout: normalizeNumberLike(claimPayout.get(id)),
    claimCount: normalizeNumberLike(claimCount.get(id)),
    active: normalizeFlag(active.get(id)),
    expired: normalizeFlag(expired.get(id))
  }));

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
