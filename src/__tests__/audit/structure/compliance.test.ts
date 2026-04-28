/**
 * Structure Compliance Checker Tests
 *
 * Unit tests for the structure compliance checker module.
 * Validates detection of structural deviations against expected project structure.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { StructureComplianceChecker, StructureViolation } from './compliance';
import * as fs from 'fs';
import * as path from 'path';

describe('StructureComplianceChecker', () => {
  let checker: StructureComplianceChecker;

  beforeEach(() => {
    checker = new StructureComplianceChecker();
  });

  describe('Module Interface', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('project-structure');
      expect(checker.name).toBe('Structure Compliance Checker');
      expect(typeof checker.run).toBe('function');
    });

    it('should return a valid audit report', async () => {
      const report = await checker.run();

      expect(report).toHaveProperty('category', 'project-structure');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('metrics');
      expect(Array.isArray(report.violations)).toBe(true);
    });
  });

  describe('Required Directory Detection (Requirement 12.2)', () => {
    it('should detect missing required directories', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'missing-dirs');

      // Create a minimal structure missing src/agents
      const partialStructure = path.join(testDir, 'src', 'core');
      fs.mkdirSync(partialStructure, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), '');

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        const missingDirViolations = report.violations.filter(
          (v) => (v as StructureViolation).violationType === 'missing-directory'
        );

        expect(missingDirViolations.length).toBeGreaterThan(0);
        expect(missingDirViolations.some((v) => v.message.includes('agents'))).toBe(true);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should detect missing required subdirectories', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'missing-subdirs');

      // Create src/core but without required subdirectories
      const coreDir = path.join(testDir, 'src', 'core');
      fs.mkdirSync(coreDir, { recursive: true });
      // Create stub files for other expected dirs
      fs.mkdirSync(path.join(testDir, 'src', 'agents', 'orchestrator'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'src', 'agents', 'specialized'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'src', 'widgets'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'src', 'cli'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'src', 'types'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'src', '__tests__'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), '');

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        const missingSubdirViolations = report.violations.filter(
          (v) =>
            (v as StructureViolation).violationType === 'missing-directory' &&
            v.message.includes('context')
        );

        expect(missingSubdirViolations.length).toBeGreaterThan(0);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should pass when all required directories exist', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'complete-dirs');
      createFullStructure(testDir);

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        const missingDirViolations = report.violations.filter(
          (v) => (v as StructureViolation).violationType === 'missing-directory'
        );

        expect(missingDirViolations.length).toBe(0);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Expected File Verification (Requirement 12.3)', () => {
    it('should detect missing expected files', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'missing-files');
      createFullStructure(testDir);
      // Don't add any files - they should all be reported missing

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        const missingFileViolations = report.violations.filter(
          (v) => (v as StructureViolation).violationType === 'missing-expected-file'
        );

        expect(missingFileViolations.length).toBeGreaterThan(0);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should pass when all expected files exist', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'complete-files');
      createFullStructure(testDir);
      createAllExpectedFiles(testDir);

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        expect(report.totalViolations).toBe(0);
        expect(report.metrics?.complianceScore).toBe(100);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Structural Deviation Reporting (Requirement 12.4)', () => {
    it('should include recommended actions in violations', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'deviation-report');
      const partialDir = path.join(testDir, 'src');
      fs.mkdirSync(partialDir, { recursive: true });

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        for (const violation of report.violations) {
          const structViolation = violation as StructureViolation;
          expect(structViolation.recommendedAction).toBeDefined();
          expect(['create', 'move', 'delete', 'rename', 'verify']).toContain(
            structViolation.recommendedAction
          );
        }
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should include expected path in violations', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'expected-paths');
      const partialDir = path.join(testDir, 'src');
      fs.mkdirSync(partialDir, { recursive: true });

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        for (const violation of report.violations) {
          const structViolation = violation as StructureViolation;
          expect(structViolation.expectedPath).toBeDefined();
        }
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should set correct severity levels', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'severity-check');
      const partialDir = path.join(testDir, 'src');
      fs.mkdirSync(partialDir, { recursive: true });

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        // Missing top-level required dirs should be 'high'
        const highViolations = report.violations.filter(
          (v) => v.severity === 'high'
        );
        expect(highViolations.length).toBeGreaterThan(0);

        // All violations should have valid severity
        for (const violation of report.violations) {
          expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
        }
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('General Project Structure Validation (Requirement 12.5)', () => {
    it('should calculate compliance score correctly', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__', 'compliance-score');
      createFullStructure(testDir);
      // Only create some files - not all
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), '');

      try {
        const customChecker = new StructureComplianceChecker({ rootDir: testDir });
        const report = await customChecker.run();

        expect(report.metrics?.complianceScore).toBeGreaterThan(0);
        expect(report.metrics?.complianceScore).toBeLessThan(100);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should include metrics for directories and files checked', async () => {
      const report = await checker.run();

      expect(report.metrics).toHaveProperty('directoriesChecked');
      expect(report.metrics).toHaveProperty('filesChecked');
      expect(report.metrics).toHaveProperty('totalChecks');
      expect(report.metrics).toHaveProperty('passedChecks');
      expect(report.metrics).toHaveProperty('complianceScore');

      expect(typeof report.metrics?.directoriesChecked).toBe('number');
      expect(typeof report.metrics?.filesChecked).toBe('number');
      expect(typeof report.metrics?.totalChecks).toBe('number');
      expect(typeof report.metrics?.passedChecks).toBe('number');
      expect(typeof report.metrics?.complianceScore).toBe('number');
    });

    it('should include severity counts in metrics', async () => {
      const report = await checker.run();

      expect(report.metrics).toHaveProperty('criticalCount');
      expect(report.metrics).toHaveProperty('highCount');
      expect(report.metrics).toHaveProperty('mediumCount');
      expect(report.metrics).toHaveProperty('lowCount');

      expect(typeof report.metrics?.criticalCount).toBe('number');
      expect(typeof report.metrics?.highCount).toBe('number');
      expect(typeof report.metrics?.mediumCount).toBe('number');
      expect(typeof report.metrics?.lowCount).toBe('number');
    });
  });

  describe('Configuration', () => {
    it('should respect custom root directory', async () => {
      const customChecker = new StructureComplianceChecker({
        rootDir: 'nonexistent-root-dir',
      });

      const report = await customChecker.run();
      // All directories should be reported missing
      expect(report.totalViolations).toBeGreaterThan(0);
      const missingDirs = report.violations.filter(
        (v) => (v as StructureViolation).violationType === 'missing-directory'
      );
      expect(missingDirs.length).toBeGreaterThan(0);
    });

    it('should work with default configuration on actual project', async () => {
      const report = await checker.run();

      // The actual project should have a fairly high compliance score
      expect(report.metrics?.complianceScore).toBeGreaterThan(50);
    });
  });
});

/**
 * Helper: Create the full expected directory structure.
 */
