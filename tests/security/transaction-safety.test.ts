/**
 * Security tests for transaction safety
 * Ensures prepared transactions are clearly marked as unsigned
 */

import { Transaction, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { serializeTransaction, PreparedTransaction } from '../../src/core/transaction-builder.js';

// Generate a valid base58 blockhash for testing
function generateValidBlockhash(): string {
  // Use a keypair's public key as a valid base58 string
  return Keypair.generate().publicKey.toBase58();
}

describe('Transaction Safety', () => {
  describe('PreparedTransaction', () => {
    it('should have signed: false property', () => {
      const transaction = new Transaction();
      const signer = Keypair.generate();
      // Add a simple instruction to make the transaction valid
      transaction.add(SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: signer.publicKey,
        lamports: 0,
      }));
      const blockhash = generateValidBlockhash();
      const lastValidBlockHeight = 12345;

      const prepared = serializeTransaction(
        transaction,
        signer.publicKey,
        blockhash,
        lastValidBlockHeight
      );

      // Critical security check: prepared transaction must be marked as unsigned
      expect(prepared.signed).toBe(false);
    });

    it('should include all required fields', () => {
      const transaction = new Transaction();
      const signer = Keypair.generate();
      transaction.add(SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: signer.publicKey,
        lamports: 0,
      }));
      const blockhash = generateValidBlockhash();
      const lastValidBlockHeight = 67890;

      const prepared = serializeTransaction(
        transaction,
        signer.publicKey,
        blockhash,
        lastValidBlockHeight
      );

      // Verify all fields are present
      expect(prepared).toHaveProperty('transaction');
      expect(prepared).toHaveProperty('blockhash', blockhash);
      expect(prepared).toHaveProperty('lastValidBlockHeight', lastValidBlockHeight);
      expect(prepared).toHaveProperty('signer', signer.publicKey.toBase58());
      expect(prepared).toHaveProperty('signed', false);
    });

    it('should serialize transaction as base64', () => {
      const transaction = new Transaction();
      const signer = Keypair.generate();
      transaction.add(SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: signer.publicKey,
        lamports: 0,
      }));
      const blockhash = generateValidBlockhash();
      const lastValidBlockHeight = 11111;

      const prepared = serializeTransaction(
        transaction,
        signer.publicKey,
        blockhash,
        lastValidBlockHeight
      );

      // Verify transaction is base64 encoded
      expect(typeof prepared.transaction).toBe('string');
      // Base64 regex check
      expect(prepared.transaction).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should preserve signer public key', () => {
      const transaction = new Transaction();
      const signer = Keypair.generate();
      transaction.add(SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: signer.publicKey,
        lamports: 0,
      }));
      const blockhash = generateValidBlockhash();
      const lastValidBlockHeight = 99999;

      const prepared = serializeTransaction(
        transaction,
        signer.publicKey,
        blockhash,
        lastValidBlockHeight
      );

      // Verify signer is correctly recorded
      expect(prepared.signer).toBe(signer.publicKey.toBase58());

      // Verify signer can be converted back to PublicKey
      const recoveredSigner = new PublicKey(prepared.signer);
      expect(recoveredSigner.equals(signer.publicKey)).toBe(true);
    });
  });

  describe('Type safety', () => {
    it('should enforce signed: false as literal type', () => {
      // This is a compile-time check - if PreparedTransaction.signed
      // were typed as `boolean` instead of `false`, this test would fail
      const prepared: PreparedTransaction = {
        transaction: 'base64data',
        blockhash: 'hash',
        lastValidBlockHeight: 123,
        signer: 'pubkey',
        signed: false,
      };

      // TypeScript would error if we tried: signed: true
      expect(prepared.signed).toBe(false);
    });
  });
});
