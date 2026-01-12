/**
 * Security-aware logger for 8004-solana SDK
 */
const MAX_ERROR_LENGTH = 1000;
const REDACT_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/g,
    /sk-ant-[a-zA-Z0-9_-]+/g,
    /AIza[a-zA-Z0-9_-]+/g,
    /xox[baprs]-[a-zA-Z0-9-]+/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /gho_[a-zA-Z0-9]{36}/g,
    /github_pat_[a-zA-Z0-9_]{22,}/g,
    /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    {
        pattern: /(private[_-]?key|secret[_-]?key|secretkey|privatekey|mnemonic|seed)\s*[:=]\s*[["']?\s*([1-9A-HJ-NP-Za-km-z]{64,88})/gi,
        contextual: true,
    },
    /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/g,
];
function sanitize(input) {
    let result = input;
    for (const item of REDACT_PATTERNS) {
        if (item instanceof RegExp) {
            result = result.replace(item, '[REDACTED]');
        }
        else {
            result = result.replace(item.pattern, (match, context) => {
                return `${context}: [REDACTED]`;
            });
        }
    }
    if (result.length > MAX_ERROR_LENGTH) {
        result = result.slice(0, MAX_ERROR_LENGTH) + '...[truncated]';
    }
    return result;
}
function sanitizeError(error) {
    if (error instanceof Error) {
        return sanitize(error.message);
    }
    if (typeof error === 'string') {
        return sanitize(error);
    }
    try {
        return sanitize(JSON.stringify(error));
    }
    catch {
        return '[Error: unable to serialize]';
    }
}
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
let config = {
    level: 'warn',
    enabled: typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
};
export function configureLogger(newConfig) {
    config = { ...config, ...newConfig };
}
function log(level, message, context) {
    if (!config.enabled)
        return;
    if (LOG_LEVELS[level] < LOG_LEVELS[config.level || 'warn'])
        return;
    const sanitizedMessage = sanitize(message);
    const sanitizedContext = context ? sanitize(context) : undefined;
    if (config.handler) {
        config.handler(level, sanitizedMessage, sanitizedContext);
    }
    else {
        const prefix = `[8004-sdk] [${level.toUpperCase()}]`;
        const fullMessage = sanitizedContext
            ? `${prefix} ${sanitizedMessage} | ${sanitizedContext}`
            : `${prefix} ${sanitizedMessage}`;
        switch (level) {
            case 'debug':
            case 'info':
                console.log(fullMessage);
                break;
            case 'warn':
                console.warn(fullMessage);
                break;
            case 'error':
                console.error(fullMessage);
                break;
        }
    }
}
export const logger = {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, error) => {
        const errorContext = error ? sanitizeError(error) : undefined;
        log('error', message, errorContext);
    },
    operation: (op, id) => {
        const safeId = id ? `${id.slice(0, 8)}...` : undefined;
        log('debug', op, safeId);
    },
};
export default logger;
//# sourceMappingURL=logger.js.map