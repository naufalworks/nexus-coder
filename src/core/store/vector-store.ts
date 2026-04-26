import { QdrantClient } from '@qdrant/js-client-rest';
import { ContextEntry } from '../../types';
import { EmbeddingGenerator, EmbeddingUnavailableError } from './embeddings';
import logger from '../logger';

const COLLECTION_NAME = 'nexus_v2_context';

export class VectorStore {
  private client: QdrantClient | null;
  private embeddingGenerator: EmbeddingGenerator;
  private initialized: boolean;
  private available: boolean;

  constructor(embeddingGenerator: EmbeddingGenerator) {
    this.client = null;
    this.embeddingGenerator = embeddingGenerator;
    this.initialized = false;
    this.available = false;

    try {
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      this.client = new QdrantClient({
        url: qdrantUrl,
        apiKey: process.env.QDRANT_API_KEY || undefined,
      });
      this.available = true;
    } catch (error) {
      logger.warn(`[VectorStore] Qdrant client init failed, vector store disabled: ${error}`);
      this.available = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.available || !this.client) return;
    if (!this.embeddingGenerator.isEnabled()) {
      logger.info('[VectorStore] Embeddings disabled, skipping vector store init');
      return;
    }

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (!exists) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: 1536,
            distance: 'Cosine',
          },
        });
        logger.info(`[VectorStore] Created collection: ${COLLECTION_NAME}`);
      }

      this.initialized = true;
    } catch (error) {
      logger.warn(`[VectorStore] Qdrant not available, running without vector store: ${error}`);
      this.initialized = false;
      this.available = false;
    }
  }

  async store(entry: ContextEntry): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.initialized || !this.client) return;

    try {
      if (!entry.embedding) {
        entry.embedding = await this.embeddingGenerator.generate(entry.content);
      }

      await this.client.upsert(COLLECTION_NAME, {
        points: [
          {
            id: entry.id,
            vector: entry.embedding,
            payload: {
              content: entry.content.substring(0, 10000),
              relevance: entry.relevance,
              file: entry.metadata.file,
              line: entry.metadata.line,
              type: entry.metadata.type,
              source: entry.metadata.source,
              timestamp: entry.metadata.timestamp.toISOString(),
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) {
        logger.debug(`[VectorStore] Embeddings unavailable, skipping store for ${entry.id}`);
        return;
      }
      logger.debug(`[VectorStore] Failed to store entry ${entry.id}: ${error}`);
    }
  }

  async storeBatch(entries: ContextEntry[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.initialized || !this.client) return;

    try {
      const texts = entries.map(e => e.content);
      const embeddings = await this.embeddingGenerator.generateBatch(texts);

      const points = entries.map((entry, i) => ({
        id: entry.id,
        vector: embeddings[i],
        payload: {
          content: entry.content.substring(0, 10000),
          relevance: entry.relevance,
          file: entry.metadata.file,
          line: entry.metadata.line,
          type: entry.metadata.type,
          source: entry.metadata.source,
          timestamp: entry.metadata.timestamp.toISOString(),
        },
      }));

      await this.client.upsert(COLLECTION_NAME, { points });
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) {
        logger.debug(`[VectorStore] Embeddings unavailable, skipping batch store`);
        return;
      }
      logger.debug(`[VectorStore] Batch store failed: ${error}`);
    }
  }

  async search(query: string, limit: number = 10, minScore: number = 0.5): Promise<ContextEntry[]> {
    if (!this.initialized) await this.initialize();
    if (!this.initialized || !this.client) return [];

    try {
      const queryVector = await this.embeddingGenerator.generate(query);

      const results = await this.client.search(COLLECTION_NAME, {
        vector: queryVector,
        limit,
        score_threshold: minScore,
      });

      return results.map(result => ({
        id: result.id as string,
        content: (result.payload?.content as string) ?? '',
        relevance: result.score ?? 0,
        embedding: undefined,
        metadata: {
          file: result.payload?.file as string | undefined,
          line: result.payload?.line as number | undefined,
          type: (result.payload?.type as ContextEntry['metadata']['type']) ?? 'code',
          source: (result.payload?.source as string) ?? 'vector_store',
          timestamp: new Date((result.payload?.timestamp as string) ?? Date.now()),
        },
      }));
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) {
        logger.debug(`[VectorStore] Embeddings unavailable, skipping search`);
        return [];
      }
      logger.debug(`[VectorStore] Search failed: ${error}`);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized || !this.client) return;

    try {
      await this.client.delete(COLLECTION_NAME, {
        points: [id],
      });
    } catch (error) {
      logger.debug(`[VectorStore] Delete failed for ${id}: ${error}`);
    }
  }

  async clear(): Promise<void> {
    if (!this.initialized || !this.client) return;

    try {
      await this.client.deleteCollection(COLLECTION_NAME);
      this.initialized = false;
      await this.initialize();
    } catch (error) {
      logger.debug(`[VectorStore] Clear failed: ${error}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.getCollection(COLLECTION_NAME);
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available && this.initialized;
  }
}
