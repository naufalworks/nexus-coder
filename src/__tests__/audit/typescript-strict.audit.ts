/**
 * TypeScript Strict Mode Audit Script
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 * 
 * Verifies all source files compile with strict: true and have no suppressions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface AuditViolation {
  category: 'typescript-strict';
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  message: string;
}

interface AuditReport {
  category: string;
  totalViolations: number;
  violations: AuditViolation[];
}

// Directories to scan
const SRC_DIRS = ['src'];
// File extensions to check
const EXTENSIONS = ['.ts', '.tsx'];
// Patterns to flag as violations
const VIOLATION_PATTERNS = [
  { pattern: /@ts-ignore/, message: 'Use of @ts-ignore suppression comment' },
  { pattern: /@ts-expect-error/, message: 'Use of @ts-expect-error suppression comment' },
  { pattern: /:\s*any\b/, message: 'Explicit any type annotation' },
  { pattern: /<any>/, message: 'Any type assertion' },
  { pattern: /as any/, message: 'Any type assertion' },
];

function scanDirectory(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(dir);
  return files;
}

function checkFile(filePath: string): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Check for @ts-ignore and @ts-expect-error
    if (line.includes('@ts-ignore')) {
      violations.push({
        category: 'typescript-strict',
        severity: 'high',
        filePath,
        lineNumber: index + 1,
        message: 'Use of @ts-ignore suppression comment',
      });
    }
    
    if (line.includes('@ts-expect-error')) {
      violations.push({
        category: 'typescript-strict',
        severity: 'high',
        filePath,
        lineNumber: index + 1,
        message: 'Use of @ts-expect-error suppression comment',
      });
    }
    
    // Check for explicit any (excluding comments)
    const lineWithoutComment = line.split('//')[0];
    if (/:\s*any\b/.test(lineWithoutComment) && !line.includes('// any is ok')) {
      violations.push({
        category: 'typescript-strict',
        severity: 'medium',
        filePath,
        lineNumber: index + 1,
        message: 'Explicit any type annotation',
      });
    }
    
    // Check for as any
    if (/as any/.test(lineWithoutComment)) {
      violations.push({
        category: 'typescript-strict',
        severity: 'medium',
        filePath,
        lineNumber: index + 1,
        message: 'Type assertion to any',
      });
    }
  });
  
  return violations;
}

function runTypeScriptCompilation(): AuditViolation[] {
  const violations: AuditViolation[] = [];
  
  try {
    // Run tsc --noEmit
    execSync('npx tsc --noEmit --strict', { 
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    console.log('✓ TypeScript compilation passed');
  } catch (error: any) {
    // Parse compilation errors
    const output = error.stdout || error.stderr || '';
    const errorLines = output.split('\n');
    
    errorLines.forEach((line: string) => {
      // Match error format: file.ts(line,col): error TSXXXX: message
      const match = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/);
      if (match) {
        violations.push({
          category: 'typescript-strict',
          severity: 'critical',
          filePath: match[1],
          lineNumber: parseInt(match[2], 10),
          message: `${match[3]}: ${match[4]}`,
        });
      }
    });
  }
  
  return violations;
}

async function runAudit(): Promise<AuditReport> {
  console.log('Running TypeScript Strict Mode Audit...\n');
  
  const violations: AuditViolation[] = [];
  
  // 1. Scan for @ts-ignore, @ts-expect-error, explicit any
  console.log('Scanning for suppression comments and any types...');
  for (const dir of SRC_DIRS) {
    const files = scanDirectory(dir);
    console.log(`  Found ${files.length} files in ${dir}`);
    
    for (const file of files) {
      const fileViolations = checkFile(file);
      violations.push(...fileViolations);
    }
  }
  
  // 2. Run TypeScript compilation
  console.log('\nRunning TypeScript compilation...');
  const compileViolations = runTypeScriptCompilation();
  violations.push(...compileViolations);
  
  // Generate report
  const report: AuditReport = {
    category: 'typescript-strict',
    totalViolations: violations.length,
    violations,
  };
  
  // Output results
  console.log(`\n${'='.repeat(60)}`);
  console.log('TypeScript Strict Mode Audit Report');
  console.log('='.repeat(60));
  console.log(`Total violations: ${violations.length}`);
  
  // Group by severity
  const bySeverity = {
    critical: violations.filter(v => v.severity === 'critical'),
    high: violations.filter(v => v.severity === 'high'),
    medium: violations.filter(v => v.severity === 'medium'),
    low: violations.filter(v => v.severity === 'low'),
  };
  
  console.log(`\nBy severity:`);
  console.log(`  Critical: ${bySeverity.critical.length}`);
  console.log(`  High: ${bySeverity.high.length}`);
  console.log(`  Medium: ${bySeverity.medium.length}`);
  console.log(`  Low: ${bySeverity.low.length}`);
  
  // Print first 20 violations
  if (violations.length > 0) {
    console.log(`\nFirst 20 violations:`);
    violations.slice(0, 20).forEach(v => {
      console.log(`  [${v.severity.toUpperCase()}] ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
    });
    
    if (violations.length > 20) {
      console.log(`  ... and ${violations.length - 20} more`);
    }
  }
  
  // Write JSON report
  const reportPath = 'typescript-strict-audit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);
  
  return report;
}

// Run the audit
runAudit().then(report => {
  process.exit(report.totalViolations > 0 ? 1 : 0);
}).catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
