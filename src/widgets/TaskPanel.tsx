import React, { useMemo, useCallback } from 'react';
import { Task, TaskStatus, AgentInfo, SubTask, CodeChange, AgentMessage } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskPanelFilter {
  status?: TaskStatus;
  agent?: string;
}

export interface TaskPanelProps {
  tasks: Task[];
  agents: AgentInfo[];
  onSelectTask: (taskId: string) => void;
  filter: TaskPanelFilter;
}

/**
 * Represents a user approval/rejection action performed on a task's change.
 */
export interface ApprovalAction {
  taskId: string;
  changeIndex: number;
  approved: boolean;
  timestamp: Date;
  user: string;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Filter tasks by the given status and/or agent name.
 * Agent filtering matches any sub-task whose `assignedAgent` equals the filter value.
 */
export function filterTasks(
  tasks: Task[],
  filter: TaskPanelFilter
): Task[] {
  return tasks.filter(task => {
    // Status filter
    if (filter.status !== undefined && task.status !== filter.status) {
      return false;
    }
    // Agent filter – match if any sub-task is assigned to the given agent
    if (filter.agent !== undefined) {
      const hasAgent = task.subTasks.some(st => st.assignedAgent === filter.agent);
      if (!hasAgent) return false;
    }
    return true;
  });
}

/**
 * Apply an approval or rejection to a task's code change.
 * Returns a new Task with the updated change and status.
 * Also returns the log entry that should be appended to the reasoning log.
 *
 * Validates: Requirements 2.3, 4.1
 */
export function applyApprovalAction(
  task: Task,
  changeIndex: number,
  approved: boolean,
  user: string
): { updatedTask: Task; logEntry: AgentMessage } {
  // Deep-clone to preserve immutability
  const changes: CodeChange[] = task.result?.changes
    ? task.result.changes.map((c, i) =>
        i === changeIndex ? { ...c, approved } : { ...c }
      )
    : [];

  const newStatus: TaskStatus = approved
    ? TaskStatus.COMPLETED
    : TaskStatus.FAILED;

  const updatedTask: Task = {
    ...task,
    status: newStatus,
    updatedAt: new Date(),
    result: {
      ...task.result,
      success: approved,
      output: approved ? 'Change approved' : 'Change rejected',
      changes,
    },
  };

  const logEntry: AgentMessage = {
    agent: user,
    timestamp: new Date(),
    content: approved
      ? `Approved change ${changeIndex} on task ${task.id}`
      : `Rejected change ${changeIndex} on task ${task.id}`,
    metadata: { taskId: task.id, changeIndex, approved, action: 'approval' },
  };

  return { updatedTask, logEntry };
}

/**
 * Collect the set of unique agent names assigned across all sub-tasks of a task.
 */
export function getAssignedAgents(task: Task): string[] {
  const agentSet = new Set<string>();
  for (const st of task.subTasks) {
    if (st.assignedAgent) {
      agentSet.add(st.assignedAgent);
    }
  }
  return Array.from(agentSet);
}

/**
 * Collect affected files/functions from a task's code changes.
 */
export function getAffectedFiles(task: Task): string[] {
  if (!task.result?.changes) return [];
  return task.result.changes.map(c => c.file);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single task row in the panel list */
const TaskItem: React.FC<{
  task: Task;
  agents: AgentInfo[];
  onSelect: (taskId: string) => void;
}> = React.memo(({ task, agents, onSelect }) => {
  const assignedAgents = useMemo(() => getAssignedAgents(task), [task]);
  const affectedFiles = useMemo(() => getAffectedFiles(task), [task]);

  const handleClick = useCallback(() => {
    onSelect(task.id);
  }, [onSelect, task.id]);

  return (
    <li
      className="task-item"
      data-task-id={task.id}
      data-task-status={task.status}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      <div className="task-header">
        <span className="task-instruction">{task.instruction}</span>
        <span className={`task-status status-${task.status}`}>{task.status}</span>
      </div>
      <div className="task-agents">
        {assignedAgents.length > 0 && (
          <span className="task-assigned-agents" data-agents={assignedAgents.join(', ')}>
            Agents: {assignedAgents.join(', ')}
          </span>
        )}
      </div>
      <div className="task-affected-files">
        {affectedFiles.length > 0 && (
          <span className="task-files" data-files={affectedFiles.join(', ')}>
            Files: {affectedFiles.join(', ')}
          </span>
        )}
      </div>
      {task.subTasks.length > 0 && (
        <div className="task-subtasks">
          {task.subTasks.map(st => (
            <div key={st.id} className="subtask-item" data-subtask-id={st.id}>
              <span className="subtask-agent">{st.assignedAgent}</span>
              <span className={`subtask-status status-${st.status}`}>{st.status}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
});
TaskItem.displayName = 'TaskItem';

// ---------------------------------------------------------------------------
// Main TaskPanel Component
// ---------------------------------------------------------------------------

export const TaskPanel: React.FC<TaskPanelProps> = ({
  tasks,
  agents,
  onSelectTask,
  filter,
}) => {
  const filteredTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);

  return (
    <div className="task-panel">
      <h2>Tasks</h2>
      <ul className="task-list">
        {filteredTasks.map(task => (
          <TaskItem
            key={task.id}
            task={task}
            agents={agents}
            onSelect={onSelectTask}
          />
        ))}
      </ul>
    </div>
  );
};
