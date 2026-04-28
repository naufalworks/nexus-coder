/**
 * Dead Code Detector Module
 *
 * Validates: Requirements 2.1, 2.3, 2.5, 2.6
 *
 * Identifies unused exports, orphaned code, and estimates bundle reduction potential.
 * Uses TypeScript Compiler API to:
 * - Build symbol table of all exports
 * - Track all import references
 * - Identify exports with zero references
 * - Estimate byte savings based on symbol complexity
 *
 * @module audit/dead-code/detector
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Kind of dead symbol identified by the detector.
 */
export type DeadSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'props';

/**
 * Extended violation interface for dead code issues.
 */
export interface DeadCodeViolation extends AuditViolation {
  category: 'dead-code';
  /** Kind of dead symbol */
  symbolKind: DeadSymbolKind;
  /** Estimated bytes saved by removal */
  estimatedBytesSaved: number;
}

/**
 * Information about an unused export.
 */
export interface UnusedExport {
  /** Symbol name */
  name: string;
  /** File containing the export */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Kind of export */
  kind: DeadSymbolKind;
  /** Whether it's exported from index.ts */
  isBarrelExport: boolean;
  /** Estimated bytes saved */
  estimatedBytes: number;
}

/**
 * Configuration options for the dead code detector.
 */
export interface DeadCodeDetectorConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Minimum lines of code to consider for byte estimation */
  minLinesForEstimate: number;
  /** Average bytes per line for estimation */
  bytesPerLine: number;
}

/**
 * Default configuration for dead code detector.
 */
const DEFAULT_CONFIG: DeadCodeDetectorConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/],
  minLinesForEstimate: 1,
  bytesPerLine: 40, // Average bytes per line of code
};

/**
 * Symbol information extracted from source files.
 */
interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** File path where symbol is defined */
  filePath: string;
  /** Line number where symbol is defined */
  lineNumber: number;
  /** Kind of symbol */
  kind: DeadSymbolKind;
  /** Number of AST nodes in the symbol definition */
  nodeCount: number;
  /** Number of lines the symbol spans */
  lineSpan: number;
  /** Whether the symbol is exported */
  isExported: boolean;
  /** Whether the symbol is from a barrel export file (index.ts) */
  isFromIndexFile: boolean;
  /** Start position in source file */
  start: number;
  /** End position in source file */
  end: number;
}

/**
 * Reference information for symbol usage tracking.
 */
interface SymbolReference {
  /** Symbol name being referenced */
  symbolName: string;
  /** File containing the reference */
  sourceFile: string;
  /** Line number of the reference */
  lineNumber: number;
  /** Whether this is an import reference */
  isImportReference: boolean;
}

/**
 * Dead Code Detector Module
 *
 * Implements the AuditModule interface to identify unused exports,
 * unreferenced code, and estimate bundle size reduction potential.
 *
 * @example
 * ```typescript
 * const detector = new DeadCodeDetector();
 * const report = await detector.run();
 *
 * console.log(`Unused exports: ${report.totalViolations}`);
 * console.log(`Estimated bundle reduction: ${report.estimatedBundleReduction}`);
 * ```
 */
export class DeadCodeDetector implements AuditModule {
  readonly category: AuditCategory = 'dead-code';
  readonly name = 'Dead Code Detector';

  private config: DeadCodeDetectorConfig;
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;

  // Symbol tracking
  private exportedSymbols: Map<string, SymbolInfo> = new Map();
  private importReferences: Map<string, SymbolReference[]> = new Map();
  private allSymbolUsages: Set<string> = new Set();

  // File content cache for byte estimation
  private fileContentCache: Map<string, string> = new Map();

