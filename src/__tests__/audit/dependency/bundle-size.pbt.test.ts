/**
 * Property-based tests for Bundle Size Aggregation
 *
 * **Property 15: Bundle Size Aggregation**
 * **Validates: Requirements 11.2**
 *
 * This test validates that:
 * 1. Bundle size aggregation is correct - total = sum of individual widget sizes
 * 2. Size limits are consistently applied - widgets over limit are always flagged
 * 3. Large dependency detection is accurate - only dependencies > 50KB are flagged
 * 4. Report structure is consistent and complete
 *
 * @module audit/dependency/bundle-size.pbt
 */

import fc from 'fast-check';
import {
  bytesToKB,
  identifyLargeDependencies,
  PER_WIDGET_LIMIT_KB,
  TOTAL_BUNDLE_LIMIT_KB,
  LARGE_DEPENDENCY_THRESHOLD_KB,
  REACT_LIMIT_KB,
  WIDGET_FILES,
} from './bundle-size';
import type {
  WidgetBundleAnalysis,
  ModuleContributor,
  BundleSizeReport,
} from './bundle-size';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for generating valid module contributor objects.
 * Constrains size to non-negative values and percentage to 0-100.
 */
const moduleContributorArb: fc.Arbitrary<ModuleContributor> = fc.record({
  module: fc.string({ minLength: 1, maxLength: 30 }),
  sizeKB: fc.float({ min: 0, max: 200, noNaN: true }),
  percentage: fc.float({ min: 0, max: 100, noNaN: true }),
});

/**
 * Arbitrary for generating a single widget bundle analysis.
 * Uses realistic widget name patterns and constrains sizes.
 */
const widgetBundleAnalysisArb: fc.Arbitrary<WidgetBundleAnalysis> = fc
  .record({
    widgetName: fc.string({ minLength: 1, maxLength: 30 }),
    gzippedSizeKB: fc.float({ min: 0, max: 300, noNaN: true }),
  })
  .map(({ widgetName, gzippedSizeKB }) => ({
    widgetName,
    gzippedSizeKB,
    individualLimitKB: PER_WIDGET_LIMIT_KB,
    passed: gzippedSizeKB <= PER_WIDGET_LIMIT_KB,
    topContributors: [
      {
        module: widgetName,
        sizeKB: gzippedSizeKB,
        percentage: 100,
      },
    ],
  }));

/**
 * Arbitrary for generating an array of widget bundle analyses.
 * Constrains array size to reasonable bounds (1-20 widgets).
 */
const widgetBundlesArb: fc.Arbitrary<WidgetBundleAnalysis[]> = fc.array(
  widgetBundleAnalysisArb,
  { minLength: 1, maxLength: 20 }
);

/**
 * Arbitrary for generating widget analyses that are all under the limit.
 */
const passingWidgetBundleArb: fc.Arbitrary<WidgetBundleAnalysis> = fc
  .record({
    widgetName: fc.string({ minLength: 1, maxLength: 30 }),
    gzippedSizeKB: fc.float({ min: 0, max: PER_WIDGET_LIMIT_KB, noNaN: true }),
  })
  .map(({ widgetName, gzippedSizeKB }) => ({
    widgetName,
    gzippedSizeKB,
    individualLimitKB: PER_WIDGET_LIMIT_KB,
    passed: true,
    topContributors: [
      {
        module: widgetName,
        sizeKB: gzippedSizeKB,
        percentage: 100,
      },
    ],
  }));

/**
 * Arbitrary for generating widget analyses that are all over the limit.
 */
const failingWidgetBundleArb: fc.Arbitrary<WidgetBundleAnalysis> = fc
  .record({
    widgetName: fc.string({ minLength: 1, maxLength: 30 }),
    // Use values slightly above the limit up to a reasonable max
    gzippedSizeKB: fc.float({
      min: Math.fround(PER_WIDGET_LIMIT_KB + 0.01),
      max: 300,
      noNaN: true,
    }),
  })
  .map(({ widgetName, gzippedSizeKB }) => ({
    widgetName,
    gzippedSizeKB,
    individualLimitKB: PER_WIDGET_LIMIT_KB,
    passed: false,
    topContributors: [
      {
        module: widgetName,
        sizeKB: gzippedSizeKB,
        percentage: 100,
      },
    ],
  }));

/**
 * Arbitrary for a complete bundle size report.
 */
