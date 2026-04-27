import * as fs from 'fs';
import * as path from 'path';
import { UnifiedClient } from '../../src/core/models/unified-client';
import { SemanticGraphBuilder } from '../../src/core/context/graph/semantic-graph';
import { GraphTraversal } from '../../src/core/context/graph/traversal';
import { SemanticCodeGraphData, SCGNode } from '../../src/types';

const SRC_DIR = path.resolve(__dirname, '../../src');
const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_DATA_DIR = path.join(REPO_ROOT, '.nexus-test-data');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);

const describeIf = hasApiKey ? describe : describe.skip;

function cleanup(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

describeIf('E2E: Graph Building (SCG)', () => {
  jest.setTimeout(180000);

  let client: UnifiedClient;
  let builder: SemanticGraphBuilder;
  let graph: SemanticCodeGraphData;

  beforeAll(async () => {
    client = new UnifiedClient();
    builder = new SemanticGraphBuilder(client);
    graph = await builder.buildGraph(SRC_DIR);
    console.log(`[Graph Build] Nodes: ${graph.nodes.size}, Edges: ${graph.edges.length}`);
  });

  afterAll(() => {
    cleanup();
  });

  test('should produce non-empty node set', () => {
    expect(graph.nodes.size).toBeGreaterThan(0);
  });

  test('should produce non-empty edge set', () => {
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  test('should include known core classes', () => {
    const names = Array.from(graph.nodes.values()).map((n: SCGNode) => n.name);
    expect(names).toContain('ContextEngine');
    expect(names).toContain('GraphTraversal');
    expect(names).toContain('SemanticGraphBuilder');
  });

  test('should have valid file references on all nodes', () => {
    for (const node of graph.nodes.values()) {
      expect(node.file).toBeTruthy();
      expect(node.line).toBeGreaterThan(0);
      expect(node.endLine).toBeGreaterThanOrEqual(node.line);
    }
  });

  test('should extract CALLS edges from functions', () => {
    const callsEdges = graph.edges.filter((e: any) => e.type === 'calls');
    expect(callsEdges.length).toBeGreaterThan(0);
    console.log(`[Graph Build] CALLS edges: ${callsEdges.length}`);
  });

  test('should have different node types', () => {
    const types = new Set(Array.from(graph.nodes.values()).map((n: SCGNode) => n.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
    console.log(`[Graph Build] Node types: ${Array.from(types).join(', ')}`);
  });

  test('should set builtAt, fileCount, symbolCount', () => {
    expect(graph.builtAt).toBeInstanceOf(Date);
    expect(graph.fileCount).toBeGreaterThan(0);
    expect(graph.symbolCount).toBeGreaterThan(0);
  });

  describe('graph cache serialization', () => {
    const testCachePath = path.join(TEST_DATA_DIR, 'graph.json');

    beforeAll(() => {
      if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
      }
    });

    test('should serialize graph to disk', () => {
      builder.serialize(graph, testCachePath);
      expect(fs.existsSync(testCachePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(testCachePath, 'utf-8'));
      expect(raw.nodes.length).toBe(graph.nodes.size);
      expect(raw.edges.length).toBe(graph.edges.length);
    });

    test('should deserialize graph from cache', () => {
      const loaded = builder.deserialize(testCachePath, SRC_DIR);
      expect(loaded).not.toBeNull();
      expect(loaded!.nodes.size).toBe(graph.nodes.size);
      expect(loaded!.edges.length).toBe(graph.edges.length);
    });

    test('should return null for nonexistent cache file', () => {
      const result = builder.deserialize('/nonexistent/path/graph.json', SRC_DIR);
      expect(result).toBeNull();
    });

    test('deserialized graph should produce identical traversal results', () => {
      const loaded = builder.deserialize(testCachePath, SRC_DIR)!;

      const traversal1 = new GraphTraversal(graph);
      const traversal2 = new GraphTraversal(loaded);

      const seedNode = Array.from(graph.nodes.values()).find((n: SCGNode) => n.name === 'ContextEngine');
      if (seedNode) {
        const n1 = traversal1.getTaskNeighborhood([seedNode.id], 5000, 2);
        const n2 = traversal2.getTaskNeighborhood([seedNode.id], 5000, 2);
        expect(n1.expandedNodes.length).toBe(n2.expandedNodes.length);
      }
    });
  });
});
