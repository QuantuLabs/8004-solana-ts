/**
 * Create diverse agents with various tokenUri to test edge cases
 * Using current SDK API (tokenUri only)
 */

import { Keypair } from '@solana/web3.js';
import { createDevnetSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const tokenUris = [
  '', // Empty string
  'https://example.com/agent-basic.json', // Standard HTTP
  'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/metadata.json', // IPFS
  'ar://abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',  //  Arweave
  'https://very-long-domain-name-for-testing-maximum-uri-length.example.com/api/v2/nfts/agents/metadata/detailed-information/agent-with-extremely-long-uri-path-to-test-string-handling', // Long URI
  'https://example.com/agent-🤖-metadata.json', // Unicode
  'data:application/json;base64,eyJ0ZXN0IjoidmFsdWUifQ==', // Data URI
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  Creating Diverse Agents - Token URI Variations');
  console.log('='.repeat(70) + '\n');

  const keypairPath = `${process.env.HOME}/.config/solana/id.json`;
  console.log(`${CYAN}ℹ️  Loading keypair from ${keypairPath}${RESET}`);
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const signer = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log(`${GREEN}✅ Loaded signer: ${signer.publicKey.toBase58()}${RESET}`);

  const sdk = createDevnetSDK({ signer });
  console.log(`${GREEN}✅ Initialized SDK for cluster: devnet${RESET}`);

  const connection = sdk.getSolanaClient().getConnection();
  const balance = await connection.getBalance(signer.publicKey);
  console.log(`${CYAN}ℹ️  Balance: ${balance / 1e9} SOL${RESET}`);

  if (balance < 0.5 * 1e9) {
    console.log(`${YELLOW}⚠️  Low balance! You may need more SOL.${RESET}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  Registering ${tokenUris.length} Agents`);
  console.log('='.repeat(70) + '\n');

  const results = [];

  for (let i = 0; i < tokenUris.length; i++) {
    const tokenUri = tokenUris[i];

    console.log(`\n[${i + 1}/${tokenUris.length}] Agent with ${tokenUri ? 'token URI' : 'empty token URI'}`);
    console.log('-'.repeat(70));

    const uriDisplay = tokenUri.length > 60
      ? tokenUri.substring(0, 60) + '...'
      : tokenUri || '(empty)';
    console.log(`${CYAN}Token URI: ${uriDisplay}${RESET}`);

    try {
      console.log(`${CYAN}ℹ️  Registering agent...${RESET}`);

      const result = await sdk.registerAgent(tokenUri);

      if (result.success) {
        console.log(`${GREEN}✅ Agent registered!${RESET}`);
        console.log(`${CYAN}ℹ️    Agent ID: ${result.agentId}${RESET}`);
        console.log(`${CYAN}ℹ️    Mint: ${result.agentMint?.toBase58()}${RESET}`);
        console.log(`${CYAN}ℹ️    Signature: ${result.signature}${RESET}`);

        results.push({
          index: i,
          tokenUri,
          agentId: result.agentId?.toString(),
          mint: result.agentMint?.toBase58(),
          signature: result.signature,
          success: true,
        });
      } else {
        console.log(`\n❌ Failed: ${result.error}`);
        results.push({
          index: i,
          tokenUri,
          success: false,
          error: result.error,
        });
      }

      // Wait between registrations
      if (i < tokenUris.length - 1) {
        console.log(`${CYAN}ℹ️  Waiting 2 seconds...${RESET}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      results.push({
        index: i,
        tokenUri,
        success: false,
        error: error.message,
      });
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('  Registration Summary');
  console.log('='.repeat(70) + '\n');

  const successful = results.filter((r: any) => r.success);
  const failed = results.filter((r: any) => !r.success);

  console.log(`${GREEN}✅ Successfully registered: ${successful.length}/${results.length} agents${RESET}`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed registrations: ${failed.length}`);
    failed.forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. Index ${r.index}: ${r.error}`);
    });
  }

  if (successful.length > 0) {
    console.log('\n' + GREEN + 'Successfully registered agents:' + RESET);
    successful.forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. Agent ID ${r.agentId}`);
      console.log(`     Mint: ${r.mint}`);
      const uriPreview = r.tokenUri ? r.tokenUri.substring(0, 50) : '(empty)';
      console.log(`     URI: ${uriPreview}${r.tokenUri && r.tokenUri.length > 50 ? '...' : ''}`);
    });
  }

  // Export results
  const outputPath = '/tmp/diverse-agents-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${CYAN}ℹ️  Results saved to: ${outputPath}${RESET}`);

  console.log('\n' + '='.repeat(70));
  console.log('  Token URI Edge Cases Tested:');
  console.log('='.repeat(70));
  console.log('  ✓ Empty string');
  console.log('  ✓ Standard HTTPS URI');
  console.log('  ✓ IPFS URI');
  console.log('  ✓ Arweave URI');
  console.log('  ✓ Very long URI (>100 chars)');
  console.log('  ✓ Unicode characters (emoji)');
  console.log('  ✓ Data URI (base64)');
  console.log('='.repeat(70) + '\n');
}

main().catch((error) => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
