import React, { useState, useMemo } from 'react';
import { CodeChange, Task } from '../types';

export interface DiffApprovalProps {
  changes: CodeChange[];
  tasks?: Task[];
  onApprove: (changeId: string) => Promise<void>;
  onReject: (changeId: string) => Promise<void>;
  onExplain: (changeId: string) => Promise<string>;
}

export interface GroupedChanges {
  taskId: string;
  taskInstruction: string;
  changes: CodeChange[];
}

/**
 * Group changes by their logical task.
 * If tasks are provided, group by task.id based on matching changes.
 * Otherwise, group by file as a fallback.
 * 
 * Validates: Requirements 2.1
 */
export function groupChangesByTask(
  changes: CodeChange[],
  tasks?: Task[]
): GroupedChanges[] {
  if (!tasks || tasks.length === 0) {
    // Fallback: group by file
    const grouped = new Map<string, CodeChange[]>();
    changes.forEach(change => {
      const existing = grouped.get(change.file) || [];
      grouped.set(change.file, [...existing, change]);
    });
    
    return Array.from(grouped.entries()).map(([file, changes]) => ({
      taskId: file,
      taskInstruction: `Changes to ${file}`,
      changes,
    }));
  }

  // Group by task: match changes to tasks based on result.changes
  const grouped = new Map<string, GroupedChanges>();
  
  tasks.forEach(task => {
    const taskChanges = task.result?.changes || [];
    const matchingChanges = changes.filter(change =>
      taskChanges.some(tc => tc.file === change.file && tc.type === change.type)
    );
    
    if (matchingChanges.length > 0) {
      grouped.set(task.id, {
        taskId: task.id,
        taskInstruction: task.instruction,
        changes: matchingChanges,
      });
    }
  });

  // Handle ungrouped changes
  const groupedChangeFiles = new Set(
    Array.from(grouped.values()).flatMap(g => g.changes.map(c => c.file))
  );
  const ungroupedChanges = changes.filter(c => !groupedChangeFiles.has(c.file));
  
  if (ungroupedChanges.length > 0) {
    grouped.set('ungrouped', {
      taskId: 'ungrouped',
      taskInstruction: 'Ungrouped changes',
      changes: ungroupedChanges,
    });
  }

  return Array.from(grouped.values());
}

/**
 * Parse diff string into lines for two-column display.
 * Returns { oldLines, newLines } for side-by-side view.
 */
export function parseDiffToColumns(diff: string): {
  oldLines: string[];
  newLines: string[];
} {
  const lines = diff.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];

  lines.forEach(line => {
    if (line.startsWith('-') && !line.startsWith('---')) {
      oldLines.push(line.substring(1));
      newLines.push('');
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      oldLines.push('');
      newLines.push(line.substring(1));
    } else if (!line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++')) {
      oldLines.push(line);
      newLines.push(line);
    }
  });

  return { oldLines, newLines };
}

/**
 * Calculate impact summary from changes.
 */
export function calculateImpactSummary(changes: CodeChange[]): string {
  const files = new Set(changes.map(c => c.file));
  const risks = changes.map(c => c.risk);
  const highestRisk = risks.includes('high') ? 'high' : risks.includes('medium') ? 'medium' : 'low';
  
  return `${files.size} file(s), ${changes.length} change(s), risk: ${highestRisk}`;
}

export const DiffApproval: React.FC<DiffApprovalProps> = ({
  changes,
  tasks,
  onApprove,
  onReject,
  onExplain,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<{ [key: string]: string }>({});

  const groupedChanges = useMemo(
    () => groupChangesByTask(changes, tasks),
    [changes, tasks]
  );

  const handleApprove = async (changeId: string) => {
    setLoading(changeId);
    setError(null);
    try {
      await onApprove(changeId);
    } catch (err) {
      setError(`Failed to approve change: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (changeId: string) => {
    setLoading(changeId);
    setError(null);
    try {
      await onReject(changeId);
    } catch (err) {
      setError(`Failed to reject change: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  const handleExplain = async (changeId: string) => {
    setLoading(changeId);
    setError(null);
    try {
      const result = await onExplain(changeId);
      setExplanation(prev => ({ ...prev, [changeId]: result }));
    } catch (err) {
      setError(`Failed to get explanation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="diff-approval">
      <h2>Code Changes</h2>
      
      {error && (
        <div className="diff-error" role="alert">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {groupedChanges.map(group => (
        <div key={group.taskId} className="diff-group" data-task-id={group.taskId}>
          <h3 className="diff-group-header">{group.taskInstruction}</h3>
          <div className="diff-group-summary">
            {calculateImpactSummary(group.changes)}
          </div>

          {group.changes.map((change, idx) => {
            const changeId = `${change.file}-${idx}`;
            const { oldLines, newLines } = parseDiffToColumns(change.diff);
            const isLoading = loading === changeId;

            return (
              <div key={changeId} className="diff-entry" data-change-id={changeId}>
                <div className="diff-header">
                  <span className="diff-file">{change.file}</span>
                  <span className={`diff-type type-${change.type}`}>{change.type}</span>
                  <span className={`diff-risk risk-${change.risk}`}>{change.risk} risk</span>
                </div>

                <div className="diff-reasoning">{change.reasoning}</div>

                <div className="diff-impact">
                  <strong>Impact:</strong> {change.impact.join(', ')}
                </div>

                <div className="diff-content-two-column">
                  <div className="diff-column diff-old">
                    <div className="diff-column-header">Before</div>
                    {oldLines.map((line, i) => (
                      <div key={i} className={`diff-line ${line === '' ? 'diff-line-empty' : ''}`}>
                        {line || '\u00A0'}
                      </div>
                    ))}
                  </div>
                  <div className="diff-column diff-new">
                    <div className="diff-column-header">After</div>
                    {newLines.map((line, i) => (
                      <div key={i} className={`diff-line ${line === '' ? 'diff-line-empty' : ''}`}>
                        {line || '\u00A0'}
                      </div>
                    ))}
                  </div>
                </div>

                {explanation[changeId] && (
                  <div className="diff-explanation">
                    <strong>Explanation:</strong> {explanation[changeId]}
                  </div>
                )}

                <div className="diff-actions">
                  <button
                    onClick={() => handleApprove(changeId)}
                    disabled={isLoading || change.approved}
                    className="diff-action-approve"
                  >
                    {isLoading ? 'Processing...' : change.approved ? 'Approved' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(changeId)}
                    disabled={isLoading}
                    className="diff-action-reject"
                  >
                    {isLoading ? 'Processing...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleExplain(changeId)}
                    disabled={isLoading}
                    className="diff-action-explain"
                  >
                    {isLoading ? 'Loading...' : 'Explain'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
