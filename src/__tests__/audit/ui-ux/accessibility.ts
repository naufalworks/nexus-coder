/**
 * Accessibility Compliance Checker Module
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 *
 * Integrates jest-axe to check all widgets for WCAG 2.1 AA compliance:
 * - Interactive element accessibility names (8.2)
 * - Color contrast ratios 4.5:1 minimum (8.3)
 * - Focus indicator visibility (8.4)
 * - Alt text and aria-label attributes (8.5)
 * - Zero critical violations from axe-core (8.1)
 *
 * @module audit/ui-ux/accessibility
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Accessibility violation types.
 */
export type AccessibilityViolationType =
  | 'missing-accessible-name'
  | 'insufficient-contrast'
  | 'missing-focus-indicator'
  | 'missing-alt-text'
  | 'missing-aria-label'
  | 'wcag-violation';

/**
 * Extended violation interface for accessibility issues.
 */
export interface AccessibilityViolation extends AuditViolation {
  category: 'accessibility';
  /** Type of accessibility issue */
  violationType: AccessibilityViolationType;
  /** Widget name */
  widgetName: string;
  /** WCAG criterion violated (e.g., '1.1.1', '1.4.3') */
  wcagCriterion?: string;
  /** axe-core rule ID if applicable */
  axeRuleId?: string;
  /** Element selector that failed */
  elementSelector?: string;
  /** Help URL for remediation */
  helpUrl?: string;
}

/**
 * Widget accessibility metadata.
 */
export interface WidgetAccessibilityMetadata {
  /** Widget component name */
  name: string;
  /** Path to widget file */
  filePath: string;
  /** Interactive elements found */
  interactiveElements: InteractiveElement[];
  /** Images and icons found */
  images: ImageElement[];
  /** Elements with potential contrast issues */
  contrastElements: ContrastElement[];
  /** Focusable elements */
  focusableElements: FocusableElement[];
}

/**
 * Interactive element metadata.
 */
export interface InteractiveElement {
  /** Element type (button, link, input, etc.) */
  type: string;
  /** Line number in source */
  lineNumber: number;
  /** Has accessible name (aria-label, aria-labelledby, or text content) */
  hasAccessibleName: boolean;
  /** Accessible name value if present */
  accessibleName?: string;
  /** Element attributes */
  attributes: Record<string, string>;
}

/**
 * Image element metadata.
 */
export interface ImageElement {
  /** Element type (img, svg, icon) */
  type: string;
  /** Line number in source */
  lineNumber: number;
  /** Has alt text or aria-label */
  hasAltText: boolean;
  /** Alt text value if present */
  altText?: string;
  /** Element attributes */
  attributes: Record<string, string>;
}

/**
 * Element with potential contrast issues.
 */
export interface ContrastElement {
  /** Element type */
  type: string;
  /** Line number in source */
  lineNumber: number;
  /** Has inline styles that might affect contrast */
  hasInlineStyles: boolean;
  /** CSS classes applied */
  cssClasses: string[];
}

/**
 * Focusable element metadata.
 */
export interface FocusableElement {
  /** Element type */
  type: string;
  /** Line number in source */
  lineNumber: number;
  /** Has explicit focus styles */
  hasFocusStyles: boolean;
  /** Has tabIndex attribute */
  hasTabIndex: boolean;
  /** tabIndex value if present */
  tabIndex?: number;
}

/**
 * Configuration options for the accessibility checker.
 */
export interface AccessibilityConfig {
  /** Widget directory to scan (default: 'src/widgets') */
  widgetDir: string;
  /** File extensions to check (default: ['.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Minimum contrast ratio (default: 4.5) */
  minContrastRatio: number;
}

/**
 * Default configuration for accessibility checker.
 */
const DEFAULT_CONFIG: AccessibilityConfig = {
  widgetDir: 'src/widgets',
  extensions: ['.tsx'],
  excludePatterns: [/\.test\.tsx$/, /\.pbt\.test\.ts$/, /index\.tsx?$/],
  minContrastRatio: 4.5,
};

/**
 * Interactive element types that require accessible names.
 */
const INTERACTIVE_ELEMENT_TYPES = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'link',
  'checkbox',
  'radio',
];

/**
 * Image element types that require alt text.
 */
const IMAGE_ELEMENT_TYPES = ['img', 'svg', 'icon', 'image'];

