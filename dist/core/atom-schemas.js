/**
 * ATOM Engine Borsh Schemas
 * Agent Trust On-chain Model - v0.2.0 (Fortress)
 *
 * These schemas must match exactly the Rust structs in atom-engine program.
 * Seeds:
 * - AtomStats: ["atom_stats", asset.key()]
 * - AtomConfig: ["atom_config"]
 */
import { deserializeUnchecked } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Trust Tier enum (0-4)
 * Represents the agent's reputation level
 */
export var TrustTier;
(function (TrustTier) {
    TrustTier[TrustTier["Unrated"] = 0] = "Unrated";
    TrustTier[TrustTier["Bronze"] = 1] = "Bronze";
    TrustTier[TrustTier["Silver"] = 2] = "Silver";
    TrustTier[TrustTier["Gold"] = 3] = "Gold";
    TrustTier[TrustTier["Platinum"] = 4] = "Platinum";
})(TrustTier || (TrustTier = {}));
/**
 * Get human-readable trust tier name
 */
export function getTrustTierName(tier) {
    switch (tier) {
        case TrustTier.Unrated:
            return 'Unrated';
        case TrustTier.Bronze:
            return 'Bronze';
        case TrustTier.Silver:
            return 'Silver';
        case TrustTier.Gold:
            return 'Gold';
        case TrustTier.Platinum:
            return 'Platinum';
        default:
            return 'Unknown';
    }
}
// Alias for export consistency
export const trustTierToString = getTrustTierName;
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
export class AtomStats {
    // BLOC 0: Identity (64 bytes)
    collection; // 32 bytes - Collection this agent belongs to
    asset; // 32 bytes - Asset (agent NFT) this stats belongs to
    // BLOC 1: Core metrics (24 bytes)
    first_feedback_slot; // u64 - Slot of first feedback
    last_feedback_slot; // u64 - Slot of most recent feedback
    feedback_count; // u64 - Total feedbacks received
    // BLOC 2: Dual-EMA (12 bytes)
    ema_score_fast; // u16 - Fast EMA (α=0.30), scale 0-10000
    ema_score_slow; // u16 - Slow EMA (α=0.05), scale 0-10000
    ema_volatility; // u16 - Smoothed |fast - slow|, scale 0-10000
    ema_arrival_log; // u16 - EMA of arrival rate, scale 0-1500
    peak_ema; // u16 - Historical peak of slow EMA
    max_drawdown; // u16 - Maximum drawdown from peak
    // BLOC 3: Epoch tracking (8 bytes)
    epoch_count; // u16 - Distinct epochs with activity
    current_epoch; // u16 - Current epoch number
    min_score; // u8 - Minimum score ever (0-100)
    max_score; // u8 - Maximum score ever (0-100)
    first_score; // u8 - First score received
    last_score; // u8 - Most recent score
    // BLOC 4: HLL (128 bytes) - HyperLogLog for unique client estimation
    hll_packed; // 128 bytes - 256 registers × 4 bits (v3.2)
    // BLOC 4b: HLL Salt (8 bytes) - v3.0 security fix
    hll_salt; // u64 - Random salt for HLL to prevent cross-agent grinding
    // BLOC 5: Burst detection (196 bytes)
    recent_callers; // 24×u64 - Ring buffer of caller fingerprints
    burst_pressure; // u8 - Repeat caller pressure (0-255)
    updates_since_hll_change; // u8 - Updates since HLL change
    neg_pressure; // u8 - Negative momentum pressure
    eviction_cursor; // u8 - Round Robin eviction cursor
    // BLOC 5b: MRT Eviction Protection (8 bytes)
    ring_base_slot; // u64 - Slot when current ring buffer window started
    // BLOC 5c: Quality Circuit Breaker (6 bytes)
    quality_velocity; // u16 - Accumulated quality change magnitude this epoch
    velocity_epoch; // u16 - Epoch when velocity tracking started
    freeze_epochs; // u8 - Epochs remaining in quality freeze (0 = not frozen)
    quality_floor; // u8 - Floor quality during freeze (0-100)
    // BLOC 5d: Bypass Tracking (83 bytes)
    bypass_count; // u8 - Number of bypassed writes in current window
    bypass_score_avg; // u8 - Sum of bypassed scores (for averaging when merging)
    bypass_fingerprints; // 10×u64 - Fingerprints of bypassed entries (for revoke support)
    bypass_fp_cursor; // u8 - Cursor for round-robin in bypass_fingerprints
    // BLOC 6: Output cache (8 bytes)
    loyalty_score; // u16 - Cached loyalty score
    quality_score; // u16 - Cached quality score (0-10000)
    risk_score; // u8 - Risk score (0-100)
    diversity_ratio; // u8 - Unique/total ratio (0-255)
    trust_tier; // u8 - Trust tier (0-4)
    // BLOC 6b: Tier Vesting (4 bytes) - Fortress
    tier_candidate; // u8 - Tier candidate waiting for promotion (0-4)
    tier_candidate_epoch; // u16 - Epoch when candidature started
    tier_confirmed; // u8 - Confirmed tier after vesting period
    // BLOC 7: Meta (4 bytes)
    flags; // u8 - Bit flags
    confidence; // u16 - Confidence (0-10000)
    bump; // u8 - PDA bump
    schema_version; // u8 - Schema version
    constructor(fields) {
        this.collection = fields.collection;
        this.asset = fields.asset;
        this.first_feedback_slot = fields.first_feedback_slot;
        this.last_feedback_slot = fields.last_feedback_slot;
        this.feedback_count = fields.feedback_count;
        this.ema_score_fast = fields.ema_score_fast;
        this.ema_score_slow = fields.ema_score_slow;
        this.ema_volatility = fields.ema_volatility;
        this.ema_arrival_log = fields.ema_arrival_log;
        this.peak_ema = fields.peak_ema;
        this.max_drawdown = fields.max_drawdown;
        this.epoch_count = fields.epoch_count;
        this.current_epoch = fields.current_epoch;
        this.min_score = fields.min_score;
        this.max_score = fields.max_score;
        this.first_score = fields.first_score;
        this.last_score = fields.last_score;
        this.hll_packed = fields.hll_packed;
        this.hll_salt = fields.hll_salt;
        this.recent_callers = fields.recent_callers;
        this.burst_pressure = fields.burst_pressure;
        this.updates_since_hll_change = fields.updates_since_hll_change;
        this.neg_pressure = fields.neg_pressure;
        this.eviction_cursor = fields.eviction_cursor;
        // MRT Eviction Protection
        this.ring_base_slot = fields.ring_base_slot;
        // Quality Circuit Breaker
        this.quality_velocity = fields.quality_velocity;
        this.velocity_epoch = fields.velocity_epoch;
        this.freeze_epochs = fields.freeze_epochs;
        this.quality_floor = fields.quality_floor;
        // Bypass Tracking
        this.bypass_count = fields.bypass_count;
        this.bypass_score_avg = fields.bypass_score_avg;
        this.bypass_fingerprints = fields.bypass_fingerprints;
        this.bypass_fp_cursor = fields.bypass_fp_cursor;
        // Output Cache
        this.loyalty_score = fields.loyalty_score;
        this.quality_score = fields.quality_score;
        this.risk_score = fields.risk_score;
        this.diversity_ratio = fields.diversity_ratio;
        this.trust_tier = fields.trust_tier;
        // Tier Vesting Fortress
        this.tier_candidate = fields.tier_candidate;
        this.tier_candidate_epoch = fields.tier_candidate_epoch;
        this.tier_confirmed = fields.tier_confirmed;
        // Meta
        this.flags = fields.flags;
        this.confidence = fields.confidence;
        this.bump = fields.bump;
        this.schema_version = fields.schema_version;
    }
    // Borsh schema (borsh library requires Map<any, any>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static schema = new Map([
        [
            AtomStats,
            {
                kind: 'struct',
                fields: [
                    ['collection', [32]],
                    ['asset', [32]],
                    ['first_feedback_slot', 'u64'],
                    ['last_feedback_slot', 'u64'],
                    ['feedback_count', 'u64'],
                    ['ema_score_fast', 'u16'],
                    ['ema_score_slow', 'u16'],
                    ['ema_volatility', 'u16'],
                    ['ema_arrival_log', 'u16'],
                    ['peak_ema', 'u16'],
                    ['max_drawdown', 'u16'],
                    ['epoch_count', 'u16'],
                    ['current_epoch', 'u16'],
                    ['min_score', 'u8'],
                    ['max_score', 'u8'],
                    ['first_score', 'u8'],
                    ['last_score', 'u8'],
                    ['hll_packed', [128]], // 256 registers × 4 bits = 128 bytes
                    ['hll_salt', 'u64'], // Random salt for HLL
                    ['recent_callers', ['u64', 24]], // Ring buffer of caller fingerprints
                    ['burst_pressure', 'u8'],
                    ['updates_since_hll_change', 'u8'],
                    ['neg_pressure', 'u8'],
                    ['eviction_cursor', 'u8'], // Round Robin eviction cursor
                    // MRT Eviction Protection
                    ['ring_base_slot', 'u64'],
                    // Quality Circuit Breaker
                    ['quality_velocity', 'u16'],
                    ['velocity_epoch', 'u16'],
                    ['freeze_epochs', 'u8'],
                    ['quality_floor', 'u8'],
                    // Bypass Tracking
                    ['bypass_count', 'u8'],
                    ['bypass_score_avg', 'u8'],
                    ['bypass_fingerprints', ['u64', 10]], // 10 fingerprints for revoke support
                    ['bypass_fp_cursor', 'u8'],
                    // Output Cache
                    ['loyalty_score', 'u16'],
                    ['quality_score', 'u16'],
                    ['risk_score', 'u8'],
                    ['diversity_ratio', 'u8'],
                    ['trust_tier', 'u8'],
                    // Tier Vesting Fortress
                    ['tier_candidate', 'u8'],
                    ['tier_candidate_epoch', 'u16'],
                    ['tier_confirmed', 'u8'],
                    // Meta
                    ['flags', 'u8'],
                    ['confidence', 'u16'],
                    ['bump', 'u8'],
                    ['schema_version', 'u8'],
                ],
            },
        ],
    ]);
    /**
     * Deserialize AtomStats from account data
     * @param data - Raw account data (with 8-byte discriminator)
     */
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const dataWithoutDiscriminator = data.slice(8);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = deserializeUnchecked(AtomStats.schema, AtomStats, dataWithoutDiscriminator);
        // Ensure u64 fields are proper BigInt (borsh-js may return BN or other types)
        const toBigInt = (val) => {
            if (typeof val === 'bigint')
                return val;
            if (typeof val === 'number')
                return BigInt(val);
            if (val && typeof val.toString === 'function') {
                return BigInt(val.toString());
            }
            return BigInt(0);
        };
        // Create new instance with properly typed fields
        return new AtomStats({
            collection: raw.collection,
            asset: raw.asset,
            first_feedback_slot: toBigInt(raw.first_feedback_slot),
            last_feedback_slot: toBigInt(raw.last_feedback_slot),
            feedback_count: toBigInt(raw.feedback_count),
            ema_score_fast: raw.ema_score_fast,
            ema_score_slow: raw.ema_score_slow,
            ema_volatility: raw.ema_volatility,
            ema_arrival_log: raw.ema_arrival_log,
            peak_ema: raw.peak_ema,
            max_drawdown: raw.max_drawdown,
            epoch_count: raw.epoch_count,
            current_epoch: raw.current_epoch,
            min_score: raw.min_score,
            max_score: raw.max_score,
            first_score: raw.first_score,
            last_score: raw.last_score,
            hll_packed: raw.hll_packed,
            hll_salt: toBigInt(raw.hll_salt),
            recent_callers: (raw.recent_callers || []).map((c) => toBigInt(c)),
            burst_pressure: raw.burst_pressure,
            updates_since_hll_change: raw.updates_since_hll_change,
            neg_pressure: raw.neg_pressure,
            eviction_cursor: raw.eviction_cursor,
            bypass_fingerprints: (raw.bypass_fingerprints || []).map((f) => toBigInt(f)),
            bypass_fp_cursor: raw.bypass_fp_cursor,
            bypass_score_avg: raw.bypass_score_avg,
            bypass_count: raw.bypass_count,
            ring_base_slot: toBigInt(raw.ring_base_slot),
            quality_score: raw.quality_score,
            quality_floor: raw.quality_floor,
            quality_velocity: raw.quality_velocity,
            velocity_epoch: raw.velocity_epoch,
            confidence: raw.confidence,
            risk_score: raw.risk_score,
            loyalty_score: raw.loyalty_score,
            diversity_ratio: raw.diversity_ratio,
            trust_tier: raw.trust_tier,
            tier_candidate: raw.tier_candidate,
            tier_candidate_epoch: raw.tier_candidate_epoch,
            tier_confirmed: raw.tier_confirmed,
            freeze_epochs: raw.freeze_epochs,
            schema_version: raw.schema_version,
            flags: raw.flags,
            bump: raw.bump,
        });
    }
    // Helper methods
    getCollectionPublicKey() {
        return new PublicKey(this.collection);
    }
    getAssetPublicKey() {
        return new PublicKey(this.asset);
    }
    getTrustTier() {
        return this.trust_tier;
    }
    /**
     * Get quality score as percentage (0-100)
     */
    getQualityPercent() {
        return this.quality_score / 100;
    }
    /**
     * Get confidence as percentage (0-100)
     */
    getConfidencePercent() {
        return this.confidence / 100;
    }
    /**
     * Get EMA score (slow) as percentage (0-100)
     */
    getAverageScore() {
        return this.ema_score_slow / 100;
    }
    /**
     * Estimate unique clients from HLL
     * Uses standard HLL estimation formula
     * v3.2: Updated for 256 registers (128 bytes)
     */
    estimateUniqueClients() {
        // Unpack 4-bit registers from hll_packed (256 registers in 128 bytes)
        const registers = [];
        for (let i = 0; i < 128; i++) {
            registers.push(this.hll_packed[i] & 0x0f);
            registers.push((this.hll_packed[i] >> 4) & 0x0f);
        }
        // HLL estimation for 256 registers
        const m = 256; // number of registers (v3.2)
        const alpha = 0.7213 / (1 + 1.079 / m); // bias correction
        let sum = 0;
        let zeros = 0;
        for (const reg of registers) {
            sum += Math.pow(2, -reg);
            if (reg === 0)
                zeros++;
        }
        let estimate = (alpha * m * m) / sum;
        // Small range correction (linear counting for small cardinalities)
        if (estimate <= 2.5 * m && zeros > 0) {
            estimate = m * Math.log(m / zeros);
        }
        return Math.round(estimate);
    }
    // Alias for SDK consistency
    getUniqueCallersEstimate() {
        return this.estimateUniqueClients();
    }
}
// Export schema references for direct access
export const ATOM_STATS_SCHEMA = AtomStats.schema;
/**
 * AtomConfig - Configuration account for ATOM engine
 * Seeds: ["atom_config"]
 */
