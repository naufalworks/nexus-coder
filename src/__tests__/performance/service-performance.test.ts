/**
 * Performance Tests for Service Optimizations
 *
 * **Validates: Requirements 30.1, 30.2, 30.3, 30.4**
 *
 * Tests verify:
 * 1. Search queries complete within 500ms (Requirement 30.1)
 * 2. Chat context building with caching is fast (Requirement 30.2)
 * 3. Impact BFS traversal completes within 100ms for 304 nodes / 1000 edges (Requirement 30.3)
 * 4. Command palette fuzzy matching completes within 50ms for 100+ commands (Requirement 30.4)
 */

import { SemanticSearchService } from '../../services/search-service';
import { ChatService } from '../../services/chat-service';
import { ImpactAnalysisService } from '../../services/impact-service';
import { CommandPaletteService } from '../../services/command-palette-service';
import { VectorStore } from '../../core/store/vector-store';
import { GraphTraversal } from '../../core/context/graph/traversal';
import { EventBus } from '../../core/event-bus';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';
import {
  SearchQuery,
  SearchResultType,
  ChatSession,
  ChatCommand,
  CodeChange,
  ChangeType,
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
  PaletteCommand,
  CommandCategory,
  CommandContext,
} from '../../types';
import { makeGraph } from '../helpers/factories';

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

function makeSearchQuery(text: string): SearchQuery {
  return {
    text,
    limit: 10,
    minScore: 0.5,
    includeGraphContext: true,
  };
}

function makeChatSession(id: string): ChatSession {
  return {
    id,
    agentName: 'test-agent',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    contextFiles: [],
    contextNodeIds: [],
    status: 'active',
  };
}

function makeChatCommand(content: string): ChatCommand {
  return {
    type: 'message',
    content,
  };
}

function makeCodeChange(file: string): CodeChange {
  return {
    file,
    type: ChangeType.MODIFY,
    reasoning: 'Test change',
    impact: [],
    risk: 'medium',
    diff: '',
    content: '',
    approved: false,
  };
}

function makeCommand(id: string, label: string): PaletteCommand {
  return {
    id,
    label,
    category: CommandCategory.SEARCH,
    execute: jest.fn(),
    available: () => true,
    tags: ['test'],
  };
}

function makeContext(): CommandContext {
  return {
    graphAvailable: true,
    vectorStoreAvailable: true,
    recentCommands: [],
  };
}

// ---------------------------------------------------------------------------
// Mock Implementations
// ---------------------------------------------------------------------------

class MockVectorStore {
  isAvailable(): boolean {
    return true;
  }

  async search(): Promise<any[]> {
    // Simulate fast vector search
    return Array.from({ length: 20 }, (_, i) => ({
      id: `result-${i}`,
      content: `Result ${i}`,
      relevance: 0.9 - i * 0.01,
      metadata: {
        file: `file-${i}.ts`,
        line: i * 10,
        type: 'code' as const,
        source: 'test',
        timestamp: new Date(),
      },
    }));
  }
}

class MockContextEngine {
  async getFileContent(): Promise<string> {
    return 'mock file content';
  }

  getTraversal(): GraphTraversal | null {
    return null;
  }
}

class MockAgentRegistry {
  getAgent() {
    return {
      name: 'test-agent',
      execute: async () => ({ output: 'test response', tokensUsed: 100 }),
    };
  }
}

class MockUnifiedClient {}

// ---------------------------------------------------------------------------
// Performance Tests
// ---------------------------------------------------------------------------

