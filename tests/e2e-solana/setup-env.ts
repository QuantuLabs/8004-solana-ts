import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

type EnvMap = Record<string, string>;

function parseEnv(content: string): EnvMap {
  const out: EnvMap = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadX402BackendEnv(): EnvMap {
  const explicit = process.env.X402AGRO_BACKEND_ENV;
  const allowProduction = process.env.E2E_ALLOW_PRODUCTION_ENVS === 'true';
  const candidates = [
    explicit,
    resolve(process.cwd(), '../x402Agro/backend/.env.local'),
    resolve(process.cwd(), '../x402Agro/backend/.env'),
    resolve(process.cwd(), '../x402Agro/backend/.env.development'),
    ...(allowProduction
      ? [
          resolve(process.cwd(), '../x402Agro/backend/.env.production'),
          resolve(process.cwd(), '../x402Agro/backend/.env.prod'),
          resolve(process.cwd(), '../x402Agro/backend/.env.vercel2'),
          resolve(process.cwd(), '../x402Agro/backend/.env.vercel'),
        ]
      : []),
  ].filter((v): v is string => Boolean(v));

  const merged: EnvMap = {};
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const parsed = parseEnv(readFileSync(filePath, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in merged) && v !== '') merged[k] = v;
      }
    } catch {
      // Ignore unreadable files and continue with other candidates.
    }
  }

  return merged;
}

function setIfMissing(key: string, value: string | undefined): void {
  if (!value || value.trim() === '') return;
  if (!process.env[key]) process.env[key] = value;
}

function loadAnchorPrivateKey(anchorWalletPath: string): string | undefined {
  if (!existsSync(anchorWalletPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(anchorWalletPath, 'utf8'));
    return Array.isArray(parsed) ? JSON.stringify(parsed) : undefined;
  } catch {
    return undefined;
  }
}

const x402 = loadX402BackendEnv();

setIfMissing('SOLANA_RPC_URL', x402.SOLANA_RPC_URL);
setIfMissing('SEPOLIA_RPC_URL', x402.SEPOLIA_RPC_URL ?? x402.ETH_SEPOLIA_RPC_URL);
setIfMissing('ETH_SEPOLIA_RPC_URL', x402.ETH_SEPOLIA_RPC_URL ?? x402.SEPOLIA_RPC_URL);
setIfMissing('BASE_SEPOLIA_RPC_URL', x402.BASE_SEPOLIA_RPC_URL);
setIfMissing('EVM_PRIVATE_KEY_SEPOLIA', x402.RELAYER_PRIVATE_KEY_SEPOLIA);
setIfMissing('EVM_PRIVATE_KEY_BASE', x402.RELAYER_PRIVATE_KEY_BASE_SEPOLIA);
setIfMissing(
  'EVM_PRIVATE_KEY',
  process.env.EVM_PRIVATE_KEY_BASE ??
    process.env.EVM_PRIVATE_KEY_SEPOLIA ??
    x402.RELAYER_PRIVATE_KEY_BASE_SEPOLIA ??
    x402.RELAYER_PRIVATE_KEY_SEPOLIA
);

const defaultAnchorWallet = resolve(homedir(), '.config/solana/id.json');
const anchorWallet =
  process.env.ANCHOR_WALLET ??
  process.env.ANCHOR_KEYPAIR_PATH ??
  (existsSync(defaultAnchorWallet) ? defaultAnchorWallet : undefined);

setIfMissing('ANCHOR_WALLET', anchorWallet);
setIfMissing('ANCHOR_KEYPAIR_PATH', anchorWallet);
setIfMissing('SOLANA_KEYPAIR_PATH', anchorWallet);

if (!process.env.SOLANA_PRIVATE_KEY && anchorWallet) {
  setIfMissing('SOLANA_PRIVATE_KEY', loadAnchorPrivateKey(anchorWallet));
}

// Some legacy tests still expect AGENT_PRIVATE_KEY naming.
setIfMissing('AGENT_PRIVATE_KEY', process.env.SOLANA_PRIVATE_KEY);
setIfMissing('SOLANA_RPC_URL', 'https://api.devnet.solana.com');

if (!process.env.__E2E_WALLET_SETUP_LOGGED__) {
  process.env.__E2E_WALLET_SETUP_LOGGED__ = '1';
  const hasAnchor = Boolean(anchorWallet && existsSync(anchorWallet));
  const hasSol = Boolean(process.env.SOLANA_PRIVATE_KEY);
  const hasEvm = Boolean(process.env.EVM_PRIVATE_KEY);
  console.log(
    `[e2e setup] wallets: solana=${hasSol ? 'yes' : 'no'}, anchor=${hasAnchor ? 'yes' : 'no'}, evm=${hasEvm ? 'yes' : 'no'}`
  );
}
