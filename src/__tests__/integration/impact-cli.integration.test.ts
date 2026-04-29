/**
 * Integration Test: Impact CLI Command
 *
 * Validates: Requirements for the `nexus impact` CLI command
 *
 * Tests the impact command with --file, --node, --depth, and --json options,
 * plus error handling scenarios.
 */

// Mock inquirer to avoid ESM import issues in Jest
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  default: { prompt: jest.fn() },
}));

import { impactCommand } from '../../cli/commands';
import { ImpactAnalysisService } from '../../services/impact-service';
import { ImpactSeverity, ImpactNode, ImpactAnalysis, RiskAssessment } from '../../types/impact';
import { SCGNode, EdgeType, SemanticCodeGraphData } from '../../types/graph';
import { GraphTraversal } from '../../core/context/graph/traversal';
import { ChangeType } from '../../types/task';

// Mock process.exit to prevent actual exit during tests
const mockExit = jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
  throw new Error(`process.exit called with ${code}`);
}) as any);

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

// Helper: Create a mock SCGNode
function createMockNode(overrides: Partial<SCGNode> = {}): SCGNode {
  return {
    id: 'node-1',
    type: 'function' as any,
    name: 'testFunc',
    file: 'src/test.ts',
    line: 10,
    endLine: 20,
    signature: 'function testFunc()',
    summary: 'A test function',
    complexity: 1,
    changeFrequency: 0,
    ...overrides,
  };
}

// Helper: Create a mock ImpactNode
function createMockImpactNode(overrides: Partial<ImpactNode> = {}): ImpactNode {
  return {
    node: createMockNode({ id: 'node-impact-1', name: 'impactedFunc', file: 'src/impacted.ts', line: 5 }),
    impactPath: [{ from: 'node-1', to: 'node-impact-1', edgeType: EdgeType.CALLS }],
    distance: 1,
    severity: ImpactSeverity.HIGH,
    reason: 'Directly calls the changed code',
    ...overrides,
  };
}

// Helper: Create a mock ImpactAnalysis
function createMockAnalysis(overrides: Partial<ImpactAnalysis> = {}): ImpactAnalysis {
  const defaultRisk: RiskAssessment = {
    overall: ImpactSeverity.HIGH,
    score: 45,
    directImpactCount: 1,
    transitiveImpactCount: 1,
    affectedTestCount: 1,
    affectedFileCount: 2,
    reasoning: 'Change has moderate impact.',
  };

  return {
    seedChange: {
      file: 'src/auth.ts',
      type: ChangeType.MODIFY,
      reasoning: 'Analyzing impact',
      impact: [],
      risk: 'medium',
      diff: '',
      content: '',
      approved: false,
    },
    seedNodeId: 'node-auth',
    directImpacts: [
      createMockImpactNode({
        node: createMockNode({ id: 'node-mw', name: 'authMiddleware', file: 'src/middleware.ts', line: 15 }),
        distance: 1,
        severity: ImpactSeverity.CRITICAL,
        reason: 'Directly CALLS the changed code in src/auth.ts',
      }),
    ],
    transitiveImpacts: [
      createMockImpactNode({
        node: createMockNode({ id: 'node-user', name: 'userService', file: 'src/user.ts', line: 10 }),
        distance: 2,
        severity: ImpactSeverity.MEDIUM,
        reason: 'Indirectly affected through 1 intermediate dependencies',
      }),
    ],
    affectedTests: [
      {
        node: createMockNode({ id: 'node-test', name: 'authTest', file: 'src/auth.test.ts', line: 1 }),
        impactPath: [],
        distance: 2,
        severity: ImpactSeverity.INFO,
        reason: 'Test file affected',
      },
    ],
    riskAssessment: defaultRisk,
    affectedFiles: [
      {
        file: 'src/middleware.ts',
        impactedNodes: [createMockImpactNode()],
        highestSeverity: ImpactSeverity.CRITICAL,
        changeTypes: [ChangeType.MODIFY],
      },
      {
        file: 'src/user.ts',
        impactedNodes: [createMockImpactNode()],
        highestSeverity: ImpactSeverity.MEDIUM,
        changeTypes: [ChangeType.MODIFY],
      },
    ],
    analyzedAt: new Date(),
    stats: {
      nodesTraversed: 5,
      edgesFollowed: 8,
      maxDepthReached: 3,
      analysisTimeMs: 45,
    },
    ...overrides,
  };
}

