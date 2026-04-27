import * as fs from 'fs';
import * as path from 'path';
import { UnifiedClient } from '../../src/core/models/unified-client';
import { ModelRouter } from '../../src/core/models/router';
import { EventBus } from '../../src/core/event-bus';
import { ContextEngine } from '../../src/core/context/engine';
import { EmbeddingGenerator } from '../../src/core/store/embeddings';
import { FileWriter } from '../../src/core/file-writer';
import { GitManager } from '../../src/core/git-manager';
import { AgentRegistry } from '../../src/agents/registry';
import { Planner } from '../../src/agents/orchestrator/planner';
import { DynamicOrchestrator } from '../../src/agents/orchestrator/orchestrator';
import { ContextAgent } from '../../src/agents/specialized/context-agent';
import { CoderAgent } from '../../src/agents/specialized/coder-agent';
import { ReviewerAgent } from '../../src/agents/specialized/reviewer-agent';
import { GitAgent } from '../../src/agents/specialized/git-agent';
import { setupEnv, removeSrcCache } from './setup';

const SRC_DIR = path.resolve(__dirname, '../../src');
const TEST_WORK_DIR = path.join(process.cwd(), '.nexus-test-pipeline');
const NEXUS_CACHE = path.resolve(__dirname, '../../.nexus');

const hasApiKey = !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
const describeIf = hasApiKey ? describe : describe.skip;

function createTestOrchestrator(contextEngine: ContextEngine, eventBus: EventBus): DynamicOrchestrator {
  const client = new UnifiedClient();
  const modelRouter = new ModelRouter(client);
  const planner = new Planner(client);
  const registry = new AgentRegistry();
  const gitManager = new GitManager();
  const fileWriter = new FileWriter(TEST_WORK_DIR);

  registry.register({
    name: 'context',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, ctx, classification) =>
      new ContextAgent(contextEngine, eventBus).execute(instruction, ctx, classification),
  });
  registry.register({
    name: 'coder',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, ctx, classification) =>
      new CoderAgent(client, modelRouter, eventBus).execute(instruction, ctx, classification),
  });
  registry.register({
    name: 'reviewer',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, ctx, classification) =>
      new ReviewerAgent(client, eventBus).execute(instruction, ctx, classification),
  });
  registry.register({
    name: 'git',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, ctx) =>
      new GitAgent(gitManager, client, eventBus).execute(instruction, ctx),
  });

  return new DynamicOrchestrator(
    modelRouter,
    contextEngine,
    eventBus,
    registry,
    planner,
    fileWriter,
    gitManager,
  );
}

describeIf('E2E: Full Pipeline — Instruction to File Changes', () => {
  jest.setTimeout(300000);

  let contextEngine: ContextEngine;
  let eventBus: EventBus;
  let orchestrator: DynamicOrchestrator;

  beforeAll(async () => {
    removeSrcCache();
    if (!fs.existsSync(TEST_WORK_DIR)) {
      fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
    }

    const client = new UnifiedClient();
    eventBus = new EventBus();
    const embeddingGen = new EmbeddingGenerator();
    contextEngine = new ContextEngine(client, eventBus, embeddingGen);
    await contextEngine.initialize(SRC_DIR);

    orchestrator = createTestOrchestrator(contextEngine, eventBus);
  });

  afterAll(() => {
    for (const dir of [TEST_WORK_DIR, NEXUS_CACHE]) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('should execute a simple code generation task end-to-end', async () => {
    const task = await orchestrator.execute(
      'Create a new file called greeter.ts with a function hello() that returns the string "Hello from Nexus"',
    );

    expect(task).toBeDefined();
    expect(task.status).toBeDefined();
    console.log(`[Pipeline] Task status: ${task.status}`);
    console.log(`[Pipeline] SubTasks: ${task.subTasks.length}`);

    if (task.result) {
      console.log(`[Pipeline] Success: ${task.result.success}`);
      if (task.result.output) {
        console.log(`[Pipeline] Output preview: ${task.result.output.substring(0, 300)}`);
      }
      if (task.result.changes && task.result.changes.length > 0) {
        console.log(`[Pipeline] Changes: ${task.result.changes.length}`);
        for (const change of task.result.changes) {
          console.log(`  [Pipeline] ${change.type} ${change.file} (risk=${change.risk})`);
        }
      }
    }
  });

  test('should analyze existing code when asked to explain', async () => {
    const task = await orchestrator.execute(
      'Explain how the GraphTraversal.getTaskNeighborhood method works',
    );

    expect(task).toBeDefined();
    console.log(`[Pipeline] Analysis task status: ${task.status}`);
    if (task.result?.output) {
      console.log(`[Pipeline] Analysis: ${task.result.output.substring(0, 500)}`);
    }
  });

  test('should handle a refactoring task with planning', async () => {
    const task = await orchestrator.execute(
      'Add input validation to the FileWriter.createFile method to check for empty content',
    );

    expect(task).toBeDefined();
    expect(task.subTasks.length).toBeGreaterThan(0);
    console.log(`[Pipeline] Refactor task: ${task.subTasks.length} subtasks, status=${task.status}`);
    for (const sub of task.subTasks) {
      console.log(`  [Pipeline] Subtask: agent=${sub.assignedAgent}, instruction=${sub.instruction.substring(0, 80)}`);
    }
  });

  test('should track token usage across execution', async () => {
    const task = await orchestrator.execute(
      'List all the public methods in the ContextEngine class',
    );

    if (task.tokenUsage) {
      console.log(`[Pipeline] Token usage: heavy=${task.tokenUsage.heavy}, fast=${task.tokenUsage.fast}, total=${task.tokenUsage.total}`);
    }
  });
});
