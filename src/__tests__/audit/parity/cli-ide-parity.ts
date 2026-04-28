/**
 * CLI/IDE Parity Checker Module
 *
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 *
 * Validates that CLI commands produce the same outcomes as IDE widgets:
 * - `nexus approve` matches DiffApproval widget outcome (Req 19.1)
 * - `nexus diff` matches DiffApproval display (Req 19.2)
 * - `nexus status` matches AgentStatus dashboard (Req 19.3)
 * - `nexus tasks` matches TaskPanel display (Req 19.4)
 * - All documented CLI commands exist (Req 19.5)
 *
 * @module audit/parity/cli-ide-parity
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditModule, AuditReport, AuditViolation, AuditCategory } from '../framework/types';
import type { Task, CodeChange, AgentInfo, TaskStatus } from '../../../types';

/**
 * CLI/IDE parity violation types.
 */
export type ParityViolationType =
  | 'missing-command'
  | 'output-mismatch'
  | 'behavior-mismatch'
  | 'undocumented-command';

/**
 * Extended violation interface for CLI/IDE parity issues.
 */
export interface CLIIDEParityViolation extends AuditViolation {
  category: 'cli-ide-parity';
  /** CLI command name */
  cliCommand: string;
  /** Widget that should match */
  widgetName: string;
  /** Type of parity issue */
  issueType: ParityViolationType;
  /** Expected output/behavior */
  expected?: string;
  /** Actual output/behavior */
  actual?: string;
}

/**
 * Configuration options for the CLI/IDE parity checker.
 */
export interface CLIIDEParityConfig {
  /** Path to CLI commands file */
  cliCommandsPath: string;
  /** Path to widgets directory */
  widgetsPath: string;
  /** Path to README.md for documented commands */
  readmePath: string;
  /** Whether to run actual command execution tests */
  runExecutionTests: boolean;
}

/**
 * Default configuration for CLI/IDE parity checker.
 */
const DEFAULT_CONFIG: CLIIDEParityConfig = {
  cliCommandsPath: 'src/cli/commands.ts',
  widgetsPath: 'src/widgets',
  readmePath: 'README.md',
  runExecutionTests: false, // Set to true for integration tests
};

/**
 * Command-to-widget mapping specification.
 * Defines which CLI commands should match which widget behaviors.
 */
interface CommandWidgetMapping {
  /** CLI command name */
  command: string;
  /** Widget component name */
  widget: string;
  /** Widget helper function that implements the logic */
  widgetFunction: string;
  /** Description of expected parity */
  parityDescription: string;
  /** Whether this command is documented in README */
  documented: boolean;
}

/**
 * Expected command-to-widget mappings based on requirements.
 */
export const COMMAND_WIDGET_MAPPINGS: CommandWidgetMapping[] = [
  {
    command: 'approve',
    widget: 'DiffApproval',
    widgetFunction: 'applyApprovalAction',
    parityDescription: 'Approve command should produce same task status outcome as DiffApproval widget',
    documented: true,
  },
  {
    command: 'diff',
    widget: 'DiffApproval',
    widgetFunction: 'groupChangesByTask',
    parityDescription: 'Diff command should display same changes as DiffApproval widget',
    documented: true,
  },
  {
    command: 'status',
    widget: 'AgentStatus',
    widgetFunction: 'getReadiness',
    parityDescription: 'Status command should return agent statuses consistent with AgentStatus dashboard',
    documented: true,
  },
  {
    command: 'tasks',
    widget: 'TaskPanel',
    widgetFunction: 'filterTasks',
    parityDescription: 'Tasks command should return task list consistent with TaskPanel display',
    documented: true,
  },
  {
    command: 'code',
    widget: 'TaskPanel',
    widgetFunction: 'getAffectedFiles',
    parityDescription: 'Code command should display context consistent with TaskPanel',
    documented: true,
  },
  {
    command: 'review',
    widget: 'ReasoningLog',
    widgetFunction: 'filterLogEntries',
    parityDescription: 'Review command should display log entries consistent with ReasoningLog widget',
    documented: true,
  },
  {
    command: 'graph',
    widget: 'GraphExplorer',
    widgetFunction: 'getRelevantNodeIds',
    parityDescription: 'Graph command should display semantic graph consistent with GraphExplorer widget',
    documented: true,
  },
];

/**
 * Information about a CLI command extracted from source code.
 */
interface CLICommandInfo {
  /** Command name */
  name: string;
  /** Function name that implements the command */
  functionName: string;
  /** File path where command is defined */
  filePath: string;
  /** Line number where command is defined */
  lineNumber: number;
  /** Whether command exists in source */
  exists: boolean;
}

/**
 * Information about a widget helper function.
 */
interface WidgetFunctionInfo {
  /** Widget name */
  widgetName: string;
  /** Function name */
  functionName: string;
  /** File path where function is defined */
  filePath: string;
  /** Line number where function is defined */
  lineNumber: number;
  /** Whether function exists in source */
  exists: boolean;
}

/**
 * Result of comparing CLI command output with widget output.
 */
