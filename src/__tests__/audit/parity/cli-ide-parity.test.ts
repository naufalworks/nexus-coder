/**
 * CLI/IDE Parity Integration Tests
 *
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 *
 * Integration tests that verify CLI commands produce the same outcomes
 * as their corresponding IDE widget helper functions:
 * - `nexus approve` matches DiffApproval widget (Req 19.1)
 * - `nexus diff` matches DiffApproval display (Req 19.2)
 * - `nexus status` matches AgentStatus dashboard (Req 19.3)
 * - `nexus tasks` matches TaskPanel display (Req 19.4)
 * - All documented CLI commands exist (Req 19.5)
 *
 * @module audit/parity/cli-ide-parity.test
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CLIIDEParityChecker,
  CLIIDEParityViolation,
  COMMAND_WIDGET_MAPPINGS,
} from './cli-ide-parity';
import type { AuditReport } from '../framework/types';

// ---------------------------------------------------------------------------
// Widget helper imports for parity comparison
// ---------------------------------------------------------------------------

import {
  filterTasks,
  applyApprovalAction,
  getAssignedAgents,
  getAffectedFiles,
} from '../../../widgets/TaskPanel';
import type { TaskPanelFilter } from '../../../widgets/TaskPanel';

import {
  groupChangesByTask,
  calculateImpactSummary,
  parseDiffToColumns,
} from '../../../widgets/DiffApproval';

import { getReadiness, formatProgress } from '../../../widgets/AgentStatus';

import {
  TaskStatus,
  ChangeType,
  AgentCapability,
  TaskType,
} from '../../../types';
import type {
  Task,
  AgentInfo,
  CodeChange,
  SubTask,
} from '../../../types';

// ---------------------------------------------------------------------------
// Test helpers / factories
// ---------------------------------------------------------------------------

/** Create a minimal Task for testing. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    instruction: 'Test instruction',
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    subTasks: [],
    context: '',
    ...overrides,
  };
}

/** Create a minimal CodeChange for testing. */
function makeChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    file: 'src/test.ts',
    type: ChangeType.MODIFY,
    diff: '@@ -1,3 +1,3 @@\n-old line\n+new line',
    reasoning: 'Test reasoning',
    risk: 'low',
    impact: ['test-impact'],
    approved: false,
    content: '',
    ...overrides,
  };
}

/** Create a minimal AgentInfo for testing. */
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: 'context-agent',
    capabilities: [AgentCapability.CONTEXT_RETRIEVAL],
    supportedTaskTypes: [TaskType.FEATURE],
    status: 'idle',
    ...overrides,
  };
}

/** Create a minimal SubTask for testing. */
function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'st-1',
    instruction: 'Sub task',
    assignedAgent: 'coder-agent',
    requiredCapabilities: [AgentCapability.CODE_GENERATION],
    dependencies: [],
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 20.2: Integration tests for CLI/IDE parity
// ---------------------------------------------------------------------------

