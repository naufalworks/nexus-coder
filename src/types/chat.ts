/** Reference to a code location in a chat message */
export interface CodeReference {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
}

/** A single message in a chat conversation */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  /** Who sent this message */
  role: 'user' | 'agent' | 'system';
  /** The agent name, if role is 'agent' */
  agentName?: string;
  /** Message content (may contain markdown) */
  content: string;
  /** Timestamp */
  timestamp: Date;
  /** Code references embedded in this message */
  codeReferences: CodeReference[];
  /** Graph node references */
  graphNodeIds: string[];
  /** Whether this message is currently being streamed */
  isStreaming: boolean;
  /** Token usage for this message */
  tokenUsage?: { input: number; output: number };
}

/** Intent types for automatic agent routing */
export enum IntentType {
  REVIEW = 'review',
  CODE = 'code',
  REFACTOR = 'refactor',
  DEBUG = 'debug',
  EXPLAIN = 'explain',
  SEARCH = 'search',
  GIT = 'git',
  GENERAL = 'general',
}

/** Result of intent classification */
export interface IntentClassification {
  /** Classified intent type */
  intent: IntentType;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Keywords extracted from the message */
  keywords: string[];
  /** Suggested agent based on intent */
  suggestedAgent: string;
  /** Required context scope for this intent */
  contextScope: 'full' | 'partial' | 'minimal';
}

/** Graph context built for a chat session */
export interface GraphContext {
  /** Selected graph nodes */
  nodes: Array<import('./graph').SCGNode>;
  /** Summary of context composition */
  summary: string;
  /** Total token count */
  tokenCount: number;
  /** Compression ratio (total nodes / full nodes) */
  compressionRatio: number;
}

/** Options for creating a chat session */
export interface ChatSessionOptions {
  /** Session mode: auto (automatic routing) or manual (fixed agent) */
  mode: 'auto' | 'manual';
  /** Agent name (required for manual mode) */
  agentName?: string;
  /** Enable automatic agent routing based on intent */
  autoRouting?: boolean;
  /** Enable full graph context building */
  fullGraphContext?: boolean;
}

/** A chat session with an agent */
export interface ChatSession {
  /** Unique session ID */
  id: string;
  /** Session mode */
  mode?: 'auto' | 'manual';
  /** The agent assigned to this session */
  agentName: string;
  /** Conversation history */
  messages: ChatMessage[];
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  updatedAt: Date;
  /** Session context: files, graph nodes being discussed */
  contextFiles: string[];
  contextNodeIds: string[];
  /** Session status */
  status: 'active' | 'idle' | 'closed';
  /** Enable automatic agent routing */
  autoRouting?: boolean;
  /** Enable full graph context */
  fullGraphContext?: boolean;
  /** History of intent classifications */
  intentHistory?: IntentClassification[];
}

/** Chat input command */
export interface ChatCommand {
  type: 'message' | 'instruction' | 'refactor' | 'explain' | 'search';
  content: string;
  targetFile?: string;
  targetNode?: string;
  /** Graph context for this command (added by auto-routing) */
  graphContext?: GraphContext;
}

/** Streaming chunk from agent */
export interface StreamChunk {
  sessionId: string;
  messageId: string;
  chunk: string;
  isComplete: boolean;
  codeReferences?: CodeReference[];
  graphNodeIds?: string[];
}

/** Chat widget state */
export interface ChatState {
  session: ChatSession | null;
  inputText: string;
  isStreaming: boolean;
  selectedAgent: string;
  availableAgents: Array<import('./agent').AgentInfo>;
  error: string | null;
}

/** Interface connecting chat to search and impact analysis */
export interface ChatSearchIntegration {
  /** Chat can invoke search to find context */
  searchForContext: (query: string) => Promise<Array<import('./search').SearchResult>>;
  /** Chat results embed clickable code references */
  openCodeReference: (ref: CodeReference) => void;
  /** Chat can request impact analysis on discussed code */
  analyzeImpact: (nodeId: string) => Promise<import('./impact').ImpactAnalysis>;
}
