import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { logger, configureLogger, type LogLevel } from '../../src/utils/logger.js';

describe('logger', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    configureLogger({ level: 'warn', enabled: true, handler: undefined });
  });

  describe('log levels', () => {
    it('should not log when level is below threshold', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should log when level meets threshold', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.error('error msg');
      expect(handler).toHaveBeenCalledWith('error', 'error msg', undefined);
    });

    it('should log all levels when set to debug', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe('enabled flag', () => {
    it('should not log when disabled', () => {
      const handler = jest.fn();
      configureLogger({ enabled: false, level: 'debug', handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.error('should not appear');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('sanitization', () => {
    it('should redact API keys', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.warn('Key: sk-1234567890abcdefghij');
      expect(handler).toHaveBeenCalled();
      const msg = (handler as jest.Mock).mock.calls[0][1] as string;
      expect(msg).toContain('[REDACTED]');
      expect(msg).not.toContain('sk-1234567890abcdefghij');
    });

    it('should redact JWTs', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
      logger.warn(`Token: ${jwt}`);
      const msg = (handler as jest.Mock).mock.calls[0][1] as string;
      expect(msg).toContain('[REDACTED]');
    });

    it('should redact GitHub tokens', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.warn('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
      const msg = (handler as jest.Mock).mock.calls[0][1] as string;
      expect(msg).toContain('[REDACTED]');
    });

    it('should redact byte arrays that look like private keys', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      const fakeKey = '[' + Array(64).fill('1').join(', ') + ']';
      logger.warn(fakeKey);
      const msg = (handler as jest.Mock).mock.calls[0][1] as string;
      expect(msg).toContain('[REDACTED]');
    });

    it('should truncate long messages', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.warn('x'.repeat(2000));
      const msg = (handler as jest.Mock).mock.calls[0][1] as string;
      expect(msg).toContain('...[truncated]');
      expect(msg.length).toBeLessThanOrEqual(1020);
    });
  });

  describe('error logging', () => {
    it('should sanitize Error objects', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.error('failed', new Error('secret: sk-12345678901234567890'));
      const context = (handler as jest.Mock).mock.calls[0][2] as string;
      expect(context).toContain('[REDACTED]');
    });

    it('should handle string errors', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.error('failed', 'string error');
      const context = (handler as jest.Mock).mock.calls[0][2] as string;
      expect(context).toBe('string error');
    });

    it('should handle object errors', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.error('failed', { code: 42 });
      const context = (handler as jest.Mock).mock.calls[0][2] as string;
      expect(context).toContain('42');
    });

    it('should handle non-serializable errors', () => {
      const handler = jest.fn();
      configureLogger({ level: 'error', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      logger.error('failed', circular);
      const context = (handler as jest.Mock).mock.calls[0][2] as string;
      expect(context).toBe('[Error: unable to serialize]');
    });
  });

  describe('operation logging', () => {
    it('should truncate IDs', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.operation('registerAgent', 'abcdefghijklmnop');
      const context = (handler as jest.Mock).mock.calls[0][2] as string;
      expect(context).toBe('abcdefgh...');
    });

    it('should handle missing ID', () => {
      const handler = jest.fn();
      configureLogger({ level: 'debug', enabled: true, handler: handler as (level: LogLevel, message: string, context?: string) => void });
      logger.operation('someOp');
      expect(handler).toHaveBeenCalledWith('debug', 'someOp', undefined);
    });
  });

  describe('default console output', () => {
    it('should use console.warn for warn level', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      configureLogger({ level: 'warn', enabled: true, handler: undefined });
      logger.warn('test warning');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should use console.error for error level', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      configureLogger({ level: 'error', enabled: true, handler: undefined });
      logger.error('test error');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should use console.log for debug/info', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      configureLogger({ level: 'debug', enabled: true, handler: undefined });
      logger.debug('test debug');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should include context in output', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      configureLogger({ level: 'warn', enabled: true, handler: undefined });
      logger.warn('msg', 'ctx');
      const call = spy.mock.calls[0][0] as string;
      expect(call).toContain('msg');
      expect(call).toContain('ctx');
      spy.mockRestore();
    });
  });
});
