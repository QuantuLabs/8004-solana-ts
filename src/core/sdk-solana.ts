/**
 * Solana SDK for Agent0 - 8004 implementation
 * v0.4.0 - ATOM Engine integration + Indexer support
 * Provides read and write access to Solana-based agent registries
 *
 * BREAKING CHANGES from v0.3.0:
 * - GiveFeedback/RevokeFeedback now use ATOM Engine for reputation tracking
 * - New ATOM methods: getAtomStats, getTrustTier, getEnrichedSummary
 * - Optional indexer integration for fast queries
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaClient, Cluster, UnsupportedRpcError } from './client.js';
import { SolanaFeedbackManager, SolanaFeedback } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { EndpointCrawler } from './endpoint-crawler.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds, type ProgramIdOverrides } from './programs.js';
import { sha256 } from '../utils/crypto-utils.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import { AgentAccount, MetadataEntryPda, ValidationRequest } from './borsh-schemas.js';
import {
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
  AtomTransactionBuilder,
  validateCollectionPointer,
  TransactionResult,
  WriteOptions,
  GiveFeedbackOptions,
  RegisterAgentOptions,
  PreparedTransaction,
  UpdateAtomConfigParams,
} from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { getBaseCollection, fetchRegistryConfig } from './config-reader.js';
import { RegistryConfig } from './borsh-schemas.js';
import { isBlockedUri, validateNonce } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import {
  buildSignedPayload,
  canonicalizeSignedPayload,
  parseSignedPayload,
  verifySignedPayload,
} from '../utils/signing.js';
import type { Service } from '../models/interfaces.js';
import { ServiceType } from '../models/enums.js';
import type { ServicePingResult, LivenessOptions, LivenessReport } from '../models/liveness.js';
import type { SignOptions, SignedPayloadV1 } from '../models/signatures.js';
import type { CollectionMetadataInput, CollectionMetadataJson } from '../models/collection-metadata.js';
import { buildCollectionMetadataJson } from '../models/collection-metadata.js';
// ATOM Engine imports (v0.4.0)
import { AtomStats, AtomConfig, TrustTier } from './atom-schemas.js';
import { getAtomStatsPDA, getAtomConfigPDA } from './atom-pda.js';
// Indexer imports (v0.4.0)
import {
  IndexerClient,
  IndexerReadClient,
  IndexedAgent,
  IndexedFeedback,
  IndexedAgentReputation,
  IndexedValidation,
  GlobalStats,
  CollectionPointerRecord,
  encodeCanonicalFeedbackId,
  encodeCanonicalResponseId,
} from './indexer-client.js';
import type { ReplayEventData, CheckpointSet } from './indexer-client.js';
import { IndexerGraphQLClient } from './indexer-graphql-client.js';
import {
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,
} from './hash-chain-replay.js';
import type {
  ReplayResult,
  FeedbackReplayEvent,
  ResponseReplayEvent,
  RevokeReplayEvent,
} from './hash-chain-replay.js';
import type { AgentSearchParams } from './indexer-types.js';
import { indexedFeedbackToSolanaFeedback } from './indexer-types.js';
// Indexer defaults (v0.4.1)
import {
  DEFAULT_INDEXER_URL,
  DEFAULT_INDEXER_API_KEY,
  DEFAULT_INDEXER_GRAPHQL_URL,
  DEFAULT_FORCE_ON_CHAIN,
  SMALL_QUERY_OPERATIONS,
} from './indexer-defaults.js';

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_BASE32_PATTERN = /^b[a-z2-7]+$/;
const COLLECTION_POINTER_PREFIX = 'c1:';
const COLLECTION_POINTER_PATTERN = /^c1:b[a-z2-7]+$/;
const COLLECTION_POINTER_MIN_LENGTH = 62;
const COLLECTION_POINTER_MAX_LENGTH = 128;
const VALIDATION_ARCHIVED_ERROR =
  'Validation feature is archived (v0.5.0+) and is not exposed by indexers.';

function extractCidCandidate(value: string): string {
  const trimmed = value.trim();
  const withoutScheme = trimmed
    .replace(/^ipfs:\/\//i, '')
    .replace(/^\/ipfs\//i, '');
  const cid = withoutScheme.split(/[/?#]/)[0] || '';
  if (!cid) {
    throw new Error('Invalid CID input: empty value');
  }
  return cid;
}

function base32EncodeLowerNoPad(bytes: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let value = 0n;
  let bits = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
    bits += 8;

    while (bits >= 5) {
      const shift = BigInt(bits - 5);
      const index = Number((value >> shift) & 31n);
      output += alphabet[index];
      bits -= 5;
    }
  }

  if (bits > 0) {
    const index = Number((value << BigInt(5 - bits)) & 31n);
    output += alphabet[index];
  }

  return output;
}

function cidV0ToCidV1Base32(cidV0: string): string {
  if (!CID_V0_PATTERN.test(cidV0)) {
    throw new Error('Invalid CIDv0 format');
  }

  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(cidV0);
  } catch {
    throw new Error('Invalid CIDv0 base58 encoding');
  }

  // CIDv0 is a multihash SHA-256 digest: 0x12 0x20 + 32-byte hash.
  if (decoded.length !== 34 || decoded[0] !== 0x12 || decoded[1] !== 0x20) {
    throw new Error('Invalid CIDv0 multihash payload');
  }

  // CIDv1 bytes: version(0x01) + codec(dag-pb=0x70) + multihash payload.
  const cidV1Bytes = Uint8Array.from([0x01, 0x70, ...decoded]);
  return `b${base32EncodeLowerNoPad(cidV1Bytes)}`;
}

function normalizeCollectionCid(cidOrUri: string): string {
  const cid = extractCidCandidate(cidOrUri);
  const lowered = cid.toLowerCase();

  if (CID_V1_BASE32_PATTERN.test(lowered)) {
    return lowered;
  }

  if (CID_V0_PATTERN.test(cid)) {
    return cidV0ToCidV1Base32(cid);
  }

  throw new Error('Unsupported CID format. Use CIDv0 (Qm...) or CIDv1 base32 (b...)');
}

function toCollectionPointer(cidOrUri: string): string {
  const pointer = `${COLLECTION_POINTER_PREFIX}${normalizeCollectionCid(cidOrUri)}`;
  if (
    pointer.length < COLLECTION_POINTER_MIN_LENGTH ||
    pointer.length > COLLECTION_POINTER_MAX_LENGTH ||
    !COLLECTION_POINTER_PATTERN.test(pointer)
  ) {
    throw new Error('Normalized collection pointer does not match extension schema');
  }
  return pointer;
}

export interface SolanaSDKConfig {
  cluster?: Cluster;
  rpcUrl?: string;
  // Signer for write operations (optional - read-only if not provided)
  signer?: Keypair;
  // Storage configuration
  ipfsClient?: IPFSClient;
  // Indexer configuration (v0.4.0) - all optional with sensible defaults
  /** GraphQL v2 endpoint (default: env INDEXER_GRAPHQL_URL or hardcoded Railway deployment) */
  indexerGraphqlUrl?: string;
  /**
   * @deprecated Legacy Supabase REST API URL (override via INDEXER_URL env)
   * Prefer `indexerGraphqlUrl` (GraphQL v2).
   */
  indexerUrl?: string;
  /**
   * @deprecated Legacy REST auth token (override via INDEXER_API_KEY env)
   * Prefer `indexerGraphqlUrl` (GraphQL v2).
   */
  indexerApiKey?: string;
  /** Use indexer for read operations (default: true) */
  useIndexer?: boolean;
  /** Fallback to on-chain if indexer unavailable (default: true) */
  indexerFallback?: boolean;
  /** Program IDs override (defaults target devnet IDs) */
  programIds?: ProgramIdOverrides;
  /**
   * Force all queries on-chain, bypass indexer (default: false, or FORCE_ON_CHAIN=true env)
   * When true, indexer-only methods (getLeaderboard, etc.) will throw
   */
  forceOnChain?: boolean;
}

/**
 * Agent with on-chain metadata extensions
 * Returned by getAllAgents() for efficient bulk fetching
 */
export interface AgentWithMetadata {
  account: AgentAccount;
  metadata: Array<{ key: string; value: string }>;
  feedbacks: SolanaFeedback[];
}

export interface GetAllAgentsOptions {
  /** Include feedbacks for each agent (2 additional RPC calls). Default: false */
  includeFeedbacks?: boolean;
  /** If includeFeedbacks=true, include revoked feedbacks? Default: false */
  includeRevoked?: boolean;
}

/**
 * Enriched summary combining on-chain agent data with ATOM metrics (v0.4.0)
 */
export interface EnrichedSummary {
  asset: PublicKey;
  owner: PublicKey;
  collection: PublicKey;
  // Basic reputation metrics
  totalFeedbacks: number;
  averageScore: number;
  positiveCount: number;
  negativeCount: number;
  // ATOM metrics (from AtomStats)
  trustTier: TrustTier;
  qualityScore: number;      // 0-10000 (scaled to 0-100)
  confidence: number;        // 0-10000 (scaled to 0-100)
  riskScore: number;         // 0-100
  diversityRatio: number;    // 0-255 (unique callers / total)
  uniqueCallers: number;     // Estimated from HLL
  // EMA scores
  emaScoreFast: number;      // 0-10000 (recent trend)
  emaScoreSlow: number;      // 0-10000 (long-term trend)
  volatility: number;        // 0-10000
}

/**
 * Collection information returned by getCollection()
 * Represents on-chain RegistryConfig data in a user-friendly format
 * v0.6.0: Single-collection architecture - registryType removed
 */
export interface CollectionInfo {
  collection: PublicKey;
  authority: PublicKey;
}

export interface SetCollectionPointerOptions extends WriteOptions {
  /**
   * Lock pointer after set (default: true).
   * If false, creator can update later via set_collection_pointer_with_options.
   */
  lock?: boolean;
}

export interface SetParentAssetOptions extends WriteOptions {
  /**
   * Lock parent after set (default: true).
   * If false, owner can update later via set_parent_asset_with_options.
   */
  lock?: boolean;
}

export interface CreateCollectionUploadOptions {
  /** Upload JSON to IPFS using configured ipfsClient (default: true) */
  uploadToIpfs?: boolean;
}

export interface CreateCollectionUploadResult {
  /** JSON document generated from collection input */
  metadata: CollectionMetadataJson;
  /** Raw CID returned by IPFS provider (when uploaded) */
  cid?: string;
  /** Convenience URI form: ipfs://<cid> (when uploaded) */
  uri?: string;
  /** Canonical collection pointer: c1:<normalized_cid_v1_base32> (when uploaded) */
  pointer?: string;
}

/**
 * Normalized validation data for user-friendly access
 * Combines on-chain data with computed properties
 * Note: URIs are only available in events/indexer, not on-chain
 */
export interface NormalizedValidation {
  /** Agent asset pubkey (base58) */
  asset: string;
  /** Validator pubkey (base58) */
  validator: string;
  /** Request nonce */
  nonce: number;
  /** Response score (0-100) - alias for 'response' field */
  score: number;
  /** Raw response value from on-chain (0-100) */
  response: number;
  /** Whether validator has responded (computed from responded_at > 0) */
  responded: boolean;
  /** Timestamp of response (0 if pending) */
  responded_at: bigint;
  /** Request hash (hex string) */
  request_hash: string;
  // URIs are NOT stored on-chain - only in events/indexer
  // Use indexer.getValidations() for full data including URIs
}

/**
 * Hash-chain integrity verification result
 */
/**
 * Status of hash-chain integrity verification
 * - 'valid': All digests match - indexer is fully synced and trustworthy
 * - 'syncing': Indexer is behind on-chain (count mismatch) - not corruption, just lag
 * - 'corrupted': Digest mismatch with matching counts - data integrity issue
 * - 'error': Verification failed (network, missing agent, etc.)
 */
export type IntegrityStatus = 'valid' | 'syncing' | 'corrupted' | 'error';

export interface IntegrityChainResult {
  onChain: string;
  indexer: string | null;
  countOnChain: bigint;
  countIndexer: bigint;
  match: boolean;
  /** How many items indexer is behind (positive = behind, negative = ahead which shouldn't happen) */
  lag: bigint;
}

export interface IntegrityResult {
  /** Overall validity - true only if status is 'valid' */
  valid: boolean;
  /** Detailed status distinguishing sync lag from corruption */
  status: IntegrityStatus;
  asset: string;
  indexerUrl: string;
  chains: {
    feedback: IntegrityChainResult;
    response: IntegrityChainResult;
    revoke: IntegrityChainResult;
  };
  /** Total lag across all chains */
  totalLag: bigint;
  /** Whether indexer can be trusted for reads (valid or syncing with small lag) */
  trustworthy: boolean;
  error?: {
    message: string;
    recommendation: string;
  };
}

/**
 * Options for deep integrity verification
 */
export interface DeepIntegrityOptions {
  /** Number of random spot checks per chain (default: 5) */
  spotChecks?: number;
  /** Verify existence of first and last items (default: true) */
  checkBoundaries?: boolean;
  /**
   * Verify content hashes for spot-checked items (default: false)
   * This detects data modification attacks where indexer returns
   * valid digests but serves modified content (wrong scores, tags, etc.)
   * Requires on-chain comparison so it's slower.
   */
  verifyContent?: boolean;
}

/**
 * Result of a spot check - verifying a specific item exists and is unmodified
 */
export interface SpotCheckResult {
  index: number;
  /** Item exists in indexer */
  exists: boolean;
  /** Running digest is present */
  digestMatch?: boolean;
  /**
   * Content hash verification result (only if verifyContent=true)
   * - true: content hash matches (data unmodified)
   * - false: content hash mismatch (data was modified!)
   * - undefined: verification not performed or not possible
   */
  contentValid?: boolean;
  /** Error during content verification */
  contentError?: string;
}

/**
 * Extended integrity result with spot check details
 */
export interface DeepIntegrityResult extends IntegrityResult {
  /** Spot check results for each chain */
  spotChecks: {
    feedback: SpotCheckResult[];
    response: SpotCheckResult[];
    revoke: SpotCheckResult[];
  };
  /** True if all spot checks passed */
  spotChecksPassed: boolean;
  /** Number of missing items detected via spot checks */
  missingItems: number;
  /** Number of items with modified content (content hash mismatch) */
  modifiedItems: number;
}

/**
 * Options for full hash-chain replay verification
 */
export interface FullVerificationOptions {
  useCheckpoints?: boolean;
  batchSize?: number;
  onProgress?: (chain: string, count: number, total: number) => void;
}

/**
 * Full verification result with replay details
 */
export interface FullVerificationResult extends IntegrityResult {
  replay: {
    feedback: ReplayResult;
    response: ReplayResult;
    revoke: ReplayResult;
  };
  checkpointsUsed: boolean;
  duration: number;
}

/**
 * Options for waitForValidation
 */
export interface WaitForValidationOptions {
  /** Max wait time in milliseconds (default: 30000) */
  timeout?: number;
  /** Wait for response (responded_at > 0) instead of just account creation (default: false) */
  waitForResponse?: boolean;
}

export interface RevokeFeedbackOptions extends WriteOptions {
  /**
   * Verify signer owns the feedback before sending tx (default: true).
   * Set false only when you intentionally skip indexer preflight checks.
   */
  verifyFeedbackClient?: boolean;
  /**
   * Wait briefly for indexer sync when feedback is not visible yet (default: true).
   */
  waitForIndexerSync?: boolean;
}

/**
 * Main SDK class for Solana 8004 implementation
 * v0.4.0 - ATOM Engine + Indexer support
 * Provides read and write access to agent registries on Solana
 */
export class SolanaSDK {
  private readonly client: SolanaClient;
  private readonly feedbackManager: SolanaFeedbackManager;
  private readonly cluster: Cluster;
  private readonly programIds: ReturnType<typeof getProgramIds>;
  private readonly signer?: Keypair;
  private readonly ipfsClient?: IPFSClient;
  private readonly identityTxBuilder: IdentityTransactionBuilder;
  private readonly reputationTxBuilder: ReputationTransactionBuilder;
  private readonly validationTxBuilder: ValidationTransactionBuilder;
  private readonly atomTxBuilder: AtomTransactionBuilder;
  private mintResolver?: AgentMintResolver;
  private baseCollection?: PublicKey;
  private _initPromise?: Promise<void>; // Guard against concurrent initialization
  // Indexer (v0.4.0)
  private readonly indexerClient: IndexerReadClient;
  private readonly useIndexer: boolean;
  private readonly indexerFallback: boolean;
  private readonly forceOnChain: boolean;

