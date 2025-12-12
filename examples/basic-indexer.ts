/**
 * Basic Indexer Example
 *
 * Demonstrates how to:
 * 1. Fetch all agents with feedbacks using getAllAgents({ includeFeedbacks: true })
 * 2. Fetch IPFS metadata in parallel batches
 * 3. Export complete data to JSON file
 *
 * Requirements:
 * - CUSTOM RPC with getProgramAccounts support (Helius free tier works)
 * - Set SOLANA_RPC_URL environment variable
 *
 * Output: agents.json
 */
import { writeFileSync } from 'fs';
import { SolanaSDK } from '../src/index.js';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const IPFS_BATCH_SIZE = 10;

interface IndexedFeedback {
  client: string;
  score: number;
  tag1: string;
  tag2: string;
  fileUri: string;
  createdAt: string | null;
}

interface IndexedAgent {
  agentId: number;
  name: string;
  description: string;
  owner: string;
  uri: string;
  endpoints: Array<{ name: string; endpoint: string }>;
  skills: string[];
  domains: string[];
  averageScore: number;
  feedbackCount: number;
  feedbacks: IndexedFeedback[];
  onChainMetadata: Array<{ key: string; value: string }>;
}

/**
 * Process items in parallel batches
 */
async function processBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number,
  label: string
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    console.log(`  ${label}: ${Math.min(i + batchSize, items.length)}/${items.length}`);
  }
  return results;
}

async function fetchMetadata(uri: string): Promise<Record<string, unknown> | null> {
  if (!uri) return null;
  const url = uri.startsWith('ipfs://')
    ? `${IPFS_GATEWAY}${uri.replace('ipfs://', '')}`
    : uri;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  CUSTOM RPC REQUIRED - Helius Free Tier Recommended            ║');
    console.log('║                                                                ║');
    console.log('║  This indexer requires getProgramAccounts support.             ║');
    console.log('║  Public devnet RPC does NOT support this operation.            ║');
    console.log('║                                                                ║');
    console.log('║  Get a free Helius API key at: https://helius.dev              ║');
    console.log('║                                                                ║');
    console.log('║  Then set:                                                     ║');
    console.log('║  export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    return;
  }

  const sdk = new SolanaSDK({ rpcUrl });
  const outputFile = 'agents.json';

  console.log('=== Agent Indexer ===\n');

  // 1. Fetch all agents with feedbacks (4 RPC calls total)
  console.log('Fetching all agents with feedbacks...');
  const agentsWithMeta = await sdk.getAllAgents({ includeFeedbacks: true });
  console.log(`Found ${agentsWithMeta.length} agents\n`);

  // 2. Parallel batch: Fetch IPFS metadata
  console.log('Fetching IPFS metadata...');
  const ipfsResults = await processBatches(
    agentsWithMeta,
    ({ account }) => fetchMetadata(account.agent_uri),
    IPFS_BATCH_SIZE,
    'IPFS'
  );

  // 3. Combine results - feedbacks already included!
  console.log('\nBuilding index...');
  const indexed: IndexedAgent[] = agentsWithMeta.map(({ account, metadata, feedbacks }, i) => {
    const fbs = feedbacks || [];
    const avgScore = fbs.length > 0
      ? fbs.reduce((sum, f) => sum + f.score, 0) / fbs.length
      : 0;

    return {
      agentId: Number(account.agent_id),
      name: (ipfsResults[i]?.name as string) || account.nft_name,
      description: (ipfsResults[i]?.description as string) || '',
      owner: account.getOwnerPublicKey().toBase58(),
      uri: account.agent_uri,
      endpoints:
        (ipfsResults[i]?.endpoints as Array<{ name: string; endpoint: string }>) || [],
      skills: (ipfsResults[i]?.skills as string[]) || [],
      domains: (ipfsResults[i]?.domains as string[]) || [],
      averageScore: Math.round(avgScore),
      feedbackCount: fbs.length,
      feedbacks: fbs.map((f) => {
        const ts = Number(f.createdAt) * 1000;
        const date = new Date(ts);
        return {
          client: f.client.toBase58(),
          score: f.score,
          tag1: f.tag1,
          tag2: f.tag2,
          fileUri: f.fileUri,
          createdAt: isNaN(date.getTime()) ? null : date.toISOString(),
        };
      }),
      onChainMetadata: metadata,
    };
  });

  // 4. Write to file
  writeFileSync(outputFile, JSON.stringify(indexed, null, 2));

  // Stats
  const totalFeedbacks = indexed.reduce((sum, a) => sum + a.feedbackCount, 0);
  console.log(`\n=== Done ===`);
  console.log(`Agents indexed: ${indexed.length}`);
  console.log(`Total feedbacks: ${totalFeedbacks}`);
  console.log(`Output: ${outputFile}`);
}

main().catch(console.error);
