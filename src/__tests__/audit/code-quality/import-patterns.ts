/**
 * Import Patterns Audit Module
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 *
 * Scans source files for import pattern violations:
 * - Module alias usage (@core/*, @agents/*, @types/*)
 * - Relative import depth (no more than 2 levels: ../..)
 * - Barrel export usage for types/ imports
 * - Circular dependency detection
 *
 * @module audit/code-quality/import-patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Import pattern violation types.
 */
export type ImportPatternViolationType =
  | 'missing-alias'
  | 'deep-relative-import'
  | 'missing-barrel-export'
  | 'circular-dependency';

/**
 * Extended violation interface for import pattern issues.
 */
export interface ImportPatternViolation extends AuditViolation {
  category: 'import-patterns';
  /** Type of import issue */
  violationType: ImportPatternViolationType;
  /** Suggested correction */
  suggestedCorrection?: string;
}

/**
 * Configuration options for the import patterns audit.
 */
export interface ImportPatternsConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Maximum relative import depth (default: 2) */
  maxRelativeImportDepth: number;
  /** Alias for maxRelativeImportDepth - used by tests */
  maxRelativeDepth?: number;
  /** Module aliases to check */
  moduleAliases: {
    pattern: RegExp;
    replacement: string;
    description: string;
  }[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for import patterns audit.
 */
const DEFAULT_CONFIG: ImportPatternsConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  maxRelativeImportDepth: 2,
  moduleAliases: [
    {
      pattern: /^@core\//,
      replacement: '@core/',
      description: 'Core infrastructure modules',
    },
    {
      pattern: /^@agents\//,
      replacement: '@agents/',
      description: 'Agent modules',
    },
    {
      pattern: /^@types\//,
      replacement: '@types/',
      description: 'Type definitions',
    },
  ],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/],
};

/**
 * Import information extracted from a file.
 */
interface ImportInfo {
  /** Import path as written in the source */
  importPath: string;
  /** Line number where import appears */
  lineNumber: number;
  /** Source file containing this import */
  sourceFile: string;
  /** Whether this is a relative import */
  isRelative: boolean;
  /** Depth of relative import (number of ../ sequences) */
  relativeDepth: number;
  /** Alias for relativeDepth, used by test-accessor name countUpwardDepth */
  upwardDepth: number;
  /** Whether this uses a module alias */
  usesAlias: boolean;
  /** Which alias was used, if any */
  aliasUsed?: string;
  /** Resolved absolute path (if possible) */
  resolvedPath?: string;
}

/**
 * Dependency graph node representing a file.
 */
interface DependencyNode {
  /** Absolute file path */
  filePath: string;
  /** Files this file imports */
  imports: Set<string>;
  /** Files that import this file */
  importedBy: Set<string>;
}

/**
 * Import Patterns Audit Module
 *
 * Implements the AuditModule interface to validate import patterns
 * and detect circular dependencies across the codebase.
 *
 * @example
 * ```typescript
 * const audit = new ImportPatternAudit();
 * const report = await audit.run();
 *
 * console.log(`Total violations: ${report.totalViolations}`);
 * console.log(`Deep relative imports: ${report.metrics?.deepRelativeImports}`);
 * console.log(`Circular dependencies: ${report.metrics?.circularDependencies}`);
 * ```
 */
export class ImportPatternAudit implements AuditModule {
  readonly category: AuditCategory = 'import-patterns';
  readonly name = 'Import Patterns Audit';

  private config: ImportPatternsConfig;
  private dependencyGraph: Map<string, DependencyNode> = new Map();

