/**
 * Unused Props Analyzer Unit Tests
 *
 * Tests the UnusedPropsAnalyzer class for correct identification of
 * unused React component props.
 *
 * @module audit/dead-code/unused-props.test
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UnusedPropsAnalyzer } from './unused-props';
import type { UnusedPropsViolation } from './unused-props';

/**
 * Helper to create a temporary directory with test source files.
 */
function createTestProject(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-props-test-'));

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return tmpDir;
}

/**
 * Helper to clean up a temporary directory.
 */
function cleanupTestProject(tmpDir: string): void {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('UnusedPropsAnalyzer', () => {
  describe('basic properties', () => {
    it('should have correct category and name', () => {
      const analyzer = new UnusedPropsAnalyzer();
      expect(analyzer.category).toBe('dead-code');
      expect(analyzer.name).toBe('Unused Props Analyzer');
    });
  });

  describe('unused props detection', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should detect unused props in a React component (Requirement 2.2)', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface ComponentProps {
  usedProp: string;
  unusedProp: number;
}

export const Component: React.FC<ComponentProps> = ({ usedProp }) => {
  return <div>{usedProp}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component usedProp="test" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // Should detect unusedProp as unused
      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Component'
      );

      expect(componentViolation).toBeDefined();
      expect(componentViolation?.unusedPropNames).toContain('unusedProp');
    });

    it('should NOT flag props that are actually passed in JSX', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface ComponentProps {
  name: string;
  value: number;
}

export const Component: React.FC<ComponentProps> = ({ name, value }) => {
  return <div>{name}: {value}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component name="test" value={42} />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // Should NOT flag any props as unused
      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Component'
      );

      expect(componentViolation).toBeUndefined();
    });

    it('should handle components with spread props in JSX', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface ComponentProps {
  name: string;
  value: number;
  optional?: string;
}

export const Component: React.FC<ComponentProps> = ({ name, value, optional }) => {
  return <div>{name}: {value} {optional}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  const props = { name: 'test', value: 42, optional: 'extra' };
  return <Component {...props} />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // Spread props make all props potentially used
      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Component'
      );

      expect(componentViolation).toBeUndefined();
    });

    it('should detect unused props in function declaration components', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

interface MyProps {
  used: string;
  unused: number;
}

export function MyComponent(props: MyProps) {
  return <div>{props.used}</div>;
}
`,
        'src/Consumer.tsx': `
import React from 'react';
import { MyComponent } from './Component';

export const Consumer: React.FC = () => {
  return <MyComponent used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'MyComponent'
      );

      expect(componentViolation).toBeDefined();
      expect(componentViolation?.unusedPropNames).toContain('unused');
    });

    it('should detect unused props in arrow function components', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const Button = (props: ButtonProps) => {
  return <button onClick={props.onClick}>{props.label}</button>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Button } from './Component';

export const Consumer: React.FC = () => {
  return <Button label="Click" onClick={() => {}} />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Button'
      );

      expect(componentViolation).toBeDefined();
      expect(componentViolation?.unusedPropNames).toContain('disabled');
    });

    it('should handle multiple usage sites and aggregate passed props', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface ComponentProps {
  prop1: string;
  prop2: number;
  prop3: boolean;
}

export const Component: React.FC<ComponentProps> = ({ prop1, prop2, prop3 }) => {
  return <div>{prop1} {prop2} {prop3}</div>;
};
`,
        'src/Consumer1.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer1: React.FC = () => {
  return <Component prop1="a" prop2={1} />;
};
`,
        'src/Consumer2.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer2: React.FC = () => {
  return <Component prop1="b" prop3={true} />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // All props are used across different usage sites
      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Component'
      );

      expect(componentViolation).toBeUndefined();
    });

    it('should ignore common props like children, className, style', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface ComponentProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Component: React.FC<ComponentProps> = ({ title, children, className, style }) => {
  return <div className={className} style={style}>{title} {children}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component title="Test" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // children, className, style are ignored by default
      const violations = report.violations as UnusedPropsViolation[];
      const componentViolation = violations.find(
        (v) => v.componentName === 'Component'
      );

      expect(componentViolation).toBeUndefined();
    });
  });

  describe('violation details (Requirement 2.2)', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should include component name in violations', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused: number;
}

