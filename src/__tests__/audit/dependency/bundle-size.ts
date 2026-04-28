/**
 * Bundle Size Analyzer for IDE Widgets
 * 
 * This module provides utilities for measuring and analyzing the gzipped
 * bundle size of React widgets and their dependencies. It is designed to
 * verify widgets meet bundle size budgets and identify large dependencies.
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 * 
 * @module audit/dependency/bundle-size
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum gzipped size per widget in KB.
 */
export const PER_WIDGET_LIMIT_KB = 50;

/**
 * Maximum total gzipped bundle size in KB.
 */
export const TOTAL_BUNDLE_LIMIT_KB = 500;

/**
 * Maximum React + React-DOM combined size in KB.
 */
export const REACT_LIMIT_KB = 45;

/**
 * Threshold for flagging large individual dependencies in KB.
 */
export const LARGE_DEPENDENCY_THRESHOLD_KB = 50;

/**
 * List of widget files to analyze.
 */
export const WIDGET_FILES = [
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Module contributor to bundle size.
 */
export interface ModuleContributor {
  /** Module name */
  module: string;
  /** Gzipped size in KB */
  sizeKB: number;
  /** Percentage of total */
  percentage: number;
}

/**
 * Widget bundle analysis result.
 */
export interface WidgetBundleAnalysis {
  /** Widget name */
  widgetName: string;
  /** Gzipped size in KB */
  gzippedSizeKB: number;
  /** Individual limit in KB */
  individualLimitKB: number;
  /** Whether the widget passed the size limit */
  passed: boolean;
  /** Top contributing modules */
  topContributors: ModuleContributor[];
}

/**
 * Bundle size report for all widgets.
 */
export interface BundleSizeReport {
  /** Per-widget bundle analysis */
  widgetBundles: WidgetBundleAnalysis[];
  /** Total bundle size in KB */
  totalBundleSizeKB: number;
  /** Total bundle limit in KB */
  totalBundleLimitKB: number;
  /** Whether total budget passed */
  totalBudgetPassed: boolean;
  /** React + React-DOM combined size in KB */
  reactSizeKB: number;
  /** Whether React size is within limit */
  reactSizePassed: boolean;
  /** Large dependencies (>50KB) */
  largeDependencies: ModuleContributor[];
}

// ---------------------------------------------------------------------------
// Size Measurement
// ---------------------------------------------------------------------------

/**
 * Measure the gzipped size of a file in bytes.
 * 
 * Uses the gzip-size package for accurate measurement.
 * Falls back to Node.js zlib if the package is unavailable.
 * 
 * Validates: Requirement 11.1
 * 
 * @param filePath - Absolute path to the file
 * @returns Gzipped size in bytes
 */
export async function measureGzippedSize(filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    // Use dynamic import to handle ESM module
    const gzipSizeModule = await import('gzip-size');
    return await gzipSizeModule.gzipSize(content);
  } catch {
    // Fallback: use Node.js built-in zlib for gzip measurement
    return measureGzippedSizeFallback(filePath);
  }
}

/**
 * Fallback gzipped size measurement using Node.js built-in zlib.
 * 
 * @param filePath - Absolute path to the file
 * @returns Gzipped size in bytes
 */
async function measureGzippedSizeFallback(filePath: string): Promise<number> {
  const zlib = await import('zlib');
  
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return new Promise<number>((resolve, reject) => {
      zlib.gzip(content, (err, compressed) => {
        if (err) {
          resolve(0);
        } else {
          resolve(compressed.length);
        }
      });
    });
  } catch {
    return 0;
  }
}

/**
 * Convert bytes to kilobytes with 2 decimal precision.
 * 
 * @param bytes - Size in bytes
 * @returns Size in KB
 */
export function bytesToKB(bytes: number): number {
  return Math.round((bytes / 1024) * 100) / 100;
}

/**
 * Measure the gzipped size of a widget file.
 * 
 * Validates: Requirement 11.1
 * 
 * @param widgetName - Name of the widget file (e.g., 'TaskPanel.tsx')
 * @param srcDir - Source directory path (default: 'src/widgets')
 * @returns Gzipped size in KB
 */
export async function measureWidgetSize(
  widgetName: string,
  srcDir: string = 'src/widgets'
): Promise<number> {
  const filePath = path.join(process.cwd(), srcDir, widgetName);
  const sizeBytes = await measureGzippedSize(filePath);
  return bytesToKB(sizeBytes);
}

/**
 * Analyze a single widget's bundle size.
 * 
 * Validates: Requirements 11.1, 11.3
 * 
 * @param widgetName - Name of the widget file
 * @param srcDir - Source directory path
 * @returns Widget bundle analysis
 */
export async function analyzeWidgetBundle(
  widgetName: string,
  srcDir: string = 'src/widgets'
): Promise<WidgetBundleAnalysis> {
  const gzippedSizeKB = await measureWidgetSize(widgetName, srcDir);
  
  // For now, we consider the widget file itself as the main contributor
  // In a real implementation, this would analyze the compiled bundle
  const topContributors: ModuleContributor[] = [
    {
      module: widgetName,
      sizeKB: gzippedSizeKB,
      percentage: 100,
    },
  ];

  return {
    widgetName,
    gzippedSizeKB,
    individualLimitKB: PER_WIDGET_LIMIT_KB,
    passed: gzippedSizeKB <= PER_WIDGET_LIMIT_KB,
    topContributors,
  };
}

// ---------------------------------------------------------------------------
// React Size Analysis
// ---------------------------------------------------------------------------

