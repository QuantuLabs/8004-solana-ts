#!/usr/bin/env node

import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../dist/index.js';
import {
  boolFromEnv,
  errorMessage,
  getArg,
  getArgOr,
  getFlag,
  makeRunId,
  nowIso,
  parseArgs,
  resolveFromCwd,
  writeJson,
} from './e2e-indexers-lib.mjs';

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
  throw new Error('Unsupported SOLANA_PRIVATE_KEY format; expected JSON array or comma-separated bytes');
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

  const startedAtMs = Date.now();
  const startedAt = nowIso();

  const disableWrites =
    getFlag(args, 'skip-write') ||
    boolFromEnv('E2E_INDEXERS_DISABLE_WRITES', false) ||
    boolFromEnv('E2E_INDEXERS_SKIP_SEED_WRITE', false);

  const rpcUrl = getArgOr(args, 'rpc-url', process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const indexerUrl =
    getArg(args, 'indexer-url') ||
    process.env.CLASSIC_INDEXER_URL ||
    process.env.INDEXER_URL ||
    null;
  const indexerApiKey =
    getArg(args, 'indexer-api-key') ||
    process.env.CLASSIC_INDEXER_API_KEY ||
    process.env.INDEXER_API_KEY ||
    undefined;

  const artifact = {
    runId,
    status: 'skipped',
    startedAt,
    endedAt: nowIso(),
    durationMs: 0,
    rpcUrl,
    indexerUrl,
    wallet: null,
    seedAsset: null,
    registerSignature: null,
    metadataSignature: null,
    metadataKey: null,
    metadataValue: null,
    indexerSynced: null,
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

  const privateKeyRaw = process.env.E2E_INDEXERS_SOLANA_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyRaw) {
    artifact.status = 'skipped';
    artifact.errors.push('Missing SOLANA_PRIVATE_KEY (or E2E_INDEXERS_SOLANA_PRIVATE_KEY); seed/write not executed');
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    finalizeAndWrite(artifactPath, artifact);
    return;
  }

  try {
    const signer = Keypair.fromSecretKey(parseSecretKey(privateKeyRaw));
    artifact.wallet = signer.publicKey.toBase58();

    const sdkConfig = {
      rpcUrl,
      signer,
    };
    if (indexerUrl) sdkConfig.indexerUrl = indexerUrl;
    if (indexerApiKey) sdkConfig.indexerApiKey = indexerApiKey;
    const sdk = new SolanaSDK(sdkConfig);

    const registerResult = await sdk.registerAgent(`ipfs://e2e-indexers/${runId}/${Date.now()}`);
    const asset = registerResult?.asset ? registerResult.asset.toBase58() : null;
    if (!asset) {
      throw new Error('registerAgent succeeded without asset address');
    }
    artifact.seedAsset = asset;
    artifact.registerSignature = registerResult?.signature || null;

    // Program constraint: metadata key must be <= 32 bytes.
    const metadataKey = 'e2e_idx_run';
    const metadataValue = `seeded:${Date.now()}`;
    const metadataResult = await sdk.setMetadata(new PublicKey(asset), metadataKey, metadataValue);
    artifact.metadataKey = metadataKey;
    artifact.metadataValue = metadataValue;
    artifact.metadataSignature = metadataResult?.signature || null;

    let indexerSynced = null;
    if (indexerUrl && typeof sdk.waitForIndexerSync === 'function' && typeof sdk.getIndexerClient === 'function') {
      const indexerClient = sdk.getIndexerClient();
      if (indexerClient && typeof indexerClient.getAgent === 'function') {
        indexerSynced = await sdk.waitForIndexerSync(async () => {
          const found = await indexerClient.getAgent(asset);
          return Boolean(found);
        }, {
          timeout: Number.parseInt(process.env.E2E_INDEXERS_SEED_SYNC_TIMEOUT_MS || '45000', 10),
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
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    finalizeAndWrite(artifactPath, artifact);
  }

  if (artifact.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
