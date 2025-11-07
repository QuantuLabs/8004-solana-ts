/**
 * Agent indexer for discovery and search functionality
 * Simplified version focused on subgraph queries (no local ML indexing)
 */

import type { AgentSummary, SearchParams } from '../models/interfaces.js';
import type { AgentId } from '../models/types.js';
import type { Web3Client } from './web3-client.js';
import type { SubgraphClient } from './subgraph-client.js';
import { normalizeAddress } from '../utils/validation.js';

/**
 * Simplified indexer that primarily uses subgraph for queries
 * No local indexing or ML capabilities - all queries go through subgraph
 */
export class AgentIndexer {
  constructor(
    private web3Client: Web3Client,
    private subgraphClient?: SubgraphClient
  ) {}

  /**
   * Get agent summary from index/subgraph
   */
  async getAgent(agentId: AgentId): Promise<AgentSummary> {
    // Use subgraph if available (preferred)
    if (this.subgraphClient) {
      const agent = await this.subgraphClient.getAgentById(agentId);
      if (agent) {
        return agent;
      }
    }

    // Fallback: would need to query blockchain directly
    // For now, throw error if not in subgraph
    throw new Error(`Agent ${agentId} not found. Subgraph required for querying.`);
  }

  /**
   * Search agents with filters
   */
  async searchAgents(
    params: SearchParams = {},
    pageSize: number = 50,
    cursor?: string
  ): Promise<{ items: AgentSummary[]; nextCursor?: string }> {
    if (!this.subgraphClient) {
      throw new Error('Subgraph client required for agent search');
    }

    // Ensure params is always an object
    const searchParams: SearchParams = params || {};

    // Parse cursor for pagination
    const skip = cursor ? parseInt(cursor, 10) : 0;

    // Use subgraph search which pushes filters and pagination to subgraph level (much more efficient)
    // Fetch one extra record to check if there's a next page
    let agents = await this.subgraphClient.searchAgents(searchParams, pageSize + 1, skip);
    
    // Apply any remaining client-side filtering (for complex filters like array contains)
    agents = this._filterAgents(agents, searchParams);

    // Check if there are more results (we fetched pageSize + 1)
    const hasMore = agents.length > pageSize;
    const paginatedAgents = hasMore ? agents.slice(0, pageSize) : agents;

    // Return next cursor if we have more results
    const nextCursor = hasMore ? String(skip + pageSize) : undefined;

    return {
      items: paginatedAgents,
      nextCursor,
    };
  }

