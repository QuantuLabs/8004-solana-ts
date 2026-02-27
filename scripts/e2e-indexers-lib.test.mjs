import assert from 'node:assert/strict';
import test from 'node:test';
import { pollWithTimeout } from './e2e-indexers-lib.mjs';

test('pollWithTimeout resolves immediately when check succeeds', async () => {
  let attempts = 0;
  const result = await pollWithTimeout({
    label: 'immediate',
    maxAttempts: 4,
    intervalMs: 1,
    timeoutMs: 20,
    check: async () => {
      attempts += 1;
      return { ok: true };
    },
  });

  assert.equal(attempts, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.value.ok, true);
});

test('pollWithTimeout retries until check returns a value', async () => {
  let attempts = 0;
  const result = await pollWithTimeout({
    label: 'eventual',
    maxAttempts: 6,
    intervalMs: 1,
    timeoutMs: 30,
    check: async () => {
      attempts += 1;
      return attempts >= 3 ? { indexed: true } : null;
    },
  });

  assert.equal(attempts, 3);
  assert.equal(result.attempts, 3);
  assert.equal(result.value.indexed, true);
});

test('pollWithTimeout throws bounded timeout error and includes last error', async () => {
  let attempts = 0;

  await assert.rejects(
    pollWithTimeout({
      label: 'missing-feedback',
      maxAttempts: 5,
      intervalMs: 1,
      timeoutMs: 5,
      check: async () => {
        attempts += 1;
        if (attempts === 2) {
          throw new Error('indexer unavailable');
        }
        return null;
      },
    }),
    (error) => {
      assert.match(error.message, /missing-feedback timed out/);
      assert.match(error.message, /indexer unavailable/);
      return true;
    }
  );

  assert.ok(attempts >= 2);
  assert.ok(attempts <= 5);
});
