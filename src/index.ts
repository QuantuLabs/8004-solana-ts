/**
 * 8004-solana-ts SDK
 * TypeScript SDK for 8004 on Solana
 * v0.4.0 - ATOM Engine + Indexer + User Collections
 * Main entry point - exports public API
 */

// Export models
export * from './models/index.js';

// Export utilities
export * from './utils/index.js';

// Export core classes (will be created)
// export { SDK } from './core/sdk.js';
// export type { SDKConfig } from './core/sdk.js';
// export { Agent } from './core/agent.js';

// Export IPFS client
export { IPFSClient } from './core/ipfs-client.js';
export type { IPFSClientConfig } from './core/ipfs-client.js';

// Export endpoint utilities
export { EndpointCrawler } from './core/endpoint-crawler.js';
export type { McpCapabilities, A2aCapabilities } from './core/endpoint-crawler.js';

// Export Solana-specific (for now, temporary until SDK/Agent are created)
export * from './core/programs.js';
export * from './core/pda-helpers.js';
export * from './core/borsh-schemas.js';
export * from './core/feedback-normalizer.js';
// feedback-auth.ts removed - not used by on-chain program (uses native Signer constraint)
export * from './core/instruction-discriminators.js';
export * from './core/instruction-builder.js';
export * from './core/metaplex-helpers.js';
export * from './core/transaction-builder.js';

// Export Solana client with RPC detection
export {
  SolanaClient,
  UnsupportedRpcError,
  RpcNetworkError,
  SOLANA_DEVNET_RPC,
  RECOMMENDED_RPC_PROVIDERS,
  createDevnetClient,
} from './core/client.js';
export type { Cluster, SolanaClientConfig } from './core/client.js';

// Export Solana SDK
export { SolanaSDK } from './core/sdk-solana.js';
export type {
  SolanaSDKConfig,
  AgentWithMetadata,
  EnrichedSummary,
  CollectionInfo,
  IntegrityResult,
  IntegrityStatus,
  IntegrityChainResult,
  DeepIntegrityOptions,
  DeepIntegrityResult,
  SpotCheckResult,
  FullVerificationOptions,
  FullVerificationResult,
} from './core/sdk-solana.js';

// Export Feedback types
export type { SolanaFeedback, SolanaAgentSummary } from './core/feedback-manager-solana.js';

// Export OASF taxonomy utilities
export {
  validateSkill,
  validateDomain,
  getAllSkills,
  getAllDomains,
} from './core/oasf-validator.js';

// ============================================================================
// SEAL v1 exports (v0.6.0)
// ============================================================================

export {
  computeSealHash,
  computeFeedbackLeafV1,
  verifySealHash,
  createSealParams,
  validateSealInputs,
  MAX_TAG_LEN,
  MAX_ENDPOINT_LEN,
  MAX_URI_LEN,
} from './core/seal.js';
export type { SealParams } from './core/seal.js';

// Export config reader
export {
  fetchRegistryConfig,
  fetchRegistryConfigByPda,
  getBaseRegistryPda,
  getBaseCollection,
} from './core/config-reader.js';

// ============================================================================
// ATOM Engine exports (v0.4.0)
// ============================================================================

export {
  AtomStats,
  AtomConfig,
  TrustTier,
  ATOM_STATS_SCHEMA,
  ATOM_CONFIG_SCHEMA,
  trustTierToString,
} from './core/atom-schemas.js';

export {
  getAtomConfigPDA,
  getAtomStatsPDA,
} from './core/atom-pda.js';

// ============================================================================
// Indexer exports (v0.4.0)
// ============================================================================

// Indexer client
export { IndexerClient } from './core/indexer-client.js';
export { IndexerGraphQLClient } from './core/indexer-graphql-client.js';
export type {
  IndexerClientConfig,
  IndexerReadClient,
  IndexedAgent,
  IndexedFeedback,
  IndexedAgentReputation,
  IndexedMetadata,
  IndexedValidation,
  IndexedFeedbackResponse,
  CollectionStats,
  GlobalStats,
  ReplayEventData,
  ReplayDataPage,
  CheckpointData,
  CheckpointSet,
  ServerReplayResult,
} from './core/indexer-client.js';

// Indexer errors
export {
  IndexerError,
  IndexerErrorCode,
  IndexerUnavailableError,
  IndexerTimeoutError,
  IndexerRateLimitError,
  IndexerUnauthorizedError,
} from './core/indexer-errors.js';

// Indexer types and conversions
export type {
  AgentSearchParams,
  FeedbackSearchParams,
  ExtendedAgentSummary,
} from './core/indexer-types.js';
export {
  indexedAgentToSimplified,
  indexedFeedbackToSolanaFeedback,
  indexedReputationToSummary,
  indexedReputationToExtendedSummary,
} from './core/indexer-types.js';

// Indexer defaults and routing (v0.4.1)
export {
  DEFAULT_INDEXER_URL,
  DEFAULT_INDEXER_API_KEY,
  DEFAULT_INDEXER_GRAPHQL_URL,
  DEFAULT_FORCE_ON_CHAIN,
  SMALL_QUERY_OPERATIONS,
} from './core/indexer-defaults.js';

// ============================================================================
// Hash-chain replay & verification
// ============================================================================

export {
  chainHash,
  computeResponseLeaf,
  computeRevokeLeaf,
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,
  DOMAIN_FEEDBACK,
  DOMAIN_RESPONSE,
  DOMAIN_REVOKE,
  DOMAIN_SEAL_V1,
  DOMAIN_LEAF_V1,
} from './core/hash-chain-replay.js';
export type {
  ReplayResult,
  FeedbackReplayEvent,
  ResponseReplayEvent,
  RevokeReplayEvent,
} from './core/hash-chain-replay.js';
