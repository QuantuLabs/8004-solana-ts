/**
 * 8004-solana-ts SDK
 * TypeScript SDK for ERC-8004 on Solana
 * Main entry point - exports public API
 */

// Export models
export * from './models/index.js';

// Export utilities
export * from './utils/index.js';

// Export core classes (will be created)
// export { SDK } from './core/sdk.js';
// export type { SDKConfig } from './core/sdk.js';
// export { Agent } from './core/agent.js';

// Export IPFS client
export { IPFSClient } from './core/ipfs-client.js';
export type { IPFSClientConfig } from './core/ipfs-client.js';

// Export endpoint utilities
export { EndpointCrawler } from './core/endpoint-crawler.js';
export type { McpCapabilities, A2aCapabilities } from './core/endpoint-crawler.js';

// Export Solana-specific (for now, temporary until SDK/Agent are created)
export * from './core/programs.js';
export * from './core/pda-helpers.js';
export * from './core/borsh-schemas.js';
export * from './core/feedback-auth.js';
export * from './core/instruction-discriminators.js';
export * from './core/instruction-builder.js';
export * from './core/metaplex-helpers.js';
export * from './core/transaction-builder.js';
export { SolanaSDK } from './core/sdk-solana.js';
export type { SolanaSDKConfig } from './core/sdk-solana.js';

