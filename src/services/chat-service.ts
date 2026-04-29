/**
 * Agent Chat Service
 *
 * Implements the ChatService interface for real-time streaming conversation
 * with Nexus agents.
 *
 * Requirements: 6.1–6.5, 7.1–7.7, 8.1–8.4, 9.1–9.4, 10.1–10.3
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ChatSession,
  ChatMessage,
  ChatCommand,
  StreamChunk,
  CodeReference,
  ChatSessionOptions,
} from '../types/chat';
import { AgentRegistry, AgentInfo } from '../agents/registry';
import { UnifiedClient } from '../core/models/unified-client';
import { ContextEngine } from '../core/context/engine';
import { GraphTraversal } from '../core/context/graph/traversal';
import { EventBus, EventType } from '../core/event-bus';
import { ModelRouter } from '../core/models/router';
import { IntentClassifier } from './intent-classifier';
import { GraphContextBuilder } from './graph-context-builder';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum token budget for chat context */
const DEFAULT_MAX_TOKENS = 8000;

/** Rate limit: max messages per minute */
const RATE_LIMIT_MESSAGES_PER_MINUTE = 10;

/** Rate limit window in milliseconds */
const RATE_LIMIT_WINDOW_MS = 60000;

/** Per-session context cache TTL in milliseconds (5 minutes) */
const CONTEXT_CACHE_TTL_MS = 300000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageQueueItem {
  sessionId: string;
  command: ChatCommand;
  timestamp: Date;
}

interface RateLimitTracker {
  count: number;
  windowStart: number;
}

interface CachedContext {
  context: string;
  timestamp: number;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------

/**
 * Service that provides agent chat with streaming responses, session management,
 * and context building.
 */
export class ChatService {
  private sessions: Map<string, ChatSession> = new Map();
  private messageQueue: MessageQueueItem[] = [];
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map();
  private contextCache: Map<string, CachedContext> = new Map();
  private intentClassifier: IntentClassifier;
  private graphContextBuilder: GraphContextBuilder;

