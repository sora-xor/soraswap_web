export type ViewType = 'wallet' | 'defi' | 'swap' | 'launchpad' | 'crosschain' | 'more';
export type TradeMode = 'Spot' | 'Perps' | 'Options';
export type ThemeMode = 'night' | 'paper';
export type LaunchpadMode = 'list' | 'create' | 'detail';
export type ModuleStatus = 'blocked' | 'adapted' | 'ported' | 'reference-only';
export type RuntimePresetId = 'taira' | 'local';
export type BridgeProofKind = 'burn' | 'governance';
export type BridgeLookupKind = BridgeProofKind | 'finality';

export interface AppRuntimeConfig {
  toriiUrl: string;
  dataspace: string;
  connectChainId: string;
  connectAppName: string;
  connectAppUrl: string;
  refreshMs: number;
}

export interface RuntimePreset {
  id: RuntimePresetId;
  label: string;
  description: string;
  config: Pick<AppRuntimeConfig, 'toriiUrl' | 'dataspace' | 'connectChainId'>;
}

export interface RouteState {
  view: ViewType;
  swapFrom?: string;
  swapTo?: string;
  launchpadMode?: LaunchpadMode;
  launchpadId?: string;
}

export interface BridgeDomainDescriptor {
  id: number;
  key: string;
  label: string;
  family: string;
  direction: 'remote' | 'local';
  shortLabel: string;
}

export interface BridgeLookupRecord {
  kind: BridgeLookupKind;
  value: string;
  label: string;
  subtitle: string;
  success: boolean;
  lookedUpAt: number;
}

export interface BridgeSavedDestination {
  domainId: number;
  label: string;
  recipient: string;
  updatedAt: number;
}

export interface BridgeFinalityProofBlockHeader {
  height: number;
  prev_block_hash: string | null;
  merkle_root: string;
  result_merkle_root: string;
  da_proof_policies_hash: string | null;
  da_commitments_hash: string | null;
  da_pin_intents_hash: string | null;
  prev_roster_evidence_hash: string | null;
  sccp_commitment_root: string | null;
  creation_time_ms: number;
  view_change_index: number;
  confidential_features?: {
    vk_set_hash: string | null;
    poseidon_params_id: string | null;
    pedersen_params_id: string | null;
    conf_rules_version: number;
  };
}

export interface BridgeFinalityProofCommitQc {
  phase: {
    phase: string;
    detail: string | null;
  };
  subject_block_hash: string;
  parent_state_root: string;
  post_state_root: string;
  height: number;
  view: number;
  epoch: number;
  mode_tag: string;
  validator_set_hash: string;
  validator_set_hash_version: number;
  validator_set: string[];
  aggregate: {
    signers_bitmap: number[];
    bls_aggregate_signature: number[];
  };
}

export interface BridgeFinalityProofResponse {
  height: number;
  chain_id: string;
  block_header: BridgeFinalityProofBlockHeader;
  block_hash: string;
  commit_qc: BridgeFinalityProofCommitQc;
  validator_set_pops: number[][];
}

export interface BridgeFinalityBundleResponse {
  commitment: {
    chain_id: string;
    authority_set: {
      id: number;
      validator_set: string[];
      validator_set_hash: string;
      validator_set_hash_version: number;
    };
    block_height: number;
    block_hash: string;
    mmr_root: string;
    mmr_leaf_index: number;
    mmr_peaks: string[];
    next_authority_set: unknown | null;
  };
  justification: {
    signatures: unknown[];
  };
  block_header: BridgeFinalityProofBlockHeader;
  commit_qc: BridgeFinalityProofCommitQc;
}

export interface SccpHubCommitmentResponse {
  version: number;
  kind: 'Burn' | 'TokenAdd' | 'TokenPause' | 'TokenResume';
  target_domain: number;
  message_id: string;
  payload_hash: string;
  parliament_certificate_hash: string | null;
}

export interface SccpMerkleStepResponse {
  sibling_hash: string;
  sibling_is_left: boolean;
}

export interface SccpMerkleProofResponse {
  steps: SccpMerkleStepResponse[];
}

