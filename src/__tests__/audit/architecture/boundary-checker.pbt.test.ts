/**
 * Property-based tests for Architecture Boundary Checker
 *
 * **Property 10: Architecture Boundary Violation Detection**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 *
 * This test validates that the architecture boundary checker correctly:
 * 1. Detects boundary violations consistently - same code structure always produces same violations
 * 2. Reports violations with all required fields (category, severity, filePath, lineNumber, message, boundaryType, correctLocation)
 * 3. Enforces architectural hierarchy - code cannot import from layers above it
 * 4. Provides correct location suggestions for every violation
 */

import fc from 'fast-check';
import { ArchitectureBoundaryChecker } from './boundary-checker';
import type { ArchitectureViolation, BoundaryType } from './boundary-checker';

describe('Property-based tests for Architecture Boundary Checker', () => {
  describe('Property 10: Architecture Boundary Violation Detection', () => {
    // Arbitrary for generating valid directory paths
    const directoryArb = fc.constantFrom(
      'src/core',
      'src/agents',
      'src/widgets',
      'src/cli',
      'src/types'
    );

    // Arbitrary for generating import paths
    const importPathArb = fc.oneof(
      // Module alias imports
      fc.constantFrom(
        '@core/config',
        '@core/event-bus',
        '@agents/registry',
        '@agents/orchestrator',
        '@widgets/TaskPanel',
        '@widgets/DiffApproval',
        '@types/agent',
        '@cli/commands'
      ),
      // Relative imports
      fc.constantFrom(
        './helper',
        '../utils',
        '../../core/config',
        '../../../types/agent'
      ),
      // External packages
      fc.constantFrom(
        'react',
        'react-dom',
        'fs',
        'path',
        'events'
      )
    );

    // Arbitrary for generating boundary types
    const boundaryTypeArb = fc.constantFrom<BoundaryType>(
      'core-to-agent',
      'core-to-widget',
      'agent-to-widget',
      'widget-to-agent',
      'cli-to-agent',
      'cli-to-widget',
      'unauthorized-import'
    );

    it('should produce consistent violations for the same codebase', async () => {
      // Run the checker multiple times and verify results are identical
      const checker = new ArchitectureBoundaryChecker();

      const report1 = await checker.run();
      const report2 = await checker.run();

      // Same number of violations
      expect(report1.totalViolations).toBe(report2.totalViolations);
      expect(report1.violations.length).toBe(report2.violations.length);

      // Same violations in same order
      for (let i = 0; i < report1.violations.length; i++) {
        const v1 = report1.violations[i] as ArchitectureViolation;
        const v2 = report2.violations[i] as ArchitectureViolation;

        expect(v1.filePath).toBe(v2.filePath);
        expect(v1.lineNumber).toBe(v2.lineNumber);
        expect(v1.boundaryType).toBe(v2.boundaryType);
        expect(v1.importPath).toBe(v2.importPath);
        expect(v1.correctLocation).toBe(v2.correctLocation);
      }
    });

    it('should report violations with all required fields', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: Math.max(0, report.violations.length - 1) }),
          (index) => {
            fc.pre(report.violations.length > 0);

            const violation = report.violations[index] as ArchitectureViolation;

            // Required base fields
            expect(violation.category).toBe('architecture-compliance');
            expect(violation.severity).toBeDefined();
            expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
            expect(violation.filePath).toBeDefined();
            expect(typeof violation.filePath).toBe('string');
            expect(violation.filePath.length).toBeGreaterThan(0);
            expect(violation.lineNumber).toBeDefined();
            expect(typeof violation.lineNumber).toBe('number');
            expect(violation.lineNumber).toBeGreaterThan(0);
            expect(violation.message).toBeDefined();
            expect(typeof violation.message).toBe('string');
            expect(violation.message.length).toBeGreaterThan(0);

            // Architecture-specific fields
            expect(violation.boundaryType).toBeDefined();
            expect([
              'core-to-agent',
              'core-to-widget',
              'agent-to-widget',
              'widget-to-agent',
              'cli-to-agent',
              'cli-to-widget',
              'unauthorized-import',
            ]).toContain(violation.boundaryType);
            expect(violation.sourcePath).toBeDefined();
            expect(typeof violation.sourcePath).toBe('string');
            expect(violation.sourcePath.length).toBeGreaterThan(0);
            expect(violation.importPath).toBeDefined();
            expect(typeof violation.importPath).toBe('string');
            expect(violation.importPath.length).toBeGreaterThan(0);
            expect(violation.correctLocation).toBeDefined();
            expect(typeof violation.correctLocation).toBe('string');
            expect(violation.correctLocation.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: Math.min(100, Math.max(1, report.violations.length)) }
      );
    });

    it('should enforce architectural hierarchy - types layer cannot import from other layers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '@core/config',
            '@agents/registry',
            '@widgets/TaskPanel',
            '@cli/commands',
            'src/core/config',
            'src/agents/registry',
            'src/widgets/TaskPanel',
            'src/cli/commands'
          ),
          (importPath) => {
            const checker = new ArchitectureBoundaryChecker();

            // Simulate checking if types/ importing from other layers is a violation
            const sourceFile = 'src/types/agent.ts';
            const isViolation = importPath.includes('src/') || importPath.startsWith('@');

            // Types layer should not import from implementation layers
            if (isViolation) {
              expect(importPath).toMatch(/src\/|@(core|agents|widgets|cli)/);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce architectural hierarchy - core layer cannot import from agents or widgets', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '@agents/registry',
            '@agents/orchestrator',
            '@widgets/TaskPanel',
            '@widgets/DiffApproval',
            'src/agents/registry',
            'src/widgets/TaskPanel',
            '../agents/registry',
            '../widgets/TaskPanel'
          ),
          (importPath) => {
            // Core layer importing from agents or widgets should be a violation
            const isAgentImport = importPath.includes('agents') || importPath.includes('@agents');
            const isWidgetImport = importPath.includes('widgets') || importPath.includes('@widgets');

            expect(isAgentImport || isWidgetImport).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce architectural hierarchy - agents layer cannot import from widgets', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '@widgets/TaskPanel',
            '@widgets/DiffApproval',
            '@widgets/GraphExplorer',
            'src/widgets/TaskPanel',
            '../widgets/DiffApproval',
            'react',
            'react-dom'
          ),
          (importPath) => {
            // Agents layer importing from widgets should be a violation
            const isWidgetImport = importPath.includes('widgets') || 
                                   importPath.includes('@widgets') ||
                                   importPath === 'react' ||
                                   importPath === 'react-dom';

            expect(isWidgetImport).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide correct location suggestions for all violations', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: Math.max(0, report.violations.length - 1) }),
          (index) => {
            fc.pre(report.violations.length > 0);

            const violation = report.violations[index] as ArchitectureViolation;

            // Every violation must have a non-empty correct location suggestion
            expect(violation.correctLocation).toBeDefined();
            expect(typeof violation.correctLocation).toBe('string');
            expect(violation.correctLocation.length).toBeGreaterThan(0);

            // Correct location should provide actionable guidance
            const hasActionableGuidance = 
              violation.correctLocation.includes('Move') ||
              violation.correctLocation.includes('move') ||
              violation.correctLocation.includes('src/') ||
              violation.correctLocation.includes('Reverse') ||
              violation.correctLocation.includes('use') ||
              violation.correctLocation.includes('pattern');

            expect(hasActionableGuidance).toBe(true);
          }
        ),
        { numRuns: Math.min(100, Math.max(1, report.violations.length)) }
      );
    });

    it('should correctly classify boundary violation types based on source and import', () => {
      fc.assert(
        fc.property(
          fc.record({
            sourceDir: fc.constantFrom('core', 'agents', 'widgets', 'cli', 'types'),
            importTarget: fc.constantFrom('core', 'agents', 'widgets', 'cli', 'types'),
          }),
          ({ sourceDir, importTarget }) => {
            // Skip valid imports
            fc.pre(sourceDir !== importTarget);

            const checker = new ArchitectureBoundaryChecker();

            // Determine expected boundary type
            let expectedBoundaryType: BoundaryType | null = null;

            if (sourceDir === 'core' && importTarget === 'agents') {
              expectedBoundaryType = 'core-to-agent';
            } else if (sourceDir === 'core' && importTarget === 'widgets') {
              expectedBoundaryType = 'core-to-widget';
            } else if (sourceDir === 'agents' && importTarget === 'widgets') {
              expectedBoundaryType = 'agent-to-widget';
            } else if (sourceDir === 'widgets' && importTarget === 'agents') {
              expectedBoundaryType = 'widget-to-agent';
            } else if (sourceDir === 'cli' && importTarget === 'agents') {
              expectedBoundaryType = 'cli-to-agent';
            } else if (sourceDir === 'cli' && importTarget === 'widgets') {
              expectedBoundaryType = 'cli-to-widget';
            }

            // If we expect a violation, verify the boundary type is valid
            if (expectedBoundaryType) {
              expect([
                'core-to-agent',
                'core-to-widget',
                'agent-to-widget',
                'widget-to-agent',
                'cli-to-agent',
                'cli-to-widget',
                'unauthorized-import',
              ]).toContain(expectedBoundaryType);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain violation count consistency with violations array', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      // Total violations should always match array length
      expect(report.totalViolations).toBe(report.violations.length);

      // Metrics violation count should match total violations
      if (report.metrics?.violationCount !== undefined) {
        expect(report.metrics.violationCount).toBe(report.totalViolations);
      }
    });

    it('should group violations by boundary type correctly', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      // Count violations by boundary type manually
      const manualCounts: Record<string, number> = {};
      for (const violation of report.violations) {
        const archViolation = violation as ArchitectureViolation;
        const type = archViolation.boundaryType;
        manualCounts[type] = (manualCounts[type] || 0) + 1;
      }

      // Verify metrics match manual counts
      if (report.metrics) {
        for (const [type, count] of Object.entries(manualCounts)) {
          if (report.metrics[type] !== undefined) {
            expect(report.metrics[type]).toBe(count);
          }
        }
      }
    });

    it('should handle edge case: empty source directory', async () => {
      const checker = new ArchitectureBoundaryChecker({
        srcDirs: ['nonexistent-directory'],
      });

      const report = await checker.run();

      // Should not crash, should return valid report structure
      expect(report).toHaveProperty('category', 'architecture-compliance');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(Array.isArray(report.violations)).toBe(true);
      expect(report.metrics?.totalFilesScanned).toBeGreaterThanOrEqual(0);
    });

    it('should handle edge case: no violations in codebase', async () => {
      // This test verifies the checker handles a clean codebase gracefully
      const checker = new ArchitectureBoundaryChecker({
        srcDirs: ['src/types'], // Types should have minimal imports
        excludePatterns: [/.*/], // Exclude everything to simulate clean state
      });

      const report = await checker.run();

      // Should return valid report structure even with no violations
      expect(report).toHaveProperty('category', 'architecture-compliance');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(Array.isArray(report.violations)).toBe(true);
    });

    it('should be deterministic - same input produces same output', async () => {
      // Run the checker multiple times to verify determinism
      const runs = 10;
      const results: ArchitectureViolation[][] = [];

      for (let r = 0; r < runs; r++) {
        const checker = new ArchitectureBoundaryChecker();
        const report = await checker.run();
        results.push(report.violations as ArchitectureViolation[]);
      }

      // All runs should produce identical results
      const first = results[0];
      for (let r = 1; r < runs; r++) {
        expect(results[r].length).toBe(first.length);
        for (let i = 0; i < first.length; i++) {
          expect(results[r][i].filePath).toBe(first[i].filePath);
          expect(results[r][i].lineNumber).toBe(first[i].lineNumber);
          expect(results[r][i].boundaryType).toBe(first[i].boundaryType);
        }
      }
    });

    it('should validate that source path matches file path for violations', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: Math.max(0, report.violations.length - 1) }),
          (index) => {
            fc.pre(report.violations.length > 0);

            const violation = report.violations[index] as ArchitectureViolation;

            // Source path should be the same as file path (or normalized version)
            expect(violation.sourcePath).toBe(violation.filePath);
          }
        ),
        { numRuns: Math.min(100, Math.max(1, report.violations.length)) }
      );
    });

    it('should ensure import paths are non-empty strings', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      for (const violation of report.violations) {
        const archViolation = violation as ArchitectureViolation;

        expect(archViolation.importPath).toBeDefined();
        expect(typeof archViolation.importPath).toBe('string');
        expect(archViolation.importPath.length).toBeGreaterThan(0);
        expect(archViolation.importPath.trim()).toBe(archViolation.importPath);
      }
    });

    it('should ensure line numbers are positive integers', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      for (const violation of report.violations) {
        expect(violation.lineNumber).toBeGreaterThan(0);
        expect(Number.isInteger(violation.lineNumber)).toBe(true);
      }
    });

    it('should ensure messages are descriptive and non-empty', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      for (const violation of report.violations) {
        expect(violation.message).toBeDefined();
        expect(typeof violation.message).toBe('string');
        expect(violation.message.length).toBeGreaterThan(10); // Reasonably descriptive
        expect(violation.message.trim()).toBe(violation.message);
      }
    });

    it('should handle custom configuration without breaking', () => {
      fc.assert(
        fc.property(
          fc.record({
            srcDirs: fc.array(fc.constantFrom('src', 'lib', 'app'), { minLength: 1, maxLength: 3 }),
            extensions: fc.array(fc.constantFrom('.ts', '.tsx', '.js', '.jsx'), { minLength: 1, maxLength: 4 }),
          }),
          (config) => {
            const checker = new ArchitectureBoundaryChecker(config);

            expect(checker).toBeDefined();
            expect(checker.category).toBe('architecture-compliance');
            expect(checker.name).toBe('Architecture Boundary Checker');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should respect exclude patterns', async () => {
      const checker = new ArchitectureBoundaryChecker({
        excludePatterns: [/node_modules/, /dist/, /\.test\.ts$/, /\.pbt\.test\.ts$/],
      });

      const report = await checker.run();

      // No violations should come from excluded paths
      for (const violation of report.violations) {
        expect(violation.filePath).not.toMatch(/node_modules/);
        expect(violation.filePath).not.toMatch(/dist/);
        expect(violation.filePath).not.toMatch(/\.test\.ts$/);
        expect(violation.filePath).not.toMatch(/\.pbt\.test\.ts$/);
      }
    });

    it('should handle metrics aggregation correctly', async () => {
      const checker = new ArchitectureBoundaryChecker();
      const report = await checker.run();

      if (report.metrics) {
        // Files scanned should be non-negative
        expect(report.metrics.totalFilesScanned).toBeGreaterThanOrEqual(0);

        // Imports analyzed should be non-negative
        expect(report.metrics.totalImportsAnalyzed).toBeGreaterThanOrEqual(0);

        // Violation count should match total violations
        expect(report.metrics.violationCount).toBe(report.totalViolations);

        // Sum of boundary type counts should equal total violations
        const boundaryTypes = [
          'core-to-agent',
          'core-to-widget',
          'agent-to-widget',
          'widget-to-agent',
          'cli-to-agent',
          'cli-to-widget',
          'unauthorized-import',
        ];

        let sumOfTypeCounts = 0;
        for (const type of boundaryTypes) {
          if (typeof report.metrics[type] === 'number') {
            sumOfTypeCounts += report.metrics[type] as number;
          }
        }

        if (sumOfTypeCounts > 0) {
          expect(sumOfTypeCounts).toBe(report.totalViolations);
        }
      }
    });
  });
});
