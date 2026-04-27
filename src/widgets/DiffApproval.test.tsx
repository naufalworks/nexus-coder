import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DiffApproval, groupChangesByTask, parseDiffToColumns, calculateImpactSummary } from './DiffApproval';
import { CodeChange, Task, ChangeType, TaskStatus } from '../types';

/**
 * Unit Tests for DiffApproval Widget
 * 
 * **Validates: Requirements 2.3, 2.5**
 */

describe('DiffApproval Component', () => {
  const mockChanges: CodeChange[] = [
    {
      file: 'src/app.ts',
      type: ChangeType.MODIFY,
      reasoning: 'Update main logic',
      impact: ['Performance improvement'],
      risk: 'low',
      diff: '- old line\n+ new line',
      content: 'new content',
      approved: false,
    },
    {
      file: 'src/utils.ts',
      type: ChangeType.CREATE,
      reasoning: 'Add utility function',
      impact: ['New functionality'],
      risk: 'medium',
      diff: '+ new function',
      content: 'function code',
      approved: false,
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      instruction: 'Implement feature A',
      subTasks: [],
      status: TaskStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: {
        success: true,
        output: 'Done',
        changes: [mockChanges[0]],
      },
    },
    {
      id: 'task-2',
      instruction: 'Add utilities',
      subTasks: [],
      status: TaskStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: {
        success: true,
        output: 'Done',
        changes: [mockChanges[1]],
      },
    },
  ];

  describe('Approval Workflow', () => {
    it('should call onApprove when Approve button is clicked', async () => {
      const onApprove = jest.fn().mockResolvedValue(undefined);
      const onReject = jest.fn();
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const approveButtons = screen.getAllByText('Approve');
      fireEvent.click(approveButtons[0]);

      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledWith('src/app.ts-0');
      });
    });

    it('should call onReject when Reject button is clicked', async () => {
      const onApprove = jest.fn();
      const onReject = jest.fn().mockResolvedValue(undefined);
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const rejectButtons = screen.getAllByText('Reject');
      fireEvent.click(rejectButtons[0]);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledWith('src/app.ts-0');
      });
    });

    it('should call onExplain when Explain button is clicked', async () => {
      const onApprove = jest.fn();
      const onReject = jest.fn();
      const onExplain = jest.fn().mockResolvedValue('This change improves performance');

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const explainButtons = screen.getAllByText('Explain');
      fireEvent.click(explainButtons[0]);

      await waitFor(() => {
        expect(onExplain).toHaveBeenCalledWith('src/app.ts-0');
      });

      await waitFor(() => {
        expect(screen.getByText('This change improves performance')).toBeInTheDocument();
      });
    });

    it('should disable buttons while processing', async () => {
      let resolveApprove: () => void;
      const approvePromise = new Promise<void>(resolve => {
        resolveApprove = resolve;
      });
      
      const onApprove = jest.fn().mockReturnValue(approvePromise);
      const onReject = jest.fn();
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const approveButtons = screen.getAllByText('Approve');
      fireEvent.click(approveButtons[0]);

      // Check that the approve button shows Processing... and is disabled
      await waitFor(() => {
        const processingButtons = screen.getAllByText('Processing...');
        // The first Processing... button should be the approve button (disabled)
        expect(processingButtons.length).toBeGreaterThan(0);
        expect(processingButtons[0]).toBeDisabled();
      });

      // Resolve the promise to clean up
      resolveApprove!();
    });

    it('should display error when approval fails', async () => {
      const onApprove = jest.fn().mockRejectedValue(new Error('Network error'));
      const onReject = jest.fn();
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const approveButtons = screen.getAllByText('Approve');
      fireEvent.click(approveButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Failed to approve change: Network error/)).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should display error when rejection fails', async () => {
      const onApprove = jest.fn();
      const onReject = jest.fn().mockRejectedValue(new Error('Server error'));
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const rejectButtons = screen.getAllByText('Reject');
      fireEvent.click(rejectButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Failed to reject change: Server error/)).toBeInTheDocument();
      });
    });

    it('should allow dismissing error messages', async () => {
      const onApprove = jest.fn().mockRejectedValue(new Error('Test error'));
      const onReject = jest.fn();
      const onExplain = jest.fn();

      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={onApprove}
          onReject={onReject}
          onExplain={onExplain}
        />
      );

      const approveButtons = screen.getAllByText('Approve');
      fireEvent.click(approveButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Failed to approve change/)).toBeInTheDocument();
      });

      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/Failed to approve change/)).not.toBeInTheDocument();
      });
    });

    it('should show approved state for already approved changes', () => {
      const approvedChanges: CodeChange[] = [
        { ...mockChanges[0], approved: true },
      ];

      render(
        <DiffApproval
          changes={approvedChanges}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );

      expect(screen.getByText('Approved')).toBeInTheDocument();
      const approvedButton = screen.getByText('Approved');
      expect(approvedButton).toBeDisabled();
    });
  });

  describe('Grouping and Display', () => {
    it('should group changes by task', () => {
      render(
        <DiffApproval
          changes={mockChanges}
          tasks={mockTasks}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );

      expect(screen.getByText('Implement feature A')).toBeInTheDocument();
      expect(screen.getByText('Add utilities')).toBeInTheDocument();
    });

    it('should display impact summary for each group', () => {
      render(
        <DiffApproval
          changes={mockChanges}
          tasks={mockTasks}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );

      expect(screen.getByText(/1 file\(s\), 1 change\(s\), risk: low/)).toBeInTheDocument();
      expect(screen.getByText(/1 file\(s\), 1 change\(s\), risk: medium/)).toBeInTheDocument();
    });

    it('should display two-column diff view', () => {
      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );

      expect(screen.getAllByText('Before').length).toBeGreaterThan(0);
      expect(screen.getAllByText('After').length).toBeGreaterThan(0);
    });

    it('should display change metadata', () => {
      render(
        <DiffApproval
          changes={mockChanges}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );

      expect(screen.getByText('src/app.ts')).toBeInTheDocument();
      expect(screen.getByText('Update main logic')).toBeInTheDocument();
      expect(screen.getByText(/Performance improvement/)).toBeInTheDocument();
    });
  });
});

