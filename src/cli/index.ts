#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { UnifiedClient } from '../core/models/unified-client';
import { ModelRouter } from '../core/models/router';
import { EventBus } from '../core/event-bus';
import { EmbeddingGenerator } from '../core/store/embeddings';
import { ContextEngine } from '../core/context/engine';
import { GitManager } from '../core/git-manager';
import { AgentRegistry } from '../agents/registry';
import { Planner } from '../agents/orchestrator/planner';
import { DynamicOrchestrator } from '../agents/orchestrator/orchestrator';
import { ContextAgent } from '../agents/specialized/context-agent';
import { CoderAgent } from '../agents/specialized/coder-agent';
import { ReviewerAgent } from '../agents/specialized/reviewer-agent';
import { GitAgent } from '../agents/specialized/git-agent';
import { InteractiveMode } from './interactive';
import { ApprovalUI } from './approval-ui';
import { AgentCapability, TaskType, TaskStatus } from '../types';
import { config } from '../core/config';
import logger from '../core/logger';
import {
  approveCommand,
  diffCommand,
  statusCommand,
  tasksCommand,
  codeCommand,
  reviewCommand,
  graphCommand,
  contextCommand,
  searchCommand,
  chatCommand,
  impactCommand,
  CLIContext,
} from './commands';

interface NexusServices {
  client: UnifiedClient;
  modelRouter: ModelRouter;
  eventBus: EventBus;
  embeddingGenerator: EmbeddingGenerator;
  contextEngine: ContextEngine;
  gitManager: GitManager;
  registry: AgentRegistry;
  planner: Planner;
  orchestrator: DynamicOrchestrator;
}

let services: NexusServices | null = null;

async function getServices(): Promise<NexusServices> {
  if (services) return services;

  logger.info('[Nexus] Initializing services...');

  const client = new UnifiedClient();
  const modelRouter = new ModelRouter(client);
  const eventBus = new EventBus();
  const embeddingGenerator = new EmbeddingGenerator();
  const contextEngine = new ContextEngine(client, eventBus, embeddingGenerator);
  const gitManager = new GitManager();
  const registry = new AgentRegistry();
  const planner = new Planner(client);

  const contextAgent = new ContextAgent(contextEngine, eventBus);
  const coderAgent = new CoderAgent(client, modelRouter, eventBus);
  const reviewerAgent = new ReviewerAgent(client, eventBus);
  const gitAgent = new GitAgent(gitManager, client, eventBus);

  registry.register({
    name: 'context',
    capabilities: [AgentCapability.CONTEXT_RETRIEVAL],
    supportedTaskTypes: [TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR, TaskType.UNKNOWN],
    execute: (instruction, context, classification) =>
      contextAgent.execute(instruction, context, classification),
  });

  registry.register({
    name: 'coder',
    capabilities: [AgentCapability.CODE_GENERATION, AgentCapability.CODE_ANALYSIS],
    supportedTaskTypes: [TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR, TaskType.TEST, TaskType.UNKNOWN],
    execute: (instruction, context, classification) =>
      coderAgent.execute(instruction, context, classification),
  });

  registry.register({
    name: 'reviewer',
    capabilities: [AgentCapability.CODE_REVIEW],
    supportedTaskTypes: [TaskType.REVIEW, TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR],
    execute: (instruction, context, classification) =>
      reviewerAgent.execute(instruction, context, classification),
  });

  registry.register({
    name: 'git',
    capabilities: [AgentCapability.GIT_OPERATIONS],
    supportedTaskTypes: [TaskType.CONFIGURATION, TaskType.UNKNOWN],
    execute: (instruction, _context, _classification) =>
      gitAgent.execute(instruction, _context),
  });

  const orchestrator = new DynamicOrchestrator(
    modelRouter,
    contextEngine,
    eventBus,
    registry,
    planner,
  );

  services = {
    client,
    modelRouter,
    eventBus,
    embeddingGenerator,
    contextEngine,
    gitManager,
    registry,
    planner,
    orchestrator,
  };

  return services;
}

const program = new Command();

