import { Decision } from '../../../types';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../logger';

export class DecisionJournal {
  private storePath: string;
  private decisions: Decision[];
  private dirty: boolean;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), '.nexus', 'decisions.json');
    this.decisions = [];
    this.dirty = false;
    this.load();
  }

  record(task: string, decision: string, reasoning: string): Decision {
    const entry: Decision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      task,
      decision,
      reasoning,
      outcome: 'success',
      timestamp: new Date(),
    };

    this.decisions.push(entry);
    this.dirty = true;

    if (this.decisions.length > 500) {
      this.decisions = this.decisions.slice(-400);
    }

    return entry;
  }

  updateOutcome(id: string, outcome: Decision['outcome']): void {
    const entry = this.decisions.find(d => d.id === id);
    if (entry) {
      entry.outcome = outcome;
      this.dirty = true;
    }
  }

  getRelevant(currentTask: string, limit: number = 5): Decision[] {
    const taskWords = currentTask.toLowerCase().split(/\s+/);

    const scored = this.decisions.map(decision => {
      const decisionText = `${decision.task} ${decision.decision} ${decision.reasoning}`.toLowerCase();
      let score = 0;

      for (const word of taskWords) {
        if (word.length > 2 && decisionText.includes(word)) score += 1;
      }

      if (decision.outcome === 'success') score += 0.5;
      if (decision.outcome === 'failure') score += 0.3;

      return { decision, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.decision);
  }

  getRecent(limit: number = 10): Decision[] {
    return this.decisions.slice(-limit);
  }

  getSuccessRate(): number {
    if (this.decisions.length === 0) return 0;
    const successes = this.decisions.filter(d => d.outcome === 'success').length;
    return successes / this.decisions.length;
  }

  formatForContext(decisions: Decision[]): string {
    if (decisions.length === 0) return '';

    const lines = ['<past_decisions>'];
    for (const d of decisions) {
      lines.push(`  <decision outcome="${d.outcome}">`);
      lines.push(`    <task>${d.task}</task>`);
      lines.push(`    <choice>${d.decision}</choice>`);
      lines.push(`    <reasoning>${d.reasoning}</reasoning>`);
      lines.push(`  </decision>`);
    }
    lines.push('</past_decisions>');
    return lines.join('\n');
  }

  save(): void {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storePath, JSON.stringify(this.decisions, null, 2));
      this.dirty = false;
    } catch (error) {
      logger.debug(`[Decisions] Failed to save: ${error}`);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      this.decisions = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      logger.debug(`[Decisions] Loaded ${this.decisions.length} decisions`);
    } catch (error) {
      logger.debug(`[Decisions] Failed to load: ${error}`);
    }
  }
}
