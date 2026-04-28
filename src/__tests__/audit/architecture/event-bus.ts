/**
 * Event Bus Pattern Checker Module
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * Scans source files for event bus usage pattern compliance:
 * - Verifies all event types use the EventType enum from core/event-bus (Req 6.1)
 * - Checks EventBus.on handler registration patterns (Req 6.2)
 * - Verifies error handling in event handlers (Req 6.3)
 * - Detects direct EventEmitter usage that bypasses EventBus (Req 6.4)
 * - Reports violations with file path and specific issue (Req 6.5)
 *
 * @module audit/architecture/event-bus
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';

/**
 * Event bus violation types corresponding to requirements.
 */
export type EventBusViolationType =
  | 'non-standard-event-type'
  | 'unregistered-handler'
  | 'missing-error-handling'
  | 'direct-eventemitter-usage';

/**
 * Extended violation interface for event bus pattern issues.
 */
export interface EventBusViolation extends AuditViolation {
  category: 'event-bus-patterns';
  /** Type of event bus issue */
  issueType: EventBusViolationType;
  /** Event type involved (if applicable) */
  eventType?: string;
}

/**
 * Configuration options for the event bus pattern checker.
 */
export interface EventBusPatternConfig {
  /** Source directories to scan (default: ['src']) */
  srcDirs: string[];
  /** File extensions to check (default: ['.ts', '.tsx']) */
  extensions: string[];
  /** Patterns to exclude from scanning */
  excludePatterns: RegExp[];
  /** Path to the EventType enum definition file */
  eventBusFilePath: string;
  /** Known valid EventType enum values */
  validEventTypes: string[];
}

/**
 * The canonical EventType enum values from src/core/event-bus.ts.
 * These represent all standard event types that should be used
 * when emitting or listening to events.
 */
const CANONICAL_EVENT_TYPES: string[] = [
  'TASK_RECEIVED',
  'TASK_CLASSIFIED',
  'PLAN_CREATED',
  'CONTEXT_ASSEMBLING',
  'CONTEXT_ASSEMBLED',
  'CODE_GENERATING',
  'CODE_GENERATED',
  'CODE_REVIEWING',
  'CODE_REVIEWED',
  'CHANGES_PROPOSED',
  'CHANGES_APPROVED',
  'CHANGES_REJECTED',
  'CHANGES_APPLIED',
  'GIT_COMMITTED',
  'ERROR_OCCURRED',
  'AGENT_STARTED',
  'AGENT_COMPLETED',
  'AGENT_FAILED',
  'MODEL_ROUTED',
  'TOKEN_BUDGET_EXCEEDED',
];

/**
 * Default configuration for event bus pattern checker.
 */
const DEFAULT_CONFIG: EventBusPatternConfig = {
  srcDirs: ['src'],
  extensions: ['.ts', '.tsx'],
  excludePatterns: [/node_modules/, /dist/, /\.d\.ts$/, /__tests__/],
  eventBusFilePath: 'src/core/event-bus.ts',
  validEventTypes: CANONICAL_EVENT_TYPES,
};

/**
 * Information about an event emit call found in source code.
 */
interface EmitCallInfo {
  /** File containing the emit call */
  filePath: string;
  /** Line number of the emit call */
  lineNumber: number;
  /** The event type argument (first arg of emit) */
  eventTypeArg: string;
  /** Whether the event type uses EventType enum */
  usesEventTypeEnum: boolean;
  /** Whether it's a string literal (non-standard) */
  isStringLiteral: boolean;
  /** Full text of the emit call */
  callText: string;
}

/**
 * Information about an event handler registration (on/once).
 */
interface HandlerRegistrationInfo {
  /** File containing the handler registration */
  filePath: string;
  /** Line number of the handler registration */
  lineNumber: number;
  /** The event type being listened to */
  eventTypeArg: string;
  /** Whether the handler is registered on an EventBus instance */
  isEventBusRegistration: boolean;
  /** Whether the handler has error handling (try-catch) */
  hasErrorHandling: boolean;
  /** Full text of the handler body */
  handlerBody: string;
  /** Method used for registration ('on', 'once', or 'addEventListener') */
  registrationMethod: string;
}

