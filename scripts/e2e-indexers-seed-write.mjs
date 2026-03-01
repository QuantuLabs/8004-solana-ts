#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  IPFSClient,
  SolanaSDK,
  computeSealHash,
  createSealParams,
} from '../dist/index.js';
import {
  boolFromEnv,
  errorMessage,
  getArg,
  getArgOr,
  getFlag,
  makeRunId,
  nowIso,
  parseArgs,
  pollWithTimeout,
  resolveFromCwd,
  writeJson,
} from './e2e-indexers-lib.mjs';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function parseSecretKey(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error('SOLANA_PRIVATE_KEY must be a JSON array');
    return Uint8Array.from(arr);
  }
  if (trimmed.includes(',')) {
    return Uint8Array.from(
      trimmed
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((n) => Number.isFinite(n))
    );
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) {
      return Uint8Array.from(decoded);
    }
  } catch {
    // Continue to final error.
  }
  throw new Error(
    'Unsupported SOLANA_PRIVATE_KEY format; expected JSON array, comma-separated bytes, or base58 secret key'
  );
}

function parsePositiveInt(rawValue, fallback, min = 1, max = 1000) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveRevokeWriteOptions({ indexerVisible = true } = {}) {
  if (indexerVisible) {
    return {
      waitForIndexerSync: false,
    };
  }
  return {
    waitForIndexerSync: false,
    verifyFeedbackClient: false,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, attempts = 3, delayMs = 900) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${errorMessage(lastError)}`);
}

function ensureDirFor(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeUtf8(filePath, content) {
  ensureDirFor(filePath);
  writeFileSync(filePath, content, 'utf8');
}

function readTextIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractEnvLikeValue(rawText, key) {
  if (!rawText || typeof rawText !== 'string') return null;
  const envPattern = new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*['"]?([^'" \\n\\r]+)['"]?`);
  const envMatch = rawText.match(envPattern);
  if (envMatch?.[1]) return envMatch[1].trim();

  const normalized = rawText.replace(/\\"/g, '"');
  const quotedPattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
  const quotedMatch = normalized.match(quotedPattern);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const singleQuotedPattern = new RegExp(`${key}\\s*=\\s*'([^']+)'`);
  const singleQuotedMatch = normalized.match(singleQuotedPattern);
  if (singleQuotedMatch?.[1]) return singleQuotedMatch[1].trim();

  return null;
}

function extractJwtFromText(rawText) {
  return extractEnvLikeValue(rawText, 'PINATA_JWT');
}

function resolvePrivateKey(args) {
  const direct =
    process.env.E2E_INDEXERS_SOLANA_PRIVATE_KEY ||
    process.env.SOLANA_PRIVATE_KEY ||
    null;
  if (direct) return direct;

  const argPath = getArg(args, 'private-key-file');
  const probeFiles = [
    argPath ? resolveFromCwd(argPath) : null,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../8004-solana/.env'),
    resolve(process.cwd(), '../8004-solana-mcp/.env'),
  ].filter(Boolean);

  for (const probeFile of probeFiles) {
    const content = readTextIfExists(probeFile);
    if (!content) continue;
    const fromSol = extractEnvLikeValue(content, 'SOLANA_PRIVATE_KEY');
    if (fromSol) return fromSol;
    const fromAgent = extractEnvLikeValue(content, 'AGENT_PRIVATE_KEY');
    if (fromAgent) return fromAgent;
  }

  return null;
}

function resolvePinataJwt(args) {
  const direct =
    getArg(args, 'pinata-jwt') ||
    process.env.E2E_INDEXERS_PINATA_JWT ||
    process.env.PINATA_JWT ||
    null;
  if (direct) {
    return { jwt: direct, source: 'env_or_arg' };
  }

  const argPath = getArg(args, 'pinata-jwt-file');
  const probeFiles = [
    argPath ? resolveFromCwd(argPath) : null,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.claude/settings.local.json'),
    resolve(process.cwd(), '../8004-solana-mcp/.env'),
    resolve(process.cwd(), '../8004-solana-mcp/.claude/settings.local.json'),
    resolve(process.cwd(), '../.claude/settings.local.json'),
  ].filter(Boolean);

  for (const probeFile of probeFiles) {
    const content = readTextIfExists(probeFile);
    const jwt = extractJwtFromText(content);
    if (jwt) return { jwt, source: probeFile };
  }

  return { jwt: null, source: null };
}

function resolveIpfsApiUrl(args) {
  const fromArg = getArg(args, 'ipfs-api-url');
  if (fromArg) {
    return { apiUrl: fromArg, source: '--ipfs-api-url' };
  }

  if (process.env.E2E_INDEXERS_IPFS_API_URL) {
    return { apiUrl: process.env.E2E_INDEXERS_IPFS_API_URL, source: 'E2E_INDEXERS_IPFS_API_URL' };
  }
  if (process.env.IPFS_API_URL) {
    return { apiUrl: process.env.IPFS_API_URL, source: 'IPFS_API_URL' };
  }
  return { apiUrl: null, source: null };
}

function resolveIpfsClientConfig(args) {
  const local = resolveIpfsApiUrl(args);
  if (local.apiUrl) {
    return {
      provider: 'local',
      clientConfig: { url: local.apiUrl },
      source: local.source,
      apiUrl: local.apiUrl,
    };
  }

  const pinata = resolvePinataJwt(args);
  if (pinata.jwt) {
    return {
      provider: 'pinata',
      clientConfig: {
        pinataEnabled: true,
        pinataJwt: pinata.jwt,
      },
      source: pinata.source || 'PINATA_JWT',
      apiUrl: null,
    };
  }

  return {
    provider: null,
    clientConfig: null,
    source: null,
    apiUrl: null,
  };
}

function fallbackCid(seed) {
  let payload = '';
  for (let i = 0; i < 58; i += 1) {
    const charCode = seed.charCodeAt(i % seed.length);
    const alphabetIndex = (charCode + i * 13) % BASE32_ALPHABET.length;
    payload += BASE32_ALPHABET[alphabetIndex];
  }
  return `b${payload}`;
}

