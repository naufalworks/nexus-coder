import { SCGNode, SCGEdge, CompressionLevel, EdgeType, SemanticCodeGraphData } from '../../../types';
import { TraversalResult, ImpactAnalysisResult, NeighborhoodResult, DISTANCE_COMPRESSION_MAP, COMPRESSION_TOKEN_ESTIMATES } from './types';
import logger from '../../logger';

export class GraphTraversal {
  private graph: SemanticCodeGraphData;

  constructor(graph: SemanticCodeGraphData) {
    this.graph = graph;
  }

  bfs(startIds: string[], maxDepth: number = 3): TraversalResult {
    const visited = new Map<string, number>();
    const resultNodes: SCGNode[] = [];
    const resultEdges: SCGEdge[] = [];
    const queue: Array<{ id: string; depth: number }> = startIds
      .filter(id => this.graph.nodes.has(id))
      .map(id => ({ id, depth: 0 }));

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (visited.has(id)) continue;
      if (depth > maxDepth) continue;

      visited.set(id, depth);
      const node = this.graph.nodes.get(id);
      if (node) {
        resultNodes.push(node);
      }

      const neighbors = this.getNeighborIds(id);
      for (const { neighborId, edge } of neighbors) {
        if (!visited.has(neighborId) && depth + 1 <= maxDepth) {
          resultEdges.push(edge);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

    return { visited, nodes: resultNodes, edges: resultEdges };
  }

  impactAnalysis(seedId: string): ImpactAnalysisResult {
    const seed = this.graph.nodes.get(seedId);
    if (!seed) {
      return {
        seedId,
        direct: [],
        indirect: [],
        tests: [],
        allAffected: new Set(),
        riskLevel: 'low',
      };
    }

    const traversal = this.bfs([seedId], 4);
    const direct: SCGNode[] = [];
    const indirect: SCGNode[] = [];
    const tests: SCGNode[] = [];
    const allAffected = new Set<string>();

    for (const [nodeId, distance] of traversal.visited) {
      if (nodeId === seedId) continue;
      const node = this.graph.nodes.get(nodeId);
      if (!node) continue;

      allAffected.add(nodeId);

      if (distance === 1) {
        direct.push(node);
      } else {
        indirect.push(node);
      }

      if (node.type === 'test' || node.file.includes('.test.') || node.file.includes('.spec.')) {
        tests.push(node);
      }
    }

    const riskLevel: 'low' | 'medium' | 'high' =
      allAffected.size > 20 ? 'high' : allAffected.size > 5 ? 'medium' : 'low';

    return { seedId, direct, indirect, tests, allAffected, riskLevel };
  }

  getTaskNeighborhood(
    seedNodeIds: string[],
    tokenBudget: number,
    maxDepth: number = 3
  ): NeighborhoodResult {
    const seedNodes = seedNodeIds
      .map(id => this.graph.nodes.get(id))
      .filter((n): n is SCGNode => n !== undefined);

    const traversal = this.bfs(seedNodeIds, maxDepth);
    const expandedNodes: NeighborhoodResult['expandedNodes'] = [];
    let totalTokens = 0;

    for (const seed of seedNodes) {
      const tokens = Math.max(seed.signature.length, 200);
      expandedNodes.push({
        node: seed,
        distance: 0,
        compressionLevel: CompressionLevel.FULL,
        score: 1.0,
      });
      totalTokens += tokens;
    }

    const scoredNodes: Array<{ node: SCGNode; distance: number; score: number }> = [];
    for (const [nodeId, distance] of traversal.visited) {
      if (seedNodeIds.includes(nodeId)) continue;
      const node = this.graph.nodes.get(nodeId);
      if (!node) continue;

      let score = 1.0 / (distance + 1);
      score *= 1 + (node.complexity / 20);

      scoredNodes.push({ node, distance, score });
    }

    scoredNodes.sort((a, b) => b.score - a.score);

    for (const { node, distance, score } of scoredNodes) {
      const compressionLevel = DISTANCE_COMPRESSION_MAP[distance] ?? CompressionLevel.SIGNATURE;
      const estimatedTokens = COMPRESSION_TOKEN_ESTIMATES[compressionLevel];

      if (totalTokens + estimatedTokens > tokenBudget) continue;

      expandedNodes.push({ node, distance, compressionLevel, score });
      totalTokens += estimatedTokens;
    }

    return {
      seedNodes,
      expandedNodes,
      totalEstimatedTokens: totalTokens,
    };
  }

  findByName(query: string, limit: number = 20): SCGNode[] {
    const queryLower = query.toLowerCase();
    const results: Array<{ node: SCGNode; score: number }> = [];

    for (const node of this.graph.nodes.values()) {
      let score = 0;

      if (node.name.toLowerCase() === queryLower) score += 10;
      else if (node.name.toLowerCase().includes(queryLower)) score += 5;

      if (node.summary?.toLowerCase().includes(queryLower)) score += 3;
      if (node.file.toLowerCase().includes(queryLower)) score += 2;

      if (score > 0) {
        results.push({ node, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => r.node);
  }

  getRelatedNodes(nodeId: string, edgeTypes?: EdgeType[], limit: number = 10): SCGNode[] {
    const neighbors = this.getNeighborIds(nodeId, edgeTypes);
    return neighbors
      .slice(0, limit)
      .map(({ neighborId }) => this.graph.nodes.get(neighborId))
      .filter((n): n is SCGNode => n !== undefined);
  }

  private getNeighborIds(nodeId: string, edgeTypes?: EdgeType[]): Array<{ neighborId: string; edge: SCGEdge }> {
    const results: Array<{ neighborId: string; edge: SCGEdge }> = [];

    for (const edge of this.graph.edges) {
      if (edge.from === nodeId) {
        if (!edgeTypes || edgeTypes.includes(edge.type)) {
          results.push({ neighborId: edge.to, edge });
        }
      }
      if (edge.to === nodeId) {
        if (!edgeTypes || edgeTypes.includes(edge.type)) {
          results.push({ neighborId: edge.from, edge });
        }
      }
    }

    return results;
  }
}
