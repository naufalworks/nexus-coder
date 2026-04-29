/**
 * Unit Tests for Impact Analysis Service
 *
 * **Validates: Requirements 32.3**
 *
 * Tests cover:
 * 1. BFS traversal with mock graph data
 * 2. Direct vs transitive impact separation
 * 3. Severity calculation for each level
 * 4. Affected test identification with .test. and .spec. file patterns
 * 5. Risk assessment score calculation
 * 6. Edge cases: node not found, cyclic dependency, empty graph
 */

import { ImpactAnalysisService } from '../../services/impact-service';
import {
  ImpactAnalysis,
  ImpactNode,
  ImpactSeverity,
  ImpactEdge,
  RiskAssessment,
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
// Test Fixtures
// ---------------------------------------------------------------------------

function makeSCGNode(
  id: string,
  name: string,
  file: string,
  type: NodeType = NodeType.FUNCTION,
  line: number = 1,
  endLine: number = 10,
): SCGNode {
  return {
    id,
    type,
    name,
    file,
    line,
    endLine,
    signature: `function ${name}()`,
    summary: `${name} summary`,
    complexity: 5,
    changeFrequency: 0.1,
  };
}

function makeSCGEdge(
  from: string,
  to: string,
  type: EdgeType = EdgeType.CALLS,
  weight: number = 1,
): SCGEdge {
  return { from, to, type, weight };
}

function makeCodeChange(file: string, risk: 'low' | 'medium' | 'high' = 'medium'): CodeChange {
  return {
    file,
    type: ChangeType.MODIFY,
    reasoning: 'Test change',
    impact: [],
    risk,
    diff: 'test diff',
    content: 'test content',
    approved: false,
  };
}

function buildGraph(
  nodes: SCGNode[],
  edges: SCGEdge[],
): SemanticCodeGraphData {
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ImpactAnalysisService', () => {
  let service: ImpactAnalysisService;

  beforeEach(() => {
    service = new ImpactAnalysisService();
  });

  // -------------------------------------------------------------------------
  // Test 1: BFS traversal with mock graph data
  // -------------------------------------------------------------------------

  describe('analyzeChange - BFS traversal', () => {
    it('should perform BFS traversal from seed node', () => {
      // Arrange: A → B → C → D
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
        makeSCGNode('d', 'funcD', 'src/d.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('b', 'c', EdgeType.CALLS),
        makeSCGEdge('c', 'd', EdgeType.CALLS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.seedNodeId).toBe('a');
      expect(analysis.stats.nodesTraversed).toBeGreaterThan(0);
    });

    it('should traverse both directions of edges', () => {
      // Arrange: A → B, C → A (A has incoming and outgoing)
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('c', 'a', EdgeType.IMPORTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert - Should find both B and C through bidirectional traversal
      const allImpacts = [...analysis.directImpacts, ...analysis.transitiveImpacts];
      const impactIds = allImpacts.map(i => i.node.id);
      expect(impactIds).toContain('b');
      expect(impactIds).toContain('c');
    });

    it('should handle graph with many connected nodes', () => {
      // Arrange: Star topology - center → 10 nodes
      const center = makeSCGNode('center', 'center', 'src/center.ts');
      const satellites = Array.from({ length: 10 }, (_, i) =>
        makeSCGNode(`sat_${i}`, `sat_${i}`, `src/sat_${i}.ts`),
      );
      const edges = satellites.map(s =>
        makeSCGEdge('center', s.id, EdgeType.CALLS),
      );
      const graph = buildGraph([center, ...satellites], edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/center.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.directImpacts.length).toBe(10);
      expect(analysis.transitiveImpacts.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Direct vs transitive impact separation
  // -------------------------------------------------------------------------

  describe('analyzeChange - impact separation', () => {
    it('should separate direct impacts (distance == 1) from transitive impacts (distance > 1)', () => {
      // Arrange: A → B → C → D
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
        makeSCGNode('d', 'funcD', 'src/d.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('b', 'c', EdgeType.CALLS),
        makeSCGEdge('c', 'd', EdgeType.CALLS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.directImpacts.length).toBe(1);
      expect(analysis.directImpacts[0].node.id).toBe('b');
      expect(analysis.directImpacts[0].distance).toBe(1);

      expect(analysis.transitiveImpacts.length).toBe(2);
      const transitiveIds = analysis.transitiveImpacts.map(i => i.node.id);
      expect(transitiveIds).toContain('c');
      expect(transitiveIds).toContain('d');
      for (const impact of analysis.transitiveImpacts) {
        expect(impact.distance).toBeGreaterThan(1);
      }
    });

    it('should not have any node in both direct and transitive lists', () => {
      // Arrange: Diamond - A → B, A → C, B → D, C → D
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
        makeSCGNode('d', 'funcD', 'src/d.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('a', 'c', EdgeType.CALLS),
        makeSCGEdge('b', 'd', EdgeType.CALLS),
        makeSCGEdge('c', 'd', EdgeType.CALLS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert: No overlap
      const directIds = new Set(analysis.directImpacts.map(i => i.node.id));
      for (const trans of analysis.transitiveImpacts) {
        expect(directIds.has(trans.node.id)).toBe(false);
      }
    });

    it('should return empty impacts for isolated node', () => {
      // Arrange: Single isolated node
      const nodes = [makeSCGNode('a', 'funcA', 'src/a.ts')];
      const edges: SCGEdge[] = [];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.directImpacts).toHaveLength(0);
      expect(analysis.transitiveImpacts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Severity calculation for each level
  // -------------------------------------------------------------------------

  describe('calculateSeverity', () => {
    it('should assign CRITICAL for distance 1 + CALLS + production code', () => {
      const node = makeSCGNode('b', 'funcB', 'src/production.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.CALLS },
      ];
      const change = makeCodeChange('src/a.ts', 'high');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      expect(severity).toBe(ImpactSeverity.CRITICAL);
    });

    it('should assign CRITICAL for distance 1 + EXTENDS + production code', () => {
      const node = makeSCGNode('b', 'funcB', 'src/production.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.EXTENDS },
      ];
      const change = makeCodeChange('src/a.ts', 'high');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      expect(severity).toBe(ImpactSeverity.CRITICAL);
    });

    it('should assign CRITICAL for distance 1 + IMPLEMENTS + production code', () => {
      const node = makeSCGNode('b', 'ClassB', 'src/production.ts', NodeType.CLASS);
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.IMPLEMENTS },
      ];
      const change = makeCodeChange('src/a.ts', 'high');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      expect(severity).toBe(ImpactSeverity.CRITICAL);
    });

    it('should assign HIGH for distance 1 + IMPORTS', () => {
      const node = makeSCGNode('b', 'funcB', 'src/b.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.IMPORTS },
      ];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      expect(severity).toBe(ImpactSeverity.HIGH);
    });

    it('should assign HIGH for distance 1 + REFERENCES', () => {
      const node = makeSCGNode('b', 'funcB', 'src/b.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.REFERENCES },
      ];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      expect(severity).toBe(ImpactSeverity.HIGH);
    });

    it('should assign MEDIUM for distance 2', () => {
      const node = makeSCGNode('c', 'funcC', 'src/c.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.CALLS },
        { from: 'b', to: 'c', edgeType: EdgeType.CALLS },
      ];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 2, impactPath, change);

      expect(severity).toBe(ImpactSeverity.MEDIUM);
    });

    it('should assign LOW for distance 3', () => {
      const node = makeSCGNode('d', 'funcD', 'src/d.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.CALLS },
        { from: 'b', to: 'c', edgeType: EdgeType.CALLS },
        { from: 'c', to: 'd', edgeType: EdgeType.CALLS },
      ];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 3, impactPath, change);

      expect(severity).toBe(ImpactSeverity.LOW);
    });

    it('should assign INFO for distance 4+', () => {
      const node = makeSCGNode('e', 'funcE', 'src/e.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.CALLS },
        { from: 'b', to: 'c', edgeType: EdgeType.CALLS },
        { from: 'c', to: 'd', edgeType: EdgeType.CALLS },
        { from: 'd', to: 'e', edgeType: EdgeType.CALLS },
      ];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 4, impactPath, change);

      expect(severity).toBe(ImpactSeverity.INFO);
    });

    it('should assign INFO for distance 5+', () => {
      const node = makeSCGNode('f', 'funcF', 'src/f.ts');
      const impactPath: ImpactEdge[] = [];
      const change = makeCodeChange('src/a.ts');

      const severity = service.calculateSeverity(node, 5, impactPath, change);

      expect(severity).toBe(ImpactSeverity.INFO);
    });

    it('should not assign CRITICAL for CALLS in test files', () => {
      const node = makeSCGNode('b', 'testFunc', 'src/b.test.ts');
      const impactPath: ImpactEdge[] = [
        { from: 'a', to: 'b', edgeType: EdgeType.CALLS },
      ];
      const change = makeCodeChange('src/a.ts', 'high');

      const severity = service.calculateSeverity(node, 1, impactPath, change);

      // Test files should get HIGH instead of CRITICAL even with CALLS
      expect(severity).toBe(ImpactSeverity.HIGH);
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Affected test identification
  // -------------------------------------------------------------------------

  describe('identifyAffectedTests', () => {
    it('should identify test files in .test. pattern', () => {
      // Arrange: Production node → test node
      const nodes = [
        makeSCGNode('prod', 'prodFunc', 'src/prod.ts'),
        makeSCGNode('test', 'testFunc', 'src/prod.test.ts'),
      ];
      const edges = [
        makeSCGEdge('test', 'prod', EdgeType.TESTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      const impactedNodes: ImpactNode[] = [
        {
          node: nodes[0],
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'Direct impact',
        },
      ];

      // Act
      const affectedTests = service.identifyAffectedTests(impactedNodes, graph, traversal);

      // Assert
      for (const test of affectedTests) {
        expect(test.node.file).toMatch(/\.(test|spec)\./);
      }
    });

    it('should identify test files in .spec. pattern', () => {
      // Arrange
      const nodes = [
        makeSCGNode('prod', 'prodFunc', 'src/prod.ts'),
        makeSCGNode('spec', 'specFunc', 'src/prod.spec.ts'),
      ];
      const edges = [
        makeSCGEdge('spec', 'prod', EdgeType.TESTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      const impactedNodes: ImpactNode[] = [
        {
          node: nodes[0],
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'Direct impact',
        },
      ];

      // Act
      const affectedTests = service.identifyAffectedTests(impactedNodes, graph, traversal);

      // Assert
      for (const test of affectedTests) {
        expect(test.node.file).toMatch(/\.(test|spec)\./);
      }
    });

    it('should not include duplicate test nodes', () => {
      // Arrange
      const nodes = [
        makeSCGNode('prod', 'prodFunc', 'src/prod.ts'),
        makeSCGNode('test1', 'testFunc', 'src/prod.test.ts'),
      ];
      const edges = [
        makeSCGEdge('test1', 'prod', EdgeType.TESTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Same test node referenced twice in impacted nodes
      const impactedNodes: ImpactNode[] = [
        {
          node: nodes[1], // test node
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'Direct impact',
        },
        {
          node: nodes[1], // same test node again
          impactPath: [],
          distance: 2,
          severity: ImpactSeverity.MEDIUM,
          reason: 'Transitive impact',
        },
      ];

      // Act
      const affectedTests = service.identifyAffectedTests(impactedNodes, graph, traversal);

      // Assert: No duplicates
      const ids = affectedTests.map(t => t.node.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should populate reason field for affected tests', () => {
      // Arrange
      const nodes = [
        makeSCGNode('prod', 'prodFunc', 'src/prod.ts'),
        makeSCGNode('test', 'testFunc', 'src/prod.test.ts'),
      ];
      const edges = [
        makeSCGEdge('test', 'prod', EdgeType.TESTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      const impactedNodes: ImpactNode[] = [
        {
          node: nodes[1], // test node directly impacted
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'Direct impact',
        },
      ];

      // Act
      const affectedTests = service.identifyAffectedTests(impactedNodes, graph, traversal);

      // Assert: All test nodes have reasons
      for (const test of affectedTests) {
        expect(test.reason).toBeTruthy();
        expect(test.reason.length).toBeGreaterThan(0);
      }
    });

    it('should find test nodes that test impacted production nodes', () => {
      // Arrange: prod node impacted, test node tests it
      const nodes = [
        makeSCGNode('prod', 'prodFunc', 'src/prod.ts'),
        makeSCGNode('test', 'testProdFunc', 'src/prod.test.ts'),
      ];
      const edges = [
        makeSCGEdge('test', 'prod', EdgeType.TESTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Only the production node is in impacted nodes
      const impactedNodes: ImpactNode[] = [
        {
          node: nodes[0], // production node
          impactPath: [{ from: 'seed', to: 'prod', edgeType: EdgeType.CALLS }],
          distance: 1,
          severity: ImpactSeverity.CRITICAL,
          reason: 'Directly impacted',
        },
      ];

      // Act
      const affectedTests = service.identifyAffectedTests(impactedNodes, graph, traversal);

      // Assert: Should find the test node that tests the production node
      expect(affectedTests.length).toBeGreaterThan(0);
      expect(affectedTests.some(t => t.node.id === 'test')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test 5: Risk assessment score calculation
  // -------------------------------------------------------------------------

  describe('buildRiskAssessment', () => {
    it('should calculate score based on severity counts', () => {
      // Arrange
      const directImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('a', 'funcA', 'src/a.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.CRITICAL,
          reason: 'Critical impact',
        },
      ];
      const transitiveImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('b', 'funcB', 'src/b.ts'),
          impactPath: [],
          distance: 2,
          severity: ImpactSeverity.MEDIUM,
          reason: 'Medium impact',
        },
      ];
      const change = makeCodeChange('src/seed.ts');

      // Act
      const assessment = service.buildRiskAssessment(
        directImpacts,
        transitiveImpacts,
        [],
        change,
      );

      // Assert: 1 critical * 20 + 1 medium * 5 = 25
      expect(assessment.score).toBe(25);
    });

    it('should cap score at 100', () => {
      // Arrange: Many critical impacts
      const directImpacts: ImpactNode[] = Array.from({ length: 10 }, (_, i) => ({
        node: makeSCGNode(`a${i}`, `func${i}`, `src/${i}.ts`),
        impactPath: [],
        distance: 1,
        severity: ImpactSeverity.CRITICAL,
        reason: 'Critical impact',
      }));
      const change = makeCodeChange('src/seed.ts');

      // Act
      const assessment = service.buildRiskAssessment(directImpacts, [], [], change);

      // Assert: 10 * 20 = 200, capped at 100
      expect(assessment.score).toBe(100);
    });

    it('should return 0 score for no impacts', () => {
      // Arrange
      const change = makeCodeChange('src/seed.ts');

      // Act
      const assessment = service.buildRiskAssessment([], [], [], change);

      // Assert
      expect(assessment.score).toBe(0);
      expect(assessment.overall).toBe(ImpactSeverity.INFO);
    });

    it('should determine overall severity correctly', () => {
      // Arrange: Critical impact
      const directImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('a', 'funcA', 'src/a.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.CRITICAL,
          reason: 'Critical',
        },
      ];
      const change = makeCodeChange('src/seed.ts');

      // Act
      const assessment = service.buildRiskAssessment(directImpacts, [], [], change);

      // Assert
      expect(assessment.overall).toBe(ImpactSeverity.CRITICAL);
    });

    it('should count impacts and files correctly', () => {
      // Arrange
      const directImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('a', 'funcA', 'src/a.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'High',
        },
        {
          node: makeSCGNode('b', 'funcB', 'src/b.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.HIGH,
          reason: 'High',
        },
      ];
      const transitiveImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('c', 'funcC', 'src/c.ts'),
          impactPath: [],
          distance: 2,
          severity: ImpactSeverity.MEDIUM,
          reason: 'Medium',
        },
      ];
      const affectedTests: ImpactNode[] = [
        {
          node: makeSCGNode('t1', 'testFunc', 'src/a.test.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.INFO,
          reason: 'Test',
        },
      ];
      const change = makeCodeChange('src/seed.ts');

      // Act
      const assessment = service.buildRiskAssessment(
        directImpacts,
        transitiveImpacts,
        affectedTests,
        change,
      );

      // Assert
      expect(assessment.directImpactCount).toBe(2);
      expect(assessment.transitiveImpactCount).toBe(1);
      expect(assessment.affectedTestCount).toBe(1);
      expect(assessment.affectedFileCount).toBe(3); // a.ts, b.ts, c.ts
    });

    it('should include human-readable reasoning', () => {
      // Arrange
      const directImpacts: ImpactNode[] = [
        {
          node: makeSCGNode('a', 'funcA', 'src/a.ts'),
          impactPath: [],
          distance: 1,
          severity: ImpactSeverity.CRITICAL,
          reason: 'Critical',
        },
      ];
      const change = makeCodeChange('src/my-module.ts');

      // Act
      const assessment = service.buildRiskAssessment(directImpacts, [], [], change);

      // Assert
      expect(assessment.reasoning).toBeTruthy();
      expect(assessment.reasoning.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle node not found gracefully', () => {
      // Arrange: Empty graph
      const nodes: SCGNode[] = [];
      const edges: SCGEdge[] = [];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/nonexistent.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.seedNodeId).toBe('');
      expect(analysis.directImpacts).toHaveLength(0);
      expect(analysis.transitiveImpacts).toHaveLength(0);
      expect(analysis.riskAssessment.reasoning).toContain('not found');
    });

    it('should suggest graph rebuild when node not found', () => {
      // Arrange: Graph exists but doesn't contain the file
      const nodes = [makeSCGNode('a', 'funcA', 'src/other.ts')];
      const edges: SCGEdge[] = [];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/missing.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.riskAssessment.reasoning).toContain('rebuilding');
    });

    it('should handle empty graph with setup prompt', () => {
      // Arrange: Completely empty graph
      const graph = buildGraph([], []);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/any.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.directImpacts).toHaveLength(0);
      expect(analysis.transitiveImpacts).toHaveLength(0);
      expect(analysis.riskAssessment.overall).toBe(ImpactSeverity.INFO);
    });

    it('should handle cyclic dependencies by limiting traversal depth', () => {
      // Arrange: A → B → C → A (cycle)
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('b', 'c', EdgeType.CALLS),
        makeSCGEdge('c', 'a', EdgeType.CALLS), // Cycle!
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act - should not infinite loop
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        2, // Limited depth
      );

      // Assert
      expect(analysis.stats.maxDepthReached).toBeLessThanOrEqual(2);
      // BFS should handle cycles by not visiting nodes twice
      const allImpacts = [...analysis.directImpacts, ...analysis.transitiveImpacts];
      const ids = allImpacts.map(i => i.node.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should handle self-referencing node', () => {
      // Arrange: A → A (self-reference)
      const nodes = [makeSCGNode('a', 'funcA', 'src/a.ts')];
      const edges = [makeSCGEdge('a', 'a', EdgeType.CALLS)];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert - Should not crash, seed node is excluded from results
      expect(analysis.directImpacts).toHaveLength(0);
      expect(analysis.transitiveImpacts).toHaveLength(0);
    });

    it('should handle analyzeNode with valid nodeId', () => {
      // Arrange
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
      ];
      const edges = [makeSCGEdge('a', 'b', EdgeType.CALLS)];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeNode('a', graph, traversal, 4);

      // Assert
      expect(analysis.seedNodeId).toBe('a');
      expect(analysis.seedChange.file).toBe('src/a.ts');
    });

    it('should handle analyzeNode with invalid nodeId', () => {
      // Arrange
      const nodes = [makeSCGNode('a', 'funcA', 'src/a.ts')];
      const edges: SCGEdge[] = [];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeNode('nonexistent', graph, traversal, 4);

      // Assert
      expect(analysis.seedNodeId).toBe('');
      expect(analysis.directImpacts).toHaveLength(0);
    });

    it('should measure analysis time', () => {
      // Arrange
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
      ];
      const edges = [makeSCGEdge('a', 'b', EdgeType.CALLS)];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.stats.analysisTimeMs).toBeGreaterThanOrEqual(0);
      expect(analysis.analyzedAt).toBeInstanceOf(Date);
    });

    it('should group affected files by severity', () => {
      // Arrange: A → B (CRITICAL), A → C (MEDIUM)
      const nodes = [
        makeSCGNode('a', 'funcA', 'src/a.ts'),
        makeSCGNode('b', 'funcB', 'src/b.ts'),
        makeSCGNode('c', 'funcC', 'src/c.ts'),
      ];
      const edges = [
        makeSCGEdge('a', 'b', EdgeType.CALLS),
        makeSCGEdge('a', 'c', EdgeType.IMPORTS),
      ];
      const graph = buildGraph(nodes, edges);
      const traversal = new GraphTraversal(graph);

      // Act
      const analysis = service.analyzeChange(
        makeCodeChange('src/a.ts'),
        graph,
        traversal,
        4,
      );

      // Assert
      expect(analysis.affectedFiles.length).toBeGreaterThan(0);
      // Affected files should be sorted by severity (highest first)
      if (analysis.affectedFiles.length > 1) {
        const severityOrder = {
          [ImpactSeverity.CRITICAL]: 5,
          [ImpactSeverity.HIGH]: 4,
          [ImpactSeverity.MEDIUM]: 3,
          [ImpactSeverity.LOW]: 2,
          [ImpactSeverity.INFO]: 1,
        };
        for (let i = 0; i < analysis.affectedFiles.length - 1; i++) {
          const curr = severityOrder[analysis.affectedFiles[i].highestSeverity];
          const next = severityOrder[analysis.affectedFiles[i + 1].highestSeverity];
          expect(curr).toBeGreaterThanOrEqual(next);
        }
      }
    });
  });
});
