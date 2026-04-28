/**
 * Security Pattern Checker Module
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 *
 * Scans source files for dangerous security patterns:
 * - dangerouslySetInnerHTML without sanitization
 * - HTML injection risks in ReasoningLog
 * - Path sanitization in TaskPanel and GraphExplorer
 * - Sensitive data rendering in ResourceFooter
 * - Stack trace exposure in CLI output
 * - General security pattern checking across all modules
 *
 * @module audit/security/patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Security violation types.
 */
export type SecurityViolationType =
  | 'dangerouslySetInnerHTML'
  | 'html-injection'
  | 'path-traversal-display'
  | 'sensitive-data-render'
  | 'stack-trace-exposure'
  | 'hardcoded-secret'
  | 'eval-usage'
  | 'dynamic-function'
  | 'unsafe-regex';

/**
 * Extended violation interface for security issues.
 */
export interface SecurityViolation extends AuditViolation {
  category: 'security';
  /** Type of security issue */
  violationType: SecurityViolationType;
  /** Code snippet that triggered the violation */
  codeSnippet?: string;
  /** Whether sanitization was detected nearby */
  hasSanitization?: boolean;
}

/**
 * Configuration options for the security pattern checker.
 */
export interface SecurityPatternConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Check for dangerouslySetInnerHTML */
  checkDangerousHTML: boolean;
  /** Check for hardcoded secrets */
  checkHardcodedSecrets: boolean;
  /** Check for stack trace exposure */
  checkStackTraces: boolean;
  /** Check for sensitive data rendering */
  checkSensitiveData: boolean;
}

/**
 * Default configuration for security pattern checker.
 */
const DEFAULT_CONFIG: SecurityPatternConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /__tests__/, /\.test\.tsx?$/],
  checkDangerousHTML: true,
  checkHardcodedSecrets: true,
  checkStackTraces: true,
  checkSensitiveData: true,
};

/**
 * Security patterns to detect.
 */
interface SecurityPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Violation type */
  violationType: SecurityViolationType;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description of the issue */
  message: string;
  /** Whether to check for sanitization nearby */
  checkSanitization?: boolean;
  /** Whether this requires literal string check */
  requiresLiteral?: boolean;
}

/**
 * Security patterns to check across all files.
 */
