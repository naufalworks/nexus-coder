/**
 * Impact Analysis Service
 *
 * Implements the ImpactAnalysisService interface for tracing the ripple effects
 * of code changes through the Semantic Code Graph.
 *
 * Requirements: 12.1–12.7, 13.1–13.5, 14.1–14.4, 15.1–15.2
 */

import {
  ImpactAnalysis,
  ImpactNode,
  ImpactEdge,
  ImpactSeverity,
  RiskAssessment,
  AffectedFile,
  ImpactStats,
} from '../types/impact';
import { CodeChange, ChangeType } from '../types/task';
import { SemanticCodeGraphData, SCGNode, EdgeType } from '../types/graph';
import { GraphTraversal } from '../core/context/graph/traversal';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum traversal depth for impact analysis */
const DEFAULT_MAX_DEPTH = 4;

/** Maximum number of nodes to analyze before stopping */
const MAX_NODES_TO_ANALYZE = 1000;

/** Performance target for BFS traversal (ms) */
const BFS_PERFORMANCE_TARGET_MS = 100;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if a file is a test file based on naming patterns.
 */
function isTestFile(filePath: string): boolean {
  return filePath.includes('.test.') || filePath.includes('.spec.');
}

/**
 * Check if a file is production code (not a test file).
 */
function isProductionCode(filePath: string): boolean {
  return !isTestFile(filePath);
}

/**
 * Build an impact path from seed to target node.
 */
function buildImpactPath(
  seedId: string,
  targetId: string,
  edges: Map<string, { to: string; type: EdgeType }[]>,
): ImpactEdge[] {
  const path: ImpactEdge[] = [];
  const visited = new Set<string>();
  const queue: { nodeId: string; path: ImpactEdge[] }[] = [
    { nodeId: seedId, path: [] },
  ];

  while (queue.length > 0) {
    const { nodeId, path: currentPath } = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (nodeId === targetId) {
      return currentPath;
    }

    const neighbors = edges.get(nodeId) || [];
    for (const { to, type } of neighbors) {
      if (!visited.has(to)) {
        queue.push({
          nodeId: to,
          path: [...currentPath, { from: nodeId, to, edgeType: type }],
        });
      }
    }
  }

  // Fallback: return empty path if no path found
  return [];
}

// ---------------------------------------------------------------------------
// ImpactAnalysisService
// ---------------------------------------------------------------------------

/**
 * Service that provides impact analysis for code changes.
 */
