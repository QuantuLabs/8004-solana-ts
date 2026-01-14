/**
 * ATOM Engine Borsh Schemas
 * Agent Trust On-chain Model - v0.2.0 (Fortress)
 *
 * These schemas must match exactly the Rust structs in atom-engine program.
 * Seeds:
 * - AtomStats: ["atom_stats", asset.key()]
 * - AtomConfig: ["atom_config"]
 */
import { Schema } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Trust Tier enum (0-4)
 * Represents the agent's reputation level
 */
export declare enum TrustTier {
    Unrated = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Platinum = 4
}
/**
 * Get human-readable trust tier name
 */
export declare function getTrustTierName(tier: TrustTier): string;
export declare const trustTierToString: typeof getTrustTierName;
/**
 * AtomStats - Raw reputation metrics for an agent
 * Size: 561 bytes (8 discriminator + 553 data)
 * Seeds: ["atom_stats", asset.key()]
 *
 * Layout Fortress (Fortress):
 * - BLOC 0: Identity (64 bytes) - collection + asset
 * - BLOC 1: Core (24 bytes) - slots + count
 * - BLOC 2: Dual-EMA (12 bytes)
 * - BLOC 3: Epoch & Bounds (8 bytes)
 * - BLOC 4: HLL (128 bytes) - 256 registers × 4 bits
 * - BLOC 4b: HLL Salt (8 bytes)
 * - BLOC 5: Burst Detection (196 bytes) - 24×u64 ring + 4×u8
 * - BLOC 5b: MRT Eviction Protection (8 bytes)
 * - BLOC 5c: Quality Circuit Breaker (6 bytes)
 * - BLOC 5d: Bypass Tracking (83 bytes)
 * - BLOC 6: Output Cache (8 bytes)
 * - BLOC 6b: Tier Vesting (4 bytes) - Fortress
 * - BLOC 7: Meta (4 bytes)
 */
export declare class AtomStats {
    collection: Uint8Array;
    asset: Uint8Array;
    first_feedback_slot: bigint;
    last_feedback_slot: bigint;
    feedback_count: bigint;
    ema_score_fast: number;
    ema_score_slow: number;
    ema_volatility: number;
    ema_arrival_log: number;
    peak_ema: number;
    max_drawdown: number;
    epoch_count: number;
    current_epoch: number;
    min_score: number;
    max_score: number;
    first_score: number;
    last_score: number;
    hll_packed: Uint8Array;
    hll_salt: bigint;
    recent_callers: bigint[];
    burst_pressure: number;
    updates_since_hll_change: number;
    neg_pressure: number;
    eviction_cursor: number;
    ring_base_slot: bigint;
    quality_velocity: number;
    velocity_epoch: number;
    freeze_epochs: number;
    quality_floor: number;
    bypass_count: number;
    bypass_score_avg: number;
    bypass_fingerprints: bigint[];
    bypass_fp_cursor: number;
    loyalty_score: number;
    quality_score: number;
    risk_score: number;
    diversity_ratio: number;
    trust_tier: number;
    tier_candidate: number;
    tier_candidate_epoch: number;
    tier_confirmed: number;
    flags: number;
    confidence: number;
    bump: number;
    schema_version: number;
    constructor(fields: {
        collection: Uint8Array;
        asset: Uint8Array;
        first_feedback_slot: bigint;
        last_feedback_slot: bigint;
        feedback_count: bigint;
        ema_score_fast: number;
        ema_score_slow: number;
        ema_volatility: number;
        ema_arrival_log: number;
        peak_ema: number;
        max_drawdown: number;
        epoch_count: number;
        current_epoch: number;
        min_score: number;
        max_score: number;
        first_score: number;
        last_score: number;
        hll_packed: Uint8Array;
        hll_salt: bigint;
        recent_callers: bigint[];
        burst_pressure: number;
        updates_since_hll_change: number;
        neg_pressure: number;
        eviction_cursor: number;
        ring_base_slot: bigint;
        quality_velocity: number;
        velocity_epoch: number;
        freeze_epochs: number;
        quality_floor: number;
        bypass_count: number;
        bypass_score_avg: number;
        bypass_fingerprints: bigint[];
        bypass_fp_cursor: number;
        loyalty_score: number;
        quality_score: number;
        risk_score: number;
        diversity_ratio: number;
        trust_tier: number;
        tier_candidate: number;
        tier_candidate_epoch: number;
        tier_confirmed: number;
        flags: number;
        confidence: number;
        bump: number;
        schema_version: number;
    });
    static schema: Schema;
    /**
     * Deserialize AtomStats from account data
     * @param data - Raw account data (with 8-byte discriminator)
     */
    static deserialize(data: Buffer): AtomStats;
    getCollectionPublicKey(): PublicKey;
    getAssetPublicKey(): PublicKey;
    getTrustTier(): TrustTier;
    /**
     * Get quality score as percentage (0-100)
     */
    getQualityPercent(): number;
    /**
     * Get confidence as percentage (0-100)
     */
    getConfidencePercent(): number;
    /**
     * Get EMA score (slow) as percentage (0-100)
     */
    getAverageScore(): number;
    /**
     * Estimate unique clients from HLL
     * Uses standard HLL estimation formula
     * v3.2: Updated for 256 registers (128 bytes)
     */
    estimateUniqueClients(): number;
    getUniqueCallersEstimate(): number;
}
export declare const ATOM_STATS_SCHEMA: Schema;
/**
 * AtomConfig - Configuration account for ATOM engine
 * Seeds: ["atom_config"]
 */
