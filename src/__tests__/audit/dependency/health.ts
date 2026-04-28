/**
 * Dependency Health Checker for Nexus Coder V2
 * 
 * This module provides utilities for analyzing dependency health including
 * outdated packages, security vulnerabilities, unused dependencies, and
 * misplaced devDependencies.
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 * 
 * @module audit/dependency/health
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependency status information from npm outdated
 */
export interface DependencyStatus {
  /** Package name */
  package: string;
  /** Current installed version */
  current: string;
  /** Wanted version (satisfies semver range) */
  wanted: string;
  /** Latest version available */
  latest: string;
  /** Dependency type */
  type: 'dependencies' | 'devDependencies';
  /** Whether it's outdated */
  isOutdated: boolean;
}

/**
 * Security vulnerability information from npm audit
 */
export interface SecurityVulnerability {
  /** Package name */
  package: string;
  /** Vulnerability severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Vulnerability title */
  title: string;
  /** Recommended version or action */
  recommendation: string;
  /** CVE identifier (if available) */
  cve?: string;
  /** Vulnerable version range */
  vulnerableVersions?: string;
}

/**
 * Misplaced dependency information
 */
export interface DependencyMisplacement {
  /** Package name */
  package: string;
  /** Current location */
  currentLocation: 'dependencies' | 'devDependencies';
  /** Recommended location */
  recommendedLocation: 'dependencies' | 'devDependencies';
  /** Reason for recommendation */
  reason: string;
}

/**
 * Comprehensive dependency health report
 */
