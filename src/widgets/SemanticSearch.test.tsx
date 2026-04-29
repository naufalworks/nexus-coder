import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  SemanticSearch,
  formatRelevanceScore,
  formatLineRange,
  getRelationshipLabel,
  truncateContent,
} from './SemanticSearch';
import {
  SearchResult,
  SearchResultType,
  EdgeType,
  GraphContextInfo,
  SCGNode,
  NodeType,
} from '../types';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeSCGNode(overrides: Partial<SCGNode> = {}): SCGNode {
  return {
    id: 'node-1',
    type: NodeType.FUNCTION,
    name: 'authenticate',
    file: 'src/auth.ts',
    line: 10,
    endLine: 20,
    signature: 'function authenticate(user: User): boolean',
    summary: 'Authenticates a user',
    complexity: 5,
    changeFrequency: 0.2,
    ...overrides,
  };
}

function makeGraphContextInfo(overrides: Partial<GraphContextInfo> = {}): GraphContextInfo {
  return {
    node: makeSCGNode(),
    relationship: EdgeType.CALLS,
    distance: 1,
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result-1',
    content: 'function authenticate(user: User): boolean {\n  return user.isValid();\n}',
    relevanceScore: 0.85,
    file: 'src/auth.ts',
    lineRange: { start: 10, end: 20 },
    graphNodeId: 'node-1',
    graphContext: [],
    matchType: SearchResultType.FUNCTION,
    summary: 'User authentication function',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: Helper Functions
// ---------------------------------------------------------------------------

describe('formatRelevanceScore', () => {
  it('formats score as percentage with one decimal', () => {
    expect(formatRelevanceScore(0.856)).toBe('85.6%');
    expect(formatRelevanceScore(0.5)).toBe('50.0%');
    expect(formatRelevanceScore(1.0)).toBe('100.0%');
    expect(formatRelevanceScore(0.0)).toBe('0.0%');
  });
});

describe('formatLineRange', () => {
  it('formats single line as L{n}', () => {
    expect(formatLineRange({ start: 10, end: 10 })).toBe('L10');
  });

  it('formats range as L{start}-{end}', () => {
    expect(formatLineRange({ start: 10, end: 20 })).toBe('L10-20');
    expect(formatLineRange({ start: 1, end: 100 })).toBe('L1-100');
  });
});

describe('getRelationshipLabel', () => {
  it('returns correct labels for all edge types', () => {
    expect(getRelationshipLabel(EdgeType.CALLS)).toBe('calls');
    expect(getRelationshipLabel(EdgeType.IMPORTS)).toBe('imports');
    expect(getRelationshipLabel(EdgeType.EXTENDS)).toBe('extends');
    expect(getRelationshipLabel(EdgeType.IMPLEMENTS)).toBe('implements');
    expect(getRelationshipLabel(EdgeType.DEPENDS_ON)).toBe('depends on');
    expect(getRelationshipLabel(EdgeType.TESTS)).toBe('tests');
    expect(getRelationshipLabel(EdgeType.USES)).toBe('uses');
    expect(getRelationshipLabel(EdgeType.ROUTES_TO)).toBe('routes to');
    expect(getRelationshipLabel(EdgeType.REFERENCES)).toBe('references');
    expect(getRelationshipLabel(EdgeType.EXPORTS)).toBe('exports');
  });
});

describe('truncateContent', () => {
  it('returns content unchanged if under max length', () => {
    const content = 'short content';
    expect(truncateContent(content, 200)).toBe(content);
  });

  it('truncates content and adds ellipsis if over max length', () => {
    const content = 'a'.repeat(250);
    const result = truncateContent(content, 200);
    expect(result).toHaveLength(203); // 200 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('uses default max length of 200', () => {
    const content = 'a'.repeat(250);
    const result = truncateContent(content);
    expect(result).toHaveLength(203);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: SemanticSearch Component Rendering
// ---------------------------------------------------------------------------

describe('SemanticSearch component', () => {
  /** Validates: Requirements 4.1, 4.2, 4.3 */

  it('renders search input and submit button', () => {
    render(<SemanticSearch />);
    
    expect(screen.getByLabelText('Search query')).toBeInTheDocument();
    expect(screen.getByLabelText('Submit search')).toBeInTheDocument();
    expect(screen.getByText('Semantic Search')).toBeInTheDocument();
  });

  it('renders with initial results', () => {
    const results = [
      makeSearchResult({ id: 'r1', file: 'src/auth.ts' }),
      makeSearchResult({ id: 'r2', file: 'src/user.ts' }),
    ];

    render(<SemanticSearch results={results} />);
    
    expect(screen.getByText('Results (2)')).toBeInTheDocument();
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
    expect(screen.getByText('src/user.ts')).toBeInTheDocument();
  });

  it('displays loading indicator when isSearching is true', () => {
    render(<SemanticSearch isSearching={true} />);
    
    const statusElement = screen.getByRole('status');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveTextContent('Searching...');
  });

  it('disables input and button during search', () => {
    render(<SemanticSearch isSearching={true} />);
    
    const input = screen.getByLabelText('Search query') as HTMLInputElement;
    const button = screen.getByLabelText('Submit search') as HTMLButtonElement;
    
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
  });

  it('displays error message when error prop is provided', () => {
    const errorMessage = 'Vector store unavailable';
    render(<SemanticSearch error={errorMessage} />);
    
    const errorElement = screen.getByRole('alert');
    expect(errorElement).toBeInTheDocument();
    expect(errorElement).toHaveTextContent(errorMessage);
  });

  it('displays no results message when results array is empty', () => {
    render(<SemanticSearch results={[]} />);
    
    expect(screen.getByText('No results found. Try a different query.')).toBeInTheDocument();
  });

  it('calls onSearch when form is submitted', () => {
    const onSearch = jest.fn();
    render(<SemanticSearch onSearch={onSearch} />);
    
    const input = screen.getByLabelText('Search query');
    const button = screen.getByLabelText('Submit search');
    
    fireEvent.change(input, { target: { value: 'authentication' } });
    fireEvent.click(button);
    
    expect(onSearch).toHaveBeenCalledWith('authentication');
  });

  it('trims whitespace from query before calling onSearch', () => {
    const onSearch = jest.fn();
    render(<SemanticSearch onSearch={onSearch} />);
    
    const input = screen.getByLabelText('Search query');
    const button = screen.getByLabelText('Submit search');
    
    fireEvent.change(input, { target: { value: '  authentication  ' } });
    fireEvent.click(button);
    
    expect(onSearch).toHaveBeenCalledWith('authentication');
  });

  it('does not call onSearch when query is empty', () => {
    const onSearch = jest.fn();
    render(<SemanticSearch onSearch={onSearch} />);
    
    const button = screen.getByLabelText('Submit search');
    fireEvent.click(button);
    
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('does not call onSearch when query is only whitespace', () => {
    const onSearch = jest.fn();
    render(<SemanticSearch onSearch={onSearch} />);
    
    const input = screen.getByLabelText('Search query');
    const button = screen.getByLabelText('Submit search');
    
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(button);
    
    expect(onSearch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Search Result Display
// ---------------------------------------------------------------------------

describe('SemanticSearch result display', () => {
  /** Validates: Requirements 4.3 */

  it('displays result content, file, line range, score, and match type', () => {
    const result = makeSearchResult({
      content: 'function authenticate(user: User)',
      file: 'src/auth.ts',
      lineRange: { start: 10, end: 20 },
      relevanceScore: 0.85,
      matchType: SearchResultType.FUNCTION,
    });

    render(<SemanticSearch results={[result]} />);
    
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
    expect(screen.getByText('L10-20')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('displays result summary when available', () => {
    const result = makeSearchResult({
      summary: 'User authentication function',
    });

    render(<SemanticSearch results={[result]} />);
    
    expect(screen.getByText('User authentication function')).toBeInTheDocument();
  });

  it('displays graph context badge when result has graph context', () => {
    const result = makeSearchResult({
      graphContext: [
        makeGraphContextInfo(),
        makeGraphContextInfo({ node: makeSCGNode({ id: 'node-2' }) }),
      ],
    });

    render(<SemanticSearch results={[result]} />);
    
    expect(screen.getByText('2 related nodes')).toBeInTheDocument();
  });

  it('displays singular form for single related node', () => {
    const result = makeSearchResult({
      graphContext: [makeGraphContextInfo()],
    });

    render(<SemanticSearch results={[result]} />);
    
    expect(screen.getByText('1 related node')).toBeInTheDocument();
  });

  it('truncates long content', () => {
    const longContent = 'a'.repeat(300);
    const result = makeSearchResult({ content: longContent });

    render(<SemanticSearch results={[result]} />);
    
    const contentElement = screen.getByText(/a+\.\.\./);
    expect(contentElement.textContent).toHaveLength(203); // 200 + '...'
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Result Selection and Graph Context Panel
// ---------------------------------------------------------------------------

describe('SemanticSearch result selection', () => {
  /** Validates: Requirements 4.4 */

  it('displays empty graph context panel when no result is selected', () => {
    render(<SemanticSearch results={[makeSearchResult()]} />);
    
    expect(screen.getByText('Graph Context')).toBeInTheDocument();
    expect(screen.getByText('Select a search result to view its graph context')).toBeInTheDocument();
  });

  it('displays graph context when result is selected', () => {
    const result = makeSearchResult({
      graphNodeId: 'node-1',
      graphContext: [
        makeGraphContextInfo({
          node: makeSCGNode({ id: 'node-2', name: 'validateUser' }),
          relationship: EdgeType.CALLS,
          distance: 1,
        }),
      ],
    });

    render(<SemanticSearch results={[result]} />);
    
    // Click the result to select it
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    // Graph context should now be visible
    expect(screen.getByText('validateUser')).toBeInTheDocument();
    expect(screen.getByText(/calls • distance: 1/)).toBeInTheDocument();
  });

  it('displays message when selected result has no graph node', () => {
    const result = makeSearchResult({
      graphNodeId: null,
      graphContext: [],
    });

    render(<SemanticSearch results={[result]} />);
    
    // Select the result
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    expect(screen.getByText('This result has no associated graph node')).toBeInTheDocument();
  });

  it('displays message when selected result has no related nodes', () => {
    const result = makeSearchResult({
      graphNodeId: 'node-1',
      graphContext: [],
    });

    render(<SemanticSearch results={[result]} />);
    
    // Select the result
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    expect(screen.getByText('No related nodes found')).toBeInTheDocument();
  });

  it('applies selected styling to selected result', () => {
    const results = [
      makeSearchResult({ id: 'r1' }),
      makeSearchResult({ id: 'r2', file: 'src/user.ts' }),
    ];

    render(<SemanticSearch results={results} />);
    
    const result1 = screen.getByText('src/auth.ts').closest('.search-result-item')!;
    const result2 = screen.getByText('src/user.ts').closest('.search-result-item')!;
    
    // Initially no selection
    expect(result1).not.toHaveClass('search-result-selected');
    expect(result2).not.toHaveClass('search-result-selected');
    
    // Select result 1
    fireEvent.click(result1);
    expect(result1).toHaveClass('search-result-selected');
    expect(result2).not.toHaveClass('search-result-selected');
    
    // Select result 2
    fireEvent.click(result2);
    expect(result1).not.toHaveClass('search-result-selected');
    expect(result2).toHaveClass('search-result-selected');
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Action Callbacks
// ---------------------------------------------------------------------------

describe('SemanticSearch action callbacks', () => {
  /** Validates: Requirements 4.5, 4.7, 4.8 */

  it('calls onNodeSelect when View Node button is clicked', () => {
    const onNodeSelect = jest.fn();
    const result = makeSearchResult({ graphNodeId: 'node-1' });

    render(<SemanticSearch results={[result]} onNodeSelect={onNodeSelect} />);
    
    const viewNodeButton = screen.getByLabelText('Navigate to node');
    fireEvent.click(viewNodeButton);
    
    expect(onNodeSelect).toHaveBeenCalledWith('node-1');
  });

  it('calls onOpenInGraphExplorer when Open in Graph button is clicked', () => {
    const onOpenInGraphExplorer = jest.fn();
    const result = makeSearchResult({ graphNodeId: 'node-1' });

    render(<SemanticSearch results={[result]} onOpenInGraphExplorer={onOpenInGraphExplorer} />);
    
    const openInGraphButton = screen.getByLabelText('Open in Graph Explorer');
    fireEvent.click(openInGraphButton);
    
    expect(onOpenInGraphExplorer).toHaveBeenCalledWith('node-1');
  });

  it('calls onDiscussInChat when Discuss in Chat button is clicked', () => {
    const onDiscussInChat = jest.fn();
    const result = makeSearchResult();

    render(<SemanticSearch results={[result]} onDiscussInChat={onDiscussInChat} />);
    
    const discussButton = screen.getByLabelText('Discuss in Chat');
    fireEvent.click(discussButton);
    
    expect(onDiscussInChat).toHaveBeenCalledWith(result);
  });

  it('does not render View Node and Open in Graph buttons when result has no graphNodeId', () => {
    const result = makeSearchResult({ graphNodeId: null });

    render(<SemanticSearch results={[result]} />);
    
    expect(screen.queryByLabelText('Navigate to node')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open in Graph Explorer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Discuss in Chat')).toBeInTheDocument();
  });

  it('calls onNodeSelect when graph context node is clicked', () => {
    const onNodeSelect = jest.fn();
    const result = makeSearchResult({
      graphNodeId: 'node-1',
      graphContext: [
        makeGraphContextInfo({
          node: makeSCGNode({ id: 'node-2', name: 'validateUser' }),
        }),
      ],
    });

    render(<SemanticSearch results={[result]} onNodeSelect={onNodeSelect} />);
    
    // Select the result to show graph context
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    // Click the graph context node
    const contextNode = screen.getByText('validateUser');
    fireEvent.click(contextNode);
    
    expect(onNodeSelect).toHaveBeenCalledWith('node-2');
  });

  it('stops event propagation when action buttons are clicked', () => {
    const onNodeSelect = jest.fn();
    const result = makeSearchResult({ graphNodeId: 'node-1' });

    render(<SemanticSearch results={[result]} onNodeSelect={onNodeSelect} />);
    
    const viewNodeButton = screen.getByLabelText('Navigate to node');
    const resultElement = viewNodeButton.closest('.search-result-item')!;
    
    // Click the button (should not select the result)
    fireEvent.click(viewNodeButton);
    
    // Result should not be selected (no selected class)
    expect(resultElement).not.toHaveClass('search-result-selected');
    expect(onNodeSelect).toHaveBeenCalledWith('node-1');
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Graph Context Display
// ---------------------------------------------------------------------------

describe('SemanticSearch graph context display', () => {
  /** Validates: Requirements 4.4 */

  it('displays all graph context information', () => {
    const result = makeSearchResult({
      graphNodeId: 'node-1',
      graphContext: [
        makeGraphContextInfo({
          node: makeSCGNode({
            id: 'node-2',
            name: 'validateUser',
            type: NodeType.FUNCTION,
            file: 'src/validation.ts',
            line: 5,
          }),
          relationship: EdgeType.CALLS,
          distance: 1,
        }),
      ],
    });

    render(<SemanticSearch results={[result]} />);
    
    // Select the result
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    // Verify all context info is displayed
    expect(screen.getByText('validateUser')).toBeInTheDocument();
    expect(screen.getByText('(function)')).toBeInTheDocument();
    expect(screen.getByText('src/validation.ts:5')).toBeInTheDocument();
    expect(screen.getByText(/calls • distance: 1/)).toBeInTheDocument();
  });

  it('displays multiple graph context nodes', () => {
    const result = makeSearchResult({
      graphNodeId: 'node-1',
      graphContext: [
        makeGraphContextInfo({
          node: makeSCGNode({ id: 'node-2', name: 'validateUser' }),
          relationship: EdgeType.CALLS,
          distance: 1,
        }),
        makeGraphContextInfo({
          node: makeSCGNode({ id: 'node-3', name: 'checkPermissions' }),
          relationship: EdgeType.USES,
          distance: 2,
        }),
      ],
    });

    render(<SemanticSearch results={[result]} />);
    
    // Select the result
    const resultElement = screen.getByText('src/auth.ts');
    fireEvent.click(resultElement.closest('.search-result-item')!);
    
    // Check that both nodes appear in the graph context panel
    const graphContextPanel = screen.getByText('Graph Context').closest('.graph-context-panel')!;
    expect(graphContextPanel).toHaveTextContent('2 related nodes');
    expect(screen.getByText('validateUser')).toBeInTheDocument();
    expect(screen.getByText('checkPermissions')).toBeInTheDocument();
    expect(screen.getByText(/calls • distance: 1/)).toBeInTheDocument();
    expect(screen.getByText(/uses • distance: 2/)).toBeInTheDocument();
  });
});
