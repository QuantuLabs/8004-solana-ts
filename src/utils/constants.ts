/**
 * Shared constants for Agent0 SDK
 * v0.2.0 - Updated for consolidated program
 */

/**
 * IPFS gateway URLs for fallback retrieval
 */
export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
] as const;

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  IPFS_GATEWAY: 10000, // 10 seconds
  PINATA_UPLOAD: 80000, // 80 seconds
  TRANSACTION_WAIT: 30000, // 30 seconds
  ENDPOINT_CRAWLER_DEFAULT: 5000, // 5 seconds
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  FEEDBACK_EXPIRY_HOURS: 24,
  SEARCH_PAGE_SIZE: 50,
} as const;

/**
 * On-chain limits - v0.2.0 consolidated program
 */
export const LIMITS = {
  // Identity Module
  MAX_URI_LENGTH: 200,
  MAX_NFT_NAME_LENGTH: 32,
  MAX_NFT_SYMBOL_LENGTH: 10,
  MAX_METADATA_KEY_LENGTH: 32,
  MAX_METADATA_VALUE_LENGTH: 256,
  MAX_METADATA_ENTRIES_IN_BASE: 1,  // v0.2.0 reduced from 10
  MAX_METADATA_ENTRIES_IN_EXTENSION: 10,
  MAX_EXTENSIONS: 255,

  // Reputation Module
  MIN_FEEDBACK_SCORE: 0,
  MAX_FEEDBACK_SCORE: 100,
  MAX_TAG_LENGTH: 32,

  // Validation Module
  MAX_RESPONSE_VALUE: 100,

  // Common
  HASH_SIZE: 32, // SHA-256
} as const;

