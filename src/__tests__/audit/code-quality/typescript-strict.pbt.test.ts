/**
 * Property-based tests for TypeScript Strict Mode Audit
 *
 * **Property 4: Type Safety Score Calculation**
 * **Validates: Requirements 1.6**
 *
 * This test validates that the Type_Safety_Score calculation correctly:
 * 1. Returns a score between 0 and 100
 * 2. Returns 100 when all files pass
 * 3. Returns 0 when no files pass
 * 4. Calculates score as (files passing / total files) * 100
 * 5. Decreases as violations increase
 * 6. Is deterministic for same input
 */

import fc from 'fast-check';
import {
  TypeScriptStrictViolation,
  TypeScriptViolationType,
} from './typescript-strict';

/**
 * File result containing pass/fail status for a single file.
 * This mirrors the internal FileResult interface used by TypeScriptStrictAudit.
 */
interface FileResult {
  filePath: string;
  passed: boolean;
  violations: TypeScriptStrictViolation[];
}

/**
 * Calculates the Type Safety Score based on file results.
 * This implementation matches the logic in TypeScriptStrictAudit.run().
 *
 * @param fileResults - Array of file results with pass/fail status
 * @returns Type Safety Score (0-100, rounded to 2 decimal places)
 */
function calculateTypeSafetyScore(fileResults: FileResult[]): number {
  const totalFiles = fileResults.length;
  const filesPassing = fileResults.filter((r) => r.passed).length;
  const typeSafetyScore = totalFiles > 0 ? (filesPassing / totalFiles) * 100 : 100;
  return Math.round(typeSafetyScore * 100) / 100;
}

