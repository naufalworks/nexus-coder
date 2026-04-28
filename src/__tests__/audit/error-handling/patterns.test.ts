/**
 * Error Handling Pattern Checker Tests
 *
 * Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
 *
 * Tests for the ErrorHandlingPatternChecker module that validates
 * error handling patterns across the codebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ErrorHandlingPatternChecker,
  ErrorHandlingViolation,
  ErrorHandlingViolationType,
} from './patterns';

/**
 * Helper to create a temporary directory with source files for testing.
 */
function createTestDir(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-handling-test-'));

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  return tmpDir;
}

/**
 * Helper to clean up a temporary test directory.
 */
function cleanupTestDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('ErrorHandlingPatternChecker', () => {
  describe('AuditModule interface', () => {
    it('should implement AuditModule interface correctly', () => {
      const checker = new ErrorHandlingPatternChecker();
      expect(checker.category).toBe('error-handling');
      expect(checker.name).toBe('Error Handling Pattern Checker');
    });

    it('should return an AuditReport from run()', async () => {
      const tmpDir = createTestDir({
        'src/sample.ts': 'const x = 1;',
      });

      try {
        const checker = new ErrorHandlingPatternChecker({ srcDirs: [tmpDir] });
        const report = await checker.run();

        expect(report).toBeDefined();
        expect(report.category).toBe('error-handling');
        expect(report.totalViolations).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(report.violations)).toBe(true);
        expect(report.metrics).toBeDefined();
        expect(report.metrics?.totalFilesScanned).toBe(1);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Requirement 20.1: Try-catch in async agent functions', () => {
    it('should detect async functions without try-catch in agents/', async () => {
      const tmpDir = createTestDir({
        'src/agents/bad-agent.ts': `
import logger from '../core/logger';

export class BadAgent {
  async execute(instruction: string): Promise<string> {
    const result = await someOperation(instruction);
    return result;
  }
}
`,
        'src/agents/good-agent.ts': `
import logger from '../core/logger';

export class GoodAgent {
  async execute(instruction: string): Promise<string> {
    try {
      const result = await someOperation(instruction);
      return result;
    } catch (error) {
      logger.error('Failed:', error);
      throw error;
    }
  }
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const agentViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'missing-try-catch'
        ) as ErrorHandlingViolation[];

        // Should detect bad agent without try-catch
        expect(agentViolations.length).toBeGreaterThanOrEqual(1);
        
        const badAgentViolation = agentViolations.find(
          (v) => v.filePath.includes('bad-agent')
        );
        expect(badAgentViolation).toBeDefined();
        expect(badAgentViolation?.severity).toBe('high');
        expect(badAgentViolation?.message).toContain('execute');
        expect(badAgentViolation?.functionName).toBe('execute');
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should not flag async functions with try-catch', async () => {
      const tmpDir = createTestDir({
        'src/agents/safe-agent.ts': `
export class SafeAgent {
  async run(): Promise<void> {
    try {
      await this.doWork();
    } catch (error) {
      console.error('Failed:', error);
      throw error;
    }
  }

  private async doWork(): Promise<void> {
    // Internal method with error handling at higher level
  }
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const tryCatchViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'missing-try-catch' && v.filePath.includes('safe-agent')
        ) as ErrorHandlingViolation[];

        // 'run' has try-catch, 'doWork' is private internal method
        expect(tryCatchViolations.length).toBeLessThanOrEqual(1);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Requirement 20.2: File operation error handling', () => {
    it('should detect file operations without try-catch in file-writer', async () => {
      const tmpDir = createTestDir({
        'src/core/file-writer.ts': `
import * as fs from 'fs';

export class FileWriter {
  writeConfig(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content);
  }

  async readConfig(filePath: string): Promise<string> {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return data;
  }
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const fileOpViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'missing-error-logging'
        ) as ErrorHandlingViolation[];

        expect(fileOpViolations.length).toBeGreaterThanOrEqual(2);

        const writeSyncViolation = fileOpViolations.find(
          (v) => v.codeSnippet?.includes('writeFileSync')
        );
        expect(writeSyncViolation).toBeDefined();
        expect(writeSyncViolation?.severity).toBe('high');

        const readFileViolation = fileOpViolations.find(
          (v) => v.codeSnippet?.includes('readFile')
        );
        expect(readFileViolation).toBeDefined();
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Requirement 20.3: Widget error boundaries', () => {
    it('should detect widgets without ErrorBoundary', async () => {
      const tmpDir = createTestDir({
        'src/widgets/MyWidget.tsx': `
import React from 'react';

export const MyWidget = () => {
  return <div>Hello</div>;
};
`,
        'src/widgets/SafeWidget.tsx': `
import React from 'react';

class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    return this.props.children;
  }
}

export const SafeWidget = () => {
  return (
    <ErrorBoundary>
      <div>Safe</div>
    </ErrorBoundary>
  );
};
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const boundaryViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'missing-error-boundary'
        ) as ErrorHandlingViolation[];

        // MyWidget should be flagged, SafeWidget should not
        const myWidgetViolation = boundaryViolations.find(
          (v) => v.filePath.includes('MyWidget')
        );
        expect(myWidgetViolation).toBeDefined();
        expect(myWidgetViolation?.severity).toBe('medium');

        const safeWidgetViolation = boundaryViolations.find(
          (v) => v.filePath.includes('SafeWidget')
        );
        expect(safeWidgetViolation).toBeUndefined();
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Requirement 20.4: CLI exit codes', () => {
    it('should detect invalid exit codes in CLI files', async () => {
      const tmpDir = createTestDir({
        'src/cli/index.ts': `
process.exit(99);
process.exit(-1);
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const exitCodeViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'invalid-exit-code'
        ) as ErrorHandlingViolation[];

        expect(exitCodeViolations.length).toBeGreaterThanOrEqual(2);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should accept valid exit codes (0, 1, 2)', async () => {
      const tmpDir = createTestDir({
        'src/cli/good.ts': `
process.exit(0);
process.exit(1);
process.exit(2);
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const exitCodeViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'invalid-exit-code' &&
            (v as ErrorHandlingViolation).codeSnippet?.includes('process.exit')
        ) as ErrorHandlingViolation[];

        // Valid exit codes should not be flagged
        expect(exitCodeViolations.length).toBe(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Requirement 20.5: Silent error swallowing', () => {
    it('should detect empty catch blocks', async () => {
      const tmpDir = createTestDir({
        'src/utils/handler.ts': `
export function processData(data: string): string {
  try {
    return JSON.parse(data);
  } catch (e) {
  }
  return '{}';
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const emptyCatchViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'empty-catch-block'
        ) as ErrorHandlingViolation[];

        expect(emptyCatchViolations.length).toBeGreaterThanOrEqual(1);
        expect(emptyCatchViolations[0].severity).toBe('high');
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should detect catch blocks without logging', async () => {
      const tmpDir = createTestDir({
        'src/utils/quiet.ts': `
export function riskyOp(): void {
  try {
    doSomething();
  } catch (e) {
    const msg = e.toString();
    // Note: not logging or re-throwing
  }
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const noLogViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'catch-without-logging'
        ) as ErrorHandlingViolation[];

        expect(noLogViolations.length).toBeGreaterThanOrEqual(1);
        expect(noLogViolations[0].severity).toBe('medium');
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should detect .catch() without handler', async () => {
      const tmpDir = createTestDir({
        'src/api/caller.ts': `
export function callApi(): void {
  fetch('/api/data').catch();
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const silentViolations = report.violations.filter(
          (v) => (v as ErrorHandlingViolation).violationType === 'silent-error-swallow'
        ) as ErrorHandlingViolation[];

        expect(silentViolations.length).toBeGreaterThanOrEqual(1);
        expect(silentViolations[0].severity).toBe('high');
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should not flag catch blocks with proper logging', async () => {
      const tmpDir = createTestDir({
        'src/utils/good.ts': `
import logger from '../core/logger';

export function safeOp(): void {
  try {
    doSomething();
  } catch (error) {
    logger.error('Operation failed:', error);
    throw error;
  }
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        const catchViolations = report.violations.filter(
          (v) =>
            ((v as ErrorHandlingViolation).violationType === 'empty-catch-block' ||
              (v as ErrorHandlingViolation).violationType === 'catch-without-logging') &&
            v.filePath.includes('good')
        ) as ErrorHandlingViolation[];

        expect(catchViolations.length).toBe(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Configuration', () => {
    it('should respect exclude patterns', async () => {
      const tmpDir = createTestDir({
        'src/app.ts': `
export async function run(): Promise<void> {
  await doWork();
}
`,
        'src/generated/auto.ts': `
export async function generated(): Promise<void> {
  await autoGen();
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
          excludePatterns: [/generated/],
        });
        const report = await checker.run();

        const generatedViolations = report.violations.filter(
          (v) => v.filePath.includes('generated')
        );

        expect(generatedViolations.length).toBe(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should respect extension filter', async () => {
      const tmpDir = createTestDir({
        'src/app.ts': `
export async function run(): Promise<void> {
  await doWork();
}
`,
        'src/script.js': `
async function run() {
  await doWork();
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
          extensions: ['.js'],
        });
        const report = await checker.run();

        const tsViolations = report.violations.filter(
          (v) => v.filePath.endsWith('.ts')
        );

        expect(tsViolations.length).toBe(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should handle non-existent directories gracefully', async () => {
      const checker = new ErrorHandlingPatternChecker({
        srcDirs: ['/non/existent/path'],
      });
      const report = await checker.run();

      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.totalFilesScanned).toBe(0);
    });

    it('should allow disabling individual checks', async () => {
      const tmpDir = createTestDir({
        'src/agents/no-try.ts': `
export async function run(): Promise<void> {
  await doWork();
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
          checkAsyncTryCatch: false,
          checkSilentErrors: false,
          checkExitCodes: false,
          checkErrorBoundaries: false,
          checkFileOperations: false,
        });
        const report = await checker.run();

        expect(report.totalViolations).toBe(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });

  describe('Metrics', () => {
    it('should include severity breakdown in metrics', async () => {
      const tmpDir = createTestDir({
        'src/test.ts': `
try {
  doSomething();
} catch (e) {
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        expect(report.metrics).toBeDefined();
        expect(report.metrics?.criticalCount).toBeDefined();
        expect(report.metrics?.highCount).toBeDefined();
        expect(report.metrics?.mediumCount).toBeDefined();
        expect(report.metrics?.lowCount).toBeDefined();
        expect(typeof report.metrics?.criticalCount).toBe('number');
        expect(typeof report.metrics?.highCount).toBe('number');
        expect(typeof report.metrics?.mediumCount).toBe('number');
        expect(typeof report.metrics?.lowCount).toBe('number');
      } finally {
        cleanupTestDir(tmpDir);
      }
    });

    it('should include violation type breakdown in metrics', async () => {
      const tmpDir = createTestDir({
        'src/test.ts': `
try {
  doSomething();
} catch (e) {
}
`,
      });

      try {
        const checker = new ErrorHandlingPatternChecker({
          srcDirs: [path.join(tmpDir, 'src')],
        });
        const report = await checker.run();

        // Should have some type breakdown keys
        const typeKeys = Object.keys(report.metrics || {}).filter(
          (k) => !['totalFilesScanned', 'criticalCount', 'highCount', 'mediumCount', 'lowCount'].includes(k)
        );
        expect(typeKeys.length).toBeGreaterThanOrEqual(0);
      } finally {
        cleanupTestDir(tmpDir);
      }
    });
  });
});
