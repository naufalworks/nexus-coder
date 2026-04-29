import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ImpactAnalysis,
  ImpactAnalysisWidgetProps,
  getSeverityColor,
  getSeverityEmoji,
  groupByDistance,
  sortBySeverity,
  countBySeverity,
} from './ImpactAnalysis';
import {
  ImpactSeverity,
  ImpactNode,
  ImpactAnalysis as ImpactAnalysisType,
  ImpactStats,
  RiskAssessment,
  AffectedFile,
  SCGNode,
  NodeType,
  ChangeType,
} from '../types';

// Mock scrollIntoView for JSDOM
Element.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeSCGNode(overrides: Partial<SCGNode> = {}): SCGNode {
  return {
    id: 'node-1',
    type: NodeType.FUNCTION,
    name: 'testFunction',
    file: 'src/test.ts',
    line: 1,
    endLine: 10,
    signature: 'function testFunction()',
    summary: 'A test function',
    complexity: 1,
    changeFrequency: 0,
    ...overrides,
  };
}

function makeImpactNode(overrides: Partial<ImpactNode> = {}): ImpactNode {
  return {
    node: makeSCGNode(),
    impactPath: [],
    distance: 1,
    severity: ImpactSeverity.HIGH,
    reason: 'Direct dependency',
    ...overrides,
  };
}

function makeRiskAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    overall: ImpactSeverity.HIGH,
    score: 65,
    directImpactCount: 2,
    transitiveImpactCount: 3,
    affectedTestCount: 5,
    affectedFileCount: 3,
    reasoning: 'Multiple direct and transitive impacts detected',
    ...overrides,
  };
}

function makeStats(overrides: Partial<ImpactStats> = {}): ImpactStats {
  return {
    nodesTraversed: 10,
    edgesFollowed: 15,
    maxDepthReached: 3,
    analysisTimeMs: 50,
    ...overrides,
  };
}

function makeImpactAnalysis(overrides: Partial<ImpactAnalysisType> = {}): ImpactAnalysisType {
  return {
    seedChange: {
      file: 'src/auth.ts',
      type: ChangeType.MODIFY,
      reasoning: 'Update auth logic',
      impact: ['security'],
      risk: 'high',
      diff: '--- a/src/auth.ts\n+++ b/src/auth.ts',
      content: 'updated content',
      approved: false,
    },
    seedNodeId: 'seed-node-1',
    directImpacts: [
      makeImpactNode({
        node: makeSCGNode({ id: 'direct-1', name: 'authMiddleware', file: 'src/middleware.ts' }),
        distance: 1,
        severity: ImpactSeverity.CRITICAL,
      }),
      makeImpactNode({
        node: makeSCGNode({ id: 'direct-2', name: 'authHelper', file: 'src/helpers.ts' }),
        distance: 1,
        severity: ImpactSeverity.HIGH,
      }),
    ],
    transitiveImpacts: [
      makeImpactNode({
        node: makeSCGNode({ id: 'trans-1', name: 'userService', file: 'src/user.ts' }),
        distance: 2,
        severity: ImpactSeverity.MEDIUM,
      }),
      makeImpactNode({
        node: makeSCGNode({ id: 'trans-2', name: 'logger', file: 'src/utils.ts' }),
        distance: 3,
        severity: ImpactSeverity.LOW,
      }),
    ],
    affectedTests: [
      makeImpactNode({
        node: makeSCGNode({
          id: 'test-1',
          name: 'auth.test',
          file: 'src/auth.test.ts',
          type: NodeType.TEST,
        }),
        distance: 1,
        severity: ImpactSeverity.CRITICAL,
        reason: 'Tests the modified auth module',
      }),
    ],
    riskAssessment: makeRiskAssessment(),
    affectedFiles: [
      {
        file: 'src/middleware.ts',
        impactedNodes: [makeImpactNode()],
        highestSeverity: ImpactSeverity.CRITICAL,
        changeTypes: [ChangeType.MODIFY],
      },
      {
        file: 'src/helpers.ts',
        impactedNodes: [makeImpactNode()],
        highestSeverity: ImpactSeverity.HIGH,
        changeTypes: [ChangeType.MODIFY],
      },
    ],
    analyzedAt: new Date(),
    stats: makeStats(),
    ...overrides,
  };
}

