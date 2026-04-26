import { CompressedContext, TaskClassification, SemanticCodeGraphData, SCGNode } from '../../types';
import { SemanticGraphBuilder } from './graph/semantic-graph';
import { GraphTraversal } from './graph/traversal';
import { CompressionEngine } from './compression/compressor';
import { TokenBudgetManager } from './budget/token-budget';
import { AdaptiveWindow, ContextFeedback } from './budget/adaptive';
import { PersistentMemory } from './memory/persistent';
import { DecisionJournal } from './memory/decisions';
import { PatternStore } from './memory/patterns';
import { VectorStore } from '../store/vector-store';
import { EmbeddingGenerator } from '../store/embeddings';
import { UnifiedClient } from '../models/unified-client';
import { EventBus, EventType } from '../event-bus';
import logger from '../logger';

const MAX_LAZY_SUMMARY_NODES = 15;
const MEMORY_RETRIEVAL_LIMIT = 5;
const VECTOR_SEARCH_LIMIT = 5;
const VECTOR_MIN_SCORE = 0.6;

export class ContextEngine {
  private graphBuilder: SemanticGraphBuilder;
  private graph: SemanticCodeGraphData | null;
  private traversal: GraphTraversal | null;
  private compressionEngine: CompressionEngine;
  private budgetManager: TokenBudgetManager;
  private adaptiveWindow: AdaptiveWindow;
  private persistentMemory: PersistentMemory;
  private decisionJournal: DecisionJournal;
  private patternStore: PatternStore;
  private vectorStore: VectorStore;
  private eventBus: EventBus;

  constructor(
    client: UnifiedClient,
    eventBus: EventBus,
    embeddingGenerator: EmbeddingGenerator,
  ) {
    this.eventBus = eventBus;
    this.graphBuilder = new SemanticGraphBuilder(client);
    this.graph = null;
    this.traversal = null;
    this.compressionEngine = new CompressionEngine();
    this.budgetManager = new TokenBudgetManager();
    this.adaptiveWindow = new AdaptiveWindow(this.budgetManager);
    this.persistentMemory = new PersistentMemory();
    this.decisionJournal = new DecisionJournal();
    this.patternStore = new PatternStore();
    this.vectorStore = new VectorStore(embeddingGenerator);
  }

  async initialize(directory: string): Promise<void> {
    this.eventBus.emit(EventType.CONTEXT_ASSEMBLING, { directory }, 'ContextEngine');

    this.graph = await this.graphBuilder.buildGraph(directory);
    this.traversal = new GraphTraversal(this.graph);

    await this.vectorStore.initialize();

    logger.info(
      `[ContextEngine] Initialized: ${this.graph.nodes.size} nodes, ${this.graph.edges.length} edges`
    );

    this.eventBus.emit(EventType.CONTEXT_ASSEMBLED, {
      nodes: this.graph.nodes.size,
      edges: this.graph.edges.length,
    }, 'ContextEngine');
  }

