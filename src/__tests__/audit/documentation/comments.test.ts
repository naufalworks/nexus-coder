/**
 * Unit tests for Code Comment Quality Checker
 *
 * Tests Requirements 15.1, 15.2, 15.3, 15.4
 */

import { CommentQualityChecker, CommentQualityViolation } from './comments';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('CommentQualityChecker', () => {
  let checker: CommentQualityChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    checker = new CommentQualityChecker({ srcDir: '/test/src' });
  });

  describe('Basic functionality', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('code-comments');
      expect(checker.name).toBe('Code Comment Quality Checker');
      expect(typeof checker.run).toBe('function');
    });

    it('should return empty report when source directory does not exist', async () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('Directory not found');
      });

      const report = await checker.run();

      expect(report.category).toBe('code-comments');
      expect(report.totalViolations).toBe(0);
      expect(report.violations).toEqual([]);
      expect(report.metrics?.filesChecked).toBe(0);
    });
  });

  describe('Requirement 15.1: JSDoc on exported functions', () => {
    it('should detect exported function without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export function doSomething(x: number): number {
  return x * 2;
}`;
      });

      const report = await checker.run();

      const jsdocViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-function'
      );
      expect(jsdocViolations.length).toBe(1);
      expect(jsdocViolations[0].message).toContain('doSomething');
      expect(jsdocViolations[0].severity).toBe('medium');
    });

    it('should detect exported async function without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export async function fetchData(): Promise<void> {
  // implementation
}`;
      });

      const report = await checker.run();

      const jsdocViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-function'
      );
      expect(jsdocViolations.length).toBe(1);
      expect(jsdocViolations[0].message).toContain('fetchData');
    });

    it('should detect exported const arrow function without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export const calculate = (x: number) => x * 2;`;
      });

      const report = await checker.run();

      const jsdocViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-function'
      );
      expect(jsdocViolations.length).toBe(1);
      expect(jsdocViolations[0].message).toContain('calculate');
    });

    it('should pass for exported function with JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `/**
 * Calculates something useful.
 * @param x - The input value
 * @returns The calculated result
 */
export function calculate(x: number): number {
  return x * 2;
}`;
      });

      const report = await checker.run();

      const jsdocViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-function'
      );
      expect(jsdocViolations.length).toBe(0);
    });

    it('should pass for exported function with single-line JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `/** Calculates something */
export function calculate(x: number): number {
  return x * 2;
}`;
      });

      const report = await checker.run();

      const jsdocViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-function'
      );
      expect(jsdocViolations.length).toBe(0);
    });
  });

  describe('Requirement 15.2: JSDoc on exported types', () => {
    it('should detect exported interface without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'types.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export interface Config {
  name: string;
  value: number;
}`;
      });

      const report = await checker.run();

      const typeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-type'
      );
      expect(typeViolations.length).toBe(1);
      expect(typeViolations[0].message).toContain('Config');
      expect(typeViolations[0].severity).toBe('low');
    });

    it('should detect exported type alias without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'types.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export type Result = string | number;`;
      });

      const report = await checker.run();

      const typeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-type'
      );
      expect(typeViolations.length).toBe(1);
      expect(typeViolations[0].message).toContain('Result');
    });

    it('should detect exported enum without JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'types.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export enum Status {
  Active = 'active',
  Inactive = 'inactive',
}`;
      });

      const report = await checker.run();

      const typeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-type'
      );
      expect(typeViolations.length).toBe(1);
      expect(typeViolations[0].message).toContain('Status');
    });

    it('should pass for exported interface with JSDoc', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'types.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `/**
 * Configuration interface
 */
export interface Config {
  name: string;
}`;
      });

      const report = await checker.run();

      const typeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'missing-jsdoc-type'
      );
      expect(typeViolations.length).toBe(0);
    });
  });

  describe('Requirement 15.3: Commented-out code detection', () => {
    it('should detect commented-out code blocks', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// const oldVariable = 42;
// function oldFunction() {
//   return oldVariable * 2;
// }

export function newFunction(): void {
  // implementation
}`;
      });

      const report = await checker.run();

      const codeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'commented-code'
      );
      expect(codeViolations.length).toBeGreaterThan(0);
      expect(codeViolations[0].severity).toBe('medium');
    });

    it('should not flag single-line comments', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// This is a regular comment
export function doWork(): void {
  // Another regular comment
}`;
      });

      const report = await checker.run();

      const codeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'commented-code'
      );
      expect(codeViolations.length).toBe(0);
    });

    it('should not flag TODO/FIXME/NOTE comments as commented code', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO(#123): Fix this later
// FIXME(#456): This is broken
// NOTE: Important information
// HACK: Temporary workaround
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const codeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'commented-code'
      );
      expect(codeViolations.length).toBe(0);
    });

    it('should not flag JSDoc comments as commented code', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `/// <reference types="node" />
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const codeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'commented-code'
      );
      expect(codeViolations.length).toBe(0);
    });

    it('should respect minimum lines configuration', async () => {
      const singleLineChecker = new CommentQualityChecker({
        srcDir: '/test/src',
        commentedCodeMinLines: 5,
      });

      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// const oldVariable = 42;
// function oldFunction() {
//   return oldVariable * 2;
// }
export function doWork(): void {}`;
      });

      const report = await singleLineChecker.run();

      const codeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'commented-code'
      );
      // Only 4 lines of commented code, threshold is 5
      expect(codeViolations.length).toBe(0);
    });
  });

  describe('Requirement 15.4: TODO/FIXME tracking', () => {
    it('should detect TODO without date or issue reference', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO: Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(1);
      expect(todoViolations[0].severity).toBe('low');
    });

    it('should detect FIXME without date or issue reference', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// FIXME: This is broken
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const fixmeViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(fixmeViolations.length).toBe(1);
    });

    it('should pass for TODO with date', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO(2024-01-15): Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(0);
    });

    it('should pass for TODO with issue reference', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO(#123): Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(0);
    });

    it('should pass for TODO with username reference', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO(@developer): Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(0);
    });

    it('should pass for TODO with bracket date', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO: [2024-01-15] Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(0);
    });

    it('should pass for TODO with hash issue reference', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `// TODO: #456 Fix this later
export function doWork(): void {}`;
      });

      const report = await checker.run();

      const todoViolations = report.violations.filter(
        v => (v as CommentQualityViolation).violationType === 'untracked-todo'
      );
      expect(todoViolations.length).toBe(0);
    });
  });

  describe('File filtering', () => {
    it('should exclude test files from checks', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [
            { name: 'module.test.ts', isDirectory: () => false, isFile: () => true } as any,
            { name: 'module.pbt.test.ts', isDirectory: () => false, isFile: () => true } as any,
          ];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export function test(): void {}`;
      });

      const report = await checker.run();

      // Test files should be excluded from JSDoc/other checks
      // but they still appear in filesChecked since they're found by directory scan
      // The key behavior is that no JSDoc violations are reported for test files
      const jsdocViolations = report.violations.filter(
        v => v.filePath.includes('.test.ts')
      );
      expect(jsdocViolations.length).toBe(0);
    });

    it('should only check specified extensions', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [
            { name: 'module.js', isDirectory: () => false, isFile: () => true } as any,
            { name: 'module.css', isDirectory: () => false, isFile: () => true } as any,
          ];
        }
        return [];
      });

      const report = await checker.run();

      expect(report.metrics?.filesChecked).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customChecker = new CommentQualityChecker({
        srcDir: '/custom/src',
        extensions: ['.ts'],
        checkFunctionJSDoc: false,
        checkTypeJSDoc: false,
        checkCommentedCode: true,
        checkTodoFixme: true,
      });

      expect(customChecker).toBeDefined();
    });

    it('should respect disabled checks', async () => {
      const disabledChecker = new CommentQualityChecker({
        srcDir: '/test/src',
        checkFunctionJSDoc: false,
        checkTypeJSDoc: false,
        checkCommentedCode: false,
        checkTodoFixme: false,
      });

      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export function noJSDoc(): void {}
// TODO: untracked
`;
      });

      const report = await disabledChecker.run();

      expect(report.totalViolations).toBe(0);
    });
  });

  describe('Report metrics', () => {
    it('should include correct metrics', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export function test(): void {}`;
      });

      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.filesChecked).toBe(1);
      expect(report.metrics?.totalExportedFunctions).toBeDefined();
      expect(report.metrics?.totalExportedTypes).toBeDefined();
    });

    it('should group violations by severity', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath === '/test/src') {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readdirSync.mockImplementation((dirPath: any) => {
        if (dirPath === '/test/src') {
          return [{ name: 'module.ts', isDirectory: () => false, isFile: () => true } as any];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation(() => {
        return `export function test(): void {}`;
      });

      const report = await checker.run();

      const totalBySeverity =
        (report.metrics?.criticalCount as number) +
        (report.metrics?.highCount as number) +
        (report.metrics?.mediumCount as number) +
        (report.metrics?.lowCount as number);

      expect(totalBySeverity).toBe(report.totalViolations);
    });
  });
});