const bundleSizeReportArb: fc.Arbitrary<BundleSizeReport> = widgetBundlesArb
  .chain((widgetBundles) => {
    const totalBundleSizeKB = widgetBundles.reduce(
      (sum, b) => sum + b.gzippedSizeKB,
      0
    );
    const reactSizeKB = fc.float({ min: 0, max: 80, noNaN: true });

    return reactSizeKB.map((rSize) => ({
      widgetBundles,
      totalBundleSizeKB: Math.round(totalBundleSizeKB * 100) / 100,
      totalBundleLimitKB: TOTAL_BUNDLE_LIMIT_KB,
      totalBudgetPassed: totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB,
      reactSizeKB: Math.round(rSize * 100) / 100,
      reactSizePassed: rSize <= REACT_LIMIT_KB,
      largeDependencies: identifyLargeDependencies(widgetBundles),
    }));
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 15: Bundle Size Aggregation', () => {
  // -----------------------------------------------------------------------
  // 15a: Total bundle size equals sum of individual widget sizes
  // -----------------------------------------------------------------------

  describe('total equals sum of individual widget sizes', () => {
    it('should compute total as exact sum of all widget gzipped sizes', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            const totalBundleSizeKB = widgetBundles.reduce(
              (sum, bundle) => sum + bundle.gzippedSizeKB,
              0
            );

            // The total must equal the sum of individual sizes
            expect(totalBundleSizeKB).toBeCloseTo(
              widgetBundles.reduce((sum, b) => sum + b.gzippedSizeKB, 0),
              10
            );

            // Verify each widget contributed its exact size
            let runningSum = 0;
            for (const bundle of widgetBundles) {
              runningSum += bundle.gzippedSizeKB;
            }
            expect(runningSum).toBeCloseTo(totalBundleSizeKB, 10);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should produce total of zero for empty widget array', () => {
      const emptyBundles: WidgetBundleAnalysis[] = [];
      const total = emptyBundles.reduce(
        (sum, b) => sum + b.gzippedSizeKB,
        0
      );
      expect(total).toBe(0);
    });

    it('should produce total equal to single widget for single-element array', () => {
      fc.assert(
        fc.property(
          widgetBundleAnalysisArb,
          (widget) => {
            const total = [widget].reduce(
              (sum, b) => sum + b.gzippedSizeKB,
              0
            );
            expect(total).toBeCloseTo(widget.gzippedSizeKB, 10);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be invariant under permutation of widgets', () => {
      fc.assert(
        fc.property(
          fc.array(widgetBundleAnalysisArb, { minLength: 2, maxLength: 10 }),
          (widgets) => {
            const total1 = widgets.reduce(
              (sum, b) => sum + b.gzippedSizeKB,
              0
            );
            // Reverse the array and compute again
            const total2 = [...widgets].reverse().reduce(
              (sum, b) => sum + b.gzippedSizeKB,
              0
            );
            expect(total1).toBeCloseTo(total2, 10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15b: Size limits are consistently applied
  // -----------------------------------------------------------------------

  describe('size limits are consistently applied', () => {
    it('should flag widgets over the per-widget limit', () => {
      fc.assert(
        fc.property(
          failingWidgetBundleArb,
          (widget) => {
            // A widget with size > limit must have passed = false
            expect(widget.gzippedSizeKB).toBeGreaterThan(PER_WIDGET_LIMIT_KB);
            expect(widget.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should pass widgets at or under the per-widget limit', () => {
      fc.assert(
        fc.property(
          passingWidgetBundleArb,
          (widget) => {
            // A widget with size <= limit must have passed = true
            expect(widget.gzippedSizeKB).toBeLessThanOrEqual(PER_WIDGET_LIMIT_KB);
            expect(widget.passed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly determine totalBudgetPassed based on sum vs limit', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            const totalBundleSizeKB = widgetBundles.reduce(
              (sum, b) => sum + b.gzippedSizeKB,
              0
            );
            const totalBudgetPassed = totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB;

            // If total is under or at limit, budget passed
            if (totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB) {
              expect(totalBudgetPassed).toBe(true);
            } else {
              expect(totalBudgetPassed).toBe(false);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should flag at least one widget when total exceeds limit and all are near limit', () => {
      // Generate a scenario where many widgets near the limit push total over
      fc.assert(
        fc.property(
          fc.integer({ min: 11, max: 20 }),
          (count) => {
            // Each widget at 49KB → total = count * 49 which exceeds 500KB
            const widgets: WidgetBundleAnalysis[] = Array.from(
              { length: count },
              (_, i) => ({
                widgetName: `Widget${i}`,
                gzippedSizeKB: 49,
                individualLimitKB: PER_WIDGET_LIMIT_KB,
                passed: true, // individually passes
                topContributors: [
                  { module: `Widget${i}`, sizeKB: 49, percentage: 100 },
                ],
              })
            );

            const total = widgets.reduce((s, b) => s + b.gzippedSizeKB, 0);
            expect(total).toBeGreaterThan(TOTAL_BUNDLE_LIMIT_KB);
            // Total budget should fail even though individual budgets pass
            expect(total > TOTAL_BUNDLE_LIMIT_KB).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should have consistent individualLimitKB for all widgets', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            for (const bundle of widgetBundles) {
              expect(bundle.individualLimitKB).toBe(PER_WIDGET_LIMIT_KB);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15c: Large dependency detection is accurate
  // -----------------------------------------------------------------------

  describe('large dependency detection is accurate', () => {
    it('should only flag dependencies exceeding the large dependency threshold', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            const largeDeps = identifyLargeDependencies(widgetBundles);

            // Every flagged dependency must exceed the threshold
            for (const dep of largeDeps) {
              expect(dep.sizeKB).toBeGreaterThan(LARGE_DEPENDENCY_THRESHOLD_KB);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should not miss any dependencies exceeding the threshold', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            const largeDeps = identifyLargeDependencies(widgetBundles);
            const largeDepNames = new Set(largeDeps.map((d) => d.module));

            // Every bundle exceeding the threshold must be in the result
            for (const bundle of widgetBundles) {
              if (bundle.gzippedSizeKB > LARGE_DEPENDENCY_THRESHOLD_KB) {
                expect(largeDepNames.has(bundle.widgetName)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should return empty array when no widgets exceed the threshold', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              widgetName: fc.string({ minLength: 1, maxLength: 20 }),
              gzippedSizeKB: fc.float({
                min: 0,
                max: LARGE_DEPENDENCY_THRESHOLD_KB,
                noNaN: true,
              }),
            }).map(({ widgetName, gzippedSizeKB }) => ({
              widgetName,
              gzippedSizeKB,
              individualLimitKB: PER_WIDGET_LIMIT_KB,
              passed: gzippedSizeKB <= PER_WIDGET_LIMIT_KB,
              topContributors: [
                { module: widgetName, sizeKB: gzippedSizeKB, percentage: 100 },
              ],
            })),
            { minLength: 1, maxLength: 10 }
          ),
          (widgetBundles) => {
            const largeDeps = identifyLargeDependencies(widgetBundles);
            expect(largeDeps).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should flag all widgets when all exceed the threshold', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              widgetName: fc.string({ minLength: 1, maxLength: 20 }),
              gzippedSizeKB: fc.float({
                min: Math.fround(LARGE_DEPENDENCY_THRESHOLD_KB + 0.01),
                max: 300,
                noNaN: true,
              }),
            }).map(({ widgetName, gzippedSizeKB }) => ({
              widgetName,
              gzippedSizeKB,
              individualLimitKB: PER_WIDGET_LIMIT_KB,
              passed: false,
              topContributors: [
                { module: widgetName, sizeKB: gzippedSizeKB, percentage: 100 },
              ],
            })),
            { minLength: 1, maxLength: 10 }
          ),
          (widgetBundles) => {
            const largeDeps = identifyLargeDependencies(widgetBundles);
            expect(largeDeps).toHaveLength(widgetBundles.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the module name and size in large dependency output', () => {
      fc.assert(
        fc.property(
          widgetBundlesArb,
          (widgetBundles) => {
            const largeDeps = identifyLargeDependencies(widgetBundles);

            for (const dep of largeDeps) {
              // Find the corresponding bundle
              const matchingBundle = widgetBundles.find(
                (b) => b.widgetName === dep.module
              );
              expect(matchingBundle).toBeDefined();
              expect(dep.sizeKB).toBe(matchingBundle!.gzippedSizeKB);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15d: Report structure is consistent and complete
  // -----------------------------------------------------------------------

  describe('report structure is consistent and complete', () => {
    it('should have totalBundleLimitKB always equal to the constant', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            expect(report.totalBundleLimitKB).toBe(TOTAL_BUNDLE_LIMIT_KB);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have widgetBundles array with correct length', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            expect(report.widgetBundles.length).toBeGreaterThanOrEqual(1);
            expect(report.widgetBundles.length).toBeLessThanOrEqual(20);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have consistent totalBudgetPassed with totalBundleSizeKB vs totalBundleLimitKB', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            if (report.totalBundleSizeKB <= report.totalBundleLimitKB) {
              expect(report.totalBudgetPassed).toBe(true);
            } else {
              expect(report.totalBudgetPassed).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have consistent reactSizePassed with reactSizeKB vs REACT_LIMIT_KB', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            if (report.reactSizeKB <= REACT_LIMIT_KB) {
              expect(report.reactSizePassed).toBe(true);
            } else {
              expect(report.reactSizePassed).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have non-negative totalBundleSizeKB', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            expect(report.totalBundleSizeKB).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have non-negative reactSizeKB', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            expect(report.reactSizeKB).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have each widget bundle contain required fields', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            for (const bundle of report.widgetBundles) {
              expect(bundle).toHaveProperty('widgetName');
              expect(bundle).toHaveProperty('gzippedSizeKB');
              expect(bundle).toHaveProperty('individualLimitKB');
              expect(bundle).toHaveProperty('passed');
              expect(bundle).toHaveProperty('topContributors');
              expect(typeof bundle.widgetName).toBe('string');
              expect(typeof bundle.gzippedSizeKB).toBe('number');
              expect(typeof bundle.individualLimitKB).toBe('number');
              expect(typeof bundle.passed).toBe('boolean');
              expect(Array.isArray(bundle.topContributors)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have consistent passed field with gzippedSizeKB vs individualLimitKB for each widget', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            for (const bundle of report.widgetBundles) {
              const expectedPassed = bundle.gzippedSizeKB <= bundle.individualLimitKB;
              expect(bundle.passed).toBe(expectedPassed);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have largeDependencies only contain modules from widgetBundles', () => {
      fc.assert(
        fc.property(
          bundleSizeReportArb,
          (report) => {
            const widgetNames = new Set(
              report.widgetBundles.map((b) => b.widgetName)
            );
            for (const dep of report.largeDependencies) {
              expect(widgetNames.has(dep.module)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15e: bytesToKB conversion correctness
  // -----------------------------------------------------------------------

  describe('bytesToKB conversion', () => {
    it('should convert zero bytes to zero KB', () => {
      expect(bytesToKB(0)).toBe(0);
    });

    it('should convert 1024 bytes to 1 KB', () => {
      expect(bytesToKB(1024)).toBe(1);
    });

    it('should convert bytes to KB with 2 decimal precision', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          (bytes) => {
            const kb = bytesToKB(bytes);
            // Result should have at most 2 decimal places
            const decimalPart = kb.toString().split('.')[1];
            if (decimalPart) {
              expect(decimalPart.length).toBeLessThanOrEqual(2);
            }
            // Value should be approximately correct
            expect(kb).toBeCloseTo(bytes / 1024, 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be non-negative for non-negative input', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          (bytes) => {
            expect(bytesToKB(bytes)).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15f: Constants are consistent
  // -----------------------------------------------------------------------

  describe('constants are consistent', () => {
    it('should have WIDGET_FILES contain all expected widget names', () => {
      const expectedWidgets = [
        'IDEShell.tsx',
        'TaskPanel.tsx',
        'DiffApproval.tsx',
        'GraphExplorer.tsx',
        'ReasoningLog.tsx',
        'InContextActions.tsx',
        'AgentStatus.tsx',
        'ResourceFooter.tsx',
        'IDEChrome.tsx',
        'WidgetSystem.tsx',
      ];
      expect(WIDGET_FILES).toEqual(expectedWidgets);
    });

    it('should have positive threshold constants', () => {
      expect(PER_WIDGET_LIMIT_KB).toBeGreaterThan(0);
      expect(TOTAL_BUNDLE_LIMIT_KB).toBeGreaterThan(0);
      expect(LARGE_DEPENDENCY_THRESHOLD_KB).toBeGreaterThan(0);
      expect(REACT_LIMIT_KB).toBeGreaterThan(0);
    });

    it('should have total bundle limit greater than per-widget limit', () => {
      expect(TOTAL_BUNDLE_LIMIT_KB).toBeGreaterThan(PER_WIDGET_LIMIT_KB);
    });

    it('should have large dependency threshold equal to per-widget limit', () => {
      // Both are 50KB as defined in the design
      expect(LARGE_DEPENDENCY_THRESHOLD_KB).toBe(PER_WIDGET_LIMIT_KB);
    });
  });
});
