/**
 * Unit tests for audit framework types
 * 
 * Validates that the core audit types can be instantiated and used correctly.
 */

import {
  AuditViolation,
  AuditReport,
  ComprehensiveAuditReport,
  AuditCategory,
  Severity,
  AuditModule,
} from './types';

describe('Audit Framework Types', () => {
  describe('AuditViolation', () => {
    it('should create a valid violation with required fields', () => {
      const violation: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/test.ts',
        lineNumber: 42,
        message: 'Test violation',
      };

      expect(violation.category).toBe('typescript-strict');
      expect(violation.severity).toBe('high');
      expect(violation.filePath).toBe('src/test.ts');
      expect(violation.lineNumber).toBe(42);
      expect(violation.message).toBe('Test violation');
    });

    it('should support optional symbolName field', () => {
      const violation: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/utils.ts',
        lineNumber: 10,
        message: 'Unused export',
        symbolName: 'unusedFunction',
      };

      expect(violation.symbolName).toBe('unusedFunction');
    });

    it('should support optional estimatedBytes field', () => {
      const violation: AuditViolation = {
        category: 'bundle-size',
        severity: 'low',
        filePath: 'src/widget.tsx',
        lineNumber: 1,
        message: 'Large bundle',
        estimatedBytes: 5000,
      };

      expect(violation.estimatedBytes).toBe(5000);
    });
  });

  describe('AuditReport', () => {
    it('should create a valid report with violations', () => {
      const violations: AuditViolation[] = [
        {
          category: 'typescript-strict',
          severity: 'high',
          filePath: 'src/test.ts',
          lineNumber: 1,
          message: 'Test violation 1',
        },
        {
          category: 'typescript-strict',
          severity: 'medium',
          filePath: 'src/test2.ts',
          lineNumber: 2,
          message: 'Test violation 2',
        },
      ];

      const report: AuditReport = {
        category: 'typescript-strict',
        totalViolations: violations.length,
        violations,
      };

      expect(report.category).toBe('typescript-strict');
      expect(report.totalViolations).toBe(2);
      expect(report.violations).toHaveLength(2);
    });

    it('should support optional metrics field', () => {
      const report: AuditReport = {
        category: 'dead-code',
        totalViolations: 5,
        violations: [],
        metrics: {
          unusedExports: 5,
          estimatedBytes: 1234,
        },
      };

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.unusedExports).toBe(5);
      expect(report.metrics?.estimatedBytes).toBe(1234);
    });

    it('should support optional estimatedBundleReduction field', () => {
      const report: AuditReport = {
        category: 'dead-code',
        totalViolations: 3,
        violations: [],
        estimatedBundleReduction: '1.2KB',
      };

      expect(report.estimatedBundleReduction).toBe('1.2KB');
    });
  });

  describe('ComprehensiveAuditReport', () => {
    it('should create a valid comprehensive report', () => {
      const report: ComprehensiveAuditReport = {
        timestamp: '2026-04-28T03:42:48.754Z',
        healthScore: 87.5,
        reports: new Map(),
        topPriorityIssues: [],
        summary: {
          totalViolations: 0,
          bySeverity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          },
          byCategory: {} as Record<AuditCategory, number>,
        },
        passed: true,
      };

      expect(report.timestamp).toBe('2026-04-28T03:42:48.754Z');
      expect(report.healthScore).toBe(87.5);
      expect(report.passed).toBe(true);
      expect(report.reports).toBeInstanceOf(Map);
    });

    it('should support multiple category reports', () => {
      const typescriptReport: AuditReport = {
        category: 'typescript-strict',
        totalViolations: 2,
        violations: [],
      };

      const deadCodeReport: AuditReport = {
        category: 'dead-code',
        totalViolations: 3,
        violations: [],
      };

      const reports = new Map<AuditCategory, AuditReport>([
        ['typescript-strict', typescriptReport],
        ['dead-code', deadCodeReport],
      ]);

      const comprehensiveReport: ComprehensiveAuditReport = {
        timestamp: '2026-04-28T03:42:48.754Z',
        healthScore: 90.0,
        reports,
        topPriorityIssues: [],
        summary: {
          totalViolations: 5,
          bySeverity: {
            critical: 0,
            high: 2,
            medium: 3,
            low: 0,
          },
          byCategory: {
            'typescript-strict': 2,
            'dead-code': 3,
          } as Record<AuditCategory, number>,
        },
        passed: true,
      };

      expect(comprehensiveReport.reports.size).toBe(2);
      expect(comprehensiveReport.reports.get('typescript-strict')).toBe(typescriptReport);
      expect(comprehensiveReport.reports.get('dead-code')).toBe(deadCodeReport);
    });
  });

  describe('AuditModule interface', () => {
    it('should allow implementation of audit modules', async () => {
      class TestAuditModule implements AuditModule {
        readonly category: AuditCategory = 'typescript-strict';
        readonly name = 'Test Audit Module';

        async run(): Promise<AuditReport> {
          return {
            category: this.category,
            totalViolations: 0,
            violations: [],
          };
        }
      }

      const module = new TestAuditModule();
      expect(module.category).toBe('typescript-strict');
      expect(module.name).toBe('Test Audit Module');

      const report = await module.run();
      expect(report.category).toBe('typescript-strict');
      expect(report.totalViolations).toBe(0);
    });
  });

  describe('Type unions', () => {
    it('should accept all valid severity levels', () => {
      const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
      
      severities.forEach(severity => {
        const violation: AuditViolation = {
          category: 'typescript-strict',
          severity,
          filePath: 'test.ts',
          lineNumber: 1,
          message: 'Test',
        };
        expect(violation.severity).toBe(severity);
      });
    });

    it('should accept all valid audit categories', () => {
      const categories: AuditCategory[] = [
        'typescript-strict',
        'dead-code',
        'naming-conventions',
        'import-patterns',
        'architecture-compliance',
        'event-bus-patterns',
        'widget-quality',
        'accessibility',
        'keyboard-navigation',
        'render-performance',
        'bundle-size',
        'project-structure',
        'dependency-health',
        'documentation-accuracy',
        'code-comments',
        'security',
        'memory-leaks',
        're-render-optimization',
        'cli-ide-parity',
        'error-handling',
        'test-coverage',
      ];

      expect(categories).toHaveLength(21);
    });
  });
});
