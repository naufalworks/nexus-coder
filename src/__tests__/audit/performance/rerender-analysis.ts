/**
 * Re-Render Optimization Analyzer for React Components
 * 
 * This module provides utilities for detecting unnecessary re-renders in React
 * components and suggesting optimization strategies. It tracks component render
 * counts, identifies triggering props/state keys, and recommends specific
 * optimizations like useMemo, useCallback, or React.memo.
 * 
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5
 * 
 * @module audit/performance/rerender-analysis
 */

import React, { ProfilerOnRenderCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Type of optimization suggestion for preventing unnecessary re-renders.
 */
export type OptimizationType = 'useMemo' | 'useCallback' | 'React.memo' | 'state-split';

/**
 * Information about a single render event.
 */
export interface RenderEvent {
  /** Timestamp of the render */
  timestamp: number;
  /** Render phase (mount or update) */
  phase: 'mount' | 'update';
  /** Time spent rendering in milliseconds */
  actualDuration: number;
  /** Props at the time of render (shallow copy) */
  props: Record<string, any>;
  /** State at the time of render (if tracked) */
  state?: Record<string, any>;
}

/**
 * Analysis of a component's re-render behavior.
 */
export interface ReRenderAnalysis {
  /** Component name */
  componentName: string;
  /** Total number of renders observed */
  totalRenders: number;
  /** Number of unnecessary re-renders (props/state unchanged) */
  unnecessaryRenders: number;
  /** Prop keys that triggered re-renders */
  triggerKeys: string[];
  /** Detailed render events */
  renderEvents: RenderEvent[];
  /** Suggested optimizations */
  suggestions: OptimizationSuggestion[];
}

/**
 * Optimization suggestion for a component.
 */
export interface OptimizationSuggestion {
  /** Type of optimization */
  type: OptimizationType;
  /** Prop or state key to optimize */
  targetKey: string;
  /** Explanation of why this optimization is suggested */
  reason: string;
  /** Code example showing the optimization */
  codeExample?: string;
}

/**
 * Configuration for re-render tracking.
 */
export interface ReRenderTrackerConfig {
  /** Component name for identification */
  componentName: string;
  /** Whether to track state changes (requires manual state tracking) */
  trackState?: boolean;
  /** Whether to perform deep equality checks on props */
  deepCompare?: boolean;
  /** Prop keys to ignore in analysis */
  ignoredProps?: string[];
}

// ---------------------------------------------------------------------------
// Re-Render Tracker
// ---------------------------------------------------------------------------

/**
 * Tracks re-renders for a React component and analyzes optimization opportunities.
 * 
 * Usage:
 * ```typescript
 * const tracker = new ReRenderTracker({ componentName: 'MyComponent' });
 * 
 * function MyComponent(props) {
 *   return (
 *     <Profiler id="MyComponent" onRender={tracker.onRender}>
 *       {// component content}
 *     </Profiler>
 *   );
 * }
 * 
 * // Later, analyze the results
 * const analysis = tracker.analyze();
 * ```
 * 
 * Validates: Requirements 18.1, 18.5
 */
export class ReRenderTracker {
  private componentName: string;
  private trackState: boolean;
  private deepCompare: boolean;
  private ignoredProps: Set<string>;
  private renderEvents: RenderEvent[] = [];
  private previousProps: Record<string, any> | null = null;
  private previousState: Record<string, any> | null = null;

  constructor(config: ReRenderTrackerConfig) {
    this.componentName = config.componentName;
    this.trackState = config.trackState ?? false;
    this.deepCompare = config.deepCompare ?? false;
    this.ignoredProps = new Set(config.ignoredProps ?? ['children', 'key', 'ref']);
  }

  /**
   * Callback for React Profiler onRender.
   * 
   * Validates: Requirement 18.1
   */
  public onRender: ProfilerOnRenderCallback = (
    id: string,
    phase: 'mount' | 'update' | 'nested-update',
    actualDuration: number,
    baseDuration: number,
    startTime: number,
    commitTime: number
  ) => {
    // Note: We can't access props directly from the Profiler callback
    // This is a limitation of the React Profiler API
    // Props must be passed separately via trackRender()
    const normalizedPhase: 'mount' | 'update' = phase === 'mount' ? 'mount' : 'update';
    this.renderEvents.push({
      timestamp: commitTime,
      phase: normalizedPhase,
      actualDuration,
      props: {},
      state: undefined,
    });
  };

  /**
   * Manually track a render with props and optional state.
   * Use this in the component body to capture props/state.
   * 
   * Validates: Requirements 18.1, 18.2
   */
  public trackRender(props: Record<string, any>, state?: Record<string, any>): void {
    const phase = this.renderEvents.length === 0 ? 'mount' : 'update';
    
    // Filter out ignored props
    const filteredProps = this.filterProps(props);
    
    this.renderEvents.push({
      timestamp: Date.now(),
      phase,
      actualDuration: 0, // Not available without Profiler
      props: { ...filteredProps },
      state: state ? { ...state } : undefined,
    });

    this.previousProps = filteredProps;
    this.previousState = state ? { ...state } : null;
  }

  /**
   * Reset the tracker to start fresh.
   */
  public reset(): void {
    this.renderEvents = [];
    this.previousProps = null;
    this.previousState = null;
  }

  /**
   * Analyze the collected render events and generate optimization suggestions.
   * 
   * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5
   */
  public analyze(): ReRenderAnalysis {
    const totalRenders = this.renderEvents.length;
    const unnecessaryRenders = this.countUnnecessaryRenders();
    const triggerKeys = this.identifyTriggerKeys();
    const suggestions = this.generateSuggestions(triggerKeys, unnecessaryRenders);

    return {
      componentName: this.componentName,
      totalRenders,
      unnecessaryRenders,
      triggerKeys,
      renderEvents: [...this.renderEvents],
      suggestions,
    };
  }

  /**
   * Count renders where props and state haven't changed.
   * 
   * Validates: Requirement 18.1
   */
  private countUnnecessaryRenders(): number {
    let count = 0;

    for (let i = 1; i < this.renderEvents.length; i++) {
      const current = this.renderEvents[i];
      const previous = this.renderEvents[i - 1];

      if (current.phase === 'update') {
        const propsChanged = this.havePropsChanged(previous.props, current.props);
        const stateChanged = this.trackState
          ? this.havePropsChanged(previous.state ?? {}, current.state ?? {})
          : false;

        if (!propsChanged && !stateChanged) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Identify which prop/state keys triggered re-renders.
   * 
   * Validates: Requirement 18.2
   */
  private identifyTriggerKeys(): string[] {
    const triggerKeys = new Set<string>();

    for (let i = 1; i < this.renderEvents.length; i++) {
      const current = this.renderEvents[i];
      const previous = this.renderEvents[i - 1];

      if (current.phase === 'update') {
        // Check props
        const changedPropKeys = this.getChangedKeys(previous.props, current.props);
        changedPropKeys.forEach(key => triggerKeys.add(`props.${key}`));

        // Check state if tracked
        if (this.trackState && previous.state && current.state) {
          const changedStateKeys = this.getChangedKeys(previous.state, current.state);
          changedStateKeys.forEach(key => triggerKeys.add(`state.${key}`));
        }
      }
    }

    return Array.from(triggerKeys);
  }

  /**
   * Generate optimization suggestions based on render patterns.
   * 
   * Validates: Requirements 18.3, 18.4, 18.5
   */
  private generateSuggestions(
    triggerKeys: string[],
    unnecessaryRenders: number
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // If there are unnecessary re-renders, suggest React.memo
    if (unnecessaryRenders > 0) {
      suggestions.push({
        type: 'React.memo',
        targetKey: this.componentName,
        reason: `Component re-rendered ${unnecessaryRenders} time(s) without prop/state changes`,
        codeExample: `export const ${this.componentName} = React.memo((props) => {\n  // component implementation\n});`,
      });
    }

    // Analyze trigger keys for specific optimizations
    for (const triggerKey of triggerKeys) {
      if (triggerKey.startsWith('props.')) {
        const propName = triggerKey.substring(6);
        
        // Suggest useMemo for object/array props
        if (this.looksLikeObjectOrArray(propName)) {
          suggestions.push({
            type: 'useMemo',
            targetKey: propName,
            reason: `Prop '${propName}' appears to be an object/array that may be recreated on each render`,
            codeExample: `const ${propName} = useMemo(() => ({\n  // object properties\n}), [dependencies]);`,
          });
        }

        // Suggest useCallback for function props
        if (this.looksLikeFunction(propName)) {
          suggestions.push({
            type: 'useCallback',
            targetKey: propName,
            reason: `Prop '${propName}' appears to be a function that may be recreated on each render`,
            codeExample: `const ${propName} = useCallback(() => {\n  // function implementation\n}, [dependencies]);`,
          });
        }
      }

      if (triggerKey.startsWith('state.')) {
        const stateName = triggerKey.substring(6);
        
        // Suggest state splitting if many state keys trigger renders
        if (triggerKeys.filter(k => k.startsWith('state.')).length > 3) {
          suggestions.push({
            type: 'state-split',
            targetKey: stateName,
            reason: `Multiple state keys trigger re-renders. Consider splitting state into separate useState calls`,
            codeExample: `// Instead of:\n// const [state, setState] = useState({ a, b, c });\n// Use:\nconst [a, setA] = useState(initialA);\nconst [b, setB] = useState(initialB);`,
          });
          break; // Only suggest once
        }
      }
    }

    return suggestions;
  }

  /**
   * Check if props have changed between renders.
   */
  private havePropsChanged(prev: Record<string, any>, current: Record<string, any>): boolean {
    const prevKeys = Object.keys(prev);
    const currentKeys = Object.keys(current);

    if (prevKeys.length !== currentKeys.length) {
      return true;
    }

    for (const key of currentKeys) {
      if (this.deepCompare) {
        if (!this.deepEqual(prev[key], current[key])) {
          return true;
        }
      } else {
        if (prev[key] !== current[key]) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get keys that changed between two objects.
   */
  private getChangedKeys(prev: Record<string, any>, current: Record<string, any>): string[] {
    const changed: string[] = [];
    const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(current)]));

    for (const key of allKeys) {
      if (this.deepCompare) {
        if (!this.deepEqual(prev[key], current[key])) {
          changed.push(key);
        }
      } else {
        if (prev[key] !== current[key]) {
          changed.push(key);
        }
      }
    }

    return changed;
  }

  /**
   * Filter out ignored props.
   */
  private filterProps(props: Record<string, any>): Record<string, any> {
    const filtered: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(props)) {
      if (!this.ignoredProps.has(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Heuristic to detect if a prop name suggests an object or array.
   */
  private looksLikeObjectOrArray(propName: string): boolean {
    const patterns = ['data', 'items', 'list', 'config', 'options', 'settings', 'props'];
    return patterns.some(pattern => propName.toLowerCase().includes(pattern));
  }

  /**
   * Heuristic to detect if a prop name suggests a function.
   */
  private looksLikeFunction(propName: string): boolean {
    return propName.startsWith('on') || propName.startsWith('handle');
  }

  /**
   * Deep equality check for objects and arrays.
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Detect unnecessary re-renders by comparing consecutive render events.
 * 
 * Validates: Requirement 18.1
 * 
 * @param analysis - Re-render analysis result
 * @returns True if unnecessary re-renders were detected
 */
export function hasUnnecessaryRenders(analysis: ReRenderAnalysis): boolean {
  return analysis.unnecessaryRenders > 0;
}

/**
 * Get the most frequently changing props/state keys.
 * 
 * Validates: Requirement 18.2
 * 
 * @param analysis - Re-render analysis result
 * @param topN - Number of top keys to return
 * @returns Array of most frequent trigger keys
 */
export function getTopTriggerKeys(analysis: ReRenderAnalysis, topN: number = 5): string[] {
  // Count frequency of each trigger key
  const frequency = new Map<string, number>();

  for (let i = 1; i < analysis.renderEvents.length; i++) {
    const current = analysis.renderEvents[i];
    const previous = analysis.renderEvents[i - 1];

    if (current.phase === 'update') {
      const changedKeys = getChangedKeysBetweenEvents(previous, current);
      changedKeys.forEach(key => {
        frequency.set(key, (frequency.get(key) ?? 0) + 1);
      });
    }
  }

  // Sort by frequency and return top N
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);
}

/**
 * Get optimization suggestions for a specific trigger key.
 * 
 * Validates: Requirements 18.3, 18.4
 * 
 * @param analysis - Re-render analysis result
 * @param triggerKey - The prop/state key to get suggestions for
 * @returns Array of suggestions for the key
 */
export function getSuggestionsForKey(
  analysis: ReRenderAnalysis,
  triggerKey: string
): OptimizationSuggestion[] {
  return analysis.suggestions.filter(s => s.targetKey === triggerKey);
}

/**
 * Format re-render analysis for console output.
 * 
 * Validates: Requirement 18.5
 * 
 * @param analysis - Re-render analysis result
 * @returns Formatted string for display
 */
export function formatReRenderAnalysis(analysis: ReRenderAnalysis): string {
  const lines: string[] = [];

  lines.push(`\n=== Re-Render Analysis: ${analysis.componentName} ===`);
  lines.push(`Total Renders: ${analysis.totalRenders}`);
  lines.push(`Unnecessary Renders: ${analysis.unnecessaryRenders}`);
  
  if (analysis.unnecessaryRenders > 0) {
    const percentage = ((analysis.unnecessaryRenders / analysis.totalRenders) * 100).toFixed(1);
    lines.push(`Optimization Potential: ${percentage}% of renders could be avoided`);
  }

  if (analysis.triggerKeys.length > 0) {
    lines.push(`\nTrigger Keys:`);
    analysis.triggerKeys.forEach(key => {
      lines.push(`  - ${key}`);
    });
  }

  if (analysis.suggestions.length > 0) {
    lines.push(`\nOptimization Suggestions:`);
    analysis.suggestions.forEach((suggestion, index) => {
      lines.push(`\n${index + 1}. ${suggestion.type} for '${suggestion.targetKey}'`);
      lines.push(`   Reason: ${suggestion.reason}`);
      if (suggestion.codeExample) {
        lines.push(`   Example:\n   ${suggestion.codeExample.split('\n').join('\n   ')}`);
      }
    });
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Create a wrapper component that tracks re-renders.
 * 
 * Validates: Requirements 18.1, 18.5
 * 
 * @param Component - React component to track
 * @param tracker - Re-render tracker instance
 * @returns Wrapped component with tracking
 */
export function withReRenderTracking<P extends object>(
  Component: React.ComponentType<P>,
  tracker: ReRenderTracker
): React.FC<P> {
  const TrackedComponent: React.FC<P> = (props: P) => {
    // Track render with current props
    tracker.trackRender(props as Record<string, any>);

    return React.createElement(Component, props);
  };
  
  return TrackedComponent;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get changed keys between two render events.
 */
function getChangedKeysBetweenEvents(prev: RenderEvent, current: RenderEvent): string[] {
  const changed: string[] = [];

  // Check props
  const allPropKeys = Array.from(new Set([
    ...Object.keys(prev.props),
    ...Object.keys(current.props),
  ]));

  for (const key of allPropKeys) {
    if (prev.props[key] !== current.props[key]) {
      changed.push(`props.${key}`);
    }
  }

  // Check state
  if (prev.state && current.state) {
    const allStateKeys = Array.from(new Set([
      ...Object.keys(prev.state),
      ...Object.keys(current.state),
    ]));

    for (const key of allStateKeys) {
      if (prev.state[key] !== current.state[key]) {
        changed.push(`state.${key}`);
      }
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Re-export ProfilerOnRenderCallback for convenience
  type ProfilerOnRenderCallback,
};
