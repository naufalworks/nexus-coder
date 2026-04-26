import { TaskClassification } from '../../types';
import { UnifiedClient } from '../../core/models/unified-client';
import { ModelRouter } from '../../core/models/router';
import { ChatMessage } from '../../core/models/types';
import { config } from '../../core/config';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentResult } from '../registry';
import logger from '../../core/logger';

export class CoderAgent {
  private client: UnifiedClient;
  private modelRouter: ModelRouter;
  private eventBus: EventBus;

  constructor(client: UnifiedClient, modelRouter: ModelRouter, eventBus: EventBus) {
    this.client = client;
    this.modelRouter = modelRouter;
    this.eventBus = eventBus;
  }

  async execute(instruction: string, context: string, classification?: TaskClassification): Promise<AgentResult> {
    this.eventBus.emit(EventType.CODE_GENERATING, { instruction }, 'CoderAgent');

    try {
      const isSimple = classification?.complexity !== undefined && classification.complexity <= 3;

      const systemPrompt = `You are an expert coder. Given the context and instruction, produce the exact code changes needed.

CRITICAL OUTPUT FORMAT — you MUST wrap every file change in these exact markers:

===== FILE: path/to/file.ts =====
(full file content goes here — the COMPLETE file, not a diff)
===== END FILE =====

For NEW files, use:
===== NEW FILE: path/to/newfile.ts =====
(full file content)
===== END FILE =====

For files to DELETE, use:
===== DELETE FILE: path/to/oldfile.ts =====

Rules:
- Always output the COMPLETE file content, not partial or diffs
- Preserve all existing code that should not change
- Be precise — only change what's necessary
- Before each file, add a brief comment explaining what you changed and why
- Think step-by-step first, then produce the files`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
      ];

      if (context) {
        messages.push({
          role: 'user',
          content: `<context>\n${context}\n</context>\n\n<instruction>${instruction}</instruction>`,
        });
      } else {
        messages.push({
          role: 'user',
          content: instruction,
        });
      }

      let result;
      if (isSimple) {
        result = await this.modelRouter.executeWithFallback(messages, 'fast', 'coder');
      } else {
        result = await this.client.chat(config.models.heavy, messages, {
          maxTokens: 8000,
          temperature: 0.2,
        });
      }

      this.eventBus.emit(EventType.CODE_GENERATED, { output: result.content }, 'CoderAgent');

      const changes = this.parseFileBlocks(result.content);

      logger.info(`[CoderAgent] Generated ${changes?.length ?? 0} file changes`);

      return {
        success: true,
        output: result.content,
        changes,
        tokensUsed: result.inputTokens + result.outputTokens,
        model: result.model,
      };
    } catch (error) {
      logger.error(`[CoderAgent] Failed: ${error}`);
      return {
        success: false,
        output: `Code generation failed: ${error}`,
      };
    }
  }

  private parseFileBlocks(output: string): AgentResult['changes'] {
    const changes: AgentResult['changes'] = [];

    const newFileRegex = /===== NEW FILE:\s*(.+?)\s*=====\n([\s\S]*?)===== END FILE =====/g;
    let match;

    while ((match = newFileRegex.exec(output)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      changes.push({
        file: filePath,
        type: 'create',
        content,
        diff: '',
        reasoning: '',
      });
    }

    const modifyFileRegex = /===== FILE:\s*(.+?)\s*=====\n([\s\S]*?)===== END FILE =====/g;
    while ((match = modifyFileRegex.exec(output)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];

      if (changes.some(c => c.file === filePath)) continue;

      changes.push({
        file: filePath,
        type: 'modify',
        content,
        diff: '',
        reasoning: '',
      });
    }

    const deleteFileRegex = /===== DELETE FILE:\s*(.+?)\s*=====/g;
    while ((match = deleteFileRegex.exec(output)) !== null) {
      const filePath = match[1].trim();
      if (changes.some(c => c.file === filePath)) continue;

      changes.push({
        file: filePath,
        type: 'delete',
        content: '',
        diff: '',
        reasoning: '',
      });
    }

    return changes;
  }
}
