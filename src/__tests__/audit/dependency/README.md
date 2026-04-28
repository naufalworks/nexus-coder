# Dependency Analyzer Module

This module provides tools for analyzing bundle size and dependency health for the Nexus Coder V2 project.

## Bundle Size Analyzer

The bundle size analyzer measures the gzipped size of widget files and verifies they meet bundle size budgets.

### Features

- **Per-Widget Analysis**: Measures gzipped size for each widget file
- **Total Bundle Size**: Calculates total bundle size across all widgets
- **React Size Verification**: Measures React + React-DOM combined size
- **Large Dependency Detection**: Identifies dependencies exceeding 50KB threshold
- **Budget Compliance**: Verifies widgets meet size limits

### Usage

```typescript
import { generateBundleSizeReport, formatBundleSizeReport } from './bundle-size';

// Generate a complete bundle size report
const report = await generateBundleSizeReport();

// Format and display the report
const formatted = formatBundleSizeReport(report);
console.log(formatted);
```

### Bundle Size Limits

- **Per Widget**: 50KB gzipped
- **Total Bundle**: 500KB gzipped
- **React + React-DOM**: 45KB gzipped
- **Large Dependency Threshold**: 50KB gzipped

### Requirements Validated

- **11.1**: Measure gzipped size for each widget using gzip-size
- **11.2**: Calculate total bundle size
- **11.3**: Identify large dependencies (>50KB gzipped)
- **11.4**: Report bundle size violations
- **11.5**: Verify React + React-DOM combined size

### API Reference

#### `measureGzippedSize(filePath: string): Promise<number>`

Measures the gzipped size of a file in bytes.

**Parameters:**
- `filePath`: Absolute path to the file

**Returns:** Gzipped size in bytes

#### `measureWidgetSize(widgetName: string, srcDir?: string): Promise<number>`

Measures the gzipped size of a widget file in KB.

**Parameters:**
- `widgetName`: Name of the widget file (e.g., 'TaskPanel.tsx')
- `srcDir`: Source directory path (default: 'src/widgets')

**Returns:** Gzipped size in KB

#### `analyzeWidgetBundle(widgetName: string, srcDir?: string): Promise<WidgetBundleAnalysis>`

Analyzes a single widget's bundle size.

**Parameters:**
- `widgetName`: Name of the widget file
- `srcDir`: Source directory path (default: 'src/widgets')

**Returns:** Widget bundle analysis with size, limit, and pass/fail status

#### `measureReactSize(): Promise<number>`

Measures the combined gzipped size of React and React-DOM.

**Returns:** Combined React + React-DOM size in KB

#### `generateBundleSizeReport(srcDir?: string): Promise<BundleSizeReport>`

Generates a comprehensive bundle size report for all widgets.

**Parameters:**
- `srcDir`: Source directory path (default: 'src/widgets')

**Returns:** Complete bundle size report

#### `formatBundleSizeReport(report: BundleSizeReport): string`

Formats a bundle size report for console output.

**Parameters:**
- `report`: Bundle size report to format

**Returns:** Formatted string

### Example Output

```
=== Bundle Size Analysis Report ===

Widget Bundle Sizes:
  IDEShell.tsx: 1.55KB (limit: 50KB) ✓ PASS
  TaskPanel.tsx: 1.86KB (limit: 50KB) ✓ PASS
  DiffApproval.tsx: 2.19KB (limit: 50KB) ✓ PASS
  GraphExplorer.tsx: 3.15KB (limit: 50KB) ✓ PASS
  ReasoningLog.tsx: 1.14KB (limit: 50KB) ✓ PASS
  InContextActions.tsx: 1.95KB (limit: 50KB) ✓ PASS
  AgentStatus.tsx: 2.18KB (limit: 50KB) ✓ PASS
  ResourceFooter.tsx: 0.49KB (limit: 50KB) ✓ PASS
  IDEChrome.tsx: 0.67KB (limit: 50KB) ✓ PASS
  WidgetSystem.tsx: 0.72KB (limit: 50KB) ✓ PASS

Total Bundle Size: 15.90KB (limit: 500KB) ✓ PASS
React + React-DOM: 0.78KB (limit: 45KB) ✓ PASS

No large dependencies found.
```

