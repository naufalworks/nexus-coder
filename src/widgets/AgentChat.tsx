import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChatSession,
  ChatMessage,
  ChatCommand,
  CodeReference,
  StreamChunk,
} from '../types/chat';
import { AgentInfo } from '../agents/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentChatWidgetProps {
  /** Current chat session */
  session: ChatSession | null;
  /** Available agents to chat with */
  availableAgents: AgentInfo[];
  /** Whether a message is currently streaming */
  isStreaming?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback when a new message is sent */
  onSendMessage?: (command: ChatCommand) => void;
  /** Callback when a code reference is clicked */
  onCodeReference?: (ref: CodeReference) => void;
  /** Callback when a graph node reference is clicked */
  onNodeReference?: (nodeId: string) => void;
  /** Callback when agent is selected */
  onAgentSelect?: (agentName: string) => void;
  /** Callback to create a new session */
  onCreateSession?: (agentName: string) => void;
}

// ---------------------------------------------------------------------------
// Helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Format timestamp for display.
 */
export function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'just now';
  }
}

/**
 * Format code reference for display.
 */
export function formatCodeReference(ref: CodeReference): string {
  if (ref.startLine === ref.endLine) {
    return `${ref.file}:${ref.startLine}`;
  }
  return `${ref.file}:${ref.startLine}-${ref.endLine}`;
}

/**
 * Parse markdown-style code references from message content.
 * Looks for patterns like `file.ts:10` or `file.ts:10-20`
 */