export interface SccpBurnPayloadResponse {
  version: number;
  source_domain: number;
  dest_domain: number;
  nonce: string | number;
  sora_asset_id: string;
  amount: string | number;
  recipient: string;
}

export interface SccpTokenAddPayloadResponse {
  version: number;
  target_domain: number;
  nonce: string | number;
  sora_asset_id: string;
  decimals: number;
  name: string;
  symbol: string;
}

export interface SccpTokenControlPayloadResponse {
  version: number;
  target_domain: number;
  nonce: string | number;
  sora_asset_id: string;
}

export type SccpGovernancePayloadResponse =
  | { Add: SccpTokenAddPayloadResponse }
  | { Pause: SccpTokenControlPayloadResponse }
  | { Resume: SccpTokenControlPayloadResponse };

export interface SccpBurnProofResponse {
  version: number;
  commitment_root: string;
  commitment: SccpHubCommitmentResponse;
  merkle_proof: SccpMerkleProofResponse;
  payload: SccpBurnPayloadResponse;
  finality_proof: string;
}

export interface SccpGovernanceProofResponse {
  version: number;
  commitment_root: string;
  commitment: SccpHubCommitmentResponse;
  merkle_proof: SccpMerkleProofResponse;
  payload: SccpGovernancePayloadResponse;
  parliament_certificate: string;
  finality_proof: string;
}

export interface BridgeProofSubmitRequest {
  authority: string;
  public_key_hex?: string;
  signature_b64?: string;
  burn_bundle?: SccpBurnProofResponse;
  governance_bundle?: SccpGovernanceProofResponse;
  creation_time_ms?: number;
}

export interface ContractInstance {
  contract_id: string;
  code_hash_hex?: string;
  contract_name?: string;
}

export type RegistrySourceEnv = 'testnet' | 'local' | 'compiled';

export interface SoraswapRegistryEntry {
  moduleId: string;
  contractKey: string;
  contractAddress?: string;
  codeHashHex: string;
  abiHashHex: string;
  dataspace?: string;
  entrypoints: string[];
  sourcePath: string;
}

export interface SoraswapContractRegistry {
  sourceEnv: RegistrySourceEnv;
  generatedAt: string;
  sourceRoot: string;
  contracts: SoraswapRegistryEntry[];
}

export interface RegistryCoverageSummary {
  expectedTotal: number;
  discoveredTotal: number;
  verifiedTotal: number;
  missingContractAddresses: string[];
}

export interface ModuleRegistrySummary {
  moduleId: string;
  expectedTotal: number;
  discoveredTotal: number;
  verifiedTotal: number;
}

export interface ContractInstancesResponse {
  dataspace: string;
  instances: ContractInstance[];
  total: number;
  offset: number;
  limit: number;
}

export interface ConnectStatus {
  enabled: boolean;
  sessions_total: number;
  sessions_active: number;
  buffered_sessions?: number;
  total_buffer_bytes?: number;
  policy?: Record<string, unknown>;
}

export interface NodeCapabilities {
  abi_version?: number;
  data_model_version?: number;
  crypto?: Record<string, unknown>;
}

export interface ApiVersions {
  supported_versions?: string[];
  default_version?: string;
  current_version?: string;
}

export interface AccountAssetItem {
  asset_id: string;
  quantity: string;
}

export interface AccountAssetPage {
  items: AccountAssetItem[];
  total: number;
}

export interface AccountTransactionItem {
  authority?: string;
  entrypoint_hash: string;
  result_ok: boolean;
  timestamp_ms?: number;
}

export interface AccountTransactionPage {
  items: AccountTransactionItem[];
  total: number;
}

export interface RuntimeSnapshot {
  versions: ApiVersions | null;
  connectStatus: ConnectStatus | null;
  capabilities: NodeCapabilities | null;
  contracts: ContractInstancesResponse | null;
  lastUpdatedAt: number | null;
}

export interface WatchAccountState {
  accountId: string | null;
  assets: AccountAssetItem[];
  transactions: AccountTransactionItem[];
  loading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
}

