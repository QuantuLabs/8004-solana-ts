import { describe, it, expect } from '@jest/globals';
import {
  writeBigUInt64LE,
  writeUInt32LE,
  writeUInt16LE,
  readBigUInt64LE,
  readUInt32LE,
  serializeString,
} from '../../src/utils/buffer-utils.js';

describe('buffer-utils', () => {
  describe('writeBigUInt64LE', () => {
    it('should write zero', () => {
      const buf = writeBigUInt64LE(0n);
      expect(buf.length).toBe(8);
      expect(readBigUInt64LE(buf)).toBe(0n);
    });

    it('should write small values', () => {
      const buf = writeBigUInt64LE(42n);
      expect(readBigUInt64LE(buf)).toBe(42n);
    });

    it('should write max u64', () => {
      const maxU64 = 18446744073709551615n;
      const buf = writeBigUInt64LE(maxU64);
      expect(readBigUInt64LE(buf)).toBe(maxU64);
    });

    it('should write in little-endian', () => {
      const buf = writeBigUInt64LE(1n);
      expect(buf[0]).toBe(1);
      expect(buf[7]).toBe(0);
    });

    it('should always return 8 bytes', () => {
      expect(writeBigUInt64LE(0n).length).toBe(8);
      expect(writeBigUInt64LE(255n).length).toBe(8);
      expect(writeBigUInt64LE(1000000n).length).toBe(8);
    });
  });

  describe('writeUInt32LE', () => {
    it('should write zero', () => {
      const buf = writeUInt32LE(0);
      expect(buf.length).toBe(4);
      expect(readUInt32LE(buf)).toBe(0);
    });

    it('should write small values', () => {
      const buf = writeUInt32LE(256);
      expect(readUInt32LE(buf)).toBe(256);
    });

    it('should write max u32', () => {
      const buf = writeUInt32LE(4294967295);
      expect(readUInt32LE(buf)).toBe(4294967295);
    });

    it('should write in little-endian', () => {
      const buf = writeUInt32LE(1);
      expect(buf[0]).toBe(1);
      expect(buf[3]).toBe(0);
    });
  });

  describe('writeUInt16LE', () => {
    it('should write zero', () => {
      const buf = writeUInt16LE(0);
      expect(buf.length).toBe(2);
    });

    it('should write small values', () => {
      const buf = writeUInt16LE(256);
      expect(buf[0]).toBe(0);
      expect(buf[1]).toBe(1);
    });

    it('should write max u16', () => {
      const buf = writeUInt16LE(65535);
      expect(buf[0]).toBe(255);
      expect(buf[1]).toBe(255);
    });
  });

  describe('readBigUInt64LE', () => {
    it('should read with offset', () => {
      const buf = new Uint8Array(16);
      const inner = writeBigUInt64LE(12345n);
      buf.set(inner, 8);
      expect(readBigUInt64LE(buf, 8)).toBe(12345n);
    });

    it('should default offset to 0', () => {
      const buf = writeBigUInt64LE(999n);
      expect(readBigUInt64LE(buf)).toBe(999n);
    });
  });

  describe('readUInt32LE', () => {
    it('should read with offset', () => {
      const buf = new Uint8Array(8);
      const inner = writeUInt32LE(42);
      buf.set(inner, 4);
      expect(readUInt32LE(buf, 4)).toBe(42);
    });

    it('should default offset to 0', () => {
      const buf = writeUInt32LE(77);
      expect(readUInt32LE(buf)).toBe(77);
    });
  });

  describe('serializeString', () => {
    it('should serialize empty string', () => {
      const buf = serializeString('');
      expect(buf.length).toBe(4); // just the length prefix
      expect(buf.readUInt32LE(0)).toBe(0);
    });

    it('should serialize ASCII string', () => {
      const buf = serializeString('hello');
      expect(buf.readUInt32LE(0)).toBe(5);
      expect(buf.slice(4).toString('utf8')).toBe('hello');
    });

    it('should serialize UTF-8 multibyte string', () => {
      const buf = serializeString('héllo');
      const byteLen = Buffer.byteLength('héllo', 'utf8');
      expect(buf.readUInt32LE(0)).toBe(byteLen);
    });

    it('should throw for strings exceeding maxLength', () => {
      expect(() => serializeString('a'.repeat(1001))).toThrow('exceeds maximum length');
    });

    it('should respect custom maxLength', () => {
      expect(() => serializeString('abc', 2)).toThrow('exceeds maximum length');
      expect(() => serializeString('ab', 2)).not.toThrow();
    });

    it('should produce correct total buffer length', () => {
      const str = 'test';
      const buf = serializeString(str);
      expect(buf.length).toBe(4 + Buffer.byteLength(str, 'utf8'));
    });
  });
});
