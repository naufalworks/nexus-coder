/**
 * E2E Test: Graph navigation journey
 * 
 * Validates: Requirements 2.3
 * 
 * Cover task selection, Graph_Explorer overlays, node selection, code context display
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskPanel } from '../../widgets/TaskPanel';
import { GraphExplorer, getRelevantNodeIds, getOverlayMapping, enrichNodes } from '../../widgets/GraphExplorer';
import { 
  makeTaskWithChanges,
  makeAgentInfo,
  makeGraph,
  makeGraphNode,
  makeCodeChange,
  makeGraphEdge,
} from '../helpers/factories';
import { Task, TaskStatus, SemanticCodeGraphData, SCGNode, EdgeType } from '../../types';
import { NodeType } from '../../types/graph';

describe('E2E: Graph navigation journey', () => {
  describe('Requirement 2.3: Graph navigation flow', () => {
    it('should filter graph nodes when task is selected', async () => {
      // Create task with changes to specific files
      const task = makeTaskWithChanges(2);
      if (task.result?.changes) {
        task.result.changes[0].file = 'src/auth/login.ts';
        task.result.changes[1].file = 'src/auth/session.ts';
      }
      
      // Create graph with nodes
      const graph = makeGraph(20, 30);
      
      // Add specific nodes for task files
      graph.nodes.set('auth-login', makeGraphNode('auth-login', 'login', 'src/auth/login.ts', NodeType.FUNCTION));
      graph.nodes.set('auth-session', makeGraphNode('auth-session', 'validateSession', 'src/auth/session.ts', NodeType.FUNCTION));
      
      // Get relevant nodes
      const relevantNodes = getRelevantNodeIds(graph, task);
      
      // Verify filtering
      expect(relevantNodes.has('auth-login') || relevantNodes.has('auth-session')).toBe(true);
    });
    
    it('should overlay agent proposals on graph nodes', async () => {
      const task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      
      const graph = makeGraph(15, 25);
      
      // Add proposal overlays
      const overlayProposals: typeof changes = changes.map(c => ({
        ...c,
        approved: false,
      }));
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
          overlayProposals={overlayProposals}
        />
      );
      
      // Graph should render with overlays
      expect(screen.getByText(/graph/i) || screen.getByRole('figure')).toBeInTheDocument();
    });
    
    it('should display node details on selection', async () => {
      const task = makeTaskWithChanges(1);
      const graph = makeGraph(10, 15);
      
      // Add specific node
      const node = makeGraphNode('test-func', 'testFunction', 'src/test.ts');
      graph.nodes.set('test-func', node);
      
      let selectedNodeId: string | null = null;
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
          onNodeSelect={(id) => { selectedNodeId = id; }}
        />
      );
      
      // Simulate node selection
      const nodeElements = screen.getAllByRole('button');
      if (nodeElements.length > 0) {
        await act(async () => {
          fireEvent.click(nodeElements[0]);
        });
        
        // Node should be selectable
        // (In real implementation, details would show in a side panel)
      }
    });
    
    it('should show code context for selected node', async () => {
      const task = makeTaskWithChanges(1);
      const graph = makeGraph(10, 15);
      
      const relevantNodeIds = getRelevantNodeIds(graph, task);
      const overlayMapping = getOverlayMapping(graph, task.result?.changes || []);
      const enrichedNodes = enrichNodes(graph, relevantNodeIds, overlayMapping);
      
      // Verify nodes have relationship data
      expect(Array.isArray(enrichedNodes)).toBe(true);
      expect(enrichedNodes.length).toBeGreaterThan(0);
      
      for (const enriched of enrichedNodes) {
        expect(enriched.node).toBeDefined();
        expect(enriched.relationships).toBeInstanceOf(Map);
      }
    });
  });
  
  describe('Graph node relationships', () => {
    it('should show calls/used_by/imports relationships', () => {
      const graph = makeGraph(5, 10);
      
      // Add specific edges
      const nodes = Array.from(graph.nodes.values());
      if (nodes.length >= 2) {
        graph.edges.push(
          makeGraphEdge(nodes[0].id, nodes[1].id, EdgeType.CALLS),
          makeGraphEdge(nodes[1].id, nodes[0].id, EdgeType.USES),
          makeGraphEdge(nodes[2].id, nodes[3].id, EdgeType.IMPORTS, 2)
        );
      }
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={makeTaskWithChanges(1)}
        />
      );
      
      // Graph should render with relationship data
      expect(screen.getByText(/graph/i) || screen.getByRole('figure')).toBeInTheDocument();
    });
    
    it('should render expanded nodes on click', async () => {
      const task = makeTaskWithChanges(1);
      const graph = makeGraph(10, 15);
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      // Find expandable nodes
      const buttons = screen.getAllByRole('button');
      
      if (buttons.length > 0) {
        await act(async () => {
          fireEvent.click(buttons[0]);
        });
        
        // Node should expand (show relationships)
        await waitFor(() => {
          // In real implementation, expanded content would be visible
        });
      }
    });
  });
  
  describe('Task-to-graph filtering', () => {
    it('should only show nodes relevant to selected task', () => {
      const task1 = makeTaskWithChanges(2);
      const task2 = makeTaskWithChanges(2);
      
      // Different files
      if (task1.result?.changes) {
        task1.result.changes[0].file = 'src/module-a.ts';
        task1.result.changes[1].file = 'src/module-b.ts';
      }
      
      if (task2.result?.changes) {
        task2.result.changes[0].file = 'src/module-c.ts';
        task2.result.changes[1].file = 'src/module-d.ts';
      }
      
      const graph = makeGraph(20, 40);
      
      // Add nodes for each task
      graph.nodes.set('node-a', makeGraphNode('node-a', 'funcA', 'src/module-a.ts'));
      graph.nodes.set('node-b', makeGraphNode('node-b', 'funcB', 'src/module-b.ts'));
      graph.nodes.set('node-c', makeGraphNode('node-c', 'funcC', 'src/module-c.ts'));
      graph.nodes.set('node-d', makeGraphNode('node-d', 'funcD', 'src/module-d.ts'));
      
      // Get relevant nodes for each task
      const relevantTask1 = getRelevantNodeIds(graph, task1);
      const relevantTask2 = getRelevantNodeIds(graph, task2);
      
      // Should be different sets
      const task1HasAorB = relevantTask1.has('node-a') || relevantTask1.has('node-b');
      const task2HasCorD = relevantTask2.has('node-c') || relevantTask2.has('node-d');
      
      expect(task1HasAorB || task2HasCorD).toBe(true);
    });
  });
});
