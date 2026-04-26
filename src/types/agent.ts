export interface AgentMessage {
  agent: string;
  timestamp: Date;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  taskId: string;
  conversationHistory: AgentMessage[];
  relevantContext: import('./graph').ContextEntry[];
  semanticGraph?: import('./graph').SemanticCodeGraphData;
  currentFile?: string;
  workingDirectory: string;
}
