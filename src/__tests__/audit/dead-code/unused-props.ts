/**
 * Unused Props Analyzer
 *
 * Validates: Requirements 2.2, 2.4
 *
 * Identifies React component props that are declared but never passed by any consumer.
 * Uses TypeScript Compiler API to:
 * - Parse React component props interfaces
 * - Find all JSX usage sites for each component
 * - Identify props declared but never passed
 *
 * Key considerations:
 * - Handles both functional components and class components
 * - Handles both TypeScript interface props and inline prop types
 * - Tracks spread props (...) which make all props potentially used
 * - Accounts for children prop (special case)
 * - Handles optional vs required props appropriately
 *
 * @module audit/dead-code/unused-props
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Information about a React component's props.
 */
interface ComponentPropsInfo {
  /** Component name */
  componentName: string;
  /** Props interface name (if using named interface) */
  interfaceName: string | null;
  /** File path where component is defined */
  filePath: string;
  /** Line number of component definition */
  lineNumber: number;
  /** Names of all declared props */
  declaredProps: Set<string>;
  /** Whether the component uses inline type for props */
  hasInlineProps: boolean;
  /** Whether the component uses spread props in the parameter */
  usesSpread: boolean;
}

/**
 * Information about JSX usage of a component.
 */
interface JSXUsageSite {
  /** Component name */
  componentName: string;
  /** File path where JSX is used */
  filePath: string;
  /** Line number of JSX usage */
  lineNumber: number;
  /** Props passed in this usage */
  passedProps: Set<string>;
  /** Whether the usage has spread props */
  hasSpread: boolean;
}

/**
 * Information about unused props.
 */
export interface UnusedProps {
  /** Props interface name */
  interfaceName: string | null;
  /** Component name */
  componentName: string;
  /** Names of unused prop fields */
  unusedProps: string[];
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Whether the component has any usage sites */
  hasUsageSites: boolean;
}

/**
 * Extended violation interface for unused props issues.
 */
export interface UnusedPropsViolation extends AuditViolation {
  category: 'dead-code';
  /** Component name */
  componentName: string;
  /** Interface name (if applicable) */
  interfaceName?: string;
  /** Names of unused props */
  unusedPropNames: string[];
  /** Whether the violation is for unused props */
  violationType: 'unused-props';
}

/**
 * Configuration options for the unused props analyzer.
 */
export interface UnusedPropsAnalyzerConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Props to ignore (e.g., children, className, style, key) */
  ignoredProps: string[];
}

/**
 * Default configuration for unused props analyzer.
 */
