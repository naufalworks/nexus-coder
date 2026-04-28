/**
 * Naming Conventions Audit Module
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * Scans source files and checks naming conventions:
 * - File extension validation (.ts for TypeScript, .tsx for React components)
 * - Test file naming pattern check (.test.ts, .test.tsx, .pbt.test.ts)
 * - PascalCase for component files, camelCase for utility files
 * - File-symbol name matching for single-export modules
 *
 * @module audit/code-quality/naming-conventions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Naming convention violation types.
 */
export type NamingViolationType =
  | 'invalid-extension'
  | 'invalid-test-pattern'
  | 'invalid-pascal-case'
  | 'invalid-camel-case'
  | 'file-symbol-mismatch';

/**
 * Entity types that can be checked for naming conventions.
 */
export type EntityType = 'file' | 'function' | 'class' | 'interface' | 'type' | 'variable';

/**
 * Extended violation interface for naming convention issues.
 */
export interface NamingConventionViolation extends AuditViolation {
  category: 'naming-conventions';
  /** Type of naming convention violation */
  violationType: NamingViolationType;
  /** Expected naming pattern */
  expectedPattern: string;
  /** Actual name found */
  actualName: string;
  /** Type of entity (file, function, class, etc.) */
  entityType: EntityType;
}

/**
 * Configuration options for the naming conventions audit.
 */