  constructor(
    private agentRegistry: AgentRegistry,
    private unifiedClient: UnifiedClient,
    private contextEngine: ContextEngine,
    private eventBus: EventBus
  ) {
    // Initialize IntentClassifier and GraphContextBuilder
    const modelRouter = new ModelRouter(unifiedClient);
    this.intentClassifier = new IntentClassifier(modelRouter, agentRegistry);
    
    const traversal = contextEngine.getTraversal();
    if (!traversal) {
      throw new Error('Graph traversal not initialized. Run `nexus init` first.');
    }
    this.graphContextBuilder = new GraphContextBuilder(contextEngine, traversal);
    
    // Periodically clean up expired cache entries
    setInterval(() => this.cleanupExpiredCache(), 60000); // every minute
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Create a new chat session with optional configuration.
   *
   * @param options - Session configuration options (mode, agentName, autoRouting, fullGraphContext)
   * @returns New ChatSession with unique ID, empty history, 'active' status
   *
   * Postconditions:
   *  - Session has unique ID
   *  - Session has empty messages array
   *  - Session status is 'active'
   *  - Session has creation timestamp
   *  - Session mode is set based on options
   *  - autoRouting is enabled for auto mode, disabled for manual mode (unless overridden)
   *  - fullGraphContext is enabled for auto mode, disabled for manual mode (unless overridden)
   */
  createSession(options: ChatSessionOptions | string): ChatSession {
    // Handle legacy string parameter (agentName only)
    let sessionOptions: ChatSessionOptions;
    if (typeof options === 'string') {
      sessionOptions = {
        mode: 'manual',
        agentName: options,
        autoRouting: false,
        fullGraphContext: false,
      };
    } else {
      sessionOptions = options;
    }

    // Validate agent for manual mode
    if (sessionOptions.mode === 'manual' && !sessionOptions.agentName) {
      throw new Error('Agent name is required for manual mode');
    }

    // Validate agent exists
    if (sessionOptions.agentName) {
      const agent = this.agentRegistry.getAgent(sessionOptions.agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${sessionOptions.agentName}`);
      }
    }

    const session: ChatSession = {
      id: uuidv4(),
      mode: sessionOptions.mode,
      agentName: sessionOptions.agentName || 'orchestrator',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      contextFiles: [],
      contextNodeIds: [],
      status: 'active',
      autoRouting: sessionOptions.autoRouting ?? (sessionOptions.mode === 'auto'),
      fullGraphContext: sessionOptions.fullGraphContext ?? (sessionOptions.mode === 'auto'),
      intentHistory: [],
    };

    this.sessions.set(session.id, session);
    logger.info(
      `[ChatService] Created ${session.mode} session ${session.id} with agent ${session.agentName} (autoRouting: ${session.autoRouting}, fullGraphContext: ${session.fullGraphContext})`
    );

    return session;
  }

  /**
   * Send a message to an agent and receive streaming response.
   *
   * @param sessionId - ID of the chat session
   * @param command - Chat command to send
   * @returns AsyncGenerator yielding StreamChunk objects
   *
   * Postconditions:
   *  - User message is appended to session.messages before streaming
   *  - Yields chunks with isComplete = false until final chunk
   *  - Final chunk has isComplete = true
   *  - Agent response is appended to session.messages after completion
   *  - CHAT_MESSAGE_SENT event is emitted
   *  - CHAT_RESPONSE_RECEIVED event is emitted on completion
   *  - If autoRouting enabled, intent is classified and agent may be switched
   *  - If fullGraphContext enabled, graph context is built and added to command
   */
  async *sendMessage(
    sessionId: string,
    command: ChatCommand
  ): AsyncGenerator<StreamChunk> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'closed') {
      throw new Error(`Session is closed: ${sessionId}`);
    }

    // Check rate limit
    if (this.isRateLimited(sessionId)) {
      const tracker = this.rateLimitTrackers.get(sessionId)!;
      const resetTime = tracker.windowStart + RATE_LIMIT_WINDOW_MS;
      const waitSeconds = Math.ceil((resetTime - Date.now()) / 1000);
      
      throw new Error(
        `Rate limit exceeded. Please wait ${waitSeconds} seconds before sending another message.`
      );
    }

    // Auto-routing: classify intent and select agent
    if (session.autoRouting) {
      try {
        const intent = await this.intentClassifier.classify(
          command.content,
          session.messages
        );

        logger.info(
          `[ChatService] Classified intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`
        );

        // Store intent in history
        if (!session.intentHistory) {
          session.intentHistory = [];
        }
        session.intentHistory.push(intent);

        // Switch agent if needed
        const previousAgent = session.agentName;
        if (intent.suggestedAgent !== session.agentName) {
          session.agentName = intent.suggestedAgent;
          logger.info(
            `[ChatService] Switching from ${previousAgent} to ${session.agentName} agent`
          );
          
          // Yield transparency notification
          yield {
            sessionId,
            messageId: uuidv4(),
            chunk: `Switching to ${session.agentName} agent...\n\n`,
            isComplete: false,
          };
        } else {
          // Yield routing notification
          yield {
            sessionId,
            messageId: uuidv4(),
            chunk: `Routing to ${session.agentName}...\n\n`,
            isComplete: false,
          };
        }

        // Build full graph context if enabled
        if (session.fullGraphContext) {
          try {
            const graphContext = await this.graphContextBuilder.buildContext(
              intent,
              DEFAULT_MAX_TOKENS
            );

            logger.info(
              `[ChatService] Built graph context: ${graphContext.summary}`
            );

            // Add graph context to command
            command.graphContext = graphContext;
          } catch (error) {
            logger.error(
              `[ChatService] Error building graph context: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            // Proceed without graph context
          }
        }
      } catch (error) {
        logger.warn(
          `[ChatService] Intent classification failed: ${error instanceof Error ? error.message : 'Unknown error'}, falling back to orchestrator`
        );
        // Fall back to orchestrator agent
        session.agentName = 'orchestrator';
      }
    }