const DEFAULT_CONFIG: UnusedPropsAnalyzerConfig = {
  srcDirs: ['src'],
  extensions: ['.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /\.test\./, /\.spec\./],
  // These props are commonly handled by React or framework conventions
  ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
};

/**
 * Unused Props Analyzer Module
 *
 * Implements the AuditModule interface to identify React component props
 * that are declared but never passed by any consumer.
 *
 * @example
 * ```typescript
 * const analyzer = new UnusedPropsAnalyzer();
 * const report = await analyzer.run();
 *
 * console.log(`Unused props: ${report.totalViolations}`);
 * for (const violation of report.violations) {
 *   console.log(`${violation.filePath}:${violation.lineNumber}`);
 *   console.log(`  Unused props: ${violation.unusedPropNames.join(', ')}`);
 * }
 * ```
 */
export class UnusedPropsAnalyzer implements AuditModule {
  readonly category: AuditCategory = 'dead-code';
  readonly name = 'Unused Props Analyzer';

  private config: UnusedPropsAnalyzerConfig;

  // Component tracking
  private components: Map<string, ComponentPropsInfo> = new Map();
  // JSX usage tracking (multiple usage sites per component)
  private jsxUsages: Map<string, JSXUsageSite[]> = new Map();
  // Parsed source files cache
  private sourceFiles: Map<string, ts.SourceFile> = new Map();

  /**
   * Create a new unused props analyzer instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<UnusedPropsAnalyzerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the unused props analysis.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    // Clear previous analysis
    this.components.clear();
    this.jsxUsages.clear();
    this.sourceFiles.clear();

    // Get all source files to analyze
    const filePaths = this.getAllSourceFiles();

    // Phase 1: Parse all source files and extract component props
    this.extractComponentProps(filePaths);

    // Phase 2: Find all JSX usage sites for each component
    this.findJSXUsageSites(filePaths);

    // Phase 3: Identify unused props
    const unusedPropsList = this.identifyUnusedProps();

    // Phase 4: Generate violations
    const violations = this.generateViolations(unusedPropsList);

    // Calculate metrics
    const totalComponents = this.components.size;
    const componentsWithUsages = Array.from(this.components.keys()).filter(
      (name) => (this.jsxUsages.get(name)?.length || 0) > 0
    ).length;

    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        totalComponents,
        componentsWithUsages,
        componentsWithoutUsages: totalComponents - componentsWithUsages,
        totalUnusedProps: unusedPropsList.reduce(
          (sum, up) => sum + up.unusedProps.length,
          0
        ),
      },
    };

    return report;
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
   * Parse a TypeScript source file.
   */
  private parseSourceFile(filePath: string): ts.SourceFile | null {
    if (this.sourceFiles.has(filePath)) {
      return this.sourceFiles.get(filePath)!;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true // setParentNodes
      );
      this.sourceFiles.set(filePath, sourceFile);
      return sourceFile;
    } catch {
      return null;
    }
  }

  /**
   * Phase 1: Extract component props from all source files.
   *
   * Identifies:
   * - Functional components with named props interfaces
   * - Functional components with inline props types
   * - Class components with props interfaces
   */
  private extractComponentProps(filePaths: string[]): void {
    for (const filePath of filePaths) {
      const sourceFile = this.parseSourceFile(filePath);
      if (!sourceFile) continue;

      this.extractComponentsFromFile(sourceFile, filePath);
    }
  }

  /**
   * Extract components from a source file.
   *
   * Processing order matters:
   * 1. FC-style exports (React.FC<Props>) - most authoritative for prop types
   * 2. Class components (extends React.Component<Props>)
   * 3. Function declarations with typed props
   * 4. Arrow functions (only if not already found via FC type)
   *
   * This order ensures that when a component has both an FC type annotation
   * and destructured parameters, we prefer the FC interface.
   */
  private extractComponentsFromFile(
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    // Phase 1: Extract FC-styled components first (most authoritative)
    const visitFC = (node: ts.Node) => {
      this.checkFunctionComponentExport(node, sourceFile, filePath);
      this.checkClassComponent(node, sourceFile, filePath);
      ts.forEachChild(node, visitFC);
    };
    visitFC(sourceFile);

    // Phase 2: Extract function declarations (with typed props)
    const visitFuncDecl = (node: ts.Node) => {
      this.checkFunctionDeclaration(node, sourceFile, filePath);
      ts.forEachChild(node, visitFuncDecl);
    };
    visitFuncDecl(sourceFile);

    // Phase 3: Extract arrow functions (only if not already found)
    const visitArrow = (node: ts.Node) => {
      this.checkArrowFunctionComponent(node, sourceFile, filePath);
      ts.forEachChild(node, visitArrow);
    };
    visitArrow(sourceFile);
  }

  /**
   * Check for function component export with React.FC<Props>.
   */
  private checkFunctionComponentExport(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    if (!ts.isVariableStatement(node)) return;

    const declarations = node.declarationList.declarations;
    for (const decl of declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (!decl.type) continue;

      const componentName = decl.name.text;

      // Check for React.FC<Props> or React.FunctionComponent<Props>
      const typeName = this.extractPropsTypeNameFromFC(decl.type);
      if (!typeName) continue;

      const lineNumber =
        sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;

      // Find the props interface to get prop names
      const propNames = this.getPropsFromInterface(typeName, filePath, sourceFile);

      this.components.set(componentName, {
        componentName,
        interfaceName: typeName,
        filePath,
        lineNumber,
        declaredProps: propNames,
        hasInlineProps: false,
        usesSpread: false,
      });
    }
  }

  /**
   * Check for function declaration with props parameter.
   */
  private checkFunctionDeclaration(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    if (!ts.isFunctionDeclaration(node)) return;
    if (!node.name) return;

    const componentName = node.name.text;

    // Check if this looks like a React component (starts with uppercase)
    if (!this.isComponentName(componentName)) return;

    const lineNumber =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    // Extract props from parameters
    const propsInfo = this.extractPropsFromParameters(
      node.parameters,
      sourceFile,
      filePath
    );

    // If we have an interface name but no prop names, look up the interface
    let finalPropNames = propsInfo.propNames;
    if (propsInfo.interfaceName && propsInfo.propNames.size === 0) {
      finalPropNames = this.getPropsFromInterface(
        propsInfo.interfaceName,
        filePath,
        sourceFile
      );
    }

    this.components.set(componentName, {
      componentName,
      interfaceName: propsInfo.interfaceName,
      filePath,
      lineNumber,
      declaredProps: finalPropNames,
      hasInlineProps: propsInfo.isInline,
      usesSpread: propsInfo.usesSpread,
    });
  }

  /**
   * Check for arrow function component.
   *
   * Note: This is processed after FC-style exports. If a component was already
   * found via React.FC<Props> type annotation, we skip it here because the
   * interface is the authoritative source of props.
   */
  private checkArrowFunctionComponent(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    if (!ts.isVariableStatement(node)) return;

    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const componentName = decl.name.text;

      // Check if this looks like a React component
      if (!this.isComponentName(componentName)) continue;

      // Skip if already found via FC type annotation (more authoritative)
      if (this.components.has(componentName)) continue;

      // Check if initializer is an arrow function
      if (!decl.initializer) continue;
      if (!ts.isArrowFunction(decl.initializer)) continue;

      const lineNumber =
        sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;

      // Extract props from parameters
      const propsInfo = this.extractPropsFromParameters(
        decl.initializer.parameters,
        sourceFile,
        filePath
      );

      // If we have an interface name but no prop names, look up the interface
      let finalPropNames = propsInfo.propNames;
      if (propsInfo.interfaceName && propsInfo.propNames.size === 0) {
        finalPropNames = this.getPropsFromInterface(
          propsInfo.interfaceName,
          filePath,
          sourceFile
        );
      }

      this.components.set(componentName, {
        componentName,
        interfaceName: propsInfo.interfaceName,
        filePath,
        lineNumber,
        declaredProps: finalPropNames,
        hasInlineProps: propsInfo.isInline,
        usesSpread: propsInfo.usesSpread,
      });
    }
  }

  /**
   * Check for class component extending React.Component.
   */
  private checkClassComponent(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    if (!ts.isClassDeclaration(node)) return;
    if (!node.name) return;

    const componentName = node.name.text;

    // Check if this class extends React.Component or React.PureComponent
    if (!this.extendsReactComponent(node)) return;

    const lineNumber =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    // Extract props type from heritage clause
    const propsTypeName = this.extractPropsTypeFromClass(node);

    if (propsTypeName) {
      const propNames = this.getPropsFromInterface(propsTypeName, filePath, sourceFile);

      this.components.set(componentName, {
        componentName,
        interfaceName: propsTypeName,
        filePath,
        lineNumber,
        declaredProps: propNames,
        hasInlineProps: false,
        usesSpread: false,
      });
    } else {
      // No props type specified - component has no props
      this.components.set(componentName, {
        componentName,
        interfaceName: null,
        filePath,
        lineNumber,
        declaredProps: new Set(),
        hasInlineProps: false,
        usesSpread: false,
      });
    }
  }

  /**
   * Extract props interface definitions.
   */
  private extractPropsInterface(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    // Intentionally not storing interfaces here - they are looked up on demand
    // This method can be extended for additional interface analysis
  }

  /**
   * Extract props type name from React.FC<Props> style type annotation.
   */
  private extractPropsTypeNameFromFC(typeNode: ts.TypeNode): string | null {
    // Handle React.FC<Props> or React.FunctionComponent<Props>
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText();

      if (
        typeName === 'React.FC' ||
        typeName === 'React.FunctionComponent' ||
        typeName === 'FC' ||
        typeName === 'FunctionComponent'
      ) {
        // Get the type argument
        if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
          return typeNode.typeArguments[0].getText();
        }
      }
    }

    return null;
  }

  /**
   * Extract props information from function parameters.
   *
   * Handles:
   * - Destructuring pattern: ({ prop1, prop2 }) → extracts individual prop names
   * - Typed parameter: (props: Props) → extracts interface name
   * - Rest parameter: (...props) → marks as spread
   * - Inline type literal: ({ prop }: { prop: string }) → extracts from type literal
   */
  private extractPropsFromParameters(
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile,
    filePath: string
  ): {
    interfaceName: string | null;
    propNames: Set<string>;
    isInline: boolean;
    usesSpread: boolean;
  } {
    const result: {
      interfaceName: string | null;
      propNames: Set<string>;
      isInline: boolean;
      usesSpread: boolean;
    } = {
      interfaceName: null,
      propNames: new Set(),
      isInline: false,
      usesSpread: false,
    };

    for (const param of parameters) {
      // Check for rest parameter (spread): ...props: Props
      if (param.dotDotDotToken) {
        result.usesSpread = true;
        continue;
      }

      // Check for destructuring pattern: { prop1, prop2 }
      if (ts.isObjectBindingPattern(param.name)) {
        for (const element of param.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            result.propNames.add(element.name.text);
          }
        }
        result.isInline = true;
        continue;
      }

      // Check for typed parameter: props: Props
      if (ts.isIdentifier(param.name) && param.type) {
        const typeText = param.type.getText();
        result.interfaceName = typeText;

        // Try to extract prop names from inline type literal
        if (ts.isTypeLiteralNode(param.type)) {
          for (const member of param.type.members) {
            if (ts.isPropertySignature(member) && member.name) {
              const name = member.name.getText();
              if (!this.config.ignoredProps.includes(name)) {
                result.propNames.add(name);
              }
            }
          }
          result.isInline = true;
        } else {
          // Named type reference - look up the interface
          // We'll resolve this in the caller if propNames is empty
          const resolvedProps = this.getPropsFromInterface(typeText, filePath, sourceFile);
          if (resolvedProps.size > 0) {
            result.propNames = resolvedProps;
          }
        }
      }
    }

    return result;
  }

  /**
   * Get props from an interface by name.
   */
  private getPropsFromInterface(
    interfaceName: string,
    contextFilePath: string,
    contextSourceFile: ts.SourceFile
  ): Set<string> {
    const propNames = new Set<string>();

    // First, try to find in current file
    const findInFile = (sourceFile: ts.SourceFile) => {
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
          for (const member of node.members) {
            if (ts.isPropertySignature(member) && member.name) {
              const name = member.name.getText();
              if (!this.config.ignoredProps.includes(name)) {
                propNames.add(name);
              }
            }
          }
        }
        // Also check type aliases
        if (ts.isTypeAliasDeclaration(node) && node.name.text === interfaceName) {
          if (ts.isTypeLiteralNode(node.type)) {
            for (const member of node.type.members) {
              if (ts.isPropertySignature(member) && member.name) {
                const name = member.name.getText();
                if (!this.config.ignoredProps.includes(name)) {
                  propNames.add(name);
                }
              }
            }
          }
        }
      });
    };

    findInFile(contextSourceFile);

    // If not found, try all parsed files
    if (propNames.size === 0) {
      for (const [, sourceFile] of this.sourceFiles) {
        findInFile(sourceFile);
        if (propNames.size > 0) break;
      }
    }

    return propNames;
  }

  /**
   * Check if a class extends React.Component or React.PureComponent.
   */
  private extendsReactComponent(node: ts.ClassDeclaration): boolean {
    if (!node.heritageClauses) return false;

    for (const clause of node.heritageClauses) {
      for (const type of clause.types) {
        const exprText = type.expression.getText();
        if (
          exprText === 'React.Component' ||
          exprText === 'React.PureComponent' ||
          exprText === 'Component' ||
          exprText === 'PureComponent'
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract props type name from a class declaration.
   */
  private extractPropsTypeFromClass(node: ts.ClassDeclaration): string | null {
    if (!node.heritageClauses) return null;

    for (const clause of node.heritageClauses) {
      for (const type of clause.types) {
        const exprText = type.expression.getText();
        if (
          exprText === 'React.Component' ||
          exprText === 'React.PureComponent' ||
          exprText === 'Component' ||
          exprText === 'PureComponent'
        ) {
          // Get the first type argument (props type)
          if (ts.isExpressionWithTypeArguments(type)) {
            if (type.typeArguments && type.typeArguments.length > 0) {
              return type.typeArguments[0].getText();
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a name looks like a React component name (PascalCase).
   */
  private isComponentName(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }

  /**
   * Phase 2: Find all JSX usage sites for each component.
   */
  private findJSXUsageSites(filePaths: string[]): void {
    for (const filePath of filePaths) {
      const sourceFile = this.sourceFiles.get(filePath);
      if (!sourceFile) continue;

      this.findJSXInFile(sourceFile, filePath);
    }
  }

  /**
   * Find JSX usage sites in a source file.
   */
  private findJSXInFile(sourceFile: ts.SourceFile, filePath: string): void {
    const visit = (node: ts.Node) => {
      // Check for JSX elements: <Component prop="value" />
      if (ts.isJsxSelfClosingElement(node)) {
        this.processJSXElement(node, sourceFile, filePath);
      }

      // Check for JSX elements with children: <Component prop="value">...</Component>
      if (ts.isJsxOpeningElement(node)) {
        this.processJSXElement(node, sourceFile, filePath);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Process a JSX element and extract passed props.
   */
  private processJSXElement(
    node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
    sourceFile: ts.SourceFile,
    filePath: string
  ): void {
    const componentName = node.tagName.getText();

    // Only track if we found this as a component
    if (!this.components.has(componentName)) return;

    const lineNumber =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const passedProps = new Set<string>();
    let hasSpread = false;

    // Extract attributes
    for (const attr of node.attributes.properties) {
      // Spread attribute: {...props}
      if (ts.isJsxSpreadAttribute(attr)) {
        hasSpread = true;
        continue;
      }

      // Normal attribute: prop="value" or prop={value}
      if (ts.isJsxAttribute(attr) && attr.name) {
        passedProps.add(attr.name.getText());
      }
    }

    const usageSite: JSXUsageSite = {
      componentName,
      filePath,
      lineNumber,
      passedProps,
      hasSpread,
    };

    const existing = this.jsxUsages.get(componentName) || [];
    existing.push(usageSite);
    this.jsxUsages.set(componentName, existing);
  }

  /**
   * Phase 3: Identify unused props.
   */
  private identifyUnusedProps(): UnusedProps[] {
    const results: UnusedProps[] = [];

    for (const [componentName, componentInfo] of this.components) {
      // Skip components with no declared props
      if (componentInfo.declaredProps.size === 0) continue;

      // Skip components that use spread in props parameter
      // (they can destructure any prop)
      if (componentInfo.usesSpread) continue;

      const usageSites = this.jsxUsages.get(componentName) || [];

      // Determine which props are used across all usage sites
      const allUsedProps = new Set<string>();
      let hasAnySpreadUsage = false;

      for (const site of usageSites) {
        if (site.hasSpread) {
          hasAnySpreadUsage = true;
        }
        for (const prop of site.passedProps) {
          allUsedProps.add(prop);
        }
      }

      // If any usage site has spread, consider all props potentially used
      if (hasAnySpreadUsage) continue;

      // Find unused props
      const unusedProps: string[] = [];

      for (const declaredProp of componentInfo.declaredProps) {
        if (!allUsedProps.has(declaredProp)) {
          unusedProps.push(declaredProp);
        }
      }

      // Only report if there are unused props
      if (unusedProps.length > 0) {
        results.push({
          interfaceName: componentInfo.interfaceName,
          componentName,
          unusedProps,
          filePath: componentInfo.filePath,
          lineNumber: componentInfo.lineNumber,
          hasUsageSites: usageSites.length > 0,
        });
      }
    }

    // Sort by component name for consistent output
    return results.sort((a, b) => a.componentName.localeCompare(b.componentName));
  }

  /**
   * Phase 4: Generate violations.
   */
  private generateViolations(unusedPropsList: UnusedProps[]): UnusedPropsViolation[] {
    return unusedPropsList.map((up) => this.createViolation(up));
  }

  /**
   * Create a violation for unused props.
   */
  private createViolation(up: UnusedProps): UnusedPropsViolation {
    const propsList = up.unusedProps.join(', ');
    const hasUsageText = up.hasUsageSites
      ? 'but never passed in any JSX usage'
      : 'and component has no JSX usage sites';

    const message = up.interfaceName
      ? `Props interface "${up.interfaceName}" declares unused props: ${propsList}`
      : `Component "${up.componentName}" declares unused props: ${propsList}`;

    return {
      category: 'dead-code',
      severity: 'medium',
      filePath: up.filePath,
      lineNumber: up.lineNumber,
      message: `${message} (${hasUsageText})`,
      symbolName: up.componentName,
      componentName: up.componentName,
      interfaceName: up.interfaceName || undefined,
      unusedPropNames: up.unusedProps,
      violationType: 'unused-props',
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const unusedPropsAnalyzer = new UnusedPropsAnalyzer();
