import chalk from 'chalk';
import inquirer from 'inquirer';
import { CodeChange, ApprovalRequest, ApprovalResponse } from '../types';

export class ApprovalUI {
  static async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    console.log(chalk.blue.bold('\n┌─────────────────────────────────────────────────┐'));
    console.log(chalk.blue.bold('│  PROPOSED CHANGE                                │'));
    console.log(chalk.blue.bold('├─────────────────────────────────────────────────┤'));

    for (const change of request.changes) {
      console.log(chalk.cyan(`  File: ${change.file}`));
      console.log();

      console.log(chalk.yellow('  REASONING:'));
      console.log(chalk.gray('  ' + change.reasoning.split('\n').join('\n  ')));
      console.log();

      console.log(chalk.yellow('  IMPACT:'));
      change.impact.forEach((imp) => {
        console.log(chalk.gray('  • ' + imp));
      });
      console.log();

      console.log(chalk.yellow('  RISK:'));
      const riskColor = change.risk === 'low' ? chalk.green : 
                       change.risk === 'medium' ? chalk.yellow : chalk.red;
      console.log(riskColor('  ' + change.risk.toUpperCase()));
      console.log();

      console.log(chalk.yellow('  DIFF:'));
      console.log(chalk.gray('  ' + change.diff.split('\n').join('\n  ')));
      console.log();
    }

    console.log(chalk.blue.bold('├─────────────────────────────────────────────────┤'));
    console.log(chalk.blue.bold('│  [A]pprove  [R]eject  [M]odify  [?]Explain      │'));
    console.log(chalk.blue.bold('└─────────────────────────────────────────────────┘'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Approve changes', value: 'approve' },
          { name: 'Reject changes', value: 'reject' },
          { name: 'Request modifications', value: 'modify' },
          { name: 'Explain reasoning', value: 'explain' },
        ],
      },
    ]);

    if (action === 'approve') {
      return { approved: true };
    } else if (action === 'reject') {
      const { feedback } = await inquirer.prompt([
        {
          type: 'input',
          name: 'feedback',
          message: 'Why are you rejecting these changes? (optional)',
        },
      ]);

      return { approved: false, feedback };
    } else if (action === 'modify') {
      const { modifications } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'modifications',
          message: 'Describe the modifications you want',
        },
      ]);

      return { approved: false, feedback: modifications };
    } else {
      // Explain - show more details
      console.log(chalk.cyan('\n📝 Detailed Explanation:'));
      console.log(chalk.gray(request.reasoning));
      console.log();

      // Ask again
      return this.requestApproval(request);
    }
  }

  static showSuccess(message: string): void {
    console.log(chalk.green.bold('\n✓ ' + message + '\n'));
  }

  static showError(message: string): void {
    console.log(chalk.red.bold('\n✗ ' + message + '\n'));
  }

  static showInfo(message: string): void {
    console.log(chalk.cyan('\nℹ ' + message + '\n'));
  }

  static showWarning(message: string): void {
    console.log(chalk.yellow.bold('\n⚠ ' + message + '\n'));
  }
}