export class AtomConfig {
    authority; // 32 bytes
    agent_registry_program; // 32 bytes
    // EMA Parameters (9×u16)
    alpha_fast;
    alpha_slow;
    alpha_volatility;
    alpha_arrival;
    alpha_quality; // DEPRECATED
    alpha_quality_up;
    alpha_quality_down;
    alpha_burst_up;
    alpha_burst_down;
    // Risk Weights (6×u8)
    weight_sybil;
    weight_burst;
    weight_stagnation;
    weight_shock;
    weight_volatility;
    weight_arrival;
    // Thresholds
    diversity_threshold;
    burst_threshold;
    shock_threshold;
    volatility_threshold;
    arrival_fast_threshold;
    // Tier Thresholds (4 tiers × 3 values)
    tier_platinum_quality;
    tier_platinum_risk;
    tier_platinum_confidence;
    tier_gold_quality;
    tier_gold_risk;
    tier_gold_confidence;
    tier_silver_quality;
    tier_silver_risk;
    tier_silver_confidence;
    tier_bronze_quality;
    tier_bronze_risk;
    tier_bronze_confidence;
    // Cold Start
    cold_start_min;
    cold_start_max;
    cold_start_penalty_heavy;
    cold_start_penalty_per_feedback;
    // Bonus/Loyalty
    uniqueness_bonus;
    loyalty_bonus;
    loyalty_min_slot_delta;
    bonus_max_burst_pressure;
    // Decay
    inactive_decay_per_epoch;
    // Meta
    bump;
    version;
    paused;
    _padding;
    constructor(fields) {
        Object.assign(this, fields);
    }
    // Borsh schema (borsh library requires Map<any, any>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static schema = new Map([
        [
            AtomConfig,
            {
                kind: 'struct',
                fields: [
                    ['authority', [32]],
                    ['agent_registry_program', [32]],
                    ['alpha_fast', 'u16'],
                    ['alpha_slow', 'u16'],
                    ['alpha_volatility', 'u16'],
                    ['alpha_arrival', 'u16'],
                    ['alpha_quality', 'u16'],
                    ['alpha_quality_up', 'u16'],
                    ['alpha_quality_down', 'u16'],
                    ['alpha_burst_up', 'u16'],
                    ['alpha_burst_down', 'u16'],
                    ['weight_sybil', 'u8'],
                    ['weight_burst', 'u8'],
                    ['weight_stagnation', 'u8'],
                    ['weight_shock', 'u8'],
                    ['weight_volatility', 'u8'],
                    ['weight_arrival', 'u8'],
                    ['diversity_threshold', 'u8'],
                    ['burst_threshold', 'u8'],
                    ['shock_threshold', 'u16'],
                    ['volatility_threshold', 'u16'],
                    ['arrival_fast_threshold', 'u16'],
                    ['tier_platinum_quality', 'u16'],
                    ['tier_platinum_risk', 'u8'],
                    ['tier_platinum_confidence', 'u16'],
                    ['tier_gold_quality', 'u16'],
                    ['tier_gold_risk', 'u8'],
                    ['tier_gold_confidence', 'u16'],
                    ['tier_silver_quality', 'u16'],
                    ['tier_silver_risk', 'u8'],
                    ['tier_silver_confidence', 'u16'],
                    ['tier_bronze_quality', 'u16'],
                    ['tier_bronze_risk', 'u8'],
                    ['tier_bronze_confidence', 'u16'],
                    ['cold_start_min', 'u16'],
                    ['cold_start_max', 'u16'],
                    ['cold_start_penalty_heavy', 'u16'],
                    ['cold_start_penalty_per_feedback', 'u16'],
                    ['uniqueness_bonus', 'u16'],
                    ['loyalty_bonus', 'u16'],
                    ['loyalty_min_slot_delta', 'u32'],
                    ['bonus_max_burst_pressure', 'u8'],
                    ['inactive_decay_per_epoch', 'u16'],
                    ['bump', 'u8'],
                    ['version', 'u8'],
                    ['paused', 'u8'], // bool as u8
                    ['_padding', [5]],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        const dataWithoutDiscriminator = data.slice(8);
        return deserializeUnchecked(AtomConfig.schema, AtomConfig, dataWithoutDiscriminator);
    }
    getAuthorityPublicKey() {
        return new PublicKey(this.authority);
    }
    getAgentRegistryProgramPublicKey() {
        return new PublicKey(this.agent_registry_program);
    }
    isPaused() {
        return this.paused;
    }
}
// Export schema references for direct access
export const ATOM_CONFIG_SCHEMA = AtomConfig.schema;
//# sourceMappingURL=atom-schemas.js.map