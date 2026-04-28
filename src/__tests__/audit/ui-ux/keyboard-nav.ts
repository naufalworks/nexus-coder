/**
 * Keyboard Navigation Checker Module
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 *
 * Scans all .tsx files in src/widgets/ and checks:
 * - TaskPanel arrow key navigation (9.1)
 * - DiffApproval keyboard shortcuts: A, R, E (9.2)
 * - GraphExplorer arrow key navigation (9.3)
 * - ReasoningLog entry navigation (9.4)
 * - Modal focus trap (9.5)
 * - All interactive elements are keyboard accessible (9.6)
 *
 * @module audit/ui-ux/keyboard-nav
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Keyboard navigation violation types.
 */
export type KeyboardNavigationViolationType =
  | 'missing-arrow-key-handler'
  | 'missing-keyboard-shortcut'
  | 'missing-enter-handler'
  | 'missing-focus-trap'
  | 'missing-keyboard-handler'
  | 'inaccessible-interactive-element';

/**
 * Extended violation interface for keyboard navigation issues.
 */
export interface KeyboardNavigationViolation extends AuditViolation {
  category: 'keyboard-navigation';
  /** Type of keyboard navigation issue */
  violationType: KeyboardNavigationViolationType;
  /** Widget name */
  widgetName: string;
  /** Expected keyboard interaction */
  expectedInteraction?: string;
  /** Missing key handler */
  missingKey?: string;
}

/**
 * Keyboard navigation specification for a widget.
 */
export interface KeyboardNavigationSpec {
  /** Key or key combination */
  key: string;
  /** Effect of the key press */
  effect: 'focus-next' | 'focus-prev' | 'select' | 'activate' | 'dismiss';
  /** Description of the interaction */
  description: string;
}

/**
 * Widget keyboard navigation metadata.
 */
export interface WidgetKeyboardMetadata {
  /** Widget component name */
  name: string;
  /** Path to widget file */
  filePath: string;
  /** Keyboard event handlers found */
  keyboardHandlers: KeyboardHandler[];
  /** Expected keyboard navigation spec */
  expectedSpec: KeyboardNavigationSpec[];
  /** Whether widget is a modal/overlay */
  isModal: boolean;
  /** Whether focus trap is implemented (for modals) */
  hasFocusTrap: boolean;
  /** Interactive elements without keyboard handlers */
  inaccessibleElements: InaccessibleElement[];
}

/**
 * Keyboard event handler metadata.
 */
export interface KeyboardHandler {
  /** Handler type (onKeyDown, onKeyUp, onKeyPress) */
  handlerType: 'onKeyDown' | 'onKeyUp' | 'onKeyPress';
  /** Line number in source */
  lineNumber: number;
  /** Keys handled (extracted from handler body) */
  keysHandled: string[];
  /** Element type the handler is attached to */
  elementType?: string;
}

/**
 * Interactive element without keyboard accessibility.
 */
export interface InaccessibleElement {
  /** Element type */
  type: string;
  /** Line number in source */
  lineNumber: number;
  /** Has onClick but no keyboard handler */
  hasOnClickOnly: boolean;
  /** Element attributes */
  attributes: Record<string, string>;
}

/**
 * Configuration options for the keyboard navigation checker.
 */
