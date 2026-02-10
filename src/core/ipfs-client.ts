/**
 * IPFS client for decentralized storage with support for multiple providers:
 * - Local IPFS nodes (via ipfs-http-client)
 * - Pinata IPFS pinning service
 * - Filecoin Pin service
 */

import type { IPFSHTTPClient } from 'ipfs-http-client';
import type { RegistrationFile } from '../models/interfaces.js';
import { IPFS_GATEWAYS, TIMEOUTS, MAX_SIZES } from '../utils/constants.js';
import { buildRegistrationFileJson } from '../utils/registration-file-builder.js';
import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto-utils.js';
import bs58 from 'bs58';

/**
 * Security: IPFS CID validation pattern
 * CIDv0: Base58btc, 46 chars starting with Qm
 * CIDv1: Base32 lower, starts with 'b'
 */
const IPFS_CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;

export interface IPFSClientConfig {
  url?: string; // IPFS node URL (e.g., "http://localhost:5001")
  filecoinPinEnabled?: boolean;
  filecoinPrivateKey?: string;
  pinataEnabled?: boolean;
  pinataJwt?: string;
}

/**
 * Client for IPFS operations supporting multiple providers
 */
export class IPFSClient {
  private provider: 'pinata' | 'filecoinPin' | 'node';
  private config: IPFSClientConfig;
  private client?: IPFSHTTPClient;

  constructor(config: IPFSClientConfig) {
    this.config = config;

    // Determine provider
    if (config.pinataEnabled) {
      this.provider = 'pinata';
      this._verifyPinataJwt();
    } else if (config.filecoinPinEnabled) {
      this.provider = 'filecoinPin';
      // Note: Filecoin Pin in TypeScript requires external CLI or API
      // We'll use HTTP API if available, otherwise throw error
    } else if (config.url) {
      this.provider = 'node';
      // Lazy initialization - client will be created on first use
    } else {
      throw new Error('No IPFS provider configured. Specify url, pinataEnabled, or filecoinPinEnabled.');
    }
  }

  /**
   * Initialize IPFS HTTP client (lazy, only when needed)
   */
  private async _ensureClient(): Promise<void> {
    if (this.provider === 'node' && !this.client && this.config.url) {
      const { create } = await import('ipfs-http-client');
      this.client = create({ url: this.config.url });
    }
  }

  private _verifyPinataJwt(): void {
    if (!this.config.pinataJwt) {
      throw new Error('pinataJwt is required when pinataEnabled=true');
    }
  }

  /**
   * Pin data to Pinata using v3 API
   */
  private async _pinToPinata(data: string): Promise<string> {
    const url = 'https://uploads.pinata.cloud/v3/files';
    const headers = {
      Authorization: `Bearer ${this.config.pinataJwt}`,
    };

    // Create a Blob from the data
    const blob = new Blob([data], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, 'registration.json');
    formData.append('network', 'public');

    try {
      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.PINATA_UPLOAD);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to pin to Pinata: HTTP ${response.status} - ${errorText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await response.json()) as Record<string, any>;

      // v3 API returns CID in data.cid
      const cid = result?.data?.cid || result?.cid || result?.IpfsHash;
      if (!cid) {
        throw new Error(`No CID returned from Pinata. Response: ${JSON.stringify(result)}`);
      }

      // Verify CID is accessible on Pinata gateway (with short timeout since we just uploaded)
      // This catches cases where Pinata returns a CID but the upload actually failed
      // Note: We treat HTTP 429 (rate limit) and timeouts as non-fatal since content may propagate with delay
      // Verify CID is accessible on Pinata gateway (non-blocking)
      try {
        const verifyUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
        const verifyResponse = await fetch(verifyUrl, {
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        if (!verifyResponse.ok) {
          // HTTP 429 (rate limit) is not a failure - gateway is just rate limiting
          if (verifyResponse.status === 429) {
            logger.warn('Pinata gateway rate-limited, verification skipped');
          } else {
            // Other HTTP errors might indicate a real problem
            throw new Error(
              `Pinata upload verification failed (HTTP ${verifyResponse.status})`
            );
          }
        }
      } catch (verifyError) {
        // If verification fails, check if it's a timeout or rate limit (non-fatal)
        if (verifyError instanceof Error) {
          // Timeout or network errors are non-fatal - content may propagate with delay
          if (verifyError.message.includes('timeout') || verifyError.message.includes('aborted')) {
            logger.warn('Pinata verification timed out, content may propagate with delay');
          } else if (verifyError.message.includes('429')) {
            logger.warn('Pinata gateway rate-limited, verification skipped');
          } else {
            // Security: Don't log full error details, just type
            logger.warn('Pinata verification failed, content may propagate with delay');
          }
        }
      }

      return cid;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Pinata upload timed out after ${TIMEOUTS.PINATA_UPLOAD / 1000} seconds`);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to pin to Pinata: ${errorMessage}`);
    }
  }

