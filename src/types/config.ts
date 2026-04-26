export interface MCPServerConfig {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  model?: string;
  tokenCount?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface NexusConfig {
  api: UnifiedApiConfig;
  models: ModelNamesConfig;
  context: ContextConfig;
  mcp: MCPServerConfig[];
  git: GitConfig;
  logging: LoggingConfig;
  retry: RetryConfig;
}

export interface UnifiedApiConfig {
  key: string;
  baseUrl: string;
}

export interface ModelNamesConfig {
  heavy: string;
  fast: string;
  general: string;
  coder: string;
  analyst: string;
}

export interface ContextConfig {
  windowSize: number;
  codeBudget: number;
  memoryBudget: number;
  repoMapBudget: number;
  summaryThreshold: number;
  scgDepth: number;
}

export interface GitConfig {
  autoCommit: boolean;
  commitPrefix: string;
}

export interface LoggingConfig {
  level: string;
  file: string;
}

export interface Decision {
  id: string;
  task: string;
  decision: string;
  reasoning: string;
  outcome: 'success' | 'partial' | 'failure';
  timestamp: Date;
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  context: string;
  successRate: number;
  occurrences: number;
  lastUsed: Date;
  category: 'bug_fix' | 'feature' | 'refactor' | 'convention';
}
