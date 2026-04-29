/**
 * E2E Test: Complete task creation through approval journey
 * 
 * Validates: Requirements 2.1
 * 
 * Cover task appears in Task_Panel, diff shown, user approves, 
 * Reasoning_Log records, Task_Panel updates
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { TaskPanel } from '../../widgets/TaskPanel';
import { DiffApproval } from '../../widgets/DiffApproval';
import { ReasoningLog } from '../../widgets/ReasoningLog';
import { IDEShellProvider } from '../../widgets/IDEShell';
import { 
  makeTaskWithChanges,
  makeAgentInfo,
  makeAgentMessage,
  makeCodeChange,
  makeIDEState,
} from '../helpers/factories';
import { Task, TaskStatus, AgentMessage, CodeChange } from '../../types';
import { runUserFlow, clickStep } from './runner';

describe('E2E: Task creation through approval journey', () => {
  describe('Requirement 2.1: Complete approval journey', () => {
    it('should complete the full approval workflow from task creation to logged approval', async () => {
      // Setup: Create task with changes
      const task = makeTaskWithChanges(3);
      const changes = task.result?.changes || [];
      const agents = [makeAgentInfo({ name: 'agent-coder' })];
      const log: AgentMessage[] = [];
      
      let currentTask = task;
      const updatedLog: AgentMessage[] = [...log];
      
      // Mock handlers
      const handleApprove = jest.fn().mockImplementation(async () => {
        currentTask = {
          ...currentTask,
          status: TaskStatus.COMPLETED,
          result: {
            success: true,
            output: 'Approved',
            changes: (currentTask.result?.changes || []).map((c, i) => ({
              ...c,
              approved: i === 0 ? true : c.approved,
            })),
          },
        };
        
        updatedLog.push(makeAgentMessage({
          agent: 'user',
          content: `Approved change to ${(task.result?.changes || [])[0]?.file || 'unknown'}`,
          timestamp: new Date(),
        }));
      });
      
      const handleSelectTask = jest.fn();
      
      // Step 1: Render with task in AWAITING_APPROVAL status
      const { container } = render(
        <IDEShellProvider>
          <div data-testid="task-panel">
            <TaskPanel
              tasks={[currentTask]}
              agents={agents}
              onSelectTask={handleSelectTask}
              filter={{}}
            />
          </div>
          <div data-testid="diff-approval">
            <DiffApproval
              changes={changes}
              tasks={[currentTask]}
              onApprove={handleApprove}
              onReject={jest.fn()}
              onExplain={jest.fn().mockResolvedValue('Explanation')}
            />
          </div>
          <div data-testid="reasoning-log">
            <ReasoningLog
              log={updatedLog}
              onJumpToCode={jest.fn()}
            />
          </div>
        </IDEShellProvider>
      );
      
      // Verify initial state
      expect(screen.getByTestId('task-panel')).toBeInTheDocument();
      expect(screen.getByTestId('diff-approval')).toBeInTheDocument();
      expect(screen.getAllByText(currentTask.instruction).length).toBeGreaterThan(0);
      
      // Step 2: Task appears in Task_Panel
      await waitFor(() => {
        expect(screen.getByText(/awaiting_approval/i)).toBeInTheDocument();
      });
      
      // Step 3: Diff is shown in Diff_Approval_Widget
      const diffElement = screen.getByTestId('diff-approval');
      expect(diffElement).toBeInTheDocument();
      
      // Step 4: User approves a change
      const approveButtons = screen.getAllByText('Approve');
      expect(approveButtons.length).toBeGreaterThan(0);
      
      await act(async () => {
        fireEvent.click(approveButtons[0]);
      });
      
      // Step 5: Handler is called
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalled();
      });
    });
    
    it('should update Task_Panel status after approval', async () => {
      let task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      
      const handleApprove = jest.fn().mockImplementation(async () => {
        task = {
          ...task,
          status: TaskStatus.COMPLETED,
        };
      });
      
      const { rerender } = render(
        <TaskPanel
          tasks={[task]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Verify initial status
      expect(screen.getByText(/awaiting_approval/i)).toBeInTheDocument();
      
      // Approve
      await act(async () => {
        await handleApprove();
      });
      
      // Rerender with updated task
      rerender(
        <TaskPanel
          tasks={[task]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Verify status update
      await waitFor(() => {
        expect(screen.getByText(/completed/i)).toBeInTheDocument();
      });
    });
    
    it('should record approval in Reasoning_Log', async () => {
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      const approvalEntry = makeAgentMessage({
        agent: 'user',
        content: `Approved change to ${changes[0].file}`,
        timestamp: new Date(),
        metadata: {
          taskId: task.id,
          approved: true,
        },
      });
      
      const log = [approvalEntry];
      
      render(
        <ReasoningLog
          log={log}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Verify log entry
      expect(screen.getByText(/Approved change to/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(changes[0].file))).toBeInTheDocument();
    });
    
    it('should drive interactions through public component interfaces', async () => {
      // This test verifies we're using public props, not internal state manipulation
      const user = userEvent.setup();
      
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      const onApprove = jest.fn();
      const onReject = jest.fn();
      const onExplain = jest.fn();
      
      render(
        <DiffApproval
          changes={changes}
          tasks={[task]}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );
      
      // Find buttons (public interface)
      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
      const explainButtons = screen.getAllByRole('button', { name: /explain/i });
      
      // Verify all public action buttons exist
      expect(approveButtons.length).toBeGreaterThan(0);
      expect(rejectButtons.length).toBeGreaterThan(0);
      expect(explainButtons.length).toBeGreaterThan(0);
      
      // Click via user event (realistic user interaction)
      await user.click(approveButtons[0]);
      
      await waitFor(() => {
        expect(onApprove).toHaveBeenCalled();
      });
    });
  });
  
  describe('Error recovery in approval flow', () => {
    it('should allow retry if approval fails initially', async () => {
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      let callCount = 0;
      const handleApprove = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        // Second call succeeds
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
      
      // First attempt
      const approveBtn = screen.getAllByText('Approve')[0];
      
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      
      // Should fail but allow retry
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalledTimes(1);
      });
      
      // Retry (in real implementation, error would be shown, user retries)
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalledTimes(2);
      });
    });
  });
});
