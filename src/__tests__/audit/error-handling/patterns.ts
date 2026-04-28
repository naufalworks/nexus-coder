/**
 * Error Handling Pattern Checker Module
 *
 * Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
 *
 * Scans source files for error handling patterns:
 * - Try-catch blocks in async agent functions
 * - File operation error handling in core/file-writer.ts
 * - React ErrorBoundary implementation in widgets
 * - CLI exit codes (0 for success, non-zero for failure)
 * - Silent error swallowing (empty catch blocks, catch without logging)
 * - General error handling pattern checking across all modules
 *
 * @module audit/error-handling/patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Error handling violation types.
 */
export type ErrorHandlingViolationType =
  | 'missing-try-catch'
  | 'missing-error-logging'
  | 'missing-error-boundary'
  | 'invalid-exit-code'
  | 'silent-error-swallow'
  | 'empty-catch-block'
  | 'catch-without-logging'
  | 'unhandled-promise-rejection';

/**
 * Extended violation interface for error handling issues.
 */
export interface ErrorHandlingViolation extends AuditViolation {
  category: 'error-handling';
  /** Type of error handling issue */
  violationType: ErrorHandlingViolationType;
  /** Function name where issue was found */
  functionName?: string;
  /** Code snippet that triggered the violation */
  codeSnippet?: string;
}

/**
 * Configuration options for the error handling pattern checker.
 */
export interface ErrorHandlingPatternConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Check for try-catch in async functions */
  checkAsyncTryCatch: boolean;
  /** Check file operation error handling */
  checkFileOperations: boolean;
  /** Check widget error boundaries */
  checkErrorBoundaries: boolean;
  /** Check CLI exit codes */
  checkExitCodes: boolean;
  /** Check for silent error swallowing */
  checkSilentErrors: boolean;
}

/**
 * Default configuration for error handling pattern checker.
 */
const DEFAULT_CONFIG: ErrorHandlingPatternConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /__tests__/, /\.test\.tsx?$/],
  checkAsyncTryCatch: true,
  checkFileOperations: true,
  checkErrorBoundaries: true,
  checkExitCodes: true,
  checkSilentErrors: true,
};

/**
 * Logging indicators to look for in catch blocks.
 */
const LOGGING_INDICATORS = [
  'logger.',
  'console.error',
  'console.warn',
  'log(',
  'error(',
  'warn(',
  '.emit(',
  'throw',
];

/**
 * Error Handling Pattern Checker Module
 *
 * Implements the AuditModule interface to validate error handling patterns
 * across the codebase.
 *
 * @example
 * ```typescript
 * const checker = new ErrorHandlingPatternChecker();
 * const report = await checker.run();
 *
 * console.log(`Error handling violations: ${report.totalViolations}`);
 * console.log(`Critical issues: ${report.metrics?.criticalCount}`);
 * ```
 */
export class ErrorHandlingPatternChecker implements AuditModule {
  readonly category: AuditCategory = 'error-handling';
  readonly name = 'Error Handling Pattern Checker';

  private config: ErrorHandlingPatternConfig;

  /**
   * Create a new error handling pattern checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<ErrorHandlingPatternConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the error handling pattern audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: ErrorHandlingViolation[] = [];

    // Get all source files to analyze
    const files = this.getSourceFiles();

    // Analyze each file
    for (const filePath of files) {
      const fileViolations = this.analyzeFile(filePath);
      violations.push(...fileViolations);
    }

    // Calculate metrics
    const bySeverity = this.groupBySeverity(violations);
    const byType = this.groupByType(violations);

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        totalFilesScanned: files.length,
        criticalCount: bySeverity.critical,
        highCount: bySeverity.high,
        mediumCount: bySeverity.medium,
        lowCount: bySeverity.low,
        ...byType,
      },
    };

    return report;
  }

  /**
   * Get all source files to analyze.
   *
   * @returns Array of file paths
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
   * Analyze a single file for error handling violations.
   *
   * @param filePath - Path to the file
   * @returns Array of violations found
   */
  private analyzeFile(filePath: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return violations; // Skip files that can't be read
    }

    // Requirement 20.1: Check for try-catch in async agent functions
    if (this.config.checkAsyncTryCatch && filePath.includes('agents/')) {
      violations.push(...this.checkAsyncFunctionTryCatch(filePath, content));
    }

    // Requirement 20.2: Verify file operation error handling in core/file-writer.ts
    if (this.config.checkFileOperations && filePath.includes('file-writer')) {
      violations.push(...this.checkFileOperationErrorHandling(filePath, content));
    }

    // Requirement 20.3: Check widget error boundary implementation
    if (this.config.checkErrorBoundaries && filePath.includes('widgets/') && filePath.endsWith('.tsx')) {
      violations.push(...this.checkErrorBoundaries(filePath, content));
    }

