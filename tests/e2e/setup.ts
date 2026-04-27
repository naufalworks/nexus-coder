import * as fs from 'fs';
import * as path from 'path';
import { UnifiedClient } from '../../src/core/models/unified-client';
import { ModelRouter } from '../../src/core/models/router';
import { EventBus } from '../../src/core/event-bus';
import { ContextEngine } from '../../src/core/context/engine';
import { SemanticGraphBuilder } from '../../src/core/context/graph/semantic-graph';
import { GraphTraversal } from '../../src/core/context/graph/traversal';
import { CompressionEngine } from '../../src/core/context/compression/compressor';
import { PersistentMemory } from '../../src/core/context/memory/persistent';
import { DecisionJournal } from '../../src/core/context/memory/decisions';
import { PatternStore } from '../../src/core/context/memory/patterns';
import { EmbeddingGenerator } from '../../src/core/store/embeddings';
import { VectorStore } from '../../src/core/store/vector-store';
import { FileWriter } from '../../src/core/file-writer';
import { GitManager } from '../../src/core/git-manager';
import { AgentRegistry } from '../../src/agents/registry';
import { Planner } from '../../src/agents/orchestrator/planner';
import { DynamicOrchestrator } from '../../src/agents/orchestrator/orchestrator';
import { ContextAgent } from '../../src/agents/specialized/context-agent';
import { CoderAgent } from '../../src/agents/specialized/coder-agent';
import { ReviewerAgent } from '../../src/agents/specialized/reviewer-agent';
import { GitAgent } from '../../src/agents/specialized/git-agent';
export const REPO_ROOT = path.resolve(__dirname, '../../');
export const SRC_DIR = path.join(REPO_ROOT, 'src');
export const TEST_WORK_DIR = path.join(REPO_ROOT, '.nexus-test-workspace');
export const TEST_MEMORY_DIR = path.join(REPO_ROOT, '.nexus-test-data');
const NEXUS_SRC_CACHE = path.join(SRC_DIR, '.nexus');

export function setupEnv(): void {
  if (process.env.NEXUS_API_KEY && !process.env.NEXUS_MODEL_GENERAL) {
    process.env.NEXUS_MODEL_GENERAL = 'glm-5.1';
    process.env.NEXUS_MODEL_FAST = 'glm-5.1';
    process.env.NEXUS_MODEL_HEAVY = 'glm-5.1';
    process.env.NEXUS_MODEL_CODER = 'glm-5.1';
    process.env.NEXUS_MODEL_ANALYST = 'glm-5.1';
  }
}

export function removeSrcCache(): void {
  if (fs.existsSync(NEXUS_SRC_CACHE)) {
    fs.rmSync(NEXUS_SRC_CACHE, { recursive: true, force: true });
  }
}

export function hasApiKey(): boolean {
  return !!(process.env.NEXUS_API_KEY && process.env.NEXUS_BASE_URL);
}

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function hasQdrant(): boolean {
  return !!process.env.QDRANT_URL;
}

export function ensureTestDir(): void {
  if (!fs.existsSync(TEST_WORK_DIR)) {
    fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_MEMORY_DIR)) {
    fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });
  }
}

export function cleanupTestDir(): void {
  for (const dir of [TEST_WORK_DIR, TEST_MEMORY_DIR]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  removeSrcCache();

  const cachePath = path.join(REPO_ROOT, '.nexus');
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
}

export function createClient(): UnifiedClient {
  return new UnifiedClient();
}

export function createModelRouter(): ModelRouter {
  const client = createClient();
  return new ModelRouter(client);
}

export function createEventBus(): EventBus {
  return new EventBus();
}

export function createEmbeddingGenerator(): EmbeddingGenerator {
  return new EmbeddingGenerator();
}

export async function createInitializedContextEngine(
  directory: string = SRC_DIR,
): Promise<{
  engine: ContextEngine;
  eventBus: EventBus;
  embeddingGenerator: EmbeddingGenerator;
}> {
  const eventBus = createEventBus();
  const embeddingGenerator = createEmbeddingGenerator();
  const client = createClient();

  const engine = new ContextEngine(client, eventBus, embeddingGenerator);
  await engine.initialize(directory);

  return { engine, eventBus, embeddingGenerator };
}

export function createFullOrchestrator(
  contextEngine: ContextEngine,
  eventBus: EventBus,
): DynamicOrchestrator {
  const client = createClient();
  const modelRouter = new ModelRouter(client);
  const planner = new Planner(client);
  const registry = new AgentRegistry();
  const gitManager = new GitManager();
  const fileWriter = new FileWriter();

  const contextAgent = new ContextAgent(contextEngine, eventBus);
  const coderAgent = new CoderAgent(client, modelRouter, eventBus);
  const reviewerAgent = new ReviewerAgent(client, eventBus);
  const gitAgent = new GitAgent(gitManager, client, eventBus);

  registry.register({
    name: 'context',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, context, classification) =>
      contextAgent.execute(instruction, context, classification),
  });
  registry.register({
    name: 'coder',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, context, classification) =>
      coderAgent.execute(instruction, context, classification),
  });
  registry.register({
    name: 'reviewer',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, context, classification) =>
      reviewerAgent.execute(instruction, context, classification),
  });
  registry.register({
    name: 'git',
    capabilities: [],
    supportedTaskTypes: [],
    execute: (instruction, ctx) => gitAgent.execute(instruction, ctx),
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

export {
  UnifiedClient,
  ModelRouter,
  EventBus,
  ContextEngine,
  SemanticGraphBuilder,
  GraphTraversal,
  CompressionEngine,
  PersistentMemory,
  DecisionJournal,
  PatternStore,
  EmbeddingGenerator,
  VectorStore,
  FileWriter,
  GitManager,
  AgentRegistry,
  Planner,
  DynamicOrchestrator,
};
