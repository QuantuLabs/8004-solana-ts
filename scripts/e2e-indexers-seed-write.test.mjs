import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveIpfsClientConfig } from './e2e-indexers-seed-write.mjs';

const ENV_KEYS = [
  'E2E_INDEXERS_IPFS_API_URL',
  'IPFS_API_URL',
  'E2E_INDEXERS_PINATA_JWT',
  'PINATA_JWT',
];

async function withTempEnv(overrides, fn) {
  const previous = {};
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) continue;
    process.env[key] = value;
  }

  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function withTempCwd(fn) {
  const prevCwd = process.cwd();
  const tempDir = mkdtempSync(join(tmpdir(), 'e2e-indexers-seed-write-'));
  process.chdir(tempDir);
  try {
    await fn();
  } finally {
    process.chdir(prevCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('resolveIpfsClientConfig prefers --ipfs-api-url over env and pinata', async () => {
  await withTempEnv(
    {
      E2E_INDEXERS_IPFS_API_URL: 'http://127.0.0.1:5001',
      PINATA_JWT: 'pinata-fallback',
    },
    async () => {
      const result = resolveIpfsClientConfig({ 'ipfs-api-url': 'http://127.0.0.1:5999' });
      assert.equal(result.provider, 'local');
      assert.equal(result.apiUrl, 'http://127.0.0.1:5999');
      assert.equal(result.source, '--ipfs-api-url');
      assert.deepEqual(result.clientConfig, { url: 'http://127.0.0.1:5999' });
    }
  );
});

test('resolveIpfsClientConfig uses E2E_INDEXERS_IPFS_API_URL before pinata', async () => {
  await withTempEnv(
    {
      E2E_INDEXERS_IPFS_API_URL: 'http://127.0.0.1:5001',
      PINATA_JWT: 'pinata-fallback',
    },
    async () => {
      const result = resolveIpfsClientConfig({});
      assert.equal(result.provider, 'local');
      assert.equal(result.apiUrl, 'http://127.0.0.1:5001');
      assert.equal(result.source, 'E2E_INDEXERS_IPFS_API_URL');
    }
  );
});

test('resolveIpfsClientConfig falls back to pinata when no local url exists', async () => {
  await withTempEnv(
    {
      E2E_INDEXERS_PINATA_JWT: 'pinata-jwt-value',
    },
    async () => {
      const result = resolveIpfsClientConfig({});
      assert.equal(result.provider, 'pinata');
      assert.equal(result.apiUrl, null);
      assert.equal(result.source, 'env_or_arg');
      assert.deepEqual(result.clientConfig, {
        pinataEnabled: true,
        pinataJwt: 'pinata-jwt-value',
      });
    }
  );
});

test('resolveIpfsClientConfig returns empty config when no provider is configured', async () => {
  await withTempEnv({}, async () => {
    await withTempCwd(async () => {
      const result = resolveIpfsClientConfig({ 'pinata-jwt-file': '.missing-pinata.jwt' });
      assert.equal(result.provider, null);
      assert.equal(result.source, null);
      assert.equal(result.apiUrl, null);
      assert.equal(result.clientConfig, null);
    });
  });
});