export interface DependencyHealthReport {
  /** Outdated packages */
  outdated: DependencyStatus[];
  /** Security vulnerabilities */
  vulnerabilities: SecurityVulnerability[];
  /** Unused dependencies */
  unused: string[];
  /** Misplaced dependencies */
  misplaced: DependencyMisplacement[];
  /** Overall health status */
  healthStatus: 'healthy' | 'warning' | 'critical';
  /** Summary statistics */
  summary: {
    totalDependencies: number;
    outdatedCount: number;
    vulnerabilityCount: number;
    unusedCount: number;
    misplacedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Outdated Package Detection
// ---------------------------------------------------------------------------

/**
 * Check for outdated packages using npm outdated.
 * 
 * Runs `npm outdated --json` to detect packages that are not at the latest
 * stable version within their major version range.
 * 
 * Validates: Requirement 13.1
 * 
 * @returns Array of outdated dependency status objects
 */
export function checkOutdatedPackages(): DependencyStatus[] {
  try {
    // Run npm outdated with JSON output
    // Note: npm outdated exits with code 1 when outdated packages exist
    const output = execSync('npm outdated --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    return parseOutdatedOutput(output);
  } catch (error: any) {
    // npm outdated exits with non-zero when packages are outdated
    if (error.stdout) {
      return parseOutdatedOutput(error.stdout);
    }
    return [];
  }
}

/**
 * Parse npm outdated JSON output into DependencyStatus objects.
 * 
 * @param output - JSON output from npm outdated
 * @returns Array of dependency status objects
 */
function parseOutdatedOutput(output: string): DependencyStatus[] {
  if (!output || output.trim() === '') {
    return [];
  }

  try {
    const outdatedData = JSON.parse(output);
    const results: DependencyStatus[] = [];

    for (const [packageName, info] of Object.entries(outdatedData)) {
      const pkgInfo = info as any;
      results.push({
        package: packageName,
        current: pkgInfo.current || 'unknown',
        wanted: pkgInfo.wanted || pkgInfo.current || 'unknown',
        latest: pkgInfo.latest || 'unknown',
        type: pkgInfo.type || 'dependencies',
        isOutdated: pkgInfo.current !== pkgInfo.latest,
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Security Vulnerability Detection
// ---------------------------------------------------------------------------

/**
 * Check for security vulnerabilities using npm audit.
 * 
 * Runs `npm audit --json` to detect known high or critical severity
 * security vulnerabilities in dependencies.
 * 
 * Validates: Requirement 13.2
 * 
 * @returns Array of security vulnerability objects
 */
export function checkSecurityVulnerabilities(): SecurityVulnerability[] {
  try {
    // Run npm audit with JSON output
    const output = execSync('npm audit --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    return parseAuditOutput(output);
  } catch (error: any) {
    // npm audit exits with non-zero when vulnerabilities exist
    if (error.stdout) {
      return parseAuditOutput(error.stdout);
    }
    return [];
  }
}

/**
 * Parse npm audit JSON output into SecurityVulnerability objects.
 * 
 * @param output - JSON output from npm audit
 * @returns Array of security vulnerability objects
 */
function parseAuditOutput(output: string): SecurityVulnerability[] {
  if (!output || output.trim() === '') {
    return [];
  }

  try {
    const auditData = JSON.parse(output);
    const results: SecurityVulnerability[] = [];

    // npm audit v7+ format
    if (auditData.vulnerabilities) {
      for (const [packageName, vulnInfo] of Object.entries(auditData.vulnerabilities)) {
        const vuln = vulnInfo as any;
        
        // Only include high and critical vulnerabilities
        if (vuln.severity === 'high' || vuln.severity === 'critical') {
          results.push({
            package: packageName,
            severity: vuln.severity,
            title: vuln.via?.[0]?.title || 'Security vulnerability',
            recommendation: vuln.fixAvailable 
              ? `Update to ${vuln.fixAvailable.version || 'latest'}`
              : 'No fix available',
            cve: vuln.via?.[0]?.cve || undefined,
            vulnerableVersions: vuln.range || undefined,
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unused Dependency Detection
// ---------------------------------------------------------------------------

/**
 * Identify unused dependencies by analyzing imports in src/.
 * 
 * Scans all TypeScript files in src/ for import statements and compares
 * against dependencies listed in package.json to find packages with no
 * import references.
 * 
 * Validates: Requirement 13.3
 * 
 * @param srcDir - Source directory to scan (default: 'src')
 * @param packageJsonPath - Path to package.json (default: 'package.json')
 * @returns Array of unused dependency names
 */
export function identifyUnusedDependencies(
  srcDir: string = 'src',
  packageJsonPath: string = 'package.json'
): string[] {
  try {
    // Read package.json
    const packageJsonFullPath = path.join(process.cwd(), packageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf-8'));
    
    const dependencies = Object.keys(packageJson.dependencies || {});
    
    // Get all imports from source files
    const imports = extractImportsFromSource(srcDir);
    
    // Find dependencies with no import references
    const unused: string[] = [];
    
    for (const dep of dependencies) {
      // Check if dependency is imported anywhere
      const isUsed = imports.some(imp => {
        // Direct import: import ... from 'package'
        if (imp === dep) return true;
        // Scoped package: import ... from '@scope/package'
        if (imp.startsWith(dep + '/')) return true;
        // Sub-path import: import ... from 'package/subpath'
        if (dep.includes('/') && imp.startsWith(dep)) return true;
        return false;
      });
      
      if (!isUsed) {
        unused.push(dep);
      }
    }
    
    return unused;
  } catch {
    return [];
  }
}

/**
 * Extract all import statements from TypeScript files in a directory.
 * 
 * @param srcDir - Source directory to scan
 * @returns Array of imported package names
 */
function extractImportsFromSource(srcDir: string): string[] {
  const imports = new Set<string>();
  const srcPath = path.join(process.cwd(), srcDir);
  
  if (!fs.existsSync(srcPath)) {
    return [];
  }
  
  // Recursively scan all .ts and .tsx files
  const files = getAllTypeScriptFiles(srcPath);
  
  // Regex to match import statements
  const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Extract ES6 imports
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Only include external packages (not relative imports)
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          imports.add(importPath);
        }
      }
      
      // Extract CommonJS requires
      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          imports.add(importPath);
        }
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }
  
  return Array.from(imports);
}

/**
 * Recursively get all TypeScript files in a directory.
 * 
 * @param dir - Directory to scan
 * @returns Array of absolute file paths
 */
function getAllTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          files.push(...getAllTypeScriptFiles(fullPath));
        }
      } else if (entry.isFile()) {
        // Include .ts and .tsx files
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }
  
  return files;
}

// ---------------------------------------------------------------------------
// Misplaced Dependency Detection
// ---------------------------------------------------------------------------

/**
 * Identify misplaced devDependencies that should be dependencies.
 * 
 * Checks if any production dependencies (used in src/) are listed in
 * devDependencies instead of dependencies.
 * 
 * Validates: Requirement 13.4
 * 
 * @param srcDir - Source directory to scan (default: 'src')
 * @param packageJsonPath - Path to package.json (default: 'package.json')
 * @returns Array of misplaced dependency objects
 */
export function identifyMisplacedDependencies(
  srcDir: string = 'src',
  packageJsonPath: string = 'package.json'
): DependencyMisplacement[] {
  try {
    // Read package.json
    const packageJsonFullPath = path.join(process.cwd(), packageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf-8'));
    
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    
    // Get all imports from source files (production code)
    const imports = extractImportsFromSource(srcDir);
    
    const misplaced: DependencyMisplacement[] = [];
    
    // Check if any devDependencies are used in production code
    for (const devDep of devDependencies) {
      const isUsedInProduction = imports.some(imp => {
        if (imp === devDep) return true;
        if (imp.startsWith(devDep + '/')) return true;
        if (devDep.includes('/') && imp.startsWith(devDep)) return true;
        return false;
      });
      
      if (isUsedInProduction) {
        misplaced.push({
          package: devDep,
          currentLocation: 'devDependencies',
          recommendedLocation: 'dependencies',
          reason: `Package is imported in ${srcDir}/ (production code)`,
        });
      }
    }
    
    return misplaced;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Health Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive dependency health report.
 * 
 * Combines all dependency health checks into a single report with
 * overall health status and summary statistics.
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 * 
 * @param srcDir - Source directory to scan (default: 'src')
 * @param packageJsonPath - Path to package.json (default: 'package.json')
 * @returns Complete dependency health report
 */
export function generateDependencyHealthReport(
  srcDir: string = 'src',
  packageJsonPath: string = 'package.json'
): DependencyHealthReport {
  // Run all health checks
  const outdated = checkOutdatedPackages();
  const vulnerabilities = checkSecurityVulnerabilities();
  const unused = identifyUnusedDependencies(srcDir, packageJsonPath);
  const misplaced = identifyMisplacedDependencies(srcDir, packageJsonPath);
  
  // Read package.json for total count
  let totalDependencies = 0;
  try {
    const packageJsonFullPath = path.join(process.cwd(), packageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf-8'));
    totalDependencies = 
      Object.keys(packageJson.dependencies || {}).length +
      Object.keys(packageJson.devDependencies || {}).length;
  } catch {
    // Ignore errors
  }
  
  // Determine overall health status
  const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical').length;
  const highVulns = vulnerabilities.filter(v => v.severity === 'high').length;
  
  let healthStatus: 'healthy' | 'warning' | 'critical';
  if (criticalVulns > 0) {
    healthStatus = 'critical';
  } else if (highVulns > 0 || outdated.length > 5 || misplaced.length > 0) {
    healthStatus = 'warning';
  } else {
    healthStatus = 'healthy';
  }
  
  return {
    outdated,
    vulnerabilities,
    unused,
    misplaced,
    healthStatus,
    summary: {
      totalDependencies,
      outdatedCount: outdated.length,
      vulnerabilityCount: vulnerabilities.length,
      unusedCount: unused.length,
      misplacedCount: misplaced.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Format a dependency health report for console output.
 * 
 * @param report - Dependency health report to format
 * @returns Formatted string
 */
export function formatDependencyHealthReport(report: DependencyHealthReport): string {
  const lines = [
    '\n=== Dependency Health Report ===\n',
  ];
  
  // Health status
  const statusIcon = report.healthStatus === 'healthy' ? '✓' : 
                     report.healthStatus === 'warning' ? '⚠' : '✗';
  lines.push(`Overall Health: ${statusIcon} ${report.healthStatus.toUpperCase()}\n`);
  
  // Summary
  lines.push('Summary:');
  lines.push(`  Total Dependencies: ${report.summary.totalDependencies}`);
  lines.push(`  Outdated: ${report.summary.outdatedCount}`);
  lines.push(`  Vulnerabilities: ${report.summary.vulnerabilityCount}`);
  lines.push(`  Unused: ${report.summary.unusedCount}`);
  lines.push(`  Misplaced: ${report.summary.misplacedCount}`);
  lines.push('');
  
  // Outdated packages
  if (report.outdated.length > 0) {
    lines.push('Outdated Packages:');
    for (const pkg of report.outdated) {
      lines.push(`  ${pkg.package}: ${pkg.current} → ${pkg.latest} (${pkg.type})`);
    }
    lines.push('');
  }
  
  // Security vulnerabilities
  if (report.vulnerabilities.length > 0) {
    lines.push('Security Vulnerabilities:');
    for (const vuln of report.vulnerabilities) {
      const severityIcon = vuln.severity === 'critical' ? '🔴' : '🟠';
      lines.push(`  ${severityIcon} ${vuln.package} [${vuln.severity.toUpperCase()}]`);
      lines.push(`     ${vuln.title}`);
      lines.push(`     ${vuln.recommendation}`);
      if (vuln.cve) {
        lines.push(`     CVE: ${vuln.cve}`);
      }
    }
    lines.push('');
  }
  
  // Unused dependencies
  if (report.unused.length > 0) {
    lines.push('Unused Dependencies:');
    for (const pkg of report.unused) {
      lines.push(`  ${pkg}`);
    }
    lines.push('');
  }
  
  // Misplaced dependencies
  if (report.misplaced.length > 0) {
    lines.push('Misplaced Dependencies:');
    for (const mis of report.misplaced) {
      lines.push(`  ${mis.package}: ${mis.currentLocation} → ${mis.recommendedLocation}`);
      lines.push(`     Reason: ${mis.reason}`);
    }
    lines.push('');
  }
  
  // All clear message
  if (report.healthStatus === 'healthy' && 
      report.outdated.length === 0 && 
      report.unused.length === 0 && 
      report.misplaced.length === 0) {
    lines.push('✓ All dependencies are healthy!');
    lines.push('');
  }
  
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  checkOutdatedPackages,
  checkSecurityVulnerabilities,
  identifyUnusedDependencies,
  identifyMisplacedDependencies,
  generateDependencyHealthReport,
  formatDependencyHealthReport,
};
