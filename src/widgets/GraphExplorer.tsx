import React, { useState, useMemo, useCallback } from 'react';
import { SemanticCodeGraphData, SCGNode, SCGEdge, EdgeType, Task, CodeChange } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphExplorerProps {
  graph: SemanticCodeGraphData;
  activeTask: Task;
  overlayProposals?: CodeChange[];
  onNodeSelect?: (nodeId: string) => void;
}

/** Describes the kind of relationship a single edge represents */
export type RelationshipKind = 'calls' | 'used_by' | 'imports';

/** A node that has been enriched with relationship and overlay information */
export interface EnrichedNode {
  node: SCGNode;
  hasOverlay: boolean;
  overlayProposals: CodeChange[];
  relationships: Map<RelationshipKind, SCGNode[]>;
}

// ---------------------------------------------------------------------------
// Helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Determine which graph nodes are relevant to the active task.
 * A node is relevant if:
 *   - Its file appears in the task's result changes, OR
 *   - Its file appears in the task's classification affectedAreas, OR
 *   - Its id is referenced in the task's context string
 *
 * If no task-specific relevance can be determined, all nodes are returned
 * so the graph is still visible.
 *
 * Validates: Requirements 3.1
 */
export function getRelevantNodeIds(
  graph: SemanticCodeGraphData,
  task: Task
): Set<string> {
  const relevant = new Set<string>();

  // 1. Files from task result changes
  const taskFiles = new Set<string>();
  if (task.result?.changes) {
    for (const change of task.result.changes) {
      taskFiles.add(change.file);
    }
  }

  // 2. Affected areas from classification
  if (task.classification?.affectedAreas) {
    for (const area of task.classification.affectedAreas) {
      taskFiles.add(area);
    }
  }

  // 3. Match nodes by file
  for (const [id, node] of graph.nodes) {
    if (taskFiles.has(node.file)) {
      relevant.add(id);
    }
  }

  // 4. Nodes referenced in task context string (by id or name)
  if (task.context) {
    for (const [id, node] of graph.nodes) {
      if (task.context.includes(id) || task.context.includes(node.name)) {
        relevant.add(id);
      }
    }
  }

  // If nothing matched, include all nodes
  if (relevant.size === 0) {
    for (const id of graph.nodes.keys()) {
      relevant.add(id);
    }
  }

  return relevant;
}

/**
 * Get nodes that have a direct relationship to the given node, filtered by
 * relationship kinds: "calls", "used_by", "imports".
 *
 * - calls: edges where source=nodeId and type=CALLS
 * - used_by: edges where target=nodeId and type=USES or REFERENCES
 * - imports: edges where source=nodeId and type=IMPORTS
 *
 * Validates: Requirements 3.2
 */
export function getRelatedNodes(
  graph: SemanticCodeGraphData,
  nodeId: string,
  kinds: RelationshipKind[] = ['calls', 'used_by', 'imports']
): Map<RelationshipKind, SCGNode[]> {
  const result = new Map<RelationshipKind, SCGNode[]>();

  for (const kind of kinds) {
    const relatedIds = new Set<string>();

    for (const edge of graph.edges) {
      switch (kind) {
        case 'calls':
          if (edge.from === nodeId && edge.type === EdgeType.CALLS) {
            relatedIds.add(edge.to);
          }
          break;
        case 'used_by':
          // "used by" means something else uses/references this node
          if (edge.to === nodeId && (edge.type === EdgeType.USES || edge.type === EdgeType.REFERENCES)) {
            relatedIds.add(edge.from);
          }
          break;
        case 'imports':
          if (edge.from === nodeId && edge.type === EdgeType.IMPORTS) {
            relatedIds.add(edge.to);
          }
          break;
      }
    }

    const relatedNodes: SCGNode[] = [];
    for (const id of relatedIds) {
      const node = graph.nodes.get(id);
      if (node) {
        relatedNodes.push(node);
      }
    }
    result.set(kind, relatedNodes);
  }

  return result;
}

/**
 * Determine which nodes should have proposal overlays.
 * A node gets an overlay if any proposal's file matches the node's file.
 *
 * Validates: Requirements 3.3
 */
export function getOverlayMapping(
  graph: SemanticCodeGraphData,
  proposals: CodeChange[]
): Map<string, CodeChange[]> {
  const mapping = new Map<string, CodeChange[]>();

  for (const [nodeId, node] of graph.nodes) {
    const matching = proposals.filter(p => p.file === node.file);
    if (matching.length > 0) {
      mapping.set(nodeId, matching);
    }
  }

  return mapping;
}

/**
 * Verify that the graph structure remains consistent when overlays are applied.
 * All edges must reference nodes that still exist in the graph. The overlay does
 * not modify the underlying graph—it only adds visual markers.
 *
 * Validates: Requirements 3.5
 */
export function verifyGraphConsistency(
  graph: SemanticCodeGraphData,
  _overlayMapping: Map<string, CodeChange[]>
): boolean {
  const nodeIds = new Set(graph.nodes.keys());

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return false;
    }
  }

  return true;
}

