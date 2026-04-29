/**
 * Semantic Code Search Service
 *
 * Implements the SemanticSearchService interface for vector similarity search
 * enriched with Semantic Code Graph context.
 *
 * Requirements: 1.1–1.7, 2.1–2.5, 3.1–3.3
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SearchResult,
  SearchQuery,
  SearchResponse,
  SearchResultType,
  GraphContextInfo,
  SearchGraphLink,
  ContextEntry,
  SCGNode,
  EdgeType,
} from '../types';

import { VectorStore } from '../core/store/vector-store';
import { GraphTraversal } from '../core/context/graph/traversal';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of graph neighbours returned per search result. */
const MAX_NEIGHBOURS_PER_RESULT = 5;

/** Default graph context boost added to relevanceScore for ranking. */
const DEFAULT_GRAPH_CONTEXT_BOOST = 0.1;

/** Maximum number of retries for embeddings API failures. */
const MAX_EMBEDDING_RETRIES = 3;

/** Base delay (ms) for exponential backoff on embedding failures. */
const EMBEDDING_BACKOFF_BASE_MS = 200;

/** Maximum search duration before returning partial results (ms). */
const SEARCH_TIMEOUT_MS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw `ContextEntry` (from VectorStore) to a `SearchResult`.
 *
 * We attempt to match the entry to a graph node by file + line so that graph
 * enrichment can later populate `graphContext`.
 */
function mapEntryToSearchResult(entry: ContextEntry): SearchResult {
  return {
    id: entry.id,
    content: entry.content,
    relevanceScore: entry.relevance,
    file: entry.metadata.file ?? '',
    lineRange: {
      start: entry.metadata.line ?? 0,
      end: entry.metadata.line ?? 0,
    },
    graphNodeId: null, // resolved during enrichment
    graphContext: [],
    matchType: inferMatchType(entry.metadata.type),
    summary: '',
  };
}

/** Infer the semantic `SearchResultType` from a ContextEntry metadata type. */
function inferMatchType(
  metaType: ContextEntry['metadata']['type'],
): SearchResultType {
  switch (metaType) {
    case 'code':
      return SearchResultType.SNIPPET;
    case 'documentation':
      return SearchResultType.FILE;
    default:
      return SearchResultType.SNIPPET;
  }
}

/**
 * Attempt to locate a graph node that corresponds to the given search result
 * by matching on `file` and overlapping line range.
 */
function findMatchingGraphNode(
  result: SearchResult,
  traversal: GraphTraversal,
): string | null {
  // Use the graph's internal node map – we search via traversal.findByName
  // with the file path to find candidates, then narrow by line range.
  const candidates = traversal.findByName(result.file, 20);
  for (const node of candidates) {
    if (
      node.file === result.file &&
      node.line <= result.lineRange.end &&
      node.endLine >= result.lineRange.start
    ) {
      return node.id;
    }
  }
  // Broader fallback: match any node in the same file
  for (const node of candidates) {
    if (node.file === result.file) {
      return node.id;
    }
  }
  return null;
}

/**
 * Convert neighbour `SCGNode`s retrieved from the graph traversal into
 * `GraphContextInfo` objects, limiting to the first `max` entries.
 *
 * Because `GraphTraversal.getRelatedNodes` returns flat `SCGNode[]` without
 * edge metadata, we set a reasonable default relationship and derive distance
 * from the BFS traversal.
 */
function buildGraphContext(
  nodeId: string,
  traversal: GraphTraversal,
  maxNeighbours: number,
  maxDepth: number,
): GraphContextInfo[] {
  const context: GraphContextInfo[] = [];

  // Perform a shallow BFS to get distance information
  const bfsResult = traversal.bfs([nodeId], maxDepth);

  // Collect neighbour nodes with their distances, skipping the seed itself
  for (const node of bfsResult.nodes) {
    if (node.id === nodeId) continue;
    const distance = bfsResult.visited.get(node.id);
    if (distance === undefined || distance > maxDepth) continue;

    context.push({
      node,
      relationship: inferRelationship(nodeId, node.id, traversal),
      distance,
    });

    if (context.length >= maxNeighbours) break;
  }

  return context;
}

/**
 * Infer the strongest edge type connecting two nodes by inspecting the
 * adjacency index through `getRelatedNodes`.
 */
