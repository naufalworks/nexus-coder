/**
 * TypeScript Strict Mode Audit Module
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6
 *
 * Scans source files for TypeScript strict mode violations:
 * - @ts-ignore and @ts-expect-error suppression comments
 * - Explicit `any` type annotations
 * - TypeScript compilation errors using tsc --noEmit
 *
 * Calculates Type_Safety_Score as percentage of files passing all checks.
 *
 * @module audit/code-quality/typescript-strict
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Violation types for TypeScript strict mode issues.
 */
export type TypeScriptViolationType =
  | 'ts-ignore'
  | 'ts-expect-error'
  | 'explicit-any'
  | 'any-assertion'
  | 'compilation-error';

/**
 * Extended violation interface for TypeScript strict mode.
 */
export interface TypeScriptStrictViolation extends AuditViolation {
  category: 'typescript-strict';
  /** Type of strict mode violation */
  violationType: TypeScriptViolationType;
}

/**
 * Configuration options for the TypeScript strict mode audit.
 */
export interface TypeScriptStrictConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Check for @ts-ignore comments (default: true) */
  checkTsIgnore: boolean;
  /** Check for @ts-expect-error comments (default: true) */
  checkTsExpectError: boolean;
  /** Check for explicit any types (default: true) */
  checkExplicitAny: boolean;
  /** Run TypeScript compilation check (default: true) */
  runCompilation: boolean;
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for TypeScript strict mode audit.
 */
const DEFAULT_CONFIG: TypeScriptStrictConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  checkTsIgnore: true,
  checkTsExpectError: true,
  checkExplicitAny: true,
  runCompilation: true,
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/],
};

/**
 * File result containing pass/fail status for a single file.
 */
interface FileResult {
  filePath: string;
  passed: boolean;
  violations: TypeScriptStrictViolation[];
}

/**
 * TypeScript Strict Mode Audit Module
 *
 * Implements the AuditModule interface to scan source files for TypeScript
 * strict mode violations and calculate a Type_Safety_Score.
 *
 * @example
 * ```typescript
 * const audit = new TypeScriptStrictAudit();
 * const report = await audit.run();
 *
 * console.log(`Type Safety Score: ${report.metrics?.typeSafetyScore}%`);
 * console.log(`Files passing: ${report.metrics?.filesPassing}/${report.metrics?.totalFiles}`);
 * ```
 */
export class TypeScriptStrictAudit implements AuditModule {
  readonly category: AuditCategory = 'typescript-strict';
  readonly name = 'TypeScript Strict Mode Audit';

  private config: TypeScriptStrictConfig;

  /**
   * Create a new TypeScript strict mode audit instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<TypeScriptStrictConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the TypeScript strict mode audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const allViolations: TypeScriptStrictViolation[] = [];
    const fileResults: FileResult[] = [];

    // Get all source files to scan
    const files = this.getSourceFiles();

    // Scan each file for violations
    for (const file of files) {
      const violations = this.checkFile(file);
      fileResults.push({
        filePath: file,
        passed: violations.length === 0,
        violations,
      });
      allViolations.push(...violations);
    }

    // Run TypeScript compilation check if enabled
    if (this.config.runCompilation) {
      const compileViolations = this.runTypeScriptCompilation();
      allViolations.push(...compileViolations);

      // Update file results with compilation errors
      for (const violation of compileViolations) {
        const fileResult = fileResults.find((r) => r.filePath === violation.filePath);
        if (fileResult) {
          fileResult.passed = false;
          fileResult.violations.push(violation);
        }
      }
    }

    // Calculate Type_Safety_Score
    const totalFiles = files.length;
    const filesPassing = fileResults.filter((r) => r.passed).length;
    const typeSafetyScore = totalFiles > 0 ? (filesPassing / totalFiles) * 100 : 100;

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: allViolations.length,
      violations: allViolations,
      metrics: {
        totalFiles,
        filesPassing,
        filesFailing: totalFiles - filesPassing,
        typeSafetyScore: Math.round(typeSafetyScore * 100) / 100,
        tsIgnoreCount: allViolations.filter((v) => v.violationType === 'ts-ignore').length,
        tsExpectErrorCount: allViolations.filter((v) => v.violationType === 'ts-expect-error').length,
        explicitAnyCount: allViolations.filter((v) => v.violationType === 'explicit-any').length,
        compilationErrorCount: allViolations.filter((v) => v.violationType === 'compilation-error').length,
      },
    };

    return report;
  }

  /**
   * Get all source files to scan based on configuration.
   *
   * @returns Array of file paths to scan
   */
  private getSourceFiles(): string[] {
    const files: string[] = [];

    for (const dir of this.config.srcDirs) {
      if (!fs.existsSync(dir)) continue;
      this.walkDirectory(dir, files);
    }

    return files;
  }

