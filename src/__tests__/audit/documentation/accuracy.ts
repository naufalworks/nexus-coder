/**
 * Documentation Accuracy Checker Module
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 *
 * Verifies documentation accuracy against actual codebase:
 * - README.md installation commands
 * - QUICKSTART.md workflow steps
 * - NEXUS_V2_SPEC.md architecture matches src/
 * - Code example API signatures
 * - Key Exports section against src/index.ts
 * - General documentation accuracy validation
 *
 * @module audit/documentation/accuracy
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditModule, AuditReport, AuditViolation } from '../framework/types';

/**
 * Documentation violation types.
 */
export type DocumentationViolationType =
  | 'outdated-command'
  | 'outdated-api-signature'
  | 'stale-diagram'
  | 'missing-export'
  | 'incorrect-export'
  | 'outdated-workflow';

/**
 * Extended violation interface for documentation issues.
 */
export interface DocumentationViolation extends AuditViolation {
  category: 'documentation-accuracy';
  /** Type of documentation issue */
  violationType: DocumentationViolationType;
  /** Document path */
  documentPath: string;
  /** Section affected */
  section?: string;
  /** Expected content or correction */
  expectedCorrection?: string;
}

/**
 * Configuration options for the documentation accuracy checker.
 */
export interface DocumentationAccuracyConfig {
  /** Root directory to check (default: '.') */
  rootDir: string;
  /** Documentation files to check */
  documentFiles: string[];
  /** Source index file to compare exports */
  indexFile: string;
}

/**
 * Default configuration for documentation accuracy checker.
 */
const DEFAULT_CONFIG: DocumentationAccuracyConfig = {
  rootDir: '.',
  documentFiles: ['README.md', 'QUICKSTART.md', 'NEXUS_V2_SPEC.md'],
  indexFile: 'src/index.ts',
};

/**
 * Documentation Accuracy Checker Module
 *
 * Implements the AuditModule interface to validate documentation
 * accuracy against the actual codebase.
 *
 * @example
 * ```typescript
 * const checker = new DocumentationAccuracyChecker();
 * const report = await checker.run();
 *
 * console.log(`Documentation violations: ${report.totalViolations}`);
 * ```
 */
export class DocumentationAccuracyChecker implements AuditModule {
  readonly category = 'documentation-accuracy' as const;
  readonly name = 'Documentation Accuracy Checker';

  private config: DocumentationAccuracyConfig;