describe('Impact CLI Command Integration Tests', () => {
  let mockImpactService: { analyzeChange: jest.Mock; analyzeNode: jest.Mock };
  let mockGraph: SemanticCodeGraphData;
  let mockTraversal: { getNode: jest.Mock; bfs: jest.Mock; getRelatedNodes: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock impact service
    mockImpactService = {
      analyzeChange: jest.fn().mockReturnValue(createMockAnalysis()),
      analyzeNode: jest.fn().mockReturnValue(createMockAnalysis()),
    };

    // Mock graph
    const nodes = new Map<string, SCGNode>();
    nodes.set('node-auth', createMockNode({ id: 'node-auth', file: 'src/auth.ts', name: 'auth' }));
    nodes.set('node-mw', createMockNode({ id: 'node-mw', file: 'src/middleware.ts', name: 'authMiddleware' }));
    nodes.set('node-user', createMockNode({ id: 'node-user', file: 'src/user.ts', name: 'userService' }));

    mockGraph = {
      nodes,
      edges: [
        { from: 'node-auth', to: 'node-mw', type: EdgeType.CALLS, weight: 1 },
        { from: 'node-mw', to: 'node-user', type: EdgeType.DEPENDS_ON, weight: 1 },
      ],
      dependencies: new Map(),
      builtAt: new Date(),
      fileCount: 3,
      symbolCount: 3,
    };

    // Mock traversal
    mockTraversal = {
      getNode: jest.fn().mockReturnValue(createMockNode({ id: 'node-auth', file: 'src/auth.ts' })),
      bfs: jest.fn().mockReturnValue({
        visited: new Map([
          ['node-auth', 0],
          ['node-mw', 1],
          ['node-user', 2],
        ]),
        nodes: [],
        edges: [],
      }),
      getRelatedNodes: jest.fn().mockReturnValue([]),
    };
  });

  describe('Impact command with --file option', () => {
    it('should analyze impact for a specific file', async () => {
      const analysis = createMockAnalysis();
      mockImpactService.analyzeChange.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
      });

      expect(mockImpactService.analyzeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          file: 'src/auth.ts',
          type: ChangeType.MODIFY,
        }),
        mockGraph,
        mockTraversal,
        4, // default depth
      );

      // Should output human-readable format
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should exit with code 1 when file not found in graph', async () => {
      const notFoundAnalysis = createMockAnalysis({ seedNodeId: '' });
      mockImpactService.analyzeChange.mockReturnValue(notFoundAnalysis);

      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {
          file: 'src/nonexistent.ts',
        }),
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Impact command with --node option', () => {
    it('should analyze impact starting from a specific node', async () => {
      const analysis = createMockAnalysis();
      mockImpactService.analyzeNode.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        node: 'node-auth',
      });

      expect(mockImpactService.analyzeNode).toHaveBeenCalledWith(
        'node-auth',
        mockGraph,
        mockTraversal,
        4,
      );
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should exit with code 1 when node not found', async () => {
      mockTraversal.getNode.mockReturnValue(undefined);

      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {
          node: 'nonexistent-node',
        }),
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Impact command with --depth option', () => {
    it('should pass custom depth to analysis', async () => {
      const analysis = createMockAnalysis();
      mockImpactService.analyzeChange.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
        depth: 2,
      });

      expect(mockImpactService.analyzeChange).toHaveBeenCalledWith(
        expect.anything(),
        mockGraph,
        mockTraversal,
        2,
      );
    });

    it('should use default depth of 4 when not specified', async () => {
      const analysis = createMockAnalysis();
      mockImpactService.analyzeChange.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
      });

      expect(mockImpactService.analyzeChange).toHaveBeenCalledWith(
        expect.anything(),
        mockGraph,
        mockTraversal,
        4,
      );
    });
  });

  describe('Impact command with --json option', () => {
    it('should output results in JSON format', async () => {
      const analysis = createMockAnalysis();
      mockImpactService.analyzeChange.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
        json: true,
      });

      // Should have called console.log with JSON output
      const jsonCalls = mockConsoleLog.mock.calls.filter(
        (call) => {
          try {
            JSON.parse(call[0]);
            return true;
          } catch {
            return false;
          }
        },
      );

      expect(jsonCalls.length).toBeGreaterThan(0);

      // Parse the JSON output and verify structure
      const jsonOutput = JSON.parse(jsonCalls[0][0]);
      expect(jsonOutput).toHaveProperty('seedNodeId');
      expect(jsonOutput).toHaveProperty('directImpacts');
      expect(jsonOutput).toHaveProperty('transitiveImpacts');
      expect(jsonOutput).toHaveProperty('affectedTests');
      expect(jsonOutput).toHaveProperty('riskAssessment');
      expect(jsonOutput).toHaveProperty('stats');
      expect(jsonOutput.riskAssessment).toHaveProperty('overall');
      expect(jsonOutput.riskAssessment).toHaveProperty('score');
    });

    it('should include analysis time in JSON stats', async () => {
      const analysis = createMockAnalysis();
      analysis.stats.analysisTimeMs = 123;
      mockImpactService.analyzeChange.mockReturnValue(analysis);

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
        json: true,
      });

      const jsonCalls = mockConsoleLog.mock.calls.filter(
        (call) => {
          try {
            JSON.parse(call[0]);
            return true;
          } catch {
            return false;
          }
        },
      );

      const jsonOutput = JSON.parse(jsonCalls[0][0]);
      expect(jsonOutput.stats.analysisTimeMs).toBe(123);
    });
  });

  describe('Error handling', () => {
    it('should exit with code 1 when no --file or --node provided', async () => {
      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {}),
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 when graph is empty', async () => {
      const emptyGraph: SemanticCodeGraphData = {
        nodes: new Map(),
        edges: [],
        dependencies: new Map(),
        builtAt: new Date(),
        fileCount: 0,
        symbolCount: 0,
      };

      await expect(
        impactCommand(mockImpactService, emptyGraph, mockTraversal, {
          file: 'src/test.ts',
        }),
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should display error message for file not found', async () => {
      const notFoundAnalysis = createMockAnalysis({ seedNodeId: '' });
      mockImpactService.analyzeChange.mockReturnValue(notFoundAnalysis);

      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {
          file: 'src/missing.ts',
        }),
      ).rejects.toThrow('process.exit');

      // Should have printed an error about file not found
      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should display error message for node not found', async () => {
      mockTraversal.getNode.mockReturnValue(undefined);

      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {
          node: 'nonexistent',
        }),
      ).rejects.toThrow('process.exit');

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Exit codes', () => {
    it('should exit with code 1 on analysis error', async () => {
      mockImpactService.analyzeChange.mockImplementation(() => {
        throw new Error('Analysis failed unexpectedly');
      });

      await expect(
        impactCommand(mockImpactService, mockGraph, mockTraversal, {
          file: 'src/auth.ts',
        }),
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should not call process.exit on successful analysis', async () => {
      mockImpactService.analyzeChange.mockReturnValue(createMockAnalysis());

      await impactCommand(mockImpactService, mockGraph, mockTraversal, {
        file: 'src/auth.ts',
      });

      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
