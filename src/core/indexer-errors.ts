/**
 * Indexer-specific errors
 * For handling Supabase REST API failures
 */

/**
 * Error codes for indexer operations
 */
export enum IndexerErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Base indexer error class
 */
export class IndexerError extends Error {
  public readonly code: IndexerErrorCode;

  constructor(message: string, code: IndexerErrorCode) {
    super(message);
    this.name = 'IndexerError';
    this.code = code;
  }
}

/**
 * Thrown when indexer is unavailable (connection failed, service down)
 */
export class IndexerUnavailableError extends IndexerError {
  constructor(message: string = 'Indexer service unavailable') {
    super(message, IndexerErrorCode.CONNECTION_FAILED);
    this.name = 'IndexerUnavailableError';
  }
}

/**
 * Thrown when request times out
 */
export class IndexerTimeoutError extends IndexerError {
  constructor(message: string = 'Indexer request timed out') {
    super(message, IndexerErrorCode.TIMEOUT);
    this.name = 'IndexerTimeoutError';
  }
}

/**
 * Thrown when rate limited by the API
 */
export class IndexerRateLimitError extends IndexerError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limited', retryAfter?: number) {
    super(message, IndexerErrorCode.RATE_LIMITED);
    this.name = 'IndexerRateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when API key is invalid or missing
 */
export class IndexerUnauthorizedError extends IndexerError {
  constructor(message: string = 'Invalid or missing API key') {
    super(message, IndexerErrorCode.UNAUTHORIZED);
    this.name = 'IndexerUnauthorizedError';
  }
}