    // Requirement 20.4: Verify CLI exit codes
    if (this.config.checkExitCodes && (filePath.includes('cli/') || filePath.includes('cli\\'))) {
      violations.push(...this.checkCLIExitCodes(filePath, content));
    }

    // Requirement 20.5: Detect silent error swallowing
    if (this.config.checkSilentErrors) {
      violations.push(...this.checkSilentErrorSwallowing(filePath, content));
    }

    return violations;
  }

  /**
   * Requirement 20.1: Check for try-catch in async agent functions.
   */
  private checkAsyncFunctionTryCatch(filePath: string, content: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const checkNode = (node: ts.Node) => {
      // Check async functions and methods
      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      ) {
        const functionName = this.getFunctionName(node);
        
        // Skip if function name suggests it's a test or helper
        if (functionName && (functionName.includes('test') || functionName.includes('mock'))) {
          return;
        }

        const hasTryCatch = this.containsTryCatch(node);

        if (!hasTryCatch && node.body) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          
          violations.push(this.createViolation(
            filePath,
            line + 1,
            'missing-try-catch',
            `Async function '${functionName || 'anonymous'}' should use try-catch for error handling`,
            'high',
            functionName
          ));
        }
      }

      ts.forEachChild(node, checkNode);
    };

    checkNode(sourceFile);
    return violations;
  }

  /**
   * Requirement 20.2: Check file operation error handling.
   */
  private checkFileOperationErrorHandling(filePath: string, content: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];
    const lines = content.split('\n');

    // File operations that should have error handling
    const fileOps = [
      'fs.readFileSync',
      'fs.writeFileSync',
      'fs.promises.readFile',
      'fs.promises.writeFile',
      'fs.promises.mkdir',
      'fs.promises.unlink',
      'fs.promises.access',
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        continue;
      }

      for (const op of fileOps) {
        if (line.includes(op)) {
          // Check if this line is within a try-catch block
          const inTryCatch = this.isLineInTryCatch(lines, i);

          if (!inTryCatch) {
            violations.push(this.createViolation(
              filePath,
              lineNumber,
              'missing-error-logging',
              `File operation '${op}' should be wrapped in try-catch with error handling`,
              'high',
              undefined,
              line.trim()
            ));
          }
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 20.3: Check widget error boundary implementation.
   */
  private checkErrorBoundaries(filePath: string, content: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];

    // Check if this is a main widget file (not a test or helper)
    const isMainWidget = /widgets\/[A-Z][a-zA-Z]+\.tsx$/.test(filePath);
    
    if (!isMainWidget) {
      return violations;
    }

    // Check for ErrorBoundary usage or componentDidCatch
    const hasErrorBoundary = 
      content.includes('ErrorBoundary') ||
      content.includes('componentDidCatch') ||
      content.includes('getDerivedStateFromError');

    if (!hasErrorBoundary) {
      violations.push(this.createViolation(
        filePath,
        1,
        'missing-error-boundary',
        'Widget should implement or be wrapped in an ErrorBoundary for error handling',
        'medium',
        path.basename(filePath, '.tsx')
      ));
    }

    return violations;
  }

  /**
   * Requirement 20.4: Verify CLI exit codes.
   */
  private checkCLIExitCodes(filePath: string, content: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        continue;
      }

      // Check for process.exit with invalid codes
      const exitMatch = line.match(/process\.exit\(([^)]+)\)/);
      if (exitMatch) {
        const exitCode = exitMatch[1].trim();
        
        // Check if it's a valid exit code (0, 1, 2, 3, or a variable)
        if (!/^[0-3]$/.test(exitCode) && !/^[a-zA-Z_]/.test(exitCode)) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'invalid-exit-code',
            `CLI should use standard exit codes (0 for success, 1-3 for errors), found: ${exitCode}`,
            'medium',
            undefined,
            line.trim()
          ));
        }
      }

      // Check for error handling without exit code
      if (line.includes('catch') && !content.includes('process.exit')) {
        const catchBlockEnd = this.findCatchBlockEnd(lines, i);
        const catchBlock = lines.slice(i, catchBlockEnd + 1).join('\n');
        
        if (!catchBlock.includes('process.exit') && !catchBlock.includes('throw')) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'invalid-exit-code',
            'CLI error handler should call process.exit with non-zero code or re-throw',
            'low',
            undefined,
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 20.5: Detect silent error swallowing.
   */
  private checkSilentErrorSwallowing(filePath: string, content: string): ErrorHandlingViolation[] {
    const violations: ErrorHandlingViolation[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for .catch() without handler first (before catch block check)
      if (line.includes('.catch()')) {
        violations.push(this.createViolation(
          filePath,
          lineNumber,
          'silent-error-swallow',
          'Promise .catch() called without error handler - errors will be silently swallowed',
          'high',
          undefined,
          line.trim()
        ));
        continue; // Skip catch block check for this line
      }

      // Look for catch blocks (try-catch statements)
      if (/catch\s*\(/.test(line)) {
        const catchBlockEnd = this.findCatchBlockEnd(lines, i);
        
        // If no closing brace found, it's not a valid catch block (might be .catch() method)
        if (catchBlockEnd === i) {
          continue;
        }
        
        const catchBlock = lines.slice(i, catchBlockEnd + 1).join('\n');

        // Extract content between the opening { and closing }
        const openBraceMatch = catchBlock.match(/catch\s*\([^)]*\)\s*\{/);
        if (!openBraceMatch) {
          continue;
        }

        // Get everything after the opening brace
        const afterOpenBrace = catchBlock.substring(catchBlock.indexOf('{') + 1);
        // Remove the closing brace
        const lastBraceIndex = afterOpenBrace.lastIndexOf('}');
        const catchContent = lastBraceIndex >= 0 
          ? afterOpenBrace.substring(0, lastBraceIndex)
          : afterOpenBrace;

        // Check if catch block is empty or only has comments
        const nonCommentContent = catchContent
          .split('\n')
          .filter(l => {
            const trimmed = l.trim();
            return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
          })
          .join('\n')
          .trim();

        if (!nonCommentContent) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'empty-catch-block',
            'Empty catch block silently swallows errors - add logging or re-throw',
            'high',
            undefined,
            line.trim()
          ));
          continue;
        }

        // Check if catch block has logging (excluding comments)
        const catchBlockLines = catchBlock.split('\n');
        const codeOnlyLines = catchBlockLines.filter(l => {
          const trimmed = l.trim();
          return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
        });
        const codeOnlyContent = codeOnlyLines.join('\n');
        const hasLogging = LOGGING_INDICATORS.some(indicator => codeOnlyContent.includes(indicator));

        if (!hasLogging) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'catch-without-logging',
            'Catch block should log errors or re-throw for debugging',
            'medium',
            undefined,
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Check if a node contains a try-catch block.
   */
  private containsTryCatch(node: ts.Node): boolean {
    let hasTryCatch = false;

    const checkNode = (n: ts.Node) => {
      if (ts.isTryStatement(n)) {
        hasTryCatch = true;
        return;
      }
      ts.forEachChild(n, checkNode);
    };

    checkNode(node);
    return hasTryCatch;
  }

  /**
   * Get function name from a node.
   */
  private getFunctionName(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction): string | undefined {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      return node.name.getText();
    }
    // For arrow functions, try to get the variable name
    if (ts.isArrowFunction(node) && node.parent && ts.isVariableDeclaration(node.parent)) {
      return node.parent.name.getText();
    }
    return undefined;
  }

  /**
   * Check if a line is within a try-catch block.
   */
  private isLineInTryCatch(lines: string[], lineIndex: number): boolean {
    let tryDepth = 0;
    let inTry = false;

    for (let i = lineIndex; i >= 0; i--) {
      const line = lines[i];
      
      // Count braces to track depth
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      if (line.includes('try')) {
        inTry = true;
        break;
      }
      
      tryDepth += closeBraces - openBraces;
      
      if (tryDepth < 0) {
        break;
      }
    }

    return inTry;
  }

  /**
   * Find the end of a catch block starting from a line containing 'catch'.
   */
  private findCatchBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Find the opening brace of the catch block on this line
      if (!foundOpenBrace) {
        const catchOpenBrace = line.indexOf('{', line.indexOf('catch'));
        if (catchOpenBrace >= 0) {
          foundOpenBrace = true;
          braceCount = 1;
          // Check remaining characters on this line after the opening brace
          for (let j = catchOpenBrace + 1; j < line.length; j++) {
            if (line[j] === '{') {
              braceCount++;
            } else if (line[j] === '}') {
              braceCount--;
              if (braceCount === 0) {
                return i;
              }
            }
          }
        }
        continue;
      }

      // After finding opening brace, count braces in subsequent lines
      for (const char of line) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return startIndex;
  }

  /**
   * Group violations by severity.
   */
  private groupBySeverity(violations: ErrorHandlingViolation[]): Record<string, number> {
    return {
      critical: violations.filter((v) => v.severity === 'critical').length,
      high: violations.filter((v) => v.severity === 'high').length,
      medium: violations.filter((v) => v.severity === 'medium').length,
      low: violations.filter((v) => v.severity === 'low').length,
    };
  }

  /**
   * Group violations by type.
   */
  private groupByType(violations: ErrorHandlingViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.violationType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create an error handling violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: ErrorHandlingViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    functionName?: string,
    codeSnippet?: string
  ): ErrorHandlingViolation {
    return {
      category: 'error-handling',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      functionName,
      codeSnippet,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const errorHandlingPatternChecker = new ErrorHandlingPatternChecker();