    // Check agent availability
    const agent = this.agentRegistry.getAgent(session.agentName);
    if (!agent) {
      // Queue message for retry
      this.messageQueue.push({
        sessionId,
        command,
        timestamp: new Date(),
      });
      throw new Error(
        `Agent ${session.agentName} is currently unavailable. Message queued for retry.`
      );
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: command.content,
      timestamp: new Date(),
      codeReferences: [],
      graphNodeIds: [],
      isStreaming: false,
    };

    // Append user message to session
    session.messages.push(userMessage);
    session.updatedAt = new Date();

    // Emit CHAT_MESSAGE_SENT event
    this.eventBus.emit(EventType.CHAT_MESSAGE_SENT, {
      sessionId,
      message: userMessage,
    });

    // Update rate limit tracker
    this.updateRateLimit(sessionId);

    // Build context (with per-session caching for performance)
    const traversal = this.contextEngine.getTraversal();
    const context = await this.buildChatContext(
      session,
      command,
      this.contextEngine,
      traversal,
      DEFAULT_MAX_TOKENS
    );

    // Create agent message
    const agentMessageId = uuidv4();
    let fullContent = '';
    const codeReferences: CodeReference[] = [];
    const graphNodeIds: string[] = [];

    try {
      // Stream response from agent
      const prompt = this.buildPrompt(command, context);
      
      // Simulate streaming (in real implementation, this would call UnifiedClient)
      // For now, we'll use the agent's execute method and simulate streaming
      const result = await agent.execute(command.content, context);
      
      // Simulate streaming by chunking the response
      const chunks = this.chunkResponse(result.output);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isComplete = i === chunks.length - 1;
        
        fullContent += chunk;
        
        yield {
          sessionId,
          messageId: agentMessageId,
          chunk,
          isComplete,
          codeReferences: isComplete ? codeReferences : undefined,
          graphNodeIds: isComplete ? graphNodeIds : undefined,
        };
      }

      // Create complete agent message
      const agentMessage: ChatMessage = {
        id: agentMessageId,
        role: 'agent',
        agentName: session.agentName,
        content: fullContent,
        timestamp: new Date(),
        codeReferences,
        graphNodeIds,
        isStreaming: false,
        tokenUsage: result.tokensUsed
          ? { input: 0, output: result.tokensUsed }
          : undefined,
      };

      // Append agent message to session
      session.messages.push(agentMessage);
      session.updatedAt = new Date();

      // Emit CHAT_RESPONSE_RECEIVED event
      this.eventBus.emit(EventType.CHAT_RESPONSE_RECEIVED, {
        sessionId,
        message: agentMessage,
      });