function short(value, size = 8) {
  if (!value) return '';
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildAvatarSvg({ title, subtitle, seed, width = 512, height = 512 }) {
  const hueA = (seed * 47) % 360;
  const hueB = (seed * 91 + 120) % 360;
  const hueC = (seed * 23 + 220) % 360;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="hsl(${hueA},80%,55%)"/>`,
    `<stop offset="100%" stop-color="hsl(${hueB},80%,35%)"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="url(#bg)"/>`,
    `<circle cx="${width * 0.25}" cy="${height * 0.28}" r="${height * 0.14}" fill="hsla(${hueC},90%,70%,0.35)"/>`,
    `<circle cx="${width * 0.78}" cy="${height * 0.68}" r="${height * 0.18}" fill="hsla(${hueA},90%,75%,0.22)"/>`,
    `<rect x="${width * 0.08}" y="${height * 0.72}" width="${width * 0.84}" height="${height * 0.22}" rx="22" fill="rgba(15,23,42,0.52)"/>`,
    `<text x="${width * 0.12}" y="${height * 0.80}" fill="#f8fafc" font-size="34" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-weight="700">${escapeXml(title)}</text>`,
    `<text x="${width * 0.12}" y="${height * 0.88}" fill="#e2e8f0" font-size="20" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${escapeXml(subtitle)}</text>`,
    `</svg>`,
  ].join('\n');
}

function asTxError(result, label) {
  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    const reason = typeof result.error === 'string' ? result.error : 'unknown error';
    return new Error(`${label} failed: ${reason}`);
  }
  return null;
}

function coerceFeedbackIndex(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  throw new Error(`Invalid feedbackIndex: ${String(value)}`);
}

function toWalletRecord(label, keypair, extra = {}) {
  return {
    label,
    publicKey: keypair.publicKey.toBase58(),
    privateKeyBase58: bs58.encode(keypair.secretKey),
    ...extra,
  };
}

async function uploadJson({
  ipfsClient,
  data,
  fallbackSeed,
  artifact,
  kind,
}) {
  if (!ipfsClient) {
    const cid = fallbackCid(fallbackSeed);
    return { cid, uri: `ipfs://${cid}`, uploaded: false };
  }
  const cid = await withRetry(
    `ipfs.addJson(${kind})`,
    () => ipfsClient.addJson(data),
    3,
    1200
  );
  artifact.ipfs.uploadCount += 1;
  if (artifact.ipfs.uploads.length < 64) {
    artifact.ipfs.uploads.push({ kind, cid });
  }
  return { cid, uri: `ipfs://${cid}`, uploaded: true };
}

async function uploadSvg({
  ipfsClient,
  outputPath,
  svg,
  fallbackSeed,
  artifact,
  kind,
}) {
  writeUtf8(outputPath, svg);
  if (!ipfsClient) {
    const cid = fallbackCid(fallbackSeed);
    return { cid, uri: `ipfs://${cid}`, uploaded: false };
  }
  const cid = await withRetry(
    `ipfs.addFile(${kind})`,
    () => ipfsClient.addFile(outputPath),
    3,
    1200
  );
  artifact.ipfs.uploadCount += 1;
  if (artifact.ipfs.uploads.length < 64) {
    artifact.ipfs.uploads.push({ kind, cid });
  }
  return { cid, uri: `ipfs://${cid}`, uploaded: true };
}

