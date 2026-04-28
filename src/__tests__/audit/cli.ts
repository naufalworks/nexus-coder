#!/usr/bin/env node
/**
 * Audit CLI Entry Point
 *
 * Provides command-line interface for running codebase audits.
 * Supports category filtering, output formats (JSON/Markdown), and file output.
 *
 * Usage:
 *   ts-node src/__tests__/audit/cli.ts [options]
 *   npm run audit:all
 *
 * Options:
 *   -c, --category <category>  Run only a specific audit category
 *   -f, --format <format>      Output format: json or markdown (default: json)
 *   -o, --output <path>        Write output to file instead of stdout
 *   -h, --help                 Show usage information
 *
 * Exit Codes:
 *   0 - All audits passed (no violations)
 *   1 - Critical violations found
 *   2 - High violations found (if no critical)
 *   3 - Audit infrastructure error
 *   4 - Configuration error (invalid arguments)
 *
 * @module audit/cli
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { AuditRunner } from './framework/runner';
import { ReportGenerator } from './framework/reporter';
import { ViolationRegistry } from './framework/registry';
import type { AuditCategory, ComprehensiveAuditReport } from './framework/types';

// Import all audit modules
import { TypeScriptStrictAudit } from './code-quality/typescript-strict';
import { NamingConventionsAudit } from './code-quality/naming-conventions';
import { ImportPatternAudit } from './code-quality/import-patterns';
// Note: OptionalPropsAudit uses 'typescript-strict' category, same as TypeScriptStrictAudit
// It's a separate implementation but shares the category, so we don't register it separately
// import { OptionalPropsAudit } from './code-quality/optional-props';
import { DeadCodeDetector } from './dead-code/detector';
import { ArchitectureBoundaryChecker } from './architecture/boundary-checker';
import { EventBusPatternChecker } from './architecture/event-bus';
import { WidgetQualityChecker } from './ui-ux/widget-quality';
import { AccessibilityChecker } from './ui-ux/accessibility';
import { KeyboardNavigationChecker } from './ui-ux/keyboard-nav';
import { SecurityPatternChecker } from './security/patterns';
import { ErrorHandlingPatternChecker } from './error-handling/patterns';
import { StructureComplianceChecker } from './structure/compliance';
import { DocumentationAccuracyChecker } from './documentation/accuracy';
import { CommentQualityChecker } from './documentation/comments';
import { CLIIDEParityChecker } from './parity/cli-ide-parity';
import { TestCoverageAudit } from './coverage/validator';

/**
 * Main CLI function.
 * Parses arguments, runs audits, and outputs results.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('audit')
    .description('Nexus Codebase Audit - Comprehensive code quality validation')
    .version('1.0.0')
    .option('-c, --category <category>', 'Run only a specific audit category')
    .option('-f, --format <format>', 'Output format: json or markdown', 'json')
    .option('-o, --output <path>', 'Write output to file instead of stdout')
    .helpOption('-h, --help', 'Show usage information');

  program.parse(process.argv);

  const options = program.opts();

  try {
    // Validate format option
    if (options.format && !['json', 'markdown'].includes(options.format)) {
      console.error(`Error: Invalid format '${options.format}'. Must be 'json' or 'markdown'.`);
      process.exit(4);
    }

    // Validate category option if provided
    if (options.category && !isValidCategory(options.category)) {
      console.error(`Error: Invalid category '${options.category}'.`);
      console.error('Valid categories: typescript-strict, dead-code, naming-conventions, import-patterns,');
      console.error('  architecture-compliance, event-bus-patterns, widget-quality, accessibility,');
      console.error('  keyboard-navigation, security, error-handling, project-structure,');
      console.error('  documentation-accuracy, code-comments, cli-ide-parity, test-coverage');
      process.exit(4);
    }

    // Initialize audit infrastructure
    const registry = new ViolationRegistry();
    const runner = new AuditRunner(registry);
    const reporter = new ReportGenerator();

    // Register all audit modules
    registerAuditModules(runner);

    console.error('Running audits...');

    // Run audits
    let reports;
    if (options.category) {
      console.error(`Category filter: ${options.category}`);
      const report = await runner.runCategory(options.category as AuditCategory);
      if (!report) {
        console.error(`Error: Category '${options.category}' not found.`);
        process.exit(4);
      }
      reports = new Map([[options.category as AuditCategory, report]]);
    } else {
      reports = await runner.runAll();
    }

    // Generate comprehensive report
    const comprehensiveReport = reporter.generateJSON(reports);

    // Output results
    const outputContent = options.format === 'markdown'
      ? reporter.generateMarkdown(comprehensiveReport)
      : JSON.stringify(comprehensiveReport, null, 2);

    if (options.output) {
      // Write to file
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, outputContent, 'utf8');
      console.error(`Report written to: ${outputPath}`);
    } else {
      // Write to stdout
      console.log(outputContent);
    }

    // Print summary to stderr
    printSummary(comprehensiveReport);

    // Exit with appropriate code
    const exitCode = determineExitCode(comprehensiveReport);
    process.exit(exitCode);

  } catch (error) {
    console.error('Audit infrastructure error:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(3);
  }
}

/**
 * Register all available audit modules with the runner.
 *
 * @param runner - The AuditRunner instance
 */
