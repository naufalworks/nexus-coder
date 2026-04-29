import {
  approveCommand,
  diffCommand,
  statusCommand,
  tasksCommand,
  codeCommand,
  reviewCommand,
  graphCommand,
  contextCommand,
  searchCommand,
  CLIContext,
} from './commands';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  AgentInfo,
  AgentCapability,
  CodeChange,
  ChangeType,
  AgentMessage,
  SemanticCodeGraphData,
  NodeType,
  EdgeType,
  SCGNode,
} from '../types';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('Process.exit mock');
});

describe('CLI Commands', () => {
  let context: CLIContext;

  beforeEach(() => {
    // Reset mocks
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();

    // Setup test context
    const task1: Task = {
      id: 'task-1',
      instruction: 'Fix authentication bug',
      status: TaskStatus.COMPLETED,
      subTasks: [
        {
          id: 'subtask-1',
          instruction: 'Update auth logic',
          assignedAgent: 'coder',
          requiredCapabilities: [AgentCapability.CODE_GENERATION],
          dependencies: [],
          status: TaskStatus.COMPLETED,
        },
      ],
      createdAt: new Date('2026-04-27T10:00:00Z'),
      updatedAt: new Date('2026-04-27T11:00:00Z'),
      classification: {
        type: TaskType.BUG_FIX,
        priority: TaskPriority.HIGH,
        complexity: 5,
        requiresContext: true,
        requiresCodeGeneration: true,
        requiresGitOps: false,
        requiresReview: true,
        affectedAreas: ['src/auth.ts'],
        estimatedTokens: 1000,
      },
      result: {
        success: true,
        output: 'Authentication fixed',
        changes: [
          {
            file: 'src/auth.ts',
            type: ChangeType.MODIFY,
            reasoning: 'Fix token validation',
            impact: ['authentication', 'security'],
            risk: 'medium',
            diff: '--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,5 +10,5 @@\n-  return false;\n+  return validateToken(token);',
            content: 'updated content',
            approved: false,
          },
        ],
      },
      tokenUsage: {
        heavy: 500,
        fast: 200,
        general: 100,
        coder: 200,
        analyst: 0,
        total: 1000,
        estimatedCost: 0.05,
      },
    };

    const task2: Task = {
      id: 'task-2',
      instruction: 'Add new feature',
      status: TaskStatus.PENDING,
      subTasks: [],
      createdAt: new Date('2026-04-27T12:00:00Z'),
      updatedAt: new Date('2026-04-27T12:00:00Z'),
    };

    const agent1: AgentInfo = {
      name: 'coder',
      capabilities: [AgentCapability.CODE_GENERATION],
      supportedTaskTypes: [TaskType.BUG_FIX, TaskType.FEATURE],
      status: 'busy',
      currentTask: 'task-1',
    };

    const agent2: AgentInfo = {
      name: 'reviewer',
      capabilities: [AgentCapability.CODE_REVIEW],
      supportedTaskTypes: [TaskType.REVIEW],
      status: 'idle',
    };

    const change1: CodeChange = {
      file: 'src/auth.ts',
      type: ChangeType.MODIFY,
      reasoning: 'Fix token validation',
      impact: ['authentication', 'security'],
      risk: 'medium',
      diff: '--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,5 +10,5 @@\n-  return false;\n+  return validateToken(token);',
      content: 'updated content',
      approved: false,
    };

    const message1: AgentMessage = {
      agent: 'coder',
      timestamp: new Date('2026-04-27T10:30:00Z'),
      content: 'Analyzing authentication logic',
      metadata: { file: 'src/auth.ts', line: 10 },
    };

    const message2: AgentMessage = {
      agent: 'reviewer',
      timestamp: new Date('2026-04-27T11:00:00Z'),
      content: 'Code review completed',
    };

    const node1: SCGNode = {
      id: 'node-1',
      type: NodeType.FUNCTION,
      name: 'validateToken',
      file: 'src/auth.ts',
      line: 10,
      endLine: 20,
      signature: 'function validateToken(token: string): boolean',
      summary: 'Validates authentication token',
      complexity: 3,
      changeFrequency: 5,
    };

    const graph: SemanticCodeGraphData = {
      nodes: new Map([['node-1', node1]]),
      edges: [],
      dependencies: new Map(),
      builtAt: new Date('2026-04-27T09:00:00Z'),
      fileCount: 1,
      symbolCount: 1,
    };

    context = {
      tasks: [task1, task2],
      agents: [agent1, agent2],
      changes: [change1],
      graph,
      log: [message1, message2],
    };
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('approveCommand', () => {
    it('should approve a specific change', async () => {
      await approveCommand(context, { taskId: 'task-1', changeIndex: 0 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Approved change 0 for task task-1')
      );
      expect(context.tasks[0].result?.changes?.[0].approved).toBe(true);
      expect(context.log.length).toBe(3); // Original 2 + new approval log
    });

    it('should approve all changes when --all flag is used', async () => {
      await approveCommand(context, { all: true });

      expect(context.changes[0].approved).toBe(true);
    });

    it('should fail when task is not found', async () => {
      await expect(async () => {
        await approveCommand(context, { taskId: 'invalid-task', changeIndex: 0 });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });

    it('should fail when change index is invalid', async () => {
      await expect(async () => {
        await approveCommand(context, { taskId: 'task-1', changeIndex: 99 });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid change index')
      );
    });

    it('should fail when taskId or changeIndex is missing', async () => {
      await expect(async () => {
        await approveCommand(context, {});
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task ID and change index are required')
      );
    });
  });

  describe('diffCommand', () => {
    it('should display all changes', async () => {
      await diffCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Fix authentication bug')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('src/auth.ts')
      );
    });

    it('should filter changes by task ID', async () => {
      await diffCommand(context, { taskId: 'task-1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('src/auth.ts')
      );
    });

    it('should show verbose diff when --verbose flag is used', async () => {
      await diffCommand(context, { verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Diff:')
      );
    });

    it('should handle no changes gracefully', async () => {
      context.changes = [];
      context.tasks[0].result!.changes = [];

      await diffCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No changes to display')
      );
    });

    it('should fail when task is not found', async () => {
      await expect(async () => {
        await diffCommand(context, { taskId: 'invalid-task' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });
  });

  describe('statusCommand', () => {
    it('should display all agent statuses', async () => {
      await statusCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Agent Status')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('coder')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('reviewer')
      );
    });

    it('should filter by agent name', async () => {
      await statusCommand(context, { agent: 'coder' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('coder')
      );
    });

    it('should fail when agent is not found', async () => {
      await expect(async () => {
        await statusCommand(context, { agent: 'invalid-agent' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Agent not found')
      );
    });
  });

  describe('tasksCommand', () => {
    it('should list all tasks', async () => {
      await tasksCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Tasks (2)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-2')
      );
    });

    it('should filter by status', async () => {
      await tasksCommand(context, { status: TaskStatus.COMPLETED });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Tasks (1)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1')
      );
    });

    it('should filter by agent', async () => {
      await tasksCommand(context, { agent: 'coder' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1')
      );
    });

    it('should show verbose information', async () => {
      await tasksCommand(context, { verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Agents:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Files:')
      );
    });

    it('should handle no tasks gracefully', async () => {
      context.tasks = [];

      await tasksCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No tasks found')
      );
    });
  });

  describe('codeCommand', () => {
    it('should display code context for a task', async () => {
      await codeCommand(context, { taskId: 'task-1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Code Context: task-1')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Fix authentication bug')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('src/auth.ts')
      );
    });

    it('should fail when task is not found', async () => {
      await expect(async () => {
        await codeCommand(context, { taskId: 'invalid-task' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });
  });

  describe('reviewCommand', () => {
    it('should display all log entries', async () => {
      await reviewCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Reasoning Log (2 entries)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('coder')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('reviewer')
      );
    });

    it('should filter by agent', async () => {
      await reviewCommand(context, { agent: 'coder' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Reasoning Log (1 entries)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing authentication logic')
      );
    });

    it('should filter by keyword', async () => {
      await reviewCommand(context, { keyword: 'authentication' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing authentication logic')
      );
    });

    it('should limit number of entries', async () => {
      await reviewCommand(context, { limit: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Reasoning Log (1 entries)')
      );
    });

    it('should handle no log entries gracefully', async () => {
      context.log = [];

      await reviewCommand(context, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No log entries found')
      );
    });
  });

  describe('graphCommand', () => {
    it('should display semantic graph for a task', async () => {
      await graphCommand(context, { taskId: 'task-1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Semantic Graph: task-1')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('validateToken')
      );
    });

    it('should show relationships when --expand flag is used', async () => {
      await graphCommand(context, { taskId: 'task-1', expand: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('validateToken')
      );
    });

    it('should fail when graph is not available', async () => {
      context.graph = undefined;

      await expect(async () => {
        await graphCommand(context, { taskId: 'task-1' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Semantic code graph not available')
      );
    });

    it('should fail when task is not found', async () => {
      await expect(async () => {
        await graphCommand(context, { taskId: 'invalid-task' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });
  });

  describe('contextCommand', () => {
    it('should display full context for a task', async () => {
      await contextCommand(context, { taskId: 'task-1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Full Context: task-1')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Fix authentication bug')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Classification:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Assigned Agents:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Token Usage:')
      );
    });

    it('should fail when task is not found', async () => {
      await expect(async () => {
        await contextCommand(context, { taskId: 'invalid-task' });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });
  });

  describe('searchCommand', () => {
    it('should execute semantic search and display results', async () => {
      const mockVectorStore = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'result-1',
            content: 'function validateToken(token: string): boolean { return true; }',
            relevance: 0.85,
            metadata: {
              file: 'src/auth.ts',
              line: 10,
              type: 'code',
              source: 'vector',
              timestamp: new Date(),
            },
          },
        ]),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const mockTraversal = {
        getRelatedNodes: jest.fn().mockReturnValue([]),
        findByName: jest.fn().mockReturnValue([]),
      };

      await searchCommand(mockVectorStore, mockTraversal, 'authentication', {
        limit: 10,
        minScore: 0.5,
        graph: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Search Results for: "authentication"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('src/auth.ts')
      );
    });

    it('should handle no results gracefully', async () => {
      const mockVectorStore = {
        search: jest.fn().mockResolvedValue([]),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const mockTraversal = {
        getRelatedNodes: jest.fn().mockReturnValue([]),
        findByName: jest.fn().mockReturnValue([]),
      };

      await searchCommand(mockVectorStore, mockTraversal, 'nonexistent', {
        limit: 10,
        minScore: 0.5,
        graph: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No results found')
      );
    });

    it('should respect limit option', async () => {
      const mockVectorStore = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'result-1',
            content: 'result 1',
            relevance: 0.9,
            metadata: { file: 'file1.ts', line: 1, type: 'code', source: 'vector', timestamp: new Date() },
          },
        ]),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const mockTraversal = {
        getRelatedNodes: jest.fn().mockReturnValue([]),
        findByName: jest.fn().mockReturnValue([]),
      };

      await searchCommand(mockVectorStore, mockTraversal, 'test', {
        limit: 1,
        minScore: 0.5,
        graph: false,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Search Results')
      );
    });

    it('should handle search errors', async () => {
      const mockVectorStore = {
        search: jest.fn().mockRejectedValue(new Error('Vector store unavailable')),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const mockTraversal = {
        getRelatedNodes: jest.fn().mockReturnValue([]),
        findByName: jest.fn().mockReturnValue([]),
      };

      await expect(async () => {
        await searchCommand(mockVectorStore, mockTraversal, 'test', {
          limit: 10,
          minScore: 0.5,
          graph: true,
        });
      }).rejects.toThrow('Process.exit mock');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error:')
      );
    });

    it('should disable graph context when --no-graph is used', async () => {
      const mockVectorStore = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'result-1',
            content: 'test content',
            relevance: 0.85,
            metadata: { file: 'test.ts', line: 1, type: 'code', source: 'vector', timestamp: new Date() },
          },
        ]),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      const mockTraversal = {
        getRelatedNodes: jest.fn().mockReturnValue([]),
        findByName: jest.fn().mockReturnValue([]),
      };

      await searchCommand(mockVectorStore, mockTraversal, 'test', {
        limit: 10,
        minScore: 0.5,
        graph: false,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Search Results')
      );
    });
  });
});
