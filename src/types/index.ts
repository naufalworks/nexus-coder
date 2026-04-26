export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  CONTEXT = 'context',
  TASK = 'task',
  GIT = 'git',
  CODING = 'coding',
  TOOLS = 'tools'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum ChangeType {
  CREATE = 'create',
  MODIFY = 'modify',
  DELETE = 'delete',
  REFACTOR = 'refactor'
}

export interface AgentMessage {
  agent: AgentType;
  timestamp: Date;
  content: string;
  metadata?: Record<string, any>;
}

export interface CodeChange {
  file: string;
  type: ChangeType;
  reasoning: string;
  impact: string[];
  risk: 'low' | 'medium' | 'high';
  diff: string;
  approved: boolean;
}

export interface Task {
  id: string;
  instruction: string;
  status: TaskStatus;
  assignedAgent: AgentType;
  context?: string;
  createdAt: Date;
  updatedAt: Date;
  result?: any;
  error?: string;
}

export interface ContextEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    file?: string;
    line?: number;
    type: 'code' | 'documentation' | 'conversation' | 'memory';
    timestamp: Date;
    relevance: number;
  };
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: Date;
  changes: CodeChange[];
  reasoning: string;
}

export interface MCPServerConfig {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

export interface ContextConfig {
  maxTokens: number;
  summaryThreshold: number;
  vectorSize: number;
}

export interface NexusConfig {
  llm: LLMConfig;
  context: ContextConfig;
  mcp: MCPServerConfig[];
  git: {
    autoCommit: boolean;
    commitPrefix: string;
  };
  logging: {
    level: string;
    file: string;
  };
}

export interface RepoMap {
  files: Map<string, FileAnalysis>;
  symbols: Map<string, SymbolInfo>;
  dependencies: Map<string, string[]>;
}

export interface FileAnalysis {
  path: string;
  language: string;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
}

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
  file: string;
  line: number;
  signature?: string;
  documentation?: string;
}

export interface AgentContext {
  taskId: string;
  conversationHistory: AgentMessage[];
  relevantContext: ContextEntry[];
  currentFile?: string;
  workingDirectory: string;
}

export interface ApprovalRequest {
  changes: CodeChange[];
  reasoning: string;
  impact: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ApprovalResponse {
  approved: boolean;
  feedback?: string;
  modifications?: Partial<CodeChange>;
}
