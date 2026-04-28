/**
 * Unit tests for Event Bus Pattern Checker
 *
 * Tests the event bus pattern compliance checking logic.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 *
 * @module audit/architecture/event-bus.test
 */

import { EventBusPatternChecker, type EventBusViolation } from './event-bus';
import type { AuditReport } from '../framework/types';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module to control test scenarios
jest.mock('fs');
jest.mock('path');

describe('EventBusPatternChecker', () => {
  let checker: EventBusPatternChecker;

  beforeEach(() => {
    checker = new EventBusPatternChecker();
    jest.clearAllMocks();
  });

  describe('Module interface', () => {
    it('should implement AuditModule interface', () => {
      expect(checker.category).toBe('event-bus-patterns');
      expect(checker.name).toBe('Event Bus Pattern Checker');
      expect(typeof checker.run).toBe('function');
    });
  });

  describe('run()', () => {
    it('should return an audit report with correct structure', async () => {
      // Mock empty source directory
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const report = await checker.run();

      expect(report).toHaveProperty('category', 'event-bus-patterns');
      expect(report).toHaveProperty('totalViolations');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('metrics');
      expect(Array.isArray(report.violations)).toBe(true);
    });

    it('should include metrics in the report', async () => {
      // Mock empty source directory
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const report = await checker.run();

      expect(report.metrics).toBeDefined();
      expect(report.metrics).toHaveProperty('totalFilesScanned');
      expect(report.metrics).toHaveProperty('totalEmitCalls');
      expect(report.metrics).toHaveProperty('totalHandlerRegistrations');
      expect(report.metrics).toHaveProperty('eventTypeCompliance');
    });
  });

  describe('Requirement 6.1: EventType enum detection', () => {
    it('should detect string literal event types instead of EventType enum', async () => {
      // Create a mock file with string literal event type
      const mockFileContent = `
        eventBus.emit('task-received', data);
        eventBus.emit("task-completed", result);
      `;

      mockSourceFiles({
        'src/test-file.ts': mockFileContent,
      });

      const report = await checker.run();

      // Should have violations for string literals
      const enumViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'non-standard-event-type'
      );

      expect(enumViolations.length).toBeGreaterThanOrEqual(2);

      for (const violation of enumViolations) {
        const evViolation = violation as EventBusViolation;
        expect(evViolation.severity).toBe('high');
        expect(evViolation.message).toContain('string literal');
        expect(evViolation.message).toContain('EventType enum');
      }
    });

    it('should accept EventType enum usage', async () => {
      // Create a mock file with proper EventType enum usage
      const mockFileContent = `
        eventBus.emit(EventType.TASK_RECEIVED, data);
        eventBus.emit(EventType.TASK_CLASSIFIED, result);
        eventBus.emit(EventType.CODE_GENERATED, code);
      `;

      mockSourceFiles({
        'src/test-file.ts': mockFileContent,
      });

      const report = await checker.run();

      // Should not have any violations for EventType enum usage
      const enumViolations = report.violations.filter(
        (v) => v.message.includes('string literal') || v.message.includes('non-standard')
      );

      // Count EventType violations
      const eventTypeViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'non-standard-event-type'
      );

      expect(eventTypeViolations.length).toBe(0);
    });

    it('should report non-standard event type with file path and line number', async () => {
      const mockFileContent = `
        // Line 1
        eventBus.emit('custom-event', data);
      `;

      mockSourceFiles({
        'src/custom-handler.ts': mockFileContent,
      });

      const report = await checker.run();

      const violations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'non-standard-event-type'
      );

      expect(violations.length).toBeGreaterThan(0);
      const violation = violations[0] as EventBusViolation;

      expect(violation.filePath).toBeTruthy();
      expect(violation.lineNumber).toBeGreaterThan(0);
      expect(violation.eventType).toBeTruthy();
    });
  });

  describe('Requirement 6.2: Handler registration verification', () => {
    it('should detect handlers registered on non-EventBus emitters', async () => {
      const mockFileContent = `
        // Direct emitter usage instead of EventBus
        someEmitter.on('task-received', handler);
        customBus.on(EventType.TASK_RECEIVED, handler);
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const registrationViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'unregistered-handler'
      );

      expect(registrationViolations.length).toBeGreaterThan(0);

      for (const violation of registrationViolations) {
        const evViolation = violation as EventBusViolation;
        expect(evViolation.severity).toBe('medium');
        expect(evViolation.message).toContain('non-EventBus emitter');
      }
    });

    it('should accept EventBus.on() handler registration', async () => {
      const mockFileContent = `
        eventBus.on(EventType.TASK_RECEIVED, async (event) => {
          try {
            await processTask(event);
          } catch (error) {
            console.error(error);
          }
        });
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const registrationViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'unregistered-handler'
      );

      expect(registrationViolations.length).toBe(0);
    });

    it('should skip React/DOM event handlers', async () => {
      const mockFileContent = `
        element.onclick = handler;
        button.addEventListener('click', handler);
        input.on('change', handler);
      `;

      mockSourceFiles({
        'src/widgets/Widget.tsx': mockFileContent,
      });

      const report = await checker.run();

      const registrationViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'unregistered-handler'
      );

      // Should not flag DOM event handlers
      expect(registrationViolations.length).toBe(0);
    });

    it('should skip Node.js process signal handlers', async () => {
      const mockFileContent = `
        process.on('SIGINT', handler);
        process.on('uncaughtException', handler);
        process.on('exit', handler);
      `;

      mockSourceFiles({
        'src/cli/index.ts': mockFileContent,
      });

      const report = await checker.run();

      const registrationViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'unregistered-handler'
      );

      // Should not flag process signal handlers
      expect(registrationViolations.length).toBe(0);
    });
  });

  describe('Requirement 6.3: Error handling in handlers', () => {
    it('should detect handlers missing try-catch error handling', async () => {
      const mockFileContent = `
        eventBus.on(EventType.TASK_RECEIVED, async (event) => {
          // No try-catch - this should be flagged
          await processTask(event);
        });
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const errorHandlingViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'missing-error-handling'
      );

      expect(errorHandlingViolations.length).toBeGreaterThan(0);

      const violation = errorHandlingViolations[0] as EventBusViolation;
      expect(violation.severity).toBe('medium');
      expect(violation.message).toContain('try-catch');
    });

    it('should accept handlers with try-catch error handling', async () => {
      const mockFileContent = `
        eventBus.on(EventType.TASK_RECEIVED, async (event) => {
          try {
            await processTask(event);
          } catch (error) {
            logger.error('Handler failed', error);
          }
        });

        eventBus.once(EventType.CODE_GENERATED, (event) => {
          try {
            processCode(event);
          } catch (e) {
            console.error(e);
          }
        });
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const errorHandlingViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'missing-error-handling'
      );

      expect(errorHandlingViolations.length).toBe(0);
    });

    it('should accept arrow function handlers with try-catch', async () => {
      const mockFileContent = `
        eventBus.on(EventType.TASK_CLASSIFIED, async (event) => {
          try {
            await handleClassifiedTask(event);
          } catch (err) {
            eventBus.emit(EventType.ERROR_OCCURRED, { error: err });
          }
        });
      `;

      mockSourceFiles({
        'src/agents/handler.ts': mockFileContent,
      });

      const report = await checker.run();

      const errorHandlingViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'missing-error-handling'
      );

      // Should have no error handling violations
      expect(errorHandlingViolations.length).toBe(0);
    });

    it('should detect missing error handling in function expression handlers', async () => {
      const mockFileContent = `
        eventBus.on(EventType.PLAN_CREATED, function(event) {
          // Missing try-catch
          processPlan(event);
        });
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const errorHandlingViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'missing-error-handling'
      );

      expect(errorHandlingViolations.length).toBeGreaterThan(0);
    });

    it('should accept named function handlers (assume they have internal error handling)', async () => {
      const mockFileContent = `
        eventBus.on(EventType.TASK_RECEIVED, handleTaskReceived);
      `;

      mockSourceFiles({
        'src/handlers.ts': mockFileContent,
      });

      const report = await checker.run();

      const errorHandlingViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'missing-error-handling'
      );

      // Named function references are assumed to have their own error handling
      expect(errorHandlingViolations.length).toBe(0);
    });
  });

  describe('Requirement 6.4: Direct EventEmitter detection', () => {
    it('should detect direct EventEmitter instantiation', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';

        // This bypasses EventBus - should be flagged
        const myEmitter = new EventEmitter();
      `;

      mockSourceFiles({
        'src/custom/events.ts': mockFileContent,
      });

      const report = await checker.run();

      const directViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'direct-eventemitter-usage'
      );

      expect(directViolations.length).toBeGreaterThan(0);

      const violation = directViolations[0] as EventBusViolation;
      expect(violation.severity).toBe('high');
      expect(violation.message).toContain('Direct EventEmitter instantiation');
      expect(violation.message).toContain('EventBus class');
    });

    it('should not flag EventEmitter import without instantiation', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';

        // Only using the type, not instantiating
        function createEmitter(emitter: EventEmitter) {
          return emitter;
        }
      `;

      mockSourceFiles({
        'src/utils/emitter.ts': mockFileContent,
      });

      const report = await checker.run();

      const directViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'direct-eventemitter-usage'
      );

      // Should have no direct usage violations (only imported, not instantiated)
      expect(directViolations.length).toBe(0);
    });

    it('should detect multiple EventEmitter instantiations', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';

        const emitter1 = new EventEmitter();
        const emitter2 = new EventEmitter();
        const emitter3 = new EventEmitter();
      `;

      mockSourceFiles({
        'src/multiple-emitters.ts': mockFileContent,
      });

      const report = await checker.run();

      const directViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'direct-eventemitter-usage'
      );

      expect(directViolations.length).toBe(3);
    });

    it('should report violation with file path and line number', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';

        const emitter = new EventEmitter();
      `;

      mockSourceFiles({
        'src/violations/direct-emitter.ts': mockFileContent,
      });

      const report = await checker.run();

      const directViolations = report.violations.filter(
        (v) => (v as EventBusViolation).issueType === 'direct-eventemitter-usage'
      );

      expect(directViolations.length).toBeGreaterThan(0);

      const violation = directViolations[0] as EventBusViolation;
      expect(violation.filePath).toBeTruthy();
      expect(violation.lineNumber).toBeGreaterThan(0);
    });
  });

  describe('Violation structure', () => {
    it('should produce violations with all required fields', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';
        eventBus.emit('custom-event', data);
        eventBus.on(EventType.TASK_RECEIVED, (e) => { processTask(e); });
        const emitter = new EventEmitter();
      `;

      mockSourceFiles({
        'src/test.ts': mockFileContent,
      });

      const report = await checker.run();

      for (const violation of report.violations) {
        const evViolation = violation as EventBusViolation;

        expect(evViolation).toHaveProperty('category', 'event-bus-patterns');
        expect(evViolation).toHaveProperty('severity');
        expect(evViolation).toHaveProperty('filePath');
        expect(evViolation).toHaveProperty('lineNumber');
        expect(evViolation).toHaveProperty('message');
        expect(evViolation).toHaveProperty('issueType');

        // Validate severity levels
        expect(['critical', 'high', 'medium', 'low']).toContain(evViolation.severity);

        // Validate issue types
        expect([
          'non-standard-event-type',
          'unregistered-handler',
          'missing-error-handling',
          'direct-eventemitter-usage',
        ]).toContain(evViolation.issueType);
      }
    });
  });

  describe('Report metrics', () => {
    it('should count total emit calls and handler registrations', async () => {
      const mockFileContent = `
        eventBus.emit(EventType.TASK_RECEIVED, data);
        eventBus.emit(EventType.TASK_COMPLETED, result);
        eventBus.on(EventType.TASK_RECEIVED, (e) => { try { process(e); } catch (err) {} });
        eventBus.once(EventType.CODE_GENERATED, (e) => { try { log(e); } catch (err) {} });
      `;

      mockSourceFiles({
        'src/metrics-test.ts': mockFileContent,
      });

      const report = await checker.run();

      expect(report.metrics?.totalEmitCalls).toBe(2);
      expect(report.metrics?.totalHandlerRegistrations).toBe(2);
    });

    it('should calculate event type compliance percentage', async () => {
      const mockFileContent = `
        eventBus.emit(EventType.TASK_RECEIVED, data);  // Valid
        eventBus.emit('custom-event', result);          // Invalid
        eventBus.emit(EventType.CODE_GENERATED, code); // Valid
      `;

      mockSourceFiles({
        'src/compliance-test.ts': mockFileContent,
      });

      const report = await checker.run();

      // 2 out of 3 use EventType enum = 66.7%
      expect(report.metrics?.eventTypeCompliance).toBe('66.7%');
    });

    it('should report 100% compliance when all use EventType enum', async () => {
      const mockFileContent = `
        eventBus.emit(EventType.TASK_RECEIVED, data);
        eventBus.emit(EventType.CODE_GENERATED, code);
      `;

      mockSourceFiles({
        'src/compliant.ts': mockFileContent,
      });

      const report = await checker.run();

      expect(report.metrics?.eventTypeCompliance).toBe('100.0%');
    });

    it('should report total violations matching violations array length', async () => {
      const mockFileContent = `
        import { EventEmitter } from 'events';
        eventBus.emit('custom-event', data);
        const emitter = new EventEmitter();
      `;

      mockSourceFiles({
        'src/test.ts': mockFileContent,
      });

      const report = await checker.run();

      expect(report.totalViolations).toBe(report.violations.length);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customChecker = new EventBusPatternChecker({
        srcDirs: ['src', 'lib'],
        extensions: ['.ts', '.tsx'],
        excludePatterns: [/test/, /spec/],
        eventBusFilePath: 'src/core/event-bus.ts',
        validEventTypes: ['CUSTOM_EVENT'],
      });

      expect(customChecker).toBeDefined();
      expect(customChecker.category).toBe('event-bus-patterns');
    });

    it('should use default configuration when none provided', () => {
      const defaultChecker = new EventBusPatternChecker();

      expect(defaultChecker).toBeDefined();
      expect(defaultChecker.category).toBe('event-bus-patterns');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty source directories gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const report = await checker.run();

      expect(report.totalViolations).toBe(0);
      expect(report.metrics?.totalFilesScanned).toBe(0);
    });

    it('should handle files that cannot be read', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true },
      ]);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      (path.extname as jest.Mock).mockReturnValue('.ts');
      (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

      const report = await checker.run();

      expect(report).toBeDefined();
      expect(report.totalViolations).toBe(0);
    });

    it('should skip excluded patterns', async () => {
      mockSourceFiles({
        'src/__tests__/test-file.ts': `
          eventBus.emit('test-event', data);
        `,
        'src/node_modules/package/index.ts': `
          const emitter = new EventEmitter();
        `,
      });

      const report = await checker.run();

      // Should have 0 violations as both files are in excluded paths
      expect(report.metrics?.totalFilesScanned).toBe(0);
    });
  });
});

