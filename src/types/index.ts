export enum NodeType {
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  TYPE = 'type',
  VARIABLE = 'variable',
  MODULE = 'module',
  ENDPOINT = 'endpoint',
  TEST = 'test',
  MIDDLEWARE = 'middleware',
  MODEL = 'model',
  EXPORT = 'export',
  IMPORT = 'import',
}

export enum EdgeType {
  CALLS = 'calls',
  IMPORTS = 'imports',
  EXTENDS = 'extends',
  IMPLEMENTS = 'implements',
  DEPENDS_ON = 'depends_on',
  TESTS = 'tests',
  USES = 'uses',
  ROUTES_TO = 'routes_to',
  REFERENCES = 'references',
  EXPORTS = 'exports',
}

export enum CompressionLevel {
  SIGNATURE = 0,
  SUMMARY = 1,
  PARTIAL = 2,
  FULL = 3,
}

export enum TaskType {
  BUG_FIX = 'bug_fix',
  FEATURE = 'feature',
  REFACTOR = 'refactor',
  REVIEW = 'review',
  EXPLAIN = 'explain',
  TEST = 'test',
  DOCUMENTATION = 'documentation',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown',
}

export enum TaskPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum TaskStatus {
  PENDING = 'pending',
  CLASSIFYING = 'classifying',
  PLANNING = 'planning',
  CONTEXT_ASSEMBLING = 'context_assembling',
  EXECUTING = 'executing',
  REVIEWING = 'reviewing',
  AWAITING_APPROVAL = 'awaiting_approval',
  APPLYING = 'applying',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ChangeType {
  CREATE = 'create',
  MODIFY = 'modify',
  DELETE = 'delete',
  REFACTOR = 'refactor',
}

export enum AgentCapability {
  CODE_GENERATION = 'code_generation',
  CODE_REVIEW = 'code_review',
  CODE_ANALYSIS = 'code_analysis',
  CONTEXT_RETRIEVAL = 'context_retrieval',
  GIT_OPERATIONS = 'git_operations',
  TASK_PLANNING = 'task_planning',
  FILE_OPERATIONS = 'file_operations',
  TESTING = 'testing',
}

export interface SCGNode {
  id: string;
  type: NodeType;
  name: string;
  file: string;
  line: number;
  endLine: number;
  signature: string;
  summary: string;
  complexity: number;
  changeFrequency: number;
}

export interface SCGEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface SemanticCodeGraphData {
  nodes: Map<string, SCGNode>;
  edges: SCGEdge[];
  dependencies: Map<string, string[]>;
  builtAt: Date;
  fileCount: number;
  symbolCount: number;
}

export interface TaskClassification {
  type: TaskType;
  priority: TaskPriority;
  complexity: number;
  requiresContext: boolean;
  requiresCodeGeneration: boolean;
  requiresGitOps: boolean;
  requiresReview: boolean;
  affectedAreas: string[];
  estimatedTokens: number;
}

export interface SubTask {
  id: string;
  instruction: string;
  assignedAgent: string;
  requiredCapabilities: AgentCapability[];
  dependencies: string[];
  status: TaskStatus;
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  output: string;
  changes?: CodeChange[];
  metadata?: Record<string, unknown>;
}

export interface CodeChange {
  file: string;
  type: ChangeType;
  reasoning: string;
  impact: string[];
  risk: 'low' | 'medium' | 'high';
  diff: string;
  content: string;
  approved: boolean;
}

export interface Task {
  id: string;
  instruction: string;
  classification?: TaskClassification;
  subTasks: SubTask[];
  status: TaskStatus;
  context?: string;
  createdAt: Date;
  updatedAt: Date;
  result?: TaskResult;
  error?: string;
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  heavy: number;
  fast: number;
  general: number;
  coder: number;
  analyst: number;
  total: number;
  estimatedCost: number;
}

export interface ContextEntry {
  id: string;
  content: string;
  embedding?: number[];
  relevance: number;
  metadata: {
    file?: string;
    line?: number;
    type: 'code' | 'documentation' | 'conversation' | 'memory' | 'decision' | 'pattern';
    timestamp: Date;
    source: string;
  };
}

export interface CompressedContext {
  content: string;
  nodes: SCGNode[];
  totalTokens: number;
  budgetUsed: number;
  compressionRatio: number;
}

export interface TokenBudget {
  total: number;
  systemPrompt: number;
  conversationHistory: number;
  codeContext: number;
  vectorMemory: number;
  repoMap: number;
  reserve: number;
}

export interface AgentMessage {
  agent: string;
  timestamp: Date;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  taskId: string;
  conversationHistory: AgentMessage[];
  relevantContext: ContextEntry[];
  semanticGraph?: SemanticCodeGraphData;
  currentFile?: string;
  workingDirectory: string;
}

export interface ApprovalRequest {
  changes: CodeChange[];
  reasoning: string;
  impact: string;
  risk: 'low' | 'medium' | 'high';
  cost: number;
}

export interface ApprovalResponse {
  approved: boolean;
  feedback?: string;
  modifications?: Partial<CodeChange>;
}

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
