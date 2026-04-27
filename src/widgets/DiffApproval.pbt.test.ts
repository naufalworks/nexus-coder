import * as fc from 'fast-check';
import { groupChangesByTask, calculateImpactSummary } from './DiffApproval';
import { CodeChange, Task, ChangeType, TaskStatus } from '../types';

/**
 * Property-Based Tests for DiffApproval Widget
 * 
 * **Validates: Requirements 2.1, 2.3**
 */

// Arbitraries for generating test data
const changeTypeArb = fc.constantFrom(
  ChangeType.CREATE,
  ChangeType.MODIFY,
  ChangeType.DELETE,
  ChangeType.REFACTOR
);

const riskArb = fc.constantFrom('low', 'medium', 'high') as fc.Arbitrary<'low' | 'medium' | 'high'>;

const codeChangeArb: fc.Arbitrary<CodeChange> = fc.record({
  file: fc.string({ minLength: 5, maxLength: 30 }).map((s: string) => `src/${s}.ts`),
  type: changeTypeArb,
  reasoning: fc.lorem({ maxCount: 10 }),
  impact: fc.array(fc.lorem({ maxCount: 5 }), { minLength: 1, maxLength: 3 }),
  risk: riskArb,
  diff: fc.lorem({ maxCount: 20 }),
  content: fc.lorem({ maxCount: 50 }),
  approved: fc.boolean(),
});

const taskStatusArb = fc.constantFrom(
  TaskStatus.PENDING,
  TaskStatus.EXECUTING,
  TaskStatus.COMPLETED,
  TaskStatus.FAILED
);

const taskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  instruction: fc.lorem({ maxCount: 10 }),
  subTasks: fc.constant([]),
  status: taskStatusArb,
  createdAt: fc.date(),
  updatedAt: fc.date(),
  result: fc.option(
    fc.record({
      success: fc.boolean(),
      output: fc.string(),
      changes: fc.array(codeChangeArb, { minLength: 0, maxLength: 5 }),
    }),
    { nil: undefined }
  ),
});

describe('DiffApproval Property-Based Tests', () => {
  describe('Property 2: Diff widget groups by logical task', () => {
    it('should group all changes when tasks are provided', () => {
      fc.assert(
        fc.property(
          fc.array(taskArb, { minLength: 1, maxLength: 5 }),
          (tasks) => {
            // Collect all changes from tasks
            const allChanges: CodeChange[] = tasks.flatMap(
              task => task.result?.changes || []
            );

            if (allChanges.length === 0) return true;

            const grouped = groupChangesByTask(allChanges, tasks);

            // Property: Every change must appear in exactly one group
            const groupedChangeFiles = grouped.flatMap(g =>
              g.changes.map(c => c.file)
            );
            const originalFiles = allChanges.map(c => c.file);

            return groupedChangeFiles.length === originalFiles.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain change identity after grouping', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 1, maxLength: 10 }),
          fc.array(taskArb, { minLength: 1, maxLength: 5 }),
          (changes, tasks) => {
            const grouped = groupChangesByTask(changes, tasks);

            // Property: All grouped changes must be from the original set
            const groupedChanges = grouped.flatMap(g => g.changes);
            
            return groupedChanges.every(gc =>
              changes.some(c => c.file === gc.file && c.type === gc.type)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create at least one group for non-empty changes', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 1, maxLength: 10 }),
          fc.option(fc.array(taskArb, { minLength: 0, maxLength: 5 }), { nil: undefined }),
          (changes, tasks) => {
            const grouped = groupChangesByTask(changes, tasks);

            // Property: Non-empty changes must produce at least one group
            return grouped.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should group changes by task when task result contains matching changes', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 2, maxLength: 10 }),
          (changes) => {
            // Create tasks that explicitly contain these changes
            const task1Changes = changes.slice(0, Math.ceil(changes.length / 2));
            const task2Changes = changes.slice(Math.ceil(changes.length / 2));

            const task1: Task = {
              id: 'task-1',
              instruction: 'Task 1',
              subTasks: [],
              status: TaskStatus.COMPLETED,
              createdAt: new Date(),
              updatedAt: new Date(),
              result: {
                success: true,
                output: 'Done',
                changes: task1Changes,
              },
            };

            const task2: Task = {
              id: 'task-2',
              instruction: 'Task 2',
              subTasks: [],
              status: TaskStatus.COMPLETED,
              createdAt: new Date(),
              updatedAt: new Date(),
              result: {
                success: true,
                output: 'Done',
                changes: task2Changes,
              },
            };

            const grouped = groupChangesByTask(changes, [task1, task2]);

            // Property: Changes should be grouped by their task
            const task1Group = grouped.find(g => g.taskId === 'task-1');
            const task2Group = grouped.find(g => g.taskId === 'task-2');

            if (!task1Group || !task2Group) return false;

            // Each group should contain changes from its respective task
            const task1Files = new Set(task1Changes.map(c => c.file));
            const task2Files = new Set(task2Changes.map(c => c.file));

            const task1GroupFiles = new Set(task1Group.changes.map(c => c.file));
            const task2GroupFiles = new Set(task2Group.changes.map(c => c.file));

            return (
              task1Group.changes.every(c => task1Files.has(c.file)) &&
              task2Group.changes.every(c => task2Files.has(c.file))
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should fallback to file-based grouping when no tasks provided', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 1, maxLength: 10 }),
          (changes) => {
            const grouped = groupChangesByTask(changes, undefined);

            // Property: Without tasks, each unique file should have its own group
            const uniqueFiles = new Set(changes.map(c => c.file));
            
            // Number of groups should match number of unique files
            return grouped.length === uniqueFiles.size;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Impact Summary Calculation', () => {
    it('should correctly identify highest risk level', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 1, maxLength: 10 }),
          (changes) => {
            const summary = calculateImpactSummary(changes);
            const risks = changes.map(c => c.risk);
            
            // Property: Summary should contain the highest risk level
            if (risks.includes('high')) {
              return summary.includes('risk: high');
            } else if (risks.includes('medium')) {
              return summary.includes('risk: medium');
            } else {
              return summary.includes('risk: low');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count unique files correctly', () => {
      fc.assert(
        fc.property(
          fc.array(codeChangeArb, { minLength: 1, maxLength: 10 }),
          (changes) => {
            const summary = calculateImpactSummary(changes);
            const uniqueFiles = new Set(changes.map(c => c.file));
            
            // Property: Summary should contain correct file count
            return summary.includes(`${uniqueFiles.size} file(s)`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