describe('Service Performance Optimizations', () => {
  // -------------------------------------------------------------------------
  // Requirement 30.1: Search queries complete within 500ms
  // -------------------------------------------------------------------------

  describe('Search Performance (Requirement 30.1)', () => {
    it('should complete search within 500ms', async () => {
      // Arrange
      const service = new SemanticSearchService();
      const vectorStore = new MockVectorStore();
      const graph = makeGraph(100, 200);
      const traversal = new GraphTraversal(graph);
      const query = makeSearchQuery('test query');

      // Act
      const startTime = performance.now();
      const response = await service.executeSearch(
        query,
        vectorStore as any,
        traversal,
      );
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(500);
      expect(response.searchTimeMs).toBeLessThan(500);
      expect(response.warning).toBeUndefined();
    });

    it('should return partial results with warning if search exceeds 500ms', async () => {
      // Arrange
      const service = new SemanticSearchService();
      const slowVectorStore = {
        isAvailable: () => true,
        search: async () => {
          // Simulate slow search
          await new Promise((resolve) => setTimeout(resolve, 600));
          return [];
        },
      };
      const graph = makeGraph(10, 20);
      const traversal = new GraphTraversal(graph);
      const query = makeSearchQuery('test query');

      // Act
      const response = await service.executeSearch(
        query,
        slowVectorStore as any,
        traversal,
      );

      // Assert
      expect(response.warning).toBeDefined();
      expect(response.warning).toContain('exceeded');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 30.2: Chat context building with caching
  // -------------------------------------------------------------------------

  describe('Chat Context Caching (Requirement 30.2)', () => {
    it('should build context faster on second call with cache', async () => {
      // Arrange
      const eventBus = new EventBus();
      const agentRegistry = new MockAgentRegistry();
      const unifiedClient = new MockUnifiedClient();
      const contextEngine = new MockContextEngine();
      const service = new ChatService(
        agentRegistry as any,
        unifiedClient as any,
        contextEngine as any,
        eventBus,
      );

      const session = makeChatSession('test-session');
      const command = makeChatCommand('test message');

      // Act - First call (no cache)
      const startTime1 = performance.now();
      const context1 = await service.buildChatContext(
        session,
        command,
        contextEngine as any,
        null,
        8000,
      );
      const duration1 = performance.now() - startTime1;

      // Act - Second call (with cache)
      const startTime2 = performance.now();
      const context2 = await service.buildChatContext(
        session,
        command,
        contextEngine as any,
        null,
        8000,
      );
      const duration2 = performance.now() - startTime2;

      // Assert
      expect(context1).toBe(context2); // Same context
      expect(duration2).toBeLessThan(duration1); // Faster with cache
      expect(duration2).toBeLessThan(10); // Should be very fast from cache
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 30.3: Impact BFS traversal within 100ms for 304 nodes / 1000 edges
  // -------------------------------------------------------------------------

  describe('Impact Analysis Performance (Requirement 30.3)', () => {
    it('should complete BFS traversal within 100ms for 304 nodes / 1000 edges', () => {
      // Arrange
      const service = new ImpactAnalysisService();
      const graph = makeGraph(304, 1000);
      const traversal = new GraphTraversal(graph);
      
      // Pick a node from the graph
      const firstNode = Array.from(graph.nodes.values())[0];
      const change = makeCodeChange(firstNode.file);

      // Act
      const startTime = performance.now();
      const analysis = service.analyzeChange(change, graph, traversal, 4);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(100);
      expect(analysis.stats.analysisTimeMs).toBeLessThan(100);
      expect(analysis.stats.nodesTraversed).toBeGreaterThan(0);
    });

    it('should handle large graphs efficiently with early termination', () => {
      // Arrange
      const service = new ImpactAnalysisService();
      const graph = makeGraph(500, 2000); // Larger than target
      const traversal = new GraphTraversal(graph);
      
      const firstNode = Array.from(graph.nodes.values())[0];
      const change = makeCodeChange(firstNode.file);

      // Act
      const startTime = performance.now();
      const analysis = service.analyzeChange(change, graph, traversal, 4);
      const duration = performance.now() - startTime;

      // Assert - Should still be reasonably fast with early termination
      expect(duration).toBeLessThan(200); // Allow more time for larger graph
      expect(analysis.stats.nodesTraversed).toBeLessThanOrEqual(1000); // Early termination
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 30.4: Palette fuzzy matching within 50ms for 100+ commands
  // -------------------------------------------------------------------------

  describe('Command Palette Performance (Requirement 30.4)', () => {
    it('should fuzzy match 100+ commands within 50ms', () => {
      // Arrange
      const eventBus = new EventBus();
      const service = new CommandPaletteService(eventBus);
      
      // Register 150 commands
      const commands: PaletteCommand[] = [];
      for (let i = 0; i < 150; i++) {
        const cmd = makeCommand(`cmd-${i}`, `Command ${i}`);
        service.registerCommand(cmd);
        commands.push(cmd);
      }

      const context = makeContext();
      const recentCommands: string[] = [];

      // Act
      const startTime = performance.now();
      const matches = service.matchCommands('test', commands, context, recentCommands, 10);
      const duration = performance.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(50);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should use pre-computed recency scores for performance', () => {
      // Arrange
      const eventBus = new EventBus();
      const service = new CommandPaletteService(eventBus);
      
      const commands: PaletteCommand[] = [];
      for (let i = 0; i < 100; i++) {
        const cmd = makeCommand(`cmd-${i}`, `Command ${i}`);
        service.registerCommand(cmd);
        commands.push(cmd);
      }

      const context = makeContext();
      const recentCommands = ['cmd-0', 'cmd-1', 'cmd-2'];

      // Act - First call (computes scores)
      const startTime1 = performance.now();
      service.matchCommands('test', commands, context, recentCommands, 10);
      const duration1 = performance.now() - startTime1;

      // Act - Second call (uses pre-computed scores)
      const startTime2 = performance.now();
      service.matchCommands('test', commands, context, recentCommands, 10);
      const duration2 = performance.now() - startTime2;

      // Assert
      expect(duration1).toBeLessThan(50);
      expect(duration2).toBeLessThan(50);
      expect(duration2).toBeLessThanOrEqual(duration1); // Should be same or faster
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 30.5: Palette input debounced at 150ms
  // -------------------------------------------------------------------------

  describe('Palette Input Debouncing (Requirement 30.5)', () => {
    it('should debounce input at 150ms', (done) => {
      // Arrange
      const eventBus = new EventBus();
      const service = new CommandPaletteService(eventBus);
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      // Act - Call debounce multiple times rapidly
      service.debounceInput(callback);
      service.debounceInput(callback);
      service.debounceInput(callback);

      // Assert - Should only call once after 150ms
      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 200);
    });
  });
});
