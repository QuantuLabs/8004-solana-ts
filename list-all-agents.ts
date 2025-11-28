/**
 * Script to list all agents and their feedbacks using the SDK
 * Run with: npx tsx list-all-agents.ts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  PDAHelpers,
  IDENTITY_PROGRAM_ID,
  REPUTATION_PROGRAM_ID,
  RegistryConfig,
  AgentAccount,
  FeedbackAccount,
  AgentReputationAccount,
  ACCOUNT_DISCRIMINATORS,
  matchesDiscriminator,
} from './src/index.js';

const DEVNET_RPC = 'https://api.devnet.solana.com';

// Helper to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface AgentInfo {
  agentId: bigint;
  mint: PublicKey;
  owner: PublicKey;
  uri: string;
  name: string;
  symbol: string;
  metadata: Array<{ key: string; value: string }>;
  createdAt: Date;
  reputation?: {
    totalFeedbacks: bigint;
    totalScoreSum: bigint;
    averageScore: number;
  };
  feedbacks: Array<{
    feedbackIndex: bigint;
    client: PublicKey;
    score: number;
    tag1: string;
    tag2: string;
    fileUri: string;
    isRevoked: boolean;
    createdAt: Date;
  }>;
}

async function main() {
  console.log('='.repeat(80));
  console.log('ERC-8004 Solana - All Agents & Feedbacks');
  console.log('='.repeat(80));
  console.log(`\nConnection: ${DEVNET_RPC}`);
  console.log(`Identity Program: ${IDENTITY_PROGRAM_ID.toBase58()}`);
  console.log(`Reputation Program: ${REPUTATION_PROGRAM_ID.toBase58()}\n`);

  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // 1. Read Registry Config
  console.log('Reading Registry Config...');
  const [configPda] = await PDAHelpers.getRegistryConfigPDA();
  const configInfo = await connection.getAccountInfo(configPda);

  if (!configInfo) {
    console.error('Registry not initialized!');
    return;
  }

  const config = RegistryConfig.deserialize(configInfo.data);
  console.log(`  Authority: ${config.getAuthorityPublicKey().toBase58()}`);
  console.log(`  Collection Mint: ${config.getCollectionMintPublicKey().toBase58()}`);
  console.log(`  Total Agents: ${config.total_agents}`);
  console.log(`  Next Agent ID: ${config.next_agent_id}\n`);

  // 2. Fetch all accounts from both programs in single batch requests
  console.log('Fetching all Identity accounts...');
  const allIdentityAccounts = await connection.getProgramAccounts(IDENTITY_PROGRAM_ID);
  console.log(`  Found ${allIdentityAccounts.length} accounts`);

  await delay(500); // Avoid rate limiting

  console.log('Fetching all Reputation accounts...');
  const allReputationAccounts = await connection.getProgramAccounts(REPUTATION_PROGRAM_ID);
  console.log(`  Found ${allReputationAccounts.length} accounts\n`);

  // Pre-parse all reputation and feedback accounts using discriminators
  const reputationByAgentId = new Map<string, AgentReputationAccount>();
  const feedbacksByAgentId = new Map<string, FeedbackAccount[]>();

  for (const { account } of allReputationAccounts) {
    const data = Buffer.from(account.data);

    // Check discriminator to identify account type
    if (matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.AgentReputationMetadata)) {
      try {
        const rep = AgentReputationAccount.deserialize(account.data);
        const agentIdStr = rep.agent_id.toString();
        reputationByAgentId.set(agentIdStr, rep);
      } catch (e) {
        // Parsing failed
      }
    } else if (matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.FeedbackAccount)) {
      try {
        const feedback = FeedbackAccount.deserialize(account.data);
        const agentIdStr = feedback.agent_id.toString();
        if (!feedbacksByAgentId.has(agentIdStr)) {
          feedbacksByAgentId.set(agentIdStr, []);
        }
        feedbacksByAgentId.get(agentIdStr)!.push(feedback);
      } catch (e) {
        // Parsing failed
      }
    }
    // Skip ClientIndexAccount, ResponseIndexAccount, ResponseAccount - not needed for listing
  }

  const agents: AgentInfo[] = [];

  // Parse each Identity account using discriminators
  for (const { pubkey, account } of allIdentityAccounts) {
    const data = Buffer.from(account.data);

    // Skip if not an AgentAccount (using discriminator)
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.AgentAccount)) continue;

    // Skip if it's the config account (shouldn't happen with discriminator check, but safety)
    if (pubkey.equals(configPda)) continue;

    try {
      const agent = AgentAccount.deserialize(account.data);
      const agentIdStr = agent.agent_id.toString();

      // Convert metadata
      const metadata = agent.metadata.map(m => ({
        key: m.metadata_key,
        value: m.getValueString(),
      }));

      // Get agent reputation from pre-fetched data
      let reputation: AgentInfo['reputation'] | undefined;
      const rep = reputationByAgentId.get(agentIdStr);
      if (rep) {
        reputation = {
          totalFeedbacks: rep.total_feedbacks,
          totalScoreSum: rep.total_score_sum,
          averageScore: rep.average_score,
        };
      }

      // Get feedbacks from pre-fetched data
      const feedbackAccounts = feedbacksByAgentId.get(agentIdStr) || [];
      const feedbacks: AgentInfo['feedbacks'] = feedbackAccounts.map(fb => ({
        feedbackIndex: fb.feedback_index,
        client: fb.getClientPublicKey(),
        score: fb.score,
        tag1: fb.tag1,
        tag2: fb.tag2,
        fileUri: fb.file_uri,
        isRevoked: fb.is_revoked,
        createdAt: new Date(Number(fb.created_at) * 1000),
      }));

      // Sort feedbacks by index
      feedbacks.sort((a, b) => Number(a.feedbackIndex) - Number(b.feedbackIndex));

      agents.push({
        agentId: agent.agent_id,
        mint: agent.getMintPublicKey(),
        owner: agent.getOwnerPublicKey(),
        uri: agent.agent_uri,
        name: agent.nft_name,
        symbol: agent.nft_symbol,
        metadata,
        createdAt: new Date(Number(agent.created_at) * 1000),
        reputation,
        feedbacks,
      });
    } catch (e) {
      // Not an agent account or parsing failed
      continue;
    }
  }

  // Sort agents by ID
  agents.sort((a, b) => Number(a.agentId) - Number(b.agentId));

  // 3. Display results
  console.log('='.repeat(80));
  console.log(`AGENTS (${agents.length} total)`);
  console.log('='.repeat(80));

  for (const agent of agents) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`AGENT #${agent.agentId}`);
    console.log(`${'─'.repeat(80)}`);
    console.log(`  Mint:       ${agent.mint.toBase58()}`);
    console.log(`  Owner:      ${agent.owner.toBase58()}`);
    console.log(`  Name:       ${agent.name}`);
    console.log(`  Symbol:     ${agent.symbol}`);
    console.log(`  URI:        ${agent.uri}`);
    console.log(`  Created:    ${agent.createdAt.toISOString()}`);

    if (agent.metadata.length > 0) {
      console.log(`  Metadata:`);
      for (const m of agent.metadata) {
        console.log(`    - ${m.key}: ${m.value}`);
      }
    }

    if (agent.reputation) {
      console.log(`  Reputation:`);
      console.log(`    - Total Feedbacks: ${agent.reputation.totalFeedbacks}`);
      console.log(`    - Average Score:   ${agent.reputation.averageScore}/100`);
      console.log(`    - Total Score Sum: ${agent.reputation.totalScoreSum}`);
    } else {
      console.log(`  Reputation: No feedbacks yet`);
    }

    if (agent.feedbacks.length > 0) {
      console.log(`  Feedbacks (${agent.feedbacks.length}):`);
      for (const fb of agent.feedbacks) {
        const status = fb.isRevoked ? ' [REVOKED]' : '';
        console.log(`    [${fb.feedbackIndex}] Score: ${fb.score}/100${status}`);
        console.log(`        Client: ${fb.client.toBase58()}`);
        console.log(`        Tags: ${fb.tag1}, ${fb.tag2}`);
        if (fb.fileUri) {
          console.log(`        URI: ${fb.fileUri}`);
        }
        console.log(`        Date: ${fb.createdAt.toISOString()}`);
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Total Agents: ${agents.length}`);

  const totalFeedbacks = agents.reduce((sum, a) => sum + a.feedbacks.length, 0);
  console.log(`Total Feedbacks: ${totalFeedbacks}`);

  const agentsWithFeedbacks = agents.filter(a => a.feedbacks.length > 0).length;
  console.log(`Agents with Feedbacks: ${agentsWithFeedbacks}`);

  if (agentsWithFeedbacks > 0) {
    const avgScore = agents
      .filter(a => a.reputation)
      .reduce((sum, a) => sum + (a.reputation?.averageScore || 0), 0) / agentsWithFeedbacks;
    console.log(`Average Score (across agents): ${avgScore.toFixed(1)}/100`);
  }

  console.log('');
}

main().catch(console.error);
