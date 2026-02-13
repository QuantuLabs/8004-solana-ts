import { describe, it, expect, jest } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

const { ACCOUNT_DISCRIMINATORS } = await import(
  '../../src/core/instruction-discriminators.js'
);
const {
  AtomStats,
  AtomConfig,
  TrustTier,
  getTrustTierName,
  trustTierToString,
  ATOM_STATS_SCHEMA,
  ATOM_CONFIG_SCHEMA,
} = await import('../../src/core/atom-schemas.js');

// Helper: build a buffer with discriminator + payload
function buildAccountBuffer(discriminator: Buffer, payload: Buffer): Buffer {
  return Buffer.concat([discriminator, payload]);
}

// Helper: 32-byte array
function pubkeyBytes(seed = 0): Uint8Array {
  return Buffer.alloc(32, seed);
}

// Helper: write u64 LE
function writeU64(val: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(val);
  return buf;
}

// Helper: write u16 LE
function writeU16(val: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(val);
  return buf;
}

// Helper: write u32 LE
function writeU32(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val);
  return buf;
}

/**
 * Build a complete AtomStats payload (553 bytes)
 * Matches the exact on-chain layout
 */
function buildAtomStatsPayload(overrides: {
  collection?: Uint8Array;
  asset?: Uint8Array;
  firstFeedbackSlot?: bigint;
  lastFeedbackSlot?: bigint;
  feedbackCount?: bigint;
  emaScoreFast?: number;
  emaScoreSlow?: number;
  emaVolatility?: number;
  emaArrivalLog?: number;
  peakEma?: number;
  maxDrawdown?: number;
  epochCount?: number;
  currentEpoch?: number;
  minScore?: number;
  maxScore?: number;
  firstScore?: number;
  lastScore?: number;
  hllPacked?: Uint8Array;
  hllSalt?: bigint;
  recentCallers?: bigint[];
  burstPressure?: number;
  updatesSinceHllChange?: number;
  negPressure?: number;
  evictionCursor?: number;
  ringBaseSlot?: bigint;
  qualityVelocity?: number;
  velocityEpoch?: number;
  freezeEpochs?: number;
  qualityFloor?: number;
  bypassCount?: number;
  bypassScoreAvg?: number;
  bypassFingerprints?: bigint[];
  bypassFpCursor?: number;
  loyaltyScore?: number;
  qualityScore?: number;
  riskScore?: number;
  diversityRatio?: number;
  trustTier?: number;
  tierCandidate?: number;
  tierCandidateEpoch?: number;
  tierConfirmed?: number;
  flags?: number;
  confidence?: number;
  bump?: number;
  schemaVersion?: number;
} = {}): Buffer {
  const parts: Buffer[] = [];

  // BLOC 0: Identity (64 bytes)
  parts.push(Buffer.from(overrides.collection ?? pubkeyBytes(1)));
  parts.push(Buffer.from(overrides.asset ?? pubkeyBytes(2)));

  // BLOC 1: Core (24 bytes)
  parts.push(writeU64(overrides.firstFeedbackSlot ?? 100n));
  parts.push(writeU64(overrides.lastFeedbackSlot ?? 200n));
  parts.push(writeU64(overrides.feedbackCount ?? 50n));

  // BLOC 2: Dual-EMA (12 bytes)
  parts.push(writeU16(overrides.emaScoreFast ?? 7500));
  parts.push(writeU16(overrides.emaScoreSlow ?? 7200));
  parts.push(writeU16(overrides.emaVolatility ?? 300));
  parts.push(writeU16(overrides.emaArrivalLog ?? 500));
  parts.push(writeU16(overrides.peakEma ?? 7500));
  parts.push(writeU16(overrides.maxDrawdown ?? 100));

  // BLOC 3: Epoch tracking (8 bytes)
  parts.push(writeU16(overrides.epochCount ?? 10));
  parts.push(writeU16(overrides.currentEpoch ?? 12));
  parts.push(Buffer.from([
    overrides.minScore ?? 40,
    overrides.maxScore ?? 95,
    overrides.firstScore ?? 60,
    overrides.lastScore ?? 85,
  ]));

  // BLOC 4: HLL (128 bytes)
  parts.push(Buffer.from(overrides.hllPacked ?? Buffer.alloc(128)));

  // BLOC 4b: HLL Salt (8 bytes)
  parts.push(writeU64(overrides.hllSalt ?? 12345n));

  // BLOC 5: Ring buffer (24×u64 = 192 bytes + 4 u8 = 196 bytes)
  const callers = overrides.recentCallers ?? Array(24).fill(0n);
  for (let i = 0; i < 24; i++) {
    parts.push(writeU64(callers[i] ?? 0n));
  }
  parts.push(Buffer.from([
    overrides.burstPressure ?? 0,
    overrides.updatesSinceHllChange ?? 0,
    overrides.negPressure ?? 0,
    overrides.evictionCursor ?? 0,
  ]));

  // BLOC 5b: MRT Eviction Protection (8 bytes)
  parts.push(writeU64(overrides.ringBaseSlot ?? 0n));

  // BLOC 5c: Quality Circuit Breaker (6 bytes)
  parts.push(writeU16(overrides.qualityVelocity ?? 0));
  parts.push(writeU16(overrides.velocityEpoch ?? 0));
  parts.push(Buffer.from([overrides.freezeEpochs ?? 0, overrides.qualityFloor ?? 0]));

  // BLOC 5d: Bypass Tracking (83 bytes)
  parts.push(Buffer.from([overrides.bypassCount ?? 0, overrides.bypassScoreAvg ?? 0]));
  const bfp = overrides.bypassFingerprints ?? Array(10).fill(0n);
  for (let i = 0; i < 10; i++) {
    parts.push(writeU64(bfp[i] ?? 0n));
  }
  parts.push(Buffer.from([overrides.bypassFpCursor ?? 0]));

  // BLOC 6: Output cache (8 bytes)
  parts.push(writeU16(overrides.loyaltyScore ?? 500));
  parts.push(writeU16(overrides.qualityScore ?? 7500));
  parts.push(Buffer.from([
    overrides.riskScore ?? 15,
    overrides.diversityRatio ?? 200,
    overrides.trustTier ?? 3,
  ]));

  // BLOC 6b: Tier Vesting (4 bytes)
  parts.push(Buffer.from([overrides.tierCandidate ?? 0]));
  parts.push(writeU16(overrides.tierCandidateEpoch ?? 0));
  parts.push(Buffer.from([overrides.tierConfirmed ?? 0]));

  // BLOC 7: Meta (5 bytes)
  parts.push(Buffer.from([overrides.flags ?? 0]));
  parts.push(writeU16(overrides.confidence ?? 8000));
  parts.push(Buffer.from([overrides.bump ?? 255, overrides.schemaVersion ?? 1]));

  return Buffer.concat(parts);
}