  private _filterAgents(agents: AgentSummary[], params: SearchParams): AgentSummary[] {
    const {
      name,
      mcp,
      a2a,
      ens,
      did,
      walletAddress,
      supportedTrust,
      a2aSkills,
      mcpTools,
      mcpPrompts,
      mcpResources,
      active,
      x402support,
      chains,
    } = params;

    return agents.filter(agent => {
      // Filter by name (flattened from registrationFile)
      if (name && !agent.name?.toLowerCase().includes(name.toLowerCase())) {
        return false;
      }

      // Filter by MCP endpoint (flattened to agent.mcp boolean)
      if (mcp !== undefined && agent.mcp !== mcp) {
        return false;
      }

      // Filter by A2A endpoint (flattened to agent.a2a boolean)
      if (a2a !== undefined && agent.a2a !== a2a) {
        return false;
      }

      // Filter by ENS (flattened from registrationFile)
      if (ens && agent.ens && normalizeAddress(agent.ens) !== normalizeAddress(ens)) {
        return false;
      }

      // Filter by DID (flattened from registrationFile)
      if (did && agent.did !== did) {
        return false;
      }

      // Filter by wallet address (flattened from registrationFile)
      if (walletAddress && agent.walletAddress && normalizeAddress(agent.walletAddress) !== normalizeAddress(walletAddress)) {
        return false;
      }

      // Filter by supported trusts (flattened from registrationFile)
      if (supportedTrust && supportedTrust.length > 0) {
        const agentTrusts = agent.supportedTrusts || [];
        if (!supportedTrust.some((trust: any) => agentTrusts.includes(trust))) {
          return false;
        }
      }

      // Filter by A2A skills (flattened from registrationFile)
      if (a2aSkills && a2aSkills.length > 0) {
        const agentSkills = agent.a2aSkills || [];
        if (!a2aSkills.some(skill => agentSkills.includes(skill))) {
          return false;
        }
      }

      // Filter by MCP tools (flattened from registrationFile)
      if (mcpTools && mcpTools.length > 0) {
        const agentTools = agent.mcpTools || [];
        if (!mcpTools.some(tool => agentTools.includes(tool))) {
          return false;
        }
      }

      // Filter by MCP prompts (flattened from registrationFile)
      if (mcpPrompts && mcpPrompts.length > 0) {
        const agentPrompts = agent.mcpPrompts || [];
        if (!mcpPrompts.some(prompt => agentPrompts.includes(prompt))) {
          return false;
        }
      }

      // Filter by MCP resources (flattened from registrationFile)
      if (mcpResources && mcpResources.length > 0) {
        const agentResources = agent.mcpResources || [];
        if (!mcpResources.some(resource => agentResources.includes(resource))) {
          return false;
        }
      }

      // Filter by active status (flattened from registrationFile)
      if (active !== undefined && agent.active !== active) {
        return false;
      }

      // Filter by x402support (flattened from registrationFile)
      if (x402support !== undefined && agent.x402support !== x402support) {
        return false;
      }

      // Filter by chain
      if (chains && chains.length > 0 && !chains.includes(agent.chainId)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Search agents by reputation
   */
  async searchAgentsByReputation(
    agents?: string[],
    tags?: string[],
    reviewers?: string[],
    capabilities?: string[],
    skills?: string[],
    tasks?: string[],
    names?: string[],
    minAverageScore?: number,
    includeRevoked: boolean = false,
    first: number = 50,
    skip: number = 0,
    sort: string[] = ['createdAt:desc']
  ): Promise<{ items: AgentSummary[]; nextCursor?: string }> {
    if (!this.subgraphClient) {
      throw new Error('Subgraph client required for reputation search');
    }

    // Parse sort parameter
    let orderBy = 'createdAt';
    let orderDirection: 'asc' | 'desc' = 'desc';
    if (sort && sort.length > 0) {
      const sortField = sort[0].split(':');
      orderBy = sortField[0] || orderBy;
      orderDirection = (sortField[1] as 'asc' | 'desc') || orderDirection;
    }

    try {
      const agentsData = await this.subgraphClient.searchAgentsByReputation(
        agents,
        tags,
        reviewers,
        capabilities,
        skills,
        tasks,
        names,
        minAverageScore,
        includeRevoked,
        first,
        skip,
        orderBy,
        orderDirection
      );

      // Transform to AgentSummary with averageScore in extras
      const items: AgentSummary[] = agentsData.map((agent) => {
        const regFile = agent.registrationFile;
        
        return {
          chainId: parseInt(agent.chainId?.toString() || '0', 10),
          agentId: agent.id || '',
          name: regFile?.name || '',
          image: regFile?.image || undefined,
          description: regFile?.description || '',
          owners: agent.owner ? [normalizeAddress(agent.owner)] : [],
          operators: (agent.operators || []).map((op: string) => normalizeAddress(op)),
          mcp: !!regFile?.mcpEndpoint,
          a2a: !!regFile?.a2aEndpoint,
          ens: regFile?.ens || undefined,
          did: regFile?.did || undefined,
          walletAddress: regFile?.agentWallet ? normalizeAddress(regFile.agentWallet) : undefined,
          supportedTrusts: regFile?.supportedTrusts || [],
          a2aSkills: regFile?.a2aSkills || [],
          mcpTools: regFile?.mcpTools || [],
          mcpPrompts: regFile?.mcpPrompts || [],
          mcpResources: regFile?.mcpResources || [],
          active: regFile?.active ?? false,
          x402support: regFile?.x402support ?? false,
          extras: {
            averageScore: agent.averageScore !== null ? agent.averageScore : undefined,
          },
        };
      });

      const nextCursor = items.length === first ? String(skip + items.length) : undefined;

      return {
        items,
        nextCursor,
      };
    } catch (error) {
      throw new Error(`Failed to search agents by reputation: ${error}`);
    }
  }
}