/**
 * Helper to mock source files for testing.
 * Sets up fs mocks to simulate the provided file structure.
 */
function mockSourceFiles(files: Record<string, string>): void {
  const filePaths = Object.keys(files);

  (fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
    // Check if any file starts with this directory
    return filePaths.some((f) => f.startsWith(dir)) || dir === 'src';
  });

  (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
    // Normalize directory path
    const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    
    // Get all files that are children of this directory
    const children = new Set<string>();
    
    for (const file of filePaths) {
      if (file.startsWith(normalizedDir + '/')) {
        // Get the relative path from this directory
        const relative = file.substring(normalizedDir.length + 1);
        // Get the immediate child (first segment)
        const childName = relative.split('/')[0];
        children.add(childName);
      }
    }

    return Array.from(children).map((name) => {
      // Check if this child is a directory (has children under it)
      const childPath = normalizedDir + '/' + name;
      const isDir = filePaths.some((f) => f.startsWith(childPath + '/'));
      
      return {
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      };
    });
  });

  (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
    return files[filePath] || '';
  });

  (path.extname as jest.Mock).mockImplementation((filePath: string) => {
    if (filePath.endsWith('.tsx')) return '.tsx';
    if (filePath.endsWith('.ts')) return '.ts';
    return '';
  });

  (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));
}
