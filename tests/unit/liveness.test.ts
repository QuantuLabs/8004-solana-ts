/**
 * Unit tests for isItAlive liveness checks
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { AgentAccount } from '../../src/core/borsh-schemas.js';
import { ServiceType } from '../../src/models/enums.js';

const ORIGINAL_FETCH = global.fetch;

function createAgent(asset: PublicKey, agentUri: string): AgentAccount {
  return new AgentAccount({
    collection: new Uint8Array(32),
    owner: new Uint8Array(32),
    asset: asset.toBytes(),
    bump: 1,
    agent_wallet: null,
    agent_uri: agentUri,
    nft_name: 'TestAgent',
  });
}

function createResponse(status: number, body?: unknown) {
  const textBody = body !== undefined ? JSON.stringify(body) : '';
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => textBody,
  };
}

describe('Liveness Checks', () => {
  beforeEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('should throw when agent is not found', async () => {
    const sdk = new SolanaSDK();
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(null);
    await expect(sdk.isItAlive(Keypair.generate().publicKey)).rejects.toThrow('Agent not found');
  });

  it('should throw when agent has no URI', async () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, '');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);
    await expect(sdk.isItAlive(asset)).rejects.toThrow('Agent has no agent URI');
  });

  it('should report partially live with formatted endpoint lists', async () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, 'https://registry.example.com/agent.json');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    const registration = {
      endpoints: [
        { name: 'MCP', endpoint: 'https://mcp.example.com' },
        { name: 'A2A', endpoint: 'https://a2a.example.com' },
        { name: 'HTTP', endpoint: 'https://auth.example.com' },
      ],
    };

    global.fetch = (async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      if (url === 'https://registry.example.com/agent.json') {
        return createResponse(200, registration);
      }

      if (url === 'https://mcp.example.com' && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        if (body.method === 'tools/list') {
          return createResponse(200, { result: { tools: [{ name: 'ping' }] } });
        }
        if (body.method === 'resources/list') {
          return createResponse(200, { result: { resources: [] } });
        }
        if (body.method === 'prompts/list') {
          return createResponse(200, { result: { prompts: [] } });
        }
        return createResponse(200, { result: {} });
      }

      if (url === 'https://a2a.example.com/agentcard.json') {
        return createResponse(404, { error: 'not found' });
      }
      if (url === 'https://a2a.example.com/.well-known/agent.json') {
        return createResponse(404, { error: 'not found' });
      }
      if (url === 'https://a2a.example.com' && method === 'HEAD') {
        return createResponse(404);
      }

      if (url === 'https://auth.example.com' && method === 'HEAD') {
        return createResponse(401);
      }

      return createResponse(500, { error: 'unexpected' });
    }) as typeof fetch;

    const report = await sdk.isItAlive(asset);

    expect(report.status).toBe('partially');
    expect(report.liveServices.length).toBe(2);
    expect(report.deadServices.length).toBe(1);
    expect(report.liveServices.some((entry) => entry.endpoint === 'https://mcp.example.com')).toBe(true);
    expect(report.liveServices.some((entry) => entry.endpoint === 'https://auth.example.com')).toBe(true);
    expect(report.deadServices[0].endpoint).toBe('https://a2a.example.com');
  });

  it('should treat auth-required endpoints as not live when disabled', async () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, 'https://registry.example.com/agent.json');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    global.fetch = (async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (url === 'https://registry.example.com/agent.json') {
        return createResponse(200, {
          endpoints: [{ name: 'HTTP', endpoint: 'https://auth.example.com' }],
        });
      }
      if (url === 'https://auth.example.com' && method === 'HEAD') {
        return createResponse(401);
      }
      return createResponse(404);
    }) as typeof fetch;

    const report = await sdk.isItAlive(asset, { treatAuthAsAlive: false });

    expect(report.status).toBe('not_live');
    expect(report.okCount).toBe(0);
  });

  it('should respect includeTypes filter', async () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, 'https://registry.example.com/agent.json');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    global.fetch = (async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (url === 'https://registry.example.com/agent.json') {
        return createResponse(200, {
          endpoints: [
            { name: 'MCP', endpoint: 'https://mcp.example.com' },
            { name: 'A2A', endpoint: 'https://a2a.example.com' },
          ],
        });
      }
      if (url === 'https://mcp.example.com' && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        if (body.method === 'tools/list') {
          return createResponse(200, { result: { tools: [{ name: 'ping' }] } });
        }
        if (body.method === 'resources/list') {
          return createResponse(200, { result: { resources: [] } });
        }
        if (body.method === 'prompts/list') {
          return createResponse(200, { result: { prompts: [] } });
        }
      }
      return createResponse(404);
    }) as typeof fetch;

    const report = await sdk.isItAlive(asset, { includeTypes: [ServiceType.MCP] });
    expect(report.totalPinged).toBe(1);
    expect(report.status).toBe('live');
    expect(report.liveServices[0].endpoint).toBe('https://mcp.example.com');
  });

  it('should skip non-http endpoints', async () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, 'https://registry.example.com/agent.json');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    global.fetch = (async (url: string) => {
      if (url === 'https://registry.example.com/agent.json') {
        return createResponse(200, {
          endpoints: [{ name: 'ENS', endpoint: 'alice.eth' }],
        });
      }
      return createResponse(404);
    }) as typeof fetch;

    const report = await sdk.isItAlive(asset);

    expect(report.status).toBe('not_live');
    expect(report.skippedCount).toBe(1);
    expect(report.totalPinged).toBe(0);
  });

  it('should load registration from ipfs via ipfsClient', async () => {
    const sdk = new SolanaSDK({
      ipfsClient: {
        getJson: async (cid: string) => {
          if (cid !== 'ipfs://QmAgent') {
            throw new Error(`Unexpected cid ${cid}`);
          }
          return {
            endpoints: [{ name: 'HTTP', endpoint: 'https://live.example.com' }],
          };
        },
      } as any,
    });
    const asset = Keypair.generate().publicKey;
    const agent = createAgent(asset, 'ipfs://QmAgent');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    global.fetch = (async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (url === 'https://live.example.com' && method === 'HEAD') {
        return createResponse(200);
      }
      return createResponse(404);
    }) as typeof fetch;

    const report = await sdk.isItAlive(asset);
    expect(report.status).toBe('live');
    expect(report.liveServices[0].endpoint).toBe('https://live.example.com');
  });
});
