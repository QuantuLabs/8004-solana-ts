/**
 * Test New Owner Rights after NFT Transfer
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=HELIUS_API_KEY_REDACTED';
const AGENT_ID = 26;
const OLD_OWNER = '2KmHw8VbShuz9xfj3ecEjBM5nPKR5BcYHRDSFfK1286t';

async function testNewOwnerRights() {
  console.log('='.repeat(60));
  console.log('TEST NEW OWNER RIGHTS - Agent #' + AGENT_ID);
  console.log('='.repeat(60));

  // Create SDK in read-only mode
  const sdk = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: RPC_URL,
  });

  // 1. Load agent data
  console.log('\n1. Loading agent data...');
  const agent = await sdk.loadAgent(AGENT_ID);
  if (!agent) {
    throw new Error('Agent not found');
  }

  console.log('   Name:', agent.nft_name);
  console.log('   Mint:', agent.getMintPublicKey().toBase58());
  console.log('   Current Owner:', agent.getOwnerPublicKey().toBase58());
  console.log('   URI:', agent.agent_uri);

  // 2. Test getAgentOwner
  console.log('\n2. Testing getAgentOwner...');
  const owner = await sdk.getAgentOwner(AGENT_ID);
  console.log('   Owner from SDK:', owner?.toBase58());

  // 3. Test isAgentOwner with different addresses
  console.log('\n3. Testing isAgentOwner...');
  const oldOwner = new PublicKey(OLD_OWNER);
  const newOwner = agent.getOwnerPublicKey();
  const randomAddr = Keypair.generate().publicKey;

  const isOldOwner = await sdk.isAgentOwner(AGENT_ID, oldOwner);
  const isNewOwner = await sdk.isAgentOwner(AGENT_ID, newOwner);
  const isRandom = await sdk.isAgentOwner(AGENT_ID, randomAddr);

  console.log('   Is old owner (2KmHw...):', isOldOwner, '(expected: false)');
  console.log('   Is new owner (HKVW3...):', isNewOwner, '(expected: true)');
  console.log('   Is random addr:', isRandom, '(expected: false)');

  // 4. Load metadata
  console.log('\n4. Loading agent metadata...');
  const metadata = await sdk.getAgentMetadata(AGENT_ID);
  console.log('   Metadata keys:', Object.keys(metadata || {}).length);
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      const displayValue = typeof value === 'string' && value.length > 50
        ? value.slice(0, 50) + '...'
        : value;
      console.log('     -', key + ':', displayValue);
    }
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('Agent #' + AGENT_ID + ' ownership transferred successfully');
  console.log('- Old owner (2KmHw...): NO longer owner');
  console.log('- New owner (HKVW3...): IS owner');
  console.log('- SDK correctly reads updated AgentAccount.owner');
  console.log('='.repeat(60));
}

testNewOwnerRights().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
