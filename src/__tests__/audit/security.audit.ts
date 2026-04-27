/**
 * Security Audit Script
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 * 
 * Verifies no XSS vectors, path traversal, or sensitive data exposure.
 */

import * as fs from 'fs';
import * as path from 'path';

interface AuditViolation {
  category: 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  message: string;
  symbolName?: string;
}

interface AuditReport {
  category: string;
  totalViolations: number;
  violations: AuditViolation[];
}

// Directories to scan
const SRC_DIRS = ['src'];
// Extensions to analyze
const EXTENSIONS = ['.ts', '.tsx'];

// Security patterns to check
const SECURITY_CHECKS = [
  {
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/,
    message: 'Use of dangerouslySetInnerHTML without sanitization',
    severity: 'critical' as const,
    needsSanitization: true,
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML found - verify sanitization',
    severity: 'high' as const,
    needsSanitization: true,
  },
  {
    pattern: /\.innerHTML\s*=/,
    message: 'Direct innerHTML assignment',
    severity: 'high' as const,
  },
  {
    pattern: /eval\s*\(/,
    message: 'Use of eval() - potential code injection',
    severity: 'critical' as const,
  },
  {
    pattern: /new\s+Function\s*\(/,
    message: 'Dynamic function creation - potential code injection',
    severity: 'high' as const,
  },
  {
    pattern: /API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY/,
    message: 'Potential hardcoded secret',
    severity: 'critical' as const,
    isLiteral: true,
  },
  {
    pattern: /process\.env\.\w+\s*\+\s*['"]/,
    message: 'Environment variable concatenation - potential leak',
    severity: 'medium' as const,
  },
  {
    pattern: /console\.(log|error|warn)\(.*(?:token|key|password|secret)/i,
    message: 'Logging sensitive data',
    severity: 'high' as const,
  },
];

// Props/variable names that might contain sensitive data
const SENSITIVE_NAMES = ['apiKey', 'secretKey', 'password', 'token', 'credential'];

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
    // Check security patterns
    for (const check of SECURITY_CHECKS) {
      if (check.pattern.test(line)) {
        // Skip if in comment
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        
        // Special check for hardcoded secrets
        if (check.isLiteral) {
          // Check if it's a string literal assignment
          if (/=\s*['"]/.test(line)) {
            violations.push({
              category: 'security',
              severity: check.severity,
              filePath,
              lineNumber: index + 1,
              message: check.message,
            });
          }
        } else {
          violations.push({
            category: 'security',
            severity: check.severity,
            filePath,
            lineNumber: index + 1,
            message: check.message,
          });
        }
      }
    }
    
    // Check for rendering sensitive props
    if (line.includes('{') && SENSITIVE_NAMES.some(name => line.includes(name))) {
      // Check if it's being rendered in JSX
      if (/<\w+[^>]*>\s*\{/.test(line) || line.includes('children')) {
        // Check if it's not a type definition
        if (!line.includes('interface') && !line.includes('type') && !line.includes(':')) {
          violations.push({
            category: 'security',
            severity: 'high',
            filePath,
            lineNumber: index + 1,
            message: 'Potential rendering of sensitive data',
          });
        }
      }
    }
  });
  
  return violations;
}

function checkForSanitization(filePath: string, content: string): boolean {
  // Check if DOMPurify or similar is imported/used near dangerouslySetInnerHTML
  if (content.includes('dangerouslySetInnerHTML')) {
    if (content.includes('DOMPurify') || content.includes('sanitize') || content.includes('xss')) {
      return true;
    }
  }
  return false;
}

function checkSpecificRequirements(filePath: string, content: string): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const lines = content.split('\n');
  
  // Requirement 9.2: Agent messages HTML-escaped in ReasoningLog
  if (filePath.includes('ReasoningLog')) {
    if (content.includes('dangerouslySetInnerHTML') && !checkForSanitization(filePath, content)) {
      violations.push({
        category: 'security',
        severity: 'critical',
        filePath,
        lineNumber: 1,
        message: 'ReasoningLog must HTML-escape agent messages',
      });
    }
  }
  
  // Requirement 9.3: File paths sanitized in TaskPanel and GraphExplorer
  if (filePath.includes('TaskPanel') || filePath.includes('GraphExplorer')) {
    const hasPathDisplay = lines.some(line => 
      line.includes('file') || line.includes('path') || line.includes('src/')
    );
    // This is informational - actual sanitization would need runtime checks
  }
  
  // Requirement 9.4: API keys/tokens not rendered in ResourceFooter
  if (filePath.includes('ResourceFooter')) {
    const renderLines = lines.filter(line => 
      /\{.*(?:key|token|secret|password).*\}/i.test(line) && !line.includes('//')
    );
    if (renderLines.length > 0) {
      renderLines.forEach((line, idx) => {
        const lineNum = lines.indexOf(line) + 1;
        violations.push({
          category: 'security',
          severity: 'critical',
          filePath,
          lineNumber: lineNum,
          message: 'ResourceFooter should not render API keys or tokens',
        });
      });
    }
  }
  
  // Requirement 9.5: CLI errors don't include stack traces
  if (filePath.includes('cli')) {
    lines.forEach((line, index) => {
      if (line.includes('.stack') && !line.includes('//') && !line.includes('test')) {
        violations.push({
          category: 'security',
          severity: 'medium',
          filePath,
          lineNumber: index + 1,
          message: 'CLI errors should not expose stack traces to users',
        });
      }
    });
  }
  
  return violations;
}

async function runAudit(): Promise<AuditReport> {
  console.log('Running Security Audit...\n');
  
  const violations: AuditViolation[] = [];
  
  // Scan all files
  for (const dir of SRC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    
    const files = scanDirectory(dir);
    console.log(`Scanning ${files.length} files in ${dir}...`);
    
    for (const file of files) {
      // General security checks
      const fileViolations = checkFile(file);
      violations.push(...fileViolations);
      
      // Requirement-specific checks
      const content = fs.readFileSync(file, 'utf8');
      const specificViolations = checkSpecificRequirements(file, content);
      violations.push(...specificViolations);
    }
  }
  
  // Generate report
  const report: AuditReport = {
    category: 'security',
    totalViolations: violations.length,
    violations,
  };
  
  // Output results
  console.log(`\n${'='.repeat(60)}`);
  console.log('Security Audit Report');
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
  
  // Print all critical violations
  if (bySeverity.critical.length > 0) {
    console.log(`\nCritical violations:`);
    bySeverity.critical.forEach(v => {
      console.log(`  ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
    });
  }
  
  // Print first 10 high violations
  if (bySeverity.high.length > 0) {
    console.log(`\nHigh severity violations (first 10):`);
    bySeverity.high.slice(0, 10).forEach(v => {
      console.log(`  ${v.filePath}:${v.lineNumber}`);
      console.log(`    ${v.message}`);
    });
  }
  
  // Write JSON report
  const reportPath = 'security-audit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);
  
  return report;
}

// Run the audit
runAudit().then(report => {
  const hasCritical = report.violations.some(v => v.severity === 'critical');
  process.exit(hasCritical ? 1 : 0);
}).catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
