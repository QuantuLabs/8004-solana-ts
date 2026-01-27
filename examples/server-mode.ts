/**
 * Server Mode Example - Solana SDK v0.5.0+
 *
 * Demonstrates how to use skipSend for server/client architecture:
 * - Server builds unsigned transactions (no private key needed)
 * - Client signs with their wallet (Phantom, Solflare, etc.)
 *
 * Use case: Web app where backend builds transactions, frontend signs
 */
import { Keypair, PublicKey, Transaction, Connection } from '@solana/web3.js';
import { SolanaSDK, PreparedTransaction } from '../src/index.js';

// =============================================================================
// SERVER SIDE - Build transactions without signing
// =============================================================================

/**
 * Example Express-like server endpoints
 * In production, replace with your actual Express/Fastify server
 */
class TransactionServer {
  private sdk: SolanaSDK;

  constructor() {
    // Server SDK: no signer needed, read-only mode
    this.sdk = new SolanaSDK();
  }

  /**
   * POST /api/feedback
   * Build a feedback transaction for the user to sign
   */
  async buildFeedbackTransaction(params: {
    agentAsset: string; // Agent asset PublicKey (base58)
    value: string;      // Decimal string (e.g., '85', '99.5')
    tag1: string;
    tag2: string;
    fileUri: string;
    userWallet: string; // User's wallet address (base58)
  }): Promise<PreparedTransaction & { feedbackIndex: bigint }> {
    const { agentAsset, value, tag1, tag2, fileUri, userWallet } = params;

    const prepared = await this.sdk.giveFeedback(
      new PublicKey(agentAsset),
      {
        value,
        tag1,
        tag2,
        feedbackUri: fileUri,
        feedbackHash: Buffer.alloc(32), // In production: compute actual hash
      },
      {
        skipSend: true,
        signer: new PublicKey(userWallet),
      }
    );

    // Type guard: ensure we got PreparedTransaction, not TransactionResult
    if ('signature' in prepared) {
      throw new Error('Unexpected: got TransactionResult instead of PreparedTransaction');
    }

    return prepared;
  }

  /**
   * POST /api/register
   * Build a register agent transaction
   */
  async buildRegisterTransaction(params: {
    tokenUri: string;
    userWallet: string;
    collection?: string; // Optional: specific collection to register in
  }): Promise<PreparedTransaction & { asset: PublicKey }> {
    const { tokenUri, userWallet, collection } = params;

    const prepared = await this.sdk.registerAgent(
      tokenUri,
      collection ? new PublicKey(collection) : undefined,
      {
        skipSend: true,
        signer: new PublicKey(userWallet),
      }
    );

    if ('signature' in prepared) {
      throw new Error('Unexpected: got TransactionResult instead of PreparedTransaction');
    }

    return prepared as PreparedTransaction & { asset: PublicKey };
  }

  /**
   * POST /api/transfer
   * Build a transfer agent transaction
   */
  async buildTransferTransaction(params: {
    agentAsset: string;
    collection: string;
    newOwner: string;
    userWallet: string;
  }): Promise<PreparedTransaction> {
    const { agentAsset, collection, newOwner, userWallet } = params;

    const prepared = await this.sdk.transferAgent(
      new PublicKey(agentAsset),
      new PublicKey(collection),
      new PublicKey(newOwner),
      {
        skipSend: true,
        signer: new PublicKey(userWallet),
      }
    );

    if ('signature' in prepared) {
      throw new Error('Unexpected: got TransactionResult instead of PreparedTransaction');
    }

    return prepared;
  }
}

// =============================================================================
// CLIENT SIDE - Sign and send transactions
// =============================================================================

/**
 * Example client-side code (React/Vue/etc.)
 * Shows how to sign and send the prepared transaction
 */