describe('TrustTier', () => {
  it('should have correct enum values', () => {
    expect(TrustTier.Unrated).toBe(0);
    expect(TrustTier.Bronze).toBe(1);
    expect(TrustTier.Silver).toBe(2);
    expect(TrustTier.Gold).toBe(3);
    expect(TrustTier.Platinum).toBe(4);
  });
});

describe('getTrustTierName', () => {
  it('should return correct names', () => {
    expect(getTrustTierName(TrustTier.Unrated)).toBe('Unrated');
    expect(getTrustTierName(TrustTier.Bronze)).toBe('Bronze');
    expect(getTrustTierName(TrustTier.Silver)).toBe('Silver');
    expect(getTrustTierName(TrustTier.Gold)).toBe('Gold');
    expect(getTrustTierName(TrustTier.Platinum)).toBe('Platinum');
  });

  it('should return Unknown for invalid tier', () => {
    expect(getTrustTierName(99 as TrustTier)).toBe('Unknown');
  });

  it('should be aliased as trustTierToString', () => {
    expect(trustTierToString).toBe(getTrustTierName);
  });
});

describe('AtomStats', () => {
  describe('deserialize', () => {
    it('should deserialize valid data', () => {
      const payload = buildAtomStatsPayload({
        feedbackCount: 50n,
        qualityScore: 7500,
        confidence: 8000,
        riskScore: 15,
        trustTier: 3,
        diversityRatio: 200,
        loyaltyScore: 500,
        minScore: 40,
        maxScore: 95,
        firstScore: 60,
        lastScore: 85,
      });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);

      const stats = AtomStats.deserialize(data);
      expect(stats.feedback_count).toBe(50n);
      expect(stats.quality_score).toBe(7500);
      expect(stats.confidence).toBe(8000);
      expect(stats.risk_score).toBe(15);
      expect(stats.trust_tier).toBe(3);
      expect(stats.diversity_ratio).toBe(200);
      expect(stats.loyalty_score).toBe(500);
      expect(stats.min_score).toBe(40);
      expect(stats.max_score).toBe(95);
      expect(stats.first_score).toBe(60);
      expect(stats.last_score).toBe(85);
    });

    it('should reject wrong discriminator', () => {
      const payload = buildAtomStatsPayload();
      const data = Buffer.concat([Buffer.alloc(8), payload]);
      expect(() => AtomStats.deserialize(data)).toThrow('Invalid AtomStats discriminator');
    });

    it('should handle u64 fields as bigint', () => {
      const payload = buildAtomStatsPayload({
        firstFeedbackSlot: 999999999n,
        lastFeedbackSlot: 1000000000n,
        feedbackCount: 42n,
        hllSalt: 0xDEADBEEFn,
      });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.first_feedback_slot).toBe(999999999n);
      expect(stats.last_feedback_slot).toBe(1000000000n);
      expect(stats.feedback_count).toBe(42n);
      expect(stats.hll_salt).toBe(0xDEADBEEFn);
    });

    it('should deserialize recent_callers array', () => {
      const callers = Array(24).fill(0n);
      callers[0] = 111n;
      callers[23] = 999n;
      const payload = buildAtomStatsPayload({ recentCallers: callers });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.recent_callers.length).toBe(24);
      expect(stats.recent_callers[0]).toBe(111n);
      expect(stats.recent_callers[23]).toBe(999n);
    });

    it('should deserialize bypass_fingerprints array', () => {
      const fps = Array(10).fill(0n);
      fps[5] = 777n;
      const payload = buildAtomStatsPayload({ bypassFingerprints: fps });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.bypass_fingerprints.length).toBe(10);
      expect(stats.bypass_fingerprints[5]).toBe(777n);
    });

    it('should deserialize tier vesting fields', () => {
      const payload = buildAtomStatsPayload({
        tierCandidate: 4,
        tierCandidateEpoch: 100,
        tierConfirmed: 3,
      });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.tier_candidate).toBe(4);
      expect(stats.tier_candidate_epoch).toBe(100);
      expect(stats.tier_confirmed).toBe(3);
    });

    it('should deserialize circuit breaker fields', () => {
      const payload = buildAtomStatsPayload({
        qualityVelocity: 500,
        velocityEpoch: 10,
        freezeEpochs: 3,
        qualityFloor: 50,
      });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.quality_velocity).toBe(500);
      expect(stats.velocity_epoch).toBe(10);
      expect(stats.freeze_epochs).toBe(3);
      expect(stats.quality_floor).toBe(50);
    });
  });

  describe('helper methods', () => {
    let stats: InstanceType<typeof AtomStats>;

    beforeAll(() => {
      const payload = buildAtomStatsPayload({
        collection: pubkeyBytes(1),
        asset: pubkeyBytes(2),
        qualityScore: 7500,
        confidence: 8000,
        emaScoreSlow: 7200,
        trustTier: 3,
      });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      stats = AtomStats.deserialize(data);
    });

    it('getCollectionPublicKey', () => {
      expect(stats.getCollectionPublicKey()).toEqual(new PublicKey(pubkeyBytes(1)));
    });

    it('getAssetPublicKey', () => {
      expect(stats.getAssetPublicKey()).toEqual(new PublicKey(pubkeyBytes(2)));
    });

    it('getTrustTier', () => {
      expect(stats.getTrustTier()).toBe(TrustTier.Gold);
    });

    it('getQualityPercent', () => {
      expect(stats.getQualityPercent()).toBe(75);
    });

    it('getConfidencePercent', () => {
      expect(stats.getConfidencePercent()).toBe(80);
    });

    it('getAverageScore', () => {
      expect(stats.getAverageScore()).toBe(72);
    });
  });

  describe('estimateUniqueClients / getUniqueCallersEstimate', () => {
    it('should return 0 for all-zero HLL', () => {
      const payload = buildAtomStatsPayload({ hllPacked: Buffer.alloc(128) });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      expect(stats.estimateUniqueClients()).toBe(0);
      expect(stats.getUniqueCallersEstimate()).toBe(0);
    });

    it('should estimate non-zero for populated HLL', () => {
      const hll = Buffer.alloc(128);
      // Set some registers to non-zero values to simulate unique clients
      // Each byte holds 2 registers (4 bits each)
      for (let i = 0; i < 20; i++) {
        hll[i] = 0x21; // register values: 1 and 2
      }
      const payload = buildAtomStatsPayload({ hllPacked: hll });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      const estimate = stats.estimateUniqueClients();
      expect(estimate).toBeGreaterThan(0);
    });

    it('should use linear counting for small cardinalities', () => {
      const hll = Buffer.alloc(128);
      // Set just a few registers to simulate small cardinality
      hll[0] = 0x01; // first register = 1, second = 0
      const payload = buildAtomStatsPayload({ hllPacked: hll });
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomStats, payload);
      const stats = AtomStats.deserialize(data);
      const estimate = stats.estimateUniqueClients();
      // With only 1 non-zero register out of 256, should be a small number
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(50);
    });
  });

  describe('schema exports', () => {
    it('should export ATOM_STATS_SCHEMA', () => {
      expect(ATOM_STATS_SCHEMA).toBe(AtomStats.schema);
    });
  });
});

