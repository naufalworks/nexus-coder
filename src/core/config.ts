import dotenv from 'dotenv';
import { NexusConfig, MCPServerConfig } from '../types';

dotenv.config();

export function loadConfig(): NexusConfig {
  const mcpServers: MCPServerConfig[] = [
    {
      name: 'filesystem',
      enabled: process.env.MCP_FILESYSTEM_ENABLED === 'true',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    },
    {
      name: 'git',
      enabled: process.env.MCP_GIT_ENABLED === 'true',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git', process.cwd()],
    },
    {
      name: 'github',
      enabled: process.env.MCP_GITHUB_ENABLED === 'true',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
      },
    },
    {
      name: 'sequential-thinking',
      enabled: process.env.MCP_SEQUENTIAL_THINKING_ENABLED === 'true',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    {
      name: 'memory',
      enabled: process.env.MCP_MEMORY_ENABLED === 'true',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ];

  return {
    llm: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: process.env.ANTHROPIC_API_BASE_URL || 'https://api.anthropic.com',
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6-20250514',
      maxTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '200000', 10),
    },
    context: {
      maxTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '200000', 10),
      summaryThreshold: parseInt(process.env.CONTEXT_SUMMARY_THRESHOLD || '50000', 10),
      vectorSize: parseInt(process.env.CONTEXT_VECTOR_SIZE || '1536', 10),
    },
    mcp: mcpServers,
    git: {
      autoCommit: process.env.GIT_AUTO_COMMIT === 'true',
      commitPrefix: process.env.GIT_COMMIT_PREFIX || 'nexus:',
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || 'logs/nexus-coder.log',
    },
  };
}

export const config = loadConfig();