function inferRelationship(
  fromId: string,
  toId: string,
  traversal: GraphTraversal,
): EdgeType {
  // Try each edge type to find the strongest relationship
  const priorityEdgeTypes: EdgeType[] = [
    EdgeType.CALLS,
    EdgeType.EXTENDS,
    EdgeType.IMPLEMENTS,
    EdgeType.IMPORTS,
    EdgeType.DEPENDS_ON,
    EdgeType.USES,
    EdgeType.REFERENCES,
    EdgeType.TESTS,
    EdgeType.EXPORTS,
    EdgeType.ROUTES_TO,
  ];

  for (const edgeType of priorityEdgeTypes) {
    const related = traversal.getRelatedNodes(fromId, [edgeType], 50);
    if (related.some((n) => n.id === toId)) {
      return edgeType;
    }
  }

  // Default fallback
  return EdgeType.REFERENCES;
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize a user-supplied query string.
 *
 * Removes control characters and normalises whitespace to prevent injection
 * into the embeddings API or Qdrant queries.
 */
function sanitizeQuery(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// SemanticSearchService
// ---------------------------------------------------------------------------

/**
 * Service that provides semantic code search backed by vector similarity and
 * enriched with Semantic Code Graph context.
 */
export class SemanticSearchService {
  private searchHistory: SearchQuery[] = [];
  private available: boolean;

  constructor() {
    this.available = true;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a semantic search query with a configurable timeout.
   *
   * Wraps the core search logic with a timeout guard. If the search
   * exceeds `timeoutMs` (default 500ms), partial results are returned
   * with a warning.
   *
   * @param query   - The search query parameters
   * @param vectorStore - Vector store for similarity search
   * @param traversal  - Graph traversal for context enrichment
   * @param timeoutMs  - Optional timeout override in milliseconds (0 = no timeout)
   */
  async executeSearch(
    query: SearchQuery,
    vectorStore: VectorStore,
    traversal: GraphTraversal,
    timeoutMs: number = SEARCH_TIMEOUT_MS,
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    // Validate query
    const sanitizedText = sanitizeQuery(query.text);
    if (!sanitizedText) {
      return {
        query: query.text,
        results: [],
        totalMatches: 0,
        searchTimeMs: Date.now() - startTime,
        graphNodesExplored: 0,
      };
    }

    // If timeout is 0 or negative, skip timeout wrapper
    if (timeoutMs <= 0) {
      return this.executeSearchCore(
        query,
        sanitizedText,
        vectorStore,
        traversal,
        startTime,
      );
    }

    // Create timeout promise for overall search budget
    const timeoutPromise = new Promise<SearchResponse>((resolve) => {
      setTimeout(() => {
        resolve({
          query: query.text,
          results: [],
          totalMatches: 0,
          searchTimeMs: timeoutMs,
          graphNodesExplored: 0,
          warning: `Search exceeded ${timeoutMs}ms budget. Returning partial results.`,
        });
      }, timeoutMs);
    });

    // Race the actual search against the timeout
    const searchPromise = this.executeSearchCore(
      query,
      sanitizedText,
      vectorStore,
      traversal,
      startTime,
    );

    const response = await Promise.race([searchPromise, timeoutPromise]);

    // If the core search finished but exceeded the budget, add a warning
    if (!response.warning && response.searchTimeMs > timeoutMs) {
      response.warning = `Search completed in ${response.searchTimeMs}ms, exceeding ${timeoutMs}ms budget.`;
    }

    return response;
  }

  /**
   * Core search logic extracted for timeout wrapping.
   */
  private async executeSearchCore(
    query: SearchQuery,
    sanitizedText: string,
    vectorStore: VectorStore,
    traversal: GraphTraversal,
    startTime: number,
  ): Promise<SearchResponse> {
    // ---- Step 1: Vector similarity search with retry ----
    let rawEntries: ContextEntry[] = [];
    let vectorStoreAvailable = false;

    try {
      vectorStoreAvailable = vectorStore.isAvailable();
    } catch {
      vectorStoreAvailable = false;
    }

    if (vectorStoreAvailable) {
      rawEntries = await this.searchWithRetry(
        vectorStore,
        sanitizedText,
        query.limit * 2, // over-fetch for post-filtering
        query.minScore,
      );
    }

    // ---- Fallback: text-only search when vector store unavailable ----
    let usedFallback = false;
    if (!vectorStoreAvailable || rawEntries.length === 0) {
      const fallbackNodes = traversal.findByName(sanitizedText, query.limit * 2);
      rawEntries = fallbackNodes.map((node) => ({
        id: node.id,
        content: node.signature,
        relevance: 0.5, // baseline relevance for text-only matches
        metadata: {
          file: node.file,
          line: node.line,
          type: 'code' as const,
          source: 'graph_fallback',
          timestamp: new Date(),
        },
      }));
      usedFallback = true;
    }

    // ---- Step 2: Map to SearchResult ----
    let results: SearchResult[] = rawEntries.map(mapEntryToSearchResult);

    // ---- Step 3: Resolve graph node IDs ----
    for (let i = 0; i < results.length; i++) {
      results[i].graphNodeId = findMatchingGraphNode(results[i], traversal);
    }

    // ---- Step 4: Apply filters ----
    results = this.applyFilters(results, query);

    // ---- Step 5: Graph enrichment ----
    if (query.includeGraphContext) {
      results = enrichResultsWithGraph(
        results,
        traversal,
        3, // default maxDepth
      );
    }

    // ---- Step 6: Rank ----
    results = rankResults(results, DEFAULT_GRAPH_CONTEXT_BOOST);

    // ---- Step 7: Limit ----
    const finalResults = results.slice(0, query.limit);

    // ---- Step 8: Build response ----
    const searchTimeMs = Date.now() - startTime;
    const graphNodesExplored = finalResults.reduce(
      (sum, r) => sum + r.graphContext.length,
      0,
    );

    // Record history
    this.searchHistory.push(query);

    const response: SearchResponse = {
      query: query.text,
      results: finalResults,
      totalMatches: rawEntries.length,
      searchTimeMs,
      graphNodesExplored,
    };

    logger.debug(
      `[SearchService] Query "${query.text}" returned ${finalResults.length} results` +
        ` in ${searchTimeMs}ms${usedFallback ? ' (fallback)' : ''}`,
    );

    return response;
  }

  /**
   * Retrieve the search history (ordered from oldest to newest).
   */
  getSearchHistory(): SearchQuery[] {
    return [...this.searchHistory];
  }

  /**
   * Clear the search history.
   */
  clearHistory(): void {
    this.searchHistory = [];
  }

  /**
   * Check whether the service is available.
   */
  isAvailable(): boolean {
    return this.available;
  }

  // -----------------------------------------------------------------------
  // Cross-feature integration: Search → Graph linking
  // -----------------------------------------------------------------------

  /**
   * Create a SearchGraphLink for a search result.
   *
   * This enables navigation from search results to:
   * - GraphExplorer (visualize node and relationships)
   * - ImpactAnalysis (analyze impact of changes to this node)
   * - AgentChat (discuss this code with an agent)
   *
   * @param result - Search result to create link for
   * @param callbacks - Callback functions for each integration point
   * @returns SearchGraphLink object with navigation methods
   */
  createGraphLink(
    result: SearchResult,
    callbacks: {
      onOpenGraphExplorer?: (nodeId: string) => void;
      onShowImpact?: (nodeId: string) => void;
      onDiscussInChat?: (nodeId: string, context: string) => void;
    }
  ): SearchGraphLink | null {
    // Only create link if result has a valid graph node
    if (!result.graphNodeId) {
      return null;
    }

    return {
      searchResultId: result.id,
      graphNodeId: result.graphNodeId,
      openInGraphExplorer: () => {
        callbacks.onOpenGraphExplorer?.(result.graphNodeId!);
        logger.info(
          `[SearchService] Opening GraphExplorer for node: ${result.graphNodeId}`
        );
      },
      showImpact: () => {
        callbacks.onShowImpact?.(result.graphNodeId!);
        logger.info(
          `[SearchService] Opening ImpactAnalysis for node: ${result.graphNodeId}`
        );
      },
      discussInChat: () => {
        const context = `Code from ${result.file}:${result.lineRange.start}-${result.lineRange.end}\n\n${result.content}`;
        callbacks.onDiscussInChat?.(result.graphNodeId!, context);
        logger.info(
          `[SearchService] Opening Chat with context for node: ${result.graphNodeId}`
        );
      },
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Attempt vector search with exponential backoff retry on failure.
   */
  private async searchWithRetry(
    vectorStore: VectorStore,
    text: string,
    limit: number,
    minScore: number,
  ): Promise<ContextEntry[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_EMBEDDING_RETRIES; attempt++) {
      try {
        return await vectorStore.search(text, limit, minScore);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.debug(
          `[SearchService] Embedding search attempt ${attempt + 1} failed: ${lastError.message}`,
        );

        if (attempt < MAX_EMBEDDING_RETRIES - 1) {
          const delayMs = EMBEDDING_BACKOFF_BASE_MS * Math.pow(2, attempt);
          await sleep(delayMs);
        }
      }
    }

    logger.warn(
      `[SearchService] All ${MAX_EMBEDDING_RETRIES} embedding attempts failed. Returning empty results.`,
    );
    return [];
  }

  /**
   * Apply file and type filters from the query to the results.
   */
  private applyFilters(
    results: SearchResult[],
    query: SearchQuery,
  ): SearchResult[] {
    let filtered = results;

    // File filter
    if (query.fileFilter) {
      const pattern = query.fileFilter.toLowerCase();
      filtered = filtered.filter((r) =>
        r.file.toLowerCase().includes(pattern),
      );
    }

    // Type filter
    if (query.typeFilter) {
      filtered = filtered.filter((r) => r.matchType === query.typeFilter);
    }

    // Min score filter (ensure all results meet threshold)
    filtered = filtered.filter((r) => r.relevanceScore >= query.minScore);

    return filtered;
  }
}

// ---------------------------------------------------------------------------
// Standalone exported functions (used by the service and testable in isolation)
// ---------------------------------------------------------------------------

/**
 * Enrich search results with graph context.
 *
 * For each result that has a valid `graphNodeId`, populate the `graphContext`
 * field with up to `MAX_NEIGHBOURS_PER_RESULT` (5) related nodes from the
 * Semantic Code Graph, respecting `maxDepth`.
 *
 * **Does not mutate** the input array — returns a new array with copies.
 *
 * @param results   - Search results to enrich
 * @param traversal - Graph traversal engine
 * @param maxDepth  - Maximum traversal depth (default 3)
 * @returns New array of enriched results
 *
 * Postconditions:
 *  - Each result with a valid `graphNodeId` has `graphContext` populated
 *  - `graphContext` entries have `distance <= maxDepth`
 *  - At most 5 neighbours per result
 *  - Results without matching graph nodes have `graphNodeId = null` and empty `graphContext`
 *  - Original results are not mutated
 */
export function enrichResultsWithGraph(
  results: SearchResult[],
  traversal: GraphTraversal,
  maxDepth: number = 3,
): SearchResult[] {
  return results.map((result) => {
    // No graph node — clear context and return copy
    if (!result.graphNodeId) {
      return {
        ...result,
        graphContext: [],
      };
    }

    // Verify the node exists in the graph
    const context = buildGraphContext(
      result.graphNodeId,
      traversal,
      MAX_NEIGHBOURS_PER_RESULT,
      maxDepth,
    );

    return {
      ...result,
      graphContext: context,
    };
  });
}

/**
 * Rank search results by composite score.
 *
 * Composite score = `relevanceScore` + graph context boost (if applicable).
 * Uses stable sort — results with equal composite scores preserve their
 * relative order.
 *
 * **Does not mutate** the input array — returns a new sorted array.
 *
 * @param results           - Search results to rank
 * @param graphContextBoost - Boost value for results with graph context (default 0.1)
 * @returns New array sorted by descending composite score
 *
 * Postconditions:
 *  - Results are sorted by descending composite score
 *  - Equal scores preserve relative order (stable sort)
 *  - Input results are not mutated
 */
export function rankResults(
  results: SearchResult[],
  graphContextBoost: number = DEFAULT_GRAPH_CONTEXT_BOOST,
): SearchResult[] {
  // Create indexed pairs for stable sort
  const indexed = results.map((result, index) => ({ result, index }));

  indexed.sort((a, b) => {
    const scoreA = a.result.relevanceScore + (a.result.graphContext.length > 0 ? graphContextBoost : 0);
    const scoreB = b.result.relevanceScore + (b.result.graphContext.length > 0 ? graphContextBoost : 0);

    // Descending by score; tie-break by original index (stable)
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.index - b.index;
  });

  return indexed.map(({ result }) => ({ ...result }));
}
