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
import { AgentCapability, TaskType } from '../types';
import { config } from '../core/config';
import logger from '../core/logger';

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

  registry.register({
    name: 'context',
    capabilities: [AgentCapability.CONTEXT_RETRIEVAL],
    supportedTaskTypes: [TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR, TaskType.UNKNOWN],
    execute: async (instruction, context, classification) => {
      const agent = new ContextAgent(contextEngine, eventBus);
      return agent.execute(instruction, context, classification);
    },
  });

  registry.register({
    name: 'coder',
    capabilities: [AgentCapability.CODE_GENERATION, AgentCapability.CODE_ANALYSIS],
    supportedTaskTypes: [TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR, TaskType.TEST, TaskType.UNKNOWN],
    execute: async (instruction, context, classification) => {
      const agent = new CoderAgent(client, modelRouter, eventBus);
      return agent.execute(instruction, context, classification);
    },
  });

  registry.register({
    name: 'reviewer',
    capabilities: [AgentCapability.CODE_REVIEW],
    supportedTaskTypes: [TaskType.REVIEW, TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR],
    execute: async (instruction, context, classification) => {
      const agent = new ReviewerAgent(client, eventBus);
      return agent.execute(instruction, context, classification);
    },
  });

  registry.register({
    name: 'git',
    capabilities: [AgentCapability.GIT_OPERATIONS],
    supportedTaskTypes: [TaskType.CONFIGURATION, TaskType.UNKNOWN],
    execute: async (instruction, _context, _classification) => {
      const agent = new GitAgent(gitManager, client, eventBus);
      return agent.execute(instruction, _context);
    },
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
  .description('Start interactive mode')
  .action(async () => {
    try {
      const svc = await getServices();
      console.log(chalk.cyan('Building Semantic Code Graph...'));
      await svc.contextEngine.initialize(process.cwd());
      const interactive = new InteractiveMode(svc.orchestrator, svc.modelRouter);
      await interactive.start();
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

program.parse();
