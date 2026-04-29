/**
 * Graph Context Builder Service
 *
 * Builds relevant codebase context from the Semantic Code Graph based on intent
 * and token budget. Uses intelligent node selection, prioritization, and compression.
 *
 * Requirements: 3.1-3.12, 12.2-12.6
 */

import { GraphContext, IntentClassification, IntentType } from '../types/chat';
import { SCGNode, SemanticCodeGraphData } from '../types/graph';
import { ContextEngine } from '../core/context/engine';
import { GraphTraversal } from '../core/context/graph/traversal';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum token budget for context */
const DEFAULT_MAX_TOKENS = 40000;

/** Percentage of nodes to expand to FULL level (top 20%) */
const FULL_EXPANSION_PERCENTAGE = 0.2;

/** Token estimation: text length / 4 */
const TOKEN_ESTIMATION_DIVISOR = 4;

// ---------------------------------------------------------------------------
// GraphContextBuilder
// ---------------------------------------------------------------------------

/**
 * Service that builds graph context for chat sessions.
 * 
 * Selects relevant nodes based on intent scope, prioritizes by relevance,
 * and compresses to fit within token budget.
 */
export class GraphContextBuilder {
  constructor(
    private contextEngine: ContextEngine,
    private traversal: GraphTraversal
  ) {}

  /**
   * Build context from graph based on intent and token budget.
   * 
   * @param intent - Classified intent with scope and keywords
   * @param maxTokens - Maximum token budget (default: 40,000)
   * @returns GraphContext with nodes, summary, token count, and compression ratio
   * 
   * Requirements: 3.1, 3.12
   * 
   * Postconditions:
   *  - Returns GraphContext with all required fields
   *  - Token count does not exceed maxTokens
   *  - Nodes are selected based on intent scope
   *  - Nodes are prioritized by relevance
   */
  async buildContext(
    intent: IntentClassification,
    maxTokens: number = DEFAULT_MAX_TOKENS
  ): Promise<GraphContext> {
    const graph = this.contextEngine.getGraph();
    if (!graph) {
      throw new Error('Graph not initialized. Run `nexus init` first.');
    }

    logger.debug(
      `[GraphContextBuilder] Building context: scope=${intent.contextScope}, maxTokens=${maxTokens}`
    );

    // Select relevant nodes based on intent scope
    const relevantNodes = this.selectRelevantNodes(intent, graph);
    logger.debug(`[GraphContextBuilder] Selected ${relevantNodes.length} relevant nodes`);

    // Prioritize nodes by relevance score
    const prioritizedNodes = this.prioritizeNodes(relevantNodes, intent);
    logger.debug(`[GraphContextBuilder] Prioritized nodes by relevance`);

    // Compress to fit token budget
    const compressed = await this.compressContext(prioritizedNodes, maxTokens);
    logger.debug(
      `[GraphContextBuilder] Compressed context: ${compressed.tokenCount} tokens, ${compressed.compressionRatio.toFixed(2)}x ratio`
    );

    return compressed;
  }

  /**
   * Select relevant nodes based on intent scope.
   * 
   * @param intent - Intent classification with scope and keywords
   * @param graph - Semantic code graph
   * @returns Array of relevant nodes
   * 
   * Requirements: 3.2, 3.3, 3.4
   * 
   * Scope behavior:
   *  - full: Return all nodes from graph
   *  - partial: Return nodes matching keywords
   *  - minimal: Return only entry point nodes
   */
  selectRelevantNodes(
    intent: IntentClassification,
    graph: SemanticCodeGraphData
  ): SCGNode[] {
    const scope = intent.contextScope;

    if (scope === 'full') {
      // Return all nodes (for review, refactor)
      logger.debug('[GraphContextBuilder] Full scope: selecting all nodes');
      return Array.from(graph.nodes.values());
    }

    if (scope === 'partial') {
      // Return nodes matching keywords (for code, debug, search)
      logger.debug(
        `[GraphContextBuilder] Partial scope: selecting nodes matching keywords: ${intent.keywords.join(', ')}`
      );
      return Array.from(graph.nodes.values()).filter(node =>
        intent.keywords.some(keyword => {
          const keywordLower = keyword.toLowerCase();
          return (
            node.name.toLowerCase().includes(keywordLower) ||
            node.file.toLowerCase().includes(keywordLower) ||
            node.signature?.toLowerCase().includes(keywordLower)
          );
        })
      );
    }

    // Minimal: return only entry points (main functions, exported functions)
    logger.debug('[GraphContextBuilder] Minimal scope: selecting entry points only');
    return Array.from(graph.nodes.values()).filter(
      node =>
        node.type === 'function' &&
        (node.name === 'main' || node.name.toLowerCase().includes('main'))
    );
  }