export interface KeyboardNavigationConfig {
  /** Widget directory to scan (default: 'src/widgets') */
  widgetDir: string;
  /** File extensions to check (default: ['.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
}

/**
 * Default configuration for keyboard navigation checker.
 */
const DEFAULT_CONFIG: KeyboardNavigationConfig = {
  widgetDir: 'src/widgets',
  extensions: ['.tsx'],
  excludePatterns: [/\.test\.tsx$/, /\.pbt\.test\.ts$/, /index\.tsx?$/],
};

/**
 * Keyboard navigation specifications per widget.
 * Based on Requirements 9.1, 9.2, 9.3, 9.4.
 */
const KEYBOARD_NAV_SPECS: Record<string, KeyboardNavigationSpec[]> = {
  TaskPanel: [
    { key: 'ArrowUp', effect: 'focus-prev', description: 'Navigate to previous task' },
    { key: 'ArrowDown', effect: 'focus-next', description: 'Navigate to next task' },
    { key: 'Enter', effect: 'select', description: 'Select focused task' },
  ],
  DiffApproval: [
    { key: 'a', effect: 'activate', description: 'Approve current diff' },
    { key: 'A', effect: 'activate', description: 'Approve current diff' },
    { key: 'r', effect: 'activate', description: 'Reject current diff' },
    { key: 'R', effect: 'activate', description: 'Reject current diff' },
    { key: 'e', effect: 'activate', description: 'Request explanation' },
    { key: 'E', effect: 'activate', description: 'Request explanation' },
  ],
  GraphExplorer: [
    { key: 'ArrowUp', effect: 'focus-prev', description: 'Navigate to previous node' },
    { key: 'ArrowDown', effect: 'focus-next', description: 'Navigate to next node' },
    { key: 'ArrowLeft', effect: 'focus-prev', description: 'Navigate to parent node' },
    { key: 'ArrowRight', effect: 'focus-next', description: 'Navigate to child nodes' },
  ],
  ReasoningLog: [
    { key: 'ArrowUp', effect: 'focus-prev', description: 'Navigate to previous entry' },
    { key: 'ArrowDown', effect: 'focus-next', description: 'Navigate to next entry' },
  ],
};

/**
 * Modal/overlay widget names that require focus trap.
 */
const MODAL_WIDGETS = ['IDEShell', 'InContextActions'];

/**
 * Keyboard Navigation Checker Module
 *
 * Implements the AuditModule interface to validate keyboard navigation
 * patterns across all widget components.
 *
 * @example
 * ```typescript
 * const checker = new KeyboardNavigationChecker();
 * const report = await checker.run();
 *
 * console.log(`Keyboard navigation violations: ${report.totalViolations}`);
 * console.log(`Widgets checked: ${report.metrics?.widgetsChecked}`);
 * ```
 */
export class KeyboardNavigationChecker implements AuditModule {
  readonly category: AuditCategory = 'keyboard-navigation';
  readonly name = 'Keyboard Navigation Checker';

  private config: KeyboardNavigationConfig;

  /**
   * Create a new keyboard navigation checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<KeyboardNavigationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the keyboard navigation audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: KeyboardNavigationViolation[] = [];

    // Get all widget files to analyze
    const widgetFiles = this.getWidgetFiles();

    // Analyze each widget file
    const widgetMetadata: WidgetKeyboardMetadata[] = [];
    for (const filePath of widgetFiles) {
      const metadata = this.analyzeWidget(filePath);
      widgetMetadata.push(metadata);

      // Generate violations for this widget
      const widgetViolations = this.generateViolations(metadata);
      violations.push(...widgetViolations);
    }

    // Calculate metrics
    const widgetsChecked = widgetMetadata.length;
    const widgetsWithKeyboardHandlers = widgetMetadata.filter(
      w => w.keyboardHandlers.length > 0
    ).length;
    const widgetsWithSpec = widgetMetadata.filter(
      w => w.expectedSpec.length > 0
    ).length;
    const widgetsWithCompleteSpec = widgetMetadata.filter(w => {
      if (w.expectedSpec.length === 0) return true;
      return this.hasCompleteKeyboardSupport(w);
    }).length;
    const modalsChecked = widgetMetadata.filter(w => w.isModal).length;
    const modalsWithFocusTrap = widgetMetadata.filter(
      w => w.isModal && w.hasFocusTrap
    ).length;
    const totalInaccessibleElements = widgetMetadata.reduce(
      (sum, w) => sum + w.inaccessibleElements.length,
      0
    );

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        widgetsChecked,
        widgetsWithKeyboardHandlers,
        widgetsWithSpec,
        widgetsWithCompleteSpec,
        modalsChecked,
        modalsWithFocusTrap,
        totalInaccessibleElements,
        missingKeyboardHandlers: widgetsChecked - widgetsWithKeyboardHandlers,
        missingFocusTraps: modalsChecked - modalsWithFocusTrap,
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
   * Analyze a widget file and extract keyboard navigation metadata.
   *
   * @param filePath - Path to the widget file
   * @returns Widget keyboard navigation metadata
   */
  private analyzeWidget(filePath: string): WidgetKeyboardMetadata {
    const fileName = path.basename(filePath);
    const widgetName = path.basename(fileName, path.extname(fileName));

    // Parse the widget file
    const content = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Get expected keyboard navigation spec for this widget
    const expectedSpec = KEYBOARD_NAV_SPECS[widgetName] || [];

    // Check if this is a modal widget
    const isModal = MODAL_WIDGETS.includes(widgetName);

    // Extract keyboard navigation information
    const keyboardHandlers = this.findKeyboardHandlers(sourceFile, content);
    const hasFocusTrap = this.checkFocusTrap(sourceFile, content);
    const inaccessibleElements = this.findInaccessibleElements(sourceFile, content);

    return {
      name: widgetName,
      filePath,
      keyboardHandlers,
      expectedSpec,
      isModal,
      hasFocusTrap,
      inaccessibleElements,
    };
  }

