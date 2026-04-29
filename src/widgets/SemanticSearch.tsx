import React, { useState, useMemo, useCallback } from 'react';
import {
  SearchResult,
  SearchState,
  SearchGraphLink,
  SCGNode,
  EdgeType,
  GraphContextInfo,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SemanticSearchWidgetProps {
  /** Initial search results to display */
  results?: SearchResult[];
  /** Whether a search is currently in progress */
  isSearching?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback when a search is submitted */
  onSearch?: (query: string) => void;
  /** Callback when a result with graph node is selected */
  onNodeSelect?: (nodeId: string) => void;
  /** Callback to open result in graph explorer */
  onOpenInGraphExplorer?: (nodeId: string) => void;
  /** Callback to discuss result in chat */
  onDiscussInChat?: (result: SearchResult) => void;
}

// ---------------------------------------------------------------------------
// Helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Format relevance score as percentage string.
 */
export function formatRelevanceScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Format line range as string.
 */
export function formatLineRange(lineRange: { start: number; end: number }): string {
  if (lineRange.start === lineRange.end) {
    return `L${lineRange.start}`;
  }
  return `L${lineRange.start}-${lineRange.end}`;
}

/**
 * Get relationship label for display.
 */
export function getRelationshipLabel(edgeType: EdgeType): string {
  switch (edgeType) {
    case EdgeType.CALLS:
      return 'calls';
    case EdgeType.IMPORTS:
      return 'imports';
    case EdgeType.EXTENDS:
      return 'extends';
    case EdgeType.IMPLEMENTS:
      return 'implements';
    case EdgeType.DEPENDS_ON:
      return 'depends on';
    case EdgeType.TESTS:
      return 'tests';
    case EdgeType.USES:
      return 'uses';
    case EdgeType.ROUTES_TO:
      return 'routes to';
    case EdgeType.REFERENCES:
      return 'references';
    case EdgeType.EXPORTS:
      return 'exports';
    default:
      return edgeType;
  }
}

/**
 * Truncate content for display.
 */
export function truncateContent(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Graph context info item */
const GraphContextItem: React.FC<{
  contextInfo: GraphContextInfo;
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ contextInfo, onNodeSelect }) => {
  const { node, relationship, distance } = contextInfo;
  const relationshipLabel = getRelationshipLabel(relationship);

  return (
    <div
      className="graph-context-item"
      data-node-id={node.id}
      data-relationship={relationship}
      data-distance={distance}
    >
      <div className="graph-context-header">
        <span
          className="graph-context-node-name"
          role="button"
          tabIndex={0}
          onClick={() => onNodeSelect?.(node.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNodeSelect?.(node.id);
            }
          }}
        >
          {node.name}
        </span>
        <span className="graph-context-type">({node.type})</span>
      </div>
      <div className="graph-context-relationship">
        {relationshipLabel} • distance: {distance}
      </div>
      <div className="graph-context-file">{node.file}:{node.line}</div>
    </div>
  );
});
GraphContextItem.displayName = 'GraphContextItem';

