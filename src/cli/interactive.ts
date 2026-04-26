import readline from 'readline';
import chalk from 'chalk';
import { DynamicOrchestrator } from '../agents/orchestrator/orchestrator';
import { ModelRouter } from '../core/models/router';
import { ApprovalUI } from './approval-ui';
import { config } from '../core/config';
import logger from '../core/logger';

export class InteractiveMode {
  private orchestrator: DynamicOrchestrator;
  private modelRouter: ModelRouter;
  private approvalUI: ApprovalUI;
  private rl: readline.Interface;

  constructor(orchestrator: DynamicOrchestrator, modelRouter: ModelRouter) {
    this.orchestrator = orchestrator;
    this.modelRouter = modelRouter;
    this.approvalUI = new ApprovalUI();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.orchestrator.setApprovalCallback(async (request) => {
      return this.approvalUI.requestApproval(request);
    });
  }

  async start(): Promise<void> {
    console.log(chalk.bold.cyan('\n🚀 Nexus Coder V2 — Interactive Mode'));
    console.log(chalk.dim('Type your coding task, or "exit" to quit\n'));
    console.log(chalk.dim(`Models: ${config.models.heavy}, ${config.models.fast}, ${config.models.general}, ${config.models.coder}, ${config.models.analyst}`));
    console.log();

    this.prompt();
  }

  private prompt(): void {
    this.rl.question(chalk.green('nexus> '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.prompt();
        return;
      }

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log(chalk.dim('Goodbye!'));
        this.rl.close();
        return;
      }

      if (trimmed === 'help') {
        this.showHelp();
        this.prompt();
        return;
      }

      if (trimmed === 'status') {
        this.showStatus();
        this.prompt();
        return;
      }

      try {
        process.stdout.write(chalk.dim('\nProcessing...\n\n'));

        const task = await this.orchestrator.execute(trimmed);

        if (task.status === 'completed' && task.result) {
          console.log(chalk.bold.green('\n✓ Task completed\n'));
          console.log(task.result.output);
        } else if (task.status === 'failed') {
          console.log(chalk.bold.red(`\n✗ Task failed: ${task.error}\n`));
        }

        if (task.tokenUsage) {
          const u = task.tokenUsage;
          console.log(chalk.dim(
            `\nTokens — Heavy: ${u.heavy}, Fast: ${u.fast}, General: ${u.general}, Coder: ${u.coder}, Analyst: ${u.analyst} | ` +
            `Total: ${u.total} | Cost: $${u.estimatedCost.toFixed(4)}`
          ));
        }
      } catch (error) {
        console.log(chalk.red(`\nError: ${error}\n`));
      }

      console.log();
      this.prompt();
    });
  }

  private showHelp(): void {
    console.log(chalk.cyan('\nCommands:'));
    console.log('  <task>    — Describe what you want done');
    console.log('  status    — Show system status');
    console.log('  help      — Show this help');
    console.log('  exit      — Quit interactive mode\n');
  }

  private showStatus(): void {
    const costs = this.modelRouter.getCostTracker();
    console.log(chalk.cyan('\nNexus Coder V2 Status:'));
    console.log(`  Context Engine: Active (Semantic Code Graph)`);
    console.log(`  Models:`);
    console.log(`    Heavy:   ${config.models.heavy}`);
    console.log(`    Fast:    ${config.models.fast}`);
    console.log(`    General: ${config.models.general}`);
    console.log(`    Coder:   ${config.models.coder}`);
    console.log(`    Analyst: ${config.models.analyst}`);
    console.log(`  API: ${config.api.baseUrl}`);
    console.log(`  Total Cost: $${costs.totalCost.toFixed(4)} (${costs.totalInputTokens + costs.totalOutputTokens} tokens)`);
    console.log(`  Calls: ${JSON.stringify(costs.callsByModel)}`);
    console.log();
  }
}