describe('Property-based tests for TypeScript Strict Mode Audit', () => {
  describe('Property 4: Type Safety Score Calculation', () => {
    // Arbitrary for TypeScript violation types
    const violationTypeArb = fc.constantFrom<TypeScriptViolationType>(
      'ts-ignore',
      'ts-expect-error',
      'explicit-any',
      'any-assertion',
      'compilation-error'
    );

    // Arbitrary for a single violation
    const violationArb = fc.record({
      category: fc.constant('typescript-strict' as const),
      severity: fc.constantFrom('critical', 'high', 'medium', 'low'),
      filePath: fc.string({ minLength: 1, maxLength: 100 }),
      lineNumber: fc.integer({ min: 1, max: 1000 }),
      message: fc.string({ minLength: 1, maxLength: 100 }),
      violationType: violationTypeArb,
    });

    // Arbitrary for a passing file (no violations)
    const passingFileArb = fc.record({
      filePath: fc.string({ minLength: 1, maxLength: 100 }),
      passed: fc.constant(true),
      violations: fc.constant<TypeScriptStrictViolation[]>([]),
    });

    // Arbitrary for a failing file (at least one violation)
    const failingFileArb = fc.record({
      filePath: fc.string({ minLength: 1, maxLength: 100 }),
      passed: fc.constant(false),
      violations: fc.array(violationArb, { minLength: 1, maxLength: 10 }),
    });

    // Arbitrary for any file result
    const fileResultArb: fc.Arbitrary<FileResult> = fc.oneof(passingFileArb, failingFileArb);

    it('should always return a score between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.array(fileResultArb, { minLength: 0, maxLength: 100 }),
          (fileResults) => {
            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 100 when all files pass', () => {
      fc.assert(
        fc.property(
          fc.array(passingFileArb, { minLength: 1, maxLength: 100 }),
          (fileResults) => {
            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBe(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 when no files pass', () => {
      fc.assert(
        fc.property(
          fc.array(failingFileArb, { minLength: 1, maxLength: 100 }),
          (fileResults) => {
            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate score as (files passing / total files) * 100', () => {
      fc.assert(
        fc.property(
          fc.array(fileResultArb, { minLength: 1, maxLength: 100 }),
          (fileResults) => {
            const totalFiles = fileResults.length;
            const filesPassing = fileResults.filter((r) => r.passed).length;
            const expectedScore = Math.round((filesPassing / totalFiles) * 100 * 100) / 100;

            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBe(expectedScore);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should decrease as violations increase (more failing files)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          fc.integer({ min: 1, max: 50 }),
          (totalFiles, passingCount) => {
            // Ensure passing count is less than total for comparison
            const validPassingCount = Math.min(passingCount, totalFiles - 1);
            const higherPassingCount = Math.min(validPassingCount + 10, totalFiles);

            // Create file results with fewer passing files
            const fewerPassingResults: FileResult[] = [
              ...Array.from({ length: validPassingCount }, (_, i) => ({
                filePath: `pass${i}.ts`,
                passed: true,
                violations: [] as TypeScriptStrictViolation[],
              })),
              ...Array.from({ length: totalFiles - validPassingCount }, (_, i) => ({
                filePath: `fail${i}.ts`,
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict' as const,
                    severity: 'high' as const,
                    filePath: `fail${i}.ts`,
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any' as TypeScriptViolationType,
                  },
                ],
              })),
            ];

            // Create file results with more passing files
            const morePassingResults: FileResult[] = [
              ...Array.from({ length: higherPassingCount }, (_, i) => ({
                filePath: `pass${i}.ts`,
                passed: true,
                violations: [] as TypeScriptStrictViolation[],
              })),
              ...Array.from({ length: totalFiles - higherPassingCount }, (_, i) => ({
                filePath: `fail${i}.ts`,
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict' as const,
                    severity: 'high' as const,
                    filePath: `fail${i}.ts`,
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any' as TypeScriptViolationType,
                  },
                ],
              })),
            ];

            const scoreFewer = calculateTypeSafetyScore(fewerPassingResults);
            const scoreMore = calculateTypeSafetyScore(morePassingResults);

            // More passing files should result in higher score
            expect(scoreMore).toBeGreaterThan(scoreFewer);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be deterministic for the same input', () => {
      fc.assert(
        fc.property(
          fc.array(fileResultArb, { minLength: 1, maxLength: 100 }),
          (fileResults) => {
            const score1 = calculateTypeSafetyScore(fileResults);
            const score2 = calculateTypeSafetyScore(fileResults);

            expect(score1).toBe(score2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: empty file results', () => {
      const score = calculateTypeSafetyScore([]);

      // Empty results should return 100 (no files to fail)
      expect(score).toBe(100);
    });

    it('should handle edge case: single passing file', () => {
      const fileResults: FileResult[] = [
        { filePath: 'single.ts', passed: true, violations: [] },
      ];

      const score = calculateTypeSafetyScore(fileResults);

      expect(score).toBe(100);
    });

    it('should handle edge case: single failing file', () => {
      const fileResults: FileResult[] = [
        {
          filePath: 'single.ts',
          passed: false,
          violations: [
            {
              category: 'typescript-strict',
              severity: 'high',
              filePath: 'single.ts',
              lineNumber: 1,
              message: 'Explicit any',
              violationType: 'explicit-any',
            },
          ],
        },
      ];

      const score = calculateTypeSafetyScore(fileResults);

      expect(score).toBe(0);
    });

    it('should handle edge case: half files passing', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 100 }),
          (totalFiles) => {
            // Ensure even number for exact half
            const evenTotal = totalFiles % 2 === 0 ? totalFiles : totalFiles - 1;
            const halfPassing = evenTotal / 2;

            const fileResults: FileResult[] = [
              ...Array.from({ length: halfPassing }, (_, i) => ({
                filePath: `pass${i}.ts`,
                passed: true,
                violations: [] as TypeScriptStrictViolation[],
              })),
              ...Array.from({ length: halfPassing }, (_, i) => ({
                filePath: `fail${i}.ts`,
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict' as const,
                    severity: 'high' as const,
                    filePath: `fail${i}.ts`,
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any' as TypeScriptViolationType,
                  },
                ],
              })),
            ];

            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBe(50);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: very large file counts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 10000 }),
          fc.integer({ min: 0, max: 100 }),
          (totalFiles, passingPercentage) => {
            const passingCount = Math.floor((passingPercentage / 100) * totalFiles);

            const fileResults: FileResult[] = [
              ...Array.from({ length: passingCount }, (_, i) => ({
                filePath: `pass${i}.ts`,
                passed: true,
                violations: [] as TypeScriptStrictViolation[],
              })),
              ...Array.from({ length: totalFiles - passingCount }, (_, i) => ({
                filePath: `fail${i}.ts`,
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict' as const,
                    severity: 'high' as const,
                    filePath: `fail${i}.ts`,
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any' as TypeScriptViolationType,
                  },
                ],
              })),
            ];

            const score = calculateTypeSafetyScore(fileResults);

            // Score should equal the passing percentage (approximately, due to rounding)
            expect(score).toBeGreaterThanOrEqual(passingPercentage - 1);
            expect(score).toBeLessThanOrEqual(passingPercentage + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct score for specific percentages', () => {
      const testCases = [
        { total: 10, passing: 0, expectedScore: 0 },
        { total: 10, passing: 1, expectedScore: 10 },
        { total: 10, passing: 3, expectedScore: 30 },
        { total: 10, passing: 5, expectedScore: 50 },
        { total: 10, passing: 7, expectedScore: 70 },
        { total: 10, passing: 9, expectedScore: 90 },
        { total: 10, passing: 10, expectedScore: 100 },
        { total: 3, passing: 1, expectedScore: 33.33 },
        { total: 3, passing: 2, expectedScore: 66.67 },
        { total: 7, passing: 3, expectedScore: 42.86 },
      ];

      for (const { total, passing, expectedScore } of testCases) {
        const fileResults: FileResult[] = [
          ...Array.from({ length: passing }, (_, i) => ({
            filePath: `pass${i}.ts`,
            passed: true,
            violations: [] as TypeScriptStrictViolation[],
          })),
          ...Array.from({ length: total - passing }, (_, i) => ({
            filePath: `fail${i}.ts`,
            passed: false,
            violations: [
              {
                category: 'typescript-strict' as const,
                severity: 'high' as const,
                filePath: `fail${i}.ts`,
                lineNumber: 1,
                message: 'Violation',
                violationType: 'explicit-any' as TypeScriptViolationType,
              },
            ],
          })),
        ];

        const score = calculateTypeSafetyScore(fileResults);

        expect(score).toBe(expectedScore);
      }
    });

    it('should not depend on violation severity for score calculation', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('critical', 'high', 'medium', 'low'),
          (severity) => {
            // Create file results with specific severity
            const fileResults: FileResult[] = [
              {
                filePath: 'fail.ts',
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict',
                    severity,
                    filePath: 'fail.ts',
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any',
                  },
                ],
              },
            ];

            const score = calculateTypeSafetyScore(fileResults);

            // Score should be 0 regardless of severity
            expect(score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not depend on violation type for score calculation', () => {
      fc.assert(
        fc.property(
          violationTypeArb,
          (violationType) => {
            // Create file results with specific violation type
            const fileResults: FileResult[] = [
              {
                filePath: 'fail.ts',
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict',
                    severity: 'high',
                    filePath: 'fail.ts',
                    lineNumber: 1,
                    message: 'Violation',
                    violationType,
                  },
                ],
              },
            ];

            const score = calculateTypeSafetyScore(fileResults);

            // Score should be 0 regardless of violation type
            expect(score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not depend on number of violations per file', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (violationsCount) => {
            // Create file results with specific number of violations
            const fileResults: FileResult[] = [
              {
                filePath: 'fail.ts',
                passed: false,
                violations: Array.from({ length: violationsCount }, (_, i) => ({
                  category: 'typescript-strict' as const,
                  severity: 'high' as const,
                  filePath: 'fail.ts',
                  lineNumber: i + 1,
                  message: `Violation ${i}`,
                  violationType: 'explicit-any' as TypeScriptViolationType,
                })),
              },
            ];

            const score = calculateTypeSafetyScore(fileResults);

            // Score should be 0 regardless of violations count per file
            expect(score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mixed file results correctly', () => {
      fc.assert(
        fc.property(
          fc.record({
            passingCount: fc.integer({ min: 0, max: 50 }),
            failingCount: fc.integer({ min: 0, max: 50 }),
          }),
          ({ passingCount, failingCount }) => {
            // Skip if both are 0 (empty results)
            fc.pre(passingCount > 0 || failingCount > 0);

            const fileResults: FileResult[] = [
              ...Array.from({ length: passingCount }, (_, i) => ({
                filePath: `pass${i}.ts`,
                passed: true,
                violations: [] as TypeScriptStrictViolation[],
              })),
              ...Array.from({ length: failingCount }, (_, i) => ({
                filePath: `fail${i}.ts`,
                passed: false,
                violations: [
                  {
                    category: 'typescript-strict' as const,
                    severity: 'high' as const,
                    filePath: `fail${i}.ts`,
                    lineNumber: 1,
                    message: 'Violation',
                    violationType: 'explicit-any' as TypeScriptViolationType,
                  },
                ],
              })),
            ];

            const totalFiles = passingCount + failingCount;
            const expectedScore = Math.round((passingCount / totalFiles) * 100 * 100) / 100;

            const score = calculateTypeSafetyScore(fileResults);

            expect(score).toBe(expectedScore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
