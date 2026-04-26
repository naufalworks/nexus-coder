import { TaskType } from '../../types';

export enum ModelCapability {
  CLASSIFICATION = 'classification',
  SUMMARIZATION = 'summarization',
  CODE_GENERATION = 'code_generation',
  CODE_REVIEW = 'code_review',
  STRUCTURED_EXTRACTION = 'extraction',
  COMPLEX_REASONING = 'reasoning',
  PLANNING = 'planning',
  FAST_RESPONSE = 'fast_response',
}

export interface ModelDefinition {
  id: string;
  model: string;
  maxOutputTokens: number;
  latencyProfile: 'instant' | 'fast' | 'moderate' | 'slow';
  capabilities: ModelCapability[];
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  sessionId?: string;
  retries?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
}

export interface RoutingDecision {
  taskType: TaskType;
  selectedModelId: string;
  reasoning: string;
}

export interface ModelCostTracker {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  callsByModel: Record<string, number>;
}

export const MODEL_DEFINITIONS: Record<string, ModelDefinition> = {
  heavy: {
    id: 'heavy',
    model: 'kr/claude-sonnet-4.5',
    maxOutputTokens: 8192,
    latencyProfile: 'moderate',
    capabilities: [
      ModelCapability.CODE_GENERATION,
      ModelCapability.COMPLEX_REASONING,
      ModelCapability.CODE_REVIEW,
      ModelCapability.STRUCTURED_EXTRACTION,
    ],
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  fast: {
    id: 'fast',
    model: 'kr/claude-haiku-4.5',
    maxOutputTokens: 4096,
    latencyProfile: 'fast',
    capabilities: [
      ModelCapability.CLASSIFICATION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.FAST_RESPONSE,
      ModelCapability.CODE_REVIEW,
    ],
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  general: {
    id: 'general',
    model: 'kr/glm-5',
    maxOutputTokens: 4096,
    latencyProfile: 'instant',
    capabilities: [
      ModelCapability.CLASSIFICATION,
      ModelCapability.SUMMARIZATION,
      ModelCapability.FAST_RESPONSE,
      ModelCapability.PLANNING,
    ],
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  coder: {
    id: 'coder',
    model: 'kr/qwen3-coder-next',
    maxOutputTokens: 8192,
    latencyProfile: 'fast',
    capabilities: [
      ModelCapability.CODE_GENERATION,
      ModelCapability.COMPLEX_REASONING,
      ModelCapability.PLANNING,
      ModelCapability.STRUCTURED_EXTRACTION,
    ],
    supportsJsonMode: true,
    supportsStreaming: true,
  },
  analyst: {
    id: 'analyst',
    model: 'kr/deepseek-3.2',
    maxOutputTokens: 4096,
    latencyProfile: 'fast',
    capabilities: [
      ModelCapability.CODE_REVIEW,
      ModelCapability.STRUCTURED_EXTRACTION,
      ModelCapability.SUMMARIZATION,
    ],
    supportsJsonMode: true,
    supportsStreaming: true,
  },
};

export const TASK_MODEL_MAP: Record<TaskType, { primary: string; fallback: string }> = {
  [TaskType.BUG_FIX]: { primary: 'heavy', fallback: 'coder' },
  [TaskType.FEATURE]: { primary: 'heavy', fallback: 'coder' },
  [TaskType.REFACTOR]: { primary: 'heavy', fallback: 'coder' },
  [TaskType.REVIEW]: { primary: 'analyst', fallback: 'fast' },
  [TaskType.EXPLAIN]: { primary: 'general', fallback: 'fast' },
  [TaskType.TEST]: { primary: 'heavy', fallback: 'coder' },
  [TaskType.DOCUMENTATION]: { primary: 'general', fallback: 'fast' },
  [TaskType.CONFIGURATION]: { primary: 'general', fallback: 'fast' },
  [TaskType.UNKNOWN]: { primary: 'coder', fallback: 'general' },
};
