import React, { useState, useMemo, useCallback } from 'react';
import {
  ImpactAnalysis as ImpactAnalysisType,
  ImpactNode,
  ImpactSeverity,
  AffectedFile,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpactAnalysisWidgetProps {
  analysis: ImpactAnalysisType | null;
  isAnalyzing: boolean;
  onNodeSelect?: (nodeId: string) => void;
  onAnalyzeNode?: (nodeId: string) => void;
  onAnalyzeChange?: (change: any) => void;
  viewMode?: 'tree' | 'butterfly' | 'list';
  onViewModeChange?: (mode: 'tree' | 'butterfly' | 'list') => void;
}

// ---------------------------------------------------------------------------
// Helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Get color for severity level.
 */
export function getSeverityColor(severity: ImpactSeverity): string {
  switch (severity) {
    case ImpactSeverity.CRITICAL:
      return '#ef4444'; // red
    case ImpactSeverity.HIGH:
      return '#f97316'; // orange
    case ImpactSeverity.MEDIUM:
      return '#eab308'; // yellow
    case ImpactSeverity.LOW:
      return '#3b82f6'; // blue
    case ImpactSeverity.INFO:
      return '#6b7280'; // gray
    default:
      return '#6b7280';
  }
}

/**
 * Get emoji for severity level.
 */
export function getSeverityEmoji(severity: ImpactSeverity): string {
  switch (severity) {
    case ImpactSeverity.CRITICAL:
      return '🔴';
    case ImpactSeverity.HIGH:
      return '🟠';
    case ImpactSeverity.MEDIUM:
      return '🟡';
    case ImpactSeverity.LOW:
      return '🔵';
    case ImpactSeverity.INFO:
      return '⚪';
    default:
      return '⚪';
  }
}

/**
 * Group impact nodes by distance.
 */
export function groupByDistance(nodes: ImpactNode[]): Map<number, ImpactNode[]> {
  const groups = new Map<number, ImpactNode[]>();
  for (const node of nodes) {
    const existing = groups.get(node.distance) || [];
    existing.push(node);
    groups.set(node.distance, existing);
  }
  return groups;
}

/**
 * Sort nodes by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO).
 */
export function sortBySeverity(nodes: ImpactNode[]): ImpactNode[] {
  const severityOrder = {
    [ImpactSeverity.CRITICAL]: 0,
    [ImpactSeverity.HIGH]: 1,
    [ImpactSeverity.MEDIUM]: 2,
    [ImpactSeverity.LOW]: 3,
    [ImpactSeverity.INFO]: 4,
  };
  return [...nodes].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Count nodes by severity.
 */
export function countBySeverity(nodes: ImpactNode[]): Record<ImpactSeverity, number> {
  const counts: Record<ImpactSeverity, number> = {
    [ImpactSeverity.CRITICAL]: 0,
    [ImpactSeverity.HIGH]: 0,
    [ImpactSeverity.MEDIUM]: 0,
    [ImpactSeverity.LOW]: 0,
    [ImpactSeverity.INFO]: 0,
  };
  for (const node of nodes) {
    counts[node.severity]++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Severity legend */
const SeverityLegend: React.FC = React.memo(() => {
  return (
    <div className="severity-legend">
      <div className="severity-legend-item">
        <span style={{ color: getSeverityColor(ImpactSeverity.CRITICAL) }}>
          {getSeverityEmoji(ImpactSeverity.CRITICAL)} CRITICAL
        </span>
      </div>
      <div className="severity-legend-item">
        <span style={{ color: getSeverityColor(ImpactSeverity.HIGH) }}>
          {getSeverityEmoji(ImpactSeverity.HIGH)} HIGH
        </span>
      </div>
      <div className="severity-legend-item">
        <span style={{ color: getSeverityColor(ImpactSeverity.MEDIUM) }}>
          {getSeverityEmoji(ImpactSeverity.MEDIUM)} MEDIUM
        </span>
      </div>
      <div className="severity-legend-item">
        <span style={{ color: getSeverityColor(ImpactSeverity.LOW) }}>
          {getSeverityEmoji(ImpactSeverity.LOW)} LOW
        </span>
      </div>
      <div className="severity-legend-item">
        <span style={{ color: getSeverityColor(ImpactSeverity.INFO) }}>
          {getSeverityEmoji(ImpactSeverity.INFO)} INFO
        </span>
      </div>
    </div>
  );
});
SeverityLegend.displayName = 'SeverityLegend';

/** View mode selector */
const ViewModeSelector: React.FC<{
  viewMode: 'tree' | 'butterfly' | 'list';
  onViewModeChange?: (mode: 'tree' | 'butterfly' | 'list') => void;
}> = React.memo(({ viewMode, onViewModeChange }) => {
  return (
    <div className="view-mode-selector">
      <span className="view-mode-label">View Mode:</span>
      <button
        className={`view-mode-button ${viewMode === 'tree' ? 'view-mode-active' : ''}`}
        onClick={() => onViewModeChange?.('tree')}
        aria-label="Tree view"
        data-view-mode="tree"
      >
        Tree
      </button>
      <button
        className={`view-mode-button ${viewMode === 'butterfly' ? 'view-mode-active' : ''}`}
        onClick={() => onViewModeChange?.('butterfly')}
        aria-label="Butterfly view"
        data-view-mode="butterfly"
      >
        Butterfly
      </button>
      <button
        className={`view-mode-button ${viewMode === 'list' ? 'view-mode-active' : ''}`}
        onClick={() => onViewModeChange?.('list')}
        aria-label="List view"
        data-view-mode="list"
      >
        List
      </button>
    </div>
  );
});
ViewModeSelector.displayName = 'ViewModeSelector';

/** Single impact node item */
const ImpactNodeItem: React.FC<{
  impactNode: ImpactNode;
  indent?: number;
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ impactNode, indent = 0, onNodeSelect }) => {
  const { node, severity, distance, reason } = impactNode;
  const color = getSeverityColor(severity);
  const emoji = getSeverityEmoji(severity);

  const handleClick = useCallback(() => {
    onNodeSelect?.(node.id);
  }, [onNodeSelect, node.id]);

  return (
    <div
      className="impact-node-item"
      style={{ paddingLeft: `${indent * 20}px` }}
      data-node-id={node.id}
      data-severity={severity}
      data-distance={distance}
    >
      <div className="impact-node-header">
        <span className="impact-node-emoji">{emoji}</span>
        <span
          className="impact-node-name"
          style={{ color }}
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
        >
          {node.name}
        </span>
        <span className="impact-node-severity" style={{ color }}>
          ({severity.toUpperCase()})
        </span>
      </div>
      <div className="impact-node-file">{node.file}:{node.line}</div>
      {reason && <div className="impact-node-reason">{reason}</div>}
    </div>
  );
});
ImpactNodeItem.displayName = 'ImpactNodeItem';

/** Virtualized list for large impact sets */
const VirtualizedImpactList: React.FC<{
  nodes: ImpactNode[];
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ nodes, onNodeSelect }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight } = containerRef.current;
    const itemHeight = 80; // Approximate height per item
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(nodes.length, start + Math.ceil(clientHeight / itemHeight) + 10);
    setVisibleRange({ start, end });
  }, [nodes.length]);

  const visibleNodes = useMemo(() => {
    return nodes.slice(visibleRange.start, visibleRange.end);
  }, [nodes, visibleRange]);

  const totalHeight = nodes.length * 80;
  const offsetY = visibleRange.start * 80;

  return (
    <div
      ref={containerRef}
      className="virtualized-impact-list"
      onScroll={handleScroll}
      style={{ height: '600px', overflow: 'auto', position: 'relative' }}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleNodes.map((impactNode) => (
            <ImpactNodeItem
              key={impactNode.node.id}
              impactNode={impactNode}
              onNodeSelect={onNodeSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
VirtualizedImpactList.displayName = 'VirtualizedImpactList';

/** Tree view of impacts grouped by distance */
const TreeView: React.FC<{
  directImpacts: ImpactNode[];
  transitiveImpacts: ImpactNode[];
  onNodeSelect?: (nodeId: string) => void;
  useVirtualization: boolean;
}> = React.memo(({ directImpacts, transitiveImpacts, onNodeSelect, useVirtualization }) => {
  const directSorted = useMemo(() => sortBySeverity(directImpacts), [directImpacts]);
  const transitiveGrouped = useMemo(() => groupByDistance(transitiveImpacts), [transitiveImpacts]);
  const allNodes = useMemo(() => [...directImpacts, ...transitiveImpacts], [directImpacts, transitiveImpacts]);

  if (useVirtualization) {
    return <VirtualizedImpactList nodes={allNodes} onNodeSelect={onNodeSelect} />;
  }

  return (
    <div className="impact-tree-view">
      {/* Direct Impacts */}
      <div className="impact-group" data-group="direct">
        <h4>Direct Impacts (distance 1)</h4>
        {directSorted.length === 0 ? (
          <p className="impact-empty">No direct impacts</p>
        ) : (
          directSorted.map((impactNode) => (
            <ImpactNodeItem
              key={impactNode.node.id}
              impactNode={impactNode}
              indent={1}
              onNodeSelect={onNodeSelect}
            />
          ))
        )}
      </div>

      {/* Transitive Impacts */}
      <div className="impact-group" data-group="transitive">
        <h4>Transitive Impacts (distance 2+)</h4>
        {transitiveImpacts.length === 0 ? (
          <p className="impact-empty">No transitive impacts</p>
        ) : (
          Array.from(transitiveGrouped.entries())
            .sort(([a], [b]) => a - b)
            .map(([distance, nodes]) => (
              <div key={distance} className="impact-distance-group" data-distance={distance}>
                <h5>Distance {distance}</h5>
                {sortBySeverity(nodes).map((impactNode) => (
                  <ImpactNodeItem
                    key={impactNode.node.id}
                    impactNode={impactNode}
                    indent={2}
                    onNodeSelect={onNodeSelect}
                  />
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
});
TreeView.displayName = 'TreeView';

/** Butterfly view with seed in center */
const ButterflyView: React.FC<{
  directImpacts: ImpactNode[];
  transitiveImpacts: ImpactNode[];
  seedNodeId: string;
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ directImpacts, transitiveImpacts, seedNodeId, onNodeSelect }) => {
  const directSorted = useMemo(() => sortBySeverity(directImpacts), [directImpacts]);
  const transitiveSorted = useMemo(() => sortBySeverity(transitiveImpacts), [transitiveImpacts]);

  return (
    <div className="impact-butterfly-view">
      <div className="butterfly-left">
        <h4>Direct Impacts</h4>
        {directSorted.map((impactNode) => (
          <ImpactNodeItem
            key={impactNode.node.id}
            impactNode={impactNode}
            onNodeSelect={onNodeSelect}
          />
        ))}
      </div>
      <div className="butterfly-center">
        <div className="butterfly-seed" data-seed-node={seedNodeId}>
          <span className="butterfly-seed-label">Seed Change</span>
          <span className="butterfly-seed-id">{seedNodeId}</span>
        </div>
      </div>
      <div className="butterfly-right">
        <h4>Transitive Impacts</h4>
        {transitiveSorted.map((impactNode) => (
          <ImpactNodeItem
            key={impactNode.node.id}
            impactNode={impactNode}
            onNodeSelect={onNodeSelect}
          />
        ))}
      </div>
    </div>
  );
});
ButterflyView.displayName = 'ButterflyView';

/** List view sorted by severity */
const ListView: React.FC<{
  directImpacts: ImpactNode[];
  transitiveImpacts: ImpactNode[];
  onNodeSelect?: (nodeId: string) => void;
  useVirtualization: boolean;
}> = React.memo(({ directImpacts, transitiveImpacts, onNodeSelect, useVirtualization }) => {
  const allNodes = useMemo(() => {
    return sortBySeverity([...directImpacts, ...transitiveImpacts]);
  }, [directImpacts, transitiveImpacts]);

  if (useVirtualization) {
    return <VirtualizedImpactList nodes={allNodes} onNodeSelect={onNodeSelect} />;
  }

  return (
    <div className="impact-list-view">
      {allNodes.map((impactNode) => (
        <ImpactNodeItem
          key={impactNode.node.id}
          impactNode={impactNode}
          onNodeSelect={onNodeSelect}
        />
      ))}
    </div>
  );
});
ListView.displayName = 'ListView';

/** Affected files list */
const AffectedFilesList: React.FC<{
  affectedFiles: AffectedFile[];
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ affectedFiles, onNodeSelect }) => {
  if (affectedFiles.length === 0) {
    return (
      <div className="affected-files-list">
        <h3>Affected Files (0)</h3>
        <p className="impact-empty">No affected files</p>
      </div>
    );
  }

  return (
    <div className="affected-files-list">
      <h3>Affected Files ({affectedFiles.length})</h3>
      {affectedFiles.map((affectedFile, index) => {
        const color = getSeverityColor(affectedFile.highestSeverity);
        const emoji = getSeverityEmoji(affectedFile.highestSeverity);
        return (
          <div key={`${affectedFile.file}-${index}`} className="affected-file-item" data-file={affectedFile.file}>
            <div className="affected-file-header">
              <span className="affected-file-emoji">{emoji}</span>
              <span className="affected-file-name">{affectedFile.file}</span>
              <span className="affected-file-severity" style={{ color }}>
                ({affectedFile.highestSeverity.toUpperCase()}, {affectedFile.impactedNodes.length} nodes)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
AffectedFilesList.displayName = 'AffectedFilesList';

/** Affected tests list */
const AffectedTestsList: React.FC<{
  affectedTests: ImpactNode[];
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ affectedTests, onNodeSelect }) => {
  const testsByFile = useMemo(() => {
    const grouped = new Map<string, ImpactNode[]>();
    for (const test of affectedTests) {
      const existing = grouped.get(test.node.file) || [];
      existing.push(test);
      grouped.set(test.node.file, existing);
    }
    return grouped;
  }, [affectedTests]);

  if (affectedTests.length === 0) {
    return (
      <div className="affected-tests-list">
        <h3>Affected Tests (0)</h3>
        <p className="impact-empty">No affected tests</p>
      </div>
    );
  }

  return (
    <div className="affected-tests-list">
      <h3>Affected Tests ({affectedTests.length})</h3>
      {Array.from(testsByFile.entries()).map(([file, tests]) => (
        <div key={file} className="affected-test-file" data-test-file={file}>
          <div className="affected-test-file-name">{file} ({tests.length} tests)</div>
          {tests.map((test) => (
            <div
              key={test.node.id}
              className="affected-test-item"
              data-test-id={test.node.id}
              role="button"
              tabIndex={0}
              onClick={() => onNodeSelect?.(test.node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNodeSelect?.(test.node.id);
                }
              }}
            >
              {test.node.name}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
AffectedTestsList.displayName = 'AffectedTestsList';

/** Risk assessment summary */
const RiskAssessmentSummary: React.FC<{
  analysis: ImpactAnalysisType;
}> = React.memo(({ analysis }) => {
  const { riskAssessment } = analysis;
  const color = getSeverityColor(riskAssessment.overall);
  const emoji = getSeverityEmoji(riskAssessment.overall);
  const counts = countBySeverity([...analysis.directImpacts, ...analysis.transitiveImpacts]);

  return (
    <div className="risk-assessment-summary">
      <div className="risk-assessment-header">
        <span className="risk-assessment-emoji">{emoji}</span>
        <span className="risk-assessment-label">Risk Assessment:</span>
        <span className="risk-assessment-overall" style={{ color }}>
          {riskAssessment.overall.toUpperCase()}
        </span>
        <span className="risk-assessment-score">(score: {riskAssessment.score}/100)</span>
      </div>
      <div className="risk-assessment-counts">
        {counts[ImpactSeverity.CRITICAL] > 0 && (
          <span>{counts[ImpactSeverity.CRITICAL]} critical</span>
        )}
        {counts[ImpactSeverity.HIGH] > 0 && (
          <span>{counts[ImpactSeverity.HIGH]} high</span>
        )}
        {counts[ImpactSeverity.MEDIUM] > 0 && (
          <span>{counts[ImpactSeverity.MEDIUM]} medium</span>
        )}
        {counts[ImpactSeverity.LOW] > 0 && (
          <span>{counts[ImpactSeverity.LOW]} low</span>
        )}
        {counts[ImpactSeverity.INFO] > 0 && (
          <span>{counts[ImpactSeverity.INFO]} info</span>
        )}
        <span>impacts</span>
      </div>
      {riskAssessment.reasoning && (
        <div className="risk-assessment-reasoning">{riskAssessment.reasoning}</div>
      )}
    </div>
  );
});
RiskAssessmentSummary.displayName = 'RiskAssessmentSummary';

// ---------------------------------------------------------------------------
// Main ImpactAnalysis Component
// ---------------------------------------------------------------------------

export const ImpactAnalysis: React.FC<ImpactAnalysisWidgetProps> = ({
  analysis,
  isAnalyzing,
  onNodeSelect,
  onAnalyzeNode,
  onAnalyzeChange,
  viewMode = 'tree',
  onViewModeChange,
}) => {
  const totalImpacts = useMemo(() => {
    if (!analysis) return 0;
    return analysis.directImpacts.length + analysis.transitiveImpacts.length;
  }, [analysis]);

  const useVirtualization = totalImpacts > 50;

  return (
    <div className="impact-analysis-widget">
      <div className="impact-analysis-header">
        <h2>Impact Analysis</h2>
      </div>

      {/* Severity Legend */}
      <SeverityLegend />

      {/* View Mode Selector */}
      <ViewModeSelector viewMode={viewMode} onViewModeChange={onViewModeChange} />

      {/* Loading Indicator */}
      {isAnalyzing && (
        <div className="impact-loading" role="status" aria-live="polite">
          Analyzing impact...
        </div>
      )}

      {/* Empty State */}
      {!analysis && !isAnalyzing && (
        <div className="impact-empty-state">
          <p>No analysis available</p>
          <p>Select a code change or node to analyze its impact</p>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !isAnalyzing && (
        <>
          {/* Impact View */}
          <div className="impact-view-container">
            {viewMode === 'tree' && (
              <TreeView
                directImpacts={analysis.directImpacts}
                transitiveImpacts={analysis.transitiveImpacts}
                onNodeSelect={onNodeSelect}
                useVirtualization={useVirtualization}
              />
            )}
            {viewMode === 'butterfly' && (
              <ButterflyView
                directImpacts={analysis.directImpacts}
                transitiveImpacts={analysis.transitiveImpacts}
                seedNodeId={analysis.seedNodeId}
                onNodeSelect={onNodeSelect}
              />
            )}
            {viewMode === 'list' && (
              <ListView
                directImpacts={analysis.directImpacts}
                transitiveImpacts={analysis.transitiveImpacts}
                onNodeSelect={onNodeSelect}
                useVirtualization={useVirtualization}
              />
            )}
          </div>

          {/* Affected Files */}
          <AffectedFilesList
            affectedFiles={analysis.affectedFiles}
            onNodeSelect={onNodeSelect}
          />

          {/* Affected Tests */}
          <AffectedTestsList
            affectedTests={analysis.affectedTests}
            onNodeSelect={onNodeSelect}
          />

          {/* Risk Assessment */}
          <RiskAssessmentSummary analysis={analysis} />
        </>
      )}
    </div>
  );
};