  /**
   * Pin data to Filecoin Pin
   * Note: This requires the Filecoin Pin API or CLI to be available
   * For now, we'll throw an error directing users to use the CLI
   */
  private async _pinToFilecoin(_data: string): Promise<string> {
    // Filecoin Pin typically requires CLI or API access
    // This is a placeholder - in production, you'd call the Filecoin Pin API
    throw new Error(
      'Filecoin Pin via TypeScript SDK not yet fully implemented. ' +
        'Please use the filecoin-pin CLI or implement the Filecoin Pin API integration.'
    );
  }

  /**
   * Pin data to local IPFS node
   */
  private async _pinToLocalIpfs(data: string): Promise<string> {
    await this._ensureClient();
    if (!this.client) {
      throw new Error('No IPFS client available');
    }

    const result = await this.client.add(data);
    return result.cid.toString();
  }

  /**
   * Add data to IPFS and return CID
   */
  async add(data: string): Promise<string> {
    if (this.provider === 'pinata') {
      return await this._pinToPinata(data);
    } else if (this.provider === 'filecoinPin') {
      return await this._pinToFilecoin(data);
    } else {
      return await this._pinToLocalIpfs(data);
    }
  }

  /**
   * Add file to IPFS and return CID
   * Note: This method works in Node.js environments. For browser, use add() with file content directly.
   */
  async addFile(filepath: string): Promise<string> {
    // Check if we're in Node.js environment
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error(
        'addFile() is only available in Node.js environments. ' +
          'For browser environments, use add() with file content directly.'
      );
    }

    const fs = await import('fs');
    const data = fs.readFileSync(filepath, 'utf-8');

