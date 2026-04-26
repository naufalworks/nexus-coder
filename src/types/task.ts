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
