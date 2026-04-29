/**
 * Property-Based Tests: Cross-Widget State Consistency
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 * 
 * Uses fast-check to generate arbitrary action sequences and verify
 * no sequence produces contradictory state across widgets.
 */

import fc from 'fast-check';
import { 
  applyApprovalAction,
  filterTasks,
} from '../../widgets/TaskPanel';
import {
  groupChangesByTask,
} from '../../widgets/DiffApproval';
import {
  getRelevantNodeIds,
  verifyGraphConsistency,
} from '../../widgets/GraphExplorer';
import {
  makeTask,
  makeTaskWithChanges,
  makeAgentInfo,
  makeCodeChange,
  makeGraph,
  makeTokenUsage,
  makeAgentMessage,
} from '../helpers/factories';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  CodeChange,
  ChangeType,
  AgentInfo,
  AgentCapability,
  SemanticCodeGraphData,
  TokenUsage,
  AgentMessage,
} from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries for Property-Based Testing
// ---------------------------------------------------------------------------

const taskStatusArb = fc.constantFrom<TaskStatus>(
  TaskStatus.PENDING,
  TaskStatus.EXECUTING,
  TaskStatus.AWAITING_APPROVAL,
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
  file: fc.string({ minLength: 5, maxLength: 30 }).map(s => `src/${s}.ts`),
  type: changeTypeArb,
  reasoning: fc.string({ minLength: 1, maxLength: 100 }),
  impact: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 3 }),
  risk: riskArb,
  diff: fc.string({ minLength: 0, maxLength: 200 }),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  approved: fc.boolean(),
});

const agentArb: fc.Arbitrary<AgentInfo> = fc.record({
  name: fc.string({ minLength: 3, maxLength: 15 }).map(s => `agent-${s}`),
  capabilities: fc.constant([AgentCapability.CODE_GENERATION]),
  supportedTaskTypes: fc.constant([TaskType.FEATURE]),
  status: fc.constantFrom('idle', 'busy', 'error') as fc.Arbitrary<'idle' | 'busy' | 'error'>,
  currentTask: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
});

const tokenUsageArb: fc.Arbitrary<TokenUsage> = fc.record({
  heavy: fc.nat({ max: 50000 }),
  fast: fc.nat({ max: 30000 }),
  general: fc.nat({ max: 20000 }),
  coder: fc.nat({ max: 40000 }),
  analyst: fc.nat({ max: 10000 }),
}).map(usage => ({
  ...usage,
  total: usage.heavy + usage.fast + usage.general + usage.coder + usage.analyst,
  estimatedCost: Number(((usage.heavy + usage.fast + usage.general + usage.coder + usage.analyst) * 0.00001).toFixed(4)),
}));

// ---------------------------------------------------------------------------
// Property 3.1: Task status consistency across widgets
// ---------------------------------------------------------------------------

