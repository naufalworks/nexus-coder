/**
 * Memory Leak Detector for IDE Widgets
 * 
 * This module provides utilities for detecting memory leaks in React widgets
 * through repeated mount/unmount cycles and heap analysis. It measures heap
 * growth and identifies retained object types to ensure widgets properly
 * release references when unmounted.
 * 
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 * 
 * @module audit/performance/memory-leak
 */

import { ReactElement } from 'react';
import { render, RenderResult } from '@testing-library/react';
import { AuditViolation } from '../framework/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Number of mount/unmount cycles for memory leak testing.
 */
export const MEMORY_TEST_CYCLES = 100;

/**
 * Maximum acceptable heap growth percentage after all cycles.
 * Heap should return to within 10% of baseline after GC.
 */
export const MAX_HEAP_GROWTH_PERCENT = 10;

/**
 * Number of GC attempts to make before measuring final heap.
 */
export const GC_ATTEMPTS = 3;

/**
 * Delay in milliseconds between GC attempts.
 */
export const GC_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Memory usage snapshot from process.memoryUsage().
 */
export interface MemorySnapshot {
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** External memory in bytes */
  external: number;
  /** Resident set size in bytes */
  rss: number;
  /** Timestamp of snapshot */
  timestamp: Date;
}

/**
 * Result of a memory leak test for a single widget.
 */
export interface MemoryLeakTestResult {
  /** Widget name being tested */
  widgetName: string;
  /** Number of mount/unmount cycles performed */
  cycles: number;
  /** Baseline heap usage in KB before cycles */
  baselineHeapKB: number;
  /** Final heap usage in KB after cycles and GC */
  finalHeapKB: number;
  /** Heap growth in KB */
  heapGrowthKB: number;
  /** Heap growth as percentage of baseline */
  heapGrowthPercent: number;
  /** Whether the test passed (growth within acceptable limits) */
  passed: boolean;
  /** Memory snapshots taken during test */
  snapshots: MemorySnapshot[];
  /** Retained object analysis (if available) */
  retainedObjects?: RetainedObjectAnalysis;
}

/**
 * Analysis of retained objects in heap.
 * Note: Detailed heap snapshot analysis requires V8 heap profiler APIs
 * which are not available in standard Node.js. This provides basic analysis.
 */
export interface RetainedObjectAnalysis {
  /** Top object types by estimated retained count */
  topRetainedTypes: Array<{
    type: string;
    estimatedCount: number;
  }>;
  /** Whether detailed analysis was available */
  detailedAnalysisAvailable: boolean;
}

/**
 * Memory leak violation for audit reporting.
 */
export interface MemoryLeakViolation extends AuditViolation {
  category: 'memory-leaks';
  /** Widget name */
  widgetName: string;
  /** Heap growth percentage */
  heapGrowthPercent: number;
  /** Baseline heap in KB */
  baselineHeapKB: number;
  /** Final heap in KB */
  finalHeapKB: number;
  /** Top retained type (if available) */
  topRetainedType?: string;
  /** Count of top retained type */
  topRetainedCount?: number;
}

/**
 * Configuration for memory leak testing.
 */
export interface MemoryLeakTestConfig {
  /** Number of mount/unmount cycles (default: 100) */
  cycles?: number;
  /** Maximum acceptable heap growth percentage (default: 10) */
  maxHeapGrowthPercent?: number;
  /** Number of GC attempts (default: 3) */
  gcAttempts?: number;
  /** Delay between GC attempts in ms (default: 100) */
  gcDelayMs?: number;
  /** Whether to collect detailed heap snapshots (default: false) */
  collectDetailedSnapshots?: boolean;
}

// ---------------------------------------------------------------------------
// Memory Snapshot Utilities
// ---------------------------------------------------------------------------

/**
 * Capture current memory usage snapshot.
 * 
 * @returns Memory snapshot with heap usage in bytes
 */
export function captureMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
    timestamp: new Date(),
  };
}

/**
 * Convert bytes to kilobytes.
 * 
 * @param bytes - Bytes to convert
 * @returns Kilobytes rounded to 2 decimal places
 */
