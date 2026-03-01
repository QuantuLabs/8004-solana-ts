#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const DEFAULT_RPC = "https://api.devnet.solana.com";
const STRESS_ROOT = path.resolve("artifacts/stress-sdk");
const REPORT_ROOT = path.resolve("artifacts/recovery");

const KEEP_DUST_LAMPORTS = Number(process.env.RECOVER_KEEP_DUST_LAMPORTS ?? 20_000);
const MAX_RETRIES = Number(process.env.RECOVER_MAX_RETRIES ?? 4);
const RETRY_BASE_MS = Number(process.env.RECOVER_RETRY_BASE_MS ?? 500);
const OWNER_MATCH_POLICY = (process.env.RECOVER_OWNER_MATCH_POLICY ?? "all").toLowerCase();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function resolveAnchorWalletPath() {
  return process.env.ANCHOR_WALLET || path.join(os.homedir(), ".config/solana/id.json");
}

function keypairFromAnchorWallet(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Anchor wallet not found at ${filePath}`);
  }
  const arr = readJson(filePath);
  if (!Array.isArray(arr) || arr.length < 32) {
    throw new Error(`Invalid anchor wallet format at ${filePath}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function loadStressWalletArtifacts(stressRoot) {
  if (!existsSync(stressRoot)) return [];
  const dirs = readdirSync(stressRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const out = [];
  for (const dir of dirs) {
    const walletsPath = path.join(stressRoot, dir, "wallets.json");
    if (!existsSync(walletsPath)) continue;
    try {
      const parsed = readJson(walletsPath);
      out.push({ runId: dir, walletsPath, parsed });
    } catch (err) {
      out.push({ runId: dir, walletsPath, parsed: null, error: String(err?.message ?? err) });
    }
  }
  return out;
}

function collectWorkers(artifacts, ownerPubkey) {
  const dedup = new Map();
  const skippedOwnerMismatchRuns = [];
  const parseErrors = [];

  for (const item of artifacts) {
    if (!item.parsed) {
      parseErrors.push({ runId: item.runId, walletsPath: item.walletsPath, error: item.error || "unknown parse error" });
      continue;
    }

    const runOwner = typeof item.parsed.ownerWallet === "string" ? item.parsed.ownerWallet : null;
    if (OWNER_MATCH_POLICY === "strict" && runOwner && runOwner !== ownerPubkey) {
      skippedOwnerMismatchRuns.push({ runId: item.runId, runOwner });
      continue;
    }

    const workers = Array.isArray(item.parsed.workers) ? item.parsed.workers : [];
    for (const worker of workers) {
      if (!worker || typeof worker.publicKey !== "string" || typeof worker.privateKeyBase58 !== "string") continue;
      if (worker.publicKey === ownerPubkey) continue;
      if (dedup.has(worker.publicKey)) continue;
      dedup.set(worker.publicKey, {
        publicKey: worker.publicKey,
        privateKeyBase58: worker.privateKeyBase58,
        sourceRunId: item.runId,
        sourceWalletsPath: item.walletsPath,
        runOwner,
      });
    }
  }

  return {
    workers: Array.from(dedup.values()),
    skippedOwnerMismatchRuns,
    parseErrors,
  };
}

function toSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

async function transferWithRetry(connection, fromKeypair, toPubkey, lamports, maxRetries, retryBaseMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey,
          lamports,
        })
      );
      tx.feePayer = fromKeypair.publicKey;
      const sig = await sendAndConfirmTransaction(connection, tx, [fromKeypair], {
        commitment: "confirmed",
        maxRetries: 2,
      });
      return { ok: true, signature: sig, attempt };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(retryBaseMs * Math.pow(2, attempt - 1));
      }
    }
  }
  return { ok: false, error: String(lastError?.message ?? lastError) };
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || DEFAULT_RPC;
  const anchorWalletPath = resolveAnchorWalletPath();
  const owner = keypairFromAnchorWallet(anchorWalletPath);
  const ownerPubkey = owner.publicKey.toBase58();

  const runId = `recover-stress-sol-${nowId()}`;
  const runDir = path.join(REPORT_ROOT, runId);
  mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, "sweep-log.jsonl");
  const reportPath = path.join(runDir, "report.json");

  const appendLog = (obj) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
    writeFileSync(logPath, `${line}\n`, { flag: "a" });
  };

  appendLog({
    event: "start",
    rpcUrl,
    ownerPubkey,
    anchorWalletPath,
    stressRoot: STRESS_ROOT,
    keepDustLamports: KEEP_DUST_LAMPORTS,
    maxRetries: MAX_RETRIES,
    retryBaseMs: RETRY_BASE_MS,
    ownerMatchPolicy: OWNER_MATCH_POLICY,
  });

  const artifacts = loadStressWalletArtifacts(STRESS_ROOT);
  const { workers, skippedOwnerMismatchRuns, parseErrors } = collectWorkers(artifacts, ownerPubkey);
  const connection = new Connection(rpcUrl, "confirmed");

  const initialOwnerBalance = await connection.getBalance(owner.publicKey, "confirmed");
  appendLog({
    event: "discovered",
    artifactsFound: artifacts.length,
    workersDiscovered: workers.length,
    skippedOwnerMismatchRuns: skippedOwnerMismatchRuns.length,
    parseErrors: parseErrors.length,
    initialOwnerBalanceLamports: initialOwnerBalance,
  });

  let scannedWallets = 0;
  let walletsSwept = 0;
  let skippedZero = 0;
  let skippedInsufficient = 0;
  let failed = 0;
  let recoveredLamports = 0;
  const failures = [];

  for (const worker of workers) {
    scannedWallets += 1;
    let kp;
    try {
      kp = Keypair.fromSecretKey(bs58.decode(worker.privateKeyBase58));
    } catch (err) {
      failed += 1;
      const msg = `key decode failed: ${String(err?.message ?? err)}`;
      failures.push({ wallet: worker.publicKey, reason: msg });
      appendLog({ event: "wallet-failed", wallet: worker.publicKey, reason: msg, sourceRunId: worker.sourceRunId });
      continue;
    }

    if (kp.publicKey.toBase58() !== worker.publicKey) {
      failed += 1;
      const msg = "public key mismatch between artifact and secret key";
      failures.push({ wallet: worker.publicKey, reason: msg });
      appendLog({ event: "wallet-failed", wallet: worker.publicKey, reason: msg, sourceRunId: worker.sourceRunId });
      continue;
    }

    const balance = await connection.getBalance(kp.publicKey, "confirmed");
    if (balance <= 0) {
      skippedZero += 1;
      appendLog({ event: "wallet-skip-zero", wallet: worker.publicKey, balanceLamports: balance, sourceRunId: worker.sourceRunId });
      continue;
    }

    const sweepLamports = balance - KEEP_DUST_LAMPORTS;
    if (sweepLamports <= 0) {
      skippedInsufficient += 1;
      appendLog({
        event: "wallet-skip-dust",
        wallet: worker.publicKey,
        balanceLamports: balance,
        keepDustLamports: KEEP_DUST_LAMPORTS,
        sourceRunId: worker.sourceRunId,
      });
      continue;
    }

    const sent = await transferWithRetry(connection, kp, owner.publicKey, sweepLamports, MAX_RETRIES, RETRY_BASE_MS);
    if (!sent.ok) {
      failed += 1;
      failures.push({ wallet: worker.publicKey, reason: sent.error || "send failed" });
      appendLog({
        event: "wallet-send-failed",
        wallet: worker.publicKey,
        balanceLamports: balance,
        sweepLamports,
        error: sent.error || "send failed",
        sourceRunId: worker.sourceRunId,
      });
      continue;
    }

    walletsSwept += 1;
    recoveredLamports += sweepLamports;
    appendLog({
      event: "wallet-swept",
      wallet: worker.publicKey,
      sourceRunId: worker.sourceRunId,
      balanceLamports: balance,
      sweepLamports,
      keptLamports: KEEP_DUST_LAMPORTS,
      signature: sent.signature,
      attempt: sent.attempt,
    });
  }

  const finalOwnerBalance = await connection.getBalance(owner.publicKey, "confirmed");

  const report = {
    runId,
    rpcUrl,
    timestamp: new Date().toISOString(),
    anchorWalletPath,
    destinationOwner: ownerPubkey,
    ownerMatchPolicy: OWNER_MATCH_POLICY,
    keepDustLamports: KEEP_DUST_LAMPORTS,
    retries: { maxRetries: MAX_RETRIES, retryBaseMs: RETRY_BASE_MS },
    source: {
      stressRoot: STRESS_ROOT,
      artifactsFound: artifacts.length,
      workersDiscovered: workers.length,
      skippedOwnerMismatchRuns,
      parseErrors,
    },
    summary: {
      scannedWallets,
      walletsSwept,
      skippedZero,
      skippedInsufficient,
      failed,
      recoveredLamports,
      recoveredSol: toSol(recoveredLamports),
      initialOwnerBalanceLamports: initialOwnerBalance,
      initialOwnerBalanceSol: toSol(initialOwnerBalance),
      finalOwnerBalanceLamports: finalOwnerBalance,
      finalOwnerBalanceSol: toSol(finalOwnerBalance),
    },
    failures,
    paths: {
      logPath,
      reportPath,
    },
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  appendLog({ event: "done", summary: report.summary, reportPath });

  console.log(`destination_owner=${ownerPubkey}`);
  console.log(`total_sol_recovered=${report.summary.recoveredSol}`);
  console.log(`wallets_swept=${report.summary.walletsSwept}`);
  console.log(`final_owner_balance_sol=${report.summary.finalOwnerBalanceSol}`);
  console.log(`log_path=${logPath}`);
  console.log(`report_path=${reportPath}`);
}

main().catch((err) => {
  console.error(`[recover-stress-wallet-sol] ${err?.message ?? err}`);
  process.exit(1);
});