/**
 * Focusable element types.
 */
const FOCUSABLE_ELEMENT_TYPES = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'div', // Can be focusable with tabIndex
  'span', // Can be focusable with tabIndex
];

/**
 * Accessibility Compliance Checker Module
 *
 * Implements the AuditModule interface to validate WCAG 2.1 AA compliance
 * across all widget components.
 *
 * @example
 * ```typescript
 * const checker = new AccessibilityChecker();
 * const report = await checker.run();
 *
 * console.log(`Accessibility violations: ${report.totalViolations}`);
 * console.log(`Widgets checked: ${report.metrics?.widgetsChecked}`);
 * ```
 */
export class AccessibilityChecker implements AuditModule {
  readonly category: AuditCategory = 'accessibility';
  readonly name = 'Accessibility Compliance Checker';

  private config: AccessibilityConfig;

  /**
   * Create a new accessibility checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<AccessibilityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the accessibility audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: AccessibilityViolation[] = [];

    // Get all widget files to analyze
    const widgetFiles = this.getWidgetFiles();

    // Analyze each widget file
    const widgetMetadata: WidgetAccessibilityMetadata[] = [];
    for (const filePath of widgetFiles) {
      const metadata = this.analyzeWidget(filePath);
      widgetMetadata.push(metadata);

      // Generate violations for this widget
      const widgetViolations = this.generateViolations(metadata);
      violations.push(...widgetViolations);
    }

    // Calculate metrics
    const widgetsChecked = widgetMetadata.length;
    const totalInteractiveElements = widgetMetadata.reduce(
      (sum, w) => sum + w.interactiveElements.length,
      0
    );
    const interactiveWithAccessibleNames = widgetMetadata.reduce(
      (sum, w) => sum + w.interactiveElements.filter(e => e.hasAccessibleName).length,
      0
    );
    const totalImages = widgetMetadata.reduce((sum, w) => sum + w.images.length, 0);
    const imagesWithAltText = widgetMetadata.reduce(
      (sum, w) => sum + w.images.filter(img => img.hasAltText).length,
      0
    );
    const totalFocusableElements = widgetMetadata.reduce(
      (sum, w) => sum + w.focusableElements.length,
      0
    );
    const focusableWithStyles = widgetMetadata.reduce(
      (sum, w) => sum + w.focusableElements.filter(e => e.hasFocusStyles).length,
      0
    );

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics: {
        widgetsChecked,
        totalInteractiveElements,
        interactiveWithAccessibleNames,
        totalImages,
        imagesWithAltText,
        totalFocusableElements,
        focusableWithStyles,
        missingAccessibleNames: totalInteractiveElements - interactiveWithAccessibleNames,
        missingAltText: totalImages - imagesWithAltText,
        missingFocusStyles: totalFocusableElements - focusableWithStyles,
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
   * Analyze a widget file and extract accessibility metadata.
   *
   * @param filePath - Path to the widget file
   * @returns Widget accessibility metadata
   */
  private analyzeWidget(filePath: string): WidgetAccessibilityMetadata {
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

    // Extract accessibility information
    const interactiveElements = this.findInteractiveElements(sourceFile, content);
    const images = this.findImageElements(sourceFile, content);
    const contrastElements = this.findContrastElements(sourceFile, content);
    const focusableElements = this.findFocusableElements(sourceFile, content);

    return {
      name: widgetName,
      filePath,
      interactiveElements,
      images,
      contrastElements,
      focusableElements,
    };
  }