/** Single search result item */
const SearchResultItem: React.FC<{
  result: SearchResult;
  isSelected: boolean;
  onSelect: (resultId: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  onOpenInGraphExplorer?: (nodeId: string) => void;
  onDiscussInChat?: (result: SearchResult) => void;
}> = React.memo(({
  result,
  isSelected,
  onSelect,
  onNodeSelect,
  onOpenInGraphExplorer,
  onDiscussInChat,
}) => {
  const handleClick = useCallback(() => {
    onSelect(result.id);
  }, [onSelect, result.id]);

  const handleNodeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (result.graphNodeId) {
      onNodeSelect?.(result.graphNodeId);
    }
  }, [onNodeSelect, result.graphNodeId]);

  const handleOpenInGraph = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (result.graphNodeId) {
      onOpenInGraphExplorer?.(result.graphNodeId);
    }
  }, [onOpenInGraphExplorer, result.graphNodeId]);

  const handleDiscussInChat = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscussInChat?.(result);
  }, [onDiscussInChat, result]);

  return (
    <div
      className={`search-result-item ${isSelected ? 'search-result-selected' : ''}`}
      data-result-id={result.id}
      data-selected={isSelected}
      onClick={handleClick}
    >
      <div className="search-result-header">
        <span className="search-result-file">{result.file}</span>
        <span className="search-result-line-range">
          {formatLineRange(result.lineRange)}
        </span>
        <span className="search-result-score">
          {formatRelevanceScore(result.relevanceScore)}
        </span>
      </div>
      <div className="search-result-match-type">
        <span className={`match-type-badge match-type-${result.matchType}`}>
          {result.matchType}
        </span>
      </div>
      <div className="search-result-content">
        <pre>{truncateContent(result.content)}</pre>
      </div>
      {result.summary && (
        <div className="search-result-summary">{result.summary}</div>
      )}
      <div className="search-result-actions">
        {result.graphNodeId && (
          <>
            <button
              className="search-action-button"
              onClick={handleNodeClick}
              aria-label="Navigate to node"
            >
              View Node
            </button>
            <button
              className="search-action-button"
              onClick={handleOpenInGraph}
              aria-label="Open in Graph Explorer"
            >
              Open in Graph
            </button>
          </>
        )}
        <button
          className="search-action-button"
          onClick={handleDiscussInChat}
          aria-label="Discuss in Chat"
        >
          Discuss in Chat
        </button>
      </div>
      {result.graphContext.length > 0 && (
        <div className="search-result-graph-badge">
          {result.graphContext.length} related node{result.graphContext.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
});
SearchResultItem.displayName = 'SearchResultItem';

/** Graph context panel showing related nodes */
const GraphContextPanel: React.FC<{
  result: SearchResult | null;
  onNodeSelect?: (nodeId: string) => void;
}> = React.memo(({ result, onNodeSelect }) => {
  if (!result) {
    return (
      <div className="graph-context-panel graph-context-empty">
        <h3>Graph Context</h3>
        <p>Select a search result to view its graph context</p>
      </div>
    );
  }

  if (!result.graphNodeId) {
    return (
      <div className="graph-context-panel graph-context-empty">
        <h3>Graph Context</h3>
        <p>This result has no associated graph node</p>
      </div>
    );
  }

  if (result.graphContext.length === 0) {
    return (
      <div className="graph-context-panel graph-context-empty">
        <h3>Graph Context</h3>
        <p>No related nodes found</p>
      </div>
    );
  }

  return (
    <div className="graph-context-panel">
      <h3>Graph Context</h3>
      <div className="graph-context-info">
        <p>{result.graphContext.length} related node{result.graphContext.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="graph-context-list">
        {result.graphContext.map((contextInfo, index) => (
          <GraphContextItem
            key={`${contextInfo.node.id}-${index}`}
            contextInfo={contextInfo}
            onNodeSelect={onNodeSelect}
          />
        ))}
      </div>
    </div>
  );
});
GraphContextPanel.displayName = 'GraphContextPanel';

// ---------------------------------------------------------------------------
// Main SemanticSearch Component
// ---------------------------------------------------------------------------

export const SemanticSearch: React.FC<SemanticSearchWidgetProps> = ({
  results = [],
  isSearching = false,
  error = null,
  onSearch,
  onNodeSelect,
  onOpenInGraphExplorer,
  onDiscussInChat,
}) => {
  const [query, setQuery] = useState('');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const selectedResult = useMemo(() => {
    if (!selectedResultId) return null;
    return results.find(r => r.id === selectedResultId) || null;
  }, [selectedResultId, results]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && onSearch) {
      onSearch(query.trim());
    }
  }, [query, onSearch]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleResultSelect = useCallback((resultId: string) => {
    setSelectedResultId(resultId);
  }, []);

  return (
    <div className="semantic-search-widget">
      <div className="semantic-search-header">
        <h2>Semantic Search</h2>
      </div>

      {/* Search Input */}
      <form className="search-input-form" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          className="search-input"
          placeholder="Search code semantically..."
          value={query}
          onChange={handleQueryChange}
          disabled={isSearching}
          aria-label="Search query"
        />
        <button
          type="submit"
          className="search-submit-button"
          disabled={isSearching || !query.trim()}
          aria-label="Submit search"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="search-error" role="alert">
          {error}
        </div>
      )}

      {/* Loading Indicator */}
      {isSearching && (
        <div className="search-loading" role="status" aria-live="polite">
          Searching...
        </div>
      )}

      {/* Main Content Area */}
      <div className="semantic-search-content">
        {/* Results Panel */}
        <div className="search-results-panel">
          <h3>Results ({results.length})</h3>
          {results.length === 0 && !isSearching && !error && (
            <div className="search-no-results">
              No results found. Try a different query.
            </div>
          )}
          <div className="search-results-list">
            {results.map(result => (
              <SearchResultItem
                key={result.id}
                result={result}
                isSelected={selectedResultId === result.id}
                onSelect={handleResultSelect}
                onNodeSelect={onNodeSelect}
                onOpenInGraphExplorer={onOpenInGraphExplorer}
                onDiscussInChat={onDiscussInChat}
              />
            ))}
          </div>
        </div>

        {/* Graph Context Panel (Side Panel) */}
        <GraphContextPanel
          result={selectedResult}
          onNodeSelect={onNodeSelect}
        />
      </div>
    </div>
  );
};