  /**
   * Create a new import patterns audit instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<ImportPatternsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Handle alias: maxRelativeDepth is an alias for maxRelativeImportDepth
    if (config?.maxRelativeDepth !== undefined) {
      this.config.maxRelativeImportDepth = config.maxRelativeDepth;
    }
  }

  /**
   * Run the import patterns audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const allViolations: ImportPatternViolation[] = [];
    const allImports: ImportInfo[] = [];

    // Get all source files to scan
    const files = this.getSourceFiles();

    // Build dependency graph
    this.buildDependencyGraph(files);

    // Check each file for import pattern violations
    for (const file of files) {
      const imports = this.extractImports(file);
      allImports.push(...imports);
      
      const violations = this.checkFile(file);
      allViolations.push(...violations);
    }

    // Detect circular dependencies
    const circularViolations = this.detectCircularDependencies();
    allViolations.push(...circularViolations);

    // Calculate metrics
    const missingAliasViolations = allViolations.filter(v => v.violationType === 'missing-alias').length;
    const deepRelativeViolations = allViolations.filter(v => v.violationType === 'deep-relative-import').length;
    const barrelExportViolations = allViolations.filter(v => v.violationType === 'missing-barrel-export').length;
    const circularDependencyViolations = allViolations.filter(v => v.violationType === 'circular-dependency').length;
    const aliasUsageRate = this.calculateAliasUsageRate(allImports);

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: allViolations.length,
      violations: allViolations,
      metrics: {
        totalFiles: files.length,
        totalImports: allImports.length,
        missingAliasViolations,
        deepRelativeViolations,
        barrelExportViolations,
        circularDependencyViolations,
        aliasUsageRate,
        // Legacy names for backward compatibility
        missingAliasCount: missingAliasViolations,
        deepRelativeImports: deepRelativeViolations,
        missingBarrelExports: barrelExportViolations,
        circularDependencies: circularDependencyViolations,
      },
    };

    return report;
  }

  /**
   * Get all source files to scan based on configuration.
   *
   * @returns Array of file paths to scan
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
      if (this.config.excludePatterns.some(pattern => pattern.test(fullPath))) {
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
   * Build dependency graph for all files.
   *
   * @param files - Array of file paths to analyze
   */
  private buildDependencyGraph(files: string[]): void {
    this.dependencyGraph.clear();

    // Initialize nodes
    for (const file of files) {
      this.dependencyGraph.set(file, {
        filePath: file,
        imports: new Set(),
        importedBy: new Set(),
      });
    }

    // Build edges
    for (const file of files) {
      const imports = this.extractImports(file);
      const node = this.dependencyGraph.get(file);
      if (!node) continue;

      for (const importInfo of imports) {
        const resolvedPath = this.resolveImportPath(file, importInfo.importPath);
        if (resolvedPath && this.dependencyGraph.has(resolvedPath)) {
          node.imports.add(resolvedPath);
          const importedNode = this.dependencyGraph.get(resolvedPath);
          if (importedNode) {
            importedNode.importedBy.add(file);
          }
        }
      }
    }
  }

  /**
   * Check a single file for import pattern violations.
   *
   * @param filePath - Path to the file to check
   * @returns Array of violations found in the file
   */
  private checkFile(filePath: string): ImportPatternViolation[] {
    const violations: ImportPatternViolation[] = [];
    const imports = this.extractImports(filePath);

    for (const importInfo of imports) {
      // Requirement 4.2: Check relative import depth
      if (importInfo.isRelative && importInfo.upwardDepth > this.config.maxRelativeImportDepth) {
        const suggestedAlias = this.suggestModuleAlias(filePath, importInfo.importPath);
        violations.push(this.createViolation(
          filePath,
          importInfo.lineNumber,
          'deep-relative-import',
          `Relative import '${importInfo.importPath}' traverses ${importInfo.upwardDepth} levels, exceeding maximum of ${this.config.maxRelativeImportDepth}`,
          suggestedAlias
        ));
      }

      // Requirement 4.1: Check for missing module aliases on cross-module imports
      if (importInfo.isRelative && this.isCrossModuleImport(filePath, importInfo.importPath)) {
        const suggestedAlias = this.suggestModuleAlias(filePath, importInfo.importPath);
        if (suggestedAlias) {
          violations.push(this.createViolation(
            filePath,
            importInfo.lineNumber,
            'missing-alias',
            `Cross-module import should use module alias: '${importInfo.importPath}'`,
            suggestedAlias
          ));
        }
      }

      // Requirement 4.3: Check for barrel export usage for types/ imports
      if (this.isTypesImport(importInfo.importPath) && !this.usesBarrelExport(importInfo.importPath)) {
        const suggestedCorrection = this.suggestBarrelExport(importInfo.importPath);
        violations.push(this.createViolation(
          filePath,
          importInfo.lineNumber,
          'missing-barrel-export',
          `Import from types/ should use barrel export (@types/*): '${importInfo.importPath}'`,
          suggestedCorrection
        ));
      }
    }

    return violations;
  }