    if (this.provider === 'pinata') {
      return this._pinToPinata(data);
    } else if (this.provider === 'filecoinPin') {
      return this._pinToFilecoin(filepath);
    } else {
      await this._ensureClient();
      if (!this.client) {
        throw new Error('No IPFS client available');
      }
      // For local IPFS, add file directly
      const fileContent = fs.readFileSync(filepath);
      const result = await this.client.add(fileContent);
      return result.cid.toString();
    }
  }

  /**
   * Validate CID format
   * Security: Prevents path injection and validates CID structure
   */
  private validateCid(cid: string): void {
    if (!IPFS_CID_PATTERN.test(cid)) {
      throw new Error(`Security: Invalid IPFS CID format: ${cid.slice(0, 20)}...`);
    }
  }

  /**
   * Verify content hash matches CIDv0 (Qm... = SHA256 multihash)
   * Security: Ensures content integrity from potentially malicious gateways
   * Note: CIDv1 verification requires multiformats library, skipped for now
   * Browser-compatible (async for WebCrypto support)
   */
  private async verifyCidV0(cid: string, content: Uint8Array): Promise<boolean> {
    if (!cid.startsWith('Qm')) {
      // CIDv1 - verification not implemented; fail-closed to prevent tampered content
      logger.warn('CIDv1 hash verification not implemented, rejecting unverifiable content');
      return false;
    }

    // CIDv0: Qm... is base58btc encoded multihash (0x12 0x20 + SHA256)
    // We verify the SHA256 hash matches
    const hash = await sha256(content);

    // Decode base58 CID to get the expected hash
    // CIDv0 format: 0x12 (sha256) + 0x20 (32 bytes) + hash
    try {
      const decoded = bs58.decode(cid);
      // First 2 bytes are multihash header (0x12, 0x20), rest is the hash
      if (decoded.length !== 34) {
        logger.warn('CIDv0 unexpected decoded length, rejecting');
        return false;
      }
      const expectedHash = decoded.slice(2);
      const matches = Buffer.compare(Buffer.from(hash), Buffer.from(expectedHash)) === 0;
      if (!matches) {
        logger.error('Security: IPFS content hash mismatch - possible tampering');
      }
      return matches;
    } catch {
      logger.warn('Failed to decode CID for verification, rejecting');
      return false;
    }
  }

  /**
   * Get data from IPFS by CID
   * Security:
   * - Limits response size to prevent OOM attacks
   * - Blocks redirects to prevent SSRF
   * - Aborts concurrent requests when one succeeds
   * - Verifies content hash for CIDv0
   *
   * NOTE: DNS rebinding attacks are NOT fully mitigated here.
   * For high-security deployments, resolve DNS manually and verify IP
   * before fetching, or use a dedicated IPFS node.
   */
  async get(cid: string): Promise<string> {
    // Extract CID from IPFS URL if needed
    if (cid.startsWith('ipfs://')) {
      cid = cid.slice(7); // Remove "ipfs://" prefix
    }
    // Remove any path component after CID
    const cidOnly = cid.split('/')[0];

    // Security: Validate CID format
    this.validateCid(cidOnly);

    const maxSize = MAX_SIZES.IPFS_RESPONSE;

    // For Pinata and Filecoin Pin, use IPFS gateways
    if (this.provider === 'pinata' || this.provider === 'filecoinPin') {
      const gateways = IPFS_GATEWAYS.map(gateway => `${gateway}${encodeURIComponent(cidOnly)}`);

      // Global controller: cancel all remaining requests when one succeeds
      const globalAbortController = new AbortController();

      // Per-gateway fetch with individual timeout, size limit, and no redirects
      const fetchWithLimit = async (gateway: string): Promise<Uint8Array> => {
        const perGatewayController = new AbortController();

        // Abort this gateway on its own timeout
        const timeoutId = setTimeout(() => perGatewayController.abort(), TIMEOUTS.IPFS_GATEWAY);

        // Also abort if the global controller fires (first-success cancellation)
        const onGlobalAbort = () => perGatewayController.abort();
        globalAbortController.signal.addEventListener('abort', onGlobalAbort);

        try {
          const response = await fetch(gateway, {
            signal: perGatewayController.signal,
            // Security: Block redirects to prevent SSRF via redirect to internal IPs
            redirect: 'error',
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          // Check Content-Length header if available
          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength, 10) > maxSize) {
            throw new Error(`Content too large: ${contentLength} bytes > ${maxSize} max`);
          }

          // Stream response with size limit
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          const chunks: Uint8Array[] = [];
          let totalSize = 0;

          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              totalSize += value.length;
              if (totalSize > maxSize) {
                throw new Error(`Response exceeded max size: ${totalSize} > ${maxSize} bytes`);
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }

          // Concatenate chunks
          const result = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }

          return result;
        } finally {
          clearTimeout(timeoutId);
          globalAbortController.signal.removeEventListener('abort', onGlobalAbort);
        }
      };

      // Race all gateways, abort on first success
      let result: Uint8Array | null = null;
      let lastError: Error | null = null;

      // Sequential with hedging: start next gateway after delay if no response
      const HEDGE_DELAY = 2000;
      const MAX_CONCURRENT = 3;
      const inFlight: Promise<void>[] = [];

      for (let i = 0; i < gateways.length && !result; i++) {
        // Cancel oldest in-flight request if at capacity
        if (inFlight.length >= MAX_CONCURRENT) {
          await Promise.race(inFlight);
        }

        const gateway = gateways[i];
        try {
          const fetchPromise = fetchWithLimit(gateway);
          const tracked = fetchPromise
            .then((data) => { if (!result) { result = data; globalAbortController.abort(); } })
            .catch((err) => { lastError = err instanceof Error ? err : new Error(String(err)); })
            .finally(() => { const idx = inFlight.indexOf(tracked); if (idx >= 0) inFlight.splice(idx, 1); });
          inFlight.push(tracked);

          if (i < gateways.length - 1 && !result) {
            // Wait for hedge delay before launching next gateway
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, HEDGE_DELAY);
              // Resolve early if a result arrives
              const check = setInterval(() => {
                if (result) { clearTimeout(timer); clearInterval(check); resolve(); }
              }, 50);
              tracked.finally(() => { clearInterval(check); });
            });
          } else {
            // Last gateway - wait for all in-flight to settle
            await Promise.allSettled(inFlight);
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.debug(`Gateway failed: ${gateway.slice(0, 30)}...`);
        }
      }

      // Wait for remaining in-flight to settle
      if (inFlight.length > 0) {
        await Promise.allSettled(inFlight);
      }

      globalAbortController.abort();

      if (!result) {
        throw lastError || new Error('Failed to retrieve data from all IPFS gateways');
      }

      // Security: Verify content hash matches CID (CIDv0 only for now)
      const hashValid = await this.verifyCidV0(cidOnly, result);
      if (!hashValid) {
        throw new Error('Security: IPFS content hash verification failed');
      }

      return new TextDecoder().decode(result);
    } else {
      await this._ensureClient();
      if (!this.client) {
        throw new Error('No IPFS client available');
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      for await (const chunk of this.client.cat(cidOnly)) {
        totalSize += chunk.length;
        // Security: Enforce size limit for local IPFS node too
        if (totalSize > maxSize) {
          throw new Error(`IPFS content exceeded max size: ${totalSize} > ${maxSize} bytes`);
        }
        chunks.push(chunk);
      }

      // Concatenate chunks and convert to string
      const result = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      // Security: Local IPFS node already verifies hashes, but we verify anyway
      const hashValid = await this.verifyCidV0(cidOnly, result);
      if (!hashValid) {
        throw new Error('Security: IPFS content hash verification failed');
      }

      return new TextDecoder().decode(result);
    }
  }

  /**
   * Get JSON data from IPFS by CID
   */
  async getJson<T = Record<string, unknown>>(cid: string): Promise<T> {
    const data = await this.get(cid);
    return JSON.parse(data) as T;
  }

  /**
   * Pin a CID to local node
   */
  async pin(cid: string): Promise<{ pinned: string[] }> {
    if (this.provider === 'filecoinPin') {
      // Filecoin Pin automatically pins data, so this is a no-op
      return { pinned: [cid] };
    } else {
      await this._ensureClient();
      if (!this.client) {
        throw new Error('No IPFS client available');
      }
      await this.client.pin.add(cid);
      return { pinned: [cid] };
    }
  }

  /**
   * Unpin a CID from local node
   */
  async unpin(cid: string): Promise<{ unpinned: string[] }> {
    if (this.provider === 'filecoinPin') {
      // Filecoin Pin doesn't support unpinning in the same way
      return { unpinned: [cid] };
    } else {
      await this._ensureClient();
      if (!this.client) {
        throw new Error('No IPFS client available');
      }
      await this.client.pin.rm(cid);
      return { unpinned: [cid] };
    }
  }

  /**
   * Add JSON data to IPFS and return CID
   */
  async addJson(data: Record<string, unknown>): Promise<string> {
    const jsonStr = JSON.stringify(data, null, 2);
    return this.add(jsonStr);
  }

  /**
   * Add registration file to IPFS and return CID
   */
  async addRegistrationFile(
    registrationFile: RegistrationFile,
    chainId?: number,
    identityRegistryAddress?: string
  ): Promise<string> {
    const data = buildRegistrationFileJson(registrationFile, { chainId, identityRegistryAddress });
    return this.addJson(data);
  }

  /**
   * Get registration file from IPFS by CID
   */
  async getRegistrationFile(cid: string): Promise<RegistrationFile> {
    const data = await this.getJson<RegistrationFile>(cid);
    return data;
  }

  /**
   * Close IPFS client connection
   */
  async close(): Promise<void> {
    if (this.client) {
      // IPFS HTTP client doesn't have a close method in the same way
      // But we can clear the reference
      this.client = undefined;
    }
  }
}

