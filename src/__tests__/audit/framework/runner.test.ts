/**
 * Unit tests for AuditRunner
 *
 * Tests module registration, parallel execution, and error handling.
 *
 * @module audit/framework/runner.test
 * @see Requirements 21.1, 21.6
 */

import { AuditRunner } from './runner';
import { ViolationRegistry } from './registry';
import type { AuditModule, AuditReport, AuditCategory } from './types';

// Helper to create mock audit modules
function createMockModule(
  category: AuditCategory,
  name: string,
  report: AuditReport
): AuditModule {
  return {
    category,
    name,
    run: jest.fn().mockResolvedValue(report),
  };
}

// Helper to create a failing mock module
function createFailingModule(
  category: AuditCategory,
  name: string,
  error: Error
): AuditModule {
  return {
    category,
    name,
    run: jest.fn().mockRejectedValue(error),
  };
}

// Helper to create a slow module for timing tests
function createSlowModule(
  category: AuditCategory,
  name: string,
  report: AuditReport,
  delayMs: number
): AuditModule {
  return {
    category,
    name,
    run: jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(report), delayMs))
    ),
  };
}

describe('AuditRunner', () => {
  let runner: AuditRunner;
  let registry: ViolationRegistry;

  beforeEach(() => {
    registry = new ViolationRegistry();
    runner = new AuditRunner(registry);
  });

  describe('registerModule()', () => {
    it('should register an audit module', () => {
      const module = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 0,
        violations: [],
      });

      runner.registerModule(module);

      expect(runner.getModuleCount()).toBe(1);
      expect(runner.hasModule('typescript-strict')).toBe(true);
    });

    it('should register multiple audit modules', () => {
      const module1 = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 0,
        violations: [],
      });

      const module2 = createMockModule('dead-code', 'Dead Code Detector', {
        category: 'dead-code',
        totalViolations: 0,
        violations: [],
      });

      runner.registerModule(module1);
      runner.registerModule(module2);

      expect(runner.getModuleCount()).toBe(2);
      expect(runner.hasModule('typescript-strict')).toBe(true);
      expect(runner.hasModule('dead-code')).toBe(true);
    });

    it('should throw error when registering duplicate category', () => {
      const module1 = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 0,
        violations: [],
      });

      const module2 = createMockModule('typescript-strict', 'Another TS Audit', {
        category: 'typescript-strict',
        totalViolations: 0,
        violations: [],
      });

      runner.registerModule(module1);

      expect(() => runner.registerModule(module2)).toThrow(
        "Audit module for category 'typescript-strict' is already registered"
      );
    });
  });

  describe('runAll()', () => {
    it('should return empty map when no modules registered', async () => {
      const results = await runner.runAll();

      expect(results.size).toBe(0);
    });

    it('should run single module and return report', async () => {
      const module = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 2,
        violations: [
          {
            category: 'typescript-strict',
            severity: 'high',
            filePath: 'src/test.ts',
            lineNumber: 10,
            message: 'Explicit any type',
          },
          {
            category: 'typescript-strict',
            severity: 'medium',
            filePath: 'src/test.ts',
            lineNumber: 20,
            message: '@ts-ignore found',
          },
        ],
      });

      runner.registerModule(module);
      const results = await runner.runAll();

      expect(results.size).toBe(1);
      expect(results.get('typescript-strict')?.totalViolations).toBe(2);
    });

    it('should run multiple modules in parallel', async () => {
      const module1 = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 1,
        violations: [
          {
            category: 'typescript-strict',
            severity: 'high',
            filePath: 'src/a.ts',
            lineNumber: 1,
            message: 'Violation 1',
          },
        ],
      });

      const module2 = createMockModule('dead-code', 'Dead Code Detector', {
        category: 'dead-code',
        totalViolations: 2,
        violations: [
          {
            category: 'dead-code',
            severity: 'low',
            filePath: 'src/b.ts',
            lineNumber: 5,
            message: 'Unused export',
          },
          {
            category: 'dead-code',
            severity: 'low',
            filePath: 'src/c.ts',
            lineNumber: 10,
            message: 'Unused function',
          },
        ],
      });

      runner.registerModule(module1);
      runner.registerModule(module2);

      const results = await runner.runAll();

      expect(results.size).toBe(2);
      expect(results.get('typescript-strict')?.totalViolations).toBe(1);
      expect(results.get('dead-code')?.totalViolations).toBe(2);
    });

    it('should register violations with registry', async () => {
      const module = createMockModule('security', 'Security Audit', {
        category: 'security',
        totalViolations: 1,
        violations: [
          {
            category: 'security',
            severity: 'critical',
            filePath: 'src/auth.ts',
            lineNumber: 42,
            message: 'Hardcoded secret',
          },
        ],
      });

      runner.registerModule(module);
      await runner.runAll();

      const violations = registry.getAllViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].category).toBe('security');
      expect(violations[0].severity).toBe('critical');
    });

    it('should continue execution when one module fails', async () => {
      const goodModule = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 0,
        violations: [],
      });

      const failingModule = createFailingModule(
        'dead-code',
        'Dead Code Detector',
        new Error('Module crashed')
      );

      runner.registerModule(goodModule);
      runner.registerModule(failingModule);

      const results = await runner.runAll();

      // Both results should be present
      expect(results.size).toBe(2);

      // Good module should have normal report
      expect(results.get('typescript-strict')?.totalViolations).toBe(0);

      // Failed module should have error report
      const errorReport = results.get('dead-code');
      expect(errorReport?.totalViolations).toBe(0);
      expect(errorReport?.metrics?.error).toBe('Module crashed');
      expect(errorReport?.metrics?.failed).toBe('true');
    });

    it('should run modules in parallel (not sequential)', async () => {
      // Create modules that take time to run
      const startTime = Date.now();

      const module1 = createSlowModule(
        'typescript-strict',
        'TS Strict Audit',
        { category: 'typescript-strict', totalViolations: 0, violations: [] },
        100
      );

      const module2 = createSlowModule(
        'dead-code',
        'Dead Code Detector',
        { category: 'dead-code', totalViolations: 0, violations: [] },
        100
      );

      runner.registerModule(module1);
      runner.registerModule(module2);

      await runner.runAll();

      const elapsed = Date.now() - startTime;

      // If running in parallel, should take ~100ms, not ~200ms
      // Allow some margin for test overhead
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe('runCategory()', () => {
    it('should return null for unregistered category', async () => {
      const result = await runner.runCategory('typescript-strict');

      expect(result).toBeNull();
    });

    it('should run single registered category', async () => {
      const module = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 3,
        violations: [
          {
            category: 'typescript-strict',
            severity: 'high',
            filePath: 'src/a.ts',
            lineNumber: 1,
            message: 'Violation A',
          },
          {
            category: 'typescript-strict',
            severity: 'medium',
            filePath: 'src/b.ts',
            lineNumber: 2,
            message: 'Violation B',
          },
          {
            category: 'typescript-strict',
            severity: 'low',
            filePath: 'src/c.ts',
            lineNumber: 3,
            message: 'Violation C',
          },
        ],
      });

      runner.registerModule(module);

      const result = await runner.runCategory('typescript-strict');

      expect(result).not.toBeNull();
      expect(result?.totalViolations).toBe(3);
      expect(result?.violations).toHaveLength(3);
    });

    it('should register violations with registry for single category', async () => {
      const module = createMockModule('naming-conventions', 'Naming Audit', {
        category: 'naming-conventions',
        totalViolations: 1,
        violations: [
          {
            category: 'naming-conventions',
            severity: 'low',
            filePath: 'src/BadName.ts',
            lineNumber: 1,
            message: 'File should use camelCase',
          },
        ],
      });

      runner.registerModule(module);
      await runner.runCategory('naming-conventions');

      const violations = registry.getAllViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].category).toBe('naming-conventions');
    });

    it('should handle module failure gracefully', async () => {
      const failingModule = createFailingModule(
        'security',
        'Security Audit',
        new Error('Security check failed with runtime error')
      );

      runner.registerModule(failingModule);

      const result = await runner.runCategory('security');

      // Should return error report, not throw
      expect(result).not.toBeNull();
      expect(result?.totalViolations).toBe(0);
      expect(result?.metrics?.error).toBe('Security check failed with runtime error');
      expect(result?.metrics?.failed).toBe('true');
    });

    it('should not affect other modules when running single category', async () => {
      const module1 = createMockModule('typescript-strict', 'TS Strict Audit', {
        category: 'typescript-strict',
        totalViolations: 1,
        violations: [
          {
            category: 'typescript-strict',
            severity: 'high',
            filePath: 'src/a.ts',
            lineNumber: 1,
            message: 'Violation',
          },
        ],
      });

      const module2 = createMockModule('dead-code', 'Dead Code Detector', {
        category: 'dead-code',
        totalViolations: 2,
        violations: [
          {
            category: 'dead-code',
            severity: 'low',
            filePath: 'src/b.ts',
            lineNumber: 1,
            message: 'Dead',
          },
          {
            category: 'dead-code',
            severity: 'low',
            filePath: 'src/c.ts',
            lineNumber: 2,
            message: 'Dead',
          },
        ],
      });

      runner.registerModule(module1);
      runner.registerModule(module2);

      const result = await runner.runCategory('typescript-strict');

      // Only the requested category should have run
      expect(result?.totalViolations).toBe(1);
      
      // Only violations from the run category should be registered
      const violations = registry.getAllViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0].category).toBe('typescript-strict');
    });
  });

  describe('getRegistry()', () => {
    it('should return the violation registry', () => {
      const result = runner.getRegistry();

      expect(result).toBe(registry);
    });

    it('should create default registry if none provided', () => {
      const defaultRunner = new AuditRunner();
      const result = defaultRunner.getRegistry();

      expect(result).toBeInstanceOf(ViolationRegistry);
    });
  });

  describe('getModuleCount()', () => {
    it('should return 0 for empty runner', () => {
      expect(runner.getModuleCount()).toBe(0);
    });

    it('should return correct count after registrations', () => {
      runner.registerModule(
        createMockModule('typescript-strict', 'TS Audit', {
          category: 'typescript-strict',
          totalViolations: 0,
          violations: [],
        })
      );
      expect(runner.getModuleCount()).toBe(1);

      runner.registerModule(
        createMockModule('dead-code', 'Dead Code', {
          category: 'dead-code',
          totalViolations: 0,
          violations: [],
        })
      );
      expect(runner.getModuleCount()).toBe(2);
    });
  });

  describe('hasModule()', () => {
    it('should return false for unregistered category', () => {
      expect(runner.hasModule('typescript-strict')).toBe(false);
    });

    it('should return true for registered category', () => {
      runner.registerModule(
        createMockModule('typescript-strict', 'TS Audit', {
          category: 'typescript-strict',
          totalViolations: 0,
          violations: [],
        })
      );

      expect(runner.hasModule('typescript-strict')).toBe(true);
    });
  });

  describe('clear()', () => {
    it('should remove all registered modules', () => {
      runner.registerModule(
        createMockModule('typescript-strict', 'TS Audit', {
          category: 'typescript-strict',
          totalViolations: 0,
          violations: [],
        })
      );
      runner.registerModule(
        createMockModule('dead-code', 'Dead Code', {
          category: 'dead-code',
          totalViolations: 0,
          violations: [],
        })
      );

      runner.clear();

      expect(runner.getModuleCount()).toBe(0);
      expect(runner.hasModule('typescript-strict')).toBe(false);
      expect(runner.hasModule('dead-code')).toBe(false);
    });

    it('should clear the violation registry', async () => {
      runner.registerModule(
        createMockModule('typescript-strict', 'TS Audit', {
          category: 'typescript-strict',
          totalViolations: 1,
          violations: [
            {
              category: 'typescript-strict',
              severity: 'high',
              filePath: 'src/a.ts',
              lineNumber: 1,
              message: 'Violation',
            },
          ],
        })
      );

      await runner.runAll();
      expect(registry.getViolationCount()).toBe(1);

      runner.clear();
      expect(registry.getViolationCount()).toBe(0);
    });
  });
});
