import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  buildSeedBlockedJobRecords,
  buildStagedCheckJobs,
  canRunParityAfterSeedWrite,
  runCheckStage,
  runStagedChecks,
} from './e2e-indexers-matrix.mjs';

test('buildStagedCheckJobs preserves matrix artifacts/log paths', () => {
  const jobs = buildStagedCheckJobs({
    skipGraphql: false,
    indexerRestArtifact: '/tmp/jobs/indexer-rest.json',
    indexerGraphqlArtifact: '/tmp/jobs/indexer-graphql.json',
    substreamRestArtifact: '/tmp/jobs/substream-rest.json',
    substreamGraphqlArtifact: '/tmp/jobs/substream-graphql.json',
    logsDir: 'artifacts/e2e-indexers/run-1/logs',
  });

  assert.deepEqual(jobs.indexer.map((job) => job.id), ['indexer-rest', 'indexer-graphql']);
  assert.deepEqual(jobs.substream.map((job) => job.id), ['substream-rest', 'substream-graphql']);

  assert.equal(
    jobs.indexer[0].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/indexer-rest.log')
  );
  assert.equal(
    jobs.indexer[1].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/indexer-graphql.log')
  );
  assert.equal(
    jobs.substream[0].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/substream-rest.log')
  );
  assert.equal(
    jobs.substream[1].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/substream-graphql.log')
  );
});

test('buildStagedCheckJobs supports --skip-graphql mode', () => {
  const jobs = buildStagedCheckJobs({
    skipGraphql: true,
    indexerRestArtifact: '/tmp/jobs/indexer-rest.json',
    indexerGraphqlArtifact: '/tmp/jobs/indexer-graphql.json',
    substreamRestArtifact: '/tmp/jobs/substream-rest.json',
    substreamGraphqlArtifact: '/tmp/jobs/substream-graphql.json',
    logsDir: 'artifacts/e2e-indexers/run-1/logs',
  });

  assert.deepEqual(jobs.indexer.map((job) => job.id), ['indexer-rest']);
  assert.deepEqual(jobs.substream.map((job) => job.id), ['substream-rest']);
});

test('runCheckStage starts stage jobs together', async () => {
  const started = [];
  let release;
  const gate = new Promise((resolvePromise) => {
    release = resolvePromise;
  });

  const runPromise = runCheckStage({
    jobs: [
      {
        id: 'indexer-rest',
        label: 'Indexer REST Check',
        backend: 'indexer',
        transport: 'rest',
        artifactPath: '/tmp/jobs/indexer-rest.json',
        logPath: '/tmp/logs/indexer-rest.log',
      },
      {
        id: 'indexer-graphql',
        label: 'Indexer GraphQL Check',
        backend: 'indexer',
        transport: 'graphql',
        artifactPath: '/tmp/jobs/indexer-graphql.json',
        logPath: '/tmp/logs/indexer-graphql.log',
      },
    ],
    runId: 'matrix-test',
    seedAsset: 'seed-asset',
    seedArtifact: '/tmp/jobs/seed-write.json',
    timeoutMs: 1000,
    env: {},
    runJob: async (job) => {
      started.push(job.id);
      await gate;
      return { id: job.id };
    },
  });

  await Promise.resolve();
  assert.deepEqual(started, ['indexer-rest', 'indexer-graphql']);

  release();
  const records = await runPromise;
  assert.deepEqual(records.map((record) => record.id), ['indexer-rest', 'indexer-graphql']);
});

test('runStagedChecks keeps catch-up between indexer and substream stages', async () => {
  const events = [];

  const records = await runStagedChecks({
    indexerJobs: [{ id: 'indexer-rest' }, { id: 'indexer-graphql' }],
    substreamJobs: [{ id: 'substream-rest' }, { id: 'substream-graphql' }],
    runStage: async (jobs) => {
      const ids = jobs.map((job) => job.id).join(',');
      events.push(`stage-start:${ids}`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      events.push(`stage-end:${ids}`);
      return jobs.map((job) => ({ id: job.id }));
    },
    runCatchup: async () => {
      events.push('catchup');
      return { id: 'substream-catchup' };
    },
  });

  assert.deepEqual(records.map((record) => record.id), [
    'indexer-rest',
    'indexer-graphql',
    'substream-catchup',
    'substream-rest',
    'substream-graphql',
  ]);
  assert.deepEqual(events, [
    'stage-start:indexer-rest,indexer-graphql',
    'stage-end:indexer-rest,indexer-graphql',
    'catchup',
    'stage-start:substream-rest,substream-graphql',
    'stage-end:substream-rest,substream-graphql',
  ]);
});

test('canRunParityAfterSeedWrite blocks parity only for failed seed status', () => {
  assert.equal(canRunParityAfterSeedWrite('passed'), true);
  assert.equal(canRunParityAfterSeedWrite('partial'), true);
  assert.equal(canRunParityAfterSeedWrite('skipped'), true);
  assert.equal(canRunParityAfterSeedWrite(null), true);
  assert.equal(canRunParityAfterSeedWrite('failed'), false);
});

test('buildSeedBlockedJobRecords marks checks/catchup/compare as skipped after seed failure', () => {
  const stagedChecks = buildStagedCheckJobs({
    skipGraphql: false,
    indexerRestArtifact: '/tmp/jobs/indexer-rest.json',
    indexerGraphqlArtifact: '/tmp/jobs/indexer-graphql.json',
    substreamRestArtifact: '/tmp/jobs/substream-rest.json',
    substreamGraphqlArtifact: '/tmp/jobs/substream-graphql.json',
    logsDir: '/tmp/logs',
  });

  const records = buildSeedBlockedJobRecords({
    runId: 'matrix-test',
    seedStatus: 'failed',
    seedAsset: 'seed-asset',
    seedArtifact: '/tmp/jobs/seed-write.json',
    timeoutMs: 1000,
    jobsDir: '/tmp/jobs',
    stagedChecks,
    substreamCatchupArtifact: '/tmp/jobs/substream-catchup.json',
    comparisonJsonPath: '/tmp/comparison/report.json',
    comparisonMarkdownPath: '/tmp/comparison/report.md',
    logsDir: '/tmp/logs',
  });

  assert.deepEqual(records.map((record) => record.id), [
    'indexer-rest',
    'indexer-graphql',
    'substream-rest',
    'substream-graphql',
    'substream-catchup',
    'compare',
  ]);
  assert.ok(records.every((record) => record.status === 'skipped'));
  assert.ok(records.every((record) => record.note.includes('seed-write status=failed')));
});
