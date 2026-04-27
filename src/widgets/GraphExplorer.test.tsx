import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  GraphExplorer,
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
 * Unit Tests for GraphExplorer Widget
 *
 * **Validates: Requirements 3.2, 3.4**
 */

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  name: string,
  file: string,
  type: NodeType = NodeType.FUNCTION
): SCGNode {
  return {
    id,
    type,
    name,
    file,
    line: 1,
    endLine: 10,
    signature: `function ${name}()`,
    summary: `${name} summary`,
    complexity: 1,
    changeFrequency: 1,
  };
}

function makeEdge(from: string, to: string, type: EdgeType, weight = 1): SCGEdge {
  return { from, to, type, weight };
}

function buildGraph(nodes: SCGNode[], edges: SCGEdge[]): SemanticCodeGraphData {
  const nodeMap = new Map<string, SCGNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }
  const depMap = new Map<string, string[]>();
  for (const n of nodes) {
    depMap.set(
      n.id,
      edges.filter(e => e.from === n.id).map(e => e.to)
    );
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    instruction: 'Test task',
    subTasks: [],
    status: TaskStatus.EXECUTING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCodeChange(file: string): CodeChange {
  return {
    file,
    type: ChangeType.MODIFY,
    reasoning: 'test change',
    impact: ['test impact'],
    risk: 'low',
    diff: '+ new code',
    content: 'new code',
    approved: false,
  };
}

// ---------------------------------------------------------------------------
// getRelevantNodeIds (Requirement 3.1)
// ---------------------------------------------------------------------------

describe('getRelevantNodeIds', () => {
  it('should return nodes matching task result change files', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
        makeNode('c', 'funcC', 'src/other.ts'),
      ],
      []
    );

    const task = makeTask({
      result: {
        success: true,
        output: '',
        changes: [makeCodeChange('src/app.ts')],
      },
    });

    const relevant = getRelevantNodeIds(graph, task);
    expect(relevant.has('a')).toBe(true);
    expect(relevant.has('b')).toBe(false);
  });

  it('should return nodes matching classification affected areas', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      []
    );

    const task = makeTask({
      classification: {
        type: TaskType.FEATURE,
        priority: TaskPriority.HIGH,
        complexity: 3,
        requiresContext: true,
        requiresCodeGeneration: true,
        requiresGitOps: false,
        requiresReview: false,
        affectedAreas: ['src/util.ts'],
        estimatedTokens: 100,
      },
    });

    const relevant = getRelevantNodeIds(graph, task);
    expect(relevant.has('b')).toBe(true);
  });

  it('should return nodes referenced in task context string', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      []
    );

    const task = makeTask({
      context: 'Working on funcB for the feature',
    });

    const relevant = getRelevantNodeIds(graph, task);
    expect(relevant.has('b')).toBe(true);
  });

  it('should return all nodes when no task-specific relevance is found', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      []
    );

    const task = makeTask();
    const relevant = getRelevantNodeIds(graph, task);

    expect(relevant.has('a')).toBe(true);
    expect(relevant.has('b')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRelatedNodes (Requirement 3.2)
// ---------------------------------------------------------------------------

describe('getRelatedNodes', () => {
  it('should return "calls" relationships', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('a', 'b', EdgeType.CALLS)]
    );

    const related = getRelatedNodes(graph, 'a', ['calls']);
    expect(related.get('calls')).toHaveLength(1);
    expect(related.get('calls')![0].id).toBe('b');
  });

  it('should return "used_by" relationships', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('b', 'a', EdgeType.USES)]
    );

    const related = getRelatedNodes(graph, 'a', ['used_by']);
    expect(related.get('used_by')).toHaveLength(1);
    expect(related.get('used_by')![0].id).toBe('b');
  });

  it('should return "used_by" relationships from REFERENCES edges', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('c', 'funcC', 'src/other.ts'),
      ],
      [makeEdge('c', 'a', EdgeType.REFERENCES)]
    );

    const related = getRelatedNodes(graph, 'a', ['used_by']);
    expect(related.get('used_by')).toHaveLength(1);
    expect(related.get('used_by')![0].id).toBe('c');
  });

  it('should return "imports" relationships', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('a', 'b', EdgeType.IMPORTS)]
    );

    const related = getRelatedNodes(graph, 'a', ['imports']);
    expect(related.get('imports')).toHaveLength(1);
    expect(related.get('imports')![0].id).toBe('b');
  });

  it('should return empty arrays for non-existent relationships', () => {
    const graph = buildGraph(
      [makeNode('a', 'funcA', 'src/app.ts')],
      []
    );

    const related = getRelatedNodes(graph, 'a');
    expect(related.get('calls')).toEqual([]);
    expect(related.get('used_by')).toEqual([]);
    expect(related.get('imports')).toEqual([]);
  });

  it('should return all relationship types when multiple edges exist', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
        makeNode('c', 'funcC', 'src/other.ts'),
      ],
      [
        makeEdge('a', 'b', EdgeType.CALLS),
        makeEdge('a', 'c', EdgeType.IMPORTS),
        makeEdge('c', 'a', EdgeType.USES),
      ]
    );

    const related = getRelatedNodes(graph, 'a');
    expect(related.get('calls')).toHaveLength(1);
    expect(related.get('imports')).toHaveLength(1);
    expect(related.get('used_by')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getOverlayMapping (Requirement 3.3)
// ---------------------------------------------------------------------------

describe('getOverlayMapping', () => {
  it('should map proposals to nodes by file', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      []
    );

    const proposals = [makeCodeChange('src/app.ts')];
    const mapping = getOverlayMapping(graph, proposals);

    expect(mapping.has('a')).toBe(true);
    expect(mapping.has('b')).toBe(false);
    expect(mapping.get('a')).toHaveLength(1);
  });

  it('should map multiple proposals to the same node', () => {
    const graph = buildGraph(
      [makeNode('a', 'funcA', 'src/app.ts')],
      []
    );

    const proposals = [
      makeCodeChange('src/app.ts'),
      { ...makeCodeChange('src/app.ts'), type: ChangeType.CREATE },
    ];
    const mapping = getOverlayMapping(graph, proposals);

    expect(mapping.get('a')).toHaveLength(2);
  });

  it('should return empty mapping for proposals matching no files', () => {
    const graph = buildGraph(
      [makeNode('a', 'funcA', 'src/app.ts')],
      []
    );

    const proposals = [makeCodeChange('src/other.ts')];
    const mapping = getOverlayMapping(graph, proposals);

    expect(mapping.size).toBe(0);
  });

  it('should return empty mapping for empty proposals', () => {
    const graph = buildGraph(
      [makeNode('a', 'funcA', 'src/app.ts')],
      []
    );

    const mapping = getOverlayMapping(graph, []);
    expect(mapping.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// verifyGraphConsistency (Requirement 3.5)
// ---------------------------------------------------------------------------

describe('verifyGraphConsistency', () => {
  it('should return true for a valid graph', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('a', 'b', EdgeType.CALLS)]
    );

    expect(verifyGraphConsistency(graph, new Map())).toBe(true);
  });

  it('should return false when edges reference non-existent nodes', () => {
    const graph = buildGraph(
      [makeNode('a', 'funcA', 'src/app.ts')],
      [makeEdge('a', 'nonexistent', EdgeType.CALLS)]
    );

    expect(verifyGraphConsistency(graph, new Map())).toBe(false);
  });

  it('should return true regardless of overlay mapping', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('a', 'b', EdgeType.CALLS)]
    );

    const overlayMapping = new Map<string, CodeChange[]>();
    overlayMapping.set('a', [makeCodeChange('src/app.ts')]);

    expect(verifyGraphConsistency(graph, overlayMapping)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// enrichNodes
// ---------------------------------------------------------------------------

describe('enrichNodes', () => {
  it('should enrich nodes with relationships and overlays', () => {
    const graph = buildGraph(
      [
        makeNode('a', 'funcA', 'src/app.ts'),
        makeNode('b', 'funcB', 'src/util.ts'),
      ],
      [makeEdge('a', 'b', EdgeType.CALLS)]
    );

    const nodeIds = new Set(['a', 'b']);
    const overlayMapping = new Map<string, CodeChange[]>();
    overlayMapping.set('a', [makeCodeChange('src/app.ts')]);

    const enriched = enrichNodes(graph, nodeIds, overlayMapping);

    expect(enriched).toHaveLength(2);

    const nodeA = enriched.find(e => e.node.id === 'a')!;
    expect(nodeA.hasOverlay).toBe(true);
    expect(nodeA.overlayProposals).toHaveLength(1);
    expect(nodeA.relationships.get('calls')!).toHaveLength(1);

    const nodeB = enriched.find(e => e.node.id === 'b')!;
    expect(nodeB.hasOverlay).toBe(false);
    expect(nodeB.overlayProposals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Component Rendering & Interaction (Requirements 3.2, 3.4)
// ---------------------------------------------------------------------------

describe('GraphExplorer Component', () => {
  const basicGraph = buildGraph(
    [
      makeNode('a', 'funcA', 'src/app.ts'),
      makeNode('b', 'funcB', 'src/util.ts'),
      makeNode('c', 'funcC', 'src/other.ts'),
    ],
    [
      makeEdge('a', 'b', EdgeType.CALLS),
      makeEdge('c', 'a', EdgeType.USES),
      makeEdge('a', 'c', EdgeType.IMPORTS),
    ]
  );

  const basicTask = makeTask({
    result: {
      success: true,
      output: '',
      changes: [makeCodeChange('src/app.ts')],
    },
  });

  describe('Node Expansion (Requirement 3.2)', () => {
    it('should render expand buttons for nodes', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      expect(expandButtons.length).toBeGreaterThan(0);
    });

    it('should reveal relationship groups when node is expanded', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      // Initially, no relationships should be visible
      expect(screen.queryByText('calls:')).not.toBeInTheDocument();

      // Click expand button on funcA
      const expandA = screen.getAllByRole('button', { name: /Expand / })[0];
      fireEvent.click(expandA);

      // Now relationship groups should be visible
      const relGroups = document.querySelectorAll('[data-rel-group]');
      expect(relGroups.length).toBeGreaterThan(0);

      // Should show calls relationship
      expect(screen.getByText('calls:')).toBeInTheDocument();
    });

    it('should reveal Calls, Used By, and Imports when expanded', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      // Expand funcA (which has all three relationship types)
      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      fireEvent.click(expandButtons[0]);

      // Should show all relationship types
      expect(screen.getByText('calls:')).toBeInTheDocument();
      expect(screen.getByText('used_by:')).toBeInTheDocument();
      expect(screen.getByText('imports:')).toBeInTheDocument();
    });

    it('should collapse relationships when expand button is clicked again', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      const expandA = expandButtons[0];

      // Expand
      fireEvent.click(expandA);
      expect(screen.getByText('calls:')).toBeInTheDocument();

      // Collapse
      fireEvent.click(expandA);
      expect(screen.queryByText('calls:')).not.toBeInTheDocument();
    });

    it('should show related node names in relationship groups', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      fireEvent.click(expandButtons[0]);

      // Should show funcB as a called node
      expect(screen.getByText('funcB')).toBeInTheDocument();
    });

    it('should show "No relationships found" when a node has no edges', () => {
      const isolatedGraph = buildGraph(
        [makeNode('a', 'funcA', 'src/app.ts')],
        []
      );

      render(
        <GraphExplorer
          graph={isolatedGraph}
          activeTask={makeTask()}
        />
      );

      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      fireEvent.click(expandButtons[0]);

      expect(screen.getByText('No relationships found')).toBeInTheDocument();
    });
  });

  describe('Node Selection (Requirement 3.4)', () => {
    it('should call onNodeSelect when a node name is clicked', () => {
      const onNodeSelect = jest.fn();

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          onNodeSelect={onNodeSelect}
        />
      );

      // Click on funcA node name
      const nodeName = screen.getByText('funcA');
      fireEvent.click(nodeName);

      expect(onNodeSelect).toHaveBeenCalledWith('a');
    });

    it('should call onNodeSelect when a related node is clicked', () => {
      const onNodeSelect = jest.fn();

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          onNodeSelect={onNodeSelect}
        />
      );

      // Expand first node
      const expandButtons = screen.getAllByRole('button', { name: /Expand / });
      fireEvent.click(expandButtons[0]);

      // Click on related node funcB
      // There may be multiple funcB elements; find one with data-related-node
      const relatedNodes = document.querySelectorAll('[data-related-node="b"]');
      expect(relatedNodes.length).toBeGreaterThan(0);
      fireEvent.click(relatedNodes[0]);

      expect(onNodeSelect).toHaveBeenCalledWith('b');
    });

    it('should not crash when onNodeSelect is not provided', () => {
      render(
        <GraphExplorer graph={basicGraph} activeTask={basicTask} />
      );

      const nodeName = screen.getByText('funcA');
      expect(() => fireEvent.click(nodeName)).not.toThrow();
    });
  });

  describe('Proposal Overlays (Requirement 3.3)', () => {
    it('should show overlay badge on nodes with proposals', () => {
      const proposals = [makeCodeChange('src/app.ts')];

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          overlayProposals={proposals}
        />
      );

      const badges = document.querySelectorAll('[data-overlay-badge]');
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0].textContent).toContain('1 proposal');
    });

    it('should not show overlay badge on nodes without proposals', () => {
      const proposals = [makeCodeChange('src/nonexistent.ts')];

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          overlayProposals={proposals}
        />
      );

      const badges = document.querySelectorAll('[data-overlay-badge]');
      expect(badges.length).toBe(0);
    });

    it('should show correct proposal count when multiple proposals match a node', () => {
      const proposals = [
        makeCodeChange('src/app.ts'),
        { ...makeCodeChange('src/app.ts'), type: ChangeType.CREATE },
        { ...makeCodeChange('src/app.ts'), type: ChangeType.DELETE },
      ];

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          overlayProposals={proposals}
        />
      );

      const badges = document.querySelectorAll('[data-overlay-badge]');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('3 proposals');
    });
  });

  describe('Graph Stats', () => {
    it('should display node and proposal counts', () => {
      const proposals = [makeCodeChange('src/app.ts')];

      render(
        <GraphExplorer
          graph={basicGraph}
          activeTask={basicTask}
          overlayProposals={proposals}
        />
      );

      const stats = document.querySelector('[data-graph-stats]');
      expect(stats).toBeInTheDocument();
      expect(stats!.textContent).toContain('nodes');
      expect(stats!.textContent).toContain('with proposals');
    });
  });
});