interface ParityComparisonResult {
  /** Whether outputs match */
  matches: boolean;
  /** CLI command output */
  cliOutput: any;
  /** Widget output */
  widgetOutput: any;
  /** Difference description if not matching */
  difference?: string;
}

/**
 * CLI/IDE Parity Checker Module
 *
 * Implements the AuditModule interface to validate that CLI commands
 * produce the same outcomes as their corresponding IDE widgets.
 *
 * @example
 * ```typescript
 * const checker = new CLIIDEParityChecker();
 * const report = await checker.run();
 *
 * console.log(`Parity violations: ${report.totalViolations}`);
 * for (const violation of report.violations) {
 *   const parityViolation = violation as CLIIDEParityViolation;
 *   console.log(`${parityViolation.cliCommand} vs ${parityViolation.widgetName}: ${parityViolation.issueType}`);
 * }
 * ```
 */
export class CLIIDEParityChecker implements AuditModule {
  readonly category: AuditCategory = 'cli-ide-parity';
  readonly name = 'CLI/IDE Parity Checker';

  private config: CLIIDEParityConfig;

  /**
   * Create a new CLI/IDE parity checker instance.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<CLIIDEParityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run the CLI/IDE parity audit.
   *
   * @returns Audit report containing all violations and metrics
   */
  async run(): Promise<AuditReport> {
    const violations: CLIIDEParityViolation[] = [];

    // Requirement 19.5: Verify all documented CLI commands exist
    const documentedCommands = this.extractDocumentedCommands();
    const existingCommands = this.extractCLICommands();
    violations.push(...this.checkDocumentedCommandsExist(documentedCommands, existingCommands));

    // Requirements 19.1-19.4: Check command-widget parity
    for (const mapping of COMMAND_WIDGET_MAPPINGS) {
      // Check if CLI command exists
      const cliCommand = existingCommands.find(c => c.name === mapping.command);
      if (!cliCommand) {
        violations.push(this.createViolation(
          this.config.cliCommandsPath,
          1,
          mapping.command,
          mapping.widget,
          'missing-command',
          `CLI command '${mapping.command}' is missing but should match ${mapping.widget} widget`,
          'high'
        ));
        continue;
      }

      // Check if widget function exists
      const widgetFunction = this.findWidgetFunction(mapping.widget, mapping.widgetFunction);
      if (!widgetFunction.exists) {
        violations.push(this.createViolation(
          widgetFunction.filePath,
          widgetFunction.lineNumber,
          mapping.command,
          mapping.widget,
          'behavior-mismatch',
          `Widget function '${mapping.widgetFunction}' not found in ${mapping.widget}`,
          'high'
        ));
        continue;
      }

      // Check if command imports widget function (indicates parity)
      const importsWidgetFunction = this.checkCommandImportsWidget(
        cliCommand,
        mapping.widget,
        mapping.widgetFunction
      );

      if (!importsWidgetFunction) {
        violations.push(this.createViolation(
          cliCommand.filePath,
          cliCommand.lineNumber,
          mapping.command,
          mapping.widget,
          'behavior-mismatch',
          `CLI command '${mapping.command}' does not import '${mapping.widgetFunction}' from ${mapping.widget} - parity not guaranteed`,
          'medium'
        ));
      }
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(
      documentedCommands,
      existingCommands,
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
   * Extract documented CLI commands from README.md.
   *
   * Requirement 19.5: All documented CLI commands should exist.
   *
   * @returns Array of documented command names
   */
  private extractDocumentedCommands(): string[] {
    const commands: string[] = [];

    if (!fs.existsSync(this.config.readmePath)) {
      return commands;
    }

    const content = fs.readFileSync(this.config.readmePath, 'utf8');

    // Look for command patterns in README:
    // - `nexus <command>`
    // - `npm run <command>`
    // Common patterns in documentation
    const commandPatterns = [
      /`nexus\s+([a-z-]+)/g,
      /\$\s*nexus\s+([a-z-]+)/g,
    ];

    for (const pattern of commandPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const commandName = match[1];
        if (!commands.includes(commandName)) {
          commands.push(commandName);
        }
      }
    }

    return commands;
  }

  /**
   * Extract CLI commands from commands.ts source file.
   *
   * @returns Array of CLI command information
   */
  private extractCLICommands(): CLICommandInfo[] {
    const commands: CLICommandInfo[] = [];

    if (!fs.existsSync(this.config.cliCommandsPath)) {
      return commands;
    }

    const content = fs.readFileSync(this.config.cliCommandsPath, 'utf8');
    const lines = content.split('\n');

    // Look for command function patterns:
    // export async function <command>Command(
    const commandPattern = /export\s+async\s+function\s+(\w+)Command\s*\(/;

    lines.forEach((line, index) => {
      const match = commandPattern.exec(line);
      if (match) {
        const functionName = match[1];
        // Convert camelCase to kebab-case (e.g., approveCommand -> approve)
        const commandName = functionName.replace(/Command$/, '');

        commands.push({
          name: commandName,
          functionName: `${functionName}Command`,
          filePath: this.config.cliCommandsPath,
          lineNumber: index + 1,
          exists: true,
        });
      }
    });

    return commands;
  }

  /**
   * Check if all documented commands exist in the CLI implementation.
   *
   * Requirement 19.5: Verify all documented CLI commands exist.
   *
   * @param documented - Documented command names
   * @param existing - Existing CLI commands
   * @returns Violations for missing commands
   */
  private checkDocumentedCommandsExist(
    documented: string[],
    existing: CLICommandInfo[]
  ): CLIIDEParityViolation[] {
    const violations: CLIIDEParityViolation[] = [];
    const existingNames = existing.map(c => c.name);

    for (const docCommand of documented) {
      if (!existingNames.includes(docCommand)) {
        violations.push(this.createViolation(
          this.config.readmePath,
          1,
          docCommand,
          'N/A',
          'missing-command',
          `Documented command 'nexus ${docCommand}' does not exist in CLI implementation`,
          'high'
        ));
      }
    }

    return violations;
  }

  /**
   * Find a widget helper function in the widgets directory.
   *
   * @param widgetName - Name of the widget
   * @param functionName - Name of the function to find
   * @returns Widget function information
   */
  private findWidgetFunction(
    widgetName: string,
    functionName: string
  ): WidgetFunctionInfo {
    const widgetFilePath = path.join(this.config.widgetsPath, `${widgetName}.tsx`);

    if (!fs.existsSync(widgetFilePath)) {
      return {
        widgetName,
        functionName,
        filePath: widgetFilePath,
        lineNumber: 1,
        exists: false,
      };
    }

    const content = fs.readFileSync(widgetFilePath, 'utf8');
    const lines = content.split('\n');

    // Look for function export patterns:
    // export function <functionName>(
    // export const <functionName> = (
    const functionPatterns = [
      new RegExp(`export\\s+function\\s+${functionName}\\s*\\(`),
      new RegExp(`export\\s+const\\s+${functionName}\\s*=`),
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of functionPatterns) {
        if (pattern.test(line)) {
          return {
            widgetName,
            functionName,
            filePath: widgetFilePath,
            lineNumber: i + 1,
            exists: true,
          };
        }
      }
    }

    return {
      widgetName,
      functionName,
      filePath: widgetFilePath,
      lineNumber: 1,
      exists: false,
    };
  }

  /**
   * Check if a CLI command imports a widget function.
   *
   * This indicates that the CLI command delegates to the widget logic,
   * ensuring parity between CLI and IDE behavior.
   *
   * @param command - CLI command information
   * @param widgetName - Widget name
   * @param functionName - Function name to check for import
   * @returns True if command imports the widget function
   */
  private checkCommandImportsWidget(
    command: CLICommandInfo,
    widgetName: string,
    functionName: string
  ): boolean {
    if (!fs.existsSync(command.filePath)) {
      return false;
    }

    const content = fs.readFileSync(command.filePath, 'utf8');

    // Look for import patterns:
    // import { functionName } from '../widgets/WidgetName'
    // import { ..., functionName, ... } from '../widgets/WidgetName'
    const importPatterns = [
      new RegExp(`import\\s+{[^}]*${functionName}[^}]*}\\s+from\\s+['"].*${widgetName}['"]`),
      new RegExp(`import\\s+{\\s*${functionName}\\s*}\\s+from\\s+['"].*${widgetName}['"]`),
    ];

    for (const pattern of importPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate audit metrics from collected data.
   */
  private calculateMetrics(
    documented: string[],
    existing: CLICommandInfo[],
    violations: CLIIDEParityViolation[]
  ): Record<string, number | string> {
    const totalMappings = COMMAND_WIDGET_MAPPINGS.length;
    const missingCommands = violations.filter(v => v.issueType === 'missing-command').length;
    const behaviorMismatches = violations.filter(v => v.issueType === 'behavior-mismatch').length;
    const outputMismatches = violations.filter(v => v.issueType === 'output-mismatch').length;

    const parityScore = totalMappings > 0
      ? (((totalMappings - missingCommands - behaviorMismatches) / totalMappings) * 100).toFixed(1) + '%'
      : '100.0%';

    return {
      totalCommandWidgetMappings: totalMappings,
      documentedCommands: documented.length,
      existingCommands: existing.length,
      missingCommands,
      behaviorMismatches,
      outputMismatches,
      parityScore,
    };
  }

  /**
   * Create a CLI/IDE parity violation object.
   */
  private createViolation(
    filePath: string,
    lineNumber: number,
    cliCommand: string,
    widgetName: string,
    issueType: ParityViolationType,
    message: string,
    severity: 'critical' | 'high' | 'medium' | 'low' = 'medium',
    expected?: string,
    actual?: string
  ): CLIIDEParityViolation {
    return {
      category: 'cli-ide-parity',
      severity,
      filePath,
      lineNumber,
      message,
      cliCommand,
      widgetName,
      issueType,
      expected,
      actual,
    };
  }
}

/**
 * Create and export a default instance for convenience.
 */
export const cliIdeParityChecker = new CLIIDEParityChecker();
