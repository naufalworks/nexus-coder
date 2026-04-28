/**
 * Memory Leak Detection Integration Tests
 * 
 * This test suite validates that widgets properly release references when
 * unmounted by running 100 mount/unmount cycles and measuring heap growth.
 * 
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4
 * 
 * @module audit/performance/memory-leak.integration.test
 */

import React from 'react';
import {
  detectMemoryLeak,
  testWidgetsForMemoryLeaks,
  formatMemoryLeakResult,
  formatMemoryLeakSummary,
  createMemoryLeakViolation,
  analyzeRetainedObjects,
  MEMORY_TEST_CYCLES,
  MAX_HEAP_GROWTH_PERCENT,
} from './memory-leak';
import { GraphExplorer } from '../../../widgets/GraphExplorer';
import { ReasoningLog } from '../../../widgets/ReasoningLog';
import { TaskPanel } from '../../../widgets/TaskPanel';
import {
  SemanticCodeGraphData,
  SCGNode,
  SCGEdge,
  NodeType,
  EdgeType,
  Task,
  TaskStatus,
  AgentMessage,
  AgentInfo,
  TaskType,
  TaskPriority,
  AgentCapability,
} from '../../../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Create a minimal graph for testing GraphExplorer
 */
function createTestGraph(): SemanticCodeGraphData {
  const nodes = new Map<string, SCGNode>();
  const edges: SCGEdge[] = [];

  // Create 10 test nodes
  for (let i = 0; i < 10; i++) {
    const node: SCGNode = {
      id: `node-${i}`,
      type: NodeType.FUNCTION,
      name: `testFunction${i}`,
      file: `src/test${i}.ts`,
      line: 1,
      endLine: 10,
      signature: `function testFunction${i}(): void`,
      summary: `Test function ${i}`,
      complexity: 1,
      changeFrequency: 0.1,
    };
    nodes.set(node.id, node);

    // Create edges between consecutive nodes
    if (i > 0) {
      edges.push({
        from: `node-${i - 1}`,
        to: `node-${i}`,
        type: EdgeType.CALLS,
        weight: 1,
      });
    }
  }

  return {
    nodes,
    edges,
    dependencies: new Map(),
    builtAt: new Date(),
    fileCount: 10,
    symbolCount: 10,
  };
}

/**
 * Create a minimal task for testing
 */
function createTestTask(): Task {
  return {
    id: 'test-task-1',
    instruction: 'Test task for memory leak detection',
    classification: {
      type: TaskType.FEATURE,
      priority: TaskPriority.MEDIUM,
      complexity: 5,
      requiresContext: true,
      requiresCodeGeneration: true,
      requiresGitOps: false,
      requiresReview: true,
      affectedAreas: ['src/test.ts'],
      estimatedTokens: 1000,
    },
    subTasks: [],
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create test log entries for ReasoningLog
 */
function createTestLogEntries(count: number): AgentMessage[] {
  const entries: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      agent: `Agent${i % 3}`,
      timestamp: new Date(),
      content: `Log entry ${i}: Processing task step ${i}`,
      metadata: {
        step: i,
        file: `src/test${i % 5}.ts`,
        line: i * 10,
      },
    });
  }
  return entries;
}

/**
 * Create test tasks for TaskPanel
 */
