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
// Export endpoint utilities
export { EndpointCrawler } from './core/endpoint-crawler.js';
// Export Solana-specific (for now, temporary until SDK/Agent are created)
export * from './core/programs.js';
export * from './core/pda-helpers.js';
export * from './core/borsh-schemas.js';
// feedback-auth.ts removed - not used by on-chain program (uses native Signer constraint)
export * from './core/instruction-discriminators.js';
export * from './core/instruction-builder.js';
export * from './core/metaplex-helpers.js';
export * from './core/transaction-builder.js';
// Export Solana client with RPC detection
export { SolanaClient, UnsupportedRpcError, SOLANA_DEVNET_RPC, RECOMMENDED_RPC_PROVIDERS, createDevnetClient, } from './core/client.js';
// Export Solana SDK
export { SolanaSDK } from './core/sdk-solana.js';
// Export OASF taxonomy utilities
export { validateSkill, validateDomain, getAllSkills, getAllDomains, } from './core/oasf-validator.js';
// Export config reader
export { fetchRegistryConfig } from './core/config-reader.js';
//# sourceMappingURL=index.js.map