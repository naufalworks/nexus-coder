import React, { ReactNode, useState, useCallback } from 'react';
import { IDEShellProvider, WidgetRegion, useWidgetSystem, WidgetMount, LayoutRegion } from './IDEShell';
import { ResourceFooter } from './ResourceFooter';
import { Task, AgentInfo, CodeChange, SemanticCodeGraphData, AgentMessage, TokenUsage, TaskStatus } from '../types';

/**
 * IDEShellLayout: Defines the layout structure of the IDE shell.
 */
export interface IDEShellLayout {
  sidebar?: LayoutRegion;
  panel?: LayoutRegion;
  footer?: LayoutRegion;
  header?: LayoutRegion;
  custom?: LayoutRegion;
}

/**
 * IDEChrome: Main IDE shell component providing the full layout with widget regions.
 * 
 * Integrates:
 * - Sidebar: Task Panel, Agent Status
 * - Main Panel: Diff Approval, Graph Explorer, Reasoning Log
 * - Footer: Resource Footer
 * - Header: IDE title bar
 */
export const IDEChrome: React.FC<{
  widgets: WidgetMount[];
  layout?: 'sidebar' | 'panel' | 'footer' | 'custom';
}> = ({ widgets, layout }) => {
  return (
    <IDEShellProvider initialWidgets={widgets}>
      <div className="ide-chrome">
        <header className="ide-header">
          <h1>Nexus IDE</h1>
        </header>
        <div className="ide-body">
          <aside className="ide-sidebar">
            <WidgetRegion region="sidebar" direction="column" />
          </aside>
          <main className="ide-main">
            <WidgetRegion region="panel" direction="column" />
          </main>
        </div>
        <footer className="ide-footer-region">
          <WidgetRegion region="footer" direction="row" />
        </footer>
      </div>
    </IDEShellProvider>
  );
};