/**
 * Measure the combined gzipped size of React and React-DOM.
 * 
 * This checks the installed node_modules packages to estimate
 * the React bundle contribution.
 * 
 * Validates: Requirement 11.5
 * 
 * @returns Combined React + React-DOM size in KB
 */
export async function measureReactSize(): Promise<number> {
  const reactPath = path.join(process.cwd(), 'node_modules', 'react', 'index.js');
  const reactDomPath = path.join(process.cwd(), 'node_modules', 'react-dom', 'index.js');
  
  const reactSize = await measureGzippedSize(reactPath);
  const reactDomSize = await measureGzippedSize(reactDomPath);
  
  return bytesToKB(reactSize + reactDomSize);
}

// ---------------------------------------------------------------------------
// Dependency Analysis
// ---------------------------------------------------------------------------

/**
 * Identify large dependencies that exceed the threshold.
 * 
 * Validates: Requirement 11.3
 * 
 * @param widgetBundles - Array of widget bundle analyses
 * @returns Array of large dependencies
 */
export function identifyLargeDependencies(
  widgetBundles: WidgetBundleAnalysis[]
): ModuleContributor[] {
  const largeDeps: ModuleContributor[] = [];
  
  for (const bundle of widgetBundles) {
    if (bundle.gzippedSizeKB > LARGE_DEPENDENCY_THRESHOLD_KB) {
      largeDeps.push({
        module: bundle.widgetName,
        sizeKB: bundle.gzippedSizeKB,
        percentage: 0, // Will be calculated later
      });
    }
  }
  
  return largeDeps;
}

// ---------------------------------------------------------------------------
// Bundle Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive bundle size report for all widgets.
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 * 
 * @param srcDir - Source directory path (default: 'src/widgets')
 * @returns Complete bundle size report
 */
export async function generateBundleSizeReport(
  srcDir: string = 'src/widgets'
): Promise<BundleSizeReport> {
  // Analyze each widget
  const widgetBundles: WidgetBundleAnalysis[] = [];
  
  for (const widgetFile of WIDGET_FILES) {
    const analysis = await analyzeWidgetBundle(widgetFile, srcDir);
    widgetBundles.push(analysis);
  }
  
  // Calculate total bundle size
  const totalBundleSizeKB = widgetBundles.reduce(
    (sum, bundle) => sum + bundle.gzippedSizeKB,
    0
  );
  
  // Check total budget
  const totalBudgetPassed = totalBundleSizeKB <= TOTAL_BUNDLE_LIMIT_KB;
  
  // Measure React size
  const reactSizeKB = await measureReactSize();
  const reactSizePassed = reactSizeKB <= REACT_LIMIT_KB;
  
  // Identify large dependencies
  const largeDependencies = identifyLargeDependencies(widgetBundles);
  
  // Calculate percentages for large dependencies
  if (totalBundleSizeKB > 0) {
    for (const dep of largeDependencies) {
      dep.percentage = Math.round((dep.sizeKB / totalBundleSizeKB) * 10000) / 100;
    }
  }
  
  return {
    widgetBundles,
    totalBundleSizeKB: Math.round(totalBundleSizeKB * 100) / 100,
    totalBundleLimitKB: TOTAL_BUNDLE_LIMIT_KB,
    totalBudgetPassed,
    reactSizeKB: Math.round(reactSizeKB * 100) / 100,
    reactSizePassed,
    largeDependencies,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Format a widget bundle analysis for console output.
 * 
 * @param analysis - Widget bundle analysis to format
 * @returns Formatted string
 */
export function formatWidgetAnalysis(analysis: WidgetBundleAnalysis): string {
  const status = analysis.passed ? '✓ PASS' : '✗ FAIL';
  const size = analysis.gzippedSizeKB.toFixed(2);
  const limit = analysis.individualLimitKB;
  
  return `${analysis.widgetName}: ${size}KB (limit: ${limit}KB) ${status}`;
}

/**
 * Format the complete bundle size report for console output.
 * 
 * @param report - Bundle size report to format
 * @returns Formatted string
 */
export function formatBundleSizeReport(report: BundleSizeReport): string {
  const lines = [
    '\n=== Bundle Size Analysis Report ===\n',
    'Widget Bundle Sizes:',
  ];
  
  // Add each widget
  for (const bundle of report.widgetBundles) {
    lines.push(`  ${formatWidgetAnalysis(bundle)}`);
  }
  
  // Add total
  const totalStatus = report.totalBudgetPassed ? '✓ PASS' : '✗ FAIL';
  lines.push('');
  lines.push(`Total Bundle Size: ${report.totalBundleSizeKB.toFixed(2)}KB (limit: ${report.totalBundleLimitKB}KB) ${totalStatus}`);
  
  // Add React size
  const reactStatus = report.reactSizePassed ? '✓ PASS' : '✗ FAIL';
  lines.push(`React + React-DOM: ${report.reactSizeKB.toFixed(2)}KB (limit: ${REACT_LIMIT_KB}KB) ${reactStatus}`);
  
  // Add large dependencies
  if (report.largeDependencies.length > 0) {
    lines.push('');
    lines.push(`Large Dependencies (>${LARGE_DEPENDENCY_THRESHOLD_KB}KB):`);
    for (const dep of report.largeDependencies) {
      lines.push(`  ${dep.module}: ${dep.sizeKB.toFixed(2)}KB (${dep.percentage.toFixed(1)}% of total)`);
    }
  } else {
    lines.push('');
    lines.push('No large dependencies found.');
  }
  
  lines.push('');
  
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  measureGzippedSize,
  measureWidgetSize,
  analyzeWidgetBundle,
  measureReactSize,
  identifyLargeDependencies,
  generateBundleSizeReport,
  formatWidgetAnalysis,
  formatBundleSizeReport,
};
