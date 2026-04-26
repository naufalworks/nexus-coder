import {
  Task, TaskClassification, TaskResult, SubTask, TaskStatus,
  ApprovalRequest, ApprovalResponse, TokenUsage, CodeChange, ChangeType,
} from '../../types';
import { ModelRouter } from '../../core/models/router';
import { ContextEngine } from '../../core/context/engine';
import { FileWriter, WriteResult } from '../../core/file-writer';
import { GitManager } from '../../core/git-manager';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentRegistry, AgentResult } from '../registry';
import { Planner, Plan } from './planner';
import logger from '../../core/logger';

export class DynamicOrchestrator {
  private modelRouter: ModelRouter;
  private contextEngine: ContextEngine;
  private eventBus: EventBus;
  private registry: AgentRegistry;
  private planner: Planner;
  private fileWriter: FileWriter;
  private gitManager: GitManager;
  private approvalCallback: ((request: ApprovalRequest) => Promise<ApprovalResponse>) | null;

  constructor(
    modelRouter: ModelRouter,
    contextEngine: ContextEngine,
    eventBus: EventBus,
    registry: AgentRegistry,
    planner: Planner,
    fileWriter?: FileWriter,
    gitManager?: GitManager,
  ) {
    this.modelRouter = modelRouter;
    this.contextEngine = contextEngine;
    this.eventBus = eventBus;
    this.registry = registry;
    this.planner = planner;
    this.fileWriter = fileWriter ?? new FileWriter();
    this.gitManager = gitManager ?? new GitManager();
    this.approvalCallback = null;
  }

  setApprovalCallback(callback: (request: ApprovalRequest) => Promise<ApprovalResponse>): void {
    this.approvalCallback = callback;
  }

  async execute(instruction: string): Promise<Task> {
    const task: Task = {
      id: `task_${Date.now()}`,
      instruction,
      subTasks: [],
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      this.eventBus.emit(EventType.TASK_RECEIVED, { instruction }, 'Orchestrator');
      task.status = TaskStatus.CLASSIFYING;

      const classification = await this.modelRouter.classifyTask(instruction);
      task.classification = classification;
      this.eventBus.emit(EventType.TASK_CLASSIFIED, classification, 'Orchestrator');

      logger.info(`[Orchestrator] Task classified: ${classification.type} (complexity: ${classification.complexity})`);

      task.status = TaskStatus.PLANNING;
      const plan = await this.planner.createPlan(instruction, classification);
      task.subTasks = plan.subTasks;
      this.eventBus.emit(EventType.PLAN_CREATED, plan, 'Orchestrator');

      task.status = TaskStatus.CONTEXT_ASSEMBLING;
      let contextContent = '';
      if (plan.requiresContext) {
        const context = await this.contextEngine.assembleContext(instruction, classification);
        contextContent = context.content;
        task.context = contextContent;
        this.eventBus.emit(EventType.CONTEXT_ASSEMBLED, { tokens: context.totalTokens }, 'Orchestrator');
      }

      task.status = TaskStatus.EXECUTING;
      const results = await this.executeSubTasks(task.subTasks, contextContent, classification);

      const codeChanges = this.extractCodeChanges(results);

      if (codeChanges.length > 0 && classification.requiresReview) {
        task.status = TaskStatus.REVIEWING;
        this.eventBus.emit(EventType.CODE_REVIEWING, codeChanges, 'Orchestrator');

        const reviewAgent = this.registry.getAgent('reviewer');
        if (reviewAgent) {
          const reviewResult = await reviewAgent.execute(
            `Review these changes:\n${codeChanges.map(c => `File: ${c.file} (${c.type})\n${c.content.substring(0, 500)}`).join('\n\n')}`,
            contextContent,
            classification,
          );
          this.eventBus.emit(EventType.CODE_REVIEWED, reviewResult, 'Orchestrator');
          logger.info(`[Orchestrator] Review complete: ${reviewResult.output.substring(0, 200)}`);
        }
      }

      if (codeChanges.length > 0 && this.approvalCallback) {
        task.status = TaskStatus.AWAITING_APPROVAL;
        this.eventBus.emit(EventType.CHANGES_PROPOSED, codeChanges, 'Orchestrator');

        console.log(`\n  ${codeChanges.length} file(s) to be changed:`);
        for (const change of codeChanges) {
          const label = change.type === 'create' ? 'CREATE' :
                        change.type === 'delete' ? 'DELETE' : 'MODIFY';
          const lines = change.content.split('\n').length;
          console.log(`    [${label}] ${change.file} (${lines} lines)`);
        }
        console.log();

        const approval = await this.approvalCallback({
          changes: codeChanges,
          reasoning: results.map(r => r.output).join('\n'),
          impact: codeChanges.map(c => c.impact.join(', ')).join('; '),
          risk: this.assessRisk(codeChanges),
          cost: this.modelRouter.getUsageSummary().estimatedCost,
        });

        if (!approval.approved) {
          task.status = TaskStatus.FAILED;
          task.error = approval.feedback || 'Changes not approved';
          this.eventBus.emit(EventType.CHANGES_REJECTED, approval, 'Orchestrator');
          return task;
        }

        this.eventBus.emit(EventType.CHANGES_APPROVED, approval, 'Orchestrator');
      }

      if (codeChanges.length > 0) {
        task.status = TaskStatus.APPLYING;
        logger.info(`[Orchestrator] Applying ${codeChanges.length} changes to disk...`);

        const approvedChanges = codeChanges.map(c => ({ ...c, approved: true }));
        const writeResults = await this.fileWriter.applyChanges(approvedChanges);

        const failedWrites = writeResults.filter(r => !r.success);
        if (failedWrites.length > 0) {
          logger.warn(`[Orchestrator] ${failedWrites.length} writes failed, restoring backups...`);
          await this.fileWriter.restoreAllBackups(writeResults);
          task.status = TaskStatus.FAILED;
          task.error = `File write failed: ${failedWrites.map(f => f.error).join('; ')}`;
          return task;
        }

        logger.info(`[Orchestrator] All ${writeResults.length} files written successfully`);

        const isGitRepo = await this.gitManager.isRepo();
        if (isGitRepo && task.classification?.requiresGitOps) {
          try {
            const files = writeResults.map(r => r.file);
            const commitMsg = await this.generateCommitMessage(instruction, codeChanges);
            await this.gitManager.stageChanges(files);
            const commitResult = await this.gitManager.commitChanges(
              approvedChanges,
              commitMsg,
            );
            logger.info(`[Orchestrator] Auto-committed: ${commitResult.hash}`);
          } catch (gitError) {
            logger.warn(`[Orchestrator] Git commit failed (files still written): ${gitError}`);
          }
        }
      }

      task.status = TaskStatus.COMPLETED;
      task.result = {
        success: true,
        output: results.map(r => r.output).join('\n\n'),
        changes: codeChanges,
        metadata: {
          classification,
          plan: plan.reasoning,
          filesWritten: codeChanges.length,
        },
      };

      task.tokenUsage = this.modelRouter.getUsageSummary();

      this.contextEngine.recordDecision(
        instruction,
        task.result.output.substring(0, 200),
        plan.reasoning,
      );

      this.contextEngine.save();

      this.eventBus.emit(EventType.AGENT_COMPLETED, task.result, 'Orchestrator');
    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.error = error instanceof Error ? error.message : String(error);
      this.eventBus.emit(EventType.ERROR_OCCURRED, { error: task.error }, 'Orchestrator');
      logger.error(`[Orchestrator] Task failed: ${task.error}`);
    }

    task.updatedAt = new Date();
    return task;
  }

