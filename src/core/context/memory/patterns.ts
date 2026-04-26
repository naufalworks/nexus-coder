import { LearnedPattern } from '../../../types';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../logger';

export class PatternStore {
  private storePath: string;
  private patterns: LearnedPattern[];
  private dirty: boolean;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), '.nexus', 'patterns.json');
    this.patterns = [];
    this.dirty = false;
    this.load();
  }

  record(pattern: string, context: string, category: LearnedPattern['category']): LearnedPattern {
    const existing = this.patterns.find(
      p => p.pattern === pattern && p.category === category
    );

    if (existing) {
      existing.occurrences++;
      existing.lastUsed = new Date();
      existing.successRate = existing.successRate * 0.9 + 0.1;
      this.dirty = true;
      return existing;
    }

    const entry: LearnedPattern = {
      id: `pat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pattern,
      context,
      successRate: 1.0,
      occurrences: 1,
      lastUsed: new Date(),
      category,
    };

    this.patterns.push(entry);
    this.dirty = true;
    return entry;
  }

  findPatterns(taskDescription: string, category?: LearnedPattern['category'], limit: number = 5): LearnedPattern[] {
    const taskWords = taskDescription.toLowerCase().split(/\s+/);

    const scored = this.patterns
      .filter(p => !category || p.category === category)
      .map(pattern => {
        let score = pattern.successRate * pattern.occurrences;

        const patternText = `${pattern.pattern} ${pattern.context}`.toLowerCase();
        for (const word of taskWords) {
          if (word.length > 2 && patternText.includes(word)) score += 2;
        }

        const ageMs = Date.now() - new Date(pattern.lastUsed).getTime();
        score *= Math.max(0.1, 1 - ageMs / (7 * 24 * 60 * 60 * 1000));

        return { pattern, score };
      });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.pattern);
  }

  updateSuccessRate(patternId: string, success: boolean): void {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      const delta = success ? 0.1 : -0.1;
      pattern.successRate = Math.max(0, Math.min(1, pattern.successRate + delta));
      this.dirty = true;
    }
  }

  getByCategory(category: LearnedPattern['category']): LearnedPattern[] {
    return this.patterns
      .filter(p => p.category === category)
      .sort((a, b) => b.successRate * b.occurrences - a.successRate * a.occurrences);
  }

  formatForContext(patterns: LearnedPattern[]): string {
    if (patterns.length === 0) return '';

    const lines = ['<learned_patterns>'];
    for (const p of patterns) {
      lines.push(`  <pattern category="${p.category}" success_rate="${(p.successRate * 100).toFixed(0)}%">`);
      lines.push(`    ${p.pattern}`);
      lines.push(`    Context: ${p.context}`);
      lines.push(`  </pattern>`);
    }
    lines.push('</learned_patterns>');
    return lines.join('\n');
  }

  save(): void {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storePath, JSON.stringify(this.patterns, null, 2));
      this.dirty = false;
    } catch (error) {
      logger.debug(`[Patterns] Failed to save: ${error}`);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      this.patterns = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
    } catch (error) {
      logger.debug(`[Patterns] Failed to load: ${error}`);
    }
  }
}