      logger.info(
        `[ChatService] Completed message exchange in session ${sessionId}`
      );
    } catch (error) {
      logger.error(
        `[ChatService] Error streaming message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      
      // Yield error chunk
      yield {
        sessionId,
        messageId: agentMessageId,
        chunk: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isComplete: true,
      };
    }
  }

  /**
   * Build chat context from conversation history, code files, and graph nodes.
   *
   * @param session - Current chat session
   * @param command - Current command
   * @param contextEngine - Context engine for retrieving code
   * @param traversal - Graph traversal for exploring relationships
   * @param maxTokens - Maximum token budget
   * @returns Context string
   *
   * Postconditions:
   *  - Context includes recent conversation history
   *  - Context includes code from session.contextFiles
   *  - Context includes graph neighborhood for session.contextNodeIds
   *  - Total tokens <= maxTokens
   *  - Explicitly referenced files/nodes have higher priority
   *  - Oldest messages are truncated when context is too large
   */
  async buildChatContext(
    session: ChatSession,
    command: ChatCommand,
    contextEngine: ContextEngine,
    traversal: GraphTraversal | null,
    maxTokens: number
  ): Promise<string> {
    // Generate a cache key based on session ID, recent messages, and command context
    const cacheKey = this.buildContextCacheKey(session, command);

    // Check per-session context cache
    const cached = this.contextCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONTEXT_CACHE_TTL_MS) {
      logger.debug(
        `[ChatService] Using cached context for session ${session.id} (${cached.tokenCount} tokens)`
      );
      return cached.context;
    }

    const contextParts: string[] = [];
    let estimatedTokens = 0;

    // Helper to estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

    // 1. Add recent conversation history (last 10 messages)
    const recentMessages = session.messages.slice(-10);
    if (recentMessages.length > 0) {
      const conversationHistory = recentMessages
        .map(
          (m) =>
            `${m.role === 'user' ? 'User' : `Agent (${m.agentName})`}: ${m.content}`
        )
        .join('\n\n');
      
      const historyTokens = estimateTokens(conversationHistory);
      if (estimatedTokens + historyTokens <= maxTokens) {
        contextParts.push('## Conversation History\n\n' + conversationHistory);
        estimatedTokens += historyTokens;
      }
    }

    // 2. Add explicitly referenced file (if any)
    if (command.targetFile) {
      try {
        const fileContent = await contextEngine.getFileContent(command.targetFile);
        const fileTokens = estimateTokens(fileContent);
        
        if (estimatedTokens + fileTokens <= maxTokens) {
          contextParts.push(`## File: ${command.targetFile}\n\n\`\`\`\n${fileContent}\n\`\`\``);
          estimatedTokens += fileTokens;
        }
      } catch (error) {
        logger.warn(`[ChatService] Could not load file ${command.targetFile}`);
      }
    }

    // 3. Add explicitly referenced node (if any)
    if (command.targetNode && traversal) {
      const node = traversal.getNode(command.targetNode);
      if (node) {
        const nodeInfo = `## Graph Node: ${node.name}\n\nType: ${node.type}\nFile: ${node.file}:${node.line}\nSignature: ${node.signature}\n`;
        const nodeTokens = estimateTokens(nodeInfo);
        
        if (estimatedTokens + nodeTokens <= maxTokens) {
          contextParts.push(nodeInfo);
          estimatedTokens += nodeTokens;
        }
      }
    }

    // 4. Add context files from session
    for (const file of session.contextFiles) {
      if (estimatedTokens >= maxTokens * 0.8) break; // Reserve 20% for other context
      
      try {
        const fileContent = await contextEngine.getFileContent(file);
        const fileTokens = estimateTokens(fileContent);
        
        if (estimatedTokens + fileTokens <= maxTokens) {
          contextParts.push(`## Context File: ${file}\n\n\`\`\`\n${fileContent}\n\`\`\``);
          estimatedTokens += fileTokens;
        }
      } catch (error) {
        logger.warn(`[ChatService] Could not load context file ${file}`);
      }
    }

    // 5. Add graph neighborhood for context nodes
    if (traversal && session.contextNodeIds.length > 0) {
      for (const nodeId of session.contextNodeIds) {
        if (estimatedTokens >= maxTokens * 0.9) break;
        
        const node = traversal.getNode(nodeId);
        if (node) {
          const neighbors = traversal.getRelatedNodes(nodeId, undefined, 5);
          const neighborInfo = `## Graph Context: ${node.name}\n\nRelated nodes: ${neighbors.map(n => n.name).join(', ')}\n`;
          const neighborTokens = estimateTokens(neighborInfo);
          
          if (estimatedTokens + neighborTokens <= maxTokens) {
            contextParts.push(neighborInfo);
            estimatedTokens += neighborTokens;
          }
        }
      }
    }

    const finalContext = contextParts.join('\n\n---\n\n');
    
    // Cache the result for this session
    this.contextCache.set(cacheKey, {
      context: finalContext,
      timestamp: Date.now(),
      tokenCount: estimatedTokens,
    });

    logger.debug(
      `[ChatService] Built context: ${estimatedTokens} tokens (limit: ${maxTokens})`
    );

    return finalContext;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all sessions, ordered by updatedAt descending.
   */
  listSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Close a session.
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      session.updatedAt = new Date();
      logger.info(`[ChatService] Closed session ${sessionId}`);
    }
  }

  // -----------------------------------------------------------------------
  // Cross-feature integration: Chat ↔ Search
  // -----------------------------------------------------------------------

  /**
   * Create a ChatSearchIntegration instance for connecting chat to search
   * and impact analysis services.
   *
   * @param callbacks - Callback functions for each integration point
   * @returns ChatSearchIntegration object with search and analysis methods
   */
  createSearchIntegration(callbacks: {
    onSearchForContext: (query: string) => Promise<Array<import('../types/search').SearchResult>>;
    onOpenCodeReference: (ref: CodeReference) => void;
    onAnalyzeImpact: (nodeId: string) => Promise<import('../types/impact').ImpactAnalysis>;
  }): import('../types/chat').ChatSearchIntegration {
    return {
      searchForContext: async (query: string) => {
        logger.info(`[ChatService] Searching for context: ${query}`);
        try {
          return await callbacks.onSearchForContext(query);
        } catch (error) {
          logger.error(
            `[ChatService] Error searching for context: ${error instanceof Error ? error.message : String(error)}`
          );
          return [];
        }
      },
      openCodeReference: (ref: CodeReference) => {
        logger.info(
          `[ChatService] Opening code reference: ${ref.file}:${ref.startLine}-${ref.endLine}`
        );
        callbacks.onOpenCodeReference(ref);
      },
      analyzeImpact: async (nodeId: string) => {
        logger.info(`[ChatService] Analyzing impact for node: ${nodeId}`);
        return await callbacks.onAnalyzeImpact(nodeId);
      },
    };
  }

  /**
   * Build a cache key for context based on session state.
   */
  private buildContextCacheKey(session: ChatSession, command: ChatCommand): string {
    // Include session ID, last 3 message IDs, context files, and command target
    const recentMessageIds = session.messages.slice(-3).map(m => m.id).join(',');
    const contextFiles = session.contextFiles.join(',');
    const contextNodes = session.contextNodeIds.join(',');
    const target = command.targetFile || command.targetNode || '';
    
    return `${session.id}:${recentMessageIds}:${contextFiles}:${contextNodes}:${target}`;
  }

  /**
   * Clean up expired cache entries.
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.contextCache.entries()) {
      if (now - cached.timestamp > CONTEXT_CACHE_TTL_MS) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.contextCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[ChatService] Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Check if a session is rate limited.
   */
  private isRateLimited(sessionId: string): boolean {
    const tracker = this.rateLimitTrackers.get(sessionId);
    if (!tracker) return false;

    const now = Date.now();
    const windowElapsed = now - tracker.windowStart;

    if (windowElapsed >= RATE_LIMIT_WINDOW_MS) {
      // Window expired, reset
      this.rateLimitTrackers.delete(sessionId);
      return false;
    }

    return tracker.count >= RATE_LIMIT_MESSAGES_PER_MINUTE;
  }

  /**
   * Update rate limit tracker for a session.
   */
  private updateRateLimit(sessionId: string): void {
    const now = Date.now();
    const tracker = this.rateLimitTrackers.get(sessionId);

    if (!tracker || now - tracker.windowStart >= RATE_LIMIT_WINDOW_MS) {
      // Start new window
      this.rateLimitTrackers.set(sessionId, {
        count: 1,
        windowStart: now,
      });
    } else {
      // Increment count in current window
      tracker.count++;
    }
  }

  /**
   * Build prompt for agent from command and context.
   */
  private buildPrompt(command: ChatCommand, context: string): string {
    let prompt = '';

    if (context) {
      prompt += `Context:\n${context}\n\n`;
    }

    prompt += `User Request (${command.type}):\n${command.content}`;

    if (command.targetFile) {
      prompt += `\n\nTarget File: ${command.targetFile}`;
    }

    if (command.targetNode) {
      prompt += `\n\nTarget Node: ${command.targetNode}`;
    }

    return prompt;
  }

  /**
   * Chunk a response into smaller pieces for streaming simulation.
   */
  private chunkResponse(response: string): string[] {
    const chunkSize = 50; // characters per chunk
    const chunks: string[] = [];
    
    for (let i = 0; i < response.length; i += chunkSize) {
      chunks.push(response.substring(i, i + chunkSize));
    }
    
    return chunks.length > 0 ? chunks : [''];
  }
}
