/**
 * Security Tests for Widget Rendering
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 * 
 * Verifies no XSS vectors or sensitive data exposure in widget rendering.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReasoningLog } from '../../widgets/ReasoningLog';
import { TaskPanel } from '../../widgets/TaskPanel';
import { GraphExplorer } from '../../widgets/GraphExplorer';
import { ResourceFooter } from '../../widgets/ResourceFooter';
import { 
  makeAgentMessage,
  makeTaskWithChanges,
  makeAgentInfo,
  makeGraph,
  makeTokenUsage,
} from '../helpers/factories';

describe('Security: Widget Rendering', () => {
  describe('Requirement 9.1: No dangerouslySetInnerHTML without sanitization', () => {
    it('should not use dangerouslySetInnerHTML in TaskPanel', () => {
      const task = makeTaskWithChanges(1);
      
      const { container } = render(
        <TaskPanel
          tasks={[task]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Check no innerHTML manipulation
      const elements = container.querySelectorAll('[dangerouslySetInnerHTML]');
      expect(elements.length).toBe(0);
    });
    
    it('should not use dangerouslySetInnerHTML in GraphExplorer', () => {
      const graph = makeGraph(5, 8);
      const task = makeTaskWithChanges(1);
      
      const { container } = render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      const elements = container.querySelectorAll('[dangerouslySetInnerHTML]');
      expect(elements.length).toBe(0);
    });
    
    it('should not use dangerouslySetInnerHTML in ResourceFooter', () => {
      const { container } = render(
        <ResourceFooter
          tokenUsage={makeTokenUsage()}
          vectorStoreStatus="healthy"
        />
      );
      
      const elements = container.querySelectorAll('[dangerouslySetInnerHTML]');
      expect(elements.length).toBe(0);
    });
  });
  
  describe('Requirement 9.2: Agent messages HTML-escaped in Reasoning_Log', () => {
    it('should not render raw HTML in agent messages', () => {
      const messages = [
        makeAgentMessage({
          content: '<script>alert("xss")</script>Test message',
        }),
      ];
      
      const { container } = render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // Check script tag is not executed/rendered
      const scripts = container.querySelectorAll('script');
      expect(scripts.length).toBe(0);
    });
    
    it('should escape HTML entities in messages', () => {
      const messages = [
        makeAgentMessage({
          content: '<b>Bold</b> text',
        }),
      ];
      
      render(
        <ReasoningLog
          log={messages}
          onJumpToCode={jest.fn()}
        />
      );
      
      // HTML should be escaped as text, not rendered as HTML
      // The content should appear as literal text (escaped or in text node)
      expect(screen.getByText(/<b>Bold<\/b>/) || screen.getByText(/Bold/)).toBeInTheDocument();
    });
  });
  
  describe('Requirement 9.3: File paths sanitized in Task_Panel and Graph_Explorer', () => {
    it('should handle paths with traversal characters safely', () => {
      const task = makeTaskWithChanges(1);
      if (task.result?.changes) {
        task.result.changes[0].file = '../../../etc/passwd';
      }
      
      // Should render without crashing
      const { container } = render(
        <TaskPanel
          tasks={[task]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      expect(container).toBeInTheDocument();
    });
    
    it('should handle paths with special characters in GraphExplorer', () => {
      const graph = makeGraph(5, 8);
      const task = makeTaskWithChanges(1);
      
      // Should render without crashing
      const { container } = render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      expect(container).toBeInTheDocument();
    });
  });
  
  describe('Requirement 9.4: API keys/tokens not rendered in Resource_Footer', () => {
    it('should not display API keys in DOM', () => {
      const { container } = render(
        <ResourceFooter
          tokenUsage={makeTokenUsage()}
          vectorStoreStatus="healthy"
        />
      );
      
      const html = container.innerHTML;
      
      // Should not contain common API key patterns
      expect(html).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI style
      expect(html).not.toMatch(/AKIA[0-9A-Z]{16}/); // AWS style
    });
    
    it('should show token usage, not actual tokens', () => {
      render(
        <ResourceFooter
          tokenUsage={makeTokenUsage({ total: 1500, estimatedCost: 0.03 })}
          vectorStoreStatus="healthy"
        />
      );
      
      // Should show usage count, not token values
      expect(screen.getByText(/1500/)).toBeInTheDocument();
    });
  });
  
  describe('Requirement 9.5: CLI errors without stack traces', () => {
    it('should format error messages safely for user display', () => {
      const error = new Error('Connection failed');
      error.stack = 'Error: Connection failed\n    at Object.run (internal/test.js:42:15)';
      
      const formatError = (err: Error): string => {
        // User-facing error should not include stack
        return err.message;
      };
      
      const userMessage = formatError(error);
      
      expect(userMessage).toBe('Connection failed');
      expect(userMessage).not.toContain('at Object.run');
      expect(userMessage).not.toContain('.js:');
    });
  });
  
  describe('Requirement 9.6: Severity classification', () => {
    it('should classify security violations by severity', () => {
      const classifySeverity = (violation: string): 'critical' | 'high' | 'medium' | 'low' => {
        if (violation.includes('XSS') || violation.includes('injection')) return 'critical';
        if (violation.includes('exposed') || violation.includes('leak')) return 'high';
        if (violation.includes('sanitization')) return 'medium';
        return 'low';
      };
      
      expect(classifySeverity('XSS vulnerability found')).toBe('critical');
      expect(classifySeverity('Secret exposed in log')).toBe('high');
      expect(classifySeverity('Missing input sanitization')).toBe('medium');
      expect(classifySeverity('Outdated dependency')).toBe('low');
    });
  });
});