describe('groupChangesByTask', () => {
  it('should group changes by task when tasks are provided', () => {
    const changes: CodeChange[] = [
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
      {
        file: 'file2.ts',
        type: ChangeType.CREATE,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
    ];

    const tasks: Task[] = [
      {
        id: 'task-1',
        instruction: 'Task 1',
        subTasks: [],
        status: TaskStatus.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
        result: {
          success: true,
          output: '',
          changes: [changes[0]],
        },
      },
    ];

    const grouped = groupChangesByTask(changes, tasks);

    expect(grouped.length).toBeGreaterThan(0);
    expect(grouped.some(g => g.taskId === 'task-1')).toBe(true);
  });

  it('should fallback to file-based grouping when no tasks provided', () => {
    const changes: CodeChange[] = [
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test2',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
    ];

    const grouped = groupChangesByTask(changes, undefined);

    expect(grouped.length).toBe(1);
    expect(grouped[0].changes.length).toBe(2);
  });
});

describe('parseDiffToColumns', () => {
  it('should parse additions correctly', () => {
    const diff = '+ new line';
    const { oldLines, newLines } = parseDiffToColumns(diff);

    expect(oldLines).toEqual(['']);
    expect(newLines).toEqual([' new line']);
  });

  it('should parse deletions correctly', () => {
    const diff = '- old line';
    const { oldLines, newLines } = parseDiffToColumns(diff);

    expect(oldLines).toEqual([' old line']);
    expect(newLines).toEqual(['']);
  });

  it('should parse unchanged lines correctly', () => {
    const diff = ' unchanged line';
    const { oldLines, newLines } = parseDiffToColumns(diff);

    expect(oldLines).toEqual([' unchanged line']);
    expect(newLines).toEqual([' unchanged line']);
  });

  it('should handle complex diffs', () => {
    const diff = '- old line 1\n+ new line 1\n unchanged line\n- old line 2\n+ new line 2';
    const { oldLines, newLines } = parseDiffToColumns(diff);

    expect(oldLines.length).toBe(newLines.length);
    expect(oldLines.length).toBe(5);
  });
});

describe('calculateImpactSummary', () => {
  it('should calculate correct file count', () => {
    const changes: CodeChange[] = [
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
      {
        file: 'file2.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
    ];

    const summary = calculateImpactSummary(changes);
    expect(summary).toContain('2 file(s)');
  });

  it('should identify highest risk level', () => {
    const changes: CodeChange[] = [
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
      {
        file: 'file2.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'high',
        diff: '',
        content: '',
        approved: false,
      },
    ];

    const summary = calculateImpactSummary(changes);
    expect(summary).toContain('risk: high');
  });

  it('should count changes correctly', () => {
    const changes: CodeChange[] = [
      {
        file: 'file1.ts',
        type: ChangeType.MODIFY,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
      {
        file: 'file1.ts',
        type: ChangeType.CREATE,
        reasoning: 'test',
        impact: [],
        risk: 'low',
        diff: '',
        content: '',
        approved: false,
      },
    ];

    const summary = calculateImpactSummary(changes);
    expect(summary).toContain('2 change(s)');
  });
});