  /**
   * Prioritize nodes by relevance to intent.
   * 
   * @param nodes - Nodes to prioritize
   * @param intent - Intent classification with keywords
   * @returns Nodes sorted by relevance score (descending)
   * 
   * Requirements: 3.5, 3.6, 3.7, 3.8
   * 
   * Scoring algorithm:
   *  - Keyword match in name: +10 points
   *  - Keyword match in file: +5 points
   *  - Keyword match in signature: +3 points
   *  - Large file (>500 lines) for review: +20 points
   *  - Medium file (>300 lines) for review: +10 points
   *  - Function/class for code/debug: +15 points
   */
  prioritizeNodes(
    nodes: SCGNode[],
    intent: IntentClassification
  ): SCGNode[] {
    // Score each node by relevance
    const scored = nodes.map(node => ({
      node,
      score: this.calculateRelevanceScore(node, intent),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.node);
  }

  /**
   * Calculate relevance score for a node based on intent.
   * 
   * @param node - Node to score
   * @param intent - Intent classification
   * @returns Relevance score (higher = more relevant)
   * 
   * Requirements: 3.6, 3.7, 3.8
   */
  calculateRelevanceScore(
    node: SCGNode,
    intent: IntentClassification
  ): number {
    let score = 0;

    // Keyword matching
    intent.keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (node.name.toLowerCase().includes(keywordLower)) score += 10;
      if (node.file.toLowerCase().includes(keywordLower)) score += 5;
      if (node.signature?.toLowerCase().includes(keywordLower)) score += 3;
    });

    // Intent-specific scoring
    if (intent.intent === IntentType.REVIEW) {
      // Prioritize large files
      const lineCount = (node.endLine || node.line) - node.line;
      if (lineCount > 500) score += 20;
      else if (lineCount > 300) score += 10;
    }

    if (
      intent.intent === IntentType.CODE ||
      intent.intent === IntentType.DEBUG
    ) {
      // Prioritize functions and classes
      if (node.type === 'function' || node.type === 'class') score += 15;
    }

    return score;
  }

