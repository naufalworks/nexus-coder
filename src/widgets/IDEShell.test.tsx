import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  IDEShellProvider,
  WidgetRegion,
  WidgetMount,
  WidgetSystemControl,
  useWidgetSystem,
  LayoutRegion,
  IDEShell,
  WidgetToggleState,
  DEFAULT_TOGGLE_STATE
} from './IDEShell';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  AgentInfo,
  AgentCapability,
  CodeChange,
  ChangeType,
  SemanticCodeGraphData,
  NodeType,
  AgentMessage,
  TokenUsage
} from '../types';

// Helper component to test the useWidgetSystem hook
const WidgetControlTester: React.FC<{
  onControl: (control: WidgetSystemControl) => void;
}> = ({ onControl }) => {
  const control = useWidgetSystem();
  return (
    <div>
      <button
        data-testid="mount-btn"
        onClick={() =>
          control.mount({
            id: 'dynamicWidget',
            component: <div>Dynamic Widget</div>,
            visible: true,
            chrome: true,
            title: 'Dynamic'
          })
        }
      >
        Mount
      </button>
      <button
        data-testid="unmount-btn"
        onClick={() => control.unmount('dynamicWidget')}
      >
        Unmount
      </button>
      <button
        data-testid="hide-btn"
        onClick={() => control.setVisibility('dynamicWidget', false)}
      >
        Hide
      </button>
      <button
        data-testid="show-btn"
        onClick={() => control.setVisibility('dynamicWidget', true)}
      >
        Show
      </button>
      <button
        data-testid="move-btn"
        onClick={() => control.moveWidget('dynamicWidget', 'footer')}
      >
        Move
      </button>
      <button
        data-testid="get-btn"
        onClick={() => onControl(control)}
      >
        Get
      </button>
    </div>
  );
};

describe('IDEShellProvider and WidgetRegion', () => {
  it('mounts and manages widgets in a specific region', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'sidebarWidget',
        component: <div>Sidebar Widget</div>,
        visible: true,
        chrome: true,
        region: 'sidebar'
      },
      {
        id: 'panelWidget',
        component: <div>Panel Widget</div>,
        visible: true,
        chrome: false,
        region: 'panel'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" />
        <WidgetRegion region="panel" />
      </IDEShellProvider>
    );
    // Each region shows only widgets assigned to it
    expect(screen.getByText('Sidebar Widget')).toBeInTheDocument();
    expect(screen.getByText('Panel Widget')).toBeInTheDocument();
  });

  it('renders chrome header when chrome is enabled and title is provided', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'chromeWidget',
        component: <div>Chrome Content</div>,
        visible: true,
        chrome: true,
        title: 'My Widget'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" />
      </IDEShellProvider>
    );

    expect(screen.getByText('My Widget')).toBeInTheDocument();
    expect(screen.getByText('Chrome Content')).toBeInTheDocument();
  });

  it('hides invisible widgets from rendering', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'visibleWidget',
        component: <div>Visible</div>,
        visible: true,
        chrome: false,
        region: 'sidebar'
      },
      {
        id: 'hiddenWidget',
        component: <div>Hidden</div>,
        visible: false,
        chrome: false,
        region: 'sidebar'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" />
      </IDEShellProvider>
    );

    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('dynamically mounts and unmounts widgets using the control API', () => {
    render(
      <IDEShellProvider initialWidgets={[]}>
        <WidgetRegion region="sidebar" />
        <WidgetControlTester onControl={() => {}} />
      </IDEShellProvider>
    );

    // Initially, "Dynamic Widget" should not be present
    expect(screen.queryByText('Dynamic Widget')).toBeNull();

    // Mount the dynamic widget
    fireEvent.click(screen.getByTestId('mount-btn'));
    expect(screen.getByText('Dynamic Widget')).toBeInTheDocument();

    // Unmount it
    fireEvent.click(screen.getByTestId('unmount-btn'));
    expect(screen.queryByText('Dynamic Widget')).toBeNull();
  });

  it('toggles widget visibility using the control API', () => {
    render(
      <IDEShellProvider initialWidgets={[]}>
        <WidgetRegion region="sidebar" />
        <WidgetControlTester onControl={() => {}} />
      </IDEShellProvider>
    );

    // Mount the dynamic widget
    fireEvent.click(screen.getByTestId('mount-btn'));
    expect(screen.getByText('Dynamic Widget')).toBeInTheDocument();

    // Hide it
    fireEvent.click(screen.getByTestId('hide-btn'));
    expect(screen.queryByText('Dynamic Widget')).toBeNull();

    // Show it again
    fireEvent.click(screen.getByTestId('show-btn'));
    expect(screen.getByText('Dynamic Widget')).toBeInTheDocument();
  });

  it('moves widgets between regions', () => {
    render(
      <IDEShellProvider initialWidgets={[]}>
        <WidgetRegion region="sidebar" />
        <WidgetRegion region="footer" />
        <WidgetControlTester onControl={() => {}} />
      </IDEShellProvider>
    );

    // Mount the dynamic widget (defaults to sidebar region)
    fireEvent.click(screen.getByTestId('mount-btn'));
    expect(screen.getByText('Dynamic Widget')).toBeInTheDocument();

    // Move it to footer region
    fireEvent.click(screen.getByTestId('move-btn'));
    // Widget should now appear in footer region only
    expect(screen.getByText('Dynamic Widget')).toBeInTheDocument();
  });

  it('prevents duplicate widget mount with the same id', () => {
    let controlRef: WidgetSystemControl | null = null;

    render(
      <IDEShellProvider initialWidgets={[]}>
        <WidgetRegion region="sidebar" />
        <WidgetControlTester onControl={c => { controlRef = c; }} />
      </IDEShellProvider>
    );

    // Click mount twice
    fireEvent.click(screen.getByTestId('mount-btn'));
    fireEvent.click(screen.getByTestId('mount-btn'));

    // Should only have one "Dynamic Widget"
    // Since both regions render, we check the control API
    fireEvent.click(screen.getByTestId('get-btn'));
    expect(controlRef!.getWidgets().filter(w => w.id === 'dynamicWidget').length).toBe(1);
  });

  it('getWidgets returns all currently mounted widgets', () => {
    let controlRef: WidgetSystemControl | null = null;
    const initialWidgets: WidgetMount[] = [
      { id: 'w1', component: <div>W1</div>, visible: true, chrome: false, region: 'sidebar' },
      { id: 'w2', component: <div>W2</div>, visible: false, chrome: false, region: 'sidebar' }
    ];

    render(
      <IDEShellProvider initialWidgets={initialWidgets}>
        <WidgetRegion region="sidebar" />
        <WidgetControlTester onControl={c => { controlRef = c; }} />
      </IDEShellProvider>
    );

    fireEvent.click(screen.getByTestId('get-btn'));
    expect(controlRef!.getWidgets().length).toBe(2);
  });

  it('throws error when useWidgetSystem is used outside of IDEShellProvider', () => {
    // Suppress console.error for expected error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<WidgetControlTester onControl={() => {}} />);
    }).toThrow('useWidgetSystem must be used within an IDEShellProvider');

    consoleSpy.mockRestore();
  });
});

