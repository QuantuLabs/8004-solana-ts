/**
 * Solana RPC client wrapper
 * Provides lightweight interface for querying Solana accounts
 * No Anchor dependency - uses @solana/web3.js only
 */
import { Connection, } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
/** Default Solana devnet RPC URL */
export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
/** List of RPC providers that support advanced features like getProgramAccounts with memcmp */
export const RECOMMENDED_RPC_PROVIDERS = [
    'Helius - https://helius.dev',
    'Triton - https://triton.one',
    'QuickNode - https://quicknode.com',
    'Alchemy - https://alchemy.com',
];
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
 * Lightweight Solana client for ERC-8004 read operations
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
        this.rpcUrl = config.rpcUrl || SOLANA_DEVNET_RPC;
        this.isDefaultDevnetRpc = !config.rpcUrl || config.rpcUrl === SOLANA_DEVNET_RPC;
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
     */
    async getAccount(address) {
        try {
            const accountInfo = await this.connection.getAccountInfo(address);
            return accountInfo?.data ?? null;
        }
        catch (error) {
            logger.error('Error fetching account', error);
            return null;
        }
    }
    /**
     * Get multiple accounts in a single RPC call
     * More efficient than individual getAccount calls
     */
    async getMultipleAccounts(addresses) {
        try {
            const accounts = await this.connection.getMultipleAccountsInfo(addresses);
            return accounts.map((acc) => acc?.data ?? null);
        }
        catch (error) {
            logger.error('Error fetching multiple accounts', error);
            return addresses.map(() => null);
        }
    }
    /**
     * Get all program accounts with optional filters
     * Used for queries like "get all feedbacks for agent X"
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
            logger.error('Error fetching program accounts', error);
            return [];
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
     */
    async getAccountInfo(address) {
        try {
            return await this.connection.getAccountInfo(address);
        }
        catch (error) {
            logger.error('Error fetching account info', error);
            return null;
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