function createTestTasks(count: number): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++) {
    tasks.push({
      id: `task-${i}`,
      instruction: `Test task ${i}`,
      subTasks: [],
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return tasks;
}

/**
 * Create test agents for TaskPanel
 */
function createTestAgents(): AgentInfo[] {
  return [
    {
      name: 'ContextAgent',
      capabilities: [AgentCapability.CONTEXT_RETRIEVAL],
      supportedTaskTypes: [TaskType.FEATURE],
      status: 'idle',
    },
    {
      name: 'CoderAgent',
      capabilities: [AgentCapability.CODE_GENERATION],
      supportedTaskTypes: [TaskType.FEATURE, TaskType.BUG_FIX],
      status: 'idle',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Memory Leak Detection Integration Tests', () => {
  // Note: These tests require Node.js to be run with --expose-gc flag
  // to enable garbage collection triggering for accurate heap measurements

  const hasGC = !!global.gc;

  beforeAll(() => {
    if (!hasGC) {
      console.warn(
        'WARNING: Tests running without --expose-gc flag.\n' +
        'Heap growth assertions will be skipped. Run with:\n' +
        '  node --expose-gc node_modules/.bin/jest\n' +
        'for accurate memory leak detection.'
      );
    }
  });

  describe('GraphExplorer Memory Leak Detection', () => {
    /**
     * Validates: Requirement 17.1, 17.2
     * 
     * Verify that 100 mount/unmount cycles complete and that
     * the detection infrastructure captures proper measurements.
     * Heap growth assertions only enforced when --expose-gc is available.
     */
    it('should complete 100 mount/unmount cycles and measure heap growth', async () => {
      const graph = createTestGraph();
      const task = createTestTask();

      const result = await detectMemoryLeak(
        'GraphExplorer',
        () => <GraphExplorer graph={graph} activeTask={task} />,
        {
          cycles: MEMORY_TEST_CYCLES,
          maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
        }
      );

      // Log result for debugging
      console.log(formatMemoryLeakResult(result));

      // Validates: Requirement 17.1 - 100x mount/unmount cycles
      expect(result.cycles).toBe(MEMORY_TEST_CYCLES);
      expect(result.widgetName).toBe('GraphExplorer');

      // Validates: Requirement 17.2 - Heap growth measurement
      expect(typeof result.baselineHeapKB).toBe('number');
      expect(typeof result.finalHeapKB).toBe('number');
      expect(typeof result.heapGrowthPercent).toBe('number');
      expect(result.baselineHeapKB).toBeGreaterThan(0);
      expect(result.finalHeapKB).toBeGreaterThan(0);

      // Verify snapshots were captured (every 10 cycles + baseline + final)
      expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
      expect(result.snapshots[0]).toHaveProperty('heapUsed');
      expect(result.snapshots[0]).toHaveProperty('timestamp');
      expect(result.snapshots[0]).toHaveProperty('heapTotal');
      expect(result.snapshots[0]).toHaveProperty('rss');
      expect(result.snapshots[0]).toHaveProperty('external');

      // Heap growth check only enforced with GC
      if (hasGC) {
        expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
      }
    }, 60000); // 60 second timeout for 100 cycles

    it('should provide retained object analysis when memory leak detected', async () => {
      const graph = createTestGraph();
      const task = createTestTask();

      const result = await detectMemoryLeak(
        'GraphExplorer',
        () => <GraphExplorer graph={graph} activeTask={task} />,
        {
          cycles: MEMORY_TEST_CYCLES,
        }
      );

      // Analyze retained objects
      const analysis = analyzeRetainedObjects(result);

      expect(analysis).toHaveProperty('topRetainedTypes');
      expect(analysis).toHaveProperty('detailedAnalysisAvailable');
      expect(Array.isArray(analysis.topRetainedTypes)).toBe(true);

      // If there's heap growth, should have retained object estimates
      if (result.heapGrowthKB > 0) {
        expect(analysis.topRetainedTypes.length).toBeGreaterThan(0);
        analysis.topRetainedTypes.forEach(obj => {
          expect(obj).toHaveProperty('type');
          expect(obj).toHaveProperty('estimatedCount');
          expect(typeof obj.type).toBe('string');
          expect(typeof obj.estimatedCount).toBe('number');
        });
      }
    }, 60000);

    it('should create proper violation report for memory leaks', async () => {
      const graph = createTestGraph();
      const task = createTestTask();

      const result = await detectMemoryLeak(
        'GraphExplorer',
        () => <GraphExplorer graph={graph} activeTask={task} />,
        {
          cycles: MEMORY_TEST_CYCLES,
        }
      );

      // Create violation even if test passes (for testing violation format)
      const violation = createMemoryLeakViolation(result);

      expect(violation.category).toBe('memory-leaks');
      expect(violation.widgetName).toBe('GraphExplorer');
      expect(violation.heapGrowthPercent).toBe(result.heapGrowthPercent);
      expect(violation.baselineHeapKB).toBe(result.baselineHeapKB);
      expect(violation.finalHeapKB).toBe(result.finalHeapKB);
      expect(violation.filePath).toBe('src/widgets/GraphExplorer.tsx');
      expect(violation.message).toContain('Memory leak detected');
      expect(violation.message).toContain(`${result.heapGrowthPercent}%`);
      expect(violation.message).toContain(`${result.cycles} mount/unmount cycles`);

      // Severity should be critical if growth > 20%, otherwise high
      if (result.heapGrowthPercent > 20) {
        expect(violation.severity).toBe('critical');
      } else {
        expect(violation.severity).toBe('high');
      }
    }, 60000);
  });

  describe('ReasoningLog Memory Leak Detection', () => {
    /**
     * Validates: Requirement 17.1, 17.3
     * 
     * Verify that ReasoningLog completes mount/unmount cycles and measures heap.
     * ReasoningLog should release all log entry references when unmounted.
     */
    it('should complete 100 mount/unmount cycles and measure heap growth', async () => {
      const logEntries = createTestLogEntries(50);

      const result = await detectMemoryLeak(
        'ReasoningLog',
        () => <ReasoningLog log={logEntries} />,
        {
          cycles: MEMORY_TEST_CYCLES,
          maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
        }
      );

      // Log result for debugging
      console.log(formatMemoryLeakResult(result));

      // Validates: Requirement 17.1 - 100x mount/unmount cycles
      expect(result.cycles).toBe(MEMORY_TEST_CYCLES);
      expect(result.widgetName).toBe('ReasoningLog');

      // Validates: Requirement 17.2 - Heap growth measurement
      expect(typeof result.heapGrowthPercent).toBe('number');
      expect(result.baselineHeapKB).toBeGreaterThan(0);

      // Heap growth check only enforced with GC
      if (hasGC) {
        expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
      }
    }, 60000);

    it('should handle large log datasets without memory leaks', async () => {
      // Test with larger dataset (1000 entries as per requirement 10.3)
      const logEntries = createTestLogEntries(1000);

      const result = await detectMemoryLeak(
        'ReasoningLog',
        () => <ReasoningLog log={logEntries} />,
        {
          cycles: 50, // Fewer cycles for larger dataset
          maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
        }
      );

      console.log(formatMemoryLeakResult(result));

      expect(result.cycles).toBe(50);
      expect(result.widgetName).toBe('ReasoningLog');

      // Heap growth check only enforced with GC
      if (hasGC) {
        expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
      }
    }, 60000);
  });

  describe('TaskPanel Memory Leak Detection', () => {
    /**
     * Validates: Requirement 17.1, 17.4
     * 
     * Verify that TaskPanel completes mount/unmount cycles and measures heap.
     * TaskPanel should release task list references and event listeners when unmounted.
     */
    it('should complete 100 mount/unmount cycles and measure heap growth', async () => {
      const tasks = createTestTasks(50);
      const agents = createTestAgents();
      const mockOnSelectTask = jest.fn();

      const result = await detectMemoryLeak(
        'TaskPanel',
        () => (
          <TaskPanel
            tasks={tasks}
            agents={agents}
            onSelectTask={mockOnSelectTask}
            filter={{}}
          />
        ),
        {
          cycles: MEMORY_TEST_CYCLES,
          maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
        }
      );

      // Log result for debugging
      console.log(formatMemoryLeakResult(result));

      // Validates: Requirement 17.1 - 100x mount/unmount cycles
      expect(result.cycles).toBe(MEMORY_TEST_CYCLES);
      expect(result.widgetName).toBe('TaskPanel');

      // Validates: Requirement 17.2 - Heap growth measurement
      expect(typeof result.heapGrowthPercent).toBe('number');

      // Heap growth check only enforced with GC
      if (hasGC) {
        expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
      }
    }, 60000);

    it('should handle large task lists without memory leaks', async () => {
      // Test with larger dataset (100 tasks as per requirement 10.1)
      const tasks = createTestTasks(100);
      const agents = createTestAgents();
      const mockOnSelectTask = jest.fn();

      const result = await detectMemoryLeak(
        'TaskPanel',
        () => (
          <TaskPanel
            tasks={tasks}
            agents={agents}
            onSelectTask={mockOnSelectTask}
            filter={{}}
          />
        ),
        {
          cycles: 50, // Fewer cycles for larger dataset
          maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
        }
      );

      console.log(formatMemoryLeakResult(result));

      expect(result.cycles).toBe(50);
      expect(result.widgetName).toBe('TaskPanel');

      // Heap growth check only enforced with GC
      if (hasGC) {
        expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
      }
    }, 60000);
  });

  describe('Event Listener Cleanup', () => {
    /**
     * Validates: Requirement 17.4
     * 
     * All widgets should remove event listeners when unmounted.
     * This is implicitly tested by the memory leak detection - if event
     * listeners are not cleaned up, they will retain references and cause
     * heap growth.
     */
    it('should verify event listeners are cleaned up across all widgets', async () => {
      const graph = createTestGraph();
      const task = createTestTask();
      const logEntries = createTestLogEntries(50);
      const tasks = createTestTasks(50);
      const agents = createTestAgents();
      const mockOnSelectTask = jest.fn();

      const widgets = [
        {
          name: 'GraphExplorer',
          componentFactory: () => <GraphExplorer graph={graph} activeTask={task} />,
        },
        {
          name: 'ReasoningLog',
          componentFactory: () => <ReasoningLog log={logEntries} />,
        },
        {
          name: 'TaskPanel',
          componentFactory: () => (
            <TaskPanel
              tasks={tasks}
              agents={agents}
              onSelectTask={mockOnSelectTask}
              filter={{}}
            />
          ),
        },
      ];

      const results = await testWidgetsForMemoryLeaks(widgets, {
        cycles: MEMORY_TEST_CYCLES,
        maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
      });

      // Log summary
      console.log(formatMemoryLeakSummary(results));

      // Verify all widgets completed the test
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.cycles).toBe(MEMORY_TEST_CYCLES);
        expect(typeof result.heapGrowthPercent).toBe('number');
      });

      // Heap growth check only enforced with GC
      if (hasGC) {
        const failedWidgets = results.filter(r => !r.passed);
        expect(failedWidgets).toHaveLength(0);
        
        results.forEach(result => {
          expect(result.heapGrowthPercent).toBeLessThanOrEqual(MAX_HEAP_GROWTH_PERCENT);
        });
      }
    }, 180000); // 3 minute timeout for all widgets
  });

  describe('Batch Testing', () => {
    it('should test multiple widgets and generate summary report', async () => {
      const graph = createTestGraph();
      const task = createTestTask();
      const logEntries = createTestLogEntries(20);
      const tasks = createTestTasks(20);
      const agents = createTestAgents();
      const mockOnSelectTask = jest.fn();

      const widgets = [
        {
          name: 'GraphExplorer',
          componentFactory: () => <GraphExplorer graph={graph} activeTask={task} />,
        },
        {
          name: 'ReasoningLog',
          componentFactory: () => <ReasoningLog log={logEntries} />,
        },
        {
          name: 'TaskPanel',
          componentFactory: () => (
            <TaskPanel
              tasks={tasks}
              agents={agents}
              onSelectTask={mockOnSelectTask}
              filter={{}}
            />
          ),
        },
      ];

      const results = await testWidgetsForMemoryLeaks(widgets, {
        cycles: 50, // Reduced cycles for faster batch testing
        maxHeapGrowthPercent: MAX_HEAP_GROWTH_PERCENT,
      });

      // Verify we got results for all widgets
      expect(results).toHaveLength(3);
      expect(results.map(r => r.widgetName)).toEqual([
        'GraphExplorer',
        'ReasoningLog',
        'TaskPanel',
      ]);

      // Generate and verify summary
      const summary = formatMemoryLeakSummary(results);
      expect(summary).toContain('Memory Leak Test Summary');
      expect(summary).toContain('Total Widgets: 3');
      expect(summary).toContain('Passed:');
      expect(summary).toContain('Failed:');
      expect(summary).toContain('Average Heap Growth:');
      expect(summary).toContain('Max Heap Growth:');
    }, 180000);
  });

  describe('Memory Snapshot Utilities', () => {
    it('should capture memory snapshots with all required fields', async () => {
      const graph = createTestGraph();
      const task = createTestTask();

      const result = await detectMemoryLeak(
        'GraphExplorer',
        () => <GraphExplorer graph={graph} activeTask={task} />,
        {
          cycles: 10, // Small number for quick test
        }
      );

      // Verify snapshots structure
      expect(result.snapshots.length).toBeGreaterThan(0);
      
      result.snapshots.forEach(snapshot => {
        expect(snapshot).toHaveProperty('heapUsed');
        expect(snapshot).toHaveProperty('heapTotal');
        expect(snapshot).toHaveProperty('external');
        expect(snapshot).toHaveProperty('rss');
        expect(snapshot).toHaveProperty('timestamp');
        expect(snapshot.timestamp).toBeInstanceOf(Date);
        expect(typeof snapshot.heapUsed).toBe('number');
        expect(snapshot.heapUsed).toBeGreaterThan(0);
      });
    }, 30000);
  });
});
