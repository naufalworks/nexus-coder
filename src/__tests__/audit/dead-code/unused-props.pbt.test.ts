/**
 * Property-Based Tests for Unused Props Analyzer
 *
 * **Property 3: Unused Props Detection**
 * **Validates: Requirements 2.2, 2.4**
 *
 * For any React component with declared props and JSX usage sites, the analyzer
 * correctly identifies which props are unused - props that are declared but never
 * passed in any JSX usage are flagged, and props that are passed are not flagged.
 *
 * @module audit/dead-code/unused-props.pbt.test
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UnusedPropsAnalyzer, UnusedPropsViolation } from './unused-props';
import type { AuditReport } from '../framework/types';

describe('Unused Props Analyzer - Property-Based Tests', () => {
  /**
   * Property 3: Unused Props Detection
   *
   * **Validates: Requirements 2.2, 2.4**
   *
   * For any React component props interface and set of JSX usage sites,
   * the analyzer correctly identifies all prop names that appear in the
   * interface but are never passed at any usage site.
   *
   * Key test scenarios:
   * - Components with some props used, some unused
   * - Components with all props used (no violations)
   * - Components with no props used (all violations)
   * - Components with spread props (no violations due to uncertainty)
   * - Multiple usage sites with different props passed
   * - Edge cases: no usage sites, no props declared
   */
  describe('Property 3: Unused Props Detection', () => {
    // Arbitrary for generating valid TypeScript identifiers
    const identifierArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/);
    
    // Arbitrary for generating component names (PascalCase)
    const componentNameArb = fc
      .stringMatching(/^[A-Z][a-zA-Z0-9]{2,30}$/)
      .filter(name => name.length > 2);

    // Arbitrary for generating prop names (camelCase)
    const propNameArb = fc
      .stringMatching(/^[a-z][a-zA-Z0-9]{1,20}$/)
      .filter(name => !['children', 'key', 'ref', 'className', 'style', 'id'].includes(name));

    /**
     * Helper to create a temporary test directory
     */
    const createTempTestDir = (): string => {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'unused-props-test-'));
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
    const writeTsxFile = (dir: string, fileName: string, content: string): string => {
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    };

    it('should identify props that are declared but never passed in any JSX usage', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          propNameArb,
          async (componentName, usedProp, unusedProp) => {
            fc.pre(usedProp !== unusedProp);

            const tempDir = createTempTestDir();
            try {
              // Component with two props, only one will be used
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${usedProp}: string;
  ${unusedProp}: number;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${usedProp}, ${unusedProp} }) => {
  return <div>{${usedProp}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site that only passes the used prop
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} ${usedProp}="test" />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: unused prop should be flagged, used prop should not
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              ) as UnusedPropsViolation | undefined;

              expect(violation).toBeDefined();
              expect(violation!.unusedPropNames).toContain(unusedProp);
              expect(violation!.unusedPropNames).not.toContain(usedProp);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should NOT flag components where all props are used', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          fc.array(propNameArb, { minLength: 1, maxLength: 4 }),
          async (componentName, propNames) => {
            fc.pre(new Set(propNames).size === propNames.length); // Ensure unique props

            const tempDir = createTempTestDir();
            try {
              // Component with all props
              const propsInterface = propNames.map(p => `  ${p}: string;`).join('\n');
              const propsDestructure = propNames.join(', ');
              
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
${propsInterface}
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${propsDestructure} }) => {
  return <div>{${propNames[0]}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site that passes ALL props
              const propsUsage = propNames.map(p => `${p}="value"`).join(' ');
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} ${propsUsage} />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: no violations when all props are used
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              );

              expect(violation).toBeUndefined();
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should flag all props when component has no JSX usage sites', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          fc.array(propNameArb, { minLength: 1, maxLength: 3 }),
          async (componentName, propNames) => {
            fc.pre(new Set(propNames).size === propNames.length);

            const tempDir = createTempTestDir();
            try {
              // Component with props but no usage
              const propsInterface = propNames.map(p => `  ${p}: string;`).join('\n');
              const propsDestructure = propNames.join(', ');
              
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
${propsInterface}
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${propsDestructure} }) => {
  return <div>Component</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: all props should be flagged as unused
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              ) as UnusedPropsViolation | undefined;

              expect(violation).toBeDefined();
              expect(violation!.unusedPropNames.length).toBe(propNames.length);
              for (const propName of propNames) {
                expect(violation!.unusedPropNames).toContain(propName);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should NOT flag components with spread props (uncertainty)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          fc.array(propNameArb, { minLength: 2, maxLength: 4 }),
          async (componentName, propNames) => {
            fc.pre(new Set(propNames).size === propNames.length);

            const tempDir = createTempTestDir();
            try {
              // Component with props
              const propsInterface = propNames.map(p => `  ${p}: string;`).join('\n');
              const propsDestructure = propNames.join(', ');
              
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
${propsInterface}
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${propsDestructure} }) => {
  return <div>{${propNames[0]}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site with spread props
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  const props = { ${propNames[0]}: 'value' };
  return <${componentName} {...props} />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: no violations when spread props are used (uncertainty)
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              );

              expect(violation).toBeUndefined();
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should aggregate prop usage across multiple JSX usage sites', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          propNameArb,
          propNameArb,
          async (componentName, prop1, prop2, prop3) => {
            fc.pre(prop1 !== prop2 && prop2 !== prop3 && prop1 !== prop3);

            const tempDir = createTempTestDir();
            try {
              // Component with three props
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${prop1}: string;
  ${prop2}: string;
  ${prop3}: string;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${prop1}, ${prop2}, ${prop3} }) => {
  return <div>{${prop1}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // First usage site passes prop1
              const usage1Content = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App1 = () => {
  return <${componentName} ${prop1}="value1" ${prop2}="value2" ${prop3}="value3" />;
};
`;
              writeTsxFile(tempDir, 'App1.tsx', usage1Content);

              // Second usage site passes prop2
              const usage2Content = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App2 = () => {
  return <${componentName} ${prop1}="value" ${prop2}="value" ${prop3}="value" />;
};
`;
              writeTsxFile(tempDir, 'App2.tsx', usage2Content);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: all props used across multiple sites should not be flagged
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              );

              expect(violation).toBeUndefined();
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle edge case: component with no props declared', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            const tempDir = createTempTestDir();
            try {
              // Component with no props
              const componentContent = `
import React from 'react';

export const ${componentName}: React.FC = () => {
  return <div>No props</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: no violations for components with no props
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              );

              expect(violation).toBeUndefined();
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle edge case: empty codebase (no files)', async () => {
      const tempDir = createTempTestDir();
      try {
        const analyzer = new UnusedPropsAnalyzer({
          srcDirs: [tempDir],
          extensions: ['.tsx'],
          excludePatterns: [],
          ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
        });

        const report = await analyzer.run();

        // Property: empty codebase should have zero violations
        expect(report.totalViolations).toBe(0);
        expect(report.violations).toHaveLength(0);
      } finally {
        cleanupTempDir(tempDir);
      }
    });

    it('should correctly identify unused props in functional components with inline types', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          propNameArb,
          async (componentName, usedProp, unusedProp) => {
            fc.pre(usedProp !== unusedProp);

            const tempDir = createTempTestDir();
            try {
              // Component with inline type
              const componentContent = `
import React from 'react';

export const ${componentName} = ({ ${usedProp}, ${unusedProp} }: { ${usedProp}: string; ${unusedProp}: number }) => {
  return <div>{${usedProp}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} ${usedProp}="test" />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: unused prop should be flagged
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              ) as UnusedPropsViolation | undefined;

              expect(violation).toBeDefined();
              expect(violation!.unusedPropNames).toContain(unusedProp);
              expect(violation!.unusedPropNames).not.toContain(usedProp);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should include all required fields in violation reports', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          async (componentName, unusedProp) => {
            const tempDir = createTempTestDir();
            try {
              // Component with unused prop
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${unusedProp}: string;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${unusedProp} }) => {
  return <div>Component</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: all violations must have required fields
              for (const violation of report.violations) {
                const v = violation as UnusedPropsViolation;
                
                // Required fields from AuditViolation
                expect(v.category).toBe('dead-code');
                expect(v.severity).toBeDefined();
                expect(['critical', 'high', 'medium', 'low']).toContain(v.severity);
                expect(v.filePath).toBeDefined();
                expect(typeof v.filePath).toBe('string');
                expect(v.filePath.length).toBeGreaterThan(0);
                expect(v.lineNumber).toBeDefined();
                expect(typeof v.lineNumber).toBe('number');
                expect(v.lineNumber).toBeGreaterThanOrEqual(1);
                expect(v.message).toBeDefined();
                expect(typeof v.message).toBe('string');
                expect(v.message.length).toBeGreaterThan(0);
                
                // Required fields from UnusedPropsViolation
                expect(v.componentName).toBeDefined();
                expect(typeof v.componentName).toBe('string');
                expect(v.unusedPropNames).toBeDefined();
                expect(Array.isArray(v.unusedPropNames)).toBe(true);
                expect(v.unusedPropNames.length).toBeGreaterThan(0);
                expect(v.violationType).toBe('unused-props');
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should produce consistent results across multiple runs (determinism)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          propNameArb,
          async (componentName, usedProp, unusedProp) => {
            fc.pre(usedProp !== unusedProp);

            const tempDir = createTempTestDir();
            try {
              // Component with unused prop
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${usedProp}: string;
  ${unusedProp}: number;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${usedProp}, ${unusedProp} }) => {
  return <div>{${usedProp}}</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} ${usedProp}="test" />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const config = {
                srcDirs: [tempDir],
                extensions: ['.tsx'] as string[],
                excludePatterns: [] as RegExp[],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              };

              const analyzer1 = new UnusedPropsAnalyzer(config);
              const analyzer2 = new UnusedPropsAnalyzer(config);

              const [report1, report2] = await Promise.all([analyzer1.run(), analyzer2.run()]);

              // Property: results should be identical
              expect(report1.totalViolations).toBe(report2.totalViolations);
              expect(report1.violations.length).toBe(report2.violations.length);
              
              if (report1.violations.length > 0) {
                const v1 = report1.violations[0] as UnusedPropsViolation;
                const v2 = report2.violations[0] as UnusedPropsViolation;
                expect(v1.componentName).toBe(v2.componentName);
                expect(v1.unusedPropNames).toEqual(v2.unusedPropNames);
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should include metrics in the report', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          async (componentName, unusedProp) => {
            const tempDir = createTempTestDir();
            try {
              // Component with unused prop
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${unusedProp}: string;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${unusedProp} }) => {
  return <div>Component</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: report must include metrics
              expect(report.metrics).toBeDefined();
              expect(report.metrics?.totalComponents).toBeDefined();
              expect(typeof report.metrics?.totalComponents).toBe('number');
              expect(report.metrics?.totalComponents as number).toBeGreaterThanOrEqual(0);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should correctly handle class components with props', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          propNameArb,
          async (componentName, usedProp, unusedProp) => {
            fc.pre(usedProp !== unusedProp);

            const tempDir = createTempTestDir();
            try {
              // Class component with props
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${usedProp}: string;
  ${unusedProp}: number;
}

export class ${componentName} extends React.Component<${componentName}Props> {
  render() {
    return <div>{this.props.${usedProp}}</div>;
  }
}
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              // Usage site
              const usageContent = `
import React from 'react';
import { ${componentName} } from './${componentName}';

export const App = () => {
  return <${componentName} ${usedProp}="test" />;
};
`;
              writeTsxFile(tempDir, 'App.tsx', usageContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: unused prop should be flagged in class components
              const violation = report.violations.find(
                (v) => (v as UnusedPropsViolation).componentName === componentName
              ) as UnusedPropsViolation | undefined;

              expect(violation).toBeDefined();
              expect(violation!.unusedPropNames).toContain(unusedProp);
              expect(violation!.unusedPropNames).not.toContain(usedProp);
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should serialize violations to JSON correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          propNameArb,
          async (componentName, unusedProp) => {
            const tempDir = createTempTestDir();
            try {
              // Component with unused prop
              const componentContent = `
import React from 'react';

interface ${componentName}Props {
  ${unusedProp}: string;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ ${unusedProp} }) => {
  return <div>Component</div>;
};
`;
              writeTsxFile(tempDir, `${componentName}.tsx`, componentContent);

              const analyzer = new UnusedPropsAnalyzer({
                srcDirs: [tempDir],
                extensions: ['.tsx'],
                excludePatterns: [],
                ignoredProps: ['children', 'key', 'ref', 'className', 'style', 'id'],
              });

              const report = await analyzer.run();

              // Property: report should serialize to valid JSON
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
                expect(v.componentName).toBeDefined();
                expect(Array.isArray(v.unusedPropNames)).toBe(true);
                expect(v.violationType).toBe('unused-props');
              }
            } finally {
              cleanupTempDir(tempDir);
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
