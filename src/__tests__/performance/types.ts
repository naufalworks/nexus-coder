/**
 * Performance test type definitions.
 */

/**
 * Performance test configuration.
 */
export interface PerformanceTestConfig {
  /** Widget/component name */
  widgetName: string;
  /** Number of test iterations */
  iterations: number;
  /** Maximum acceptable render time in ms */
  maxRenderTimeMs: number;
  /** Minimum acceptable render time in ms (to detect mocked timers) */
  minRenderTimeMs: number;
  /** Acceptable variance across iterations */
  maxVarianceMs: number;
}

/**
 * Memory leak test configuration.
 */
export interface MemoryTestConfig {
  /** Widget/component name */
  widgetName: string;
  /** Number of mount/unmount cycles */
  cycles: number;
  /** Maximum acceptable heap growth percentage */
  maxHeapGrowthPercent: number;
}

/**
 * Re-render test configuration.
 */
export interface ReRenderTestConfig {
  /** Component name */
  componentName: string;
  /** Description of the test */
  description: string;
  /** Maximum acceptable render count */
  maxRenderCount: number;
}

/**
 * Render profiler wrapper for tracking render counts.
 */
export interface RenderProfiler {
  /** Current render count */
  renderCount: number;
  /** List of props that triggered each render */
  renderReasons: string[];
  /** Reset the profiler */
  reset(): void;
  /** Get the current count */
  getCount(): number;
  /** Get the reasons for renders */
  getReasons(): string[];
}
