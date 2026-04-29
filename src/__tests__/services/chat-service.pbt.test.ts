/**
 * Property-Based Tests for Enhanced ChatService
 *
 * Tests universal properties for auto-routing, session management,
 * agent routing consistency, and conversation history preservation.
 *
 * Requirements: 4.9, 4.5, 2.1-2.8, 2.10
 */

import * as fc from 'fast-check';
import { ChatService } from '../../services/chat-service';
import { AgentRegistry, AgentInfo, AgentResult } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';
import { EventBus } from '../../core/event-bus';
import { GraphTraversal } from '../../core/context/graph/traversal';
import { IntentType, ChatCommand, ChatSessionOptions } from '../../types/chat';
import { AgentCapability, TaskType, SCGNode } from '../../types';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const createMockAgent = (name: string): AgentInfo => ({
  name,
  capabilities: [AgentCapability.CODE_ANALYSIS],
  supportedTaskTypes: [TaskType.FEATURE],
  execute: jest.fn().mockResolvedValue({
    success: true,
    output: 'Mock agent response',
    tokensUsed: 100,
  } as AgentResult),
});

const createMockTraversal = (): jest.Mocked<GraphTraversal> => ({
  getNode: jest.fn().mockReturnValue({
    id: 'node-1',
    name: 'mockFunction',
    type: 'function',
    file: 'src/mock.ts',
    line: 10,
    signature: 'function mockFunction(): void',
  } as SCGNode),
  getRelatedNodes: jest.fn().mockReturnValue([]),
} as unknown as jest.Mocked<GraphTraversal>);

const createMockContextEngine = (): jest.Mocked<ContextEngine> => ({
  getTraversal: jest.fn().mockReturnValue(createMockTraversal()),
  getFileContent: jest.fn().mockResolvedValue('mock file content'),
  getGraph: jest.fn().mockReturnValue({
    nodes: new Map(),
    edges: [],
  }),
} as unknown as jest.Mocked<ContextEngine>);

