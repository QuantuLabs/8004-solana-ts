/**
 * Collection Flow Example (simple metadata + 20 assets)
 *
 * Flow:
 * 1) Create one collection metadata document.
 * 2) Create 20 distinct agent metadata files.
 * 3) Register each asset with `collectionPointer` directly in `registerAgent(...)`.
 * 4) Also show explicit `setCollectionPointer(...)` flow on the first asset.
 *
 * Defaults:
 * - AGENT_COUNT=20
 * - DRY_RUN=0 (set DRY_RUN=1 to prepare transactions with skipSend)
 */
import { Keypair } from '@solana/web3.js';
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  ServiceType,
} from '../src/index.js';
import type {
  CollectionMetadataInput,
  RegistrationFile,
  TransactionResult,
  PreparedTransaction,
} from '../src/index.js';

const DEFAULT_AGENT_COUNT = 20;
const DEFAULT_DRY_COLLECTION_POINTER = 'c1:dryruncollectionflow000000000000000000000001';

function parseKeypair(secretKey: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
}

function buildIpfsClient(): IPFSClient | undefined {
  const pinataJwt = process.env.PINATA_JWT;
  if (pinataJwt) {
    return new IPFSClient({
      pinataEnabled: true,
      pinataJwt,
    });
  }

  const ipfsApiUrl = process.env.IPFS_API_URL;
  if (ipfsApiUrl) {
    return new IPFSClient({ url: ipfsApiUrl });
  }

  return undefined;
}

function buildAgentRegistration(index: number): RegistrationFile {
  const padded = String(index).padStart(2, '0');

  return {
    name: `CasterCorp Agent ${padded}`,
    description: `CasterCorp autonomous worker #${padded} for the collection-flow example.`,
    image: `ipfs://bafybeiexampleagentimages/agent-${padded}.png`,
    services: [
      {
        type: ServiceType.MCP,
        value: `https://api.castercorp.ai/agent-${padded}/mcp`,
      },
      {
        type: ServiceType.A2A,
        value: `https://api.castercorp.ai/agent-${padded}/a2a`,
      },
      {
        type: ServiceType.OASF,
        value: `https://api.castercorp.ai/agent-${padded}/oasf`,
      },
    ],
    skills: ['natural_language_processing/natural_language_generation/summarization'],
    domains: ['technology/automation/workflow_automation'],
    active: true,
    x402Support: index % 2 === 0,
    metadata: {
      example: 'collection-flow',
      ordinal: index,
    },
  };
}

