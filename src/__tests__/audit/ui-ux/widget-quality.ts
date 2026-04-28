/**
 * Widget Quality Checker Module
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * Scans all .tsx files in src/widgets/ and checks:
 * - Test file existence (Widget.test.tsx)
 * - Props interfaces are typed (no inline types)
 * - Props interfaces are exported
 * - Event handler type annotations (onChange, onClick, etc.)
 * - Mutable state update patterns (direct state.x = y assignments)
 *
 * @module audit/ui-ux/widget-quality
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Widget quality violation types.
 */
export type WidgetQualityViolationType =
  | 'missing-test-file'
  | 'inline-type-definition'
  | 'missing-props-export'
  | 'untyped-event-handler'
  | 'mutable-state-update';

/**
 * Extended violation interface for widget quality issues.
 */
export interface WidgetQualityViolation extends AuditViolation {
  category: 'widget-quality';
  /** Type of quality issue */
  violationType: WidgetQualityViolationType;
  /** Widget name */
  widgetName: string;
}

/**
 * Widget metadata for quality checks.
 */
export interface WidgetMetadata {
  /** Widget component name */
  name: string;
  /** Path to widget file */
  filePath: string;
  /** Whether test file exists */
  hasTestFile: boolean;
  /** Whether props interface is exported */
  exportsPropsInterface: boolean;
  /** Whether props use inline types */
  usesInlineTypes: boolean;
  /** Event handlers with typed parameters */
  typedEventHandlers: number;
  /** Total event handlers */
  totalEventHandlers: number;
  /** Props interface name (if found) */
  propsInterfaceName?: string;
}

/**
 * Configuration options for the widget quality checker.
 */
export interface WidgetQualityConfig {
  /** Widget directory to scan (default: 'src/widgets') */
  widgetDir: string;
  /** File extensions to check (default: ['.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for widget quality checker.
 */
const DEFAULT_CONFIG: WidgetQualityConfig = {
  widgetDir: 'src/widgets',
  extensions: ['.tsx'],
  excludePatterns: [/\.test\.tsx$/, /\.pbt\.test\.ts$/, /index\.tsx?$/],
};

/**
 * Event handler patterns to check for type annotations.
 */
const EVENT_HANDLER_PATTERNS = [
  'onChange',
  'onClick',
  'onSubmit',
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
  'onMouseDown',
  'onMouseUp',
  'onMouseEnter',
  'onMouseLeave',
  'onSelect',
  'onApprove',
  'onReject',
  'onExplain',
  'onClose',
  'onOpen',
];

/**
 * Widget Quality Checker Module
 *
 * Implements the AuditModule interface to validate widget component quality
 * patterns across the codebase.
 *
 * @example
 * ```typescript
 * const checker = new WidgetQualityChecker();
 * const report = await checker.run();
 *
 * console.log(`Widget quality violations: ${report.totalViolations}`);
 * console.log(`Widgets with test files: ${report.metrics?.widgetsWithTests}`);
 * ```
 */
export class WidgetQualityChecker implements AuditModule {
  readonly category: AuditCategory = 'widget-quality';
  readonly name = 'Widget Quality Checker';

  private config: WidgetQualityConfig;

