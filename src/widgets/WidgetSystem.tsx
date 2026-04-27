import React, { ReactNode, useState } from 'react';
import { Task, AgentInfo, CodeChange, SemanticCodeGraphData, AgentMessage, TokenUsage } from '../types';

export interface WidgetMount {
  id: string;
  component: ReactNode;
  visible: boolean;
  chrome?: boolean; // show minimal chrome
  props?: Record<string, unknown>; // Used for Nexus data models
}

export interface WidgetSystemControl {
  mount: (widget: WidgetMount) => void;
  unmount: (id: string) => void;
  setVisibility: (id: string, visible: boolean) => void;
}

interface WidgetSystemProps {
  initialWidgets: WidgetMount[];
  layout?: 'sidebar' | 'panel' | 'footer' | 'custom';
}

/**
 * WidgetSystem: Enhanced foundation for composable widgets with mount/unmount, layout & Nexus data model integration.
 */
export const WidgetSystem: React.FC<WidgetSystemProps> = ({ initialWidgets, layout }) => {
  const [widgets, setWidgets] = useState<WidgetMount[]>(initialWidgets);

  // WidgetSystemControl API
  const mount = (widget: WidgetMount) => {
    setWidgets(prev => [...prev, widget]);
  };

  const unmount = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const setVisibility = (id: string, visible: boolean) => {
    setWidgets(prev =>
      prev.map(w => w.id === id ? { ...w, visible } : w)
    );
  };

  // Provide control API via context (optional)

  return (
    <div className={`widget-system layout-${layout || 'sidebar'}`}>
      {widgets.map(w =>
        w.visible ? (
          <div className={`widget chrome-${w.chrome ? 'on' : 'off'}`} key={w.id}>
            {w.component}
          </div>
        ) : null
      )}
    </div>
  );
};
