import { createRequire } from 'node:module';
import { describe, expect, test } from '@jest/globals';

const require = createRequire(import.meta.url);
const { TABLE_SPECS } = require('../../scripts/verify-db-full-integrity.cjs') as {
  TABLE_SPECS: Array<{
    canonical: string;
    columns: Array<{ name: string; pg?: string; sqlite?: string }>;
    orderBy?: string[];
  }>;
};

function getSpec(name: string) {
  const spec = TABLE_SPECS.find((entry) => entry.canonical === name);
  expect(spec).toBeDefined();
  return spec!;
}

function columnNames(name: string): string[] {
  return getSpec(name).columns.map((column) => column.name);
}

function getColumnSpec(table: string, column: string) {
  const spec = getSpec(table).columns.find((entry) => entry.name === column);
  expect(spec).toBeDefined();
  return spec!;
}

describe('verify-db-full-integrity script contract', () => {
  test('keeps canonical event ordering aligned with the indexer', () => {
    expect(getSpec('Agent').orderBy).toEqual([
      'block_slot',
      'tx_index',
      'event_ordinal',
      'tx_signature',
      'asset',
    ]);
    expect(getSpec('Metadata').orderBy).toEqual([
      'asset',
      'key',
      'block_slot',
      'tx_index',
      'event_ordinal',
      'tx_signature',
    ]);
    expect(getSpec('Feedback').orderBy).toEqual([
      'asset',
      'client_address',
      'feedback_index',
      'block_slot',
      'tx_index',
      'event_ordinal',
      'tx_signature',
    ]);
    expect(getSpec('FeedbackResponse').orderBy).toEqual([
      'asset',
      'client_address',
      'feedback_index',
      'responder',
      'block_slot',
      'tx_index',
      'event_ordinal',
      'tx_signature',
    ]);
    expect(getSpec('Revocation').orderBy).toEqual([
      'asset',
      'client_address',
      'feedback_index',
      'slot',
      'tx_index',
      'event_ordinal',
      'tx_signature',
    ]);
  });

  test('projects the recent cursor and timestamp surfaces', () => {
    expect(columnNames('Agent')).toEqual(expect.arrayContaining([
      'block_slot',
      'created_at',
      'updated_at',
      'verified_at',
    ]));
    expect(columnNames('CollectionPointer')).toEqual(expect.arrayContaining([
      'first_seen_at',
      'last_seen_at',
      'metadata_updated_at',
    ]));
    expect(columnNames('Metadata')).toContain('verified_at');
    expect(columnNames('IndexerState')).toContain('last_tx_index');
  });

  test('preserves required hash fields without zero-to-null normalization', () => {
    const requiredHashColumns: Array<[string, string]> = [
      ['Feedback', 'feedback_hash'],
      ['FeedbackResponse', 'response_hash'],
      ['Revocation', 'feedback_hash'],
      ['Validation', 'request_hash'],
      ['Validation', 'response_hash'],
    ];

    for (const [table, column] of requiredHashColumns) {
      const spec = getColumnSpec(table, column);
      expect(spec.pg).toBeDefined();
      expect(spec.sqlite).toBeDefined();
      expect(spec.pg).not.toContain('NULLIF');
      expect(spec.sqlite).not.toContain('NULLIF');
    }
  });
});