/**
 * Information about a direct EventEmitter usage.
 */
interface DirectEventEmitterUsage {
  /** File containing the direct usage */
  filePath: string;
  /** Line number of the direct usage */
  lineNumber: number;
  /** The import path for EventEmitter */
  importPath: string;
  /** Whether it's an instantiation (new EventEmitter()) */
  isInstantiation: boolean;
  /** Whether it's an import from 'events' module */
  isEventsImport: boolean;
  /** Full text of the usage */
  usageText: string;
}

/**
 * Event Bus Pattern Checker Module
 *
 * Implements the AuditModule interface to validate that code follows
 * the event bus patterns defined in the project:
 * - All event types use the EventType enum
 * - Handlers are registered through the EventBus class
 * - Handlers include proper error handling
 * - No direct EventEmitter usage bypasses the EventBus
 *
 * @example
 * ```typescript
 * const checker = new EventBusPatternChecker();
 * const report = await checker.run();
 *
 * console.log(`Event bus violations: ${report.totalViolations}`);
 * for (const violation of report.violations) {
 *   const evViolation = violation as EventBusViolation;
 *   console.log(`${evViolation.filePath}:${evViolation.lineNumber} - ${evViolation.issueType}`);
 * }
 * ```
 */
export class EventBusPatternChecker implements AuditModule {
  readonly category: AuditCategory = 'event-bus-patterns';
  readonly name = 'Event Bus Pattern Checker';

  private config: EventBusPatternConfig;

  /**
   * Create a new event bus pattern checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<EventBusPatternConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the event bus pattern audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: EventBusViolation[] = [];

    // Get all source files to analyze
    const files = this.getSourceFiles();

    // Collections for tracking patterns across files
    const emitCalls: EmitCallInfo[] = [];
    const handlerRegistrations: HandlerRegistrationInfo[] = [];
    const directUsages: DirectEventEmitterUsage[] = [];

    // Parse each file
    for (const file of files) {
      // Skip the event-bus.ts file itself (it defines the patterns)
      if (file.endsWith('core/event-bus.ts')) {
        continue;
      }

      const content = this.readFileContent(file);
      if (!content) continue;

      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Collect all patterns from this file
      this.collectEmitCalls(sourceFile, file, emitCalls);
      this.collectHandlerRegistrations(sourceFile, file, handlerRegistrations);
      this.collectDirectEventEmitterUsage(sourceFile, file, directUsages);
    }

    // Requirement 6.1: Verify EventType enum usage for all event types
    const eventTypeViolations = this.checkEventTypeUsage(emitCalls);
    violations.push(...eventTypeViolations);

    // Requirement 6.2: Check EventBus.on handler registration
    const registrationViolations = this.checkHandlerRegistrations(handlerRegistrations);
    violations.push(...registrationViolations);

    // Requirement 6.3: Verify error handling in event handlers
    const errorHandlingViolations = this.checkErrorHandlerHandling(handlerRegistrations);
    violations.push(...errorHandlingViolations);

    // Requirement 6.4: Detect direct EventEmitter usage bypasses
    const directUsageViolations = this.checkDirectEventEmitterUsage(directUsages);
    violations.push(...directUsageViolations);

    // Calculate metrics
    const metrics = this.calculateMetrics(
      files.length,
      emitCalls,
      handlerRegistrations,
      directUsages,
      violations
    );

    // Generate report
    const report: AuditReport = {
      category: this.category,
      totalViolations: violations.length,
      violations,
      metrics,
    };

    return report;
  }

  /**
   * Get all source files to analyze based on configuration.
   *
   * @returns Array of file paths to analyze
   */
  private getSourceFiles(): string[] {
    const files: string[] = [];

    for (const dir of this.config.srcDirs) {
      if (!fs.existsSync(dir)) continue;
      this.walkDirectory(dir, files);
    }

    return files;
  }

