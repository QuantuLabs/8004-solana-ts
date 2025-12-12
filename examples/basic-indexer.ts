/**
 * Basic Indexer Example
 *
 * Demonstrates how to:
 * 1. Get total agent count from registry config
 * 2. Load each agent using SDK methods
 * 3. Fetch metadata from IPFS
 * 4. Get reputation summaries
 * 5. Export results to JSON file progressively
 *
 * Note: Uses loadAgent(id) loop instead of getProgramAccounts
 * This works with default devnet RPC (no custom RPC required)
 *
 * Output: agents.json
 */
import { writeFileSync, appendFileSync } from 'fs';
import { SolanaSDK, fetchRegistryConfig } from '../src/index.js';

// IPFS gateway for fetching metadata
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

interface IndexedAgent {
  agentId: number;
  name: string;
  description: string;
  owner: string;
  uri: string;
  endpoints: Array<{ name: string; endpoint: string }>;
  skills: string[];
  domains: string[];
  score: number;
  feedbackCount: number;
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
  const sdk = new SolanaSDK();
  const connection = sdk.getSolanaClient().getConnection();

  // Get registry config to know total agents
  const config = await fetchRegistryConfig(connection);
  if (!config) {
    console.log('Registry not initialized');
    return;
  }

  const totalAgents = Number(config.next_agent_id) - 1;
  const outputFile = 'agents.json';

  console.log(`Indexing ${totalAgents} agents...\n`);

  // Initialize file with opening bracket
  writeFileSync(outputFile, '[\n');

  let count = 0;

  // Load each agent using SDK
  for (let id = 1; id <= totalAgents; id++) {
    const agent = await sdk.loadAgent(id);
    if (!agent) continue;

    // Fetch off-chain metadata
    const metadata = await fetchMetadata(agent.agent_uri);

    // Get reputation summary
    const summary = await sdk.getSummary(id);

    const indexed: IndexedAgent = {
      agentId: id,
      name: (metadata?.name as string) || agent.nft_name,
      description: (metadata?.description as string) || '',
      owner: agent.getOwnerPublicKey().toBase58(),
      uri: agent.agent_uri,
      endpoints: (metadata?.endpoints as Array<{ name: string; endpoint: string }>) || [],
      skills: (metadata?.skills as string[]) || [],
      domains: (metadata?.domains as string[]) || [],
      score: summary.averageScore,
      feedbackCount: summary.totalFeedbacks,
    };

    // Append to file progressively (add comma if not first)
    const prefix = count > 0 ? ',\n' : '';
    appendFileSync(outputFile, prefix + JSON.stringify(indexed, null, 2));
    count++;

    console.log(`  [${id}/${totalAgents}] ${indexed.name}`);
  }

  // Close JSON array
  appendFileSync(outputFile, '\n]');

  console.log(`\n✅ Indexed ${count} agents`);
  console.log(`📁 Output: ${outputFile}`);
}

main().catch(console.error);
