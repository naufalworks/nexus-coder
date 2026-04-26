import dotenv from 'dotenv';
import { NexusConfig, MCPServerConfig } from '../types';

dotenv.config();

function env(key: string, fallback: string = ''): string {
  const value = process.env[key] || fallback;
  if (!value) {
    console.warn(`[nexus] Warning: ${key} is not set`);
  }
  return value;
}

function intEnv(key: string, fallback: number): number {
  return parseInt(env(key, String(fallback)), 10);
}

export function loadConfig(): NexusConfig {
  const mcpServers: MCPServerConfig[] = [
    {
      name: 'filesystem',
      enabled: process.env.MCP_FILESYSTEM_ENABLED !== 'false',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    },
    {
      name: 'git',
      enabled: process.env.MCP_GIT_ENABLED !== 'false',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git', process.cwd()],
    },
    {
      name: 'sequential-thinking',
      enabled: process.env.MCP_SEQUENTIAL_THINKING_ENABLED !== 'false',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    {
      name: 'memory',
      enabled: process.env.MCP_MEMORY_ENABLED !== 'false',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ];

  return {
    api: {
      key: env('NEXUS_API_KEY'),
      baseUrl: env('NEXUS_BASE_URL'),
    },
    models: {
      heavy: env('NEXUS_MODEL_HEAVY', 'kr/claude-sonnet-4.5'),
      fast: env('NEXUS_MODEL_FAST', 'kr/claude-haiku-4.5'),
      general: env('NEXUS_MODEL_GENERAL', 'kr/glm-5'),
      coder: env('NEXUS_MODEL_CODER', 'kr/qwen3-coder-next'),
      analyst: env('NEXUS_MODEL_ANALYST', 'kr/deepseek-3.2'),
    },
    context: {
      windowSize: intEnv('CONTEXT_WINDOW_SIZE', 200000),
      codeBudget: intEnv('CONTEXT_CODE_BUDGET', 40000),
      memoryBudget: intEnv('CONTEXT_MEMORY_BUDGET', 10000),
      repoMapBudget: intEnv('CONTEXT_REPO_MAP_BUDGET', 5000),
      summaryThreshold: intEnv('CONTEXT_SUMMARY_THRESHOLD', 50000),
      scgDepth: intEnv('CONTEXT_SCG_DEPTH', 3),
    },
    mcp: mcpServers,
    git: {
      autoCommit: process.env.GIT_AUTO_COMMIT === 'true',
      commitPrefix: env('GIT_COMMIT_PREFIX', 'nexus:'),
    },
    logging: {
      level: env('LOG_LEVEL', 'info'),
      file: env('LOG_FILE', 'logs/nexus-v2.log'),
    },
    retry: {
      maxRetries: intEnv('RETRY_MAX_RETRIES', 3),
      baseDelayMs: intEnv('RETRY_BASE_DELAY_MS', 1000),
      maxDelayMs: intEnv('RETRY_MAX_DELAY_MS', 30000),
      backoffMultiplier: parseFloat(env('RETRY_BACKOFF', '2')),
    },
  };
}

export const config = loadConfig();
