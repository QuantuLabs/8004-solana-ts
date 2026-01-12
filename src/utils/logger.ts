/**
 * Security-aware logger for 8004-solana SDK
 */

const MAX_ERROR_LENGTH = 1000;

const REDACT_PATTERNS: Array<RegExp | { pattern: RegExp; contextual: boolean }> = [
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

function sanitize(input: string): string {
  let result = input;

  for (const item of REDACT_PATTERNS) {
    if (item instanceof RegExp) {
      result = result.replace(item, '[REDACTED]');
    } else {
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

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitize(error.message);
  }
  if (typeof error === 'string') {
    return sanitize(error);
  }
  try {
    return sanitize(JSON.stringify(error));
  } catch {
    return '[Error: unable to serialize]';
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level?: LogLevel;
  handler?: (level: LogLevel, message: string, context?: string) => void;
  enabled?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let config: LoggerConfig = {
  level: 'warn',
  enabled: typeof process !== 'undefined' && process.env.NODE_ENV !== 'production',
};

export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}

function log(level: LogLevel, message: string, context?: string): void {
  if (!config.enabled) return;
  if (LOG_LEVELS[level] < LOG_LEVELS[config.level || 'warn']) return;

  const sanitizedMessage = sanitize(message);
  const sanitizedContext = context ? sanitize(context) : undefined;

  if (config.handler) {
    config.handler(level, sanitizedMessage, sanitizedContext);
  } else {
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
  debug: (message: string, context?: string) => log('debug', message, context),
  info: (message: string, context?: string) => log('info', message, context),
  warn: (message: string, context?: string) => log('warn', message, context),
  error: (message: string, error?: unknown) => {
    const errorContext = error ? sanitizeError(error) : undefined;
    log('error', message, errorContext);
  },
  operation: (op: string, id?: string) => {
    const safeId = id ? `${id.slice(0, 8)}...` : undefined;
    log('debug', op, safeId);
  },
};

export default logger;
