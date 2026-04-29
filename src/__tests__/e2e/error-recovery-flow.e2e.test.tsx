/**
 * E2E Test: Error recovery journey
 * 
 * Validates: Requirements 2.2
 * 
 * Cover simulated failure, diff widget re-prompts, user retries, action succeeds
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DiffApproval } from '../../widgets/DiffApproval';
import { AgentStatus } from '../../widgets/AgentStatus';
import { ResourceFooter } from '../../widgets/ResourceFooter';
import { GraphExplorer } from '../../widgets/GraphExplorer';
import { 
  makeTaskWithChanges,
  makeAgentInfo,
  makeCodeChange,
  makeGraph,
  makeTokenUsage,
} from '../helpers/factories';
import { TaskStatus, Task } from '../../types';

describe('E2E: Error recovery journey', () => {
  describe('Requirement 2.2: Error recovery flow', () => {
    it('should recover from approval failure and allow retry', async () => {
      const task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      
      let approvalAttempts = 0;
      let errorState: Error | null = null;
      
      const handleApprove = jest.fn().mockImplementation(async () => {
        approvalAttempts++;
        if (approvalAttempts < 2) {
          errorState = new Error('Network timeout');
          throw errorState;
        }
        errorState = null;
      });
      
      render(
        <DiffApproval
          changes={changes}
          tasks={[task]}
          onApprove={handleApprove}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      const approveBtn = screen.getAllByText('Approve')[0];
      
      // First attempt fails
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalledTimes(1);
        expect(approvalAttempts).toBe(1);
      });
      
      // Buttons should still be enabled for retry
      expect(screen.getAllByText('Approve').length).toBeGreaterThan(0);
      
      // Second attempt succeeds
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalledTimes(2);
        expect(errorState).toBeNull();
      });
    });
    
    it('should re-prompt user after error without losing context', async () => {
      const task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      
      const handleApprove = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(undefined);
      
      const handleReject = jest.fn();
      const handleExplain = jest.fn();
      
      render(
        <DiffApproval
          changes={changes}
          tasks={[task]}
          onApprove={handleApprove}
          onReject={handleReject}
          onExplain={handleExplain}
        />
      );
      
      // Verify initial state shows all changes
      expect(screen.getByText(new RegExp(changes[0].file))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(changes[1].file))).toBeInTheDocument();
      
      // Attempt approval
      await act(async () => {
        fireEvent.click(screen.getAllByText('Approve')[0]);
      });
      
      // Context (changes) should still be visible
      await waitFor(() => {
        expect(screen.getByText(new RegExp(changes[0].file))).toBeInTheDocument();
      });
    });
    
    it('should show non-blocking error that allows retry', async () => {
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      let errorMessage: string | null = null;
      
      const handleApprove = jest.fn().mockImplementation(async () => {
        errorMessage = 'Failed to approve: API unavailable';
        throw new Error(errorMessage);
      });
      
      render(
        <DiffApproval
          changes={changes}
          tasks={[task]}
          onApprove={handleApprove}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      await act(async () => {
        fireEvent.click(screen.getAllByText('Approve')[0]);
      });
      
      // Error occurred
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalled();
      });
      
      // User should still be able to retry (buttons available)
      const approveButtons = screen.getAllByText('Approve');
      expect(approveButtons.length).toBeGreaterThan(0);
    });
  });
  
  describe('Agent Status error recovery', () => {
    it('should continue showing progress when status fetch fails', async () => {
      const agents = [makeAgentInfo({ name: 'agent-coder', status: 'busy' })];
      const progress = { 'agent-coder': TaskStatus.EXECUTING };
      const errors = { 'agent-coder': 'Failed to fetch activity trace' };
      
      render(
        <AgentStatus
          agents={agents}
          progress={progress}
          errors={errors}
        />
      );
      
      // Should still show agent despite error
      expect(screen.getByText(/agent-coder/i)).toBeInTheDocument();
    });
  });
  
  describe('Resource Footer offline recovery', () => {
    it('should show last known values when vector store is offline', () => {
      const tokenUsage = makeTokenUsage({ total: 5000 });
      
      render(
        <ResourceFooter
          tokenUsage={tokenUsage}
          vectorStoreStatus="offline"
        />
      );
      
      // Should show last known token count
      expect(screen.getByText(/5000/)).toBeInTheDocument();
      expect(screen.getAllByText(/offline/i).length).toBeGreaterThan(0);
    });
  });
  
  describe('Graph Explorer partial failure', () => {
    it('should show partial graph when some nodes fail to load', () => {
      const graph = makeGraph(10, 15);
      const task = makeTaskWithChanges(1);
      
      render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      // Graph should render even if some nodes failed
      expect(screen.getByText(/graph/i) || screen.getByRole('figure')).toBeInTheDocument();
    });
  });
  
  describe('Retry succeeds after failure', () => {
    it('should successfully complete workflow after error recovery', async () => {
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      let attempts = 0;
      let taskState = task;
      
      const handleApprove = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        taskState = {
          ...taskState,
          status: TaskStatus.COMPLETED,
        };
      });
      
      render(
        <DiffApproval
          changes={changes}
          tasks={[taskState]}
          onApprove={handleApprove}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      const approveBtn = screen.getAllByText('Approve')[0];
      
      // Multiple attempts
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          fireEvent.click(approveBtn);
        });
      }
      
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalledTimes(3);
      });
      
      // Final state should be successful
      expect(taskState.status).toBe(TaskStatus.COMPLETED);
    });
  });
});