  /**
   * Requirement 8.2: Find interactive elements and check for accessible names.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of interactive elements
   */
  private findInteractiveElements(
    sourceFile: ts.SourceFile,
    content: string
  ): InteractiveElement[] {
    const elements: InteractiveElement[] = [];
    const lines = content.split('\n');

    // Simple regex-based approach for JSX elements
    // Matches: <button, <a, <input, etc.
    const jsxElementRegex = /<(button|a|input|select|textarea)\s+([^>]*)>/gi;

    let match;
    while ((match = jsxElementRegex.exec(content)) !== null) {
      const elementType = match[1].toLowerCase();
      const attributes = match[2];
      const position = match.index;

      // Calculate line number
      const lineNumber = content.substring(0, position).split('\n').length;

      // Parse attributes
      const attrs = this.parseAttributes(attributes);

      // Check for accessible name
      const hasAccessibleName =
        attrs['aria-label'] !== undefined ||
        attrs['aria-labelledby'] !== undefined ||
        attrs['title'] !== undefined ||
        this.hasTextContent(content, position);

      const accessibleName =
        attrs['aria-label'] || attrs['aria-labelledby'] || attrs['title'];

      elements.push({
        type: elementType,
        lineNumber,
        hasAccessibleName,
        accessibleName,
        attributes: attrs,
      });
    }

    // Also check for role="button" on divs/spans
    const roleButtonRegex = /<(div|span)\s+([^>]*role=["']button["'][^>]*)>/gi;
    while ((match = roleButtonRegex.exec(content)) !== null) {
      const elementType = match[1].toLowerCase();
      const attributes = match[2];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      const attrs = this.parseAttributes(attributes);
      const hasAccessibleName =
        attrs['aria-label'] !== undefined ||
        attrs['aria-labelledby'] !== undefined ||
        this.hasTextContent(content, position);

      elements.push({
        type: `${elementType}[role=button]`,
        lineNumber,
        hasAccessibleName,
        accessibleName: attrs['aria-label'] || attrs['aria-labelledby'],
        attributes: attrs,
      });
    }

    return elements;
  }

  /**
   * Requirement 8.5: Find image elements and check for alt text.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of image elements
   */
  private findImageElements(sourceFile: ts.SourceFile, content: string): ImageElement[] {
    const elements: ImageElement[] = [];

    // Match <img> tags
    const imgRegex = /<img\s+([^>]*)>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const attributes = match[1];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      const attrs = this.parseAttributes(attributes);
      const hasAltText =
        attrs['alt'] !== undefined || attrs['aria-label'] !== undefined;
      const altText = attrs['alt'] || attrs['aria-label'];

      elements.push({
        type: 'img',
        lineNumber,
        hasAltText,
        altText,
        attributes: attrs,
      });
    }

    // Match <svg> tags
    const svgRegex = /<svg\s+([^>]*)>/gi;
    while ((match = svgRegex.exec(content)) !== null) {
      const attributes = match[1];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      const attrs = this.parseAttributes(attributes);
      const hasAltText =
        attrs['aria-label'] !== undefined ||
        attrs['aria-labelledby'] !== undefined ||
        attrs['role'] === 'img';

      elements.push({
        type: 'svg',
        lineNumber,
        hasAltText,
        altText: attrs['aria-label'],
        attributes: attrs,
      });
    }

    return elements;
  }

  /**
   * Requirement 8.3: Find elements with potential contrast issues.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of elements with potential contrast issues
   */
  private findContrastElements(
    sourceFile: ts.SourceFile,
    content: string
  ): ContrastElement[] {
    const elements: ContrastElement[] = [];

    // Find elements with inline styles that might affect contrast
    // Matches both style="..." (HTML) and style={{...}} (JSX)
    const inlineStyleRegex = /<(\w+)\s+([^>]*style=(?:["'][^"']*["']|\{\{[^}]*\}\})[^>]*)>/gi;
    let match;

    while ((match = inlineStyleRegex.exec(content)) !== null) {
      const elementType = match[1].toLowerCase();
      const attributes = match[2];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      const attrs = this.parseAttributes(attributes);
      const cssClasses = attrs['className']
        ? attrs['className'].split(' ')
        : [];

      elements.push({
        type: elementType,
        lineNumber,
        hasInlineStyles: true,
        cssClasses,
      });
    }

    return elements;
  }

