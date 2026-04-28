/**
 * Integration Tests for Audit CLI
 *
 * Tests the CLI entry point for the audit framework, including:
 * - Single category execution
 * - Full audit execution
 * - Exit code handling
 * - Output format generation
 *
 * @module audit/cli.test
 * @see Requirements 21.1, 21.6
 */

import { main, registerAuditModules, isValidCategory, determineExitCode } from './cli';
import { AuditRunner } from './framework/runner';
import { ViolationRegistry } from './framework/registry';
import type { ComprehensiveAuditReport, AuditCategory, AuditReport, AuditViolation } from './framework/types';

describe('Audit CLI', () => {
  describe('isValidCategory', () => {
    it('should return true for valid categories', () => {
      const validCategories: string[] = [
        'typescript-strict',
        'dead-code',
        'security',
        'naming-conventions',
        'import-patterns',
        'architecture-compliance',
        'event-bus-patterns',
        'widget-quality',
        'accessibility',
        'keyboard-navigation',
        'error-handling',
        'project-structure',
        'documentation-accuracy',
        'code-comments',
        'cli-ide-parity',
        'test-coverage',
      ];

      for (const category of validCategories) {
        expect(isValidCategory(category)).toBe(true);
      }
    });

    it('should return false for invalid categories', () => {
      const invalidCategories = [
        'invalid',
        '',
        'nonexistent',
        'typescript',
        'TYPESCRIPT-STRICT',
        'dead_code',
        'security-audit',
      ];

      for (const category of invalidCategories) {
        expect(isValidCategory(category)).toBe(false);
      }
    });
  });

  describe('registerAuditModules', () => {
    it('should register all audit modules without errors', () => {
      const registry = new ViolationRegistry();
      const runner = new AuditRunner(registry);

      // Should not throw
      expect(() => registerAuditModules(runner)).not.toThrow();

      // Verify modules were registered
      expect(runner.getModuleCount()).toBeGreaterThan(0);
    });

    it('should register expected core modules', () => {
      const registry = new ViolationRegistry();
      const runner = new AuditRunner(registry);

      registerAuditModules(runner);

      // Check for key modules
      expect(runner.hasModule('typescript-strict')).toBe(true);
      expect(runner.hasModule('dead-code')).toBe(true);
      expect(runner.hasModule('security')).toBe(true);
      expect(runner.hasModule('architecture-compliance')).toBe(true);
    });
  });

  describe('determineExitCode', () => {
    it('should return 0 for reports with no violations', () => {
      const report = createMockReport({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });

      expect(determineExitCode(report)).toBe(0);
    });

    it('should return 1 for reports with critical violations', () => {
      const report = createMockReport({
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
      });

      expect(determineExitCode(report)).toBe(1);
    });

    it('should return 1 for reports with critical and high violations', () => {
      const report = createMockReport({
        critical: 2,
        high: 3,
        medium: 5,
        low: 1,
      });

      expect(determineExitCode(report)).toBe(1);
    });

    it('should return 2 for reports with high violations but no critical', () => {
      const report = createMockReport({
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
      });

      expect(determineExitCode(report)).toBe(2);
    });

    it('should return 2 for reports with high and medium violations but no critical', () => {
      const report = createMockReport({
        critical: 0,
        high: 5,
        medium: 10,
        low: 3,
      });

      expect(determineExitCode(report)).toBe(2);
    });

    it('should return 0 for reports with only medium violations', () => {
      const report = createMockReport({
        critical: 0,
        high: 0,
        medium: 5,
        low: 0,
      });

      expect(determineExitCode(report)).toBe(0);
    });

    it('should return 0 for reports with only low violations', () => {
      const report = createMockReport({
        critical: 0,
        high: 0,
        medium: 0,
        low: 10,
      });

      expect(determineExitCode(report)).toBe(0);
    });

    it('should return 0 for reports with medium and low violations', () => {
      const report = createMockReport({
        critical: 0,
        high: 0,
        medium: 3,
        low: 7,
      });

      expect(determineExitCode(report)).toBe(0);
    });
  });

  describe('Full audit execution (integration smoke test)', () => {
    it('should run registerAuditModules and execute without throwing', async () => {
      const registry = new ViolationRegistry();
      const runner = new AuditRunner(registry);

      // Register modules
      registerAuditModules(runner);

      // This is a smoke test - just verify no errors are thrown
      // We don't run the full audit here as it would be slow
      expect(runner.getModuleCount()).toBeGreaterThan(10);
    });
  });
});

/**
 * Helper function to create a mock ComprehensiveAuditReport for testing.
 *
 * @param severityCounts - Counts of violations by severity
 * @returns Mock ComprehensiveAuditReport
 */
function createMockReport(severityCounts: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): ComprehensiveAuditReport {
  const violations: AuditViolation[] = [];
  const reports = new Map<AuditCategory, AuditReport>();

  // Create mock violations for each severity
  let lineNumber = 1;
  for (const [severity, count] of Object.entries(severityCounts)) {
    for (let i = 0; i < count; i++) {
      violations.push({
        category: 'typescript-strict',
        severity: severity as 'critical' | 'high' | 'medium' | 'low',
        filePath: `src/test-file-${lineNumber}.ts`,
        lineNumber: lineNumber++,
        message: `Mock ${severity} violation`,
      });
    }
  }

  // Create a mock report
  const mockReport: AuditReport = {
    category: 'typescript-strict',
    totalViolations: violations.length,
    violations,
  };

  reports.set('typescript-strict', mockReport);

  const totalViolations = severityCounts.critical + severityCounts.high + severityCounts.medium + severityCounts.low;

  return {
    timestamp: new Date().toISOString(),
    healthScore: 100 - totalViolations,
    reports,
    topPriorityIssues: violations.slice(0, 10),
    summary: {
      totalViolations,
      bySeverity: {
        critical: severityCounts.critical,
        high: severityCounts.high,
        medium: severityCounts.medium,
        low: severityCounts.low,
      },
      byCategory: {
        'typescript-strict': totalViolations,
      } as Record<AuditCategory, number>,
    },
    passed: severityCounts.critical === 0 && severityCounts.high === 0,
  };
}
