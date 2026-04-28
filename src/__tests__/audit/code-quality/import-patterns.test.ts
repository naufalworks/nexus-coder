/**
 * Integration Tests for Import Pattern Audit Module
 *
 * Tests the ImportPatternAudit module with real-world scenarios
 * to ensure it correctly identifies violations in actual code.
 *
 * @module audit/code-quality/import-patterns.test
 */

import * as fs from 'fs';
import * as path from 'path';
import { ImportPatternAudit } from './import-patterns';
import type { ImportPatternViolation } from './import-patterns';

describe('ImportPatternAudit - Integration Tests', () => {
  describe('Module instantiation', () => {
    it('should create an audit instance with default config', () => {
      const audit = new ImportPatternAudit();
      expect(audit.category).toBe('import-patterns');
      expect(audit.name).toBe('Import Patterns Audit');
    });

    it('should create an audit instance with custom config', () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/core'],
        maxRelativeDepth: 3,
      });
      expect(audit.category).toBe('import-patterns');
    });
  });

  describe('Audit execution', () => {
    it('should run audit and return a report', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/core'],
        extensions: ['.ts', '.tsx'],
      });

      const report = await audit.run();

      expect(report).toBeDefined();
      expect(report.category).toBe('import-patterns');
      expect(report.totalViolations).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.violations)).toBe(true);
      expect(report.metrics).toBeDefined();
      expect(typeof report.metrics?.totalFiles).toBe('number');
      expect(typeof report.metrics?.totalImports).toBe('number');
    });

    it('should include metrics in the report', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/__tests__/audit/framework'],
      });

      const report = await audit.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.missingAliasViolations).toBeDefined();
      expect(report.metrics?.deepRelativeViolations).toBeDefined();
      expect(report.metrics?.barrelExportViolations).toBeDefined();
      expect(report.metrics?.circularDependencyViolations).toBeDefined();
      expect(report.metrics?.aliasUsageRate).toBeDefined();
    });
  });

  describe('Deep relative import detection', () => {
    it('should detect imports with excessive upward traversal', async () => {
      // Create a temporary test file with deep relative import
      const testDir = path.join(__dirname, 'test-fixtures');
      const testFile = path.join(testDir, 'deep-import-test.ts');

      try {
        // Create test directory if it doesn't exist
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }

        // Write test file with deep relative import
        fs.writeFileSync(
          testFile,
          `import { something } from '../../../../../../../core/config';\n`
        );

        const audit = new ImportPatternAudit({
          srcDirs: [testDir],
          maxRelativeDepth: 2,
        });

        const report = await audit.run();

        // Should detect the deep relative import violation
        const deepImportViolations = report.violations.filter(
          (v) => (v as ImportPatternViolation).violationType === 'deep-relative-import'
        );

        expect(deepImportViolations.length).toBeGreaterThan(0);
        expect(deepImportViolations[0].message).toContain('traverses');
        expect(deepImportViolations[0].severity).toBe('medium');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Violation structure', () => {
    it('should create violations with all required fields', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/core'],
      });

      const report = await audit.run();

      if (report.violations.length > 0) {
        const violation = report.violations[0] as ImportPatternViolation;

        expect(violation.category).toBe('import-patterns');
        expect(violation.severity).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
        expect(violation.filePath).toBeDefined();
        expect(typeof violation.lineNumber).toBe('number');
        expect(violation.lineNumber).toBeGreaterThan(0);
        expect(violation.message).toBeDefined();
        expect(violation.violationType).toBeDefined();
        expect(['missing-alias', 'deep-relative-import', 'missing-barrel-export', 'circular-dependency']).toContain(
          violation.violationType
        );
      }
    });
  });

  describe('Circular dependency detection', () => {
    it('should not report false positives for acyclic imports', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/__tests__/audit/framework'],
      });

      const report = await audit.run();

      // Framework files should have a clean import structure
      const circularViolations = report.violations.filter(
        (v) => (v as ImportPatternViolation).violationType === 'circular-dependency'
      );

      // We expect the framework to be well-structured
      expect(circularViolations.length).toBe(0);
    });
  });

  describe('Module alias detection', () => {
    it('should recognize valid module aliases', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/__tests__/audit/code-quality'],
      });

      const report = await audit.run();

      // The audit files themselves use @core, @agents, @types imports
      expect(report.metrics?.totalImports).toBeGreaterThan(0);
      
      // Alias usage rate should be a percentage string
      expect(report.metrics?.aliasUsageRate).toMatch(/^\d+\.\d+%$/);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent directories gracefully', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['non-existent-directory'],
      });

      const report = await audit.run();

      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.totalFiles).toBe(0);
    });

    it('should skip excluded patterns', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src'],
        excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/],
      });

      const report = await audit.run();

      // Should not scan node_modules or dist
      const violations = report.violations as ImportPatternViolation[];
      const hasNodeModules = violations.some(v => v.filePath.includes('node_modules'));
      const hasDist = violations.some(v => v.filePath.includes('dist'));

      expect(hasNodeModules).toBe(false);
      expect(hasDist).toBe(false);
    });
  });

  describe('Report completeness', () => {
    it('should provide actionable suggestions for violations', async () => {
      const audit = new ImportPatternAudit({
        srcDirs: ['src/core'],
      });

      const report = await audit.run();

      // Check that violations with suggestions have them populated
      const violationsWithSuggestions = report.violations.filter(
        (v) => (v as ImportPatternViolation).suggestedCorrection
      );

      violationsWithSuggestions.forEach((v) => {
        const iv = v as ImportPatternViolation;
        expect(iv.suggestedCorrection).toBeTruthy();
        expect(iv.suggestedCorrection!.length).toBeGreaterThan(0);
      });
    });
  });
});