  /**
   * Create a new dead code detector instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<DeadCodeDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the dead code detection audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    // Initialize TypeScript program
    this.initializeProgram();

    // Clear previous analysis
    this.exportedSymbols.clear();
    this.importReferences.clear();
    this.allSymbolUsages.clear();
    this.fileContentCache.clear();

    // Get all source files to analyze
    const filePaths = this.getAllSourceFiles();

    // Use program-based analysis or fallback to direct parsing
    const sourceFiles: ts.SourceFile[] = this.program
      ? this.getSourceFiles()
      : this.parseSourceFiles(filePaths);

    // Phase 1: Build symbol table of all exports
    this.buildSymbolTable(sourceFiles);

    // Phase 2: Track all import references
    this.trackImportReferences(sourceFiles);

    // Phase 3: Identify exports with zero references
    const unusedExports = this.identifyUnusedExports();

    // Phase 4: Generate violations with byte estimates
    const violations = this.generateViolations(unusedExports);

    // Calculate metrics
    const totalEstimatedBytes = violations.reduce(
      (sum, v) => sum + (v.estimatedBytesSaved || 0),
      0
    );

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        totalFiles: sourceFiles.length,
        totalExports: this.exportedSymbols.size,
        totalImports: this.allSymbolUsages.size,
        unusedExportCount: unusedExports.length,
        totalEstimatedBytesSaved: totalEstimatedBytes,
      },
      estimatedBundleReduction: this.formatBytes(totalEstimatedBytes),
    };

    return report;
  }

  /**
   * Parse source files directly without a full TypeScript program.
   * Used as fallback when program creation fails (e.g., isolated test directories).
   */
  private parseSourceFiles(filePaths: string[]): ts.SourceFile[] {
    return filePaths
      .map((filePath) => {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          this.fileContentCache.set(filePath, content);
          return ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true // setParentNodes
          );
        } catch {
          return null;
        }
      })
      .filter((sf): sf is ts.SourceFile => sf !== null);
  }

  /**
   * Initialize TypeScript program and type checker.
   * Falls back to direct source file parsing if program creation fails.
   */
  private initializeProgram(): void {
    try {
      const rootNames = this.getAllSourceFiles();

      if (rootNames.length === 0) {
        this.program = null;
        this.checker = null;
        return;
      }

      // Try to read tsconfig for compiler options, but use our own defaults
      // since the test files may be in isolated temp directories
      let compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowJs: true,
        declaration: false,
        sourceMap: false,
      };

      // Try loading project tsconfig (optional)
      try {
        const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
        if (configPath) {
          const config = ts.readConfigFile(configPath, ts.sys.readFile);
          if (config.config?.compilerOptions) {
            compilerOptions = { ...compilerOptions, ...config.config.compilerOptions };
          }
        }
      } catch {
        // Ignore config loading errors - use defaults
      }

      // Override noEmit to prevent output generation
      compilerOptions.noEmit = true;
      compilerOptions.outDir = undefined;
      compilerOptions.declaration = false;

      this.program = ts.createProgram({
        rootNames,
        options: compilerOptions,
      });

      this.checker = this.program.getTypeChecker();
    } catch (error) {
      // If program creation fails, we'll fall back to direct source file parsing
      this.program = null;
      this.checker = null;
    }
  }

  /**
   * Get all source file paths to analyze.
   */
  private getAllSourceFiles(): string[] {
    const files: string[] = [];

    for (const dir of this.config.srcDirs) {
      if (!fs.existsSync(dir)) continue;
      this.walkDirectory(dir, files);
    }

    return files;
  }

  /**
   * Get source files from the TypeScript program.
   */
  private getSourceFiles(): ts.SourceFile[] {
    if (!this.program) return [];

    return this.program.getSourceFiles().filter(
      (sf) => !sf.fileName.includes('node_modules') &&
             !sf.fileName.includes('dist') &&
             this.config.extensions.some((ext) => sf.fileName.endsWith(ext))
    );
  }

  /**
   * Recursively walk a directory and collect source files.
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
   * Phase 1: Build symbol table of all exports.
   *
   * Collects information about all exported functions, classes, interfaces,
   * types, and variables across the codebase.
   */
  private buildSymbolTable(sourceFiles: ts.SourceFile[]): void {
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.fileName;
      const content = sourceFile.text;
      this.fileContentCache.set(filePath, content);

      // Track if this is an index file (barrel export)
      const isIndexFile = path.basename(filePath) === 'index.ts' ||
                          path.basename(filePath) === 'index.tsx';

      // Visit each top-level node
      ts.forEachChild(sourceFile, (node) => {
        const symbolInfo = this.extractSymbolInfo(node, sourceFile, isIndexFile);
        if (symbolInfo && symbolInfo.isExported) {
          this.exportedSymbols.set(symbolInfo.name, symbolInfo);
        }
      });
    }
  }

  /**
   * Extract symbol information from an AST node.
   */
  private extractSymbolInfo(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    isIndexFile: boolean
  ): SymbolInfo | null {
    const filePath = sourceFile.fileName;
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const lineNumber = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;

    // Helper to create symbol info
    const createSymbolInfo = (
      name: string,
      kind: DeadSymbolKind,
      isExported: boolean
    ): SymbolInfo => ({
      name,
      filePath,
      lineNumber,
      kind,
      nodeCount: this.countNodes(node),
      lineSpan: endLine - lineNumber + 1,
      isExported,
      isFromIndexFile: isIndexFile,
      start,
      end,
    });

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = this.isExported(node);
      return createSymbolInfo(node.name.text, 'function', isExported);
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const isExported = this.isExported(node);
      return createSymbolInfo(node.name.text, 'class', isExported);
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const isExported = this.isExported(node);
      return createSymbolInfo(node.name.text, 'interface', isExported);
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node)) {
      const isExported = this.isExported(node);
      return createSymbolInfo(node.name.text, 'type', isExported);
    }

    // Variable declarations (exported const/let/var)
    if (ts.isVariableStatement(node)) {
      const isExported = this.isExported(node);
      const declarations = node.declarationList.declarations;

      for (const declaration of declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const declStart = declaration.getStart(sourceFile);
          const declEnd = declaration.getEnd();
          const declLine = sourceFile.getLineAndCharacterOfPosition(declStart).line + 1;
          const declEndLine = sourceFile.getLineAndCharacterOfPosition(declEnd).line + 1;

          return {
            name: declaration.name.text,
            filePath,
            lineNumber: declLine,
            kind: 'variable',
            nodeCount: this.countNodes(declaration),
            lineSpan: declEndLine - declLine + 1,
            isExported,
            isFromIndexFile: isIndexFile,
            start: declStart,
            end: declEnd,
          };
        }
      }
    }

    // Export declarations (re-exports)
    if (ts.isExportDeclaration(node)) {
      // Handle re-exports from barrel files
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          return {
            name,
            filePath,
            lineNumber,
            kind: 'variable',
            nodeCount: 1,
            lineSpan: 1,
            isExported: true,
            isFromIndexFile: true,
            start,
            end,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a node is exported.
   */
  private isExported(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;

    const modifiers = ts.getModifiers(node);
    if (!modifiers) return false;

    return modifiers.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword
    );
  }

  /**
   * Count AST nodes in a subtree.
   */
  private countNodes(node: ts.Node): number {
    let count = 1;
    node.forEachChild((child) => {
      count += this.countNodes(child);
    });
    return count;
  }

  /**
   * Phase 2: Track all import references.
   *
   * Builds a map of all import statements and symbol usages across
   * the codebase to identify which exports are actually used.
   */
  private trackImportReferences(sourceFiles: ts.SourceFile[]): void {
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.fileName;

      // Skip test files for usage tracking (they shouldn't count as main usage)
      const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');

      ts.forEachChild(sourceFile, (node) => {
        // Import declarations
        if (ts.isImportDeclaration(node)) {
          this.processImportDeclaration(node, sourceFile, filePath, isTestFile);
        }

        // Export declarations (re-exports count as usage)
        if (ts.isExportDeclaration(node)) {
          this.processExportDeclaration(node, sourceFile, filePath);
        }
      });

      // Also track all identifier usages in the code
      this.trackIdentifierUsages(sourceFile, isTestFile);
    }
  }

  /**
   * Process an import declaration and extract imported symbols.
   */
  private processImportDeclaration(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    isTestFile: boolean
  ): void {
    const importClause = node.importClause;
    if (!importClause) return;

    // Default import: import Name from 'module'
    if (importClause.name) {
      const name = importClause.name.text;
      this.addSymbolReference(name, filePath, sourceFile, !isTestFile);
    }

    // Named imports: import { Name1, Name2 } from 'module'
    if (importClause.namedBindings) {
      if (ts.isNamedImports(importClause.namedBindings)) {
        for (const element of importClause.namedBindings.elements) {
          const name = element.name.text;
          this.addSymbolReference(name, filePath, sourceFile, !isTestFile);
        }
      }

      // Namespace import: import * as Name from 'module'
      if (ts.isNamespaceImport(importClause.namedBindings)) {
        const name = importClause.namedBindings.name.text;
        this.addSymbolReference(name, filePath, sourceFile, !isTestFile);
      }
    }
  }

  /**
   * Process an export declaration (re-exports count as usage).
   */
  private processExportDeclaration(
    node: ts.ExportDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    // export { Name1, Name2 } from 'module'
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        const name = element.name.text;
        this.addSymbolReference(name, filePath, sourceFile, true);
      }
    }
  }

  /**
   * Track all identifier usages in a source file.
   * Only counts identifiers in reference positions (not declaration names).
   */
  private trackIdentifierUsages(sourceFile: ts.SourceFile, isTestFile: boolean): void {
    const visit = (node: ts.Node) => {
      // Skip adding references for declaration names
      // A declaration name is the identifier in: function name(), class Name {}, const name =, etc.
      const isDeclarationName = this.isDeclarationIdentifier(node);

      if (ts.isIdentifier(node) && !isDeclarationName) {
        const name = node.text;
        this.allSymbolUsages.add(name);

        // If not a test file, add as a reference
        if (!isTestFile) {
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          ).line + 1;

          const existing = this.importReferences.get(name) || [];
          existing.push({
            symbolName: name,
            sourceFile: sourceFile.fileName,
            lineNumber,
            isImportReference: false,
          });
          this.importReferences.set(name, existing);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Check if an identifier node is in a declaration position.
   * Declaration identifiers should not count as "usages".
   */
  private isDeclarationIdentifier(node: ts.Node): boolean {
    const parent = node.parent;
    if (!parent) return false;

    // Function declaration name: function name() {}
    if (ts.isFunctionDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Class declaration name: class Name {}
    if (ts.isClassDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Interface declaration name: interface Name {}
    if (ts.isInterfaceDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Type alias declaration name: type Name = ...
    if (ts.isTypeAliasDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Variable declaration name: const name = ...
    if (ts.isVariableDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Parameter name: function (param) {}
    if (ts.isParameter(parent) && parent.name === node) {
      return true;
    }

    // Property declaration name: class { prop: type; }
    if (ts.isPropertyDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Method declaration name: class { method() {} }
    if (ts.isMethodDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Enum declaration name: enum Name {}
    if (ts.isEnumDeclaration(parent) && parent.name === node) {
      return true;
    }

    // Enum member name: enum { Member }
    if (ts.isEnumMember(parent) && parent.name === node) {
      return true;
    }

    // Binding element in destructuring: const { name } = obj
    if (ts.isBindingElement(parent) && parent.name === node) {
      return true;
    }

    return false;
  }

  /**
   * Add a symbol reference to the tracking map.
   */
  private addSymbolReference(
    name: string,
    filePath: string,
    sourceFile: ts.SourceFile,
    isImportReference: boolean
  ): void {
    this.allSymbolUsages.add(name);

    const lineNumber = sourceFile.getLineAndCharacterOfPosition(
      sourceFile.getStart()
    ).line + 1;

    const existing = this.importReferences.get(name) || [];
    existing.push({
      symbolName: name,
      sourceFile: filePath,
      lineNumber,
      isImportReference,
    });
    this.importReferences.set(name, existing);
  }

  /**
   * Phase 3: Identify exports with zero references.
   *
   * Compares the symbol table of exports against the tracked references
   * to find symbols that are exported but never imported or used.
   */
  private identifyUnusedExports(): UnusedExport[] {
    const unusedExports: UnusedExport[] = [];

    for (const [name, symbolInfo] of this.exportedSymbols) {
      // Skip symbols from test files
      if (this.isTestFile(symbolInfo.filePath)) continue;

      // Skip barrel exports (they re-export, so usage is counted on the original)
      if (symbolInfo.isFromIndexFile) continue;

      // Check if symbol is used
      const references = this.importReferences.get(name);
      
      // Count non-test, non-barrel references
      const nonTestReferences = references?.filter(
        (ref) => !this.isTestFile(ref.sourceFile) && !this.isBarrelFile(ref.sourceFile)
      ) || [];

      // If there are real usage references (not just re-exports), skip
      if (nonTestReferences.length > 0) continue;

      // Calculate estimated bytes
      const estimatedBytes = this.estimateBytes(symbolInfo);

      unusedExports.push({
        name,
        filePath: symbolInfo.filePath,
        lineNumber: symbolInfo.lineNumber,
        kind: symbolInfo.kind,
        isBarrelExport: symbolInfo.isFromIndexFile,
        estimatedBytes,
      });
    }

    // Sort by estimated bytes (largest first)
    return unusedExports.sort((a, b) => b.estimatedBytes - a.estimatedBytes);
  }

  /**
   * Check if a file path is a test file.
   */
  private isTestFile(filePath: string): boolean {
    return (
      filePath.includes('.test.') ||
      filePath.includes('.spec.') ||
      filePath.includes('__tests__') ||
      filePath.includes('__mocks__')
    );
  }

  /**
   * Check if a file path is a barrel/index file.
   */
  private isBarrelFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return basename === 'index.ts' || basename === 'index.tsx';
  }

  /**
   * Phase 4: Generate violations with byte estimates.
   */
  private generateViolations(unusedExports: UnusedExport[]): DeadCodeViolation[] {
    return unusedExports.map((exp) =>
      this.createViolation(
        exp.filePath,
        exp.lineNumber,
        exp.name,
        exp.kind,
        exp.estimatedBytes
      )
    );
  }

  /**
   * Estimate bytes for a symbol based on its complexity.
   */
  private estimateBytes(symbolInfo: SymbolInfo): number {
    // Get file content for more accurate estimation
    const content = this.fileContentCache.get(symbolInfo.filePath);

    if (content) {
      // Extract the actual symbol code
      const lines = content.split('\n');
      const startLine = symbolInfo.lineNumber - 1;
      const endLine = startLine + symbolInfo.lineSpan;

      // Extract the relevant lines
      const symbolLines = lines.slice(startLine, endLine);
      const symbolCode = symbolLines.join('\n');

      // Estimate bytes: code length plus some overhead for minification
      // Minified code is roughly 30-40% of source size
      const minifiedRatio = 0.35;
      const estimatedBytes = Math.round(symbolCode.length * minifiedRatio);

      return estimatedBytes;
    }

    // Fallback estimation based on line count
    return symbolInfo.lineSpan * this.config.bytesPerLine;
  }

  /**
   * Format bytes as a human-readable string.
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
  }

  /**
   * Create a dead code violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    symbolName: string,
    symbolKind: DeadSymbolKind,
    estimatedBytesSaved: number,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): DeadCodeViolation {
    const kindLabel = symbolKind.charAt(0).toUpperCase() + symbolKind.slice(1);

    return {
      category: 'dead-code',
      severity,
      filePath,
      lineNumber,
      message: `Unused exported ${kindLabel}: ${symbolName} (estimated ${this.formatBytes(estimatedBytesSaved)} saved)`,
      symbolName,
      symbolKind,
      estimatedBytesSaved,
    };
  }

  /**
   * Create an empty report with a message.
   */
  private createEmptyReport(message: string): AuditReport {
    return {
      category: this.category,
      totalViolations: 0,
      violations: [],
      metrics: {
        error: message,
      },
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const deadCodeDetector = new DeadCodeDetector();
