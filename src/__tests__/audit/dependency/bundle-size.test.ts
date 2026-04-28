/**
 * Unit tests for Bundle Size Analyzer
 * 
 * Tests the bundle size measurement and analysis functionality.
 * 
 * @module audit/dependency/bundle-size.test
 */

import {
  measureGzippedSize,
  measureWidgetSize,
  analyzeWidgetBundle,
  measureReactSize,
  identifyLargeDependencies,
  generateBundleSizeReport,
  formatWidgetAnalysis,
  formatBundleSizeReport,
  bytesToKB,
  PER_WIDGET_LIMIT_KB,
  TOTAL_BUNDLE_LIMIT_KB,
  REACT_LIMIT_KB,
  LARGE_DEPENDENCY_THRESHOLD_KB,
  WidgetBundleAnalysis,
} from './bundle-size';
import * as path from 'path';

describe('Bundle Size Analyzer', () => {
  describe('bytesToKB', () => {
    it('should convert bytes to KB with 2 decimal precision', () => {
      expect(bytesToKB(1024)).toBe(1);
      expect(bytesToKB(2048)).toBe(2);
      expect(bytesToKB(1536)).toBe(1.5);
      expect(bytesToKB(1234)).toBe(1.21);
    });

    it('should handle zero bytes', () => {
      expect(bytesToKB(0)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      expect(bytesToKB(1234.5678)).toBe(1.21);
    });
  });

  describe('measureGzippedSize', () => {
    it('should measure gzipped size of an existing file', async () => {
      const filePath = path.join(process.cwd(), 'src/widgets/TaskPanel.tsx');
      const size = await measureGzippedSize(filePath);
      
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should return 0 for non-existent file', async () => {
      const filePath = path.join(process.cwd(), 'src/widgets/NonExistent.tsx');
      const size = await measureGzippedSize(filePath);
      
      expect(size).toBe(0);
    });
  });

  describe('measureWidgetSize', () => {
    it('should measure widget size in KB', async () => {
      const sizeKB = await measureWidgetSize('TaskPanel.tsx');
      
      expect(sizeKB).toBeGreaterThan(0);
      expect(typeof sizeKB).toBe('number');
    });

    it('should return 0 for non-existent widget', async () => {
      const sizeKB = await measureWidgetSize('NonExistent.tsx');
      
      expect(sizeKB).toBe(0);
    });
  });

  describe('analyzeWidgetBundle', () => {
    it('should analyze a widget bundle', async () => {
      const analysis = await analyzeWidgetBundle('TaskPanel.tsx');
      
      expect(analysis.widgetName).toBe('TaskPanel.tsx');
      expect(analysis.gzippedSizeKB).toBeGreaterThan(0);
      expect(analysis.individualLimitKB).toBe(PER_WIDGET_LIMIT_KB);
      expect(typeof analysis.passed).toBe('boolean');
      expect(analysis.topContributors).toHaveLength(1);
      expect(analysis.topContributors[0].module).toBe('TaskPanel.tsx');
      expect(analysis.topContributors[0].percentage).toBe(100);
    });

    it('should mark widget as passed if within limit', async () => {
      const analysis = await analyzeWidgetBundle('TaskPanel.tsx');
      
      if (analysis.gzippedSizeKB <= PER_WIDGET_LIMIT_KB) {
        expect(analysis.passed).toBe(true);
      } else {
        expect(analysis.passed).toBe(false);
      }
    });
  });

  describe('measureReactSize', () => {
    it('should measure React + React-DOM size', async () => {
      const sizeKB = await measureReactSize();
      
      expect(sizeKB).toBeGreaterThanOrEqual(0);
      expect(typeof sizeKB).toBe('number');
    });
  });

  describe('identifyLargeDependencies', () => {
    it('should identify dependencies exceeding threshold', () => {
      const widgetBundles: WidgetBundleAnalysis[] = [
        {
          widgetName: 'SmallWidget.tsx',
          gzippedSizeKB: 10,
          individualLimitKB: PER_WIDGET_LIMIT_KB,
          passed: true,
          topContributors: [],
        },
        {
          widgetName: 'LargeWidget.tsx',
          gzippedSizeKB: 60,
          individualLimitKB: PER_WIDGET_LIMIT_KB,
          passed: false,
          topContributors: [],
        },
        {
          widgetName: 'MediumWidget.tsx',
          gzippedSizeKB: 30,
          individualLimitKB: PER_WIDGET_LIMIT_KB,
          passed: true,
          topContributors: [],
        },
      ];

      const largeDeps = identifyLargeDependencies(widgetBundles);

      expect(largeDeps).toHaveLength(1);
      expect(largeDeps[0].module).toBe('LargeWidget.tsx');
      expect(largeDeps[0].sizeKB).toBe(60);
    });

    it('should return empty array if no large dependencies', () => {
      const widgetBundles: WidgetBundleAnalysis[] = [
        {
          widgetName: 'SmallWidget.tsx',
          gzippedSizeKB: 10,
          individualLimitKB: PER_WIDGET_LIMIT_KB,
          passed: true,
          topContributors: [],
        },
      ];

      const largeDeps = identifyLargeDependencies(widgetBundles);

      expect(largeDeps).toHaveLength(0);
    });
  });

  describe('generateBundleSizeReport', () => {
    it('should generate a complete bundle size report', async () => {
      const report = await generateBundleSizeReport();

      expect(report.widgetBundles.length).toBeGreaterThan(0);
      expect(report.totalBundleSizeKB).toBeGreaterThan(0);
      expect(report.totalBundleLimitKB).toBe(TOTAL_BUNDLE_LIMIT_KB);
      expect(typeof report.totalBudgetPassed).toBe('boolean');
      expect(report.reactSizeKB).toBeGreaterThanOrEqual(0);
      expect(typeof report.reactSizePassed).toBe('boolean');
      expect(Array.isArray(report.largeDependencies)).toBe(true);
    });

    it('should calculate total bundle size correctly', async () => {
      const report = await generateBundleSizeReport();

      const calculatedTotal = report.widgetBundles.reduce(
        (sum, bundle) => sum + bundle.gzippedSizeKB,
        0
      );

      // Allow small rounding differences
      expect(Math.abs(report.totalBundleSizeKB - calculatedTotal)).toBeLessThan(0.01);
    });

    it('should set totalBudgetPassed correctly', async () => {
      const report = await generateBundleSizeReport();

      if (report.totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB) {
        expect(report.totalBudgetPassed).toBe(true);
      } else {
        expect(report.totalBudgetPassed).toBe(false);
      }
    });

    it('should set reactSizePassed correctly', async () => {
      const report = await generateBundleSizeReport();

      if (report.reactSizeKB <= REACT_LIMIT_KB) {
        expect(report.reactSizePassed).toBe(true);
      } else {
        expect(report.reactSizePassed).toBe(false);
      }
    });

    it('should calculate percentages for large dependencies', async () => {
      const report = await generateBundleSizeReport();

      for (const dep of report.largeDependencies) {
        expect(dep.percentage).toBeGreaterThan(0);
        expect(dep.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('formatWidgetAnalysis', () => {
    it('should format passing widget analysis', () => {
      const analysis: WidgetBundleAnalysis = {
        widgetName: 'TestWidget.tsx',
        gzippedSizeKB: 25.5,
        individualLimitKB: PER_WIDGET_LIMIT_KB,
        passed: true,
        topContributors: [],
      };

      const formatted = formatWidgetAnalysis(analysis);

      expect(formatted).toContain('TestWidget.tsx');
      expect(formatted).toContain('25.50KB');
      expect(formatted).toContain('✓ PASS');
    });

    it('should format failing widget analysis', () => {
      const analysis: WidgetBundleAnalysis = {
        widgetName: 'TestWidget.tsx',
        gzippedSizeKB: 75.5,
        individualLimitKB: PER_WIDGET_LIMIT_KB,
        passed: false,
        topContributors: [],
      };

      const formatted = formatWidgetAnalysis(analysis);

      expect(formatted).toContain('TestWidget.tsx');
      expect(formatted).toContain('75.50KB');
      expect(formatted).toContain('✗ FAIL');
    });
  });

  describe('formatBundleSizeReport', () => {
    it('should format a complete bundle size report', async () => {
      const report = await generateBundleSizeReport();
      const formatted = formatBundleSizeReport(report);

      expect(formatted).toContain('Bundle Size Analysis Report');
      expect(formatted).toContain('Widget Bundle Sizes:');
      expect(formatted).toContain('Total Bundle Size:');
      expect(formatted).toContain('React + React-DOM:');
    });

    it('should include large dependencies section if present', async () => {
      const report = await generateBundleSizeReport();
      const formatted = formatBundleSizeReport(report);

      if (report.largeDependencies.length > 0) {
        expect(formatted).toContain('Large Dependencies');
      } else {
        expect(formatted).toContain('No large dependencies found');
      }
    });
  });
});
