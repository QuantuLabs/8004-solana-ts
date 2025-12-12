/**
 * Basic Indexer Example
 *
 * Demonstrates how to:
 * 1. Fetch all agents with on-chain metadata using getAllAgents()
 * 2. Fetch IPFS metadata in parallel batches
 * 3. Fetch ALL feedbacks with tags using readAllFeedback()
 * 4. Export complete data to JSON file
 *
 * Requirements:
 * - CUSTOM RPC with getProgramAccounts support (Helius free tier works)
 * - Set SOLANA_RPC_URL environment variable
 *
 * Output: agents.json
 */
import { writeFileSync } from 'fs';
import { SolanaSDK, SolanaFeedback } from '../src/index.js';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const BATCH_SIZE = 10;

interface IndexedFeedback {
  client: string;
  score: number;
  tag1: string;
  tag2: string;
  fileUri: string;
  createdAt: string;
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

  // 1. Fetch all agents with on-chain metadata (2 parallel RPC calls)
  console.log('Fetching all agents...');
  const agentsWithMeta = await sdk.getAllAgents();
  console.log(`Found ${agentsWithMeta.length} agents\n`);

  // 2. Parallel batch: Fetch IPFS metadata
  console.log('Fetching IPFS metadata...');
  const ipfsResults = await processBatches(
    agentsWithMeta,
    ({ account }) => fetchMetadata(account.agent_uri),
    BATCH_SIZE,
    'IPFS'
  );

  // 3. Parallel batch: Fetch ALL feedbacks with tags (replaces getSummary)
  console.log('\nFetching feedbacks with tags...');
  const feedbackResults = await processBatches(
    agentsWithMeta,
    ({ account }) =>
      sdk.readAllFeedback(Number(account.agent_id), false).catch(() => [] as SolanaFeedback[]),
    BATCH_SIZE,
    'Feedbacks'
  );

  // 4. Combine results
  console.log('\nBuilding index...');
  const indexed: IndexedAgent[] = agentsWithMeta.map(({ account, metadata }, i) => {
    const feedbacks = feedbackResults[i] || [];
    const avgScore =
      feedbacks.length > 0
        ? feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length
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
      feedbackCount: feedbacks.length,
      feedbacks: feedbacks.map((f) => ({
        client: f.client.toBase58(),
        score: f.score,
        tag1: f.tag1,
        tag2: f.tag2,
        fileUri: f.fileUri,
        createdAt: new Date(Number(f.createdAt) * 1000).toISOString(),
      })),
      onChainMetadata: metadata,
    };
  });

  // 5. Write to file
  writeFileSync(outputFile, JSON.stringify(indexed, null, 2));

  // Stats
  const totalFeedbacks = indexed.reduce((sum, a) => sum + a.feedbackCount, 0);
  console.log(`\n=== Done ===`);
  console.log(`Agents indexed: ${indexed.length}`);
  console.log(`Total feedbacks: ${totalFeedbacks}`);
  console.log(`Output: ${outputFile}`);
}

main().catch(console.error);