export function parseCodeReferences(content: string): Array<{ text: string; isReference: boolean; file?: string; line?: number }> {
  const parts: Array<{ text: string; isReference: boolean; file?: string; line?: number }> = [];
  const codeRefPattern = /`([^`]+\.(ts|tsx|js|jsx|py|java|cpp|c|h|go|rs|rb|php|cs|swift|kt|scala|sh|md|json|yaml|yml|xml|html|css|scss|sql)):(\d+)(?:-(\d+))?`/g;
  
  let lastIndex = 0;
  let match;

  while ((match = codeRefPattern.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        text: content.substring(lastIndex, match.index),
        isReference: false,
      });
    }

    // Add the code reference
    parts.push({
      text: match[0],
      isReference: true,
      file: match[1],
      line: parseInt(match[3], 10),
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      text: content.substring(lastIndex),
      isReference: false,
    });
  }

  return parts.length > 0 ? parts : [{ text: content, isReference: false }];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Code reference link */
const CodeReferenceLink: React.FC<{
  reference: CodeReference;
  onCodeReference?: (ref: CodeReference) => void;
}> = React.memo(({ reference, onCodeReference }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onCodeReference?.(reference);
  }, [onCodeReference, reference]);

  return (
    <a
      href="#"
      className="code-reference-link"
      onClick={handleClick}
      title={`${reference.file}:${reference.startLine}-${reference.endLine}`}
    >
      {formatCodeReference(reference)}
    </a>
  );
});
CodeReferenceLink.displayName = 'CodeReferenceLink';

/** Graph node reference link */
const NodeReferenceLink: React.FC<{
  nodeId: string;
  onNodeReference?: (nodeId: string) => void;
}> = React.memo(({ nodeId, onNodeReference }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onNodeReference?.(nodeId);
  }, [onNodeReference, nodeId]);

  return (
    <a
      href="#"
      className="node-reference-link"
      onClick={handleClick}
      title={`Graph node: ${nodeId}`}
    >
      {nodeId}
    </a>
  );
});
NodeReferenceLink.displayName = 'NodeReferenceLink';

/** Single chat message */
const ChatMessageItem: React.FC<{
  message: ChatMessage;
  onCodeReference?: (ref: CodeReference) => void;
  onNodeReference?: (nodeId: string) => void;
}> = React.memo(({ message, onCodeReference, onNodeReference }) => {
  const roleLabel = message.role === 'user' ? 'You' : message.agentName || 'Agent';
  const contentParts = useMemo(() => parseCodeReferences(message.content), [message.content]);

  return (
    <div
      className={`chat-message chat-message-${message.role}`}
      data-message-id={message.id}
      data-role={message.role}
      data-streaming={message.isStreaming}
    >
      <div className="chat-message-header">
        <span className="chat-message-role">{roleLabel}</span>
        <span className="chat-message-timestamp">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      <div className="chat-message-content">
        {contentParts.map((part, index) => {
          if (part.isReference && part.file && part.line) {
            const ref: CodeReference = {
              file: part.file,
              startLine: part.line,
              endLine: part.line,
              content: '',
              language: part.file.split('.').pop() || 'text',
            };
            return (
              <CodeReferenceLink
                key={index}
                reference={ref}
                onCodeReference={onCodeReference}
              />
            );
          }
          return <span key={index}>{part.text}</span>;
        })}
      </div>
      {message.codeReferences.length > 0 && (
        <div className="chat-message-references">
          <div className="chat-message-references-label">Code References:</div>
          {message.codeReferences.map((ref, index) => (
            <CodeReferenceLink
              key={index}
              reference={ref}
              onCodeReference={onCodeReference}
            />
          ))}
        </div>
      )}
      {message.graphNodeIds.length > 0 && (
        <div className="chat-message-node-references">
          <div className="chat-message-references-label">Graph Nodes:</div>
          {message.graphNodeIds.map((nodeId, index) => (
            <NodeReferenceLink
              key={index}
              nodeId={nodeId}
              onNodeReference={onNodeReference}
            />
          ))}
        </div>
      )}
      {message.isStreaming && (
        <div className="chat-message-streaming-indicator">
          <span className="streaming-dot"></span>
          <span className="streaming-dot"></span>
          <span className="streaming-dot"></span>
        </div>
      )}
    </div>
  );
});
ChatMessageItem.displayName = 'ChatMessageItem';

/** Agent selector bar */
const AgentSelectorBar: React.FC<{
  availableAgents: AgentInfo[];
  selectedAgent: string | null;
  onAgentSelect?: (agentName: string) => void;
}> = React.memo(({ availableAgents, selectedAgent, onAgentSelect }) => {
  const handleAgentClick = useCallback((agentName: string) => {
    onAgentSelect?.(agentName);
  }, [onAgentSelect]);

  return (
    <div className="agent-selector-bar">
      <div className="agent-selector-label">Agent:</div>
      <div className="agent-selector-list">
        {availableAgents.map(agent => (
          <button
            key={agent.name}
            className={`agent-selector-button ${selectedAgent === agent.name ? 'agent-selected' : ''}`}
            onClick={() => handleAgentClick(agent.name)}
            aria-label={`Select ${agent.name}`}
            data-agent-name={agent.name}
          >
            {agent.name}
          </button>
        ))}
      </div>
    </div>
  );
});
AgentSelectorBar.displayName = 'AgentSelectorBar';

/** Chat input form */
const ChatInputForm: React.FC<{
  onSendMessage?: (command: ChatCommand) => void;
  isStreaming?: boolean;
  disabled?: boolean;
}> = React.memo(({ onSendMessage, isStreaming, disabled }) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && onSendMessage && !isStreaming && !disabled) {
      const command: ChatCommand = {
        type: 'message',
        content: inputText.trim(),
      };
      onSendMessage(command);
      setInputText('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [inputText, onSendMessage, isStreaming, disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }, [handleSubmit]);

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="chat-input"
        placeholder="Type a message... (Shift+Enter for new line)"
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={isStreaming || disabled}
        aria-label="Chat message input"
        rows={1}
      />
      <button
        type="submit"
        className="chat-send-button"
        disabled={isStreaming || disabled || !inputText.trim()}
        aria-label="Send message"
      >
        {isStreaming ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
});
ChatInputForm.displayName = 'ChatInputForm';

// ---------------------------------------------------------------------------
// Main AgentChat Component
// ---------------------------------------------------------------------------

export const AgentChat: React.FC<AgentChatWidgetProps> = ({
  session,
  availableAgents,
  isStreaming = false,
  error = null,
  onSendMessage,
  onCodeReference,
  onNodeReference,
  onAgentSelect,
  onCreateSession,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(
    session?.agentName || (availableAgents.length > 0 ? availableAgents[0].name : null)
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  const handleAgentSelect = useCallback((agentName: string) => {
    setSelectedAgent(agentName);
    onAgentSelect?.(agentName);
    
    // Create new session if no active session
    if (!session && onCreateSession) {
      onCreateSession(agentName);
    }
  }, [session, onAgentSelect, onCreateSession]);

  const handleSendMessage = useCallback((command: ChatCommand) => {
    // Create session if needed
    if (!session && selectedAgent && onCreateSession) {
      onCreateSession(selectedAgent);
    }
    
    onSendMessage?.(command);
  }, [session, selectedAgent, onSendMessage, onCreateSession]);

  const noSession = !session;
  const noAgents = availableAgents.length === 0;

  return (
    <div className="agent-chat-widget">
      <div className="agent-chat-header">
        <h2>Agent Chat</h2>
        {session && (
          <div className="agent-chat-session-info">
            Session with {session.agentName}
          </div>
        )}
      </div>

      {/* Agent Selector Bar */}
      <AgentSelectorBar
        availableAgents={availableAgents}
        selectedAgent={selectedAgent}
        onAgentSelect={handleAgentSelect}
      />

      {/* Error Display */}
      {error && (
        <div className="chat-error" role="alert">
          {error}
        </div>
      )}

      {/* No Agents Warning */}
      {noAgents && (
        <div className="chat-no-agents" role="alert">
          No agents available. Please register an agent first.
        </div>
      )}

      {/* Message List */}
      <div className="chat-message-list">
        {noSession && !noAgents && (
          <div className="chat-welcome-message">
            <p>Select an agent and start chatting!</p>
          </div>
        )}
        {session?.messages.map(message => (
          <ChatMessageItem
            key={message.id}
            message={message}
            onCodeReference={onCodeReference}
            onNodeReference={onNodeReference}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <ChatInputForm
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
        disabled={noAgents || (!session && !selectedAgent)}
      />
    </div>
  );
};
