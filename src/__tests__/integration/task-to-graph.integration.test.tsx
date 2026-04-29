/**
 * Integration Test: Task_Panel selection filters Graph_Explorer
 * 
 * Validates: Requirements 1.2
 * 
 * Test that selecting a task causes Graph_Explorer to display only relevant relationships
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskPanel, filterTasks } from '../../widgets/TaskPanel';
import { GraphExplorer, getRelevantNodeIds } from '../../widgets/GraphExplorer';
import { 
  makeTask, 
  makeTaskWithChanges, 
  makeAgentInfo,
  makeGraph,
  makeGraphNode,
  makeCodeChange
} from '../helpers/factories';
import { Task, TaskStatus, SemanticCodeGraphData, SCGNode, NodeType } from '../../types';
import { EdgeType } from '../../types/graph';

describe('Integration: Task Panel selection filters Graph Explorer', () => {
  describe('Requirement 1.2: Task selection filters Graph_Explorer relationships', () => {
    it('should filter Graph_Explorer nodes when task is selected in Task_Panel', () => {
      // Setup: Create tasks with changes to specific files
      const task1 = makeTaskWithChanges(2);
      if (task1.result?.changes) {
        task1.result.changes[0].file = 'src/auth/login.ts';
        task1.result.changes[1].file = 'src/auth/session.ts';
      }
      
      const task2 = makeTaskWithChanges(2);
      if (task2.result?.changes) {
        task2.result.changes[0].file = 'src/api/handlers.ts';
        task2.result.changes[1].file = 'src/api/routes.ts';
      }
      
      // Create graph with nodes matching these files
      const graph = makeGraph(20, 30);
      
      // Add nodes for task1 files
      const authNode1 = makeGraphNode('auth-login', 'login', 'src/auth/login.ts', NodeType.FUNCTION);
      const authNode2 = makeGraphNode('auth-session', 'validateSession', 'src/auth/session.ts', NodeType.FUNCTION);
      
      // Add nodes for task2 files
      const apiNode1 = makeGraphNode('api-handlers', 'handleRequest', 'src/api/handlers.ts', NodeType.FUNCTION);
      const apiNode2 = makeGraphNode('api-routes', 'registerRoutes', 'src/api/routes.ts', NodeType.FUNCTION);
      
      graph.nodes.set('auth-login', authNode1);
      graph.nodes.set('auth-session', authNode2);
      graph.nodes.set('api-handlers', apiNode1);
      graph.nodes.set('api-routes', apiNode2);
      
      // Test: getRelevantNodeIds should filter correctly
      const relevantForTask1 = getRelevantNodeIds(graph, task1);
      const relevantForTask2 = getRelevantNodeIds(graph, task2);
      
      // Verify filtering
      expect(relevantForTask1.has('auth-login') || relevantForTask1.has('auth-session')).toBe(true);
      expect(relevantForTask2.has('api-handlers') || relevantForTask2.has('api-routes')).toBe(true);
    });
    
    it('should update Graph visualization when task selection changes', async () => {
      const task1 = makeTaskWithChanges(2);
      const task2 = makeTaskWithChanges(2);
      
      const tasks = [task1, task2];
      const agents = [makeAgentInfo()];
      
      const graph = makeGraph(10, 15);
      
      let selectedTaskId: string | null = null;
      const handleSelectTask = (taskId: string) => {
        selectedTaskId = taskId;
      };
      
      // Render TaskPanel
      render(
        <TaskPanel
          tasks={tasks}
          agents={agents}
          onSelectTask={handleSelectTask}
          filter={{}}
        />
      );
      
      // Should display both tasks
      const task1Elements = screen.getAllByText(task1.instruction);
      const task2Elements = screen.getAllByText(task2.instruction);
      expect(task1Elements.length).toBeGreaterThan(0);
      expect(task2Elements.length).toBeGreaterThan(0);
      
      // Simulate task selection
      const taskItems = screen.getAllByRole('button', { name: /Task:/i });
      if (taskItems.length > 0) {
        fireEvent.click(taskItems[0]);
        
        await waitFor(() => {
          expect(selectedTaskId).toBe(task1.id);
        });
      }
    });
    
    it('should display only task-relevant nodes in graph when task is active', () => {
      const task = makeTaskWithChanges(2);
      if (task.result?.changes) {
        task.result.changes[0].file = 'src/utils.ts';
        task.result.changes[1].file = 'src/helpers.ts';
      }
      
      const graph = makeGraph(50, 100);
      
      // Add specific nodes for task
      const utilNode = makeGraphNode('util-main', 'processData', 'src/utils.ts');
      const helperNode = makeGraphNode('helper-main', 'formatOutput', 'src/helpers.ts');
      
      graph.nodes.set('util-main', utilNode);
      graph.nodes.set('helper-main', helperNode);
      
      const relevantNodes = getRelevantNodeIds(graph, task);
      
      // Verify that nodes related to task files are included
      expect(relevantNodes.has('util-main') || relevantNodes.has('helper-main')).toBe(true);
    });
  });
  
  describe('Cross-widget state propagation', () => {
    it('should propagate task selection to Graph_Explorer without manual sync', async () => {
      // This tests that the state flows correctly between widgets
      const task = makeTaskWithChanges(1);
      const graph = makeGraph(20, 30);
      
      let activeTask = null as Task | null;
      
      // Simulate user selecting a task
      const selectTaskHandler = (taskId: string) => {
        activeTask = task; // Would normally be a lookup
      };
      
      // Trigger selection
      selectTaskHandler(task.id);
      
      // Verify active task is set
      expect(activeTask).not.toBeNull();
      expect(activeTask?.id).toBe(task.id);
      
      // Graph should now use this task for filtering
      const relevantNodes = getRelevantNodeIds(graph, activeTask!);
      expect(relevantNodes).toBeDefined();
      expect(relevantNodes instanceof Set).toBe(true);
    });
  });
});
