/**
 * Security-aware logger for 8004-solana SDK
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LoggerConfig {
    level?: LogLevel;
    handler?: (level: LogLevel, message: string, context?: string) => void;
    enabled?: boolean;
}
export declare function configureLogger(newConfig: Partial<LoggerConfig>): void;
export declare const logger: {
    debug: (message: string, context?: string) => void;
    info: (message: string, context?: string) => void;
    warn: (message: string, context?: string) => void;
    error: (message: string, error?: unknown) => void;
    operation: (op: string, id?: string) => void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map