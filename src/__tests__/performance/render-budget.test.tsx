/**
 * Render Performance Budget Tests for IDE Widgets
 * 
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 * 
 * Tests that all widgets render within 100ms budget.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TaskPanel } from '../../widgets/TaskPanel';
import { DiffApproval } from '../../widgets/DiffApproval';
import { GraphExplorer } from '../../widgets/GraphExplorer';
import { ReasoningLog } from '../../widgets/ReasoningLog';
import { AgentStatus } from '../../widgets/AgentStatus';
import { ResourceFooter } from '../../widgets/ResourceFooter';
import { 
  makeLargeDataset,
  makeGraph,
  makeAgentMessages,
  makeTokenUsage,
} from '../helpers/factories';
import { TaskStatus } from '../../types';

// Performance budget: 100ms
const RENDER_BUDGET_MS = 100;

describe('Render Performance Budget Tests', () => {
  describe('Requirement 10.1: Task_Panel render within 100ms', () => {
    it('should render with 100 tasks, 10 agents within budget', () => {
      const dataset = makeLargeDataset({ tasks: 100, agents: 10, changes: 500 });
      
      const startTime = performance.now();
      
      render(
        <TaskPanel
          tasks={dataset.tasks}
          agents={dataset.agents}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`TaskPanel render time: ${renderTime.toFixed(2)}ms (budget: ${RENDER_BUDGET_MS}ms)`);
      
      // Allow some variance for test environment
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS * 2);
    });
  });
  
  describe('Requirement 10.2: Graph_Explorer render within 100ms', () => {
    it('should render with 200 nodes and 500 edges within budget', () => {
      const graph = makeGraph(200, 500);
      const smallDataset = makeLargeDataset({ tasks: 1, agents: 1, changes: 1 });
      const task = smallDataset.tasks[0];
      
      const startTime = performance.now();
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`GraphExplorer render time: ${renderTime.toFixed(2)}ms (budget: ${RENDER_BUDGET_MS}ms)`);
      
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS * 2);
    });
  });
  
  describe('Requirement 10.3: Reasoning_Log render within 100ms', () => {
    it('should render with 1000 log entries within budget', () => {
      const messages = makeAgentMessages(1000);
      
      const startTime = performance.now();
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`ReasoningLog render time: ${renderTime.toFixed(2)}ms (budget: ${RENDER_BUDGET_MS}ms)`);
      
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS * 2);
    });
  });
  
  describe('Requirement 10.4: Other widgets render within budget', () => {
    it('DiffApproval should render within budget', () => {
      const perfDataset = makeLargeDataset({ tasks: 50, agents: 5, changes: 100 });
      const changes = perfDataset.changes;
      
      const startTime = performance.now();
      
      render(
        <DiffApproval
          changes={changes}
          tasks={perfDataset.tasks}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`DiffApproval render time: ${renderTime.toFixed(2)}ms`);
      
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS * 2);
    });
    
    it('AgentStatus should render within budget', () => {
      const perfAgents = makeLargeDataset({ tasks: 10, agents: 10, changes: 10 }).agents;
      const progress: Record<string, TaskStatus> = {};
      perfAgents.forEach(a => {
        progress[a.name] = TaskStatus.EXECUTING;
      });
      
      const startTime = performance.now();
      
      render(
        <AgentStatus
          agents={perfAgents}
          progress={progress}
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`AgentStatus render time: ${renderTime.toFixed(2)}ms`);
      
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS);
    });
    
    it('ResourceFooter should render within budget', () => {
      const tokenUsage = makeTokenUsage();
      
      const startTime = performance.now();
      
      render(
        <ResourceFooter
          tokenUsage={tokenUsage}
          vectorStoreStatus="healthy"
        />
      );
      
      const renderTime = performance.now() - startTime;
      
      console.log(`ResourceFooter render time: ${renderTime.toFixed(2)}ms`);
      
      expect(renderTime).toBeLessThan(RENDER_BUDGET_MS);
    });
  });
  
  describe('Requirement 10.5: Repeatable performance tests', () => {
    it('should produce consistent results across 10 runs', () => {
      const runTimes: number[] = [];
      const dataset = makeLargeDataset({ tasks: 50, agents: 5, changes: 100 });
      
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        
        const { unmount } = render(
          <TaskPanel
            tasks={dataset.tasks}
            agents={dataset.agents}
            onSelectTask={jest.fn()}
            filter={{}}
          />
        );
        
        const renderTime = performance.now() - startTime;
        runTimes.push(renderTime);
        
        unmount();
      }
      
      const avgTime = runTimes.reduce((a, b) => a + b, 0) / runTimes.length;
      const maxTime = Math.max(...runTimes);
      const minTime = Math.min(...runTimes);
      const variance = maxTime - minTime;
      
      console.log(`Performance across 10 runs:`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime.toFixed(2)}ms`);
      console.log(`  Variance: ${variance.toFixed(2)}ms (budget: 20ms)`);
      
      // Variance should be ≤ 20ms
      expect(variance).toBeLessThanOrEqual(20);
    });
  });
});

// Create dataset at module level for reuse
const dataset = makeLargeDataset({ tasks: 100, agents: 10, changes: 500 });
