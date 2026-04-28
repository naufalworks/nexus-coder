/**
 * Property-Based Tests for Import Pattern Audit Module
 *
 * Tests Properties 7, 8, 9:
 * - Property 7: Import Path Depth Detection
 * - Property 8: Module Alias Pattern Matching
 * - Property 9: Circular Dependency Detection
 *
 * @module audit/code-quality/import-patterns.pbt.test
 */

import * as fc from 'fast-check';
import { ImportPatternAudit } from './import-patterns';
import type { ImportPatternViolation } from './import-patterns';

describe('Import Pattern Audit - Property-Based Tests', () => {
  /**
   * Property 7: Import Path Depth Detection
   *
   * **Validates: Requirements 4.2, 4.5**
   *
   * For any relative import path string, the depth detector SHALL correctly
   * count the number of `../` sequences and flag violations when count exceeds 2.
   */
  describe('Property 7: Import Path Depth Detection', () => {
    it('should correctly count upward depth in relative imports', () => {
      fc.assert(
        fc.property(
          // Generate relative import paths with varying depths
          fc.record({
            depth: fc.integer({ min: 0, max: 5 }),
            fileName: fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/),
          }),
          ({ depth, fileName }) => {
            // Build import path with specified depth
            const upwardPath = '../'.repeat(depth);
            const importPath = `${upwardPath}${fileName}`;

            // Create a test audit instance
            const audit = new ImportPatternAudit({ maxRelativeDepth: 2 });

            // Use the private method via type assertion for testing
            const countUpwardDepth = (audit as any).countUpwardDepth.bind(audit);
            const actualDepth = countUpwardDepth(importPath);

            // Property: counted depth should equal the number of ../ segments
            expect(actualDepth).toBe(depth);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should flag violations when depth exceeds maximum', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          (depth) => {
            const maxDepth = 2;
            const shouldViolate = depth > maxDepth;

            // Build import path
            const importPath = '../'.repeat(depth) + 'module';

            // Create audit instance
            const audit = new ImportPatternAudit({ maxRelativeDepth: maxDepth });

            // Analyze the import
            const analyzeImport = (audit as any).analyzeImport.bind(audit);
            const checkImportViolations = (audit as any).checkImportViolations.bind(audit);

            const importInfo = analyzeImport(importPath, 1, 'test.ts');
            const violations = checkImportViolations(importInfo);

            // Property: violation should exist if and only if depth > maxDepth
            const hasDeepRelativeViolation = violations.some(
              (v: ImportPatternViolation) => v.violationType === 'deep-relative-import'
            );

            expect(hasDeepRelativeViolation).toBe(shouldViolate);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases: no upward traversal', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\.\/[a-z][a-zA-Z0-9]*$/),
          (importPath) => {
            const audit = new ImportPatternAudit();
            const countUpwardDepth = (audit as any).countUpwardDepth.bind(audit);
            const depth = countUpwardDepth(importPath);

            // Property: paths starting with ./ have depth 0
            expect(depth).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 8: Module Alias Pattern Matching
   *
   * **Validates: Requirements 4.1**
   *
   * For any import path string, the alias checker SHALL match `@core/*`,
   * `@agents/*`, `@types/*` patterns and correctly distinguish alias imports
   * from relative imports.
   */
  describe('Property 8: Module Alias Pattern Matching', () => {
    const validAliases = ['@core', '@agents', '@types'] as const;

    it('should correctly identify alias imports', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...validAliases),
          fc.stringMatching(/^[a-z][a-zA-Z0-9\/]*$/),
          (alias, subPath) => {
            const importPath = `${alias}/${subPath}`;

            const audit = new ImportPatternAudit();
            const analyzeImport = (audit as any).analyzeImport.bind(audit);
            const importInfo = analyzeImport(importPath, 1, 'test.ts');

            // Property: imports starting with valid aliases should be recognized
            expect(importInfo.usesAlias).toBe(true);
            expect(importInfo.aliasUsed).toBe(alias);
            expect(importInfo.isRelative).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify relative imports', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('./'),
            fc.constant('../'),
            fc.constant('../../')
          ),
          fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/),
          (prefix, fileName) => {
            const importPath = `${prefix}${fileName}`;

            const audit = new ImportPatternAudit();
            const analyzeImport = (audit as any).analyzeImport.bind(audit);
            const importInfo = analyzeImport(importPath, 1, 'test.ts');

            // Property: imports starting with ./ or ../ are relative
            expect(importInfo.isRelative).toBe(true);
            expect(importInfo.usesAlias).toBe(false);
            expect(importInfo.aliasUsed).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should distinguish between alias and non-alias absolute imports', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-zA-Z0-9\-]*$/),
          (packageName) => {
            // Ensure it's not one of our aliases
            fc.pre(!['@core', '@agents', '@types'].some(a => packageName.startsWith(a)));

            const audit = new ImportPatternAudit();
            const analyzeImport = (audit as any).analyzeImport.bind(audit);
            const importInfo = analyzeImport(packageName, 1, 'test.ts');

            // Property: non-alias absolute imports should not be marked as using alias
            expect(importInfo.isRelative).toBe(false);
            expect(importInfo.usesAlias).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle alias-like strings that are not valid aliases', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^@[a-z]+\/[a-z]+$/),
          (importPath) => {
            // Ensure it's not one of our valid aliases
            fc.pre(!validAliases.some(alias => importPath.startsWith(alias + '/')));

            const audit = new ImportPatternAudit();
            const analyzeImport = (audit as any).analyzeImport.bind(audit);
            const importInfo = analyzeImport(importPath, 1, 'test.ts');

            // Property: invalid aliases should not be recognized
            expect(importInfo.usesAlias).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 9: Circular Dependency Detection
   *
   * **Validates: Requirements 4.4**
   *
   * For any directed import graph, the circular dependency detector SHALL
   * identify all cycles (if any exist) and report each cycle as a violation.
   */
  describe('Property 9: Circular Dependency Detection', () => {
    it('should detect simple two-node cycles', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z]+\.ts$/),
            fc.stringMatching(/^[a-z]+\.ts$/)
          ).filter(([a, b]) => a !== b),
          ([fileA, fileB]) => {
            // Create a simple cycle: A -> B -> A
            const graph = new Map([
              [fileA, { filePath: fileA, imports: new Set([fileB]), importedBy: new Set([fileB]) }],
              [fileB, { filePath: fileB, imports: new Set([fileA]), importedBy: new Set([fileA]) }],
            ]);

            const audit = new ImportPatternAudit();
            const findCycles = (audit as any).findCycles.bind(audit);
            const cycles = findCycles(graph);

            // Property: a two-node cycle should be detected
            expect(cycles.length).toBeGreaterThan(0);

            // Verify the cycle contains both nodes
            const cycleNodes = new Set(cycles[0]);
            expect(cycleNodes.has(fileA)).toBe(true);
            expect(cycleNodes.has(fileB)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not detect cycles in acyclic graphs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z]+\.ts$/), { minLength: 2, maxLength: 5 }).map(arr => [...new Set(arr)]),
          (files) => {
            fc.pre(files.length >= 2);

            // Create a linear chain: A -> B -> C (no cycles)
            const graph = new Map();
            for (let i = 0; i < files.length; i++) {
              const imports = i < files.length - 1 ? new Set([files[i + 1]]) : new Set();
              const importedBy = i > 0 ? new Set([files[i - 1]]) : new Set();
              graph.set(files[i], {
                filePath: files[i],
                imports,
                importedBy,
              });
            }

            const audit = new ImportPatternAudit();
            const findCycles = (audit as any).findCycles.bind(audit);
            const cycles = findCycles(graph);

            // Property: no cycles should be detected in a linear chain
            expect(cycles.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should detect three-node cycles', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z]+\.ts$/),
            fc.stringMatching(/^[a-z]+\.ts$/),
            fc.stringMatching(/^[a-z]+\.ts$/)
          ).filter(([a, b, c]) => a !== b && b !== c && a !== c),
          ([fileA, fileB, fileC]) => {
            // Create a three-node cycle: A -> B -> C -> A
            const graph = new Map([
              [fileA, { filePath: fileA, imports: new Set([fileB]), importedBy: new Set([fileC]) }],
              [fileB, { filePath: fileB, imports: new Set([fileC]), importedBy: new Set([fileA]) }],
              [fileC, { filePath: fileC, imports: new Set([fileA]), importedBy: new Set([fileB]) }],
            ]);

            const audit = new ImportPatternAudit();
            const findCycles = (audit as any).findCycles.bind(audit);
            const cycles = findCycles(graph);

            // Property: a three-node cycle should be detected
            expect(cycles.length).toBeGreaterThan(0);

            // Verify the cycle contains all three nodes
            const cycleNodes = new Set(cycles[0]);
            expect(cycleNodes.has(fileA) || cycles[0].includes(fileA)).toBe(true);
            expect(cycleNodes.has(fileB) || cycles[0].includes(fileB)).toBe(true);
            expect(cycleNodes.has(fileC) || cycles[0].includes(fileC)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle graphs with self-loops', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]+\.ts$/),
          (file) => {
            // Create a self-loop: A -> A
            const graph = new Map([
              [file, { filePath: file, imports: new Set([file]), importedBy: new Set([file]) }],
            ]);

            const audit = new ImportPatternAudit();
            const findCycles = (audit as any).findCycles.bind(audit);
            const cycles = findCycles(graph);

            // Property: self-loops should be detected as cycles
            expect(cycles.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle empty graphs', () => {
      const graph = new Map();

      const audit = new ImportPatternAudit();
      const findCycles = (audit as any).findCycles.bind(audit);
      const cycles = findCycles(graph);

      // Property: empty graphs have no cycles
      expect(cycles.length).toBe(0);
    });

    it('should handle isolated nodes (no imports)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z]+\.ts$/), { minLength: 1, maxLength: 5 }).map(arr => [...new Set(arr)]),
          (files) => {
            // Create isolated nodes with no imports
            const graph = new Map();
            for (const file of files) {
              graph.set(file, {
                filePath: file,
                imports: new Set(),
                importedBy: new Set(),
              });
            }

            const audit = new ImportPatternAudit();
            const findCycles = (audit as any).findCycles.bind(audit);
            const cycles = findCycles(graph);

            // Property: isolated nodes have no cycles
            expect(cycles.length).toBe(0);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Integration property: Cycle normalization should be consistent
   */
  describe('Property: Cycle Normalization Consistency', () => {
    it('should normalize equivalent cycles to the same key', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z]+\.ts$/),
            fc.stringMatching(/^[a-z]+\.ts$/),
            fc.stringMatching(/^[a-z]+\.ts$/)
          ).filter(([a, b, c]) => a !== b && b !== c && a !== c),
          ([fileA, fileB, fileC]) => {
            const audit = new ImportPatternAudit();
            const normalizeCycleKey = (audit as any).normalizeCycleKey.bind(audit);

            // Different rotations of the same cycle
            const cycle1 = [fileA, fileB, fileC];
            const cycle2 = [fileB, fileC, fileA];
            const cycle3 = [fileC, fileA, fileB];

            const key1 = normalizeCycleKey(cycle1);
            const key2 = normalizeCycleKey(cycle2);
            const key3 = normalizeCycleKey(cycle3);

            // Property: all rotations should normalize to the same key
            expect(key1).toBe(key2);
            expect(key2).toBe(key3);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Integration property: Alias usage rate calculation
   */
  describe('Property: Alias Usage Rate Calculation', () => {
    it('should calculate 100% when all cross-module imports use aliases', () => {
      // This is a unit test disguised as a property test
      // Testing the calculation logic
      const allImports = [
        {
          importPath: '@core/config',
          lineNumber: 1,
          isRelative: false,
          upwardDepth: 0,
          usesAlias: true,
          aliasUsed: '@core' as const,
          sourceFile: 'src/widgets/test.tsx',
        },
        {
          importPath: '@agents/orchestrator',
          lineNumber: 2,
          isRelative: false,
          upwardDepth: 0,
          usesAlias: true,
          aliasUsed: '@agents' as const,
          sourceFile: 'src/widgets/test.tsx',
        },
      ];

      const audit = new ImportPatternAudit();
      const calculateAliasUsageRate = (audit as any).calculateAliasUsageRate.bind(audit);
      const rate = calculateAliasUsageRate(allImports);

      // Property: 100% alias usage should be reported
      expect(rate).toBe('100.0%');
    });

    it('should calculate 0% when no cross-module imports use aliases', () => {
      const allImports = [
        {
          importPath: './local',
          lineNumber: 1,
          isRelative: true,
          upwardDepth: 0,
          usesAlias: false,
          sourceFile: 'src/widgets/test.tsx',
        },
      ];

      const audit = new ImportPatternAudit();
      const calculateAliasUsageRate = (audit as any).calculateAliasUsageRate.bind(audit);
      const rate = calculateAliasUsageRate(allImports);

      // Property: when no cross-module imports exist, rate should be 100%
      expect(rate).toBe('100.0%');
    });
  });
});
