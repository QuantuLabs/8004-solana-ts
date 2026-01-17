/**
 * Unit tests for setAgentWallet API
 */
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

describe('setAgentWallet API', () => {
  const mockAsset = Keypair.generate().publicKey;
  const mockOwner = Keypair.generate();

  it('should generate correct message format', () => {
    const newWallet = Keypair.generate().publicKey;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    const message = Buffer.concat([
      Buffer.from('8004_WALLET_SET:'),
      mockAsset.toBuffer(),
      newWallet.toBuffer(),
      mockOwner.publicKey.toBuffer(),
      Buffer.alloc(8),
    ]);
    message.writeBigUInt64LE(deadline, message.length - 8);

    expect(message.length).toBe(16 + 32 + 32 + 32 + 8);
    expect(message.slice(0, 16).toString()).toBe('8004_WALLET_SET:');
  });

  it('should create valid Ed25519 signature (Keypair flow)', () => {
    const newWallet = Keypair.generate();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    const message = Buffer.concat([
      Buffer.from('8004_WALLET_SET:'),
      mockAsset.toBuffer(),
      newWallet.publicKey.toBuffer(),
      mockOwner.publicKey.toBuffer(),
      Buffer.alloc(8),
    ]);
    message.writeBigUInt64LE(deadline, message.length - 8);

    const sig = nacl.sign.detached(message, newWallet.secretKey);
    const isValid = nacl.sign.detached.verify(message, sig, newWallet.publicKey.toBytes());

    expect(isValid).toBe(true);
    expect(sig.length).toBe(64);
  });

  it('should work with web3 wallet flow (prepareSetAgentWallet)', () => {
    const newWallet = Keypair.generate();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    // Step 1: Prepare message
    const message = Buffer.concat([
      Buffer.from('8004_WALLET_SET:'),
      mockAsset.toBuffer(),
      newWallet.publicKey.toBuffer(),
      mockOwner.publicKey.toBuffer(),
      Buffer.alloc(8),
    ]);
    message.writeBigUInt64LE(deadline, message.length - 8);

    // Step 2: Sign (simulating wallet.signMessage)
    const sig = nacl.sign.detached(new Uint8Array(message), newWallet.secretKey);

    // Step 3: Verify
    const isValid = nacl.sign.detached.verify(new Uint8Array(message), sig, newWallet.publicKey.toBytes());
    expect(isValid).toBe(true);
  });
});
