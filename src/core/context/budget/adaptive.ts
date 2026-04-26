import { CompressionLevel, SCGNode } from '../../../types';
import { TokenBudgetManager } from './token-budget';
import { ASTCompressor } from '../compression/ast-compress';
import logger from '../../logger';

const MAX_FEEDBACK_HISTORY = 20;
const EXPANSION_FAILURE_THRESHOLD = 2;

export interface ContextFeedback {
  wasSufficient: boolean;
  missingInfo?: string[];
  agentRequestedMore: boolean;
}

export class AdaptiveWindow {
  private budgetManager: TokenBudgetManager;
  private compressor: ASTCompressor;
  private feedbackHistory: ContextFeedback[];
  private currentExpansionLevel: number;

  constructor(budgetManager: TokenBudgetManager) {
    this.budgetManager = budgetManager;
    this.compressor = new ASTCompressor();
    this.feedbackHistory = [];
    this.currentExpansionLevel = 0;
  }

  adjustCompression(nodes: SCGNode[], baseBudget: number): Array<{ node: SCGNode; level: CompressionLevel }> {
    const adjusted: Array<{ node: SCGNode; level: CompressionLevel }> = [];
    let remainingBudget = baseBudget;

    const recentFailures = this.feedbackHistory
      .filter(f => !f.wasSufficient)
      .length;

    if (recentFailures > EXPANSION_FAILURE_THRESHOLD && this.currentExpansionLevel < 3) {
      this.currentExpansionLevel++;
      logger.info(`[AdaptiveWindow] Expanding context level to ${this.currentExpansionLevel}`);
    }

    for (const node of nodes) {
      let level = CompressionLevel.SIGNATURE;

      if (remainingBudget > baseBudget * 0.7) {
        level = CompressionLevel.FULL;
      } else if (remainingBudget > baseBudget * 0.4) {
        level = this.currentExpansionLevel > 0
          ? CompressionLevel.PARTIAL
          : CompressionLevel.SUMMARY;
      }

      const estimated = this.compressor.estimateTokens(
        this.compressor.compress(node, level)
      );

      if (remainingBudget - estimated < 0) {
        level = CompressionLevel.SIGNATURE;
      }

      const finalEstimate = this.compressor.estimateTokens(
        this.compressor.compress(node, level)
      );

      remainingBudget -= finalEstimate;
      adjusted.push({ node, level });
    }

    return adjusted;
  }

  recordFeedback(feedback: ContextFeedback): void {
    this.feedbackHistory.push(feedback);
    if (this.feedbackHistory.length > MAX_FEEDBACK_HISTORY) {
      this.feedbackHistory = this.feedbackHistory.slice(-MAX_FEEDBACK_HISTORY);
    }
  }

  shouldExpand(): boolean {
    if (this.feedbackHistory.length < 2) return false;
    const recent = this.feedbackHistory.slice(-3);
    return recent.filter(f => !f.wasSufficient).length >= 2;
  }

  shouldShrink(): boolean {
    if (this.feedbackHistory.length < 2) return false;
    const recent = this.feedbackHistory.slice(-3);
    return recent.every(f => f.wasSufficient && !f.agentRequestedMore);
  }

  getExpansionLevel(): number {
    return this.currentExpansionLevel;
  }

  reset(): void {
    this.currentExpansionLevel = 0;
    this.feedbackHistory = [];
  }
}
