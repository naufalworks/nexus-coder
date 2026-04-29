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

/** A chat session with an agent */
export interface ChatSession {
  /** Unique session ID */
  id: string;
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
}

/** Chat input command */
export interface ChatCommand {
  type: 'message' | 'instruction' | 'refactor' | 'explain' | 'search';
  content: string;
  targetFile?: string;
  targetNode?: string;
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