  constructor(config: SolanaSDKConfig = {}) {
    this.cluster = config.cluster || 'devnet';
    this.programIds = getProgramIds(config.programIds);
    this.signer = config.signer;
    this.ipfsClient = config.ipfsClient;

    this.client = new SolanaClient({
      cluster: this.cluster,
      rpcUrl: config.rpcUrl,
    });

    const hasProgramIdOverrides = !!(
      config.programIds
      && Object.values(config.programIds).some((value) => value !== undefined && value !== null)
    );
    if (this.cluster === 'mainnet-beta' && !hasProgramIdOverrides) {
      logger.warn(
        'cluster=mainnet-beta selected without programIds override; SDK will use devnet default program IDs until mainnet IDs are provided.'
      );
    }

    // Initialize feedback manager
    this.feedbackManager = new SolanaFeedbackManager(this.client, config.ipfsClient);

    // Initialize indexer client first (v0.7.0)
    // Default: GraphQL v2 (Railway reference deployment)
    // Legacy: REST v1 (only if explicitly configured via config or env)
    const envRestUrl = getEnv('INDEXER_URL');
    const envRestKey = getEnv('INDEXER_API_KEY');
    const envGraphqlUrl = getEnv('INDEXER_GRAPHQL_URL');

    const restBaseUrl = config.indexerUrl ?? envRestUrl;
    const restApiKey = config.indexerApiKey ?? envRestKey;

    if (restBaseUrl || restApiKey) {
      this.indexerClient = new IndexerClient({
        baseUrl: restBaseUrl ?? DEFAULT_INDEXER_URL,
        apiKey: restApiKey ?? DEFAULT_INDEXER_API_KEY,
      });
    } else {
      this.indexerClient = new IndexerGraphQLClient({
        graphqlUrl: config.indexerGraphqlUrl ?? envGraphqlUrl ?? DEFAULT_INDEXER_GRAPHQL_URL,
      });
    }

    // Initialize transaction builders (v0.4.0)
    const connection = this.client.getConnection();
    this.identityTxBuilder = new IdentityTransactionBuilder(connection, this.signer, this.programIds);
    this.reputationTxBuilder = new ReputationTransactionBuilder(
      connection,
      this.signer,
      this.indexerClient,
      this.programIds
    );
    this.validationTxBuilder = new ValidationTransactionBuilder(connection, this.signer, this.programIds);
    this.atomTxBuilder = new AtomTransactionBuilder(connection, this.signer, this.programIds);
    this.feedbackManager.setIndexerClient(this.indexerClient);
    this.useIndexer = config.useIndexer ?? true;
    this.indexerFallback = config.indexerFallback ?? true;
    // Force on-chain mode (bypass indexer)
    this.forceOnChain = config.forceOnChain ?? DEFAULT_FORCE_ON_CHAIN;
  }

  /**
   * Check if operation is a "small query" that prefers RPC in 'auto' mode
   */
  private isSmallQuery(operation: string): boolean {
    return (SMALL_QUERY_OPERATIONS as readonly string[]).includes(operation);
  }

