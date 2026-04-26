import { TokenBudget } from '../../../types';

const DEFAULT_BUDGET: TokenBudget = {
  total: 200000,
  systemPrompt: 3000,
  conversationHistory: 15000,
  codeContext: 40000,
  vectorMemory: 10000,
  repoMap: 5000,
  reserve: 5000,
};

export class TokenBudgetManager {
  private budget: TokenBudget;
  private usage: Map<string, number>;

  constructor(budget?: Partial<TokenBudget>) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.usage = new Map();
    this.usage.set('systemPrompt', 0);
    this.usage.set('conversationHistory', 0);
    this.usage.set('codeContext', 0);
    this.usage.set('vectorMemory', 0);
    this.usage.set('repoMap', 0);
  }

  allocate(category: string, tokens: number): boolean {
    const current = this.usage.get(category) ?? 0;
    const limit = this.budget[category as keyof TokenBudget];

    if (limit !== undefined && current + tokens > limit) {
      return false;
    }

    this.usage.set(category, current + tokens);
    return true;
  }

  getRemaining(category: string): number {
    const limit = this.budget[category as keyof TokenBudget];
    const used = this.usage.get(category) ?? 0;
    return limit !== undefined ? limit - used : 0;
  }

  getTotalRemaining(): number {
    const totalUsed = Array.from(this.usage.values()).reduce((sum, v) => sum + v, 0);
    return this.budget.total - totalUsed;
  }

  getUsage(): Record<string, { used: number; limit: number; percentage: number }> {
    const result: Record<string, { used: number; limit: number; percentage: number }> = {};

    for (const [category, used] of this.usage) {
      const limit = this.budget[category as keyof TokenBudget];
      if (limit !== undefined) {
        result[category] = {
          used,
          limit,
          percentage: (used / limit) * 100,
        };
      }
    }

    return result;
  }

  getCodeContextBudget(): number {
    return this.getRemaining('codeContext');
  }

  getMemoryBudget(): number {
    return this.getRemaining('vectorMemory');
  }

  reset(): void {
    for (const key of this.usage.keys()) {
      this.usage.set(key, 0);
    }
  }
}