export function bytesToKB(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

/**
 * Calculate heap growth percentage.
 * 
 * @param baseline - Baseline heap in bytes
 * @param current - Current heap in bytes
 * @returns Growth percentage rounded to 2 decimal places
 */
export function calculateHeapGrowthPercent(baseline: number, current: number): number {
  if (baseline === 0) return 0;
  const growth = ((current - baseline) / baseline) * 100;
  return Math.round(growth * 100) / 100;
}

// ---------------------------------------------------------------------------
// Garbage Collection Utilities
// ---------------------------------------------------------------------------

/**
 * Attempt to trigger garbage collection.
 * 
 * Note: This requires Node.js to be run with --expose-gc flag.
 * If GC is not exposed, this function does nothing.
 * 
 * @returns Whether GC was successfully triggered
 */
export function triggerGC(): boolean {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Wait for a specified duration.
 * 
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempt multiple garbage collection cycles with delays.
 * 
 * This gives the GC multiple opportunities to clean up unreferenced objects.
 * 
 * Validates: Requirement 17.2
 * 
 * @param attempts - Number of GC attempts (default: 3)
 * @param delayMs - Delay between attempts in ms (default: 100)
 * @returns Promise that resolves when all GC attempts complete
 */
export async function forceGarbageCollection(
  attempts: number = GC_ATTEMPTS,
  delayMs: number = GC_DELAY_MS
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    triggerGC();
    await delay(delayMs);
  }
}

// ---------------------------------------------------------------------------
// Memory Leak Detection
// ---------------------------------------------------------------------------

/**
 * Perform memory leak test on a React component.
 * 
 * Mounts and unmounts the component multiple times (default 100 cycles)
 * and measures heap growth. After cycles complete, triggers garbage
 * collection and measures final heap to detect retained references.
 * 
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4
 * 
 * @param widgetName - Name of the widget being tested
 * @param componentFactory - Function that creates a fresh component instance
 * @param config - Test configuration options
 * @returns Memory leak test result
 */
export async function detectMemoryLeak(
  widgetName: string,
  componentFactory: () => ReactElement,
  config: MemoryLeakTestConfig = {}
): Promise<MemoryLeakTestResult> {
  const {
    cycles = MEMORY_TEST_CYCLES,
    maxHeapGrowthPercent = MAX_HEAP_GROWTH_PERCENT,
    gcAttempts = GC_ATTEMPTS,
    gcDelayMs = GC_DELAY_MS,
  } = config;

  const snapshots: MemorySnapshot[] = [];

  // Force initial GC to establish clean baseline
  await forceGarbageCollection(gcAttempts, gcDelayMs);

  // Capture baseline memory
  const baselineSnapshot = captureMemorySnapshot();
  snapshots.push(baselineSnapshot);

  // Perform mount/unmount cycles
  for (let i = 0; i < cycles; i++) {
    const component = componentFactory();
    const result = render(component);
    
    // Unmount immediately
    result.unmount();

    // Capture snapshot every 10 cycles
    if ((i + 1) % 10 === 0) {
      snapshots.push(captureMemorySnapshot());
    }
  }

  // Force garbage collection after all cycles
  await forceGarbageCollection(gcAttempts, gcDelayMs);

  // Capture final memory
  const finalSnapshot = captureMemorySnapshot();
  snapshots.push(finalSnapshot);

  // Calculate metrics
  const baselineHeapKB = bytesToKB(baselineSnapshot.heapUsed);
  const finalHeapKB = bytesToKB(finalSnapshot.heapUsed);
  const heapGrowthKB = finalHeapKB - baselineHeapKB;
  const heapGrowthPercent = calculateHeapGrowthPercent(
    baselineSnapshot.heapUsed,
    finalSnapshot.heapUsed
  );

  // Determine pass/fail
  const passed = heapGrowthPercent <= maxHeapGrowthPercent;

  return {
    widgetName,
    cycles,
    baselineHeapKB,
    finalHeapKB,
    heapGrowthKB,
    heapGrowthPercent,
    passed,
    snapshots,
  };
}

/**
 * Analyze retained objects in heap.
 * 
 * Note: This is a basic implementation. Full heap snapshot analysis
 * requires V8 heap profiler APIs (v8.writeHeapSnapshot, heapdump module).
 * This provides estimated analysis based on memory growth patterns.
 * 
 * Validates: Requirement 17.5
 * 
 * @param result - Memory leak test result
 * @returns Retained object analysis
 */
export function analyzeRetainedObjects(
  result: MemoryLeakTestResult
): RetainedObjectAnalysis {
  // Basic analysis: estimate retained objects based on heap growth
  const topRetainedTypes: Array<{ type: string; estimatedCount: number }> = [];

  if (result.heapGrowthKB > 0) {
    // Estimate based on typical React component memory footprint
    // Average React component with props: ~1-5KB
    const avgComponentSize = 3; // KB
    const estimatedRetainedComponents = Math.floor(
      result.heapGrowthKB / avgComponentSize
    );

    if (estimatedRetainedComponents > 0) {
      topRetainedTypes.push({
        type: 'React Component Instance',
        estimatedCount: estimatedRetainedComponents,
      });
    }

    // Estimate event listeners (typical: ~0.5KB each)
    const avgListenerSize = 0.5; // KB
    const estimatedRetainedListeners = Math.floor(
      (result.heapGrowthKB * 0.3) / avgListenerSize
    );

    if (estimatedRetainedListeners > 0) {
      topRetainedTypes.push({
        type: 'Event Listener',
        estimatedCount: estimatedRetainedListeners,
      });
    }

    // Estimate closures/callbacks (typical: ~0.2KB each)
    const avgClosureSize = 0.2; // KB
    const estimatedRetainedClosures = Math.floor(
      (result.heapGrowthKB * 0.2) / avgClosureSize
    );

    if (estimatedRetainedClosures > 0) {
      topRetainedTypes.push({
        type: 'Closure/Callback',
        estimatedCount: estimatedRetainedClosures,
      });
    }
  }

  return {
    topRetainedTypes,
    detailedAnalysisAvailable: false,
  };
}

/**
 * Create memory leak violation for audit reporting.
 * 
 * Validates: Requirement 17.5
 * 
 * @param result - Memory leak test result
 * @returns Audit violation object
 */
export function createMemoryLeakViolation(
  result: MemoryLeakTestResult
): MemoryLeakViolation {
  const retainedObjects = analyzeRetainedObjects(result);
  const topRetained = retainedObjects.topRetainedTypes[0];

  return {
    category: 'memory-leaks',
    severity: result.heapGrowthPercent > 20 ? 'critical' : 'high',
    filePath: `src/widgets/${result.widgetName}.tsx`,
    lineNumber: 1,
    message: `Memory leak detected: ${result.heapGrowthPercent}% heap growth after ${result.cycles} mount/unmount cycles (${result.heapGrowthKB}KB retained)`,
    widgetName: result.widgetName,
    heapGrowthPercent: result.heapGrowthPercent,
    baselineHeapKB: result.baselineHeapKB,
    finalHeapKB: result.finalHeapKB,
    topRetainedType: topRetained?.type,
    topRetainedCount: topRetained?.estimatedCount,
  };
}

// ---------------------------------------------------------------------------
// Batch Testing
// ---------------------------------------------------------------------------

/**
 * Test multiple widgets for memory leaks.
 * 
 * @param widgets - Array of widget test configurations
 * @param config - Test configuration options
 * @returns Array of memory leak test results
 */
export async function testWidgetsForMemoryLeaks(
  widgets: Array<{
    name: string;
    componentFactory: () => ReactElement;
  }>,
  config: MemoryLeakTestConfig = {}
): Promise<MemoryLeakTestResult[]> {
  const results: MemoryLeakTestResult[] = [];

  for (const widget of widgets) {
    const result = await detectMemoryLeak(
      widget.name,
      widget.componentFactory,
      config
    );
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Format memory leak test result for console output.
 * 
 * @param result - Memory leak test result
 * @returns Formatted string
 */
export function formatMemoryLeakResult(result: MemoryLeakTestResult): string {
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  const lines = [
    `\n=== ${result.widgetName} Memory Leak Test ${status} ===`,
    `Cycles: ${result.cycles}`,
    `Baseline Heap: ${result.baselineHeapKB.toFixed(2)}KB`,
    `Final Heap: ${result.finalHeapKB.toFixed(2)}KB`,
    `Heap Growth: ${result.heapGrowthKB.toFixed(2)}KB (${result.heapGrowthPercent.toFixed(2)}%)`,
    `Limit: ${MAX_HEAP_GROWTH_PERCENT}%`,
  ];

  if (result.retainedObjects) {
    lines.push('');
    lines.push('Estimated Retained Objects:');
    result.retainedObjects.topRetainedTypes.forEach(obj => {
      lines.push(`  - ${obj.type}: ~${obj.estimatedCount}`);
    });
  }

  return lines.join('\n');
}

/**
 * Format batch test results summary.
 * 
 * @param results - Array of memory leak test results
 * @returns Formatted summary string
 */
export function formatMemoryLeakSummary(results: MemoryLeakTestResult[]): string {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const avgGrowth =
    results.reduce((sum, r) => sum + r.heapGrowthPercent, 0) / results.length;
  const maxGrowth = Math.max(...results.map(r => r.heapGrowthPercent));

  const lines = [
    '\n=== Memory Leak Test Summary ===',
    `Total Widgets: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${failed}`,
    `Average Heap Growth: ${avgGrowth.toFixed(2)}%`,
    `Max Heap Growth: ${maxGrowth.toFixed(2)}%`,
    `Limit: ${MAX_HEAP_GROWTH_PERCENT}%`,
  ];

  if (failed > 0) {
    lines.push('');
    lines.push('Failed Widgets:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        lines.push(
          `  - ${r.widgetName}: ${r.heapGrowthPercent.toFixed(2)}% growth (${r.heapGrowthKB.toFixed(2)}KB)`
        );
      });
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Re-export types for convenience
  type AuditViolation,
};
