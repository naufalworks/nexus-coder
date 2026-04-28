/**
 * Unit tests for ViolationRegistry
 * 
 * Tests cover:
 * - Violation registration and retrieval
 * - Category filtering
 * - Severity filtering
 * - Edge cases: empty registry, multiple violations, filtering with no matches
 * 
 * **Validates: Requirements 21.1**
 */

import { ViolationRegistry } from './registry';
import { AuditViolation, AuditCategory, Severity } from './types';

describe('ViolationRegistry', () => {
  let registry: ViolationRegistry;

  beforeEach(() => {
    registry = new ViolationRegistry();
  });

  describe('registerViolation', () => {
    it('should register a single violation', () => {
      const violation: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      registry.registerViolation(violation);

      expect(registry.getViolationCount()).toBe(1);
      expect(registry.getAllViolations()).toContainEqual(violation);
    });

    it('should register multiple violations', () => {
      const violation1: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      const violation2: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/utils/helper.ts',
        lineNumber: 10,
        message: 'Unused export detected',
        symbolName: 'unusedFunction',
      };

      registry.registerViolation(violation1);
      registry.registerViolation(violation2);

      expect(registry.getViolationCount()).toBe(2);
      expect(registry.getAllViolations()).toContainEqual(violation1);
      expect(registry.getAllViolations()).toContainEqual(violation2);
    });

    it('should register violations with optional fields', () => {
      const violation: AuditViolation = {
        category: 'dead-code',
        severity: 'low',
        filePath: 'src/components/Button.tsx',
        lineNumber: 15,
        message: 'Unused component detected',
        symbolName: 'UnusedButton',
        estimatedBytes: 1234,
      };

      registry.registerViolation(violation);

      const retrieved = registry.getAllViolations()[0];
      expect(retrieved.symbolName).toBe('UnusedButton');
      expect(retrieved.estimatedBytes).toBe(1234);
    });
  });

  describe('getViolationsByCategory', () => {
    beforeEach(() => {
      const violations: AuditViolation[] = [
        {
          category: 'typescript-strict',
          severity: 'high',
          filePath: 'src/widgets/TaskPanel.tsx',
          lineNumber: 42,
          message: 'Explicit any type annotation detected',
        },
        {
          category: 'typescript-strict',
          severity: 'medium',
          filePath: 'src/widgets/DiffApproval.tsx',
          lineNumber: 20,
          message: '@ts-ignore comment detected',
        },
        {
          category: 'dead-code',
          severity: 'low',
          filePath: 'src/utils/helper.ts',
          lineNumber: 10,
          message: 'Unused export detected',
          symbolName: 'unusedFunction',
        },
        {
          category: 'security',
          severity: 'critical',
          filePath: 'src/widgets/ReasoningLog.tsx',
          lineNumber: 55,
          message: 'dangerouslySetInnerHTML without sanitization',
        },
      ];

      violations.forEach((v) => registry.registerViolation(v));
    });

    it('should filter violations by category', () => {
      const tsViolations = registry.getViolationsByCategory('typescript-strict');

      expect(tsViolations).toHaveLength(2);
      expect(tsViolations.every((v) => v.category === 'typescript-strict')).toBe(true);
    });

    it('should return empty array for category with no violations', () => {
      const accessibilityViolations = registry.getViolationsByCategory('accessibility');

      expect(accessibilityViolations).toHaveLength(0);
      expect(accessibilityViolations).toEqual([]);
    });

    it('should return single violation for category with one match', () => {
      const securityViolations = registry.getViolationsByCategory('security');

      expect(securityViolations).toHaveLength(1);
      expect(securityViolations[0].category).toBe('security');
      expect(securityViolations[0].severity).toBe('critical');
    });

    it('should not modify original violations array', () => {
      const tsViolations = registry.getViolationsByCategory('typescript-strict');
      const originalCount = registry.getViolationCount();

      tsViolations.push({
        category: 'typescript-strict',
        severity: 'low',
        filePath: 'test.ts',
        lineNumber: 1,
        message: 'test',
      });

      expect(registry.getViolationCount()).toBe(originalCount);
    });
  });

  describe('getViolationsBySeverity', () => {
    beforeEach(() => {
      const violations: AuditViolation[] = [
        {
          category: 'security',
          severity: 'critical',
          filePath: 'src/widgets/ReasoningLog.tsx',
          lineNumber: 55,
          message: 'dangerouslySetInnerHTML without sanitization',
        },
        {
          category: 'typescript-strict',
          severity: 'high',
          filePath: 'src/widgets/TaskPanel.tsx',
          lineNumber: 42,
          message: 'Explicit any type annotation detected',
        },
        {
          category: 'typescript-strict',
          severity: 'high',
          filePath: 'src/widgets/DiffApproval.tsx',
          lineNumber: 20,
          message: '@ts-ignore comment detected',
        },
        {
          category: 'naming-conventions',
          severity: 'medium',
          filePath: 'src/utils/helper.ts',
          lineNumber: 5,
          message: 'File name should use camelCase',
        },
        {
          category: 'dead-code',
          severity: 'low',
          filePath: 'src/utils/unused.ts',
          lineNumber: 10,
          message: 'Unused export detected',
          symbolName: 'unusedFunction',
        },
      ];

      violations.forEach((v) => registry.registerViolation(v));
    });

    it('should filter violations by severity', () => {
      const highViolations = registry.getViolationsBySeverity('high');

      expect(highViolations).toHaveLength(2);
      expect(highViolations.every((v) => v.severity === 'high')).toBe(true);
    });

    it('should return critical violations', () => {
      const criticalViolations = registry.getViolationsBySeverity('critical');

      expect(criticalViolations).toHaveLength(1);
      expect(criticalViolations[0].severity).toBe('critical');
      expect(criticalViolations[0].category).toBe('security');
    });

    it('should return medium violations', () => {
      const mediumViolations = registry.getViolationsBySeverity('medium');

      expect(mediumViolations).toHaveLength(1);
      expect(mediumViolations[0].severity).toBe('medium');
    });

    it('should return low violations', () => {
      const lowViolations = registry.getViolationsBySeverity('low');

      expect(lowViolations).toHaveLength(1);
      expect(lowViolations[0].severity).toBe('low');
    });

    it('should return empty array for severity with no violations', () => {
      registry.clear();
      const highViolations = registry.getViolationsBySeverity('high');

      expect(highViolations).toHaveLength(0);
      expect(highViolations).toEqual([]);
    });

    it('should not modify original violations array', () => {
      const highViolations = registry.getViolationsBySeverity('high');
      const originalCount = registry.getViolationCount();

      highViolations.push({
        category: 'security',
        severity: 'high',
        filePath: 'test.ts',
        lineNumber: 1,
        message: 'test',
      });

      expect(registry.getViolationCount()).toBe(originalCount);
    });
  });

  describe('getAllViolations', () => {
    it('should return empty array for empty registry', () => {
      const violations = registry.getAllViolations();

      expect(violations).toHaveLength(0);
      expect(violations).toEqual([]);
    });

    it('should return all registered violations', () => {
      const violation1: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      const violation2: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/utils/helper.ts',
        lineNumber: 10,
        message: 'Unused export detected',
      };

      registry.registerViolation(violation1);
      registry.registerViolation(violation2);

      const allViolations = registry.getAllViolations();

      expect(allViolations).toHaveLength(2);
      expect(allViolations).toContainEqual(violation1);
      expect(allViolations).toContainEqual(violation2);
    });

    it('should return a shallow copy of violations array', () => {
      const violation: AuditViolation = {
        category: 'security',
        severity: 'critical',
        filePath: 'src/app.ts',
        lineNumber: 1,
        message: 'Security issue',
      };

      registry.registerViolation(violation);

      const violations1 = registry.getAllViolations();
      const violations2 = registry.getAllViolations();

      expect(violations1).not.toBe(violations2);
      expect(violations1).toEqual(violations2);
    });

    it('should not allow external modification of internal state', () => {
      const violation: AuditViolation = {
        category: 'security',
        severity: 'critical',
        filePath: 'src/app.ts',
        lineNumber: 1,
        message: 'Security issue',
      };

      registry.registerViolation(violation);

      const violations = registry.getAllViolations();
      violations.push({
        category: 'dead-code',
        severity: 'low',
        filePath: 'test.ts',
        lineNumber: 1,
        message: 'test',
      });

      expect(registry.getViolationCount()).toBe(1);
    });
  });

  describe('getViolationCount', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.getViolationCount()).toBe(0);
    });

    it('should return correct count after registering violations', () => {
      const violation1: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      const violation2: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/utils/helper.ts',
        lineNumber: 10,
        message: 'Unused export detected',
      };

      registry.registerViolation(violation1);
      expect(registry.getViolationCount()).toBe(1);

      registry.registerViolation(violation2);
      expect(registry.getViolationCount()).toBe(2);
    });

    it('should return correct count after clearing', () => {
      const violation: AuditViolation = {
        category: 'security',
        severity: 'critical',
        filePath: 'src/app.ts',
        lineNumber: 1,
        message: 'Security issue',
      };

      registry.registerViolation(violation);
      expect(registry.getViolationCount()).toBe(1);

      registry.clear();
      expect(registry.getViolationCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all violations from registry', () => {
      const violations: AuditViolation[] = [
        {
          category: 'typescript-strict',
          severity: 'high',
          filePath: 'src/widgets/TaskPanel.tsx',
          lineNumber: 42,
          message: 'Explicit any type annotation detected',
        },
        {
          category: 'dead-code',
          severity: 'medium',
          filePath: 'src/utils/helper.ts',
          lineNumber: 10,
          message: 'Unused export detected',
        },
        {
          category: 'security',
          severity: 'critical',
          filePath: 'src/app.ts',
          lineNumber: 1,
          message: 'Security issue',
        },
      ];

      violations.forEach((v) => registry.registerViolation(v));
      expect(registry.getViolationCount()).toBe(3);

      registry.clear();

      expect(registry.getViolationCount()).toBe(0);
      expect(registry.getAllViolations()).toEqual([]);
    });

    it('should allow registering new violations after clear', () => {
      const violation1: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      registry.registerViolation(violation1);
      registry.clear();

      const violation2: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/utils/helper.ts',
        lineNumber: 10,
        message: 'Unused export detected',
      };

      registry.registerViolation(violation2);

      expect(registry.getViolationCount()).toBe(1);
      expect(registry.getAllViolations()).toContainEqual(violation2);
      expect(registry.getAllViolations()).not.toContainEqual(violation1);
    });

    it('should handle multiple clears gracefully', () => {
      registry.clear();
      registry.clear();
      registry.clear();

      expect(registry.getViolationCount()).toBe(0);
      expect(registry.getAllViolations()).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty registry operations', () => {
      expect(registry.getViolationCount()).toBe(0);
      expect(registry.getAllViolations()).toEqual([]);
      expect(registry.getViolationsByCategory('typescript-strict')).toEqual([]);
      expect(registry.getViolationsBySeverity('high')).toEqual([]);
    });

    it('should handle filtering with no matches', () => {
      const violation: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/widgets/TaskPanel.tsx',
        lineNumber: 42,
        message: 'Explicit any type annotation detected',
      };

      registry.registerViolation(violation);

      expect(registry.getViolationsByCategory('accessibility')).toEqual([]);
      expect(registry.getViolationsBySeverity('critical')).toEqual([]);
    });

    it('should handle large number of violations', () => {
      const violations: AuditViolation[] = [];
      for (let i = 0; i < 1000; i++) {
        violations.push({
          category: 'typescript-strict',
          severity: 'high',
          filePath: `src/file${i}.ts`,
          lineNumber: i,
          message: `Violation ${i}`,
        });
      }

      violations.forEach((v) => registry.registerViolation(v));

      expect(registry.getViolationCount()).toBe(1000);
      expect(registry.getAllViolations()).toHaveLength(1000);
      expect(registry.getViolationsByCategory('typescript-strict')).toHaveLength(1000);
      expect(registry.getViolationsBySeverity('high')).toHaveLength(1000);
    });

    it('should handle violations with all severity levels', () => {
      const severities: Severity[] = ['critical', 'high', 'medium', 'low'];

      severities.forEach((severity, index) => {
        registry.registerViolation({
          category: 'typescript-strict',
          severity,
          filePath: `src/file${index}.ts`,
          lineNumber: index,
          message: `${severity} violation`,
        });
      });

      expect(registry.getViolationCount()).toBe(4);
      expect(registry.getViolationsBySeverity('critical')).toHaveLength(1);
      expect(registry.getViolationsBySeverity('high')).toHaveLength(1);
      expect(registry.getViolationsBySeverity('medium')).toHaveLength(1);
      expect(registry.getViolationsBySeverity('low')).toHaveLength(1);
    });

    it('should handle violations with all categories', () => {
      const categories: AuditCategory[] = [
        'typescript-strict',
        'dead-code',
        'naming-conventions',
        'import-patterns',
        'architecture-compliance',
        'security',
      ];

      categories.forEach((category, index) => {
        registry.registerViolation({
          category,
          severity: 'high',
          filePath: `src/file${index}.ts`,
          lineNumber: index,
          message: `${category} violation`,
        });
      });

      expect(registry.getViolationCount()).toBe(categories.length);
      categories.forEach((category) => {
        expect(registry.getViolationsByCategory(category)).toHaveLength(1);
      });
    });

    it('should preserve violation order', () => {
      const violation1: AuditViolation = {
        category: 'typescript-strict',
        severity: 'high',
        filePath: 'src/file1.ts',
        lineNumber: 1,
        message: 'First violation',
      };

      const violation2: AuditViolation = {
        category: 'dead-code',
        severity: 'medium',
        filePath: 'src/file2.ts',
        lineNumber: 2,
        message: 'Second violation',
      };

      const violation3: AuditViolation = {
        category: 'security',
        severity: 'critical',
        filePath: 'src/file3.ts',
        lineNumber: 3,
        message: 'Third violation',
      };

      registry.registerViolation(violation1);
      registry.registerViolation(violation2);
      registry.registerViolation(violation3);

      const allViolations = registry.getAllViolations();

      expect(allViolations[0]).toEqual(violation1);
      expect(allViolations[1]).toEqual(violation2);
      expect(allViolations[2]).toEqual(violation3);
    });
  });
});
