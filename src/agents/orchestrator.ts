import {
  AgentType,
  Task,
  AgentContext,
  CodeChange,
  ApprovalRequest,
  ApprovalResponse,
} from '../types';
import {
  BaseAgent,
  OrchestratorAgent,
  ContextAgent,
  TaskAgent,
  GitAgent,
  CodingAgent,
  ToolsAgent,
} from './base-agent';
import logger from '../core/logger';
import { v4 as uuidv4 } from 'uuid';

export class AgentOrchestrator {
  private agents: Map<AgentType, BaseAgent>;

  constructor() {
    this.agents = new Map();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    this.agents.set(AgentType.ORCHESTRATOR, new OrchestratorAgent());
    this.agents.set(AgentType.CONTEXT, new ContextAgent());
    this.agents.set(AgentType.TASK, new TaskAgent());
    this.agents.set(AgentType.GIT, new GitAgent());
    this.agents.set(AgentType.CODING, new CodingAgent());
    this.agents.set(AgentType.TOOLS, new ToolsAgent());

    logger.info('All agents initialized');
  }

  async executeTask(instruction: string, workingDirectory: string): Promise<any> {
    const taskId = uuidv4();

    const task: Task = {
      id: taskId,
      instruction,
      status: 'in_progress' as any,
      assignedAgent: AgentType.ORCHESTRATOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const context: AgentContext = {
      taskId,
      conversationHistory: [],
      relevantContext: [],
      workingDirectory,
    };

    logger.info(`Starting task execution: ${taskId}`);

    // Step 1: Orchestrator creates plan
    const orchestrator = this.agents.get(AgentType.ORCHESTRATOR)!;
    const plan = await orchestrator.execute(task, context);

    // Step 2: Context agent retrieves relevant context
    const contextAgent = this.agents.get(AgentType.CONTEXT)!;
    const contextResult = await contextAgent.execute(task, context);
    context.relevantContext = contextResult.relevantContext;

    // Step 3: Task agent breaks down the task
    const taskAgent = this.agents.get(AgentType.TASK)!;
    const taskBreakdown = await taskAgent.execute(task, context);

    // Step 4: Coding agent proposes changes
    const codingAgent = this.agents.get(AgentType.CODING)!;
    const codeAnalysis = await codingAgent.execute(task, context);

    // Step 5: Git agent handles version control
    const gitAgent = this.agents.get(AgentType.GIT)!;
    const gitStatus = await gitAgent.execute(task, context);

    return {
      taskId,
      plan,
      context: contextResult,
      taskBreakdown,
      codeAnalysis,
      gitStatus,
    };
  }

  async requestApproval(
    changes: CodeChange[],
    reasoning: string
  ): Promise<ApprovalResponse> {
    const approvalRequest: ApprovalRequest = {
      changes,
      reasoning,
      impact: this.assessImpact(changes),
      risk: this.assessRisk(changes),
    };

    // This will be handled by the CLI
    return {
      approved: false,
      feedback: 'Waiting for user approval',
    };
  }

  async commitChanges(changes: CodeChange[], reasoning: string): Promise<any> {
    const gitAgent = this.agents.get(AgentType.GIT) as GitAgent;
    return await gitAgent.commitChanges(changes, reasoning);
  }

  private assessImpact(changes: CodeChange[]): string {
    const impacts: string[] = [];

    for (const change of changes) {
      impacts.push(...change.impact);
    }

    return impacts.join('\n');
  }

  private assessRisk(changes: CodeChange[]): 'low' | 'medium' | 'high' {
    const risks = changes.map((c) => c.risk);

    if (risks.includes('high')) return 'high';
    if (risks.includes('medium')) return 'medium';
    return 'low';
  }

  getAgent(type: AgentType): BaseAgent | undefined {
    return this.agents.get(type);
  }
}