function makeLargeImpactAnalysis(nodeCount: number): ImpactAnalysisType {
  const directImpacts: ImpactNode[] = [];
  const transitiveImpacts: ImpactNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const isDirect = i < Math.floor(nodeCount / 2);
    const node = makeImpactNode({
      node: makeSCGNode({
        id: `node-${i}`,
        name: `node${i}`,
        file: `src/file${i % 10}.ts`,
      }),
      distance: isDirect ? 1 : 2 + (i % 3),
      severity: [ImpactSeverity.CRITICAL, ImpactSeverity.HIGH, ImpactSeverity.MEDIUM, ImpactSeverity.LOW, ImpactSeverity.INFO][i % 5] as ImpactSeverity,
    });

    if (isDirect) {
      directImpacts.push(node);
    } else {
      transitiveImpacts.push(node);
    }
  }

  return makeImpactAnalysis({
    directImpacts,
    transitiveImpacts,
    riskAssessment: makeRiskAssessment({
      directImpactCount: directImpacts.length,
      transitiveImpactCount: transitiveImpacts.length,
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImpactAnalysis Widget', () => {
  describe('Helper functions', () => {
    describe('getSeverityColor', () => {
      it('should return correct color for each severity level', () => {
        expect(getSeverityColor(ImpactSeverity.CRITICAL)).toBe('#ef4444');
        expect(getSeverityColor(ImpactSeverity.HIGH)).toBe('#f97316');
        expect(getSeverityColor(ImpactSeverity.MEDIUM)).toBe('#eab308');
        expect(getSeverityColor(ImpactSeverity.LOW)).toBe('#3b82f6');
        expect(getSeverityColor(ImpactSeverity.INFO)).toBe('#6b7280');
      });
    });

    describe('getSeverityEmoji', () => {
      it('should return correct emoji for each severity level', () => {
        expect(getSeverityEmoji(ImpactSeverity.CRITICAL)).toBe('🔴');
        expect(getSeverityEmoji(ImpactSeverity.HIGH)).toBe('🟠');
        expect(getSeverityEmoji(ImpactSeverity.MEDIUM)).toBe('🟡');
        expect(getSeverityEmoji(ImpactSeverity.LOW)).toBe('🔵');
        expect(getSeverityEmoji(ImpactSeverity.INFO)).toBe('⚪');
      });
    });

    describe('groupByDistance', () => {
      it('should group nodes by distance', () => {
        const nodes = [
          makeImpactNode({ distance: 1 }),
          makeImpactNode({ distance: 1 }),
          makeImpactNode({ distance: 2 }),
          makeImpactNode({ distance: 3 }),
        ];
        const groups = groupByDistance(nodes);
        expect(groups.get(1)?.length).toBe(2);
        expect(groups.get(2)?.length).toBe(1);
        expect(groups.get(3)?.length).toBe(1);
      });

      it('should handle empty array', () => {
        const groups = groupByDistance([]);
        expect(groups.size).toBe(0);
      });
    });

    describe('sortBySeverity', () => {
      it('should sort by severity order CRITICAL > HIGH > MEDIUM > LOW > INFO', () => {
        const nodes = [
          makeImpactNode({ severity: ImpactSeverity.LOW }),
          makeImpactNode({ severity: ImpactSeverity.CRITICAL }),
          makeImpactNode({ severity: ImpactSeverity.MEDIUM }),
          makeImpactNode({ severity: ImpactSeverity.HIGH }),
          makeImpactNode({ severity: ImpactSeverity.INFO }),
        ];
        const sorted = sortBySeverity(nodes);
        expect(sorted[0].severity).toBe(ImpactSeverity.CRITICAL);
        expect(sorted[1].severity).toBe(ImpactSeverity.HIGH);
        expect(sorted[2].severity).toBe(ImpactSeverity.MEDIUM);
        expect(sorted[3].severity).toBe(ImpactSeverity.LOW);
        expect(sorted[4].severity).toBe(ImpactSeverity.INFO);
      });

      it('should not mutate original array', () => {
        const nodes = [
          makeImpactNode({ severity: ImpactSeverity.LOW }),
          makeImpactNode({ severity: ImpactSeverity.CRITICAL }),
        ];
        const originalOrder = nodes.map(n => n.severity);
        sortBySeverity(nodes);
        expect(nodes.map(n => n.severity)).toEqual(originalOrder);
      });
    });

    describe('countBySeverity', () => {
      it('should count nodes by severity', () => {
        const nodes = [
          makeImpactNode({ severity: ImpactSeverity.CRITICAL }),
          makeImpactNode({ severity: ImpactSeverity.CRITICAL }),
          makeImpactNode({ severity: ImpactSeverity.HIGH }),
          makeImpactNode({ severity: ImpactSeverity.MEDIUM }),
          makeImpactNode({ severity: ImpactSeverity.MEDIUM }),
          makeImpactNode({ severity: ImpactSeverity.MEDIUM }),
        ];
        const counts = countBySeverity(nodes);
        expect(counts[ImpactSeverity.CRITICAL]).toBe(2);
        expect(counts[ImpactSeverity.HIGH]).toBe(1);
        expect(counts[ImpactSeverity.MEDIUM]).toBe(3);
        expect(counts[ImpactSeverity.LOW]).toBe(0);
        expect(counts[ImpactSeverity.INFO]).toBe(0);
      });
    });
  });

  describe('Component Rendering', () => {
    it('should render the widget title', () => {
      render(<ImpactAnalysis analysis={null} isAnalyzing={false} />);
      expect(screen.getByText('Impact Analysis')).toBeTruthy();
    });

    it('should render severity legend', () => {
      render(<ImpactAnalysis analysis={null} isAnalyzing={false} />);
      expect(screen.getByText(/CRITICAL/)).toBeTruthy();
      expect(screen.getByText(/HIGH/)).toBeTruthy();
      expect(screen.getByText(/MEDIUM/)).toBeTruthy();
      expect(screen.getByText(/LOW/)).toBeTruthy();
      expect(screen.getByText(/INFO/)).toBeTruthy();
    });

    it('should render empty state when analysis is null', () => {
      render(<ImpactAnalysis analysis={null} isAnalyzing={false} />);
      expect(screen.getByText('No analysis available')).toBeTruthy();
    });

    it('should render loading indicator when isAnalyzing is true', () => {
      render(<ImpactAnalysis analysis={null} isAnalyzing={true} />);
      expect(screen.getByText('Analyzing impact...')).toBeTruthy();
    });

    it('should not render loading indicator when isAnalyzing is false', () => {
      render(<ImpactAnalysis analysis={null} isAnalyzing={false} />);
      expect(screen.queryByText('Analyzing impact...')).toBeNull();
    });

    it('should not render empty state when analysis is provided', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);
      expect(screen.queryByText('No analysis available')).toBeNull();
    });
  });

  describe('Impact Tree View', () => {
    it('should render impact tree with direct and transitive impacts', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      expect(screen.getByText('Direct Impacts (distance 1)')).toBeTruthy();
      expect(screen.getByText('Transitive Impacts (distance 2+)')).toBeTruthy();
    });

    it('should render impacted nodes with names and severity', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      expect(screen.getByText('authMiddleware')).toBeTruthy();
      expect(screen.getByText('authHelper')).toBeTruthy();
      expect(screen.getByText('userService')).toBeTruthy();
    });

    it('should render impact nodes grouped by distance in tree view', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      // Check for distance groupings
      expect(screen.getByText('Direct Impacts (distance 1)')).toBeTruthy();
      expect(screen.getByText('Transitive Impacts (distance 2+)')).toBeTruthy();
      expect(screen.getByText('Distance 2')).toBeTruthy();
      expect(screen.getByText('Distance 3')).toBeTruthy();
    });

    it('should show no direct impacts message when empty', () => {
      const analysis = makeImpactAnalysis({ directImpacts: [] });
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      expect(screen.getByText('No direct impacts')).toBeTruthy();
    });

    it('should show no transitive impacts message when empty', () => {
      const analysis = makeImpactAnalysis({ transitiveImpacts: [] });
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      expect(screen.getByText('No transitive impacts')).toBeTruthy();
    });
  });

  describe('Affected Files List', () => {
    it('should render affected files section', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText(`Affected Files (${analysis.affectedFiles.length})`)).toBeTruthy();
    });

    it('should display file names with severity', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('src/middleware.ts')).toBeTruthy();
      expect(screen.getByText('src/helpers.ts')).toBeTruthy();
    });

    it('should show empty message when no affected files', () => {
      const analysis = makeImpactAnalysis({ affectedFiles: [] });
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('No affected files')).toBeTruthy();
    });
  });

  describe('Affected Tests List', () => {
    it('should render affected tests section', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText(`Affected Tests (${analysis.affectedTests.length})`)).toBeTruthy();
    });

    it('should display test file names', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('auth.test')).toBeTruthy();
    });

    it('should show empty message when no affected tests', () => {
      const analysis = makeImpactAnalysis({ affectedTests: [] });
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('No affected tests')).toBeTruthy();
    });
  });

  describe('Risk Assessment', () => {
    it('should display risk assessment overall severity and score', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('Risk Assessment:')).toBeTruthy();
      expect(screen.getByText('HIGH')).toBeTruthy();
      expect(screen.getByText('(score: 65/100)')).toBeTruthy();
    });

    it('should display risk assessment reasoning', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('Multiple direct and transitive impacts detected')).toBeTruthy();
    });
  });

  describe('View Mode Switching', () => {
    it('should render tree view by default', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);

      expect(screen.getByText('Direct Impacts (distance 1)')).toBeTruthy();
    });

    it('should render butterfly view when selected', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="butterfly" />);

      expect(screen.getByText('Seed Change')).toBeTruthy();
      expect(screen.getByText('Direct Impacts')).toBeTruthy();
      expect(screen.getByText('Transitive Impacts')).toBeTruthy();
    });

    it('should render list view when selected', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="list" />);

      // List view should show nodes sorted by severity
      const nodes = screen.getAllByTestId !== undefined
        ? screen.getAllByText(/authMiddleware|authHelper|userService|logger/)
        : [];
      // At minimum the names should be present
      expect(screen.getByText('authMiddleware')).toBeTruthy();
      expect(screen.getByText('authHelper')).toBeTruthy();
    });

    it('should call onViewModeChange when clicking view mode buttons', () => {
      const onViewModeChange = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onViewModeChange={onViewModeChange}
        />
      );

      const butterflyButton = screen.getByLabelText('Butterfly view');
      fireEvent.click(butterflyButton);
      expect(onViewModeChange).toHaveBeenCalledWith('butterfly');
    });

    it('should highlight active view mode button', () => {
      const analysis = makeImpactAnalysis();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);

      const treeButton = screen.getByLabelText('Tree view');
      expect(treeButton.classList.contains('view-mode-active')).toBe(true);
    });
  });

  describe('onNodeSelect callback', () => {
    it('should call onNodeSelect when clicking an impact node', () => {
      const onNodeSelect = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onNodeSelect={onNodeSelect}
          viewMode="tree"
        />
      );

      // Click on a node name
      const nodeName = screen.getByText('authMiddleware');
      fireEvent.click(nodeName);
      expect(onNodeSelect).toHaveBeenCalledWith('direct-1');
    });

    it('should call onNodeSelect when pressing Enter on a node', () => {
      const onNodeSelect = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onNodeSelect={onNodeSelect}
          viewMode="tree"
        />
      );

      const nodeName = screen.getByText('authMiddleware');
      fireEvent.keyDown(nodeName, { key: 'Enter' });
      expect(onNodeSelect).toHaveBeenCalledWith('direct-1');
    });

    it('should call onNodeSelect when clicking test items', () => {
      const onNodeSelect = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onNodeSelect={onNodeSelect}
        />
      );

      const testItem = screen.getByText('auth.test');
      fireEvent.click(testItem);
      expect(onNodeSelect).toHaveBeenCalledWith('test-1');
    });

    it('should call onNodeSelect in butterfly view', () => {
      const onNodeSelect = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onNodeSelect={onNodeSelect}
          viewMode="butterfly"
        />
      );

      const nodeName = screen.getByText('authMiddleware');
      fireEvent.click(nodeName);
      expect(onNodeSelect).toHaveBeenCalledWith('direct-1');
    });

    it('should call onNodeSelect in list view', () => {
      const onNodeSelect = jest.fn();
      const analysis = makeImpactAnalysis();
      render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          onNodeSelect={onNodeSelect}
          viewMode="list"
        />
      );

      const nodeName = screen.getByText('authMiddleware');
      fireEvent.click(nodeName);
      expect(onNodeSelect).toHaveBeenCalledWith('direct-1');
    });
  });

  describe('Virtualized Rendering', () => {
    it('should use virtualized rendering when more than 50 nodes', () => {
      const analysis = makeLargeImpactAnalysis(60);
      const { container } = render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          viewMode="tree"
        />
      );

      // Check that virtualized container is rendered
      const virtualizedList = container.querySelector('.virtualized-impact-list');
      expect(virtualizedList).toBeTruthy();
    });

    it('should not use virtualized rendering when 50 or fewer nodes', () => {
      const analysis = makeLargeImpactAnalysis(50);
      const { container } = render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          viewMode="tree"
        />
      );

      // Should use regular tree view, not virtualized
      const treeView = container.querySelector('.impact-tree-view');
      expect(treeView).toBeTruthy();
      const virtualizedList = container.querySelector('.virtualized-impact-list');
      expect(virtualizedList).toBeNull();
    });

    it('should use virtualized rendering in list view when >50 nodes', () => {
      const analysis = makeLargeImpactAnalysis(60);
      const { container } = render(
        <ImpactAnalysis
          analysis={analysis}
          isAnalyzing={false}
          viewMode="list"
        />
      );

      const virtualizedList = container.querySelector('.virtualized-impact-list');
      expect(virtualizedList).toBeTruthy();
    });
  });

  describe('Render Performance', () => {
    it('should render within 100ms budget', () => {
      const analysis = makeImpactAnalysis();
      const start = performance.now();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} />);
      const end = performance.now();
      const renderTime = end - start;

      expect(renderTime).toBeLessThan(100);
    });

    it('should render with large dataset within 100ms budget', () => {
      const analysis = makeLargeImpactAnalysis(100);
      const start = performance.now();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="tree" />);
      const end = performance.now();
      const renderTime = end - start;

      expect(renderTime).toBeLessThan(100);
    });

    it('should render butterfly view within 100ms budget', () => {
      const analysis = makeImpactAnalysis();
      const start = performance.now();
      render(<ImpactAnalysis analysis={analysis} isAnalyzing={false} viewMode="butterfly" />);
      const end = performance.now();
      const renderTime = end - start;

      expect(renderTime).toBeLessThan(100);
    });
  });
});
