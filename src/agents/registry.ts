import { AgentCapability, TaskType, TaskClassification } from '../types';
import logger from '../core/logger';

export interface AgentInfo {
  name: string;
  capabilities: AgentCapability[];
  supportedTaskTypes: TaskType[];
  execute: (instruction: string, context: string, classification?: TaskClassification) => Promise<AgentResult>;
}

export interface AgentResult {
  success: boolean;
  output: string;
  changes?: Array<{ file: string; type: string; diff: string; content: string; reasoning: string }>;
  metadata?: Record<string, unknown>;
  tokensUsed?: number;
  model?: string;
}

export class AgentRegistry {
  private agents: Map<string, AgentInfo>;

  constructor() {
    this.agents = new Map();
  }

  register(agent: AgentInfo): void {
    this.agents.set(agent.name, agent);
    logger.info(`[Registry] Registered agent: ${agent.name} (capabilities: ${agent.capabilities.join(', ')})`);
  }

  unregister(name: string): void {
    this.agents.delete(name);
  }

  findAgentForTask(classification: TaskClassification): AgentInfo | null {
    const requiredCapabilities = this.getRequiredCapabilities(classification);
    const taskTypes = [classification.type, TaskType.UNKNOWN];

    let bestMatch: AgentInfo | null = null;
    let bestScore = 0;

    for (const agent of this.agents.values()) {
      let score = 0;

      const hasMatchingType = agent.supportedTaskTypes.some(t => taskTypes.includes(t));
      if (hasMatchingType) score += 10;

      for (const cap of requiredCapabilities) {
        if (agent.capabilities.includes(cap)) {
          score += 5;
        }
      }

      const coverage = requiredCapabilities.filter(c => agent.capabilities.includes(c)).length;
      score += coverage * 2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    if (bestMatch) {
      logger.debug(`[Registry] Selected agent: ${bestMatch.name} (score: ${bestScore})`);
    }

    return bestMatch;
  }

  findAgentsByCapability(capability: AgentCapability): AgentInfo[] {
    return Array.from(this.agents.values())
      .filter(a => a.capabilities.includes(capability));
  }

  getAgent(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  listAgents(): Array<{ name: string; capabilities: AgentCapability[] }> {
    return Array.from(this.agents.values()).map(a => ({
      name: a.name,
      capabilities: a.capabilities,
    }));
  }

  private getRequiredCapabilities(classification: TaskClassification): AgentCapability[] {
    const capabilities: AgentCapability[] = [];

    if (classification.requiresContext) {
      capabilities.push(AgentCapability.CONTEXT_RETRIEVAL);
    }
    if (classification.requiresCodeGeneration) {
      capabilities.push(AgentCapability.CODE_GENERATION);
    }
    if (classification.requiresGitOps) {
      capabilities.push(AgentCapability.GIT_OPERATIONS);
    }
    if (classification.requiresReview) {
      capabilities.push(AgentCapability.CODE_REVIEW);
    }

    if (capabilities.length === 0) {
      capabilities.push(AgentCapability.CODE_ANALYSIS);
    }

    return capabilities;
  }
}