  /**
   * Find keyboard event handlers in the widget.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of keyboard handlers
   */
  private findKeyboardHandlers(
    sourceFile: ts.SourceFile,
    content: string
  ): KeyboardHandler[] {
    const handlers: KeyboardHandler[] = [];

    // Find onKeyDown, onKeyUp, onKeyPress handlers
    const handlerRegex = /(onKeyDown|onKeyUp|onKeyPress)=\{([^}]+)\}/g;
    let match;

    while ((match = handlerRegex.exec(content)) !== null) {
      const handlerType = match[1] as 'onKeyDown' | 'onKeyUp' | 'onKeyPress';
      const handlerBody = match[2];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      // Extract keys handled from the handler body
      const keysHandled = this.extractKeysFromHandler(handlerBody, content, position);

      handlers.push({
        handlerType,
        lineNumber,
        keysHandled,
      });
    }

    return handlers;
  }

  /**
   * Extract key names from a keyboard event handler.
   *
   * @param handlerBody - Handler function body or reference
   * @param content - Full file content
   * @param position - Position of handler in content
   * @returns Array of key names handled
   */
  private extractKeysFromHandler(
    handlerBody: string,
    content: string,
    position: number
  ): string[] {
    const keys: string[] = [];

    // If handler is a function reference, try to find the function definition
    const functionName = handlerBody.trim();
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
      // Look for function definition
      const functionDefRegex = new RegExp(
        `(?:const|function)\\s+${functionName}\\s*[=:]?\\s*(?:\\([^)]*\\)\\s*=>\\s*)?\\{([^}]+)\\}`,
        's'
      );
      const functionMatch = content.match(functionDefRegex);
      if (functionMatch) {
        return this.extractKeysFromCode(functionMatch[1]);
      }
    }

