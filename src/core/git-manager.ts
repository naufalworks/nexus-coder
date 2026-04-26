import simpleGit, { SimpleGit } from 'simple-git';
import { GitCommit, CodeChange } from '../types';
import logger from './logger';
import { v4 as uuidv4 } from 'uuid';

export class GitManager {
  private git: SimpleGit;
  private commitPrefix: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.git = simpleGit(workingDirectory);
    this.commitPrefix = 'nexus:';
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async initRepo(): Promise<void> {
    const isRepo = await this.isRepo();
    if (!isRepo) {
      await this.git.init();
      logger.info('Initialized git repository');
    }
  }

  async getStatus(): Promise<any> {
    const status = await this.git.status();
    return {
      current: status.current,
      tracking: status.tracking,
      files: status.files,
      staged: status.staged,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
    };
  }

  async getDiff(file?: string): Promise<string> {
    if (file) {
      return await this.git.diff([file]);
    }
    return await this.git.diff();
  }

  async stageChanges(files: string[]): Promise<void> {
    await this.git.add(files);
    logger.info(`Staged files: ${files.join(', ')}`);
  }

  async commitChanges(
    changes: CodeChange[],
    reasoning: string
  ): Promise<GitCommit> {
    const files = changes.map((c) => c.file);
    await this.stageChanges(files);

    const message = this.generateCommitMessage(changes, reasoning);
    const result = await this.git.commit(message);

    const commit: GitCommit = {
      hash: result.commit,
      message: message,
      author: result.author,
      timestamp: new Date(),
      changes: changes,
      reasoning: reasoning,
    };

    logger.info(`Committed changes: ${result.commit}`);
    return commit;
  }

  private generateCommitMessage(
    changes: CodeChange[],
    reasoning: string
  ): string {
    const changeTypes = changes.map((c) => c.type);
    const hasCreate = changeTypes.includes('create');
    const hasModify = changeTypes.includes('modify');
    const hasDelete = changeTypes.includes('delete');
    const hasRefactor = changeTypes.includes('refactor');

    let prefix = 'feat';
    if (hasRefactor && !hasCreate && !hasModify) prefix = 'refactor';
    if (hasDelete && !hasCreate && !hasModify) prefix = 'chore';

    const summary =
      reasoning.split('\n')[0].substring(0, 72) ||
      `Update ${changes.length} file(s)`;

    return `${this.commitPrefix} ${prefix}: ${summary}\n\nReasoning:\n${reasoning}`;
  }

  async undoLastCommit(): Promise<void> {
    await this.git.reset(['--hard', 'HEAD~1']);
    logger.info('Undid last commit');
  }

  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
    logger.info(`Created and switched to branch: ${branchName}`);
  }

  async switchBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
    logger.info(`Switched to branch: ${branchName}`);
  }

  async getCommitHistory(limit: number = 10): Promise<any[]> {
    const log = await this.git.log(['--oneline', `-${limit}`]);
    return log.all;
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return status.files.length > 0;
  }

  async commitUncommittedChanges(message?: string): Promise<void> {
    const hasChanges = await this.hasUncommittedChanges();
    if (hasChanges) {
      await this.git.add('.');
      await this.git.commit(
        message || `${this.commitPrefix} chore: Save uncommitted changes`
      );
      logger.info('Committed uncommitted changes');
    }
  }
}

export const gitManager = new GitManager();