  /**
   * Check a single import for violations. Used by property-based tests.
   *
   * @param importInfo - Import information to check
   * @returns Array of violations found
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private checkImportViolations(importInfo: ImportInfo): ImportPatternViolation[] {
    const violations: ImportPatternViolation[] = [];

    // Requirement 4.2: Check relative import depth
    if (importInfo.isRelative && importInfo.upwardDepth > this.config.maxRelativeImportDepth) {
      const suggestedAlias = importInfo.sourceFile
        ? this.suggestModuleAlias(importInfo.sourceFile, importInfo.importPath)
        : undefined;
      violations.push(this.createViolation(
        importInfo.sourceFile || 'unknown',
        importInfo.lineNumber,
        'deep-relative-import',
        `Relative import '${importInfo.importPath}' traverses ${importInfo.upwardDepth} levels, exceeding maximum of ${this.config.maxRelativeImportDepth}`,
        suggestedAlias
      ));
    }

    // Requirement 4.1: Check for missing module aliases on cross-module imports
    if (importInfo.isRelative && importInfo.sourceFile && this.isCrossModuleImport(importInfo.sourceFile, importInfo.importPath)) {
      const suggestedAlias = this.suggestModuleAlias(importInfo.sourceFile, importInfo.importPath);
      if (suggestedAlias) {
        violations.push(this.createViolation(
          importInfo.sourceFile,
          importInfo.lineNumber,
          'missing-alias',
          `Cross-module import should use module alias: '${importInfo.importPath}'`,
          suggestedAlias
        ));
      }
    }

    // Requirement 4.3: Check for barrel export usage for types/ imports
    if (this.isTypesImport(importInfo.importPath) && !this.usesBarrelExport(importInfo.importPath)) {
      const suggestedCorrection = this.suggestBarrelExport(importInfo.importPath);
      violations.push(this.createViolation(
        importInfo.sourceFile || 'unknown',
        importInfo.lineNumber,
        'missing-barrel-export',
        `Import from types/ should use barrel export (@types/*): '${importInfo.importPath}'`,
        suggestedCorrection
      ));
    }

    return violations;
  }

  /**
   * Extract all imports from a TypeScript file.
   *
   * @param filePath - Path to the file to analyze
   * @returns Array of import information
   */
  private extractImports(filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // Handle import declarations: import { x } from 'path'
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier;
          if (ts.isStringLiteral(moduleSpecifier)) {
            const importPath = moduleSpecifier.text;
            const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            imports.push(this.analyzeImportPath(importPath, lineNumber, filePath));
          }
        }