export interface ConnectPreview {
  sid: string;
  sidBytesHex: string;
  nonceHex: string;
  privateKeyHex: string;
  publicKeyHex: string;
  walletUri: string;
  appUri: string;
  wsUrl: string;
  createdAt: number;
}

export interface ConnectSessionResponse {
  sid: string;
  wallet_uri: string;
  app_uri: string;
  token_app: string;
  token_wallet: string;
  extra?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export type ConnectDirection = 'app_to_wallet' | 'wallet_to_app';
export type ConnectSocketState = 'closed' | 'opening' | 'open';
export type ConnectLivePhase =
  | 'idle'
  | 'registered'
  | 'opening'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'error';

export interface ConnectPermissions {
  methods: string[];
  events: string[];
  resources: string[] | null;
}

export interface ConnectSignInProof {
  domain: string;
  uri: string;
  statement: string;
  issuedAt: string;
  nonce: string;
}

export interface ConnectWalletSignature {
  algorithmCode: number;
  algorithmLabel: string;
  signatureHex: string;
  signatureBase64: string;
}

export interface ConnectEncryptedClosePayload {
  type: 'control_close';
  who: 'app' | 'wallet';
  code: number;
  reason: string;
  retryable: boolean;
}

export interface ConnectEncryptedRejectPayload {
  type: 'control_reject';
  code: number;
  codeId: string;
  reason: string;
}

export interface ConnectSignRequestRawPayload {
  type: 'sign_request_raw';
  domainTag: string;
  bytesHex: string;
  bytesBase64: string;
  bytesLength: number;
}

export interface ConnectSignRequestTxPayload {
  type: 'sign_request_tx';
  txBytesHex: string;
  txBytesBase64: string;
  txBytesLength: number;
}

export interface ConnectSignResultOkPayload {
  type: 'sign_result_ok';
  signature: ConnectWalletSignature;
}

export interface ConnectSignResultErrPayload {
  type: 'sign_result_err';
  code: string;
  message: string;
}

export interface ConnectDisplayRequestPayload {
  type: 'display_request';
  title: string;
  body: string;
}

export type ConnectEnvelopePayload =
  | ConnectEncryptedClosePayload
  | ConnectEncryptedRejectPayload
  | ConnectSignRequestRawPayload
  | ConnectSignRequestTxPayload
  | ConnectSignResultOkPayload
  | ConnectSignResultErrPayload
  | ConnectDisplayRequestPayload;

export interface ConnectEnvelopeSummary {
  seq: number;
  payload: ConnectEnvelopePayload;
}

export interface ConnectApproveControl {
  type: 'approve';
  walletPublicKeyHex: string;
  accountId: string;
  permissions: ConnectPermissions | null;
  proof: ConnectSignInProof | null;
  signature: ConnectWalletSignature;
}

export interface ConnectRejectControl {
  type: 'reject';
  code: number;
  codeId: string;
  reason: string;
}

export interface ConnectCloseControl {
  type: 'close';
  who: 'app' | 'wallet';
  code: number;
  reason: string;
  retryable: boolean;
}

export interface ConnectPingControl {
  type: 'ping' | 'pong';
  nonce: number;
}

export interface ConnectServerEventControl {
  type: 'server_event';
  eventName: string;
  payload: Record<string, unknown>;
}

export interface ConnectOpenControl {
  type: 'open';
  appPublicKeyHex: string;
  constraints: {
    chainId: string;
  };
  appMeta: {
    name: string;
    url: string | null;
    iconHash: string | null;
  } | null;
  permissions: ConnectPermissions | null;
}

export type ConnectControlPayload =
  | ConnectApproveControl
  | ConnectRejectControl
  | ConnectCloseControl
  | ConnectPingControl
  | ConnectServerEventControl
  | ConnectOpenControl;

export interface ConnectFrameSummary {
  sid: string;
  sidHex: string;
  direction: ConnectDirection;
  seq: number;
  kind: 'control' | 'ciphertext';
  control: ConnectControlPayload | null;
  ciphertext: {
    direction: ConnectDirection;
    aeadHex: string;
    aeadLength: number;
  } | null;
}

export interface LiveConnectState {
  phase: ConnectLivePhase;
  socketState: ConnectSocketState;
  sessionId: string | null;
  approvedAccountId: string | null;
  walletPublicKeyHex: string | null;
  openSent: boolean;
  pendingRequest: boolean;
  approvalVerified: boolean | null;
  lastFrame: ConnectFrameSummary | null;
  lastEnvelope: ConnectEnvelopeSummary | null;
  lastError: string | null;
  lastUpdatedAt: number | null;
}

export interface ModuleSpec {
  id: string;
  label: string;
  contract: string;
  status: ModuleStatus;
  summary: string;
  capability: string;
}

export interface ContractCallDraftRequest {
  authority: string;
  contract_address: string;
  entrypoint?: string;
  payload?: Record<string, unknown> | null;
  creation_time_ms?: number;
  gas_limit: number;
  public_key_hex?: string;
  signature_b64?: string;
}

export interface ContractViewRequest {
  authority: string;
  contract_address: string;
  entrypoint?: string;
  payload?: Record<string, unknown> | null;
  gas_limit: number;
}

export interface ContractStateQuery {
  path?: string;
  paths?: string;
  prefix?: string;
  include_value?: boolean;
  offset?: number;
  limit?: number;
  decode?: 'json';
}

export interface ContractCallResponse {
  ok: boolean;
  submitted: boolean;
  dataspace: string;
  contract_id: string;
  contract_address?: string | null;
  code_hash_hex: string;
  abi_hash_hex: string;
  creation_time_ms: number;
  tx_hash_hex?: string | null;
  transaction_scaffold_b64?: string | null;
  signed_transaction_b64?: string | null;
  signing_message_b64?: string | null;
  entrypoint?: string | null;
}

export interface DetachedSignablePayload {
  transaction_scaffold_b64?: string | null;
  signed_transaction_b64?: string | null;
  signing_message_b64?: string | null;
}

export interface BridgeProofSubmitResponse extends DetachedSignablePayload {
  ok: boolean;
  submitted: boolean;
  proof_kind: BridgeProofKind;
  backend: string;
  manifest_hash_hex: string;
  range_start_height: number;
  range_end_height: number;
  creation_time_ms: number;
  tx_hash_hex?: string | null;
}

export interface ContractViewResponse {
  ok: boolean;
  dataspace: string;
  contract_id: string;
  contract_address?: string | null;
  code_hash_hex: string;
  abi_hash_hex: string;
  entrypoint: string;
  result: unknown;
}

export interface ContractStateEntry {
  path: string;
  found: boolean;
  value_b64?: string | null;
  value_len?: number | null;
  value_json?: unknown;
  decode_error?: string | null;
}

export interface ContractStateResponse {
  path?: string | null;
  paths?: string[] | null;
  prefix?: string | null;
  entries: ContractStateEntry[];
  offset: number;
  limit: number;
  next_offset?: number | null;
}

export interface ExplorerMetrics {
  peers: number;
  domains: number;
  accounts: number;
  assets: number;
  transactionsAccepted: number;
  transactionsRejected: number;
  blockHeight: number;
  blockCreatedAt: string | null;
  finalizedBlockHeight: number;
  averageCommitTimeMs: number | null;
  averageBlockTimeMs: number | null;
}

export interface DlmmPoolConfig {
  baseAssetId: string;
  quoteAssetId: string;
  vaultAccountId: string;
  feePips: number;
  binStep: number;
  activeBin: number;
}

export interface DlmmMirrorState {
  poolInitialized: boolean;
  activeBin: number;
  feePips: number;
  binStep: number;
  reserveBase: string;
  reserveQuote: string;
  totalReserves: string;
  binShareSupply: string;
  impactCapBps: string;
  minReserveBase: string;
  minReserveQuote: string;
  maxBinsPerSwap: string;
  binLiquidityCap: string;
}

export interface FarmConfig {
  stakeAssetId: string;
  rewardAssetId: string;
  treasuryAccountId: string;
  rewardRate: number;
}

export interface LiveLaunchpadSale {
  id: string;
  saleAssetId: string;
  paymentAssetId: string;
  treasuryAccountId: string | null;
  unitPrice: string;
  hardCap: string;
  raised: string;
  sold: string;
  claimInventory: string;
  closed: boolean;
  successful: boolean;
  seeded: boolean;
  claimStartSlot: string;
  claimEndSlot: string;
}

export interface LiveLaunchpadAllocation {
  id: string;
  saleId: string;
  buyerAccountId: string;
  paymentAmount: string;
  saleAmount: string;
  claimedAmount: string;
  refunded: boolean;
}

export interface LiveOptionSeries {
  id: string;
  underlyingAssetId: string;
  settlementAssetId: string;
  treasuryAccountId: string | null;
  strikePrice: string;
  premium: string;
  expirySlot: string;
  active: boolean;
  ticketsIssued: string;
  ticketsExercised: string;
  ticketsVoided: string;
  collateralInventory: string;
  collateralReserved: string;
}

export interface LiveOptionTicket {
  id: string;
  ownerAccountId: string;
  seriesId: string;
  active: boolean;
  premiumPaid: string;
  contracts: string;
  collateralReserved: string;
  payoutPaid: string;
}

export interface LivePerpsPosition {
  id: string;
  ownerAccountId: string;
  size: string;
  collateral: string;
  entryPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingAccrued: string;
  realizedPnl: string;
  liquidated: boolean;
}

export interface LiveFarmPosition {
  id: string;
  ownerAccountId: string;
  stakeAmount: string;
  accruedRewards: string;
  claimedRewards: string;
}

export interface LiveCoverPolicy {
  id: string;
  settlementAssetId: string;
  vaultAccountId: string | null;
  ownerAccountId: string | null;
  durationSlots: string;
  payoutBps: string;
  premium: string;
  notional: string;
  premiumPaid: string;
  breachElapsed: string;
  claimPayout: string;
  claimCount: string;
  active: boolean;
  expired: boolean;
}

export interface LiveAutomationJob {
  id: string;
  ownerAccountId: string;
  executorAccountId: string | null;
  payloadHash: string;
  status: string;
  retryCount: string;
  nextSlot: string;
  cronIntervalSlots: string;
  maxRetries: string;
  retryDelaySlots: string;
  lastRunSlot: string;
  runCount: string;
}

export interface AssetAliasResolveResponse {
  alias: string;
  asset_definition_id: string;
  asset_name: string;
  alias_binding?: Record<string, unknown>;
  source?: string;
}

export interface AssetNumericSpec {
  scale: number | null;
}

export interface AssetDefinitionResponse {
  id: string;
  name?: string;
  description?: string | null;
  alias?: string;
  spec: AssetNumericSpec;
  mintable?: string;
  logo?: string | null;
  metadata?: Record<string, unknown>;
  owned_by?: string;
  total_quantity?: string;
  alias_binding?: Record<string, unknown>;
}

export type PipelineStatusScope = 'local' | 'auto' | 'global';
export type PipelineTransactionKind = 'Queued' | 'Approved' | 'Committed' | 'Applied' | 'Rejected' | 'Expired';

export interface PipelineTransactionStatusResponse {
  kind: 'Transaction';
  content: {
    hash: string;
    status: {
      kind: PipelineTransactionKind;
      block_height?: number;
      content: string | null;
    };
    scope: PipelineStatusScope;
    resolved_from: string;
  };
}

export interface PipelineStatusPollResult {
  status: PipelineTransactionStatusResponse | null;
  completed: boolean;
  attempts: number;
}

export interface ContractCallSubmitResult {
  response: ContractCallResponse;
  pipelineStatus: PipelineTransactionStatusResponse | null;
  pipelineCompleted: boolean;
}

export interface BridgeProofSubmitResult {
  response: BridgeProofSubmitResponse;
  pipelineStatus: PipelineTransactionStatusResponse | null;
  pipelineCompleted: boolean;
}
