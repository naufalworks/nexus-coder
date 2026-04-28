/**
 * Architecture Boundary Checker Module
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * Validates architectural boundaries defined in structure.md:
 * - core/ should only contain infrastructure code, not agent logic or UI components
 * - agents/ should only contain agent-related code, not UI components or direct file operations
 * - widgets/ should only contain React components and related UI logic
 * - cli/ should only contain CLI-related code, not direct agent or widget imports
 *
 * Detects violations where code imports from directories it shouldn't access
 * and suggests correct locations for misplaced code.
 *
 * @module audit/architecture/boundary-checker
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Module boundary types for architecture violations.
 */
export type BoundaryType =
  | 'core-to-agent'
  | 'core-to-widget'
  | 'agent-to-widget'
  | 'widget-to-agent'
  | 'cli-to-agent'
  | 'cli-to-widget'
  | 'unauthorized-import';

/**
 * Extended violation interface for architecture boundary issues.
 */
export interface ArchitectureViolation extends AuditViolation {
  category: 'architecture-compliance';
  /** Module boundary that was crossed */
  boundaryType: BoundaryType;
  /** File that contains the violation */
  sourcePath: string;
  /** The import path that caused the violation */
  importPath: string;
  /** Correct location suggestion for the code */
  correctLocation: string;
}

/**
 * Configuration for architecture boundary rules per directory.
 */
export interface DirectoryBoundaryRules {
  /** Directory path this rule applies to */
  directory: string;
  /** Allowed import patterns (can be exact paths or regex patterns) */
  allowedImports: string[];
  /** Disallowed import patterns (take precedence over allowed) */
  disallowedImports: string[];
  /** Description of what content should be in this directory */
  expectedContent: string;
  /** Suggestion for relocated code when violations found */
  relocationSuggestion: string;
}

/**
 * Configuration options for the architecture boundary checker.
 */
export interface ArchitectureBoundaryConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Custom boundary rules (merged with defaults) */
  customRules?: DirectoryBoundaryRules[];
}

/**
 * Default architecture boundary rules based on structure.md.
 *
 * Architectural boundaries:
 * - core/: Infrastructure code only. Can import from types. Cannot import from agents, widgets, cli.
 * - agents/: Agent logic only. Can import from core, types. Cannot import from widgets, direct file ops.
 * - widgets/: React components only. Can import from core, types, agents (via registry). Cannot import directly from agents internals, file operations.
 * - cli/: CLI code only. Can import from core, types, agents (via registry). Cannot import from widgets, direct agent internals.
 * - types/: Type definitions only. Cannot import from other src directories.
 */
const DEFAULT_BOUNDARY_RULES: DirectoryBoundaryRules[] = [
  {
    directory: 'src/core',
    allowedImports: [
      '@types/*',
      './types',
      './context',
      './models',
      './store',
      './git',
      'fs',
      'path',
      'events',
      'child_process',
      'crypto',
      'util',
      'os',
      'stream',
    ],
    disallowedImports: [
      '@agents/*',
      'src/agents',
      '../agents',
      './agents',
      '@widgets/*',
      'src/widgets',
      '../widgets',
      '.tsx',
    ],
    expectedContent: 'Infrastructure code (config, event-bus, logger, file-writer)',
    relocationSuggestion: 'Move agent-related code to src/agents/ or UI-related code to src/widgets/',
  },
  {
    directory: 'src/agents',
    allowedImports: [
      '@core/*',
      '@types/*',
      './orchestrator',
      './specialized',
    ],
    disallowedImports: [
      '@widgets/*',
      'src/widgets',
      '../widgets',
      '.tsx',
      'react',
      'React',
      'fs.',
      'fs/',
      'writeFile',
    ],
    expectedContent: 'Agent logic (orchestrator, specialized agents, registry)',
    relocationSuggestion: 'Move UI components to src/widgets/ and file operations to src/core/file-writer.ts',
  },
  {
    directory: 'src/widgets',
    allowedImports: [
      '@core/*',
      '@types/*',
      '@agents/registry',
      './',
      'react',
      'react-dom',
    ],
    disallowedImports: [
      '@agents/orchestrator',
      '@agents/specialized',
      'src/agents/orchestrator',
      'src/agents/specialized',
      '../agents/orchestrator',
      '../agents/specialized',
      'fs.',
      'fs/',
      'writeFile',
    ],
    expectedContent: 'React components and related UI logic',
    relocationSuggestion: 'Move agent logic to src/agents/ and file operations to src/core/',
  },
  {
    directory: 'src/cli',
    allowedImports: [
      '@core/*',
      '@types/*',
      '@agents/registry',
      'inquirer',
      'chalk',
      'ora',
      'commander',
    ],
    disallowedImports: [
      '@widgets/*',
      'src/widgets',
      '../widgets',
      '@agents/orchestrator',
      '@agents/specialized',
      '.tsx',
      'react',
      'React',
    ],
    expectedContent: 'CLI commands and interactive interface',
    relocationSuggestion: 'Move widget-related code to src/widgets/ and agent logic to src/agents/',
  },
  {
    directory: 'src/types',
    allowedImports: [],
    disallowedImports: [
      '@core/*',
      '@agents/*',
      '@widgets/*',
      '@cli/*',
      'src/core',
      'src/agents',
      'src/widgets',
      'src/cli',
    ],
    expectedContent: 'TypeScript type definitions only',
    relocationSuggestion: 'Move implementation code to appropriate src/ subdirectory',
  },
];

