/**
 * Unit tests for AgentChat widget
 *
 * Tests rendering of chat input, message list, agent selector,
 * streaming message display, code reference click handling,
 * agent selection, and render performance.
 *
 * Requirements: 32.5
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AgentChat,
  AgentChatWidgetProps,
  formatTimestamp,
  formatCodeReference,
  parseCodeReferences,
} from './AgentChat';
import { ChatSession, ChatMessage, ChatCommand, CodeReference } from '../types/chat';
import { AgentInfo } from '../agents/registry';
import { AgentCapability, TaskType } from '../types';

// Mock scrollIntoView for JSDOM
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockAgent1: AgentInfo = {
  name: 'test-agent-1',
  capabilities: [AgentCapability.CODE_ANALYSIS],
  supportedTaskTypes: [TaskType.FEATURE],
  execute: jest.fn(),
};

const mockAgent2: AgentInfo = {
  name: 'test-agent-2',
  capabilities: [AgentCapability.CODE_GENERATION],
  supportedTaskTypes: [TaskType.BUG_FIX],
  execute: jest.fn(),
};

const mockMessage1: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello, agent!',
  timestamp: new Date('2026-04-29T07:00:00Z'),
  codeReferences: [],
  graphNodeIds: [],
  isStreaming: false,
};

const mockMessage2: ChatMessage = {
  id: 'msg-2',
  role: 'agent',
  agentName: 'test-agent-1',
  content: 'Hello! How can I help you?',
  timestamp: new Date('2026-04-29T07:00:05Z'),
  codeReferences: [],
  graphNodeIds: [],
  isStreaming: false,
};

const mockStreamingMessage: ChatMessage = {
  id: 'msg-3',
  role: 'agent',
  agentName: 'test-agent-1',
  content: 'I am currently typing...',
  timestamp: new Date('2026-04-29T07:00:10Z'),
  codeReferences: [],
  graphNodeIds: [],
  isStreaming: true,
};

const mockCodeReference: CodeReference = {
  file: 'src/test.ts',
  startLine: 10,
  endLine: 20,
  content: 'const x = 42;',
  language: 'typescript',
};

const mockSession: ChatSession = {
  id: 'session-1',
  agentName: 'test-agent-1',
  messages: [mockMessage1, mockMessage2],
  createdAt: new Date('2026-04-29T07:00:00Z'),
  updatedAt: new Date('2026-04-29T07:00:05Z'),
  contextFiles: [],
  contextNodeIds: [],
  status: 'active',
};

// ---------------------------------------------------------------------------
// Helper Function Tests
// ---------------------------------------------------------------------------

describe('Helper Functions', () => {
  describe('formatTimestamp', () => {
    it('should format recent timestamp as "just now"', () => {
      const now = new Date();
      expect(formatTimestamp(now)).toBe('just now');
    });

    it('should format timestamp from 5 minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatTimestamp(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should format timestamp from 2 hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatTimestamp(twoHoursAgo)).toBe('2h ago');
    });

    it('should format timestamp from 3 days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatTimestamp(threeDaysAgo)).toBe('3d ago');
    });
  });

  describe('formatCodeReference', () => {
    it('should format single-line reference', () => {
      const ref: CodeReference = {
        file: 'src/test.ts',
        startLine: 10,
        endLine: 10,
        content: '',
        language: 'typescript',
      };
      expect(formatCodeReference(ref)).toBe('src/test.ts:10');
    });

    it('should format multi-line reference', () => {
      const ref: CodeReference = {
        file: 'src/test.ts',
        startLine: 10,
        endLine: 20,
        content: '',
        language: 'typescript',
      };
      expect(formatCodeReference(ref)).toBe('src/test.ts:10-20');
    });
  });

  describe('parseCodeReferences', () => {
    it('should parse content without code references', () => {
      const content = 'This is plain text';
      const parts = parseCodeReferences(content);
      
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe('This is plain text');
      expect(parts[0].isReference).toBe(false);
    });

    it('should parse content with code reference', () => {
      const content = 'Check `src/test.ts:10` for details';
      const parts = parseCodeReferences(content);
      
      expect(parts.length).toBeGreaterThan(1);
      const refPart = parts.find(p => p.isReference);
      expect(refPart).toBeDefined();
      expect(refPart?.file).toBe('src/test.ts');
      expect(refPart?.line).toBe(10);
    });

    it('should parse content with line range reference', () => {
      const content = 'See `src/test.ts:10-20` for implementation';
      const parts = parseCodeReferences(content);
      
      const refPart = parts.find(p => p.isReference);
      expect(refPart).toBeDefined();
      expect(refPart?.file).toBe('src/test.ts');
      expect(refPart?.line).toBe(10);
    });

    it('should parse multiple code references', () => {
      const content = 'Check `src/a.ts:10` and `src/b.ts:20`';
      const parts = parseCodeReferences(content);
      
      const refParts = parts.filter(p => p.isReference);
      expect(refParts).toHaveLength(2);
      expect(refParts[0].file).toBe('src/a.ts');
      expect(refParts[1].file).toBe('src/b.ts');
    });
  });
});

// ---------------------------------------------------------------------------
// Component Tests
// ---------------------------------------------------------------------------

describe('AgentChat Widget', () => {
  const defaultProps: AgentChatWidgetProps = {
    session: null,
    availableAgents: [mockAgent1, mockAgent2],
    isStreaming: false,
    error: null,
    onSendMessage: jest.fn(),
    onCodeReference: jest.fn(),
    onNodeReference: jest.fn(),
    onAgentSelect: jest.fn(),
    onCreateSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering Tests
  // -------------------------------------------------------------------------

  describe('Rendering', () => {
    it('should render chat widget with header', () => {
      render(<AgentChat {...defaultProps} />);
      
      expect(screen.getByText('Agent Chat')).toBeInTheDocument();
    });

    it('should render agent selector bar', () => {
      render(<AgentChat {...defaultProps} />);
      
      expect(screen.getByText('Agent:')).toBeInTheDocument();
      expect(screen.getByLabelText('Select test-agent-1')).toBeInTheDocument();
      expect(screen.getByLabelText('Select test-agent-2')).toBeInTheDocument();
    });

    it('should render welcome message when no session', () => {
      render(<AgentChat {...defaultProps} />);
      
      expect(screen.getByText('Select an agent and start chatting!')).toBeInTheDocument();
    });

    it('should render chat input', () => {
      render(<AgentChat {...defaultProps} />);
      
      expect(screen.getByLabelText('Chat message input')).toBeInTheDocument();
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('should render session info when session exists', () => {
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      expect(screen.getByText('Session with test-agent-1')).toBeInTheDocument();
    });

    it('should render message list with messages', () => {
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    });

    it('should render error message when error exists', () => {
      render(<AgentChat {...defaultProps} error="Test error message" />);
      
      expect(screen.getByRole('alert')).toHaveTextContent('Test error message');
    });

    it('should render no agents warning when no agents available', () => {
      render(<AgentChat {...defaultProps} availableAgents={[]} />);
      
      expect(screen.getByText('No agents available. Please register an agent first.')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Message Display Tests
  // -------------------------------------------------------------------------

  describe('Message Display', () => {
    it('should display user messages with "You" label', () => {
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      const userMessages = screen.getAllByText('You');
      expect(userMessages.length).toBeGreaterThan(0);
    });

    it('should display agent messages with agent name', () => {
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      // The agent name appears in both the selector and the message header
      const agentNameElements = screen.getAllByText('test-agent-1');
      expect(agentNameElements.length).toBeGreaterThanOrEqual(2);
    });

    it('should display message timestamps', () => {
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      // Timestamps should be rendered (format depends on current time)
      const timestamps = screen.getAllByText(/ago|just now/);
      expect(timestamps.length).toBeGreaterThan(0);
    });

    it('should display streaming indicator for streaming messages', () => {
      const sessionWithStreaming: ChatSession = {
        ...mockSession,
        messages: [...mockSession.messages, mockStreamingMessage],
      };
      
      render(<AgentChat {...defaultProps} session={sessionWithStreaming} />);
      
      const streamingMessage = screen.getByText('I am currently typing...');
      expect(streamingMessage).toBeInTheDocument();
      
      // Check for streaming indicator (dots)
      const messageElement = streamingMessage.closest('.chat-message');
      expect(messageElement?.querySelector('.chat-message-streaming-indicator')).toBeInTheDocument();
    });

    it('should display code references', () => {
      const messageWithCodeRef: ChatMessage = {
        ...mockMessage2,
        codeReferences: [mockCodeReference],
      };
      
      const sessionWithCodeRef: ChatSession = {
        ...mockSession,
        messages: [mockMessage1, messageWithCodeRef],
      };
      
      render(<AgentChat {...defaultProps} session={sessionWithCodeRef} />);
      
      expect(screen.getByText('Code References:')).toBeInTheDocument();
      expect(screen.getByText('src/test.ts:10-20')).toBeInTheDocument();
    });

    it('should display graph node references', () => {
      const messageWithNodeRef: ChatMessage = {
        ...mockMessage2,
        graphNodeIds: ['node-1', 'node-2'],
      };
      
      const sessionWithNodeRef: ChatSession = {
        ...mockSession,
        messages: [mockMessage1, messageWithNodeRef],
      };
      
      render(<AgentChat {...defaultProps} session={sessionWithNodeRef} />);
      
      expect(screen.getByText('Graph Nodes:')).toBeInTheDocument();
      expect(screen.getByText('node-1')).toBeInTheDocument();
      expect(screen.getByText('node-2')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Interaction Tests
  // -------------------------------------------------------------------------

  describe('Interactions', () => {
    it('should call onAgentSelect when agent is clicked', () => {
      const onAgentSelect = jest.fn();
      render(<AgentChat {...defaultProps} onAgentSelect={onAgentSelect} />);
      
      const agentButton = screen.getByLabelText('Select test-agent-2');
      fireEvent.click(agentButton);
      
      expect(onAgentSelect).toHaveBeenCalledWith('test-agent-2');
    });

    it('should call onSendMessage when message is submitted', () => {
      const onSendMessage = jest.fn();
      render(<AgentChat {...defaultProps} session={mockSession} onSendMessage={onSendMessage} />);
      
      const input = screen.getByLabelText('Chat message input');
      const sendButton = screen.getByLabelText('Send message');
      
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      
      expect(onSendMessage).toHaveBeenCalledWith({
        type: 'message',
        content: 'Test message',
      });
    });

    it('should submit message on Enter key', () => {
      const onSendMessage = jest.fn();
      render(<AgentChat {...defaultProps} session={mockSession} onSendMessage={onSendMessage} />);
      
      const input = screen.getByLabelText('Chat message input') as HTMLTextAreaElement;
      
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      
      expect(onSendMessage).toHaveBeenCalledWith({
        type: 'message',
        content: 'Test message',
      });
    });

    it('should not submit message on Shift+Enter', () => {
      const onSendMessage = jest.fn();
      render(<AgentChat {...defaultProps} session={mockSession} onSendMessage={onSendMessage} />);
      
      const input = screen.getByLabelText('Chat message input') as HTMLTextAreaElement;
      
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('should call onCodeReference when code reference is clicked', () => {
      const onCodeReference = jest.fn();
      const messageWithCodeRef: ChatMessage = {
        ...mockMessage2,
        codeReferences: [mockCodeReference],
      };
      
      const sessionWithCodeRef: ChatSession = {
        ...mockSession,
        messages: [mockMessage1, messageWithCodeRef],
      };
      
      render(<AgentChat {...defaultProps} session={sessionWithCodeRef} onCodeReference={onCodeReference} />);
      
      const codeRefLink = screen.getByText('src/test.ts:10-20');
      fireEvent.click(codeRefLink);
      
      expect(onCodeReference).toHaveBeenCalledWith(mockCodeReference);
    });

    it('should call onNodeReference when node reference is clicked', () => {
      const onNodeReference = jest.fn();
      const messageWithNodeRef: ChatMessage = {
        ...mockMessage2,
        graphNodeIds: ['node-1'],
      };
      
      const sessionWithNodeRef: ChatSession = {
        ...mockSession,
        messages: [mockMessage1, messageWithNodeRef],
      };
      
      render(<AgentChat {...defaultProps} session={sessionWithNodeRef} onNodeReference={onNodeReference} />);
      
      const nodeRefLink = screen.getByText('node-1');
      fireEvent.click(nodeRefLink);
      
      expect(onNodeReference).toHaveBeenCalledWith('node-1');
    });

    it('should disable input when streaming', () => {
      render(<AgentChat {...defaultProps} session={mockSession} isStreaming={true} />);
      
      const input = screen.getByLabelText('Chat message input');
      const sendButton = screen.getByLabelText('Send message');
      
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('should disable input when no agents available', () => {
      render(<AgentChat {...defaultProps} availableAgents={[]} />);
      
      const input = screen.getByLabelText('Chat message input');
      const sendButton = screen.getByLabelText('Send message');
      
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('should clear input after sending message', () => {
      const onSendMessage = jest.fn();
      render(<AgentChat {...defaultProps} session={mockSession} onSendMessage={onSendMessage} />);
      
      const input = screen.getByLabelText('Chat message input') as HTMLTextAreaElement;
      const sendButton = screen.getByLabelText('Send message');
      
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      
      expect(input.value).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    it('should render within 100ms budget', () => {
      const startTime = performance.now();
      
      render(<AgentChat {...defaultProps} session={mockSession} />);
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Allow 300ms for JSDOM (3x budget)
      expect(renderTime).toBeLessThan(300);
    });

    it('should render with many messages within budget', () => {
      const manyMessages: ChatMessage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'agent',
        agentName: i % 2 === 0 ? undefined : 'test-agent-1',
        content: `Message ${i}`,
        timestamp: new Date(),
        codeReferences: [],
        graphNodeIds: [],
        isStreaming: false,
      }));
      
      const sessionWithManyMessages: ChatSession = {
        ...mockSession,
        messages: manyMessages,
      };
      
      const startTime = performance.now();
      
      render(<AgentChat {...defaultProps} session={sessionWithManyMessages} />);
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Allow 600ms for JSDOM with 100 messages (6x budget)
      expect(renderTime).toBeLessThan(600);
    });
  });
});