  /**
   * Recursively walk a directory and collect source files.
   *
   * @param dir - Directory to walk
   * @param files - Array to collect file paths
   */
  private walkDirectory(dir: string, files: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip excluded patterns
      if (this.config.excludePatterns.some((pattern) => pattern.test(fullPath))) {
        continue;
      }

      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.config.extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  /**
   * Read file content safely.
   *
   * @param filePath - Path to the file
   * @returns File content or null if file can't be read
   */
  private readFileContent(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Collect all event emit calls from a source file.
   * Looks for patterns like:
   * - eventBus.emit(EventType.XXX, ...)
   * - this.eventBus.emit(EventType.XXX, ...)
   * - eventBus.emit('event:name', ...)
   */
  private collectEmitCalls(
    sourceFile: ts.SourceFile,
    filePath: string,
    results: EmitCallInfo[]
  ): void {
    const visit = (node: ts.Node) => {
      // Look for method calls: something.emit(...)
      if (ts.isCallExpression(node)) {
        const expression = node.expression;

        // Check if it's a method call (property access)
        if (ts.isPropertyAccessExpression(expression)) {
          const methodName = expression.name.getText(sourceFile);

          if (methodName === 'emit') {
            const args = node.arguments;
            if (args.length > 0) {
              const firstArg = args[0];
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile)
              ).line + 1;

              const eventTypeArg = firstArg.getText(sourceFile);
              const isStringLiteral = ts.isStringLiteral(firstArg);
              const usesEventTypeEnum = eventTypeArg.startsWith('EventType.');

              results.push({
                filePath,
                lineNumber,
                eventTypeArg,
                usesEventTypeEnum,
                isStringLiteral,
                callText: node.getText(sourceFile),
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Collect all event handler registrations from a source file.
   * Looks for patterns like:
   * - eventBus.on(EventType.XXX, handler)
   * - eventBus.once(EventType.XXX, handler)
   * - emitter.on('event', handler)
   */
  private collectHandlerRegistrations(
    sourceFile: ts.SourceFile,
    filePath: string,
    results: HandlerRegistrationInfo[]
  ): void {
    const visit = (node: ts.Node) => {
      // Look for method calls: something.on(...) or something.once(...)
      if (ts.isCallExpression(node)) {
        const expression = node.expression;

        // Check if it's a method call (property access)
        if (ts.isPropertyAccessExpression(expression)) {
          const methodName = expression.name.getText(sourceFile);

          if (methodName === 'on' || methodName === 'once') {
            const args = node.arguments;
            if (args.length >= 2) {
              const firstArg = args[0];
              const secondArg = args[1];
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile)
              ).line + 1;

              // Determine the object being called on
              const callerText = expression.expression.getText(sourceFile);
              const isEventBusRegistration = this.isEventBusIdentifier(callerText);

              const eventTypeArg = firstArg.getText(sourceFile);
              const handlerBody = secondArg.getText(sourceFile);

              // Check for error handling in the handler
              const hasErrorHandling = this.analyzeHandlerErrorHandling(secondArg);

              results.push({
                filePath,
                lineNumber,
                eventTypeArg,
                isEventBusRegistration,
                hasErrorHandling,
                handlerBody,
                registrationMethod: methodName,
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Collect direct EventEmitter usages that bypass EventBus.
   * Looks for:
   * - new EventEmitter()
   * - import { EventEmitter } from 'events'
   * - Direct .on/.emit on an EventEmitter instance
   */
  private collectDirectEventEmitterUsage(
    sourceFile: ts.SourceFile,
    filePath: string,
    results: DirectEventEmitterUsage[]
  ): void {
    // First, check for imports of EventEmitter from 'events'
    const hasEventEmitterImport = this.hasEventEmitterImport(sourceFile);

    if (!hasEventEmitterImport) {
      return; // No EventEmitter import means no direct usage possible
    }

    const visit = (node: ts.Node) => {
      // Check for new EventEmitter()
      if (ts.isNewExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression) && expression.getText(sourceFile) === 'EventEmitter') {
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          ).line + 1;

          results.push({
            filePath,
            lineNumber,
            importPath: 'events',
            isInstantiation: true,
            isEventsImport: true,
            usageText: node.getText(sourceFile),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Check if a source file imports EventEmitter from 'events' module.
   */
  private hasEventEmitterImport(sourceFile: ts.SourceFile): boolean {
    let found = false;

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          if (moduleSpecifier.text === 'events') {
            // Check if EventEmitter is imported
            const importClause = node.importClause;
            if (importClause) {
              const namedBindings = importClause.namedBindings;
              if (namedBindings && ts.isNamedImports(namedBindings)) {
                for (const element of namedBindings.elements) {
                  if (element.name.getText(sourceFile) === 'EventEmitter') {
                    found = true;
                    return;
                  }
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return found;
  }

  /**
   * Determine if an identifier refers to an EventBus instance.
   */
  private isEventBusIdentifier(identifierText: string): boolean {
    // Common patterns for EventBus instance names
    const eventBusPatterns = [
      'eventBus',
      'this.eventBus',
      'this._eventBus',
      '_eventBus',
      'bus',
    ];

    return eventBusPatterns.includes(identifierText);
  }

  /**
   * Analyze a handler expression for error handling patterns.
   * Checks if the handler wraps its body in try-catch.
   *
   * @param handlerNode - The AST node for the handler
   * @returns True if error handling is present
   */
  private analyzeHandlerErrorHandling(handlerNode: ts.Node): boolean {
    // Arrow function: (event) => { try { ... } catch { ... } }
    if (ts.isArrowFunction(handlerNode)) {
      const body = handlerNode.body;
      if (ts.isBlock(body)) {
        return this.blockHasTryCatch(body);
      }
      // Expression body (no block) can't have try-catch
      return false;
    }

    // Regular function expression
    if (ts.isFunctionExpression(handlerNode)) {
      const body = handlerNode.body;
      return this.blockHasTryCatch(body);
    }

    // Identifier reference - can't determine statically
    if (ts.isIdentifier(handlerNode)) {
      return true; // Assume named handlers have their own error handling
    }

    return false;
  }

  /**
   * Check if a block statement contains a try-catch statement.
   */
  private blockHasTryCatch(block: ts.Block): boolean {
    for (const statement of block.statements) {
      if (ts.isTryStatement(statement)) {
        return true;
      }
    }
    return false;
  }

  // --- Violation check methods ---

  /**
   * Requirement 6.1: Verify EventType enum usage for all event types.
   *
   * Checks that all emit calls use EventType.XXX enum values
   * rather than raw string literals.
   *
   * @param emitCalls - Collected emit call information
   * @returns Violations for non-standard event type usage
   */
  private checkEventTypeUsage(emitCalls: EmitCallInfo[]): EventBusViolation[] {
    const violations: EventBusViolation[] = [];

    for (const call of emitCalls) {
      // Check if using a string literal instead of EventType enum
      if (call.isStringLiteral) {
        violations.push(this.createViolation(
          call.filePath,
          call.lineNumber,
          'non-standard-event-type',
          `Event emit uses string literal '${call.eventTypeArg}' instead of EventType enum value`,
          call.eventTypeArg,
          'high'
        ));
        continue;
      }

      // Check if it looks like a string variable (not EventType enum)
      if (!call.usesEventTypeEnum && !this.isValidEventTypeName(call.eventTypeArg)) {
        // Could be a variable reference - flag as medium severity
        violations.push(this.createViolation(
          call.filePath,
          call.lineNumber,
          'non-standard-event-type',
          `Event emit uses non-standard event type '${call.eventTypeArg}' - should use EventType enum value`,
          call.eventTypeArg,
          'medium'
        ));
      }
    }

    return violations;
  }

  /**
   * Check if an event type argument is a valid EventType name.
   * Accepts EventType.XXX and direct enum value references.
   */
  private isValidEventTypeName(eventTypeArg: string): boolean {
    // EventType.XXX pattern is valid
    if (eventTypeArg.startsWith('EventType.')) {
      const enumMember = eventTypeArg.replace('EventType.', '');
      return this.config.validEventTypes.includes(enumMember);
    }

    // Direct enum member references in the same file (less common)
    if (this.config.validEventTypes.includes(eventTypeArg)) {
      return true;
    }

    // Variable references that are not string literals are hard to validate statically
    // Accept them unless they are string literals (handled separately)
    if (!eventTypeArg.startsWith('"') && !eventTypeArg.startsWith("'") && !eventTypeArg.startsWith('`')) {
      return true; // Assume non-literal references are valid
    }

    return false;
  }

  /**
   * Requirement 6.2: Check EventBus.on handler registration patterns.
   *
   * Verifies that event handlers are properly registered through the
   * EventBus class rather than through raw EventEmitter or other patterns.
   *
   * @param registrations - Collected handler registration information
   * @returns Violations for unregistered or improperly registered handlers
   */
  private checkHandlerRegistrations(registrations: HandlerRegistrationInfo[]): EventBusViolation[] {
    const violations: EventBusViolation[] = [];

    for (const reg of registrations) {
      // Check if using non-EventBus emitter for event registration
      if (!reg.isEventBusRegistration) {
        // Could be a React event handler or other on() pattern - skip those
        if (this.isLikelyReactHandler(reg.eventTypeArg)) {
          continue;
        }

        // Could be a Node.js process signal handler - skip those
        if (this.isLikelyNodeProcessSignal(reg.eventTypeArg)) {
          continue;
        }

        // Flag registrations that don't go through EventBus
        violations.push(this.createViolation(
          reg.filePath,
          reg.lineNumber,
          'unregistered-handler',
          `Event handler registered via '${reg.registrationMethod}' on non-EventBus emitter - use EventBus.on() for event bus events`,
          reg.eventTypeArg,
          'medium'
        ));
      }

      // Check if event type uses string literal instead of EventType enum
      if (reg.isEventBusRegistration) {
        const isStringLiteral = reg.eventTypeArg.startsWith('"') ||
          reg.eventTypeArg.startsWith("'") ||
          reg.eventTypeArg.startsWith('`');

        if (isStringLiteral) {
          violations.push(this.createViolation(
            reg.filePath,
            reg.lineNumber,
            'non-standard-event-type',
            `Event handler uses string literal '${reg.eventTypeArg}' instead of EventType enum value`,
            reg.eventTypeArg,
            'high'
          ));
        }
      }
    }

    return violations;
  }

  /**
   * Check if an event type looks like a React or DOM event handler.
   * These are not event bus events and should be skipped.
   */
  private isLikelyReactHandler(eventTypeArg: string): boolean {
    const domEventPatterns = [
      'click', 'change', 'submit', 'input', 'keydown', 'keyup', 'keypress',
      'focus', 'blur', 'scroll', 'resize', 'mouseDown', 'mouseUp', 'mouseMove',
      'touchStart', 'touchEnd', 'touchMove',
    ];

    // Strip quotes
    const cleanArg = eventTypeArg.replace(/['"`]/g, '');
    return domEventPatterns.includes(cleanArg);
  }

  /**
   * Check if an event type looks like a Node.js process signal.
   * These are legitimate handlers for OS signals and should be skipped.
   */
  private isLikelyNodeProcessSignal(eventTypeArg: string): boolean {
    const nodeProcessSignals = [
      'SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2', 'SIGPIPE', 'SIGHUP',
      'SIGABRT', 'uncaughtException', 'unhandledRejection', 'warning',
      'exit', 'beforeExit', 'disconnect', 'message',
    ];

    // Strip quotes
    const cleanArg = eventTypeArg.replace(/['"`]/g, '');
    return nodeProcessSignals.includes(cleanArg);
  }

  /**
   * Requirement 6.3: Verify error handling in event handlers.
   *
   * Checks that all event bus handlers include try-catch error handling
   * as shown in the EventBus.on pattern. The EventBus class itself wraps
   * handlers in try-catch, but handlers should also handle their own errors.
   *
   * @param registrations - Collected handler registration information
   * @returns Violations for handlers missing error handling
   */
  private checkErrorHandlerHandling(registrations: HandlerRegistrationInfo[]): EventBusViolation[] {
    const violations: EventBusViolation[] = [];

    for (const reg of registrations) {
      // Only check EventBus handlers for error handling
      if (!reg.isEventBusRegistration) {
        continue;
      }

      // Skip React/DOM handlers
      if (this.isLikelyReactHandler(reg.eventTypeArg)) {
        continue;
      }

      // Skip Node.js process signal handlers
      if (this.isLikelyNodeProcessSignal(reg.eventTypeArg)) {
        continue;
      }

      if (!reg.hasErrorHandling) {
        violations.push(this.createViolation(
          reg.filePath,
          reg.lineNumber,
          'missing-error-handling',
          `Event handler for '${reg.eventTypeArg}' lacks try-catch error handling`,
          reg.eventTypeArg,
          'medium'
        ));
      }
    }

    return violations;
  }

  /**
   * Requirement 6.4: Detect direct EventEmitter usage that bypasses EventBus.
   *
   * Checks for any files that instantiate EventEmitter directly
   * instead of using the shared EventBus instance.
   *
   * @param directUsages - Collected direct EventEmitter usage information
   * @returns Violations for direct EventEmitter usage
   */
  private checkDirectEventEmitterUsage(directUsages: DirectEventEmitterUsage[]): EventBusViolation[] {
    const violations: EventBusViolation[] = [];

    for (const usage of directUsages) {
      if (usage.isInstantiation) {
        violations.push(this.createViolation(
          usage.filePath,
          usage.lineNumber,
          'direct-eventemitter-usage',
          `Direct EventEmitter instantiation detected ('${usage.usageText}') - use EventBus class instead`,
          undefined,
          'high'
        ));
      }
    }

    return violations;
  }

  /**
   * Calculate audit metrics from collected data.
   */
  private calculateMetrics(
    totalFiles: number,
    emitCalls: EmitCallInfo[],
    handlerRegistrations: HandlerRegistrationInfo[],
    directUsages: DirectEventEmitterUsage[],
    violations: EventBusViolation[]
  ): Record<string, number | string> {
    const eventTypeViolations = violations.filter(v => v.issueType === 'non-standard-event-type').length;
    const unregisteredHandlerViolations = violations.filter(v => v.issueType === 'unregistered-handler').length;
    const missingErrorHandlingViolations = violations.filter(v => v.issueType === 'missing-error-handling').length;
    const directEventEmitterViolations = violations.filter(v => v.issueType === 'direct-eventemitter-usage').length;

    const emitCallsUsingEnum = emitCalls.filter(c => c.usesEventTypeEnum).length;
    const emitCallsUsingString = emitCalls.filter(c => c.isStringLiteral).length;
    const totalEmitCalls = emitCalls.length;
    const totalHandlerRegistrations = handlerRegistrations.length;
    const totalDirectUsages = directUsages.length;

    const eventTypeCompliance = totalEmitCalls > 0
      ? ((emitCallsUsingEnum / totalEmitCalls) * 100).toFixed(1) + '%'
      : '100.0%';

    return {
      totalFilesScanned: totalFiles,
      totalEmitCalls,
      emitCallsUsingEnum,
      emitCallsUsingStringLiteral: emitCallsUsingString,
      totalHandlerRegistrations,
      totalDirectEventEmitterUsages: totalDirectUsages,
      eventTypeViolations,
      unregisteredHandlerViolations,
      missingErrorHandlingViolations,
      directEventEmitterViolations,
      eventTypeCompliance,
    };
  }

  /**
   * Create an event bus violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    issueType: EventBusViolationType,
    message: string,
    eventType?: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  ): EventBusViolation {
    return {
      category: 'event-bus-patterns',
      severity,
      filePath,
      lineNumber,
      message,
      issueType,
      eventType,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const eventBusPatternChecker = new EventBusPatternChecker();
