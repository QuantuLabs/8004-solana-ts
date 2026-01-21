/**
 * Devnet Test Setup
 * Loads pre-funded wallets for E2E tests on devnet
 * Run: npx tsx scripts/test-wallet-manager.ts create
 * Then: npm run test:e2e:devnet
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WALLETS_FILE = path.join(__dirname, '../../.test-wallets.json');

interface TestWallets {
  created: string;
  mainWallet: string;
  wallets: {
    name: string;
    publicKey: string;
    secretKey: number[];
  }[];
}

export interface DevnetTestWallets {
  main: Keypair;
  client1: Keypair;
  client2: Keypair;
  validator: Keypair;
  attacker: Keypair;
}

let cachedWallets: DevnetTestWallets | null = null;

/**
 * Load pre-funded test wallets
 */
export function loadTestWallets(): DevnetTestWallets {
  if (cachedWallets) return cachedWallets;

  // Load main wallet from env or file
  const mainKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  let main: Keypair;

  if (mainKeyEnv) {
    main = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(mainKeyEnv)));
  } else {
    const keyPath = `${process.env.HOME}/.config/solana/id.json`;
    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
    main = Keypair.fromSecretKey(Uint8Array.from(keyData));
  }

  // Load test wallets from file
  if (!fs.existsSync(WALLETS_FILE)) {
    throw new Error(
      'Test wallets not found. Run: npx tsx scripts/test-wallet-manager.ts create'
    );
  }

  const walletsData: TestWallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));

  const getWallet = (name: string): Keypair => {
    const w = walletsData.wallets.find(w => w.name === name);
    if (!w) throw new Error(`Wallet ${name} not found in test wallets`);
    return Keypair.fromSecretKey(Uint8Array.from(w.secretKey));
  };

  cachedWallets = {
    main,
    client1: getWallet('client1'),
    client2: getWallet('client2'),
    validator: getWallet('validator'),
    attacker: getWallet('attacker'),
  };

  return cachedWallets;
}

/**
 * Fund a new keypair from test wallet (for tests that need fresh wallets)
 */
export async function fundNewKeypair(
  connection: Connection,
  fromWallet: Keypair,
  amount: number = 0.05 * LAMPORTS_PER_SOL
): Promise<Keypair> {
  const newKeypair = Keypair.generate();

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: newKeypair.publicKey,
      lamports: amount,
    })
  );

  const sig = await connection.sendTransaction(tx, [fromWallet]);
  await connection.confirmTransaction(sig);

  return newKeypair;
}

/**
 * Return funds to main wallet
 */
export async function returnFunds(
  connection: Connection,
  fromWallet: Keypair,
  toWallet: Keypair
): Promise<void> {
  const balance = await connection.getBalance(fromWallet.publicKey);

  if (balance > 5000) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: toWallet.publicKey,
        lamports: balance - 5000,
      })
    );

    try {
      const sig = await connection.sendTransaction(tx, [fromWallet]);
      await connection.confirmTransaction(sig);
    } catch {
      // Ignore errors during cleanup
    }
  }
}
