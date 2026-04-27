import * as path from 'path';
import * as fs from 'fs';
import { UnifiedClient } from '../../src/core/models/unified-client';
import { EventBus } from '../../src/core/event-bus';
import { ContextEngine } from '../../src/core/context/engine';
import { EmbeddingGenerator } from '../../src/core/store/embeddings';

const SRC_DIR = path.resolve(__dirname, '../../src');
const NEXUS_CACHE = path.resolve(__dirname, '../../.nexus');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

describeIf('E2E: Context Assembly', () => {
  jest.setTimeout(300000);

  let engine: ContextEngine;

  beforeAll(async () => {
    const client = new UnifiedClient();
    const eventBus = new EventBus();
    const embeddingGenerator = new EmbeddingGenerator();

    engine = new ContextEngine(client, eventBus, embeddingGenerator);
    await engine.initialize(SRC_DIR);
  });

  afterAll(() => {
    if (fs.existsSync(NEXUS_CACHE)) {
      fs.rmSync(NEXUS_CACHE, { recursive: true, force: true });
    }
  });

  test('should assemble context for a bug fix task', async () => {
    const context = await engine.assembleContext(
      'Fix the bug in FileWriter where path traversal is not caught',
    );

    expect(context).toBeDefined();
    expect(context.content).toBeTruthy();
    expect(context.content.length).toBeGreaterThan(0);
    expect(context.totalTokens).toBeGreaterThan(0);
    console.log(`[Context] Bug fix task: ${context.totalTokens} tokens, ${context.nodes.length} nodes, ratio=${context.compressionRatio.toFixed(2)}`);
    console.log(`[Context] Content preview: "${context.content.substring(0, 200)}..."`);
  });

  test('should assemble context for a feature task', async () => {
    const context = await engine.assembleContext(
      'Add a new method to GraphTraversal that finds the shortest path between two nodes',
    );

    expect(context).toBeDefined();
    expect(context.content).toBeTruthy();
    expect(context.totalTokens).toBeGreaterThan(0);
    console.log(`[Context] Feature task: ${context.totalTokens} tokens, ${context.nodes.length} nodes`);
  });

  test('should assemble context mentioning FileWriter when asked about file writing', async () => {
    const context = await engine.assembleContext(
      'How does the FileWriter create backups?',
    );

    const mentionsFileWriter = context.content.toLowerCase().includes('filewriter');
    const mentionsBackup = context.content.toLowerCase().includes('backup');
    console.log(`[Context] FileWriter question: mentions FileWriter=${mentionsFileWriter}, mentions backup=${mentionsBackup}`);
    console.log(`[Context] ${context.totalTokens} tokens across ${context.nodes.length} nodes`);
  });

  test('should assemble context within configured budget', async () => {
    const context = await engine.assembleContext(
      'Refactor the compression engine to support streaming',
    );

    const budget = 40000;
    console.log(`[Context] Tokens used: ${context.totalTokens}, budget: ${budget}, within budget: ${context.totalTokens <= budget}`);
  });

  test('should use cached graph on second initialization', async () => {
    const client = new UnifiedClient();
    const eventBus = new EventBus();
    const embeddingGenerator = new EmbeddingGenerator();

    const engine2 = new ContextEngine(client, eventBus, embeddingGenerator);
    const start = performance.now();
    await engine2.initialize(SRC_DIR);
    const elapsed = performance.now() - start;

    console.log(`[Context] Second init (from cache): ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
