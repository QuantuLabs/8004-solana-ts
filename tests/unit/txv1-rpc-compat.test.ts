import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

const mixedBlock = JSON.parse(
  readFileSync(new URL('../fixtures/txv1/mixed-block.json', import.meta.url), 'utf8')
).result;
const parsedTransaction = JSON.parse(
  readFileSync(new URL('../fixtures/txv1/parsed-transaction.json', import.meta.url), 'utf8')
).result;

describe('transaction version 1 RPC compatibility', () => {
  it('decodes all six connection read methods with an explicit version cap', async () => {
    const connection = new SolanaSDK({
      cluster: 'devnet',
      rpcUrl: 'http://127.0.0.1:8899',
      useIndexer: false,
    }).getSolanaClient().getConnection();
    const versionOne = mixedBlock.transactions.find(({ version }: { version: number | string }) => version === 1);
    const rawTransaction = { ...versionOne, slot: 493978170, blockTime: mixedBlock.blockTime };
    const parsedBlock = {
      ...mixedBlock,
      transactions: [{
        transaction: parsedTransaction.transaction,
        meta: parsedTransaction.meta,
        version: parsedTransaction.version,
      }],
    };
    const calls: Array<{ method: string; config: Record<string, unknown> }> = [];
    const rpcRequest = jest.fn(async (method: string, args: Array<unknown>) => {
      const config = args[1] as Record<string, unknown>;
      calls.push({ method, config });
      const result = method === 'getBlock'
        ? (config.encoding === 'jsonParsed' ? parsedBlock : mixedBlock)
        : (config.encoding === 'jsonParsed' ? parsedTransaction : rawTransaction);
      return { jsonrpc: '2.0', id: 'fixture', result };
    });
    const rpcBatchRequest = jest.fn(async (requests: Array<{ methodName: string; args: Array<unknown> }>) =>
      Promise.all(requests.map(({ methodName, args }) => rpcRequest(methodName, args)))
    );
    Object.assign(connection, { _rpcRequest: rpcRequest, _rpcBatchRequest: rpcBatchRequest });

    const config = { commitment: 'confirmed' as const, maxSupportedTransactionVersion: 1 };
    const signature = rawTransaction.transaction.signatures[0];
    const transaction = await connection.getTransaction(signature, config);
    const parsed = await connection.getParsedTransaction(signature, config);
    const block = await connection.getBlock(493978170, config);
    const parsedBlockResult = await connection.getParsedBlock(493978170, config);
    const transactions = await connection.getTransactions([signature], config);
    const parsedTransactions = await connection.getParsedTransactions([signature], config);

    expect(transaction?.version).toBe(1);
    expect(parsed?.version).toBe(1);
    expect(block?.transactions.map(({ version }) => version)).toEqual(['legacy', 0, 1]);
    expect(parsedBlockResult?.transactions[0].version).toBe(1);
    expect(transactions[0]?.version).toBe(1);
    expect(parsedTransactions[0]?.version).toBe(1);
    expect(calls).toHaveLength(6);
    expect(calls.every(({ config: requestConfig }) => requestConfig.maxSupportedTransactionVersion === 1)).toBe(true);
  });
});
