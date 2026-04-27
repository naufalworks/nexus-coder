import * as path from 'path';
import * as fs from 'fs';
import { SemanticGraphBuilder } from '../../src/core/context/graph/semantic-graph';
import { GraphTraversal } from '../../src/core/context/graph/traversal';
import { CompressionEngine } from '../../src/core/context/compression/compressor';
import { CompressionLevel, SCGNode } from '../../src/types';

const SRC_DIR = path.resolve(__dirname, '../../src');
const CACHE_PATH = path.resolve(__dirname, '../../.nexus-test-data/graph.json');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

describeIf('E2E: Compression Engine', () => {
  jest.setTimeout(120000);

  let compressionEngine: CompressionEngine;
  let allNodes: SCGNode[];
  let sampleNode: SCGNode | undefined;

  beforeAll(() => {
    compressionEngine = new CompressionEngine();

    let graph;
    if (fs.existsSync(CACHE_PATH)) {
      const client = { chat: jest.fn() } as any;
      const builder = new SemanticGraphBuilder(client);
      graph = builder.deserialize(CACHE_PATH, SRC_DIR);
    }

    if (!graph || graph.nodes.size === 0) {
      throw new Error('No cached graph found. Run test 01 first.');
    }

    const traversal = new GraphTraversal(graph);
    allNodes = Array.from(graph.nodes.values());

    const engineNode = allNodes.find(n => n.name === 'ContextEngine');
    if (engineNode) {
      const neighborhood = traversal.getTaskNeighborhood([engineNode.id], 10000, 3);
      sampleNode = neighborhood.expandedNodes[0]?.node;
    }
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

  test('should compress full neighborhood from cached graph', async () => {
    let graph;
    if (fs.existsSync(CACHE_PATH)) {
      const client = { chat: jest.fn() } as any;
      const builder = new SemanticGraphBuilder(client);
      graph = builder.deserialize(CACHE_PATH, SRC_DIR);
    }

    if (!graph || graph.nodes.size === 0) {
      throw new Error('No cached graph found. Run test 01 first.');
    }

    const traversal = new GraphTraversal(graph);
    const engineNode = Array.from(graph.nodes.values()).find(n => n.name === 'ContextEngine');
    if (!engineNode) throw new Error('ContextEngine node not found');

    const neighborhood = traversal.getTaskNeighborhood([engineNode.id], 5000, 2);
    const compressed = await compressionEngine.compressGraphNeighborhood(neighborhood);

    expect(compressed).toBeDefined();
    expect(compressed.content).toBeTruthy();
    expect(compressed.totalTokens).toBeGreaterThan(0);
    expect(compressed.compressionRatio).toBeGreaterThan(0);
    console.log(`[Compression] Neighborhood: ${compressed.totalTokens} tokens, ratio=${compressed.compressionRatio.toFixed(2)}, nodes=${compressed.nodes.length}`);
  });
});