### Testing

Run the unit tests:
```bash
npm test -- src/__tests__/audit/dependency/bundle-size.test.ts
```

Run the integration tests:
```bash
npm test -- src/__tests__/audit/dependency/bundle-size.integration.test.ts
```

Run all bundle size tests:
```bash
npm test -- --testPathPattern='bundle-size'
```

### Implementation Notes

- Uses `gzip-size` package for accurate gzipped size measurement
- Falls back to Node.js built-in `zlib` if `gzip-size` is unavailable
- Measures source file sizes (not compiled bundles) for simplicity
- In production, this would analyze compiled/bundled output
- Dynamic import used to handle ESM module compatibility

### Dependency Health Checker

The dependency health checker analyzes dependency health including outdated packages, security vulnerabilities, unused dependencies, and misplaced devDependencies.

### Features

- **Outdated Package Detection**: Runs `npm outdated --json` to detect packages not at the latest version
- **Security Vulnerability Scanning**: Runs `npm audit --json` to detect known vulnerabilities
- **Unused Dependency Identification**: Analyzes imports in src/ to find unused package.json entries
- **Misplaced Dependency Detection**: Checks if devDependencies are used in production code
- **Health Report Generation**: Combines all checks into a comprehensive report with severity levels

### Usage

```typescript
import { generateDependencyHealthReport, formatDependencyHealthReport } from './health';

// Generate a complete dependency health report
const report = generateDependencyHealthReport();

// Format and display the report
const formatted = formatDependencyHealthReport(report);
console.log(formatted);
```

### Health Status Levels

- **healthy**: No critical/high vulnerabilities, ≤5 outdated packages, no misplaced deps
- **warning**: High vulnerabilities, >5 outdated packages, or misplaced deps
- **critical**: Critical vulnerabilities found

### Requirements Validated

- **13.1**: Check for outdated packages using npm outdated
- **13.2**: Check for security vulnerabilities using npm audit
- **13.3**: Identify unused dependencies
- **13.4**: Identify misplaced devDependencies
- **13.5**: Report package name, issue type, and recommended version/action

### API Reference

#### `checkOutdatedPackages(): DependencyStatus[]`

Runs `npm outdated --json` to detect outdated packages.

**Returns:** Array of dependency status objects with current, wanted, and latest versions.

#### `checkSecurityVulnerabilities(): SecurityVulnerability[]`

Runs `npm audit --json` to detect security vulnerabilities.

**Returns:** Array of security vulnerability objects (high and critical severity only).

#### `identifyUnusedDependencies(srcDir?: string, packageJsonPath?: string): string[]`

Analyzes imports in source files to find unused dependencies.

**Returns:** Array of package names with no import references.

#### `identifyMisplacedDependencies(srcDir?: string, packageJsonPath?: string): DependencyMisplacement[]`

Checks if devDependencies are used in production code.

**Returns:** Array of misplaced dependency objects with reasons.

#### `generateDependencyHealthReport(srcDir?: string, packageJsonPath?: string): DependencyHealthReport`

Runs all health checks and generates a comprehensive report.

**Returns:** Complete dependency health report with status and summary.

#### `formatDependencyHealthReport(report: DependencyHealthReport): string`

Formats a health report for console output.

**Returns:** Formatted string for display.

### Testing

Run the unit tests:
```bash
npm test -- src/__tests__/audit/dependency/health.test.ts
```

Run all dependency tests:
```bash
npm test -- --testPathPattern='dependency'
```

### Future Enhancements

- Analyze compiled bundle output instead of source files
- Track bundle size trends over time
- Integration with CI/CD for automated checks
- Detailed dependency tree analysis
- Source map analysis for accurate module attribution
- License compliance checking
- Dependency deprecation warnings
