/**
 * Dead Code Detector Unit Tests
 *
 * Tests the DeadCodeDetector class for correct identification of
 * unused exports, byte estimation, and report generation.
 *
 * @module audit/dead-code/detector.test
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeadCodeDetector } from './detector';
import type { DeadCodeViolation, UnusedExport } from './detector';

/**
 * Helper to create a temporary directory with test source files.
 */
function createTestProject(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-test-'));

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return tmpDir;
}

/**
 * Helper to clean up a temporary directory.
 */
function cleanupTestProject(tmpDir: string): void {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('DeadCodeDetector', () => {
  describe('basic properties', () => {
    it('should have correct category and name', () => {
      const detector = new DeadCodeDetector();
      expect(detector.category).toBe('dead-code');
      expect(detector.name).toBe('Dead Code Detector');
    });
  });

  describe('unused export detection', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should detect an unused exported function', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function usedFunction(): string {
  return 'used';
}

export function unusedFunction(): string {
  return 'unused';
}
`,
        'src/consumer.ts': `
import { usedFunction } from './utils';

export function consumer(): string {
  return usedFunction();
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      // unusedFunction should be detected as unused (not imported by consumer.ts)
      const unusedViolations = report.violations.filter(
        (v) => v.symbolName === 'unusedFunction'
      );
      expect(unusedViolations.length).toBeGreaterThan(0);
    });

    it('should NOT flag an exported function that is imported', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function usedEverywhere(): string {
  return 'used';
}
`,
        'src/consumer.ts': `
import { usedEverywhere } from './utils';

export function consumer(): string {
  return usedEverywhere();
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const usedViolations = report.violations.filter(
        (v) => v.symbolName === 'usedEverywhere'
      );
      expect(usedViolations).toHaveLength(0);
    });

    it('should detect unused exported interfaces', async () => {
      tmpDir = createTestProject({
        'src/types.ts': `
export interface UsedType {
  name: string;
}

export interface UnusedType {
  value: number;
  label: string;
  description: string;
}
`,
        'src/consumer.ts': `
import type { UsedType } from './types';

export function process(data: UsedType): string {
  return data.name;
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const unusedTypeViolations = report.violations.filter(
        (v) => v.symbolName === 'UnusedType'
      );
      expect(unusedTypeViolations.length).toBeGreaterThan(0);
    });

    it('should detect unused exported types', async () => {
      tmpDir = createTestProject({
        'src/types.ts': `
export type UsedAlias = string;
export type UnusedAlias = number | string | boolean;
`,
        'src/consumer.ts': `
import type { UsedAlias } from './types';

export function process(data: UsedAlias): string {
  return data;
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const unusedTypeViolations = report.violations.filter(
        (v) => v.symbolName === 'UnusedAlias'
      );
      expect(unusedTypeViolations.length).toBeGreaterThan(0);
    });

    it('should detect unused exported classes', async () => {
      tmpDir = createTestProject({
        'src/classes.ts': `
export class UsedClass {
  constructor(public name: string) {}
}

export class UnusedClass {
  constructor(public value: number) {}
  method(): string {
    return String(this.value);
  }
}
`,
        'src/consumer.ts': `
import { UsedClass } from './classes';

export function process(): UsedClass {
  return new UsedClass('test');
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const unusedClassViolations = report.violations.filter(
        (v) => v.symbolName === 'UnusedClass'
      );
      expect(unusedClassViolations.length).toBeGreaterThan(0);
    });

    it('should detect unused exported variables', async () => {
      tmpDir = createTestProject({
        'src/constants.ts': `
export const USED_CONSTANT = 'used';
export const UNUSED_CONSTANT = 'unused';
export const ANOTHER_UNUSED = 42;
`,
        'src/consumer.ts': `
import { USED_CONSTANT } from './constants';

export function getValue(): string {
  return USED_CONSTANT;
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const unusedConstViolations = report.violations.filter(
        (v) => v.symbolName === 'UNUSED_CONSTANT' || v.symbolName === 'ANOTHER_UNUSED'
      );
      expect(unusedConstViolations.length).toBeGreaterThan(0);
    });
  });

  describe('violation details', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should include symbol name in violations (Requirement 2.5)', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function deadFunction(): string {
  return 'dead';
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as DeadCodeViolation;
      expect(violation.symbolName).toBeDefined();
      expect(violation.symbolName).toBeTruthy();
    });

    it('should include file path in violations (Requirement 2.5)', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function deadFunction(): string {
  return 'dead';
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0];
      expect(violation.filePath).toBeDefined();
      expect(violation.filePath).toContain('utils.ts');
    });

    it('should include line number in violations (Requirement 2.5)', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function deadFunction(): string {
  return 'dead';
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0];
      expect(violation.lineNumber).toBeGreaterThan(0);
      expect(typeof violation.lineNumber).toBe('number');
    });

    it('should include estimated bytes saved (Requirement 2.5)', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function deadFunction(): string {
  return 'dead';
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as DeadCodeViolation;
      expect(violation.estimatedBytesSaved).toBeGreaterThan(0);
    });
  });

  describe('report metrics (Requirement 2.6)', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should produce dead symbol count report', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function unusedA(): string { return 'a'; }
export function unusedB(): string { return 'b'; }
export function unusedC(): string { return 'c'; }
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBeGreaterThan(0);
      expect(report.metrics).toBeDefined();
      expect(report.metrics?.unusedExportCount).toBeGreaterThan(0);
    });

    it('should include estimated bundle size reduction', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function unusedFunction(): string {
  const x = 1;
  const y = 2;
  return String(x + y);
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.estimatedBundleReduction).toBeDefined();
      expect(typeof report.estimatedBundleReduction).toBe('string');
      // Should contain a number and unit (B, KB, or MB)
      expect(report.estimatedBundleReduction).toMatch(/^\d+(\.\d+)?(B|KB|MB)$/);
    });

    it('should report total exports and total files in metrics', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function usedFn(): string { return 'used'; }
export function unusedFn(): string { return 'unused'; }
`,
        'src/consumer.ts': `
import { usedFn } from './utils';
export function consumer(): string { return usedFn(); }
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.metrics?.totalFiles).toBeGreaterThan(0);
      expect(report.metrics?.totalExports).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should handle an empty source directory', async () => {
      tmpDir = createTestProject({
        'src/empty.ts': '',
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      expect(report.totalViolations).toBe(0);
      expect(report.category).toBe('dead-code');
    });

    it('should handle a non-existent source directory', async () => {
      const detector = new DeadCodeDetector({
        srcDirs: ['/nonexistent/path'],
      });
      const report = await detector.run();

      // Should not throw, returns a report (possibly empty or with error)
      expect(report).toBeDefined();
      expect(report.category).toBe('dead-code');
    });

    it('should not flag symbols used in other source files', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function helper(): string {
  return 'helper';
}
`,
        'src/consumer.ts': `
import { helper } from './utils';

export function useHelper(): string {
  return helper();
}
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const helperViolations = report.violations.filter(
        (v) => v.symbolName === 'helper'
      );
      expect(helperViolations).toHaveLength(0);
    });

    it('should produce violations with correct category', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function unusedFn(): string { return 'unused'; }
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      for (const violation of report.violations) {
        expect(violation.category).toBe('dead-code');
      }
    });

    it('should produce violations with valid severity levels', async () => {
      tmpDir = createTestProject({
        'src/utils.ts': `
export function unusedFn(): string { return 'unused'; }
`,
      });

      const detector = new DeadCodeDetector({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await detector.run();

      const validSeverities = ['critical', 'high', 'medium', 'low'];
      for (const violation of report.violations) {
        expect(validSeverities).toContain(violation.severity);
      }
    });
  });
});
