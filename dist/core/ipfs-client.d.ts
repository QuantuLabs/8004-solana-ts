/**
 * IPFS client for decentralized storage with support for multiple providers:
 * - Local IPFS nodes (via ipfs-http-client)
 * - Pinata IPFS pinning service
 * - Filecoin Pin service
 */
import type { RegistrationFile } from '../models/interfaces.js';
export interface IPFSClientConfig {
    url?: string;
    filecoinPinEnabled?: boolean;
    filecoinPrivateKey?: string;
    pinataEnabled?: boolean;
    pinataJwt?: string;
}
/**
 * Client for IPFS operations supporting multiple providers
 */
export declare class IPFSClient {
    private provider;
    private config;
    private client?;
    constructor(config: IPFSClientConfig);
    /**
     * Initialize IPFS HTTP client (lazy, only when needed)
     */
    private _ensureClient;
    private _verifyPinataJwt;
    /**
     * Pin data to Pinata using v3 API
     */
    private _pinToPinata;
    /**
     * Pin data to Filecoin Pin
     * Note: This requires the Filecoin Pin API or CLI to be available
     * For now, we'll throw an error directing users to use the CLI
     */
    private _pinToFilecoin;
    /**
     * Pin data to local IPFS node
     */
    private _pinToLocalIpfs;
    /**
     * Add data to IPFS and return CID
     */
    add(data: string): Promise<string>;
    /**
     * Add file to IPFS and return CID
     * Note: This method works in Node.js environments. For browser, use add() with file content directly.
     */
    addFile(filepath: string): Promise<string>;
    /**
     * Get data from IPFS by CID
     */
    get(cid: string): Promise<string>;
    /**
     * Get JSON data from IPFS by CID
     */
    getJson<T = Record<string, unknown>>(cid: string): Promise<T>;
    /**
     * Pin a CID to local node
     */
    pin(cid: string): Promise<{
        pinned: string[];
    }>;
    /**
     * Unpin a CID from local node
     */
    unpin(cid: string): Promise<{
        unpinned: string[];
    }>;
    /**
     * Add JSON data to IPFS and return CID
     */
    addJson(data: Record<string, unknown>): Promise<string>;
    /**
     * Add registration file to IPFS and return CID
     */
    addRegistrationFile(registrationFile: RegistrationFile, chainId?: number, identityRegistryAddress?: string): Promise<string>;
    /**
     * Get registration file from IPFS by CID
     */
    getRegistrationFile(cid: string): Promise<RegistrationFile>;
    /**
     * Close IPFS client connection
     */
    close(): Promise<void>;
}
//# sourceMappingURL=ipfs-client.d.ts.map