import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  TaskPanel,
  filterTasks,
  getAssignedAgents,
  getAffectedFiles,
  applyApprovalAction,
  TaskPanelFilter,
} from './TaskPanel';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  AgentInfo,
  AgentCapability,
  CodeChange,
  ChangeType,
  SubTask,
} from '../types';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'st-1',
    instruction: 'Do something',
    assignedAgent: 'agent-a',
    requiredCapabilities: [AgentCapability.CODE_GENERATION],
    dependencies: [],
    status: TaskStatus.EXECUTING,
    ...overrides,
  };
}

function makeCodeChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    file: 'src/auth.ts',
    type: ChangeType.MODIFY,
    reasoning: 'Fix bug',
    impact: ['authentication'],
    risk: 'low',
    diff: '@@ -1 +1 @@\n-old\n+new',
    content: 'new',
    approved: false,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    instruction: 'Fix login bug',
    status: TaskStatus.EXECUTING,
    subTasks: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: 'agent-a',
    capabilities: [AgentCapability.CODE_GENERATION],
    supportedTaskTypes: [TaskType.FEATURE],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: filterTasks (Requirement 1.2)
// ---------------------------------------------------------------------------

describe('filterTasks', () => {
  /** Validates: Requirement 1.2 */

  const taskPending = makeTask({
    id: 't-pending',
    status: TaskStatus.PENDING,
    subTasks: [makeSubTask({ assignedAgent: 'agent-a' })],
  });

  const taskExecuting = makeTask({
    id: 't-executing',
    status: TaskStatus.EXECUTING,
    subTasks: [makeSubTask({ assignedAgent: 'agent-b' })],
  });

  const taskCompleted = makeTask({
    id: 't-completed',
    status: TaskStatus.COMPLETED,
    subTasks: [makeSubTask({ assignedAgent: 'agent-a' })],
  });

  const allTasks = [taskPending, taskExecuting, taskCompleted];

  it('returns all tasks when no filter is provided', () => {
    expect(filterTasks(allTasks, {})).toHaveLength(3);
  });

  it('filters by status only', () => {
    const result = filterTasks(allTasks, { status: TaskStatus.PENDING });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-pending');
  });

  it('filters by agent only', () => {
    const result = filterTasks(allTasks, { agent: 'agent-a' });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(
      expect.arrayContaining(['t-pending', 't-completed'])
    );
  });

  it('filters by both status and agent', () => {
    const result = filterTasks(allTasks, {
      status: TaskStatus.COMPLETED,
      agent: 'agent-a',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t-completed');
  });

  it('returns empty array when no tasks match both filters', () => {
    const result = filterTasks(allTasks, {
      status: TaskStatus.FAILED,
      agent: 'agent-a',
    });
    expect(result).toHaveLength(0);
  });

  it('returns empty when agent matches but status does not', () => {
    const result = filterTasks(allTasks, {
      status: TaskStatus.FAILED,
      agent: 'agent-b',
    });
    expect(result).toHaveLength(0);
  });

  it('handles tasks with no sub-tasks when filtering by agent', () => {
    const taskNoSubtasks = makeTask({
      id: 't-empty',
      status: TaskStatus.PENDING,
      subTasks: [],
    });
    const result = filterTasks([taskNoSubtasks], { agent: 'agent-a' });
    expect(result).toHaveLength(0);
  });

  it('handles empty tasks array', () => {
    expect(filterTasks([], { status: TaskStatus.PENDING })).toHaveLength(0);
    expect(filterTasks([], { agent: 'agent-a' })).toHaveLength(0);
    expect(filterTasks([], {})).toHaveLength(0);
  });

  it('filters by agent matching any sub-task with multiple agents', () => {
    const taskMultiAgent = makeTask({
      id: 't-multi',
      status: TaskStatus.EXECUTING,
      subTasks: [
        makeSubTask({ assignedAgent: 'agent-x' }),
        makeSubTask({ assignedAgent: 'agent-y' }),
      ],
    });
    // Filter by one of the agents
    expect(filterTasks([taskMultiAgent], { agent: 'agent-x' })).toHaveLength(1);
    expect(filterTasks([taskMultiAgent], { agent: 'agent-y' })).toHaveLength(1);
    // Non-matching agent
    expect(filterTasks([taskMultiAgent], { agent: 'agent-z' })).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const original = [...allTasks];
    filterTasks(allTasks, { status: TaskStatus.PENDING });
    expect(allTasks).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: getAssignedAgents
// ---------------------------------------------------------------------------

describe('getAssignedAgents', () => {
  it('returns unique agent names from sub-tasks', () => {
    const task = makeTask({
      subTasks: [
        makeSubTask({ assignedAgent: 'agent-a' }),
        makeSubTask({ assignedAgent: 'agent-b' }),
        makeSubTask({ assignedAgent: 'agent-a' }), // duplicate
      ],
    });
    const agents = getAssignedAgents(task);
    expect(agents.sort()).toEqual(['agent-a', 'agent-b']);
  });

  it('returns empty array for task with no sub-tasks', () => {
    const task = makeTask({ subTasks: [] });
    expect(getAssignedAgents(task)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: getAffectedFiles
// ---------------------------------------------------------------------------

describe('getAffectedFiles', () => {
  it('returns files from task result changes', () => {
    const task = makeTask({
      result: {
        success: true,
        output: 'done',
        changes: [
          makeCodeChange({ file: 'src/a.ts' }),
          makeCodeChange({ file: 'src/b.ts' }),
        ],
      },
    });
    expect(getAffectedFiles(task)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns empty array when task has no result', () => {
    const task = makeTask();
    expect(getAffectedFiles(task)).toEqual([]);
  });

  it('returns empty array when result has no changes', () => {
    const task = makeTask({
      result: { success: true, output: 'done' },
    });
    expect(getAffectedFiles(task)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: applyApprovalAction (Requirement 2.3, 4.1)
// ---------------------------------------------------------------------------

describe('applyApprovalAction', () => {
  it('approves a change and sets task to COMPLETED', () => {
    const task = makeTask({
      id: 'task-approve',
      status: TaskStatus.AWAITING_APPROVAL,
      result: {
        success: false,
        output: 'pending review',
        changes: [makeCodeChange({ file: 'src/auth.ts' })],
      },
    });

    const { updatedTask, logEntry } = applyApprovalAction(task, 0, true, 'user-1');

    expect(updatedTask.status).toBe(TaskStatus.COMPLETED);
    expect(updatedTask.result?.changes?.[0]?.approved).toBe(true);
    expect(updatedTask.result?.success).toBe(true);
    expect(logEntry.agent).toBe('user-1');
    expect(logEntry.content).toContain('Approved');
    expect(logEntry.metadata?.approved).toBe(true);
  });

  it('rejects a change and sets task to FAILED', () => {
    const task = makeTask({
      id: 'task-reject',
      status: TaskStatus.AWAITING_APPROVAL,
      result: {
        success: false,
        output: 'pending review',
        changes: [makeCodeChange({ file: 'src/auth.ts' })],
      },
    });

    const { updatedTask, logEntry } = applyApprovalAction(task, 0, false, 'user-1');

    expect(updatedTask.status).toBe(TaskStatus.FAILED);
    expect(updatedTask.result?.changes?.[0]?.approved).toBe(false);
    expect(updatedTask.result?.success).toBe(false);
    expect(logEntry.agent).toBe('user-1');
    expect(logEntry.content).toContain('Rejected');
    expect(logEntry.metadata?.approved).toBe(false);
  });

  it('does not mutate the original task', () => {
    const task = makeTask({
      status: TaskStatus.AWAITING_APPROVAL,
      result: {
        success: false,
        output: 'pending',
        changes: [makeCodeChange()],
      },
    });

    const originalStatus = task.status;
    const originalApproved = task.result?.changes?.[0]?.approved;

    applyApprovalAction(task, 0, true, 'user-1');

    expect(task.status).toBe(originalStatus);
    expect(task.result?.changes?.[0]?.approved).toBe(originalApproved);
  });

  it('sets updatedAt timestamp', () => {
    const before = new Date('2024-01-01');
    const task = makeTask({
      status: TaskStatus.AWAITING_APPROVAL,
      createdAt: before,
      updatedAt: before,
      result: {
        success: false,
        output: '',
        changes: [makeCodeChange()],
      },
    });

    const { updatedTask } = applyApprovalAction(task, 0, true, 'user-1');
    expect(updatedTask.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('log entry has correct metadata', () => {
    const task = makeTask({
      id: 'task-meta',
      status: TaskStatus.AWAITING_APPROVAL,
      result: {
        success: false,
        output: '',
        changes: [makeCodeChange(), makeCodeChange({ file: 'src/b.ts' })],
      },
    });

    const { logEntry } = applyApprovalAction(task, 1, false, 'admin');
    expect(logEntry.metadata).toEqual({
      taskId: 'task-meta',
      changeIndex: 1,
      approved: false,
      action: 'approval',
    });
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: TaskPanel component rendering (Requirement 1.1)
// ---------------------------------------------------------------------------

describe('TaskPanel component', () => {
  /** Validates: Requirement 1.1, 1.2 */

  const agents: AgentInfo[] = [
    makeAgent({ name: 'agent-a' }),
    makeAgent({ name: 'agent-b' }),
  ];

  const tasks: Task[] = [
    makeTask({
      id: 'task-1',
      instruction: 'Fix login bug',
      status: TaskStatus.EXECUTING,
      subTasks: [makeSubTask({ assignedAgent: 'agent-a' })],
    }),
    makeTask({
      id: 'task-2',
      instruction: 'Add search feature',
      status: TaskStatus.PENDING,
      subTasks: [makeSubTask({ assignedAgent: 'agent-b' })],
    }),
    makeTask({
      id: 'task-3',
      instruction: 'Refactor utils',
      status: TaskStatus.COMPLETED,
      subTasks: [],
      result: {
        success: true,
        output: 'done',
        changes: [makeCodeChange({ file: 'src/utils.ts' })],
      },
    }),
  ];

  it('renders all tasks when no filter is applied', () => {
    render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    );
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Add search feature')).toBeInTheDocument();
    expect(screen.getByText('Refactor utils')).toBeInTheDocument();
  });

  it('renders filtered tasks by status', () => {
    render(
      <TaskPanel
        tasks={tasks}
        agents={agents}
        onSelectTask={() => {}}
        filter={{ status: TaskStatus.PENDING }}
      />
    );
    expect(screen.queryByText('Fix login bug')).toBeNull();
    expect(screen.getByText('Add search feature')).toBeInTheDocument();
    expect(screen.queryByText('Refactor utils')).toBeNull();
  });

  it('renders filtered tasks by agent', () => {
    render(
      <TaskPanel
        tasks={tasks}
        agents={agents}
        onSelectTask={() => {}}
        filter={{ agent: 'agent-a' }}
      />
    );
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Add search feature')).toBeNull();
  });

  it('calls onSelectTask when a task is clicked', () => {
    const onSelect = jest.fn();
    render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={onSelect} filter={{}} />
    );

    fireEvent.click(screen.getByText('Fix login bug'));
    expect(onSelect).toHaveBeenCalledWith('task-1');
  });

  it('displays agent assignments for tasks', () => {
    render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    );
    expect(screen.getByText('Agents: agent-a')).toBeInTheDocument();
    expect(screen.getByText('Agents: agent-b')).toBeInTheDocument();
  });

  it('displays affected files when available', () => {
    render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    );
    expect(screen.getByText('Files: src/utils.ts')).toBeInTheDocument();
  });

  it('displays task status for each task', () => {
    render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    );
    // Statuses may appear in both task headers and subtask rows, so use getAllByText
    expect(screen.getAllByText(TaskStatus.EXECUTING).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(TaskStatus.PENDING).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(TaskStatus.COMPLETED).length).toBeGreaterThanOrEqual(1);
  });

  it('renders nothing when all tasks are filtered out', () => {
    render(
      <TaskPanel
        tasks={tasks}
        agents={agents}
        onSelectTask={() => {}}
        filter={{ status: TaskStatus.FAILED }}
      />
    );
    // Only the heading should be present, no task items
    const listItems = screen.queryAllByRole('button');
    expect(listItems).toHaveLength(0);
  });

  it('updates displayed tasks when filter changes (real-time association update)', () => {
    /** Validates: Requirement 1.4 */
    const { rerender } = render(
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    );
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();

    // Change filter to show only PENDING tasks
    rerender(
      <TaskPanel
        tasks={tasks}
        agents={agents}
        onSelectTask={() => {}}
        filter={{ status: TaskStatus.PENDING }}
      />
    );
    expect(screen.queryByText('Fix login bug')).toBeNull();
    expect(screen.getByText('Add search feature')).toBeInTheDocument();
  });
});
