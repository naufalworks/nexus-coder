import { ChangeType } from '../../types';
import { GitManager } from '../../core/git-manager';
import { UnifiedClient } from '../../core/models/unified-client';
import { ChatMessage } from '../../core/models/types';
import { config } from '../../core/config';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentResult } from '../registry';
import logger from '../../core/logger';

export class GitAgent {
  private gitManager: GitManager;
  private client: UnifiedClient;
  private eventBus: EventBus;

  constructor(gitManager: GitManager, client: UnifiedClient, eventBus: EventBus) {
    this.gitManager = gitManager;
    this.client = client;
    this.eventBus = eventBus;
  }

  async execute(instruction: string, _context: string, _classification?: import('../../types').TaskClassification): Promise<AgentResult> {
    const operation = this.parseOperation(instruction);

    try {
      switch (operation) {
        case 'status':
          return await this.handleStatus();
        case 'diff':
          return await this.handleDiff();
        case 'commit':
          return await this.handleCommit(instruction);
        case 'history':
          return await this.handleHistory();
        case 'branch':
          return await this.handleBranch(instruction);
        default:
          return await this.handleGeneric(instruction);
      }
    } catch (error) {
      this.eventBus.emit(EventType.ERROR_OCCURRED, { error }, 'GitAgent');
      return {
        success: false,
        output: `Git operation failed: ${error}`,
      };
    }
  }

  private async handleStatus(): Promise<AgentResult> {
    const status = await this.gitManager.getStatus();

    const output = [
      `Branch: ${status.current ?? 'unknown'}`,
      `Tracking: ${status.tracking ?? 'none'}`,
      `Staged: ${status.staged.length} files`,
      `Modified: ${status.modified.length} files`,
      `Created: ${status.created.length} files`,
      `Deleted: ${status.deleted.length} files`,
    ].join('\n');

    return { success: true, output };
  }

  private async handleDiff(): Promise<AgentResult> {
    const diff = await this.gitManager.getDiff();
    return { success: true, output: diff || 'No changes detected.' };
  }

  private async handleCommit(instruction: string): Promise<AgentResult> {
    const diff = await this.gitManager.getDiff();
    if (!diff) {
      return { success: true, output: 'No changes to commit.' };
    }

    const message = await this.generateCommitMessage(instruction, diff);

    const status = await this.gitManager.getStatus();
    const allFiles = [...status.staged, ...status.modified, ...status.created];
    await this.gitManager.stageChanges(allFiles);

    const result = await this.gitManager.commitChanges(
      allFiles.map(f => ({
        file: f,
        type: ChangeType.MODIFY,
        reasoning: instruction,
        impact: [],
        risk: 'low' as const,
        diff: '',
        content: '',
        approved: true,
      })),
      message,
    );

    this.eventBus.emit(EventType.GIT_COMMITTED, result, 'GitAgent');

    return {
      success: true,
      output: `Committed: ${result.hash}\nMessage: ${result.message}`,
      metadata: result,
    };
  }

  private async handleHistory(): Promise<AgentResult> {
    const history = await this.gitManager.getCommitHistory(20);
    const output = history.map(h => `${h.hash.substring(0, 8)} ${h.message}`).join('\n');
    return { success: true, output };
  }

  private async handleBranch(instruction: string): Promise<AgentResult> {
    const branchMatch = instruction.match(/branch\s+(?:--)?(\S+)/i);
    if (branchMatch) {
      const branchName = branchMatch[1];
      await this.gitManager.createBranch(branchName);
      return { success: true, output: `Created and switched to branch: ${branchName}` };
    }

    const current = await this.gitManager.getCurrentBranch();
    return { success: true, output: `Current branch: ${current}` };
  }

  private async handleGeneric(instruction: string): Promise<AgentResult> {
    return {
      success: true,
      output: `Git operation "${instruction}" not recognized. Available: status, diff, commit, history, branch.`,
    };
  }

  private async generateCommitMessage(instruction: string, diff: string): Promise<string> {
    const diffPreview = diff.substring(0, 2000);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Generate a concise conventional commit message (max 72 chars) for these changes. Just the message, nothing else.',
      },
      {
        role: 'user',
        content: `Task: ${instruction}\n\nDiff:\n${diffPreview}`,
      },
    ];

    try {
      const result = await this.client.chat(config.models.general, messages, { maxTokens: 100, temperature: 0.3 });
      return result.content.trim();
    } catch {
      return `nexus: ${instruction.substring(0, 50)}`;
    }
  }

  private parseOperation(instruction: string): string {
    const lower = instruction.toLowerCase();

    if (lower.includes('status') || lower.includes('what changed')) return 'status';
    if (lower.includes('diff') || lower.includes('show changes')) return 'diff';
    if (lower.includes('commit') || lower.includes('save')) return 'commit';
    if (lower.includes('history') || lower.includes('log')) return 'history';
    if (lower.includes('branch')) return 'branch';

    return 'generic';
  }
}
