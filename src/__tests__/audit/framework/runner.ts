/**
 * AuditRunner - Orchestrates execution of all audit modules
 *
 * Manages audit module registration and execution with parallel processing
 * and error recovery patterns using Promise.allSettled.
 *
 * @module audit/framework/runner
 * @see Requirements 21.1, 21.6
 */

import type { AuditModule, AuditReport, AuditCategory } from './types';
import { ViolationRegistry } from './registry';

/**
 * Orchestrates the execution of all audit modules.
 *
 * Provides methods to register audit modules, run all modules in parallel,
 * or run a single category. Uses Promise.allSettled for error recovery,
 * ensuring that one failing audit doesn't prevent others from running.
 *
 * @example
 * ```typescript
 * const runner = new AuditRunner();
 * const registry = new ViolationRegistry();
 *
 * // Register audit modules
 * runner.registerModule(new TypeScriptStrictAudit());
 * runner.registerModule(new DeadCodeDetector());
 *
 * // Run all audits in parallel
 * const reports = await runner.runAll();
 *
 * // Or run a single category
 * const report = await runner.runCategory('typescript-strict');
 * ```
 */
export class AuditRunner {
  private modules: Map<AuditCategory, AuditModule> = new Map();
  private registry: ViolationRegistry;

  constructor(registry?: ViolationRegistry) {
    this.registry = registry || new ViolationRegistry();
  }

  /**
   * Register an audit module for execution.
   *
   * @param module - The audit module to register
   * @throws Error if a module with the same category is already registered
   */
  registerModule(module: AuditModule): void {
    if (this.modules.has(module.category)) {
      throw new Error(
        `Audit module for category '${module.category}' is already registered`
      );
    }
    this.modules.set(module.category, module);
  }

  /**
   * Run all registered audit modules in parallel.
   *
   * Uses Promise.allSettled to ensure all modules run even if some fail.
   * Failed audits are logged but don't prevent other audits from completing.
   *
   * @returns Map of audit reports keyed by category
   */
  async runAll(): Promise<Map<AuditCategory, AuditReport>> {
    const results = new Map<AuditCategory, AuditReport>();

    // Run all modules in parallel with error recovery
    const moduleEntries = Array.from(this.modules.entries());
    const promises = moduleEntries.map(async ([category, module]) => {
      try {
        const report = await module.run();
        
        // Register violations with the registry
        for (const violation of report.violations) {
          this.registry.registerViolation(violation);
        }
        
        return { category, report, success: true };
      } catch (error) {
        // Create error report for failed audit
        const errorReport: AuditReport = {
          category: module.category,
          totalViolations: 0,
          violations: [],
          metrics: {
            error: error instanceof Error ? error.message : String(error),
            failed: 'true',
          },
        };
        
        return { category, report: errorReport, success: false };
      }
    });

    // Wait for all audits to complete (settled)
    const settled = await Promise.allSettled(promises);

    // Collect results from settled promises
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { category, report } = result.value;
        results.set(category, report);
      } else {
        // Promise itself rejected (shouldn't happen with try-catch above)
        console.error('Unexpected audit promise rejection:', result.reason);
      }
    }

    return results;
  }

  /**
   * Run a single audit category.
   *
   * @param category - The audit category to run
   * @returns The audit report, or null if the category is not registered
   */
  async runCategory(category: AuditCategory): Promise<AuditReport | null> {
    const module = this.modules.get(category);
    
    if (!module) {
      return null;
    }

    try {
      const report = await module.run();
      
      // Register violations with the registry
      for (const violation of report.violations) {
        this.registry.registerViolation(violation);
      }
      
      return report;
    } catch (error) {
      // Return error report for failed audit
      return {
        category: module.category,
        totalViolations: 0,
        violations: [],
        metrics: {
          error: error instanceof Error ? error.message : String(error),
          failed: 'true',
        },
      };
    }
  }

  /**
   * Get the violation registry used by this runner.
   *
   * @returns The ViolationRegistry instance
   */
  getRegistry(): ViolationRegistry {
    return this.registry;
  }

  /**
   * Get the number of registered modules.
   *
   * @returns The count of registered modules
   */
  getModuleCount(): number {
    return this.modules.size;
  }

  /**
   * Check if a module is registered for a given category.
   *
   * @param category - The audit category to check
   * @returns True if a module is registered for the category
   */
  hasModule(category: AuditCategory): boolean {
    return this.modules.has(category);
  }

  /**
   * Clear all registered modules and reset the registry.
   */
  clear(): void {
    this.modules.clear();
    this.registry.clear();
  }
}