export declare class AtomConfig {
    authority: Uint8Array;
    agent_registry_program: Uint8Array;
    alpha_fast: number;
    alpha_slow: number;
    alpha_volatility: number;
    alpha_arrival: number;
    alpha_quality: number;
    alpha_quality_up: number;
    alpha_quality_down: number;
    alpha_burst_up: number;
    alpha_burst_down: number;
    weight_sybil: number;
    weight_burst: number;
    weight_stagnation: number;
    weight_shock: number;
    weight_volatility: number;
    weight_arrival: number;
    diversity_threshold: number;
    burst_threshold: number;
    shock_threshold: number;
    volatility_threshold: number;
    arrival_fast_threshold: number;
    tier_platinum_quality: number;
    tier_platinum_risk: number;
    tier_platinum_confidence: number;
    tier_gold_quality: number;
    tier_gold_risk: number;
    tier_gold_confidence: number;
    tier_silver_quality: number;
    tier_silver_risk: number;
    tier_silver_confidence: number;
    tier_bronze_quality: number;
    tier_bronze_risk: number;
    tier_bronze_confidence: number;
    cold_start_min: number;
    cold_start_max: number;
    cold_start_penalty_heavy: number;
    cold_start_penalty_per_feedback: number;
    uniqueness_bonus: number;
    loyalty_bonus: number;
    loyalty_min_slot_delta: number;
    bonus_max_burst_pressure: number;
    inactive_decay_per_epoch: number;
    bump: number;
    version: number;
    paused: boolean;
    _padding: Uint8Array;
    constructor(fields: Record<string, unknown>);
    static schema: Schema;
    static deserialize(data: Buffer): AtomConfig;
    getAuthorityPublicKey(): PublicKey;
    getAgentRegistryProgramPublicKey(): PublicKey;
    isPaused(): boolean;
}
export declare const ATOM_CONFIG_SCHEMA: Schema;
/**
 * Enriched summary returned by SDK
 * Combines AtomStats with human-readable values
 */
export interface EnrichedSummary {
    asset: PublicKey;
    feedbackCount: number;
    averageScore: number;
    qualityScore: number;
    confidence: number;
    riskScore: number;
    trustTier: TrustTier;
    trustTierName: string;
    diversityRatio: number;
    estimatedUniqueClients: number;
    loyaltyScore: number;
    firstFeedbackSlot: bigint;
    lastFeedbackSlot: bigint;
}
//# sourceMappingURL=atom-schemas.d.ts.map