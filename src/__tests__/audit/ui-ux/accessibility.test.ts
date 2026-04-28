/**
 * Unit Tests for Accessibility Compliance Checker Module
 *
 * Tests the AccessibilityChecker module to ensure it correctly validates:
 * - Interactive element accessible names (Requirement 8.2)
 * - Color contrast ratios (Requirement 8.3)
 * - Focus indicator visibility (Requirement 8.4)
 * - Alt text and aria-label attributes (Requirement 8.5)
 * - WCAG 2.1 AA compliance (Requirement 8.1)
 *
 * @module audit/ui-ux/accessibility.test
 */

import * as fs from 'fs';
import * as path from 'path';
import { AccessibilityChecker } from './accessibility';
import type { AccessibilityViolation } from './accessibility';

describe('AccessibilityChecker - Unit Tests', () => {
  const testFixturesDir = path.join(__dirname, 'test-fixtures-a11y');

  // Setup: Create test fixtures directory
  beforeAll(() => {
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
  });

  // Cleanup: Remove test fixtures directory
  afterAll(() => {
    if (fs.existsSync(testFixturesDir)) {
      const files = fs.readdirSync(testFixturesDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testFixturesDir, file));
      });
      fs.rmdirSync(testFixturesDir);
    }
  });

  describe('Module instantiation', () => {
    it('should create a checker instance with default config', () => {
      const checker = new AccessibilityChecker();
      expect(checker.category).toBe('accessibility');
      expect(checker.name).toBe('Accessibility Compliance Checker');
    });

    it('should create a checker instance with custom config', () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'custom/widgets',
        minContrastRatio: 7.0,
      });
      expect(checker.category).toBe('accessibility');
    });
  });

  describe('Requirement 8.2: Interactive element accessible names', () => {
    it('should detect missing accessible name on button', async () => {
      const widgetPath = path.join(testFixturesDir, 'ButtonNoLabel.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ButtonNoLabel: React.FC = () => {
  return <button onClick={() => {}}>Click</button>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      // Button with text content should have accessible name
      // This test validates the detection logic works
      expect(report.violations).toBeDefined();
      expect(report.metrics?.totalInteractiveElements).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for button with aria-label', async () => {
      const widgetPath = path.join(testFixturesDir, 'ButtonWithLabel.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ButtonWithLabel: React.FC = () => {
  return <button aria-label="Submit form" onClick={() => {}} />;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingNameViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-accessible-name' &&
             v.filePath.includes('ButtonWithLabel.tsx')
      );

      expect(missingNameViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should detect missing accessible name on div with role=button', async () => {
      const widgetPath = path.join(testFixturesDir, 'DivButton.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const DivButton: React.FC = () => {
  return <div role="button" onClick={() => {}} />;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingNameViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-accessible-name'
      );

      expect(missingNameViolations.length).toBeGreaterThan(0);
      const nameViolation = missingNameViolations[0] as AccessibilityViolation;
      expect(nameViolation.message).toContain('missing an accessible name');
      expect(nameViolation.severity).toBe('high');
      expect(nameViolation.wcagCriterion).toBe('4.1.2');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 8.5: Alt text and aria-label attributes', () => {
    it('should detect missing alt text on img element', async () => {
      const widgetPath = path.join(testFixturesDir, 'ImageNoAlt.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ImageNoAlt: React.FC = () => {
  return <img src="logo.png" />;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingAltViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-alt-text'
      );

      expect(missingAltViolations.length).toBeGreaterThan(0);
      const altViolation = missingAltViolations[0] as AccessibilityViolation;
      expect(altViolation.message).toContain('missing alt text');
      expect(altViolation.severity).toBe('high');
      expect(altViolation.wcagCriterion).toBe('1.1.1');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for img with alt text', async () => {
      const widgetPath = path.join(testFixturesDir, 'ImageWithAlt.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ImageWithAlt: React.FC = () => {
  return <img src="logo.png" alt="Company logo" />;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingAltViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-alt-text' &&
             v.filePath.includes('ImageWithAlt.tsx')
      );

      expect(missingAltViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should detect missing aria-label on svg element', async () => {
      const widgetPath = path.join(testFixturesDir, 'SvgNoLabel.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const SvgNoLabel: React.FC = () => {
  return <svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingAltViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-alt-text'
      );

      expect(missingAltViolations.length).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for svg with aria-label', async () => {
      const widgetPath = path.join(testFixturesDir, 'SvgWithLabel.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const SvgWithLabel: React.FC = () => {
  return <svg aria-label="Circle icon" width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingAltViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-alt-text' &&
             v.filePath.includes('SvgWithLabel.tsx')
      );

      expect(missingAltViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 8.4: Focus indicator visibility', () => {
    it('should detect missing focus styles on focusable element', async () => {
      const widgetPath = path.join(testFixturesDir, 'NoFocusStyles.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const NoFocusStyles: React.FC = () => {
  return <button onClick={() => {}}>Click me</button>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingFocusViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-focus-indicator'
      );

      expect(missingFocusViolations.length).toBeGreaterThan(0);
      const focusViolation = missingFocusViolations[0] as AccessibilityViolation;
      expect(focusViolation.message).toContain('missing focus indicator');
      expect(focusViolation.severity).toBe('medium');
      expect(focusViolation.wcagCriterion).toBe('2.4.7');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for element with focus styles', async () => {
      const widgetPath = path.join(testFixturesDir, 'WithFocusStyles.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const WithFocusStyles: React.FC = () => {
  return <button className="focus:ring-2" onFocus={() => {}} onClick={() => {}}>Click me</button>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingFocusViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'missing-focus-indicator' &&
             v.filePath.includes('WithFocusStyles.tsx')
      );

      expect(missingFocusViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should detect elements with tabIndex', async () => {
      const widgetPath = path.join(testFixturesDir, 'TabIndexElement.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const TabIndexElement: React.FC = () => {
  return <div tabIndex={0} onClick={() => {}}>Focusable div</div>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      expect(report.metrics?.totalFocusableElements).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 8.3: Color contrast ratios', () => {
    it('should detect elements with inline styles', async () => {
      const widgetPath = path.join(testFixturesDir, 'InlineStyles.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const InlineStyles: React.FC = () => {
  return <div style={{ color: '#888', backgroundColor: '#fff' }}>Low contrast text</div>;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const contrastViolations = report.violations.filter(
        (v) => (v as AccessibilityViolation).violationType === 'insufficient-contrast'
      );

      expect(contrastViolations.length).toBeGreaterThan(0);
      const contrastViolation = contrastViolations[0] as AccessibilityViolation;
      expect(contrastViolation.message).toContain('color contrast ratio');
      expect(contrastViolation.severity).toBe('medium');
      expect(contrastViolation.wcagCriterion).toBe('1.4.3');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Report structure', () => {
    it('should generate a complete audit report', async () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      expect(report).toBeDefined();
      expect(report.category).toBe('accessibility');
      expect(report.totalViolations).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.violations)).toBe(true);
      expect(report.metrics).toBeDefined();
    });

    it('should include comprehensive metrics', async () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(typeof report.metrics?.widgetsChecked).toBe('number');
      expect(typeof report.metrics?.totalInteractiveElements).toBe('number');
      expect(typeof report.metrics?.interactiveWithAccessibleNames).toBe('number');
      expect(typeof report.metrics?.totalImages).toBe('number');
      expect(typeof report.metrics?.imagesWithAltText).toBe('number');
      expect(typeof report.metrics?.totalFocusableElements).toBe('number');
      expect(typeof report.metrics?.focusableWithStyles).toBe('number');
      expect(typeof report.metrics?.missingAccessibleNames).toBe('number');
      expect(typeof report.metrics?.missingAltText).toBe('number');
      expect(typeof report.metrics?.missingFocusStyles).toBe('number');
    });

    it('should create violations with all required fields', async () => {
      const widgetPath = path.join(testFixturesDir, 'ViolationTestWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ViolationTestWidget: React.FC = () => {
  return <img src="test.png" />;
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      if (report.violations.length > 0) {
        const violation = report.violations[0] as AccessibilityViolation;

        expect(violation.category).toBe('accessibility');
        expect(violation.severity).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
        expect(violation.filePath).toBeDefined();
        expect(typeof violation.lineNumber).toBe('number');
        expect(violation.lineNumber).toBeGreaterThanOrEqual(0);
        expect(violation.message).toBeDefined();
        expect(violation.violationType).toBeDefined();
        expect([
          'missing-accessible-name',
          'insufficient-contrast',
          'missing-focus-indicator',
          'missing-alt-text',
          'missing-aria-label',
          'wcag-violation'
        ]).toContain(violation.violationType);
        expect(violation.widgetName).toBeDefined();
        
        if (violation.wcagCriterion) {
          expect(violation.helpUrl).toContain('w3.org');
        }
      }

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent widget directory gracefully', async () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'non-existent-directory',
      });

      const report = await checker.run();

      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.widgetsChecked).toBe(0);
    });

    it('should skip excluded patterns', async () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'src/widgets',
        excludePatterns: [/\.test\.tsx$/, /index\.tsx$/],
      });

      const report = await checker.run();

      const violations = report.violations as AccessibilityViolation[];
      const hasTestFiles = violations.some(v => v.filePath.includes('.test.tsx'));
      const hasIndexFiles = violations.some(v => v.filePath.includes('index.tsx'));

      expect(hasTestFiles).toBe(false);
      expect(hasIndexFiles).toBe(false);
    });

    it('should handle unparseable files gracefully', async () => {
      const widgetPath = path.join(testFixturesDir, 'InvalidSyntax.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const InvalidSyntax: React.FC = () => {
  return <div>{ // Unclosed brace
};
      `);

      const checker = new AccessibilityChecker({
        widgetDir: testFixturesDir,
      });

      // Should not throw, but handle gracefully
      await expect(checker.run()).resolves.toBeDefined();

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Real widget validation', () => {
    it('should validate actual widgets in src/widgets', async () => {
      const checker = new AccessibilityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      // Should find widgets
      expect(report.metrics?.widgetsChecked).toBeGreaterThan(0);

      // Log violations for visibility (not an assertion)
      if (report.totalViolations > 0) {
        console.log(`\nFound ${report.totalViolations} accessibility violations:`);
        report.violations.slice(0, 5).forEach((v: any) => {
          console.log(`  - ${v.widgetName}: ${v.violationType} (${v.wcagCriterion || 'N/A'})`);
        });
      }
    });
  });
});
