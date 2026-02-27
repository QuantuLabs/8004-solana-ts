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
    classicRestArtifact: '/tmp/jobs/classic-rest.json',
    classicGraphqlArtifact: '/tmp/jobs/classic-graphql.json',
    substreamRestArtifact: '/tmp/jobs/substream-rest.json',
    substreamGraphqlArtifact: '/tmp/jobs/substream-graphql.json',
    logsDir: 'artifacts/e2e-indexers/run-1/logs',
  });

  assert.deepEqual(jobs.classic.map((job) => job.id), ['classic-rest', 'classic-graphql']);
  assert.deepEqual(jobs.substream.map((job) => job.id), ['substream-rest', 'substream-graphql']);

  assert.equal(
    jobs.classic[0].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/classic-rest.log')
  );
  assert.equal(
    jobs.classic[1].logPath,
    resolve(process.cwd(), 'artifacts/e2e-indexers/run-1/logs/classic-graphql.log')
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
    classicRestArtifact: '/tmp/jobs/classic-rest.json',
    classicGraphqlArtifact: '/tmp/jobs/classic-graphql.json',
    substreamRestArtifact: '/tmp/jobs/substream-rest.json',
    substreamGraphqlArtifact: '/tmp/jobs/substream-graphql.json',
    logsDir: 'artifacts/e2e-indexers/run-1/logs',
  });

  assert.deepEqual(jobs.classic.map((job) => job.id), ['classic-rest']);
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
        id: 'classic-rest',
        label: 'Classic REST Check',
        backend: 'classic',
        transport: 'rest',
        artifactPath: '/tmp/jobs/classic-rest.json',
        logPath: '/tmp/logs/classic-rest.log',
      },
      {
        id: 'classic-graphql',
        label: 'Classic GraphQL Check',
        backend: 'classic',
        transport: 'graphql',
        artifactPath: '/tmp/jobs/classic-graphql.json',
        logPath: '/tmp/logs/classic-graphql.log',
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
  assert.deepEqual(started, ['classic-rest', 'classic-graphql']);

  release();
  const records = await runPromise;
  assert.deepEqual(records.map((record) => record.id), ['classic-rest', 'classic-graphql']);
});

test('runStagedChecks keeps catch-up between classic and substream stages', async () => {
  const events = [];

  const records = await runStagedChecks({
    classicJobs: [{ id: 'classic-rest' }, { id: 'classic-graphql' }],
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
    'classic-rest',
    'classic-graphql',
    'substream-catchup',
    'substream-rest',
    'substream-graphql',
  ]);
  assert.deepEqual(events, [
    'stage-start:classic-rest,classic-graphql',
    'stage-end:classic-rest,classic-graphql',
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
    classicRestArtifact: '/tmp/jobs/classic-rest.json',
    classicGraphqlArtifact: '/tmp/jobs/classic-graphql.json',
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
    'classic-rest',
    'classic-graphql',
    'substream-rest',
    'substream-graphql',
    'substream-catchup',
    'compare',
  ]);
  assert.ok(records.every((record) => record.status === 'skipped'));
  assert.ok(records.every((record) => record.note.includes('seed-write status=failed')));
});
