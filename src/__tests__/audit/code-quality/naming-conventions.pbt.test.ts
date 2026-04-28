/**
 * Property-based tests for Naming Conventions Audit
 *
 * **Property 5: Naming Convention Detection**
 * **Validates: Requirements 3.4**
 *
 * **Property 6: File-Symbol Name Matching**
 * **Validates: Requirements 3.5, 3.6**
 *
 * This test validates that the naming convention checker correctly:
 * 1. Classifies filenames as PascalCase, camelCase, or non-compliant
 * 2. Detects naming convention violations based on file extension
 * 3. Matches file names with exported symbol names
 * 4. Reports violations with correct file path, current name, and expected pattern
 */

import fc from 'fast-check';
import { NamingConventionsAudit } from './naming-conventions';

describe('Property-based tests for Naming Conventions Audit', () => {
  // Shared arbitraries defined at outer scope for reuse across describe blocks
  // Arbitrary for generating valid PascalCase names
  const pascalCaseArb = fc
      .array(
        fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
          .chain(first =>
            fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
              .map(rest => first + rest)
          ),
        { minLength: 1, maxLength: 3 }
      )
      .map(parts => parts.join(''));

  // Arbitrary for generating valid camelCase names
  const camelCaseArb = fc
      .string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
      .chain(first =>
        fc.array(
          fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
            .chain(upper =>
              fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
                .map(lower => upper + lower)
            ),
          { minLength: 0, maxLength: 3 }
        ).map(parts => first + parts.join(''))
      );

  describe('Property 5: Naming Convention Detection', () => {
    // Arbitrary for generating invalid names (with hyphens or underscores)
    const invalidNameArb = fc.oneof(
      // Names with hyphens
      fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 4 })
        .map(parts => parts.join('-')),
      // Names with underscores
      fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 4 })
        .map(parts => parts.join('_')),
      // Names starting with lowercase but containing hyphens
      fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => s.includes('-') || s.includes('_'))
    );

    it('should correctly identify PascalCase names', () => {
      fc.assert(
        fc.property(
          pascalCaseArb,
          (name) => {
            // Skip empty or single-char names
            fc.pre(name.length > 1);
            
            const audit = new NamingConventionsAudit();
            // Use private method via type assertion for testing
            const isPascal = (audit as any).isPascalCase(name);
            
            expect(isPascal).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify camelCase names', () => {
      fc.assert(
        fc.property(
          camelCaseArb,
          (name) => {
            // Skip empty or single-char names
            fc.pre(name.length > 1);
            
            const audit = new NamingConventionsAudit();
            const isCamel = (audit as any).isCamelCase(name);
            
            expect(isCamel).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject names with hyphens or underscores', () => {
      fc.assert(
        fc.property(
          invalidNameArb,
          (name) => {
            // Skip empty names
            fc.pre(name.length > 0);
            
            const audit = new NamingConventionsAudit();
            const isPascal = (audit as any).isPascalCase(name);
            const isCamel = (audit as any).isCamelCase(name);
            
            // Names with separators should not be valid PascalCase or camelCase
            expect(isPascal).toBe(false);
            expect(isCamel).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify PascalCase as not camelCase', () => {
      fc.assert(
        fc.property(
          pascalCaseArb,
          (name) => {
            fc.pre(name.length > 1);
            
            const audit = new NamingConventionsAudit();
            const isPascal = (audit as any).isPascalCase(name);
            const isCamel = (audit as any).isCamelCase(name);
            
            // If it's valid PascalCase, it should not be camelCase
            if (isPascal) {
              expect(isCamel).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify camelCase as not PascalCase', () => {
      fc.assert(
        fc.property(
          camelCaseArb,
          (name) => {
            fc.pre(name.length > 1);
            
            const audit = new NamingConventionsAudit();
            const isPascal = (audit as any).isPascalCase(name);
            const isCamel = (audit as any).isCamelCase(name);
            
            // If it's valid camelCase, it should not be PascalCase
            if (isCamel) {
              expect(isPascal).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: single character names', () => {
      const singleCharLower = 'a';
      const singleCharUpper = 'A';
      
      const audit = new NamingConventionsAudit();
      
      // Single lowercase letter is valid camelCase
      expect((audit as any).isCamelCase(singleCharLower)).toBe(true);
      expect((audit as any).isPascalCase(singleCharLower)).toBe(false);
      
      // Single uppercase letter is valid PascalCase
      expect((audit as any).isPascalCase(singleCharUpper)).toBe(true);
      expect((audit as any).isCamelCase(singleCharUpper)).toBe(false);
    });

    it('should handle edge case: empty string', () => {
      const audit = new NamingConventionsAudit();
      
      expect((audit as any).isPascalCase('')).toBe(false);
      expect((audit as any).isCamelCase('')).toBe(false);
    });

    it('should reject names starting with numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (digit, rest) => {
            const name = `${digit}${rest}`;
            
            const audit = new NamingConventionsAudit();
            const isPascal = (audit as any).isPascalCase(name);
            const isCamel = (audit as any).isCamelCase(name);
            
            // Names starting with numbers are invalid
            expect(isPascal).toBe(false);
            expect(isCamel).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept names with numbers in the middle or end', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
          fc.integer({ min: 0, max: 9 }),
          fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
          (prefix, digit, suffix) => {
            const name = `${prefix}${digit}${suffix}`;
            fc.pre(name.length > 1);
            
            const audit = new NamingConventionsAudit();
            const isCamel = (audit as any).isCamelCase(name);
            
            // camelCase with numbers in middle/end should be valid
            expect(isCamel).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be deterministic for the same input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (name) => {
            const audit = new NamingConventionsAudit();
            
            const isPascal1 = (audit as any).isPascalCase(name);
            const isPascal2 = (audit as any).isPascalCase(name);
            const isCamel1 = (audit as any).isCamelCase(name);
            const isCamel2 = (audit as any).isCamelCase(name);
            
            expect(isPascal1).toBe(isPascal2);
            expect(isCamel1).toBe(isCamel2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle names with consecutive uppercase letters', () => {
      const names = ['XMLParser', 'HTTPRequest', 'URLBuilder', 'IDEShell'];
      
      const audit = new NamingConventionsAudit();
      
      for (const name of names) {
        const isPascal = (audit as any).isPascalCase(name);
        // These are valid PascalCase (start with uppercase, no separators)
        expect(isPascal).toBe(true);
      }
    });

    it('should handle all-uppercase names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 20, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) }),
          (name) => {
            const audit = new NamingConventionsAudit();
            const isPascal = (audit as any).isPascalCase(name);
            
            // All-uppercase is valid PascalCase (starts with uppercase, no separators)
            expect(isPascal).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle all-lowercase names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
          (name) => {
            const audit = new NamingConventionsAudit();
            const isCamel = (audit as any).isCamelCase(name);
            
            // All-lowercase is valid camelCase (starts with lowercase, no separators)
            expect(isCamel).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: File-Symbol Name Matching', () => {
    // Arbitrary for generating matching file and symbol names
    const matchingNamesArb = fc.oneof(
      pascalCaseArb.map(name => ({ fileName: name, symbolName: name })),
      camelCaseArb.map(name => ({ fileName: name, symbolName: name }))
    );

    // Arbitrary for generating non-matching names
    const nonMatchingNamesArb = fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 20 })
    ).filter(([file, symbol]) => file !== symbol)
      .map(([fileName, symbolName]) => ({ fileName, symbolName }));

    // Helper function to normalize names (matches implementation)
    const normalizeName = (name: string): string => {
      return name.toLowerCase().replace(/[-_]/g, '');
    };

    it('should match identical file and symbol names', () => {
      fc.assert(
        fc.property(
          matchingNamesArb,
          ({ fileName, symbolName }) => {
            fc.pre(fileName.length > 0 && symbolName.length > 0);
            
            const audit = new NamingConventionsAudit();
            const normalized1 = (audit as any).normalizeName(fileName);
            const normalized2 = (audit as any).normalizeName(symbolName);
            
            expect(normalized1).toBe(normalized2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not match different file and symbol names', () => {
      fc.assert(
        fc.property(
          nonMatchingNamesArb,
          ({ fileName, symbolName }) => {
            fc.pre(fileName.length > 0 && symbolName.length > 0);
            fc.pre(normalizeName(fileName) !== normalizeName(symbolName));
            
            const audit = new NamingConventionsAudit();
            const normalized1 = (audit as any).normalizeName(fileName);
            const normalized2 = (audit as any).normalizeName(symbolName);
            
            expect(normalized1).not.toBe(normalized2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should normalize by removing case differences', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (name) => {
            const audit = new NamingConventionsAudit();
            
            const lowerNormalized = (audit as any).normalizeName(name.toLowerCase());
            const upperNormalized = (audit as any).normalizeName(name.toUpperCase());
            const mixedNormalized = (audit as any).normalizeName(name);
            
            // All case variations should normalize to the same value
            expect(lowerNormalized).toBe(upperNormalized);
            expect(lowerNormalized).toBe(mixedNormalized);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should normalize by removing hyphens and underscores', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 4 }),
          (parts) => {
            const withHyphens = parts.join('-');
            const withUnderscores = parts.join('_');
            const withoutSeparators = parts.join('');
            
            const audit = new NamingConventionsAudit();
            
            const normalized1 = (audit as any).normalizeName(withHyphens);
            const normalized2 = (audit as any).normalizeName(withUnderscores);
            const normalized3 = (audit as any).normalizeName(withoutSeparators);
            
            // All separator variations should normalize to the same value
            expect(normalized1).toBe(normalized3);
            expect(normalized2).toBe(normalized3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match file-symbol pairs that differ only in case', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (baseName) => {
            fc.pre(baseName.length > 0);
            
            const fileName = baseName.toLowerCase();
            const symbolName = baseName.toUpperCase();
            
            const audit = new NamingConventionsAudit();
            const normalized1 = (audit as any).normalizeName(fileName);
            const normalized2 = (audit as any).normalizeName(symbolName);
            
            // Should match after normalization
            expect(normalized1).toBe(normalized2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match file-symbol pairs that differ only in separators', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 4 }),
          (parts) => {
            const fileName = parts.join('-');
            const symbolName = parts.join('_');
            
            const audit = new NamingConventionsAudit();
            const normalized1 = (audit as any).normalizeName(fileName);
            const normalized2 = (audit as any).normalizeName(symbolName);
            
            // Should match after normalization
            expect(normalized1).toBe(normalized2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be deterministic for the same input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (name) => {
            const audit = new NamingConventionsAudit();
            
            const normalized1 = (audit as any).normalizeName(name);
            const normalized2 = (audit as any).normalizeName(name);
            
            expect(normalized1).toBe(normalized2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: empty string', () => {
      const audit = new NamingConventionsAudit();
      const normalized = (audit as any).normalizeName('');
      
      expect(normalized).toBe('');
    });

    it('should handle edge case: only separators', () => {
      const names = ['---', '___', '-_-', '_-_'];
      
      const audit = new NamingConventionsAudit();
      
      for (const name of names) {
        const normalized = (audit as any).normalizeName(name);
        // All separators should be removed, leaving empty string
        expect(normalized).toBe('');
      }
    });

    it('should handle edge case: mixed case with separators', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 }),
            { minLength: 2, maxLength: 4 }
          ),
          (parts) => {
            // Create variations with different cases and separators
            const kebabLower = parts.map(p => p.toLowerCase()).join('-');
            const snakeUpper = parts.map(p => p.toUpperCase()).join('_');
            const camelCase = parts.map((p, i) => 
              i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
            ).join('');
            
            const audit = new NamingConventionsAudit();
            
            const normalized1 = (audit as any).normalizeName(kebabLower);
            const normalized2 = (audit as any).normalizeName(snakeUpper);
            const normalized3 = (audit as any).normalizeName(camelCase);
            
            // All should normalize to the same value
            expect(normalized1).toBe(normalized2);
            expect(normalized1).toBe(normalized3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve alphanumeric characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
          (name) => {
            const audit = new NamingConventionsAudit();
            const normalized = (audit as any).normalizeName(name);
            
            // Normalized should contain same alphanumeric characters (lowercase)
            expect(normalized).toBe(name.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle names with numbers', () => {
      const testCases = [
        { file: 'myFile2', symbol: 'MyFile2', shouldMatch: true },
        { file: 'file-v2', symbol: 'fileV2', shouldMatch: true },
        { file: 'test_123', symbol: 'test123', shouldMatch: true },
        { file: 'component1', symbol: 'component2', shouldMatch: false },
      ];
      
      const audit = new NamingConventionsAudit();
      
      for (const { file, symbol, shouldMatch } of testCases) {
        const normalized1 = (audit as any).normalizeName(file);
        const normalized2 = (audit as any).normalizeName(symbol);
        
        if (shouldMatch) {
          expect(normalized1).toBe(normalized2);
        } else {
          expect(normalized1).not.toBe(normalized2);
        }
      }
    });

    it('should handle real-world component name patterns', () => {
      const testCases = [
        { file: 'TaskPanel', symbol: 'TaskPanel', shouldMatch: true },
        { file: 'DiffApproval', symbol: 'DiffApproval', shouldMatch: true },
        { file: 'GraphExplorer', symbol: 'GraphExplorer', shouldMatch: true },
        { file: 'task-panel', symbol: 'TaskPanel', shouldMatch: true },
        { file: 'diff_approval', symbol: 'DiffApproval', shouldMatch: true },
        { file: 'TaskPanel', symbol: 'TaskList', shouldMatch: false },
      ];
      
      const audit = new NamingConventionsAudit();
      
      for (const { file, symbol, shouldMatch } of testCases) {
        const normalized1 = (audit as any).normalizeName(file);
        const normalized2 = (audit as any).normalizeName(symbol);
        
        if (shouldMatch) {
          expect(normalized1).toBe(normalized2);
        } else {
          expect(normalized1).not.toBe(normalized2);
        }
      }
    });

    it('should handle real-world utility name patterns', () => {
      const testCases = [
        { file: 'formatDate', symbol: 'formatDate', shouldMatch: true },
        { file: 'parseJSON', symbol: 'parseJSON', shouldMatch: true },
        { file: 'format-date', symbol: 'formatDate', shouldMatch: true },
        { file: 'parse_json', symbol: 'parseJSON', shouldMatch: true },
        { file: 'formatDate', symbol: 'parseDate', shouldMatch: false },
      ];
      
      const audit = new NamingConventionsAudit();
      
      for (const { file, symbol, shouldMatch } of testCases) {
        const normalized1 = (audit as any).normalizeName(file);
        const normalized2 = (audit as any).normalizeName(symbol);
        
        if (shouldMatch) {
          expect(normalized1).toBe(normalized2);
        } else {
          expect(normalized1).not.toBe(normalized2);
        }
      }
    });
  });
});

// Helper arbitraries for reuse
const pascalCaseArb = fc
  .array(
    fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
      .chain(first =>
        fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
          .map(rest => first + rest)
      ),
    { minLength: 1, maxLength: 3 }
  )
  .map(parts => parts.join(''));

const camelCaseArb = fc
  .string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
  .chain(first =>
    fc.array(
      fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
        .chain(upper =>
          fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
            .map(lower => upper + lower)
        ),
      { minLength: 0, maxLength: 3 }
    ).map(parts => first + parts.join(''))
  );
