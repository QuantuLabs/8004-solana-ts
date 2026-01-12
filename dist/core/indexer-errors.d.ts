/**
 * Indexer-specific errors
 * For handling Supabase REST API failures
 */
/**
 * Error codes for indexer operations
 */
export declare enum IndexerErrorCode {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    RATE_LIMITED = "RATE_LIMITED",
    TIMEOUT = "TIMEOUT",
    NOT_FOUND = "NOT_FOUND",
    INVALID_RESPONSE = "INVALID_RESPONSE",
    UNAUTHORIZED = "UNAUTHORIZED",
    SERVER_ERROR = "SERVER_ERROR"
}
/**
 * Base indexer error class
 */
export declare class IndexerError extends Error {
    readonly code: IndexerErrorCode;
    constructor(message: string, code: IndexerErrorCode);
}
/**
 * Thrown when indexer is unavailable (connection failed, service down)
 */
export declare class IndexerUnavailableError extends IndexerError {
    constructor(message?: string);
}
/**
 * Thrown when request times out
 */
export declare class IndexerTimeoutError extends IndexerError {
    constructor(message?: string);
}
/**
 * Thrown when rate limited by the API
 */
export declare class IndexerRateLimitError extends IndexerError {
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number);
}
/**
 * Thrown when API key is invalid or missing
 */
export declare class IndexerUnauthorizedError extends IndexerError {
    constructor(message?: string);
}
//# sourceMappingURL=indexer-errors.d.ts.map