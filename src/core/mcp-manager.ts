import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig } from '../types';
import logger from '../core/logger';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();

  async initialize(servers: MCPServerConfig[]): Promise<void> {
    logger.info('Initializing MCP servers...');

    for (const server of servers) {
      if (!server.enabled) {
        logger.debug(`Skipping disabled MCP server: ${server.name}`);
        continue;
      }

      try {
        await this.connectServer(server);
        logger.info(`Connected to MCP server: ${server.name}`);
      } catch (error) {
        logger.error(`Failed to connect to MCP server ${server.name}:`, error);
      }
    }
  }

  private async connectServer(config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env as Record<string, string>,
    });

    const client = new Client(
      {
        name: 'nexus-coder',
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    this.clients.set(config.name, client);

    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema,
    }));

    this.tools.set(config.name, tools);
    logger.debug(`Discovered ${tools.length} tools from ${config.name}`);
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<any> {
    const client = this.clients.get(serverName);

    if (!client) {
      throw new Error(`MCP server not connected: ${serverName}`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      return result.content;
    } catch (error) {
      logger.error(`Failed to call tool ${toolName} on ${serverName}:`, error);
      throw error;
    }
  }

  getTools(serverName?: string): MCPTool[] {
    if (serverName) {
      return this.tools.get(serverName) || [];
    }

    const allTools: MCPTool[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  getAvailableServers(): string[] {
    return Array.from(this.clients.keys());
  }

  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`Disconnected from MCP server: ${name}`);
      } catch (error) {
        logger.error(`Failed to disconnect from ${name}:`, error);
      }
    }

    this.clients.clear();
    this.tools.clear();
  }
}

export const mcpManager = new MCPManager();