/**
 * Enrich a set of nodes with their relationships and overlay proposals.
 */
export function enrichNodes(
  graph: SemanticCodeGraphData,
  nodeIds: Set<string>,
  overlayMapping: Map<string, CodeChange[]>
): EnrichedNode[] {
  const enriched: EnrichedNode[] = [];

  for (const id of nodeIds) {
    const node = graph.nodes.get(id);
    if (!node) continue;

    const overlayProposals = overlayMapping.get(id) || [];
    const relationships = getRelatedNodes(graph, id);

    enriched.push({
      node,
      hasOverlay: overlayProposals.length > 0,
      overlayProposals,
      relationships,
    });
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single node in the graph with expand/collapse for relationships */
const GraphNodeItem: React.FC<{
  enriched: EnrichedNode;
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ enriched, isExpanded, onToggleExpand, onNodeSelect }) => {
  const { node, hasOverlay, overlayProposals, relationships } = enriched;

  const totalRelated = Array.from(relationships.values()).reduce(
    (sum, nodes) => sum + nodes.length,
    0
  );

  return (
    <div
      className={`graph-node ${hasOverlay ? 'graph-node-overlay' : ''}`}
      data-node-id={node.id}
      data-overlay={hasOverlay}
      data-node-type={node.type}
    >
      <div className="graph-node-header">
        <button
          className="graph-node-expand"
          onClick={() => onToggleExpand(node.id)}
          aria-expanded={isExpanded}
          aria-label={`Expand ${node.name}`}
          data-expand-button={node.id}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
        <span
          className="graph-node-name"
          data-node-select={node.id}
          role="button"
          tabIndex={0}
          onClick={() => onNodeSelect?.(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNodeSelect?.(node.id);
            }
          }}
        >
          {node.name}
        </span>
        <span className="graph-node-type">({node.type})</span>
        {hasOverlay && (
          <span className="graph-node-overlay-badge" data-overlay-badge>
            {overlayProposals.length} proposal{overlayProposals.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="graph-node-file" data-node-file>{node.file}:{node.line}-{node.endLine}</div>

      {isExpanded && (
        <div className="graph-node-relationships" data-relationships={node.id}>
          {(['calls', 'used_by', 'imports'] as RelationshipKind[]).map(kind => {
            const relatedNodes = relationships.get(kind) || [];
            if (relatedNodes.length === 0) return null;
            return (
              <div key={kind} className={`graph-relationship-group rel-${kind}`} data-rel-group={kind}>
                <span className="graph-relationship-label">{kind}:</span>
                {relatedNodes.map(rn => (
                  <span
                    key={rn.id}
                    className="graph-related-node"
                    data-related-node={rn.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNodeSelect?.(rn.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNodeSelect?.(rn.id);
                      }
                    }}
                  >
                    {rn.name}
                  </span>
                ))}
              </div>
            );
          })}
          {totalRelated === 0 && (
            <div className="graph-no-relationships">No relationships found</div>
          )}
        </div>
      )}
    </div>
  );
});
GraphNodeItem.displayName = 'GraphNodeItem';

// ---------------------------------------------------------------------------
// Main GraphExplorer Component
// ---------------------------------------------------------------------------

export const GraphExplorer: React.FC<GraphExplorerProps> = ({
  graph,
  activeTask,
  overlayProposals = [],
  onNodeSelect,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Determine relevant nodes for the active task
  const relevantNodeIds = useMemo(
    () => getRelevantNodeIds(graph, activeTask),
    [graph, activeTask]
  );

  // Build overlay mapping
  const overlayMapping = useMemo(
    () => getOverlayMapping(graph, overlayProposals),
    [graph, overlayProposals]
  );

  // Verify consistency with overlays
  const isConsistent = useMemo(
    () => verifyGraphConsistency(graph, overlayMapping),
    [graph, overlayMapping]
  );

  // Enrich nodes
  const enrichedNodes = useMemo(
    () => enrichNodes(graph, relevantNodeIds, overlayMapping),
    [graph, relevantNodeIds, overlayMapping]
  );

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  return (
    <div className="graph-explorer" data-consistent={isConsistent}>
      <h2>Semantic Graph</h2>
      {!isConsistent && (
        <div className="graph-warning" role="alert">
          Graph consistency warning: some edges reference missing nodes
        </div>
      )}
      <div className="graph-nodes">
        {enrichedNodes.map(enriched => (
          <GraphNodeItem
            key={enriched.node.id}
            enriched={enriched}
            isExpanded={expandedNodes.has(enriched.node.id)}
            onToggleExpand={handleToggleExpand}
            onNodeSelect={onNodeSelect}
          />
        ))}
      </div>
      <div className="graph-stats" data-graph-stats>
        {enrichedNodes.length} nodes, {overlayMapping.size} with proposals
      </div>
    </div>
  );
};
