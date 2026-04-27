import * as fc from 'fast-check';
import {
  getRelevantNodeIds,
  getRelatedNodes,
  getOverlayMapping,
  verifyGraphConsistency,
  enrichNodes,
} from './GraphExplorer';
import {
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  CodeChange,
  ChangeType,
} from '../types';

/**
 * Property-Based Tests for GraphExplorer Widget
 *
 * **Validates: Requirements 3.3, 3.5**
 */

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
) as fc.Arbitrary<EdgeType>;

/** Generate a valid graph node with a deterministic id */
const scgNodeArb: fc.Arbitrary<SCGNode> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map(s => `node_${s}`),
  type: nodeTypeArb,
  name: fc.string({ minLength: 1, maxLength: 15 }),
  file: fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
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

/** Generate a valid graph with at least 2 nodes and edges between them */
const graphArb: fc.Arbitrary<SemanticCodeGraphData> = fc
  .array(scgNodeArb, { minLength: 2, maxLength: 8 })
  .chain(nodes => {
    const ids = nodes.map(n => n.id);
    // Ensure unique ids
    const uniqueMap = new Map<string, SCGNode>();
    for (const n of nodes) {
      uniqueMap.set(n.id, n);
    }
    const uniqueNodes = Array.from(uniqueMap.values());
    const uniqueIds = uniqueNodes.map(n => n.id);
    return fc
      .array(edgeArb(uniqueIds), { minLength: 0, maxLength: 10 })
      .map(edges => buildGraph(uniqueNodes, edges));
  });

const taskStatusArb = fc.constantFrom(
  TaskStatus.PENDING,
  TaskStatus.EXECUTING,
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
);

const changeTypeArb = fc.constantFrom(
  ChangeType.CREATE,
  ChangeType.MODIFY,
  ChangeType.DELETE,
  ChangeType.REFACTOR,
);

const riskArb = fc.constantFrom('low', 'medium', 'high') as fc.Arbitrary<
  'low' | 'medium' | 'high'
>;

/** Generate a code change, optionally constrained to known files */
const codeChangeArb = (files?: string[]): fc.Arbitrary<CodeChange> =>
  fc.record({
    file: files
      ? fc.constantFrom(...files)
      : fc.string({ minLength: 3, maxLength: 20 }).map(s => `src/${s}.ts`),
    type: changeTypeArb,
    reasoning: fc.string({ minLength: 1, maxLength: 50 }),
    impact: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 3,
    }),
    risk: riskArb,
    diff: fc.string({ minLength: 0, maxLength: 100 }),
    content: fc.string({ minLength: 0, maxLength: 100 }),
    approved: fc.boolean(),
  });

/** Generate a Task, optionally with changes matching known files */
const taskArb = (files?: string[]): fc.Arbitrary<Task> =>
  fc.record({
    id: fc.uuid(),
    instruction: fc.string({ minLength: 1, maxLength: 50 }),
    classification: fc.option(
      fc.record({
        type: fc.constantFrom(TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR),
        priority: fc.constantFrom(TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW),
        complexity: fc.nat({ max: 10 }),
        requiresContext: fc.boolean(),
        requiresCodeGeneration: fc.boolean(),
        requiresGitOps: fc.boolean(),
        requiresReview: fc.boolean(),
        affectedAreas: fc.array(
          files
            ? fc.constantFrom(...files)
            : fc.string({ minLength: 3, maxLength: 20 }),
          { minLength: 0, maxLength: 5 }
        ),
        estimatedTokens: fc.nat({ max: 10000 }),
      }),
      { nil: undefined }
    ),
    subTasks: fc.constant([]),
    status: taskStatusArb,
    context: fc.option(fc.string({ minLength: 0, maxLength: 100 }), {
      nil: undefined,
    }),
    createdAt: fc.date(),
    updatedAt: fc.date(),
    result: fc.option(
      fc.record({
        success: fc.boolean(),
        output: fc.string({ minLength: 0, maxLength: 50 }),
        changes: fc.array(codeChangeArb(files), { minLength: 0, maxLength: 5 }),
      }),
      { nil: undefined }
    ),
  });

// ---------------------------------------------------------------------------
// Property 3: Semantic graph overlays agent proposals
// ---------------------------------------------------------------------------

