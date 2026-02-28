const RUNS_START = '<!-- RUNS:START -->';
const RUNS_END = '<!-- RUNS:END -->';
const JOBS_START = '<!-- JOBS:START -->';
const JOBS_END = '<!-- JOBS:END -->';
const DIFFS_START = '<!-- DIFFS:START -->';
const DIFFS_END = '<!-- DIFFS:END -->';
export const E2E_INDEXERS_RUNLOG_TEMPLATE = `# E2E Indexers Runlog

Execution history for indexer E2E matrix runs.

## Runbook Notes

- Matrix pass requires seed success plus passing endpoint availability and ID checks on enabled indexer check jobs (\`available: true\`, \`idChecks.passed: true\`).
- Inter-indexer parity mismatch count is diagnostic; parity mismatch alone is not sufficient to classify a run as fail/pass.
- Key env knobs: \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_ATTEMPTS\`, \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_DELAY_MS\`, \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_TIMEOUT_MS\`, \`E2E_INDEXERS_IPFS_API_URL\`, \`E2E_INDEXERS_IPFS_CONTAINER_NAME\`, \`E2E_INDEXERS_IPFS_API_PORT\`, \`E2E_INDEXERS_IPFS_GATEWAY_PORT\`, \`E2E_INDEXERS_IPFS_IMAGE\`.

## Runs
${RUNS_START}
${RUNS_END}

## Jobs
${JOBS_START}
${JOBS_END}

## Diffs
${DIFFS_START}
${DIFFS_END}
`;
function withTrailingNewline(input) {
    return input.endsWith('\n') ? input : `${input}\n`;
}
function upsertSection(content, startMarker, endMarker, entry) {
    const normalized = withTrailingNewline(content);
    const start = normalized.indexOf(startMarker);
    const end = normalized.indexOf(endMarker);
    if (start === -1 || end === -1 || end <= start) {
        return `${normalized}\n${entry.trim()}\n`;
    }
    const insertAt = start + startMarker.length;
    const before = normalized.slice(0, insertAt);
    const after = normalized.slice(insertAt);
    const paddedEntry = `\n${entry.trim()}\n`;
    return `${before}${paddedEntry}${after}`;
}
export function ensureRunlogTemplate(existingContent) {
    if (!existingContent || existingContent.trim().length === 0) {
        return E2E_INDEXERS_RUNLOG_TEMPLATE;
    }
    let next = withTrailingNewline(existingContent);
    if (!next.includes(RUNS_START) || !next.includes(RUNS_END)) {
        next += `\n## Runs\n${RUNS_START}\n${RUNS_END}\n`;
    }
    if (!next.includes(JOBS_START) || !next.includes(JOBS_END)) {
        next += `\n## Jobs\n${JOBS_START}\n${JOBS_END}\n`;
    }
    if (!next.includes(DIFFS_START) || !next.includes(DIFFS_END)) {
        next += `\n## Diffs\n${DIFFS_START}\n${DIFFS_END}\n`;
    }
    return next;
}
function statusIcon(status) {
    const labels = {
        passed: 'PASS',
        failed: 'FAIL',
        partial: 'PARTIAL',
        skipped: 'SKIP',
    };
    return labels[status];
}
function asSeconds(ms) {
    return (ms / 1000).toFixed(2);
}
function mdPath(path) {
    return path ? `\`${path}\`` : '-';
}
export function formatRunSectionEntry(run) {
    return `- \`${run.runId}\` | ${statusIcon(run.status)} | ${run.startedAt} -> ${run.endedAt} | ${asSeconds(run.durationMs)}s`;
}
export function formatJobsSectionEntry(run) {
    const lines = [
        `### ${run.runId}`,
        '',
        '| Job | Status | Duration (s) | Command | Artifact | Log |',
        '| --- | --- | ---: | --- | --- | --- |',
    ];
    for (const job of run.jobs) {
        lines.push(`| ${job.label} | ${statusIcon(job.status)} | ${asSeconds(job.durationMs)} | \`${job.command}\` | ${mdPath(job.artifactPath)} | ${mdPath(job.logPath)} |`);
    }
    return lines.join('\n');
}
export function formatDiffSectionEntry(run, mismatchCount) {
    const diffMd = mdPath(run.comparisonMarkdownPath);
    const diffJson = mdPath(run.comparisonJsonPath);
    return `- \`${run.runId}\` | mismatches: **${mismatchCount}** | report: ${diffMd} | json: ${diffJson}`;
}
export function injectRunIntoMarkdown(runlogContent, run, mismatchCount) {
    const templated = ensureRunlogTemplate(runlogContent);
    const withRun = upsertSection(templated, RUNS_START, RUNS_END, formatRunSectionEntry(run));
    const withJobs = upsertSection(withRun, JOBS_START, JOBS_END, formatJobsSectionEntry(run));
    return upsertSection(withJobs, DIFFS_START, DIFFS_END, formatDiffSectionEntry(run, mismatchCount));
}
function normalizeField(value) {
    if (value === null || value === undefined)
        return 'null';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'bigint')
        return String(value);
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.join(',');
    return JSON.stringify(value);
}
function diffField(field, classic, substream) {
    const classicNorm = normalizeField(classic);
    const substreamNorm = normalizeField(substream);
    return {
        field,
        classic: classicNorm,
        substream: substreamNorm,
        match: classicNorm === substreamNorm,
    };
}
function buildTransportDiff(transport, classic, substream) {
    const fields = [];
    fields.push(diffField('available', classic?.available ?? null, substream?.available ?? null));
    fields.push(diffField('global.total_agents', classic?.globalStats.total_agents ?? null, substream?.globalStats.total_agents ?? null));
    fields.push(diffField('global.total_feedbacks', classic?.globalStats.total_feedbacks ?? null, substream?.globalStats.total_feedbacks ?? null));
    fields.push(diffField('global.total_collections', classic?.globalStats.total_collections ?? null, substream?.globalStats.total_collections ?? null));
    fields.push(diffField('leaderboard.count', classic?.leaderboardAssets.length ?? 0, substream?.leaderboardAssets.length ?? 0));
    fields.push(diffField('leaderboard.top_asset', classic?.leaderboardAssets[0] ?? null, substream?.leaderboardAssets[0] ?? null));
    fields.push(diffField('seed_asset_found', classic?.seedAssetFound ?? null, substream?.seedAssetFound ?? null));
    const mismatchCount = fields.reduce((acc, item) => acc + (item.match ? 0 : 1), 0);
    return {
        transport,
        mismatchCount,
        fields,
    };
}
export function buildIndexerComparisonReport(input) {
    const rest = buildTransportDiff('rest', input.classicRest, input.substreamRest);
    const graphql = buildTransportDiff('graphql', input.classicGraphql, input.substreamGraphql);
    const overallMismatchCount = rest.mismatchCount + graphql.mismatchCount;
    return {
        runId: input.runId,
        generatedAt: new Date().toISOString(),
        overallMismatchCount,
        transports: [rest, graphql],
    };
}
export function renderIndexerComparisonMarkdown(report) {
    const lines = [
        '# Inter-Indexer Comparison Report',
        '',
        `- Run ID: \`${report.runId}\``,
        `- Generated At: \`${report.generatedAt}\``,
        `- Overall Mismatches: **${report.overallMismatchCount}**`,
        '',
    ];
    for (const transport of report.transports) {
        lines.push(`## ${transport.transport.toUpperCase()}`);
        lines.push('');
        lines.push('| Field | Classic | Substream | Match |');
        lines.push('| --- | --- | --- | --- |');
        for (const item of transport.fields) {
            lines.push(`| ${item.field} | \`${item.classic}\` | \`${item.substream}\` | ${item.match ? 'YES' : 'NO'} |`);
        }
        lines.push('');
        lines.push(`Mismatches: **${transport.mismatchCount}**`);
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}
//# sourceMappingURL=e2e-indexers-runlog.js.map