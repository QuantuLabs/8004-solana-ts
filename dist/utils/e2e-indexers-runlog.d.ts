export type MatrixStatus = 'passed' | 'failed' | 'partial' | 'skipped';
export interface MatrixJobRecord {
    id: string;
    label: string;
    status: MatrixStatus;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    command: string;
    artifactPath?: string;
    logPath?: string;
    note?: string;
}
export interface MatrixRunRecord {
    runId: string;
    status: MatrixStatus;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    jobs: MatrixJobRecord[];
    comparisonMarkdownPath?: string;
    comparisonJsonPath?: string;
}
export interface IndexerCheckArtifact {
    backend: 'classic' | 'substream';
    transport: 'rest' | 'graphql';
    status: MatrixStatus;
    baseUrl: string | null;
    available: boolean | null;
    seedAsset: string | null;
    seedAssetFound: boolean | null;
    leaderboardAssets: string[];
    globalStats: {
        total_agents: number | null;
        total_feedbacks: number | null;
        total_collections: number | null;
    };
    errors: string[];
    generatedAt: string;
}
export interface IndexerFieldDiff {
    field: string;
    classic: string;
    substream: string;
    match: boolean;
}
export interface IndexerTransportDiff {
    transport: 'rest' | 'graphql';
    mismatchCount: number;
    fields: IndexerFieldDiff[];
}
export interface IndexerComparisonReport {
    runId: string;
    generatedAt: string;
    overallMismatchCount: number;
    transports: IndexerTransportDiff[];
}
export declare const E2E_INDEXERS_RUNLOG_TEMPLATE = "# E2E Indexers Runlog\n\nExecution history for indexer E2E matrix runs.\n\n## Runs\n<!-- RUNS:START -->\n<!-- RUNS:END -->\n\n## Jobs\n<!-- JOBS:START -->\n<!-- JOBS:END -->\n\n## Diffs\n<!-- DIFFS:START -->\n<!-- DIFFS:END -->\n";
export declare function ensureRunlogTemplate(existingContent?: string): string;
export declare function formatRunSectionEntry(run: MatrixRunRecord): string;
export declare function formatJobsSectionEntry(run: MatrixRunRecord): string;
export declare function formatDiffSectionEntry(run: MatrixRunRecord, mismatchCount: number): string;
export declare function injectRunIntoMarkdown(runlogContent: string, run: MatrixRunRecord, mismatchCount: number): string;
export declare function buildIndexerComparisonReport(input: {
    runId: string;
    classicRest: IndexerCheckArtifact | null;
    classicGraphql: IndexerCheckArtifact | null;
    substreamRest: IndexerCheckArtifact | null;
    substreamGraphql: IndexerCheckArtifact | null;
}): IndexerComparisonReport;
export declare function renderIndexerComparisonMarkdown(report: IndexerComparisonReport): string;
//# sourceMappingURL=e2e-indexers-runlog.d.ts.map