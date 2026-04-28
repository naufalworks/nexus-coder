/**
 * Unit Tests for Optional Props Audit Module
 *
 * Tests the OptionalPropsAudit module to ensure it correctly identifies
 * optional props used without null/undefined guards.
 */

import * as fs from 'fs';
import * as path from 'path';
import { OptionalPropsAudit, OptionalPropsViolation } from './optional-props';
import type { AuditReport } from '../framework/types';

describe('OptionalPropsAudit', () => {
  let audit: OptionalPropsAudit;
  let tempDir: string;

  beforeEach(() => {
    audit = new OptionalPropsAudit();
    tempDir = path.join(__dirname, '__temp_optional_props_test__');
    
    // Create temp directory for test files
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to get violations as OptionalPropsViolation type.
   */
  function getTypedViolations(report: AuditReport): OptionalPropsViolation[] {
    return report.violations as OptionalPropsViolation[];
  }

  describe('Basic Detection', () => {
    it('should detect optional prop used without guard', async () => {
      const testFile = path.join(tempDir, 'TestComponent.tsx');
      const content = `
interface TestProps {
  required: string;
  optional?: string;
}

function TestComponent(props: TestProps) {
  return <div>{props.optional.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();
      const violations = getTypedViolations(report);

      expect(report.totalViolations).toBeGreaterThan(0);
      expect(violations[0].propName).toBe('optional');
      expect(violations[0].violationType).toBe('missing-null-check');
    });

    it.todo('should not report violation when optional chaining is used - requires guard detection refinement in task 22.2');

    it.todo('should not report violation when nullish coalescing is used - requires guard detection refinement in task 22.2');

    it.todo('should not report violation when logical AND is used - requires guard detection refinement in task 22.2');

    it.todo('should not report violation when if statement guard is used - requires guard detection refinement in task 22.2');
  });

  describe('Type Alias Support', () => {
    it('should detect optional props in type aliases', async () => {
      const testFile = path.join(tempDir, 'TypeAliasComponent.tsx');
      const content = `
type TypeAliasProps = {
  required: string;
  optional?: number;
};

function TypeAliasComponent(props: TypeAliasProps) {
  return <div>{props.optional.toString()}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();
      const violations = getTypedViolations(report);

      expect(report.totalViolations).toBeGreaterThan(0);
      expect(violations[0].propName).toBe('optional');
    });
  });

  describe('Destructured Props', () => {
    it('should detect destructured optional props used without guard', async () => {
      const testFile = path.join(tempDir, 'DestructuredComponent.tsx');
      const content = `
interface DestructuredProps {
  optional?: string;
}

function DestructuredComponent({ optional }: DestructuredProps) {
  return <div>{optional.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();
      const violations = getTypedViolations(report);

      expect(report.totalViolations).toBeGreaterThan(0);
      expect(violations[0].propName).toBe('optional');
    });
  });

  describe('Multiple Optional Props', () => {
    it('should detect multiple violations in same component', async () => {
      const testFile = path.join(tempDir, 'MultipleComponent.tsx');
      const content = `
interface MultipleProps {
  optional1?: string;
  optional2?: number;
  required: boolean;
}

function MultipleComponent(props: MultipleProps) {
  const len = props.optional1.length;
  const doubled = props.optional2 * 2;
  return <div>{len + doubled}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();
      const violations = getTypedViolations(report);

      expect(report.totalViolations).toBeGreaterThanOrEqual(2);
      const propNames = violations.map(v => v.propName);
      expect(propNames).toContain('optional1');
      expect(propNames).toContain('optional2');
    });
  });

  describe('Report Structure', () => {
    it('should generate correct report structure', async () => {
      const testFile = path.join(tempDir, 'ReportComponent.tsx');
      const content = `
interface ReportProps {
  optional?: string;
}

function ReportComponent(props: ReportProps) {
  return <div>{props.optional.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();

      expect(report.category).toBe('typescript-strict');
      expect(report.totalViolations).toBeGreaterThan(0);
      expect(report.violations).toBeInstanceOf(Array);
      expect(report.metrics).toBeDefined();
      expect(report.metrics?.totalFiles).toBe(1);
      expect(report.metrics?.missingGuards).toBeGreaterThan(0);
    });

    it('should include interface name and prop name in violation', async () => {
      const testFile = path.join(tempDir, 'DetailComponent.tsx');
      const content = `
interface DetailProps {
  optionalProp?: string;
}

function DetailComponent(props: DetailProps) {
  return <div>{props.optionalProp.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();
      const violations = getTypedViolations(report);

      expect(violations[0].interfaceName).toBe('DetailProps');
      expect(violations[0].propName).toBe('optionalProp');
      expect(violations[0].usageLineNumber).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with no props interfaces', async () => {
      const testFile = path.join(tempDir, 'NoProps.tsx');
      const content = `
function NoPropsComponent() {
  return <div>Hello</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();

      expect(report.totalViolations).toBe(0);
    });

    it('should handle files with only required props', async () => {
      const testFile = path.join(tempDir, 'RequiredOnly.tsx');
      const content = `
interface RequiredOnlyProps {
  required1: string;
  required2: number;
}

function RequiredOnlyComponent(props: RequiredOnlyProps) {
  return <div>{props.required1.length + props.required2}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();

      expect(report.totalViolations).toBe(0);
    });

    it('should skip test files', async () => {
      const testFile = path.join(tempDir, 'Component.test.tsx');
      const content = `
interface TestProps {
  optional?: string;
}

function TestComponent(props: TestProps) {
  return <div>{props.optional.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
      });

      const report = await customAudit.run();

      // Test files should be excluded by default
      expect(report.totalViolations).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should respect custom srcDirs configuration', async () => {
      const customDir = path.join(tempDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });

      const testFile = path.join(customDir, 'CustomComponent.tsx');
      const content = `
interface CustomProps {
  optional?: string;
}

function CustomComponent(props: CustomProps) {
  return <div>{props.optional.length}</div>;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [customDir],
      });

      const report = await customAudit.run();

      expect(report.totalViolations).toBeGreaterThan(0);
    });

    it('should respect custom extensions configuration', async () => {
      const testFile = path.join(tempDir, 'OnlyTs.ts');
      const content = `
interface OnlyTsProps {
  optional?: string;
}

function onlyTsFunction(props: OnlyTsProps) {
  return props.optional.length;
}
`;
      fs.writeFileSync(testFile, content);

      const customAudit = new OptionalPropsAudit({
        srcDirs: [tempDir],
        extensions: ['.ts'],
      });

      const report = await customAudit.run();

      expect(report.totalViolations).toBeGreaterThan(0);
    });
  });
});
