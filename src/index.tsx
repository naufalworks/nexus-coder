import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  IDEChrome,
  TaskPanel,
  DiffApproval,
  GraphExplorer,
  ReasoningLog,
  InContextActions,
  AgentStatus,
  ResourceFooter,
  WidgetSystem
} from './widgets';

// Nexus types and mock data
import {
  Task,
  AgentInfo,
  CodeChange,
  SemanticCodeGraphData,
  AgentMessage,
  TokenUsage,
  TaskStatus
} from './types';

const tasks: Task[] = [];
const agents: AgentInfo[] = [];
const changes: CodeChange[] = [];
const graph: SemanticCodeGraphData = {
  nodes: new Map(),
  edges: [],
  dependencies: new Map(),
  builtAt: new Date(),
  fileCount: 0,
  symbolCount: 0
};
const log: AgentMessage[] = [];
const tokenUsage: TokenUsage = {
  heavy: 0,
  fast: 0,
  general: 0,
  coder: 0,
  analyst: 0,
  total: 0,
  estimatedCost: 0
};

// Widget foundation with Nexus type integration
const widgets = [
  {
    id: 'taskPanel',
    component: (
      <TaskPanel tasks={tasks} agents={agents} onSelectTask={() => {}} filter={{}} />
    ),
    visible: true,
    chrome: true,
    props: { tasks, agents }
  },
  {
    id: 'diffApproval',
    component: (
      <DiffApproval changes={changes} onApprove={() => {}} onReject={() => {}} onExplain={() => {}} />
    ),
    visible: true,
    chrome: true,
    props: { changes }
  },
  {
    id: 'graphExplorer',
    component: (
      <GraphExplorer graph={graph} activeTask={tasks[0]} />
    ),
    visible: true,
    chrome: true,
    props: { graph, activeTask: tasks[0] }
  },
  {
    id: 'reasoningLog',
    component: (
      <ReasoningLog log={log} />
    ),
    visible: true,
    chrome: true,
    props: { log }
  },
  {
    id: 'agentStatus',
    component: (
      <AgentStatus agents={agents} progress={{}} />
    ),
    visible: true,
    chrome: true,
    props: { agents }
  },
  {
    id: 'resourceFooter',
    component: (
      <ResourceFooter tokenUsage={tokenUsage} vectorStoreStatus='healthy' />
    ),
    visible: true,
    chrome: false,
    props: { tokenUsage, vectorStoreStatus: 'healthy' }
  }
];

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <IDEChrome widgets={widgets} layout="sidebar" />
  );
}