  /**
   * Create a new widget quality checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<WidgetQualityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the widget quality audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: WidgetQualityViolation[] = [];

    // Get all widget files to analyze
    const widgetFiles = this.getWidgetFiles();

    // Analyze each widget file
    const widgetMetadata: WidgetMetadata[] = [];
    for (const filePath of widgetFiles) {
      const metadata = this.analyzeWidget(filePath);
      widgetMetadata.push(metadata);

      // Generate violations for this widget
      const widgetViolations = this.generateViolations(metadata);
      violations.push(...widgetViolations);
    }

    // Calculate metrics
    const widgetsWithTests = widgetMetadata.filter(w => w.hasTestFile).length;
    const widgetsWithExportedProps = widgetMetadata.filter(w => w.exportsPropsInterface).length;
    const widgetsWithInlineTypes = widgetMetadata.filter(w => w.usesInlineTypes).length;
    const totalEventHandlers = widgetMetadata.reduce((sum, w) => sum + w.totalEventHandlers, 0);
    const typedEventHandlers = widgetMetadata.reduce((sum, w) => sum + w.typedEventHandlers, 0);

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        totalWidgets: widgetMetadata.length,
        widgetsWithTests,
        widgetsWithExportedProps,
        widgetsWithInlineTypes,
        totalEventHandlers,
        typedEventHandlers,
        missingTestFiles: widgetMetadata.length - widgetsWithTests,
        missingPropsExports: widgetMetadata.length - widgetsWithExportedProps,
      },
    };

    return report;
  }

  /**
   * Get all widget files to analyze.
   *
   * @returns Array of widget file paths
   */
  private getWidgetFiles(): string[] {
    const files: string[] = [];

    if (!fs.existsSync(this.config.widgetDir)) {
      return files;
    }

    const entries = fs.readdirSync(this.config.widgetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const filePath = path.join(this.config.widgetDir, entry.name);
      const ext = path.extname(entry.name);

      // Skip excluded patterns
      if (this.config.excludePatterns.some(pattern => pattern.test(filePath))) {
        continue;
      }

      // Only include widget files
      if (this.config.extensions.includes(ext)) {
        files.push(filePath);
      }
    }

    return files;
  }

  /**
   * Analyze a widget file and extract metadata.
   *
   * @param filePath - Path to the widget file
   * @returns Widget metadata
   */
  private analyzeWidget(filePath: string): WidgetMetadata {
    const fileName = path.basename(filePath);
    const widgetName = path.basename(fileName, path.extname(fileName));

    // Requirement 7.1: Check for test file existence
    const hasTestFile = this.checkTestFileExists(filePath);

    // Parse the widget file
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Requirement 7.2, 7.3: Check props interface
    const propsInfo = this.checkPropsInterface(sourceFile, widgetName);

    // Requirement 7.4: Check event handler type annotations
    const eventHandlerInfo = this.checkEventHandlers(sourceFile);

    return {
      name: widgetName,
      filePath,
      hasTestFile,
      exportsPropsInterface: propsInfo.isExported,
      usesInlineTypes: propsInfo.hasInlineTypes,
      typedEventHandlers: eventHandlerInfo.typed,
      totalEventHandlers: eventHandlerInfo.total,
      propsInterfaceName: propsInfo.interfaceName,
    };
  }

  /**
   * Requirement 7.1: Check if a test file exists for the widget.
   *
   * @param widgetFilePath - Path to the widget file
   * @returns True if test file exists
   */
  private checkTestFileExists(widgetFilePath: string): boolean {
    const dir = path.dirname(widgetFilePath);
    const baseName = path.basename(widgetFilePath, path.extname(widgetFilePath));

    // Check for .test.tsx file
    const testFilePath = path.join(dir, `${baseName}.test.tsx`);
    return fs.existsSync(testFilePath);
  }

