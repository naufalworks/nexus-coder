/**
 * Code Comment Quality Checker Module
 *
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
 *
 * Checks code comment quality across the codebase:
 * - JSDoc presence on public API functions
 * - JSDoc presence on exported types
 * - Detection of commented-out code blocks
 * - TODO/FIXME include date or issue reference
 * - General code comment quality validation
 *
 * @module audit/documentation/comments
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditModule, AuditReport, AuditViolation } from '../framework/types';

/**
 * Comment violation types.
 */
export type CommentViolationType =
  | 'missing-jsdoc-function'
  | 'missing-jsdoc-type'
  | 'commented-code'
  | 'untracked-todo'
  | 'untracked-fixme';

/**
 * Extended violation interface for comment quality issues.
 */
export interface CommentQualityViolation extends AuditViolation {
  category: 'code-comments';
  /** Type of comment issue */
  violationType: CommentViolationType;
  /** Code snippet for context */
  snippet?: string;
}

/**
 * Configuration options for the code comment quality checker.
 */
export interface CommentQualityConfig {
  /** Root directory to scan (default: 'src') */
  srcDir: string;
  /** File extensions to check */
  extensions: string[];
  /** Patterns to exclude */
  excludePatterns: RegExp[];
  /** Whether to check JSDoc on functions */
  checkFunctionJSDoc: boolean;
  /** Whether to check JSDoc on types */
  checkTypeJSDoc: boolean;
  /** Whether to detect commented-out code */
  checkCommentedCode: boolean;
  /** Whether to validate TODO/FIXME patterns */
  checkTodoFixme: boolean;
  /** Minimum lines for a comment to be considered commented code */
  commentedCodeMinLines: number;
}

/**
 * Default configuration for code comment quality checker.
 */
const DEFAULT_CONFIG: CommentQualityConfig = {
  srcDir: 'src',
  extensions: ['.ts', '.tsx'],
  excludePatterns: [
    /node_modules/,
    /\.d\.ts$/,
    /\.test\./,
    /\.pbt\.test\./,
    /__test-fixtures__/,
  ],
  checkFunctionJSDoc: true,
  checkTypeJSDoc: true,
  checkCommentedCode: true,
  checkTodoFixme: true,
  commentedCodeMinLines: 2,
};

/**
 * Represents a commented-out code block found in source.
 */
export interface CommentedCodeBlock {
  /** File path */
  filePath: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** The commented code snippet */
  snippet: string;
}

/**
 * Represents a TODO/FIXME without tracking information.
 */
export interface UntrackedTodo {
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** The TODO/FIXME text */
  text: string;
  /** Whether it's TODO or FIXME */
  kind: 'TODO' | 'FIXME';
}

/**
 * Code Comment Quality Checker Module
 *
 * Implements the AuditModule interface to validate code comment
 * quality across the codebase.
 *
 * @example
 * ```typescript
 * const checker = new CommentQualityChecker();
 * const report = await checker.run();
 *
 * console.log(`Comment quality violations: ${report.totalViolations}`);
 * ```
 */
export class CommentQualityChecker implements AuditModule {
  readonly category = 'code-comments' as const;
  readonly name = 'Code Comment Quality Checker';

  private config: CommentQualityConfig;

