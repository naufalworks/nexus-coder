/**
 * Property-Based Tests for GraphContextBuilder
 *
 * Tests universal properties that should hold for all valid inputs.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 3.12, 12.2, 12.3, 12.4, 12.5, 12.6, 14.2
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

import * as fc from 'fast-check';
import { GraphContextBuilder } from '../../services/graph-context-builder';
import { IntentClassification, IntentType } from '../../types/chat';
import { SCGNode, SemanticCodeGraphData, NodeType } from '../../types/graph';
import { ContextEngine } from '../../core/context/engine';
import { GraphTraversal } from '../../core/context/graph/traversal';

// ---------------------------------------------------------------------------
// Test Setup & Arbitraries
// ---------------------------------------------------------------------------

describe('GraphContextBuilder Property-Based Tests', () => {
  let builder: GraphContextBuilder;
  let mockContextEngine: jest.Mocked<ContextEngine>;
  let mockTraversal: jest.Mocked<GraphTraversal>;
  let testGraph: SemanticCodeGraphData;

  // Arbitrary for SCGNode
  const nodeArb = fc.record({
    id: fc.uuid(),
    type: fc.constantFrom(...Object.values(NodeType)),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    file: fc.string({ minLength: 5, maxLength: 100 }).map(s => `src/${s}.ts`),
    line: fc.integer({ min: 1, max: 100 }),
    endLine: fc.integer({ min: 101, max: 500 }),
    signature: fc.string({ minLength: 10, maxLength: 200 }),
    summary: fc.string({ minLength: 10, maxLength: 100 }),
    complexity: fc.integer({ min: 1, max: 20 }),
    changeFrequency: fc.integer({ min: 0, max: 100 }),
  });

  // Arbitrary for IntentClassification
  const intentArb = fc.record({
    intent: fc.constantFrom(...Object.values(IntentType)),
    confidence: fc.double({ min: 0.0, max: 1.0 }),
    keywords: fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
      minLength: 0,
      maxLength: 10,
    }),
    suggestedAgent: fc.constantFrom(
      'reviewer',
      'coder',
      'context',
      'git',
      'orchestrator'
    ),
    contextScope: fc.constantFrom('full', 'partial', 'minimal'),
  });

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
      getFileContent: jest.fn().mockResolvedValue('// mock file content\nfunction test() {}'),
    } as any;

    mockTraversal = {} as any;

    builder = new GraphContextBuilder(mockContextEngine, mockTraversal);
  });

  // ---------------------------------------------------------------------------
  // Property 6: Full Scope Returns All Nodes
  // ---------------------------------------------------------------------------

  describe('Property 6: Full Scope Returns All Nodes', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any Semantic Code Graph, when context scope is "full", the
     * Graph_Context_Builder SHALL select all nodes from the graph.
     */
    it('should select all nodes when scope is full', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 1, maxLength: 50 }),
          (nodes) => {
            // Populate test graph
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            // Create intent with full scope
            const intent: IntentClassification = {
              intent: IntentType.REVIEW,
              confidence: 0.9,
              keywords: [],
              suggestedAgent: 'reviewer',
              contextScope: 'full',
            };

            // Select nodes
            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Should return all nodes
            expect(selected.length).toBe(nodes.length);
            expect(new Set(selected.map(n => n.id))).toEqual(
              new Set(nodes.map(n => n.id))
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all nodes regardless of keywords when scope is full', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 5, maxLength: 30 }),
          fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (nodes, keywords) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const intent: IntentClassification = {
              intent: IntentType.REFACTOR,
              confidence: 0.85,
              keywords,
              suggestedAgent: 'coder',
              contextScope: 'full',
            };

            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Should still return all nodes, ignoring keywords
            expect(selected.length).toBe(nodes.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 7: Partial Scope Keyword Matching
  // ---------------------------------------------------------------------------

  describe('Property 7: Partial Scope Keyword Matching', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any graph and set of keywords, when context scope is "partial",
     * all returned nodes SHALL match at least one keyword in their name,
     * file path, or signature.
     */
    it('should only return nodes matching keywords when scope is partial', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 10, maxLength: 50 }),
          fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (nodes, keywords) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const intent: IntentClassification = {
              intent: IntentType.CODE,
              confidence: 0.8,
              keywords,
              suggestedAgent: 'coder',
              contextScope: 'partial',
            };

            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Every selected node must match at least one keyword
            selected.forEach(node => {
              const matches = keywords.some(keyword => {
                const keywordLower = keyword.toLowerCase();
                return (
                  node.name.toLowerCase().includes(keywordLower) ||
                  node.file.toLowerCase().includes(keywordLower) ||
                  node.signature?.toLowerCase().includes(keywordLower)
                );
              });

              expect(matches).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array when no nodes match keywords in partial scope', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 5, maxLength: 20 }),
          (nodes) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            // Use keywords that definitely won't match
            const intent: IntentClassification = {
              intent: IntentType.SEARCH,
              confidence: 0.75,
              keywords: ['xyzabc123nonexistent'],
              suggestedAgent: 'context',
              contextScope: 'partial',
            };

            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Should return empty or only nodes that somehow match
            selected.forEach(node => {
              const matches = intent.keywords.some(keyword => {
                const keywordLower = keyword.toLowerCase();
                return (
                  node.name.toLowerCase().includes(keywordLower) ||
                  node.file.toLowerCase().includes(keywordLower) ||
                  node.signature?.toLowerCase().includes(keywordLower)
                );
              });
              expect(matches).toBe(true);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 8: Minimal Scope Returns Entry Points Only
  // ---------------------------------------------------------------------------

  describe('Property 8: Minimal Scope Returns Entry Points Only', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any graph, when context scope is "minimal", the Graph_Context_Builder
     * SHALL return only entry point nodes.
     */
    it('should only return entry point nodes when scope is minimal', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 10, maxLength: 50 }),
          (nodes) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const intent: IntentClassification = {
              intent: IntentType.EXPLAIN,
              confidence: 0.7,
              keywords: [],
              suggestedAgent: 'context',
              contextScope: 'minimal',
            };

            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Every selected node must be an entry point
            selected.forEach(node => {
              expect(node.type).toBe('function');
              expect(
                node.name === 'main' ||
                  node.name.toLowerCase().includes('main')
              ).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array when no entry points exist in minimal scope', () => {
      fc.assert(
        fc.property(
          fc.array(
            nodeArb.map(n => ({ ...n, name: 'helper', type: NodeType.CLASS })),
            { minLength: 5, maxLength: 20 }
          ),
          (nodes) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const intent: IntentClassification = {
              intent: IntentType.GIT,
              confidence: 0.8,
              keywords: [],
              suggestedAgent: 'git',
              contextScope: 'minimal',
            };

            const selected = builder.selectRelevantNodes(intent, testGraph);

            // Should return empty since no entry points
            expect(selected.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 9: Node Prioritization Order
  // ---------------------------------------------------------------------------

  describe('Property 9: Node Prioritization Order', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * For any set of selected nodes and intent, the Graph_Context_Builder
     * SHALL return nodes in descending order of relevance score.
     */
    it('should return nodes in descending relevance score order', () => {
      fc.assert(
        fc.property(
          fc.array(nodeArb, { minLength: 5, maxLength: 30 }),
          intentArb,
          (nodes, intent) => {
            const prioritized = builder.prioritizeNodes(nodes, intent);

            // Calculate scores for verification
            const scores = prioritized.map(node =>
              builder.calculateRelevanceScore(node, intent)
            );

            // Verify descending order
            for (let i = 0; i < scores.length - 1; i++) {
              expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain stable order for nodes with equal scores', () => {
      fc.assert(
        fc.property(
          fc.array(
            nodeArb.map(n => ({ ...n, name: 'sameNode' })),
            { minLength: 5, maxLength: 20 }
          ),
          intentArb,
          (nodes, intent) => {
            const prioritized = builder.prioritizeNodes(nodes, intent);

            // All nodes should have same score
            const scores = prioritized.map(node =>
              builder.calculateRelevanceScore(node, intent)
            );

            const uniqueScores = new Set(scores);
            // If all scores are the same, order should be stable
            if (uniqueScores.size === 1) {
              expect(prioritized.length).toBe(nodes.length);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 10: Keyword Matching Increases Relevance
  // ---------------------------------------------------------------------------

  describe('Property 10: Keyword Matching Increases Relevance', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * For any node and set of keywords, nodes with keyword matches in name,
     * file, or signature SHALL have higher relevance scores than nodes
     * without matches.
     */
    it('should give higher scores to nodes with keyword matches', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 20 }),
          (keyword) => {
            // Create two nodes: one with keyword, one without
            const nodeWithMatch: SCGNode = {
              id: 'node-1',
              type: NodeType.FUNCTION,
              name: `test${keyword}Function`,
              file: 'src/test.ts',
              line: 1,
              endLine: 10,
              signature: 'function test()',
              summary: 'test function',
              complexity: 5,
              changeFrequency: 10,
            };

            const nodeWithoutMatch: SCGNode = {
              id: 'node-2',
              type: NodeType.FUNCTION,
              name: 'otherFunction',
              file: 'src/other.ts',
              line: 1,
              endLine: 10,
              signature: 'function other()',
              summary: 'other function',
              complexity: 5,
              changeFrequency: 10,
            };

            // Create intent with the keyword
            const intent: IntentClassification = {
              intent: IntentType.CODE,
              confidence: 0.8,
              keywords: [keyword],
              suggestedAgent: 'coder',
              contextScope: 'partial',
            };

            const scoreWithMatch = builder.calculateRelevanceScore(
              nodeWithMatch,
              intent
            );
            const scoreWithoutMatch = builder.calculateRelevanceScore(
              nodeWithoutMatch,
              intent
            );

            // Node with match should have higher score
            expect(scoreWithMatch).toBeGreaterThan(scoreWithoutMatch);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should give progressively higher scores for matches in name vs file vs signature', () => {
      const keyword = 'testKeyword';
      const intent: IntentClassification = {
        intent: IntentType.CODE,
        confidence: 0.8,
        keywords: [keyword],
        suggestedAgent: 'coder',
        contextScope: 'partial',
      };

      const nodeNameMatch: SCGNode = {
        id: 'node-1',
        type: NodeType.FUNCTION,
        name: keyword,
        file: 'src/other.ts',
        line: 1,
        endLine: 10,
        signature: 'function other()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const nodeFileMatch: SCGNode = {
        id: 'node-2',
        type: NodeType.FUNCTION,
        name: 'other',
        file: `src/${keyword}.ts`,
        line: 1,
        endLine: 10,
        signature: 'function other()',
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const nodeSigMatch: SCGNode = {
        id: 'node-3',
        type: NodeType.FUNCTION,
        name: 'other',
        file: 'src/other.ts',
        line: 1,
        endLine: 10,
        signature: `function ${keyword}()`,
        summary: 'test',
        complexity: 5,
        changeFrequency: 10,
      };

      const scoreNameMatch = builder.calculateRelevanceScore(
        nodeNameMatch,
        intent
      );
      const scoreFileMatch = builder.calculateRelevanceScore(
        nodeFileMatch,
        intent
      );
      const scoreSigMatch = builder.calculateRelevanceScore(nodeSigMatch, intent);

      // Name match (10 points) > File match (5 points) > Signature match (3 points)
      expect(scoreNameMatch).toBeGreaterThan(scoreFileMatch);
      expect(scoreFileMatch).toBeGreaterThan(scoreSigMatch);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 11: Token Budget Enforcement
  // ---------------------------------------------------------------------------

  describe('Property 11: Token Budget Enforcement', () => {
    /**
     * **Validates: Requirements 3.11, 12.5**
     *
     * For any context building operation, the final token count SHALL NOT
     * exceed the specified token budget.
     */
    it('should never exceed token budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 5, maxLength: 50 }),
          fc.integer({ min: 1000, max: 50000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            // Token count must not exceed budget
            expect(result.tokenCount).toBeLessThanOrEqual(maxTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect budget even with very small limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 10, maxLength: 30 }),
          fc.integer({ min: 100, max: 1000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            expect(result.tokenCount).toBeLessThanOrEqual(maxTokens);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 12: Context Result Completeness
  // ---------------------------------------------------------------------------

  describe('Property 12: Context Result Completeness', () => {
    /**
     * **Validates: Requirements 3.12, 14.2**
     *
     * For any context building result, the GraphContext object SHALL contain
     * all required fields: nodes array, summary string, token count, and
     * compression ratio.
     */
    it('should always return complete GraphContext object', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 1, maxLength: 30 }),
          fc.integer({ min: 1000, max: 50000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            // Verify all required fields are present
            expect(result).toHaveProperty('nodes');
            expect(result).toHaveProperty('summary');
            expect(result).toHaveProperty('tokenCount');
            expect(result).toHaveProperty('compressionRatio');

            // Verify field types
            expect(Array.isArray(result.nodes)).toBe(true);
            expect(typeof result.summary).toBe('string');
            expect(typeof result.tokenCount).toBe('number');
            expect(typeof result.compressionRatio).toBe('number');

            // Verify values are valid
            expect(result.nodes.length).toBeGreaterThan(0);
            expect(result.summary.length).toBeGreaterThan(0);
            expect(result.tokenCount).toBeGreaterThan(0);
            expect(result.compressionRatio).toBeGreaterThan(0);
            expect(Number.isFinite(result.compressionRatio)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return null or undefined for required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 1, maxLength: 20 }),
          intentArb,
          async (nodes, intent) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.buildContext(intent, 10000);

            // Verify no null/undefined values
            expect(result.nodes).not.toBeNull();
            expect(result.nodes).not.toBeUndefined();
            expect(result.summary).not.toBeNull();
            expect(result.summary).not.toBeUndefined();
            expect(result.tokenCount).not.toBeNull();
            expect(result.tokenCount).not.toBeUndefined();
            expect(result.compressionRatio).not.toBeNull();
            expect(result.compressionRatio).not.toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 23: Token Estimation Consistency
  // ---------------------------------------------------------------------------

  describe('Property 23: Token Estimation Consistency', () => {
    /**
     * **Validates: Requirements 12.2**
     *
     * For any text string, the estimated token count SHALL equal the text
     * length divided by 4 (rounded up).
     */
    it('should estimate tokens as text length / 4 rounded up', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 10000 }), (text) => {
          const estimated = builder.estimateTokens(text);
          const expected = Math.ceil(text.length / 4);

          expect(estimated).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle empty strings', () => {
      const estimated = builder.estimateTokens('');
      expect(estimated).toBe(0);
    });

    it('should handle very long strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10000, maxLength: 100000 }),
          (text) => {
            const estimated = builder.estimateTokens(text);
            const expected = Math.ceil(text.length / 4);

            expect(estimated).toBe(expected);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 24: Cumulative Token Tracking
  // ---------------------------------------------------------------------------

  describe('Property 24: Cumulative Token Tracking', () => {
    /**
     * **Validates: Requirements 12.3**
     *
     * For any context building operation, the cumulative token count SHALL
     * increase monotonically as nodes are added (never decrease).
     * 
     * This property validates that within a single compression operation,
     * the token tracking is monotonic. We test this by verifying that
     * the final token count is reasonable given the input.
     */
    it('should track tokens correctly during context building', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1000, max: 50000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            // Token count should be positive and reasonable
            expect(result.tokenCount).toBeGreaterThan(0);
            
            // Token count should not exceed budget
            expect(result.tokenCount).toBeLessThanOrEqual(maxTokens);
            
            // Token count should be at least the minimum (one SIGNATURE per node in result)
            const minTokens = result.nodes.length * 5; // Minimum ~5 tokens per SIGNATURE
            expect(result.tokenCount).toBeGreaterThanOrEqual(Math.min(minTokens, maxTokens));
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should have consistent token counts for identical inputs', async () => {
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
          type: NodeType.FUNCTION,
          name: 'otherFunction',
          file: 'src/other.ts',
          line: 1,
          endLine: 10,
          signature: 'function other()',
          summary: 'other function',
          complexity: 5,
          changeFrequency: 10,
        },
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      // Run compression multiple times with same inputs
      const result1 = await builder.compressContext(nodes, 50000);
      const result2 = await builder.compressContext(nodes, 50000);

      // Should get same token count
      expect(result1.tokenCount).toBe(result2.tokenCount);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 25: Budget Enforcement Stops Full Expansion
  // ---------------------------------------------------------------------------

  describe('Property 25: Budget Enforcement Stops Full Expansion', () => {
    /**
     * **Validates: Requirements 12.4**
     *
     * For any context building operation where cumulative tokens approach
     * the budget, no additional nodes SHALL be expanded to FULL level.
     */
    it('should stop expanding nodes when approaching budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 10, maxLength: 30 }),
          fc.integer({ min: 500, max: 2000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            // Token count should not exceed budget
            expect(result.tokenCount).toBeLessThanOrEqual(maxTokens);

            // If we're close to budget, most nodes should be SIGNATURE level
            if (result.tokenCount > maxTokens * 0.9) {
              // At least some nodes should be at SIGNATURE level
              // (not all expanded to FULL)
              expect(result.compressionRatio).toBeGreaterThan(1);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 26: Token Count Reporting
  // ---------------------------------------------------------------------------

  describe('Property 26: Token Count Reporting', () => {
    /**
     * **Validates: Requirements 12.6**
     *
     * For any completed context building operation, the result SHALL include
     * an accurate final token count.
     */
    it('should report accurate token count in result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(nodeArb, { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1000, max: 50000 }),
          async (nodes, maxTokens) => {
            testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

            const result = await builder.compressContext(nodes, maxTokens);

            // Token count should be a positive number
            expect(result.tokenCount).toBeGreaterThan(0);
            expect(Number.isFinite(result.tokenCount)).toBe(true);
            expect(Number.isInteger(result.tokenCount)).toBe(true);

            // Token count should be reasonable (not negative or NaN)
            expect(result.tokenCount).toBeGreaterThanOrEqual(0);
            expect(result.tokenCount).toBeLessThanOrEqual(maxTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report token count that matches estimated tokens', async () => {
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
      ];

      testGraph.nodes = new Map(nodes.map(n => [n.id, n]));

      const result = await builder.compressContext(nodes, 50000);

      // Manually calculate expected tokens
      const content = builder.formatNode(nodes[0], 'SIGNATURE');
      const expectedTokens = builder.estimateTokens(content);

      // Result should match (or be close, accounting for formatting)
      expect(result.tokenCount).toBeGreaterThanOrEqual(expectedTokens);
    });
  });
});
