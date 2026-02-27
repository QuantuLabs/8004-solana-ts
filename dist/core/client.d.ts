/**
 * Solana RPC client wrapper
 * Provides lightweight interface for querying Solana accounts
 * No Anchor dependency - uses @solana/web3.js only
 */
import { Connection, PublicKey, GetProgramAccountsFilter, AccountInfo, Commitment } from '@solana/web3.js';
export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';
/** Default Solana devnet RPC URL */
export declare const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
/** Default Solana testnet RPC URL */
export declare const SOLANA_TESTNET_RPC = "https://api.testnet.solana.com";
/** Default Solana mainnet-beta RPC URL */
export declare const SOLANA_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
/** Default Solana localnet RPC URL */
export declare const SOLANA_LOCALNET_RPC = "http://127.0.0.1:8899";
/** List of RPC providers that support advanced features like getProgramAccounts with memcmp */
export declare const RECOMMENDED_RPC_PROVIDERS: string[];
export interface SolanaClientConfig {
    cluster?: Cluster;
    rpcUrl?: string;
    commitment?: Commitment;
}
/**
 * Error thrown when an operation requires RPC features not available on public devnet
 */
export declare class UnsupportedRpcError extends Error {
    readonly operation: string;
    constructor(operation: string);
}
/**
 * Error thrown when an RPC operation fails due to network issues
 * Distinguishes network failures from "account not found" (which returns null)
 */
export declare class RpcNetworkError extends Error {
    readonly operation: string;
    readonly cause: unknown;
    constructor(operation: string, cause: unknown);
}
/**
 * Lightweight Solana client for 8004 read operations
 * Avoids Anchor dependency for smaller package size
 */
export declare class SolanaClient {
    private connection;
    readonly cluster: Cluster;
    readonly rpcUrl: string;
    /** True if using the default public Solana devnet RPC (limited features) */
    readonly isDefaultDevnetRpc: boolean;
    constructor(config: SolanaClientConfig);
    /**
     * Check if the current RPC supports advanced features
     * Returns false for default devnet RPC, true for custom RPC providers
     */
    supportsAdvancedQueries(): boolean;
    /**
     * Assert that advanced queries are supported, throw UnsupportedRpcError if not
     */
    requireAdvancedQueries(operation: string): void;
    /**
     * Get single account data
     * Returns null if account doesn't exist
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    getAccount(address: PublicKey): Promise<Buffer | null>;
    /**
     * Get multiple accounts in a single RPC call
     * More efficient than individual getAccount calls
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    getMultipleAccounts(addresses: PublicKey[]): Promise<(Buffer | null)[]>;
    /**
     * Get all program accounts with optional filters
     * Used for queries like "get all feedbacks for agent X"
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    getProgramAccounts(programId: PublicKey, filters?: GetProgramAccountsFilter[]): Promise<{
        pubkey: PublicKey;
        data: Buffer;
    }[]>;
    /**
     * Get all program accounts with memcmp filter
     * More convenient for common pattern of filtering by offset/bytes
     */
    getProgramAccountsWithMemcmp(programId: PublicKey, offset: number, bytes: string): Promise<{
        pubkey: PublicKey;
        data: Buffer;
    }[]>;
    /**
     * Get all program accounts with dataSize filter
     * Useful for filtering by account type
     */
    getProgramAccountsBySize(programId: PublicKey, dataSize: number): Promise<{
        pubkey: PublicKey;
        data: Buffer;
    }[]>;
    /**
     * Get account info with full metadata
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null>;
    /**
     * Check if account exists
     */
    accountExists(address: PublicKey): Promise<boolean>;
    /**
     * Get raw Connection for advanced usage
     */
    getConnection(): Connection;
    /**
     * Get current slot
     */
    getSlot(): Promise<number>;
    /**
     * Get block time for a slot
     */
    getBlockTime(slot: number): Promise<number | null>;
}
/**
 * Create a Solana client for devnet
 */
export declare function createDevnetClient(rpcUrl?: string): SolanaClient;
//# sourceMappingURL=client.d.ts.map