describe('GraphExplorer Property-Based Tests', () => {
  describe('Property 3: Semantic graph overlays agent proposals', () => {
    it('should overlay proposals on nodes with matching files', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const files = Array.from(graph.nodes.values()).map(n => n.file);
          if (files.length === 0) return true;

          const proposals: CodeChange[] = files.slice(0, 2).map(file => ({
            file,
            type: ChangeType.MODIFY,
            reasoning: 'test proposal',
            impact: ['test impact'],
            risk: 'low' as const,
            diff: '+ new code',
            content: 'new code',
            approved: false,
          }));

          const overlayMapping = getOverlayMapping(graph, proposals);

          // Property: Every overlay key must be a valid node id
          for (const nodeId of overlayMapping.keys()) {
            if (!graph.nodes.has(nodeId)) return false;
          }

          // Property: Every overlay proposal must match the node's file
          for (const [nodeId, changes] of overlayMapping) {
            const node = graph.nodes.get(nodeId)!;
            for (const change of changes) {
              if (change.file !== node.file) return false;
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should maintain graph consistency when overlays are applied', () => {
      fc.assert(
        fc.property(
          graphArb,
          fc.array(codeChangeArb(), { minLength: 0, maxLength: 10 }),
          (graph, proposals) => {
            const overlayMapping = getOverlayMapping(graph, proposals);
            const isConsistent = verifyGraphConsistency(graph, overlayMapping);

            // Property: Graph must always be consistent regardless of proposals
            return isConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain accurate relationships when overlays are active', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const files = Array.from(graph.nodes.values()).map(n => n.file);
          if (files.length === 0) return true;

          // Create proposals that match some files
          const proposals: CodeChange[] = files.slice(0, 2).map(file => ({
            file,
            type: ChangeType.MODIFY,
            reasoning: 'test',
            impact: [],
            risk: 'low' as const,
            diff: '+ code',
            content: 'code',
            approved: false,
          }));

          const overlayMapping = getOverlayMapping(graph, proposals);

          // For every node with overlay, relationships must still be accurate
          for (const [nodeId] of overlayMapping) {
            const relationships = getRelatedNodes(graph, nodeId);

            // Property: All related nodes must exist in the graph
            for (const nodes of relationships.values()) {
              for (const rn of nodes) {
                if (!graph.nodes.has(rn.id)) return false;
              }
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should return empty overlay for proposals that match no files', () => {
      fc.assert(
        fc.property(
          graphArb,
          fc.array(
            fc.record({
              file: fc.string({ minLength: 10, maxLength: 30 }).map(s => `nonexistent/${s}.xyz`),
              type: changeTypeArb,
              reasoning: fc.string({ minLength: 1, maxLength: 10 }),
              impact: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { maxLength: 0 }),
              risk: riskArb,
              diff: fc.constant(''),
              content: fc.constant(''),
              approved: fc.boolean(),
            }) as fc.Arbitrary<CodeChange>,
            { minLength: 1, maxLength: 5 }
          ),
          (graph, proposals) => {
            const overlayMapping = getOverlayMapping(graph, proposals);

            // Property: Proposals with non-matching files produce no overlays
            return overlayMapping.size === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce enriched nodes that preserve all original graph relationships', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const files = Array.from(graph.nodes.values()).map(n => n.file);
          const proposals: CodeChange[] = files.slice(0, 2).map(file => ({
            file,
            type: ChangeType.MODIFY,
            reasoning: 'test',
            impact: [],
            risk: 'low' as const,
            diff: '',
            content: '',
            approved: false,
          }));

          const nodeIds = new Set(graph.nodes.keys());
          const overlayMapping = getOverlayMapping(graph, proposals);
          const enriched = enrichNodes(graph, nodeIds, overlayMapping);

          // Property: Number of enriched nodes equals number of graph nodes
          if (enriched.length !== graph.nodes.size) return false;

          // Property: All enriched node ids exist in the original graph
          for (const e of enriched) {
            if (!graph.nodes.has(e.node.id)) return false;
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly identify relevant nodes for a task', () => {
      fc.assert(
        fc.property(graphArb, (graph) => {
          const nodes = Array.from(graph.nodes.values());
          if (nodes.length === 0) return true;

          const files = nodes.map(n => n.file);
          const task: Task = {
            id: 'test-task',
            instruction: 'test instruction',
            subTasks: [],
            status: TaskStatus.EXECUTING,
            createdAt: new Date(),
            updatedAt: new Date(),
            result: {
              success: true,
              output: '',
              changes: [
                {
                  file: files[0],
                  type: ChangeType.MODIFY,
                  reasoning: 'test',
                  impact: [],
                  risk: 'low',
                  diff: '',
                  content: '',
                  approved: false,
                },
              ],
            },
          };

          const relevant = getRelevantNodeIds(graph, task);

          // Property: At least the nodes matching the change file are relevant
          const nodesInFile = nodes.filter(n => n.file === files[0]);
          for (const n of nodesInFile) {
            if (!relevant.has(n.id)) return false;
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
