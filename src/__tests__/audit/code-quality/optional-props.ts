/**
 * Optional Props Audit Module
 *
 * Validates: Requirements 1.4
 *
 * Scans React component files for optional props usage:
 * - Finds optional fields in props interfaces (fields with `?` modifier)
 * - Checks for null/undefined checks at usage sites in component body
 * - Reports violations when optional props are used without guards
 *
 * @module audit/code-quality/optional-props
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Violation types for optional props issues.
 */
export type OptionalPropsViolationType =
  | 'missing-null-check'
  | 'missing-undefined-check';

/**
 * Extended violation interface for optional props issues.
 */
export interface OptionalPropsViolation extends AuditViolation {
  category: 'typescript-strict';
  /** Type of optional props violation */
  violationType: OptionalPropsViolationType;
  /** The props interface name */
  interfaceName: string;
  /** The optional prop name */
  propName: string;
  /** Line number where the prop is used without guard */
  usageLineNumber: number;
}

/**
 * Configuration options for the optional props audit.
 */
export interface OptionalPropsConfig {
  /** Source directories to scan (default: ['src/widgets', 'src/cli']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for optional props audit.
 */
const DEFAULT_CONFIG: OptionalPropsConfig = {
  srcDirs: ['src/widgets', 'src/cli'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /\.test\.tsx?$/, /\.pbt\.test\.ts$/],
};

/**
 * Information about an optional prop field.
 */
interface OptionalPropInfo {
  interfaceName: string;
  propName: string;
  lineNumber: number;
}

/**
 * Information about a prop usage site.
 */
interface PropUsage {
  propName: string;
  lineNumber: number;
  hasGuard: boolean;
  usageContext: string;
}

/**
 * Optional Props Audit Module
 *
 * Implements the AuditModule interface to scan React components for
 * optional props that are used without null/undefined guards.
 *
 * @example
 * ```typescript
 * const audit = new OptionalPropsAudit();
 * const report = await audit.run();
 *
 * console.log(`Total violations: ${report.totalViolations}`);
 * console.log(`Missing guards: ${report.metrics?.missingGuards}`);
 * ```
 */
export class OptionalPropsAudit implements AuditModule {
  readonly category: AuditCategory = 'typescript-strict';
  readonly name = 'Optional Props Violation Audit';

  private config: OptionalPropsConfig;

  /**
   * Create a new optional props audit instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<OptionalPropsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the optional props audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const allViolations: OptionalPropsViolation[] = [];

    // Get all source files to scan
    const files = this.getSourceFiles();

    // Check each file for optional props violations
    for (const file of files) {
      const violations = this.checkFile(file);
      allViolations.push(...violations);
    }

    // Calculate metrics
    const missingNullChecks = allViolations.filter(v => v.violationType === 'missing-null-check').length;
    const missingUndefinedChecks = allViolations.filter(v => v.violationType === 'missing-undefined-check').length;

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: allViolations.length,
      violations: allViolations,
      metrics: {
        totalFiles: files.length,
        missingNullChecks,
        missingUndefinedChecks,
        missingGuards: allViolations.length,
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
   * Check a single file for optional props violations.
   *
   * @param filePath - Path to the file to check
   * @returns Array of violations found in the file
   */
  private checkFile(filePath: string): OptionalPropsViolation[] {
    const violations: OptionalPropsViolation[] = [];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return violations; // Skip files that can't be read
    }

    // Parse the file with TypeScript compiler
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Find all optional props in interfaces
    const optionalProps = this.findOptionalProps(sourceFile);

    if (optionalProps.length === 0) {
      return violations; // No optional props to check
    }

    // Find all usages of these optional props
    const usages = this.findPropUsages(sourceFile, optionalProps);