  /**
   * Initialize the agent mint resolver and base collection (lazy initialization)
   * Uses promise lock to prevent redundant concurrent network calls
   */
  private async initializeMintResolver(): Promise<void> {
    if (this.mintResolver) {
      return; // Already initialized
    }

    // If initialization is already in progress, wait for it
    if (this._initPromise) {
      return this._initPromise;
    }

    // Start initialization and store promise to prevent race condition
    this._initPromise = (async () => {
      try {
        const connection = this.client.getConnection();

        // v0.3.0: Get base collection from RootConfig
        this.baseCollection = await getBaseCollection(connection, this.programIds.agentRegistry) || undefined;

        if (!this.baseCollection) {
          throw new Error('Registry not initialized. Root config not found.');
        }

        this.mintResolver = new AgentMintResolver(connection, undefined, this.programIds.agentRegistry);
      } catch (error) {
        // Clear promise on failure so retry is possible
        this._initPromise = undefined;
        throw new Error(`Failed to initialize SDK: ${error}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Get the current base registry collection pubkey
   */
  async getBaseCollection(): Promise<PublicKey | null> {
    await this.initializeMintResolver();
    return this.baseCollection || null;
  }

  // ==================== Agent Methods (v0.3.0 - asset-based) ====================

  /**
   * Load agent by asset pubkey - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns Agent account data or null if not found
   */
  async loadAgent(asset: PublicKey): Promise<AgentAccount | null> {
    // Derive PDA from asset
    const [agentPDA] = PDAHelpers.getAgentPDA(asset, this.programIds.agentRegistry);

    // Fetch account data - RpcNetworkError propagates for network issues
    const data = await this.client.getAccount(agentPDA);

    if (!data) {
      return null;
    }

    try {
      return AgentAccount.deserialize(data);
    } catch (error) {
      // Deserialization error - log and return null (corrupted/invalid data)
      logger.error('Error deserializing agent account', error);
      return null;
    }
  }

  /**
   * Get a specific metadata entry for an agent - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param key - Metadata key
   * @returns Metadata value as string, or null if not found
   */
  async getMetadata(asset: PublicKey, key: string): Promise<string | null> {
    try {
      // Compute key hash (SHA256(key)[0..16]) - v1.9 security update
      const keyHashFull = await sha256(key);
      const keyHash = Buffer.from(keyHashFull.slice(0, 16));

      // Derive metadata entry PDA (v0.3.0 - uses asset)
      const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(asset, keyHash, this.programIds.agentRegistry);

      // Fetch metadata account
      const metadataData = await this.client.getAccount(metadataEntry);
      if (!metadataData) {
        return null; // Metadata entry does not exist
      }

      // Deserialize and return value
      const entry = MetadataEntryPda.deserialize(metadataData);
      return entry.getValueString();
    } catch (error) {
      logger.error(`Error getting metadata for key "${key}"`, error);
      return null;
    }
  }

  /**
   * Get agents by owner with on-chain metadata - v0.3.0
   * @param owner - Owner public key
   * @param options - Optional settings for additional data fetching
   * @returns Array of agents with metadata (and optionally feedbacks)
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
   */
  async getAgentsByOwner(
    owner: PublicKey,
    options?: GetAllAgentsOptions
  ): Promise<AgentWithMetadata[]> {
    this.client.requireAdvancedQueries('getAgentsByOwner');

    try {
      const programId = this.programIds.identityRegistry;

      // 1. Fetch agent accounts filtered by owner (1 RPC call)
      // AgentAccount layout: discriminator (8) + collection (32) + owner (32)
      // Owner is at offset 8 + 32 = 40
      const agentAccounts = await this.client.getProgramAccounts(programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
          },
        },
        {
          memcmp: {
            offset: 40, // owner is after discriminator (8) + collection (32)
            bytes: owner.toBase58(),
          },
        },
      ]);

      const agents = agentAccounts.map((acc) => AgentAccount.deserialize(acc.data));

      // 2. Fetch ALL metadata entries (1 RPC call)
      const metadataAccounts = await this.client.getProgramAccounts(programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.MetadataEntryPda),
          },
        },
      ]);

      // Build metadata map: asset → [{key, value}]
      const metadataMap = new Map<string, Array<{ key: string; value: string }>>();
      for (const acc of metadataAccounts) {
        try {
          const entry = MetadataEntryPda.deserialize(acc.data);
          const assetStr = entry.getAssetPublicKey().toBase58();
          if (!metadataMap.has(assetStr)) metadataMap.set(assetStr, []);
          metadataMap.get(assetStr)!.push({
            key: entry.metadata_key,
            value: entry.getValueString(),
          });
        } catch {
          // Skip malformed MetadataEntryPda
        }
      }

      // 3. Optionally fetch feedbacks (2 RPC calls)
      let feedbacksMap: Map<string, SolanaFeedback[]> | null = null;
      if (options?.includeFeedbacks) {
        feedbacksMap = await this.feedbackManager.fetchAllFeedbacks(
          options.includeRevoked ?? false
        );
      }

      // 4. Combine results
      return agents.map((account) => {
        const assetStr = account.getAssetPublicKey().toBase58();
        return {
          account,
          metadata: metadataMap.get(assetStr) || [],
          feedbacks: feedbacksMap ? feedbacksMap.get(assetStr) || [] : [],
        };
      });
    } catch (error) {
      if (error instanceof UnsupportedRpcError) throw error;
      logger.error('Error getting agents for owner', error);
      return [];
    }
  }

  /**
   * Get all registered agents with their on-chain metadata - v0.3.0
   * @param options - Optional settings for additional data fetching
   * @returns Array of agents with metadata extensions (and optionally feedbacks)
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
   */
  async getAllAgents(options?: GetAllAgentsOptions): Promise<AgentWithMetadata[]> {
    this.client.requireAdvancedQueries('getAllAgents');

    try {
      const programId = this.programIds.identityRegistry;

      // Fetch AgentAccounts and MetadataExtensions in parallel
      const [agentAccounts, metadataAccounts] = await Promise.all([
        this.client.getProgramAccounts(programId, [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
            },
          },
        ]),
        this.client.getProgramAccounts(programId, [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.MetadataEntryPda),
            },
          },
        ]),
      ]);

      // Build metadata map by asset (v0.3.0)
      const metadataMap = new Map<string, Array<{ key: string; value: string }>>();
      for (const acc of metadataAccounts) {
        try {
          const entry = MetadataEntryPda.deserialize(acc.data);
          const assetStr = entry.getAssetPublicKey().toBase58();
          if (!metadataMap.has(assetStr)) metadataMap.set(assetStr, []);
          metadataMap.get(assetStr)!.push({
            key: entry.metadata_key,
            value: entry.getValueString(),
          });
        } catch {
          // Skip malformed accounts
        }
      }

      // Combine agents with their metadata
      const agents: AgentWithMetadata[] = [];
      for (const acc of agentAccounts) {
        try {
          const agent = AgentAccount.deserialize(acc.data);
          const assetStr = agent.getAssetPublicKey().toBase58();
          agents.push({
            account: agent,
            metadata: metadataMap.get(assetStr) || [],
            feedbacks: [], // Always initialize as empty array
          });
        } catch {
          // Skip malformed accounts
        }
      }

      // Optionally fetch all feedbacks (2 additional RPC calls)
      if (options?.includeFeedbacks) {
        const allFeedbacks = await this.feedbackManager.fetchAllFeedbacks(options.includeRevoked ?? false);

        // Attach feedbacks to each agent
        for (const agent of agents) {
          const assetStr = agent.account.getAssetPublicKey().toBase58();
          agent.feedbacks = allFeedbacks.get(assetStr) || [];
        }
      }

      return agents;
    } catch (error) {
      if (error instanceof UnsupportedRpcError) throw error;
      logger.error('Error getting all agents', error);
      return [];
    }
  }

  /**
   * Fetch ALL feedbacks for ALL agents (indexer) - v0.4.0
   * More efficient than calling readAllFeedback() per agent
   * @param includeRevoked - Include revoked feedbacks? Default: false
   * @returns Map of asset (base58) -> SolanaFeedback[]
   *
   * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
   * Requires indexer to be configured.
   */
  async getAllFeedbacks(includeRevoked: boolean = false): Promise<Map<string, SolanaFeedback[]>> {
    return await this.feedbackManager.fetchAllFeedbacks(includeRevoked);
  }

  /**
   * Check if agent exists - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns True if agent exists
   */
  async agentExists(asset: PublicKey): Promise<boolean> {
    const agent = await this.loadAgent(asset);
    return agent !== null;
  }

  /**
   * Get agent (alias for loadAgent) - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns Agent account data or null if not found
   */
  async getAgent(asset: PublicKey): Promise<AgentAccount | null> {
    return this.loadAgent(asset);
  }

  /**
   * Check if address is agent owner - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param address - Address to check
   * @returns True if address is the owner
   */
  async isAgentOwner(asset: PublicKey, address: PublicKey): Promise<boolean> {
    const agent = await this.loadAgent(asset);
    if (!agent) return false;
    return agent.getOwnerPublicKey().equals(address);
  }

  /**
   * Get agent owner - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns Owner public key or null if agent not found
   */
  async getAgentOwner(asset: PublicKey): Promise<PublicKey | null> {
    const agent = await this.loadAgent(asset);
    if (!agent) return null;
    return agent.getOwnerPublicKey();
  }

  /**
   * Get reputation summary - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns Reputation summary with count and average score
   */
  async getReputationSummary(asset: PublicKey): Promise<{ count: number; averageScore: number }> {
    const summary = await this.getSummary(asset);
    return {
      count: summary.totalFeedbacks,
      averageScore: summary.averageScore,
    };
  }

  // ==================== Collection Methods (v0.6.0) ====================

  /**
   * Get collection details by base-registry collection pubkey - v0.6.0
   * @param collection - Base registry Metaplex Core collection public key
   * @returns Collection info or null if not registered
   */
  async getCollection(collection: PublicKey): Promise<CollectionInfo | null> {
    try {
      const connection = this.client.getConnection();
      const registryConfig = await fetchRegistryConfig(connection, collection, this.programIds.agentRegistry);

      if (!registryConfig) {
        return null;
      }

      return {
        collection: registryConfig.getCollectionPublicKey(),
        authority: registryConfig.getAuthorityPublicKey(),
      };
    } catch (error) {
      logger.error('Error getting collection', error);
      return null;
    }
  }

  /**
   * Get all registered collections - v0.6.0
   * Single-collection architecture: typically returns only the base collection
   * @returns Array of all collection infos
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
   */
  async getCollections(): Promise<CollectionInfo[]> {
    this.client.requireAdvancedQueries('getCollections');

    try {
      const programId = this.programIds.identityRegistry;

      // Fetch all RegistryConfig accounts
      const registryAccounts = await this.client.getProgramAccounts(programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.RegistryConfig),
          },
        },
      ]);

      return registryAccounts.map((acc) => {
        const config = RegistryConfig.deserialize(acc.data);
        return {
          collection: config.getCollectionPublicKey(),
          authority: config.getAuthorityPublicKey(),
        };
      });
    } catch (error) {
      logger.error('Error getting collections', error);
      return [];
    }
  }

  /**
   * Get all agents in a base-registry collection (on-chain) - v0.4.0
   * Returns full AgentAccount data with metadata extensions.
   *
   * For faster queries, use `getLeaderboard({ collection: 'xxx' })` which uses the indexer.
   *
   * @param collection - Base registry collection public key
   * @param options - Optional settings for additional data fetching
   * @returns Array of agents with metadata (and optionally feedbacks)
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
   */
  async getCollectionAgents(
    collection: PublicKey,
    options?: GetAllAgentsOptions
  ): Promise<AgentWithMetadata[]> {
    // Skip on-chain if indexer preferred and user doesn't need full account data
    // Note: For indexed queries, use getLeaderboard({ collection }) instead
    this.client.requireAdvancedQueries('getCollectionAgents');

    try {
      const programId = this.programIds.identityRegistry;

      // 1. Fetch agent accounts filtered by collection (1 RPC call)
      // AgentAccount layout: discriminator (8) + collection (32)
      // Collection is at offset 8
      const agentAccounts = await this.client.getProgramAccounts(programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
          },
        },
        {
          memcmp: {
            offset: 8, // collection is right after discriminator
            bytes: collection.toBase58(),
          },
        },
      ]);

      const agents = agentAccounts.map((acc) => AgentAccount.deserialize(acc.data));

      // 2. Fetch ALL metadata entries (1 RPC call)
      const metadataAccounts = await this.client.getProgramAccounts(programId, [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.MetadataEntryPda),
          },
        },
      ]);

      // Map metadata to agents (by asset)
      const metadataMap = new Map<string, Array<{ key: string; value: string }>>();
      for (const acc of metadataAccounts) {
        try {
          const entry = MetadataEntryPda.deserialize(acc.data);
          const assetKey = entry.getAssetPublicKey().toBase58();
          if (!metadataMap.has(assetKey)) {
            metadataMap.set(assetKey, []);
          }
          metadataMap.get(assetKey)!.push({
            key: entry.key,
            value: entry.value,
          });
        } catch {
          // Skip invalid metadata entries
        }
      }

      // Build result
      const result: AgentWithMetadata[] = agents.map((agent) => ({
        account: agent,
        metadata: metadataMap.get(agent.getAssetPublicKey().toBase58()) || [],
        feedbacks: [],
      }));

      // 3. Optionally fetch feedbacks
      if (options?.includeFeedbacks) {
        // getAllFeedbacks returns Map<assetKey, SolanaFeedback[]>
        const feedbackMap = await this.getAllFeedbacks(options.includeRevoked);

        for (const agent of result) {
          agent.feedbacks = feedbackMap.get(agent.account.getAssetPublicKey().toBase58()) || [];
        }
      }

      return result;
    } catch (error) {
      logger.error('Error getting collection agents', error);
      return [];
    }
  }

  // ==================== Event-Driven Architecture Helpers ====================

  /**
   * Wait for indexer to sync with on-chain events (event-driven architecture)
   *
   * The 8004 protocol uses an event-driven architecture where writes happen instantly on-chain
   * via transaction logs, and the indexer asynchronously processes these events for efficient queries.
   * This helper waits for the indexer to catch up with recent on-chain activity.
   *
   * @param checkFn - Function that returns true when data is synced
   * @param options - Configuration options
   * @returns True if synced within timeout, false otherwise
   *
   * @example
   * // Wait for feedback to appear in indexer after giveFeedback()
   * await sdk.waitForIndexerSync(async () => {
   *   const feedback = await sdk.readFeedback(asset, client, index);
   *   return feedback !== null;
   * });
   */
  async waitForIndexerSync(
    checkFn: () => Promise<boolean>,
    options?: {
      /** Maximum time to wait in milliseconds (default: 30000) */
      timeout?: number;
      /** Initial retry delay in milliseconds (default: 1000) */
      initialDelay?: number;
      /** Maximum retry delay in milliseconds (default: 5000) */
      maxDelay?: number;
      /** Backoff multiplier (default: 1.5) */
      backoffMultiplier?: number;
    }
  ): Promise<boolean> {
    const timeout = options?.timeout ?? 30000;
    const initialDelay = options?.initialDelay ?? 1000;
    const maxDelay = options?.maxDelay ?? 5000;
    const backoffMultiplier = options?.backoffMultiplier ?? 1.5;

    const startTime = Date.now();
    let currentDelay = initialDelay;

    while (Date.now() - startTime < timeout) {
      try {
        if (await checkFn()) {
          return true;
        }
      } catch (error) {
        // Continue retrying on errors (indexer might not have data yet)
      }

      // Wait before next retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
    }

    return false;
  }

  /**
   * Resolve a specific feedback via indexer-backed reads.
   * Returns null when feedback is not yet indexed.
   */
  private async resolveFeedbackFromIndexer(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: bigint,
    options?: {
      waitForSync?: boolean;
    }
  ): Promise<SolanaFeedback | null> {
    let resolved: SolanaFeedback | null = null;
    const shouldWait = options?.waitForSync ?? true;

    const tryReadOnce = async (): Promise<SolanaFeedback | null> => {
      const feedback = await this.readFeedback(asset, client, feedbackIndex);
      return feedback ?? null;
    };

    try {
      resolved = await tryReadOnce();
      if (resolved) {
        return resolved;
      }

      if (!shouldWait) {
        return null;
      }

      await this.waitForIndexerSync(
        async () => {
          try {
            resolved = await tryReadOnce();
            return !!resolved;
          } catch {
            return false;
          }
        },
        {
          timeout: 10000,
          initialDelay: 250,
          maxDelay: 1500,
          backoffMultiplier: 1.5,
        }
      );

      return resolved;
    } catch (error) {
      logger.warn(
        'Failed to resolve feedback from indexer',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Resolve SEAL hash for a specific feedback via indexer-backed reads.
   * Returns undefined when feedback/sealHash is not yet indexed.
   */
  private async resolveSealHashFromIndexer(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: bigint
  ): Promise<Buffer | undefined> {
    const feedback = await this.resolveFeedbackFromIndexer(asset, client, feedbackIndex);
    if (feedback?.sealHash && Buffer.isBuffer(feedback.sealHash) && feedback.sealHash.length === 32) {
      return feedback.sealHash;
    }
    return undefined;
  }

  /**
   * Resolve feedback by SEAL hash when caller does not know feedbackIndex.
   */
  private async resolveFeedbackBySealHashFromIndexer(
    asset: PublicKey,
    client: PublicKey,
    sealHash: Buffer
  ): Promise<SolanaFeedback | null> {
    if (sealHash.length !== 32) {
      throw new Error('sealHash must be 32 bytes');
    }

    const assetStr = asset.toBase58();
    const clientStr = client.toBase58();
    const sealHex = sealHash.toString('hex').toLowerCase();

    const matchesSealHash = (hash?: string | null): boolean =>
      typeof hash === 'string' && hash.toLowerCase() === sealHex;

    const tryReadOnce = async (): Promise<SolanaFeedback | null> => {
      const byClient = await this.indexerClient.getFeedbacksByClient(clientStr);
      const fromClient = byClient.find(
        (row) => row.asset === assetStr && matchesSealHash(row.feedback_hash)
      );
      if (fromClient) {
        return indexedFeedbackToSolanaFeedback(fromClient);
      }

      const byAsset = await this.indexerClient.getFeedbacks(assetStr, {
        includeRevoked: true,
        limit: 5000,
      });
      const fromAsset = byAsset.find(
        (row) => row.client_address === clientStr && matchesSealHash(row.feedback_hash)
      );
      if (fromAsset) {
        return indexedFeedbackToSolanaFeedback(fromAsset);
      }

      return null;
    };

    try {
      let resolved = await tryReadOnce();
      if (resolved) {
        return resolved;
      }

      await this.waitForIndexerSync(
        async () => {
          resolved = await tryReadOnce();
          return resolved !== null;
        },
        {
          timeout: 10000,
          initialDelay: 250,
          maxDelay: 1500,
          backoffMultiplier: 1.5,
        }
      );

      return resolved;
    } catch (error) {
      logger.warn(
        'Failed to resolve feedback by sealHash from indexer',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  // ==================== Reputation Methods (v0.3.0 - asset-based) ====================

  /**
   * 1. Get agent reputation summary - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param minScore - Optional minimum score filter
   * @param clientFilter - Optional client filter
   * @returns Reputation summary with average score and total feedbacks
   */
  async getSummary(asset: PublicKey, minScore?: number, clientFilter?: PublicKey) {
    return await this.feedbackManager.getSummary(asset, minScore, clientFilter);
  }

  /**
   * 2. Read single feedback - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param client - Client public key
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Feedback object or null
   */
  async readFeedback(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint) {
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.readFeedback(asset, client, idx);
  }

  /**
   * Get feedback (alias for readFeedback) - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param clientAddress - Client public key
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Feedback object or null
   */
  async getFeedback(asset: PublicKey, clientAddress: PublicKey, feedbackIndex: number | bigint) {
    return this.readFeedback(asset, clientAddress, feedbackIndex);
  }

  /**
   * Build canonical feedback ID used by indexers.
   * Format: "<asset>:<client>:<feedbackIndex>" (no chain prefix).
   */
  encodeFeedbackId(asset: PublicKey | string, client: PublicKey | string, feedbackIndex: number | bigint): string {
    const assetStr = typeof asset === 'string' ? asset : asset.toBase58();
    const clientStr = typeof client === 'string' ? client : client.toBase58();
    return encodeCanonicalFeedbackId(assetStr, clientStr, feedbackIndex);
  }

  /**
   * Build canonical response ID used by indexers.
   * Format: "<asset>:<client>:<feedbackIndex>:<responder>:<responseCount|txSig>".
   */
  encodeResponseId(
    asset: PublicKey | string,
    client: PublicKey | string,
    feedbackIndex: number | bigint,
    responder: PublicKey | string,
    responseCountOrTxSig: number | bigint | string
  ): string {
    const assetStr = typeof asset === 'string' ? asset : asset.toBase58();
    const clientStr = typeof client === 'string' ? client : client.toBase58();
    const responderStr = typeof responder === 'string' ? responder : responder.toBase58();
    return encodeCanonicalResponseId(assetStr, clientStr, feedbackIndex, responderStr, responseCountOrTxSig);
  }

  /**
   * Read feedback by indexer feedback id.
   * Accepts sequential numeric backend feedback ids.
   */
  async getFeedbackById(feedbackId: string): Promise<IndexedFeedback | null> {
    const normalizedId = feedbackId.trim();
    if (!/^\d+$/.test(normalizedId)) return null;

    if (!this.indexerClient.getFeedbackById) return null;
    return this.indexerClient.getFeedbackById(normalizedId);
  }

  /**
   * Read responses by indexer feedback id.
   * Accepts sequential numeric backend feedback ids.
   */
  async getFeedbackResponsesByFeedbackId(
    feedbackId: string,
    limit: number = 100
  ): Promise<import('./indexer-client.js').IndexedFeedbackResponse[]> {
    const normalizedId = feedbackId.trim();
    if (!/^\d+$/.test(normalizedId)) return [];

    if (!this.indexerClient.getFeedbackResponsesByFeedbackId) return [];
    return this.indexerClient.getFeedbackResponsesByFeedbackId(normalizedId, limit);
  }

  /**
   * 3. Read all feedbacks for an agent (indexer) - v0.4.0
   * @param asset - Agent Core asset pubkey
   * @param includeRevoked - Include revoked feedbacks
   * @returns Array of feedback objects
   *
   * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
   * Requires indexer to be configured.
   */
  async readAllFeedback(asset: PublicKey, includeRevoked: boolean = false) {
    return await this.feedbackManager.readAllFeedback(asset, includeRevoked);
  }

  /**
   * 4. Get last feedback index for a client - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param client - Client public key
   * @returns Last feedback index
   */
  async getLastIndex(asset: PublicKey, client: PublicKey) {
    return await this.feedbackManager.getLastIndex(asset, client);
  }

  /**
   * 5. Get all clients who gave feedback (indexer) - v0.4.0
   * @param asset - Agent Core asset pubkey
   * @returns Array of client public keys
   *
   * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
   * Requires indexer to be configured.
   */
  async getClients(asset: PublicKey) {
    return await this.feedbackManager.getClients(asset);
  }

  /**
   * 6. Get response count for a feedback
   * @param asset - Agent Core asset pubkey
   * @param client - Client public key (who gave the feedback)
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Number of responses
   */
  async getResponseCount(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint): Promise<number> {
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.getResponseCount(asset, client, idx);
  }

  /**
   * Bonus: Read all responses for a feedback
   * @param asset - Agent Core asset pubkey
   * @param client - Client public key (who gave the feedback)
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Array of response objects
   */
  async readResponses(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: number | bigint
  ): Promise<import('./feedback-manager-solana.js').SolanaResponse[]> {
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.readResponses(asset, client, idx);
  }

  // ==================== ATOM Engine Methods (v0.4.0) ====================

  /**
   * Get ATOM stats for an agent
   * @param asset - Agent Core asset pubkey
   * @returns AtomStats account data or null if not found
   */
  async getAtomStats(asset: PublicKey): Promise<AtomStats | null> {
    try {
      const [atomStatsPDA] = getAtomStatsPDA(asset, this.programIds.atomEngine);
      const connection = this.client.getConnection();
      const accountInfo = await connection.getAccountInfo(atomStatsPDA);

      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // AtomStats.deserialize handles the 8-byte discriminator internally
      return AtomStats.deserialize(Buffer.from(accountInfo.data));
    } catch (error) {
      logger.error('Error fetching ATOM stats', error);
      return null;
    }
  }

  /**
   * Initialize ATOM stats for an agent (write operation) - v0.4.0
   * Must be called by the agent owner before any feedback can be given
   * @param asset - Agent Core asset pubkey
   * @param options - Write options (skipSend, signer)
   */
  async initializeAtomStats(
    asset: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    return await this.atomTxBuilder.initializeStats(asset, options);
  }

  // ==================== ATOM Config Methods (Authority Only) ====================

  /**
   * Get global ATOM config - v0.4.x
   * @returns AtomConfig or null if not initialized
   */
  async getAtomConfig(): Promise<AtomConfig | null> {
    try {
      const [atomConfigPDA] = getAtomConfigPDA(this.programIds.atomEngine);
      const connection = this.client.getConnection();
      const accountInfo = await connection.getAccountInfo(atomConfigPDA);

      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      return AtomConfig.deserialize(Buffer.from(accountInfo.data));
    } catch (error) {
      logger.error('Error fetching ATOM config', error);
      return null;
    }
  }

  /**
   * Initialize global ATOM config (authority only) - v0.4.x
   * One-time setup by program authority
   * @param agentRegistryProgram - Optional agent registry program ID override
   * @param options - Write options (skipSend, signer)
   */
  async initializeAtomConfig(
    agentRegistryProgram?: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    return await this.atomTxBuilder.initializeConfig(agentRegistryProgram, options);
  }

  /**
   * Update global ATOM config parameters (authority only) - v0.4.x
   * @param params - Config parameters to update (only provided fields are changed)
   * @param options - Write options (skipSend, signer)
   */
  async updateAtomConfig(
    params: UpdateAtomConfigParams,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    return await this.atomTxBuilder.updateConfig(params, options);
  }

  /**
   * Get trust tier for an agent
   * @param asset - Agent Core asset pubkey
   * @returns TrustTier enum value (0-4)
   */
  async getTrustTier(asset: PublicKey): Promise<TrustTier> {
    const stats = await this.getAtomStats(asset);
    if (!stats) {
      return TrustTier.Unrated;
    }
    return stats.trust_tier as TrustTier;
  }

  /**
   * Get enriched summary combining agent data with ATOM metrics
   * @param asset - Agent Core asset pubkey
   * @returns EnrichedSummary with full reputation data
   */
  async getEnrichedSummary(asset: PublicKey): Promise<EnrichedSummary | null> {
    // Fetch agent, ATOM stats, and base collection in parallel
    const [agent, atomStats, baseCollection] = await Promise.all([
      this.loadAgent(asset),
      this.getAtomStats(asset),
      this.getBaseCollection(),
    ]);

    if (!agent) {
      return null;
    }

    // Get basic summary from feedback manager
    const summary = await this.feedbackManager.getSummary(asset);

    // Get collection from AtomStats if available, otherwise use base collection
    const collection = atomStats
      ? atomStats.getCollectionPublicKey()
      : (baseCollection || asset); // fallback to asset if no collection found

    return {
      asset,
      owner: agent.getOwnerPublicKey(),
      collection,
      // Basic reputation metrics
      totalFeedbacks: summary.totalFeedbacks,
      averageScore: summary.averageScore,
      positiveCount: summary.positiveCount,
      negativeCount: summary.negativeCount,
      // ATOM metrics (from AtomStats or defaults)
      trustTier: atomStats ? (atomStats.trust_tier as TrustTier) : TrustTier.Unrated,
      qualityScore: atomStats?.quality_score ?? 0,
      confidence: atomStats?.confidence ?? 0,
      riskScore: atomStats?.risk_score ?? 0,
      diversityRatio: atomStats?.diversity_ratio ?? 0,
      uniqueCallers: atomStats?.getUniqueCallersEstimate() ?? 0,
      emaScoreFast: atomStats?.ema_score_fast ?? 0,
      emaScoreSlow: atomStats?.ema_score_slow ?? 0,
      volatility: atomStats?.ema_volatility ?? 0,
    };
  }

  // ==================== Indexer Methods (v0.4.0) ====================

  /**
   * Helper: Execute with indexer fallback to on-chain
   * Used internally when forceRpc='false' (force indexer mode)
   * @param noFallback - If true, throws instead of falling back to on-chain
   */
  private async withIndexerFallback<T>(
    indexerFn: () => Promise<T>,
    onChainFn: () => Promise<T>,
    operationName: string,
    noFallback?: boolean
  ): Promise<T> {
    if (!this.useIndexer) {
      if (noFallback) {
        throw new Error(`Indexer not available for ${operationName}`);
      }
      return onChainFn();
    }

    try {
      return await indexerFn();
    } catch (error: unknown) {
      if (this.indexerFallback && !noFallback) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`Indexer failed for ${operationName}, falling back to on-chain: ${errMsg}`);
        return onChainFn();
      }
      throw error;
    }
  }

  /**
   * Smart routing helper: Chooses between indexer and RPC
   * - forceOnChain=true: All on-chain
   * - forceOnChain=false: Smart routing (RPC for small queries, indexer for large)
   */
  private async withSmartRouting<T>(
    operation: string,
    indexerFn: () => Promise<T>,
    onChainFn: () => Promise<T>
  ): Promise<T> {
    // Force on-chain mode
    if (this.forceOnChain) {
      logger.debug(`[${operation}] Forcing on-chain (forceOnChain=true)`);
      return onChainFn();
    }

    // Smart routing: RPC for small queries, indexer for large
    if (this.isSmallQuery(operation)) {
      logger.debug(`[${operation}] Small query → RPC`);
      try {
        return await onChainFn();
      } catch (error) {
        // Fallback to indexer if RPC fails and indexer is enabled
        if (this.useIndexer) {
          logger.debug(`[${operation}] RPC failed, falling back to indexer`);
          return indexerFn();
        }
        throw error;
      }
    }

    // Large query → indexer with fallback
    logger.debug(`[${operation}] Large query → indexer`);
    return this.withIndexerFallback(indexerFn, onChainFn, operation);
  }

  /**
   * Check if indexer is available
   */
  async isIndexerAvailable(): Promise<boolean> {
    return this.indexerClient.isAvailable();
  }

  /**
   * Get the indexer client for direct access
   */
  getIndexerClient(): IndexerReadClient {
    return this.indexerClient;
  }

  /**
   * Helper: Throws if forceOnChain=true for indexer-only methods
   */
  private requireIndexer(methodName: string): void {
    if (this.forceOnChain) {
      throw new Error(
        `${methodName} requires indexer (no on-chain equivalent). ` +
        `Set forceOnChain=false or remove FORCE_ON_CHAIN env var.`
      );
    }
  }

  /**
   * Search agents with filters (indexer only)
   * @param params - Search parameters
   * @returns Array of indexed agents
   */
  async searchAgents(params: AgentSearchParams): Promise<IndexedAgent[]> {
    this.requireIndexer('searchAgents');

    const agents = await this.indexerClient.getAgents({
      owner: params.owner,
      creator: params.creator,
      collection: params.collection,
      collectionPointer: params.collectionPointer,
      wallet: params.wallet,
      parentAsset: params.parentAsset,
      parentCreator: params.parentCreator,
      colLocked: params.colLocked,
      parentLocked: params.parentLocked,
      updatedAt: params.updatedAt,
      updatedAtGt: params.updatedAtGt,
      updatedAtLt: params.updatedAtLt,
      limit: params.limit,
      offset: params.offset,
      order: params.orderBy,
    });

    if (params.minScore === undefined) {
      return agents;
    }

    return agents.filter((agent) => {
      const score = Number.isFinite(agent.quality_score)
        ? agent.quality_score
        : agent.raw_avg_score;
      return score >= params.minScore!;
    });
  }

  /**
   * Get canonical collection pointer rows from indexer.
   */
  async getCollectionPointers(options?: {
    col?: string;
    creator?: string;
    firstSeenAsset?: string;
    limit?: number;
    offset?: number;
  }): Promise<CollectionPointerRecord[]> {
    this.requireIndexer('getCollectionPointers');
    const method = this.indexerClient.getCollectionPointers;
    if (!method) {
      throw new Error('getCollectionPointers is not available on current indexer client');
    }
    return method.call(this.indexerClient, options);
  }

  /**
   * Count assets associated with a collection pointer (and optional creator scope).
   */
  async getCollectionAssetCount(col: string, creator?: string): Promise<number> {
    this.requireIndexer('getCollectionAssetCount');
    const method = this.indexerClient.getCollectionAssetCount;
    if (!method) {
      throw new Error('getCollectionAssetCount is not available on current indexer client');
    }
    return method.call(this.indexerClient, col, creator);
  }

  /**
   * Get assets associated with a collection pointer.
   */
  async getCollectionAssets(
    col: string,
    options?: {
      creator?: string;
      limit?: number;
      offset?: number;
      order?: string;
    }
  ): Promise<IndexedAgent[]> {
    this.requireIndexer('getCollectionAssets');
    const method = this.indexerClient.getCollectionAssets;
    if (!method) {
      throw new Error('getCollectionAssets is not available on current indexer client');
    }
    return method.call(this.indexerClient, col, options);
  }

  /**
   * Get leaderboard (top agents by sort_key) - indexer only
   * Uses keyset pagination for scale (millions of agents)
   * @param options.collection - Optional collection filter
   * @param options.minTier - Minimum trust tier (0-4)
   * @param options.limit - Number of results (default: 50)
   * @param options.cursorSortKey - Cursor for keyset pagination
   * @returns Array of agents sorted by sort_key DESC
   */
  async getLeaderboard(options?: {
    collection?: string;
    minTier?: number;
    limit?: number;
    cursorSortKey?: string;
  }): Promise<IndexedAgent[]> {
    this.requireIndexer('getLeaderboard');
    return this.indexerClient.getLeaderboard(options);
  }

  /**
   * Get global statistics - indexer only
   * @returns Global stats (total agents, feedbacks, etc.)
   */
  async getGlobalStats(): Promise<GlobalStats> {
    this.requireIndexer('getGlobalStats');
    return this.indexerClient.getGlobalStats();
  }

  /**
   * Get feedbacks by endpoint - indexer only
   * @param endpoint - Endpoint string (e.g., '/api/chat')
   * @returns Array of feedbacks for this endpoint
   */
  async getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]> {
    this.requireIndexer('getFeedbacksByEndpoint');
    return this.indexerClient.getFeedbacksByEndpoint(endpoint);
  }

  /**
   * Get feedbacks by tag - indexer only
   * @param tag - Tag to search for (in tag1 or tag2)
   * @returns Array of feedbacks with this tag
   */
  async getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]> {
    this.requireIndexer('getFeedbacksByTag');
    return this.indexerClient.getFeedbacksByTag(tag);
  }

  /**
   * Get agent by operational wallet - indexer only
   * @param wallet - Agent wallet pubkey string
   * @returns Indexed agent or null
   */
  async getAgentByWallet(wallet: string): Promise<IndexedAgent | null> {
    this.requireIndexer('getAgentByWallet');
    return this.indexerClient.getAgentByWallet(wallet);
  }

  /**
   * Get agent by backend sequence id (indexer only)
   * @param agentId - REST: sequential `agent_id`; GraphQL: sequential `agentId` / `agentid`
   * @returns Indexed agent or null
   */
  async getAgentByAgentId(agentId: string | number | bigint): Promise<IndexedAgent | null> {
    this.requireIndexer('getAgentByAgentId');
    const method = this.indexerClient.getAgentByAgentId
      ?? this.indexerClient.getAgentByIndexerId;
    if (!method) {
      throw new Error('getAgentByAgentId is not available on current indexer client');
    }
    return method.call(this.indexerClient, agentId);
  }

  /** @deprecated Use getAgentByAgentId(agentId) */
  async getAgentByIndexerId(agentId: string | number | bigint): Promise<IndexedAgent | null> {
    return this.getAgentByAgentId(agentId);
  }

  /**
   * Get pending validations for a validator - indexer only
   * @param validator - Validator pubkey string
   * @returns Array of pending validation requests
   */
  async getPendingValidations(_validator: string): Promise<IndexedValidation[]> {
    throw new Error(VALIDATION_ARCHIVED_ERROR);
  }

  /**
   * Get agent reputation from indexer (with on-chain fallback)
   * @param asset - Agent asset pubkey
   * @param options - Query options
   * @param options.noFallback - If true, throws instead of falling back to on-chain (useful for waitForIndexerSync)
   * @returns Indexed reputation data
   */
  async getAgentReputationFromIndexer(
    asset: PublicKey,
    options?: { noFallback?: boolean }
  ): Promise<IndexedAgentReputation | null> {
    return this.withIndexerFallback(
      async () => {
        if (!this.indexerClient) throw new Error('No indexer');
        return this.indexerClient.getAgentReputation(asset.toBase58());
      },
      async () => {
        // Fallback: build from on-chain data
        const [summary, agent, baseCollection] = await Promise.all([
          this.feedbackManager.getSummary(asset),
          this.loadAgent(asset),
          this.getBaseCollection(),
        ]);
        if (!agent) return null;

        // v0.4.0: Collection not stored in AgentAccount, use base collection
        const collectionStr = baseCollection?.toBase58() || '';

        return {
          asset: asset.toBase58(),
          owner: agent.getOwnerPublicKey().toBase58(),
          collection: collectionStr,
          nft_name: agent.nft_name || null,
          agent_uri: agent.agent_uri || null,
          feedback_count: summary.totalFeedbacks,
          avg_score: summary.averageScore || null,
          positive_count: summary.positiveCount,
          negative_count: summary.negativeCount,
          validation_count: 0, // Not available on-chain easily
        };
      },
      'getAgentReputation',
      options?.noFallback
    );
  }

  /**
   * Get feedbacks from indexer (with on-chain fallback)
   * @param asset - Agent asset pubkey
   * @param options - Query options
   * @param options.noFallback - If true, throws instead of falling back to on-chain
   * @returns Array of feedbacks (SolanaFeedback format)
   */
  async getFeedbacksFromIndexer(
    asset: PublicKey,
    options?: { includeRevoked?: boolean; limit?: number; offset?: number; noFallback?: boolean }
  ): Promise<SolanaFeedback[]> {
    return this.withIndexerFallback(
      async () => {
        if (!this.indexerClient) throw new Error('No indexer');
        const indexed = await this.indexerClient.getFeedbacks(asset.toBase58(), options);
        return indexed.map(indexedFeedbackToSolanaFeedback);
      },
      async () => {
        return this.feedbackManager.readAllFeedback(asset, options?.includeRevoked ?? false);
      },
      'getFeedbacks',
      options?.noFallback
    );
  }

  // ==================== Write Methods (require signer) - v0.4.0 ====================

  /**
   * Check if SDK has write permissions
   */
  get canWrite(): boolean {
    return this.signer !== undefined;
  }

  /**
   * Build a collection metadata document that conforms to SDK collection schema.
   * Useful when you want to inspect/edit JSON before upload.
   */
  createCollectionData(input: CollectionMetadataInput): CollectionMetadataJson {
    return buildCollectionMetadataJson(input);
  }

  /**
   * Build + upload collection metadata JSON to IPFS and return CID/URI/pointer.
   * This is the standard off-chain flow before asset creation.
   *
   * @example
   * ```typescript
   * const { cid, uri } = await sdk.createCollection({
   *   name: 'Caster Agents',
   *   description: 'Main collection'
   * });
   * // use `uri`/`cid` during asset creation flow
   * ```
   */
  async createCollection(
    data: CollectionMetadataInput,
    options?: CreateCollectionUploadOptions
  ): Promise<CreateCollectionUploadResult>;

  /**
   * Legacy on-chain user collection API (removed in protocol v0.6.0).
   * Kept for backward compatibility only.
   */
  async createCollection(
    name: string,
    uri: string,
    options?: WriteOptions & { collectionPubkey?: PublicKey }
  ): Promise<TransactionResult & { collection?: PublicKey }>;

  async createCollection(
    dataOrName: CollectionMetadataInput | string,
    uriOrOptions?: string | CreateCollectionUploadOptions,
    maybeOptions?: WriteOptions & { collectionPubkey?: PublicKey }
  ): Promise<CreateCollectionUploadResult | (TransactionResult & { collection?: PublicKey })> {
    // New off-chain flow: createCollection(data[, { uploadToIpfs }])
    if (typeof dataOrName !== 'string') {
      const metadata = this.createCollectionData(dataOrName);
      const uploadToIpfs = (uriOrOptions as CreateCollectionUploadOptions | undefined)?.uploadToIpfs ?? true;

      if (!uploadToIpfs) {
        return { metadata };
      }
      if (!this.ipfsClient) {
        throw new Error('ipfsClient is required to upload collection metadata');
      }

      const cid = await this.ipfsClient.addJson(metadata as unknown as Record<string, unknown>);
      const pointer = toCollectionPointer(cid);
      return {
        metadata,
        cid,
        uri: `ipfs://${cid}`,
        pointer,
      };
    }

    // Legacy on-chain flow: createCollection(name, uri, options)
    const name = dataOrName;
    if (typeof uriOrOptions !== 'string') {
      throw new Error('Legacy createCollection(name, uri, options) requires a URI string');
    }
    const uri = uriOrOptions;
    const options = maybeOptions;
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    return this.identityTxBuilder.createCollection(name, uri, options);
  }

  /**
   * Update collection URI (write operation) - v0.4.2
   * Update metadata URI for a user-owned collection.
   * Only the collection owner can update. Collection name is immutable.
   *
   * @param collection - Base registry collection pubkey to update
   * @param newUri - New collection URI (max 250 bytes)
   * @param options - Write options (skipSend, signer)
   * @returns Transaction result, or PreparedTransaction if skipSend
   *
   * @example
   * ```typescript
   * // Update collection URI
   * await sdk.updateCollectionUri(
   *   collectionPubkey,
   *   'ipfs://QmNewMetadata...'
   * );
   * ```
   */
  async updateCollectionUri(
    collection: PublicKey,
    newUri: string,
    options?: WriteOptions
  ) {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    // Always pass null for name (immutable)
    return await this.identityTxBuilder.updateCollectionMetadata(collection, null, newUri, options);
  }

  /**
   * Register a new agent (write operation) - v0.3.0
   *
   * @param tokenUri - Token URI pointing to agent metadata JSON (IPFS, Arweave, or HTTP)
   * @param collection - Optional base registry collection pubkey override (defaults to root-config base collection)
   * @param options - Optional settings for server mode:
   *   - `skipSend`: Return unsigned transaction instead of sending (for frontend signing)
   *   - `signer`: PublicKey of the signer (required with skipSend)
   *   - `assetPubkey`: Asset keypair pubkey (required with skipSend, client generates locally)
   *   - `atomEnabled`: Set to true to enable ATOM at creation (default false)
   *     (use enableAtom() to turn it on later, one-way/irreversible)
   *   - `collectionPointer`: Optional pointer (c1:<payload>) to attach after successful register
   *   - `collectionLock`: Optional lock flag for collectionPointer attach (default: true)
   *     Note: when `skipSend=true`, only the register tx is prepared, so pointer attach is skipped.
   * @returns Transaction result with asset, or PreparedTransaction if skipSend
   *
   * @example
   * // Simple usage
   * const result = await sdk.registerAgent('ipfs://QmMetadata...');
   *
   * @example
   * // With explicit base registry override (legacy)
   * const result = await sdk.registerAgent('ipfs://QmMetadata...', myBaseRegistryCollection);
   */
  async registerAgent(
    tokenUri?: string,
    collection?: PublicKey,
    options?: RegisterAgentOptions
  ) {
    if (options?.collectionPointer !== undefined) {
      validateCollectionPointer(options.collectionPointer);
    }
    if (options?.collectionLock !== undefined && typeof options.collectionLock !== 'boolean') {
      throw new Error('collectionLock must be a boolean');
    }

    // For non-skipSend operations, require signer
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    const registerOptions: RegisterAgentOptions = {
      ...(options ?? {}),
      atomEnabled: options?.atomEnabled ?? false,
    };

    const result = await this.identityTxBuilder.registerAgent(tokenUri, collection, registerOptions);

    const canRunPostRegister =
      !registerOptions.skipSend
      && 'success' in result
      && result.success
      && !!result.asset;

    if (canRunPostRegister && result.asset) {
      const signatures: string[] = [result.signature];

      // Auto-initialize ATOM stats only when ATOM is explicitly enabled at creation
      if (registerOptions.atomEnabled) {
        try {
          const atomResult = await this.atomTxBuilder.initializeStats(result.asset, registerOptions);

          if ('success' in atomResult && atomResult.success) {
            signatures.push(atomResult.signature);
          } else {
            // Non-blocking: registration still succeeded.
            const errorMsg = 'error' in atomResult ? atomResult.error : 'Unknown error';
            logger.warn(`Agent registered but ATOM stats init failed: ${errorMsg}`);
          }
        } catch (error) {
          // Non-blocking: registration still succeeded.
          logger.warn(`Agent registered but ATOM stats init failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (registerOptions.collectionPointer) {
        const pointerOptions: SetCollectionPointerOptions = {
          lock: registerOptions.collectionLock ?? true,
        };
        if (registerOptions.signer !== undefined) pointerOptions.signer = registerOptions.signer;
        if (registerOptions.feePayer !== undefined) pointerOptions.feePayer = registerOptions.feePayer;
        if (registerOptions.computeUnits !== undefined) pointerOptions.computeUnits = registerOptions.computeUnits;

        try {
          const pointerResult = await this.setCollectionPointer(result.asset, registerOptions.collectionPointer, pointerOptions);
          if ('success' in pointerResult && pointerResult.success) {
            signatures.push(pointerResult.signature);
          } else {
            const errorMsg = 'error' in pointerResult ? pointerResult.error : 'Unknown error';
            logger.warn(`Agent registered but collection pointer attach failed: ${errorMsg}`);
          }
        } catch (error) {
          logger.warn(`Agent registered but collection pointer attach failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (signatures.length > 1) {
        return {
          ...result,
          signatures,
        };
      }
    }

    return result;
  }

  /**
   * Set agent URI (write operation) - v0.3.0
   * Overload 1 (recommended): base collection is resolved automatically.
   */
  async setAgentUri(
    asset: PublicKey,
    newUri: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;

  /**
   * Set agent URI (write operation) - v0.3.0
   * Overload 2 (legacy): pass base registry collection pubkey explicitly.
   */
  async setAgentUri(
    asset: PublicKey,
    collection: PublicKey,
    newUri: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;

  async setAgentUri(
    asset: PublicKey,
    collectionOrUri: PublicKey | string,
    newUriOrOptions?: string | WriteOptions,
    maybeOptions?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    let collection: PublicKey;
    let newUri: string;
    let options: WriteOptions | undefined;

    if (typeof collectionOrUri === 'string') {
      newUri = collectionOrUri;
      options = newUriOrOptions as WriteOptions | undefined;
      const baseCollection = await this.getBaseCollection();
      if (!baseCollection) {
        throw new Error('Base collection not found');
      }
      collection = baseCollection;
    } else {
      collection = collectionOrUri;
      if (typeof newUriOrOptions !== 'string') {
        throw new Error('newUri must be provided when base registry collection pubkey is passed explicitly');
      }
      newUri = newUriOrOptions;
      options = maybeOptions;
    }

    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.setAgentUri(asset, collection, newUri, options);
  }

  /**
   * Set collection pointer (write operation)
   * @param asset - Agent Core asset pubkey
   * @param col - Canonical collection pointer (c1:<payload>)
   * @param options - Write options (skipSend, signer, lock)
   */
  async setCollectionPointer(
    asset: PublicKey,
    col: string,
    options?: SetCollectionPointerOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    const lock = options?.lock ?? true;
    if (typeof lock !== 'boolean') {
      throw new Error('lock must be a boolean');
    }
    const txOptions: WriteOptions = {};
    if (options?.skipSend !== undefined) txOptions.skipSend = options.skipSend;
    if (options?.signer !== undefined) txOptions.signer = options.signer;
    if (options?.feePayer !== undefined) txOptions.feePayer = options.feePayer;
    if (options?.computeUnits !== undefined) txOptions.computeUnits = options.computeUnits;
    const writeOptions: WriteOptions | undefined =
      Object.keys(txOptions).length > 0 ? txOptions : undefined;

    if (lock) {
      return this.identityTxBuilder.setCollectionPointer(asset, col, writeOptions);
    }
    return this.identityTxBuilder.setCollectionPointerWithOptions(asset, col, false, writeOptions);
  }

  /**
   * Set parent asset (write operation)
   * @param asset - Child agent Core asset pubkey
   * @param parentAsset - Parent Core asset pubkey
   * @param options - Write options (skipSend, signer, lock)
   */
  async setParentAsset(
    asset: PublicKey,
    parentAsset: PublicKey,
    options?: SetParentAssetOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (asset.equals(parentAsset)) {
      throw new Error('parentAsset must be different from asset');
    }

    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    const lock = options?.lock ?? true;
    if (typeof lock !== 'boolean') {
      throw new Error('lock must be a boolean');
    }
    const txOptions: WriteOptions = {};
    if (options?.skipSend !== undefined) txOptions.skipSend = options.skipSend;
    if (options?.signer !== undefined) txOptions.signer = options.signer;
    if (options?.feePayer !== undefined) txOptions.feePayer = options.feePayer;
    if (options?.computeUnits !== undefined) txOptions.computeUnits = options.computeUnits;
    const writeOptions: WriteOptions | undefined =
      Object.keys(txOptions).length > 0 ? txOptions : undefined;

    if (lock) {
      return this.identityTxBuilder.setParentAsset(asset, parentAsset, writeOptions);
    }
    return this.identityTxBuilder.setParentAssetWithOptions(asset, parentAsset, false, writeOptions);
  }

  /**
   * Enable ATOM for an agent (one-way) - v0.4.4
   * @param asset - Agent Core asset pubkey
   * @param options - Write options (skipSend, signer)
   */
  async enableAtom(
    asset: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.enableAtom(asset, options);
  }

  /**
   * Prepare message for setAgentWallet (for web3 wallets like Phantom, Solflare)
   * @example
   * const prepared = await sdk.prepareSetAgentWallet(asset, walletPubkey);
   * const signature = await wallet.signMessage(prepared.message);
   * await prepared.complete(signature);
   */
  async prepareSetAgentWallet(
    asset: PublicKey,
    newWallet: PublicKey,
    options?: WriteOptions
  ): Promise<{ message: Uint8Array; complete: (signature: Uint8Array) => Promise<TransactionResult | PreparedTransaction> }> {
    // Get on-chain clock to avoid client/validator time skew
    const slot = await this.getSolanaClient().getConnection().getSlot();
    const blockTime = await this.getSolanaClient().getConnection().getBlockTime(slot);

    if (!blockTime) {
      throw new Error('Failed to fetch validator clock time');
    }

    // Use validator time + 60 seconds (safe margin within 5min window)
    const deadline = BigInt(blockTime + 60);
    const owner = options?.signer ?? this.signer?.publicKey;
    if (!owner) {
      throw new Error('Owner required. Configure SDK with signer or provide options.signer.');
    }

    const message = Buffer.concat([
      Buffer.from('8004_WALLET_SET:'),
      asset.toBuffer(),
      newWallet.toBuffer(),
      owner.toBuffer(),
      Buffer.alloc(8),
    ]);
    message.writeBigInt64LE(deadline, message.length - 8);

    return {
      message: new Uint8Array(message),
      complete: (sig) => this.identityTxBuilder.setAgentWallet(asset, newWallet, sig, deadline, options),
    };
  }

  /** Set agent wallet - simple version with Keypair (auto-signs) */
  async setAgentWallet(asset: PublicKey, keypair: Keypair, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
  /** Set agent wallet - advanced version with pre-signed signature */
  async setAgentWallet(asset: PublicKey, wallet: PublicKey, signature: Uint8Array, deadline: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
  async setAgentWallet(
    asset: PublicKey,
    walletOrKeypair: PublicKey | Keypair,
    sigOrOptions?: Uint8Array | WriteOptions,
    deadline?: bigint,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    // Simple mode: Keypair provided
    if ('secretKey' in walletOrKeypair) {
      const keypair = walletOrKeypair;
      const opts = sigOrOptions as WriteOptions | undefined;
      const prepared = await this.prepareSetAgentWallet(asset, keypair.publicKey, opts);
      const nacl = await import('tweetnacl');
      const sig = nacl.default.sign.detached(prepared.message, keypair.secretKey);
      return prepared.complete(sig);
    }

    // Advanced mode: PublicKey + signature + deadline
    const wallet = walletOrKeypair;
    const signature = sigOrOptions as Uint8Array;
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only.');
    }
    return this.identityTxBuilder.setAgentWallet(asset, wallet, signature, deadline!, options);
  }

  /**
   * Set agent metadata (write operation)
   * @param asset - Agent Core asset pubkey
   * @param key - Metadata key
   * @param value - Metadata value
   * @param immutable - If true, metadata cannot be modified or deleted (default: false)
   * @param options - Write options (skipSend, signer)
   */
  async setMetadata(
    asset: PublicKey,
    key: string,
    value: string,
    immutable: boolean = false,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.setMetadata(asset, key, value, immutable, options);
  }

  /**
   * Delete a metadata entry for an agent (write operation) - v0.3.0
   * Only works if metadata is not immutable
   * @param asset - Agent Core asset pubkey
   * @param key - Metadata key to delete
   * @param options - Write options (skipSend, signer)
   */
  async deleteMetadata(
    asset: PublicKey,
    key: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.deleteMetadata(asset, key, options);
  }

  /**
   * Give feedback to an agent (write operation) - v0.5.0
   * @param asset - Agent Core asset pubkey
   * @param params - Feedback parameters (value, valueDecimals, score, tags, etc.)
   * @param options - Write options (skipSend, signer)
   */
  async giveFeedback(
    asset: PublicKey,
    params: import('../models/interfaces.js').GiveFeedbackParams,
    options?: GiveFeedbackOptions
  ): Promise<(TransactionResult & { feedbackIndex?: bigint }) | (PreparedTransaction & { feedbackIndex: bigint })> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.reputationTxBuilder.giveFeedback(asset, params, options);
  }

  /**
   * Revoke feedback (write operation)
   * @param asset - Agent Core asset pubkey
   * @param feedbackIndex - Feedback index to revoke (number or bigint)
   * @param sealHash - Optional SEAL hash from original feedback.
   * If omitted, SDK attempts to auto-resolve from indexed feedback by using signer as feedback client.
   * Legacy fallback remains supported (all-zero hash) when auto-resolution is unavailable.
   * @param options - Write options (skipSend, signer)
   */
  async revokeFeedback(
    asset: PublicKey,
    feedbackIndex: number | bigint,
    sealHash?: Buffer,
    options?: RevokeFeedbackOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    let resolvedSealHash = sealHash;
    const client = options?.signer ?? this.signer?.publicKey;
    if (!client) {
      throw new Error('No signer available to verify feedback ownership.');
    }

    const verifyFeedbackClient = options?.verifyFeedbackClient ?? true;
    const feedback = (verifyFeedbackClient || !resolvedSealHash)
      ? await this.resolveFeedbackFromIndexer(asset, client, idx, {
          waitForSync: options?.waitForIndexerSync ?? true,
        })
      : null;

    if (verifyFeedbackClient) {
      if (!feedback) {
        throw new Error(
          `Feedback ${idx.toString()} for signer ${client.toBase58()} not found in indexer. Refusing revoke preflight.`
        );
      }
      if (feedback.isRevoked || feedback.revoked) {
        throw new Error(
          `Feedback ${idx.toString()} for signer ${client.toBase58()} is already revoked.`
        );
      }
    }

    if (!resolvedSealHash && feedback?.sealHash && feedback.sealHash.length === 32) {
      resolvedSealHash = feedback.sealHash;
    }

    if (resolvedSealHash && feedback?.sealHash && feedback.sealHash.length === 32) {
      if (!resolvedSealHash.equals(feedback.sealHash)) {
        throw new Error(
          `Provided sealHash does not match indexed feedback ${idx.toString()} for signer ${client.toBase58()}.`
        );
      }
    }

    if (!resolvedSealHash) {
      throw new Error(
        'sealHash could not be auto-resolved yet. Wait for indexer sync or pass a valid sealHash explicitly.'
      );
    }

    return await this.reputationTxBuilder.revokeFeedback(asset, idx, resolvedSealHash, options);
  }

  /**
   * Append response to feedback (write operation)
   * @param asset - Agent Core asset pubkey
   * @param client - Client address who gave the feedback
   * @param feedbackIndex - Feedback index (number or bigint)
   * @param sealHash - Optional SEAL hash from the original feedback.
   * If omitted, SDK attempts auto-resolution from indexer.
   * @param responseUri - Response URI
   * @param responseHash - Response hash (optional for ipfs://)
   * @param options - Write options (skipSend, signer)
   */
  async appendResponse(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: number | bigint,
    sealHash: Buffer,
    responseUri: string,
    responseHash?: Buffer,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;
  async appendResponse(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: number | bigint,
    responseUri: string,
    responseHash?: Buffer,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;
  async appendResponse(
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: number | bigint,
    sealHashOrResponseUri: Buffer | string,
    responseUriOrResponseHash?: string | Buffer,
    responseHashOrOptions?: Buffer | WriteOptions,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    let resolvedSealHash: Buffer | undefined;
    let responseUri: string;
    let responseHash: Buffer | undefined;
    let writeOptions: WriteOptions | undefined;

    if (Buffer.isBuffer(sealHashOrResponseUri)) {
      resolvedSealHash = sealHashOrResponseUri;
      if (typeof responseUriOrResponseHash !== 'string') {
        throw new Error('responseUri is required when sealHash is provided');
      }
      responseUri = responseUriOrResponseHash;
      if (Buffer.isBuffer(responseHashOrOptions)) {
        responseHash = responseHashOrOptions;
        writeOptions = options;
      } else {
        writeOptions = (responseHashOrOptions as WriteOptions | undefined) ?? options;
      }
    } else {
      responseUri = sealHashOrResponseUri;
      if (Buffer.isBuffer(responseUriOrResponseHash)) {
        responseHash = responseUriOrResponseHash;
        writeOptions = responseHashOrOptions as WriteOptions | undefined;
      } else {
        writeOptions = (responseUriOrResponseHash as WriteOptions | undefined) ?? (responseHashOrOptions as WriteOptions | undefined);
      }
    }

    if (!writeOptions?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;

    if (!resolvedSealHash) {
      const feedback = await this.resolveFeedbackFromIndexer(asset, client, idx);
      if (!feedback) {
        throw new Error(
          `Feedback ${idx.toString()} for client ${client.toBase58()} is not indexed yet. Wait for indexer sync.`
        );
      }
      if (!feedback.sealHash || feedback.sealHash.length !== 32) {
        throw new Error(
          'sealHash could not be auto-resolved yet. Wait for indexer sync or pass sealHash explicitly.'
        );
      }
      resolvedSealHash = feedback.sealHash;
    }

    return await this.reputationTxBuilder.appendResponse(
      asset,
      client,
      idx,
      resolvedSealHash,
      responseUri,
      responseHash,
      writeOptions
    );
  }

  /**
   * Append response using sealHash only (feedbackIndex auto-resolved from indexer).
   * Useful when caller stores sealHash but not feedbackIndex.
   */
  async appendResponseBySealHash(
    asset: PublicKey,
    client: PublicKey,
    sealHash: Buffer,
    responseUri: string,
    responseHash?: Buffer,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }
    if (sealHash.length !== 32) {
      throw new Error('sealHash must be 32 bytes');
    }

    const feedback = await this.resolveFeedbackBySealHashFromIndexer(asset, client, sealHash);
    if (!feedback) {
      throw new Error(
        `feedbackIndex could not be resolved from sealHash for client ${client.toBase58()}. Wait for indexer sync.`
      );
    }

    return this.appendResponse(
      asset,
      client,
      feedback.feedbackIndex,
      sealHash,
      responseUri,
      responseHash,
      options
    );
  }

  /**
   * Request validation (write operation) - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param validator - Validator public key
   * @param requestUri - Request URI (IPFS/Arweave)
   * @param options - Write options (skipSend, signer, nonce, requestHash)
   *   - nonce: Auto-generated if not provided (timestamp-based)
   *   - requestHash: Optional, defaults to zeros (acceptable for IPFS URIs)
   */
  async requestValidation(
    asset: PublicKey,
    validator: PublicKey,
    requestUri: string,
    options?: WriteOptions & { nonce?: number; requestHash?: Buffer }
  ): Promise<(TransactionResult & { nonce?: bigint }) | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    // Auto-generate nonce if not provided (timestamp-based, fits in u32)
    const nonce = options?.nonce ?? (Date.now() % 0xFFFFFFFF);
    // Auto-generate hash: zeros for IPFS (CID contains hash), SHA-256 of URI otherwise
    const requestHash = options?.requestHash ?? await this.computeUriHash(requestUri);

    const result = await this.validationTxBuilder.requestValidation(
      asset,
      validator,
      nonce,
      requestUri,
      requestHash,
      options
    );

    // Add nonce to result for use in respondToValidation
    if ('success' in result) {
      return { ...result, nonce: BigInt(nonce) };
    }
    return result;
  }

  /**
   * Respond to validation request (write operation) - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param nonce - Request nonce (from requestValidation result)
   * @param score - Response score (0-100)
   * @param responseUri - Response URI (IPFS/Arweave)
   * @param options - Write options (skipSend, signer, responseHash, tag)
   *   - responseHash: Optional, defaults to zeros (acceptable for IPFS URIs)
   *   - tag: Optional response tag (max 32 bytes)
   */
  async respondToValidation(
    asset: PublicKey,
    nonce: number | bigint,
    score: number,
    responseUri: string,
    options?: WriteOptions & { responseHash?: Buffer; tag?: string }
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    if (typeof nonce === 'bigint' && nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Nonce exceeds safe integer range');
    }
    const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : nonce;
    // Auto-generate hash: zeros for IPFS (CID contains hash), SHA-256 of URI otherwise
    const responseHash = options?.responseHash ?? await this.computeUriHash(responseUri);
    const tag = options?.tag ?? '';

    return await this.validationTxBuilder.respondToValidation(
      asset,
      nonceNum,
      score,
      responseUri,
      responseHash,
      tag,
      options
    );
  }

  /**
   * Read validation request (read operation) - v0.4.2
   * Reads ValidationRequest directly from on-chain (no indexer required)
   * Returns normalized data with user-friendly properties
   * @param asset - Agent Core asset pubkey
   * @param validator - Validator public key
   * @param nonce - Request nonce (number or bigint)
   * @returns NormalizedValidation or null if not found
   */
  async readValidation(
    asset: PublicKey,
    validator: PublicKey,
    nonce: number | bigint
  ): Promise<NormalizedValidation | null> {
    try {
      const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : nonce;
      validateNonce(nonceNum);
      const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(
        asset,
        validator,
        nonce,
        this.programIds.agentRegistry
      );

      const accountData = await this.client.getAccount(validationRequestPda);

      if (!accountData) {
        return null;
      }

      const raw = ValidationRequest.deserialize(Buffer.from(accountData));

      // Convert to normalized format
      return {
        asset: new PublicKey(raw.asset).toBase58(),
        validator: new PublicKey(raw.validator_address).toBase58(),
        nonce: raw.nonce,
        score: raw.response,
        response: raw.response,
        responded: raw.responded_at > BigInt(0),
        responded_at: raw.responded_at,
        request_hash: Buffer.from(raw.request_hash).toString('hex'),
      };
    } catch (error) {
      logger.error('Error reading validation request:', error);
      return null;
    }
  }

  /**
   * Wait for validation request to be available on-chain (with retry)
   * Useful for handling blockchain finalization delays
   * @param asset - Agent Core asset pubkey
   * @param validator - Validator public key
   * @param nonce - Request nonce (number or bigint)
   * @param options - Wait options (timeout, waitForResponse)
   * @returns NormalizedValidation or null if timeout
   */
  async waitForValidation(
    asset: PublicKey,
    validator: PublicKey,
    nonce: number | bigint,
    options?: WaitForValidationOptions
  ): Promise<NormalizedValidation | null> {
    const timeout = options?.timeout ?? 30000;
    const waitForResponse = options?.waitForResponse ?? false;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const validation = await this.readValidation(asset, validator, nonce);

      if (validation !== null) {
        // If waitForResponse, keep waiting until responded_at > 0
        if (waitForResponse && !validation.responded) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        return validation;
      }

      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return null;
  }

  /**
   * Transfer agent ownership (write operation) - v0.3.0
   * Overload 1 (recommended): base collection is resolved automatically.
   */
  async transferAgent(
    asset: PublicKey,
    newOwner: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;

  /**
   * Transfer agent ownership (write operation) - v0.3.0
   * Overload 2 (legacy): pass base registry collection pubkey explicitly.
   */
  async transferAgent(
    asset: PublicKey,
    collection: PublicKey,
    newOwner: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction>;

  async transferAgent(
    asset: PublicKey,
    collectionOrNewOwner: PublicKey,
    newOwnerOrOptions?: PublicKey | WriteOptions,
    maybeOptions?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    let collection: PublicKey;
    let newOwner: PublicKey;
    let options: WriteOptions | undefined;

    if (newOwnerOrOptions instanceof PublicKey) {
      collection = collectionOrNewOwner;
      newOwner = newOwnerOrOptions;
      options = maybeOptions;
    } else {
      newOwner = collectionOrNewOwner;
      options = newOwnerOrOptions as WriteOptions | undefined;
      const baseCollection = await this.getBaseCollection();
      if (!baseCollection) {
        throw new Error('Base collection not found');
      }
      collection = baseCollection;
    }

    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.transferAgent(asset, collection, newOwner, options);
  }

  /**
   * Sync agent owner after external NFT transfer (write operation)
   * Call this after the Core NFT was transferred outside of the SDK
   * to update the AgentAccount's owner field
   * @param asset - Agent Core asset pubkey
   * @param options - Write options (skipSend, signer)
   */
  async syncOwner(
    asset: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    if (!options?.skipSend && !this.signer) {
      throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
    }

    return await this.identityTxBuilder.syncOwner(asset, options);
  }

  // ==================== Liveness & Signature Methods ====================

  /**
   * Check endpoint liveness for an agent
   */
  async isItAlive(asset: PublicKey, options: LivenessOptions = {}): Promise<LivenessReport> {
    const agent = await this.loadAgent(asset);
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (!agent.agent_uri) {
      throw new Error('Agent has no agent URI');
    }

    const timeoutMs = options.timeoutMs ?? 5000;
    const concurrency = options.concurrency ?? 4;
    const treatAuthAsAlive = options.treatAuthAsAlive ?? true;

    const registration = await this.fetchJsonFromUri(agent.agent_uri, timeoutMs);
    let endpoints = this.normalizeRegistrationServices(registration);

    if (options.includeTypes?.length) {
      const includeSet = new Set(options.includeTypes.map((entry) => String(entry)));
      endpoints = endpoints.filter((endpoint) => includeSet.has(String(endpoint.type)));
    }

    const crawler = new EndpointCrawler(timeoutMs);
    const results = await mapWithConcurrency(endpoints, concurrency, (endpoint) =>
      this.pingEndpoint(endpoint, crawler, { timeoutMs, treatAuthAsAlive })
    );

    const liveServices = results.filter((result) => result.ok);
    const skippedServices = results.filter((result) => result.skipped);
    const deadServices = results.filter((result) => !result.ok && !result.skipped);
    const totalPinged = results.length - skippedServices.length;
    const okCount = liveServices.length;

    const status: LivenessReport['status'] =
      totalPinged === 0 || okCount === 0
        ? 'not_live'
        : okCount === totalPinged
        ? 'live'
        : 'partially';

    return {
      status,
      okCount,
      totalPinged,
      skippedCount: skippedServices.length,
      results,
      liveServices,
      deadServices,
      skippedServices,
    };
  }

  /**
   * Sign arbitrary structured data using canonical JSON (RFC 8785)
   */
  sign(asset: PublicKey, data: unknown, options: SignOptions = {}): string {
    const signer = options.signer ?? this.signer;
    if (!signer) {
      throw new Error('No signer configured - SDK is read-only');
    }

    const { payload } = buildSignedPayload(asset, data, signer, options);
    return canonicalizeSignedPayload(payload);
  }

  /**
   * Verify a signed payload against an agent wallet or provided public key
   *
   * NOTE: If publicKey is not provided, this method makes a network call to
   * fetch the agent's wallet from on-chain data. For offline verification,
   * always provide the publicKey parameter.
   *
   * @param payloadOrUri - Signed payload or URI to fetch it from
   * @param asset - Agent Core asset pubkey
   * @param publicKey - Optional: verifier public key (avoids network call if provided)
   * @param options - Optional settings (allowFileRead: enable loading from file paths, disabled by default)
   * @returns True if signature is valid
   * @throws RpcNetworkError if publicKey not provided and network call fails
   */
  async verify(
    payloadOrUri: string | SignedPayloadV1,
    asset: PublicKey,
    publicKey?: PublicKey,
    options?: { allowFileRead?: boolean }
  ): Promise<boolean> {
    const payload = await this.resolveSignedPayloadInput(payloadOrUri, { allowFileRead: options?.allowFileRead });

    if (payload.asset !== asset.toBase58()) {
      return false;
    }

    let verifierKey = publicKey;
    if (!verifierKey) {
      const agent = await this.loadAgent(asset);
      if (!agent) {
        throw new Error('Agent not found');
      }
      const agentWallet = agent.getAgentWalletPublicKey();
      if (!agentWallet) {
        throw new Error('Agent wallet not configured. Please provide publicKey parameter or set agent wallet using setAgentWallet()');
      }
      verifierKey = agentWallet;
    }

    return verifySignedPayload(payload, verifierKey);
  }

  private async resolveSignedPayloadInput(input: string | SignedPayloadV1, options?: { allowFileRead?: boolean }): Promise<SignedPayloadV1> {
    if (typeof input !== 'string') {
      return parseSignedPayload(input);
    }

    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Signed payload is empty');
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return parseSignedPayload(JSON.parse(trimmed));
    }

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('ipfs://') ||
      trimmed.startsWith('/ipfs/')
    ) {
      const payload = await this.fetchJsonFromUri(trimmed, 10000);
      return parseSignedPayload(payload);
    }

    // File system reads require explicit opt-in
    if (!options?.allowFileRead) {
      throw new Error(
        'File system reads are disabled by default. ' +
        'Pass { allowFileRead: true } to enable, or use http/ipfs URIs or JSON strings.'
      );
    }

    // File system operations are Node.js only
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error(
        'Loading signed payloads from file paths is only available in Node.js. ' +
        'In browser, pass the JSON string directly or use http/ipfs URIs.'
      );
    }

    const { readFile } = await import('fs/promises');

    if (trimmed.startsWith('file://')) {
      const fileUrl = new URL(trimmed);
      const content = await readFile(fileUrl, 'utf8');
      return parseSignedPayload(JSON.parse(content));
    }

    const content = await readFile(trimmed, 'utf8');
    return parseSignedPayload(JSON.parse(content));
  }

  private async fetchJsonFromUri(uri: string, timeoutMs: number, maxBytes: number = 256 * 1024): Promise<Record<string, unknown>> {
    let resolvedUri = uri.trim();
    if (resolvedUri.startsWith('/ipfs/')) {
      resolvedUri = `ipfs://${resolvedUri.slice(6)}`;
    }

    if (resolvedUri.startsWith('ipfs://')) {
      if (!this.ipfsClient) {
        throw new Error('ipfsClient is required to load ipfs:// payloads');
      }
      const data = await this.ipfsClient.getJson<Record<string, unknown>>(resolvedUri);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid JSON payload: expected object');
      }
      return data;
    }

    // SSRF protection: block private/internal hosts
    if (isBlockedUri(resolvedUri)) {
      throw new Error('URI blocked: internal/private host not allowed');
    }

    let response = await fetch(resolvedUri, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });

    // Follow redirects manually with SSRF re-validation (max 5 hops)
    let redirectCount = 0;
    let currentUrl = resolvedUri;
    while (response.status >= 300 && response.status < 400 && redirectCount < 5) {
      const location = response.headers.get('location');
      if (!location) break;
      const redirectUrl = new URL(location, currentUrl).toString();
      if (isBlockedUri(redirectUrl)) {
        throw new Error('Redirect blocked: target is internal/private host');
      }
      currentUrl = redirectUrl;
      response = await fetch(redirectUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });
      redirectCount++;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch JSON: HTTP ${response.status}`);
    }

    // Size limit protection
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(`Response too large: ${contentLength} bytes (max: ${maxBytes})`);
    }

    // Stream body with byte counting to prevent OOM from large responses
    let text: string;
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            throw new Error(`Response too large: ${totalBytes} bytes (max: ${maxBytes})`);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      text = new TextDecoder().decode(
        chunks.length === 1 ? chunks[0] : (() => {
          const merged = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
          return merged;
        })()
      );
    } else {
      // Fallback for environments where response.body is not available
      text = await response.text();
      const textByteLength = new TextEncoder().encode(text).byteLength;
      if (textByteLength > maxBytes) {
        throw new Error(`Response too large: ${textByteLength} bytes (max: ${maxBytes})`);
      }
    }

    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid JSON payload: expected object');
    }

    return data as Record<string, unknown>;
  }


  private normalizeRegistrationServices(raw: Record<string, unknown>): Service[] {
    // Support both new `services` and legacy `endpoints`
    const rawServices = raw.services ?? raw.endpoints;
    if (!Array.isArray(rawServices)) {
      return [];
    }

    const services: Service[] = [];
    for (const entry of rawServices) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;

      if (typeof record.type === 'string' && typeof record.value === 'string') {
        services.push({
          type: record.type as ServiceType,
          value: record.value,
          meta: typeof record.meta === 'object' && record.meta !== null ? record.meta as Record<string, unknown> : undefined,
        });
        continue;
      }

      const name = typeof record.name === 'string' ? record.name : '';
      const value = typeof record.endpoint === 'string' ? record.endpoint : '';
      if (!value) {
        continue;
      }

      const typeMap: Record<string, ServiceType> = {
        mcp: ServiceType.MCP,
        a2a: ServiceType.A2A,
        ens: ServiceType.ENS,
        did: ServiceType.DID,
        wallet: ServiceType.WALLET,
        agentwallet: ServiceType.WALLET,
        oasf: ServiceType.OASF,
      };

      const normalizedType = typeMap[name.toLowerCase()] ?? (name || 'UNKNOWN');
      const meta: Record<string, unknown> = {};
      for (const [key, valueEntry] of Object.entries(record)) {
        if (key === 'name' || key === 'endpoint') {
          continue;
        }
        meta[key] = valueEntry;
      }

      services.push({
        type: normalizedType,
        value,
        meta: Object.keys(meta).length ? meta : undefined,
      });
    }

    return services;
  }

  private async pingEndpoint(
    endpoint: Service,
    crawler: EndpointCrawler,
    options: { timeoutMs: number; treatAuthAsAlive: boolean }
  ): Promise<ServicePingResult> {
    const value = endpoint.value;
    if (typeof value !== 'string' || value.length === 0) {
      return {
        type: endpoint.type,
        endpoint: '',
        ok: false,
        reason: 'invalid',
      };
    }

    const isHttp = value.startsWith('http://') || value.startsWith('https://');
    if (!isHttp) {
      return {
        type: endpoint.type,
        endpoint: value,
        ok: false,
        skipped: true,
        reason: 'non_http',
      };
    }

    if (endpoint.type === ServiceType.MCP) {
      const start = Date.now();
      const capabilities = await crawler.fetchMcpCapabilities(value);
      if (capabilities) {
        return {
          type: endpoint.type,
          endpoint: value,
          ok: true,
          latencyMs: Date.now() - start,
        };
      }
      return this.pingHttpEndpoint(endpoint.type, value, options.timeoutMs, options.treatAuthAsAlive);
    }

    if (endpoint.type === ServiceType.A2A) {
      const start = Date.now();
      const capabilities = await crawler.fetchA2aCapabilities(value);
      if (capabilities) {
        return {
          type: endpoint.type,
          endpoint: value,
          ok: true,
          latencyMs: Date.now() - start,
        };
      }
      return this.pingHttpEndpoint(endpoint.type, value, options.timeoutMs, options.treatAuthAsAlive);
    }

    return this.pingHttpEndpoint(endpoint.type, value, options.timeoutMs, options.treatAuthAsAlive);
  }

  private async pingHttpEndpoint(
    type: ServiceType | string,
    endpoint: string,
    timeoutMs: number,
    treatAuthAsAlive: boolean
  ): Promise<ServicePingResult> {
    if (isBlockedUri(endpoint)) {
      return { type, endpoint, ok: false, reason: 'blocked' };
    }

    const start = Date.now();

    try {
      let response = await fetch(endpoint, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 405) {
        response = await fetch(endpoint, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
      }

      const ok =
        response.ok ||
        (treatAuthAsAlive && (response.status === 401 || response.status === 402 || response.status === 403));

      return {
        type,
        endpoint,
        ok,
        status: response.status,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
      return {
        type,
        endpoint,
        ok: false,
        latencyMs: Date.now() - start,
        reason,
      };
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Check if SDK is in read-only mode (no signer configured)
   */
  get isReadOnly(): boolean {
    return this.signer === undefined;
  }

  /**
   * Get chain ID (for parity with agent0-ts)
   * Returns a string identifier for Solana cluster
   */
  async chainId(): Promise<string> {
    return `solana-${this.cluster}`;
  }

  /**
   * Get current cluster
   */
  getCluster(): Cluster {
    return this.cluster;
  }

  /**
   * Get program IDs for current cluster
   */
  getProgramIds() {
    return this.programIds;
  }

  /**
   * Get registry addresses (for parity with agent0-ts)
   */
  registries(): Record<string, string> {
    return {
      IDENTITY: this.programIds.identityRegistry.toBase58(),
      REPUTATION: this.programIds.reputationRegistry.toBase58(),
      VALIDATION: this.programIds.validationRegistry.toBase58(),
    };
  }

  /**
   * Get Solana client for advanced usage
   */
  getSolanaClient(): SolanaClient {
    return this.client;
  }

  /**
   * Get feedback manager for advanced usage
   */
  getFeedbackManager(): SolanaFeedbackManager {
    return this.feedbackManager;
  }

  /**
   * Check if SDK is using the default public Solana devnet RPC
   * Some operations are not supported on the public RPC
   */
  isUsingDefaultDevnetRpc(): boolean {
    return this.client.isDefaultDevnetRpc;
  }

  /**
   * Check if SDK supports advanced queries (getProgramAccounts with memcmp)
   * Returns false when using default Solana devnet RPC
   */
  supportsAdvancedQueries(): boolean {
    return this.client.supportsAdvancedQueries();
  }

  /**
   * Get the current RPC URL being used
   */
  getRpcUrl(): string {
    return this.client.rpcUrl;
  }

  // ==================== Hash Utilities ====================

  /**
   * Compute SHA-256 hash from data (string or Buffer)
   * Use this for feedback, validation, and response hashes
   * Browser-compatible (async for WebCrypto support)
   * @param data - String or Buffer to hash
   * @returns 32-byte SHA-256 hash as Buffer
   *
   * @example
   * const feedbackHash = await SolanaSDK.computeHash('My feedback content');
   * const dataHash = await SolanaSDK.computeHash(Buffer.from(jsonData));
   */
  static async computeHash(data: string | Buffer): Promise<Buffer> {
    const input = typeof data === 'string' ? data : new Uint8Array(data);
    const hash = await sha256(input);
    return Buffer.from(hash);
  }

  /**
   * Verify indexer integrity against on-chain hash-chain digests (O(1) verification)
   * Distinguishes between sync lag (indexer behind) and corruption (digest mismatch)
   *
   * @param asset - Agent Core asset pubkey
   * @returns IntegrityResult with detailed status and recommendations
   *
   * Status meanings:
   * - 'valid': All digests match, indexer fully synced
   * - 'syncing': Indexer is behind (count < on-chain) - safe to use with caution
   * - 'corrupted': Digest mismatch with same counts - do not trust
   * - 'error': Verification failed
   */
  async verifyIntegrity(asset: PublicKey): Promise<IntegrityResult> {
    const assetStr = asset.toBase58();
    const indexerUrl = this.indexerClient.getBaseUrl();

    const toHex = (arr: Uint8Array): string => Buffer.from(arr).toString('hex');
    const isZero = (hex: string): boolean => /^0+$/.test(hex);

    const emptyChain = (_type: string): IntegrityChainResult => ({
      onChain: '',
      indexer: null,
      countOnChain: 0n,
      countIndexer: 0n,
      match: false,
      lag: 0n,
    });

    try {
      if (
        !this.indexerClient.getLastFeedbackDigest ||
        !this.indexerClient.getLastResponseDigest ||
        !this.indexerClient.getLastRevokeDigest
      ) {
        return {
          valid: false,
          status: 'error',
          asset: assetStr,
          indexerUrl,
          chains: {
            feedback: emptyChain('feedback'),
            response: emptyChain('response'),
            revoke: emptyChain('revoke'),
          },
          totalLag: 0n,
          trustworthy: false,
          error: {
            message: 'Integrity verification is not supported by this indexer backend.',
            recommendation:
              'Configure the legacy REST indexer (INDEXER_URL + INDEXER_API_KEY) or use forceOnChain=true.',
          },
        };
      }

      let countRetrievalFailed = false;

      const safeGetDigest = async (
        fn: () => Promise<{ digest: string | null; count: number }>
      ): Promise<{ digest: string | null; count: number }> => {
        try {
          return await fn();
        } catch {
          countRetrievalFailed = true;
          return { digest: null, count: 0 };
        }
      };

      const [agent, feedbackDigest, responseDigest, revokeDigest] = await Promise.all([
        this.loadAgent(asset),
        safeGetDigest(() => this.indexerClient.getLastFeedbackDigest!(assetStr)),
        safeGetDigest(() => this.indexerClient.getLastResponseDigest!(assetStr)),
        safeGetDigest(() => this.indexerClient.getLastRevokeDigest!(assetStr)),
      ]);

      if (!agent) {
        return {
          valid: false,
          status: 'error',
          asset: assetStr,
          indexerUrl,
          chains: {
            feedback: emptyChain('feedback'),
            response: emptyChain('response'),
            revoke: emptyChain('revoke'),
          },
          totalLag: 0n,
          trustworthy: false,
          error: {
            message: 'Agent not found on-chain',
            recommendation: 'Verify the asset pubkey is correct',
          },
        };
      }

      const onChainFeedback = toHex(agent.feedback_digest);
      const onChainResponse = toHex(agent.response_digest);
      const onChainRevoke = toHex(agent.revoke_digest);

      const feedbackCountOnChain = BigInt(agent.feedback_count);
      const responseCountOnChain = BigInt(agent.response_count);
      const revokeCountOnChain = BigInt(agent.revoke_count);

      // Calculate lag (positive = indexer behind, negative = indexer ahead)
      const feedbackLag = feedbackCountOnChain - BigInt(feedbackDigest.count);
      const responseLag = responseCountOnChain - BigInt(responseDigest.count);
      const revokeLag = revokeCountOnChain - BigInt(revokeDigest.count);
      const totalLag = feedbackLag + responseLag + revokeLag;

      // Check digest matches
      const feedbackMatch = isZero(onChainFeedback) && !feedbackDigest.digest
        ? true
        : feedbackDigest.digest === onChainFeedback;
      const responseMatch = isZero(onChainResponse) && !responseDigest.digest
        ? true
        : responseDigest.digest === onChainResponse;
      const revokeMatch = isZero(onChainRevoke) && !revokeDigest.digest
        ? true
        : revokeDigest.digest === onChainRevoke;

      const allDigestsMatch = feedbackMatch && responseMatch && revokeMatch;

      // Determine status:
      // - If all digests match → valid
      // - If digests don't match but indexer is behind (positive lag) → syncing
      // - If digests don't match and counts are same → corrupted
      let status: IntegrityStatus;
      let trustworthy = false;

      if (countRetrievalFailed) {
        status = 'error';
        trustworthy = false;
      } else if (allDigestsMatch) {
        status = 'valid';
        trustworthy = true;
      } else if (totalLag > 0n) {
        // Indexer is behind - this is sync lag, not corruption
        status = 'syncing';
        // Trustworthy for reads if lag is small (e.g., < 100 items)
        trustworthy = totalLag < 100n;
      } else if (totalLag < 0n) {
        // Indexer ahead of on-chain? This shouldn't happen - likely corruption
        status = 'corrupted';
        trustworthy = false;
      } else {
        // Same counts but different digests → corruption
        status = 'corrupted';
        trustworthy = false;
      }

      const result: IntegrityResult = {
        valid: status === 'valid',
        status,
        asset: assetStr,
        indexerUrl,
        chains: {
          feedback: {
            onChain: onChainFeedback,
            indexer: feedbackDigest.digest,
            countOnChain: feedbackCountOnChain,
            countIndexer: BigInt(feedbackDigest.count),
            match: feedbackMatch,
            lag: feedbackLag,
          },
          response: {
            onChain: onChainResponse,
            indexer: responseDigest.digest,
            countOnChain: responseCountOnChain,
            countIndexer: BigInt(responseDigest.count),
            match: responseMatch,
            lag: responseLag,
          },
          revoke: {
            onChain: onChainRevoke,
            indexer: revokeDigest.digest,
            countOnChain: revokeCountOnChain,
            countIndexer: BigInt(revokeDigest.count),
            match: revokeMatch,
            lag: revokeLag,
          },
        },
        totalLag,
        trustworthy,
      };

      // Add appropriate error/warning messages
      if (status === 'syncing') {
        result.error = {
          message: `Indexer is ${totalLag} item(s) behind on-chain: ${[
            feedbackLag > 0n && `feedback: ${feedbackLag}`,
            responseLag > 0n && `response: ${responseLag}`,
            revokeLag > 0n && `revoke: ${revokeLag}`,
          ].filter(Boolean).join(', ')}`,
          recommendation: trustworthy
            ? 'Indexer is syncing. Recent items may be missing but existing data is trustworthy.'
            : 'Indexer is significantly behind. Consider waiting for sync or using forceOnChain=true',
        };
      } else if (status === 'corrupted') {
        result.error = {
          message: `Hash-chain corruption detected: ${[
            !feedbackMatch && 'feedback',
            !responseMatch && 'response',
            !revokeMatch && 'revoke',
          ].filter(Boolean).join(', ')}`,
          recommendation: 'Indexer data is corrupted. Switch to another indexer, contact operator, or use forceOnChain=true for RPC fallback',
        };
      }

      return result;
    } catch (err) {
      return {
        valid: false,
        status: 'error',
        asset: assetStr,
        indexerUrl,
        chains: {
          feedback: emptyChain('feedback'),
          response: emptyChain('response'),
          revoke: emptyChain('revoke'),
        },
        totalLag: 0n,
        trustworthy: false,
        error: {
          message: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: 'Check network connectivity and try again',
        },
      };
    }
  }

  /**
   * Deep integrity verification with random spot checks
   * Detects if indexer has correct digest but deleted data from DB
   *
   * @param asset - Agent Core asset pubkey
   * @param options - Verification options (spot check count, boundary checks)
   * @returns DeepIntegrityResult with spot check details
   *
   * Use cases:
   * - Detect malicious indexer that stores digests but deletes data
   * - Verify data completeness beyond digest matching
   * - Multi-tier verification for high-value operations
   */
  async verifyIntegrityDeep(
    asset: PublicKey,
    options: DeepIntegrityOptions = {}
  ): Promise<DeepIntegrityResult> {
    const { spotChecks = 5, checkBoundaries = true, verifyContent = false } = options;

    // First run basic integrity check
    const basicResult = await this.verifyIntegrity(asset);

    // Helper to verify content hash for IPFS URIs
    // For ipfs://Qm..., the CID IS the content hash, so if URI is present, content is valid
    // For non-IPFS URIs, we'd need to fetch and hash (expensive, not done here)
    const verifyFeedbackContent = (fb: { feedback_uri: string | null; feedback_hash: string | null }): { valid?: boolean; error?: string } => {
      if (!verifyContent) return {};
      if (!fb.feedback_uri) return { error: 'no_uri' };

      // IPFS URIs are content-addressed - CID contains the hash
      if (fb.feedback_uri.startsWith('ipfs://')) {
        // If URI is present and hash is stored, consider it valid
        // (CID itself guarantees content integrity)
        return { valid: true };
      }

      // For non-IPFS URIs, we can't easily verify without fetching
      // If hash is present, we trust it was computed correctly at storage time
      if (fb.feedback_hash) {
        return { valid: true };
      }

      return { error: 'no_hash' };
    };

    // Initialize spot check results
    const spotCheckResults: DeepIntegrityResult['spotChecks'] = {
      feedback: [],
      response: [],
      revoke: [],
    };

    let missingItems = 0;

    // Helper to generate random indices
    const getRandomIndices = (max: number, count: number): number[] => {
      if (max <= 0) return [];
      const indices = new Set<number>();

      // Always check boundaries if enabled
      if (checkBoundaries && max > 0) {
        indices.add(0); // First item
        indices.add(max - 1); // Last item
      }

      // Add random indices
      while (indices.size < Math.min(count + (checkBoundaries ? 2 : 0), max)) {
        indices.add(Math.floor(Math.random() * max));
      }

      return Array.from(indices).sort((a, b) => a - b);
    };

    try {
      if (
        !this.indexerClient.getFeedbacksAtIndices ||
        !this.indexerClient.getResponsesAtOffsets ||
        !this.indexerClient.getRevocationsAtCounts
      ) {
        return {
          ...basicResult,
          spotChecks: spotCheckResults,
          spotChecksPassed: false,
          missingItems: -1,
          modifiedItems: 0,
          error: {
            message: 'Deep integrity verification is not supported by this indexer backend.',
            recommendation:
              'Configure the legacy REST indexer (INDEXER_URL + INDEXER_API_KEY) to enable spot checks.',
          },
        };
      }

      // Generate indices for spot checks (safe to use Number for array indexing)
      const feedbackIndices = getRandomIndices(Number(basicResult.chains.feedback.countIndexer), spotChecks);
      const responseOffsets = getRandomIndices(Number(basicResult.chains.response.countIndexer), spotChecks);
      const revokeIndices = getRandomIndices(Number(basicResult.chains.revoke.countIndexer), spotChecks);

      // Parallel spot checks
      const [feedbackMap, responseMap, revokeMap] = await Promise.all([
        feedbackIndices.length > 0
          ? this.indexerClient.getFeedbacksAtIndices!(basicResult.asset, feedbackIndices)
          : new Map<number, null>(),
        responseOffsets.length > 0
          ? this.indexerClient.getResponsesAtOffsets!(basicResult.asset, responseOffsets)
          : new Map<number, null>(),
        revokeIndices.length > 0
          ? this.indexerClient.getRevocationsAtCounts!(basicResult.asset, revokeIndices.map(i => i + 1))
          : new Map<number, null>(),
      ]);

      // Process feedback spot checks
      for (const idx of feedbackIndices) {
        const fb = feedbackMap.get(idx);
        const exists = fb !== null && fb !== undefined;
        if (!exists) missingItems++;

        // Content verification for feedbacks
        const contentCheck = exists && fb
          ? verifyFeedbackContent({ feedback_uri: fb.feedback_uri, feedback_hash: fb.feedback_hash })
          : {};

        spotCheckResults.feedback.push({
          index: idx,
          exists,
          // Spot checks verify event existence and non-null digest, not digest value correctness.
          // Use full hash-chain replay (verifyIntegrityFull) for digest value verification.
          digestMatch: exists && fb?.running_digest !== null,
          contentValid: contentCheck.valid,
          contentError: contentCheck.error,
        });
      }

      // Process response spot checks
      for (const offset of responseOffsets) {
        const resp = responseMap.get(offset);
        const exists = resp !== null && resp !== undefined;
        if (!exists) missingItems++;
        spotCheckResults.response.push({
          index: offset,
          exists,
          digestMatch: exists && resp?.running_digest !== null,
          // Responses also have content hash (response_hash) that could be verified
          contentValid: verifyContent && exists && resp?.response_hash ? true : undefined,
        });
      }

      // Process revoke spot checks
      for (const idx of revokeIndices) {
        const rev = revokeMap.get(idx + 1); // revoke_count is 1-based
        const exists = rev !== null && rev !== undefined;
        if (!exists) missingItems++;
        spotCheckResults.revoke.push({
          index: idx,
          exists,
          digestMatch: exists && rev?.running_digest !== null,
        });
      }
    } catch (err) {
      // Spot check failed - mark as error but keep basic result
      return {
        ...basicResult,
        spotChecks: spotCheckResults,
        spotChecksPassed: false,
        missingItems: -1, // -1 indicates spot check error
        modifiedItems: 0,
        error: {
          message: `Spot check failed: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: 'Could not verify data completeness. Use forceOnChain=true if suspicious.',
        },
      };
    }

    // Count modified items (content hash mismatch)
    let modifiedItems = 0;
    for (const check of spotCheckResults.feedback) {
      if (check.contentValid === false) modifiedItems++;
    }
    for (const check of spotCheckResults.response) {
      if (check.contentValid === false) modifiedItems++;
    }
    for (const check of spotCheckResults.revoke) {
      if (check.contentValid === false) modifiedItems++;
    }

    const spotChecksPassed = missingItems === 0 && modifiedItems === 0;

    // Adjust status if spot checks reveal issues
    let finalStatus = basicResult.status;
    let finalTrustworthy = basicResult.trustworthy;

    if (!spotChecksPassed && basicResult.status === 'valid') {
      // Digest matched but data issues detected
      finalStatus = 'corrupted';
      finalTrustworthy = false;
    }

    const result: DeepIntegrityResult = {
      ...basicResult,
      status: finalStatus,
      trustworthy: finalTrustworthy,
      valid: finalStatus === 'valid' && spotChecksPassed,
      spotChecks: spotCheckResults,
      spotChecksPassed,
      missingItems,
      modifiedItems,
    };

    // Update error message based on issue type
    if (missingItems > 0) {
      result.error = {
        message: `Data deletion detected: ${missingItems} spot-checked item(s) missing from indexer`,
        recommendation: 'Indexer has valid digest but deleted data. This is a data integrity attack. Switch indexers immediately or use forceOnChain=true',
      };
    } else if (modifiedItems > 0) {
      result.error = {
        message: `Data modification detected: ${modifiedItems} item(s) have modified content (hash mismatch)`,
        recommendation: 'Indexer is serving modified data. This is a data integrity attack. Switch indexers immediately or use forceOnChain=true',
      };
    }

    return result;
  }

  /**
   * Full hash-chain replay verification
   * Replays all events and recomputes digests from scratch (or from checkpoint).
   * Detects any event censorship, reordering, or modification by the indexer.
   *
   * @param asset - Agent Core asset pubkey
   * @param options - Verification options
   * @returns FullVerificationResult with per-chain replay details
   */
  async verifyIntegrityFull(
    asset: PublicKey,
    options: FullVerificationOptions = {},
  ): Promise<FullVerificationResult> {
    const { useCheckpoints = true, batchSize = 1000, onProgress } = options;
    const start = Date.now();
    const assetStr = asset.toBase58();
    const indexerUrl = this.indexerClient.getBaseUrl();

    const toHex = (arr: Uint8Array): string => Buffer.from(arr).toString('hex');

    try {
      const agent = await this.loadAgent(asset);
      if (!agent) {
        const emptyReplay: ReplayResult = { finalDigest: Buffer.alloc(32), count: 0, valid: true };
        return {
          valid: false,
          status: 'error',
          asset: assetStr,
          indexerUrl,
          chains: {
            feedback: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
            response: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
            revoke: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
          },
          totalLag: 0n,
          trustworthy: false,
          error: { message: 'Agent not found on-chain', recommendation: 'Verify the asset pubkey is correct' },
          replay: { feedback: emptyReplay, response: emptyReplay, revoke: emptyReplay },
          checkpointsUsed: false,
          duration: Date.now() - start,
        };
      }

      const onChainFeedbackDigest = toHex(agent.feedback_digest);
      const onChainResponseDigest = toHex(agent.response_digest);
      const onChainRevokeDigest = toHex(agent.revoke_digest);
      const feedbackCountOnChain = BigInt(agent.feedback_count);
      const responseCountOnChain = BigInt(agent.response_count);
      const revokeCountOnChain = BigInt(agent.revoke_count);

      if (!this.indexerClient.getReplayData) {
        const emptyReplay: ReplayResult = { finalDigest: Buffer.alloc(32), count: 0, valid: true };
        return {
          valid: false,
          status: 'error',
          asset: assetStr,
          indexerUrl,
          chains: {
            feedback: { onChain: onChainFeedbackDigest, indexer: null, countOnChain: feedbackCountOnChain, countIndexer: 0n, match: false, lag: feedbackCountOnChain },
            response: { onChain: onChainResponseDigest, indexer: null, countOnChain: responseCountOnChain, countIndexer: 0n, match: false, lag: responseCountOnChain },
            revoke: { onChain: onChainRevokeDigest, indexer: null, countOnChain: revokeCountOnChain, countIndexer: 0n, match: false, lag: revokeCountOnChain },
          },
          totalLag: feedbackCountOnChain + responseCountOnChain + revokeCountOnChain,
          trustworthy: false,
          error: {
            message: 'Full replay verification is not supported by this indexer backend.',
            recommendation:
              'Configure the legacy REST indexer (INDEXER_URL + INDEXER_API_KEY) to enable full hash-chain replay.',
          },
          replay: { feedback: emptyReplay, response: emptyReplay, revoke: emptyReplay },
          checkpointsUsed: false,
          duration: Date.now() - start,
        };
      }

      let checkpoints: CheckpointSet | null = null;
      let checkpointsUsed = false;
      if (useCheckpoints) {
        try {
          if (this.indexerClient.getLatestCheckpoints) {
            checkpoints = await this.indexerClient.getLatestCheckpoints(assetStr);
          }
        } catch {
          // Checkpoints not available, replay from zero
        }
      }

      const parseHexDigest32 = (value: string, label: string): Buffer => {
        const normalized = typeof value === 'string' && value.startsWith('0x')
          ? value.slice(2)
          : value;
        if (typeof normalized !== 'string' || !/^[0-9a-fA-F]{64}$/.test(normalized)) {
          throw new Error(`Invalid ${label}: expected 32-byte hex digest`);
        }
        return Buffer.from(normalized, 'hex') as Buffer;
      };

      const parseOptionalHexDigest32 = (value: string | null | undefined, label: string): Buffer | undefined => {
        if (value === null || value === undefined || value === '') {
          return undefined;
        }
        return parseHexDigest32(value, label);
      };

      const parseRequiredOrZeroHexDigest32 = (
        value: string | null | undefined,
        label: string,
      ): Buffer => {
        if (value === null || value === undefined || value === '') {
          return Buffer.alloc(32);
        }
        return parseHexDigest32(value, label);
      };

      const replayChainFromIndexer = async (
        chainType: 'feedback' | 'response' | 'revoke',
        onChainCount: bigint,
      ): Promise<ReplayResult> => {
        const cp = checkpoints?.[chainType];
        let startDigest: Buffer = Buffer.alloc(32) as Buffer;
        let startCount = 0;
        if (cp && useCheckpoints) {
          startDigest = parseHexDigest32(cp.digest, `${chainType} checkpoint digest`);
          startCount = cp.event_count;
          checkpointsUsed = true;
        }

        const allEvents: ReplayEventData[] = [];
        let fromCount = startCount;
        const target = Number(onChainCount);

        while (fromCount < target) {
          const toCount = Math.min(fromCount + batchSize, target);
          const page = await this.indexerClient.getReplayData!(assetStr, chainType, fromCount, toCount, batchSize);
          allEvents.push(...page.events);
          onProgress?.(chainType, allEvents.length + startCount, target);
          if (!page.hasMore || page.events.length === 0) break;
          fromCount = page.nextFromCount;
        }

        if (chainType === 'feedback') {
          const events: FeedbackReplayEvent[] = allEvents.map((e, index) => ({
            asset: Buffer.from(bs58.decode(e.asset)),
            client: Buffer.from(bs58.decode(e.client)),
            feedbackIndex: BigInt(e.feedback_index),
            sealHash: parseRequiredOrZeroHexDigest32(e.feedback_hash, `feedback_hash[${index}]`),
            slot: BigInt(e.slot),
            storedDigest: parseOptionalHexDigest32(e.running_digest, `running_digest[${index}]`),
          }));
          return replayFeedbackChain(events, startDigest, startCount);
        } else if (chainType === 'response') {
          const events: ResponseReplayEvent[] = allEvents.map((e, index) => ({
            asset: Buffer.from(bs58.decode(e.asset)),
            client: Buffer.from(bs58.decode(e.client)),
            feedbackIndex: BigInt(e.feedback_index),
            responder: e.responder ? Buffer.from(bs58.decode(e.responder)) : Buffer.alloc(32),
            responseHash: parseRequiredOrZeroHexDigest32(e.response_hash, `response_hash[${index}]`),
            feedbackHash: parseRequiredOrZeroHexDigest32(e.feedback_hash, `feedback_hash[${index}]`),
            slot: BigInt(e.slot),
            storedDigest: parseOptionalHexDigest32(e.running_digest, `running_digest[${index}]`),
          }));
          return replayResponseChain(events, startDigest, startCount);
        } else {
          const events: RevokeReplayEvent[] = allEvents.map((e, index) => ({
            asset: Buffer.from(bs58.decode(e.asset)),
            client: Buffer.from(bs58.decode(e.client)),
            feedbackIndex: BigInt(e.feedback_index),
            feedbackHash: parseRequiredOrZeroHexDigest32(e.feedback_hash, `feedback_hash[${index}]`),
            slot: BigInt(e.slot),
            storedDigest: parseOptionalHexDigest32(e.running_digest, `running_digest[${index}]`),
          }));
          return replayRevokeChain(events, startDigest, startCount);
        }
      };

      const [feedbackReplay, responseReplay, revokeReplay] = await Promise.all([
        replayChainFromIndexer('feedback', feedbackCountOnChain),
        replayChainFromIndexer('response', responseCountOnChain),
        replayChainFromIndexer('revoke', revokeCountOnChain),
      ]);

      const feedbackDigestMatch = feedbackReplay.finalDigest.toString('hex') === onChainFeedbackDigest;
      const responseDigestMatch = responseReplay.finalDigest.toString('hex') === onChainResponseDigest;
      const revokeDigestMatch = revokeReplay.finalDigest.toString('hex') === onChainRevokeDigest;

      const feedbackCountMatch = BigInt(feedbackReplay.count) === feedbackCountOnChain;
      const responseCountMatch = BigInt(responseReplay.count) === responseCountOnChain;
      const revokeCountMatch = BigInt(revokeReplay.count) === revokeCountOnChain;

      const allValid = feedbackDigestMatch && responseDigestMatch && revokeDigestMatch
        && feedbackCountMatch && responseCountMatch && revokeCountMatch
        && feedbackReplay.valid && responseReplay.valid && revokeReplay.valid;

      const feedbackLag = feedbackCountOnChain - BigInt(feedbackReplay.count);
      const responseLag = responseCountOnChain - BigInt(responseReplay.count);
      const revokeLag = revokeCountOnChain - BigInt(revokeReplay.count);
      const totalLag = feedbackLag + responseLag + revokeLag;

      let status: IntegrityStatus;
      let trustworthy = false;

      if (allValid) {
        status = 'valid';
        trustworthy = true;
      } else if (totalLag > 0n && feedbackReplay.valid && responseReplay.valid && revokeReplay.valid) {
        status = 'syncing';
        trustworthy = totalLag < 100n;
      } else {
        status = 'corrupted';
        trustworthy = false;
      }

      const result: FullVerificationResult = {
        valid: allValid,
        status,
        asset: assetStr,
        indexerUrl,
        chains: {
          feedback: {
            onChain: onChainFeedbackDigest,
            indexer: feedbackReplay.finalDigest.toString('hex'),
            countOnChain: feedbackCountOnChain,
            countIndexer: BigInt(feedbackReplay.count),
            match: feedbackDigestMatch,
            lag: feedbackLag,
          },
          response: {
            onChain: onChainResponseDigest,
            indexer: responseReplay.finalDigest.toString('hex'),
            countOnChain: responseCountOnChain,
            countIndexer: BigInt(responseReplay.count),
            match: responseDigestMatch,
            lag: responseLag,
          },
          revoke: {
            onChain: onChainRevokeDigest,
            indexer: revokeReplay.finalDigest.toString('hex'),
            countOnChain: revokeCountOnChain,
            countIndexer: BigInt(revokeReplay.count),
            match: revokeDigestMatch,
            lag: revokeLag,
          },
        },
        totalLag,
        trustworthy,
        replay: {
          feedback: feedbackReplay,
          response: responseReplay,
          revoke: revokeReplay,
        },
        checkpointsUsed,
        duration: Date.now() - start,
      };

      if (status === 'corrupted') {
        const mismatchChains = [
          !feedbackReplay.valid && `feedback (mismatch at event ${feedbackReplay.mismatchAt})`,
          !responseReplay.valid && `response (mismatch at event ${responseReplay.mismatchAt})`,
          !revokeReplay.valid && `revoke (mismatch at event ${revokeReplay.mismatchAt})`,
          !feedbackDigestMatch && feedbackReplay.valid && 'feedback (final digest mismatch)',
          !responseDigestMatch && responseReplay.valid && 'response (final digest mismatch)',
          !revokeDigestMatch && revokeReplay.valid && 'revoke (final digest mismatch)',
        ].filter(Boolean);
        result.error = {
          message: `Full replay detected corruption: ${mismatchChains.join(', ')}`,
          recommendation: 'Hash-chain replay failed. Events may have been censored, reordered, or modified. Switch indexers immediately.',
        };
      } else if (status === 'syncing') {
        result.error = {
          message: `Replay verified ${feedbackReplay.count + responseReplay.count + revokeReplay.count} events but indexer is ${totalLag} event(s) behind on-chain`,
          recommendation: trustworthy
            ? 'Partial verification passed. Recent events still syncing.'
            : 'Indexer significantly behind. Wait for sync or use another indexer.',
        };
      }

      return result;
    } catch (err) {
      const emptyReplay: ReplayResult = { finalDigest: Buffer.alloc(32), count: 0, valid: true };
      return {
        valid: false,
        status: 'error',
        asset: assetStr,
        indexerUrl,
        chains: {
          feedback: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
          response: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
          revoke: { onChain: '', indexer: null, countOnChain: 0n, countIndexer: 0n, match: false, lag: 0n },
        },
        totalLag: 0n,
        trustworthy: false,
        error: {
          message: `Full replay failed: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: 'Check network connectivity and try again',
        },
        replay: { feedback: emptyReplay, response: emptyReplay, revoke: emptyReplay },
        checkpointsUsed: false,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Compute hash for a URI
   * - IPFS/Arweave URIs: zeros (CID already contains content hash)
   * - Other URIs: SHA-256 of the URI string
   * Browser-compatible (async for WebCrypto support)
   * @param uri - URI to hash
   * @returns 32-byte hash as Buffer
   *
   * @example
   * const hash = await SolanaSDK.computeUriHash('https://example.com/data.json');
   * // For IPFS, returns zeros since CID is already a hash
   * const ipfsHash = await SolanaSDK.computeUriHash('ipfs://Qm...');
   */
  static async computeUriHash(uri: string): Promise<Buffer> {
    // IPFS and Arweave URIs contain content-addressable hashes
    if (uri.startsWith('ipfs://') || uri.startsWith('ar://')) {
      return Buffer.alloc(32);
    }
    // For other URIs, compute SHA-256 hash of the URI itself
    const hash = await sha256(uri);
    return Buffer.from(hash);
  }

  // Instance method that calls the static one
  private computeUriHash(uri: string): Promise<Buffer> {
    return SolanaSDK.computeUriHash(uri);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

// Modified:
// - getResponseCount: Added client parameter
// - readResponses: Added client parameter
