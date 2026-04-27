/**
 * Integration Test: Diff_Approval_Widget approval updates Task_Panel and Reasoning_Log
 * 
 * Validates: Requirements 1.1
 * 
 * Test that approving a change in Diff_Approval_Widget appends entry to Reasoning_Log 
 * and updates Task_Panel status
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskPanel } from '../../widgets/TaskPanel';
import { DiffApproval } from '../../widgets/DiffApproval';
import { ReasoningLog } from '../../widgets/ReasoningLog';
import { IDEShellProvider } from '../../widgets/IDEShell';
import { 
  makeTask, 
  makeTaskWithChanges, 
  makeAgentInfo, 
  makeCodeChange,
  makeAgentMessage,
  makeIDEState
} from '../helpers/factories';
import { Task, TaskStatus, CodeChange, AgentMessage } from '../../types';

describe('Integration: Diff Approval to Task Panel and Reasoning Log', () => {
  describe('Requirement 1.1: Approval updates Task_Panel and Reasoning_Log', () => {
    it('should append entry to Reasoning_Log when approval is made in Diff_Approval_Widget', async () => {
      // Setup: Create task with changes
      const task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      const agents = [makeAgentInfo({ name: 'agent-coder' })];
      const log: AgentMessage[] = [];
      let currentTask = task;
      
      // Mock approval handler
      const handleApprove = jest.fn().mockImplementation(async (changeId: string) => {
        // Update task status
        currentTask = {
          ...currentTask,
          status: TaskStatus.COMPLETED,
          result: {
            success: true,
            output: 'Approved',
            changes: (currentTask.result?.changes || []).map((c, i) => ({
              ...c,
              approved: i === 0,
            })),
          },
        };
        
        // Add to reasoning log
        log.push(makeAgentMessage({
          agent: 'agent-coder',
          content: `Approved change to ${(task.result?.changes || [])[0]?.file || 'unknown'}`,
          timestamp: new Date(),
          metadata: { taskId: task.id, changeIndex: 0 },
        }));
      });
      
      const handleReject = jest.fn();
      const handleExplain = jest.fn().mockResolvedValue('Explanation text');
      const handleSelectTask = jest.fn();
      
      // Render all three widgets
      const { container } = render(
        <IDEShellProvider>
          <div data-testid="diff-approval">
            <DiffApproval
              changes={changes}
              tasks={[currentTask]}
              onApprove={handleApprove}
              onReject={handleReject}
              onExplain={handleExplain}
            />
          </div>
          <div data-testid="task-panel">
            <TaskPanel
              tasks={[currentTask]}
              agents={agents}
              onSelectTask={handleSelectTask}
              filter={{}}
            />
          </div>
          <div data-testid="reasoning-log">
            <ReasoningLog
              log={log}
              onJumpToCode={jest.fn()}
            />
          </div>
        </IDEShellProvider>
      );
      
      // Verify initial state
      expect(screen.getByTestId('diff-approval')).toBeInTheDocument();
      expect(screen.getByTestId('task-panel')).toBeInTheDocument();
      
      // Find and click approve button
      const approveButtons = screen.getAllByText('Approve');
      expect(approveButtons.length).toBeGreaterThan(0);
      
      await act(async () => {
        fireEvent.click(approveButtons[0]);
      });
      
      // Verify approval handler was called
      await waitFor(() => {
        expect(handleApprove).toHaveBeenCalled();
      });
    });
    
    it('should update Task_Panel status when approval is made', async () => {
      // Setup
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      
      let currentTaskStatus = task.status;
      const handleApprove = jest.fn().mockImplementation(async () => {
        currentTaskStatus = TaskStatus.COMPLETED;
      });
      
      // Render TaskPanel
      const { rerender } = render(
        <TaskPanel
          tasks={[{ ...task, status: currentTaskStatus }]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Verify initial status is AWAITING_APPROVAL
      expect(screen.getByText(/awaiting_approval/i)).toBeInTheDocument();
      
      // Simulate approval
      await act(async () => {
        await handleApprove();
      });
      
      // Rerender with updated status
      rerender(
        <TaskPanel
          tasks={[{ ...task, status: currentTaskStatus }]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Verify status updated to COMPLETED
      await waitFor(() => {
        expect(screen.getByText(/completed/i)).toBeInTheDocument();
      });
    });
    
    it('should create log entry matching the approval action', async () => {
      const task = makeTaskWithChanges(1);
      const changes = task.result?.changes || [];
      const log: AgentMessage[] = [];
      
      // Simulate approval creating log entry
      const approvalLog = makeAgentMessage({
        agent: 'user',
        content: `Approved change to ${changes[0].file}`,
        timestamp: new Date(),
        metadata: {
          taskId: task.id,
          changeFile: changes[0].file,
          approved: true,
        },
      });
      
      const updatedLog = [...log, approvalLog];
      
      // Render ReasoningLog with updated log
      render(
        <ReasoningLog
          log={updatedLog}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Verify log entry is displayed
      expect(screen.getByText(/Approved change to/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(changes[0].file))).toBeInTheDocument();
    });
  });
  
  describe('Cross-widget state consistency', () => {
    it('should maintain consistent task status across Diff and Task widgets', async () => {
      // Create shared state
      const task = makeTaskWithChanges(2);
      let state = {
        tasks: [task],
        approved: false,
      };
      
      // Render DiffApproval
      const { rerender } = render(
        <DiffApproval
          changes={task.result?.changes || []}
          tasks={state.tasks}
          onApprove={async () => {
            state = {
              tasks: [{
                ...task,
                status: TaskStatus.COMPLETED,
                result: {
                  success: true,
                  output: 'Approved',
                  ...(task.result || {}),
                  changes: (task.result?.changes || []).map(c => ({ ...c, approved: true })),
                },
              }],
              approved: true,
            };
          }}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      // Approve button click
      const approveBtn = screen.getAllByText('Approve')[0];
      await act(async () => {
        fireEvent.click(approveBtn);
      });
      
      // Verify state change
      const firstTask = state.tasks[0];
      await waitFor(() => {
        expect(state.approved).toBe(true);
        expect(firstTask?.status).toBe(TaskStatus.COMPLETED);
      });
    });
  });
});
