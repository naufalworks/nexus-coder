/**
 * Structure Compliance Checker Module
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 *
 * Scans project directory structure and validates against expected structure:
 * - Define expected directory structure from structure.md
 * - Check for required directories and subdirectories
 * - Verify expected files exist
 * - Report structural deviations with recommendations
 * - General project structure validation
 *
 * @module audit/structure/compliance
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Structure violation types.
 */
export type StructureViolationType =
  | 'missing-directory'
  | 'unexpected-directory'
  | 'missing-expected-file'
  | 'unexpected-file'
  | 'incorrect-structure';

/**
 * Extended violation interface for structure issues.
 */
export interface StructureViolation extends AuditViolation {
  category: 'project-structure';
  /** Type of structural issue */
  violationType: StructureViolationType;
  /** Expected path */
  expectedPath?: string;
  /** Actual path found */
  actualPath?: string;
  /** Recommended action */
  recommendedAction: 'create' | 'move' | 'delete' | 'rename' | 'verify';
}

/**
 * Configuration options for the structure compliance checker.
 */
export interface StructureComplianceConfig {
  /** Root directory to check (default: '.') */
  rootDir: string;
  /** Whether to check for unexpected files/directories */
  checkUnexpected: boolean;
  /** Patterns to exclude from unexpected checks */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for structure compliance checker.
 */
const DEFAULT_CONFIG: StructureComplianceConfig = {
  rootDir: '.',
  checkUnexpected: false,
  excludePatterns: [
    /node_modules/,
    /\.git/,
    /dist/,
    /\.qdrant_storage/,
    /\.nexus-test-data/,
    /logs/,
    /\.DS_Store/,
    /\.env$/,
  ],
};

/**
 * Directory structure specification.
 */
interface DirectorySpec {
  /** Whether this directory must exist */
  mustExist: boolean;
  /** Required subdirectories */
  requiredSubdirs?: string[];
  /** Expected files in this directory */
  expectedFiles?: string[];
  /** Optional description */
  description?: string;
}

/**
 * Expected directory structure from structure.md.
 * 
 * Requirements 12.1, 12.2, 12.3: Define expected structure, check directories, verify files
 */
const EXPECTED_STRUCTURE: Record<string, DirectorySpec> = {
  'src': {
    mustExist: true,
    requiredSubdirs: ['core', 'agents', 'widgets', 'cli', 'types', '__tests__'],
    expectedFiles: ['index.ts', 'index.tsx'],
    description: 'Source code root',
  },
  'src/core': {
    mustExist: true,
    requiredSubdirs: ['context', 'models', 'store', 'git'],
    expectedFiles: ['config.ts', 'event-bus.ts', 'file-writer.ts', 'git-manager.ts', 'logger.ts'],
    description: 'Core infrastructure',
  },
  'src/core/context': {
    mustExist: true,
    requiredSubdirs: ['graph', 'compression', 'memory', 'budget'],
    expectedFiles: ['engine.ts'],
    description: 'Context engine',
  },
  'src/core/context/graph': {
    mustExist: true,
    expectedFiles: ['semantic-graph.ts', 'traversal.ts', 'types.ts'],
    description: 'Semantic Code Graph',
  },
  'src/core/context/compression': {
    mustExist: true,
    expectedFiles: ['compressor.ts', 'ast-compress.ts'],
    description: 'Compression engine',
  },
  'src/core/context/memory': {
    mustExist: true,
    expectedFiles: ['persistent.ts', 'decisions.ts', 'patterns.ts'],
    description: 'Persistent memory',
  },
  'src/core/context/budget': {
    mustExist: true,
    expectedFiles: ['token-budget.ts', 'adaptive.ts'],
    description: 'Token budgets',
  },
  'src/core/git': {
    mustExist: true,
    description: 'Git utilities',
  },
  'src/core/models': {
    mustExist: true,
    expectedFiles: ['unified-client.ts', 'router.ts', 'types.ts'],
    description: 'LLM client layer',
  },
  'src/core/store': {
    mustExist: true,
    expectedFiles: ['vector-store.ts', 'embeddings.ts'],
    description: 'Storage layer',
  },
  'src/agents': {
    mustExist: true,
    requiredSubdirs: ['orchestrator', 'specialized'],
    expectedFiles: ['registry.ts'],
    description: 'Multi-agent system',
  },
  'src/agents/orchestrator': {
    mustExist: true,
    expectedFiles: ['orchestrator.ts', 'planner.ts'],
    description: 'Orchestration layer',
  },
  'src/agents/specialized': {
    mustExist: true,
    expectedFiles: ['context-agent.ts', 'coder-agent.ts', 'reviewer-agent.ts', 'git-agent.ts'],
    description: 'Specialized agents',
  },
  'src/cli': {
    mustExist: true,
    expectedFiles: ['index.ts', 'commands.ts', 'interactive.ts', 'approval-ui.ts'],
    description: 'CLI interface',
  },
  'src/widgets': {
    mustExist: true,
    expectedFiles: [
      'index.ts',
      'IDEShell.tsx',
      'TaskPanel.tsx',
      'DiffApproval.tsx',
      'GraphExplorer.tsx',
      'ReasoningLog.tsx',
      'InContextActions.tsx',
      'AgentStatus.tsx',
      'ResourceFooter.tsx',
      'WidgetSystem.tsx',
    ],
    description: 'React IDE widgets',
  },
  'src/types': {
    mustExist: true,
    expectedFiles: ['index.ts', 'agent.ts', 'config.ts', 'graph.ts', 'task.ts'],
    description: 'TypeScript type definitions',
  },
  'src/__tests__': {
    mustExist: true,
    requiredSubdirs: [
      'accessibility',
      'audit',
      'e2e',
      'helpers',
      'integration',
      'performance',
      'security',
      'types',
      'visual',
    ],
    description: 'Test suites',
  },
};

/**
 * Structure Compliance Checker Module
 *
 * Implements the AuditModule interface to validate project structure
 * against the documented structure in structure.md.
 *
 * @example
 * ```typescript
 * const checker = new StructureComplianceChecker();
 * const report = await checker.run();
 *
 * console.log(`Structure violations: ${report.totalViolations}`);
 * console.log(`Compliance score: ${report.metrics?.complianceScore}%`);
 * ```
 */
export class StructureComplianceChecker implements AuditModule {
  readonly category: AuditCategory = 'project-structure';
  readonly name = 'Structure Compliance Checker';

