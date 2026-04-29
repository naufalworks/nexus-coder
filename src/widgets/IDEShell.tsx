import React, { ReactNode, useState, createContext, useContext, useEffect } from 'react';

/**
 * WidgetMount: Describes a mounted widget instance in the IDE shell.
 */
export interface WidgetMount {
  /** Unique identifier for this widget instance */
  id: string;
  /** React node to render */
  component: ReactNode;
  /** Whether the widget is currently visible */
  visible: boolean;
  /** Show minimal chrome (header, border) around widget */
  chrome?: boolean;
  /** Widget title for chrome header */
  title?: string;
  /** Optional props for Nexus data model integration */
  props?: Record<string, unknown>;
  /** Layout region where this widget should appear */
  region?: LayoutRegion;
}

/**
 * LayoutRegion: Defines where a widget is placed in the IDE shell.
 */
export type LayoutRegion = 'sidebar' | 'panel' | 'footer' | 'header' | 'custom';

/**
 * WidgetSystemControl: API for dynamically mounting/unmounting widgets.
 */
export interface WidgetSystemControl {
  /** Mount a new widget into the shell */
  mount: (widget: WidgetMount) => void;
  /** Unmount a widget by id */
  unmount: (id: string) => void;
  /** Toggle or set visibility of a widget */
  setVisibility: (id: string, visible: boolean) => void;
  /** Move a widget to a different layout region */
  moveWidget: (id: string, region: LayoutRegion) => void;
  /** Get all currently mounted widgets */
  getWidgets: () => WidgetMount[];
}

/**
 * React context for widget system control.
 */
const WidgetSystemContext = createContext<WidgetSystemControl | null>(null);

/**
 * Hook to access the widget system control API.
 */
export function useWidgetSystem(): WidgetSystemControl {
  const ctx = useContext(WidgetSystemContext);
  if (!ctx) {
    throw new Error('useWidgetSystem must be used within an IDEShellProvider');
  }
  return ctx;
}

/**
 * Layout configuration for a region of the IDE shell.
 */
export interface LayoutConfig {
  region: LayoutRegion;
  direction: 'row' | 'column';
  minWidth?: number;
  minHeight?: number;
}

/**
 * IDEShellProvider: Provides the widget system context for mounting/unmounting widgets.
 */
export const IDEShellProvider: React.FC<{
  children: ReactNode;
  initialWidgets?: WidgetMount[];
}> = ({ children, initialWidgets = [] }) => {
  const [widgets, setWidgets] = useState<WidgetMount[]>(initialWidgets);

  const mount = (widget: WidgetMount) => {
    setWidgets(prev => {
      if (prev.some(w => w.id === widget.id)) {
        return prev; // Don't duplicate
      }
      return [...prev, widget];
    });
  };

  const unmount = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const setVisibility = (id: string, visible: boolean) => {
    setWidgets(prev =>
      prev.map(w => (w.id === id ? { ...w, visible } : w))
    );
  };

  const moveWidget = (id: string, region: LayoutRegion) => {
    setWidgets(prev =>
      prev.map(w => (w.id === id ? { ...w, region } : w))
    );
  };

  const getWidgets = () => widgets;

  const control: WidgetSystemControl = {
    mount,
    unmount,
    setVisibility,
    moveWidget,
    getWidgets
  };

  return (
    <WidgetSystemContext.Provider value={control}>
      {children}
    </WidgetSystemContext.Provider>
  );
};

/**
 * WidgetRegion: Renders widgets assigned to a specific layout region.
 * Widgets are filtered by their `region` property. If a widget has no region
 * specified, it will appear in the 'sidebar' region by default.
 */
export const WidgetRegion: React.FC<{
  region: LayoutRegion;
  direction?: 'row' | 'column';
}> = ({ region, direction }) => {
  const { getWidgets } = useWidgetSystem();
  const widgets = getWidgets();

  const regionWidgets = widgets.filter(w => {
    if (!w.visible) return false;
    // Default region is 'sidebar' if not specified
    const widgetRegion = w.region || 'sidebar';
    return widgetRegion === region;
  });

  return (
    <div
      className={`widget-region region-${region}`}
      style={{ display: 'flex', flexDirection: direction || 'column' }}
    >
      {regionWidgets.map(w => (
        <div
          className={`widget chrome-${w.chrome ? 'on' : 'off'}`}
          key={w.id}
          data-widget-id={w.id}
        >
          {w.chrome && w.title && (
            <div className="widget-chrome-header">
              <span className="widget-title">{w.title}</span>
            </div>
          )}
          <div className="widget-content">{w.component}</div>
        </div>
      ))}
    </div>
  );
};

/**
 * Toggle state for feature widgets accessible via keyboard shortcuts.
 */
export interface WidgetToggleState {
  /** Whether the Command Palette is open (Ctrl+P) */
  commandPaletteOpen: boolean;
  /** Whether Semantic Search is open (Ctrl+Shift+F) */
  semanticSearchOpen: boolean;
  /** Whether Agent Chat is open (Ctrl+Shift+C) */
  agentChatOpen: boolean;
  /** Whether Impact Analysis is open (Ctrl+Shift+I) */
  impactAnalysisOpen: boolean;
}

/** Default toggle state with all panels closed */
export const DEFAULT_TOGGLE_STATE: WidgetToggleState = {
  commandPaletteOpen: false,
  semanticSearchOpen: false,
  agentChatOpen: false,
  impactAnalysisOpen: false,
};

/**
 * IDEShell: Main IDE layout component that integrates all feature widgets
 * with keyboard shortcut support for toggling panels.
 *
 * Keyboard Shortcuts:
 * - Ctrl+P: Toggle Command Palette
 * - Ctrl+Shift+F: Toggle Semantic Search
 * - Ctrl+Shift+C: Toggle Agent Chat
 * - Ctrl+Shift+I: Toggle Impact Analysis
 */
export const IDEShell: React.FC<{
  children?: ReactNode;
}> = ({ children }) => {
  const [toggleState, setToggleState] = useState<WidgetToggleState>(DEFAULT_TOGGLE_STATE);

  const toggle = (key: keyof WidgetToggleState) => {
    setToggleState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (!ctrl) return;

      // Ctrl+P: Toggle Command Palette
      if (e.key === 'p' && !shift) {
        e.preventDefault();
        toggle('commandPaletteOpen');
      }
      // Ctrl+Shift+F: Toggle Semantic Search
      else if (e.key === 'F' && shift) {
        e.preventDefault();
        toggle('semanticSearchOpen');
      }
      // Ctrl+Shift+C: Toggle Agent Chat
      else if (e.key === 'C' && shift) {
        e.preventDefault();
        toggle('agentChatOpen');
      }
      // Ctrl+Shift+I: Toggle Impact Analysis
      else if (e.key === 'I' && shift) {
        e.preventDefault();
        toggle('impactAnalysisOpen');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="ide-shell" data-testid="ide-shell">
      <div className="ide-shell-toggle-state" data-testid="toggle-state">
        <span data-testid="command-palette-state">{toggleState.commandPaletteOpen ? 'open' : 'closed'}</span>
        <span data-testid="semantic-search-state">{toggleState.semanticSearchOpen ? 'open' : 'closed'}</span>
        <span data-testid="agent-chat-state">{toggleState.agentChatOpen ? 'open' : 'closed'}</span>
        <span data-testid="impact-analysis-state">{toggleState.impactAnalysisOpen ? 'open' : 'closed'}</span>
      </div>
      {children}
    </div>
  );
};