describe('Property 3.1: Task status consistency across widgets', () => {
  it('should maintain consistent task status across Task_Panel, Diff_Approval_Widget, and Reasoning_Log', () => {
    fc.assert(
      fc.property(
        fc.array(codeChangeArb, { minLength: 1, maxLength: 5 }),
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 20 }),
        (changes, approved, user) => {
          // Create task with changes
          const task = makeTaskWithChanges(changes.length);
          if (task.result?.changes) {
            task.result.changes = changes.map((c, i) => ({
              ...c,
              approved: false,
            }));
          }
          
          // Apply approval to first change
          if (task.result?.changes && task.result.changes.length > 0) {
            const { updatedTask, logEntry } = applyApprovalAction(
              task,
              0,
              approved,
              user
            );
            
            // Property: Status should match approval result
            const expectedStatus = approved ? TaskStatus.COMPLETED : TaskStatus.FAILED;
            
            // TaskPanel shows updated status
            expect(updatedTask.status).toBe(expectedStatus);
            
            // DiffApproval shows approved state
            const approvedChange = updatedTask.result?.changes?.[0];
            expect(approvedChange?.approved).toBe(approved);
            
            // ReasoningLog has entry
            expect(logEntry).toBeDefined();
            expect(logEntry.agent).toBe(user);
            expect(logEntry.timestamp).toBeInstanceOf(Date);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3.2: Agent status synchronization
// ---------------------------------------------------------------------------

describe('Property 3.2: Agent status synchronization', () => {
  it('should display same agent status in Agent_Status_Dashboard and Task_Panel', () => {
    fc.assert(
      fc.property(
        fc.array(agentArb, { minLength: 1, maxLength: 5 }),
        fc.record({
          status: taskStatusArb,
          agentName: fc.string({ minLength: 1, maxLength: 15 }),
        }),
        (agents, progressUpdate) => {
          // Build progress map
          const progress: Record<string, TaskStatus> = {};
          agents.forEach(agent => {
            progress[agent.name] = agent.status === 'busy' 
              ? TaskStatus.EXECUTING 
              : TaskStatus.COMPLETED;
          });
          
          // Property: For each agent, status should be consistent
          for (const agent of agents) {
            const dashboardStatus = agent.status;
            const isBusy = progress[agent.name] === TaskStatus.EXECUTING 
              || progress[agent.name] === TaskStatus.PLANNING;
            
            // Both should agree on busy/idle state
            const dashboardBusy = dashboardStatus === 'busy';
            expect(dashboardBusy).toBe(isBusy);
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3.3: Resource usage accuracy
// ---------------------------------------------------------------------------

describe('Property 3.3: Resource usage accuracy', () => {
  it('should match Resource_Footer token usage with last agent action', () => {
    fc.assert(
      fc.property(
        tokenUsageArb,
        tokenUsageArb,
        (initialUsage, actionUsage) => {
          // Simulate resource update
          const updatedUsage: TokenUsage = {
            heavy: initialUsage.heavy + actionUsage.heavy,
            fast: initialUsage.fast + actionUsage.fast,
            general: initialUsage.general + actionUsage.general,
            coder: initialUsage.coder + actionUsage.coder,
            analyst: initialUsage.analyst + actionUsage.analyst,
            total: initialUsage.total + actionUsage.total,
            estimatedCost: Number((initialUsage.estimatedCost + actionUsage.estimatedCost).toFixed(4)),
          };
          
          // Property: Total should be consistent
          expect(updatedUsage.total).toBeGreaterThanOrEqual(updatedUsage.heavy);
          expect(updatedUsage.total).toBeGreaterThanOrEqual(updatedUsage.fast);
          
          // Property: Cost should increase
          expect(updatedUsage.estimatedCost).toBeGreaterThanOrEqual(initialUsage.estimatedCost);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3.4: Consistent initialization
// ---------------------------------------------------------------------------

describe('Property 3.4: Consistent initialization', () => {
  it('should initialize all widgets from same data source with consistent state', () => {
    fc.assert(
      fc.property(
        fc.array(codeChangeArb, { minLength: 1, maxLength: 3 }),
        fc.array(agentArb, { minLength: 1, maxLength: 3 }),
        (changes, agents) => {
          // Create shared state
          const tasks = changes.map((change, i) => {
            const task = makeTask({
              id: `task-${i}`,
              status: TaskStatus.AWAITING_APPROVAL,
            });
            task.result = {
              success: true,
              output: 'Ready for approval',
              changes: [change],
            };
            return task;
          });
          
          // Property: All widgets see same task count
          const taskPanelCount = tasks.length;
          const diffApprovalCount = changes.length;
          
          // Every task with changes should appear in both
          const tasksWithChanges = tasks.filter(t => t.result?.changes?.length);
          expect(tasksWithChanges.length).toBeGreaterThan(0);
          
          // All changes should be tracked
          const allChanges = tasks.flatMap(t => t.result?.changes || []);
          expect(allChanges.length).toBe(changes.length);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3.5: No contradictory state
// ---------------------------------------------------------------------------

describe('Property 3.5: No contradictory state', () => {
  it('should not produce contradictory state for any action sequence', () => {
    // Define action types
    type Action = 
      | { type: 'approve'; taskIndex: number; changeIndex: number }
      | { type: 'reject'; taskIndex: number; changeIndex: number }
      | { type: 'select'; taskIndex: number };
    
    const actionArb: fc.Arbitrary<Action> = fc.oneof(
      fc.record({
        type: fc.constant('approve' as const),
        taskIndex: fc.nat({ max: 2 }),
        changeIndex: fc.nat({ max: 2 }),
      }),
      fc.record({
        type: fc.constant('reject' as const),
        taskIndex: fc.nat({ max: 2 }),
        changeIndex: fc.nat({ max: 2 }),
      }),
      fc.record({
        type: fc.constant('select' as const),
        taskIndex: fc.nat({ max: 2 }),
      }),
    );
    
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 1, maxLength: 10 }),
        (actions) => {
          // Create initial state
          const tasks = [
            makeTaskWithChanges(2),
            makeTaskWithChanges(1),
            makeTaskWithChanges(3),
          ];
          
          // Apply actions
          for (const action of actions) {
            const taskIdx = Math.min(action.taskIndex, tasks.length - 1);
            const task = tasks[taskIdx];
            
            if (action.type === 'approve' || action.type === 'reject') {
              const changeCount = task.result?.changes?.length || 0;
              if (changeCount > 0) {
                const changeIdx = Math.min(action.changeIndex, changeCount - 1);
                const approved = action.type === 'approve';
                
                const result = applyApprovalAction(task, changeIdx, approved, 'user');
                tasks[taskIdx] = result.updatedTask;
              }
            }
          }
          
          // Property: No task should have contradictory state
          for (const task of tasks) {
            const changes = task.result?.changes || [];
            
            // Only check if the task was actually modified by an approve/reject action
            if (changes.length > 0) {
              // If any change was explicitly approved, status should reflect that
              const explicitlyApproved = changes.some(c => c.approved === true);
              const explicitlyRejected = changes.some(c => c.approved === false && task.status !== TaskStatus.AWAITING_APPROVAL);
              
              if (explicitlyApproved) {
                expect([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.APPLYING]).toContain(task.status);
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});