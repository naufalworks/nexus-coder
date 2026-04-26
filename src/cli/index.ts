#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { AgentOrchestrator } from '../agents/orchestrator';
import { GitManager } from '../core/git-manager';
import { ContextStore } from '../core/context-store';
import { RepoMapGenerator } from '../core/repomap';
import logger from '../core/logger';

const program = new Command();
const orchestrator = new AgentOrchestrator();
const gitManager = new GitManager();
const contextStore = new ContextStore();
const repoMapGenerator = new RepoMapGenerator();

program
  .name('nexus')
  .description('Multi-agent AI coding assistant with git-native workflow')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize nexus-coder in the current directory')
  .action(async () => {
    console.log(chalk.blue.bold('\n🚀 Initializing Nexus Coder...\n'));

    const spinner = ora('Checking git repository...').start();

    try {
      const isRepo = await gitManager.isRepo();
      if (!isRepo) {
        spinner.text = 'Creating git repository...';
        await gitManager.initRepo();
      }
      spinner.succeed('Git repository ready');

      spinner.start('Initializing context store...');
      await contextStore.initialize();
      spinner.succeed('Context store initialized');

      spinner.start('Generating repository map...');
      const repoMap = await repoMapGenerator.generate(process.cwd());
      spinner.succeed(`Repository map generated (${repoMap.files.size} files)`);

      console.log(chalk.green.bold('\n✓ Nexus Coder initialized successfully!\n'));
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.gray('  1. Configure your .env file with API keys'));
      console.log(chalk.gray('  2. Run `nexus code "your instruction"` to start coding\n'));
    } catch (error) {
      spinner.fail('Initialization failed');
      logger.error('Init error:', error);
      process.exit(1);
    }
  });

program
  .command('code <instruction>')
  .description('Execute a coding task with multi-agent coordination')
  .option('-c, --context <context>', 'Additional context for the task')
  .option('-a, --auto-approve', 'Automatically approve changes (not recommended)')
  .action(async (instruction: string, options) => {
    console.log(chalk.blue.bold('\n🤖 Nexus Coder - Multi-Agent Coding Assistant\n'));

    const spinner = ora('Analyzing task...').start();

    try {
      const result = await orchestrator.executeTask(instruction, process.cwd());

      spinner.succeed('Task analyzed');

      console.log(chalk.cyan('\n📋 Task Breakdown:'));
      console.log(chalk.gray(result.taskBreakdown));

      console.log(chalk.cyan('\n🔍 Code Analysis:'));
      console.log(chalk.gray(result.codeAnalysis));

      if (!options.autoApprove) {
        const { approved } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'approved',
            message: 'Do you want to proceed with the proposed changes?',
            default: false,
          },
        ]);

        if (!approved) {
          console.log(chalk.yellow('\n✗ Changes rejected by user\n'));
          return;
        }
      }

      console.log(chalk.green('\n✓ Task completed successfully!\n'));
    } catch (error) {
      spinner.fail('Task execution failed');
      logger.error('Code command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current git status and context information')
  .action(async () => {
    console.log(chalk.blue.bold('\n📊 Nexus Coder Status\n'));

    try {
      const gitStatus = await gitManager.getStatus();

      console.log(chalk.cyan('Git Status:'));
      console.log(chalk.gray(`  Current branch: ${gitStatus.current}`));
      console.log(chalk.gray(`  Modified files: ${gitStatus.modified.length}`));
      console.log(chalk.gray(`  Staged files: ${gitStatus.staged.length}`));

      if (gitStatus.modified.length > 0) {
        console.log(chalk.yellow('\nModified files:'));
        gitStatus.modified.forEach((file: string) => {
          console.log(chalk.gray(`  - ${file}`));
        });
      }

      console.log();
    } catch (error) {
      logger.error('Status command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('diff [file]')
  .description('Show git diff for file or all changes')
  .action(async (file?: string) => {
    console.log(chalk.blue.bold('\n📝 Git Diff\n'));

    try {
      const diff = await gitManager.getDiff(file);

      if (!diff) {
        console.log(chalk.gray('No changes detected\n'));
        return;
      }

      console.log(chalk.gray(diff));
      console.log();
    } catch (error) {
      logger.error('Diff command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('history [limit]')
  .description('Show recent commit history')
  .action(async (limit: string = '10') => {
    console.log(chalk.blue.bold('\n📜 Commit History\n'));

    try {
      const commits = await gitManager.getCommitHistory(parseInt(limit));

      commits.forEach((commit: any) => {
        console.log(chalk.cyan(`${commit.hash.substring(0, 7)}`) + 
          chalk.gray(` - ${commit.message}`));
      });

      console.log();
    } catch (error) {
      logger.error('History command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('undo')
  .description('Undo the last commit')
  .action(async () => {
    console.log(chalk.yellow.bold('\n⚠️  Undo Last Commit\n'));

    try {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to undo the last commit? This cannot be undone.',
          default: false,
        },
      ]);

      if (confirm) {
        await gitManager.undoLastCommit();
        console.log(chalk.green('\n✓ Last commit undone\n'));
      } else {
        console.log(chalk.gray('\nOperation cancelled\n'));
      }
    } catch (error) {
      logger.error('Undo command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('branch <name>')
  .description('Create and switch to a new branch')
  .action(async (name: string) => {
    console.log(chalk.blue.bold('\n🌿 Create Branch\n'));

    try {
      await gitManager.createBranch(name);
      console.log(chalk.green(`\n✓ Created and switched to branch: ${name}\n`));
    } catch (error) {
      logger.error('Branch command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('context <query>')
  .description('Search context memory for relevant information')
  .action(async (query: string) => {
    console.log(chalk.blue.bold('\n🧠 Context Search\n'));

    try {
      const results = await contextStore.search(query);

      if (results.length === 0) {
        console.log(chalk.gray('No relevant context found\n'));
        return;
      }

      results.forEach((result, index) => {
        const relevance = result.metadata?.relevance ?? 0;
        console.log(chalk.cyan(`\n[${index + 1}] Relevance: ${relevance.toFixed(2)}`));
        console.log(chalk.gray(result.content.substring(0, 200) + '...'));
      });

      console.log();
    } catch (error) {
      logger.error('Context command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program
  .command('clear-context')
  .description('Clear all stored context memory')
  .action(async () => {
    console.log(chalk.yellow.bold('\n⚠️  Clear Context Memory\n'));

    try {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to clear all context memory?',
          default: false,
        },
      ]);

      if (confirm) {
        await contextStore.clear();
        console.log(chalk.green('\n✓ Context memory cleared\n'));
      } else {
        console.log(chalk.gray('\nOperation cancelled\n'));
      }
    } catch (error) {
      logger.error('Clear context command error:', error);
      console.log(chalk.red('\n✗ Error: ') + error);
      process.exit(1);
    }
  });

program.parse();