const SECURITY_PATTERNS: SecurityPattern[] = [
  {
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/,
    violationType: 'dangerouslySetInnerHTML',
    severity: 'critical',
    message: 'Use of dangerouslySetInnerHTML without verified sanitization',
    checkSanitization: true,
  },
  {
    pattern: /\.innerHTML\s*=/,
    violationType: 'html-injection',
    severity: 'high',
    message: 'Direct innerHTML assignment - potential XSS vector',
  },
  {
    pattern: /eval\s*\(/,
    violationType: 'eval-usage',
    severity: 'critical',
    message: 'Use of eval() - potential code injection vulnerability',
  },
  {
    pattern: /new\s+Function\s*\(/,
    violationType: 'dynamic-function',
    severity: 'high',
    message: 'Dynamic function creation - potential code injection',
  },
  {
    pattern: /API_KEY\s*=\s*['"`]|SECRET\s*=\s*['"`]|PASSWORD\s*=\s*['"`]|TOKEN\s*=\s*['"`]/,
    violationType: 'hardcoded-secret',
    severity: 'critical',
    message: 'Potential hardcoded secret or credential',
    requiresLiteral: true,
  },
  {
    pattern: /console\.(log|error|warn|info)\s*\([^)]*(?:token|key|password|secret|credential)/i,
    violationType: 'sensitive-data-render',
    severity: 'high',
    message: 'Logging potentially sensitive data',
  },
];

/**
 * Sensitive variable/prop names that should not be rendered.
 */
const SENSITIVE_NAMES = [
  'apiKey',
  'secretKey',
  'password',
  'token',
  'credential',
  'privateKey',
  'accessToken',
  'refreshToken',
  'authToken',
];

/**
 * Sanitization indicators to look for near dangerouslySetInnerHTML.
 */
const SANITIZATION_INDICATORS = [
  'DOMPurify',
  'sanitize',
  'xss',
  'escape',
  'escapeHtml',
  'sanitizeHtml',
];

/**
 * Security Pattern Checker Module
 *
 * Implements the AuditModule interface to validate security patterns
 * across the codebase.
 *
 * @example
 * ```typescript
 * const checker = new SecurityPatternChecker();
 * const report = await checker.run();
 *
 * console.log(`Security violations: ${report.totalViolations}`);
 * console.log(`Critical issues: ${report.metrics?.criticalCount}`);
 * ```
 */
export class SecurityPatternChecker implements AuditModule {
  readonly category: AuditCategory = 'security';
  readonly name = 'Security Pattern Checker';

  private config: SecurityPatternConfig;

  /**
   * Create a new security pattern checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<SecurityPatternConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the security pattern audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: SecurityViolation[] = [];

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
   * Analyze a single file for security violations.
   *
   * @param filePath - Path to the file
   * @returns Array of violations found
   */
  private analyzeFile(filePath: string): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return violations; // Skip files that can't be read
    }

    const lines = content.split('\n');

    // Check general security patterns
    violations.push(...this.checkGeneralPatterns(filePath, lines, content));

    // Requirement 16.1: Check dangerouslySetInnerHTML without sanitization
    if (this.config.checkDangerousHTML) {
      violations.push(...this.checkDangerousHTML(filePath, lines, content));
    }

    // Requirement 16.2: Check HTML escaping in ReasoningLog
    if (filePath.includes('ReasoningLog')) {
      violations.push(...this.checkReasoningLogHTMLEscaping(filePath, lines, content));
    }

    // Requirement 16.3: Check path sanitization in TaskPanel and GraphExplorer
    if (filePath.includes('TaskPanel') || filePath.includes('GraphExplorer')) {
      violations.push(...this.checkPathSanitization(filePath, lines, content));
    }

    // Requirement 16.4: Check sensitive data rendering in ResourceFooter
    if (filePath.includes('ResourceFooter')) {
      violations.push(...this.checkSensitiveDataRendering(filePath, lines, content));
    }

    // Requirement 16.5: Check stack trace exposure in CLI
    if (filePath.includes('cli/') || filePath.includes('cli\\')) {
      violations.push(...this.checkStackTraceExposure(filePath, lines, content));
    }

    return violations;
  }

  /**
   * Check general security patterns across all files.
   */
  private checkGeneralPatterns(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Check each security pattern
      for (const pattern of SECURITY_PATTERNS) {
        if (pattern.pattern.test(line)) {
          // Special handling for patterns that require literal checks
          if (pattern.requiresLiteral) {
            // Check if it's actually a string literal assignment
            if (!/=\s*['"`][^'"`]+['"`]/.test(line)) {
              continue;
            }
            // Skip if it's a placeholder or example
            if (/example|placeholder|your_|xxx|test/i.test(line)) {
              continue;
            }
          }

          // Check for sanitization if required
          let hasSanitization = false;
          if (pattern.checkSanitization) {
            hasSanitization = this.checkForSanitization(content, lineNumber);
          }

          violations.push(this.createViolation(
            filePath,
            lineNumber,
            pattern.violationType,
            pattern.message,
            pattern.severity,
            line.trim(),
            hasSanitization
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 16.1: Check for dangerouslySetInnerHTML without sanitization.
   */
  private checkDangerousHTML(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      if (/dangerouslySetInnerHTML/.test(line)) {
        // Check if sanitization is present nearby
        const hasSanitization = this.checkForSanitization(content, lineNumber);

        if (!hasSanitization) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'dangerouslySetInnerHTML',
            'dangerouslySetInnerHTML used without verified sanitization (DOMPurify, sanitize, etc.)',
            'critical',
            line.trim(),
            false
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 16.2: Check HTML escaping in ReasoningLog.
   */
  private checkReasoningLogHTMLEscaping(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check if ReasoningLog renders agent messages without escaping
    if (content.includes('dangerouslySetInnerHTML')) {
      const hasSanitization = this.checkForSanitization(content, 0);
      
      if (!hasSanitization) {
        violations.push(this.createViolation(
          filePath,
          1,
          'html-injection',
          'ReasoningLog must HTML-escape agent messages before rendering',
          'critical',
          'dangerouslySetInnerHTML usage detected',
          false
        ));
      }
    }

    // Check for direct rendering of message content without escaping
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Look for patterns like {message.content} or {entry.message}
      if (/\{(?:message|entry|log)\.(?:content|message|text)\}/.test(line)) {
        // Check if it's inside a text node or has escaping
        if (!line.includes('textContent') && !line.includes('escape')) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'html-injection',
            'Agent message content should be HTML-escaped before rendering',
            'high',
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 16.3: Check path sanitization in TaskPanel and GraphExplorer.
   */
  private checkPathSanitization(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check for path rendering without sanitization
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Look for file path rendering patterns
      if (/\{(?:file|path|filePath|fileName)/.test(line)) {
        // Check if path sanitization is present
        const hasSanitization = 
          line.includes('sanitize') ||
          line.includes('normalize') ||
          line.includes('basename') ||
          line.includes('relative') ||
          content.includes('sanitizePath') ||
          content.includes('normalizePath');

        if (!hasSanitization && !line.includes('//')) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'path-traversal-display',
            'File paths should be sanitized before display to prevent path traversal information disclosure',
            'medium',
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 16.4: Check for sensitive data rendering in ResourceFooter.
   */
  private checkSensitiveDataRendering(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
        continue;
      }

      // Check for rendering sensitive data
      for (const sensitiveName of SENSITIVE_NAMES) {
        // Look for JSX rendering patterns like {apiKey} or {props.token}
        const renderPattern = new RegExp(`\\{[^}]*${sensitiveName}[^}]*\\}`);
        
        if (renderPattern.test(line)) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'sensitive-data-render',
            `ResourceFooter should not render sensitive data (${sensitiveName}) in visible DOM`,
            'critical',
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 16.5: Check for stack trace exposure in CLI output.
   */
  private checkStackTraceExposure(
    filePath: string,
    lines: string[],
    content: string
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Skip comments and test files
      if (line.trim().startsWith('//') || filePath.includes('.test.')) {
        continue;
      }

      // Check for stack trace exposure patterns
      if (
        /\.stack/.test(line) ||
        /error\.stack/.test(line) ||
        /err\.stack/.test(line)
      ) {
        // Check if it's being logged or output to user
        if (
          line.includes('console.') ||
          line.includes('log(') ||
          line.includes('print') ||
          line.includes('write') ||
          line.includes('output')
        ) {
          violations.push(this.createViolation(
            filePath,
            lineNumber,
            'stack-trace-exposure',
            'CLI should not expose stack traces to users - use user-friendly error messages instead',
            'medium',
            line.trim()
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Check if sanitization is present near a line.
   *
   * @param content - Full file content
   * @param lineNumber - Line number to check around
   * @returns True if sanitization indicators found
   */
  private checkForSanitization(content: string, lineNumber: number): boolean {
    // Check if any sanitization indicators are present in the file
    for (const indicator of SANITIZATION_INDICATORS) {
      if (content.includes(indicator)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Group violations by severity.
   */
  private groupBySeverity(violations: SecurityViolation[]): Record<string, number> {
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
  private groupByType(violations: SecurityViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.violationType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create a security violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: SecurityViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    codeSnippet?: string,
    hasSanitization?: boolean
  ): SecurityViolation {
    return {
      category: 'security',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      codeSnippet,
      hasSanitization,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const securityPatternChecker = new SecurityPatternChecker();
