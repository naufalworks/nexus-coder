/**
 * Property-Based Tests for Dead Code Detector
 *
 * **Property 1: Export-Import Reference Completeness**
 * **Validates: Requirements 2.1, 2.3**
 *
 * **Property 2: Dead Symbol Report Completeness**
 * **Validates: Requirements 2.5, 2.6**
 *
 * @module audit/dead-code/detector.pbt.test
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeadCodeDetector, DeadCodeViolation, DeadSymbolKind } from './detector';
import type { AuditReport } from '../framework/types';

describe('Dead Code Detector - Property-Based Tests', () => {
  /**
   * Property 1: Export-Import Reference Completeness
   *
   * **Validates: Requirements 2.1, 2.3**
   *
   * For any codebase, the detector correctly identifies which exports have zero references:
   * - All unreferenced exports are found
   * - No referenced exports are incorrectly flagged
   * - Utility functions with zero calls are identified
   */
  describe('Property 1: Export-Import Reference Completeness', () => {
    // Arbitrary for generating valid TypeScript identifiers
    const identifierArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/);

    /**
     * Helper to create a temporary test directory with TypeScript files
     */
    const createTempTestDir = (): string => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-test-'));
      return tempDir;
    };

    /**
     * Helper to clean up temporary test directory
     */
    const cleanupTempDir = (dir: string): void => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    };

    /**
     * Helper to write a TypeScript file to a directory
     */
    const writeTsFile = (dir: string, fileName: string, content: string): string => {
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    };

    // We use async property tests with fast-check

    it('should identify exported functions with zero references as dead code', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: unreferenced export should be identified
              const hasUnusedFunc = report.violations.some(
                (v) => (v as DeadCodeViolation).symbolName === funcName
              );
              expect(hasUnusedFunc).toBe(true);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should NOT flag exported functions that ARE imported as dead code', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const moduleContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', moduleContent);

              const consumerContent = `
import { ${funcName} } from './module';

export function useFunc(): void {
  ${funcName}();
}
`;
              writeTsFile(tempDir, 'consumer.ts', consumerContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: referenced export should NOT be flagged
              const hasUnusedFunc = report.violations.some(
                (v) => (v as DeadCodeViolation).symbolName === funcName
              );
              expect(hasUnusedFunc).toBe(false);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should correctly identify all unreferenced exports in a file with multiple exports', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(identifierArb.filter(name => name.length > 2), { minLength: 2, maxLength: 5 }),
          fc.integer({ min: 0, max: 4 }),
          async (funcNames, referencedIndex) => {
            fc.pre(funcNames.length > 1);
            fc.pre(referencedIndex < funcNames.length);

            const tempDir = createTempTestDir();
            try {
              const exports = funcNames
                .map(
                  (name) => `export function ${name}(): void {\n  console.log('${name}');\n}`
                )
                .join('\n\n');

              writeTsFile(tempDir, 'module.ts', exports);

              const referencedFunc = funcNames[referencedIndex];
              const consumerContent = `
import { ${referencedFunc} } from './module';

export function caller(): void {
  ${referencedFunc}();
}
`;
              writeTsFile(tempDir, 'consumer.ts', consumerContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: unreferenced exports should be flagged, referenced should not
              for (let i = 0; i < funcNames.length; i++) {
                const funcName = funcNames[i];
                const isFlagged = report.violations.some(
                  (v) => (v as DeadCodeViolation).symbolName === funcName
                );
                const shouldBeFlagged = i !== referencedIndex;
                expect(isFlagged).toBe(shouldBeFlagged);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should identify utility functions that are defined but never called', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (utilName) => {
            const tempDir = createTempTestDir();
            try {
              const utilContent = `
export function ${utilName}(input: string): string {
  return input.toUpperCase();
}
`;
              writeTsFile(tempDir, 'utils.ts', utilContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: unused utility function should be detected
              const hasUnusedUtil = report.violations.some(
                (v) => (v as DeadCodeViolation).symbolName === utilName
              );
              expect(hasUnusedUtil).toBe(true);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should correctly handle type declarations that are defined but never used', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (typeName) => {
            const tempDir = createTempTestDir();
            try {
              const typeContent = `
export interface ${typeName} {
  id: string;
  value: number;
}
`;
              writeTsFile(tempDir, 'types.ts', typeContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: unused type should be detected
              const hasUnusedType = report.violations.some(
                (v) => (v as DeadCodeViolation).symbolName === typeName
              );
              expect(hasUnusedType).toBe(true);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should NOT flag type declarations that ARE used as type annotations', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (typeName) => {
            const tempDir = createTempTestDir();
            try {
              const typeContent = `
export interface ${typeName} {
  id: string;
  value: number;
}
`;
              writeTsFile(tempDir, 'types.ts', typeContent);

              const consumerContent = `
import type { ${typeName} } from './types';

export function process(data: ${typeName}): void {
  console.log(data.id);
}
`;
              writeTsFile(tempDir, 'consumer.ts', consumerContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: used type should NOT be flagged
              const hasUnusedType = report.violations.some(
                (v) => (v as DeadCodeViolation).symbolName === typeName
              );
              expect(hasUnusedType).toBe(false);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle edge case: empty codebase (no files)', async () => {
      const tempDir = createTempTestDir();
      try {
        const detector = new DeadCodeDetector({
          srcDirs: [tempDir],
          extensions: ['.ts'],
          excludePatterns: [],
          minLinesForEstimate: 1,
          bytesPerLine: 40,
        });

        const report = await detector.run();

        // Property: empty codebase should have zero violations
        expect(report.totalViolations).toBe(0);
        expect(report.violations).toHaveLength(0);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should handle edge case: file with no exports', async () => {
      const tempDir = createTempTestDir();
      try {
        const fileContent = `
function internalHelper(): void {
  console.log('internal');
}
`;
        writeTsFile(tempDir, 'internal.ts', fileContent);

        const detector = new DeadCodeDetector({
          srcDirs: [tempDir],
          extensions: ['.ts'],
          excludePatterns: [],
          minLinesForEstimate: 1,
          bytesPerLine: 40,
        });

        const report = await detector.run();

        // Property: no exports means no dead code violations
        expect(report.totalViolations).toBe(0);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should be deterministic - same input produces same output', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const config = {
                srcDirs: [tempDir],
                extensions: ['.ts'] as string[],
                excludePatterns: [] as RegExp[],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              };

              const detector1 = new DeadCodeDetector(config);
              const detector2 = new DeadCodeDetector(config);

              const [report1, report2] = await Promise.all([detector1.run(), detector2.run()]);

              // Property: results should be identical
              expect(report1.totalViolations).toBe(report2.totalViolations);
              expect(report1.violations.length).toBe(report2.violations.length);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 2: Dead Symbol Report Completeness
   *
   * **Validates: Requirements 2.5, 2.6**
   *
   * For any detected dead symbol, the report includes all required fields:
   * - Symbol name
   * - File path
   * - Line number
   * - Estimated bytes saved
   * - The total report correctly aggregates all violations and provides bundle size estimate
   */
  describe('Property 2: Dead Symbol Report Completeness', () => {
    const identifierArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/);

    /**
     * Helper to create a temporary test directory
     */
    const createTempTestDir = (): string => {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-report-'));
    };

    /**
     * Helper to clean up temporary test directory
     */
    const cleanupTempDir = (dir: string): void => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    };

    /**
     * Helper to write a TypeScript file
     */
    const writeTsFile = (dir: string, fileName: string, content: string): string => {
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    };

    it('should include symbol name in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a symbolName
              for (const violation of report.violations) {
                const v = violation as DeadCodeViolation;
                expect(v.symbolName).toBeDefined();
                expect(typeof v.symbolName).toBe('string');
                expect(v.symbolName!.length).toBeGreaterThan(0);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include file path in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a valid filePath
              for (const violation of report.violations) {
                expect(violation.filePath).toBeDefined();
                expect(typeof violation.filePath).toBe('string');
                expect(violation.filePath.length).toBeGreaterThan(0);
                // File path should contain the temp directory
                expect(violation.filePath).toContain(tempDir);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include line number in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a valid lineNumber
              for (const violation of report.violations) {
                expect(violation.lineNumber).toBeDefined();
                expect(typeof violation.lineNumber).toBe('number');
                expect(violation.lineNumber).toBeGreaterThanOrEqual(1);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include estimated bytes saved in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have estimatedBytesSaved
              for (const violation of report.violations) {
                const v = violation as DeadCodeViolation;
                expect(v.estimatedBytesSaved).toBeDefined();
                expect(typeof v.estimatedBytesSaved).toBe('number');
                expect(v.estimatedBytesSaved).toBeGreaterThanOrEqual(0);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include symbol kind in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          fc.constantFrom<DeadSymbolKind>('function', 'class', 'interface', 'type', 'variable'),
          async (symbolName, kind) => {
            const tempDir = createTempTestDir();
            try {
              let fileContent: string = '';

              switch (kind) {
                case 'function':
                  fileContent = `export function ${symbolName}(): void {}`;
                  break;
                case 'class':
                  fileContent = `export class ${symbolName} {}`;
                  break;
                case 'interface':
                  fileContent = `export interface ${symbolName} { id: string; }`;
                  break;
                case 'type':
                  fileContent = `export type ${symbolName} = string;`;
                  break;
                case 'variable':
                  fileContent = `export const ${symbolName} = 'value';`;
                  break;
              }

              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a valid symbolKind
              for (const violation of report.violations) {
                const v = violation as DeadCodeViolation;
                expect(v.symbolKind).toBeDefined();
                expect(['function', 'class', 'interface', 'type', 'variable', 'props']).toContain(
                  v.symbolKind
                );
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should produce dead symbol count report with accurate count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(identifierArb.filter(name => name.length > 2), { minLength: 1, maxLength: 5 }),
          async (funcNames) => {
            const tempDir = createTempTestDir();
            try {
              const exports = funcNames
                .map(name => `export function ${name}(): void {}`)
                .join('\n\n');

              writeTsFile(tempDir, 'module.ts', exports);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: totalViolations should match the number of unused exports
              expect(report.totalViolations).toBe(funcNames.length);
              expect(report.violations.length).toBe(funcNames.length);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should produce estimated bundle size reduction in report', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(identifierArb.filter(name => name.length > 2), { minLength: 1, maxLength: 3 }),
          async (funcNames) => {
            const tempDir = createTempTestDir();
            try {
              const exports = funcNames
                .map(name => `export function ${name}(): void {\n  console.log('');\n}`)
                .join('\n\n');

              writeTsFile(tempDir, 'module.ts', exports);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: report must include estimatedBundleReduction
              expect(report.estimatedBundleReduction).toBeDefined();
              expect(typeof report.estimatedBundleReduction).toBe('string');
              // Should end with B, KB, or MB
              expect(report.estimatedBundleReduction).toMatch(/\d+(B|KB|MB)$/);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should aggregate total bytes saved across all violations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(identifierArb.filter(name => name.length > 2), { minLength: 2, maxLength: 5 }),
          async (funcNames) => {
            const tempDir = createTempTestDir();
            try {
              const exports = funcNames
                .map(name => `export function ${name}(): void {\n  console.log('test');\n}`)
                .join('\n\n');

              writeTsFile(tempDir, 'module.ts', exports);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: sum of individual bytes should equal metrics total
              const totalFromViolations = report.violations.reduce(
                (sum, v) => sum + ((v as DeadCodeViolation).estimatedBytesSaved || 0),
                0
              );

              const metricsTotal = report.metrics?.totalEstimatedBytesSaved;
              if (metricsTotal !== undefined) {
                expect(totalFromViolations).toBe(metricsTotal);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should include metrics with total files and exports analyzed', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: report must include metrics
              expect(report.metrics).toBeDefined();
              expect(report.metrics?.totalFiles).toBeDefined();
              expect(report.metrics?.totalExports).toBeDefined();
              expect(typeof report.metrics?.totalFiles).toBe('number');
              expect(typeof report.metrics?.totalExports).toBe('number');
              expect(report.metrics?.totalFiles as number).toBeGreaterThanOrEqual(1);
              expect(report.metrics?.totalExports as number).toBeGreaterThanOrEqual(1);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should correctly calculate bytes from symbol complexity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{2,15}$/),
          fc.integer({ min: 1, max: 20 }),
          async (funcName, bodyLines) => {
            const tempDir = createTempTestDir();
            try {
              const body = Array(bodyLines)
                .fill('  console.log("line");')
                .join('\n');

              const fileContent = `
export function ${funcName}(): void {
${body}
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              const violation = report.violations.find(
                (v) => (v as DeadCodeViolation).symbolName === funcName
              );

              if (violation) {
                const v = violation as DeadCodeViolation;
                // Minimum bytes for any exported function
                expect(v.estimatedBytesSaved).toBeGreaterThan(0);
                // Bytes should be less than source code length (minification)
                const codeLength = fileContent.length;
                expect(v.estimatedBytesSaved).toBeLessThan(codeLength);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle violations with all required fields for JSON serialization', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations should serialize to valid JSON
              const json = JSON.stringify(report);
              const parsed = JSON.parse(json);

              expect(parsed.category).toBe('dead-code');
              expect(parsed.totalViolations).toBe(report.totalViolations);
              expect(Array.isArray(parsed.violations)).toBe(true);

              for (const v of parsed.violations) {
                expect(v.category).toBeDefined();
                expect(v.severity).toBeDefined();
                expect(v.filePath).toBeDefined();
                expect(v.lineNumber).toBeDefined();
                expect(v.message).toBeDefined();
                expect(v.symbolName).toBeDefined();
                expect(v.symbolKind).toBeDefined();
                expect(v.estimatedBytesSaved).toBeDefined();
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include human-readable message in every violation', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a descriptive message
              for (const violation of report.violations) {
                expect(violation.message).toBeDefined();
                expect(typeof violation.message).toBe('string');
                expect(violation.message.length).toBeGreaterThan(10);
                // Message should contain "unused"
                expect(violation.message.toLowerCase()).toContain('unused');
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should correctly set severity for dead code violations', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have a valid severity
              for (const violation of report.violations) {
                expect(violation.severity).toBeDefined();
                expect(['critical', 'high', 'medium', 'low']).toContain(violation.severity);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should include category as "dead-code" in all violations', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArb.filter(name => name.length > 2),
          async (funcName) => {
            const tempDir = createTempTestDir();
            try {
              const fileContent = `
export function ${funcName}(): void {
  // Implementation
}
`;
              writeTsFile(tempDir, 'module.ts', fileContent);

              const detector = new DeadCodeDetector({
                srcDirs: [tempDir],
                extensions: ['.ts'],
                excludePatterns: [],
                minLinesForEstimate: 1,
                bytesPerLine: 40,
              });

              const report = await detector.run();

              // Property: all violations must have category 'dead-code'
              expect(report.category).toBe('dead-code');
              for (const violation of report.violations) {
                expect(violation.category).toBe('dead-code');
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
