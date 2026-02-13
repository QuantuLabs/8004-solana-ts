/**
 * Jest setup file for Agent0 SDK tests.
 * Configures logging and test environment.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

const E2E_MIN_BALANCE_SOL = Number.parseFloat(process.env.E2E_MIN_BALANCE_SOL ?? '0.08');
const E2E_AIRDROP_SOL = Number.parseFloat(process.env.E2E_AIRDROP_SOL ?? '0.2');

async function maybeTopUpDevnetWallet(): Promise<void> {
  const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyEnv) return;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  if (!rpcUrl.includes('devnet')) return;

  try {
    const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKeyEnv)));
    const connection = new Connection(rpcUrl, 'confirmed');
    const minimumLamports = Math.floor(E2E_MIN_BALANCE_SOL * LAMPORTS_PER_SOL);
    const airdropLamports = Math.floor(E2E_AIRDROP_SOL * LAMPORTS_PER_SOL);
    if (minimumLamports <= 0 || airdropLamports <= 0) return;

    const before = await connection.getBalance(signer.publicKey, 'confirmed');
    if (before >= minimumLamports) return;

    console.log(
      `[e2e setup] low balance detected (${(before / LAMPORTS_PER_SOL).toFixed(6)} SOL), requesting ${E2E_AIRDROP_SOL} SOL airdrop`
    );

    const sig = await connection.requestAirdrop(signer.publicKey, airdropLamports);
    await connection.confirmTransaction(sig, 'confirmed');

    const after = await connection.getBalance(signer.publicKey, 'confirmed');
    console.log(`[e2e setup] balance after airdrop: ${(after / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[e2e setup] devnet airdrop skipped: ${message}`);
  }
}

// Configure console logging for tests
// Note: In Jest, console methods work by default, but we can suppress noise if needed

// Set test timeout for integration tests (2 minutes for blockchain operations)
if (typeof jest !== 'undefined') {
  jest.setTimeout(120000);
}

// Global test setup (runs before all tests)
beforeAll(async () => {
  // Verify environment variables are set
  if (!process.env.AGENT_PRIVATE_KEY && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  AGENT_PRIVATE_KEY not set. Some tests may fail.');
  }
  if (!process.env.PINATA_JWT && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  PINATA_JWT not set. IPFS tests may fail.');
  }

  await maybeTopUpDevnetWallet();
});

// Global test teardown (runs after all tests)
afterAll(async () => {
  // Cleanup if needed
});

// Suppress console errors for known issues (optional)
// Uncomment if needed:
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args: any[]) => {
//     if (
//       typeof args[0] === 'string' &&
//       args[0].includes('known warning message')
//     ) {
//       return;
//     }
//     originalError(...args);
//   };
// });

// afterAll(() => {
//   console.error = originalError;
// });