  /**
   * Create a new documentation accuracy checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<DocumentationAccuracyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the documentation accuracy audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: DocumentationViolation[] = [];

    // Requirement 14.1: Verify README.md installation commands
    violations.push(...this.checkReadmeInstallation());

    // Requirement 14.2: Verify QUICKSTART.md workflow steps
    violations.push(...this.checkQuickstartWorkflow());

    // Requirement 14.5: Check Key Exports section against src/index.ts
    violations.push(...this.checkKeyExports());

    // Requirement 14.3: Check NEXUS_V2_SPEC.md architecture matches src/
    violations.push(...this.checkArchitectureDocumentation());

    // Requirement 14.4: Verify code example API signatures
    violations.push(...this.checkCodeExamples());

    const bySeverity = this.groupBySeverity(violations);
    const byType = this.groupByType(violations);

    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        documentsChecked: this.config.documentFiles.length,
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
   * Requirement 14.1: Verify README.md installation commands.
   */
  private checkReadmeInstallation(): DocumentationViolation[] {
    const violations: DocumentationViolation[] = [];
    const readmePath = path.join(this.config.rootDir, 'README.md');

    if (!this.fileExists(readmePath)) {
      return violations;
    }

    const content = fs.readFileSync(readmePath, 'utf-8');

    // Check for common installation commands
    const expectedCommands = [
      'npm install',
      'docker run',
      'cp .env.example .env',
    ];

    for (const cmd of expectedCommands) {
      if (!content.includes(cmd)) {
        violations.push(this.createViolation(
          readmePath,
          'outdated-command',
          `README.md missing expected installation command: ${cmd}`,
          'medium',
          'Installation',
          `Add command: ${cmd}`
        ));
      }
    }

    // Check for package.json existence
    const packageJsonPath = path.join(this.config.rootDir, 'package.json');
    if (this.fileExists(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      // Verify npm scripts mentioned in README exist
      const scriptPatterns = [
        { pattern: /npm (run )?test/g, script: 'test' },
        { pattern: /npm (run )?build/g, script: 'build' },
        { pattern: /npm (run )?dev/g, script: 'dev' },
      ];

      for (const { pattern, script } of scriptPatterns) {
        if (content.match(pattern) && !packageJson.scripts?.[script]) {
          violations.push(this.createViolation(
            readmePath,
            'outdated-command',
            `README.md references npm script '${script}' that doesn't exist in package.json`,
            'high',
            'Installation',
            `Remove reference to '${script}' or add it to package.json`
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 14.2: Verify QUICKSTART.md workflow steps.
   */
  private checkQuickstartWorkflow(): DocumentationViolation[] {
    const violations: DocumentationViolation[] = [];
    const quickstartPath = path.join(this.config.rootDir, 'QUICKSTART.md');

    if (!this.fileExists(quickstartPath)) {
      violations.push(this.createViolation(
        quickstartPath,
        'outdated-workflow',
        'QUICKSTART.md file not found',
        'high',
        'Documentation',
        'Create QUICKSTART.md with workflow steps'
      ));
      return violations;
    }

    const content = fs.readFileSync(quickstartPath, 'utf-8');

    // Check for essential workflow steps
    const expectedSteps = [
      { keyword: 'install', description: 'Installation step' },
      { keyword: 'configure', description: 'Configuration step' },
      { keyword: 'docker', description: 'Docker setup' },
    ];

    for (const { keyword, description } of expectedSteps) {
      const regex = new RegExp(keyword, 'i');
      if (!regex.test(content)) {
        violations.push(this.createViolation(
          quickstartPath,
          'outdated-workflow',
          `QUICKSTART.md missing ${description}`,
          'medium',
          'Workflow',
          `Add section describing ${description}`
        ));
      }
    }

    return violations;
  }

  /**
   * Requirement 14.5: Check Key Exports section against src/index.ts.
   */
  private checkKeyExports(): DocumentationViolation[] {
    const violations: DocumentationViolation[] = [];
    const readmePath = path.join(this.config.rootDir, 'README.md');
    const indexPath = path.join(this.config.rootDir, this.config.indexFile);

    if (!this.fileExists(readmePath) || !this.fileExists(indexPath)) {
      return violations;
    }

    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    // Extract exports from src/index.ts
    const actualExports = this.extractExports(indexContent);

    // Extract exports mentioned in README
    const documentedExports = this.extractDocumentedExports(readmeContent);

    // Check for missing exports in documentation
    for (const exportName of actualExports) {
      if (!documentedExports.has(exportName)) {
        violations.push(this.createViolation(
          readmePath,
          'missing-export',
          `Export '${exportName}' from src/index.ts not documented in README.md Key Exports section`,
          'low',
          'Key Exports',
          `Add '${exportName}' to Key Exports section`
        ));
      }
    }

    // Check for incorrect exports in documentation
    for (const exportName of documentedExports) {
      if (!actualExports.has(exportName)) {
        violations.push(this.createViolation(
          readmePath,
          'incorrect-export',
          `Export '${exportName}' documented in README.md but not found in src/index.ts`,
          'medium',
          'Key Exports',
          `Remove '${exportName}' from Key Exports section or add it to src/index.ts`
        ));
      }
    }

    return violations;
  }

  /**
   * Requirement 14.3: Check NEXUS_V2_SPEC.md architecture matches src/.
   */
  private checkArchitectureDocumentation(): DocumentationViolation[] {
    const violations: DocumentationViolation[] = [];
    const specPath = path.join(this.config.rootDir, 'NEXUS_V2_SPEC.md');

    if (!this.fileExists(specPath)) {
      return violations;
    }

    const content = fs.readFileSync(specPath, 'utf-8');

    // Check for key directories mentioned in architecture
    const keyDirectories = [
      'src/core',
      'src/agents',
      'src/widgets',
      'src/cli',
      'src/types',
    ];

    for (const dir of keyDirectories) {
      const dirPath = path.join(this.config.rootDir, dir);
      const dirExists = this.directoryExists(dirPath);
      const mentionedInSpec = content.includes(dir);

      if (mentionedInSpec && !dirExists) {
        violations.push(this.createViolation(
          specPath,
          'stale-diagram',
          `NEXUS_V2_SPEC.md references directory '${dir}' that doesn't exist`,
          'high',
          'Architecture',
          `Update architecture documentation to reflect actual structure`
        ));
      }
    }

    return violations;
  }

  /**
   * Requirement 14.4: Verify code example API signatures.
   */
  private checkCodeExamples(): DocumentationViolation[] {
    const violations: DocumentationViolation[] = [];
    const readmePath = path.join(this.config.rootDir, 'README.md');

    if (!this.fileExists(readmePath)) {
      return violations;
    }

    const content = fs.readFileSync(readmePath, 'utf-8');

    // Extract code blocks from README
    const codeBlockRegex = /```(?:typescript|ts|javascript|js)\n([\s\S]*?)```/g;
    let match;
    let lineNumber = 1;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const codeBlock = match[1];
      
      // Count lines before this match to get approximate line number
      const beforeMatch = content.substring(0, match.index);
      lineNumber = beforeMatch.split('\n').length;

      // Check for common API patterns that might be outdated
      const apiPatterns = [
        { pattern: /new\s+(\w+)\s*\(/g, type: 'constructor' },
        { pattern: /(\w+)\.(\w+)\s*\(/g, type: 'method' },
      ];

      for (const { pattern, type } of apiPatterns) {
        let apiMatch;
        while ((apiMatch = pattern.exec(codeBlock)) !== null) {
          const apiName = type === 'constructor' ? apiMatch[1] : `${apiMatch[1]}.${apiMatch[2]}`;
          
          // Basic validation - check if the API exists in src/
          if (!this.apiExistsInSource(apiName)) {
            violations.push(this.createViolation(
              readmePath,
              'outdated-api-signature',
              `Code example uses API '${apiName}' that may not exist in current codebase`,
              'low',
              'Code Examples',
              `Verify API signature for '${apiName}'`,
              lineNumber
            ));
          }
        }
      }
    }

    return violations;
  }

  /**
   * Extract exports from index.ts content.
   */
  private extractExports(content: string): Set<string> {
    const exports = new Set<string>();
    
    // Match: export { Name } from './path'
    const namedExportRegex = /export\s+\{\s*([^}]+)\s*\}/g;
    let match;
    
    while ((match = namedExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim());
      names.forEach(name => {
        // Handle "Name as Alias" syntax
        const cleanName = name.split(' as ')[0].trim();
        exports.add(cleanName);
      });
    }

    // Match: export * from './path'
    // Note: We can't determine specific exports from wildcard exports without parsing the target file

    return exports;
  }

  /**
   * Extract documented exports from README content.
   */
  private extractDocumentedExports(content: string): Set<string> {
    const exports = new Set<string>();
    
    // Look for Key Exports section
    const keyExportsMatch = content.match(/##\s+Key Exports[\s\S]*?```(?:typescript|ts)\n([\s\S]*?)```/i);
    
    if (keyExportsMatch) {
      const exportsBlock = keyExportsMatch[1];
      
      // Match: export { Name }
      const exportRegex = /export\s+\{\s*(\w+)\s*\}/g;
      let match;
      
      while ((match = exportRegex.exec(exportsBlock)) !== null) {
        exports.add(match[1]);
      }
    }

    return exports;
  }

  /**
   * Check if an API exists in source files (basic heuristic).
   */
  private apiExistsInSource(apiName: string): boolean {
    // This is a simplified check - in a real implementation,
    // we would use TypeScript compiler API to verify signatures
    const srcDir = path.join(this.config.rootDir, 'src');
    
    if (!this.directoryExists(srcDir)) {
      return true; // Assume valid if src/ doesn't exist
    }

    // For now, just check if the name appears in any source file
    // A more robust implementation would parse TypeScript AST
    try {
      const files = this.getAllSourceFiles(srcDir);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(apiName)) {
          return true;
        }
      }
    } catch {
      return true; // Assume valid on error
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
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Check if a file exists.
   */
  private fileExists(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
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
  private groupBySeverity(violations: DocumentationViolation[]): Record<string, number> {
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
  private groupByType(violations: DocumentationViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.violationType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create a documentation violation object.
   */
  private createViolation(
    documentPath: string,
    violationType: DocumentationViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    section?: string,
    expectedCorrection?: string,
    lineNumber: number = 1
  ): DocumentationViolation {
    return {
      category: 'documentation-accuracy',
      severity,
      filePath: documentPath,
      lineNumber,
      message,
      violationType,
      documentPath,
      section,
      expectedCorrection,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const documentationAccuracyChecker = new DocumentationAccuracyChecker();
