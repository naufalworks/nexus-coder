/**
 * ViolationRegistry - Central aggregation point for audit violations
 *
 * Collects violations from all audit modules and provides filtered
 * access by category and severity.
 *
 * @module audit/framework/registry
 * @see Requirements 21.1, 21.4
 */

import type { AuditViolation, AuditCategory, Severity } from './types';

/**
 * Aggregates results from all audit modules into a single registry.
 *
 * Provides methods to register violations and query them by category,
 * severity, or retrieve the full set.
 *
 * @example
 * ```typescript
 * const registry = new ViolationRegistry();
 *
 * registry.registerViolation({
 *   category: 'typescript-strict',
 *   severity: 'high',
 *   filePath: 'src/widgets/TaskPanel.tsx',
 *   lineNumber: 42,
 *   message: 'Explicit any type annotation detected',
 * });
 *
 * const highViolations = registry.getViolationsBySeverity('high');
 * const tsViolations = registry.getViolationsByCategory('typescript-strict');
 * ```
 */
export class ViolationRegistry {
  private violations: AuditViolation[] = [];

  /**
   * Register a single audit violation.
   *
   * @param violation - The audit violation to register
   */
  registerViolation(violation: AuditViolation): void {
    this.violations.push(violation);
  }

  /**
   * Retrieve all violations matching a given audit category.
   *
   * @param category - The audit category to filter by
   * @returns Array of violations in the specified category
   */
  getViolationsByCategory(category: AuditCategory): AuditViolation[] {
    return this.violations.filter((v) => v.category === category);
  }

  /**
   * Retrieve all violations matching a given severity level.
   *
   * @param severity - The severity level to filter by
   * @returns Array of violations with the specified severity
   */
  getViolationsBySeverity(severity: Severity): AuditViolation[] {
    return this.violations.filter((v) => v.severity === severity);
  }

  /**
   * Retrieve all registered violations.
   *
   * @returns A shallow copy of the full violations array
   */
  getAllViolations(): AuditViolation[] {
    return [...this.violations];
  }

  /**
   * Get the total number of registered violations.
   *
   * @returns The count of violations
   */
  getViolationCount(): number {
    return this.violations.length;
  }

  /**
   * Remove all registered violations, resetting the registry.
   */
  clear(): void {
    this.violations = [];
  }
}
