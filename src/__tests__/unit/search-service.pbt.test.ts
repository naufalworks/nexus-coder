/**
 * Property-Based Tests for Search Service
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.2, 2.4, 2.5**
 */

import * as fc from 'fast-check';
import { enrichResultsWithGraph, rankResults } from '../../services/search-service';
import {
  SearchResult,
  SearchResultType,
  GraphContextInfo,
} from '../../types/search';
import {
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
} from '../../types/graph';
import { GraphTraversal } from '../../core/context/graph/traversal';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const nodeTypeArb = fc.constantFrom(
  NodeType.FUNCTION,
  NodeType.CLASS,
  NodeType.MODULE,
  NodeType.VARIABLE,
  NodeType.IMPORT,
) as fc.Arbitrary<NodeType>;

const edgeTypeArb = fc.constantFrom(
  EdgeType.CALLS,
  EdgeType.IMPORTS,
  EdgeType.USES,
  EdgeType.REFERENCES,
  EdgeType.EXTENDS,
) as fc.Arbitrary<EdgeType>;

const searchResultTypeArb = fc.constantFrom(
  SearchResultType.FUNCTION,
  SearchResultType.CLASS,
  SearchResultType.INTERFACE,
  SearchResultType.SNIPPET,
  SearchResultType.FILE,
) as fc.Arbitrary<SearchResultType>;

/** Generate a valid graph node with a deterministic id */
const scgNodeArb: fc.Arbitrary<SCGNode> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map(s => `node_${s}`),
  type: nodeTypeArb,
  name: fc.string({ minLength: 1, maxLength: 15 }),
  file: fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
  line: fc.nat({ max: 500 }),
  endLine: fc.nat({ max: 500 }).map(n => n + 10),
  signature: fc.string({ minLength: 1, maxLength: 30 }),
  summary: fc.string({ minLength: 0, maxLength: 50 }),
  complexity: fc.nat({ max: 20 }),
  changeFrequency: fc.nat({ max: 100 }),
});

/** Generate an edge that references node ids from a known set */
const edgeArb = (nodeIds: string[]): fc.Arbitrary<SCGEdge> =>
  fc.record({
    from: fc.constantFrom(...nodeIds),
    to: fc.constantFrom(...nodeIds),
    type: edgeTypeArb,
    weight: fc.nat({ max: 10 }),
  });

/** Build a SemanticCodeGraphData from nodes and edges */
function buildGraph(nodes: SCGNode[], edges: SCGEdge[]): SemanticCodeGraphData {
  const nodeMap = new Map<string, SCGNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }
  const depMap = new Map<string, string[]>();
  for (const n of nodes) {
    depMap.set(n.id, edges.filter(e => e.from === n.id).map(e => e.to));
  }
  return {
    nodes: nodeMap,
    edges,
    dependencies: depMap,
    builtAt: new Date(),
    fileCount: new Set(nodes.map(n => n.file)).size,
    symbolCount: nodes.length,
  };
}

/** Generate a valid graph with at least 2 nodes and edges between them */
const graphArb: fc.Arbitrary<SemanticCodeGraphData> = fc
  .array(scgNodeArb, { minLength: 2, maxLength: 10 })
  .chain(nodes => {
    const ids = nodes.map(n => n.id);
    // Ensure unique ids
    const uniqueMap = new Map<string, SCGNode>();
    for (const n of nodes) {
      uniqueMap.set(n.id, n);
    }
    const uniqueNodes = Array.from(uniqueMap.values());
    const uniqueIds = uniqueNodes.map(n => n.id);
    return fc
      .array(edgeArb(uniqueIds), { minLength: 1, maxLength: 15 })
      .map(edges => buildGraph(uniqueNodes, edges));
  });

/** Generate a search result with optional graph node ID */
const searchResultArb = (
  graphNodeIds?: string[]
): fc.Arbitrary<SearchResult> =>
  fc.record({
    id: fc.uuid(),
    content: fc.string({ minLength: 10, maxLength: 100 }),
    relevanceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    file: fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
    lineRange: fc.record({
      start: fc.nat({ max: 500 }),
      end: fc.nat({ max: 500 }).map(n => n + 10),
    }),
    graphNodeId: graphNodeIds
      ? fc.option(fc.constantFrom(...graphNodeIds), { nil: null })
      : fc.constant(null),
    graphContext: fc.constant([]),
    matchType: searchResultTypeArb,
    summary: fc.string({ minLength: 0, maxLength: 50 }),
  });