function createFullStructure(baseDir: string): void {
  const dirs = [
    'src',
    'src/core',
    'src/core/context',
    'src/core/context/graph',
    'src/core/context/compression',
    'src/core/context/memory',
    'src/core/context/budget',
    'src/core/git',
    'src/core/models',
    'src/core/store',
    'src/agents',
    'src/agents/orchestrator',
    'src/agents/specialized',
    'src/widgets',
    'src/cli',
    'src/types',
    'src/__tests__',
    'src/__tests__/accessibility',
    'src/__tests__/audit',
    'src/__tests__/e2e',
    'src/__tests__/helpers',
    'src/__tests__/integration',
    'src/__tests__/performance',
    'src/__tests__/security',
    'src/__tests__/types',
    'src/__tests__/visual',
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
  }
}

/**
 * Helper: Create all expected files for a fully compliant structure.
 */
function createAllExpectedFiles(baseDir: string): void {
  const files: Record<string, string[]> = {
    'src': ['index.ts', 'index.tsx'],
    'src/core': ['config.ts', 'event-bus.ts', 'file-writer.ts', 'git-manager.ts', 'logger.ts'],
    'src/core/context': ['engine.ts'],
    'src/core/context/graph': ['semantic-graph.ts', 'traversal.ts', 'types.ts'],
    'src/core/context/compression': ['compressor.ts', 'ast-compress.ts'],
    'src/core/context/memory': ['persistent.ts', 'decisions.ts', 'patterns.ts'],
    'src/core/context/budget': ['token-budget.ts', 'adaptive.ts'],
    'src/core/models': ['unified-client.ts', 'router.ts', 'types.ts'],
    'src/core/store': ['vector-store.ts', 'embeddings.ts'],
    'src/agents': ['registry.ts'],
    'src/agents/orchestrator': ['orchestrator.ts', 'planner.ts'],
    'src/agents/specialized': ['context-agent.ts', 'coder-agent.ts', 'reviewer-agent.ts', 'git-agent.ts'],
    'src/cli': ['index.ts', 'commands.ts', 'interactive.ts', 'approval-ui.ts'],
    'src/widgets': [
      'index.ts',
      'IDEShell.tsx',
      'TaskPanel.tsx',
      'DiffApproval.tsx',
      'GraphExplorer.tsx',
      'ReasoningLog.tsx',
      'InContextActions.tsx',
      'AgentStatus.tsx',
      'ResourceFooter.tsx',
      'WidgetSystem.tsx',
    ],
    'src/types': ['index.ts', 'agent.ts', 'config.ts', 'graph.ts', 'task.ts'],
  };

  for (const [dir, fileNames] of Object.entries(files)) {
    for (const fileName of fileNames) {
      fs.writeFileSync(path.join(baseDir, dir, fileName), '// test file\n');
    }
  }
}
