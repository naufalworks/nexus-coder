/**
 * Property-based tests for audit framework types
 * 
 * **Property 11: Violation Report Serialization**
 * **Validates: Requirements 1.5, 21.1**
 * 
 * This test validates that AuditViolation objects can be serialized to JSON
 * and deserialized back without data loss, ensuring all required and optional
 * fields are preserved correctly.
 */

import fc from 'fast-check';
import {
  AuditViolation,
  AuditCategory,
  Severity,
} from './types';

describe('Property-based tests for Audit Framework Types', () => {
  describe('Property 11: Violation Report Serialization', () => {
    // Arbitrary for Severity
    const severityArb = fc.constantFrom<Severity>(
      'critical',
      'high',
      'medium',
      'low'
    );

    // Arbitrary for AuditCategory
    const categoryArb = fc.constantFrom<AuditCategory>(
      'typescript-strict',
      'dead-code',
      'naming-conventions',
      'import-patterns',
      'architecture-compliance',
      'event-bus-patterns',
      'widget-quality',
      'accessibility',
      'keyboard-navigation',
      'render-performance',
      'bundle-size',
      'project-structure',
      'dependency-health',
      'documentation-accuracy',
      'code-comments',
      'security',
      'memory-leaks',
      're-render-optimization',
      'cli-ide-parity',
      'error-handling',
      'test-coverage'
    );

    // Arbitrary for AuditViolation with only required fields
    const violationRequiredArb = fc.record({
      category: categoryArb,
      severity: severityArb,
      filePath: fc.string({ minLength: 1, maxLength: 200 }),
      lineNumber: fc.integer({ min: 1, max: 100000 }),
      message: fc.string({ minLength: 1, maxLength: 500 }),
    });

    // Arbitrary for AuditViolation with optional fields
    const violationWithOptionalsArb = fc.record({
      category: categoryArb,
      severity: severityArb,
      filePath: fc.string({ minLength: 1, maxLength: 200 }),
      lineNumber: fc.integer({ min: 1, max: 100000 }),
      message: fc.string({ minLength: 1, maxLength: 500 }),
      symbolName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      estimatedBytes: fc.option(fc.integer({ min: 0, max: 10000000 }), { nil: undefined }),
    });

    it('should serialize and deserialize violations with required fields only', () => {
      fc.assert(
        fc.property(violationRequiredArb, (violation) => {
          // Serialize to JSON
          const json = JSON.stringify(violation);
          
          // Deserialize back
          const deserialized: AuditViolation = JSON.parse(json);
          
          // Assert all required fields are preserved
          expect(deserialized.category).toBe(violation.category);
          expect(deserialized.severity).toBe(violation.severity);
          expect(deserialized.filePath).toBe(violation.filePath);
          expect(deserialized.lineNumber).toBe(violation.lineNumber);
          expect(deserialized.message).toBe(violation.message);
          
          // Assert optional fields are undefined
          expect(deserialized.symbolName).toBeUndefined();
          expect(deserialized.estimatedBytes).toBeUndefined();
        })
      );
    });

    it('should serialize and deserialize violations with optional fields', () => {
      fc.assert(
        fc.property(violationWithOptionalsArb, (violation) => {
          // Serialize to JSON
          const json = JSON.stringify(violation);
          
          // Deserialize back
          const deserialized: AuditViolation = JSON.parse(json);
          
          // Assert all required fields are preserved
          expect(deserialized.category).toBe(violation.category);
          expect(deserialized.severity).toBe(violation.severity);
          expect(deserialized.filePath).toBe(violation.filePath);
          expect(deserialized.lineNumber).toBe(violation.lineNumber);
          expect(deserialized.message).toBe(violation.message);
          
          // Assert optional fields are preserved when present
          if (violation.symbolName !== undefined) {
            expect(deserialized.symbolName).toBe(violation.symbolName);
          } else {
            expect(deserialized.symbolName).toBeUndefined();
          }
          
          if (violation.estimatedBytes !== undefined) {
            expect(deserialized.estimatedBytes).toBe(violation.estimatedBytes);
          } else {
            expect(deserialized.estimatedBytes).toBeUndefined();
          }
        })
      );
    });

    it('should preserve violation equality after round-trip serialization', () => {
      fc.assert(
        fc.property(violationWithOptionalsArb, (violation) => {
          // Serialize and deserialize
          const json = JSON.stringify(violation);
          const deserialized: AuditViolation = JSON.parse(json);
          
          // Deep equality check
          expect(deserialized).toEqual(violation);
        })
      );
    });

    it('should handle edge cases: empty strings and boundary values', () => {
      const edgeCaseArb = fc.record({
        category: categoryArb,
        severity: severityArb,
        filePath: fc.constantFrom('', 'a', 'x'.repeat(200)),
        lineNumber: fc.constantFrom(1, 100000),
        message: fc.constantFrom('', 'x', 'y'.repeat(500)),
        symbolName: fc.option(fc.constantFrom('', 'fn', 'x'.repeat(100)), { nil: undefined }),
        estimatedBytes: fc.option(fc.constantFrom(0, 1, 10000000), { nil: undefined }),
      });

      fc.assert(
        fc.property(edgeCaseArb, (violation) => {
          const json = JSON.stringify(violation);
          const deserialized: AuditViolation = JSON.parse(json);
          
          expect(deserialized).toEqual(violation);
        })
      );
    });

    it('should handle violations with all categories and severities', () => {
      fc.assert(
        fc.property(
          categoryArb,
          severityArb,
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1 }),
          fc.string({ minLength: 1 }),
          (category, severity, filePath, lineNumber, message) => {
            const violation: AuditViolation = {
              category,
              severity,
              filePath,
              lineNumber,
              message,
            };
            
            const json = JSON.stringify(violation);
            const deserialized: AuditViolation = JSON.parse(json);
            
            expect(deserialized.category).toBe(category);
            expect(deserialized.severity).toBe(severity);
          }
        )
      );
    });

    it('should serialize arrays of violations correctly', () => {
      const violationArrayArb = fc.array(violationWithOptionalsArb, { minLength: 0, maxLength: 100 });

      fc.assert(
        fc.property(violationArrayArb, (violations) => {
          // Serialize array
          const json = JSON.stringify(violations);
          
          // Deserialize back
          const deserialized: AuditViolation[] = JSON.parse(json);
          
          // Assert array length is preserved
          expect(deserialized.length).toBe(violations.length);
          
          // Assert each violation is preserved
          deserialized.forEach((deserializedViolation, index) => {
            expect(deserializedViolation).toEqual(violations[index]);
          });
        })
      );
    });
  });
});