  private config: StructureComplianceConfig;

  /**
   * Create a new structure compliance checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<StructureComplianceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the structure compliance audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: StructureViolation[] = [];

    // Requirement 12.2: Check for required directories and subdirectories
    violations.push(...this.checkRequiredDirectories());

    // Requirement 12.3: Verify expected files exist
    violations.push(...this.checkExpectedFiles());

    // Calculate metrics
    const totalChecks = this.countTotalChecks();
    const passedChecks = totalChecks - violations.length;
    const complianceScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

    const bySeverity = this.groupBySeverity(violations);
    const byType = this.groupByType(violations);

    // Requirement 12.4: Report structural deviations with recommendations
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        directoriesChecked: Object.keys(EXPECTED_STRUCTURE).length,
        filesChecked: this.countExpectedFiles(),
        totalChecks,
        passedChecks,
        complianceScore,
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
   * Requirement 12.2: Check for required directories and subdirectories.
   */
  private checkRequiredDirectories(): StructureViolation[] {
    const violations: StructureViolation[] = [];

    for (const [dirPath, spec] of Object.entries(EXPECTED_STRUCTURE)) {
      const fullPath = path.join(this.config.rootDir, dirPath);

      // Check if required directory exists
      if (spec.mustExist && !this.directoryExists(fullPath)) {
        violations.push(this.createViolation(
          fullPath,
          'missing-directory',
          `Required directory '${dirPath}' does not exist`,
          'high',
          'create',
          dirPath
        ));
        continue; // Skip subdirectory checks if parent doesn't exist
      }

      // Check required subdirectories
      if (spec.requiredSubdirs && this.directoryExists(fullPath)) {
        for (const subdir of spec.requiredSubdirs) {
          const subdirPath = path.join(fullPath, subdir);
          const relativePath = path.join(dirPath, subdir);

          if (!this.directoryExists(subdirPath)) {
            violations.push(this.createViolation(
              subdirPath,
              'missing-directory',
              `Required subdirectory '${relativePath}' does not exist`,
              'medium',
              'create',
              relativePath
            ));
          }
        }
      }
    }

    return violations;
  }

  /**
   * Requirement 12.3: Verify expected files exist.
   */
  private checkExpectedFiles(): StructureViolation[] {
    const violations: StructureViolation[] = [];

    for (const [dirPath, spec] of Object.entries(EXPECTED_STRUCTURE)) {
      const fullDirPath = path.join(this.config.rootDir, dirPath);

      // Skip if directory doesn't exist (already reported)
      if (!this.directoryExists(fullDirPath)) {
        continue;
      }

      // Check expected files
      if (spec.expectedFiles) {
        for (const fileName of spec.expectedFiles) {
          const filePath = path.join(fullDirPath, fileName);
          const relativeFilePath = path.join(dirPath, fileName);

          if (!this.fileExists(filePath)) {
            violations.push(this.createViolation(
              filePath,
              'missing-expected-file',
              `Expected file '${relativeFilePath}' does not exist`,
              'medium',
              'create',
              relativeFilePath
            ));
          }
        }
      }
    }

    return violations;
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
   * Count total checks performed.
   */
  private countTotalChecks(): number {
    let total = 0;

    for (const spec of Object.values(EXPECTED_STRUCTURE)) {
      // Count directory check
      if (spec.mustExist) {
        total++;
      }

      // Count subdirectory checks
      if (spec.requiredSubdirs) {
        total += spec.requiredSubdirs.length;
      }

      // Count file checks
      if (spec.expectedFiles) {
        total += spec.expectedFiles.length;
      }
    }

    return total;
  }

  /**
   * Count expected files.
   */
  private countExpectedFiles(): number {
    let total = 0;

    for (const spec of Object.values(EXPECTED_STRUCTURE)) {
      if (spec.expectedFiles) {
        total += spec.expectedFiles.length;
      }
    }

    return total;
  }

  /**
   * Group violations by severity.
   */
  private groupBySeverity(violations: StructureViolation[]): Record<string, number> {
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
  private groupByType(violations: StructureViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.violationType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create a structure violation object.
   */
  private createViolation(
    filePath: string,
    violationType: StructureViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    recommendedAction: 'create' | 'move' | 'delete' | 'rename' | 'verify',
    expectedPath?: string,
    actualPath?: string
  ): StructureViolation {
    return {
      category: 'project-structure',
      severity,
      filePath,
      lineNumber: 1,
      message,
      violationType,
      recommendedAction,
      expectedPath,
      actualPath,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const structureComplianceChecker = new StructureComplianceChecker();
