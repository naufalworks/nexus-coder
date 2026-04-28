/**
 * Error Handling Audit Script
 * 
 * Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
 * 
 * Verifies consistent error handling patterns across the codebase.
 */

import { ErrorHandlingPatternChecker } from './error-handling/patterns';
import * as fs from 'fs';

async function runAudit(): Promise<void> {
  console.log('Running Error Handling Audit...\n');
  
  const checker = new ErrorHandlingPatternChecker();
  const report = await checker.run();
  
  // Output results
  console.log(`${'='.repeat(60)}`);
  console.log('Error Handling Audit Report');
  console.log('='.repeat(60));
  console.log(`Total violations: ${report.totalViolations}`);
  console.log(`Files scanned: ${report.metrics?.totalFilesScanned}`);
  
  // Group by severity
  const bySeverity = {
    critical: report.violations.filter(v => v.severity === 'critical'),
    high: report.violations.filter(v => v.severity === 'high'),
    medium: report.violations.filter(v => v.severity === 'medium'),
    low: report.violations.filter(v => v.severity === 'low'),
  };
  
  console.log(`\nBy severity:`);
  console.log(`  Critical: ${bySeverity.critical.length}`);
  console.log(`  High: ${bySeverity.high.length}`);
  console.log(`  Medium: ${bySeverity.medium.length}`);
  console.log(`  Low: ${bySeverity.low.length}`);
  
  // Group by type
  const byType: Record<string, number> = {};
  report.violations.forEach(v => {
    const type = (v as any).violationType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  
  console.log(`\nBy type:`);
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  // Print all critical violations
  if (bySeverity.critical.length > 0) {
    console.log(`\nCritical violations:`);
    bySeverity.critical.forEach(v => {
      console.log(`  ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
      if ((v as any).functionName) {
        console.log(`    Function: ${(v as any).functionName}`);
      }
    });
  }
  
  // Print first 10 high violations
  if (bySeverity.high.length > 0) {
    console.log(`\nHigh severity violations (first 10):`);
    bySeverity.high.slice(0, 10).forEach(v => {
      console.log(`  ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
      if ((v as any).functionName) {
        console.log(`    Function: ${(v as any).functionName}`);
      }
    });
  }
  
  // Print first 10 medium violations
  if (bySeverity.medium.length > 0) {
    console.log(`\nMedium severity violations (first 10):`);
    bySeverity.medium.slice(0, 10).forEach(v => {
      console.log(`  ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
    });
  }
  
  // Write JSON report
  const reportPath = 'error-handling-audit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);
  
  // Exit with appropriate code
  const hasCritical = bySeverity.critical.length > 0;
  const hasHigh = bySeverity.high.length > 0;
  
  if (hasCritical) {
    console.log('\n❌ Audit FAILED: Critical violations found');
    process.exit(1);
  } else if (hasHigh) {
    console.log('\n⚠️  Audit WARNING: High severity violations found');
    process.exit(0); // Don't fail on high, just warn
  } else {
    console.log('\n✅ Audit PASSED: No critical or high severity violations');
    process.exit(0);
  }
}

// Run the audit
runAudit().catch(error => {
  console.error('Audit failed:', error);
  process.exit(3);
});
