/**
 * Unit Tests for GraphContextBuilder
 *
 * Tests specific examples and edge cases for the GraphContextBuilder service.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12
 */

// Mock logger BEFORE importing GraphContextBuilder
jest.mock('../../core/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { GraphContextBuilder } from '../../services/graph-context-builder';
import { IntentClassification, IntentType } from '../../types/chat';
import { SCGNode, SemanticCodeGraphData, NodeType } from '../../types/graph';
import { ContextEngine } from '../../core/context/engine';
import { GraphTraversal } from '../../core/context/graph/traversal';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('GraphContextBuilder Unit Tests', () => {
  let builder: GraphContextBuilder;
  let mockContextEngine: jest.Mocked<ContextEngine>;
  let mockTraversal: jest.Mocked<GraphTraversal>;
  let testGraph: SemanticCodeGraphData;

  beforeEach(() => {
    // Create test graph
    testGraph = {
      nodes: new Map(),
      edges: [],
      dependencies: new Map(),
      builtAt: new Date(),
      fileCount: 0,
      symbolCount: 0,
    };

    // Create mock dependencies
    mockContextEngine = {
      getGraph: jest.fn().mockReturnValue(testGraph),
      getFileContent: jest.fn().mockResolvedValue('// mock file content\nfunction test() {\n  return 42;\n}'),
    } as any;

    mockTraversal = {} as any;

    builder = new GraphContextBuilder(mockContextEngine, mockTraversal);
  });

  // ---------------------------------------------------------------------------
  // Node Selection Tests
  // ---------------------------------------------------------------------------

  describe('selectRelevantNodes', () => {
    it('should select all nodes for full scope', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'testFunction',
          file: 'src/test.ts',
          line: 1,
          endLine: 10,
          signature: 'function test()',
          summary: 'test function',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.CLASS,
          name: 'TestClass',
          file: 'src/class.ts',
          line: 1,
          endLine: 50,
          signature: 'class TestClass',
          summary: 'test class',
          complexity: 10,
          changeFrequency: 5,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const intent: IntentClassification = {
        intent: IntentType.REVIEW,
        confidence: 0.9,
        keywords: [],
        suggestedAgent: 'reviewer',
        contextScope: 'full',
      };

      const selected = builder.selectRelevantNodes(intent, testGraph);

      expect(selected).toHaveLength(2);
      expect(selected.map(n => n.id)).toEqual(['node-1', 'node-2']);
    });

    it('should select only matching nodes for partial scope', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'authFunction',
          file: 'src/auth.ts',
          line: 1,
          endLine: 10,
          signature: 'function authenticate()',
          summary: 'authentication function',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'helperFunction',
          file: 'src/helper.ts',
          line: 1,
          endLine: 10,
          signature: 'function helper()',
          summary: 'helper function',
          complexity: 3,
          changeFrequency: 5,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      const selected = builder.selectRelevantNodes(intent, testGraph);

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe('node-1');
      expect(selected[0].name).toBe('authFunction');
    });

    it('should match keywords in name, file, or signature', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'process',
          file: 'src/user.ts',
          line: 1,
          endLine: 10,
          signature: 'function process()',
          summary: 'process function',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'handle',
          file: 'src/handler.ts',
          line: 1,
          endLine: 10,
          signature: 'function handle(user: User)',
          summary: 'handle function',
          complexity: 3,
          changeFrequency: 5,
        },
        {
          id: 'node-3',
          type: NodeType.FUNCTION,
          name: 'other',
          file: 'src/other.ts',
          line: 1,
          endLine: 10,
          signature: 'function other()',
          summary: 'other function',
          complexity: 2,
          changeFrequency: 2,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const intent: IntentClassification = {
        intent: IntentType.SEARCH,
        confidence: 0.75,
        keywords: ['user'],
        suggestedAgent: 'context',
        contextScope: 'partial',
      };

      const selected = builder.selectRelevantNodes(intent, testGraph);

      // Should match node-1 (file: user.ts) and node-2 (signature: User)
      expect(selected).toHaveLength(2);
      expect(selected.map(n => n.id).sort()).toEqual(['node-1', 'node-2']);
    });

    it('should select only entry points for minimal scope', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'main',
          file: 'src/main.ts',
          line: 1,
          endLine: 10,
          signature: 'function main()',
          summary: 'main entry point',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'helper',
          file: 'src/helper.ts',
          line: 1,
          endLine: 10,
          signature: 'function helper()',
          summary: 'helper function',
          complexity: 3,
          changeFrequency: 5,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const intent: IntentClassification = {
        intent: IntentType.EXPLAIN,
        confidence: 0.7,
        keywords: [],
        suggestedAgent: 'context',
        contextScope: 'minimal',
      };

      const selected = builder.selectRelevantNodes(intent, testGraph);

      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe('node-1');
      expect(selected[0].name).toBe('main');
    });

    it('should return empty array for minimal scope with no entry points', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.CLASS,
          name: 'Helper',
          file: 'src/helper.ts',
          line: 1,
          endLine: 10,
          signature: 'class Helper',
          summary: 'helper class',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const intent: IntentClassification = {
        intent: IntentType.GIT,
        confidence: 0.8,
        keywords: [],
        suggestedAgent: 'git',
        contextScope: 'minimal',
      };

      const selected = builder.selectRelevantNodes(intent, testGraph);

      expect(selected).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Prioritization Tests
  // ---------------------------------------------------------------------------

  describe('prioritizeNodes', () => {
    it('should prioritize nodes with keyword matches higher', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'helper',
          file: 'src/helper.ts',
          line: 1,
          endLine: 10,
          signature: 'function helper()',
          summary: 'helper',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'authFunction',
          file: 'src/auth.ts',
          line: 1,
          endLine: 10,
          signature: 'function authenticate()',
          summary: 'auth',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      const prioritized = builder.prioritizeNodes(nodes, intent);

      // node-2 should be first (has 'auth' in name and file)
      expect(prioritized[0].id).toBe('node-2');
      expect(prioritized[1].id).toBe('node-1');
    });

    it('should prioritize large files for review intent', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'small',
          file: 'src/small.ts',
          line: 1,
          endLine: 50, // 49 lines
          signature: 'function small()',
          summary: 'small',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'large',
          file: 'src/large.ts',
          line: 1,
          endLine: 600, // 599 lines
          signature: 'function large()',
          summary: 'large',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      const intent: IntentClassification = {
        intent: IntentType.REVIEW,
        confidence: 0.9,
        keywords: [],
        suggestedAgent: 'reviewer',
        contextScope: 'full',
      };

      const prioritized = builder.prioritizeNodes(nodes, intent);

      // node-2 should be first (large file gets +20 points)
      expect(prioritized[0].id).toBe('node-2');
      expect(prioritized[1].id).toBe('node-1');
    });

    it('should prioritize functions and classes for code/debug intent', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.VARIABLE,
          name: 'config',
          file: 'src/config.ts',
          line: 1,
          endLine: 10,
          signature: 'const config',
          summary: 'config',
          complexity: 1,
          changeFrequency: 5,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'process',
          file: 'src/process.ts',
          line: 1,
          endLine: 20,
          signature: 'function process()',
          summary: 'process',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      const intent: IntentClassification = {
        intent: IntentType.DEBUG,
        confidence: 0.85,
        keywords: [],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      const prioritized = builder.prioritizeNodes(nodes, intent);

      // node-2 should be first (function gets +15 points)
      expect(prioritized[0].id).toBe('node-2');
      expect(prioritized[1].id).toBe('node-1');
    });
  });

  // ---------------------------------------------------------------------------
  // Relevance Scoring Tests
  // ---------------------------------------------------------------------------

  describe('calculateRelevanceScore', () => {
    it('should score keyword match in name as 10 points', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.VARIABLE,
        name: 'authentication',
        file: 'src/other.ts',
        line: 1,
        endLine: 10,
        signature: 'const other',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.SEARCH,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'context',
        contextScope: 'partial',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      expect(score).toBe(10);
    });

    it('should score keyword match in file as 5 points', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.VARIABLE,
        name: 'config',
        file: 'src/auth.ts',
        line: 1,
        endLine: 10,
        signature: 'const config',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.SEARCH,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'context',
        contextScope: 'partial',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      expect(score).toBe(5);
    });

    it('should score keyword match in signature as 3 points', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.VARIABLE,
        name: 'config',
        file: 'src/other.ts',
        line: 1,
        endLine: 10,
        signature: 'const config: AuthConfig',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.SEARCH,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'context',
        contextScope: 'partial',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      expect(score).toBe(3);
    });

    it('should accumulate scores for multiple keyword matches', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.VARIABLE,
        name: 'authConfig',
        file: 'src/auth.ts',
        line: 1,
        endLine: 10,
        signature: 'const authConfig: AuthConfig',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.SEARCH,
        confidence: 0.8,
        keywords: ['auth'],
        suggestedAgent: 'context',
        contextScope: 'partial',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      // name (10) + file (5) + signature (3) = 18
      expect(score).toBe(18);
    });

    it('should add 15 points for functions/classes with CODE intent', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.FUNCTION,
        name: 'process',
        file: 'src/process.ts',
        line: 1,
        endLine: 10,
        signature: 'function process()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.8,
        keywords: [],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      // function with CODE intent = 15 points
      expect(score).toBe(15);
    });

    it('should add 20 points for large files (>500 lines) with REVIEW intent', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.FUNCTION,
        name: 'process',
        file: 'src/large.ts',
        line: 1,
        endLine: 600, // 599 lines
        signature: 'function process()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.REVIEW,
        confidence: 0.9,
        keywords: [],
        suggestedAgent: 'reviewer',
        contextScope: 'full',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      // large file with REVIEW intent = 20 points
      expect(score).toBe(20);
    });

    it('should add 10 points for medium files (>300 lines) with REVIEW intent', () => {
      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.FUNCTION,
        name: 'process',
        file: 'src/medium.ts',
        line: 1,
        endLine: 400, // 399 lines
        signature: 'function process()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const intent: IntentClassification = {
        intent: IntentType.REVIEW,
        confidence: 0.9,
        keywords: [],
        suggestedAgent: 'reviewer',
        contextScope: 'full',
      };

      const score = builder.calculateRelevanceScore(node, intent);

      // medium file with REVIEW intent = 10 points
      expect(score).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Compression Tests
  // ---------------------------------------------------------------------------

  describe('compressContext', () => {
    it('should compress all nodes to SIGNATURE level initially', async () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'test',
          file: 'src/test.ts',
          line: 1,
          endLine: 10,
          signature: 'function test()',
          summary: 'test',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const result = await builder.compressContext(nodes, 100);

      expect(result.nodes).toHaveLength(1);
      expect(result.tokenCount).toBeLessThanOrEqual(100);
    });

    it('should expand top nodes to FULL when budget allows', async () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'test',
          file: 'src/test.ts',
          line: 1,
          endLine: 10,
          signature: 'function test()',
          summary: 'test',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const result = await builder.compressContext(nodes, 50000);

      expect(result.nodes).toHaveLength(1);
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.tokenCount).toBeLessThanOrEqual(50000);
    });

    it('should remove nodes when initial context exceeds budget', async () => {
      const nodes: SCGNode[] = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        type: NodeType.FUNCTION,
        name: `function${i}`,
        file: `src/file${i}.ts`,
        line: 1,
        endLine: 10,
        signature: `function function${i}()`,
        summary: `function ${i}`,
        complexity: 5,
        changeFrequency: 10,
      }));

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const result = await builder.compressContext(nodes, 500);

      expect(result.tokenCount).toBeLessThanOrEqual(500);
      expect(result.nodes.length).toBeLessThan(nodes.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Summary Tests
  // ---------------------------------------------------------------------------

  describe('buildSummary', () => {
    it('should generate summary with node and file counts', () => {
      const nodes: SCGNode[] = [
        {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'test1',
          file: 'src/file1.ts',
          line: 1,
          endLine: 10,
          signature: 'function test1()',
          summary: 'test',
          complexity: 5,
          changeFrequency: 10,
        },
        {
          id: 'node-2',
          type: NodeType.FUNCTION,
          name: 'test2',
          file: 'src/file2.ts',
          line: 1,
          endLine: 10,
          signature: 'function test2()',
          summary: 'test',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      const context = nodes.map(node => ({
        node,
        level: 'SIGNATURE' as const,
        content: builder.formatNode(node, 'SIGNATURE'),
      }));

      const summary = builder.buildSummary(nodes, context);

      expect(summary).toContain('2 nodes');
      expect(summary).toContain('2 files');
      expect(summary).toContain('0 full');
      expect(summary).toContain('2 signatures');
    });
  });

  // ---------------------------------------------------------------------------
  // Token Estimation Tests
  // ---------------------------------------------------------------------------

  describe('estimateTokens', () => {
    it('should estimate tokens as text length / 4 rounded up', () => {
      expect(builder.estimateTokens('test')).toBe(1); // 4/4 = 1
      expect(builder.estimateTokens('hello')).toBe(2); // 5/4 = 1.25 -> 2
      expect(builder.estimateTokens('hello world')).toBe(3); // 11/4 = 2.75 -> 3
      expect(builder.estimateTokens('')).toBe(0); // 0/4 = 0
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw error when graph is not initialized', async () => {
      mockContextEngine.getGraph.mockReturnValue(null);

      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.8,
        keywords: [],
        suggestedAgent: 'coder',
        contextScope: 'full',
      };

      await expect(builder.buildContext(intent, 10000)).rejects.toThrow(
        'Graph not initialized'
      );
    });

    it('should handle file read errors gracefully', async () => {
      mockContextEngine.getFileContent.mockRejectedValue(
        new Error('File not found')
      );

      const node: SCGNode = {
        id: 'node-1',
        type: NodeType.FUNCTION,
        name: 'test',
        file: 'src/missing.ts',
        line: 1,
        endLine: 10,
        signature: 'function test()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const content = await builder.getFullNodeContent(node);

      // Should fall back to SIGNATURE format
      expect(content).toContain('function test');
      expect(content).toContain('src/missing.ts');
    });
  });
});
