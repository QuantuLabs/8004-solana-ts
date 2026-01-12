/**
 * Indexer-specific errors
 * For handling Supabase REST API failures
 */
/**
 * Error codes for indexer operations
 */
export var IndexerErrorCode;
(function (IndexerErrorCode) {
    IndexerErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    IndexerErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    IndexerErrorCode["TIMEOUT"] = "TIMEOUT";
    IndexerErrorCode["NOT_FOUND"] = "NOT_FOUND";
    IndexerErrorCode["INVALID_RESPONSE"] = "INVALID_RESPONSE";
    IndexerErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    IndexerErrorCode["SERVER_ERROR"] = "SERVER_ERROR";
})(IndexerErrorCode || (IndexerErrorCode = {}));
/**
 * Base indexer error class
 */
export class IndexerError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = 'IndexerError';
        this.code = code;
    }
}
/**
 * Thrown when indexer is unavailable (connection failed, service down)
 */
export class IndexerUnavailableError extends IndexerError {
    constructor(message = 'Indexer service unavailable') {
        super(message, IndexerErrorCode.CONNECTION_FAILED);
        this.name = 'IndexerUnavailableError';
    }
}
/**
 * Thrown when request times out
 */
export class IndexerTimeoutError extends IndexerError {
    constructor(message = 'Indexer request timed out') {
        super(message, IndexerErrorCode.TIMEOUT);
        this.name = 'IndexerTimeoutError';
    }
}
/**
 * Thrown when rate limited by the API
 */
export class IndexerRateLimitError extends IndexerError {
    retryAfter;
    constructor(message = 'Rate limited', retryAfter) {
        super(message, IndexerErrorCode.RATE_LIMITED);
        this.name = 'IndexerRateLimitError';
        this.retryAfter = retryAfter;
    }
}
/**
 * Thrown when API key is invalid or missing
 */
export class IndexerUnauthorizedError extends IndexerError {
    constructor(message = 'Invalid or missing API key') {
        super(message, IndexerErrorCode.UNAUTHORIZED);
        this.name = 'IndexerUnauthorizedError';
    }
}
//# sourceMappingURL=indexer-errors.js.map