export interface NamingConventionsConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** Valid TypeScript source file extensions */
  sourceExtensions: string[];
  /** Valid test file patterns */
  testPatterns: RegExp[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for naming conventions audit.
 */
const DEFAULT_CONFIG: NamingConventionsConfig = {
  srcDirs: ['src'],
  sourceExtensions: ['.ts', '.tsx'],
  testPatterns: [/\.test\.ts$/, /\.test\.tsx$/, /\.pbt\.test\.ts$/],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /\.DS_Store/, /\.git\//],
};

/**
 * Naming Conventions Audit Module
 *
 * Implements the AuditModule interface to validate file naming conventions
 * and file-symbol name matching across the codebase.
 *
 * @example
 * ```typescript
 * const audit = new NamingConventionsAudit();
 * const report = await audit.run();
 *
 * console.log(`Total violations: ${report.totalViolations}`);
 * console.log(`PascalCase violations: ${report.metrics?.pascalCaseViolations}`);
 * console.log(`File-symbol mismatches: ${report.metrics?.fileSymbolMismatches}`);
 * ```
 */
export class NamingConventionsAudit implements AuditModule {
  readonly category: AuditCategory = 'naming-conventions';
  readonly name = 'Naming Conventions Audit';

  private config: NamingConventionsConfig;

  /**
   * Create a new naming conventions audit instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<NamingConventionsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the naming conventions audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const allViolations: NamingConventionViolation[] = [];

    // Get all source files to scan
    const files = this.getSourceFiles();

    // Check each file for naming convention violations
    for (const file of files) {
      const violations = this.checkFile(file);
      allViolations.push(...violations);
    }

    // Check file-symbol name matching for single-export modules
    const fileSymbolViolations = this.checkFileSymbolMatching(files);
    allViolations.push(...fileSymbolViolations);

    // Calculate metrics
    const extensionViolations = allViolations.filter(v => v.violationType === 'invalid-extension').length;
    const testPatternViolations = allViolations.filter(v => v.violationType === 'invalid-test-pattern').length;
    const pascalCaseViolations = allViolations.filter(v => v.violationType === 'invalid-pascal-case').length;
    const camelCaseViolations = allViolations.filter(v => v.violationType === 'invalid-camel-case').length;
    const fileSymbolMismatches = allViolations.filter(v => v.violationType === 'file-symbol-mismatch').length;

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: allViolations.length,
      violations: allViolations,
      metrics: {
        totalFiles: files.length,
        extensionViolations,
        testPatternViolations,
        pascalCaseViolations,
        camelCaseViolations,
        fileSymbolMismatches,
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
        files.push(fullPath);
      }
    }
  }

  /**
   * Check a single file for naming convention violations.
   *
   * @param filePath - Path to the file to check
   * @returns Array of violations found for the file
   */
  private checkFile(filePath: string): NamingConventionViolation[] {
    const violations: NamingConventionViolation[] = [];
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);

    // Requirement 3.1: File extension validation (.ts, .tsx)
    const extensionViolation = this.checkFileExtension(filePath, fileName, ext);
    if (extensionViolation) {
      violations.push(extensionViolation);
    }

    // Skip further checks for non-TypeScript files
    if (!this.config.sourceExtensions.includes(ext)) {
      return violations;
    }

    // Determine if this is a test file
    const isTestFile = this.isTestFile(fileName);

    // Requirement 3.2, 3.3: Test file naming pattern check
    const testPatternViolation = this.checkTestPattern(filePath, fileName, baseName, ext);
    if (testPatternViolation) {
      violations.push(testPatternViolation);
    }

    // Skip naming convention checks for test files (they have their own patterns)
    if (isTestFile) {
      return violations;
    }

    // Requirement 3.4: PascalCase/camelCase detection
    const casingViolation = this.checkFileCasing(filePath, fileName, baseName, ext);
    if (casingViolation) {
      violations.push(casingViolation);
    }

    return violations;
  }

  /**
   * Check if the file extension is valid.
   * Requirement 3.1: All TypeScript source files use .ts extension and React components use .tsx extension.
   *
   * @param filePath - Full file path
   * @param fileName - File name with extension
   * @param ext - File extension
   * @returns Violation if extension is invalid, null otherwise
   */
  private checkFileExtension(
    filePath: string,
    fileName: string,
    ext: string
  ): NamingConventionViolation | null {
    // Check for JavaScript files (should be TypeScript)
    if (ext === '.js' || ext === '.jsx') {
      return this.createViolation(
        filePath,
        0,
        'invalid-extension',
        `JavaScript file found: ${fileName}. Use .ts for TypeScript source files.`,
        fileName,
        '.ts or .tsx',
        'file'
      );
    }

    // Check for TypeScript extensions
    if (!this.config.sourceExtensions.includes(ext)) {
      // Only report if it looks like it could be a source file
      if (!ext || ext.length <= 4) {
        return this.createViolation(
          filePath,
          0,
          'invalid-extension',
          `Invalid file extension '${ext}' for ${fileName}. Use .ts for TypeScript or .tsx for React components.`,
          fileName,
          '.ts or .tsx',
          'file'
        );
      }
    }

    return null;
  }

  /**
   * Check if test file follows naming pattern.
   * Requirement 3.2: All unit test files follow .test.ts or .test.tsx naming pattern.
   * Requirement 3.3: All property-based test files follow .pbt.test.ts naming pattern.
   *
   * @param filePath - Full file path
   * @param fileName - File name with extension
   * @param baseName - File name without extension
   * @param ext - File extension
   * @returns Violation if test pattern is invalid, null otherwise
   */
  private checkTestPattern(
    filePath: string,
    fileName: string,
    baseName: string,
    ext: string
  ): NamingConventionViolation | null {
    // Check if file contains test-related content but doesn't follow pattern
    const isLikelyTest = baseName.includes('test') || baseName.includes('spec') || baseName.includes('Test');
    const isActualTestPattern = this.config.testPatterns.some(pattern => pattern.test(fileName));
    const hasTestDirectory = filePath.includes('/__tests__/') || filePath.includes('\\__tests\\');

    // Skip audit infrastructure files (they're not tests, they're audit modules)
    const isAuditInfrastructure = filePath.includes('/audit/') && !isActualTestPattern;
    if (isAuditInfrastructure) {
      return null;
    }

    // Skip framework/helper files in __tests__ subdirectories
    // These are infrastructure files, not actual test files:
    // - __tests__/helpers/ - test helper utilities
    // - __tests__/audit/framework/ - audit framework infrastructure
    // - __tests__/audit/code-quality/ - audit module implementations
    // - __tests__/types/ - test type definitions
    const isTestInfrastructure = this.isTestInfrastructureFile(filePath);
    if (isTestInfrastructure) {
      return null;
    }

    // If file is in __tests__ directory but doesn't have test pattern
    if (hasTestDirectory && !isActualTestPattern && this.config.sourceExtensions.includes(ext)) {
      return this.createViolation(
        filePath,
        0,
        'invalid-test-pattern',
        `Test file '${fileName}' in __tests__ directory should follow .test.ts, .test.tsx, or .pbt.test.ts pattern.`,
        fileName,
        '.test.ts, .test.tsx, or .pbt.test.ts',
        'file'
      );
    }

    // If file name suggests it's a test but pattern is wrong
    if (isLikelyTest && !isActualTestPattern && !hasTestDirectory) {
      // Only warn if it ends with 'test' or 'spec' but doesn't match pattern
      const testEndingPattern = /(Test|Spec|test|spec)$/;
      if (testEndingPattern.test(baseName)) {
        return this.createViolation(
          filePath,
          0,
          'invalid-test-pattern',
          `File '${fileName}' appears to be a test file but doesn't follow naming pattern. Use .test.ts, .test.tsx, or .pbt.test.ts.`,
          fileName,
          '.test.ts, .test.tsx, or .pbt.test.ts',
          'file'
        );
      }
    }

    return null;
  }

  /**
   * Check if file follows PascalCase or camelCase naming.
   * Requirement 3.4: All file names use PascalCase for components and camelCase for utilities.
   *
   * @param filePath - Full file path
   * @param fileName - File name with extension
   * @param baseName - File name without extension
   * @param ext - File extension
   * @returns Violation if casing is invalid, null otherwise
   */
  private checkFileCasing(
    filePath: string,
    fileName: string,
    baseName: string,
    ext: string
  ): NamingConventionViolation | null {
    // Skip index files (they're special)
    if (baseName === 'index') {
      return null;
    }

    // Skip configuration files and special files
    const specialFiles = ['tsconfig', 'jest.config', 'package', 'eslint', '.env', 'README', 'LICENSE'];
    if (specialFiles.some(special => baseName.toLowerCase().includes(special.toLowerCase()))) {
      return null;
    }

    // Skip audit infrastructure files (they use hyphens for readability)
    const isAuditInfrastructure = filePath.includes('/audit/') && !filePath.includes('.test.');
    if (isAuditInfrastructure) {
      return null;
    }

    // Skip agent files (they commonly use kebab-case like coder-agent.ts)
    const isAgentFile = filePath.includes('/agents/') && baseName.endsWith('-agent');
    if (isAgentFile) {
      return null;
    }

    // Skip CLI files (they commonly use kebab-case like approval-ui.ts)
    const isCLIFile = filePath.includes('/cli/') && baseName.includes('-');
    if (isCLIFile) {
      return null;
    }

    // .tsx files should be PascalCase (React components)
    if (ext === '.tsx') {
      if (!this.isPascalCase(baseName)) {
        return this.createViolation(
          filePath,
          0,
          'invalid-pascal-case',
          `React component file '${fileName}' should use PascalCase naming.`,
          fileName,
          'PascalCase (e.g., MyComponent.tsx)',
          'file'
        );
      }
    }

    // .ts files should be camelCase (utilities, modules)
    if (ext === '.ts') {
      // Check if it's a component-like file (might have been named incorrectly)
      const isPascalCaseFile = this.isPascalCase(baseName);
      
      // If it looks like a component name but has .ts extension, suggest .tsx
      // Otherwise, enforce camelCase for utilities
      if (!this.isCamelCase(baseName) && !isPascalCaseFile) {
        // Check for common naming issues
        if (baseName.includes('-') || baseName.includes('_')) {
          return this.createViolation(
            filePath,
            0,
            'invalid-camel-case',
            `Utility file '${fileName}' should use camelCase naming (no hyphens or underscores).`,
            fileName,
            'camelCase (e.g., myUtility.ts)',
            'file'
          );
        }
        
        // Check for starting with uppercase when it shouldn't
        if (/^[A-Z]/.test(baseName) && !this.isLikelyComponent(filePath, baseName)) {
          return this.createViolation(
            filePath,
            0,
            'invalid-camel-case',
            `Utility file '${fileName}' should use camelCase naming (lowercase first character).`,
            fileName,
            'camelCase (e.g., myUtility.ts)',
            'file'
          );
        }
      }
    }

    return null;
  }

  /**
   * Check file-symbol name matching for single-export modules.
   * Requirement 3.5: All exported symbols match their containing file name for single-export modules.
   * Requirement 3.6: When a naming convention violation is found, report file path, current name, and expected naming pattern.
   *
   * @param files - Array of file paths to check
   * @returns Array of violations found
   */
  private checkFileSymbolMatching(files: string[]): NamingConventionViolation[] {
    const violations: NamingConventionViolation[] = [];

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName);
      
      // Only check TypeScript source files
      if (!this.config.sourceExtensions.includes(ext)) {
        continue;
      }

      // Skip test files
      if (this.isTestFile(fileName)) {
        continue;
      }

      // Skip index files
      const baseName = path.basename(fileName, ext);
      if (baseName === 'index') {
        continue;
      }

      // Get exports from the file
      const exports = this.getFileExports(filePath);

      // Only check files with a single default export
      if (exports.length === 1 && exports[0].isDefault) {
        const exportName = exports[0].name;
        
        // Check if the export name matches the file name
        if (exportName && exportName !== baseName) {
          // Normalize both names for comparison
          const normalizedExport = this.normalizeName(exportName);
          const normalizedFile = this.normalizeName(baseName);

          if (normalizedExport !== normalizedFile) {
            violations.push(this.createViolation(
              filePath,
              exports[0].lineNumber,
              'file-symbol-mismatch',
              `Export '${exportName}' does not match file name '${baseName}'. For single-export modules, the symbol name should match the file name.`,
              exportName,
              baseName,
              exports[0].kind
            ));
          }
        }
      }
    }

    return violations;
  }

  /**
   * Check if file is test infrastructure (helper/utility file, not a test).
   */
  private isTestInfrastructureFile(filePath: string): boolean {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // These directories contain infrastructure, not tests
    const infrastructureDirs = [
      '/__tests__/helpers/',
      '/__tests__/audit/framework/',
      '/__tests__/audit/code-quality/',
      '/__tests__/types/',
      '/__tests__/fixtures/',
    ];

    return infrastructureDirs.some(dir => normalizedPath.includes(dir));
  }

  /**
   * Check if a file is a test file based on naming pattern.
   */
  private isTestFile(fileName: string): boolean {
    return this.config.testPatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Check if a string is in PascalCase format.
   * PascalCase: Each word starts with uppercase, no separators.
   * Examples: MyComponent, TaskPanel, DiffApproval
   */
  private isPascalCase(name: string): boolean {
    // Must start with uppercase
    // No separators (hyphens, underscores)
    // No consecutive uppercase at start (e.g., not XMLParser - but allow single letter prefixes like IComponent)
    if (!name || name.length === 0) return false;
    
    // Check for invalid characters
    if (name.includes('-') || name.includes('_') || name.includes(' ')) {
      return false;
    }

    // Must start with uppercase letter
    if (!/^[A-Z]/.test(name)) {
      return false;
    }

    // Must be valid identifier
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      return false;
    }

    return true;
  }

  /**
   * Check if a string is in camelCase format.
   * camelCase: First word lowercase, subsequent words start with uppercase, no separators.
   * Examples: myUtility, formatDate, handleClick
   */
  private isCamelCase(name: string): boolean {
    if (!name || name.length === 0) return false;
    
    // Check for invalid characters
    if (name.includes('-') || name.includes('_') || name.includes(' ')) {
      return false;
    }

    // Must start with lowercase letter
    if (!/^[a-z]/.test(name)) {
      return false;
    }

    // Must be valid identifier
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      return false;
    }

    return true;
  }

  /**
   * Check if a file is likely a React component based on content.
   */
  private isLikelyComponent(filePath: string, baseName: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for common React component patterns
      const componentPatterns = [
        /import\s+.*from\s+['"]react['"]/,
        /import\s+.*from\s+['"]react-dom['"]/,
        /@jsx\s+React\.DOM/,
        /React\.createElement/,
        /JSX\.Element/,
        /FC</,
        /FunctionComponent</,
        /Props>/,
        /interface\s+\w+Props/,
      ];

      return componentPatterns.some(pattern => pattern.test(content));
    } catch {
      return false;
    }
  }

  /**
   * Normalize a name for comparison (remove case differences).
   */
  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[-_]/g, '');
  }

  /**
   * Get all exports from a TypeScript file.
   */
  private getFileExports(filePath: string): Array<{
    name: string;
    isDefault: boolean;
    lineNumber: number;
    kind: EntityType;
  }> {
    const exports: Array<{
      name: string;
      isDefault: boolean;
      lineNumber: number;
      kind: EntityType;
    }> = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // Check for default export
        if (ts.isExportAssignment(node)) {
          // export default expression
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          
          if (ts.isIdentifier(node.expression)) {
            exports.push({
              name: node.expression.text,
              isDefault: true,
              lineNumber: line,
              kind: 'variable',
            });
          } else if (ts.isFunctionExpression(node.expression) && node.expression.name) {
            exports.push({
              name: node.expression.name.text,
              isDefault: true,
              lineNumber: line,
              kind: 'function',
            });
          } else if (ts.isClassExpression(node.expression) && node.expression.name) {
            exports.push({
              name: node.expression.name.text,
              isDefault: true,
              lineNumber: line,
              kind: 'class',
            });
          }
        }

        // Check for export declarations
        if (ts.isExportDeclaration(node)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              exports.push({
                name: element.name.text,
                isDefault: false,
                lineNumber: line,
                kind: 'variable',
              });
            }
          }
        }

        // Check for function declarations with export keyword
        if (ts.isFunctionDeclaration(node) && node.name) {
          const hasExportModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.ExportKeyword
          );
          const hasDefaultModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.DefaultKeyword
          );

          if (hasExportModifier) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              name: node.name.text,
              isDefault: hasDefaultModifier || false,
              lineNumber: line,
              kind: 'function',
            });
          }
        }

        // Check for class declarations with export keyword
        if (ts.isClassDeclaration(node) && node.name) {
          const hasExportModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.ExportKeyword
          );
          const hasDefaultModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.DefaultKeyword
          );

          if (hasExportModifier) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              name: node.name.text,
              isDefault: hasDefaultModifier || false,
              lineNumber: line,
              kind: 'class',
            });
          }
        }

        // Check for interface declarations with export keyword
        if (ts.isInterfaceDeclaration(node) && node.name) {
          const hasExportModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.ExportKeyword
          );

          if (hasExportModifier) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              name: node.name.text,
              isDefault: false,
              lineNumber: line,
              kind: 'interface',
            });
          }
        }

        // Check for type alias declarations with export keyword
        if (ts.isTypeAliasDeclaration(node) && node.name) {
          const hasExportModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.ExportKeyword
          );

          if (hasExportModifier) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            exports.push({
              name: node.name.text,
              isDefault: false,
              lineNumber: line,
              kind: 'type',
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch {
      // If we can't parse the file, return empty array
    }

    return exports;
  }

  /**
   * Create a naming convention violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: NamingViolationType,
    message: string,
    actualName: string,
    expectedPattern: string,
    entityType: EntityType,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): NamingConventionViolation {
    return {
      category: 'naming-conventions',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      expectedPattern,
      actualName,
      entityType,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const namingConventionsAudit = new NamingConventionsAudit();