export const TestComponent: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { TestComponent } from './Component';

export const Consumer: React.FC = () => {
  return <TestComponent used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as UnusedPropsViolation;
      expect(violation.componentName).toBe('TestComponent');
    });

    it('should include interface name in violations', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface MyComponentProps {
  used: string;
  unused: number;
}

export const MyComponent: React.FC<MyComponentProps> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { MyComponent } from './Component';

export const Consumer: React.FC = () => {
  return <MyComponent used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as UnusedPropsViolation;
      expect(violation.interfaceName).toBe('MyComponentProps');
    });

    it('should include unused prop names in violations', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused1: number;
  unused2: boolean;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as UnusedPropsViolation;
      expect(violation.unusedPropNames).toContain('unused1');
      expect(violation.unusedPropNames).toContain('unused2');
    });

    it('should include file path in violations', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused: number;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0];
      expect(violation.filePath).toBeDefined();
      expect(violation.filePath).toContain('Component.tsx');
    });

    it('should include line number in violations', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused: number;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0];
      expect(violation.lineNumber).toBeGreaterThan(0);
      expect(typeof violation.lineNumber).toBe('number');
    });
  });

  describe('report metrics', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should include total components in metrics', async () => {
      tmpDir = createTestProject({
        'src/Component1.tsx': `
import React from 'react';

export interface Props1 {
  prop: string;
}

export const Component1: React.FC<Props1> = ({ prop }) => {
  return <div>{prop}</div>;
};
`,
        'src/Component2.tsx': `
import React from 'react';

export interface Props2 {
  prop: string;
}

export const Component2: React.FC<Props2> = ({ prop }) => {
  return <div>{prop}</div>;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.totalComponents).toBeGreaterThanOrEqual(2);
    });

    it('should include total unused props count in metrics', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused1: number;
  unused2: boolean;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.totalUnusedProps).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        cleanupTestProject(tmpDir);
      }
    });

    it('should handle an empty source directory', async () => {
      tmpDir = createTestProject({
        'src/empty.tsx': '',
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      expect(report.totalViolations).toBe(0);
      expect(report.category).toBe('dead-code');
    });

    it('should handle a non-existent source directory', async () => {
      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: ['/nonexistent/path'],
      });
      const report = await analyzer.run();

      expect(report).toBeDefined();
      expect(report.category).toBe('dead-code');
    });

    it('should handle components with no props', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export const Component: React.FC = () => {
  return <div>No props</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // No violations for components with no props
      expect(report.totalViolations).toBe(0);
    });

    it('should handle components with no usage sites', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  prop1: string;
  prop2: number;
}

export const UnusedComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  return <div>{prop1} {prop2}</div>;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      // Should report unused props even if component has no usage sites
      expect(report.totalViolations).toBeGreaterThan(0);

      const violation = report.violations[0] as UnusedPropsViolation;
      expect(violation.componentName).toBe('UnusedComponent');
    });

    it('should produce violations with correct category', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused: number;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      for (const violation of report.violations) {
        expect(violation.category).toBe('dead-code');
      }
    });

    it('should produce violations with valid severity levels', async () => {
      tmpDir = createTestProject({
        'src/Component.tsx': `
import React from 'react';

export interface Props {
  used: string;
  unused: number;
}

export const Component: React.FC<Props> = ({ used }) => {
  return <div>{used}</div>;
};
`,
        'src/Consumer.tsx': `
import React from 'react';
import { Component } from './Component';

export const Consumer: React.FC = () => {
  return <Component used="value" />;
};
`,
      });

      const analyzer = new UnusedPropsAnalyzer({
        srcDirs: [path.join(tmpDir, 'src')],
      });
      const report = await analyzer.run();

      const validSeverities = ['critical', 'high', 'medium', 'low'];
      for (const violation of report.violations) {
        expect(validSeverities).toContain(violation.severity);
      }
    });
  });
});