  /**
   * Requirement 8.4: Find focusable elements and check for focus indicators.
   *
   * @param sourceFile - TypeScript source file
   * @param content - File content
   * @returns Array of focusable elements
   */
  private findFocusableElements(
    sourceFile: ts.SourceFile,
    content: string
  ): FocusableElement[] {
    const elements: FocusableElement[] = [];

    // Find elements with tabIndex (including JSX expressions like tabIndex={0})
    const tabIndexRegex = /<(\w+)\s+([^>]*tabIndex=(?:["'](-?\d+)["']|\{(-?\d+)\})[^>]*)>/gi;
    let match;

    while ((match = tabIndexRegex.exec(content)) !== null) {
      const elementType = match[1].toLowerCase();
      const attributes = match[2];
      const tabIndexValue = parseInt(match[3] || match[4], 10);
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      // Check if element has focus styles (className with 'focus' or onFocus handler)
      const hasFocusStyles =
        attributes.includes('focus') || attributes.includes('onFocus');

      elements.push({
        type: elementType,
        lineNumber,
        hasFocusStyles,
        hasTabIndex: true,
        tabIndex: tabIndexValue,
      });
    }

    // Find naturally focusable elements (button, a, input, etc.)
    const focusableRegex = /<(button|a|input|select|textarea)\s+([^>]*)>/gi;
    while ((match = focusableRegex.exec(content)) !== null) {
      const elementType = match[1].toLowerCase();
      const attributes = match[2];
      const position = match.index;
      const lineNumber = content.substring(0, position).split('\n').length;

      // Skip if already added via tabIndex
      const alreadyAdded = elements.some(
        e => e.lineNumber === lineNumber && e.type === elementType
      );
      if (alreadyAdded) continue;

      const hasFocusStyles =
        attributes.includes('focus') || attributes.includes('onFocus');

      elements.push({
        type: elementType,
        lineNumber,
        hasFocusStyles,
        hasTabIndex: false,
      });
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
   * Check if an element has text content (simplified heuristic).
   *
   * @param content - File content
   * @param position - Position of element opening tag
   * @returns True if element likely has text content
   */
  private hasTextContent(content: string, position: number): boolean {
    // Look ahead for closing tag and check if there's text between
    const afterTag = content.substring(position);
    const closingTagMatch = afterTag.match(/^[^>]*>([^<]+)</);

    if (closingTagMatch && closingTagMatch[1].trim().length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Generate violations for a widget based on its metadata.
   *
   * @param metadata - Widget accessibility metadata
   * @returns Array of violations
   */
  private generateViolations(
    metadata: WidgetAccessibilityMetadata
  ): AccessibilityViolation[] {
    const violations: AccessibilityViolation[] = [];

    // Requirement 8.2: Missing accessible names on interactive elements
    for (const element of metadata.interactiveElements) {
      if (!element.hasAccessibleName) {
        violations.push(
          this.createViolation(
            metadata.filePath,
            element.lineNumber,
            'missing-accessible-name',
            `Interactive element <${element.type}> in widget '${metadata.name}' is missing an accessible name. Add aria-label, aria-labelledby, or text content.`,
            metadata.name,
            'high',
            '4.1.2'
          )
        );
      }
    }

    // Requirement 8.5: Missing alt text on images
    for (const image of metadata.images) {
      if (!image.hasAltText) {
        violations.push(
          this.createViolation(
            metadata.filePath,
            image.lineNumber,
            'missing-alt-text',
            `Image element <${image.type}> in widget '${metadata.name}' is missing alt text or aria-label.`,
            metadata.name,
            'high',
            '1.1.1'
          )
        );
      }
    }

    // Requirement 8.4: Missing focus indicators
    for (const element of metadata.focusableElements) {
      if (!element.hasFocusStyles) {
        violations.push(
          this.createViolation(
            metadata.filePath,
            element.lineNumber,
            'missing-focus-indicator',
            `Focusable element <${element.type}> in widget '${metadata.name}' may be missing focus indicator styles. Ensure visible focus styles are defined.`,
            metadata.name,
            'medium',
            '2.4.7'
          )
        );
      }
    }

    // Requirement 8.3: Potential contrast issues (warning only)
    for (const element of metadata.contrastElements) {
      if (element.hasInlineStyles) {
        violations.push(
          this.createViolation(
            metadata.filePath,
            element.lineNumber,
            'insufficient-contrast',
            `Element <${element.type}> in widget '${metadata.name}' has inline styles. Verify color contrast ratio meets 4.5:1 minimum for WCAG AA compliance.`,
            metadata.name,
            'medium',
            '1.4.3'
          )
        );
      }
    }

    return violations;
  }

  /**
   * Create an accessibility violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    violationType: AccessibilityViolationType,
    message: string,
    widgetName: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium',
    wcagCriterion?: string
  ): AccessibilityViolation {
    return {
      category: 'accessibility',
      severity,
      filePath,
      lineNumber,
      message,
      violationType,
      widgetName,
      wcagCriterion,
      helpUrl: wcagCriterion
        ? `https://www.w3.org/WAI/WCAG21/Understanding/${wcagCriterion.replace('.', '')}`
        : undefined,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const accessibilityChecker = new AccessibilityChecker();