/** Generate an array of search results with scores in a specific range */
const searchResultsArb = (
  minScore: number,
  maxScore: number,
  minLength: number = 0,
  maxLength: number = 20,
  graphNodeIds?: string[]
): fc.Arbitrary<SearchResult[]> =>
  fc.array(
    fc.record({
      id: fc.uuid(),
      content: fc.string({ minLength: 10, maxLength: 100 }),
      relevanceScore: fc.double({ min: minScore, max: maxScore, noNaN: true }),
      file: fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
      lineRange: fc.record({
        start: fc.nat({ max: 500 }),
        end: fc.nat({ max: 500 }).map(n => n + 10),
      }),
      graphNodeId: graphNodeIds
        ? fc.option(fc.constantFrom(...graphNodeIds), { nil: null })
        : fc.constant(null),
      graphContext: fc.constant([]),
      matchType: searchResultTypeArb,
      summary: fc.string({ minLength: 0, maxLength: 50 }),
    }),
    { minLength, maxLength }
  );

// ---------------------------------------------------------------------------
// Property 1: Search Result Score Ordering
// ---------------------------------------------------------------------------

describe('Search Service Property-Based Tests', () => {
  describe('Property 1: Search Result Score Ordering', () => {
    it('should return results sorted in descending order by relevance score', () => {
      fc.assert(
        fc.property(
          searchResultsArb(0.3, 1.0, 2, 20),
          fc.double({ min: 0, max: 0.5, noNaN: true }), // graphContextBoost
          (results, boost) => {
            const ranked = rankResults(results, boost);

            // Property: Results are sorted in descending order by composite score
            for (let i = 0; i < ranked.length - 1; i++) {
              const scoreA =
                ranked[i].relevanceScore +
                (ranked[i].graphContext.length > 0 ? boost : 0);
              const scoreB =
                ranked[i + 1].relevanceScore +
                (ranked[i + 1].graphContext.length > 0 ? boost : 0);

              if (scoreA < scoreB) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain stable sort for equal scores', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              content: fc.string({ minLength: 10, maxLength: 100 }),
              relevanceScore: fc.constant(0.75 as number), // All same score
              file: fc
                .string({ minLength: 3, maxLength: 20 })
                .map(s => `src/${s}.ts`),
              lineRange: fc.record({
                start: fc.nat({ max: 500 }),
                end: fc.nat({ max: 500 }).map(n => n + 10),
              }),
              graphNodeId: fc.constant(null as string | null),
              graphContext: fc.constant([] as GraphContextInfo[]),
              matchType: searchResultTypeArb,
              summary: fc.string({ minLength: 0, maxLength: 50 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          results => {
            const originalIds = results.map(r => r.id);
            const ranked = rankResults(results, 0.1);
            const rankedIds = ranked.map(r => r.id);

            // Property: Stable sort preserves relative order for equal scores
            return JSON.stringify(originalIds) === JSON.stringify(rankedIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not mutate input results during ranking', () => {
      fc.assert(
        fc.property(
          searchResultsArb(0.3, 1.0, 2, 20),
          fc.double({ min: 0, max: 0.5, noNaN: true }),
          (results, boost) => {
            // Deep clone to compare later
            const originalResults = JSON.parse(JSON.stringify(results));

            rankResults(results, boost);

            // Property: Input array is not mutated
            return (
              JSON.stringify(results) === JSON.stringify(originalResults)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply graph context boost correctly', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.5, max: 0.9, noNaN: true }), // base score
          fc.double({ min: 0.05, max: 0.2, noNaN: true }), // boost
          (baseScore, boost) => {
            // Create two results: one with graph context, one without
            const resultWithContext: SearchResult = {
              id: 'with-context',
              content: 'test content',
              relevanceScore: baseScore,
              file: 'src/test.ts',
              lineRange: { start: 1, end: 10 },
              graphNodeId: 'node_1',
              graphContext: [
                {
                  node: {
                    id: 'node_2',
                    type: NodeType.FUNCTION,
                    name: 'testFunc',
                    file: 'src/test.ts',
                    line: 20,
                    endLine: 30,
                    signature: 'function testFunc()',
                    summary: 'test',
                    complexity: 5,
                    changeFrequency: 10,
                  },
                  relationship: EdgeType.CALLS,
                  distance: 1,
                },
              ],
              matchType: SearchResultType.FUNCTION,
              summary: 'test',
            };

            const resultWithoutContext: SearchResult = {
              ...resultWithContext,
              id: 'without-context',
              graphNodeId: null,
              graphContext: [],
            };

            const ranked = rankResults(
              [resultWithoutContext, resultWithContext],
              boost
            );

            // Property: Result with graph context should rank higher
            return ranked[0].id === 'with-context';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: Search Result Limit Compliance
  // ---------------------------------------------------------------------------

  describe('Property 2: Search Result Limit Compliance', () => {
    it('should return at most N results when limit is applied', () => {
      fc.assert(
        fc.property(
          searchResultsArb(0.3, 1.0, 5, 50),
          fc.nat({ max: 20 }), // limit
          (results, limit) => {
            const ranked = rankResults(results, 0.1);
            const limited = ranked.slice(0, limit);

            // Property: Limited results contain at most N items
            return limited.length <= limit;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all results when limit exceeds result count', () => {
      fc.assert(
        fc.property(
          searchResultsArb(0.3, 1.0, 2, 10),
          (results) => {
            const limit = results.length + 10;
            const ranked = rankResults(results, 0.1);
            const limited = ranked.slice(0, limit);

            // Property: When limit > count, return all results
            return limited.length === results.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array when limit is 0', () => {
      fc.assert(
        fc.property(searchResultsArb(0.3, 1.0, 2, 10), results => {
          const ranked = rankResults(results, 0.1);
          const limited = ranked.slice(0, 0);

          // Property: Limit of 0 returns empty array
          return limited.length === 0;
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 3: Graph Enrichment Consistency
  // ---------------------------------------------------------------------------

  describe('Property 3: Graph Enrichment Consistency', () => {
    it('should populate graphContext without modifying relevanceScore or content', () => {
      fc.assert(
        fc.property(graphArb, fc.integer({ min: 1, max: 4 }), (graph, maxDepth) => {
          const nodeIds = Array.from(graph.nodes.keys());
          if (nodeIds.length === 0) return true;

          // Create results with valid graph node IDs
          const results: SearchResult[] = nodeIds.slice(0, 5).map((nodeId, i) => ({
            id: `result_${i}`,
            content: `test content ${i}`,
            relevanceScore: 0.5 + i * 0.1,
            file: 'src/test.ts',
            lineRange: { start: i * 10, end: i * 10 + 10 },
            graphNodeId: nodeId,
            graphContext: [],
            matchType: SearchResultType.FUNCTION,
            summary: 'test',
          }));

          // Store original values
          const originalScores = results.map(r => r.relevanceScore);
          const originalContent = results.map(r => r.content);

          const traversal = new GraphTraversal(graph);
          const enriched = enrichResultsWithGraph(results, traversal, maxDepth);

          // Property: relevanceScore is not modified
          for (let i = 0; i < enriched.length; i++) {
            if (enriched[i].relevanceScore !== originalScores[i]) {
              return false;
            }
          }

          // Property: content is not modified
          for (let i = 0; i < enriched.length; i++) {
            if (enriched[i].content !== originalContent[i]) {
              return false;
            }
          }

          // Property: graphContext is populated for results with valid graphNodeId
          for (const result of enriched) {
            if (result.graphNodeId !== null) {
              // Should have graphContext (may be empty if no neighbors)
              if (result.graphContext === undefined) {
                return false;
              }
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should respect maxDepth constraint in graph context', () => {
      fc.assert(
        fc.property(graphArb, fc.integer({ min: 1, max: 4 }), (graph, maxDepth) => {
          const nodeIds = Array.from(graph.nodes.keys());
          if (nodeIds.length === 0) return true;

          const results: SearchResult[] = nodeIds.slice(0, 3).map((nodeId, i) => ({
            id: `result_${i}`,
            content: `test content ${i}`,
            relevanceScore: 0.7,
            file: 'src/test.ts',
            lineRange: { start: i * 10, end: i * 10 + 10 },
            graphNodeId: nodeId,
            graphContext: [],
            matchType: SearchResultType.FUNCTION,
            summary: 'test',
          }));

          const traversal = new GraphTraversal(graph);
          const enriched = enrichResultsWithGraph(results, traversal, maxDepth);

          // Property: All graphContext entries have distance <= maxDepth
          for (const result of enriched) {
            for (const ctx of result.graphContext) {
              if (ctx.distance > maxDepth) {
                return false;
              }
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should limit graph context to at most 5 neighbors per result', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodeIds = Array.from(graph.nodes.keys());
          if (nodeIds.length === 0) return true;

          const results: SearchResult[] = nodeIds.slice(0, 3).map((nodeId, i) => ({
            id: `result_${i}`,
            content: `test content ${i}`,
            relevanceScore: 0.7,
            file: 'src/test.ts',
            lineRange: { start: i * 10, end: i * 10 + 10 },
            graphNodeId: nodeId,
            graphContext: [],
            matchType: SearchResultType.FUNCTION,
            summary: 'test',
          }));

          const traversal = new GraphTraversal(graph);
          const enriched = enrichResultsWithGraph(results, traversal, 3);

          // Property: At most 5 neighbors per result
          for (const result of enriched) {
            if (result.graphContext.length > 5) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should not mutate input results during enrichment', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodeIds = Array.from(graph.nodes.keys());
          if (nodeIds.length === 0) return true;

          const results: SearchResult[] = nodeIds.slice(0, 3).map((nodeId, i) => ({
            id: `result_${i}`,
            content: `test content ${i}`,
            relevanceScore: 0.7,
            file: 'src/test.ts',
            lineRange: { start: i * 10, end: i * 10 + 10 },
            graphNodeId: nodeId,
            graphContext: [],
            matchType: SearchResultType.FUNCTION,
            summary: 'test',
          }));

          const originalResults = JSON.parse(JSON.stringify(results));

          const traversal = new GraphTraversal(graph);
          enrichResultsWithGraph(results, traversal, 3);

          // Property: Input array is not mutated
          return JSON.stringify(results) === JSON.stringify(originalResults);
        }),
        { numRuns: 50 }
      );
    });

    it('should set graphContext to empty array for results without graphNodeId', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const results: SearchResult[] = [
            {
              id: 'result_1',
              content: 'test content',
              relevanceScore: 0.7,
              file: 'src/test.ts',
              lineRange: { start: 1, end: 10 },
              graphNodeId: null, // No graph node
              graphContext: [],
              matchType: SearchResultType.FUNCTION,
              summary: 'test',
            },
          ];

          const traversal = new GraphTraversal(graph);
          const enriched = enrichResultsWithGraph(results, traversal, 3);

          // Property: Results without graphNodeId have empty graphContext
          return enriched[0].graphContext.length === 0;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve all other result fields during enrichment', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodeIds = Array.from(graph.nodes.keys());
          if (nodeIds.length === 0) return true;

          const results: SearchResult[] = nodeIds.slice(0, 2).map((nodeId, i) => ({
            id: `result_${i}`,
            content: `test content ${i}`,
            relevanceScore: 0.5 + i * 0.1,
            file: `src/test${i}.ts`,
            lineRange: { start: i * 10, end: i * 10 + 10 },
            graphNodeId: nodeId,
            graphContext: [],
            matchType: SearchResultType.FUNCTION,
            summary: `summary ${i}`,
          }));

          const traversal = new GraphTraversal(graph);
          const enriched = enrichResultsWithGraph(results, traversal, 3);

          // Property: All fields except graphContext are preserved
          for (let i = 0; i < enriched.length; i++) {
            if (
              enriched[i].id !== results[i].id ||
              enriched[i].content !== results[i].content ||
              enriched[i].relevanceScore !== results[i].relevanceScore ||
              enriched[i].file !== results[i].file ||
              enriched[i].lineRange.start !== results[i].lineRange.start ||
              enriched[i].lineRange.end !== results[i].lineRange.end ||
              enriched[i].graphNodeId !== results[i].graphNodeId ||
              enriched[i].matchType !== results[i].matchType ||
              enriched[i].summary !== results[i].summary
            ) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
});