  /**
   * Create a new code comment quality checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<CommentQualityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the code comment quality audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: CommentQualityViolation[] = [];
    const srcPath = path.resolve(this.config.srcDir);

    if (!this.directoryExists(srcPath)) {
      return {
        category: this.category,
        totalViolations: 0,
        violations: [],
        metrics: { filesChecked: 0 },
      };
    }

    const files = this.getAllSourceFiles(srcPath);
    let totalExportedFunctions = 0;
    let totalExportedTypes = 0;
    let totalCommentedCodeBlocks = 0;
    let totalUntrackedTodos = 0;

    for (const file of files) {
      if (this.shouldExclude(file)) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf-8');

      // Requirement 15.1: Check JSDoc presence on public API functions
      if (this.config.checkFunctionJSDoc) {
        const funcViolations = this.checkFunctionJSDoc(file, content);
        totalExportedFunctions += funcViolations.total;
        violations.push(...funcViolations.violations);
      }

      // Requirement 15.2: Check JSDoc presence on exported types
      if (this.config.checkTypeJSDoc) {
        const typeViolations = this.checkTypeJSDoc(file, content);
        totalExportedTypes += typeViolations.total;
        violations.push(...typeViolations.violations);
      }

      // Requirement 15.3: Detect commented-out code blocks
      if (this.config.checkCommentedCode) {
        const codeViolations = this.checkCommentedCode(file, content);
        totalCommentedCodeBlocks += codeViolations.length;
        violations.push(...codeViolations);
      }

      // Requirement 15.4: Verify TODO/FIXME include date or issue reference
      if (this.config.checkTodoFixme) {
        const todoViolations = this.checkTodoFixme(file, content);
        totalUntrackedTodos += todoViolations.length;
        violations.push(...todoViolations);
      }
    }

    const bySeverity = this.groupBySeverity(violations);
    const byType = this.groupByType(violations);

    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        filesChecked: files.length,
        totalExportedFunctions,
        totalExportedTypes,
        totalCommentedCodeBlocks,
        totalUntrackedTodos,
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
   * Requirement 15.1: Check JSDoc presence on exported functions.
   */
  private checkFunctionJSDoc(
    filePath: string,
    content: string
  ): { total: number; violations: CommentQualityViolation[] } {
    const violations: CommentQualityViolation[] = [];
    const lines = content.split('\n');
    let total = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match exported functions
      const exportedFuncMatch = line.match(
        /^\s*export\s+(?:async\s+)?function\s+(\w+)/
      );
      if (exportedFuncMatch) {
        total++;
        const funcName = exportedFuncMatch[1];

        // Check if preceding lines contain JSDoc comment
        if (!this.hasJSDocComment(lines, i)) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'missing-jsdoc-function',
            `Exported function '${funcName}' is missing JSDoc comment`,
            'medium',
            line.trim()
          ));
        }
      }

      // Match exported const arrow functions
      const exportedArrowMatch = line.match(
        /^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/
      );
      if (exportedArrowMatch) {
        total++;
        const funcName = exportedArrowMatch[1];

        if (!this.hasJSDocComment(lines, i)) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'missing-jsdoc-function',
            `Exported function '${funcName}' is missing JSDoc comment`,
            'medium',
            line.trim()
          ));
        }
      }
    }

    return { total, violations };
  }

  /**
   * Requirement 15.2: Check JSDoc presence on exported types.
   */
  private checkTypeJSDoc(
    filePath: string,
    content: string
  ): { total: number; violations: CommentQualityViolation[] } {
    const violations: CommentQualityViolation[] = [];
    const lines = content.split('\n');
    let total = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match exported interfaces
      const interfaceMatch = line.match(
        /^\s*export\s+interface\s+(\w+)/
      );
      if (interfaceMatch) {
        total++;
        const typeName = interfaceMatch[1];

        if (!this.hasJSDocComment(lines, i)) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'missing-jsdoc-type',
            `Exported interface '${typeName}' is missing JSDoc comment`,
            'low',
            line.trim()
          ));
        }
      }

      // Match exported types
      const typeMatch = line.match(
        /^\s*export\s+type\s+(\w+)/
      );
      if (typeMatch) {
        total++;
        const typeName = typeMatch[1];

        if (!this.hasJSDocComment(lines, i)) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'missing-jsdoc-type',
            `Exported type '${typeName}' is missing JSDoc comment`,
            'low',
            line.trim()
          ));
        }
      }

      // Match exported enums
      const enumMatch = line.match(
        /^\s*export\s+(?:const\s+)?enum\s+(\w+)/
      );
      if (enumMatch) {
        total++;
        const typeName = enumMatch[1];

        if (!this.hasJSDocComment(lines, i)) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'missing-jsdoc-type',
            `Exported enum '${typeName}' is missing JSDoc comment`,
            'low',
            line.trim()
          ));
        }
      }
    }

    return { total, violations };
  }

  /**
   * Requirement 15.3: Detect commented-out code blocks.
   */
  private checkCommentedCode(
    filePath: string,
    content: string
  ): CommentQualityViolation[] {
    const violations: CommentQualityViolation[] = [];
    const lines = content.split('\n');
    let blockStart = -1;
    let blockLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();

      // Detect single-line commented code (// followed by code-like content)
      const isCodeComment = this.isCommentedCodeLine(trimmedLine);

      if (isCodeComment) {
        if (blockStart === -1) {
          blockStart = i;
        }
        blockLines.push(trimmedLine);
      } else {
        // End of a commented code block
        if (blockStart !== -1 && blockLines.length >= this.config.commentedCodeMinLines) {
          violations.push(this.createViolation(
            filePath,
            blockStart + 1,
            'commented-code',
            `Commented-out code block (${blockLines.length} lines) detected - should be removed or tracked`,
            'medium',
            blockLines.slice(0, 3).join('\n')
          ));
        }
        blockStart = -1;
        blockLines = [];
      }
    }

    // Handle block that extends to end of file
    if (blockStart !== -1 && blockLines.length >= this.config.commentedCodeMinLines) {
      violations.push(this.createViolation(
        filePath,
        blockStart + 1,
        'commented-code',
        `Commented-out code block (${blockLines.length} lines) detected - should be removed or tracked`,
        'medium',
        blockLines.slice(0, 3).join('\n')
      ));
    }

    return violations;
  }

  /**
   * Requirement 15.4: Verify TODO/FIXME include date or issue reference.
   */
  private checkTodoFixme(
    filePath: string,
    content: string
  ): CommentQualityViolation[] {
    const violations: CommentQualityViolation[] = [];
    const lines = content.split('\n');

    // Valid patterns for TODO/FIXME tracking:
    // - TODO(2024-01-15): ...  (date in parentheses)
    // - TODO(#123): ...        (issue reference)
    // - TODO(@username): ...   (username reference)
    // - FIXME(2024-01-15): ...
    // - FIXME(#456): ...
    // - FIXME: [2024-01-15] ...
    const validPatterns = [
      /\b(?:TODO|FIXME)\s*\(\s*\d{4}-\d{2}-\d{2}\s*\)/,   // TODO(2024-01-15)
      /\b(?:TODO|FIXME)\s*\(\s*#\d+\s*\)/,                  // TODO(#123)
      /\b(?:TODO|FIXME)\s*\(\s*@\w+\s*\)/,                  // TODO(@username)
      /\b(?:TODO|FIXME)\s*:\s*\[\s*\d{4}-\d{2}-\d{2}\s*\]/, // TODO: [2024-01-15]
      /\b(?:TODO|FIXME)\s*:\s*#\d+/,                         // TODO: #123
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Find TODO or FIXME comments
      const todoMatch = trimmedLine.match(/\b(TODO|FIXME)\b/i);
      if (todoMatch) {
        const kind = trimmedLine.toUpperCase().includes('FIXME') ? 'FIXME' : 'TODO';

        // Check if it has a valid tracking pattern
        const hasValidTracking = validPatterns.some(pattern => pattern.test(trimmedLine));

        if (!hasValidTracking) {
          violations.push(this.createViolation(
            filePath,
            i + 1,
            'untracked-todo',
            `${kind} comment without date or issue reference: should include TODO(#issue) or TODO(YYYY-MM-DD)`,
            'low',
            trimmedLine
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Check if a line is commented-out code (not a regular comment).
   */
  private isCommentedCodeLine(line: string): boolean {
    // Must start with // (after trimming whitespace)
    if (!line.startsWith('//')) {
      return false;
    }

    // Skip JSDoc-style comments
    if (line.startsWith('///')) {
      return false;
    }

    // Remove the // prefix
    const content = line.slice(2).trim();

    // Skip empty comments
    if (content.length === 0) {
      return false;
    }

    // Skip common non-code comment patterns
    const nonCodePatterns = [
      /^@/,                    // JSDoc tags like @param, @returns
      /^eslint/i,              // ESLint directives
      /^ts-ignore/i,           // TypeScript directives
      /^ts-expect-error/i,     // TypeScript directives
      /^TODO/i,                // TODO comments
      /^FIXME/i,               // FIXME comments
      /^NOTE/i,                // NOTE comments
      /^HACK/i,                // HACK comments
      /^XXX/i,                 // XXX comments
      /^noinspection/i,         // IDE directives
      /^\*/,                   // Part of block comments
      /^#/,                    // Shell comments
    ];

    for (const pattern of nonCodePatterns) {
      if (pattern.test(content)) {
        return false;
      }
    }

    // Heuristic: Check if content looks like code
    const codeIndicators = [
      /[{}\[\]();]/,                // Brackets and parentheses
      /\b(const|let|var|import|export|from|return|if|else|for|while|class|interface|type|function|async|await|new|throw|try|catch)\b/,
      /[=>]/,                        // Arrow functions or type annotations
      /\w+\.\w+/,                    // Property access
      /^\s*\w+\s*[:=]/,             // Assignment or type annotation
    ];

    let codeScore = 0;
    for (const indicator of codeIndicators) {
      if (indicator.test(content)) {
        codeScore++;
      }
    }

    // If at least 2 code indicators match, it's likely commented code
    return codeScore >= 2;
  }

  /**
   * Check if a line at the given index has a preceding JSDoc comment.
   */
  private hasJSDocComment(lines: string[], lineIndex: number): boolean {
    // Look backwards from the line for a JSDoc comment block
    let i = lineIndex - 1;

    // Skip empty lines
    while (i >= 0 && lines[i].trim() === '') {
      i--;
    }

    if (i < 0) {
      return false;
    }

    // Check for single-line JSDoc: /** comment */
    const singleLineJsdoc = lines[i].trim().match(/^\/\*\*(.*)\*\/$/);
    if (singleLineJsdoc) {
      return true;
    }

    // Check for multi-line JSDoc: /** ... */
    if (lines[i].trim() === '*/') {
      // Found end of a comment block, look for beginning
      let j = i - 1;
      while (j >= 0) {
        const trimmed = lines[j].trim();
        if (trimmed.startsWith('/**')) {
          return true;
        }
        if (trimmed.startsWith('/*') && !trimmed.startsWith('/**')) {
          return false; // Regular block comment, not JSDoc
        }
        if (!trimmed.startsWith('*') && !trimmed.startsWith('*/')) {
          return false;
        }
        j--;
      }
    }

    return false;
  }

  /**
   * Get all source files recursively.
   */
  private getAllSourceFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...this.getAllSourceFiles(fullPath));
        } else if (entry.isFile() && this.config.extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Check if a file should be excluded based on patterns.
   */
  private shouldExclude(filePath: string): boolean {
    return this.config.excludePatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if a directory exists.
   */
  private directoryExists(dirPath: string): boolean {
    try {
      const stats = fs.statSync(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Group violations by severity.
   */
  private groupBySeverity(violations: CommentQualityViolation[]): Record<string, number> {
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
  private groupByType(violations: CommentQualityViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.violationType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create a comment quality violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: CommentViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    snippet?: string
  ): CommentQualityViolation {
    return {
      category: 'code-comments',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      snippet,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const commentQualityChecker = new CommentQualityChecker();