  async assembleContext(task: string, classification?: TaskClassification): Promise<CompressedContext> {
    if (!this.graph || !this.traversal) {
      throw new Error('ContextEngine not initialized. Call initialize() first.');
    }

    this.eventBus.emit(EventType.CONTEXT_ASSEMBLING, { task }, 'ContextEngine');

    const codeBudget = this.budgetManager.getCodeContextBudget();

    const seedNodes = this.findSeedNodes(task);
    logger.info(`[ContextEngine] Found ${seedNodes.length} seed nodes for task`);

    if (seedNodes.length > 0 && seedNodes.some(n => !n.summary)) {
      const nodesNeedingSummary = seedNodes.filter(n => !n.summary).slice(0, MAX_LAZY_SUMMARY_NODES);
      await this.graphBuilder.generateSummaries({
        ...this.graph,
        nodes: new Map(nodesNeedingSummary.map(n => [n.id, n])),
      });
    }

    const neighborhood = this.traversal.getTaskNeighborhood(
      seedNodes.map(n => n.id),
      codeBudget,
      3
    );

    if (this.adaptiveWindow.shouldExpand()) {
      logger.info('[ContextEngine] Adaptive window: expanding context based on feedback history');
    } else if (this.adaptiveWindow.shouldShrink()) {
      logger.info('[ContextEngine] Adaptive window: shrinking context based on feedback history');
    }

    const allNodes = neighborhood.expandedNodes.map(e => e.node);
    const adaptiveLevels = this.adaptiveWindow.adjustCompression(allNodes, codeBudget);
    const levelMap = new Map(adaptiveLevels.map(a => [a.node.id, a.level]));

    for (const entry of neighborhood.expandedNodes) {
      const adaptiveLevel = levelMap.get(entry.node.id);
      if (adaptiveLevel !== undefined) {
        entry.compressionLevel = adaptiveLevel;
      }
    }

    const compressed = this.compressionEngine.compressGraphNeighborhood(neighborhood);

    const relevantPatterns = this.patternStore.findPatterns(task);
    const patternContext = this.patternStore.formatForContext(relevantPatterns);

    const relevantDecisions = this.decisionJournal.getRelevant(task);
    const decisionContext = this.decisionJournal.formatForContext(relevantDecisions);

    const memoryEntries = this.persistentMemory.retrieve(task, MEMORY_RETRIEVAL_LIMIT);
    const memoryContext = memoryEntries.length > 0
      ? '<project_memory>\n' + memoryEntries.map(m => `  ${m.content}`).join('\n') + '\n</project_memory>'
      : '';

    let vectorContext = '';
    if (this.vectorStore.isAvailable()) {
      const vectorResults = await this.vectorStore.search(task, VECTOR_SEARCH_LIMIT, VECTOR_MIN_SCORE);
      if (vectorResults.length > 0) {
        vectorContext = '<vector_context>\n' + vectorResults.map(v => `  [${v.metadata.type}] ${v.content.substring(0, 200)}`).join('\n') + '\n</vector_context>';
      }
    }

    const allParts = [
      compressed.content,
      patternContext,
      decisionContext,
      memoryContext,
      vectorContext,
    ].filter(Boolean);

    const finalContent = allParts.join('\n\n');
    const totalTokens = Math.ceil(finalContent.length / 3.5);

    this.eventBus.emit(EventType.CONTEXT_ASSEMBLED, {
      tokens: totalTokens,
      nodes: compressed.nodes.length,
      patterns: relevantPatterns.length,
      decisions: relevantDecisions.length,
    }, 'ContextEngine');

    return {
      content: finalContent,
      nodes: compressed.nodes,
      totalTokens,
      budgetUsed: totalTokens,
      compressionRatio: compressed.compressionRatio,
    };
  }

  refreshGraph(directory: string): Promise<void> {
    return this.initialize(directory);
  }

  getGraph(): SemanticCodeGraphData | null {
    return this.graph;
  }

  getPersistentMemory(): PersistentMemory {
    return this.persistentMemory;
  }

  getDecisionJournal(): DecisionJournal {
    return this.decisionJournal;
  }

  getPatternStore(): PatternStore {
    return this.patternStore;
  }

  recordDecision(task: string, decision: string, reasoning: string): void {
    this.decisionJournal.record(task, decision, reasoning);
  }

  recordPattern(pattern: string, context: string, category: 'bug_fix' | 'feature' | 'refactor' | 'convention'): void {
    this.patternStore.record(pattern, context, category);
  }

  recordContextFeedback(feedback: ContextFeedback): void {
    this.adaptiveWindow.recordFeedback(feedback);
  }

  shouldExpandContext(): boolean {
    return this.adaptiveWindow.shouldExpand();
  }

  shouldShrinkContext(): boolean {
    return this.adaptiveWindow.shouldShrink();
  }

  save(): void {
    this.persistentMemory.save();
    this.decisionJournal.save();
    this.patternStore.save();
  }

  private findSeedNodes(task: string): SCGNode[] {
    if (!this.traversal) return [];

    const keywords = this.extractKeywords(task);
    const found: Map<string, SCGNode> = new Map();

    for (const keyword of keywords) {
      const nodes = this.traversal.findByName(keyword, 5);
      for (const node of nodes) {
        found.set(node.id, node);
      }
    }

    return Array.from(found.values());
  }

  private extractKeywords(task: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'is', 'it', 'that', 'this', 'and', 'or', 'but',
      'not', 'be', 'has', 'have', 'had', 'was', 'were', 'been', 'being',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'can', 'need', 'want', 'please', 'fix', 'add', 'update', 'change',
      'make', 'get', 'set', 'create', 'remove', 'delete', 'implement',
    ]);

    const words = task
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)];
  }
}