  private async executeSubTasks(
    subTasks: SubTask[],
    context: string,
    classification: TaskClassification,
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const completed = new Set<string>();

    for (const subTask of subTasks) {
      const depsReady = subTask.dependencies.every(dep => completed.has(dep));
      if (!depsReady) {
        logger.warn(`[Orchestrator] Skipping ${subTask.id}: dependencies not met`);
        continue;
      }

      const agent = this.registry.getAgent(subTask.assignedAgent);
      if (!agent) {
        logger.warn(`[Orchestrator] No agent found for: ${subTask.assignedAgent}`);
        continue;
      }

      subTask.status = TaskStatus.EXECUTING;
      this.eventBus.emit(EventType.AGENT_STARTED, { agent: subTask.assignedAgent, subTask }, 'Orchestrator');

      try {
        const result = await agent.execute(subTask.instruction, context, classification);
        subTask.status = TaskStatus.COMPLETED;
        subTask.result = {
          success: result.success,
          output: result.output,
        };
        results.push(result);
        completed.add(subTask.id);

        this.eventBus.emit(EventType.AGENT_COMPLETED, { agent: subTask.assignedAgent, result }, 'Orchestrator');
      } catch (error) {
        subTask.status = TaskStatus.FAILED;
        this.eventBus.emit(EventType.AGENT_FAILED, { agent: subTask.assignedAgent, error }, 'Orchestrator');
        logger.error(`[Orchestrator] Agent ${subTask.assignedAgent} failed: ${error}`);
      }
    }

    return results;
  }

  private extractCodeChanges(results: AgentResult[]): CodeChange[] {
    const changes: CodeChange[] = [];

    for (const result of results) {
      if (result.changes) {
        for (const change of result.changes) {
          changes.push({
            file: change.file,
            type: change.type as CodeChange['type'],
            reasoning: change.reasoning,
            impact: [],
            risk: 'medium',
            diff: change.diff ?? '',
            content: change.content ?? '',
            approved: false,
          });
        }
      }
    }

    return changes;
  }

  private assessRisk(changes: CodeChange[]): 'low' | 'medium' | 'high' {
    const fileCount = new Set(changes.map(c => c.file)).size;
    const hasHighRisk = changes.some(c => c.risk === 'high');
    const hasDelete = changes.some(c => c.type === ChangeType.DELETE);

    if (hasHighRisk || hasDelete || fileCount > 10) return 'high';
    if (fileCount > 3) return 'medium';
    return 'low';
  }

  private async generateCommitMessage(instruction: string, changes: CodeChange[]): Promise<string> {
    const hasCreate = changes.some(c => c.type === ChangeType.CREATE);
    const hasDelete = changes.some(c => c.type === ChangeType.DELETE);
    const hasRefactor = changes.some(c => c.type === ChangeType.REFACTOR);

    let prefix = 'feat';
    if (hasRefactor && !hasCreate) prefix = 'refactor';
    if (hasDelete && !hasCreate) prefix = 'chore';

    const summary = instruction.substring(0, 72);
    return `nexus: ${prefix}: ${summary}`;
  }
}