program
  .name('nexus')
  .description('Nexus Coder V2 — Multi-Agent AI Coding Assistant with 100x Context')
  .version('2.0.0');

program
  .command('code <instruction>')
  .description('Execute a coding task')
  .option('--no-review', 'Skip code review')
  .option('--no-approval', 'Auto-approve changes')
  .action(async (instruction: string, options: { review: boolean; approval: boolean }) => {
    try {
      const svc = await getServices();

      console.log(chalk.cyan('Building Semantic Code Graph...'));
      await svc.contextEngine.initialize(process.cwd());

      if (options.approval) {
        const approvalUI = new ApprovalUI();
        svc.orchestrator.setApprovalCallback(async (request) => {
          return approvalUI.requestApproval(request);
        });
      } else {
        svc.orchestrator.setApprovalCallback(async () => ({ approved: true }));
      }

      const task = await svc.orchestrator.execute(instruction);

      if (task.result?.success) {
        console.log(chalk.bold.green('\n✓ Task completed successfully'));
        console.log(task.result.output);
      } else {
        console.log(chalk.bold.red(`\n✗ Task failed: ${task.error}`));
      }

      if (task.tokenUsage) {
        console.log(chalk.dim(
          `\nCost: $${task.tokenUsage.estimatedCost.toFixed(4)} ` +
          `(${task.tokenUsage.total} tokens)`
        ));
      }
    } catch (error) {
      console.error(chalk.red(`Fatal error: ${error}`));
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Start interactive agent chat session')
  .option('--agent <name>', 'Target a specific agent')
  .option('--context <files>', 'Comma-separated list of context files')
  .action(async (options: { agent?: string; context?: string }) => {
    try {
      const svc = await getServices();
      console.log(chalk.cyan('Building Semantic Code Graph...'));
      await svc.contextEngine.initialize(process.cwd());

      const { ChatService } = await import('../services/chat-service');
      const chatService = new ChatService(svc.registry, svc.client, svc.contextEngine, svc.eventBus);

      const contextFiles = options.context
        ? options.context.split(',').map(f => f.trim())
        : undefined;

      await chatCommand(chatService, svc.registry, {
        agent: options.agent,
        context: contextFiles,
      });
    } catch (error) {
      console.error(chalk.red(`Fatal error: ${error}`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize the project (build context graph)')
  .action(async () => {
    try {
      const svc = await getServices();
      console.log(chalk.cyan('Building Semantic Code Graph...'));
      await svc.contextEngine.initialize(process.cwd());
      const graph = svc.contextEngine.getGraph();
      if (graph) {
        console.log(chalk.green(`✓ Graph built: ${graph.nodes.size} nodes, ${graph.edges.length} edges, ${graph.fileCount} files`));
      }
    } catch (error) {
      console.error(chalk.red(`Init failed: ${error}`));
    }
  });

program
  .command('status')
  .description('Show system status')
  .action(async () => {
    try {
      console.log(chalk.cyan('\nNexus Coder V2 — Status'));
      console.log(`  Working Directory: ${process.cwd()}`);
      console.log(`  API Endpoint: ${config.api.baseUrl}`);
      console.log(`  Models:`);
      console.log(`    Heavy:   ${config.models.heavy}`);
      console.log(`    Fast:    ${config.models.fast}`);
      console.log(`    General: ${config.models.general}`);
      console.log(`    Coder:   ${config.models.coder}`);
      console.log(`    Analyst: ${config.models.analyst}`);
      console.log(`  Context Engine: Semantic Code Graph (SCG)`);
      console.log(`  Agents: context, coder, reviewer, git`);
      console.log();
    } catch (error) {
      console.error(chalk.red(`Status failed: ${error}`));
    }
  });

// Helper to build CLI context from services
function buildCLIContext(svc: NexusServices): CLIContext {
  const tasks: any[] = [];
  const agents = Array.from(svc.registry['agents'].values()).map(a => ({
    name: a.name,
    capabilities: a.capabilities,
    supportedTaskTypes: a.supportedTaskTypes,
    status: 'idle' as const,
  }));
  const changes: any[] = [];
  const graph = svc.contextEngine.getGraph() ?? undefined;
  const log: any[] = [];

  return { tasks, agents, changes, graph, log };
}

// New CLI commands mirroring IDE widget flows

program
  .command('approve')
  .description('Approve code changes')
  .option('--task-id <id>', 'Task ID')
  .option('--change-index <index>', 'Change index', parseInt)
  .option('--all', 'Approve all changes')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await approveCommand(context, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('diff')
  .description('Display code changes')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--verbose', 'Show detailed diff')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await diffCommand(context, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('agent-status')
  .description('Display agent status and progress')
  .option('--agent <name>', 'Filter by agent name')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await statusCommand(context, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('tasks')
  .description('List and filter tasks')
  .option('--status <status>', 'Filter by status')
  .option('--agent <name>', 'Filter by agent')
  .option('--verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await tasksCommand(context, {
        status: options.status as TaskStatus | undefined,
        agent: options.agent,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('show-code')
  .description('Display code context for a task')
  .requiredOption('--task-id <id>', 'Task ID')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await codeCommand(context, { taskId: options.taskId });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('review')
  .description('Display reasoning log')
  .option('--agent <name>', 'Filter by agent')
  .option('--keyword <keyword>', 'Filter by keyword')
  .option('--limit <n>', 'Limit number of entries', parseInt)
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await reviewCommand(context, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('graph')
  .description('Display semantic code graph for a task')
  .requiredOption('--task-id <id>', 'Task ID')
  .option('--expand', 'Show relationships')
  .action(async (options) => {
    try {
      const svc = await getServices();
      await svc.contextEngine.initialize(process.cwd());
      const context = buildCLIContext(svc);
      await graphCommand(context, { taskId: options.taskId, expand: options.expand });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('context')
  .description('Display full context for a task')
  .requiredOption('--task-id <id>', 'Task ID')
  .action(async (options) => {
    try {
      const svc = await getServices();
      const context = buildCLIContext(svc);
      await contextCommand(context, { taskId: options.taskId });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Semantic code search')
  .option('--limit <n>', 'Maximum results to return', parseInt, 10)
  .option('--min-score <score>', 'Minimum relevance score threshold', parseFloat, 0.5)
  .option('--no-graph', 'Disable graph context enrichment')
  .option('--file <pattern>', 'Filter by file pattern')
  .option('--type <type>', 'Filter by result type')
  .action(async (query: string, options) => {
    try {
      const svc = await getServices();
      await svc.contextEngine.initialize(process.cwd());

      const vectorStore = svc.contextEngine.getVectorStore();
      const traversal = svc.contextEngine.getTraversal();

      if (!vectorStore) {
        throw new Error('Vector store not available. Run "nexus init" first.');
      }
      if (!traversal) {
        throw new Error('Graph traversal not available. Run "nexus init" first.');
      }

      await searchCommand(vectorStore, traversal, query, {
        limit: options.limit,
        minScore: options.minScore,
        graph: options.graph,
        file: options.file,
        type: options.type,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('impact')
  .description('Analyze code change impact')
  .option('--file <path>', 'File path to analyze')
  .option('--node <id>', 'Graph node ID to analyze')
  .option('--depth <n>', 'Maximum traversal depth', parseInt, 4)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const svc = await getServices();
      await svc.contextEngine.initialize(process.cwd());

      const graph = svc.contextEngine.getGraph();
      const traversal = svc.contextEngine.getTraversal();

      if (!graph) {
        throw new Error('Graph not available. Run `nexus init` first.');
      }
      if (!traversal) {
        throw new Error('Graph traversal not available. Run `nexus init` first.');
      }

      await impactCommand(null, graph, traversal, {
        file: options.file,
        node: options.node,
        depth: options.depth,
        json: options.json,
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

const gracefulShutdown = async (signal: string) => {
  logger.info(`[Nexus] Received ${signal}, shutting down gracefully...`);
  if (services) {
    try {
      await services.contextEngine.save();
      logger.info('[Nexus] State saved successfully');
    } catch (error) {
      logger.error(`[Nexus] Failed to save state: ${error}`);
    }
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

program.parse();
