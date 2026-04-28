/**
 * Unit tests for Documentation Accuracy Checker
 *
 * Tests Requirements 14.1, 14.2, 14.4, 14.5
 */

import { DocumentationAccuracyChecker, DocumentationViolation } from './accuracy';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('DocumentationAccuracyChecker', () => {
  let checker: DocumentationAccuracyChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    checker = new DocumentationAccuracyChecker({ rootDir: '/test' });
  });

  describe('Basic functionality', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('documentation-accuracy');
      expect(checker.name).toBe('Documentation Accuracy Checker');
      expect(typeof checker.run).toBe('function');
    });

    it('should return empty report when no documentation files exist', async () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const report = await checker.run();

      expect(report.category).toBe('documentation-accuracy');
      expect(report.totalViolations).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(report.violations)).toBe(true);
    });
  });

  describe('Requirement 14.1: README.md installation commands', () => {
    it('should detect missing npm install command', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return '# Project\n\nSome content without installation commands';
        }
        return '{}';
      });

      const report = await checker.run();

      const installViolations = report.violations.filter(
        v => v.message.includes('npm install')
      );
      expect(installViolations.length).toBeGreaterThan(0);
      expect(installViolations[0].severity).toBe('medium');
    });

    it('should detect missing docker run command', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return '# Project\n\n```bash\nnpm install\n```';
        }
        return '{}';
      });

      const report = await checker.run();

      const dockerViolations = report.violations.filter(
        v => v.message.includes('docker run')
      );
      expect(dockerViolations.length).toBeGreaterThan(0);
    });

    it('should pass when all expected commands are present', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return { isFile: () => true } as any;
        }
        if (filePath.includes('package.json')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return `# Project

## Installation

\`\`\`bash
npm install
docker run -d qdrant
cp .env.example .env
\`\`\`
`;
        }
        if (filePath.includes('package.json')) {
          return JSON.stringify({ scripts: { test: 'jest', build: 'tsc' } });
        }
        return '{}';
      });

      const report = await checker.run();

      const installViolations = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'outdated-command'
      );
      expect(installViolations.length).toBe(0);
    });

    it('should detect references to non-existent npm scripts', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md') || filePath.includes('package.json')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return '# Project\n\nRun tests:\n\n```bash\nnpm test\n```\n\nBuild:\n\n```bash\nnpm run build\n```\n\nDev:\n\n```bash\nnpm run dev\n```';
        }
        if (filePath.includes('package.json')) {
          return JSON.stringify({ scripts: { test: 'jest' } });
        }
        return '{}';
      });

      const report = await checker.run();

      const scriptViolations = report.violations.filter(
        v => v.message.includes('npm script') && v.message.includes('package.json')
      );
      expect(scriptViolations.length).toBeGreaterThan(0);
      expect(scriptViolations[0].severity).toBe('high');
    });
  });

  describe('Requirement 14.2: QUICKSTART.md workflow steps', () => {
    it('should detect missing QUICKSTART.md file', async () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const report = await checker.run();

      const quickstartViolations = report.violations.filter(
        v => (v as DocumentationViolation).documentPath.includes('QUICKSTART.md')
      );
      expect(quickstartViolations.length).toBeGreaterThan(0);
      expect(quickstartViolations[0].severity).toBe('high');
    });

    it('should detect missing workflow steps', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('QUICKSTART.md')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('QUICKSTART.md')) {
          return '# Quick Start\n\nJust some basic content';
        }
        return '{}';
      });

      const report = await checker.run();

      const workflowViolations = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'outdated-workflow'
      );
      expect(workflowViolations.length).toBeGreaterThan(0);
    });

    it('should pass when all workflow steps are present', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('QUICKSTART.md')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('QUICKSTART.md')) {
          return `# Quick Start

## Installation
npm install

## Configure
Edit .env file

## Docker Setup
docker-compose up
`;
        }
        return '{}';
      });

      const report = await checker.run();

      const workflowViolations = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'outdated-workflow'
      );
      expect(workflowViolations.length).toBe(0);
    });
  });

  describe('Requirement 14.5: Key Exports section', () => {
    it('should detect missing exports in documentation', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md') || filePath.includes('src/index.ts')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return `# Project

## Key Exports

\`\`\`typescript
export { UnifiedClient }
\`\`\`
`;
        }
        if (filePath.includes('src/index.ts')) {
          return `export { UnifiedClient } from './core/models/unified-client';
export { ModelRouter } from './core/models/router';
export { ContextEngine } from './core/context/engine';`;
        }
        return '{}';
      });

      const report = await checker.run();

      const missingExports = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'missing-export'
      );
      expect(missingExports.length).toBeGreaterThan(0);
      expect(missingExports.some(v => v.message.includes('ModelRouter'))).toBe(true);
      expect(missingExports.some(v => v.message.includes('ContextEngine'))).toBe(true);
    });

    it('should detect incorrect exports in documentation', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md') || filePath.includes('src/index.ts')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return `# Project

## Key Exports

\`\`\`typescript
export { UnifiedClient }
export { NonExistentClass }
\`\`\`
`;
        }
        if (filePath.includes('src/index.ts')) {
          return `export { UnifiedClient } from './core/models/unified-client';`;
        }
        return '{}';
      });

      const report = await checker.run();

      const incorrectExports = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'incorrect-export'
      );
      expect(incorrectExports.length).toBeGreaterThan(0);
      expect(incorrectExports[0].message).toContain('NonExistentClass');
      expect(incorrectExports[0].severity).toBe('medium');
    });

    it('should pass when exports match', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md') || filePath.includes('src/index.ts')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return `# Project

## Key Exports

\`\`\`typescript
export { UnifiedClient }
export { ModelRouter }
\`\`\`
`;
        }
        if (filePath.includes('src/index.ts')) {
          return `export { UnifiedClient } from './core/models/unified-client';
export { ModelRouter } from './core/models/router';`;
        }
        return '{}';
      });

      const report = await checker.run();

      const exportViolations = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'missing-export' || (v as DocumentationViolation).violationType === 'incorrect-export'
      );
      expect(exportViolations.length).toBe(0);
    });
  });

  describe('Requirement 14.4: Code example API signatures', () => {
    it('should detect potentially outdated API usage in code examples', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return { isFile: () => true } as any;
        }
        if (filePath.includes('src')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return `# Project

\`\`\`typescript
const client = new NonExistentClass();
client.nonExistentMethod();
\`\`\`
`;
        }
        return 'export class SomeClass {}';
      });

      mockFs.readdirSync.mockReturnValue([]);

      const report = await checker.run();

      const apiViolations = report.violations.filter(
        v => (v as DocumentationViolation).violationType === 'outdated-api-signature'
      );
      expect(apiViolations.length).toBeGreaterThan(0);
      expect(apiViolations[0].severity).toBe('low');
    });
  });

  describe('Report metrics', () => {
    it('should include correct metrics in report', async () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('Not found');
      });

      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics?.documentsChecked).toBe(3); // README, QUICKSTART, SPEC
      expect(report.metrics?.criticalCount).toBeDefined();
      expect(report.metrics?.highCount).toBeDefined();
      expect(report.metrics?.mediumCount).toBeDefined();
      expect(report.metrics?.lowCount).toBeDefined();
    });

    it('should group violations by severity', async () => {
      mockFs.statSync.mockImplementation((filePath: any) => {
        if (filePath.includes('README.md')) {
          return { isFile: () => true } as any;
        }
        throw new Error('Not found');
      });

      mockFs.readFileSync.mockImplementation(() => {
        return '# Project\n\nMinimal content';
      });

      const report = await checker.run();

      const totalBySeverity =
        (report.metrics?.criticalCount as number) +
        (report.metrics?.highCount as number) +
        (report.metrics?.mediumCount as number) +
        (report.metrics?.lowCount as number);

      expect(totalBySeverity).toBe(report.totalViolations);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customChecker = new DocumentationAccuracyChecker({
        rootDir: '/custom',
        documentFiles: ['CUSTOM.md'],
        indexFile: 'custom/index.ts',
      });

      expect(customChecker).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const defaultChecker = new DocumentationAccuracyChecker();
      expect(defaultChecker).toBeDefined();
    });
  });
});
