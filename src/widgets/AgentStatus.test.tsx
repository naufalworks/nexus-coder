import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AgentStatus,
  getReadiness,
  formatProgress,
  fetchActivityTrace,
  AgentStatusProps,
} from './AgentStatus';
import {
  TaskStatus,
  AgentCapability,
  TaskType,
  AgentInfo,
} from '../types';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: 'agent-a',
    capabilities: [AgentCapability.CODE_GENERATION],
    supportedTaskTypes: [TaskType.FEATURE],
    ...overrides,
  };
}

function makeProps(overrides: Partial<AgentStatusProps> = {}): AgentStatusProps {
  return {
    agents: [makeAgent()],
    progress: {},
    errors: {},
    onClick: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: getReadiness (Requirement 6.1)
// ---------------------------------------------------------------------------

describe('getReadiness', () => {
  /** Validates: Requirement 6.1 – agent progress, errors, and readiness */

  it('returns "idle" for agent with no progress and no status', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, {})).toBe('idle');
  });

  it('returns "ready" for idle agent with no progress', () => {
    const agent = makeAgent({ status: 'idle' });
    expect(getReadiness(agent, {})).toBe('ready');
  });

  it('returns "ready" for agent with COMPLETED progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.COMPLETED })).toBe('ready');
  });

  it('returns "ready" for idle agent with COMPLETED progress', () => {
    const agent = makeAgent({ status: 'idle' });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.COMPLETED })).toBe('ready');
  });

  it('returns "busy" for agent with busy status', () => {
    const agent = makeAgent({ status: 'busy' });
    expect(getReadiness(agent, {})).toBe('busy');
  });

  it('returns "busy" for agent with EXECUTING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.EXECUTING })).toBe('busy');
  });

  it('returns "busy" for agent with PLANNING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.PLANNING })).toBe('busy');
  });

  it('returns "busy" for agent with REVIEWING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.REVIEWING })).toBe('busy');
  });

  it('returns "busy" for agent with CONTEXT_ASSEMBLING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.CONTEXT_ASSEMBLING })).toBe('busy');
  });

  it('returns "busy" for agent with CLASSIFYING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.CLASSIFYING })).toBe('busy');
  });

  it('returns "busy" for agent with AWAITING_APPROVAL progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.AWAITING_APPROVAL })).toBe('busy');
  });

  it('returns "busy" for agent with APPLYING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.APPLYING })).toBe('busy');
  });

  it('returns "busy" for agent with PENDING progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.PENDING })).toBe('busy');
  });

  it('returns "error" for agent with error status', () => {
    const agent = makeAgent({ status: 'error' });
    expect(getReadiness(agent, {})).toBe('error');
  });

  it('returns "error" for agent with FAILED progress', () => {
    const agent = makeAgent({ status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.FAILED })).toBe('error');
  });

  it('prioritizes error status over busy progress', () => {
    const agent = makeAgent({ status: 'error' });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.EXECUTING })).toBe('error');
  });

  it('handles agent not in progress map', () => {
    const agent = makeAgent({ name: 'other-agent', status: undefined });
    expect(getReadiness(agent, { 'agent-a': TaskStatus.EXECUTING })).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: formatProgress (Requirement 6.1)
// ---------------------------------------------------------------------------

describe('formatProgress', () => {
  it('returns "idle" for undefined status', () => {
    expect(formatProgress(undefined)).toBe('idle');
  });

  it('returns the status string for defined TaskStatus', () => {
    expect(formatProgress(TaskStatus.EXECUTING)).toBe('executing');
    expect(formatProgress(TaskStatus.COMPLETED)).toBe('completed');
    expect(formatProgress(TaskStatus.FAILED)).toBe('failed');
    expect(formatProgress(TaskStatus.PENDING)).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: fetchActivityTrace (Requirement 6.2, 6.3)
// ---------------------------------------------------------------------------

describe('fetchActivityTrace', () => {
  /** Validates: Requirements 6.2, 6.3 */

  it('returns error when agent has an error in errors map', () => {
    const agent = makeAgent();
    const result = fetchActivityTrace(
      agent,
      {},
      { 'agent-a': 'Connection timeout' }
    );
    expect(result.error).toBe('Failed to load activity trace: Connection timeout');
    expect(result.entries).toHaveLength(0);
  });

  it('returns entries for agent with a current task', () => {
    const agent = makeAgent({ currentTask: 'task-1' });
    const result = fetchActivityTrace(agent, {});
    expect(result.error).toBeNull();
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.some(e => e.action === 'assigned')).toBe(true);
  });

  it('returns entries for agent with progress', () => {
    const agent = makeAgent();
    const result = fetchActivityTrace(agent, { 'agent-a': TaskStatus.EXECUTING });
    expect(result.error).toBeNull();
    expect(result.entries.some(e => e.action === 'status_change')).toBe(true);
  });

  it('includes completed entry when progress is COMPLETED', () => {
    const agent = makeAgent();
    const result = fetchActivityTrace(agent, { 'agent-a': TaskStatus.COMPLETED });
    expect(result.entries.some(e => e.action === 'completed')).toBe(true);
  });

  it('includes failed entry when progress is FAILED', () => {
    const agent = makeAgent();
    const result = fetchActivityTrace(agent, { 'agent-a': TaskStatus.FAILED });
    expect(result.entries.some(e => e.action === 'failed')).toBe(true);
  });

  it('returns empty entries for idle agent with no task', () => {
    const agent = makeAgent({ currentTask: undefined, status: 'idle' });
    const result = fetchActivityTrace(agent, {});
    expect(result.entries).toHaveLength(0);
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Component Tests: AgentStatus rendering (Requirement 6.1)
// ---------------------------------------------------------------------------

describe('AgentStatus component', () => {
  /** Validates: Requirement 6.1 – display agent progress, errors, readiness in real time */

  it('renders agent names', () => {
    const props = makeProps({
      agents: [
        makeAgent({ name: 'coder' }),
        makeAgent({ name: 'reviewer' }),
      ],
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByText('coder')).toBeInTheDocument();
    expect(screen.getByText('reviewer')).toBeInTheDocument();
  });

  it('renders progress for each agent', () => {
    const props = makeProps({
      agents: [makeAgent()],
      progress: { 'agent-a': TaskStatus.EXECUTING },
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('progress-agent-a')).toHaveTextContent('executing');
  });

  it('renders "idle" for agents with no progress', () => {
    const props = makeProps({
      agents: [makeAgent()],
      progress: {},
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('progress-agent-a')).toHaveTextContent('idle');
  });

  it('renders readiness badges for agents', () => {
    const props = makeProps({
      agents: [
        makeAgent({ name: 'busy-agent', status: 'busy' }),
        makeAgent({ name: 'idle-agent', status: 'idle' }),
      ],
      progress: { 'busy-agent': TaskStatus.EXECUTING },
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('agent-item-busy-agent')).toHaveAttribute('data-readiness', 'busy');
    expect(screen.getByTestId('agent-item-idle-agent')).toHaveAttribute('data-readiness', 'ready');
  });

  it('renders error messages for agents with errors', () => {
    const props = makeProps({
      agents: [makeAgent()],
      errors: { 'agent-a': 'Connection lost' },
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('error-agent-a')).toHaveTextContent('Connection lost');
  });

  it('does not render error element when agent has no error', () => {
    const props = makeProps({
      agents: [makeAgent()],
      errors: {},
    });
    render(<AgentStatus {...props} />);
    expect(screen.queryByTestId('error-agent-a')).not.toBeInTheDocument();
  });

  it('renders current task for agents', () => {
    const props = makeProps({
      agents: [makeAgent({ currentTask: 'task-42' })],
    });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('current-task-agent-a')).toHaveTextContent('task-42');
  });

  it('renders empty message when no agents', () => {
    const props = makeProps({ agents: [] });
    render(<AgentStatus {...props} />);
    expect(screen.getByTestId('agent-status-empty')).toHaveTextContent('No agents registered');
  });

  it('updates display when progress changes (real-time update)', () => {
    /** Validates: Requirement 6.1 – real-time update */
    const props = makeProps({
      agents: [makeAgent()],
      progress: { 'agent-a': TaskStatus.EXECUTING },
    });
    const { rerender } = render(<AgentStatus {...props} />);
    expect(screen.getByTestId('progress-agent-a')).toHaveTextContent('executing');

    // Simulate progress update
    rerender(
      <AgentStatus
        {...props}
        progress={{ 'agent-a': TaskStatus.COMPLETED }}
      />
    );
    expect(screen.getByTestId('progress-agent-a')).toHaveTextContent('completed');
  });

  it('updates error display when errors change (real-time update)', () => {
    /** Validates: Requirement 6.1, 6.3 – real-time error display */
    const props = makeProps({
      agents: [makeAgent()],
      progress: { 'agent-a': TaskStatus.EXECUTING },
      errors: {},
    });
    const { rerender } = render(<AgentStatus {...props} />);
    expect(screen.queryByTestId('error-agent-a')).not.toBeInTheDocument();

    // Simulate error occurring
    rerender(
      <AgentStatus
        {...props}
        errors={{ 'agent-a': 'Task crashed' }}
      />
    );
    expect(screen.getByTestId('error-agent-a')).toHaveTextContent('Task crashed');
  });
});

// ---------------------------------------------------------------------------
// Component Tests: onClick / Activity Trace (Requirement 6.2)
// ---------------------------------------------------------------------------

describe('AgentStatus click interaction', () => {
  /** Validates: Requirement 6.2 – click shows agent activity trace */

  it('calls onClick with agent name when agent is clicked', () => {
    const onClick = jest.fn();
    const props = makeProps({
      agents: [makeAgent({ name: 'coder' })],
      onClick,
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('coder'));
    expect(onClick).toHaveBeenCalledWith('coder');
  });

  it('shows activity trace panel when agent is clicked', () => {
    const props = makeProps({
      agents: [makeAgent({ name: 'coder', currentTask: 'task-1' })],
      progress: { coder: TaskStatus.EXECUTING },
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('coder'));
    expect(screen.getByTestId('activity-trace-panel')).toBeInTheDocument();
    expect(screen.getByText(/Activity Trace: coder/)).toBeInTheDocument();
  });

  it('shows trace entries in the activity trace panel', () => {
    const props = makeProps({
      agents: [makeAgent({ name: 'coder', currentTask: 'task-1' })],
      progress: { coder: TaskStatus.EXECUTING },
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('coder'));
    // Should have at least the "assigned" and "status_change" entries
    expect(screen.getByTestId('activity-trace-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId(/trace-entry-/).length).toBeGreaterThanOrEqual(2);
  });

  it('closes activity trace panel when close button is clicked', () => {
    const props = makeProps({
      agents: [makeAgent({ name: 'coder', currentTask: 'task-1' })],
      progress: { coder: TaskStatus.EXECUTING },
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('coder'));
    expect(screen.getByTestId('activity-trace-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('activity-trace-close'));
    expect(screen.queryByTestId('activity-trace-panel')).not.toBeInTheDocument();
  });

  it('shows empty trace for idle agent with no task', () => {
    const props = makeProps({
      agents: [makeAgent({ name: 'idle-agent', status: 'idle' })],
      progress: {},
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('idle-agent'));
    expect(screen.getByText('No activity recorded')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Component Tests: Unobtrusive Error on Trace Failure (Requirement 6.3)
// ---------------------------------------------------------------------------

describe('AgentStatus trace error display', () => {
  /** Validates: Requirement 6.3 – unobtrusive error display on trace failure */

  it('displays trace error unobtrusively when trace fails', () => {
    const props = makeProps({
      agents: [makeAgent()],
      progress: {},
      errors: { 'agent-a': 'Trace unavailable' },
    });
    render(<AgentStatus {...props} />);
    fireEvent.click(screen.getByText('agent-a'));

    // The trace error should be shown in the panel (unobtrusive, not a modal)
    expect(screen.getByTestId('activity-trace-error')).toHaveTextContent(
      'Failed to load activity trace: Trace unavailable'
    );
  });

  it('trace error does not block other agent interactions', () => {
    const props = makeProps({
      agents: [
        makeAgent({ name: 'failing-agent' }),
        makeAgent({ name: 'working-agent', currentTask: 'task-1' }),
      ],
      progress: { 'working-agent': TaskStatus.EXECUTING },
      errors: { 'failing-agent': 'Network error' },
    });
    render(<AgentStatus {...props} />);

    // Click failing agent - shows trace error
    fireEvent.click(screen.getByText('failing-agent'));
    expect(screen.getByTestId('activity-trace-error')).toBeInTheDocument();

    // Close trace
    fireEvent.click(screen.getByTestId('activity-trace-close'));

    // Click working agent - shows trace correctly
    fireEvent.click(screen.getByText('working-agent'));
    expect(screen.queryByTestId('activity-trace-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-trace-panel')).toBeInTheDocument();
  });

  it('displays inline error alongside agent item (unobtrusive)', () => {
    const props = makeProps({
      agents: [makeAgent()],
      progress: { 'agent-a': TaskStatus.EXECUTING },
      errors: { 'agent-a': 'API rate limit exceeded' },
    });
    render(<AgentStatus {...props} />);

    // Error is displayed inline, not as a blocking dialog
    const errorEl = screen.getByTestId('error-agent-a');
    expect(errorEl).toHaveTextContent('API rate limit exceeded');
    expect(errorEl).toHaveAttribute('role', 'alert');
  });
});