function describeResult(result: unknown): string {
  if (typeof result !== 'object' || result === null) {
    return 'unknown result';
  }

  if ('transaction' in result && typeof result.transaction === 'string') {
    return `prepared tx (${result.transaction.slice(0, 18)}...)`;
  }

  if ('signature' in result && typeof result.signature === 'string') {
    return `signature ${result.signature}`;
  }

  return 'result without signature/transaction';
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const agentCount = Number.parseInt(process.env.AGENT_COUNT ?? String(DEFAULT_AGENT_COUNT), 10);
  if (!Number.isInteger(agentCount) || agentCount <= 0) {
    throw new Error('AGENT_COUNT must be a positive integer');
  }

  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey && !dryRun) {
    throw new Error('SOLANA_PRIVATE_KEY is required when DRY_RUN is not enabled');
  }

  const signer = secretKey ? parseKeypair(secretKey) : Keypair.generate();
  if (!secretKey && dryRun) {
    console.log('DRY_RUN enabled without SOLANA_PRIVATE_KEY: using ephemeral signer public key');
  }

  const ipfsClient = buildIpfsClient();
  const sdk = new SolanaSDK({
    signer,
    rpcUrl: process.env.SOLANA_RPC_URL,
    ...(ipfsClient ? { ipfsClient } : {}),
  });

  // Keep collection metadata intentionally simple, similar to quickstart docs.
  const collectionMetadata: CollectionMetadataInput = {
    name: 'QuantuLabs Agent Fleet',
    symbol: 'QLFLEET',
    description: 'Collection metadata for QuantuLabs agents.',
    image: 'ipfs://bafybeiquantucollection/logo.png',
  };

  const uploadCollectionToIpfs = !!ipfsClient && (!dryRun || process.env.DRY_RUN_UPLOAD_COLLECTION === '1');
  const collection = await sdk.createCollection(collectionMetadata, {
    uploadToIpfs: uploadCollectionToIpfs,
  });

  const collectionPointer =
    collection.pointer ??
    process.env.DRY_COLLECTION_POINTER ??
    DEFAULT_DRY_COLLECTION_POINTER;

  if (!collection.pointer && !dryRun) {
    throw new Error('Collection pointer missing. Configure PINATA_JWT or IPFS_API_URL to upload collection metadata.');
  }

  console.log('\nCollection prepared:');
  console.log(`- Name: ${collection.metadata.name}`);
  console.log(`- CID: ${collection.cid ?? '(not uploaded)'}`);
  console.log(`- URI: ${collection.uri ?? '(not uploaded)'}`);
  console.log(`- Pointer used for association: ${collectionPointer}`);
  console.log(`- Mode: ${dryRun ? 'DRY_RUN (skipSend)' : 'LIVE send'}\n`);

  const createdAssets: string[] = [];

  for (let i = 1; i <= agentCount; i++) {
    const agentMetadata = buildRegistrationFileJson(buildAgentRegistration(i));
    let agentUri: string;

    if (dryRun) {
      agentUri = `ipfs://dry-run-agent-${String(i).padStart(2, '0')}`;
    } else {
      if (!ipfsClient) {
        throw new Error('PINATA_JWT or IPFS_API_URL is required to upload agent metadata in non-dry mode');
      }
      const cid = await ipfsClient.addJson(agentMetadata);
      agentUri = `ipfs://${cid}`;
    }

    const shouldRunExplicitSetPointer = i === 1;
    const shouldSetPointerInline = !shouldRunExplicitSetPointer;
    const registerResult = await sdk.registerAgent(
      agentUri,
      undefined,
      dryRun
        ? {
            skipSend: true,
            signer: signer.publicKey,
            assetPubkey: Keypair.generate().publicKey,
            ...(shouldSetPointerInline
              ? {
                  collectionPointer,
                  collectionLock: true,
                }
              : {}),
          }
        : (shouldSetPointerInline
            ? {
                collectionPointer,
                collectionLock: true,
              }
            : undefined)
    );

    if ('success' in registerResult && !registerResult.success) {
      throw new Error(`registerAgent failed for #${i}: ${registerResult.error ?? 'unknown error'}`);
    }
    if (!registerResult.asset) {
      throw new Error(`registerAgent did not return an asset for #${i}`);
    }

    let setPointerResult: TransactionResult | PreparedTransaction | undefined;
    if (shouldRunExplicitSetPointer) {
      setPointerResult = await sdk.setCollectionPointer(
        registerResult.asset,
        collectionPointer,
        dryRun
          ? {
              skipSend: true,
              signer: signer.publicKey,
            }
          : undefined
      );

      if ('success' in setPointerResult && !setPointerResult.success) {
        throw new Error(`setCollectionPointer failed for #${i}: ${setPointerResult.error ?? 'unknown error'}`);
      }
    }

    const assetBase58 = registerResult.asset.toBase58();
    createdAssets.push(assetBase58);

    console.log(
      `[${String(i).padStart(2, '0')}/${String(agentCount).padStart(2, '0')}] ` +
        `asset=${assetBase58} | register=${describeResult(registerResult)} | ` +
        (setPointerResult
          ? `setCollectionPointer=${describeResult(setPointerResult)}`
          : 'setCollectionPointer=inline-via-registerAgent')
    );
  }

  console.log('\nDone.');
  console.log(`Created/Prepared ${createdAssets.length} assets associated with ${collectionPointer}`);
}

main().catch((error) => {
  console.error('collection-flow failed:', error);
  process.exit(1);
});
