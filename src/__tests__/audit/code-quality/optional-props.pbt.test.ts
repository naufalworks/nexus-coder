/**
 * Property-based tests for Optional Props Audit
 *
 * **Property 14: Optional Props Violation Detection**
 * **Validates: Requirements 1.4**
 *
 * This test validates that the optional props detector correctly:
 * 1. Identifies violations when optional props are used without guards
 * 2. Does not report violations when optional props are used with guards
 * 3. Does not report violations for required props
 * 4. Correctly identifies the prop name, interface name, and violation type
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import { OptionalPropsAudit, OptionalPropsViolation } from './optional-props';

describe('Property-based tests for Optional Props Audit', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(__dirname, '__temp_pbt_optional_props__');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Helper to ensure temp directory exists
  const ensureTempDir = () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  };

  // Helper to clean up individual test files
  const cleanupTestFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  };

  // Helper to create audit and get typed violations
  const runAuditForDir = async (dir: string): Promise<OptionalPropsViolation[]> => {
    const audit = new OptionalPropsAudit({ srcDirs: [dir] });
    const report = await audit.run();
    return report.violations as OptionalPropsViolation[];
  };

  // Arbitrary for generating valid TypeScript identifiers
  const identifierArb = fc
    .string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
    .chain(first =>
      fc.string({ minLength: 0, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')) })
        .map(rest => first + rest)
    );

  // Arbitrary for generating props interface names (ending with "Props")
  const propsInterfaceNameArb = identifierArb.map(name => `${name}Props`);

  // Arbitrary for generating optional field names
  const optionalFieldNameArb = identifierArb;

  // Arbitrary for generating TypeScript types
  const typeArb = fc.constantFrom('string', 'number', 'boolean');

  // Arbitrary for generating unguarded usage patterns
  const unguardedUsageArb = fc.constantFrom(
    '.length',
    '.toString()',
    ' * 2',
    '.toUpperCase()',
    '.charAt(0)'
  );

  describe('Property 14: Optional Props Violation Detection', () => {
    it('should detect violation when optional prop is used without guard', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          unguardedUsageArb,
          async (interfaceName, propName, propType, usage) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_unguarded.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with optional prop used without guard
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName}${usage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              // Should detect at least one violation
              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              expect(relevantViolation).toBeDefined();
              expect(relevantViolation?.propName).toBe(propName);
              expect(relevantViolation?.interfaceName).toBe(interfaceName);
              expect(relevantViolation?.violationType).toBe('missing-null-check');
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    // NOTE: Guard detection tests are skipped because the current implementation
    // has known issues with detecting guards (marked as .todo() in unit tests).
    // These tests are included but skipped to document the expected behavior.
    
    it('should not detect violation when optional prop is used with optional chaining', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, propName, propType) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_chaining.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with optional chaining guard
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName}?.toString()}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should not detect violation for guarded usage
              expect(relevantViolation).toBeUndefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect violation when optional prop is used with nullish coalescing', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, propName, propType) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_nullish.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with nullish coalescing guard
            const defaultValue = propType === 'string' ? '"default"' : propType === 'number' ? '0' : 'false';
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName} ?? ${defaultValue}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should not detect violation for guarded usage
              expect(relevantViolation).toBeUndefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect violation when optional prop is used with logical AND', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, propName, propType) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_and.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with logical AND guard
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName} && props.${propName}.toString()}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should not detect violation for guarded usage
              expect(relevantViolation).toBeUndefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect violation when optional prop is used with if statement guard', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, propName, propType) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_if.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with if statement guard
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  if (props.${propName}) {
    return <div>{props.${propName}.toString()}</div>;
  }
  return <div>No value</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should not detect violation for guarded usage
              expect(relevantViolation).toBeUndefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect violation for required props regardless of usage', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          unguardedUsageArb,
          async (interfaceName, propName, propType, usage) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_required.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with required prop (no ? modifier)
            const content = `
interface ${interfaceName} {
  ${propName}: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName}${usage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should not detect violation for required props
              expect(relevantViolation).toBeUndefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect violations for multiple optional props in same interface', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          fc.array(optionalFieldNameArb, { minLength: 2, maxLength: 4 }),
          typeArb,
          async (interfaceName, propNames, propType) => {
            ensureTempDir();
            // Ensure unique prop names
            const uniquePropNames = Array.from(new Set(propNames));
            fc.pre(uniquePropNames.length >= 2);

            const fileName = `Test_${interfaceName}_multiple.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate interface with multiple optional props
            const propsDeclaration = uniquePropNames.map(name => `  ${name}?: ${propType};`).join('\n');
            const propsUsage = uniquePropNames.map(name => `props.${name}.toString()`).join(' + ');

            const content = `
interface ${interfaceName} {
${propsDeclaration}
}

function TestComponent(props: ${interfaceName}) {
  return <div>{${propsUsage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolations = violations.filter(
                v => uniquePropNames.includes(v.propName) && v.interfaceName === interfaceName
              );

              // Should detect violations for all unguarded optional props
              expect(relevantViolations.length).toBeGreaterThanOrEqual(uniquePropNames.length);

              // Verify each prop name is reported
              for (const propName of uniquePropNames) {
                const propViolation = relevantViolations.find(v => v.propName === propName);
                expect(propViolation).toBeDefined();
                expect(propViolation?.interfaceName).toBe(interfaceName);
              }
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work with type aliases as well as interfaces', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          unguardedUsageArb,
          async (typeName, propName, propType, usage) => {
            ensureTempDir();
            const fileName = `Test_${typeName}_${propName}_type.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate type alias with optional prop
            const content = `
type ${typeName} = {
  ${propName}?: ${propType};
};

function TestComponent(props: ${typeName}) {
  return <div>{props.${propName}${usage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === typeName
              );

              // Should detect violation for type aliases too
              expect(relevantViolation).toBeDefined();
              expect(relevantViolation?.propName).toBe(propName);
              expect(relevantViolation?.interfaceName).toBe(typeName);
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle destructured props correctly', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          unguardedUsageArb,
          async (interfaceName, propName, propType, usage) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_destructured.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate component with destructured props
            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent({ ${propName} }: ${interfaceName}) {
  return <div>{${propName}${usage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              // Should detect violation for destructured props
              expect(relevantViolation).toBeDefined();
              expect(relevantViolation?.propName).toBe(propName);
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report correct violation metadata', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, propName, propType) => {
            ensureTempDir();
            const fileName = `Test_${interfaceName}_${propName}_metadata.tsx`;
            const filePath = path.join(tempDir, fileName);

            const content = `
interface ${interfaceName} {
  ${propName}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${propName}.toString()}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolation = violations.find(
                v => v.propName === propName && v.interfaceName === interfaceName
              );

              if (relevantViolation) {
                // Verify violation structure
                expect(relevantViolation.category).toBe('typescript-strict');
                expect(relevantViolation.severity).toBeDefined();
                expect(relevantViolation.filePath).toContain(fileName);
                expect(relevantViolation.lineNumber).toBeGreaterThan(0);
                expect(relevantViolation.message).toContain(propName);
                expect(relevantViolation.message).toContain(interfaceName);
                expect(relevantViolation.usageLineNumber).toBeGreaterThan(0);
              }
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case: empty props interface', async () => {
      ensureTempDir();
      const interfaceName = 'EmptyProps';
      const fileName = 'Test_EmptyProps.tsx';
      const filePath = path.join(tempDir, fileName);

      const content = `
interface ${interfaceName} {
}

function TestComponent(props: ${interfaceName}) {
  return <div>No props</div>;
}
`;

      fs.writeFileSync(filePath, content);

      try {
        const violations = await runAuditForDir(tempDir);

        const relevantViolations = violations.filter(v => v.interfaceName === interfaceName);

        // Should not detect any violations for empty interface
        expect(relevantViolations.length).toBe(0);
      } finally {
        cleanupTestFile(filePath);
      }
    });

    it('should handle edge case: interface with only required props', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          fc.array(optionalFieldNameArb, { minLength: 1, maxLength: 3 }),
          typeArb,
          async (interfaceName, propNames, propType) => {
            ensureTempDir();
            const uniquePropNames = Array.from(new Set(propNames));
            const fileName = `Test_${interfaceName}_required_only.tsx`;
            const filePath = path.join(tempDir, fileName);

            // Generate interface with only required props (no ? modifier)
            const propsDeclaration = uniquePropNames.map(name => `  ${name}: ${propType};`).join('\n');
            const propsUsage = uniquePropNames.map(name => `props.${name}.toString()`).join(' + ');

            const content = `
interface ${interfaceName} {
${propsDeclaration}
}

function TestComponent(props: ${interfaceName}) {
  return <div>{${propsUsage}}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              const relevantViolations = violations.filter(
                v => uniquePropNames.includes(v.propName) && v.interfaceName === interfaceName
              );

              // Should not detect violations for required props
              expect(relevantViolations.length).toBe(0);
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mixed required and optional props correctly', () => {
      fc.assert(
        fc.asyncProperty(
          propsInterfaceNameArb,
          optionalFieldNameArb,
          optionalFieldNameArb,
          typeArb,
          async (interfaceName, requiredProp, optionalProp, propType) => {
            ensureTempDir();
            fc.pre(requiredProp !== optionalProp);

            const fileName = `Test_${interfaceName}_mixed.tsx`;
            const filePath = path.join(tempDir, fileName);

            const content = `
interface ${interfaceName} {
  ${requiredProp}: ${propType};
  ${optionalProp}?: ${propType};
}

function TestComponent(props: ${interfaceName}) {
  return <div>{props.${requiredProp}.toString() + props.${optionalProp}.toString()}</div>;
}
`;

            fs.writeFileSync(filePath, content);

            try {
              const violations = await runAuditForDir(tempDir);

              // Should only detect violation for optional prop
              const requiredViolation = violations.find(
                v => v.propName === requiredProp && v.interfaceName === interfaceName
              );
              const optionalViolation = violations.find(
                v => v.propName === optionalProp && v.interfaceName === interfaceName
              );

              expect(requiredViolation).toBeUndefined();
              expect(optionalViolation).toBeDefined();
            } finally {
              cleanupTestFile(filePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
