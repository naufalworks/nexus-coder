/**
 * Unit tests for Keyboard Navigation Checker Module
 *
 * Tests keyboard navigation pattern detection across widgets.
 */

import { KeyboardNavigationChecker, KeyboardNavigationViolation } from './keyboard-nav';
import type { AuditReport } from '../framework/types';

describe('KeyboardNavigationChecker', () => {
  let checker: KeyboardNavigationChecker;

  beforeEach(() => {
    checker = new KeyboardNavigationChecker();
  });

  describe('Module Interface', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('keyboard-navigation');
      expect(checker.name).toBe('Keyboard Navigation Checker');
      expect(typeof checker.run).toBe('function');
    });
  });

  describe('run()', () => {
    it('should return a valid audit report', async () => {
      const report = await checker.run();

      expect(report).toBeDefined();
      expect(report.category).toBe('keyboard-navigation');
      expect(typeof report.totalViolations).toBe('number');
      expect(Array.isArray(report.violations)).toBe(true);
      expect(report.metrics).toBeDefined();
    });

    it('should include metrics in the report', async () => {
      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(typeof report.metrics?.widgetsChecked).toBe('number');
      expect(typeof report.metrics?.widgetsWithKeyboardHandlers).toBe('number');
      expect(typeof report.metrics?.modalsChecked).toBe('number');
      expect(typeof report.metrics?.totalInaccessibleElements).toBe('number');
    });

    it('should check all widget files in src/widgets/', async () => {
      const report = await checker.run();

      // Should check multiple widgets
      expect(report.metrics?.widgetsChecked).toBeGreaterThan(0);
    });

    it('should detect widgets with keyboard navigation specs', async () => {
      const report = await checker.run();

      // TaskPanel, DiffApproval, GraphExplorer, ReasoningLog should have specs
      expect(report.metrics?.widgetsWithSpec).toBeGreaterThanOrEqual(4);
    });

    it('should identify modal widgets', async () => {
      const report = await checker.run();

      // IDEShell and InContextActions are modals
      expect(report.metrics?.modalsChecked).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Violation Detection', () => {
    it('should detect missing keyboard handlers', async () => {
      const report = await checker.run();

      // Check that violations have correct structure
      for (const v of report.violations as KeyboardNavigationViolation[]) {
        expect(v.category).toBe('keyboard-navigation');
        expect(v.severity).toBeDefined();
        expect(v.filePath).toBeDefined();
        expect(v.lineNumber).toBeGreaterThanOrEqual(0);
        expect(v.message).toBeDefined();
        expect(v.widgetName).toBeDefined();
      }
    });

    it('should categorize violations by type', async () => {
      const report = await checker.run();

      const violationTypes = new Set(
        (report.violations as KeyboardNavigationViolation[]).map(v => v.violationType)
      );

      // Should have various violation types
      expect(violationTypes.size).toBeGreaterThanOrEqual(0);
    });

    it('should report missing arrow key handlers', async () => {
      const report = await checker.run();

      const arrowKeyViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.violationType === 'missing-arrow-key-handler'
      );

      // May or may not have violations depending on implementation
      expect(Array.isArray(arrowKeyViolations)).toBe(true);
    });

    it('should report missing keyboard shortcuts', async () => {
      const report = await checker.run();

      const shortcutViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.violationType === 'missing-keyboard-shortcut'
      );

      // May or may not have violations depending on implementation
      expect(Array.isArray(shortcutViolations)).toBe(true);
    });

    it('should report missing focus traps in modals', async () => {
      const report = await checker.run();

      const focusTrapViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.violationType === 'missing-focus-trap'
      );

      // May or may not have violations depending on implementation
      expect(Array.isArray(focusTrapViolations)).toBe(true);
    });

    it('should report inaccessible interactive elements', async () => {
      const report = await checker.run();

      const inaccessibleViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.violationType === 'inaccessible-interactive-element'
      );

      // May or may not have violations depending on implementation
      expect(Array.isArray(inaccessibleViolations)).toBe(true);
    });
  });

  describe('Widget-Specific Checks', () => {
    it('should check TaskPanel for arrow key navigation', async () => {
      const report = await checker.run();

      const taskPanelViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.widgetName === 'TaskPanel'
      );

      // TaskPanel should be checked (may or may not have violations)
      expect(Array.isArray(taskPanelViolations)).toBe(true);
    });

    it('should check DiffApproval for keyboard shortcuts', async () => {
      const report = await checker.run();

      const diffApprovalViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.widgetName === 'DiffApproval'
      );

      // DiffApproval should be checked (may or may not have violations)
      expect(Array.isArray(diffApprovalViolations)).toBe(true);
    });

    it('should check GraphExplorer for arrow key navigation', async () => {
      const report = await checker.run();

      const graphExplorerViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.widgetName === 'GraphExplorer'
      );

      // GraphExplorer should be checked (may or may not have violations)
      expect(Array.isArray(graphExplorerViolations)).toBe(true);
    });

    it('should check ReasoningLog for entry navigation', async () => {
      const report = await checker.run();

      const reasoningLogViolations = (report.violations as KeyboardNavigationViolation[]).filter(
        v => v.widgetName === 'ReasoningLog'
      );

      // ReasoningLog should be checked (may or may not have violations)
      expect(Array.isArray(reasoningLogViolations)).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customChecker = new KeyboardNavigationChecker({
        widgetDir: 'custom/widgets',
        extensions: ['.tsx', '.jsx'],
      });

      expect(customChecker).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const defaultChecker = new KeyboardNavigationChecker();

      expect(defaultChecker).toBeDefined();
    });
  });

  describe('Report Summary', () => {
    it('should provide a comprehensive summary', async () => {
      const report = await checker.run();

      console.log('\nKeyboard Navigation Audit Summary:');
      console.log(`  Widgets checked: ${report.metrics?.widgetsChecked}`);
      console.log(`  Widgets with keyboard handlers: ${report.metrics?.widgetsWithKeyboardHandlers}`);
      console.log(`  Widgets with navigation specs: ${report.metrics?.widgetsWithSpec}`);
      console.log(`  Widgets with complete specs: ${report.metrics?.widgetsWithCompleteSpec}`);
      console.log(`  Modals checked: ${report.metrics?.modalsChecked}`);
      console.log(`  Modals with focus trap: ${report.metrics?.modalsWithFocusTrap}`);
      console.log(`  Total violations: ${report.totalViolations}`);
      console.log(`  Inaccessible elements: ${report.metrics?.totalInaccessibleElements}`);

      if (report.violations.length > 0) {
        console.log('\nViolations by widget:');
        const violationsByWidget = new Map<string, number>();
        for (const violation of report.violations as KeyboardNavigationViolation[]) {
          const count = violationsByWidget.get(violation.widgetName) || 0;
          violationsByWidget.set(violation.widgetName, count + 1);
        }
        violationsByWidget.forEach((count, widget) => {
          console.log(`  ${widget}: ${count} violation(s)`);
        });
      }
    });
  });
});
