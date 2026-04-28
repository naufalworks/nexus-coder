/**
 * ReportGenerator - Comprehensive audit report generation
 *
 * Generates JSON and Markdown reports from audit results, calculates
 * health scores with configurable weights, and identifies top priority issues.
 *
 * @module audit/framework/reporter
 * @see Requirements 21.1, 21.2, 21.3, 21.4, 21.5
 */

import type {
  AuditViolation,
  AuditReport,
  ComprehensiveAuditReport,
  AuditCategory,
  Severity,
} from './types';

/**
 * Weights for each audit category in health score calculation.
 * Security has the highest weight (20%) as it's most critical.
 */
export interface HealthScoreWeights {
  typescriptStrict: number;
  deadCode: number;
  architectureCompliance: number;
  accessibility: number;
  security: number;
  performance: number;
  documentation: number;
}

/**
 * Default weights for health score calculation.
 * Weights sum to 1.0 (100%).
 */
export const DEFAULT_WEIGHTS: HealthScoreWeights = {
  typescriptStrict: 0.15,
  deadCode: 0.10,
  architectureCompliance: 0.15,
  accessibility: 0.15,
  security: 0.20,
  performance: 0.15,
  documentation: 0.10,
};

/**
 * Penalty weights for each severity level.
 * Used in category score calculation.
 */
const SEVERITY_PENALTY_WEIGHTS: Record<Severity, number> = {
  critical: 1.0,
  high: 0.7,
  medium: 0.3,
  low: 0.1,
};

/**
 * Mapping from audit category to health score weight key.
 */
const CATEGORY_TO_WEIGHT_KEY: Partial<Record<AuditCategory, keyof HealthScoreWeights>> = {
  'typescript-strict': 'typescriptStrict',
  'dead-code': 'deadCode',
  'architecture-compliance': 'architectureCompliance',
  'event-bus-patterns': 'architectureCompliance',
  accessibility: 'accessibility',
  'keyboard-navigation': 'accessibility',
  security: 'security',
  'render-performance': 'performance',
  'bundle-size': 'performance',
  'memory-leaks': 'performance',
  're-render-optimization': 'performance',
  'documentation-accuracy': 'documentation',
  'code-comments': 'documentation',
};

/**
 * Sort order for severity levels (critical first).
 */
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * ReportGenerator class for creating comprehensive audit reports.
 *
 * @example
 * ```typescript
 * const generator = new ReportGenerator();
 *
 * // Generate JSON report
 * const jsonReport = generator.generateJSON(reports);
 *
 * // Generate Markdown summary
 * const markdown = generator.generateMarkdown(jsonReport);
 *
 * // Calculate health score
 * const score = generator.calculateHealthScore(reports);
 *
 * // Get top 10 priority issues
 * const topIssues = generator.identifyTopIssues(allViolations);
 * ```
 */
export class ReportGenerator {
  private weights: HealthScoreWeights;
  private totalFiles: number;

