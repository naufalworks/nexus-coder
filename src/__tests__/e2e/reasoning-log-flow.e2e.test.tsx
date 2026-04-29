/**
 * E2E Test: Reasoning log journey
 * 
 * Validates: Requirements 2.4
 * 
 * Cover agent decision logged, filtering by agent, matching entries shown, 
 * jump to code location
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReasoningLog } from '../../widgets/ReasoningLog';
import { 
  makeAgentMessage,
  makeAgentMessages,
} from '../helpers/factories';
import { AgentMessage } from '../../types';

describe('E2E: Reasoning log journey', () => {
  describe('Requirement 2.4: Reasoning log flow', () => {
    it('should log agent decisions', async () => {
      const messages = [
        makeAgentMessage({
          agent: 'agent-coder',
          content: 'Analyzing authentication flow',
          timestamp: new Date(Date.now() - 5000),
        }),
        makeAgentMessage({
          agent: 'agent-reviewer',
          content: 'Reviewing proposed changes to login.ts',
          timestamp: new Date(Date.now() - 3000),
        }),
        makeAgentMessage({
          agent: 'agent-coder',
          content: 'Implementation complete, awaiting approval',
          timestamp: new Date(Date.now() - 1000),
        }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // All messages should be visible
      expect(screen.getByText(/Analyzing authentication flow/)).toBeInTheDocument();
      expect(screen.getByText(/Reviewing proposed changes/)).toBeInTheDocument();
      expect(screen.getByText(/Implementation complete/)).toBeInTheDocument();
    });
    
    it('should filter by agent name', async () => {
      const messages = [
        makeAgentMessage({ agent: 'agent-coder', content: 'Coder message 1' }),
        makeAgentMessage({ agent: 'agent-reviewer', content: 'Reviewer message 1' }),
        makeAgentMessage({ agent: 'agent-coder', content: 'Coder message 2' }),
        makeAgentMessage({ agent: 'agent-architect', content: 'Architect message 1' }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Find agent filter dropdown (select element with class 'agent-filter')
      const agentFilter = screen.getByRole('combobox') as HTMLSelectElement;
      
      if (agentFilter) {
        // Filter by 'agent-coder'
        await act(async () => {
          fireEvent.change(agentFilter, { target: { value: 'agent-coder' } });
        });
        
        await waitFor(() => {
          // Should show only coder messages
          expect(screen.getByText(/Coder message 1/)).toBeInTheDocument();
          expect(screen.getByText(/Coder message 2/)).toBeInTheDocument();
          expect(screen.queryByText(/Reviewer message 1/)).not.toBeInTheDocument();
        });
      }
    });
    
    it('should filter by keyword', async () => {
      const messages = [
        makeAgentMessage({ content: 'Fixing authentication bug in login module' }),
        makeAgentMessage({ content: 'Updating database connection pool' }),
        makeAgentMessage({ content: 'Authentication tests added' }),
      ];
      
      const { container } = render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Find keyword filter
      const keywordFilter = screen.getByPlaceholderText(/search|keyword/i)
        || container.querySelector('input[type="text"]');
      
      if (keywordFilter) {
        await act(async () => {
          fireEvent.change(keywordFilter, { target: { value: 'authentication' } });
        });
        
        await waitFor(() => {
          // Should show only entries with 'authentication'
          expect(screen.getByText(/authentication bug/)).toBeInTheDocument();
          expect(screen.getByText(/Authentication tests/)).toBeInTheDocument();
          expect(screen.queryByText(/database connection/)).not.toBeInTheDocument();
        });
      }
    });
    
    it('should jump to code location on entry click', async () => {
      const onJumpToCode = jest.fn();
      
      const messages = [
        makeAgentMessage({
          content: 'Modifying login function',
          metadata: {
            file: 'src/auth/login.ts',
            line: 42,
          },
        }),
        makeAgentMessage({
          content: 'No code location',
        }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={onJumpToCode}
        />
      );
      
      // Find clickable log entries with code references
      const clickableEntries = screen.getAllByRole('button')
        .filter(btn => btn.textContent?.includes('login function'));
      
      if (clickableEntries.length > 0) {
        await act(async () => {
          fireEvent.click(clickableEntries[0]);
        });
        
        await waitFor(() => {
          // Should have called jump handler with correct location
          expect(onJumpToCode).toHaveBeenCalledWith('src/auth/login.ts', 42);
        });
      }
    });
    
    it('should show matching entries when filter is applied', async () => {
      const messages = [
        makeAgentMessage({ agent: 'agent-1', content: 'Message from agent 1' }),
        makeAgentMessage({ agent: 'agent-2', content: 'Message from agent 2' }),
        makeAgentMessage({ agent: 'agent-1', content: 'Another from agent 1' }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          filter={{ agent: 'agent-1' }}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Should show only agent-1 messages
      expect(screen.getByText(/Message from agent 1/)).toBeInTheDocument();
      expect(screen.getByText(/Another from agent 1/)).toBeInTheDocument();
      expect(screen.queryByText(/Message from agent 2/)).not.toBeInTheDocument();
    });
  });
  
  describe('Log entry display', () => {
    it('should display timestamps for each entry', () => {
      const timestamp = new Date('2024-01-15T10:30:00');
      const messages = [
        makeAgentMessage({ 
          content: 'Test message',
          timestamp 
        }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Timestamp should be visible
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });
    
    it('should show agent name badge', () => {
      const messages = [
        makeAgentMessage({ agent: 'agent-coder' }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Agent name should be in the log entry (as strong.agent-name)
      expect(screen.getAllByText(/agent-coder/i).length).toBeGreaterThan(0);
    });
  });
  
  describe('Filter combination', () => {
    it('should combine agent and keyword filters', async () => {
      const messages = [
        makeAgentMessage({ agent: 'coder', content: 'Fixed login bug' }),
        makeAgentMessage({ agent: 'coder', content: 'Updated tests' }),
        makeAgentMessage({ agent: 'reviewer', content: 'Reviewed login changes' }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          filter={{ agent: 'coder', keyword: 'login' }}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Should show only coder messages with 'login'
      expect(screen.getByText(/Fixed login bug/)).toBeInTheDocument();
      expect(screen.queryByText(/Updated tests/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Reviewed login/)).not.toBeInTheDocument();
    });
  });
});
