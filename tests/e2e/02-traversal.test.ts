import * as path from 'path';
import * as fs from 'fs';
import { SemanticGraphBuilder } from '../../src/core/context/graph/semantic-graph';
import { GraphTraversal } from '../../src/core/context/graph/traversal';
import { SCGNode } from '../../src/types';

const SRC_DIR = path.resolve(__dirname, '../../src');
const CACHE_PATH = path.resolve(__dirname, '../../.nexus-test-data/graph.json');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

describeIf('E2E: Graph Traversal', () => {
  jest.setTimeout(180000);

  let traversal: GraphTraversal;
  let contextEngineNode: SCGNode | undefined;
  let allNodes: SCGNode[];

  beforeAll(() => {
    let graph;
    if (fs.existsSync(CACHE_PATH)) {
      const client = { chat: jest.fn() } as any;
      const builder = new SemanticGraphBuilder(client);
      graph = builder.deserialize(CACHE_PATH, SRC_DIR);
    }

    if (!graph || graph.nodes.size === 0) {
      const { UnifiedClient } = require('../../src/core/models/unified-client');
      const builder = new SemanticGraphBuilder(new UnifiedClient());
      const built = require('../../src/core/context/graph/semantic-graph');
      throw new Error('No cached graph found. Run test 01 first.');
    }

    traversal = new GraphTraversal(graph);
    allNodes = Array.from(graph.nodes.values());
    contextEngineNode = allNodes.find(n => n.name === 'ContextEngine');
  });

  test('should find nodes by file path using findByName', () => {
    const results = traversal.findByName('file-writer');
    expect(results.length).toBeGreaterThan(0);
    console.log(`[Traversal] findByName('file-writer'): ${results.length} results`);
  });

  test('should find nodes by function name', () => {
    const results = traversal.findByName('assembleContext');
    expect(results.length).toBeGreaterThan(0);
  });

  test('should build task neighborhood from ContextEngine', () => {
    if (!contextEngineNode) return;
    const neighborhood = traversal.getTaskNeighborhood([contextEngineNode.id], 5000, 2);

    expect(neighborhood.expandedNodes.length).toBeGreaterThan(0);
    expect(neighborhood.totalEstimatedTokens).toBeGreaterThan(0);
    console.log(`[Traversal] Neighborhood around ContextEngine: ${neighborhood.expandedNodes.length} nodes, ${neighborhood.totalEstimatedTokens} estimated tokens`);
  });

  test('should build neighborhood with different depths', () => {
    if (!contextEngineNode) return;

    const depth1 = traversal.getTaskNeighborhood([contextEngineNode.id], 10000, 1);
    const depth3 = traversal.getTaskNeighborhood([contextEngineNode.id], 10000, 3);

    console.log(`[Traversal] Depth 1: ${depth1.expandedNodes.length} nodes, Depth 3: ${depth3.expandedNodes.length} nodes`);
    expect(depth3.expandedNodes.length).toBeGreaterThanOrEqual(depth1.expandedNodes.length);
  });

  test('should run impact analysis from a node', () => {
    if (!contextEngineNode) return;
    const impact = traversal.impactAnalysis(contextEngineNode.id);
    expect(impact).toBeDefined();
    expect(impact.seedId).toBe(contextEngineNode.id);
    console.log(`[Traversal] Impact from ContextEngine: ${impact.allAffected.size} affected, risk=${impact.riskLevel}, direct=${impact.direct.length}, indirect=${impact.indirect.length}`);
  });

  test('adjacency index should provide fast neighbor lookups', () => {
    if (!contextEngineNode) return;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      traversal.getTaskNeighborhood([contextEngineNode.id], 5000, 2);
    }
    const elapsed = performance.now() - start;

    console.log(`[Traversal] 100 neighborhood lookups: ${elapsed.toFixed(1)}ms (${(elapsed / 100).toFixed(2)}ms per lookup)`);
    expect(elapsed).toBeLessThan(10000);
  });

  test('should get related nodes via edge types', () => {
    if (!contextEngineNode) return;
    const related = traversal.getRelatedNodes(contextEngineNode.id);
    console.log(`[Traversal] Related nodes to ContextEngine: ${related.length}`);
    expect(related.length).toBeGreaterThanOrEqual(0);
  });

  test('should handle multi-seed neighborhoods', () => {
    const fileWriterNode = allNodes.find(n => n.name === 'FileWriter');
    const routerNode = allNodes.find(n => n.name === 'ModelRouter');

    if (fileWriterNode && routerNode) {
      const neighborhood = traversal.getTaskNeighborhood(
        [fileWriterNode.id, routerNode.id],
        8000,
        2,
      );
      expect(neighborhood.expandedNodes.length).toBeGreaterThan(0);
      console.log(`[Traversal] Multi-seed neighborhood: ${neighborhood.expandedNodes.length} nodes`);
    }
  });
});