  /**
   * Create a new ReportGenerator instance.
   *
   * @param options - Configuration options
   * @param options.weights - Custom health score weights (defaults to DEFAULT_WEIGHTS)
   * @param options.totalFiles - Total number of files for score calculation (defaults to 100)
   */
  constructor(options?: {
    weights?: Partial<HealthScoreWeights>;
    totalFiles?: number;
  }) {
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...options?.weights,
    };
    this.totalFiles = options?.totalFiles ?? 100;
  }

  /**
   * Generate a comprehensive JSON report from all audit category reports.
   *
   * @param reports - Map of audit category to audit reports
   * @returns Comprehensive audit report with health score and summary
   *
   * @example
   * ```typescript
   * const reports = new Map([
   *   ['typescript-strict', tsReport],
   *   ['dead-code', deadCodeReport],
   * ]);
   * const comprehensiveReport = generator.generateJSON(reports);
   * ```
   */
  generateJSON(reports: Map<AuditCategory, AuditReport>): ComprehensiveAuditReport {
    const allViolations = this.collectAllViolations(reports);
    const healthScore = this.calculateHealthScore(reports);
    const topPriorityIssues = this.identifyTopIssues(allViolations, 10);
    const summary = this.calculateSummary(reports, allViolations);
    const passed = this.determinePassStatus(allViolations);

    return {
      timestamp: new Date().toISOString(),
      healthScore,
      reports,
      topPriorityIssues,
      summary,
      passed,
    };
  }

  /**
   * Generate a Markdown summary report from a comprehensive audit report.
   *
   * @param report - Comprehensive audit report
   * @returns Markdown formatted string suitable for documentation
   *
   * @example
   * ```typescript
   * const markdown = generator.generateMarkdown(comprehensiveReport);
   * console.log(markdown);
   * // # Nexus Codebase Audit Report
   * // **Generated:** 2024-01-15 10:30:00
   * // **Health Score:** 87.5/100 ✓ PASS
   * // ...
   * ```
   */
  generateMarkdown(report: ComprehensiveAuditReport): string {
    const lines: string[] = [];
    const passIcon = report.passed ? '✓ PASS' : '✗ FAIL';

    // Header
    lines.push('# Nexus Codebase Audit Report');
    lines.push('');
    lines.push(`**Generated:** ${this.formatTimestamp(report.timestamp)}`);
    lines.push(`**Health Score:** ${report.healthScore.toFixed(1)}/100 ${passIcon}`);
    lines.push('');

    // Summary table
    lines.push('## Summary');
    lines.push('');
    lines.push('| Category | Violations | Score |');
    lines.push('|----------|------------|-------|');

    const categoryScores = this.calculateCategoryScores(report.reports);
    categoryScores.forEach((score, category) => {
      const categoryReport = report.reports.get(category);
      const violations = categoryReport?.totalViolations ?? 0;
      lines.push(`| ${this.formatCategoryName(category)} | ${violations} | ${score.toFixed(0)} |`);
    });

    lines.push('');

    // Severity breakdown
    lines.push('### Violations by Severity');
    lines.push('');
    lines.push(`- **Critical:** ${report.summary.bySeverity.critical}`);
    lines.push(`- **High:** ${report.summary.bySeverity.high}`);
    lines.push(`- **Medium:** ${report.summary.bySeverity.medium}`);
    lines.push(`- **Low:** ${report.summary.bySeverity.low}`);
    lines.push('');

    // Top priority issues
    lines.push('## Top Priority Issues');
    lines.push('');

    if (report.topPriorityIssues.length === 0) {
      lines.push('No violations found. Great job!');
    } else {
      for (let i = 0; i < report.topPriorityIssues.length; i++) {
        const issue = report.topPriorityIssues[i];
        lines.push(
          `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.filePath}:${issue.lineNumber} - ${issue.message}`
        );
      }
    }

    lines.push('');

    // Remediation suggestions (if violations exist)
    if (report.summary.totalViolations > 0) {
      lines.push('## Remediation Suggestions');
      lines.push('');
      lines.push(...this.generateRemediationSection(report.topPriorityIssues));
    }

    return lines.join('\n');
  }

  /**
   * Calculate the overall health score from all audit category reports.
   *
   * Uses a weighted average of category scores. Each category score is
   * calculated using a penalty-based system where violations reduce the
   * score based on their severity.
   *
   * @param reports - Map of audit category to audit reports
   * @returns Health score from 0 to 100
   *
   * @example
   * ```typescript
   * const score = generator.calculateHealthScore(reports);
   * console.log(`Codebase health: ${score}/100`);
   * ```
   */
  calculateHealthScore(reports: Map<AuditCategory, AuditReport>): number {
    const categoryScores = this.calculateCategoryScores(reports);
    let totalWeight = 0;
    let weightedSum = 0;

    // Group categories by their weight key and use highest score for each group
    const weightKeyScores: Map<keyof HealthScoreWeights, number[]> = new Map();

    categoryScores.forEach((score, category) => {
      const weightKey = CATEGORY_TO_WEIGHT_KEY[category];
      if (weightKey) {
        const existing = weightKeyScores.get(weightKey) ?? [];
        existing.push(score);
        weightKeyScores.set(weightKey, existing);
      }
    });

    // Calculate weighted average using the minimum score for each weight group
    // This ensures all categories in a group meet the standard
    weightKeyScores.forEach((scores, weightKey) => {
      const weight = this.weights[weightKey];
      // Use minimum score to ensure all categories in group pass
      const representativeScore = Math.min(...scores);
      weightedSum += representativeScore * weight;
      totalWeight += weight;
    });

    // If no categories matched, return 100 (perfect score)
    if (totalWeight === 0) {
      return 100;
    }

    // Normalize to account for any unrepresented categories
    const normalizedScore = weightedSum / totalWeight;

    return Math.round(normalizedScore * 100) / 100;
  }

  /**
   * Identify the top priority issues for remediation.
   *
   * Issues are ranked by severity (critical first), then by category weight.
   *
   * @param violations - Array of all audit violations
   * @param limit - Maximum number of issues to return (default: 10)
   * @returns Sorted array of top priority violations
   *
   * @example
   * ```typescript
   * const topIssues = generator.identifyTopIssues(allViolations, 5);
   * // Returns 5 most critical issues
   * ```
   */
  identifyTopIssues(violations: AuditViolation[], limit: number = 10): AuditViolation[] {
    // Sort by severity (critical first), then by category weight
    const sorted = [...violations].sort((a, b) => {
      // First, sort by severity
      const severityDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }

      // Then, sort by category weight (higher weight = higher priority)
      const weightA = this.getCategoryWeight(a.category);
      const weightB = this.getCategoryWeight(b.category);
      return weightB - weightA;
    });

    return sorted.slice(0, limit);
  }

  /**
   * Generate remediation suggestions for violations.
   *
   * @param violations - Array of violations to suggest remediation for
   * @returns Array of remediation suggestions
   */
  generateRemediationSuggestions(
    violations: AuditViolation[]
  ): Array<{ category: AuditCategory; suggestion: string }> {
    const suggestions: Map<AuditCategory, Set<string>> = new Map();

    for (const violation of violations) {
      const categorySuggestions = suggestions.get(violation.category) ?? new Set();
      categorySuggestions.add(this.getRemediationSuggestion(violation));
      suggestions.set(violation.category, categorySuggestions);
    }

    const result: Array<{ category: AuditCategory; suggestion: string }> = [];
    suggestions.forEach((categorySuggestions, category) => {
      categorySuggestions.forEach((suggestion) => {
        result.push({ category, suggestion });
      });
    });

    return result;
  }

  // Private helper methods

  /**
   * Collect all violations from all reports.
   */
  private collectAllViolations(reports: Map<AuditCategory, AuditReport>): AuditViolation[] {
    const allViolations: AuditViolation[] = [];
    reports.forEach((report) => {
      allViolations.push(...report.violations);
    });
    return allViolations;
  }

  /**
   * Calculate the summary statistics for all reports.
   */
  private calculateSummary(
    reports: Map<AuditCategory, AuditReport>,
    allViolations: AuditViolation[]
  ): ComprehensiveAuditReport['summary'] {
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byCategory: Record<AuditCategory, number> = {} as Record<AuditCategory, number>;

    // Count violations by severity and category
    for (const violation of allViolations) {
      bySeverity[violation.severity]++;
      byCategory[violation.category] = (byCategory[violation.category] ?? 0) + 1;
    }

    return {
      totalViolations: allViolations.length,
      bySeverity,
      byCategory,
    };
  }

  /**
   * Determine if the audit passed based on violation severity.
   * Fails if any critical violations exist.
   */
  private determinePassStatus(allViolations: AuditViolation[]): boolean {
    return !allViolations.some((v) => v.severity === 'critical');
  }

  /**
   * Calculate scores for each category.
   */
  private calculateCategoryScores(
    reports: Map<AuditCategory, AuditReport>
  ): Map<AuditCategory, number> {
    const scores = new Map<AuditCategory, number>();

    reports.forEach((report, category) => {
      const score = calculateCategoryScore(report.violations, this.totalFiles);
      scores.set(category, score);
    });

    return scores;
  }

  /**
   * Get the health score weight for a category.
   */
  private getCategoryWeight(category: AuditCategory): number {
    const weightKey = CATEGORY_TO_WEIGHT_KEY[category];
    return weightKey ? this.weights[weightKey] : 0;
  }

  /**
   * Format timestamp for display.
   */
  private formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * Format category name for display.
   */
  private formatCategoryName(category: AuditCategory): string {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate remediation section for markdown.
   */
  private generateRemediationSection(violations: AuditViolation[]): string[] {
    const lines: string[] = [];
    const suggestions = this.generateRemediationSuggestions(violations);

    const groupedByCategory = new Map<AuditCategory, string[]>();
    for (const { category, suggestion } of suggestions) {
      const existing = groupedByCategory.get(category) ?? [];
      existing.push(suggestion);
      groupedByCategory.set(category, existing);
    }

    groupedByCategory.forEach((categorySuggestions, category) => {
      lines.push(`### ${this.formatCategoryName(category)}`);
      lines.push('');
      for (const suggestion of categorySuggestions) {
        lines.push(`- ${suggestion}`);
      }
      lines.push('');
    });

    return lines;
  }

  /**
   * Get remediation suggestion for a specific violation.
   */
  private getRemediationSuggestion(violation: AuditViolation): string {
    switch (violation.category) {
      case 'typescript-strict':
        return 'Remove `@ts-ignore` comments and fix underlying type errors. Replace explicit `any` with proper type definitions.';
      case 'dead-code':
        return `Remove unused export \`${violation.symbolName ?? 'symbol'}\` to reduce bundle size.`;
      case 'naming-conventions':
        return 'Follow naming conventions: PascalCase for components, camelCase for utilities.';
      case 'import-patterns':
        return 'Use module aliases (`@core/*`, `@agents/*`, `@types/*`) for cross-module imports.';
      case 'architecture-compliance':
        return 'Move misplaced code to the correct module according to architecture guidelines.';
      case 'security':
        return 'Sanitize user input and avoid rendering untrusted content with dangerouslySetInnerHTML.';
      case 'accessibility':
        return 'Ensure all interactive elements have accessible names and sufficient color contrast.';
      case 'render-performance':
        return 'Optimize render performance using React.memo, useMemo, or useCallback.';
      case 'memory-leaks':
        return 'Clean up event listeners and refs in useEffect cleanup functions.';
      case 'documentation-accuracy':
        return 'Update documentation to reflect current API signatures and commands.';
      default:
        return 'Review and address the violation according to the message details.';
    }
  }
}

/**
 * Calculate category score from violations using penalty-based scoring.
 *
 * Score = max(0, 100 - (penalty / maxPenalty) * 100)
 *
 * Where penalty is the sum of violation weights and maxPenalty is
 * based on total files to normalize the score.
 *
 * @param violations - Array of violations in this category
 * @param totalFiles - Total number of files for normalization
 * @returns Category score from 0 to 100
 */
export function calculateCategoryScore(
  violations: AuditViolation[],
  totalFiles: number
): number {
  // Calculate total penalty from violations
  const penalty = violations.reduce((sum, v) => {
    return sum + SEVERITY_PENALTY_WEIGHTS[v.severity];
  }, 0);

  // Max penalty is based on file count (critical violation per file = 100% penalty)
  const maxPenalty = totalFiles * SEVERITY_PENALTY_WEIGHTS.critical;

  // Calculate score with penalty
  const score = Math.max(0, 100 - (penalty / maxPenalty) * 100);

  return Math.round(score * 100) / 100;
}
