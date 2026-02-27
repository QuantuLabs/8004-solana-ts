/**
 * Solana RPC client wrapper
 * Provides lightweight interface for querying Solana accounts
 * No Anchor dependency - uses @solana/web3.js only
 */
import { Connection, } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
/** Default Solana devnet RPC URL */
export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
/** Default Solana testnet RPC URL */
export const SOLANA_TESTNET_RPC = 'https://api.testnet.solana.com';
/** Default Solana mainnet-beta RPC URL */
export const SOLANA_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
/** Default Solana localnet RPC URL */
export const SOLANA_LOCALNET_RPC = 'http://127.0.0.1:8899';
/** List of RPC providers that support advanced features like getProgramAccounts with memcmp */
export const RECOMMENDED_RPC_PROVIDERS = [
    'Helius - https://helius.dev',
    'Triton - https://triton.one',
    'QuickNode - https://quicknode.com',
    'Alchemy - https://alchemy.com',
];
function getDefaultRpcUrl(cluster) {
    switch (cluster) {
        case 'mainnet-beta':
            return SOLANA_MAINNET_RPC;
        case 'testnet':
            return SOLANA_TESTNET_RPC;
        case 'localnet':
            return SOLANA_LOCALNET_RPC;
        case 'devnet':
        default:
            return SOLANA_DEVNET_RPC;
    }
}
/**
 * Error thrown when an operation requires RPC features not available on public devnet
 */
export class UnsupportedRpcError extends Error {
    operation;
    constructor(operation) {
        super(`Operation "${operation}" is not supported by the default Solana devnet RPC.\n` +
            `This operation requires getProgramAccounts with memcmp filters.\n\n` +
            `Please initialize the SDK with a compatible RPC provider:\n` +
            RECOMMENDED_RPC_PROVIDERS.map(p => `  - ${p}`).join('\n') +
            `\n\nExample:\n` +
            `  const sdk = new SolanaSDK({ rpcUrl: 'https://your-rpc-provider.com' });`);
        this.name = 'UnsupportedRpcError';
        this.operation = operation;
    }
}
/**
 * Error thrown when an RPC operation fails due to network issues
 * Distinguishes network failures from "account not found" (which returns null)
 */
export class RpcNetworkError extends Error {
    operation;
    cause;
    constructor(operation, cause) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`RPC operation "${operation}" failed: ${causeMsg}`);
        this.name = 'RpcNetworkError';
        this.operation = operation;
        this.cause = cause;
    }
}
/**
 * Check if an error is a "not found" type error vs a network/server error
 * @internal
 */
function isAccountNotFoundError(error) {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('account not found') ||
            msg.includes('could not find') ||
            msg.includes('invalid account');
    }
    return false;
}
/**
 * Lightweight Solana client for 8004 read operations
 * Avoids Anchor dependency for smaller package size
 */
export class SolanaClient {
    connection;
    cluster;
    rpcUrl;
    /** True if using the default public Solana devnet RPC (limited features) */
    isDefaultDevnetRpc;
    constructor(config) {
        this.cluster = config.cluster || 'devnet';
        this.rpcUrl = config.rpcUrl || getDefaultRpcUrl(this.cluster);
        this.isDefaultDevnetRpc = this.cluster === 'devnet' && this.rpcUrl === SOLANA_DEVNET_RPC;
        this.connection = new Connection(this.rpcUrl, config.commitment || 'confirmed');
    }
    /**
     * Check if the current RPC supports advanced features
     * Returns false for default devnet RPC, true for custom RPC providers
     */
    supportsAdvancedQueries() {
        return !this.isDefaultDevnetRpc;
    }
    /**
     * Assert that advanced queries are supported, throw UnsupportedRpcError if not
     */
    requireAdvancedQueries(operation) {
        if (this.isDefaultDevnetRpc) {
            throw new UnsupportedRpcError(operation);
        }
    }
    /**
     * Get single account data
     * Returns null if account doesn't exist
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    async getAccount(address) {
        try {
            const accountInfo = await this.connection.getAccountInfo(address);
            return accountInfo?.data ?? null;
        }
        catch (error) {
            // Account genuinely not found - return null
            if (isAccountNotFoundError(error)) {
                return null;
            }
            // Network/server error - throw to allow retry strategies
            logger.error('RPC error fetching account', error);
            throw new RpcNetworkError('getAccount', error);
        }
    }
    /**
     * Get multiple accounts in a single RPC call
     * More efficient than individual getAccount calls
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    async getMultipleAccounts(addresses) {
        try {
            const accounts = await this.connection.getMultipleAccountsInfo(addresses);
            return accounts.map((acc) => acc?.data ?? null);
        }
        catch (error) {
            logger.error('RPC error fetching multiple accounts', error);
            throw new RpcNetworkError('getMultipleAccounts', error);
        }
    }
    /**
     * Get all program accounts with optional filters
     * Used for queries like "get all feedbacks for agent X"
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    async getProgramAccounts(programId, filters) {
        try {
            const accounts = await this.connection.getProgramAccounts(programId, {
                filters: filters ?? [],
            });
            return accounts.map((acc) => ({
                pubkey: acc.pubkey,
                data: acc.account.data,
            }));
        }
        catch (error) {
            logger.error('RPC error fetching program accounts', error);
            throw new RpcNetworkError('getProgramAccounts', error);
        }
    }
    /**
     * Get all program accounts with memcmp filter
     * More convenient for common pattern of filtering by offset/bytes
     */
    async getProgramAccountsWithMemcmp(programId, offset, bytes) {
        return this.getProgramAccounts(programId, [
            {
                memcmp: {
                    offset,
                    bytes,
                },
            },
        ]);
    }
    /**
     * Get all program accounts with dataSize filter
     * Useful for filtering by account type
     */
    async getProgramAccountsBySize(programId, dataSize) {
        return this.getProgramAccounts(programId, [
            {
                dataSize,
            },
        ]);
    }
    /**
     * Get account info with full metadata
     * @throws RpcNetworkError if RPC call fails due to network/server issues
     */
    async getAccountInfo(address) {
        try {
            return await this.connection.getAccountInfo(address);
        }
        catch (error) {
            if (isAccountNotFoundError(error)) {
                return null;
            }
            logger.error('RPC error fetching account info', error);
            throw new RpcNetworkError('getAccountInfo', error);
        }
    }
    /**
     * Check if account exists
     */
    async accountExists(address) {
        const accountInfo = await this.getAccountInfo(address);
        return accountInfo !== null;
    }
    /**
     * Get raw Connection for advanced usage
     */
    getConnection() {
        return this.connection;
    }
    /**
     * Get current slot
     */
    async getSlot() {
        return await this.connection.getSlot();
    }
    /**
     * Get block time for a slot
     */
    async getBlockTime(slot) {
        return await this.connection.getBlockTime(slot);
    }
}
/**
 * Create a Solana client for devnet
 */
export function createDevnetClient(rpcUrl) {
    return new SolanaClient({
        cluster: 'devnet',
        rpcUrl,
        commitment: 'confirmed',
    });
}
//# sourceMappingURL=client.js.map