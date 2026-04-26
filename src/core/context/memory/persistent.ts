import * as fs from 'fs';
import * as path from 'path';
import { ContextEntry } from '../../../types';
import logger from '../../logger';

const MAX_MEMORIES = 5000;
const EVICTION_PERCENTAGE = 0.1;

interface MemoryRecord {
  id: string;
  content: string;
  category: 'convention' | 'preference' | 'pattern' | 'error' | 'success';
  project: string;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  relevanceScore: number;
}

export class PersistentMemory {
  private storePath: string;
  private memories: Map<string, MemoryRecord>;
  private maxMemories: number;
  private dirty: boolean;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), '.nexus', 'memory.json');
    this.memories = new Map();
    this.maxMemories = MAX_MEMORIES;
    this.dirty = false;
    this.load();
  }

  store(content: string, category: MemoryRecord['category'], metadata?: Record<string, unknown>): string {
    const id = this.generateId(content);
    const existing = this.memories.get(id);

    if (existing) {
      existing.accessCount++;
      existing.lastAccessed = new Date().toISOString();
      this.dirty = true;
      return id;
    }

    const record: MemoryRecord = {
      id,
      content,
      category,
      project: process.cwd(),
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 1,
      relevanceScore: 1.0,
    };

    if (this.memories.size >= this.maxMemories) {
      this.evict();
    }

    this.memories.set(id, record);
    this.dirty = true;
    return id;
  }

  retrieve(query: string, limit: number = 10): MemoryRecord[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scored = Array.from(this.memories.values()).map(record => {
      const contentLower = record.content.toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        if (contentLower.includes(word)) score += 2;
      }

      if (contentLower.includes(queryLower)) score += 5;

      score += record.accessCount * 0.1;
      score *= record.relevanceScore;

      const ageMs = Date.now() - new Date(record.lastAccessed).getTime();
      score *= Math.max(0.1, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));

      return { record, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.record);
  }

  retrieveByCategory(category: MemoryRecord['category'], limit: number = 20): MemoryRecord[] {
    return Array.from(this.memories.values())
      .filter(r => r.category === category)
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  search(query: string, limit: number = 10): ContextEntry[] {
    const records = this.retrieve(query, limit);
    return records.map(record => ({
      id: record.id,
      content: record.content,
      relevance: record.relevanceScore,
      metadata: {
        type: 'memory' as const,
        source: 'persistent_memory',
        timestamp: new Date(record.createdAt),
      },
    }));
  }

  updateRelevance(id: string, delta: number): void {
    const record = this.memories.get(id);
    if (record) {
      record.relevanceScore = Math.max(0, Math.min(2, record.relevanceScore + delta));
      this.dirty = true;
    }
  }

  recordSuccess(content: string): void {
    this.store(content, 'success');
  }

  recordError(content: string): void {
    this.store(content, 'error');
  }

  recordConvention(content: string): void {
    this.store(content, 'convention');
  }

  getStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    for (const record of this.memories.values()) {
      byCategory[record.category] = (byCategory[record.category] ?? 0) + 1;
    }
    return { total: this.memories.size, byCategory };
  }

  save(): void {
    if (!this.dirty) return;

    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.memories.values());
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (error) {
      logger.debug(`[Memory] Failed to save: ${error}`);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;

      const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as MemoryRecord[];
      for (const record of data) {
        this.memories.set(record.id, record);
      }

      logger.debug(`[Memory] Loaded ${this.memories.size} memories`);
    } catch (error) {
      logger.debug(`[Memory] Failed to load: ${error}`);
    }
  }

  private evict(): void {
    const entries = Array.from(this.memories.values());
    entries.sort((a, b) => {
      const aScore = a.relevanceScore * a.accessCount;
      const bScore = b.relevanceScore * b.accessCount;
      return aScore - bScore;
    });

    const toRemove = entries.slice(0, Math.floor(this.maxMemories * EVICTION_PERCENTAGE));
    for (const record of toRemove) {
      this.memories.delete(record.id);
    }
  }

  private generateId(content: string): string {
    const hash = content.trim().toLowerCase().substring(0, 100);
    let h = 0;
    for (let i = 0; i < hash.length; i++) {
      h = ((h << 5) - h + hash.charCodeAt(i)) | 0;
    }
    return `mem_${Math.abs(h).toString(36)}`;
  }
}
