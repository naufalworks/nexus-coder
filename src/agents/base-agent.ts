import { AgentType, AgentMessage, AgentContext, Task, CodeChange } from '../types';
import { LLMClient } from '../core/llm-client';
import { ContextStore } from '../core/context-store';
import { GitManager } from '../core/git-manager';
import { RepoMapGenerator } from '../core/repomap';
import logger from '../core/logger';

export abstract class BaseAgent {
  protected type: AgentType;
  protected llmClient: LLMClient;
  protected contextStore: ContextStore;
  protected gitManager: GitManager;
  protected repoMapGenerator: RepoMapGenerator;

  constructor(type: AgentType) {
    this.type = type;
    this.llmClient = new LLMClient();
    this.contextStore = new ContextStore();
    this.gitManager = new GitManager();
    this.repoMapGenerator = new RepoMapGenerator();
  }

  abstract execute(task: Task, context: AgentContext): Promise<any>;

  protected async sendMessage(
    messages: AgentMessage[],
    systemPrompt?: string
  ): Promise<string> {
    const formattedMessages = messages.map((m) => ({
      role: 'user' as const,
      content: `[${m.agent}] ${m.content}`,
    }));

    return await this.llmClient.sendMessage(formattedMessages, systemPrompt);
  }

  protected log(message: string, metadata?: any): void {
    logger.info(`[${this.type}] ${message}`, metadata);
  }
}

export class OrchestratorAgent extends BaseAgent {
  constructor() {
    super(AgentType.ORCHESTRATOR);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Orchestrating task execution', { taskId: task.id });

    const plan = await this.createPlan(task);
    
    return plan;
  }

  private async createPlan(task: Task): Promise<any> {
    const systemPrompt = `You are the orchestrator agent. Your job is to:
1. Analyze the task
2. Break it down into subtasks
3. Assign subtasks to appropriate agents
4. Coordinate execution

Available agents:
- context: Manages context and memory
- task: Plans and tracks goals
- git: Handles git operations
- coding: Proposes code changes
- tools: Uses external tools (MCP, web search, etc.)

Respond with a structured plan.`;

    const response = await this.llmClient.sendMessage(
      [
        {
          role: 'user',
          content: `Task: ${task.instruction}\nContext: ${task.context || 'None'}`,
        },
      ],
      systemPrompt
    );

    return response;
  }
}

export class ContextAgent extends BaseAgent {
  constructor() {
    super(AgentType.CONTEXT);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Managing context', { taskId: task.id });

    const relevantContext = await this.contextStore.getRelevantContext(
      task.instruction
    );

    const summary = await this.contextStore.summarize(relevantContext);

    return {
      relevantContext,
      summary,
    };
  }
}

export class TaskAgent extends BaseAgent {
  constructor() {
    super(AgentType.TASK);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Planning and tracking task', { taskId: task.id });

    const systemPrompt = `You are the task agent. Your job is to:
1. Break down complex tasks into steps
2. Track progress
3. Identify dependencies
4. Ensure goals are met

Provide a structured breakdown of the task.`;

    const response = await this.llmClient.sendMessage(
      [
        {
          role: 'user',
          content: `Task: ${task.instruction}`,
        },
      ],
      systemPrompt
    );

    return response;
  }
}

export class GitAgent extends BaseAgent {
  constructor() {
    super(AgentType.GIT);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Handling git operations', { taskId: task.id });

    const status = await this.gitManager.getStatus();
    const diff = await this.gitManager.getDiff();

    return {
      status,
      diff,
    };
  }

  async commitChanges(changes: CodeChange[], reasoning: string): Promise<any> {
    return await this.gitManager.commitChanges(changes, reasoning);
  }
}

export class CodingAgent extends BaseAgent {
  constructor() {
    super(AgentType.CODING);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Analyzing code and proposing changes', { taskId: task.id });

    const systemPrompt = `You are the coding agent. Your job is to:
1. Read and understand code
2. Propose specific changes
3. Explain reasoning for each change
4. Assess impact and risk

IMPORTANT: You must show:
- REASONING: Why the change is needed
- IMPACT: What it fixes/improves
- RISK: Assessment (low/medium/high)
- DIFF: The actual code changes

Do NOT make changes autonomously. Always ask for approval.`;

    const response = await this.llmClient.sendMessage(
      [
        {
          role: 'user',
          content: `Task: ${task.instruction}\n\nContext:\n${context.relevantContext
            .map((c) => c.content)
            .join('\n\n')}`,
        },
      ],
      systemPrompt
    );

    return response;
  }
}

export class ToolsAgent extends BaseAgent {
  constructor() {
    super(AgentType.TOOLS);
  }

  async execute(task: Task, context: AgentContext): Promise<any> {
    this.log('Using external tools', { taskId: task.id });

    // TODO: Implement MCP tool usage
    return {
      message: 'Tools agent ready',
    };
  }
}