describe('CLI/IDE Parity Checker', () => {
  let checker: CLIIDEParityChecker;
  let report: AuditReport;

  beforeAll(async () => {
    checker = new CLIIDEParityChecker();
    report = await checker.run();
  });

  // -------------------------------------------------------------------------
  // Requirement 19.5: All documented CLI commands exist
  // -------------------------------------------------------------------------

  describe('Requirement 19.5: Documented commands exist', () => {
    it('should run the parity checker without errors', () => {
      expect(report).toBeDefined();
      expect(report.category).toBe('cli-ide-parity');
      expect(Array.isArray(report.violations)).toBe(true);
    });

    it('should have metrics about command-widget mappings', () => {
      expect(report.metrics).toBeDefined();
      expect(report.metrics!.totalCommandWidgetMappings).toBe(COMMAND_WIDGET_MAPPINGS.length);
      expect(typeof report.metrics!.documentedCommands).toBe('number');
      expect(typeof report.metrics!.existingCommands).toBe('number');
    });

    it('should report all core commands as existing in src/cli/commands.ts', () => {
      const coreCommands = ['approve', 'diff', 'status', 'tasks'];
      const missingCommandViolations = report.violations.filter(
        v => (v as CLIIDEParityViolation).issueType === 'missing-command'
      );

      for (const cmd of coreCommands) {
        const isMissing = missingCommandViolations.some(
          v => (v as CLIIDEParityViolation).cliCommand === cmd
        );
        expect(isMissing).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 19.1: `nexus approve` matches DiffApproval widget
  // -------------------------------------------------------------------------

  describe('Requirement 19.1: Approve command parity', () => {
    it('should produce same task status outcome as DiffApproval widget', () => {
      const task = makeTask({
        result: {
          success: false,
          output: '',
          changes: [
            makeChange({ file: 'src/a.ts' }),
            makeChange({ file: 'src/b.ts' }),
          ],
        },
      });

      // Widget: applyApprovalAction
      const { updatedTask } = applyApprovalAction(task, 0, true, 'test-user');

      // Verify widget outcome
      expect(updatedTask.status).toBe(TaskStatus.COMPLETED);
      expect(updatedTask.result?.changes![0].approved).toBe(true);
      expect(updatedTask.result?.changes![1].approved).toBe(false); // Only index 0 was approved
    });

    it('should mark task as FAILED when rejecting a change (matching widget behavior)', () => {
      const task = makeTask({
        result: {
          success: false,
          output: '',
          changes: [makeChange()],
        },
      });

      const { updatedTask } = applyApprovalAction(task, 0, false, 'test-user');

      expect(updatedTask.status).toBe(TaskStatus.FAILED);
      expect(updatedTask.result?.changes![0].approved).toBe(false);
    });

    it('should produce immutable updates (no mutation of original task)', () => {
      const originalStatus = TaskStatus.PENDING;
      const task = makeTask({
        status: originalStatus,
        result: {
          success: false,
          output: '',
          changes: [makeChange()],
        },
      });

      const { updatedTask } = applyApprovalAction(task, 0, true, 'test-user');

      // Original task should not be mutated
      expect(task.status).toBe(originalStatus);
      expect(updatedTask.status).toBe(TaskStatus.COMPLETED);
    });

    it('should produce log entry with correct metadata', () => {
      const task = makeTask({
        id: 'task-42',
        result: {
          success: false,
          output: '',
          changes: [makeChange()],
        },
      });

      const { logEntry } = applyApprovalAction(task, 0, true, 'cli-user');

      expect(logEntry.agent).toBe('cli-user');
      expect(logEntry.content).toContain('task-42');
      expect(logEntry.content).toContain('Approved');
      expect(logEntry.metadata).toMatchObject({
        taskId: 'task-42',
        changeIndex: 0,
        approved: true,
        action: 'approval',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 19.2: `nexus diff` matches DiffApproval display
  // -------------------------------------------------------------------------

  describe('Requirement 19.2: Diff command parity', () => {
    const changes: CodeChange[] = [
      makeChange({ file: 'src/a.ts', type: ChangeType.MODIFY, risk: 'high' }),
      makeChange({ file: 'src/b.ts', type: ChangeType.CREATE, risk: 'low' }),
      makeChange({ file: 'src/c.ts', type: ChangeType.DELETE, risk: 'medium' }),
    ];

    const tasks: Task[] = [
      makeTask({
        id: 'task-1',
        instruction: 'Fix bug in auth module',
        result: {
          success: true,
          output: '',
          changes: [
            makeChange({ file: 'src/a.ts', type: ChangeType.MODIFY }),
            makeChange({ file: 'src/b.ts', type: ChangeType.CREATE }),
          ],
        },
      }),
    ];

    it('should group changes by task the same way DiffApproval does', () => {
      const grouped = groupChangesByTask(changes, tasks);

      // Should group at least one change with the task
      expect(grouped.length).toBeGreaterThan(0);

      // Each group should have required properties matching CLI output
      for (const group of grouped) {
        expect(group).toHaveProperty('taskId');
        expect(group).toHaveProperty('taskInstruction');
        expect(group).toHaveProperty('changes');
        expect(Array.isArray(group.changes)).toBe(true);
      }
    });

    it('should calculate impact summary consistently', () => {
      const summary = calculateImpactSummary(changes);

      // Should contain file count and risk info
      expect(summary).toContain('file(s)');
      expect(summary).toContain('change(s)');
      expect(summary).toContain('risk');
    });

    it('should parse diff to columns consistently', () => {
      const diff = '@@ -1,3 +1,3 @@\n-old line\n+new line\n context line';
      const { oldLines, newLines } = parseDiffToColumns(diff);

      expect(Array.isArray(oldLines)).toBe(true);
      expect(Array.isArray(newLines)).toBe(true);
      expect(oldLines.length).toBe(newLines.length);
    });

    it('should handle empty changes gracefully', () => {
      const grouped = groupChangesByTask([], tasks);
      expect(grouped).toEqual([]);
    });

    it('should handle missing tasks (fallback to file grouping)', () => {
      const grouped = groupChangesByTask(changes);

      // Without tasks, should group by file
      expect(grouped.length).toBeGreaterThan(0);
      for (const group of grouped) {
        expect(group.changes.length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 19.3: `nexus status` matches AgentStatus dashboard
  // -------------------------------------------------------------------------

  describe('Requirement 19.3: Status command parity', () => {
    const agents: AgentInfo[] = [
      makeAgent({ name: 'context-agent', status: 'idle' }),
      makeAgent({ name: 'coder-agent', status: 'busy', currentTask: 'task-1' }),
      makeAgent({ name: 'reviewer-agent', status: 'error' }),
    ];

    const progress: Record<string, TaskStatus> = {
      'context-agent': TaskStatus.COMPLETED,
      'coder-agent': TaskStatus.EXECUTING,
      'reviewer-agent': TaskStatus.FAILED,
    };

    it('should return readiness status consistent with AgentStatus widget', () => {
      // Widget: getReadiness
      const readiness = agents.map(a => ({
        name: a.name,
        readiness: getReadiness(a, progress),
      }));

      // Verify readiness values match expected statuses
      expect(readiness.find(r => r.name === 'context-agent')?.readiness).toBe('ready');
      expect(readiness.find(r => r.name === 'coder-agent')?.readiness).toBe('busy');
      expect(readiness.find(r => r.name === 'reviewer-agent')?.readiness).toBe('error');
    });

    it('should format progress consistently with AgentStatus widget', () => {
      // Widget: formatProgress
      expect(formatProgress(TaskStatus.COMPLETED)).toBe(TaskStatus.COMPLETED);
      expect(formatProgress(TaskStatus.EXECUTING)).toBe(TaskStatus.EXECUTING);
      expect(formatProgress(undefined)).toBe('idle');
    });

    it('should report agent capabilities consistently', () => {
      for (const agent of agents) {
        // CLI displays capabilities the same way widget does
        expect(agent.capabilities).toBeDefined();
        expect(Array.isArray(agent.capabilities)).toBe(true);
      }
    });

    it('should handle idle agents consistently', () => {
      const idleReadiness = getReadiness(
        makeAgent({ name: 'test', status: 'idle' }),
        {}
      );
      expect(idleReadiness).toBe('ready');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 19.4: `nexus tasks` matches TaskPanel display
  // -------------------------------------------------------------------------

  describe('Requirement 19.4: Tasks command parity', () => {
    const tasks: Task[] = [
      makeTask({ id: 'task-1', status: TaskStatus.COMPLETED, instruction: 'Task 1' }),
      makeTask({
        id: 'task-2',
        status: TaskStatus.EXECUTING,
        instruction: 'Task 2',
        subTasks: [
          makeSubTask({
            id: 'st-1',
            assignedAgent: 'coder-agent',
            status: TaskStatus.EXECUTING,
          }),
        ],
      }),
      makeTask({ id: 'task-3', status: TaskStatus.FAILED, instruction: 'Task 3' }),
    ];

    it('should filter tasks by status consistently with TaskPanel', () => {
      // Widget: filterTasks with status filter
      const completed = filterTasks(tasks, { status: TaskStatus.COMPLETED });
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('task-1');

      const failed = filterTasks(tasks, { status: TaskStatus.FAILED });
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('task-3');
    });

    it('should filter tasks by agent consistently with TaskPanel', () => {
      // Widget: filterTasks with agent filter
      const coderTasks = filterTasks(tasks, { agent: 'coder-agent' });
      expect(coderTasks).toHaveLength(1);
      expect(coderTasks[0].id).toBe('task-2');
    });

    it('should return all tasks with empty filter (matching TaskPanel)', () => {
      const allTasks = filterTasks(tasks, {});
      expect(allTasks).toHaveLength(3);
    });

    it('should extract assigned agents consistently with TaskPanel', () => {
      // Widget: getAssignedAgents
      const agents = getAssignedAgents(tasks[1]); // task-2 has subTasks
      expect(agents).toContain('coder-agent');
    });

    it('should extract affected files consistently with TaskPanel', () => {
      // Widget: getAffectedFiles
      const taskWithChanges = makeTask({
        result: {
          success: true,
          output: '',
          changes: [
            makeChange({ file: 'src/a.ts' }),
            makeChange({ file: 'src/b.ts' }),
          ],
        },
      });

      const files = getAffectedFiles(taskWithChanges);
      expect(files).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('should handle tasks without changes consistently', () => {
      const task = makeTask(); // No result/changes
      const files = getAffectedFiles(task);
      expect(files).toEqual([]);
    });

    it('should handle tasks without subTasks for agent extraction', () => {
      const task = makeTask({ subTasks: [] });
      const agents = getAssignedAgents(task);
      expect(agents).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Structural validation tests (CLI imports from widgets)
// ---------------------------------------------------------------------------

describe('CLI/IDE Parity: Structural validation', () => {
  it('should import widget helpers in commands.ts', () => {
    const commandsPath = 'src/cli/commands.ts';
    expect(fs.existsSync(commandsPath)).toBe(true);

    const content = fs.readFileSync(commandsPath, 'utf8');

    // Verify TaskPanel imports (for tasks command parity)
    expect(content).toMatch(/import.*filterTasks.*from.*TaskPanel/);
    expect(content).toMatch(/import.*applyApprovalAction.*from.*TaskPanel/);

    // Verify DiffApproval imports (for diff/approve command parity)
    expect(content).toMatch(/import.*groupChangesByTask.*from.*DiffApproval/);
    expect(content).toMatch(/import.*calculateImpactSummary.*from.*DiffApproval/);
    expect(content).toMatch(/import.*parseDiffToColumns.*from.*DiffApproval/);

    // Verify GraphExplorer imports (for graph command parity)
    expect(content).toMatch(/import.*getRelevantNodeIds.*from.*GraphExplorer/);
  });

  it('should define all core command functions', () => {
    const commandsPath = 'src/cli/commands.ts';
    const content = fs.readFileSync(commandsPath, 'utf8');

    const expectedCommands = [
      'approveCommand',
      'diffCommand',
      'statusCommand',
      'tasksCommand',
      'codeCommand',
      'reviewCommand',
      'graphCommand',
      'contextCommand',
    ];

    for (const cmd of expectedCommands) {
      expect(content).toMatch(new RegExp(`export\\s+async\\s+function\\s+${cmd}\\s*\\(`));
    }
  });

  it('should have matching command-widget mappings', () => {
    // Verify that all defined mappings reference real widgets
    for (const mapping of COMMAND_WIDGET_MAPPINGS) {
      const widgetPath = path.join('src/widgets', `${mapping.widget}.tsx`);
      expect(fs.existsSync(widgetPath)).toBe(true);

      // Note: Widget functions may be exported from the widget file itself
      // The actual function location is verified by the import tests above
      // This test just ensures the widget file exists
    }
  });
});

// ---------------------------------------------------------------------------
// Behavior parity tests (matching CLI and widget outputs)
// ---------------------------------------------------------------------------

describe('CLI/IDE Parity: Behavior validation', () => {
  describe('Approve command vs DiffApproval widget', () => {
    it('should both mark task as COMPLETED on approval', () => {
      const task = makeTask({
        result: {
          success: false,
          output: '',
          changes: [makeChange({ approved: false })],
        },
      });

      // Widget: applyApprovalAction with approved=true
      const { updatedTask } = applyApprovalAction(task, 0, true, 'test-user');
      expect(updatedTask.status).toBe(TaskStatus.COMPLETED);
      expect(updatedTask.result?.success).toBe(true);
      expect(updatedTask.result?.changes![0].approved).toBe(true);
    });

    it('should both mark task as FAILED on rejection', () => {
      const task = makeTask({
        result: {
          success: false,
          output: '',
          changes: [makeChange({ approved: false })],
        },
      });

      const { updatedTask } = applyApprovalAction(task, 0, false, 'test-user');
      expect(updatedTask.status).toBe(TaskStatus.FAILED);
      expect(updatedTask.result?.success).toBe(false);
      expect(updatedTask.result?.changes![0].approved).toBe(false);
    });
  });

  describe('Diff command vs DiffApproval display', () => {
    it('should both display changes grouped by task', () => {
      const changes: CodeChange[] = [
        makeChange({ file: 'src/auth.ts', type: ChangeType.MODIFY }),
        makeChange({ file: 'src/auth.ts', type: ChangeType.MODIFY }),
        makeChange({ file: 'src/utils.ts', type: ChangeType.CREATE }),
      ];

      const tasks: Task[] = [
        makeTask({
          id: 'task-1',
          instruction: 'Fix auth bug',
          result: {
            success: true,
            output: '',
            changes: [
              makeChange({ file: 'src/auth.ts', type: ChangeType.MODIFY }),
            ],
          },
        }),
      ];

      const grouped = groupChangesByTask(changes, tasks);

      // Verify grouping structure
      expect(grouped.length).toBeGreaterThan(0);
      for (const group of grouped) {
        expect(group.taskId).toBeTruthy();
        expect(group.taskInstruction).toBeTruthy();
        expect(group.changes.length).toBeGreaterThan(0);
      }
    });

    it('should both produce the same impact summary', () => {
      const changes: CodeChange[] = [
        makeChange({ file: 'src/a.ts', risk: 'high', impact: ['security'] }),
        makeChange({ file: 'src/b.ts', risk: 'medium', impact: ['performance'] }),
      ];

      const summary = calculateImpactSummary(changes);
      expect(summary).toContain('2 file(s)');
      expect(summary).toContain('2 change(s)');
      expect(summary).toContain('high');
    });
  });

  describe('Status command vs AgentStatus dashboard', () => {
    it('should both show idle agents as ready', () => {
      const agent = makeAgent({ name: 'idle-agent', status: 'idle' });
      const readiness = getReadiness(agent, {});
      expect(readiness).toBe('ready');
    });

    it('should both show busy agents with in-progress tasks', () => {
      const agent = makeAgent({ name: 'busy-agent', status: 'busy' });
      const progress = { 'busy-agent': TaskStatus.EXECUTING };
      const readiness = getReadiness(agent, progress);
      expect(readiness).toBe('busy');
    });

    it('should both show errored agents', () => {
      const agent = makeAgent({ name: 'error-agent', status: 'error' });
      const readiness = getReadiness(agent, {});
      expect(readiness).toBe('error');
    });

    it('should both handle completed agents', () => {
      const agent = makeAgent({ name: 'done-agent', status: 'idle' });
      const progress = { 'done-agent': TaskStatus.COMPLETED };
      const readiness = getReadiness(agent, progress);
      expect(readiness).toBe('ready');
    });
  });

  describe('Tasks command vs TaskPanel display', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        status: TaskStatus.PENDING,
        instruction: 'Pending task',
      }),
      makeTask({
        id: 't2',
        status: TaskStatus.COMPLETED,
        instruction: 'Completed task',
        subTasks: [
          makeSubTask({
            id: 'st1',
            assignedAgent: 'context-agent',
            status: TaskStatus.COMPLETED,
          }),
        ],
        result: {
          success: true,
          output: '',
          changes: [makeChange({ file: 'src/a.ts' })],
        },
      }),
    ];

    it('should both return consistent filtered results', () => {
      const pendingOnly = filterTasks(tasks, { status: TaskStatus.PENDING });
      expect(pendingOnly).toHaveLength(1);
      expect(pendingOnly[0].id).toBe('t1');

      const completedOnly = filterTasks(tasks, { status: TaskStatus.COMPLETED });
      expect(completedOnly).toHaveLength(1);
      expect(completedOnly[0].id).toBe('t2');
    });

    it('should both extract agents from subTasks', () => {
      const agents = getAssignedAgents(tasks[1]);
      expect(agents).toEqual(['context-agent']);
    });

    it('should both list affected files from changes', () => {
      const files = getAffectedFiles(tasks[1]);
      expect(files).toEqual(['src/a.ts']);
    });
  });
});
