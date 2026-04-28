/**
 * Unit Tests for Widget Quality Checker Module
 *
 * Tests the WidgetQualityChecker module to ensure it correctly validates:
 * - Test file existence (Requirement 7.1)
 * - Props interface validation (Requirement 7.2)
 * - Event handler type checking (Requirement 7.3)
 * - Mutable state detection (Requirement 7.4)
 *
 * @module audit/ui-ux/widget-quality.test
 */

import * as fs from 'fs';
import * as path from 'path';
import { WidgetQualityChecker } from './widget-quality';
import type { WidgetQualityViolation } from './widget-quality';

describe('WidgetQualityChecker - Unit Tests', () => {
  const testFixturesDir = path.join(__dirname, 'test-fixtures');

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
      const checker = new WidgetQualityChecker();
      expect(checker.category).toBe('widget-quality');
      expect(checker.name).toBe('Widget Quality Checker');
    });

    it('should create a checker instance with custom config', () => {
      const checker = new WidgetQualityChecker({
        widgetDir: 'custom/widgets',
        extensions: ['.tsx', '.jsx'],
      });
      expect(checker.category).toBe('widget-quality');
    });
  });

  describe('Requirement 7.1: Test file detection', () => {
    it('should detect missing test file for a widget', async () => {
      // Create a widget without a test file
      const widgetPath = path.join(testFixturesDir, 'WidgetWithoutTest.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

interface WidgetWithoutTestProps {
  title: string;
}

export const WidgetWithoutTest: React.FC<WidgetWithoutTestProps> = ({ title }) => {
  return <div>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingTestViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'missing-test-file'
      );

      expect(missingTestViolations.length).toBeGreaterThan(0);
      expect(missingTestViolations[0].message).toContain('missing a test file');
      expect(missingTestViolations[0].severity).toBe('high');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation when test file exists', async () => {
      // Create a widget with a test file
      const widgetPath = path.join(testFixturesDir, 'WidgetWithTest.tsx');
      const testPath = path.join(testFixturesDir, 'WidgetWithTest.test.tsx');

      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface WidgetWithTestProps {
  title: string;
}

export const WidgetWithTest: React.FC<WidgetWithTestProps> = ({ title }) => {
  return <div>{title}</div>;
};
      `);

      fs.writeFileSync(testPath, `
import { WidgetWithTest } from './WidgetWithTest';

describe('WidgetWithTest', () => {
  it('should render', () => {
    expect(true).toBe(true);
  });
});
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingTestViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'missing-test-file' &&
             v.filePath.includes('WidgetWithTest.tsx')
      );

      expect(missingTestViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
      fs.unlinkSync(testPath);
    });
  });

  describe('Requirement 7.2: Props interface validation', () => {
    it('should detect inline type definitions', async () => {
      const widgetPath = path.join(testFixturesDir, 'InlineTypeWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const InlineTypeWidget: React.FC<{ title: string; count: number }> = ({ title, count }) => {
  return <div>{title}: {count}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const inlineTypeViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'inline-type-definition'
      );

      expect(inlineTypeViolations.length).toBeGreaterThan(0);
      expect(inlineTypeViolations[0].message).toContain('inline type definitions');
      expect(inlineTypeViolations[0].severity).toBe('medium');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for properly typed props interface', async () => {
      const widgetPath = path.join(testFixturesDir, 'ProperlyTypedWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface ProperlyTypedWidgetProps {
  title: string;
  count: number;
}

export const ProperlyTypedWidget: React.FC<ProperlyTypedWidgetProps> = ({ title, count }) => {
  return <div>{title}: {count}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const inlineTypeViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'inline-type-definition' &&
             v.filePath.includes('ProperlyTypedWidget.tsx')
      );

      expect(inlineTypeViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 7.3: Props interface export validation', () => {
    it('should detect missing props export', async () => {
      const widgetPath = path.join(testFixturesDir, 'NoExportPropsWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

interface NoExportPropsWidgetProps {
  title: string;
}

export const NoExportPropsWidget: React.FC<NoExportPropsWidgetProps> = ({ title }) => {
  return <div>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingExportViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'missing-props-export'
      );

      expect(missingExportViolations.length).toBeGreaterThan(0);
      expect(missingExportViolations[0].message).toContain('does not export its props interface');
      expect(missingExportViolations[0].severity).toBe('medium');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation when props interface is exported', async () => {
      const widgetPath = path.join(testFixturesDir, 'ExportedPropsWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface ExportedPropsWidgetProps {
  title: string;
}

export const ExportedPropsWidget: React.FC<ExportedPropsWidgetProps> = ({ title }) => {
  return <div>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const missingExportViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'missing-props-export' &&
             v.filePath.includes('ExportedPropsWidget.tsx')
      );

      expect(missingExportViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 7.4: Event handler type checking', () => {
    it('should detect untyped event handlers in props interface', async () => {
      const widgetPath = path.join(testFixturesDir, 'UntypedHandlerWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface UntypedHandlerWidgetProps {
  title: string;
  onClick;
  onChange;
}

export const UntypedHandlerWidget: React.FC<UntypedHandlerWidgetProps> = ({ title, onClick, onChange }) => {
  return <div onClick={onClick}>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const untypedHandlerViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'untyped-event-handler'
      );

      expect(untypedHandlerViolations.length).toBeGreaterThan(0);
      expect(untypedHandlerViolations[0].message).toContain('without type annotations');
      expect(untypedHandlerViolations[0].severity).toBe('medium');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for typed event handlers', async () => {
      const widgetPath = path.join(testFixturesDir, 'TypedHandlerWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface TypedHandlerWidgetProps {
  title: string;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onChange: (value: string) => void;
}

export const TypedHandlerWidget: React.FC<TypedHandlerWidgetProps> = ({ title, onClick, onChange }) => {
  return <div onClick={onClick}>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const untypedHandlerViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'untyped-event-handler' &&
             v.filePath.includes('TypedHandlerWidget.tsx')
      );

      expect(untypedHandlerViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Requirement 7.5: Mutable state detection', () => {
    it('should detect direct state property assignment', async () => {
      const widgetPath = path.join(testFixturesDir, 'MutableStateWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface MutableStateWidgetProps {
  title: string;
}

export const MutableStateWidget: React.FC<MutableStateWidgetProps> = ({ title }) => {
  const [state, setState] = React.useState({ count: 0 });

  const handleClick = () => {
    state.count = state.count + 1; // Direct mutation
  };

  return <div onClick={handleClick}>{title}: {state.count}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const mutableStateViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'mutable-state-update'
      );

      expect(mutableStateViolations.length).toBeGreaterThan(0);
      expect(mutableStateViolations[0].message).toContain('mutable state update');
      expect(mutableStateViolations[0].severity).toBe('high');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should detect mutable array methods on state', async () => {
      const widgetPath = path.join(testFixturesDir, 'MutableArrayWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface MutableArrayWidgetProps {
  title: string;
}

export const MutableArrayWidget: React.FC<MutableArrayWidgetProps> = ({ title }) => {
  const [itemsState, setItemsState] = React.useState<string[]>([]);

  const addItem = (item: string) => {
    itemsState.push(item); // Mutable array method
  };

  return <div>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const mutableStateViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'mutable-state-update'
      );

      expect(mutableStateViolations.length).toBeGreaterThan(0);
      expect(mutableStateViolations[0].message).toContain('mutable array method');
      expect(mutableStateViolations[0].severity).toBe('high');

      // Cleanup
      fs.unlinkSync(widgetPath);
    });

    it('should not report violation for immutable state updates', async () => {
      const widgetPath = path.join(testFixturesDir, 'ImmutableStateWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export interface ImmutableStateWidgetProps {
  title: string;
}

export const ImmutableStateWidget: React.FC<ImmutableStateWidgetProps> = ({ title }) => {
  const [state, setState] = React.useState({ count: 0 });

  const handleClick = () => {
    setState({ ...state, count: state.count + 1 }); // Immutable update
  };

  return <div onClick={handleClick}>{title}: {state.count}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      const mutableStateViolations = report.violations.filter(
        (v) => (v as WidgetQualityViolation).violationType === 'mutable-state-update' &&
             v.filePath.includes('ImmutableStateWidget.tsx')
      );

      expect(mutableStateViolations.length).toBe(0);

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Report structure', () => {
    it('should generate a complete audit report', async () => {
      const checker = new WidgetQualityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      expect(report).toBeDefined();
      expect(report.category).toBe('widget-quality');
      expect(report.totalViolations).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.violations)).toBe(true);
      expect(report.metrics).toBeDefined();
    });

    it('should include comprehensive metrics', async () => {
      const checker = new WidgetQualityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(typeof report.metrics?.totalWidgets).toBe('number');
      expect(typeof report.metrics?.widgetsWithTests).toBe('number');
      expect(typeof report.metrics?.widgetsWithExportedProps).toBe('number');
      expect(typeof report.metrics?.widgetsWithInlineTypes).toBe('number');
      expect(typeof report.metrics?.totalEventHandlers).toBe('number');
      expect(typeof report.metrics?.typedEventHandlers).toBe('number');
      expect(typeof report.metrics?.missingTestFiles).toBe('number');
      expect(typeof report.metrics?.missingPropsExports).toBe('number');
    });

    it('should create violations with all required fields', async () => {
      const widgetPath = path.join(testFixturesDir, 'ViolationTestWidget.tsx');
      fs.writeFileSync(widgetPath, `
import React from 'react';

export const ViolationTestWidget: React.FC<{ title: string }> = ({ title }) => {
  return <div>{title}</div>;
};
      `);

      const checker = new WidgetQualityChecker({
        widgetDir: testFixturesDir,
      });

      const report = await checker.run();

      if (report.violations.length > 0) {
        const violation = report.violations[0] as WidgetQualityViolation;

        expect(violation.category).toBe('widget-quality');
        expect(violation.severity).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
        expect(violation.filePath).toBeDefined();
        expect(typeof violation.lineNumber).toBe('number');
        expect(violation.lineNumber).toBeGreaterThanOrEqual(0);
        expect(violation.message).toBeDefined();
        expect(violation.violationType).toBeDefined();
        expect([
          'missing-test-file',
          'inline-type-definition',
          'missing-props-export',
          'untyped-event-handler',
          'mutable-state-update'
        ]).toContain(violation.violationType);
        expect(violation.widgetName).toBeDefined();
      }

      // Cleanup
      fs.unlinkSync(widgetPath);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent widget directory gracefully', async () => {
      const checker = new WidgetQualityChecker({
        widgetDir: 'non-existent-directory',
      });

      const report = await checker.run();

      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.totalWidgets).toBe(0);
    });

    it('should skip excluded patterns', async () => {
      const checker = new WidgetQualityChecker({
        widgetDir: 'src/widgets',
        excludePatterns: [/\.test\.tsx$/, /index\.tsx$/],
      });

      const report = await checker.run();

      const violations = report.violations as WidgetQualityViolation[];
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

      const checker = new WidgetQualityChecker({
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
      const checker = new WidgetQualityChecker({
        widgetDir: 'src/widgets',
      });

      const report = await checker.run();

      // Should find widgets
      expect(report.metrics?.totalWidgets).toBeGreaterThan(0);

      // Log violations for visibility (not an assertion)
      if (report.totalViolations > 0) {
        console.log(`\nFound ${report.totalViolations} widget quality violations:`);
        report.violations.slice(0, 5).forEach((v: any) => {
          console.log(`  - ${v.widgetName}: ${v.violationType}`);
        });
      }
    });
  });
});
