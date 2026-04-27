import { EmbeddingGenerator } from '../../src/core/store/embeddings';
import { VectorStore } from '../../src/core/store/vector-store';
import { setupEnv } from './setup';

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const hasQdrant = !!process.env.QDRANT_URL;

const describeIfEmbeddings = hasApiKey ? describe : describe.skip;
const describeIfVectorStore = (hasApiKey && hasQdrant) ? describe : describe.skip;

describeIfEmbeddings('E2E: Embedding Generation (Real API)', () => {
  jest.setTimeout(60000);

  let generator: EmbeddingGenerator;

  beforeAll(() => {
    generator = new EmbeddingGenerator();
  });

  test('should generate embedding for a simple string', async () => {
    const embedding = await generator.generate('function hello() { return "world"; }');

    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    console.log(`[Embeddings] Generated embedding with ${embedding.length} dimensions`);
  });

  test('should generate embeddings in batch', async () => {
    const texts = [
      'export class FileWriter',
      'const router = new ModelRouter(client)',
      'async function buildGraph(directory: string)',
    ];

    const embeddings = await generator.generateBatch(texts);

    expect(embeddings).toBeDefined();
    expect(embeddings.length).toBe(texts.length);
    for (const emb of embeddings) {
      expect(emb.length).toBeGreaterThan(0);
    }
    console.log(`[Embeddings] Batch: ${embeddings.length} embeddings, ${embeddings[0].length} dims each`);
  });

  test('should cache identical embeddings', async () => {
    const text = 'cached embedding test string';

    const start1 = performance.now();
    await generator.generate(text);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    await generator.generate(text);
    const time2 = performance.now() - start2;

    console.log(`[Embeddings] First call: ${time1.toFixed(1)}ms, Cached call: ${time2.toFixed(1)}ms`);
    expect(time2).toBeLessThan(time1);
  });

  test('should handle batch generation performance', async () => {
    const texts = Array.from({ length: 10 }, (_, i) => `Batch test string number ${i} for embedding generation`);

    const start = performance.now();
    const embeddings = await generator.generateBatch(texts);
    const elapsed = performance.now() - start;

    expect(embeddings.length).toBe(10);
    console.log(`[Embeddings] Batch of 10 in ${elapsed.toFixed(0)}ms (${(elapsed / 10).toFixed(1)}ms per item)`);
  });
});

describeIfVectorStore('E2E: Vector Store (Real Qdrant)', () => {
  jest.setTimeout(60000);

  let store: VectorStore;

  beforeAll(async () => {
    const generator = new EmbeddingGenerator();
    store = new VectorStore(generator);
    await store.initialize();
  });

  test('should store and search for a context entry', async () => {
    await store.store({
      id: 'test-ctx-1',
      content: 'FileWriter validates paths against directory traversal attacks using path.relative',
      relevance: 1.0,
      metadata: {
        type: 'code',
        file: 'file-writer.ts',
        line: 45,
        timestamp: new Date(),
        source: 'e2e-test',
      },
    });

    await store.store({
      id: 'test-ctx-2',
      content: 'GraphTraversal uses BFS to explore the semantic code graph from seed nodes',
      relevance: 1.0,
      metadata: {
        type: 'code',
        file: 'traversal.ts',
        line: 50,
        timestamp: new Date(),
        source: 'e2e-test',
      },
    });

    const results = await store.search('path traversal validation', 3);

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    console.log(`[VectorStore] Search results: ${results.length}`);
    for (const r of results) {
      console.log(`  [VectorStore] relevance=${r.relevance}: ${r.content.substring(0, 80)}`);
    }
  });
});
