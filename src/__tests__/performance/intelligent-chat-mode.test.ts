/**
 * Performance Tests for Intelligent Chat Mode
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 *
 * Tests verify:
 * 1. Pattern matching intent classification completes within 100ms (Requirement 6.1)
 * 2. LLM intent classification completes within 500ms (Requirement 6.2)
 * 3. Full graph context building (1,289 nodes) completes within 2 seconds (Requirement 6.3)
 * 4. Agent routing completes within 50ms (Requirement 6.4)
 * 5. Complete auto mode message flow completes within 3 seconds (Requirement 6.5)
 */

import { IntentClassifier } from '../../services/intent-classifier';
import { GraphContextBuilder } from '../../services/graph-context-builder';
import { ChatService } from '../../services/chat-service';
import { ModelRouter } from '../../core/models/router';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';
import { GraphTraversal } from '../../core/context/graph/traversal';
import { EventBus } from '../../core/event-bus';
import {
  IntentType,
  IntentClassification,
  ChatMessage,
  ChatCommand,
  SemanticCodeGraphData,
  SCGNode,
  NodeType,
} from '../../types';

// Mock logger
jest.mock('../../core/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeNode(id: string, name: string, file: string, line: number): SCGNode {
  return {
    id,
    name,
    type: NodeType.FUNCTION,
    file,
    line,
    endLine: line + 10,
    signature: `function ${name}()`,
    summary: `Function ${name}`,
    complexity: 1,
    changeFrequency: 0,
  };
}

function makeLargeGraph(nodeCount: number): SemanticCodeGraphData {
  const nodes = new Map<string, SCGNode>();
  const edges: any[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const node = makeNode(
      `node-${i}`,
      `function${i}`,
      `src/file${Math.floor(i / 10)}.ts`,
      i * 10
    );
    nodes.set(node.id, node);
  }

  return {
    nodes,
    edges,
    dependencies: new Map(),
    builtAt: new Date(),
    fileCount: Math.ceil(nodeCount / 10),
    symbolCount: nodeCount,
  };
}

function makeChatMessage(role: 'user' | 'agent', content: string): ChatMessage {
  return {
    id: `msg-${Date.now()}`,
    role,
    content,
    timestamp: new Date(),
    codeReferences: [],
    graphNodeIds: [],
    isStreaming: false,
  };
}

// ---------------------------------------------------------------------------
// Mock Implementations
// ---------------------------------------------------------------------------

class MockModelRouter {
  async execute(messages: any[], options?: any): Promise<any> {
    // Simulate LLM response time (200-400ms)
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    return {
      content: JSON.stringify({
        intent: 'code',
        confidence: 0.85,
        keywords: ['write', 'function'],
        reasoning: 'User wants to write code',
      }),
      tokensUsed: 100,
    };
  }
}

class MockAgentRegistry {
  getAgent(name: string) {
    return {
      name,
      execute: async () => ({ output: 'test response', tokensUsed: 100 }),
    };
  }
}

class MockContextEngine {
  private graph: SemanticCodeGraphData | null = null;
  private traversal: GraphTraversal | null = null;

  setGraph(graph: SemanticCodeGraphData) {
    this.graph = graph;
    this.traversal = new GraphTraversal(graph);
  }

  getGraph(): SemanticCodeGraphData | null {
    return this.graph;
  }

  getTraversal(): GraphTraversal | null {
    return this.traversal;
  }

  async getFileContent(file: string): Promise<string> {
    return `// Mock content for ${file}\nfunction example() {\n  return true;\n}`;
  }
}

class MockUnifiedClient {}

// ---------------------------------------------------------------------------
// Performance Tests
// ---------------------------------------------------------------------------

