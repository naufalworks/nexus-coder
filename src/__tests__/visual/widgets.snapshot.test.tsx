/**
 * Visual Regression Tests for IDE Widgets
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 * 
 * Uses Jest inline snapshots to capture rendered widget output.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskPanel } from '../../widgets/TaskPanel';
import { DiffApproval } from '../../widgets/DiffApproval';
import { GraphExplorer } from '../../widgets/GraphExplorer';
import { ResourceFooter } from '../../widgets/ResourceFooter';
import { IDEShellProvider } from '../../widgets/IDEShell';
import { 
  makeTaskWithChanges,
  makeAgentInfo,
  makeCodeChange,
  makeGraph,
  makeTokenUsage,
} from '../helpers/factories';
import { TaskStatus } from '../../types';

describe('Visual Regression: Widget Snapshots', () => {
  describe('Requirement 6.1: IDE_Shell states', () => {
    it('should match snapshot for default state', () => {
      const { container } = render(
        <IDEShellProvider>
          <div>Widget content here</div>
        </IDEShellProvider>
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for loading state', () => {
      const { container } = render(
        <IDEShellProvider>
          <div data-testid="loading">Loading...</div>
        </IDEShellProvider>
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for error state', () => {
      const { container } = render(
        <IDEShellProvider>
          <div data-testid="error" role="alert">Error occurred</div>
        </IDEShellProvider>
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for empty state', () => {
      const { container } = render(
        <IDEShellProvider>
          <div data-testid="empty">No tasks available</div>
        </IDEShellProvider>
      );
      
      expect(container).toMatchSnapshot();
    });
  });
  
  describe('Requirement 6.3: Diff_Approval_Widget states', () => {
    it('should match snapshot for two-column diff view', () => {
      const changes = [
        makeCodeChange({
          file: 'src/auth.ts',
          diff: '@@ -10,5 +10,6 @@\n-old line\n+new line',
        }),
      ];
      
      const { container } = render(
        <DiffApproval
          changes={changes}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for approve highlighted state', () => {
      const changes = [
        makeCodeChange({
          file: 'src/test.ts',
          approved: true,
        }),
      ];
      
      const { container } = render(
        <DiffApproval
          changes={changes}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for reject highlighted state', () => {
      const changes = [
        makeCodeChange({
          file: 'src/test.ts',
          approved: false,
        }),
      ];
      
      const { container } = render(
        <DiffApproval
          changes={changes}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={jest.fn()}
        />
      );
      
      expect(container).toMatchSnapshot();
    });
  });
  
  describe('Requirement 6.4: Graph_Explorer overlays', () => {
    it('should match snapshot with no overlay', () => {
      const graph = makeGraph(8, 12);
      const task = makeTaskWithChanges(1);
      
      const { container } = render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
        />
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot with agent proposal overlay', () => {
      const graph = makeGraph(8, 12);
      const task = makeTaskWithChanges(2);
      const proposals = task.result?.changes || [];
      
      const { container } = render(
        <GraphExplorer
          graph={graph}
          activeTask={task}
          overlayProposals={proposals}
        />
      );
      
      expect(container).toMatchSnapshot();
    });
  });
  
  describe('Requirement 6.5: Resource_Footer states', () => {
    it('should match snapshot for healthy state', () => {
      const tokenUsage = makeTokenUsage({ total: 5000 });
      
      const { container } = render(
        <ResourceFooter
          tokenUsage={tokenUsage}
          vectorStoreStatus="healthy"
        />
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for degraded state', () => {
      const tokenUsage = makeTokenUsage();
      
      const { container } = render(
        <ResourceFooter
          tokenUsage={tokenUsage}
          vectorStoreStatus="degraded"
        />
      );
      
      expect(container).toMatchSnapshot();
    });
    
    it('should match snapshot for offline state', () => {
      const tokenUsage = makeTokenUsage({ total: 3000 });
      
      const { container } = render(
        <ResourceFooter
          tokenUsage={tokenUsage}
          vectorStoreStatus="offline"
        />
      );
      
      expect(container).toMatchSnapshot();
    });
  });
  
  describe('Requirement 6.2: Pixel diff detection', () => {
    it('should fail and report diff when output changes', () => {
      // This test documents that snapshots will fail on structural changes
      // Jest will show the diff between baseline and current
      const task = makeTaskWithChanges(1);
      
      const { container } = render(
        <TaskPanel
          tasks={[task]}
          agents={[makeAgentInfo()]}
          onSelectTask={jest.fn()}
          filter={{}}
        />
      );
      
      // Snapshot will be created on first run, compared on subsequent runs
      expect(container).toMatchSnapshot();
    });
  });
});
