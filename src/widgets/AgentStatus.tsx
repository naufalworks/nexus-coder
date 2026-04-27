import React, { useState, useCallback, useMemo } from 'react';
import { AgentInfo, TaskStatus } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentStatusProps {
  agents: AgentInfo[];
  progress: { [agentName: string]: TaskStatus };
  errors?: { [agentName: string]: string };
  onClick?: (agentName: string) => void;
}

/** Represents a single entry in the agent activity trace */
export interface ActivityTraceEntry {
  timestamp: Date;
  action: string;
  detail: string;
}

/** Internal state for the activity trace panel */
interface ActivityTraceState {
  agentName: string | null;
  loading: boolean;
  error: string | null;
  entries: ActivityTraceEntry[];
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Derive a readiness label from agent status and progress.
 * Returns 'ready' | 'busy' | 'error' | 'idle'.
 */
export function getReadiness(
  agent: AgentInfo,
  progress: { [agentName: string]: TaskStatus }
): 'ready' | 'busy' | 'error' | 'idle' {
  const agentProgress = progress[agent.name];

  if (agent.status === 'error') return 'error';
  if (agentProgress === TaskStatus.FAILED) return 'error';
  if (agent.status === 'busy' || (agentProgress && agentProgress !== TaskStatus.COMPLETED)) {
    return 'busy';
  }
  if (agentProgress === TaskStatus.COMPLETED || agent.status === 'idle') {
    return 'ready';
  }
  return 'idle';
}

/**
 * Format a TaskStatus into a human-readable progress label.
 */
export function formatProgress(status: TaskStatus | undefined): string {
  if (!status) return 'idle';
  return status;
}

/**
 * Simulate fetching the activity trace for an agent.
 * In production this would call an API; here we return a predictable result
 * based on agent data so tests are deterministic.
 */
export function fetchActivityTrace(
  agent: AgentInfo,
  progress: { [agentName: string]: TaskStatus },
  errors?: { [agentName: string]: string }
): { entries: ActivityTraceEntry[]; error: string | null } {
  // Simulate trace failure when agent has an error
  if (errors?.[agent.name]) {
    return {
      entries: [],
      error: `Failed to load activity trace: ${errors[agent.name]}`,
    };
  }

  const entries: ActivityTraceEntry[] = [];

  // Build a trace from the current agent state
  if (agent.currentTask) {
    entries.push({
      timestamp: new Date(),
      action: 'assigned',
      detail: `Assigned to task ${agent.currentTask}`,
    });
  }

  const agentProgress = progress[agent.name];
  if (agentProgress) {
    entries.push({
      timestamp: new Date(),
      action: 'status_change',
      detail: `Status changed to ${agentProgress}`,
    });
  }

  if (agentProgress === TaskStatus.COMPLETED) {
    entries.push({
      timestamp: new Date(),
      action: 'completed',
      detail: 'Task completed successfully',
    });
  }

  if (agentProgress === TaskStatus.FAILED) {
    entries.push({
      timestamp: new Date(),
      action: 'failed',
      detail: 'Task failed',
    });
  }

  return { entries, error: null };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Badge showing readiness state */
const ReadinessBadge: React.FC<{ readiness: string }> = React.memo(({ readiness }) => (
  <span className={`readiness-badge readiness-${readiness}`} data-readiness={readiness}>
    {readiness}
  </span>
));
ReadinessBadge.displayName = 'ReadinessBadge';

/** Activity trace panel for a selected agent */
const ActivityTracePanel: React.FC<{
  trace: ActivityTraceState;
  onClose: () => void;
}> = React.memo(({ trace, onClose }) => (
  <div className="activity-trace-panel" data-testid="activity-trace-panel">
    <div className="activity-trace-header">
      <h3>Activity Trace: {trace.agentName}</h3>
      <button
        className="activity-trace-close"
        onClick={onClose}
        data-testid="activity-trace-close"
        aria-label="Close activity trace"
      >
        ×
      </button>
    </div>
    {trace.loading && (
      <div className="activity-trace-loading" data-testid="activity-trace-loading">
        Loading trace...
      </div>
    )}
    {trace.error && (
      <div className="activity-trace-error" data-testid="activity-trace-error">
        {trace.error}
      </div>
    )}
    {!trace.loading && !trace.error && (
      <ul className="activity-trace-entries">
        {trace.entries.map((entry, idx) => (
          <li key={idx} className="activity-trace-entry" data-testid={`trace-entry-${idx}`}>
            <span className="trace-action">{entry.action}</span>
            <span className="trace-detail">{entry.detail}</span>
          </li>
        ))}
        {trace.entries.length === 0 && (
          <li className="activity-trace-empty">No activity recorded</li>
        )}
      </ul>
    )}
  </div>
));
ActivityTracePanel.displayName = 'ActivityTracePanel';

// ---------------------------------------------------------------------------
// Main AgentStatus Component
// ---------------------------------------------------------------------------

export const AgentStatus: React.FC<AgentStatusProps> = ({
  agents,
  progress,
  errors,
  onClick,
}) => {
  const [trace, setTrace] = useState<ActivityTraceState>({
    agentName: null,
    loading: false,
    error: null,
    entries: [],
  });

  const handleClick = useCallback(
    (agent: AgentInfo) => {
      // Fire external onClick handler
      onClick?.(agent.name);

      // Open activity trace panel
      setTrace({
        agentName: agent.name,
        loading: true,
        error: null,
        entries: [],
      });

      // Simulate async trace fetch
      const result = fetchActivityTrace(agent, progress, errors);
      setTrace({
        agentName: agent.name,
        loading: false,
        error: result.error,
        entries: result.entries,
      });
    },
    [onClick, progress, errors]
  );

  const handleCloseTrace = useCallback(() => {
    setTrace({
      agentName: null,
      loading: false,
      error: null,
      entries: [],
    });
  }, []);

  const agentReadiness = useMemo(
    () =>
      agents.reduce<Record<string, string>>((acc, a) => {
        acc[a.name] = getReadiness(a, progress);
        return acc;
      }, {}),
    [agents, progress]
  );

  return (
    <div className="agent-status" data-testid="agent-status-dashboard">
      <h2>Agent Status</h2>
      <ul className="agent-list">
        {agents.map(a => {
          const agentProgress = progress[a.name];
          const agentError = errors?.[a.name];
          const readiness = agentReadiness[a.name];

          return (
            <li
              key={a.name}
              className="agent-item"
              data-testid={`agent-item-${a.name}`}
              data-agent-name={a.name}
              data-readiness={readiness}
              onClick={() => handleClick(a)}
              role="button"
              tabIndex={0}
            >
              <div className="agent-header">
                <strong className="agent-name">{a.name}</strong>
                <ReadinessBadge readiness={readiness} />
              </div>
              <div className="agent-progress" data-testid={`progress-${a.name}`}>
                {formatProgress(agentProgress)}
              </div>
              {agentError && (
                <div
                  className="agent-error"
                  data-testid={`error-${a.name}`}
                  role="alert"
                >
                  {agentError}
                </div>
              )}
              {a.currentTask && (
                <div className="agent-current-task" data-testid={`current-task-${a.name}`}>
                  Task: {a.currentTask}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {agents.length === 0 && (
        <div className="agent-status-empty" data-testid="agent-status-empty">
          No agents registered
        </div>
      )}
      {trace.agentName && (
        <ActivityTracePanel trace={trace} onClose={handleCloseTrace} />
      )}
    </div>
  );
};
