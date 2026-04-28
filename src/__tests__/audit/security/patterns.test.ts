/**
 * Security Pattern Checker Tests
 *
 * Unit tests for the security pattern checker module.
 * Validates detection of security vulnerabilities across the codebase.
 */

import { SecurityPatternChecker, SecurityViolation } from './patterns';
import * as fs from 'fs';
import * as path from 'path';

describe('SecurityPatternChecker', () => {
  let checker: SecurityPatternChecker;

  beforeEach(() => {
    checker = new SecurityPatternChecker();
  });

  describe('Module Interface', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('security');
      expect(checker.name).toBe('Security Pattern Checker');
      expect(typeof checker.run).toBe('function');
    });

    it('should return a valid audit report', async () => {
      const report = await checker.run();

      expect(report).toHaveProperty('category', 'security');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('metrics');
      expect(Array.isArray(report.violations)).toBe(true);
    });
  });

  describe('dangerouslySetInnerHTML Detection (Requirement 16.1)', () => {
    it('should detect dangerouslySetInnerHTML without sanitization', async () => {
      // Create a temporary test file
      const testDir = path.join(__dirname, '__test-fixtures__');
      const testFile = path.join(testDir, 'dangerous-html.tsx');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const dangerousCode = `
import React from 'react';

export const UnsafeComponent = ({ html }: { html: string }) => {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};
`;

      fs.writeFileSync(testFile, dangerousCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const dangerousHTMLViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'dangerouslySetInnerHTML'
        );

        expect(dangerousHTMLViolations.length).toBeGreaterThan(0);
        expect(dangerousHTMLViolations[0].severity).toBe('critical');
        expect(dangerousHTMLViolations[0].message).toContain('dangerouslySetInnerHTML');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });

    it('should not flag dangerouslySetInnerHTML when sanitization is present', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__');
      const testFile = path.join(testDir, 'safe-html.tsx');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const safeCode = `
import React from 'react';
import DOMPurify from 'dompurify';

export const SafeComponent = ({ html }: { html: string }) => {
  const sanitized = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
};
`;

      fs.writeFileSync(testFile, safeCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const dangerousHTMLViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'dangerouslySetInnerHTML'
        );

        // Should still detect it but mark as having sanitization
        if (dangerousHTMLViolations.length > 0) {
          expect((dangerousHTMLViolations[0] as SecurityViolation).hasSanitization).toBe(true);
        }
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Hardcoded Secrets Detection (Requirement 16.6)', () => {
    it('should detect hardcoded API keys', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__');
      const testFile = path.join(testDir, 'hardcoded-secret.ts');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const secretCode = `
const API_KEY = "sk-1234567890abcdef";
const SECRET = "my-secret-key";
`;

      fs.writeFileSync(testFile, secretCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const secretViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'hardcoded-secret'
        );

        expect(secretViolations.length).toBeGreaterThan(0);
        expect(secretViolations[0].severity).toBe('critical');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });

    it('should not flag placeholder or example keys', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__');
      const testFile = path.join(testDir, 'example-key.ts');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const exampleCode = `
const API_KEY = "your_api_key_here";
const SECRET = "example-secret";
const TOKEN = "test-token";
`;

      fs.writeFileSync(testFile, exampleCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const secretViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'hardcoded-secret'
        );

        // Should not flag placeholders
        expect(secretViolations.length).toBe(0);
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Stack Trace Exposure Detection (Requirement 16.5)', () => {
    it('should detect stack trace exposure in CLI code', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__');
      const cliDir = path.join(testDir, 'cli');
      const testFile = path.join(cliDir, 'commands.ts');

      if (!fs.existsSync(cliDir)) {
        fs.mkdirSync(cliDir, { recursive: true });
      }

      const cliCode = `
export function handleError(error: Error) {
  console.error('Error:', error.stack);
  process.exit(1);
}
`;

      fs.writeFileSync(testFile, cliCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const stackTraceViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'stack-trace-exposure'
        );

        expect(stackTraceViolations.length).toBeGreaterThan(0);
        expect(stackTraceViolations[0].severity).toBe('medium');
        expect(stackTraceViolations[0].message).toContain('stack trace');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(cliDir)) {
          fs.rmdirSync(cliDir);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Sensitive Data Rendering Detection (Requirement 16.4)', () => {
    it('should detect sensitive data rendering in ResourceFooter', async () => {
      const testDir = path.join(__dirname, '__test-fixtures__');
      const testFile = path.join(testDir, 'ResourceFooter.tsx');

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const footerCode = `
import React from 'react';

export const ResourceFooter = ({ apiKey }: { apiKey: string }) => {
  return <div>API Key: {apiKey}</div>;
};
`;

      fs.writeFileSync(testFile, footerCode);

      try {
        const customChecker = new SecurityPatternChecker({
          srcDirs: [testDir],
          excludePatterns: [],
        });

        const report = await customChecker.run();
        const sensitiveDataViolations = report.violations.filter(
          (v) => (v as SecurityViolation).violationType === 'sensitive-data-render'
        );

        expect(sensitiveDataViolations.length).toBeGreaterThan(0);
        expect(sensitiveDataViolations[0].severity).toBe('critical');
        expect(sensitiveDataViolations[0].message).toContain('sensitive data');
      } finally {
        // Cleanup
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });
  });

  describe('Report Metrics', () => {
    it('should include severity counts in metrics', async () => {
      const report = await checker.run();

      expect(report.metrics).toHaveProperty('criticalCount');
      expect(report.metrics).toHaveProperty('highCount');
      expect(report.metrics).toHaveProperty('mediumCount');
      expect(report.metrics).toHaveProperty('lowCount');
      expect(report.metrics).toHaveProperty('totalFilesScanned');

      expect(typeof report.metrics?.criticalCount).toBe('number');
      expect(typeof report.metrics?.highCount).toBe('number');
      expect(typeof report.metrics?.mediumCount).toBe('number');
      expect(typeof report.metrics?.lowCount).toBe('number');
    });

    it('should group violations by type', async () => {
      const report = await checker.run();

      // Metrics should include counts by violation type
      const metrics = report.metrics || {};
      const typeKeys = Object.keys(metrics).filter(
        (key) => !['criticalCount', 'highCount', 'mediumCount', 'lowCount', 'totalFilesScanned'].includes(key)
      );

      // Each type key should have a numeric value
      typeKeys.forEach((key) => {
        expect(typeof metrics[key]).toBe('number');
      });
    });
  });

  describe('Configuration', () => {
    it('should respect custom source directories', async () => {
      const customChecker = new SecurityPatternChecker({
        srcDirs: ['nonexistent-dir'],
      });

      const report = await customChecker.run();
      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.totalFilesScanned).toBe(0);
    });

    it('should respect exclude patterns', async () => {
      const customChecker = new SecurityPatternChecker({
        excludePatterns: [/.*/], // Exclude everything
      });

      const report = await customChecker.run();
      expect(report.totalViolations).toBe(0);
    });
  });
});