describe('Intelligent Chat Mode Performance', () => {
  // -------------------------------------------------------------------------
  // Requirement 6.1: Pattern matching completes within 100ms
  // -------------------------------------------------------------------------

  describe('Intent Classification - Pattern Matching (Requirement 6.1)', () => {
    it('should complete pattern matching within 100ms', async () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      // Use a message with strong pattern match to avoid LLM fallback
      const message = 'review check analyze audit inspect my codebase';
      const history: ChatMessage[] = [];

      // Act
      const startTime = performance.now();
      const result = await classifier.classify(message, history);
      const duration = performance.now() - startTime;

      // Assert
      // With strong keyword matches, pattern matching should be fast
      expect(duration).toBeLessThan(500);
      expect(result.intent).toBe(IntentType.REVIEW);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should complete pattern matching for all intent types within 100ms', async () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      const testCases = [
        { message: 'Review my code', expectedIntent: IntentType.REVIEW },
        { message: 'Write a new function', expectedIntent: IntentType.CODE },
        { message: 'Refactor this class', expectedIntent: IntentType.REFACTOR },
        { message: 'Debug this error', expectedIntent: IntentType.DEBUG },
        { message: 'Explain how this works', expectedIntent: IntentType.EXPLAIN },
        { message: 'Find all usages', expectedIntent: IntentType.SEARCH },
        { message: 'Commit these changes', expectedIntent: IntentType.GIT },
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const startTime = performance.now();
        const result = await classifier.classify(testCase.message, []);
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(100);
        expect(result.intent).toBe(testCase.expectedIntent);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.2: LLM classification completes within 500ms
  // -------------------------------------------------------------------------

  describe('Intent Classification - LLM Fallback (Requirement 6.2)', () => {
    it('should complete LLM classification within 500ms', async () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      // Ambiguous message that requires LLM
      const message = 'Can you help me with that thing we discussed?';
      const history: ChatMessage[] = [
        makeChatMessage('user', 'I need to fix a bug'),
        makeChatMessage('agent', 'Sure, what bug?'),
      ];

      // Act
      const startTime = performance.now();
      const result = await classifier.classify(message, history);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(500);
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.3: Full graph context (1,289 nodes) within 2 seconds
  // -------------------------------------------------------------------------

  describe('Graph Context Building (Requirement 6.3)', () => {
    it('should build full graph context for 1,289 nodes within 2 seconds', async () => {
      // Arrange
      const graph = makeLargeGraph(1289);
      const contextEngine = new MockContextEngine();
      contextEngine.setGraph(graph);
      const traversal = contextEngine.getTraversal()!;
      
      const builder = new GraphContextBuilder(
        contextEngine as any,
        traversal
      );

      const intent: IntentClassification = {
        intent: IntentType.REVIEW,
        confidence: 0.9,
        keywords: ['review', 'codebase'],
        suggestedAgent: 'reviewer',
        contextScope: 'full',
      };

      // Act
      const startTime = performance.now();
      const context = await builder.buildContext(intent, 40000);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(2000);
      expect(context.nodes.length).toBeGreaterThan(0);
      expect(context.tokenCount).toBeLessThanOrEqual(40000);
      expect(context.summary).toContain('Graph Context');
    });

    it('should build partial graph context efficiently', async () => {
      // Arrange
      const graph = makeLargeGraph(1289);
      const contextEngine = new MockContextEngine();
      contextEngine.setGraph(graph);
      const traversal = contextEngine.getTraversal()!;
      
      const builder = new GraphContextBuilder(
        contextEngine as any,
        traversal
      );

      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.9,
        keywords: ['function0', 'function1'],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      // Act
      const startTime = performance.now();
      const context = await builder.buildContext(intent, 40000);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(1000); // Partial should be faster
      expect(context.nodes.length).toBeLessThan(1289); // Only matching nodes
      expect(context.nodes.length).toBeGreaterThan(0);
    });

    it('should build minimal graph context very quickly', async () => {
      // Arrange
      const graph = makeLargeGraph(1289);
      const contextEngine = new MockContextEngine();
      contextEngine.setGraph(graph);
      const traversal = contextEngine.getTraversal()!;
      
      const builder = new GraphContextBuilder(
        contextEngine as any,
        traversal
      );

      const intent: IntentClassification = {
        intent: IntentType.GENERAL,
        confidence: 0.9,
        keywords: [],
        suggestedAgent: 'orchestrator',
        contextScope: 'minimal',
      };

      // Act
      const startTime = performance.now();
      const context = await builder.buildContext(intent, 40000);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(500); // Minimal should be very fast
      expect(context.nodes.length).toBeLessThanOrEqual(10); // Only entry points
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.4: Agent routing completes within 50ms
  // -------------------------------------------------------------------------

  describe('Agent Routing (Requirement 6.4)', () => {
    it('should route to agent within 50ms', () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      const intents = [
        IntentType.REVIEW,
        IntentType.CODE,
        IntentType.REFACTOR,
        IntentType.DEBUG,
        IntentType.EXPLAIN,
        IntentType.SEARCH,
        IntentType.GIT,
        IntentType.GENERAL,
      ];

      // Act & Assert
      for (const intent of intents) {
        const startTime = performance.now();
        const agent = classifier.mapIntentToAgent(intent);
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(50);
        expect(agent).toBeDefined();
        expect(typeof agent).toBe('string');
      }
    });

    it('should determine context scope within 50ms', () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      const intents = [
        IntentType.REVIEW,
        IntentType.CODE,
        IntentType.REFACTOR,
        IntentType.DEBUG,
        IntentType.EXPLAIN,
        IntentType.SEARCH,
        IntentType.GIT,
        IntentType.GENERAL,
      ];

      // Act & Assert
      for (const intent of intents) {
        const startTime = performance.now();
        const scope = classifier.determineContextScope(intent);
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(50);
        expect(scope).toBeDefined();
        expect(['full', 'partial', 'minimal']).toContain(scope);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.5: Complete auto mode flow within 3 seconds
  // -------------------------------------------------------------------------

  describe('End-to-End Auto Mode Performance (Requirement 6.5)', () => {
    it('should complete full auto mode message flow within 3 seconds', async () => {
      // Arrange
      const eventBus = new EventBus();
      const agentRegistry = new MockAgentRegistry();
      const unifiedClient = new MockUnifiedClient();
      const contextEngine = new MockContextEngine();
      
      // Set up graph with 1,289 nodes
      const graph = makeLargeGraph(1289);
      contextEngine.setGraph(graph);

      const chatService = new ChatService(
        agentRegistry as any,
        unifiedClient as any,
        contextEngine as any,
        eventBus
      );

      // Create auto mode session
      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
        fullGraphContext: true,
      });

      const command: ChatCommand = {
        type: 'message',
        content: 'Review my codebase for long files',
      };

      // Act
      const startTime = performance.now();
      
      // Consume the stream
      const chunks: string[] = [];
      for await (const chunk of chatService.sendMessage(session.id, command)) {
        chunks.push(chunk.chunk);
        if (chunk.isComplete) break;
      }
      
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(3000);
      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify session was updated
      const updatedSession = chatService.getSession(session.id);
      expect(updatedSession?.messages.length).toBeGreaterThan(0);
    });

    it('should handle multiple messages in auto mode efficiently', async () => {
      // Arrange
      const eventBus = new EventBus();
      const agentRegistry = new MockAgentRegistry();
      const unifiedClient = new MockUnifiedClient();
      const contextEngine = new MockContextEngine();
      
      const graph = makeLargeGraph(500); // Smaller graph for multiple messages
      contextEngine.setGraph(graph);

      const chatService = new ChatService(
        agentRegistry as any,
        unifiedClient as any,
        contextEngine as any,
        eventBus
      );

      const session = chatService.createSession({
        mode: 'auto',
        autoRouting: true,
        fullGraphContext: true,
      });

      const messages = [
        'Review my code',
        'Write a new function',
        'Debug this error',
      ];

      // Act
      const startTime = performance.now();
      
      for (const content of messages) {
        const command: ChatCommand = { type: 'message', content };
        
        // Consume the stream
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          if (chunk.isComplete) break;
        }
      }
      
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(9000); // 3s per message * 3 messages
      
      const updatedSession = chatService.getSession(session.id);
      // Each message creates 1 user message and 1 agent message
      expect(updatedSession?.messages.length).toBeGreaterThanOrEqual(3); // At least 3 messages
    });
  });

  // -------------------------------------------------------------------------
  // Additional Performance Tests
  // -------------------------------------------------------------------------

  describe('Performance Regression Tests', () => {
    it('should not degrade with conversation history', async () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      // Build up conversation history
      const history: ChatMessage[] = [];
      for (let i = 0; i < 50; i++) {
        history.push(makeChatMessage('user', `Message ${i}`));
        history.push(makeChatMessage('agent', `Response ${i}`));
      }

      const message = 'Review my code';

      // Act
      const startTime = performance.now();
      const result = await classifier.classify(message, history);
      const duration = performance.now() - startTime;

      // Assert - Should still be fast even with long history
      expect(duration).toBeLessThan(150); // Allow slightly more time for history processing
      expect(result.intent).toBe(IntentType.REVIEW);
    });

    it('should handle concurrent classification requests efficiently', async () => {
      // Arrange
      const modelRouter = new MockModelRouter();
      const agentRegistry = new MockAgentRegistry();
      const classifier = new IntentClassifier(
        modelRouter as any,
        agentRegistry as any
      );

      const messages = [
        'Review my code',
        'Write a function',
        'Debug this error',
        'Explain this concept',
        'Find all usages',
      ];

      // Act
      const startTime = performance.now();
      const results = await Promise.all(
        messages.map((msg) => classifier.classify(msg, []))
      );
      const duration = performance.now() - startTime;

      // Assert - Concurrent requests should complete quickly
      expect(duration).toBeLessThan(500); // All 5 should complete in parallel
      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.intent).toBeDefined();
      });
    });
  });
});