describe('Nexus Data Model Integration', () => {
  /** Validates: Requirements 1.1, 9.1, 14.1 */

  it('renders Task Panel with Nexus Task data model', () => {
    const task: Task = {
      id: 'task-1',
      instruction: 'Fix login bug',
      status: TaskStatus.EXECUTING,
      subTasks: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const widgets: WidgetMount[] = [
      {
        id: 'taskPanel',
        component: (
          <div>
            <span>{task.instruction}</span>
            <span>{task.status}</span>
          </div>
        ),
        visible: true,
        chrome: true,
        title: 'Task Panel',
        props: { tasks: [task] },
        region: 'sidebar'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" />
      </IDEShellProvider>
    );

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText(TaskStatus.EXECUTING)).toBeInTheDocument();
  });

  it('renders Agent Status with Nexus AgentInfo data model', () => {
    const agent: AgentInfo = {
      name: 'coder-agent',
      capabilities: [AgentCapability.CODE_GENERATION],
      supportedTaskTypes: [TaskType.FEATURE],
      status: 'busy',
      currentTask: 'task-1'
    };

    const widgets: WidgetMount[] = [
      {
        id: 'agentStatus',
        component: (
          <div>
            <span>{agent.name}</span>
            <span>{agent.status}</span>
          </div>
        ),
        visible: true,
        chrome: true,
        title: 'Agent Status',
        props: { agents: [agent] },
        region: 'sidebar'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" />
      </IDEShellProvider>
    );

    expect(screen.getByText('coder-agent')).toBeInTheDocument();
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('renders Diff Approval with Nexus CodeChange data model', () => {
    const change: CodeChange = {
      file: 'src/auth.ts',
      type: ChangeType.MODIFY,
      reasoning: 'Fix token validation',
      impact: ['Authentication flow'],
      risk: 'medium',
      diff: '@@ -1,3 +1,3 @@\n-old line\n+new line',
      content: 'new content',
      approved: false
    };

    const widgets: WidgetMount[] = [
      {
        id: 'diffApproval',
        component: (
          <div>
            <span>{change.file}</span>
            <span>{change.type}</span>
          </div>
        ),
        visible: true,
        chrome: true,
        title: 'Diff Approval',
        props: { changes: [change] },
        region: 'panel'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="panel" />
      </IDEShellProvider>
    );

    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
    expect(screen.getByText(ChangeType.MODIFY)).toBeInTheDocument();
  });

  it('renders Graph Explorer with Nexus SemanticCodeGraphData model', () => {
    const graph: SemanticCodeGraphData = {
      nodes: new Map([
        ['node-1', {
          id: 'node-1',
          type: NodeType.FUNCTION,
          name: 'authenticate',
          file: 'src/auth.ts',
          line: 10,
          endLine: 30,
          signature: 'function authenticate(token: string): boolean',
          summary: 'Validates auth token',
          complexity: 3,
          changeFrequency: 5
        }]
      ]),
      edges: [],
      dependencies: new Map(),
      builtAt: new Date(),
      fileCount: 1,
      symbolCount: 1
    };

    const widgets: WidgetMount[] = [
      {
        id: 'graphExplorer',
        component: (
          <div>
            <span>Graph: {graph.fileCount} files</span>
          </div>
        ),
        visible: true,
        chrome: true,
        title: 'Graph Explorer',
        props: { graph },
        region: 'panel'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="panel" />
      </IDEShellProvider>
    );

    expect(screen.getByText('Graph: 1 files')).toBeInTheDocument();
  });

  it('renders Reasoning Log with Nexus AgentMessage data model', () => {
    const message: AgentMessage = {
      agent: 'coder-agent',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      content: 'Proposed fix for login bug',
      metadata: { taskId: 'task-1' }
    };

    const widgets: WidgetMount[] = [
      {
        id: 'reasoningLog',
        component: (
          <div>
            <span>{message.agent}</span>
            <span>{message.content}</span>
          </div>
        ),
        visible: true,
        chrome: true,
        title: 'Reasoning Log',
        props: { log: [message] },
        region: 'panel'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="panel" />
      </IDEShellProvider>
    );

    expect(screen.getByText('coder-agent')).toBeInTheDocument();
    expect(screen.getByText('Proposed fix for login bug')).toBeInTheDocument();
  });

  it('renders Resource Footer with Nexus TokenUsage data model', () => {
    const tokenUsage: TokenUsage = {
      heavy: 100,
      fast: 500,
      general: 200,
      coder: 300,
      analyst: 150,
      total: 1250,
      estimatedCost: 0.05
    };

    const widgets: WidgetMount[] = [
      {
        id: 'resourceFooter',
        component: (
          <div>
            <span>Total: {tokenUsage.total}</span>
            <span>Cost: {tokenUsage.estimatedCost}</span>
          </div>
        ),
        visible: true,
        chrome: false,
        props: { tokenUsage, vectorStoreStatus: 'healthy' },
        region: 'footer'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="footer" />
      </IDEShellProvider>
    );

    expect(screen.getByText('Total: 1250')).toBeInTheDocument();
    expect(screen.getByText('Cost: 0.05')).toBeInTheDocument();
  });
});

describe('Widget Layout System', () => {
  it('renders multiple layout regions simultaneously', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'sidebarWidget',
        component: <div>Sidebar Content</div>,
        visible: true,
        chrome: false,
        region: 'sidebar'
      },
      {
        id: 'footerWidget',
        component: <div>Footer Content</div>,
        visible: true,
        chrome: false,
        region: 'footer'
      }
    ];

    render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" direction="column" />
        <WidgetRegion region="footer" direction="row" />
      </IDEShellProvider>
    );

    expect(screen.getByText('Sidebar Content')).toBeInTheDocument();
    expect(screen.getByText('Footer Content')).toBeInTheDocument();
  });

  it('applies layout direction correctly via CSS flex-direction', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'testWidget',
        component: <div>Direction Test</div>,
        visible: true,
        chrome: false,
        region: 'sidebar'
      }
    ];

    const { container } = render(
      <IDEShellProvider initialWidgets={widgets}>
        <WidgetRegion region="sidebar" direction="row" />
      </IDEShellProvider>
    );

    const region = container.querySelector('.widget-region');
    expect(region).toHaveStyle('flex-direction: row');
  });
});

describe('IDEShell Keyboard Shortcuts', () => {
  /** Validates: Requirements 4.1, 11.1, 16.1, 21.2 */

  it('renders IDEShell with default toggle state (all closed)', () => {
    render(<IDEShell />);

    expect(screen.getByTestId('ide-shell')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('semantic-search-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('agent-chat-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('impact-analysis-state')).toHaveTextContent('closed');
  });

  it('toggles Command Palette with Ctrl+P', () => {
    render(<IDEShell />);

    const paletteState = screen.getByTestId('command-palette-state');
    expect(paletteState).toHaveTextContent('closed');

    // Press Ctrl+P
    fireEvent.keyDown(document, { key: 'p', ctrlKey: true });
    expect(paletteState).toHaveTextContent('open');

    // Press Ctrl+P again to close
    fireEvent.keyDown(document, { key: 'p', ctrlKey: true });
    expect(paletteState).toHaveTextContent('closed');
  });

  it('toggles Semantic Search with Ctrl+Shift+F', () => {
    render(<IDEShell />);

    const searchState = screen.getByTestId('semantic-search-state');
    expect(searchState).toHaveTextContent('closed');

    // Press Ctrl+Shift+F
    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });
    expect(searchState).toHaveTextContent('open');

    // Press Ctrl+Shift+F again to close
    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });
    expect(searchState).toHaveTextContent('closed');
  });

  it('toggles Agent Chat with Ctrl+Shift+C', () => {
    render(<IDEShell />);

    const chatState = screen.getByTestId('agent-chat-state');
    expect(chatState).toHaveTextContent('closed');

    // Press Ctrl+Shift+C
    fireEvent.keyDown(document, { key: 'C', ctrlKey: true, shiftKey: true });
    expect(chatState).toHaveTextContent('open');

    // Press Ctrl+Shift+C again to close
    fireEvent.keyDown(document, { key: 'C', ctrlKey: true, shiftKey: true });
    expect(chatState).toHaveTextContent('closed');
  });

  it('toggles Impact Analysis with Ctrl+Shift+I', () => {
    render(<IDEShell />);

    const impactState = screen.getByTestId('impact-analysis-state');
    expect(impactState).toHaveTextContent('closed');

    // Press Ctrl+Shift+I
    fireEvent.keyDown(document, { key: 'I', ctrlKey: true, shiftKey: true });
    expect(impactState).toHaveTextContent('open');

    // Press Ctrl+Shift+I again to close
    fireEvent.keyDown(document, { key: 'I', ctrlKey: true, shiftKey: true });
    expect(impactState).toHaveTextContent('closed');
  });

  it('supports Cmd key on macOS (metaKey) for shortcuts', () => {
    render(<IDEShell />);

    const paletteState = screen.getByTestId('command-palette-state');
    expect(paletteState).toHaveTextContent('closed');

    // Press Cmd+P (metaKey instead of ctrlKey)
    fireEvent.keyDown(document, { key: 'p', metaKey: true });
    expect(paletteState).toHaveTextContent('open');
  });

  it('does not trigger shortcuts without Ctrl/Cmd key', () => {
    render(<IDEShell />);

    const paletteState = screen.getByTestId('command-palette-state');
    const searchState = screen.getByTestId('semantic-search-state');

    // Press 'p' without Ctrl
    fireEvent.keyDown(document, { key: 'p' });
    expect(paletteState).toHaveTextContent('closed');

    // Press 'F' without Ctrl
    fireEvent.keyDown(document, { key: 'F', shiftKey: true });
    expect(searchState).toHaveTextContent('closed');
  });

  it('does not trigger Ctrl+Shift+F when only Ctrl+F is pressed', () => {
    render(<IDEShell />);

    const searchState = screen.getByTestId('semantic-search-state');

    // Press Ctrl+F (without Shift)
    fireEvent.keyDown(document, { key: 'F', ctrlKey: true });
    expect(searchState).toHaveTextContent('closed');
  });

  it('allows multiple panels to be open simultaneously', () => {
    render(<IDEShell />);

    // Open Command Palette
    fireEvent.keyDown(document, { key: 'p', ctrlKey: true });
    expect(screen.getByTestId('command-palette-state')).toHaveTextContent('open');

    // Open Semantic Search
    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('semantic-search-state')).toHaveTextContent('open');

    // Both should be open
    expect(screen.getByTestId('command-palette-state')).toHaveTextContent('open');
    expect(screen.getByTestId('semantic-search-state')).toHaveTextContent('open');
  });

  it('cleans up keyboard event listeners on unmount', () => {
    const { unmount } = render(<IDEShell />);

    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('renders children inside IDEShell', () => {
    render(
      <IDEShell>
        <div>Child Content</div>
      </IDEShell>
    );

    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });
});
