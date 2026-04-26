import { CompressionLevel, SCGNode } from '../../../types';
import { TokenBudgetManager } from './token-budget';
import logger from '../../logger';

const MAX_FEEDBACK_HISTORY = 20;
const EXPANSION_FAILURE_THRESHOLD = 2;
const RECENT_WINDOW = 5;

export interface ContextFeedback {
  wasSufficient: boolean;
  missingInfo?: string[];
  agentRequestedMore: boolean;
}

export class AdaptiveWindow {
  private budgetManager: TokenBudgetManager;
  private feedbackHistory: ContextFeedback[];
  private currentExpansionLevel: number;

  constructor(budgetManager: TokenBudgetManager) {
    this.budgetManager = budgetManager;
    this.feedbackHistory = [];
    this.currentExpansionLevel = 0;
  }

  private estimateTokensForLevel(node: SCGNode, level: CompressionLevel): number {
    switch (level) {
      case CompressionLevel.SIGNATURE: {
        const typePrefix = node.type === 'function' ? 'fn' :
                           node.type === 'class' ? 'class' : 'symbol';
        const text = `${typePrefix} ${node.name}${node.signature.includes('(') ? node.signature.substring(node.name.length) : ''}`;
        return Math.ceil(text.length / 3.5);
      }
      case CompressionLevel.SUMMARY: {
        const summary = node.summary || `${node.type} defined at ${node.file}:${node.line}`;
        return Math.ceil(summary.length / 3.5);
      }
      case CompressionLevel.PARTIAL:
      case CompressionLevel.FULL:
        return Math.ceil(node.signature.length / 3.5) * 3;
      default:
        return Math.ceil(node.signature.length / 3.5);
    }
  }

  adjustCompression(nodes: SCGNode[], baseBudget: number): Array<{ node: SCGNode; level: CompressionLevel }> {
    const adjusted: Array<{ node: SCGNode; level: CompressionLevel }> = [];
    let remainingBudget = baseBudget;

    const recentFailures = this.feedbackHistory.slice(-RECENT_WINDOW)
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

      const estimated = this.estimateTokensForLevel(node, level);
      if (remainingBudget - estimated < 0) {
        level = CompressionLevel.SIGNATURE;
      }

      remainingBudget -= this.estimateTokensForLevel(node, level);
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
