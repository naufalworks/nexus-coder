import OpenAI from 'openai';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../logger';

const EMBEDDING_DIMENSION = 1536;
const CACHE_TTL_MS = 3600000;
const MAX_CACHE_SIZE = 5000;
const MAX_INPUT_LENGTH = 8000;

export class EmbeddingUnavailableError extends Error {
  constructor(message: string = 'Embedding generation is unavailable') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

export class EmbeddingGenerator {
  private client: OpenAI | null;
  private enabled: boolean;
  private cache: Map<string, { embedding: number[]; timestamp: number }>;
  private cacheTTL: number;

  constructor() {
    this.enabled = false;
    this.client = null;
    this.cache = new Map();
    this.cacheTTL = CACHE_TTL_MS;

    try {
      this.client = new OpenAI({
        apiKey: config.api.key,
        baseURL: config.api.baseUrl,
      });
      this.enabled = true;
    } catch (error) {
      logger.warn(`[Embedding] Client init failed, embeddings disabled: ${error}`);
    }
  }

  async generate(text: string): Promise<number[]> {
    if (!this.enabled || !this.client) {
      throw new EmbeddingUnavailableError('Embedding client is not enabled or initialized');
    }

    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.embedding;
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, MAX_INPUT_LENGTH),
      });

      const embedding = response.data[0].embedding;
      this.cache.set(cacheKey, { embedding, timestamp: Date.now() });

      if (this.cache.size > MAX_CACHE_SIZE) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) this.cache.delete(oldestKey);
      }

      return embedding;
    } catch (error) {
      logger.debug(`[Embedding] Generation failed: ${error}`);
      this.enabled = false;
      throw new EmbeddingUnavailableError(`Embedding generation failed: ${error}`);
    }
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    if (!this.enabled || !this.client) {
      throw new EmbeddingUnavailableError('Embedding client is not enabled or initialized');
    }

    const results: number[][] = [];
    const uncached: Array<{ index: number; text: string; key: string }> = [];

    for (let i = 0; i < texts.length; i++) {
      const key = this.hashText(texts[i]);
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        results[i] = cached.embedding;
      } else {
        uncached.push({ index: i, text: texts[i], key });
      }
    }

    if (uncached.length > 0) {
      try {
        const batchTexts = uncached.map(item => item.text.substring(0, MAX_INPUT_LENGTH));
        const response = await this.client.embeddings.create({
          model: 'text-embedding-3-small',
          input: batchTexts,
        });

        for (let i = 0; i < uncached.length; i++) {
          const embedding = response.data[i].embedding;
          const { index, key } = uncached[i];
          results[index] = embedding;
          this.cache.set(key, { embedding, timestamp: Date.now() });
        }
      } catch (error) {
        logger.debug(`[Embedding] Batch generation failed: ${error}`);
        this.enabled = false;
        throw new EmbeddingUnavailableError(`Batch embedding generation failed: ${error}`);
      }
    }

    return results;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  clearCache(): void {
    this.cache.clear();
  }



  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }
}
