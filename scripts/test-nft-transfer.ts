/**
 * Test NFT Transfer and Ownership Verification
 *
 * This script:
 * 1. Generates a new wallet (recipient)
 * 2. Transfers an agent NFT to the new wallet
 * 3. Verifies AgentAccount.owner is updated
 * 4. Tests SDK operations with the new owner
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=HELIUS_API_KEY_REDACTED';
const WALLET_PATH = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, '.config/solana/id.json');
const AGENT_ID = 26; // Agent to transfer

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('='.repeat(80));
  console.log('TEST NFT TRANSFER - Agent #' + AGENT_ID);
  console.log('='.repeat(80));
  console.log(`RPC: ${RPC_URL}\n`);

  // 1. Load source wallet (current owner)
  console.log('Loading source wallet...');
  const sourceWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8')))
  );
  console.log(`Source wallet: ${sourceWallet.publicKey.toBase58()}`);
  const sourceBalance = await connection.getBalance(sourceWallet.publicKey);
  console.log(`Source balance: ${(sourceBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL\n`);

  // 2. Generate new recipient wallet
  console.log('Generating new recipient wallet...');
  const recipientWallet = Keypair.generate();
  console.log(`Recipient wallet: ${recipientWallet.publicKey.toBase58()}`);

  // Fund recipient with a small amount for future operations
  console.log('Funding recipient with 0.01 SOL...');
  const { blockhash } = await connection.getLatestBlockhash();
  const fundTx = new (await import('@solana/web3.js')).Transaction().add(
    (await import('@solana/web3.js')).SystemProgram.transfer({
      fromPubkey: sourceWallet.publicKey,
      toPubkey: recipientWallet.publicKey,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    })
  );
  fundTx.recentBlockhash = blockhash;
  fundTx.feePayer = sourceWallet.publicKey;
  fundTx.sign(sourceWallet);
  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig, 'confirmed');
  console.log(`Funded recipient: ${fundSig}\n`);

  // 3. Load agent BEFORE transfer
  console.log('='.repeat(40));
  console.log('BEFORE TRANSFER');
  console.log('='.repeat(40));

  const sdkSource = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: RPC_URL,
    signer: sourceWallet,
  });

  const agentBefore = await sdkSource.loadAgent(AGENT_ID);
  if (!agentBefore) {
    throw new Error(`Agent #${AGENT_ID} not found`);
  }

  console.log(`Agent #${AGENT_ID}:`);
  console.log(`  Name: ${agentBefore.nft_name}`);
  console.log(`  Mint: ${agentBefore.getMintPublicKey().toBase58()}`);
  console.log(`  Owner: ${agentBefore.getOwnerPublicKey().toBase58()}`);

  // Verify source is owner
  const isSourceOwnerBefore = await sdkSource.isAgentOwner(AGENT_ID, sourceWallet.publicKey);
  console.log(`  Is source owner: ${isSourceOwnerBefore}`);
  console.log('');

  // 4. Transfer agent to recipient
  console.log('='.repeat(40));
  console.log('TRANSFERRING NFT...');
  console.log('='.repeat(40));

  try {
    const result = await sdkSource.transferAgent(AGENT_ID, recipientWallet.publicKey);
    console.log(`Transfer result: ${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    console.error(`Transfer failed: ${error}`);
    throw error;
  }

  // Wait a bit for state to propagate
  console.log('Waiting for state propagation (3s)...\n');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 5. Verify AFTER transfer
  console.log('='.repeat(40));
  console.log('AFTER TRANSFER');
  console.log('='.repeat(40));

  // Create new SDK instance with recipient
  const sdkRecipient = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: RPC_URL,
    signer: recipientWallet,
  });

  // Force refresh the mint resolver cache
  await sdkSource.loadAgent(AGENT_ID); // This will refresh the cache

  const agentAfter = await sdkSource.loadAgent(AGENT_ID);
  if (!agentAfter) {
    throw new Error(`Agent #${AGENT_ID} not found after transfer`);
  }

  console.log(`Agent #${AGENT_ID}:`);
  console.log(`  Name: ${agentAfter.nft_name}`);
  console.log(`  Mint: ${agentAfter.getMintPublicKey().toBase58()}`);
  console.log(`  Owner: ${agentAfter.getOwnerPublicKey().toBase58()}`);
  console.log(`  Owner changed: ${!agentBefore.getOwnerPublicKey().equals(agentAfter.getOwnerPublicKey())}`);

  // 6. Test ownership checks
  console.log('\n' + '='.repeat(40));
  console.log('OWNERSHIP TESTS');
  console.log('='.repeat(40));

  const isSourceOwnerAfter = await sdkSource.isAgentOwner(AGENT_ID, sourceWallet.publicKey);
  const isRecipientOwner = await sdkSource.isAgentOwner(AGENT_ID, recipientWallet.publicKey);

  console.log(`Is source still owner: ${isSourceOwnerAfter} (expected: false)`);
  console.log(`Is recipient owner: ${isRecipientOwner} (expected: true)`);

  // 7. Test operations with new owner
  console.log('\n' + '='.repeat(40));
  console.log('NEW OWNER OPERATIONS TEST');
  console.log('='.repeat(40));

  // Test that recipient can update metadata (if implemented)
  console.log('Testing getAgentOwner...');
  const owner = await sdkRecipient.getAgentOwner(AGENT_ID);
  console.log(`getAgentOwner result: ${owner?.toBase58()}`);
  console.log(`Matches recipient: ${owner?.equals(recipientWallet.publicKey)}`);

  // 8. Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Agent #${AGENT_ID} transferred successfully!`);
  console.log(`From: ${sourceWallet.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`To: ${recipientWallet.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`\nNew owner verified in AgentAccount: ${isRecipientOwner ? 'YES' : 'NO'}`);
  console.log('='.repeat(80));

  // Save recipient keypair for future use
  const recipientData = {
    publicKey: recipientWallet.publicKey.toBase58(),
    secretKey: Array.from(recipientWallet.secretKey),
    agentId: AGENT_ID,
    transferredAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, 'test-recipient-wallet.json'),
    JSON.stringify(recipientData, null, 2)
  );
  console.log(`\nRecipient wallet saved to: scripts/test-recipient-wallet.json`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