    // Check each usage for guards
    for (const usage of usages) {
      if (!usage.hasGuard) {
        const propInfo = optionalProps.find(p => p.propName === usage.propName);
        if (propInfo) {
          violations.push(this.createViolation(
            filePath,
            propInfo.interfaceName,
            usage.propName,
            usage.lineNumber,
            propInfo.lineNumber,
            'missing-null-check',
            `Optional prop '${usage.propName}' from interface '${propInfo.interfaceName}' is used without null/undefined guard at line ${usage.lineNumber}`
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Find all optional props in props interfaces within a source file.
   *
   * @param sourceFile - TypeScript source file AST
   * @returns Array of optional prop information
   */
  private findOptionalProps(sourceFile: ts.SourceFile): OptionalPropInfo[] {
    const optionalProps: OptionalPropInfo[] = [];

    const visit = (node: ts.Node) => {
      // Look for interface declarations that look like props interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceName = node.name.text;
        
        // Check if this looks like a props interface
        if (interfaceName.endsWith('Props') || interfaceName.includes('Props')) {
          // Find optional members
          for (const member of node.members) {
            if (ts.isPropertySignature(member) && member.questionToken) {
              const propName = member.name && ts.isIdentifier(member.name) ? member.name.text : null;
              if (propName) {
                const lineNumber = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1;
                optionalProps.push({
                  interfaceName,
                  propName,
                  lineNumber,
                });
              }
            }
          }
        }
      }

      // Also check type aliases that might define props
      if (ts.isTypeAliasDeclaration(node)) {
        const typeName = node.name.text;
        
        if (typeName.endsWith('Props') || typeName.includes('Props')) {
          // Check if the type is an object type literal
          if (ts.isTypeLiteralNode(node.type)) {
            for (const member of node.type.members) {
              if (ts.isPropertySignature(member) && member.questionToken) {
                const propName = member.name && ts.isIdentifier(member.name) ? member.name.text : null;
                if (propName) {
                  const lineNumber = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1;
                  optionalProps.push({
                    interfaceName: typeName,
                    propName,
                    lineNumber,
                  });
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return optionalProps;
  }

  /**
   * Find all usages of optional props and check if they have guards.
   *
   * @param sourceFile - TypeScript source file AST
   * @param optionalProps - Array of optional prop information
   * @returns Array of prop usage information
   */
  private findPropUsages(sourceFile: ts.SourceFile, optionalProps: OptionalPropInfo[]): PropUsage[] {
    const usages: PropUsage[] = [];
    const propNames = new Set(optionalProps.map(p => p.propName));
    const seenUsages = new Set<string>(); // Track unique usages by line:prop

    const visit = (node: ts.Node, parent?: ts.Node) => {
      // Look for property access expressions (e.g., props.optionalProp)
      if (ts.isPropertyAccessExpression(node)) {
        const propName = node.name.text;
        
        if (propNames.has(propName)) {
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          const usageKey = `${lineNumber}:${propName}`;
          
          // Skip if we've already recorded this usage
          if (seenUsages.has(usageKey)) {
            ts.forEachChild(node, child => visit(child, node));
            return;
          }
          seenUsages.add(usageKey);
          
          const hasGuard = this.checkIfGuarded(node, parent, sourceFile);
          
          usages.push({
            propName,
            lineNumber,
            hasGuard,
            usageContext: this.getUsageContext(node, sourceFile),
          });
        }
      }

      // Look for identifier references (e.g., destructured props)
      if (ts.isIdentifier(node)) {
        const propName = node.text;
        
        if (propNames.has(propName)) {
          // Check if this is actually a prop usage (not a declaration)
          if (!this.isDeclaration(node, parent)) {
            const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            const usageKey = `${lineNumber}:${propName}`;
            
            // Skip if we've already recorded this usage
            if (seenUsages.has(usageKey)) {
              ts.forEachChild(node, child => visit(child, node));
              return;
            }
            seenUsages.add(usageKey);
            
            const hasGuard = this.checkIfGuarded(node, parent, sourceFile);
            
            usages.push({
              propName,
              lineNumber,
              hasGuard,
              usageContext: this.getUsageContext(node, sourceFile),
            });
          }
        }
      }

      ts.forEachChild(node, child => visit(child, node));
    };

    visit(sourceFile);
    return usages;
  }

  /**
   * Check if a node is guarded by examining the immediate parent and context.
   */
  private checkIfGuarded(node: ts.Node, parent: ts.Node | undefined, sourceFile: ts.SourceFile): boolean {
    if (!parent) return false;
    
    // Check for optional chaining:
    // When we find `props.optional` (a PropertyAccessExpression), 
    // if it's used as `props.optional?.length`, the parent is also a PropertyAccessExpression
    // with questionDotToken, and our node is the expression of that parent.
    if (ts.isPropertyAccessExpression(parent) && parent.questionDotToken) {
      // Our node is the expression being optionally accessed
      if (parent.expression === node) {
        return true;
      }
    }
    
    // Check if our node itself uses optional chaining (e.g., we found a node like `props.optional?.something`)
    if (ts.isPropertyAccessExpression(node) && node.questionDotToken) {
      return true;
    }
    
    // Check if parent is nullish coalescing: props.optional ?? default
    if (ts.isBinaryExpression(parent)) {
      if (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        if (parent.left === node) {
          return true;
        }
      }
      
      // Check if parent is logical AND: props.optional && ...
      if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return true;
      }
    }
    
    // Check if inside an if statement that guards this prop
    if (this.isGuardedByIfStatement(node, parent, sourceFile)) {
      return true;
    }
    
    // Recursively check grandparent (but limit depth to avoid infinite recursion)
    const grandParent = this.findDirectParent(parent, sourceFile);
    if (grandParent && grandParent !== sourceFile) {
      return this.checkIfGuarded(parent, grandParent, sourceFile);
    }
    
    return false;
  }

  /**
   * Check if a node is guarded by an if statement condition.
   */
  private isGuardedByIfStatement(node: ts.Node, parent: ts.Node, sourceFile: ts.SourceFile): boolean {
    let current: ts.Node | undefined = parent;
    const nodeText = node.getText(sourceFile);
    
    while (current && current !== sourceFile) {
      if (ts.isIfStatement(current)) {
        const conditionText = current.expression.getText(sourceFile);
        const thenStatementText = current.thenStatement.getText(sourceFile);
        
        // Check if the condition references the prop name
        if (conditionText.includes(nodeText)) {
          // Check if our node is in the then block
          if (thenStatementText.includes(nodeText)) {
            return true;
          }
        }
      }
      
      current = this.findDirectParent(current, sourceFile);
    }
    
    return false;
  }

  /**
   * Find the direct parent of a node.
   */
  private findDirectParent(targetNode: ts.Node, sourceFile: ts.SourceFile): ts.Node | undefined {
    let parent: ts.Node | undefined;
    
    const visit = (node: ts.Node) => {
      ts.forEachChild(node, child => {
        if (child === targetNode) {
          parent = node;
        } else {
          visit(child);
        }
      });
    };
    
    visit(sourceFile);
    return parent;
  }

  /**
   * Get the parent chain for a node.
   */
  private getParentChain(targetNode: ts.Node, sourceFile: ts.SourceFile): ts.Node[] {
    const chain: ts.Node[] = [];
    
    const buildChain = (node: ts.Node, parents: ts.Node[]): boolean => {
      if (node === targetNode) {
        chain.push(...parents, node);
        return true;
      }
      
      let found = false;
      ts.forEachChild(node, child => {
        if (!found && buildChain(child, [...parents, node])) {
          found = true;
        }
      });
      
      return found;
    };
    
    buildChain(sourceFile, []);
    return chain;
  }

  /**
   * Check if a node contains or equals another node.
   */
  private nodeContainsOrEquals(container: ts.Node, target: ts.Node): boolean {
    if (container === target) {
      return true;
    }
    
    let found = false;
    const visit = (node: ts.Node) => {
      if (node === target) {
        found = true;
        return;
      }
      if (!found) {
        ts.forEachChild(node, visit);
      }
    };
    
    visit(container);
    return found;
  }

  /**
   * Check if a node is a declaration (not a usage).
   */
  private isDeclaration(node: ts.Node, parent?: ts.Node): boolean {
    if (!parent) return false;

    // Check if this is part of a destructuring pattern
    if (ts.isBindingElement(parent)) {
      return true;
    }

    // Check if this is a parameter declaration
    if (ts.isParameter(parent)) {
      return true;
    }

    // Check if this is a variable declaration
    if (ts.isVariableDeclaration(parent)) {
      return true;
    }

    // Check if this is a property signature in an interface or type alias
    if (ts.isPropertySignature(parent)) {
      return true;
    }

    return false;
  }

  /**
   * Get the usage context for a prop (for debugging/reporting).
   */
  private getUsageContext(node: ts.Node, sourceFile: ts.SourceFile): string {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const contextStart = Math.max(0, start - 20);
    const contextEnd = Math.min(sourceFile.text.length, end + 20);
    
    return sourceFile.text.substring(contextStart, contextEnd).trim();
  }

  /**
   * Create an optional props violation object.
   */
  private createViolation(
    filePath: string,
    interfaceName: string,
    propName: string,
    usageLineNumber: number,
    declarationLineNumber: number,
    violationType: OptionalPropsViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'high'
  ): OptionalPropsViolation {
    return {
      category: 'typescript-strict',
      severity,
      filePath,
      lineNumber: declarationLineNumber,
      message,
      violationType,
      interfaceName,
      propName,
      usageLineNumber,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const optionalPropsAudit = new OptionalPropsAudit();
