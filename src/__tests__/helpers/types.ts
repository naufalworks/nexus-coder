/**
 * Shared test types and helper interfaces for QA testing infrastructure.
 * 
 * Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 10.1, 11.1, 12.1, 13.1
 */

import { Task, AgentInfo, CodeChange, AgentMessage, TokenUsage, SemanticCodeGraphData } from '../../types';
import { RenderResult } from '@testing-library/react';

// ---------------------------------------------------------------------------
// IDE State Snapshot Types
// ---------------------------------------------------------------------------

/**
 * Represents a complete IDE state snapshot for assertion.
 * Used by integration tests to verify cross-widget consistency.
 */
export interface IDEStateSnapshot {
  tasks: Task[];
  agents: AgentInfo[];
  changes: CodeChange[];
  messages: AgentMessage[];
  tokenUsage: TokenUsage;
  vectorStoreStatus: 'healthy' | 'degraded' | 'offline';
  graph?: SemanticCodeGraphData;
}

// ---------------------------------------------------------------------------
// Integration Test Helper Types
// ---------------------------------------------------------------------------

/**
 * Helper to capture state from all widgets simultaneously.
 * Used by integration tests to verify cross-widget state propagation.
 */
export interface IntegrationTestHelper {
  /** Render all widgets within IDEShell with given initial state */
  renderWithState(state: IDEStateSnapshot): RenderResult;

  /** Dispatch an action through the EventBus and wait for all widgets to update */
  dispatchAndWait(event: EventBusEvent): Promise<void>;

  /** Capture a snapshot of all widget states after an action */
  captureSnapshot(): IDEStateSnapshot;

  /** Assert that all widgets reflect consistent state */
  assertConsistency(snapshot: IDEStateSnapshot): void;
}

/**
 * Represents an event that can be dispatched through the EventBus.
 */
export interface EventBusEvent {
  type: string;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// E2E Flow Test Types
// ---------------------------------------------------------------------------

/**
 * A step in an E2E user flow.
 */
export interface FlowStep {
  description: string;
  /** Execute the step by interacting with the rendered UI */
  execute: (container: HTMLElement) => Promise<void>;
  /** Assert the expected state after this step */
  assert: (container: HTMLElement) => void;
}

/**
 * A complete user journey for E2E testing.
 */
export interface UserFlow {
  name: string;
  /** Initial state required for this flow */
  initialState: IDEStateSnapshot;
  /** Ordered sequence of steps */
  steps: FlowStep[];
  /** Final state assertion after all steps complete */
  finalAssertion: (container: HTMLElement) => void;
}

// ---------------------------------------------------------------------------
// Accessibility Test Types
// ---------------------------------------------------------------------------

/**
 * Widget accessibility test configuration.
 */
export interface A11yTestConfig {
  widgetName: string;
  /** Render the widget in its default state */
  renderDefault: () => RenderResult;
  /** Render the widget in specific states to test */
  renderStates?: Record<string, () => RenderResult>;
}

// ---------------------------------------------------------------------------
// Keyboard Navigation Test Types
// ---------------------------------------------------------------------------

/**
 * Keyboard navigation test specification.
 */
export interface KeyboardNavSpec {
  widgetName: string;
  /** Key -> expected effect */
  interactions: {
    key: string;
    expectedEffect: 'focus-next' | 'focus-prev' | 'select' | 'activate' | 'dismiss' | 'open-menu';
    targetDescription: string;
  }[];
  /** Whether focus should be trapped (modals) */
  focusTrap?: boolean;
}

// ---------------------------------------------------------------------------
// Performance Test Types
// ---------------------------------------------------------------------------

/**
 * Performance report for render budget tests.
 */
export interface PerformanceReport {
  widgetName: string;
  datasetSize: { 
    tasks?: number; 
    agents?: number; 
    changes?: number; 
    nodes?: number; 
    edges?: number; 
    logEntries?: number;
  };
  measurements: {
    renderTimeMs: number;
    rerenderCount: number;
  };
  budget: number; // e.g., 100ms
  passed: boolean;
}

/**
 * Memory leak report for memory tests.
 */
export interface MemoryLeakReport {
  widgetName: string;
  cycles: number; // e.g., 100
  baselineHeapKB: number;
  finalHeapKB: number;
  heapGrowthPercent: number;
  passed: boolean; // growth < 5%
  topRetainedType?: string;
  topRetainedCount?: number;
}

/**
 * Bundle size report for bundle analysis.
 */
export interface BundleReport {
  widgetName: string;
  gzippedSizeKB: number;
  sizeLimitKB: number;
  passed: boolean;
  topContributors: { module: string; sizeKB: number }[];
  totalBundleSizeKB: number;
  totalBundleLimit: number; // 500KB
}

// ---------------------------------------------------------------------------
// Audit Report Types
// ---------------------------------------------------------------------------

/**
 * Violation found by an audit script.
 */
export interface AuditViolation {
  category: 'typescript-strict' | 'dead-code' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  message: string;
  symbolName?: string;
}

/**
 * Audit report produced by static analysis scripts.
 */
export interface AuditReport {
  category: string;
  totalViolations: number;
  violations: AuditViolation[];
  /** Estimated impact for dead-code audit */
  estimatedBundleReduction?: string;
}

// ---------------------------------------------------------------------------
// Error Recovery Test Types
// ---------------------------------------------------------------------------

/**
 * Error recovery scenario for E2E testing.
 */
export interface ErrorRecoveryScenario {
  widgetName: string;
  /** Simulate a failure */
  simulateError: (container: HTMLElement) => Promise<void>;
  /** Assert error is displayed non-blockingly */
  assertErrorDisplayed: (container: HTMLElement) => void;
  /** Assert widget remains functional (retry possible) */
  assertRecoverable: (container: HTMLElement) => Promise<void>;
  /** Retry the action and assert success */
  retryAndAssert: (container: HTMLElement) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Cross-Widget Action Types (for Property-Based Testing)
// ---------------------------------------------------------------------------

/**
 * Cross-widget action types for property-based testing.
 */
export type CrossWidgetAction =
  | { type: 'APPROVE_CHANGE'; changeId: string }
  | { type: 'REJECT_CHANGE'; changeId: string }
  | { type: 'SELECT_TASK'; taskId: string }
  | { type: 'AGENT_STATUS_CHANGE'; agentName: string; status: string }
  | { type: 'RESOURCE_UPDATE'; tokenUsage: TokenUsage };