  /**
   * Recursively walk a directory and collect source files.
   *
   * @param dir - Directory to walk
   * @param files - Array to collect file paths
   */
  private walkDirectory(dir: string, files: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip excluded patterns
      if (this.config.excludePatterns.some((pattern) => pattern.test(fullPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.config.extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  /**
   * Check a single file for TypeScript strict mode violations.
   *
   * @param filePath - Path to the file to check
   * @returns Array of violations found in the file
   */
  private checkFile(filePath: string): TypeScriptStrictViolation[] {
    const violations: TypeScriptStrictViolation[] = [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return violations; // Skip files that can't be read
    }

    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Skip comment-only lines for any checks
      const trimmedLine = line.trim();

      // Check for @ts-ignore
      if (this.config.checkTsIgnore && this.containsTsIgnore(line)) {
        violations.push(this.createViolation(
          filePath,
          lineNumber,
          'ts-ignore',
          'Use of @ts-ignore suppression comment'
        ));
      }

      // Check for @ts-expect-error
      if (this.config.checkTsExpectError && this.containsTsExpectError(line)) {
        violations.push(this.createViolation(
          filePath,
          lineNumber,
          'ts-expect-error',
          'Use of @ts-expect-error suppression comment'
        ));
      }

      // Check for explicit any types
      if (this.config.checkExplicitAny) {
        const anyViolations = this.checkForExplicitAny(filePath, lineNumber, line, trimmedLine);
        violations.push(...anyViolations);
      }
    });

    return violations;
  }

  /**
   * Check if a line contains @ts-ignore (not in a string literal).
   */
  private containsTsIgnore(line: string): boolean {
    // Check for @ts-ignore in a comment context
    const tsIgnorePattern = /\/\/\s*@ts-ignore|\/\*[\s\S]*?@ts-ignore[\s\S]*?\*\//;
    return tsIgnorePattern.test(line);
  }

  /**
   * Check if a line contains @ts-expect-error (not in a string literal).
   */
  private containsTsExpectError(line: string): boolean {
    // Check for @ts-expect-error in a comment context
    const tsExpectErrorPattern = /\/\/\s*@ts-expect-error|\/\*[\s\S]*?@ts-expect-error[\s\S]*?\*\//;
    return tsExpectErrorPattern.test(line);
  }

  /**
   * Check a line for explicit `any` type annotations.
   */
  private checkForExplicitAny(
    filePath: string,
    lineNumber: number,
    line: string,
    trimmedLine: string
  ): TypeScriptStrictViolation[] {
    const violations: TypeScriptStrictViolation[] = [];

    // Skip comment lines
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
      return violations;
    }

    // Remove string literals to avoid false positives
    const lineWithoutStrings = this.removeStringLiterals(line);

    // Remove comment portions
    const codePortion = lineWithoutStrings.split('//')[0];

    // Pattern: variable declaration with any type
    // Matches: varName: any, varName: any[], varName: any | other
    const explicitAnyPattern = /:\s*any\b(?!\s*\.)/;

    // Pattern: any assertion
    // Matches: as any, <any>expression
    const anyAssertionPattern = /\bas\s+any\b|<any>/;

    // Check for explicit any type annotation (but allow `any.` which is a method call)
    if (explicitAnyPattern.test(codePortion)) {
      // Exclude legitimate patterns
      if (!this.isLegitimateAnyUsage(codePortion)) {
        violations.push(this.createViolation(
          filePath,
          lineNumber,
          'explicit-any',
          'Explicit any type annotation detected'
        ));
      }
    }

    // Check for any type assertion
    if (anyAssertionPattern.test(codePortion)) {
      violations.push(this.createViolation(
        filePath,
        lineNumber,
        'any-assertion',
        'Type assertion to any detected'
      ));
    }

    return violations;
  }

  /**
   * Remove string literals from a line to avoid false positives.
   */
  private removeStringLiterals(line: string): string {
    // Replace content in single quotes, double quotes, and template literals
    return line
      .replace(/'[^']*'/g, '""')
      .replace(/"[^"]*"/g, '""')
      .replace(/`[^`]*`/g, '""');
  }

  /**
   * Check if an `any` usage is legitimate (e.g., in a JSDoc comment or test).
   */
  private isLegitimateAnyUsage(codePortion: string): boolean {
    // Allow `any` in type parameters like Array<any> or Map<string, any>
    // These are sometimes necessary for third-party library compatibility
    if (/<[^>]*,\s*any\s*>/.test(codePortion) || /<\s*any\s*>/.test(codePortion)) {
      // Check if it's explicitly marked as intentional
      return codePortion.includes('// any is ok') || codePortion.includes('// intentional any');
    }

    return false;
  }

  /**
   * Run TypeScript compilation check.
   *
   * @returns Array of compilation error violations
   */
  private runTypeScriptCompilation(): TypeScriptStrictViolation[] {
    const violations: TypeScriptStrictViolation[] = [];

    try {
      execSync('npx tsc --noEmit --strict', {
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string };
      const output = execError.stdout || execError.stderr || '';

      // Parse TypeScript compilation errors
      const errorLines = output.split('\n');

      for (const line of errorLines) {
        // Match error format: file.ts(line,col): error TSXXXX: message
        const match = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/);
        if (match) {
          const [, filePath, lineNum, errorCode, message] = match;
          violations.push(this.createViolation(
            filePath,
            parseInt(lineNum, 10),
            'compilation-error',
            `${errorCode}: ${message}`,
            'critical'
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Create a TypeScript strict mode violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: TypeScriptViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'high'
  ): TypeScriptStrictViolation {
    return {
      category: 'typescript-strict',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const typescriptStrictAudit = new TypeScriptStrictAudit();