/**
 * Default configuration for architecture boundary checker.
 */
const DEFAULT_CONFIG: ArchitectureBoundaryConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /__tests__/],
};

/**
 * Import information extracted from source files.
 */
interface ImportInfo {
  /** Original import path as written in code */
  importPath: string;
  /** Resolved absolute path (if possible) */
  resolvedPath: string;
  /** Line number of the import statement */
  lineNumber: number;
  /** Whether this is a module alias import (@core/*, @agents/*, etc.) */
  isAliasImport: boolean;
  /** Whether this is a relative import */
  isRelativeImport: boolean;
  /** Source file containing this import */
  sourceFile: string;
}

/**
 * Result of boundary check for a single import.
 */
interface BoundaryCheckResult {
  /** Whether the import violates boundaries */
  isViolation: boolean;
  /** Type of boundary violation (if any) */
  boundaryType?: BoundaryType;
  /** Reason for the violation */
  reason?: string;
  /** Suggested correct location */
  correctLocation?: string;
}

/**
 * Architecture Boundary Checker Module
 *
 * Implements the AuditModule interface to validate that code follows
 * the architectural boundaries defined in the project structure.
 *
 * @example
 * ```typescript
 * const checker = new ArchitectureBoundaryChecker();
 * const report = await checker.run();
 *
 * console.log(`Architecture violations: ${report.totalViolations}`);
 * for (const violation of report.violations) {
 *   console.log(`${violation.filePath}:${violation.lineNumber} - ${violation.message}`);
 *   console.log(`  Suggested location: ${(violation as ArchitectureViolation).correctLocation}`);
 * }
 * ```
 */
export class ArchitectureBoundaryChecker implements AuditModule {
  readonly category: AuditCategory = 'architecture-compliance';
  readonly name = 'Architecture Boundary Checker';

  private config: ArchitectureBoundaryConfig;
  private boundaryRules: DirectoryBoundaryRules[];

  /**
   * Create a new architecture boundary checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<ArchitectureBoundaryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.boundaryRules = DEFAULT_BOUNDARY_RULES;
    if (this.config.customRules) {
      this.boundaryRules = [...this.boundaryRules, ...this.config.customRules];
    }
  }

  /**
   * Run the architecture boundary audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: ArchitectureViolation[] = [];
    const fileCount: number[] = [];
    const importCount: number[] = [];

    // Get all source files to analyze
    const files = this.getSourceFiles();
    fileCount.push(files.length);

    // Parse each file and check imports
    for (const file of files) {
      const imports = this.extractImports(file);
      importCount.push(imports.length);

      // Find applicable boundary rules for this file
      const applicableRules = this.findApplicableRules(file);

      for (const importInfo of imports) {
        const checkResult = this.checkBoundary(file, importInfo, applicableRules);

        if (checkResult.isViolation) {
          violations.push(this.createViolation(
            file,
            importInfo.lineNumber,
            importInfo.importPath,
            checkResult.boundaryType!,
            checkResult.reason!,
            checkResult.correctLocation!
          ));
        }
      }
    }

    // Calculate metrics
    const totalFiles = fileCount.length;
    const totalImports = importCount.reduce((a, b) => a + b, 0);
    const violationsByType = this.groupViolationsByType(violations);

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        totalFilesScanned: totalFiles,
        totalImportsAnalyzed: totalImports,
        violationCount: violations.length,
        ...violationsByType,
      },
    };

    return report;
  }

  /**
   * Get all source files to analyze based on configuration.
   *
   * @returns Array of file paths to analyze
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
   * Extract all import statements from a source file.
   *
   * @param filePath - Path to the source file
   * @returns Array of import information
   */
  private extractImports(filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return imports; // Skip files that can't be read
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Walk the AST to find import declarations
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const importPath = moduleSpecifier.text;
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          ).line + 1;

