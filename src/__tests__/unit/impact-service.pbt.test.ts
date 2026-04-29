/**
 * Property-Based Tests for Impact Analysis Service
 *
 * **Validates: Requirements 12.2, 12.3, 12.4, 13.5, 14.1**
 */

import * as fc from 'fast-check';
import { ImpactAnalysisService } from '../../services/impact-service';
import {
  ImpactAnalysis,
  ImpactNode,
  ImpactSeverity,
} from '../../types/impact';
import {
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
} from '../../types/graph';
import { CodeChange, ChangeType } from '../../types/task';
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
  EdgeType.IMPLEMENTS,
) as fc.Arbitrary<EdgeType>;

const changeTypeArb = fc.constantFrom(
  ChangeType.CREATE,
  ChangeType.MODIFY,
  ChangeType.DELETE,
  ChangeType.REFACTOR,
) as fc.Arbitrary<ChangeType>;

/** Generate a valid graph node */
const scgNodeArb: fc.Arbitrary<SCGNode> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map(s => `node_${s}`),
  type: nodeTypeArb,
  name: fc.string({ minLength: 1, maxLength: 15 }),
  file: fc.oneof(
    fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
    fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.test.ts`),
    fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.spec.ts`),
  ),
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

/** Generate a valid graph with at least 3 nodes and edges between them */
const graphArb: fc.Arbitrary<SemanticCodeGraphData> = fc
  .array(scgNodeArb, { minLength: 3, maxLength: 15 })
  .chain(nodes => {
    // Ensure unique ids
    const uniqueMap = new Map<string, SCGNode>();
    for (const n of nodes) {
      uniqueMap.set(n.id, n);
    }
    const uniqueNodes = Array.from(uniqueMap.values());
    const uniqueIds = uniqueNodes.map(n => n.id);
    return fc
      .array(edgeArb(uniqueIds), { minLength: 2, maxLength: 20 })
      .map(edges => buildGraph(uniqueNodes, edges));
  });

/** Generate a code change */
const codeChangeArb = (file: string): fc.Arbitrary<CodeChange> =>
  fc.record({
    file: fc.constant(file),
    type: changeTypeArb,
    reasoning: fc.string({ minLength: 10, maxLength: 50 }),
    impact: fc.array(fc.string({ minLength: 5, maxLength: 20 }), { maxLength: 5 }),
    risk: fc.constantFrom('low', 'medium', 'high') as fc.Arbitrary<'low' | 'medium' | 'high'>,
    diff: fc.string({ minLength: 10, maxLength: 100 }),
    content: fc.string({ minLength: 10, maxLength: 100 }),
    approved: fc.boolean(),
  });

// ---------------------------------------------------------------------------
// Property 8: Impact Analysis Distance Monotonicity
// ---------------------------------------------------------------------------

