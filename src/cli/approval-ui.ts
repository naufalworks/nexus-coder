import inquirer from 'inquirer';
import chalk from 'chalk';
import { ApprovalRequest, ApprovalResponse } from '../types';

export class ApprovalUI {
  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    console.log('\n' + chalk.bold.yellow('═══ Changes Proposed ═══'));
    console.log(chalk.dim(`Risk: ${this.riskColor(request.risk)(request.risk.toUpperCase())} | Cost: $${request.cost.toFixed(4)}`));
    console.log(chalk.dim(`Impact: ${request.impact}`));
    console.log(chalk.dim(`Reasoning: ${request.reasoning.substring(0, 200)}...\n`));

    for (const change of request.changes) {
      const typeColor = change.type === 'create' ? chalk.green :
                        change.type === 'delete' ? chalk.red :
                        chalk.yellow;

      console.log(`  ${typeColor(`[${change.type.toUpperCase()}]`)} ${change.file}`);
      if (change.reasoning) {
        console.log(chalk.dim(`    Reason: ${change.reasoning}`));
      }
    }

    console.log();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: chalk.green('✓ Approve all changes'), value: 'approve' },
        { name: chalk.yellow('✗ Reject all changes'), value: 'reject' },
        { name: chalk.blue('📝 View full diff'), value: 'diff' },
        { name: chalk.gray('❓ Explain the reasoning'), value: 'explain' },
      ],
    }]);

    switch (action) {
      case 'approve':
        return { approved: true };
      case 'reject':
        return { approved: false, feedback: 'User rejected changes' };
      case 'diff':
        for (const change of request.changes) {
          console.log(chalk.bold(`\n--- ${change.file} ---`));
          console.log(change.diff);
        }
        return this.requestApproval(request);
      case 'explain':
        console.log(chalk.cyan(`\nReasoning: ${request.reasoning}\n`));
        return this.requestApproval(request);
      default:
        return { approved: false, feedback: 'No action taken' };
    }
  }

  private riskColor(risk: string): (text: string) => string {
    switch (risk) {
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      default: return chalk.green;
    }
  }
}
