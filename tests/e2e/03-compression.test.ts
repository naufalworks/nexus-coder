import * as path from 'path';
import { UnifiedClient } from '../../src/core/models/unified-client';
import { SemanticGraphBuilder } from '../../src/core/context/graph/semantic-graph';
import { GraphTraversal } from '../../src/core/context/graph/traversal';
import { CompressionEngine } from '../../src/core/context/compression/compressor';
import { CompressionLevel, SCGNode } from '../../src/types';

const SRC_DIR = path.resolve(__dirname, '../../src');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

describeIf('E2E: Compression Engine', () => {
  jest.setTimeout(120000);

  let compressionEngine: CompressionEngine;
  let allNodes: SCGNode[];
  let sampleNode: SCGNode | undefined;

  beforeAll(async () => {
    compressionEngine = new CompressionEngine();
    const client = new UnifiedClient();
    const builder = new SemanticGraphBuilder(client);
    const graph = await builder.buildGraph(SRC_DIR);
    const traversal = new GraphTraversal(graph);
    allNodes = Array.from(graph.nodes.values());

    const neighborhood = traversal.getTaskNeighborhood(
      [allNodes.find(n => n.name === 'ContextEngine')!.id],
      10000,
      3,
    );
    sampleNode = neighborhood.expandedNodes[0]?.node;
  });

  test('should compress a node at SIGNATURE level', async () => {
    if (!sampleNode) return;
    const result = await compressionEngine.compressSingle(sampleNode, CompressionLevel.SIGNATURE);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    console.log(`[Compression] SIGNATURE: "${result.substring(0, 100)}..."`);
  });

  test('should compress a node at SUMMARY level', async () => {
    if (!sampleNode) return;
    const result = await compressionEngine.compressSingle(sampleNode, CompressionLevel.SUMMARY);
    expect(result).toBeTruthy();
    console.log(`[Compression] SUMMARY: "${result.substring(0, 100)}..."`);
  });

  test('should compress a node at PARTIAL level', async () => {
    if (!sampleNode) return;
    const result = await compressionEngine.compressSingle(sampleNode, CompressionLevel.PARTIAL);
    expect(result).toBeTruthy();
    console.log(`[Compression] PARTIAL length: ${result.length}`);
  });

  test('should compress a node at FULL level', async () => {
    if (!sampleNode) return;
    const result = await compressionEngine.compressSingle(sampleNode, CompressionLevel.FULL);
    expect(result).toBeTruthy();
    console.log(`[Compression] FULL length: ${result.length}`);
  });

  test('compression levels should increase in content size', async () => {
    if (!sampleNode) return;

    const sig = await compressionEngine.compressSingle(sampleNode, CompressionLevel.SIGNATURE);
    const sum = await compressionEngine.compressSingle(sampleNode, CompressionLevel.SUMMARY);
    const part = await compressionEngine.compressSingle(sampleNode, CompressionLevel.PARTIAL);
    const full = await compressionEngine.compressSingle(sampleNode, CompressionLevel.FULL);

    console.log(`[Compression] Sizes: sig=${sig.length}, sum=${sum.length}, partial=${part.length}, full=${full.length}`);
    expect(sig.length).toBeLessThanOrEqual(sum.length);
    expect(sum.length).toBeLessThanOrEqual(part.length);
    expect(part.length).toBeLessThanOrEqual(full.length);
  });

  test('should compress full neighborhood from real graph', async () => {
    const client = new UnifiedClient();
    const builder = new SemanticGraphBuilder(client);
    const graph = await builder.buildGraph(SRC_DIR);
    const traversal = new GraphTraversal(graph);

    const engineNode = Array.from(graph.nodes.values()).find(n => n.name === 'ContextEngine')!;
    const neighborhood = traversal.getTaskNeighborhood([engineNode.id], 5000, 2);

    const compressed = await compressionEngine.compressGraphNeighborhood(neighborhood);

    expect(compressed).toBeDefined();
    expect(compressed.content).toBeTruthy();
    expect(compressed.totalTokens).toBeGreaterThan(0);
    expect(compressed.compressionRatio).toBeGreaterThan(0);
    console.log(`[Compression] Neighborhood: ${compressed.totalTokens} tokens, ratio=${compressed.compressionRatio.toFixed(2)}, nodes=${compressed.nodes.length}`);
  });
});