        // Handle require calls: const x = require('path')
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
            if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
              const importPath = node.arguments[0].text;
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
              imports.push(this.analyzeImportPath(importPath, lineNumber, filePath));
            }
          }
        }

        // Handle dynamic imports: import('path')
        if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
              const importPath = node.arguments[0].text;
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
              imports.push(this.analyzeImportPath(importPath, lineNumber, filePath));
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch {
      // If we can't parse the file, return empty array
    }

    return imports;
  }

  /**
   * Analyze an import path and extract information.
   *
   * @param importPath - Import path string
   * @param lineNumber - Line number where import appears
   * @param sourceFile - Source file containing the import
   * @returns Import information
   */
  private analyzeImportPath(importPath: string, lineNumber: number, sourceFile: string): ImportInfo {
    const isRelative = importPath.startsWith('.') || importPath.startsWith('/');
    const upwardDepth = this.countUpwardDepth(importPath);
    const usesAlias = this.config.moduleAliases.some(alias => alias.pattern.test(importPath));
    
    // Extract the alias without trailing slash
    let aliasUsed: string | undefined;
    const matchedAlias = this.config.moduleAliases.find(alias => alias.pattern.test(importPath));
    if (matchedAlias) {
      // Remove trailing slash from replacement
      aliasUsed = matchedAlias.replacement.replace(/\/$/, '');
    }

    return {
      importPath,
      lineNumber,
      sourceFile,
      isRelative,
      relativeDepth: upwardDepth,
      upwardDepth,
      usesAlias,
      aliasUsed,
    };
  }

  /**
   * Public alias for analyzeImportPath used by tests.
   * 
   * @param importPath - Import path string
   * @param lineNumber - Line number where import appears
   * @param sourceFile - Source file containing the import
   * @returns Import information
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private analyzeImport(importPath: string, lineNumber: number, sourceFile: string): ImportInfo {
    return this.analyzeImportPath(importPath, lineNumber, sourceFile);
  }

  /**
   * Calculate the depth of a relative import (number of ../ sequences).
   * Also exposed as `countUpwardDepth` for test compatibility.
   *
   * @param importPath - Import path string
   * @returns Depth count
   */
  private calculateRelativeDepth(importPath: string): number {
    return this.countUpwardDepth(importPath);
  }

  /**
   * Count upward depth (number of ../ sequences) in an import path.
   * This is the primary method used internally.
   *
   * @param importPath - Import path string
   * @returns Depth count
   */
  private countUpwardDepth(importPath: string): number {
    if (!importPath.startsWith('.')) return 0;

    let depth = 0;
    const parts = importPath.split('/');

    for (const part of parts) {
      if (part === '..') {
        depth++;
      }
    }

    return depth;
  }

  /**
   * Check if an import crosses module boundaries.
   *
   * @param fromFile - Source file path
   * @param importPath - Import path string
   * @returns True if import crosses module boundaries
   */
  private isCrossModuleImport(fromFile: string, importPath: string): boolean {
    if (!importPath.startsWith('.')) return false;

    // Resolve the import to an absolute path
    const resolvedPath = this.resolveImportPath(fromFile, importPath);
    if (!resolvedPath) return false;

    // Determine module boundaries (core, agents, types, widgets, cli)
    const fromModule = this.getModuleName(fromFile);
    const toModule = this.getModuleName(resolvedPath);

    return fromModule !== toModule && fromModule !== null && toModule !== null;
  }

  /**
   * Get the module name from a file path.
   *
   * @param filePath - File path
   * @returns Module name (core, agents, types, widgets, cli) or null
   */
  private getModuleName(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (normalizedPath.includes('/src/core/')) return 'core';
    if (normalizedPath.includes('/src/agents/')) return 'agents';
    if (normalizedPath.includes('/src/types/')) return 'types';
    if (normalizedPath.includes('/src/widgets/')) return 'widgets';
    if (normalizedPath.includes('/src/cli/')) return 'cli';

    return null;
  }

  /**
   * Check if an import path is importing from types/.
   *
   * @param importPath - Import path string
   * @returns True if importing from types/
   */
  private isTypesImport(importPath: string): boolean {
    // Check for relative imports to types/
    if (importPath.includes('/types/') || importPath.includes('\\types\\')) {
      return true;
    }

    // Check for alias imports to types (but not @types/* which is correct)
    if (importPath.startsWith('../types/') || importPath.startsWith('./types/')) {
      return true;
    }

    return false;
  }

  /**
   * Check if an import uses barrel export pattern.
   *
   * @param importPath - Import path string
   * @returns True if using barrel export
   */
  private usesBarrelExport(importPath: string): boolean {
    // Barrel export pattern: @types/* (no deep path)
    return /^@types\/[^/]+$/.test(importPath) || importPath === '@types';
  }

  /**
   * Suggest a module alias for a relative import.
   *
   * @param fromFile - Source file path
   * @param importPath - Import path string
   * @returns Suggested alias or undefined
   */
  private suggestModuleAlias(fromFile: string, importPath: string): string | undefined {
    const resolvedPath = this.resolveImportPath(fromFile, importPath);
    if (!resolvedPath) return undefined;

    const toModule = this.getModuleName(resolvedPath);
    if (!toModule) return undefined;

    // Extract the relative path within the module
    const normalizedPath = resolvedPath.replace(/\\/g, '/');
    const moduleMatch = normalizedPath.match(new RegExp(`/src/${toModule}/(.+)`));
    if (!moduleMatch) return undefined;

    const relativePath = moduleMatch[1].replace(/\.(ts|tsx)$/, '');

    return `@${toModule}/${relativePath}`;
  }

  /**
   * Suggest barrel export usage for types/ import.
   *
   * @param importPath - Import path string
   * @returns Suggested correction
   */
  private suggestBarrelExport(importPath: string): string {
    // Extract the type name from the path
    const match = importPath.match(/types\/([^/]+)/);
    if (match) {
      return `@types/${match[1]}`;
    }

    return '@types/*';
  }

  /**
   * Resolve an import path to an absolute file path.
   *
   * @param fromFile - Source file path
   * @param importPath - Import path string
   * @returns Resolved absolute path or undefined
   */
  private resolveImportPath(fromFile: string, importPath: string): string | undefined {
    // Handle module aliases
    if (importPath.startsWith('@core/')) {
      const relativePath = importPath.replace('@core/', '');
      return path.resolve('src/core', relativePath);
    }
    if (importPath.startsWith('@agents/')) {
      const relativePath = importPath.replace('@agents/', '');
      return path.resolve('src/agents', relativePath);
    }
    if (importPath.startsWith('@types/')) {
      const relativePath = importPath.replace('@types/', '');
      return path.resolve('src/types', relativePath);
    }

    // Handle relative imports
    if (importPath.startsWith('.')) {
      const fromDir = path.dirname(fromFile);
      let resolved = path.resolve(fromDir, importPath);

      // Try adding extensions if file doesn't exist
      if (!fs.existsSync(resolved)) {
        for (const ext of this.config.extensions) {
          const withExt = resolved + ext;
          if (fs.existsSync(withExt)) {
            return withExt;
          }
        }

        // Try index file
        const indexPath = path.join(resolved, 'index.ts');
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }

      return resolved;
    }

    return undefined;
  }

  /**
   * Detect circular dependencies in the dependency graph.
   * Requirement 4.4: Identify circular dependencies between modules.
   *
   * @returns Array of circular dependency violations
   */
  private detectCircularDependencies(): ImportPatternViolation[] {
    const violations: ImportPatternViolation[] = [];
    const cycles = this.findCycles(this.dependencyGraph);

    // Create violations for unique cycles
    for (const cycle of cycles) {
      const cycleDescription = cycle.map(f => path.relative(process.cwd(), f)).join(' → ');
      violations.push(this.createViolation(
        cycle[0],
        0,
        'circular-dependency',
        `Circular dependency detected: ${cycleDescription}`,
        'Refactor to break the circular dependency'
      ));
    }

    return violations;
  }

  /**
   * Find all cycles in a dependency graph.
   * Used by property-based tests.
   *
   * @param graph - Dependency graph to analyze
   * @returns Array of cycles (each cycle is an array of file paths)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private findCycles(graph: Map<string, DependencyNode>): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (filePath: string, currentPath: string[]): void => {
      visited.add(filePath);
      recursionStack.add(filePath);
      currentPath.push(filePath);

      const node = graph.get(filePath);
      if (!node) return;

      for (const importPath of node.imports) {
        if (!recursionStack.has(importPath)) {
          if (!visited.has(importPath)) {
            dfs(importPath, [...currentPath]);
          }
        } else {
          // Found a cycle
          const cycleStart = currentPath.indexOf(importPath);
          if (cycleStart !== -1) {
            const cycle = [...currentPath.slice(cycleStart), importPath];
            cycles.push(cycle);
          }
        }
      }

      recursionStack.delete(filePath);
    };

    // Run DFS from each unvisited node
    for (const filePath of graph.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath, []);
      }
    }

    return this.deduplicateCycles(cycles);
  }

  /**
   * Deduplicate cycles (same cycle starting from different points).
   *
   * @param cycles - Array of cycles
   * @returns Deduplicated cycles
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const unique = new Map<string, string[]>();

    for (const cycle of cycles) {
      const key = this.normalizeCycleKey(cycle);
      if (!unique.has(key)) {
        unique.set(key, cycle);
      }
    }

    return Array.from(unique.values());
  }

  /**
   * Normalize a cycle to a consistent key for deduplication.
   * Used by property-based tests.
   *
   * @param cycle - Array of file paths forming a cycle
   * @returns Normalized string key
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private normalizeCycleKey(cycle: string[]): string {
    if (cycle.length === 0) return '';
    
    // A cycle may or may not have the first element repeated at the end.
    // E.g., [A, B, C] or [A, B, C, A] both represent A -> B -> C -> A
    
    // Determine if last element repeats the first
    const hasRepeatedLast = cycle.length > 1 && cycle[cycle.length - 1] === cycle[0];
    const uniqueElements = hasRepeatedLast ? cycle.slice(0, -1) : cycle;
    
    if (uniqueElements.length === 0) return cycle.join('→');
    
    // Find the lexicographically smallest element to use as starting point
    let minIndex = 0;
    for (let i = 1; i < uniqueElements.length; i++) {
      if (uniqueElements[i] < uniqueElements[minIndex]) {
        minIndex = i;
      }
    }
    
    // Reorder the cycle to start from the minimum element
    const rotated = [
      ...uniqueElements.slice(minIndex),
      ...uniqueElements.slice(0, minIndex),
      uniqueElements[minIndex], // Close the cycle
    ];
    
    return rotated.join('→');
  }

  /**
   * Calculate the percentage of cross-module imports using aliases.
   * Used by property-based tests.
   *
   * @param allImports - Array of all imports analyzed
   * @returns Percentage string like "85.5%"
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private calculateAliasUsageRate(allImports: ImportInfo[]): string {
    // Filter to cross-module imports only
    const crossModuleImports = allImports.filter(imp => {
      if (!imp.sourceFile) return false;
      if (!imp.isRelative) return imp.usesAlias; // Non-relative imports that use aliases
      return this.isCrossModuleImport(imp.sourceFile, imp.importPath);
    });

    if (crossModuleImports.length === 0) {
      return '100.0%'; // No cross-module imports means 100% compliance
    }

    const importsUsingAliases = crossModuleImports.filter(imp => imp.usesAlias).length;
    const rate = (importsUsingAliases / crossModuleImports.length) * 100;

    return `${rate.toFixed(1)}%`;
  }

  /**
   * Create an import pattern violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: ImportPatternViolationType,
    message: string,
    suggestedCorrection?: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): ImportPatternViolation {
    return {
      category: 'import-patterns',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      suggestedCorrection,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const importPatternAudit = new ImportPatternAudit();
