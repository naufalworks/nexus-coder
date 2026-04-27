import fc from 'fast-check';
import {
  applyApprovalAction,
  filterTasks,
} from './TaskPanel';
import { Task, TaskStatus, TaskType, TaskPriority, CodeChange, ChangeType, AgentMessage } from '../types';

// ---------------------------------------------------------------------------
// Arbitrary generators (smart generators constraining input space)
// ---------------------------------------------------------------------------

const taskStatusArb = fc.constantFrom<TaskStatus>(
  TaskStatus.PENDING,
  TaskStatus.CLASSIFYING,
  TaskStatus.PLANNING,
  TaskStatus.CONTEXT_ASSEMBLING,
  TaskStatus.EXECUTING,
  TaskStatus.REVIEWING,
  TaskStatus.AWAITING_APPROVAL,
  TaskStatus.APPLYING,
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
);

const changeTypeArb = fc.constantFrom<ChangeType>(
  ChangeType.CREATE,
  ChangeType.MODIFY,
  ChangeType.DELETE,
  ChangeType.REFACTOR,
);

const riskArb = fc.constantFrom<'low' | 'medium' | 'high'>('low', 'medium', 'high');

const codeChangeArb: fc.Arbitrary<CodeChange> = fc.record({
  file: fc.string({ minLength: 1, maxLength: 50 }),
  type: changeTypeArb,
  reasoning: fc.string({ minLength: 1, maxLength: 100 }),
  impact: fc.array(fc.string({ minLength: 1, maxLength: 40 })),
  risk: riskArb,
  diff: fc.string({ minLength: 0, maxLength: 200 }),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  approved: fc.boolean(),
});

const taskArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  instruction: fc.string({ minLength: 1, maxLength: 80 }),
  status: taskStatusArb,
  subTasks: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 10 }),
      instruction: fc.string({ minLength: 1, maxLength: 40 }),
      assignedAgent: fc.string({ minLength: 1, maxLength: 15 }),
      requiredCapabilities: fc.constantFrom([] as any[]),
      dependencies: fc.constantFrom([] as string[]),
      status: taskStatusArb,
    })
  ),
  createdAt: fc.constantFrom(new Date('2024-01-01')),
  updatedAt: fc.constantFrom(new Date('2024-01-01')),
  result: fc.option(
    fc.record({
      success: fc.boolean(),
      output: fc.string({ minLength: 0, maxLength: 50 }),
      changes: fc.array(codeChangeArb),
    }),
    { nil: undefined }
  ),
}) as fc.Arbitrary<Task>;

// ---------------------------------------------------------------------------
// Property 1: Approval/Reject updates task & log
// Validates: Requirements 2.3, 4.1
// ---------------------------------------------------------------------------

describe('Property 1: Approval/Reject updates task & log', () => {
  /** Validates: Requirements 2.3, 4.1 */

  it('for any task with changes, approving updates status to COMPLETED and logs the action', () => {
    fc.assert(
      fc.property(
        taskArb.filter(t => (t.result?.changes?.length ?? 0) > 0),
        fc.string({ minLength: 1, maxLength: 20 }),
        (task, user) => {
          const maxIdx = task.result!.changes!.length - 1;
          // Use the last valid change index
          const changeIndex = maxIdx;

          const { updatedTask, logEntry } = applyApprovalAction(
            task,
            changeIndex,
            true, // approved
            user
          );

          // Requirement 2.3: task status must be updated
          expect(updatedTask.status).toBe(TaskStatus.COMPLETED);

          // Requirement 4.1: a log entry must be created
          expect(logEntry).toBeDefined();
          expect(logEntry.agent).toBe(user);
          expect(logEntry.timestamp).toBeInstanceOf(Date);
          expect(logEntry.content).toContain('Approved');
          expect(logEntry.content).toContain(task.id);
          expect(logEntry.metadata).toMatchObject({
            taskId: task.id,
            changeIndex,
            approved: true,
            action: 'approval',
          });

          // The task's updatedAt must be set
          expect(updatedTask.updatedAt.getTime()).toBeGreaterThanOrEqual(
            task.updatedAt.getTime()
          );

          // The specific change must be marked as approved
          expect(updatedTask.result?.changes?.[changeIndex]?.approved).toBe(true);
        }
      )
    );
  });

  it('for any task with changes, rejecting updates status to FAILED and logs the action', () => {
    fc.assert(
      fc.property(
        taskArb.filter(t => (t.result?.changes?.length ?? 0) > 0),
        fc.string({ minLength: 1, maxLength: 20 }),
        (task, user) => {
          const maxIdx = task.result!.changes!.length - 1;
          const changeIndex = maxIdx;

          const { updatedTask, logEntry } = applyApprovalAction(
            task,
            changeIndex,
            false, // rejected
            user
          );

          // Requirement 2.3: task status must be updated to FAILED on rejection
          expect(updatedTask.status).toBe(TaskStatus.FAILED);

          // Requirement 4.1: a log entry must be created
          expect(logEntry).toBeDefined();
          expect(logEntry.agent).toBe(user);
          expect(logEntry.timestamp).toBeInstanceOf(Date);
          expect(logEntry.content).toContain('Rejected');
          expect(logEntry.content).toContain(task.id);
          expect(logEntry.metadata).toMatchObject({
            taskId: task.id,
            changeIndex,
            approved: false,
            action: 'approval',
          });

          // The specific change must be marked as not approved
          expect(updatedTask.result?.changes?.[changeIndex]?.approved).toBe(false);
        }
      )
    );
  });

  it('for any task with changes, approval and rejection always produce different outcomes', () => {
    fc.assert(
      fc.property(
        taskArb.filter(t => (t.result?.changes?.length ?? 0) > 0),
        fc.string({ minLength: 1, maxLength: 20 }),
        (task, user) => {
          const changeIndex = 0;

          const approved = applyApprovalAction(task, changeIndex, true, user);
          const rejected = applyApprovalAction(task, changeIndex, false, user);

          // Statuses must differ
          expect(approved.updatedTask.status).not.toBe(rejected.updatedTask.status);

          // One is COMPLETED, the other is FAILED
          expect(approved.updatedTask.status).toBe(TaskStatus.COMPLETED);
          expect(rejected.updatedTask.status).toBe(TaskStatus.FAILED);

          // Log entries must reflect opposite decisions
          expect(approved.logEntry.metadata?.approved).toBe(true);
          expect(rejected.logEntry.metadata?.approved).toBe(false);
        }
      )
    );
  });

  it('approval action never mutates the original task (immutability)', () => {
    fc.assert(
      fc.property(
        taskArb.filter(t => (t.result?.changes?.length ?? 0) > 0),
        fc.string({ minLength: 1, maxLength: 20 }),
        (task, user) => {
          const originalStatus = task.status;
          const originalChanges = task.result?.changes?.map(c => ({ ...c }));

          applyApprovalAction(task, 0, true, user);

          // Original task must not be mutated
          expect(task.status).toBe(originalStatus);
          expect(task.result?.changes).toEqual(originalChanges);
        }
      )
    );
  });
});
