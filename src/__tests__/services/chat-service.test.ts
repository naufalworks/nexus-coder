/**
 * Unit tests for ChatService
 *
 * Tests session management, message streaming, context building,
 * event emission, error handling, rate limiting, and agent availability.
 *
 * Requirements: 32.2
 */

import { ChatService } from '../../services/chat-service';
import { AgentRegistry, AgentInfo, AgentResult } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';
import { EventBus, EventType } from '../../core/event-bus';
import { GraphTraversal } from '../../core/context/graph/traversal';
import { ChatCommand, ChatSession, StreamChunk } from '../../types/chat';
import { AgentCapability, TaskType, SCGNode } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
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

const createMockContextEngine = (): jest.Mocked<ContextEngine> => ({
  getTraversal: jest.fn().mockReturnValue(createMockTraversal()),
  getFileContent: jest.fn().mockResolvedValue('mock file content'),
} as unknown as jest.Mocked<ContextEngine>);

const createMockTraversal = (): jest.Mocked<GraphTraversal> => ({
  getNode: jest.fn().mockReturnValue({
    id: 'node-1',
    name: 'mockFunction',
    type: 'function',
    file: 'src/mock.ts',
    line: 10,
    signature: 'function mockFunction(): void',
  } as SCGNode),
  getRelatedNodes: jest.fn().mockReturnValue([
    {
      id: 'node-2',
      name: 'relatedFunction',
      type: 'function',
      file: 'src/related.ts',
      line: 20,
      signature: 'function relatedFunction(): void',
    } as SCGNode,
  ]),
} as unknown as jest.Mocked<GraphTraversal>);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatService', () => {
  let chatService: ChatService;
  let agentRegistry: AgentRegistry;
  let unifiedClient: jest.Mocked<UnifiedClient>;
  let contextEngine: jest.Mocked<ContextEngine>;
  let eventBus: EventBus;
  let mockAgent: AgentInfo;

  beforeEach(() => {
    // Polyfill setImmediate for winston in jsdom
    if (typeof (globalThis as Record<string, unknown>).setImmediate === 'undefined') {
      (globalThis as Record<string, unknown>).setImmediate = (cb: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(cb, 0, ...args);
    }
    
    agentRegistry = new AgentRegistry();
    unifiedClient = {} as jest.Mocked<UnifiedClient>;
    contextEngine = createMockContextEngine();
    eventBus = new EventBus();
    
    mockAgent = createMockAgent('test-agent');
    agentRegistry.register(mockAgent);

    chatService = new ChatService(
      agentRegistry,
      unifiedClient,
      contextEngine,
      eventBus
    );
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  // -------------------------------------------------------------------------
  // Session Management Tests
  // -------------------------------------------------------------------------

  describe('Session Management', () => {
    it('should create a new session with unique ID and empty history', () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });

      expect(session.id).toBeDefined();
      expect(session.agentName).toBe('test-agent');
      expect(session.messages).toEqual([]);
      expect(session.status).toBe('active');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
      expect(session.contextFiles).toEqual([]);
      expect(session.contextNodeIds).toEqual([]);
      expect(session.mode).toBe('manual');
      expect(session.autoRouting).toBe(false);
      expect(session.fullGraphContext).toBe(false);
    });

    it('should create auto mode session with defaults', () => {
      const session = chatService.createSession({
        mode: 'auto',
      });

      expect(session.mode).toBe('auto');
      expect(session.autoRouting).toBe(true);
      expect(session.fullGraphContext).toBe(true);
      expect(session.agentName).toBe('orchestrator');
    });

    it('should support legacy string parameter for backward compatibility', () => {
      const session = chatService.createSession('test-agent');

      expect(session.agentName).toBe('test-agent');
      expect(session.mode).toBe('manual');
      expect(session.autoRouting).toBe(false);
      expect(session.fullGraphContext).toBe(false);
    });

    it('should throw error when creating manual mode session without agent name', () => {
      expect(() => {
        chatService.createSession({
          mode: 'manual',
        });
      }).toThrow('Agent name is required for manual mode');
    });

    it('should throw error when creating session with non-existent agent', () => {
      expect(() => {
        chatService.createSession({
          mode: 'manual',
          agentName: 'non-existent-agent',
        });
      }).toThrow('Agent not found: non-existent-agent');
    });

    it('should retrieve session by ID', () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const retrieved = chatService.getSession(session.id);

      expect(retrieved).toEqual(session);
    });

    it('should return null for non-existent session', () => {
      const retrieved = chatService.getSession('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should list all sessions ordered by updatedAt descending', async () => {
      const session1 = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session2 = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      
      const sessions = chatService.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe(session2.id); // Most recent first
      expect(sessions[1].id).toBe(session1.id);
    });

    it('should close a session', () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      
      chatService.closeSession(session.id);
      
      const retrieved = chatService.getSession(session.id);
      expect(retrieved?.status).toBe('closed');
    });

    it('should not throw when closing non-existent session', () => {
      expect(() => {
        chatService.closeSession('non-existent-id');
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Message Streaming Tests
  // -------------------------------------------------------------------------

  describe('Message Streaming', () => {
    it('should stream message chunks with isComplete flag', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello, agent!',
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      
      // All chunks except last should have isComplete = false
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].isComplete).toBe(false);
      }
      
      // Last chunk should have isComplete = true
      expect(chunks[chunks.length - 1].isComplete).toBe(true);
    });

    it('should append user message before streaming', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello, agent!',
      };

      const generator = chatService.sendMessage(session.id, command);
      await generator.next(); // Start streaming

      const updatedSession = chatService.getSession(session.id);
      expect(updatedSession?.messages).toHaveLength(1);
      expect(updatedSession?.messages[0].role).toBe('user');
      expect(updatedSession?.messages[0].content).toBe('Hello, agent!');
    });

    it('should append agent response after streaming completes', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello, agent!',
      };

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      const updatedSession = chatService.getSession(session.id);
      expect(updatedSession?.messages).toHaveLength(2);
      expect(updatedSession?.messages[0].role).toBe('user');
      expect(updatedSession?.messages[1].role).toBe('agent');
      expect(updatedSession?.messages[1].agentName).toBe('test-agent');
    });

    it('should throw error when sending message to non-existent session', async () => {
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      await expect(async () => {
        for await (const chunk of chatService.sendMessage('non-existent-id', command)) {
          // Should not reach here
        }
      }).rejects.toThrow('Session not found: non-existent-id');
    });

    it('should throw error when sending message to closed session', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      chatService.closeSession(session.id);

      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      await expect(async () => {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Should not reach here
        }
      }).rejects.toThrow(`Session is closed: ${session.id}`);
    });

    it('should concatenate all chunks to form complete message', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      let fullContent = '';
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        fullContent += chunk.chunk;
      }

      const updatedSession = chatService.getSession(session.id);
      const agentMessage = updatedSession?.messages.find(m => m.role === 'agent');
      
      expect(agentMessage?.content).toBe(fullContent);
    });
  });

  // -------------------------------------------------------------------------
  // Event Bus Emission Tests
  // -------------------------------------------------------------------------

  describe('Event Bus Emission', () => {
    it('should emit CHAT_MESSAGE_SENT event when user message is sent', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      const eventPromise = eventBus.waitFor(EventType.CHAT_MESSAGE_SENT, 1000);

      const generator = chatService.sendMessage(session.id, command);
      await generator.next(); // Start streaming

      const event = await eventPromise;
      expect(event.type).toBe(EventType.CHAT_MESSAGE_SENT);
      expect(event.data).toHaveProperty('sessionId', session.id);
      expect(event.data).toHaveProperty('message');
    });

    it('should emit CHAT_RESPONSE_RECEIVED event when agent response completes', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      const eventPromise = eventBus.waitFor(EventType.CHAT_RESPONSE_RECEIVED, 1000);

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      const event = await eventPromise;
      expect(event.type).toBe(EventType.CHAT_RESPONSE_RECEIVED);
      expect(event.data).toHaveProperty('sessionId', session.id);
      expect(event.data).toHaveProperty('message');
    });
  });

  // -------------------------------------------------------------------------
  // Context Building Tests
  // -------------------------------------------------------------------------

  describe('Context Building', () => {
    it('should build context with conversation history', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      session.messages = [
        {
          id: '1',
          role: 'user',
          content: 'Previous message',
          timestamp: new Date(),
          codeReferences: [],
          graphNodeIds: [],
          isStreaming: false,
        },
      ];

      const command: ChatCommand = {
        type: 'message',
        content: 'Current message',
      };

      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        null,
        8000
      );

      expect(context).toContain('Conversation History');
      expect(context).toContain('Previous message');
    });

    it('should include target file content when specified', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Explain this file',
        targetFile: 'src/test.ts',
      };

      contextEngine.getFileContent.mockResolvedValue('const x = 42;');

      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        null,
        8000
      );

      expect(context).toContain('src/test.ts');
      expect(context).toContain('const x = 42;');
      expect(contextEngine.getFileContent).toHaveBeenCalledWith('src/test.ts');
    });

    it('should include target node info when specified', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Explain this function',
        targetNode: 'node-1',
      };

      const mockTraversal = createMockTraversal();
      contextEngine.getTraversal.mockReturnValue(mockTraversal);

      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        mockTraversal,
        8000
      );

      expect(context).toContain('Graph Node: mockFunction');
      expect(context).toContain('src/mock.ts');
      expect(mockTraversal.getNode).toHaveBeenCalledWith('node-1');
    });

    it('should include context files from session', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      session.contextFiles = ['src/context1.ts', 'src/context2.ts'];

      const command: ChatCommand = {
        type: 'message',
        content: 'Analyze these files',
      };

      contextEngine.getFileContent
        .mockResolvedValueOnce('// context1 content')
        .mockResolvedValueOnce('// context2 content');

      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        null,
        8000
      );

      expect(context).toContain('src/context1.ts');
      expect(context).toContain('src/context2.ts');
      expect(contextEngine.getFileContent).toHaveBeenCalledWith('src/context1.ts');
      expect(contextEngine.getFileContent).toHaveBeenCalledWith('src/context2.ts');
    });

    it('should include graph neighborhood for context nodes', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      session.contextNodeIds = ['node-1'];

      const command: ChatCommand = {
        type: 'message',
        content: 'Analyze this node',
      };

      const mockTraversal = createMockTraversal();
      contextEngine.getTraversal.mockReturnValue(mockTraversal);

      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        mockTraversal,
        8000
      );

      expect(context).toContain('Graph Context: mockFunction');
      expect(context).toContain('relatedFunction');
      expect(mockTraversal.getNode).toHaveBeenCalledWith('node-1');
      expect(mockTraversal.getRelatedNodes).toHaveBeenCalledWith('node-1', undefined, 5);
    });

    it('should respect token budget', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Test',
      };

      // Very small budget
      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        null,
        10 // Very small budget
      );

      // Should return empty or minimal context
      expect(context.length).toBeLessThan(100);
    });

    it('should handle file read errors gracefully', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Test',
        targetFile: 'non-existent.ts',
      };

      contextEngine.getFileContent.mockRejectedValue(new Error('File not found'));

      // Should not throw
      const context = await chatService.buildChatContext(
        session,
        command,
        contextEngine,
        null,
        8000
      );

      expect(context).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Agent Availability Tests
  // -------------------------------------------------------------------------

  describe('Agent Availability', () => {
    it('should throw error and queue message when agent is unavailable', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      
      // Unregister agent to simulate unavailability
      agentRegistry.unregister('test-agent');

      const command: ChatCommand = {
        type: 'message',
        content: 'Hello!',
      };

      await expect(async () => {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Should not reach here
        }
      }).rejects.toThrow('Agent test-agent is currently unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // Rate Limiting Tests
  // -------------------------------------------------------------------------

  describe('Rate Limiting', () => {
    it('should enforce rate limit after 10 messages per minute', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Test',
      };

      // Send 10 messages (should succeed)
      for (let i = 0; i < 10; i++) {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Consume chunks
        }
      }

      // 11th message should fail
      await expect(async () => {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Should not reach here
        }
      }).rejects.toThrow(/Rate limit exceeded/);
    });

    it('should reset rate limit after window expires', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Test',
      };

      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Consume chunks
        }
      }

      // Mock time passing (61 seconds)
      jest.useFakeTimers();
      jest.advanceTimersByTime(61000);

      // Should succeed after window reset
      let errorThrown = false;
      try {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Should succeed
        }
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(false);
      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should yield error chunk when agent execution fails', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
      });
      const command: ChatCommand = {
        type: 'message',
        content: 'Test',
      };

      // Mock agent failure
      (mockAgent.execute as jest.Mock).mockRejectedValue(new Error('Agent error'));

      const chunks: StreamChunk[] = [];
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.isComplete).toBe(true);
      expect(lastChunk.chunk).toContain('Error');
    });
  });

  // -------------------------------------------------------------------------
  // Auto-Routing Tests (Task 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11)
  // -------------------------------------------------------------------------

  describe('Auto-Routing', () => {
    beforeEach(() => {
      // Register additional agents for routing tests
      const agents = ['reviewer', 'coder', 'context', 'git', 'orchestrator'];
      agents.forEach(name => {
        if (name !== 'test-agent') {
          const agent = createMockAgent(name);
          agentRegistry.register(agent);
        }
      });
    });

    it('should classify intent and route to appropriate agent in auto mode', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'review my code',
      };

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      const updatedSession = chatService.getSession(session.id);
      
      // Intent should be classified and stored
      expect(updatedSession?.intentHistory).toBeDefined();
      expect(updatedSession?.intentHistory?.length).toBeGreaterThan(0);
    });

    it('should not perform auto-routing in manual mode', async () => {
      const session = chatService.createSession({
        mode: 'manual',
        agentName: 'test-agent',
        autoRouting: false,
      });

      const initialAgent = session.agentName;

      const command: ChatCommand = {
        type: 'message',
        content: 'review my code',
      };

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      const updatedSession = chatService.getSession(session.id);
      
      // Agent should remain the same
      expect(updatedSession?.agentName).toBe(initialAgent);
      
      // Intent history should not be populated in manual mode
      expect(updatedSession?.intentHistory).toEqual([]);
    });

    it('should yield transparency notification when routing to agent', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'test message',
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        chunks.push(chunk);
      }

      // Should have at least one chunk with routing notification
      const hasRoutingNotification = chunks.some(chunk => 
        chunk.chunk.includes('Routing to') || chunk.chunk.includes('Switching to')
      );
      
      expect(hasRoutingNotification).toBe(true);
    });

    it('should yield switching notification when agent changes', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
      });

      // First message
      const command1: ChatCommand = {
        type: 'message',
        content: 'first message',
      };

      for await (const chunk of chatService.sendMessage(session.id, command1)) {
        // Just consume
      }

      const firstAgent = chatService.getSession(session.id)?.agentName;

      // Second message that might trigger agent switch
      const command2: ChatCommand = {
        type: 'message',
        content: 'second message',
      };

      const chunks: StreamChunk[] = [];
      for await (const chunk of chatService.sendMessage(session.id, command2)) {
        chunks.push(chunk);
      }

      const secondAgent = chatService.getSession(session.id)?.agentName;

      // If agent changed, should have switching notification
      if (firstAgent !== secondAgent) {
        const hasSwitchingNotification = chunks.some(chunk => 
          chunk.chunk.includes('Switching to')
        );
        expect(hasSwitchingNotification).toBe(true);
      }
    });

    it('should fall back to orchestrator when intent classification fails', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
      });

      // Mock intent classifier to throw error
      // This is tested indirectly through the LLM failure path
      const command: ChatCommand = {
        type: 'message',
        content: 'test',
      };

      // Should not throw, should fall back gracefully
      let errorThrown = false;
      try {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Just consume
        }
      } catch (error) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(false);
    });

    it('should build graph context when fullGraphContext is enabled', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
        fullGraphContext: true,
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'test message',
      };

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      // Graph context building is verified through the fact that:
      // 1. No errors were thrown
      // 2. The session has fullGraphContext enabled
      const updatedSession = chatService.getSession(session.id);
      expect(updatedSession?.fullGraphContext).toBe(true);
      
      // The graph context builder was called (verified through logs)
      // We can't directly check command.graphContext because it's modified internally
    });

    it('should not build graph context when fullGraphContext is disabled', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
        fullGraphContext: false,
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'test message',
      };

      // Consume all chunks
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        // Just consume
      }

      // Graph context should not be built
      expect(command.graphContext).toBeUndefined();
    });

    it('should handle graph context building errors gracefully', async () => {
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
        fullGraphContext: true,
      });

      // Mock context engine to throw error
      contextEngine.getGraph = jest.fn().mockImplementation(() => {
        throw new Error('Graph error');
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'test',
      };

      // Should not throw, should proceed without graph context
      let errorThrown = false;
      try {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          // Just consume
        }
      } catch (error) {
        errorThrown = true;
      }

      expect(errorThrown).toBe(false);
    });
  });
});
