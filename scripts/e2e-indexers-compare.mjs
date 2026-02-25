#!/usr/bin/env node

import {
  buildComparisonReport,
  errorMessage,
  getArgOr,
  getFlag,
  parseArgs,
  readJson,
  renderComparisonMarkdown,
  resolveFromCwd,
  writeJson,
  writeText,
} from './e2e-indexers-lib.mjs';

function readCheckArtifact(pathValue) {
  const artifact = readJson(pathValue);
  if (!artifact) {
    return {
      status: 'skipped',
      available: null,
      seedAssetFound: null,
      leaderboardAssets: [],
      globalStats: {
        total_agents: null,
        total_feedbacks: null,
        total_collections: null,
      },
    };
  }
  return artifact;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = getArgOr(args, 'run-id', process.env.E2E_INDEXERS_RUN_ID || 'manual');
  const artifactsDir = resolveFromCwd(getArgOr(args, 'artifacts-dir', `artifacts/e2e-indexers/${runId}/jobs`));

  const classicRestPath = resolveFromCwd(getArgOr(args, 'classic-rest', `${artifactsDir}/classic-rest.json`));
  const classicGraphqlPath = resolveFromCwd(getArgOr(args, 'classic-graphql', `${artifactsDir}/classic-graphql.json`));
  const substreamRestPath = resolveFromCwd(getArgOr(args, 'substream-rest', `${artifactsDir}/substream-rest.json`));
  const substreamGraphqlPath = resolveFromCwd(getArgOr(args, 'substream-graphql', `${artifactsDir}/substream-graphql.json`));

  const outputJsonPath = resolveFromCwd(
    getArgOr(args, 'output-json', `artifacts/e2e-indexers/${runId}/comparison/report.json`)
  );
  const outputMarkdownPath = resolveFromCwd(
    getArgOr(args, 'output-md', `artifacts/e2e-indexers/${runId}/comparison/report.md`)
  );

  const report = buildComparisonReport({
    runId,
    classicRest: readCheckArtifact(classicRestPath),
    classicGraphql: readCheckArtifact(classicGraphqlPath),
    substreamRest: readCheckArtifact(substreamRestPath),
    substreamGraphql: readCheckArtifact(substreamGraphqlPath),
  });

  writeJson(outputJsonPath, report);
  writeText(outputMarkdownPath, renderComparisonMarkdown(report));

  console.log(`Comparison JSON: ${outputJsonPath}`);
  console.log(`Comparison Markdown: ${outputMarkdownPath}`);
  console.log(`Mismatch count: ${report.overallMismatchCount}`);

  const failOnDiff = getFlag(args, 'fail-on-diff');
  if (failOnDiff && report.overallMismatchCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