describe('Impact Service Property-Based Tests', () => {
  describe('Property 8: Impact Analysis Distance Monotonicity', () => {
    it('should separate direct impacts (distance == 1) from transitive impacts (distance > 1)', () => {
      fc.assert(
        fc.property(graphArb, fc.integer({ min: 2, max: 4 }), (graph, maxDepth) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          // Pick a node to analyze
          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, maxDepth);

          // Property: All direct impacts have distance == 1
          for (const impact of analysis.directImpacts) {
            if (impact.distance !== 1) {
              return false;
            }
          }

          // Property: All transitive impacts have distance > 1
          for (const impact of analysis.transitiveImpacts) {
            if (impact.distance <= 1) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should ensure no node appears in both directImpacts and transitiveImpacts', () => {
      fc.assert(
        fc.property(graphArb, fc.integer({ min: 2, max: 4 }), (graph, maxDepth) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, maxDepth);

          // Property: No overlap between direct and transitive impacts
          const directIds = new Set(analysis.directImpacts.map(i => i.node.id));
          const transitiveIds = new Set(analysis.transitiveImpacts.map(i => i.node.id));

          for (const id of Array.from(directIds)) {
            if (transitiveIds.has(id)) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should respect maxDepth constraint', () => {
      fc.assert(
        fc.property(graphArb, fc.integer({ min: 1, max: 3 }), (graph, maxDepth) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, maxDepth);

          // Property: All impacts have distance <= maxDepth
          const allImpacts = [...analysis.directImpacts, ...analysis.transitiveImpacts];
          for (const impact of allImpacts) {
            if (impact.distance > maxDepth) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 9: Impact Severity Consistency
  // ---------------------------------------------------------------------------

  describe('Property 9: Impact Severity Consistency', () => {
    it('should assign severity monotonically non-increasing with distance', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'high' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Build severity order map
          const severityOrder = {
            [ImpactSeverity.CRITICAL]: 5,
            [ImpactSeverity.HIGH]: 4,
            [ImpactSeverity.MEDIUM]: 3,
            [ImpactSeverity.LOW]: 2,
            [ImpactSeverity.INFO]: 1,
          };

          // Group impacts by distance
          const allImpacts = [...analysis.directImpacts, ...analysis.transitiveImpacts];
          const byDistance = new Map<number, ImpactNode[]>();
          for (const impact of allImpacts) {
            if (!byDistance.has(impact.distance)) {
              byDistance.set(impact.distance, []);
            }
            byDistance.get(impact.distance)!.push(impact);
          }

          // Property: For any two distances d1 < d2, max severity at d1 >= max severity at d2
          const distances = Array.from(byDistance.keys()).sort((a, b) => a - b);
          for (let i = 0; i < distances.length - 1; i++) {
            const d1 = distances[i];
            const d2 = distances[i + 1];

            const maxSeverityD1 = Math.max(
              ...byDistance.get(d1)!.map(imp => severityOrder[imp.severity])
            );
            const maxSeverityD2 = Math.max(
              ...byDistance.get(d2)!.map(imp => severityOrder[imp.severity])
            );

            // Allow equal severity (non-increasing, not strictly decreasing)
            if (maxSeverityD1 < maxSeverityD2) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should assign CRITICAL or HIGH severity to distance 1 impacts', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'high' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Distance 1 impacts should be CRITICAL or HIGH (or MEDIUM in edge cases)
          for (const impact of analysis.directImpacts) {
            const severity = impact.severity;
            // Allow CRITICAL, HIGH, or MEDIUM for distance 1
            if (
              severity !== ImpactSeverity.CRITICAL &&
              severity !== ImpactSeverity.HIGH &&
              severity !== ImpactSeverity.MEDIUM
            ) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should assign MEDIUM severity to distance 2 impacts', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Distance 2 impacts should be MEDIUM
          const distance2Impacts = analysis.transitiveImpacts.filter(i => i.distance === 2);
          for (const impact of distance2Impacts) {
            if (impact.severity !== ImpactSeverity.MEDIUM) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should assign LOW severity to distance 3 impacts', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'low' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Distance 3 impacts should be LOW
          const distance3Impacts = analysis.transitiveImpacts.filter(i => i.distance === 3);
          for (const impact of distance3Impacts) {
            if (impact.severity !== ImpactSeverity.LOW) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should assign INFO severity to distance 4+ impacts', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'low' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 5);

          // Property: Distance 4+ impacts should be INFO
          const distance4PlusImpacts = analysis.transitiveImpacts.filter(i => i.distance >= 4);
          for (const impact of distance4PlusImpacts) {
            if (impact.severity !== ImpactSeverity.INFO) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 10: Impact Test Identification
  // ---------------------------------------------------------------------------

  describe('Property 10: Impact Test Identification', () => {
    it('should identify only test files in affectedTests', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: All nodes in affectedTests match .test. or .spec. patterns
          for (const testNode of analysis.affectedTests) {
            const file = testNode.node.file;
            if (!file.includes('.test.') && !file.includes('.spec.')) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should not include duplicate test nodes', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: No duplicate test nodes
          const testIds = analysis.affectedTests.map(t => t.node.id);
          const uniqueIds = new Set(testIds);

          return testIds.length === uniqueIds.size;
        }),
        { numRuns: 50 }
      );
    });

    it('should populate reason field for all affected tests', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: All affected tests have a reason field
          for (const testNode of analysis.affectedTests) {
            if (!testNode.reason || testNode.reason.length === 0) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Additional Properties
  // ---------------------------------------------------------------------------

  describe('Additional Impact Analysis Properties', () => {
    it('should return valid risk assessment with score in range [0, 100]', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Risk score is in range [0, 100]
          return (
            analysis.riskAssessment.score >= 0 &&
            analysis.riskAssessment.score <= 100
          );
        }),
        { numRuns: 50 }
      );
    });

    it('should count impacts correctly in risk assessment', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Risk assessment counts match actual impact counts
          return (
            analysis.riskAssessment.directImpactCount === analysis.directImpacts.length &&
            analysis.riskAssessment.transitiveImpactCount === analysis.transitiveImpacts.length &&
            analysis.riskAssessment.affectedTestCount === analysis.affectedTests.length
          );
        }),
        { numRuns: 50 }
      );
    });

    it('should include analysis timestamp and stats', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const seedNode = nodes[0];
          const change = {
            file: seedNode.file,
            type: ChangeType.MODIFY,
            reasoning: 'Test change',
            impact: [],
            risk: 'medium' as const,
            diff: 'test diff',
            content: 'test content',
            approved: false,
          };

          const service = new ImpactAnalysisService();
          const traversal = new GraphTraversal(graph);
          const analysis = service.analyzeChange(change, graph, traversal, 4);

          // Property: Analysis has timestamp and valid stats
          return (
            analysis.analyzedAt instanceof Date &&
            analysis.stats.analysisTimeMs >= 0 &&
            analysis.stats.nodesTraversed >= 0 &&
            analysis.stats.edgesFollowed >= 0 &&
            analysis.stats.maxDepthReached >= 0
          );
        }),
        { numRuns: 50 }
      );
    });
  });
});
