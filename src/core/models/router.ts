import {
  TaskType,
  TaskPriority,
  TaskClassification,
  TokenUsage,
} from '../../types';
import {
  ModelDefinition,
  RoutingDecision,
  ModelCostTracker,
  ChatMessage,
  ChatOptions,
  ChatResult,
  MODEL_DEFINITIONS,
  TASK_MODEL_MAP,
} from './types';
import { UnifiedClient } from './unified-client';
import { config } from '../config';
import logger from '../logger';

export class ModelRouter {
  private client: UnifiedClient;
  private costTracker: ModelCostTracker;

  constructor(client: UnifiedClient) {
    this.client = client;
    this.costTracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      callsByModel: {},
    };
  }

  async classifyTask(instruction: string): Promise<TaskClassification> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Classify this coding task. Respond with JSON only:
{
  "type": "bug_fix|feature|refactor|review|explain|test|documentation|configuration|unknown",
  "priority": "critical|high|medium|low",
  "complexity": 1-10,
  "requiresContext": true/false,
  "requiresCodeGeneration": true/false,
  "requiresGitOps": true/false,
  "requiresReview": true/false,
  "affectedAreas": ["area1", "area2"],
  "estimatedTokens": number
}`,
      },
      {
        role: 'user',
        content: instruction,
      },
    ];

    try {
      const { data, result } = await this.client.structuredChat<TaskClassification>(
        config.models.general,
        messages,
        { maxTokens: 500 },
      );

      this.trackUsage(config.models.general, result);

      if (!Object.values(TaskType).includes(data.type)) {
        data.type = TaskType.UNKNOWN;
      }
      if (!Object.values(TaskPriority).includes(data.priority)) {
        data.priority = TaskPriority.MEDIUM;
      }

      logger.info(`[Router] Task classified as ${data.type} (priority: ${data.priority}, complexity: ${data.complexity})`);
      return data;
    } catch (error) {
      logger.warn('[Router] Task classification failed, using defaults:', error);
      return {
        type: TaskType.UNKNOWN,
        priority: TaskPriority.MEDIUM,
        complexity: 5,
        requiresContext: true,
        requiresCodeGeneration: true,
        requiresGitOps: false,
        requiresReview: true,
        affectedAreas: [],
        estimatedTokens: 20000,
      };
    }
  }

  route(taskType: TaskType): RoutingDecision {
    const mapping = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP[TaskType.UNKNOWN];
    const primary = MODEL_DEFINITIONS[mapping.primary];

    if (!primary) {
      throw new Error(`No model found for task type: ${taskType}`);
    }

    return {
      taskType,
      selectedModelId: primary.id,
      reasoning: `Task type "${taskType}" routed to ${primary.model} (id: ${primary.id})`,
    };
  }

  async execute(messages: ChatMessage[], options?: ChatOptions & { preferredModelId?: string }): Promise<ChatResult> {
    const modelId = options?.preferredModelId ?? 'coder';
    const model = MODEL_DEFINITIONS[modelId];

    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const result = await this.client.chat(model.model, messages, {
      ...options,
      maxTokens: Math.min(options?.maxTokens ?? model.maxOutputTokens, model.maxOutputTokens),
    });

    this.trackUsage(model.model, result);
    return result;
  }

  async executeWithFallback(
    messages: ChatMessage[],
    primaryModelId: string,
    fallbackModelId: string,
    options?: ChatOptions
  ): Promise<ChatResult> {
    const primary = MODEL_DEFINITIONS[primaryModelId];
    const fallback = MODEL_DEFINITIONS[fallbackModelId];

    try {
      const result = await this.client.chat(primary.model, messages, {
        ...options,
        maxTokens: Math.min(options?.maxTokens ?? primary.maxOutputTokens, primary.maxOutputTokens),
      });
      this.trackUsage(primary.model, result);
      return result;
    } catch (error) {
      logger.warn(`[Router] Primary model ${primary.model} failed, falling back to ${fallback.model}`);
      const result = await this.client.chat(fallback.model, messages, {
        ...options,
        maxTokens: Math.min(options?.maxTokens ?? fallback.maxOutputTokens, fallback.maxOutputTokens),
      });
      this.trackUsage(fallback.model, result);
      return result;
    }
  }

  async executeRouted(taskType: TaskType, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const mapping = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP[TaskType.UNKNOWN];
    return this.executeWithFallback(messages, mapping.primary, mapping.fallback, options);
  }

  getClient(): UnifiedClient {
    return this.client;
  }

  getCostTracker(): ModelCostTracker {
    return { ...this.costTracker };
  }

  getUsageSummary(): TokenUsage {
    return {
      heavy: this.costTracker.callsByModel[config.models.heavy] ?? 0,
      fast: this.costTracker.callsByModel[config.models.fast] ?? 0,
      general: this.costTracker.callsByModel[config.models.general] ?? 0,
      coder: this.costTracker.callsByModel[config.models.coder] ?? 0,
      analyst: this.costTracker.callsByModel[config.models.analyst] ?? 0,
      total: this.costTracker.totalInputTokens + this.costTracker.totalOutputTokens,
      estimatedCost: this.costTracker.totalCost,
    };
  }

  private trackUsage(modelName: string, result: ChatResult): void {
    this.costTracker.totalInputTokens += result.inputTokens;
    this.costTracker.totalOutputTokens += result.outputTokens;
    this.costTracker.totalCost += result.cost;
    this.costTracker.callsByModel[modelName] = (this.costTracker.callsByModel[modelName] ?? 0) + 1;
  }
}