export class ImpactAnalysisService {
  /**
   * Analyze the impact of a code change.
   *
   * Algorithm:
   *   1. Find seed node in graph matching the change file
   *   2. Perform BFS traversal from seed node
   *   3. Separate direct impacts (distance == 1) and transitive impacts (distance > 1)
   *   4. Calculate severity for each impacted node
   *   5. Identify affected tests
   *   6. Build risk assessment
   *
   * Performance: Targets BFS traversal within 100ms for graphs
   * with 304 nodes / 1000 edges. Uses early termination when
   * `MAX_NODES_TO_ANALYZE` is reached.
   *
   * @param change - The code change to analyze
   * @param graph - The semantic code graph
   * @param traversal - Graph traversal engine
   * @param maxDepth - Maximum traversal depth (default: 4)
   * @returns Complete impact analysis
   *
   * Postconditions:
   *  - directImpacts contains only nodes at distance == 1
   *  - transitiveImpacts contains only nodes at distance > 1
   *  - No node appears in both directImpacts and transitiveImpacts
   *  - affectedTests contains only nodes in test files
   *  - riskAssessment.score is in range [0, 100]
   */
  analyzeChange(
    change: CodeChange,
    graph: SemanticCodeGraphData,
    traversal: GraphTraversal,
    maxDepth: number = DEFAULT_MAX_DEPTH,
  ): ImpactAnalysis {
    const startTime = Date.now();

    // Find seed node matching the change file
    const seedNode = this.findSeedNode(change.file, graph);
    if (!seedNode) {
      return this.createNotFoundAnalysis(change, startTime);
    }

    // Perform BFS traversal (optimized via GraphTraversal's adjacency index)
    const bfsResult = traversal.bfs([seedNode.id], maxDepth);

    // Build edge map for path construction — optimized with pre-sized map
    const edgeMap = new Map<string, { to: string; type: EdgeType }[]>();
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.from)) {
        edgeMap.set(edge.from, []);
      }
      edgeMap.get(edge.from)!.push({ to: edge.to, type: edge.type });
    }

    // Separate direct and transitive impacts
    const directImpacts: ImpactNode[] = [];
    const transitiveImpacts: ImpactNode[] = [];
    const allImpactedNodes: ImpactNode[] = [];

    let nodesTraversed = 0;
    let edgesFollowed = 0;
    let maxDepthReached = 0;
    let cycleDetected = false;
    const cyclePath: string[] = [];

    // Early termination: limit processed nodes for performance
    const bfsEntries = Array.from(bfsResult.visited.entries());
    const maxEntries = Math.min(bfsEntries.length, MAX_NODES_TO_ANALYZE);

    for (let idx = 0; idx < maxEntries; idx++) {
      const [nodeId, distance] = bfsEntries[idx];
      if (nodeId === seedNode.id) continue; // Skip seed itself

      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      nodesTraversed++;
      maxDepthReached = Math.max(maxDepthReached, distance);

      // Build impact path — use optimized path for distance 1 (direct edge lookup)
      let impactPath: ImpactEdge[];
      if (distance === 1) {
        // Optimization: for direct neighbors, look up edge directly from the edge map
        const directEdge = this.findDirectEdge(seedNode.id, nodeId, edgeMap);
        impactPath = directEdge
          ? [{ from: seedNode.id, to: nodeId, edgeType: directEdge }]
          : [];
      } else {
        impactPath = buildImpactPath(seedNode.id, nodeId, edgeMap);
      }
      edgesFollowed += impactPath.length;

      // Calculate severity
      const severity = this.calculateSeverity(
        node,
        distance,
        impactPath,
        change,
      );

      // Build reason
      const reason = this.buildReason(node, distance, impactPath, change);

      const impactNode: ImpactNode = {
        node,
        impactPath,
        distance,
        severity,
        reason,
      };

      allImpactedNodes.push(impactNode);

      // Separate by distance
      if (distance === 1) {
        directImpacts.push(impactNode);
      } else {
        transitiveImpacts.push(impactNode);
      }

      // Early termination check for performance budget
      if (nodesTraversed >= MAX_NODES_TO_ANALYZE) {
        break;
      }
    }

    // Detect cycles (simple heuristic: if we have many edges relative to nodes)
    if (edgesFollowed > nodesTraversed * 2) {
      cycleDetected = true;
      // Find a cycle path (simplified)
      const visited = new Set<string>();
      for (const node of allImpactedNodes) {
        if (visited.has(node.node.id)) {
          cyclePath.push(node.node.id);
          break;
        }
        visited.add(node.node.id);
      }
    }

    // Identify affected tests
    const affectedTests = this.identifyAffectedTests(
      allImpactedNodes,
      graph,
      traversal,
    );

    // Build risk assessment
    const riskAssessment = this.buildRiskAssessment(
      directImpacts,
      transitiveImpacts,
      affectedTests,
      change,
    );

    // Group by affected files
    const affectedFiles = this.groupByAffectedFiles(
      allImpactedNodes,
      change,
    );

    const analysisTimeMs = Date.now() - startTime;

    const stats: ImpactStats = {
      nodesTraversed,
      edgesFollowed,
      maxDepthReached,
      analysisTimeMs,
    };

    logger.debug(
      `[ImpactService] Analysis completed in ${analysisTimeMs}ms: ` +
        `${directImpacts.length} direct, ${transitiveImpacts.length} transitive impacts`
    );

    return {
      seedChange: change,
      seedNodeId: seedNode.id,
      directImpacts,
      transitiveImpacts,
      affectedTests,
      riskAssessment,
      affectedFiles,
      analyzedAt: new Date(),
      stats,
    };
  }

  /**
   * Analyze impact starting from a specific graph node.
   *
   * @param nodeId - The graph node ID to analyze from
   * @param graph - The semantic code graph
   * @param traversal - Graph traversal engine
   * @param maxDepth - Maximum traversal depth (default: 4)
   * @returns Complete impact analysis
   */
  analyzeNode(
    nodeId: string,
    graph: SemanticCodeGraphData,
    traversal: GraphTraversal,
    maxDepth: number = DEFAULT_MAX_DEPTH,
  ): ImpactAnalysis {
    const node = traversal.getNode(nodeId);
    if (!node) {
      const startTime = Date.now();
      return this.createNotFoundAnalysis(
        {
          file: 'unknown',
          type: ChangeType.MODIFY,
          reasoning: 'Node not found',
          impact: [],
          risk: 'low',
          diff: '',
          content: '',
          approved: false,
        },
        startTime,
      );
    }

    // Create a synthetic CodeChange from the node
    const change: CodeChange = {
      file: node.file,
      type: ChangeType.MODIFY,
      reasoning: `Analyzing impact from node: ${node.name}`,
      impact: [],
      risk: 'medium',
      diff: '',
      content: node.signature,
      approved: false,
    };

    return this.analyzeChange(change, graph, traversal, maxDepth);
  }

  /**
   * Calculate severity for an impacted node.
   *
   * Severity rules:
   *  - CRITICAL: distance 1 + CALLS/EXTENDS + production code
   *  - HIGH: distance 1 + IMPORTS/REFERENCES
   *  - MEDIUM: distance 2
   *  - LOW: distance 3
   *  - INFO: distance 4+
   *
   * @param node - The impacted node
   * @param distance - Distance from seed
   * @param impactPath - Path from seed to this node
   * @param seedChange - The original change
   * @returns Severity level
   */
  calculateSeverity(
    node: SCGNode,
    distance: number,
    impactPath: ImpactEdge[],
    seedChange: CodeChange,
  ): ImpactSeverity {
    // Distance-based severity
    if (distance >= 4) {
      return ImpactSeverity.INFO;
    }

    if (distance === 3) {
      return ImpactSeverity.LOW;
    }

    if (distance === 2) {
      return ImpactSeverity.MEDIUM;
    }

    // Distance 1: check edge types and production code
    if (distance === 1) {
      const edgeTypes = impactPath.map((e) => e.edgeType);
      const hasStrongDependency =
        edgeTypes.includes(EdgeType.CALLS) ||
        edgeTypes.includes(EdgeType.EXTENDS) ||
        edgeTypes.includes(EdgeType.IMPLEMENTS);

      const hasWeakDependency =
        edgeTypes.includes(EdgeType.IMPORTS) ||
        edgeTypes.includes(EdgeType.REFERENCES);

      if (hasStrongDependency && isProductionCode(node.file)) {
        return ImpactSeverity.CRITICAL;
      }

      if (hasWeakDependency) {
        return ImpactSeverity.HIGH;
      }

      // Default for distance 1
      return ImpactSeverity.HIGH;
    }

    // Fallback
    return ImpactSeverity.LOW;
  }

  /**
   * Identify affected test files.
   *
   * @param impactedNodes - All impacted nodes
   * @param graph - The semantic code graph
   * @param traversal - Graph traversal engine
   * @returns Array of test nodes that are affected
   *
   * Postconditions:
   *  - All returned nodes are in test files (.test. or .spec.)
   *  - No duplicate nodes
   *  - Each node has a populated reason field
   */
  identifyAffectedTests(
    impactedNodes: ImpactNode[],
    graph: SemanticCodeGraphData,
    traversal: GraphTraversal,
  ): ImpactNode[] {
    const testNodes: ImpactNode[] = [];
    const seenIds = new Set<string>();

    // Filter nodes in test files
    for (const impactNode of impactedNodes) {
      if (
        isTestFile(impactNode.node.file) &&
        !seenIds.has(impactNode.node.id)
      ) {
        seenIds.add(impactNode.node.id);
        testNodes.push({
          ...impactNode,
          reason: `Test file affected by change at distance ${impactNode.distance}`,
        });
      }
    }

    // Find test nodes that test impacted production nodes
    const productionNodes = impactedNodes.filter((n) =>
      isProductionCode(n.node.file),
    );

    for (const prodNode of productionNodes) {
      // Find nodes that reference this production node
      const relatedNodes = traversal.getRelatedNodes(
        prodNode.node.id,
        [EdgeType.TESTS, EdgeType.REFERENCES],
        50,
      );

      for (const relatedNode of relatedNodes) {
        if (isTestFile(relatedNode.file) && !seenIds.has(relatedNode.id)) {
          seenIds.add(relatedNode.id);
          testNodes.push({
            node: relatedNode,
            impactPath: [
              {
                from: prodNode.node.id,
                to: relatedNode.id,
                edgeType: EdgeType.TESTS,
              },
            ],
            distance: prodNode.distance + 1,
            severity: ImpactSeverity.INFO,
            reason: `Tests impacted production code: ${prodNode.node.name}`,
          });
        }
      }
    }

    return testNodes;
  }

  /**
   * Build risk assessment summary.
   *
   * @param directImpacts - Direct impact nodes
   * @param transitiveImpacts - Transitive impact nodes
   * @param affectedTests - Affected test nodes
   * @param change - The original change
   * @returns Risk assessment with score and reasoning
   *
   * Postconditions:
   *  - score is in range [0, 100]
   *  - overall severity correlates with score
   */
  buildRiskAssessment(
    directImpacts: ImpactNode[],
    transitiveImpacts: ImpactNode[],
    affectedTests: ImpactNode[],
    change: CodeChange,
  ): RiskAssessment {
    // Count by severity
    const allImpacts = [...directImpacts, ...transitiveImpacts];
    const criticalCount = allImpacts.filter(
      (n) => n.severity === ImpactSeverity.CRITICAL,
    ).length;
    const highCount = allImpacts.filter(
      (n) => n.severity === ImpactSeverity.HIGH,
    ).length;
    const mediumCount = allImpacts.filter(
      (n) => n.severity === ImpactSeverity.MEDIUM,
    ).length;
    const lowCount = allImpacts.filter(
      (n) => n.severity === ImpactSeverity.LOW,
    ).length;
    const infoCount = allImpacts.filter(
      (n) => n.severity === ImpactSeverity.INFO,
    ).length;

    // Calculate score [0-100]
    const score = Math.min(
      100,
      criticalCount * 20 +
        highCount * 10 +
        mediumCount * 5 +
        lowCount * 2 +
        infoCount * 1,
    );

    // Determine overall severity
    let overall: ImpactSeverity;
    if (criticalCount > 0) {
      overall = ImpactSeverity.CRITICAL;
    } else if (highCount > 2) {
      overall = ImpactSeverity.HIGH;
    } else if (highCount > 0 || mediumCount > 5) {
      overall = ImpactSeverity.MEDIUM;
    } else if (mediumCount > 0 || lowCount > 5) {
      overall = ImpactSeverity.LOW;
    } else {
      overall = ImpactSeverity.INFO;
    }

    // Build reasoning
    const reasoning = this.buildRiskReasoning(
      directImpacts.length,
      transitiveImpacts.length,
      affectedTests.length,
      criticalCount,
      highCount,
      change,
    );

    // Count affected files
    const affectedFileSet = new Set<string>();
    for (const impact of allImpacts) {
      affectedFileSet.add(impact.node.file);
    }

    return {
      overall,
      score,
      directImpactCount: directImpacts.length,
      transitiveImpactCount: transitiveImpacts.length,
      affectedTestCount: affectedTests.length,
      affectedFileCount: affectedFileSet.size,
      reasoning,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Find the direct edge type between two nodes (optimization for distance 1).
   */
  private findDirectEdge(
    fromId: string,
    toId: string,
    edgeMap: Map<string, { to: string; type: EdgeType }[]>,
  ): EdgeType | null {
    const edges = edgeMap.get(fromId);
    if (!edges) return null;

    for (const edge of edges) {
      if (edge.to === toId) {
        return edge.type;
      }
    }
    return null;
  }

  /**
   * Find the seed node in the graph that matches the change file.
   */
  private findSeedNode(
    file: string,
    graph: SemanticCodeGraphData,
  ): SCGNode | null {
    // Find nodes in the same file
    for (const node of Array.from(graph.nodes.values())) {
      if (node.file === file) {
        return node;
      }
    }

    // Fallback: try partial match
    for (const node of Array.from(graph.nodes.values())) {
      if (node.file.includes(file) || file.includes(node.file)) {
        return node;
      }
    }

    return null;
  }

  /**
   * Create a "not found" analysis result.
   */
  private createNotFoundAnalysis(
    change: CodeChange,
    startTime: number,
  ): ImpactAnalysis {
    return {
      seedChange: change,
      seedNodeId: '',
      directImpacts: [],
      transitiveImpacts: [],
      affectedTests: [],
      riskAssessment: {
        overall: ImpactSeverity.INFO,
        score: 0,
        directImpactCount: 0,
        transitiveImpactCount: 0,
        affectedTestCount: 0,
        affectedFileCount: 0,
        reasoning:
          'Node not found in graph. Consider rebuilding the Semantic Code Graph with `nexus graph build`.',
      },
      affectedFiles: [],
      analyzedAt: new Date(),
      stats: {
        nodesTraversed: 0,
        edgesFollowed: 0,
        maxDepthReached: 0,
        analysisTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Build a human-readable reason for why a node is impacted.
   */
  private buildReason(
    node: SCGNode,
    distance: number,
    impactPath: ImpactEdge[],
    change: CodeChange,
  ): string {
    if (distance === 1 && impactPath.length > 0) {
      const edgeType = impactPath[0].edgeType;
      return `Directly ${edgeType} the changed code in ${change.file}`;
    }

    if (distance === 2) {
      return `Indirectly affected through ${impactPath.length} intermediate dependencies`;
    }

    return `Affected at distance ${distance} through dependency chain`;
  }

  /**
   * Build risk reasoning text.
   */
  private buildRiskReasoning(
    directCount: number,
    transitiveCount: number,
    testCount: number,
    criticalCount: number,
    highCount: number,
    change: CodeChange,
  ): string {
    const parts: string[] = [];

    if (criticalCount > 0) {
      parts.push(
        `${criticalCount} critical ${criticalCount === 1 ? 'dependency' : 'dependencies'}`,
      );
    }

    if (highCount > 0) {
      parts.push(
        `${highCount} high-severity ${highCount === 1 ? 'impact' : 'impacts'}`,
      );
    }

    if (directCount > 0) {
      parts.push(`${directCount} direct ${directCount === 1 ? 'impact' : 'impacts'}`);
    }

    if (transitiveCount > 0) {
      parts.push(
        `${transitiveCount} transitive ${transitiveCount === 1 ? 'impact' : 'impacts'}`,
      );
    }

    if (testCount > 0) {
      parts.push(`${testCount} affected ${testCount === 1 ? 'test' : 'tests'}`);
    }

    if (parts.length === 0) {
      return 'No significant impacts detected. Change appears isolated.';
    }

    return `Change to ${change.file} has ${parts.join(', ')}.`;
  }

  /**
   * Group impacted nodes by affected files.
   */
  private groupByAffectedFiles(
    impactedNodes: ImpactNode[],
    change: CodeChange,
  ): AffectedFile[] {
    const fileMap = new Map<string, ImpactNode[]>();

    for (const impactNode of impactedNodes) {
      const file = impactNode.node.file;
      if (!fileMap.has(file)) {
        fileMap.set(file, []);
      }
      fileMap.get(file)!.push(impactNode);
    }

    const affectedFiles: AffectedFile[] = [];

    for (const [file, nodes] of Array.from(fileMap.entries())) {
      // Find highest severity
      let highestSeverity = ImpactSeverity.INFO;
      for (const node of nodes) {
        if (this.compareSeverity(node.severity, highestSeverity) > 0) {
          highestSeverity = node.severity;
        }
      }

      affectedFiles.push({
        file,
        impactedNodes: nodes,
        highestSeverity,
        changeTypes: [change.type],
      });
    }

    // Sort by severity (highest first)
    affectedFiles.sort((a, b) =>
      this.compareSeverity(b.highestSeverity, a.highestSeverity),
    );

    return affectedFiles;
  }

  /**
   * Compare two severity levels.
   * Returns: positive if a > b, negative if a < b, 0 if equal
   */
  private compareSeverity(a: ImpactSeverity, b: ImpactSeverity): number {
    const order = {
      [ImpactSeverity.CRITICAL]: 5,
      [ImpactSeverity.HIGH]: 4,
      [ImpactSeverity.MEDIUM]: 3,
      [ImpactSeverity.LOW]: 2,
      [ImpactSeverity.INFO]: 1,
    };
    return order[a] - order[b];
  }
}