  /**
   * Compress context to fit within token budget.
   * 
   * @param nodes - Prioritized nodes
   * @param maxTokens - Maximum token budget
   * @returns GraphContext with compressed content
   * 
   * Requirements: 3.9, 3.10, 3.11, 3.12, 12.3, 12.4, 12.5
   * 
   * Algorithm:
   *  1. Start with SIGNATURE level for all nodes
   *  2. Expand top 20% of nodes to FULL level if budget allows
   *  3. Track cumulative token count
   *  4. Stop expansion when approaching budget
   */
  async compressContext(
    nodes: SCGNode[],
    maxTokens: number
  ): Promise<GraphContext> {
    // Start with SIGNATURE level for all nodes
    const context: Array<{
      node: SCGNode;
      level: 'SIGNATURE' | 'FULL';
      content: string;
    }> = nodes.map(node => ({
      node,
      level: 'SIGNATURE' as const,
      content: this.formatNode(node, 'SIGNATURE'),
    }));

    let totalTokens = this.estimateTokens(
      context.map(c => c.content).join('\n')
    );

    logger.debug(
      `[GraphContextBuilder] Initial context: ${totalTokens} tokens (SIGNATURE level)`
    );

    // If initial context exceeds budget, remove nodes until we fit
    if (totalTokens > maxTokens) {
      logger.debug(
        `[GraphContextBuilder] Initial context exceeds budget, removing nodes`
      );
      
      while (totalTokens > maxTokens && context.length > 0) {
        // Remove last node (lowest priority)
        const removed = context.pop();
        if (removed) {
          totalTokens = this.estimateTokens(
            context.map(c => c.content).join('\n')
          );
        }
      }
      
      logger.debug(
        `[GraphContextBuilder] Reduced to ${context.length} nodes, ${totalTokens} tokens`
      );
    }

    // If under 70% of budget, expand high-priority nodes to FULL
    if (totalTokens < maxTokens * 0.7 && context.length > 0) {
      const topNodeCount = Math.floor(context.length * FULL_EXPANSION_PERCENTAGE);
      const topNodes = context.slice(0, topNodeCount);

      logger.debug(
        `[GraphContextBuilder] Expanding top ${topNodeCount} nodes to FULL level`
      );

      for (const entry of topNodes) {
        const fullContent = await this.getFullNodeContent(entry.node);
        const fullTokens = this.estimateTokens(fullContent);
        const oldTokens = this.estimateTokens(entry.content);
        const tokenDelta = fullTokens - oldTokens;

        // Check if adding this node would exceed budget
        if (totalTokens + tokenDelta <= maxTokens) {
          const idx = context.findIndex(c => c.node.id === entry.node.id);
          if (idx >= 0) {
            totalTokens += tokenDelta;
            context[idx] = { node: entry.node, level: 'FULL', content: fullContent };

            logger.debug(
              `[GraphContextBuilder] Expanded ${entry.node.name} to FULL (+${tokenDelta} tokens, total: ${totalTokens})`
            );
          }
        } else {
          logger.debug(
            `[GraphContextBuilder] Budget reached, stopping expansion at ${totalTokens} tokens`
          );
          break;
        }
      }
    }

    // Build summary
    const summary = this.buildSummary(
      context.map(c => c.node),
      context
    );

    // Calculate compression ratio
    const fullCount = context.filter(c => c.level === 'FULL').length;
    const compressionRatio = context.length / Math.max(fullCount, 1);

    return {
      nodes: context.map(c => c.node),
      summary,
      tokenCount: totalTokens,
      compressionRatio,
    };
  }

  /**
   * Format node at specified compression level.
   * 
   * @param node - Node to format
   * @param level - Compression level (SIGNATURE or FULL)
   * @returns Formatted node content
   * 
   * Requirements: 3.9
   */
  formatNode(node: SCGNode, level: 'SIGNATURE' | 'FULL'): string {
    if (level === 'SIGNATURE') {
      return `${node.type} ${node.name} (${node.file}:${node.line})`;
    }

    // FULL level includes signature and location
    return `${node.type} ${node.name}\nFile: ${node.file}:${node.line}-${node.endLine}\nSignature: ${node.signature}`;
  }

  /**
   * Get full node content including source code.
   * 
   * @param node - Node to get content for
   * @returns Full node content with source code
   * 
   * Requirements: 3.10
   */
  async getFullNodeContent(node: SCGNode): Promise<string> {
    try {
      const fileContent = await this.contextEngine.getFileContent(node.file);
      const lines = fileContent.split('\n');
      const nodeLines = lines.slice(node.line - 1, node.endLine);
      return `\`\`\`\n${nodeLines.join('\n')}\n\`\`\``;
    } catch (error) {
      logger.warn(
        `[GraphContextBuilder] Failed to read file ${node.file}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      // Fall back to SIGNATURE level
      return this.formatNode(node, 'SIGNATURE');
    }
  }

  /**
   * Build summary of context composition.
   * 
   * @param allNodes - All selected nodes
   * @param context - Context entries with compression levels
   * @returns Summary string
   * 
   * Requirements: 3.12
   */
  buildSummary(
    allNodes: SCGNode[],
    context: Array<{ node: SCGNode; level: string; content: string }>
  ): string {
    const fileCount = new Set(allNodes.map(n => n.file)).size;
    const fullCount = context.filter(c => c.level === 'FULL').length;
    const sigCount = context.filter(c => c.level === 'SIGNATURE').length;

    return `Graph Context: ${allNodes.length} nodes from ${fileCount} files (${fullCount} full, ${sigCount} signatures)`;
  }

  /**
   * Estimate token count for text.
   * 
   * @param text - Text to estimate
   * @returns Estimated token count
   * 
   * Requirements: 12.2
   * 
   * Formula: text length / 4 (rounded up)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / TOKEN_ESTIMATION_DIVISOR);
  }
}
