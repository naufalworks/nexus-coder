/**
 * Core Audit Framework Types
 * 
 * This module defines the foundational types and interfaces used across
 * all audit modules in the Nexus Coder V2 audit framework.
 * 
 * @module audit/framework/types
 * @see Requirements 21.1, 21.3
 */

/**
 * Severity levels for audit violations.
 * Used for prioritization and health score calculation.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Audit categories corresponding to different audit dimensions.
 * Each category maps to a specific audit module or check type.
 */
export type AuditCategory =
  | 'typescript-strict'
  | 'dead-code'
  | 'naming-conventions'
  | 'import-patterns'
  | 'architecture-compliance'
  | 'event-bus-patterns'
  | 'widget-quality'
  | 'accessibility'
  | 'keyboard-navigation'
  | 'render-performance'
  | 'bundle-size'
  | 'project-structure'
  | 'dependency-health'
  | 'documentation-accuracy'
  | 'code-comments'
  | 'security'
  | 'memory-leaks'
  | 're-render-optimization'
  | 'cli-ide-parity'
  | 'error-handling'
  | 'test-coverage';

/**
 * Common violation structure used across all audit modules.
 * 
 * Represents a single issue found during an audit run, with enough
 * context to locate and understand the problem.
 * 
 * @example
 * ```typescript
 * const violation: AuditViolation = {
 *   category: 'typescript-strict',
 *   severity: 'high',
 *   filePath: 'src/widgets/TaskPanel.tsx',
 *   lineNumber: 42,
 *   message: 'Explicit any type annotation detected',
 *   symbolName: 'renderTaskItem',
 * };
 * ```
 */
export interface AuditViolation {
  /** Audit category that produced this violation */
  category: AuditCategory;
  /** Severity level for prioritization */
  severity: Severity;
  /** Absolute or relative file path */
  filePath: string;
  /** 1-indexed line number */
  lineNumber: number;
  /** Human-readable description of the violation */
  message: string;
  /** Symbol name for dead code / unused export violations */
  symbolName?: string;
  /** Estimated bytes for bundle size violations */
  estimatedBytes?: number;
}

/**
 * Standard audit report structure for a single audit category.
 * 
 * Contains all violations found for a specific category along with
 * optional metrics and bundle reduction estimates.
 * 
 * @example
 * ```typescript
 * const report: AuditReport = {
 *   category: 'dead-code',
 *   totalViolations: 5,
 *   violations: [...],
 *   metrics: { unusedExports: 5, estimatedBytes: 1234 },
 *   estimatedBundleReduction: '1.2KB',
 * };
 * ```
 */
export interface AuditReport {
  /** Audit category name */
  category: string;
  /** Total number of violations found */
  totalViolations: number;
  /** List of all violations */
  violations: AuditViolation[];
  /** Category-specific metrics */
  metrics?: Record<string, number | string>;
  /** Estimated bundle reduction for dead code audits */
  estimatedBundleReduction?: string;
}

/**
 * Combined report across all audit categories.
 * 
 * Provides a comprehensive view of the codebase health including
 * an overall health score, per-category breakdowns, and top priority issues.
 * 
 * @example
 * ```typescript
 * const comprehensiveReport: ComprehensiveAuditReport = {
 *   timestamp: '2024-01-15T10:30:00Z',
 *   healthScore: 87.5,
 *   reports: new Map([
 *     ['typescript-strict', typescriptReport],
 *     ['dead-code', deadCodeReport],
 *   ]),
 *   topPriorityIssues: [...],
 *   summary: {
 *     totalViolations: 23,
 *     bySeverity: { critical: 0, high: 3, medium: 12, low: 8 },
 *     byCategory: { 'typescript-strict': 5, 'dead-code': 8 },
 *   },
 *   passed: true,
 * };
 * ```
 */
export interface ComprehensiveAuditReport {
  /** ISO timestamp of audit run */
  timestamp: string;
  /** Overall health score (weighted average, 0-100) */
  healthScore: number;
  /** Individual category reports keyed by category */
  reports: Map<AuditCategory, AuditReport>;
  /** Top priority issues for remediation (max 10) */
  topPriorityIssues: AuditViolation[];
  /** Summary statistics across all categories */
  summary: {
    totalViolations: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<AuditCategory, number>;
  };
  /** Pass/fail status based on configured thresholds */
  passed: boolean;
}

/**
 * Audit module interface - all audit modules implement this.
 * 
 * Defines the contract for audit modules to integrate with the
 * AuditRunner orchestration layer.
 * 
 * @example
 * ```typescript
 * class TypeScriptStrictAudit implements AuditModule {
 *   readonly category = 'typescript-strict';
 *   readonly name = 'TypeScript Strict Mode Audit';
 * 
 *   async run(): Promise<AuditReport> {
 *     // Check for ts-ignore, explicit any, etc.
 *     return {
 *       category: this.category,
 *       totalViolations: violations.length,
 *       violations,
 *     };
 *   }
 * }
 * ```
 */
export interface AuditModule {
  /** Unique category identifier */
  readonly category: AuditCategory;
  /** Human-readable name for display in reports */
  readonly name: string;
  /** Run the audit and return the report */
  run(): Promise<AuditReport>;
}
