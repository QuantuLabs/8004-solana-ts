import { describe, expect, it } from '@jest/globals';

const originalEnv = { ...process.env };

describe('indexer defaults', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exposes devnet fallback URLs in priority order', async () => {
    const { getDefaultIndexerUrls, getDefaultIndexerGraphqlUrls } = await import('../../src/core/indexer-defaults.js');

    expect(getDefaultIndexerUrls('devnet')).toEqual([
      'https://8004-indexer-dev.qnt.sh/rest/v1',
      'https://8004-indexer-dev2.qnt.sh/rest/v1',
    ]);
    expect(getDefaultIndexerGraphqlUrls('devnet')).toEqual([
      'https://8004-indexer-dev.qnt.sh/v2/graphql',
      'https://8004-indexer-dev2.qnt.sh/v2/graphql',
    ]);
  });

  it('exposes mainnet fallback URLs in priority order', async () => {
    const { getDefaultIndexerUrls, getDefaultIndexerGraphqlUrls } = await import('../../src/core/indexer-defaults.js');

    expect(getDefaultIndexerUrls('mainnet-beta')).toEqual([
      'https://8004-indexer-main.qnt.sh/rest/v1',
      'https://8004-indexer-main2.qnt.sh/rest/v1',
    ]);
    expect(getDefaultIndexerGraphqlUrls('mainnet-beta')).toEqual([
      'https://8004-indexer-main.qnt.sh/v2/graphql',
      'https://8004-indexer-main2.qnt.sh/v2/graphql',
    ]);
  });

  it('still honors explicit env overrides over fallback lists', async () => {
    process.env.INDEXER_URL = 'https://custom.example.com/rest/v1';
    process.env.INDEXER_GRAPHQL_URL = 'https://custom.example.com/v2/graphql';
    const { getDefaultIndexerUrls, getDefaultIndexerGraphqlUrls } = await import('../../src/core/indexer-defaults.js');

    expect(getDefaultIndexerUrls('devnet')).toEqual(['https://custom.example.com/rest/v1']);
    expect(getDefaultIndexerGraphqlUrls('devnet')).toEqual(['https://custom.example.com/v2/graphql']);
  });
});