  /**
   * Requirements 7.2, 7.3: Check props interface patterns.
   *
   * Verifies:
   * - Props interfaces are typed (no inline types)
   * - Props interfaces are exported
   *
   * @param sourceFile - TypeScript source file
   * @param widgetName - Widget component name
   * @returns Props interface information
   */
  private checkPropsInterface(
    sourceFile: ts.SourceFile,
    widgetName: string
  ): {
    isExported: boolean;
    hasInlineTypes: boolean;
    interfaceName?: string;
  } {
    let propsInterfaceExported = false;
    let propsInterfaceName: string | undefined;
    let hasInlineTypes = false;

    const expectedPropsName = `${widgetName}Props`;

    const visit = (node: ts.Node) => {
      // Check for exported props interface
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceName = node.name.text;
        
        if (interfaceName === expectedPropsName) {
          propsInterfaceName = interfaceName;
          
          // Check if it's exported
          const hasExportModifier = node.modifiers?.some(
            m => m.kind === ts.SyntaxKind.ExportKeyword
          );
          
          if (hasExportModifier) {
            propsInterfaceExported = true;
          }
        }
      }

      // Check for inline type definitions in component declarations
      // Pattern: const Widget: React.FC<{ prop: type }> = ...
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isVariableDeclaration(declaration) && declaration.type) {
            // Check if this is a React component with inline props
            const typeNode = declaration.type;
            
            if (ts.isTypeReferenceNode(typeNode)) {
              const typeName = typeNode.typeName;
              
              // Check for React.FC<...> or FC<...>
              if (ts.isQualifiedName(typeName) || ts.isIdentifier(typeName)) {
                const typeNameText = ts.isQualifiedName(typeName)
                  ? typeName.right.text
                  : typeName.text;
                
                if (typeNameText === 'FC' || typeNameText === 'FunctionComponent') {
                  // Check if type arguments are inline object types
                  if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
                    const firstTypeArg = typeNode.typeArguments[0];
                    
                    // Inline type literal: { prop: type }
                    if (ts.isTypeLiteralNode(firstTypeArg)) {
                      hasInlineTypes = true;
                    }
                  }
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return {
      isExported: propsInterfaceExported,
      hasInlineTypes,
      interfaceName: propsInterfaceName,
    };
  }

  /**
   * Requirement 7.4: Check event handler type annotations.
   *
   * Verifies that event handlers (onChange, onClick, etc.) have typed parameters.
   *
   * @param sourceFile - TypeScript source file
   * @returns Event handler information
   */
  private checkEventHandlers(sourceFile: ts.SourceFile): {
    total: number;
    typed: number;
  } {
    let totalHandlers = 0;
    let typedHandlers = 0;

    const visit = (node: ts.Node) => {
      // Check for event handler properties in interfaces
      if (ts.isPropertySignature(node) && node.name && ts.isIdentifier(node.name)) {
        const propName = node.name.text;
        
        if (EVENT_HANDLER_PATTERNS.some(pattern => propName.startsWith(pattern))) {
          totalHandlers++;
          
          // Check if the handler has a type annotation
          if (node.type) {
            typedHandlers++;
          }
        }
      }

      // Check for event handler parameters in function declarations
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const functionName = ts.isFunctionDeclaration(node) && node.name
          ? node.name.text
          : '';
        
        if (EVENT_HANDLER_PATTERNS.some(pattern => functionName.startsWith(pattern))) {
          totalHandlers++;
          
          // Check if parameters have type annotations
          const hasTypedParams = node.parameters.every(param => param.type !== undefined);
          if (hasTypedParams && node.parameters.length > 0) {
            typedHandlers++;
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return { total: totalHandlers, typed: typedHandlers };
  }

  /**
   * Generate violations for a widget based on its metadata.
   *
   * @param metadata - Widget metadata
   * @returns Array of violations
   */
  private generateViolations(metadata: WidgetMetadata): WidgetQualityViolation[] {
    const violations: WidgetQualityViolation[] = [];

    // Requirement 7.1: Missing test file
    if (!metadata.hasTestFile) {
      violations.push(this.createViolation(
        metadata.filePath,
        0,
        'missing-test-file',
        `Widget '${metadata.name}' is missing a test file. Expected: ${metadata.name}.test.tsx`,
        metadata.name,
        'high'
      ));
    }

    // Requirement 7.2: Inline type definitions
    if (metadata.usesInlineTypes) {
      violations.push(this.createViolation(
        metadata.filePath,
        0,
        'inline-type-definition',
        `Widget '${metadata.name}' uses inline type definitions. Props should be defined in a separate interface.`,
        metadata.name,
        'medium'
      ));
    }

    // Requirement 7.3: Missing props export
    if (!metadata.exportsPropsInterface && !metadata.usesInlineTypes) {
      violations.push(this.createViolation(
        metadata.filePath,
        0,
        'missing-props-export',
        `Widget '${metadata.name}' does not export its props interface. Expected: export interface ${metadata.name}Props`,
        metadata.name,
        'medium'
      ));
    }

    // Requirement 7.4: Untyped event handlers
    if (metadata.totalEventHandlers > 0 && metadata.typedEventHandlers < metadata.totalEventHandlers) {
      const untypedCount = metadata.totalEventHandlers - metadata.typedEventHandlers;
      violations.push(this.createViolation(
        metadata.filePath,
        0,
        'untyped-event-handler',
        `Widget '${metadata.name}' has ${untypedCount} event handler(s) without type annotations (${metadata.typedEventHandlers}/${metadata.totalEventHandlers} typed).`,
        metadata.name,
        'medium'
      ));
    }

    // Requirement 7.5: Check for mutable state updates
    const mutableStateViolations = this.checkMutableStateUpdates(metadata.filePath, metadata.name);
    violations.push(...mutableStateViolations);

    return violations;
  }

  /**
   * Requirement 7.5: Detect mutable state update patterns.
   *
   * Checks for direct state mutations like:
   * - state.x = y
   * - this.state.x = y
   * - array.push() on state arrays
   *
   * @param filePath - Path to the widget file
   * @param widgetName - Widget component name
   * @returns Array of violations
   */
  private checkMutableStateUpdates(filePath: string, widgetName: string): WidgetQualityViolation[] {
    const violations: WidgetQualityViolation[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // Check for direct property assignments: state.x = y
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const left = node.left;
          
          if (ts.isPropertyAccessExpression(left)) {
            const objectName = this.getExpressionText(left.expression);
            
            // Check if assigning to state property
            if (objectName === 'state' || objectName === 'this.state') {
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
              
              violations.push(this.createViolation(
                filePath,
                lineNumber,
                'mutable-state-update',
                `Widget '${widgetName}' uses mutable state update pattern. Use setState or immutable update patterns instead.`,
                widgetName,
                'high'
              ));
            }
          }
        }

        // Check for array mutations: array.push(), array.pop(), etc.
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          
          if (ts.isPropertyAccessExpression(expression)) {
            const methodName = expression.name.text;
            const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
            
            if (mutatingMethods.includes(methodName)) {
              // Check if this is being called on a state variable
              const objectText = this.getExpressionText(expression.expression);
              
              // Simple heuristic: if it contains 'state' or common state variable names
              if (objectText.includes('state') || objectText.includes('State')) {
                const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
                
                violations.push(this.createViolation(
                  filePath,
                  lineNumber,
                  'mutable-state-update',
                  `Widget '${widgetName}' uses mutable array method '${methodName}'. Use immutable patterns like spread operator or Array.concat instead.`,
                  widgetName,
                  'high'
                ));
              }
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch {
      // If we can't parse the file, skip mutation checks
    }

    return violations;
  }

  /**
   * Get text representation of an expression.
   */
  private getExpressionText(expression: ts.Expression): string {
    if (ts.isIdentifier(expression)) {
      return expression.text;
    }
    
    if (ts.isPropertyAccessExpression(expression)) {
      const left = this.getExpressionText(expression.expression);
      const right = expression.name.text;
      return `${left}.${right}`;
    }
    
    // Check for 'this' keyword
    if (expression.kind === ts.SyntaxKind.ThisKeyword) {
      return 'this';
    }
    
    return '';
  }

  /**
   * Create a widget quality violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: WidgetQualityViolationType,
    message: string,
    widgetName: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): WidgetQualityViolation {
    return {
      category: 'widget-quality',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      widgetName,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const widgetQualityChecker = new WidgetQualityChecker();