          imports.push({
            importPath,
            resolvedPath: this.resolveImportPath(importPath, filePath),
            lineNumber,
            isAliasImport: this.isModuleAlias(importPath),
            isRelativeImport: importPath.startsWith('.'),
            sourceFile: filePath,
          });
        }
      }

      // Also check for dynamic imports
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const [arg] = node.arguments;
        if (ts.isStringLiteral(arg)) {
          const importPath = arg.text;
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          ).line + 1;

          imports.push({
            importPath,
            resolvedPath: this.resolveImportPath(importPath, filePath),
            lineNumber,
            isAliasImport: this.isModuleAlias(importPath),
            isRelativeImport: importPath.startsWith('.'),
            sourceFile: filePath,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }

  /**
   * Check if an import path is a module alias (@core/*, @agents/*, etc.).
   */
  private isModuleAlias(importPath: string): boolean {
    return importPath.startsWith('@core/') ||
           importPath.startsWith('@agents/') ||
           importPath.startsWith('@widgets/') ||
           importPath.startsWith('@types/') ||
           importPath.startsWith('@cli/');
  }

  /**
   * Resolve an import path to an absolute path.
   */
  private resolveImportPath(importPath: string, sourceFilePath: string): string {
    if (this.isModuleAlias(importPath)) {
      // Map module aliases to actual paths
      return importPath
        .replace('@core/', 'src/core/')
        .replace('@agents/', 'src/agents/')
        .replace('@widgets/', 'src/widgets/')
        .replace('@types/', 'src/types/')
        .replace('@cli/', 'src/cli/');
    }

    if (importPath.startsWith('.')) {
      // Resolve relative paths
      const sourceDir = path.dirname(sourceFilePath);
      return path.normalize(path.join(sourceDir, importPath));
    }

    // External module
    return importPath;
  }

  /**
   * Find the boundary rules that apply to a file.
   */
  private findApplicableRules(filePath: string): DirectoryBoundaryRules[] {
    const rules: DirectoryBoundaryRules[] = [];

    for (const rule of this.boundaryRules) {
      if (filePath.startsWith(rule.directory) || filePath.startsWith(`./${rule.directory}`)) {
        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * Check if an import violates any boundary rules.
   */
  private checkBoundary(
    sourceFile: string,
    importInfo: ImportInfo,
    rules: DirectoryBoundaryRules[]
  ): BoundaryCheckResult {
    // If no rules apply, allow the import (e.g., test files, external packages)
    if (rules.length === 0) {
      return { isViolation: false };
    }

    const importPath = importInfo.importPath;

    // Check each applicable rule
    for (const rule of rules) {
      // Check disallowed imports first (higher priority)
      for (const disallowed of rule.disallowedImports) {
        if (this.matchesPattern(importPath, disallowed)) {
          return {
            isViolation: true,
            boundaryType: this.determineBoundaryType(sourceFile, importPath),
            reason: `Import "${importPath}" is not allowed in ${rule.directory} (disallowed: ${disallowed})`,
            correctLocation: rule.relocationSuggestion,
          };
        }
      }

      // Check if import is allowed (but disallowed takes precedence)
      // If it's not explicitly allowed and not an external package, it may still be allowed
      // We only flag violations based on disallowed patterns for explicit violations
    }

    // Check for cross-layer violations based on architectural hierarchy
    const hierarchyViolation = this.checkArchitecturalHierarchy(sourceFile, importInfo);
    if (hierarchyViolation.isViolation) {
      return hierarchyViolation;
    }

    return { isViolation: false };
  }

  /**
   * Check if an import string matches a pattern (supports wildcards).
   */
  private matchesPattern(importPath: string, pattern: string): boolean {
    // Exact match
    if (importPath === pattern) {
      return true;
    }

    // Wildcard match (e.g., @agents/* matches @agents/orchestrator)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return importPath.startsWith(prefix);
    }

    // Substring match for partial patterns
    if (pattern.startsWith('@') || pattern.startsWith('./') || pattern.startsWith('../')) {
      return importPath.includes(pattern);
    }

    // Check if pattern appears in the import path (for things like 'fs.', 'react', etc.)
    return importPath.includes(pattern) || importPath === pattern;
  }

  /**
   * Determine the type of boundary violation.
   */
  private determineBoundaryType(sourceFile: string, importPath: string): BoundaryType {
    const isInCore = sourceFile.includes('src/core');
    const isInAgents = sourceFile.includes('src/agents');
    const isInWidgets = sourceFile.includes('src/widgets');
    const isInCli = sourceFile.includes('src/cli');
    const isInTypes = sourceFile.includes('src/types');

    const importsFromAgents = importPath.includes('src/agents') || importPath.startsWith('@agents/');
    const importsFromWidgets = importPath.includes('src/widgets') || importPath.startsWith('@widgets/');
    const importsFromCore = importPath.includes('src/core') || importPath.startsWith('@core/');
    const importsFromCli = importPath.includes('src/cli') || importPath.startsWith('@cli/');

    if (isInCore && importsFromAgents) return 'core-to-agent';
    if (isInCore && importsFromWidgets) return 'core-to-widget';
    if (isInAgents && importsFromWidgets) return 'agent-to-widget';
    if (isInWidgets && importsFromAgents) return 'widget-to-agent';
    if (isInCli && importsFromAgents && !importPath.includes('registry')) return 'cli-to-agent';
    if (isInCli && importsFromWidgets) return 'cli-to-widget';

    return 'unauthorized-import';
  }

  /**
   * Check architectural hierarchy rules.
   *
   * Architectural layers (from bottom to top):
   * 1. types/ - Type definitions (no imports from other src layers)
   * 2. core/ - Infrastructure (can import from types)
   * 3. agents/ - Agent logic (can import from core, types)
   * 4. widgets/cli/ - UI and CLI (can import from agents, core, types)
   *
   * Rule: Code can only import from layers at or below it, not above.
   */
  private checkArchitecturalHierarchy(
    sourceFile: string,
    importInfo: ImportInfo
  ): BoundaryCheckResult {
    const layers = ['types', 'core', 'agents', 'widgets/cli'];
    const importPath = importInfo.importPath;

    // Determine source layer
    const sourceLayer = this.getArchitecturalLayer(sourceFile);
    const importLayer = this.getArchitecturalLayer(importInfo.resolvedPath);

    // External packages are always allowed
    if (importLayer === -1) {
      return { isViolation: false };
    }

    // Types layer should not import from any other src layer
    if (sourceLayer === 0 && importLayer > 0) {
      return {
        isViolation: true,
        boundaryType: 'unauthorized-import',
        reason: `Types layer cannot import from implementation layer (${importPath})`,
        correctLocation: 'Move implementation dependencies to appropriate src/ subdirectory and keep types pure',
      };
    }

    // Core layer should not import from agents or widgets/cli
    if (sourceLayer === 1 && importLayer > 1) {
      return {
        isViolation: true,
        boundaryType: this.determineBoundaryType(sourceFile, importPath),
        reason: `Core layer cannot import from higher layers (${importPath})`,
        correctLocation: 'Reverse the dependency: use event bus or registry pattern instead',
      };
    }

    // Agents layer should not import from widgets/cli
    if (sourceLayer === 2 && importLayer > 2) {
      return {
        isViolation: true,
        boundaryType: 'agent-to-widget',
        reason: `Agents layer cannot import from widgets/cli layer (${importPath})`,
        correctLocation: 'Move shared code to core/ or use reverse dependency pattern',
      };
    }

    return { isViolation: false };
  }

  /**
   * Get the architectural layer index for a file path.
   *
   * Returns -1 for external packages.
   */
  private getArchitecturalLayer(filePath: string): number {
    if (filePath.includes('src/types/')) return 0;
    if (filePath.includes('src/core/')) return 1;
    if (filePath.includes('src/agents/')) return 2;
    if (filePath.includes('src/widgets/') || filePath.includes('src/cli/')) return 3;

    // External package
    return -1;
  }

  /**
   * Group violations by boundary type for metrics.
   */
  private groupViolationsByType(violations: ArchitectureViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const violation of violations) {
      const type = violation.boundaryType;
      counts[type] = (counts[type] || 0) + 1;
    }

    return counts;
  }

  /**
   * Create an architecture violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    importPath: string,
    boundaryType: BoundaryType,
    reason: string,
    correctLocation: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'high'
  ): ArchitectureViolation {
    return {
      category: 'architecture-compliance',
      severity,
      filePath,
      lineNumber,
      message: reason,
      boundaryType,
      sourcePath: filePath,
      importPath,
      correctLocation,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const architectureBoundaryChecker = new ArchitectureBoundaryChecker();
