/**
 * Test data factories for generating consistent test data.
 * 
 * Validates: Requirements 1.1, 2.1, 3.1
 */

import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  AgentInfo,
  AgentCapability,
  CodeChange,
  ChangeType,
  SubTask,
  AgentMessage,
  TokenUsage,
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
} from '../../types';
import { IDEStateSnapshot } from './types';

// ---------------------------------------------------------------------------
// Task Factories
// ---------------------------------------------------------------------------

/**
 * Create a Task with sensible defaults.
 */
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 9)}`,
    instruction: 'Test task instruction',
    subTasks: [],
    status: TaskStatus.PENDING,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Create a Task with changes for approval testing.
 */
export function makeTaskWithChanges(changeCount: number = 1): Task {
  const changes: CodeChange[] = [];
  for (let i = 0; i < changeCount; i++) {
    changes.push(makeCodeChange({ file: `src/file${i}.ts` }));
  }
  
  return makeTask({
    status: TaskStatus.AWAITING_APPROVAL,
    result: {
      success: true,
      output: 'Task completed with changes',
      changes,
    },
  });
}

// ---------------------------------------------------------------------------
// SubTask Factories
// ---------------------------------------------------------------------------

/**
 * Create a SubTask with sensible defaults.
 */
export function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: `st-${Math.random().toString(36).slice(2, 9)}`,
    instruction: 'Subtask instruction',
    assignedAgent: 'agent-coder',
    requiredCapabilities: [AgentCapability.CODE_GENERATION],
    dependencies: [],
    status: TaskStatus.EXECUTING,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CodeChange Factories
// ---------------------------------------------------------------------------

/**
 * Create a CodeChange with sensible defaults.
 */
export function makeCodeChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    file: 'src/example.ts',
    type: ChangeType.MODIFY,
    reasoning: 'Test change reasoning',
    impact: ['Test impact area'],
    risk: 'low',
    diff: '@@ -1,3 +1,3 @@\n-old line\n+new line',
    content: 'new content',
    approved: false,
    ...overrides,
  };
}

/**
 * Create multiple CodeChanges for batch testing.
 */
export function makeCodeChanges(count: number, filePattern: string = 'file'): CodeChange[] {
  const changes: CodeChange[] = [];
  for (let i = 0; i < count; i++) {
    changes.push(makeCodeChange({ file: `src/${filePattern}${i}.ts` }));
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Agent Factories
// ---------------------------------------------------------------------------

/**
 * Create an AgentInfo with sensible defaults.
 */
export function makeAgentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: `agent-${Math.random().toString(36).slice(2, 7)}`,
    capabilities: [AgentCapability.CODE_GENERATION],
    supportedTaskTypes: [TaskType.FEATURE, TaskType.BUG_FIX],
    status: 'idle',
    ...overrides,
  };
}

/**
 * Create multiple agents for testing.
 */
export function makeAgents(count: number, status: 'idle' | 'busy' | 'error' = 'idle'): AgentInfo[] {
  const roles = ['coder', 'reviewer', 'architect', 'tester', 'analyzer'];
  const agents: AgentInfo[] = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % roles.length];
    agents.push(makeAgentInfo({
      name: `agent-${role}-${i}`,
      status,
    }));
  }
  return agents;
}

// ---------------------------------------------------------------------------
// AgentMessage Factories
// ---------------------------------------------------------------------------

/**
 * Create an AgentMessage with sensible defaults.
 */
export function makeAgentMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    agent: 'agent-coder',
    timestamp: new Date(),
    content: 'Test message content',
    ...overrides,
  };
}

/**
 * Create multiple AgentMessages for testing.
 */
export function makeAgentMessages(count: number, agent: string = 'agent-coder'): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(makeAgentMessage({
      agent,
      content: `Message ${i} from ${agent}`,
      timestamp: new Date(Date.now() - (count - i) * 1000),
    }));
  }
  return messages;
}

// ---------------------------------------------------------------------------
// TokenUsage Factories
// ---------------------------------------------------------------------------

/**
 * Create TokenUsage with sensible defaults.
 */
export function makeTokenUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    heavy: 500,
    fast: 300,
    general: 200,
    coder: 400,
    analyst: 100,
    total: 1500,
    estimatedCost: 0.03,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Graph Factories
// ---------------------------------------------------------------------------

/**
 * Create a graph node with sensible defaults.
 */
export function makeGraphNode(
  id: string,
  name: string,
  file: string,
  type: NodeType = NodeType.FUNCTION
): SCGNode {
  return {
    id,
    type,
    name,
    file,
    line: 1,
    endLine: 20,
    signature: `function ${name}()`,
    summary: `${name} function summary`,
    complexity: 1,
    changeFrequency: 1,
  };
}

/**
 * Create a graph edge.
 */
export function makeGraphEdge(from: string, to: string, type: EdgeType = EdgeType.CALLS, weight: number = 1): SCGEdge {
  return { from, to, type, weight };
}

/**
 * Create a complete SemanticCodeGraphData for testing.
 */
export function makeGraph(
  nodeCount: number = 10,
  edgeCount: number = 20
): SemanticCodeGraphData {
  const nodes = new Map<string, SCGNode>();
  const edges: SCGEdge[] = [];
  const dependencies = new Map<string, string[]>();
  
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = `node-${i}`;
    const node = makeGraphNode(nodeId, `function${i}`, `src/file${i % 5}.ts`);
    nodes.set(nodeId, node);
    dependencies.set(nodeId, []);
  }
  
  // Create edges (between random nodes)
  const nodeIds = Array.from(nodes.keys());
  for (let i = 0; i < edgeCount; i++) {
    const from = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    const to = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    if (from !== to) {
      const edge = makeGraphEdge(from, to);
      edges.push(edge);
      const deps = dependencies.get(from) || [];
      deps.push(to);
      dependencies.set(from, deps);
    }
  }
  
  return {
    nodes,
    edges,
    dependencies,
    builtAt: new Date(),
    fileCount: 5,
    symbolCount: nodeCount,
  };
}

// ---------------------------------------------------------------------------
// IDE State Snapshot Factories
// ---------------------------------------------------------------------------

/**
 * Create a complete IDE state snapshot for integration testing.
 */
export function makeIDEState(overrides: Partial<IDEStateSnapshot> = {}): IDEStateSnapshot {
  return {
    tasks: [],
    agents: makeAgents(3),
    changes: [],
    messages: [],
    tokenUsage: makeTokenUsage(),
    vectorStoreStatus: 'healthy',
    ...overrides,
  };
}

/**
 * Create a large dataset for performance testing.
 */
export function makeLargeDataset(config: {
  tasks: number;
  agents: number;
  changes: number;
}): IDEStateSnapshot {
  const tasks: Task[] = [];
  const agents = makeAgents(config.agents);
  const changes: CodeChange[] = [];
  const messages: AgentMessage[] = [];
  
  // Create tasks with changes
  for (let i = 0; i < config.tasks; i++) {
    const taskChanges: CodeChange[] = [];
    const changesPerTask = Math.floor(config.changes / config.tasks);
    
    for (let j = 0; j < changesPerTask; j++) {
      const change = makeCodeChange({ file: `src/task${i}_file${j}.ts` });
      taskChanges.push(change);
      changes.push(change);
    }
    
    tasks.push(makeTask({
      id: `task-${i}`,
      instruction: `Task ${i} instruction`,
      status: TaskStatus.AWAITING_APPROVAL,
      result: {
        success: true,
        output: `Task ${i} completed`,
        changes: taskChanges,
      },
    }));
    
    // Add reasoning log messages
    messages.push(makeAgentMessage({
      agent: agents[i % agents.length].name,
      content: `Completed task ${i}`,
    }));
  }
  
  return {
    tasks,
    agents,
    changes,
    messages,
    tokenUsage: makeTokenUsage({ total: 50000 + config.changes * 100 }),
    vectorStoreStatus: 'healthy',
  };
}
