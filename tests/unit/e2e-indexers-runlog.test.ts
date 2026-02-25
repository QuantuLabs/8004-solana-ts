import { describe, expect, it } from '@jest/globals';
import {
  E2E_INDEXERS_RUNLOG_TEMPLATE,
  buildIndexerComparisonReport,
  ensureRunlogTemplate,
  injectRunIntoMarkdown,
  renderIndexerComparisonMarkdown,
  type MatrixRunRecord,
} from '../../src/utils/e2e-indexers-runlog.js';

describe('e2e-indexers-runlog utilities', () => {
  it('should provide template with runs/jobs/diffs sections', () => {
    const content = ensureRunlogTemplate('');

    expect(content).toContain('## Runs');
    expect(content).toContain('## Jobs');
    expect(content).toContain('## Diffs');
    expect(content).toContain('<!-- RUNS:START -->');
    expect(content).toContain('<!-- JOBS:START -->');
    expect(content).toContain('<!-- DIFFS:START -->');
    expect(E2E_INDEXERS_RUNLOG_TEMPLATE.length).toBeGreaterThan(0);
  });

  it('should inject run entries into all sections', () => {
    const run: MatrixRunRecord = {
      runId: 'run-123',
      status: 'partial',
      startedAt: '2026-02-25T18:00:00.000Z',
      endedAt: '2026-02-25T18:01:00.000Z',
      durationMs: 60000,
      jobs: [
        {
          id: 'classic-rest',
          label: 'Classic REST',
          status: 'passed',
          startedAt: '2026-02-25T18:00:00.000Z',
          endedAt: '2026-02-25T18:00:20.000Z',
          durationMs: 20000,
          command: 'bun run e2e:indexers:check:classic:rest',
          artifactPath: 'artifacts/run-123/classic-rest.json',
          logPath: 'artifacts/run-123/classic-rest.log',
        },
      ],
      comparisonMarkdownPath: 'artifacts/run-123/comparison.md',
      comparisonJsonPath: 'artifacts/run-123/comparison.json',
    };

    const next = injectRunIntoMarkdown(ensureRunlogTemplate(''), run, 2);

    expect(next).toContain('run-123');
    expect(next).toContain('Classic REST');
    expect(next).toContain('mismatches: **2**');
    expect(next).toContain('artifacts/run-123/comparison.md');
  });

  it('should build mismatch counts and markdown report', () => {
    const report = buildIndexerComparisonReport({
      runId: 'run-456',
      classicRest: {
        backend: 'classic',
        transport: 'rest',
        status: 'passed',
        baseUrl: 'https://classic/rest/v1',
        available: true,
        seedAsset: 'asset-1',
        seedAssetFound: true,
        leaderboardAssets: ['asset-1'],
        globalStats: {
          total_agents: 10,
          total_feedbacks: 20,
          total_collections: 2,
        },
        errors: [],
        generatedAt: '2026-02-25T18:00:00.000Z',
      },
      classicGraphql: null,
      substreamRest: {
        backend: 'substream',
        transport: 'rest',
        status: 'passed',
        baseUrl: 'https://substream/rest/v1',
        available: true,
        seedAsset: 'asset-1',
        seedAssetFound: false,
        leaderboardAssets: ['asset-2'],
        globalStats: {
          total_agents: 10,
          total_feedbacks: 21,
          total_collections: 2,
        },
        errors: [],
        generatedAt: '2026-02-25T18:00:00.000Z',
      },
      substreamGraphql: null,
    });

    expect(report.transports).toHaveLength(2);
    expect(report.transports[0].transport).toBe('rest');
    expect(report.transports[0].mismatchCount).toBeGreaterThan(0);
    expect(report.overallMismatchCount).toBeGreaterThan(0);

    const markdown = renderIndexerComparisonMarkdown(report);
    expect(markdown).toContain('# Inter-Indexer Comparison Report');
    expect(markdown).toContain('## REST');
    expect(markdown).toContain('leaderboard.top_asset');
  });
});
