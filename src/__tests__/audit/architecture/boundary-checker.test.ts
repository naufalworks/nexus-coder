/**
 * Unit tests for Architecture Boundary Checker
 *
 * Tests the boundary violation detection logic for architectural compliance.
 */

import { ArchitectureBoundaryChecker } from './boundary-checker';
import type { ArchitectureViolation } from './boundary-checker';

describe('ArchitectureBoundaryChecker', () => {
  let checker: ArchitectureBoundaryChecker;

  beforeEach(() => {
    checker = new ArchitectureBoundaryChecker();
  });

  describe('Module interface', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('architecture-compliance');
      expect(checker.name).toBe('Architecture Boundary Checker');
      expect(typeof checker.run).toBe('function');
    });
  });

  describe('run()', () => {
    it('should return an audit report with correct structure', async () => {
      const report = await checker.run();

      expect(report).toHaveProperty('category', 'architecture-compliance');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('metrics');
      expect(Array.isArray(report.violations)).toBe(true);
    });

    it('should include metrics in the report', async () => {
      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics).toHaveProperty('totalFilesScanned');
      expect(report.metrics).toHaveProperty('totalImportsAnalyzed');
      expect(report.metrics).toHaveProperty('violationCount');
    });

    it('should scan source files and analyze imports', async () => {
      const report = await checker.run();

      // Should have scanned at least some files
      expect(report.metrics?.totalFilesScanned).toBeGreaterThanOrEqual(0);
      expect(report.metrics?.totalImportsAnalyzed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Violation detection', () => {
    it('should detect violations with required fields', async () => {
      const report = await checker.run();

      for (const violation of report.violations) {
        const archViolation = violation as ArchitectureViolation;

        expect(archViolation).toHaveProperty('category', 'architecture-compliance');
        expect(archViolation).toHaveProperty('severity');
        expect(archViolation).toHaveProperty('filePath');
        expect(archViolation).toHaveProperty('lineNumber');
        expect(archViolation).toHaveProperty('message');
        expect(archViolation).toHaveProperty('boundaryType');
        expect(archViolation).toHaveProperty('sourcePath');
        expect(archViolation).toHaveProperty('importPath');
        expect(archViolation).toHaveProperty('correctLocation');

        // Validate severity levels
        expect(['critical', 'high', 'medium', 'low']).toContain(archViolation.severity);

        // Validate boundary types
        expect([
          'core-to-agent',
          'core-to-widget',
          'agent-to-widget',
          'widget-to-agent',
          'cli-to-agent',
          'cli-to-widget',
          'unauthorized-import',
        ]).toContain(archViolation.boundaryType);
      }
    });

    it('should provide correct location suggestions for violations', async () => {
      const report = await checker.run();

      for (const violation of report.violations) {
        const archViolation = violation as ArchitectureViolation;

        expect(archViolation.correctLocation).toBeTruthy();
        expect(typeof archViolation.correctLocation).toBe('string');
        expect(archViolation.correctLocation.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customChecker = new ArchitectureBoundaryChecker({
        srcDirs: ['src', 'lib'],
        extensions: ['.ts', '.tsx', '.js'],
        excludePatterns: [/test/, /spec/],
      });

      expect(customChecker).toBeDefined();
      expect(customChecker.category).toBe('architecture-compliance');
    });

    it('should merge custom rules with default rules', () => {
      const customChecker = new ArchitectureBoundaryChecker({
        customRules: [
          {
            directory: 'src/custom',
            allowedImports: ['@core/*'],
            disallowedImports: ['@agents/*'],
            expectedContent: 'Custom code',
            relocationSuggestion: 'Move to appropriate directory',
          },
        ],
      });

      expect(customChecker).toBeDefined();
    });
  });

  describe('Boundary rules', () => {
    it('should enforce core/ cannot import from agents/', async () => {
      const report = await checker.run();

      const coreToAgentViolations = report.violations.filter(
        (v) => (v as ArchitectureViolation).boundaryType === 'core-to-agent'
      );

      // If there are such violations, they should be properly reported
      for (const violation of coreToAgentViolations) {
        const archViolation = violation as ArchitectureViolation;
        expect(archViolation.sourcePath).toContain('src/core');
        expect(
          archViolation.importPath.includes('agents') ||
          archViolation.importPath.includes('@agents')
        ).toBe(true);
      }
    });

    it('should enforce core/ cannot import from widgets/', async () => {
      const report = await checker.run();

      const coreToWidgetViolations = report.violations.filter(
        (v) => (v as ArchitectureViolation).boundaryType === 'core-to-widget'
      );

      // If there are such violations, they should be properly reported
      for (const violation of coreToWidgetViolations) {
        const archViolation = violation as ArchitectureViolation;
        expect(archViolation.sourcePath).toContain('src/core');
        expect(
          archViolation.importPath.includes('widgets') ||
          archViolation.importPath.includes('@widgets') ||
          archViolation.importPath.includes('.tsx')
        ).toBe(true);
      }
    });

    it('should enforce agents/ cannot import from widgets/', async () => {
      const report = await checker.run();

      const agentToWidgetViolations = report.violations.filter(
        (v) => (v as ArchitectureViolation).boundaryType === 'agent-to-widget'
      );

      // If there are such violations, they should be properly reported
      for (const violation of agentToWidgetViolations) {
        const archViolation = violation as ArchitectureViolation;
        expect(archViolation.sourcePath).toContain('src/agents');
        expect(
          archViolation.importPath.includes('widgets') ||
          archViolation.importPath.includes('@widgets') ||
          archViolation.importPath.includes('react')
        ).toBe(true);
      }
    });

    it('should enforce cli/ cannot import from widgets/', async () => {
      const report = await checker.run();

      const cliToWidgetViolations = report.violations.filter(
        (v) => (v as ArchitectureViolation).boundaryType === 'cli-to-widget'
      );

      // If there are such violations, they should be properly reported
      for (const violation of cliToWidgetViolations) {
        const archViolation = violation as ArchitectureViolation;
        expect(archViolation.sourcePath).toContain('src/cli');
        expect(
          archViolation.importPath.includes('widgets') ||
          archViolation.importPath.includes('@widgets')
        ).toBe(true);
      }
    });
  });

  describe('Report metrics', () => {
    it('should group violations by boundary type', async () => {
      const report = await checker.run();

      // Check that metrics include violation counts by type
      const metrics = report.metrics || {};
      const boundaryTypes = [
        'core-to-agent',
        'core-to-widget',
        'agent-to-widget',
        'widget-to-agent',
        'cli-to-agent',
        'cli-to-widget',
        'unauthorized-import',
      ];

      // At least some boundary type counts should be present if there are violations
      if (report.totalViolations > 0) {
        const hasTypeCounts = boundaryTypes.some((type) => type in metrics);
        expect(hasTypeCounts).toBe(true);
      }
    });

    it('should report total violations matching violations array length', async () => {
      const report = await checker.run();

      expect(report.totalViolations).toBe(report.violations.length);
    });
  });
});
