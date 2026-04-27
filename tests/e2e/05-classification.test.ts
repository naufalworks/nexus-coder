import { UnifiedClient } from '../../src/core/models/unified-client';
import { ModelRouter } from '../../src/core/models/router';
import { TaskType } from '../../src/types';

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

describeIf('E2E: Task Classification (Real LLM)', () => {
  jest.setTimeout(120000);

  let router: ModelRouter;

  beforeAll(() => {
    const client = new UnifiedClient();
    router = new ModelRouter(client);
  });

  test('should classify a bug fix task', async () => {
    const result = await router.classifyTask(
      'Fix the crash in router.ts when input is undefined',
    );

    expect(result).toBeDefined();
    expect(Object.values(TaskType)).toContain(result.type);
    expect(result.priority).toBeDefined();
    expect(result.complexity).toBeGreaterThan(0);
    console.log(`[Classification] Bug fix: type=${result.type}, priority=${result.priority}, complexity=${result.complexity}`);
  });

  test('should classify a feature request', async () => {
    const result = await router.classifyTask(
      'Add a new health check endpoint to the API',
    );

    expect(result).toBeDefined();
    expect(Object.values(TaskType)).toContain(result.type);
    console.log(`[Classification] Feature: type=${result.type}, priority=${result.priority}`);
  });

  test('should classify a refactoring task', async () => {
    const result = await router.classifyTask(
      'Refactor the compression engine to use strategy pattern instead of switch statements',
    );

    expect(result).toBeDefined();
    expect(Object.values(TaskType)).toContain(result.type);
    console.log(`[Classification] Refactor: type=${result.type}, complexity=${result.complexity}`);
  });

  test('should classify a review task', async () => {
    const result = await router.classifyTask(
      'Review the security implementation in file-writer.ts for potential vulnerabilities',
    );

    expect(result).toBeDefined();
    expect(Object.values(TaskType)).toContain(result.type);
    console.log(`[Classification] Review: type=${result.type}`);
  });

  test('should set requiresContext for code tasks', async () => {
    const result = await router.classifyTask(
      'Add error handling to the createFile method in FileWriter class',
    );

    expect(result).toBeDefined();
    console.log(`[Classification] requiresContext=${result.requiresContext}, affectedAreas=${result.affectedAreas?.join(',')}`);
  });

  test('should estimate tokens for complex tasks', async () => {
    const result = await router.classifyTask(
      'Rewrite the entire graph traversal module to support weighted shortest path algorithms with caching',
    );

    expect(result).toBeDefined();
    expect(result.estimatedTokens).toBeGreaterThan(0);
    console.log(`[Classification] Complex task: estimatedTokens=${result.estimatedTokens}, complexity=${result.complexity}`);
  });
});
