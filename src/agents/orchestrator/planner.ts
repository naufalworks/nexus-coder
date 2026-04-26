import { TaskClassification, SubTask, TaskType, TaskStatus, AgentCapability } from '../../types';
import { UnifiedClient } from '../../core/models/unified-client';
import { ChatMessage } from '../../core/models/types';
import { config } from '../../core/config';
import logger from '../../core/logger';

export interface Plan {
  subTasks: SubTask[];
  reasoning: string;
  estimatedTotalTokens: number;
  requiresContext: boolean;
  requiresCodeGeneration: boolean;
  requiresReview: boolean;
  requiresGitOps: boolean;
}

export class Planner {
  private client: UnifiedClient;

  constructor(client: UnifiedClient) {
    this.client = client;
  }

  async createPlan(instruction: string, classification: TaskClassification): Promise<Plan> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a task planner for a multi-agent coding system. Break the task into ordered subtasks.
Each subtask should specify which agent handles it: "context", "coder", "reviewer", or "git".
Respond with JSON only:
{
  "subTasks": [
    { "id": "st_1", "instruction": "...", "agent": "context|coder|reviewer|git", "dependencies": [] }
  ],
  "reasoning": "why this plan",
  "estimatedTotalTokens": number
}`,
      },
      {
        role: 'user',
        content: `Task: ${instruction}\nClassification: ${JSON.stringify(classification)}`,
      },
    ];

    try {
      const { data, result } = await this.client.structuredChat<{
        subTasks: Array<{ id: string; instruction: string; agent: string; dependencies: string[] }>;
        reasoning: string;
        estimatedTotalTokens: number;
      }>(config.models.general, messages, { maxTokens: 1000, temperature: 0.3 });

      logger.info(`[Planner] Created plan with ${data.subTasks.length} subtasks (${result.inputTokens + result.outputTokens} tokens)`);

      const agentCapabilityMap: Record<string, AgentCapability[]> = {
        context: [AgentCapability.CONTEXT_RETRIEVAL],
        coder: [AgentCapability.CODE_GENERATION, AgentCapability.CODE_ANALYSIS],
        reviewer: [AgentCapability.CODE_REVIEW],
        git: [AgentCapability.GIT_OPERATIONS],
      };

      const subTasks: SubTask[] = data.subTasks.map(st => ({
        id: st.id,
        instruction: st.instruction,
        assignedAgent: st.agent,
        requiredCapabilities: agentCapabilityMap[st.agent] ?? [AgentCapability.CODE_ANALYSIS],
        dependencies: st.dependencies,
        status: TaskStatus.PENDING,
      }));

      return {
        subTasks,
        reasoning: data.reasoning,
        estimatedTotalTokens: data.estimatedTotalTokens || classification.estimatedTokens,
        requiresContext: subTasks.some(st => st.assignedAgent === 'context'),
        requiresCodeGeneration: subTasks.some(st => st.assignedAgent === 'coder'),
        requiresReview: subTasks.some(st => st.assignedAgent === 'reviewer'),
        requiresGitOps: subTasks.some(st => st.assignedAgent === 'git'),
      };
    } catch (error) {
      logger.warn(`[Planner] Planning failed, using fallback: ${error}`);
      return this.createFallbackPlan(instruction, classification);
    }
  }

  private createFallbackPlan(instruction: string, classification: TaskClassification): Plan {
    const subTasks: SubTask[] = [];

    if (classification.requiresContext) {
      subTasks.push({
        id: 'st_ctx',
        instruction: `Retrieve relevant context for: ${instruction}`,
        assignedAgent: 'context',
        requiredCapabilities: [AgentCapability.CONTEXT_RETRIEVAL],
        dependencies: [],
        status: TaskStatus.PENDING,
      });
    }

    if (classification.requiresCodeGeneration) {
      subTasks.push({
        id: 'st_code',
        instruction,
        assignedAgent: 'coder',
        requiredCapabilities: [AgentCapability.CODE_GENERATION],
        dependencies: classification.requiresContext ? ['st_ctx'] : [],
        status: TaskStatus.PENDING,
      });
    }

    if (classification.requiresReview) {
      subTasks.push({
        id: 'st_review',
        instruction: `Review the proposed changes for: ${instruction}`,
        assignedAgent: 'reviewer',
        requiredCapabilities: [AgentCapability.CODE_REVIEW],
        dependencies: classification.requiresCodeGeneration ? ['st_code'] : [],
        status: TaskStatus.PENDING,
      });
    }

    if (classification.requiresGitOps) {
      subTasks.push({
        id: 'st_git',
        instruction: `Commit the approved changes`,
        assignedAgent: 'git',
        requiredCapabilities: [AgentCapability.GIT_OPERATIONS],
        dependencies: classification.requiresReview ? ['st_review'] : [],
        status: TaskStatus.PENDING,
      });
    }

    if (subTasks.length === 0) {
      subTasks.push({
        id: 'st_code',
        instruction,
        assignedAgent: 'coder',
        requiredCapabilities: [AgentCapability.CODE_GENERATION],
        dependencies: [],
        status: TaskStatus.PENDING,
      });
    }

    return {
      subTasks,
      reasoning: 'Fallback plan (planning failed)',
      estimatedTotalTokens: classification.estimatedTokens,
      requiresContext: classification.requiresContext,
      requiresCodeGeneration: classification.requiresCodeGeneration,
      requiresReview: classification.requiresReview,
      requiresGitOps: classification.requiresGitOps,
    };
  }
}