    // Extract keys from inline handler
    return this.extractKeysFromCode(handlerBody);
  }

  /**
   * Extract key names from code that handles keyboard events.
   *
   * @param code - Code snippet
   * @returns Array of key names
   */
  private extractKeysFromCode(code: string): string[] {
    const keys: string[] = [];

    // Match patterns like: e.key === 'ArrowUp', event.key === "Enter", key === 'a'
    const keyCheckRegex = /(?:e|event|evt)\.key\s*===\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = keyCheckRegex.exec(code)) !== null) {
      keys.push(match[1]);
    }

    // Match switch cases: case 'ArrowDown':
    const switchCaseRegex = /case\s+['"]([^'"]+)['"]\s*:/g;
    while ((match = switchCaseRegex.exec(code)) !== null) {
      keys.push(match[1]);
    }

    return keys;
  }

  /**
   * Requirement 9.5: Check if widget implements focus trap (for modals).
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns True if focus trap is implemented
   */
  private checkFocusTrap(sourceFile: ts.SourceFile, content: string): boolean {
    // Look for common focus trap patterns:
    // 1. Tab key handler that cycles focus
    // 2. Focus trap library usage (react-focus-lock, focus-trap-react)
    // 3. Manual focus management with Tab key

    // Check for focus trap libraries
    if (
      content.includes('react-focus-lock') ||
      content.includes('FocusLock') ||
      content.includes('focus-trap-react') ||
      content.includes('FocusTrap')
    ) {
      return true;
    }

    // Check for Tab key handler
    const tabHandlerRegex = /(?:e|event|evt)\.key\s*===\s*['"]Tab['"]/;
    if (tabHandlerRegex.test(content)) {
      return true;
    }

    // Check for focus management patterns
    const focusManagementPatterns = [
      /focusableElements/,
      /firstFocusable/,
      /lastFocusable/,
      /trapFocus/,
      /manageFocus/,
    ];

    return focusManagementPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Requirement 9.6: Find interactive elements without keyboard handlers.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of inaccessible elements
   */
  private findInaccessibleElements(
    sourceFile: ts.SourceFile,
    content: string
  ): InaccessibleElement[] {
    const elements: InaccessibleElement[] = [];

    // Find elements with onClick but no keyboard handler
    // Pattern: <div onClick={...} but no onKeyDown/onKeyUp/onKeyPress
    const onClickRegex = /<(div|span)\s+([^>]*onClick=[^>]+)>/g;
    let match;

    while ((match = onClickRegex.exec(content)) !== null) {
      const elementType = match[1];
      const attributes = match[2];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      // Check if this element also has a keyboard handler
      const hasKeyboardHandler =
        attributes.includes('onKeyDown') ||
        attributes.includes('onKeyUp') ||
        attributes.includes('onKeyPress');

      // Check if element has role="button" or tabIndex (makes it keyboard accessible)
      const hasButtonRole = attributes.includes('role="button"') || attributes.includes("role='button'");
      const hasTabIndex = attributes.includes('tabIndex');

      // If it has onClick but no keyboard handler and no button role/tabIndex, it's inaccessible
      if (!hasKeyboardHandler && !hasButtonRole && !hasTabIndex) {
        const attrs = this.parseAttributes(attributes);
        elements.push({
          type: elementType,
          lineNumber,
          hasOnClickOnly: true,
          attributes: attrs,
        });
      }
    }

    return elements;
  }

  /**
   * Parse HTML/JSX attributes from a string.
   *
   * @param attributeString - Attribute string
   * @returns Parsed attributes
   */
  private parseAttributes(attributeString: string): Record<string, string> {
    const attrs: Record<string, string> = {};

    // Simple regex to match key="value" or key='value' or key={value}
    const attrRegex = /(\w+(?:-\w+)*)=(?:["']([^"']*)["']|\{([^}]*)\})/g;
    let match;

    while ((match = attrRegex.exec(attributeString)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || '';
      attrs[key] = value;
    }

    return attrs;
  }

  /**
   * Check if widget has complete keyboard support based on its spec.
   *
   * @param metadata - Widget keyboard metadata
   * @returns True if all expected keys are handled
   */
  private hasCompleteKeyboardSupport(metadata: WidgetKeyboardMetadata): boolean {
    if (metadata.expectedSpec.length === 0) {
      return true;
    }

    // Get all keys handled by the widget
    const handledKeys = new Set<string>();
    for (const handler of metadata.keyboardHandlers) {
      for (const key of handler.keysHandled) {
        handledKeys.add(key);
      }
    }

    // Check if all expected keys are handled
    for (const spec of metadata.expectedSpec) {
      if (!handledKeys.has(spec.key)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate violations for a widget based on its metadata.
   *
   * @param metadata - Widget keyboard navigation metadata
   * @returns Array of violations
   */
  private generateViolations(
    metadata: WidgetKeyboardMetadata
  ): KeyboardNavigationViolation[] {
    const violations: KeyboardNavigationViolation[] = [];

    // Requirements 9.1, 9.2, 9.3, 9.4: Check for missing keyboard handlers
    if (metadata.expectedSpec.length > 0) {
      const handledKeys = new Set<string>();
      for (const handler of metadata.keyboardHandlers) {
        for (const key of handler.keysHandled) {
          handledKeys.add(key);
        }
      }

      // Check each expected key
      for (const spec of metadata.expectedSpec) {
        if (!handledKeys.has(spec.key)) {
          const violationType = this.getViolationType(spec);
          violations.push(
            this.createViolation(
              metadata.filePath,
              0,
              violationType,
              `Widget '${metadata.name}' is missing keyboard handler for '${spec.key}'. Expected: ${spec.description}`,
              metadata.name,
              'high',
              spec.description,
              spec.key
            )
          );
        }
      }
    }

    // Requirement 9.5: Check for missing focus trap in modals
    if (metadata.isModal && !metadata.hasFocusTrap) {
      violations.push(
        this.createViolation(
          metadata.filePath,
          0,
          'missing-focus-trap',
          `Modal widget '${metadata.name}' is missing focus trap implementation. Focus should be trapped within the modal until dismissed.`,
          metadata.name,
          'high',
          'Implement focus trap for modal'
        )
      );
    }

    // Requirement 9.6: Check for inaccessible interactive elements
    for (const element of metadata.inaccessibleElements) {
      violations.push(
        this.createViolation(
          metadata.filePath,
          element.lineNumber,
          'inaccessible-interactive-element',
          `Widget '${metadata.name}' has interactive <${element.type}> with onClick but no keyboard handler. Add onKeyDown/onKeyUp or use a <button> element.`,
          metadata.name,
          'high',
          'Add keyboard handler to interactive element'
        )
      );
    }

    return violations;
  }

  /**
   * Determine violation type based on keyboard spec.
   *
   * @param spec - Keyboard navigation spec
   * @returns Violation type
   */
  private getViolationType(spec: KeyboardNavigationSpec): KeyboardNavigationViolationType {
    if (spec.key.startsWith('Arrow')) {
      return 'missing-arrow-key-handler';
    }
    if (spec.key === 'Enter') {
      return 'missing-enter-handler';
    }
    return 'missing-keyboard-shortcut';
  }

  /**
   * Create a keyboard navigation violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: KeyboardNavigationViolationType,
    message: string,
    widgetName: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium',
    expectedInteraction?: string,
    missingKey?: string
  ): KeyboardNavigationViolation {
    return {
      category: 'keyboard-navigation',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      widgetName,
      expectedInteraction,
      missingKey,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const keyboardNavigationChecker = new KeyboardNavigationChecker();