describe('AtomConfig', () => {
  function buildAtomConfigPayload(): Buffer {
    const parts: Buffer[] = [];

    // authority (32) + agent_registry_program (32)
    parts.push(Buffer.from(pubkeyBytes(10)));
    parts.push(Buffer.from(pubkeyBytes(20)));

    // EMA Parameters (9×u16 = 18 bytes)
    for (let i = 0; i < 9; i++) {
      parts.push(writeU16(1000 + i));
    }

    // Risk Weights (6×u8)
    parts.push(Buffer.from([25, 20, 15, 10, 10, 20]));

    // Thresholds (2×u8 + 3×u16 = 8 bytes)
    parts.push(Buffer.from([3, 10])); // diversity_threshold, burst_threshold
    parts.push(writeU16(500)); // shock_threshold
    parts.push(writeU16(300)); // volatility_threshold
    parts.push(writeU16(200)); // arrival_fast_threshold

    // Tier Thresholds (4 tiers × (u16 + u8 + u16) = 4×5 = 20 bytes)
    for (let i = 0; i < 4; i++) {
      parts.push(writeU16(9000 - i * 1000)); // quality
      parts.push(Buffer.from([10 + i * 5])); // risk
      parts.push(writeU16(8000 - i * 1000)); // confidence
    }

    // Cold Start (4×u16 = 8 bytes)
    parts.push(writeU16(5));
    parts.push(writeU16(20));
    parts.push(writeU16(500));
    parts.push(writeU16(100));

    // Bonus/Loyalty (3×u16 + u32 + u8 = 11 bytes)
    parts.push(writeU16(200));
    parts.push(writeU16(150));
    parts.push(writeU32(1000));
    parts.push(Buffer.from([50]));

    // Decay (u16)
    parts.push(writeU16(50));

    // Meta: bump(u8) + version(u8) + paused(u8) + _padding(5)
    parts.push(Buffer.from([254, 1, 0]));
    parts.push(Buffer.alloc(5));

    return Buffer.concat(parts);
  }

  describe('deserialize', () => {
    it('should deserialize valid data', () => {
      const payload = buildAtomConfigPayload();
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomConfig, payload);
      const config = AtomConfig.deserialize(data);

      expect(config.getAuthorityPublicKey()).toEqual(new PublicKey(pubkeyBytes(10)));
      expect(config.getAgentRegistryProgramPublicKey()).toEqual(new PublicKey(pubkeyBytes(20)));
      expect(config.bump).toBe(254);
      expect(config.version).toBe(1);
      expect(config.isPaused()).toBeFalsy();
    });

    it('should reject wrong discriminator', () => {
      const payload = buildAtomConfigPayload();
      const data = Buffer.concat([Buffer.alloc(8), payload]);
      expect(() => AtomConfig.deserialize(data)).toThrow('Invalid AtomConfig discriminator');
    });

    it('should deserialize EMA parameters', () => {
      const payload = buildAtomConfigPayload();
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomConfig, payload);
      const config = AtomConfig.deserialize(data);

      expect(config.alpha_fast).toBe(1000);
      expect(config.alpha_slow).toBe(1001);
      expect(config.alpha_volatility).toBe(1002);
    });

    it('should deserialize risk weights', () => {
      const payload = buildAtomConfigPayload();
      const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AtomConfig, payload);
      const config = AtomConfig.deserialize(data);

      expect(config.weight_sybil).toBe(25);
      expect(config.weight_burst).toBe(20);
      expect(config.weight_stagnation).toBe(15);
    });
  });

  describe('schema exports', () => {
    it('should export ATOM_CONFIG_SCHEMA', () => {
      expect(ATOM_CONFIG_SCHEMA).toBe(AtomConfig.schema);
    });
  });
});

// Need beforeAll to be importable in this test scope
import { beforeAll } from '@jest/globals';
