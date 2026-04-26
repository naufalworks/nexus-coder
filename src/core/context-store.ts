import { QdrantClient } from '@qdrant/js-client-rest';
import { ContextEntry } from '../types';
import logger from './logger';
import { v4 as uuidv4 } from 'uuid';

export class ContextStore {
  private client: QdrantClient;
  private collectionName: string = 'nexus_context';
  private vectorSize: number;

  constructor(url: string = 'http://localhost:6333', vectorSize: number = 1536) {
    this.client = new QdrantClient({ url });
    this.vectorSize = vectorSize;
  }

  async initialize(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });
        logger.info(`Created Qdrant collection: ${this.collectionName}`);
      }
    } catch (error) {
      logger.error('Failed to initialize Qdrant:', error);
      throw error;
    }
  }

  async store(entry: ContextEntry): Promise<string> {
    try {
      const id = entry.id || uuidv4();
      
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: id,
            vector: entry.embedding || [],
            payload: {
              content: entry.content,
              metadata: entry.metadata,
            },
          },
        ],
      });

      logger.debug(`Stored context entry: ${id}`);
      return id;
    } catch (error) {
      logger.error('Failed to store context:', error);
      throw error;
    }
  }

  async search(
    query: string,
    limit: number = 10
  ): Promise<ContextEntry[]> {
    try {
      const results = await this.client.search(this.collectionName, {
        vector: await this.getEmbedding(query),
        limit: limit,
      });

      return results.map((result) => ({
        id: result.id as string,
        content: result.payload?.content as string,
        metadata: result.payload?.metadata as any,
        relevance: result.score,
      }));
    } catch (error) {
      logger.error('Failed to search context:', error);
      return [];
    }
  }

  async getRelevantContext(
    query: string,
    maxTokens: number = 50000
  ): Promise<ContextEntry[]> {
    try {
      const results = await this.search(query, 20);
      
      let totalTokens = 0;
      const relevantEntries: ContextEntry[] = [];

      for (const entry of results) {
        const tokens = this.estimateTokens(entry.content);
        if (totalTokens + tokens <= maxTokens) {
          relevantEntries.push(entry);
          totalTokens += tokens;
        } else {
          break;
        }
      }

      return relevantEntries;
    } catch (error) {
      logger.error('Failed to get relevant context:', error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [id],
      });
      logger.debug(`Deleted context entry: ${id}`);
    } catch (error) {
      logger.error('Failed to delete context:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.deleteCollection(this.collectionName);
      await this.initialize();
      logger.info('Cleared all context');
    } catch (error) {
      logger.error('Failed to clear context:', error);
      throw error;
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // TODO: Implement actual embedding generation
    // For now, return a dummy vector
    return new Array(this.vectorSize).fill(0);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async summarize(entries: ContextEntry[]): Promise<string> {
    const combinedContent = entries
      .map((e) => e.content)
      .join('\n\n---\n\n');
    
    // TODO: Use LLM to summarize
    return combinedContent.substring(0, 5000);
  }
}

export const contextStore = new ContextStore();
