import React, { useState } from 'react';
import { AgentMessage } from '../types';

export interface ReasoningLogProps {
  log: AgentMessage[];
  filter?: { agent?: string; keyword?: string };
  onJumpToCode?: (file: string, line?: number) => void;
}

export const ReasoningLog: React.FC<ReasoningLogProps> = ({ log, filter, onJumpToCode }) => {
  const [agentFilter, setAgentFilter] = useState<string>(filter?.agent || '');
  const [keywordFilter, setKeywordFilter] = useState<string>(filter?.keyword || '');

  // Apply filters to log entries
  const filteredLog = log.filter(m => {
    const agentMatch = agentFilter ? m.agent === agentFilter : true;
    const keywordMatch = keywordFilter 
      ? m.content.toLowerCase().includes(keywordFilter.toLowerCase())
      : true;
    return agentMatch && keywordMatch;
  });

  // Extract unique agents for filter dropdown
  const uniqueAgents = Array.from(new Set(log.map(m => m.agent)));

  // Handle jump to code action
  const handleJumpToCode = (message: AgentMessage) => {
    if (!onJumpToCode) return;
    
    const metadata = message.metadata;
    if (metadata && typeof metadata === 'object') {
      const file = metadata.file as string | undefined;
      const line = metadata.line as number | undefined;
      
      if (file) {
        onJumpToCode(file, line);
      }
    }
  };

  // Check if a log entry has code reference
  const hasCodeReference = (message: AgentMessage): boolean => {
    return !!(message.metadata && typeof message.metadata === 'object' && message.metadata.file);
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: Date): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="reasoning-log">
      <div className="reasoning-log-header">
        <h2>Reasoning Log</h2>
        <div className="reasoning-log-filters">
          <select 
            value={agentFilter} 
            onChange={(e) => setAgentFilter(e.target.value)}
            className="agent-filter"
            aria-label="Filter by agent name"
          >
            <option value="">All Agents</option>
            {uniqueAgents.map(agent => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by keyword..."
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            className="keyword-filter"
          />
        </div>
      </div>
      <div className="reasoning-log-entries">
        {filteredLog.length === 0 ? (
          <div className="no-entries">No log entries found</div>
        ) : (
          <ul aria-label="Agent reasoning log entries">
            {filteredLog.map((m, i) => (
              <li key={i} className="log-entry">
                <div className="log-entry-header">
                  <strong className="agent-name">{m.agent}</strong>
                  <span className="timestamp">{formatTimestamp(m.timestamp)}</span>
                </div>
                <div className="log-entry-content">{m.content}</div>
                {hasCodeReference(m) && (
                  <button 
                    className="jump-to-code-btn"
                    onClick={() => handleJumpToCode(m)}
                  >
                    Jump to Code
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
