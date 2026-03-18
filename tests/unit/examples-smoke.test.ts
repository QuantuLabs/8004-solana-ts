import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const EXAMPLES = [
  'quick-start.ts',
  'feedback-usage.ts',
  'collection-flow.ts',
  'agent-update.ts',
  'transfer-agent.ts',
  'server-mode.ts',
] as const;

describe('sdk examples smoke', () => {
  it.each(EXAMPLES)('keeps %s as a runnable top-level example file', (fileName) => {
    const source = fs.readFileSync(
      path.resolve('examples', fileName),
      'utf8'
    );

    expect(source).toContain('async function main()');
    expect(source).toContain('main().catch');
  });
});