function registerAuditModules(runner: AuditRunner): void {
  // Code quality audits
  runner.registerModule(new TypeScriptStrictAudit());
  runner.registerModule(new NamingConventionsAudit());
  runner.registerModule(new ImportPatternAudit());
  // Note: OptionalPropsAudit shares 'typescript-strict' category with TypeScriptStrictAudit
  // If separate registration is needed, use different runner instances or change category

  // Dead code detection
  runner.registerModule(new DeadCodeDetector());

  // Architecture audits
  runner.registerModule(new ArchitectureBoundaryChecker());
  runner.registerModule(new EventBusPatternChecker());

  // UI/UX audits
  runner.registerModule(new WidgetQualityChecker());
  runner.registerModule(new AccessibilityChecker());
  runner.registerModule(new KeyboardNavigationChecker());

  // Security audit
  runner.registerModule(new SecurityPatternChecker());

  // Error handling audit
  runner.registerModule(new ErrorHandlingPatternChecker());

  // Structure audit
  runner.registerModule(new StructureComplianceChecker());

  // Documentation audits
  runner.registerModule(new DocumentationAccuracyChecker());
  runner.registerModule(new CommentQualityChecker());

  // Parity audit
  runner.registerModule(new CLIIDEParityChecker());

  // Test coverage audit
  runner.registerModule(new TestCoverageAudit());
}

/**
 * Check if a category string is valid.
 *
 * @param category - Category string to validate
 * @returns True if valid category
 */
function isValidCategory(category: string): boolean {
  const validCategories: AuditCategory[] = [
    'typescript-strict',
    'dead-code',
    'naming-conventions',
    'import-patterns',
    'architecture-compliance',
    'event-bus-patterns',
    'widget-quality',
    'accessibility',
    'keyboard-navigation',
    'security',
    'error-handling',
    'project-structure',
    'documentation-accuracy',
    'code-comments',
    'cli-ide-parity',
    'test-coverage',
  ];

  return validCategories.includes(category as AuditCategory);
}

/**
 * Print summary information to stderr.
 *
 * @param report - Comprehensive audit report
 */
function printSummary(report: ComprehensiveAuditReport): void {
  console.error('\n=== Audit Summary ===');
  console.error(`Health Score: ${report.healthScore.toFixed(1)}/100`);
  console.error(`Status: ${report.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  console.error(`Total Violations: ${report.summary.totalViolations}`);
  console.error(`  Critical: ${report.summary.bySeverity.critical}`);
  console.error(`  High: ${report.summary.bySeverity.high}`);
  console.error(`  Medium: ${report.summary.bySeverity.medium}`);
  console.error(`  Low: ${report.summary.bySeverity.low}`);

  if (report.topPriorityIssues.length > 0) {
    console.error('\nTop Priority Issues:');
    report.topPriorityIssues.slice(0, 5).forEach((issue, index) => {
      console.error(`  ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.filePath}:${issue.lineNumber}`);
      console.error(`     ${issue.message}`);
    });
  }
}

/**
 * Determine exit code based on audit results.
 *
 * Exit codes:
 *   0 - All audits passed (no violations)
 *   1 - Critical violations found
 *   2 - High violations found (if no critical)
 *
 * @param report - Comprehensive audit report
 * @returns Exit code
 */
function determineExitCode(report: ComprehensiveAuditReport): number {
  if (report.summary.bySeverity.critical > 0) {
    return 1;
  }

  if (report.summary.bySeverity.high > 0) {
    return 2;
  }

  return 0;
}

// Run main function if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:');
    console.error(error);
    process.exit(3);
  });
}

// Export for testing
export { main, registerAuditModules, isValidCategory, determineExitCode };
