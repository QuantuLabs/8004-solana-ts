/**
 * Verify Agent NFTs on Solana Devnet
 *
 * This script:
 * 1. Loads all AgentAccount PDAs from Identity Registry
 * 2. For each agent, verifies:
 *    - NFT mint exists
 *    - Owner's token account exists and has 1 token
 *    - Token account is NOT frozen (transferable)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';
import { AgentAccount } from '../src/core/borsh-schemas.js';
import { ACCOUNT_DISCRIMINATORS } from '../src/core/instruction-discriminators.js';
import { IDENTITY_PROGRAM_ID } from '../src/core/pda-helpers.js';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

interface AgentNFTStatus {
  agentId: bigint;
  name: string;
  mint: string;
  owner: string;
  hasToken: boolean;
  tokenAmount: string;
  isFrozen: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  error?: string;
}

async function verifyAgentNFTs() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('='.repeat(100));
  console.log('VERIFICATION DES NFTs D\'AGENTS - Solana Devnet');
  console.log('='.repeat(100));
  console.log(`RPC: ${RPC_URL}\n`);

  // 1. Load all AgentAccount PDAs from Identity Registry
  console.log('Scanning Identity Registry for all agents...\n');

  const discriminatorBytes = bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount);
  const accounts = await connection.getProgramAccounts(IDENTITY_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: discriminatorBytes,
        },
      },
    ],
  });

  console.log(`Found ${accounts.length} agents\n`);

  const results: AgentNFTStatus[] = [];

  // 2. Process each agent
  for (const { account } of accounts) {
    try {
      const agentAccount = AgentAccount.deserialize(Buffer.from(account.data));
      const mint = agentAccount.getMintPublicKey();
      const owner = agentAccount.getOwnerPublicKey();

      const status: AgentNFTStatus = {
        agentId: agentAccount.agent_id,
        name: agentAccount.nft_name,
        mint: mint.toBase58(),
        owner: owner.toBase58(),
        hasToken: false,
        tokenAmount: '0',
        isFrozen: false,
        mintAuthority: null,
        freezeAuthority: null,
      };

      // 3. Check mint info
      try {
        const mintInfo = await getMint(connection, mint);
        status.mintAuthority = mintInfo.mintAuthority?.toBase58() || 'None (burned)';
        status.freezeAuthority = mintInfo.freezeAuthority?.toBase58() || 'None';
      } catch (e) {
        status.error = 'Mint not found';
      }

      // 4. Check token account
      try {
        const ata = await getAssociatedTokenAddress(mint, owner);
        const tokenAccount = await getAccount(connection, ata);
        status.hasToken = true;
        status.tokenAmount = tokenAccount.amount.toString();
        status.isFrozen = tokenAccount.isFrozen;
      } catch (e) {
        status.error = status.error || 'Token account not found';
      }

      results.push(status);
    } catch (e) {
      console.error(`Error processing account: ${e}`);
    }
  }

  // Sort by agent ID
  results.sort((a, b) => Number(a.agentId) - Number(b.agentId));

  // 5. Display results
  console.log('ID'.padEnd(5) + '| ' + 'Name'.padEnd(15) + '| ' + 'Mint'.padEnd(12) + '| ' + 'Owner'.padEnd(12) + '| ' + 'Token'.padEnd(7) + '| ' + 'Frozen'.padEnd(8) + '| Status');
  console.log('-'.repeat(100));

  let allOk = true;
  for (const r of results) {
    const status = r.error ? `ERROR: ${r.error}` : 'OK';
    const frozen = r.isFrozen ? 'YES' : 'NO';
    if (r.error || r.isFrozen || r.tokenAmount !== '1') allOk = false;

    console.log(
      `${r.agentId}`.padEnd(5) + '| ' +
      r.name.padEnd(15) + '| ' +
      r.mint.slice(0, 10) + '..| ' +
      r.owner.slice(0, 10) + '..| ' +
      r.tokenAmount.padEnd(7) + '| ' +
      frozen.padEnd(8) + '| ' +
      status
    );
  }

  console.log('-'.repeat(100));
  console.log(`\nTotal: ${results.length} agents`);
  console.log(`Status: ${allOk ? 'ALL OK - NFTs verified and transferable' : 'ISSUES FOUND - See above'}\n`);

  // 6. Summary
  console.log('='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Agents: ${results.length}`);
  console.log(`With Token: ${results.filter(r => r.hasToken).length}`);
  console.log(`Frozen: ${results.filter(r => r.isFrozen).length}`);
  console.log(`Errors: ${results.filter(r => r.error).length}`);
  console.log(`\nToken Standard: SPL Token (standard, not Token2022)`);
  console.log(`Transferable: ${results.filter(r => !r.isFrozen && r.hasToken).length}/${results.length} agents`);
  console.log('='.repeat(100));

  // 7. Show unique owners
  const uniqueOwners = new Set(results.map(r => r.owner));
  console.log(`\nUnique Owners (${uniqueOwners.size}):`);
  for (const owner of uniqueOwners) {
    const count = results.filter(r => r.owner === owner).length;
    console.log(`  ${owner.slice(0, 20)}... (${count} agents)`);
  }
}

verifyAgentNFTs().catch(console.error);
