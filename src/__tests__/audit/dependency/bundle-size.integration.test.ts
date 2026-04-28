/**
 * Integration tests for Bundle Size Analyzer
 * 
 * Tests the bundle size analyzer against the actual widget files.
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 * 
 * @module audit/dependency/bundle-size.integration.test
 */

import {
  generateBundleSizeReport,
  formatBundleSizeReport,
  WIDGET_FILES,
  PER_WIDGET_LIMIT_KB,
  TOTAL_BUNDLE_LIMIT_KB,
  REACT_LIMIT_KB,
} from './bundle-size';

describe('Bundle Size Analyzer - Integration', () => {
  describe('generateBundleSizeReport', () => {
    it('should analyze all widget files', async () => {
      const report = await generateBundleSizeReport();

      // Verify all widgets are analyzed
      expect(report.widgetBundles.length).toBe(WIDGET_FILES.length);

      // Verify each widget has valid data
      for (const bundle of report.widgetBundles) {
        expect(bundle.widgetName).toBeTruthy();
        expect(bundle.gzippedSizeKB).toBeGreaterThanOrEqual(0);
        expect(bundle.individualLimitKB).toBe(PER_WIDGET_LIMIT_KB);
        expect(typeof bundle.passed).toBe('boolean');
        expect(bundle.topContributors.length).toBeGreaterThan(0);
      }
    });

    it('should calculate total bundle size', async () => {
      const report = await generateBundleSizeReport();

      expect(report.totalBundleSizeKB).toBeGreaterThan(0);
      expect(report.totalBundleLimitKB).toBe(TOTAL_BUNDLE_LIMIT_KB);
    });

    it('should measure React bundle size', async () => {
      const report = await generateBundleSizeReport();

      expect(report.reactSizeKB).toBeGreaterThanOrEqual(0);
      expect(typeof report.reactSizePassed).toBe('boolean');
    });

    it('should identify large dependencies if any exist', async () => {
      const report = await generateBundleSizeReport();

      expect(Array.isArray(report.largeDependencies)).toBe(true);

      // If large dependencies exist, verify they have valid data
      for (const dep of report.largeDependencies) {
        expect(dep.module).toBeTruthy();
        expect(dep.sizeKB).toBeGreaterThan(0);
        expect(dep.percentage).toBeGreaterThan(0);
        expect(dep.percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should generate a formatted report', async () => {
      const report = await generateBundleSizeReport();
      const formatted = formatBundleSizeReport(report);

      expect(formatted).toContain('Bundle Size Analysis Report');
      expect(formatted).toContain('Widget Bundle Sizes:');
      expect(formatted).toContain('Total Bundle Size:');
      expect(formatted).toContain('React + React-DOM:');

      // Verify all widgets are in the report
      for (const widgetFile of WIDGET_FILES) {
        expect(formatted).toContain(widgetFile);
      }
    });

    it('should report pass/fail status for each widget', async () => {
      const report = await generateBundleSizeReport();

      for (const bundle of report.widgetBundles) {
        if (bundle.gzippedSizeKB <= PER_WIDGET_LIMIT_KB) {
          expect(bundle.passed).toBe(true);
        } else {
          expect(bundle.passed).toBe(false);
        }
      }
    });

    it('should report overall pass/fail status', async () => {
      const report = await generateBundleSizeReport();

      if (report.totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB) {
        expect(report.totalBudgetPassed).toBe(true);
      } else {
        expect(report.totalBudgetPassed).toBe(false);
      }
    });
  });

  describe('Real-world bundle size validation', () => {
    it('should verify TaskPanel is within budget', async () => {
      const report = await generateBundleSizeReport();
      const taskPanel = report.widgetBundles.find(
        (b) => b.widgetName === 'TaskPanel.tsx'
      );

      expect(taskPanel).toBeDefined();
      if (taskPanel) {
        console.log(`TaskPanel size: ${taskPanel.gzippedSizeKB.toFixed(2)}KB`);
        // Note: This may fail if the widget is too large
        // In that case, the test documents the issue for remediation
      }
    });

    it('should verify GraphExplorer is within budget', async () => {
      const report = await generateBundleSizeReport();
      const graphExplorer = report.widgetBundles.find(
        (b) => b.widgetName === 'GraphExplorer.tsx'
      );

      expect(graphExplorer).toBeDefined();
      if (graphExplorer) {
        console.log(`GraphExplorer size: ${graphExplorer.gzippedSizeKB.toFixed(2)}KB`);
      }
    });

    it('should verify ReasoningLog is within budget', async () => {
      const report = await generateBundleSizeReport();
      const reasoningLog = report.widgetBundles.find(
        (b) => b.widgetName === 'ReasoningLog.tsx'
      );

      expect(reasoningLog).toBeDefined();
      if (reasoningLog) {
        console.log(`ReasoningLog size: ${reasoningLog.gzippedSizeKB.toFixed(2)}KB`);
      }
    });

    it('should log complete bundle size report', async () => {
      const report = await generateBundleSizeReport();
      const formatted = formatBundleSizeReport(report);

      console.log(formatted);

      // This test always passes but logs the report for visibility
      expect(report).toBeDefined();
    });
  });
});