function finalizeAndWrite(artifactPath, payload) {
  writeJson(artifactPath, payload);
  console.log(`Seed artifact: ${artifactPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = getArgOr(args, 'run-id', process.env.E2E_INDEXERS_RUN_ID || makeRunId('seed'));
  const artifactPath = resolveFromCwd(
    getArgOr(args, 'artifact', `artifacts/e2e-indexers/${runId}/jobs/seed-write.json`)
  );
  const walletsPath = resolveFromCwd(
    getArgOr(args, 'wallets-artifact', `artifacts/e2e-indexers/${runId}/generated-wallets.json`)
  );

  const startedAtMs = Date.now();
  const startedAt = nowIso();

  const requireIpfs =
    getFlag(args, 'require-ipfs') ||
    boolFromEnv('E2E_INDEXERS_REQUIRE_IPFS', false);
  const disableIpfs =
    getFlag(args, 'disable-ipfs') ||
    boolFromEnv('E2E_INDEXERS_DISABLE_IPFS', false);
  const agentCount = parsePositiveInt(
    getArgOr(args, 'agent-count', process.env.E2E_INDEXERS_AGENT_COUNT || '4'),
    4,
    1,
    50
  );
  const feedbackPerAgent = parsePositiveInt(
    getArgOr(args, 'feedback-per-agent', process.env.E2E_INDEXERS_FEEDBACK_PER_AGENT || '2'),
    2,
    1,
    10
  );
  const feedbackWalletCount = parsePositiveInt(
    getArgOr(
      args,
      'feedback-wallet-count',
      process.env.E2E_INDEXERS_FEEDBACK_WALLET_COUNT || '2'
    ),
    2,
    1,
    12
  );
  const pendingValidationCount = parsePositiveInt(
    getArgOr(
      args,
      'pending-validations',
      process.env.E2E_INDEXERS_PENDING_VALIDATIONS || '0'
    ),
    0,
    0,
    20
  );
  const includeValidations =
    getFlag(args, 'include-validations') ||
    boolFromEnv('E2E_INDEXERS_INCLUDE_VALIDATIONS', false);
  const enableTransfer =
    getFlag(args, 'enable-transfer') ||
    boolFromEnv('E2E_INDEXERS_ENABLE_TRANSFER', true);
  const reuseOwnerForFeedback =
    getFlag(args, 'reuse-owner-feedback') ||
    boolFromEnv('E2E_INDEXERS_REUSE_OWNER_FEEDBACK', false);
  const explicitFeedbackSignerRaw =
    getArg(args, 'feedback-signer-private-key') ||
    process.env.E2E_INDEXERS_FEEDBACK_PRIVATE_KEY ||
    process.env.E2E_INDEXERS_FEEDBACK_SIGNER_PRIVATE_KEY ||
    null;

  const disableWrites =
    getFlag(args, 'skip-write') ||
    boolFromEnv('E2E_INDEXERS_DISABLE_WRITES', false) ||
    boolFromEnv('E2E_INDEXERS_SKIP_SEED_WRITE', false);

  const rpcUrl = getArgOr(args, 'rpc-url', process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const indexerUrl =
    getArg(args, 'indexer-url') ||
    process.env.INDEXER_URL ||
    null;
  const indexerApiKey =
    getArg(args, 'indexer-api-key') ||
    process.env.INDEXER_API_KEY ||
    undefined;
  const revokePreflightPollAttempts = parsePositiveInt(
    getArgOr(
      args,
      'revoke-preflight-poll-attempts',
      process.env.E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_ATTEMPTS || '12'
    ),
    12,
    1,
    60
  );
  const revokePreflightPollDelayMs = parsePositiveInt(
    getArgOr(
      args,
      'revoke-preflight-poll-delay-ms',
      process.env.E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_DELAY_MS || '750'
    ),
    750,
    50,
    5000
  );
  const revokePreflightPollTimeoutMs = parsePositiveInt(
    getArgOr(
      args,
      'revoke-preflight-poll-timeout-ms',
      process.env.E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_TIMEOUT_MS ||
        String(revokePreflightPollAttempts * revokePreflightPollDelayMs)
    ),
    revokePreflightPollAttempts * revokePreflightPollDelayMs,
    revokePreflightPollDelayMs,
    120000
  );

  const artifact = {
    runId,
    status: 'skipped',
    startedAt,
    endedAt: nowIso(),
    durationMs: 0,
    rpcUrl,
    indexerUrl,
    wallet: null,
    feedbackWallet: null,
    feedbackWallets: [],
    seedAsset: null,
    seedAssets: [],
    registerSignature: null,
    metadataSignature: null,
    metadataKey: null,
    metadataValue: null,
    indexerSynced: null,
    settings: {
      requireIpfs,
      disableIpfs,
      agentCount,
      feedbackPerAgent,
      feedbackWalletCount,
      pendingValidationCount,
      includeValidations,
      enableTransfer,
      reuseOwnerForFeedback,
      hasExplicitFeedbackSigner: Boolean(explicitFeedbackSignerRaw),
      revokePreflightPollAttempts,
      revokePreflightPollDelayMs,
      revokePreflightPollTimeoutMs,
    },
    generatedDir: null,
    walletsFile: walletsPath,
    collections: [],
    ipfs: {
      enabled: false,
      provider: null,
      source: null,
      apiUrl: null,
      uploadCount: 0,
      uploads: [],
    },
    expected: {
      agents: [],
      feedbacks: [],
      pendingValidations: [],
      agentUriMetadata: [],
      collections: [],
    },
    payloadSamples: {
      feedbacks: [],
      responses: [],
    },
    counters: {
      register: 0,
      setMetadata: 0,
      setCollectionPointer: 0,
      setParentAsset: 0,
      setAgentUri: 0,
      giveFeedback: 0,
      appendResponse: 0,
      revokeFeedback: 0,
      revokeFeedbackLagFallback: 0,
      requestValidation: 0,
      respondValidation: 0,
      transferAgent: 0,
    },
    warnings: [],
    errors: [],
  };

  if (disableWrites) {
    artifact.status = 'skipped';
    artifact.errors.push('Seed/write skipped by E2E_INDEXERS_DISABLE_WRITES / --skip-write');
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    finalizeAndWrite(artifactPath, artifact);
    return;
  }

  const privateKeyRaw = resolvePrivateKey(args);
  if (!privateKeyRaw) {
    artifact.status = 'skipped';
    artifact.errors.push('Missing SOLANA_PRIVATE_KEY (or E2E_INDEXERS_SOLANA_PRIVATE_KEY); seed/write not executed');
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    finalizeAndWrite(artifactPath, artifact);
    return;
  }

  const generatedWallets = [];

  try {
    const signer = Keypair.fromSecretKey(parseSecretKey(privateKeyRaw));
    artifact.wallet = signer.publicKey.toBase58();
    generatedWallets.push({
      label: 'owner_reference',
      publicKey: signer.publicKey.toBase58(),
    });

    let ipfsClient = null;
    if (!disableIpfs) {
      const ipfsConfig = resolveIpfsClientConfig(args);
      if (ipfsConfig.clientConfig) {
        ipfsClient = new IPFSClient(ipfsConfig.clientConfig);
        artifact.ipfs.enabled = true;
        artifact.ipfs.provider = ipfsConfig.provider;
        artifact.ipfs.source = ipfsConfig.source;
        artifact.ipfs.apiUrl = ipfsConfig.apiUrl;
      } else {
        artifact.ipfs.enabled = false;
        artifact.ipfs.provider = null;
        artifact.ipfs.source = null;
        artifact.ipfs.apiUrl = null;
        if (requireIpfs) {
          throw new Error(
            'No IPFS provider configured. Set E2E_INDEXERS_IPFS_API_URL/--ipfs-api-url (local IPFS) or PINATA_JWT, or disable --require-ipfs'
          );
        }
      }
    } else {
      artifact.ipfs.enabled = false;
      artifact.ipfs.provider = 'disabled';
      artifact.ipfs.source = 'disabled';
      artifact.ipfs.apiUrl = null;
    }

    const sdkConfig = {
      rpcUrl,
      signer,
      ...(ipfsClient ? { ipfsClient } : {}),
    };
    if (indexerUrl) sdkConfig.indexerUrl = indexerUrl;
    if (indexerApiKey) sdkConfig.indexerApiKey = indexerApiKey;
    const sdk = new SolanaSDK(sdkConfig);
    const connection = sdk.getSolanaClient().getConnection();

    const rentExemptMin = await connection.getMinimumBalanceForRentExemption(0);
    const minWalletFunding = rentExemptMin + 150_000;
    const estimatedFeedbackTx = Math.max(1, Math.ceil(agentCount * feedbackPerAgent * 2.2));
    const estimatedPerWalletLamports = Math.max(
      minWalletFunding,
      Math.min(
        5_000_000,
        Math.ceil(estimatedFeedbackTx / feedbackWalletCount) * 45_000 + minWalletFunding
      )
    );
    const fundingLamportsPerWallet = parsePositiveInt(
      getArgOr(
        args,
        'feedback-wallet-lamports',
        process.env.E2E_INDEXERS_FEEDBACK_WALLET_LAMPORTS ||
          process.env.E2E_INDEXERS_FEEDBACK_SIGNER_LAMPORTS ||
          String(estimatedPerWalletLamports)
      ),
      estimatedPerWalletLamports,
      minWalletFunding,
      200000000
    );

    const ownerBalance = await connection.getBalance(signer.publicKey);
    const ownerReserve = Math.max(rentExemptMin, 400_000);
    const fundingBudget = Math.max(0, ownerBalance - ownerReserve);
    let affordableWalletCount = Math.max(
      1,
      Math.min(feedbackWalletCount, Math.floor(fundingBudget / fundingLamportsPerWallet))
    );
    if (explicitFeedbackSignerRaw) {
      affordableWalletCount = 1;
      if (!artifact.notes) artifact.notes = [];
      artifact.notes.push('explicit feedback signer configured: no generated feedback signer funding transfer');
      artifact.settings.feedbackWalletCount = 1;
    } else if (reuseOwnerForFeedback) {
      affordableWalletCount = 1;
      if (!artifact.notes) artifact.notes = [];
      artifact.notes.push('reuse_owner_for_feedback enabled: no feedback wallet funding transfer');
      artifact.settings.feedbackWalletCount = 1;
    } else if (affordableWalletCount < feedbackWalletCount) {
      if (!artifact.notes) artifact.notes = [];
      artifact.notes.push(
        `feedback_wallet_count reduced from ${feedbackWalletCount} to ${affordableWalletCount} (budget constrained)`
      );
      artifact.settings.feedbackWalletCount = affordableWalletCount;
    }

    const feedbackRunners = [];
    if (explicitFeedbackSignerRaw) {
      const feedbackKp = Keypair.fromSecretKey(parseSecretKey(explicitFeedbackSignerRaw));
      if (feedbackKp.publicKey.equals(signer.publicKey)) {
        throw new Error('Explicit feedback signer must differ from owner to avoid self-feedback');
      }
      const feedbackSdkConfig = {
        rpcUrl,
        signer: feedbackKp,
        ...(ipfsClient ? { ipfsClient } : {}),
      };
      if (indexerUrl) feedbackSdkConfig.indexerUrl = indexerUrl;
      if (indexerApiKey) feedbackSdkConfig.indexerApiKey = indexerApiKey;
      feedbackRunners.push({
        keypair: feedbackKp,
        sdk: new SolanaSDK(feedbackSdkConfig),
      });
      generatedWallets.push({
        label: 'feedback_signer_explicit',
        publicKey: feedbackKp.publicKey.toBase58(),
      });
    } else if (reuseOwnerForFeedback) {
      feedbackRunners.push({
        keypair: signer,
        sdk,
      });
      generatedWallets.push({
        label: 'feedback_signer_reused_owner',
        publicKey: signer.publicKey.toBase58(),
      });
    } else {
      for (let i = 0; i < affordableWalletCount; i += 1) {
        const kp = Keypair.generate();
        const label = `feedback_signer_${String(i + 1).padStart(2, '0')}`;
        generatedWallets.push(toWalletRecord(label, kp));
        const feedbackSdkConfig = {
          rpcUrl,
          signer: kp,
          ...(ipfsClient ? { ipfsClient } : {}),
        };
        if (indexerUrl) feedbackSdkConfig.indexerUrl = indexerUrl;
        if (indexerApiKey) feedbackSdkConfig.indexerApiKey = indexerApiKey;
        feedbackRunners.push({
          keypair: kp,
          sdk: new SolanaSDK(feedbackSdkConfig),
        });
      }
    }

    artifact.feedbackWallet = feedbackRunners[0].keypair.publicKey.toBase58();
    artifact.feedbackWallets = feedbackRunners.map((entry) => entry.keypair.publicKey.toBase58());

    if (explicitFeedbackSignerRaw) {
      const explicitFeedbackBalance = await connection.getBalance(feedbackRunners[0].keypair.publicKey);
      if (explicitFeedbackBalance < minWalletFunding) {
        throw new Error(
          `Explicit feedback signer balance too low: ${explicitFeedbackBalance} lamports < required ${minWalletFunding}`
        );
      }
    } else if (!reuseOwnerForFeedback) {
      for (let i = 0; i < feedbackRunners.length; i += 1) {
        const feedbackSigner = feedbackRunners[i].keypair;
        const feedbackBalance = await connection.getBalance(feedbackSigner.publicKey);
        if (feedbackBalance >= fundingLamportsPerWallet) continue;
        const lamportsToFund = fundingLamportsPerWallet - feedbackBalance;
        await withRetry(
          `fund-feedback-signer-${i + 1}`,
          () => {
            const fundingTx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: signer.publicKey,
                toPubkey: feedbackSigner.publicKey,
                lamports: lamportsToFund,
              })
            );
            return sendAndConfirmTransaction(connection, fundingTx, [signer]);
          },
          3,
          1200
        );
      }
    }

    const generatedDir = resolveFromCwd(
      `artifacts/e2e-indexers/${runId}/generated-assets`
    );
    mkdirSync(generatedDir, { recursive: true });
    artifact.generatedDir = generatedDir;

    const baseSocials = {
      website: 'https://quantu.ai',
      x: '@quantu_labs',
      discord: 'https://discord.gg/quantu',
    };

    const collectionDefs = [
      { key: 'alpha', name: 'Alpha Agents', symbol: 'ALPHA' },
      { key: 'beta', name: 'Beta Operators', symbol: 'BETA' },
    ];
    const collections = [];
    for (let i = 0; i < collectionDefs.length; i += 1) {
      const def = collectionDefs[i];
      const collectionName = `${def.name} ${runId}`;
      const collectionDescription = `E2E collection for ${runId}`;
      const logoSvg = buildAvatarSvg({
        title: def.symbol,
        subtitle: `${runId} logo`,
        seed: i + 100,
      });
      const bannerSvg = buildAvatarSvg({
        title: `${def.symbol} Banner`,
        subtitle: `run ${runId}`,
        seed: i + 180,
        width: 1280,
        height: 512,
      });

      const logoFile = resolve(generatedDir, `collection-${def.key}-logo.svg`);
      const bannerFile = resolve(generatedDir, `collection-${def.key}-banner.svg`);
      const logoUpload = await uploadSvg({
        ipfsClient,
        outputPath: logoFile,
        svg: logoSvg,
        fallbackSeed: `${runId}:col:${def.key}:logo`,
        artifact,
        kind: `collection_logo_${def.key}`,
      });
      const bannerUpload = await uploadSvg({
        ipfsClient,
        outputPath: bannerFile,
        svg: bannerSvg,
        fallbackSeed: `${runId}:col:${def.key}:banner`,
        artifact,
        kind: `collection_banner_${def.key}`,
      });

      let pointer;
      let cid;
      let uri;
      if (ipfsClient) {
        const created = await withRetry(
          `sdk.createCollection(${def.key})`,
          () =>
            sdk.createCollection({
              name: collectionName,
              symbol: def.symbol,
              description: collectionDescription,
              image: logoUpload.uri,
              banner_image: bannerUpload.uri,
              socials: baseSocials,
            }),
          3,
          1200
        );
        cid = created?.cid || null;
        pointer = created?.pointer || (cid ? `c1:${cid}` : null);
        uri = created?.uri || (cid ? `ipfs://${cid}` : null);
      } else {
        cid = fallbackCid(`${runId}:collection:${def.key}`);
        pointer = `c1:${cid}`;
        uri = `ipfs://${cid}`;
      }

      if (!pointer) {
        throw new Error(`Failed to build collection pointer for ${def.key}`);
      }

      const collectionRecord = {
        key: def.key,
        cid,
        uri,
        pointer,
        version: '1.0.0',
        name: collectionName,
        symbol: def.symbol,
        description: collectionDescription,
        image: logoUpload.uri,
        banner_image: bannerUpload.uri,
        social_website: baseSocials.website,
        social_x: baseSocials.x,
        social_discord: baseSocials.discord,
      };
      collections.push(collectionRecord);
      artifact.collections.push(collectionRecord);
    }

    const createdAgents = [];
    for (let i = 0; i < agentCount; i += 1) {
      const code = String(i + 1).padStart(3, '0');
      const title = `Agent ${code}`;
      const subtitle = `${runId}`;
      let imageUri;
      let bannerUri;

      if (i < 3 || i % 2 === 0) {
        const imageSvg = buildAvatarSvg({
          title,
          subtitle: `avatar ${short(runId, 6)}`,
          seed: i + 1,
        });
        const bannerSvg = buildAvatarSvg({
          title: `${title} Banner`,
          subtitle: `metadata`,
          seed: i + 200,
          width: 1280,
          height: 512,
        });
        const imageFile = resolve(generatedDir, `agent-${code}-image.svg`);
        const bannerFile = resolve(generatedDir, `agent-${code}-banner.svg`);
        const imageUpload = await uploadSvg({
          ipfsClient,
          outputPath: imageFile,
          svg: imageSvg,
          fallbackSeed: `${runId}:agent:${code}:image`,
          artifact,
          kind: `agent_image_${code}`,
        });
        const bannerUpload = await uploadSvg({
          ipfsClient,
          outputPath: bannerFile,
          svg: bannerSvg,
          fallbackSeed: `${runId}:agent:${code}:banner`,
          artifact,
          kind: `agent_banner_${code}`,
        });
        imageUri = imageUpload.uri;
        bannerUri = bannerUpload.uri;
      } else {
        imageUri = collections[0]?.image || `ipfs://${fallbackCid(`${runId}:shared:image`)}`;
        bannerUri = collections[0]?.banner_image || `ipfs://${fallbackCid(`${runId}:shared:banner`)}`;
      }

      const metadataV1 = {
        version: '1.0.0',
        name: `${title} (${runId})`,
        symbol: `A${String(i + 1).padStart(2, '0')}`,
        description: `E2E generated metadata for ${title}.`,
        image: imageUri,
        banner_image: bannerUri,
        external_url: `https://quantu.ai/agents/${runId}/${code}`,
        socials: {
          ...baseSocials,
          x: `@${runId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${code}`,
        },
        tags: ['e2e', 'solana', 'agent0'],
        properties: {
          runId,
          slot: i,
          strategy: i % 2 === 0 ? 'deterministic' : 'adaptive',
        },
      };
      const metadataUploadV1 = await uploadJson({
        ipfsClient,
        data: metadataV1,
        fallbackSeed: `${runId}:agent:${code}:metadata:v1`,
        artifact,
        kind: `agent_metadata_v1_${code}`,
      });

      const registerResult = await withRetry(
        `sdk.registerAgent(agent_${code})`,
        () => sdk.registerAgent(metadataUploadV1.uri),
        3,
        1400
      );
      const registerError = asTxError(registerResult, `registerAgent(agent_${code})`);
      if (registerError) throw registerError;
      const asset = registerResult?.asset ? registerResult.asset.toBase58() : null;
      if (!asset) {
        throw new Error(`registerAgent(agent_${code}) returned no asset`);
      }

      artifact.counters.register += 1;
      if (!artifact.seedAsset) artifact.seedAsset = asset;
      if (!artifact.registerSignature) artifact.registerSignature = registerResult?.signature || null;
      artifact.seedAssets.push(asset);

      const assetPubkey = new PublicKey(asset);
      const expectedAgent = {
        asset,
        owner: signer.publicKey.toBase58(),
        col: null,
        colLocked: null,
        parentAsset: null,
        parentLocked: null,
        uriMetadataExpected: false,
        uriMetadata: {
          '_uri:name': metadataV1.name,
          '_uri:description': metadataV1.description,
          '_uri:image': metadataV1.image,
        },
      };

      const metadataKey = 'e2e_idx_run';
      const metadataValue = `seeded:${runId}:${code}`;
      const metadataResult = await withRetry(
        `sdk.setMetadata(agent_${code},${metadataKey})`,
        () => sdk.setMetadata(assetPubkey, metadataKey, metadataValue),
        3,
        1000
      );
      const metadataError = asTxError(metadataResult, `setMetadata(agent_${code})`);
      if (metadataError) throw metadataError;
      artifact.counters.setMetadata += 1;
      if (!artifact.metadataSignature) artifact.metadataSignature = metadataResult?.signature || null;
      if (!artifact.metadataKey) artifact.metadataKey = metadataKey;
      if (!artifact.metadataValue) artifact.metadataValue = metadataValue;

      const profileValue = `tier:${i % 3};region:${i % 2 ? 'eu' : 'us'}`;
      const profileResult = await withRetry(
        `sdk.setMetadata(agent_${code},profile)`,
        () => sdk.setMetadata(assetPubkey, 'profile', profileValue),
        3,
        1000
      );
      const profileError = asTxError(profileResult, `setMetadata profile(agent_${code})`);
      if (profileError) throw profileError;
      artifact.counters.setMetadata += 1;

      if (collections.length > 0 && i % 4 !== 3) {
        const collectionRef = collections[i % collections.length];
        const lockCol = i % 2 === 0;
        const colResult = await withRetry(
          `sdk.setCollectionPointer(agent_${code})`,
          () => sdk.setCollectionPointer(assetPubkey, collectionRef.pointer, { lock: lockCol }),
          3,
          1000
        );
        const colError = asTxError(colResult, `setCollectionPointer(agent_${code})`);
        if (colError) throw colError;
        artifact.counters.setCollectionPointer += 1;
        expectedAgent.col = collectionRef.pointer;
        expectedAgent.colLocked = lockCol;
      }

      if (i % 2 === 1) {
        const metadataV2 = {
          ...metadataV1,
          description: `${metadataV1.description} Updated in same seed run.`,
          revision: 2,
        };
        const metadataUploadV2 = await uploadJson({
          ipfsClient,
          data: metadataV2,
          fallbackSeed: `${runId}:agent:${code}:metadata:v2`,
          artifact,
          kind: `agent_metadata_v2_${code}`,
        });
        const uriResult = await withRetry(
          `sdk.setAgentUri(agent_${code})`,
          () => sdk.setAgentUri(assetPubkey, metadataUploadV2.uri),
          3,
          1000
        );
        const uriError = asTxError(uriResult, `setAgentUri(agent_${code})`);
        if (uriError) throw uriError;
        artifact.counters.setAgentUri += 1;
        expectedAgent.uriMetadataExpected = true;
        expectedAgent.uriMetadata = {
          '_uri:name': metadataV2.name,
          '_uri:description': metadataV2.description,
          '_uri:image': metadataV2.image,
        };
      }

      createdAgents.push({
        code,
        asset,
        pubkey: assetPubkey,
        expected: expectedAgent,
      });
    }

    if (createdAgents.length > 1) {
      const root = createdAgents[0];
      for (let i = 1; i < createdAgents.length; i += 1) {
        if (i % 3 === 0) continue;
        const child = createdAgents[i];
        const parentLock = i % 2 === 0;
        const parentResult = await withRetry(
          `sdk.setParentAsset(child_${child.code})`,
          () => sdk.setParentAsset(child.pubkey, root.pubkey, { lock: parentLock }),
          3,
          1000
        );
        const parentError = asTxError(parentResult, `setParentAsset(child_${child.code})`);
        if (parentError) throw parentError;
        artifact.counters.setParentAsset += 1;
        child.expected.parentAsset = root.asset;
        child.expected.parentLocked = parentLock;
      }
    }

    const feedbackExpected = [];
    const feedbackProfiles = [
      { channel: 'chat', locale: 'en-US', persona: 'researcher', scenario: 'latency' },
      { channel: 'api', locale: 'fr-FR', persona: 'trader', scenario: 'pricing' },
      { channel: 'voice', locale: 'es-ES', persona: 'operator', scenario: 'uptime' },
      { channel: 'batch', locale: 'de-DE', persona: 'analyst', scenario: 'summarization' },
      { channel: 'tool-call', locale: 'ja-JP', persona: 'developer', scenario: 'codegen' },
    ];
    const responseStyles = ['concise', 'detailed', 'actionable', 'audit', 'fallback'];
    for (let i = 0; i < createdAgents.length; i += 1) {
      const agent = createdAgents[i];
      for (let j = 0; j < feedbackPerAgent; j += 1) {
        const feedbackCode = `${agent.code}-${String(j + 1).padStart(2, '0')}`;
        const runner = feedbackRunners[(i * feedbackPerAgent + j) % feedbackRunners.length];
        const feedbackSigner = runner.keypair;
        const feedbackSdk = runner.sdk;
        const profile = feedbackProfiles[(i + j) % feedbackProfiles.length];
        const feedbackDoc = {
          version: '1.0.0',
          type: 'feedback',
          run_id: runId,
          asset: agent.asset,
          slot: j,
          sentiment: j % 2 === 0 ? 'positive' : 'neutral',
          notes: `Feedback ${feedbackCode} for ${agent.asset}`,
          channel: profile.channel,
          locale: profile.locale,
          persona: profile.persona,
          scenario: profile.scenario,
          verdict: (i + j) % 4 === 0 ? 'excellent' : (i + j) % 4 === 1 ? 'good' : (i + j) % 4 === 2 ? 'mixed' : 'poor',
          metrics: {
            latency_ms: 170 + i * 3 + j,
            success_rate: 0.94 - j * 0.01,
            tokens_in: 120 + i * 15 + j * 7,
            tokens_out: 310 + i * 17 + j * 11,
          },
          tags: [
            `channel:${profile.channel}`,
            `scenario:${profile.scenario}`,
            `locale:${profile.locale}`,
          ],
        };
        if (artifact.payloadSamples.feedbacks.length < 24) {
          artifact.payloadSamples.feedbacks.push({
            code: feedbackCode,
            client: feedbackSigner.publicKey.toBase58(),
            channel: feedbackDoc.channel,
            locale: feedbackDoc.locale,
            persona: feedbackDoc.persona,
            scenario: feedbackDoc.scenario,
            verdict: feedbackDoc.verdict,
            metrics: feedbackDoc.metrics,
            tags: feedbackDoc.tags,
          });
        }
        const feedbackUpload = await uploadJson({
          ipfsClient,
          data: feedbackDoc,
          fallbackSeed: `${runId}:feedback:${feedbackCode}`,
          artifact,
          kind: `feedback_${feedbackCode}`,
        });

        const valueRaw = BigInt((i + 1) * 1000 + (j + 1) * 37);
        const value = j % 2 === 0 ? valueRaw : -valueRaw;
        const valueDecimals = 2;
        const score = Math.max(0, Math.min(100, 58 + ((i * 11 + j * 7) % 37)));
        const tag1 = i % 2 === 0 ? 'quality' : 'performance';
        const tag2 = j % 2 === 0 ? 'service' : 'pricing';
        const endpoint = `https://api.agent${i}.quantu.ai/v1`;

        const feedbackResult = await withRetry(
          `sdk.giveFeedback(${feedbackCode})`,
          () =>
            feedbackSdk.giveFeedback(agent.pubkey, {
              value,
              valueDecimals,
              score,
              tag1,
              tag2,
              endpoint,
              feedbackUri: feedbackUpload.uri,
            }),
          3,
          1100
        );
        const feedbackError = asTxError(feedbackResult, `giveFeedback(${feedbackCode})`);
        if (feedbackError) throw feedbackError;
        artifact.counters.giveFeedback += 1;

        const feedbackIndex = coerceFeedbackIndex(feedbackResult?.feedbackIndex);
        const sealHash = computeSealHash(
          createSealParams(value, valueDecimals, score, tag1, tag2, endpoint, feedbackUpload.uri, null)
        );

        let expectedResponses = 0;
        const responseBursts = j === 0 ? 1 : (i + j) % 3 === 0 ? 2 : 0;
        for (let r = 0; r < responseBursts; r += 1) {
          const style = responseStyles[(i + j + r) % responseStyles.length];
          const responseDoc = {
            version: '1.0.0',
            type: 'response',
            run_id: runId,
            feedback: `${agent.asset}:${feedbackIndex.toString()}`,
            index: r,
            message: `Response ${r + 1} for ${feedbackCode}`,
            style,
            resolution: (i + j + r) % 2 === 0 ? 'accepted' : 'under_review',
            patch_ref: `fix-${runId}-${agent.code}-${j + 1}-${r + 1}`,
          };
          if (artifact.payloadSamples.responses.length < 24) {
            artifact.payloadSamples.responses.push({
              code: `${feedbackCode}:${r}`,
              client: feedbackSigner.publicKey.toBase58(),
              style: responseDoc.style,
              resolution: responseDoc.resolution,
              patch_ref: responseDoc.patch_ref,
            });
          }
          const responseUpload = await uploadJson({
            ipfsClient,
            data: responseDoc,
            fallbackSeed: `${runId}:response:${feedbackCode}:${r}`,
            artifact,
            kind: `response_${feedbackCode}_${r}`,
          });
          const appendResult = await withRetry(
            `sdk.appendResponse(${feedbackCode}:${r})`,
            () =>
              feedbackSdk.appendResponse(
                agent.pubkey,
                feedbackSigner.publicKey,
                feedbackIndex,
                sealHash,
                responseUpload.uri
              ),
            3,
            1000
          );
          const appendError = asTxError(
            appendResult,
            `appendResponse(${feedbackCode}:${r})`
          );
          if (appendError) throw appendError;
          artifact.counters.appendResponse += 1;
          expectedResponses += 1;
        }

        let isRevoked = false;
        if (j === feedbackPerAgent - 1 && i % 2 === 1) {
          let revokePreflightVisible = true;
          try {
            await pollWithTimeout({
              label: `indexer visibility for revoke preflight (${feedbackCode})`,
              maxAttempts: revokePreflightPollAttempts,
              intervalMs: revokePreflightPollDelayMs,
              timeoutMs: revokePreflightPollTimeoutMs,
              check: async () =>
                feedbackSdk.readFeedback(
                  agent.pubkey,
                  feedbackSigner.publicKey,
                  feedbackIndex
                ),
            });
          } catch (error) {
            revokePreflightVisible = false;
            artifact.counters.revokeFeedbackLagFallback += 1;
            artifact.warnings.push(
              `Revoke preflight indexer visibility timed out for ${feedbackCode}; proceeding with lag fallback (${errorMessage(error)})`
            );
          }
          const revokeResult = await withRetry(
            `sdk.revokeFeedback(${feedbackCode})`,
            () =>
              feedbackSdk.revokeFeedback(
                agent.pubkey,
                feedbackIndex,
                sealHash,
                resolveRevokeWriteOptions({ indexerVisible: revokePreflightVisible })
              ),
            3,
            1100
          );
          const revokeError = asTxError(revokeResult, `revokeFeedback(${feedbackCode})`);
          if (revokeError) throw revokeError;
          artifact.counters.revokeFeedback += 1;
          isRevoked = true;
        }

        feedbackExpected.push({
          asset: agent.asset,
          client: feedbackSigner.publicKey.toBase58(),
          feedbackIndex: feedbackIndex.toString(),
          isRevoked,
          expectedResponses,
        });
      }
    }

    const nonceBase = (Math.floor(Date.now() / 1000) % 3_000_000_000) >>> 0;
    const pendingExpected = [];

    if (includeValidations) {
      const pendingTarget = Math.min(pendingValidationCount, createdAgents.length);
      for (let i = 0; i < pendingTarget; i += 1) {
        const agent = createdAgents[i];
        const validatorKeypair = Keypair.generate();
        generatedWallets.push(
          toWalletRecord(`validator_pending_${agent.code}`, validatorKeypair)
        );
        const nonce = (nonceBase + i + 1) >>> 0;
        const requestDoc = {
          version: '1.0.0',
          type: 'validation_request',
          run_id: runId,
          asset: agent.asset,
          validator: validatorKeypair.publicKey.toBase58(),
        };
        const requestUpload = await uploadJson({
          ipfsClient,
          data: requestDoc,
          fallbackSeed: `${runId}:validation:pending:${agent.code}`,
          artifact,
          kind: `validation_request_pending_${agent.code}`,
        });
        const requestResult = await withRetry(
          `sdk.requestValidation(pending:${agent.code})`,
          () =>
            sdk.requestValidation(
              agent.pubkey,
              validatorKeypair.publicKey,
              requestUpload.uri,
              { nonce }
            ),
          3,
          1000
        );
        const requestError = asTxError(
          requestResult,
          `requestValidation(pending:${agent.code})`
        );
        if (requestError) throw requestError;
        artifact.counters.requestValidation += 1;
        pendingExpected.push({
          asset: agent.asset,
          validator: validatorKeypair.publicKey.toBase58(),
          nonce: String(nonce),
        });
      }

      if (createdAgents.length > pendingTarget) {
        const agent = createdAgents[pendingTarget];
        const nonce = (nonceBase + 2000) >>> 0;
        const requestUpload = await uploadJson({
          ipfsClient,
          data: {
            version: '1.0.0',
            type: 'validation_request',
            run_id: runId,
            asset: agent.asset,
            validator: signer.publicKey.toBase58(),
            mode: 'responded',
          },
          fallbackSeed: `${runId}:validation:responded:${agent.code}`,
          artifact,
          kind: `validation_request_responded_${agent.code}`,
        });
        const requestResult = await withRetry(
          `sdk.requestValidation(responded:${agent.code})`,
          () =>
            sdk.requestValidation(agent.pubkey, signer.publicKey, requestUpload.uri, {
              nonce,
            }),
          3,
          1000
        );
        const requestError = asTxError(
          requestResult,
          `requestValidation(responded:${agent.code})`
        );
        if (requestError) throw requestError;
        artifact.counters.requestValidation += 1;

        const responseUpload = await uploadJson({
          ipfsClient,
          data: {
            version: '1.0.0',
            type: 'validation_response',
            run_id: runId,
            asset: agent.asset,
            validator: signer.publicKey.toBase58(),
            nonce,
            score: 91,
          },
          fallbackSeed: `${runId}:validation:response:${agent.code}`,
          artifact,
          kind: `validation_response_${agent.code}`,
        });
        const respondResult = await withRetry(
          `sdk.respondToValidation(${agent.code})`,
          () =>
            sdk.respondToValidation(agent.pubkey, nonce, 91, responseUpload.uri, {
              tag: 'verified',
            }),
          3,
          1000
        );
        const respondError = asTxError(respondResult, `respondToValidation(${agent.code})`);
        if (respondError) throw respondError;
        artifact.counters.respondValidation += 1;
      }
    }

    if (enableTransfer && createdAgents.length >= 2) {
      const lastAgent = createdAgents[createdAgents.length - 1];
      const recipientWallet = Keypair.generate();
      generatedWallets.push(toWalletRecord(`transfer_recipient_${lastAgent.code}`, recipientWallet));
      const transferResult = await withRetry(
        `sdk.transferAgent(${lastAgent.code})`,
        () => sdk.transferAgent(lastAgent.pubkey, recipientWallet.publicKey),
        3,
        1000
      );
      const transferError = asTxError(transferResult, `transferAgent(${lastAgent.code})`);
      if (transferError) throw transferError;
      artifact.counters.transferAgent += 1;
      lastAgent.expected.owner = recipientWallet.publicKey.toBase58();
    }

    artifact.expected.agents = createdAgents.map((row) => ({
      asset: row.expected.asset,
      owner: row.expected.owner,
      col: row.expected.col,
      colLocked: row.expected.colLocked,
      parentAsset: row.expected.parentAsset,
      parentLocked: row.expected.parentLocked,
    }));
    artifact.expected.feedbacks = feedbackExpected;
    artifact.expected.pendingValidations = pendingExpected;
    artifact.expected.agentUriMetadata = createdAgents
      .filter((row) => row.expected.uriMetadataExpected)
      .map((row) => ({
        asset: row.expected.asset,
        '_uri:name': row.expected.uriMetadata['_uri:name'],
        '_uri:description': row.expected.uriMetadata['_uri:description'],
        '_uri:image': row.expected.uriMetadata['_uri:image'],
      }));
    artifact.expected.collections = artifact.ipfs.enabled
      ? collections.map((row) => ({
          pointer: row.pointer,
          version: row.version,
          name: row.name,
          symbol: row.symbol,
          description: row.description,
          image: row.image,
          banner_image: row.banner_image,
          social_website: row.social_website,
          social_x: row.social_x,
          social_discord: row.social_discord,
        }))
      : [];

    let indexerSynced = null;
    if (indexerUrl && typeof sdk.waitForIndexerSync === 'function' && typeof sdk.getIndexerClient === 'function') {
      const indexerClient = sdk.getIndexerClient();
      if (indexerClient && typeof indexerClient.getAgent === 'function') {
        indexerSynced = await sdk.waitForIndexerSync(async () => {
          for (const row of createdAgents) {
            const found = await indexerClient.getAgent(row.asset);
            if (!found) return false;
          }
          return true;
        }, {
          timeout: Number.parseInt(process.env.E2E_INDEXERS_SEED_SYNC_TIMEOUT_MS || '120000', 10),
          initialDelay: 1500,
          maxDelay: 6000,
        });
      }
    }
    artifact.indexerSynced = indexerSynced;

    if (indexerSynced === false) {
      artifact.status = 'partial';
      artifact.errors.push('Seed writes succeeded, but indexer sync confirmation timed out');
    } else {
      artifact.status = 'passed';
    }
  } catch (error) {
    artifact.status = 'failed';
    artifact.errors.push(errorMessage(error));
  } finally {
    if (generatedWallets.length > 0) {
      writeJson(walletsPath, {
        runId,
        generatedAt: nowIso(),
        wallets: generatedWallets,
      });
    }
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    finalizeAndWrite(artifactPath, artifact);
  }

  if (artifact.status === 'failed') {
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}

export {
  resolveIpfsApiUrl,
  resolveIpfsClientConfig,
  resolvePinataJwt,
  resolveRevokeWriteOptions,
};