async function clientSideSigning() {
  // Simulated wallet adapter (in production: use @solana/wallet-adapter)
  const userKeypair = Keypair.generate();
  const connection = new Connection('https://api.devnet.solana.com');

  // 1. Fetch prepared transaction from server
  const serverResponse: PreparedTransaction = {
    transaction: '...base64...', // From server
    blockhash: '...blockhash...',
    lastValidBlockHeight: 12345678,
    signer: userKeypair.publicKey.toBase58(),
    signed: false,
  };

  // 2. Deserialize the transaction
  const tx = Transaction.from(Buffer.from(serverResponse.transaction, 'base64'));

  // 3. Sign with user's wallet
  // In production with wallet adapter: const signedTx = await wallet.signTransaction(tx);
  tx.sign(userKeypair);

  // 4. Send to network
  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log('Transaction sent:', signature);

  // 5. Confirm
  await connection.confirmTransaction({
    signature,
    blockhash: serverResponse.blockhash,
    lastValidBlockHeight: serverResponse.lastValidBlockHeight,
  });
  console.log('Transaction confirmed!');
}

/**
 * Example: Register agent flow
 */
async function clientSideRegisterAgent() {
  const userKeypair = Keypair.generate();
  const connection = new Connection('https://api.devnet.solana.com');

  // 1. Send request to server
  const server = new TransactionServer();
  const prepared = await server.buildRegisterTransaction({
    tokenUri: 'ipfs://QmYourAgentMetadata',
    userWallet: userKeypair.publicKey.toBase58(),
  });

  console.log('Agent asset will be:', prepared.asset.toBase58());

  // 2. Deserialize transaction
  const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));

  // 3. Sign with user wallet
  tx.sign(userKeypair);

  // 4. Send and confirm
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({
    signature,
    blockhash: prepared.blockhash,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
  });

  console.log('Agent registered! Signature:', signature);
}

// =============================================================================
// DEMO: Full flow simulation
// =============================================================================

async function main() {
  console.log('=== Server Mode Demo ===\n');

  // Create server instance
  const server = new TransactionServer();

  // Simulate a user wallet
  const userWallet = Keypair.generate();
  console.log('User wallet:', userWallet.publicKey.toBase58());

  // Example agent asset and collection (replace with actual values)
  const agentAsset = 'Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ';
  const collection = 'AucZdyKKkeJL8J5ZMqLrqhqbp4DZPUfaCP9A8RZG5iSL';

  try {
    // Build a feedback transaction
    console.log('\n1. Building feedback transaction on server...');
    const feedbackTx = await server.buildFeedbackTransaction({
      agentAsset,
      value: '85',
      tag1: 'helpful',
      tag2: 'accurate',
      fileUri: 'ipfs://QmFeedbackDetails',
      userWallet: userWallet.publicKey.toBase58(),
    });

    console.log('Prepared transaction:');
    console.log('  - Base64 length:', feedbackTx.transaction.length);
    console.log('  - Blockhash:', feedbackTx.blockhash);
    console.log('  - Signer:', feedbackTx.signer);
    console.log('  - Feedback index:', feedbackTx.feedbackIndex.toString());

    // In production, client would now:
    // 1. Receive this JSON from server
    // 2. Deserialize with Transaction.from(Buffer.from(tx.transaction, 'base64'))
    // 3. Sign with wallet.signTransaction()
    // 4. Send with connection.sendRawTransaction()

    console.log('\n2. Building transfer transaction on server...');
    const newOwner = Keypair.generate();
    const transferTx = await server.buildTransferTransaction({
      agentAsset,
      collection,
      newOwner: newOwner.publicKey.toBase58(),
      userWallet: userWallet.publicKey.toBase58(),
    });

    console.log('Transfer transaction built:');
    console.log('  - Base64 length:', transferTx.transaction.length);
    console.log('  - Signer:', transferTx.signer);

    console.log('\n=== Demo complete! ===');
    console.log('\nIn production:');
    console.log('1. Expose buildFeedbackTransaction as POST /api/feedback');
    console.log('2. Client fetches prepared tx, signs with wallet adapter');
    console.log('3. Client sends signed tx directly to Solana network');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Suppress unused variable warnings for example functions
void clientSideSigning;
void clientSideRegisterAgent;

main().catch(console.error);
