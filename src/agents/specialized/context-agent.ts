import { TaskClassification } from '../../types';
import { ContextEngine } from '../../core/context/engine';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentResult } from '../registry';
import logger from '../../core/logger';

export class ContextAgent {
  private contextEngine: ContextEngine;
  private eventBus: EventBus;

  constructor(contextEngine: ContextEngine, eventBus: EventBus) {
    this.contextEngine = contextEngine;
    this.eventBus = eventBus;
  }

  async execute(instruction: string, _context: string, classification?: TaskClassification): Promise<AgentResult> {
    this.eventBus.emit(EventType.CONTEXT_ASSEMBLING, { instruction }, 'ContextAgent');

    try {
      const compressed = await this.contextEngine.assembleContext(instruction, classification);

      this.eventBus.emit(EventType.CONTEXT_ASSEMBLED, {
        tokens: compressed.totalTokens,
        nodes: compressed.nodes.length,
      }, 'ContextAgent');

      logger.info(`[ContextAgent] Assembled ${compressed.totalTokens} tokens of context (${compressed.nodes.length} nodes)`);

      return {
        success: true,
        output: compressed.content,
        metadata: {
          totalTokens: compressed.totalTokens,
          nodeCount: compressed.nodes.length,
          compressionRatio: compressed.compressionRatio,
        },
        tokensUsed: compressed.totalTokens,
      };
    } catch (error) {
      logger.error(`[ContextAgent] Failed: ${error}`);
      return {
        success: false,
        output: `Context assembly failed: ${error}`,
      };
    }
  }
}
