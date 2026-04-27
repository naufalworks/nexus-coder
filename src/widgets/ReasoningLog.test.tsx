import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReasoningLog, ReasoningLogProps } from './ReasoningLog';
import { AgentMessage } from '../types';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAgentMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    agent: 'agent-a',
    timestamp: new Date('2026-04-27T12:00:00Z'),
    content: 'Agent decision made',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: Log filtering by agent (Requirement 4.2)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Agent Filtering', () => {
  /** Validates: Requirement 4.2 */

  const messages: AgentMessage[] = [
    makeAgentMessage({ agent: 'agent-a', content: 'Decision A' }),
    makeAgentMessage({ agent: 'agent-b', content: 'Decision B' }),
    makeAgentMessage({ agent: 'agent-a', content: 'Another decision A' }),
    makeAgentMessage({ agent: 'agent-c', content: 'Decision C' }),
  ];

  it('displays all messages when no agent filter is applied', () => {
    render(<ReasoningLog log={messages} />);
    expect(screen.getByText('Decision A')).toBeInTheDocument();
    expect(screen.getByText('Decision B')).toBeInTheDocument();
    expect(screen.getByText('Another decision A')).toBeInTheDocument();
    expect(screen.getByText('Decision C')).toBeInTheDocument();
  });

  it('filters messages by selected agent', () => {
    render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    fireEvent.change(agentSelect, { target: { value: 'agent-a' } });

    expect(screen.getByText('Decision A')).toBeInTheDocument();
    expect(screen.getByText('Another decision A')).toBeInTheDocument();
    expect(screen.queryByText('Decision B')).not.toBeInTheDocument();
    expect(screen.queryByText('Decision C')).not.toBeInTheDocument();
  });

  it('shows all agents in filter dropdown', () => {
    render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    const options = Array.from(agentSelect.querySelectorAll('option')).map(
      opt => opt.textContent
    );

    expect(options).toContain('All Agents');
    expect(options).toContain('agent-a');
    expect(options).toContain('agent-b');
    expect(options).toContain('agent-c');
  });

  it('resets to all messages when "All Agents" is selected', () => {
    render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    
    // First filter by agent-a
    fireEvent.change(agentSelect, { target: { value: 'agent-a' } });
    expect(screen.queryByText('Decision B')).not.toBeInTheDocument();
    
    // Then reset to all
    fireEvent.change(agentSelect, { target: { value: '' } });
    expect(screen.getByText('Decision B')).toBeInTheDocument();
  });

  it('handles empty log gracefully', () => {
    render(<ReasoningLog log={[]} />);
    expect(screen.getByText('No log entries found')).toBeInTheDocument();
  });

  it('shows no entries message when filter matches nothing', () => {
    const { container } = render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    fireEvent.change(agentSelect, { target: { value: 'agent-a' } });
    
    // Now filter by keyword that doesn't match
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    fireEvent.change(keywordInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No log entries found')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Log filtering by keyword (Requirement 4.2)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Keyword Filtering', () => {
  /** Validates: Requirement 4.2 */

  const messages: AgentMessage[] = [
    makeAgentMessage({ content: 'Approved code change in auth.ts' }),
    makeAgentMessage({ content: 'Rejected proposal for refactoring' }),
    makeAgentMessage({ content: 'Reviewed authentication module' }),
    makeAgentMessage({ content: 'Generated test cases' }),
  ];

  it('displays all messages when no keyword filter is applied', () => {
    render(<ReasoningLog log={messages} />);
    expect(screen.getByText('Approved code change in auth.ts')).toBeInTheDocument();
    expect(screen.getByText('Rejected proposal for refactoring')).toBeInTheDocument();
  });

  it('filters messages by keyword (case-insensitive)', () => {
    render(<ReasoningLog log={messages} />);
    
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    fireEvent.change(keywordInput, { target: { value: 'auth' } });

    expect(screen.getByText('Approved code change in auth.ts')).toBeInTheDocument();
    expect(screen.getByText('Reviewed authentication module')).toBeInTheDocument();
    expect(screen.queryByText('Rejected proposal for refactoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Generated test cases')).not.toBeInTheDocument();
  });

  it('keyword search is case-insensitive', () => {
    render(<ReasoningLog log={messages} />);
    
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    fireEvent.change(keywordInput, { target: { value: 'AUTH' } });

    expect(screen.getByText('Approved code change in auth.ts')).toBeInTheDocument();
    expect(screen.getByText('Reviewed authentication module')).toBeInTheDocument();
  });

  it('clears keyword filter when input is cleared', () => {
    render(<ReasoningLog log={messages} />);
    
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    
    // Apply filter
    fireEvent.change(keywordInput, { target: { value: 'auth' } });
    expect(screen.queryByText('Generated test cases')).not.toBeInTheDocument();
    
    // Clear filter
    fireEvent.change(keywordInput, { target: { value: '' } });
    expect(screen.getByText('Generated test cases')).toBeInTheDocument();
  });

  it('shows no entries when keyword matches nothing', () => {
    render(<ReasoningLog log={messages} />);
    
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    fireEvent.change(keywordInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No log entries found')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Combined agent and keyword filtering (Requirement 4.2)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Combined Filtering', () => {
  /** Validates: Requirement 4.2 */

  const messages: AgentMessage[] = [
    makeAgentMessage({ agent: 'agent-a', content: 'Approved auth change' }),
    makeAgentMessage({ agent: 'agent-b', content: 'Approved UI change' }),
    makeAgentMessage({ agent: 'agent-a', content: 'Rejected auth proposal' }),
    makeAgentMessage({ agent: 'agent-b', content: 'Reviewed auth module' }),
  ];

  it('applies both agent and keyword filters simultaneously', () => {
    render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    
    fireEvent.change(agentSelect, { target: { value: 'agent-a' } });
    fireEvent.change(keywordInput, { target: { value: 'auth' } });

    expect(screen.getByText('Approved auth change')).toBeInTheDocument();
    expect(screen.getByText('Rejected auth proposal')).toBeInTheDocument();
    expect(screen.queryByText('Approved UI change')).not.toBeInTheDocument();
    expect(screen.queryByText('Reviewed auth module')).not.toBeInTheDocument();
  });

  it('shows no entries when combined filters match nothing', () => {
    render(<ReasoningLog log={messages} />);
    
    const agentSelect = screen.getByRole('combobox', { name: '' });
    const keywordInput = screen.getByPlaceholderText('Search by keyword...');
    
    fireEvent.change(agentSelect, { target: { value: 'agent-a' } });
    fireEvent.change(keywordInput, { target: { value: 'UI' } });

    expect(screen.getByText('No log entries found')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Jump to code functionality (Requirement 4.3)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Jump to Code', () => {
  /** Validates: Requirement 4.3 */

  it('displays jump to code button when message has file metadata', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'Modified authentication',
        metadata: { file: 'src/auth.ts', line: 42 },
      }),
    ];

    render(<ReasoningLog log={messages} />);
    expect(screen.getByText('Jump to Code')).toBeInTheDocument();
  });

  it('does not display jump to code button when message has no file metadata', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'General decision',
        metadata: {},
      }),
    ];

    render(<ReasoningLog log={messages} />);
    expect(screen.queryByText('Jump to Code')).not.toBeInTheDocument();
  });

  it('calls onJumpToCode with file and line when button is clicked', () => {
    const onJumpToCode = jest.fn();
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'Modified authentication',
        metadata: { file: 'src/auth.ts', line: 42 },
      }),
    ];

    render(<ReasoningLog log={messages} onJumpToCode={onJumpToCode} />);
    
    const jumpButton = screen.getByText('Jump to Code');
    fireEvent.click(jumpButton);

    expect(onJumpToCode).toHaveBeenCalledWith('src/auth.ts', 42);
  });

  it('calls onJumpToCode with file only when line is not provided', () => {
    const onJumpToCode = jest.fn();
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'Modified file',
        metadata: { file: 'src/utils.ts' },
      }),
    ];

    render(<ReasoningLog log={messages} onJumpToCode={onJumpToCode} />);
    
    const jumpButton = screen.getByText('Jump to Code');
    fireEvent.click(jumpButton);

    expect(onJumpToCode).toHaveBeenCalledWith('src/utils.ts', undefined);
  });

  it('does not call onJumpToCode when callback is not provided', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'Modified file',
        metadata: { file: 'src/utils.ts' },
      }),
    ];

    render(<ReasoningLog log={messages} />);
    
    const jumpButton = screen.getByText('Jump to Code');
    // Should not throw error
    fireEvent.click(jumpButton);
  });

  it('handles multiple messages with code references', () => {
    const onJumpToCode = jest.fn();
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'Modified auth',
        metadata: { file: 'src/auth.ts', line: 10 },
      }),
      makeAgentMessage({
        content: 'Modified utils',
        metadata: { file: 'src/utils.ts', line: 20 },
      }),
    ];

    render(<ReasoningLog log={messages} onJumpToCode={onJumpToCode} />);
    
    const jumpButtons = screen.getAllByText('Jump to Code');
    expect(jumpButtons).toHaveLength(2);

    fireEvent.click(jumpButtons[0]);
    expect(onJumpToCode).toHaveBeenCalledWith('src/auth.ts', 10);

    fireEvent.click(jumpButtons[1]);
    expect(onJumpToCode).toHaveBeenCalledWith('src/utils.ts', 20);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Timestamp and attribution (Requirement 4.4)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Timestamp and Attribution', () => {
  /** Validates: Requirement 4.4 */

  it('displays agent name for each log entry', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({ agent: 'agent-a', content: 'Decision A' }),
      makeAgentMessage({ agent: 'agent-b', content: 'Decision B' }),
    ];

    render(<ReasoningLog log={messages} />);
    
    // Agent names appear in both dropdown and log entries, so use getAllByText
    const agentAElements = screen.getAllByText('agent-a');
    const agentBElements = screen.getAllByText('agent-b');
    
    expect(agentAElements.length).toBeGreaterThan(0);
    expect(agentBElements.length).toBeGreaterThan(0);
  });

  it('displays formatted timestamp for each log entry', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({
        agent: 'agent-a',
        content: 'Decision',
        timestamp: new Date('2026-04-27T12:00:00Z'),
      }),
    ];

    render(<ReasoningLog log={messages} />);
    
    // Check that a timestamp is displayed (format may vary by locale)
    const timestamps = screen.getAllByText(/2026|4\/27|27\/4/);
    expect(timestamps.length).toBeGreaterThan(0);
  });

  it('displays content for each log entry', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({ content: 'Approved code change' }),
      makeAgentMessage({ content: 'Rejected proposal' }),
    ];

    render(<ReasoningLog log={messages} />);
    
    expect(screen.getByText('Approved code change')).toBeInTheDocument();
    expect(screen.getByText('Rejected proposal')).toBeInTheDocument();
  });

  it('maintains chronological order of log entries', () => {
    const messages: AgentMessage[] = [
      makeAgentMessage({
        content: 'First decision',
        timestamp: new Date('2026-04-27T10:00:00Z'),
      }),
      makeAgentMessage({
        content: 'Second decision',
        timestamp: new Date('2026-04-27T11:00:00Z'),
      }),
      makeAgentMessage({
        content: 'Third decision',
        timestamp: new Date('2026-04-27T12:00:00Z'),
      }),
    ];

    render(<ReasoningLog log={messages} />);
    
    const entries = screen.getAllByText(/decision/i);
    expect(entries[0]).toHaveTextContent('First decision');
    expect(entries[1]).toHaveTextContent('Second decision');
    expect(entries[2]).toHaveTextContent('Third decision');
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Initial filter prop (Requirement 4.2)
// ---------------------------------------------------------------------------

describe('ReasoningLog - Initial Filter Prop', () => {
  /** Validates: Requirement 4.2 */

  const messages: AgentMessage[] = [
    makeAgentMessage({ agent: 'agent-a', content: 'Decision A' }),
    makeAgentMessage({ agent: 'agent-b', content: 'Decision B' }),
  ];

  it('applies initial agent filter from props', () => {
    render(<ReasoningLog log={messages} filter={{ agent: 'agent-a' }} />);
    
    expect(screen.getByText('Decision A')).toBeInTheDocument();
    expect(screen.queryByText('Decision B')).not.toBeInTheDocument();
  });

  it('applies initial keyword filter from props', () => {
    const messagesWithKeywords: AgentMessage[] = [
      makeAgentMessage({ content: 'auth change' }),
      makeAgentMessage({ content: 'UI update' }),
    ];

    render(<ReasoningLog log={messagesWithKeywords} filter={{ keyword: 'auth' }} />);
    
    expect(screen.getByText('auth change')).toBeInTheDocument();
    expect(screen.queryByText('UI update')).not.toBeInTheDocument();
  });

  it('applies both initial filters from props', () => {
    const messagesWithBoth: AgentMessage[] = [
      makeAgentMessage({ agent: 'agent-a', content: 'auth change' }),
      makeAgentMessage({ agent: 'agent-b', content: 'auth update' }),
      makeAgentMessage({ agent: 'agent-a', content: 'UI change' }),
    ];

    render(
      <ReasoningLog
        log={messagesWithBoth}
        filter={{ agent: 'agent-a', keyword: 'auth' }}
      />
    );
    
    expect(screen.getByText('auth change')).toBeInTheDocument();
    expect(screen.queryByText('auth update')).not.toBeInTheDocument();
    expect(screen.queryByText('UI change')).not.toBeInTheDocument();
  });
});