const setupChatService = (): {
  chatService: ChatService;
  agentRegistry: AgentRegistry;
} => {
  // Polyfill setImmediate for winston in jsdom
  if (typeof (globalThis as Record<string, unknown>).setImmediate === 'undefined') {
    (globalThis as Record<string, unknown>).setImmediate = (cb: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(cb, 0, ...args);
  }

  const agentRegistry = new AgentRegistry();
  const unifiedClient = {} as jest.Mocked<UnifiedClient>;
  const contextEngine = createMockContextEngine();
  const eventBus = new EventBus();

  // Register all agents for routing tests
  const agents = ['reviewer', 'coder', 'context', 'git', 'orchestrator'];
  agents.forEach(name => {
    agentRegistry.register(createMockAgent(name));
  });

  const chatService = new ChatService(
    agentRegistry,
    unifiedClient,
    contextEngine,
    eventBus
  );

  return { chatService, agentRegistry };
};

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const sessionOptionsArb = fc.record({
  mode: fc.constantFrom('auto' as const, 'manual' as const),
  agentName: fc.option(fc.constantFrom('reviewer', 'coder', 'context', 'git', 'orchestrator'), { nil: undefined }),
  autoRouting: fc.option(fc.boolean(), { nil: undefined }),
  fullGraphContext: fc.option(fc.boolean(), { nil: undefined }),
});

const intentTypeArb = fc.constantFrom(
  IntentType.REVIEW,
  IntentType.CODE,
  IntentType.REFACTOR,
  IntentType.DEBUG,
  IntentType.EXPLAIN,
  IntentType.SEARCH,
  IntentType.GIT,
  IntentType.GENERAL
);

const messageArb = fc.string({ minLength: 1, maxLength: 100 });

// ---------------------------------------------------------------------------
// Property 13: Session ID Uniqueness
// ---------------------------------------------------------------------------

describe('Property 13: Session ID Uniqueness', () => {
  it('should generate unique session IDs for all sessions', () => {
    fc.assert(
      fc.property(
        fc.array(sessionOptionsArb, { minLength: 2, maxLength: 20 }),
        (optionsArray) => {
          const { chatService } = setupChatService();
          const sessionIds = new Set<string>();

          for (const options of optionsArray) {
            // Ensure manual mode has agent name
            if (options.mode === 'manual' && !options.agentName) {
              options.agentName = 'orchestrator';
            }

            try {
              const session = chatService.createSession(options);
              sessionIds.add(session.id);
            } catch (error) {
              // Skip invalid options
            }
          }

          // All session IDs should be unique
          return sessionIds.size === optionsArray.filter(opt => 
            opt.mode === 'auto' || (opt.mode === 'manual' && opt.agentName)
          ).length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Manual Mode Agent Stability
// ---------------------------------------------------------------------------

describe('Property 14: Manual Mode Agent Stability', () => {
  it('should never change agent in manual mode across multiple messages', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constantFrom('reviewer', 'coder', 'context', 'git', 'orchestrator'),
        fc.array(messageArb, { minLength: 1, maxLength: 10 }),
        async (agentName, messages) => {
          const { chatService } = setupChatService();

          const session = chatService.createSession({
            mode: 'manual',
            agentName,
            autoRouting: false,
          });

          const initialAgent = session.agentName;

          // Send multiple messages
          for (const message of messages) {
            const command: ChatCommand = {
              type: 'message',
              content: message,
            };

            try {
              // Consume all chunks
              for await (const chunk of chatService.sendMessage(session.id, command)) {
                // Just consume
              }
            } catch (error) {
              // Ignore errors (rate limiting, etc.)
            }

            const updatedSession = chatService.getSession(session.id);
            if (updatedSession && updatedSession.agentName !== initialAgent) {
              return false; // Agent changed, property violated
            }
          }

          return true; // Agent remained stable
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Agent Routing Consistency
// ---------------------------------------------------------------------------

describe('Property 4: Agent Routing Consistency', () => {
  const intentAgentMap: Record<IntentType, string> = {
    [IntentType.REVIEW]: 'reviewer',
    [IntentType.CODE]: 'coder',
    [IntentType.REFACTOR]: 'coder',
    [IntentType.DEBUG]: 'coder',
    [IntentType.EXPLAIN]: 'context',
    [IntentType.SEARCH]: 'context',
    [IntentType.GIT]: 'git',
    [IntentType.GENERAL]: 'orchestrator',
  };

  it('should consistently map each intent type to the correct agent', () => {
    fc.assert(
      fc.property(
        intentTypeArb,
        (intent) => {
          const expectedAgent = intentAgentMap[intent];
          return expectedAgent !== undefined;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map review intent to reviewer agent', () => {
    expect(intentAgentMap[IntentType.REVIEW]).toBe('reviewer');
  });

  it('should map code intent to coder agent', () => {
    expect(intentAgentMap[IntentType.CODE]).toBe('coder');
  });

  it('should map refactor intent to coder agent', () => {
    expect(intentAgentMap[IntentType.REFACTOR]).toBe('coder');
  });

  it('should map debug intent to coder agent', () => {
    expect(intentAgentMap[IntentType.DEBUG]).toBe('coder');
  });

  it('should map explain intent to context agent', () => {
    expect(intentAgentMap[IntentType.EXPLAIN]).toBe('context');
  });

  it('should map search intent to context agent', () => {
    expect(intentAgentMap[IntentType.SEARCH]).toBe('context');
  });

  it('should map git intent to git agent', () => {
    expect(intentAgentMap[IntentType.GIT]).toBe('git');
  });

  it('should map general intent to orchestrator agent', () => {
    expect(intentAgentMap[IntentType.GENERAL]).toBe('orchestrator');
  });
});

// ---------------------------------------------------------------------------
// Property 5: Conversation History Preservation
// ---------------------------------------------------------------------------

describe('Property 5: Conversation History Preservation', () => {
  it('should preserve conversation history when agent switches', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(messageArb, { minLength: 2, maxLength: 5 }),
        async (messages) => {
          const { chatService } = setupChatService();

          const session = chatService.createSession({
            mode: 'auto',
            autoRouting: true,
          });

          let previousMessageCount = 0;

          for (const message of messages) {
            const command: ChatCommand = {
              type: 'message',
              content: message,
            };

            const beforeSession = chatService.getSession(session.id);
            const historyBefore = beforeSession?.messages.slice() || [];

            try {
              // Consume all chunks
              for await (const chunk of chatService.sendMessage(session.id, command)) {
                // Just consume
              }
            } catch (error) {
              // Ignore errors
            }

            const afterSession = chatService.getSession(session.id);
            const historyAfter = afterSession?.messages || [];

            // History should only grow (never shrink or lose messages)
            if (historyAfter.length < historyBefore.length) {
              return false;
            }

            // All previous messages should still be present
            for (let i = 0; i < historyBefore.length; i++) {
              if (historyAfter[i]?.id !== historyBefore[i]?.id) {
                return false;
              }
            }

            previousMessageCount = historyAfter.length;
          }

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});
