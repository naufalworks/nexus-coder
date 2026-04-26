import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { CodeChange, ChangeType } from '../types';
import logger from './logger';

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

  async getStatus(): Promise<{
    current: string | null;
    tracking: string | null;
    files: StatusResult['files'];
    staged: string[];
    modified: string[];
    created: string[];
    deleted: string[];
  }> {
    const status: StatusResult = await this.git.status();
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
  ): Promise<{ hash: string; message: string; author: string; timestamp: Date }> {
    const files = changes.map((c) => c.file);
    await this.stageChanges(files);

    const message = this.generateCommitMessage(changes, reasoning);
    const result = await this.git.commit(message);

    logger.info(`Committed changes: ${result.commit}`);

    return {
      hash: result.commit,
      message,
      author: result.author?.name ?? 'nexus-coder',
      timestamp: new Date(),
    };
  }

  generateCommitMessage(changes: CodeChange[], reasoning: string): string {
    const changeTypes = changes.map((c) => c.type);
    const hasCreate = changeTypes.includes(ChangeType.CREATE);
    const hasModify = changeTypes.includes(ChangeType.MODIFY);
    const hasDelete = changeTypes.includes(ChangeType.DELETE);
    const hasRefactor = changeTypes.includes(ChangeType.REFACTOR);

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

  async getCommitHistory(limit: number = 10): Promise<Array<{ hash: string; message: string; date: string }>> {
    const log = await this.git.log(['--oneline', `-${limit}`]);
    return log.all.map((entry) => ({
      hash: entry.hash,
      message: entry.message,
      date: entry.date,
    }));
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return status.files.length > 0;
  }

  async stageAllChanges(): Promise<void> {
    const hasChanges = await this.hasUncommittedChanges();
    if (hasChanges) {
      await this.git.add('.');
      logger.info('Staged all uncommitted changes');
    }
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current ?? 'main';
  }

  async fileExists(file: string): Promise<boolean> {
    try {
      await this.git.catFile(['-e', `HEAD:${file}`]);
      return true;
    } catch {
      return false;
    }
  }
}
