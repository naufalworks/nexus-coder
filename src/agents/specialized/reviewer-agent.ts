import { TaskClassification } from '../../types';
import { UnifiedClient } from '../../core/models/unified-client';
import { ChatMessage } from '../../core/models/types';
import { config } from '../../core/config';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentResult } from '../registry';
import logger from '../../core/logger';

export class ReviewerAgent {
  private client: UnifiedClient;
  private eventBus: EventBus;

  constructor(client: UnifiedClient, eventBus: EventBus) {
    this.client = client;
    this.eventBus = eventBus;
  }

  async execute(instruction: string, context: string, _classification?: TaskClassification): Promise<AgentResult> {
    this.eventBus.emit(EventType.CODE_REVIEWING, { instruction }, 'ReviewerAgent');

    try {
      const pass1Result = await this.firstPass(instruction, context);

      const issues = this.detectIssues(pass1Result);

      if (issues.length > 0) {
        logger.info(`[ReviewerAgent] First pass found ${issues.length} issues, running deep review`);
        const pass2Result = await this.deepReview(instruction, context, issues);

        this.eventBus.emit(EventType.CODE_REVIEWED, pass2Result, 'ReviewerAgent');

        return pass2Result;
      }

      this.eventBus.emit(EventType.CODE_REVIEWED, pass1Result, 'ReviewerAgent');

      logger.info('[ReviewerAgent] First pass clean, no deep review needed');
      return pass1Result;
    } catch (error) {
      logger.error(`[ReviewerAgent] Failed: ${error}`);
      return {
        success: false,
        output: `Review failed: ${error}`,
      };
    }
  }

  private async firstPass(instruction: string, context: string): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code reviewer. Quickly check the proposed changes for:
1. Syntax errors
2. Security issues
3. Logic errors
4. Missing error handling

Respond with JSON: { "approved": boolean, "issues": [{ "severity": "high|medium|low", "description": "..." }] }`,
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nChanges to review:\n${instruction}`,
      },
    ];

    const result = await this.client.chat(config.models.analyst, messages, { maxTokens: 1000, temperature: 0.2 });

    return {
      success: true,
      output: result.content,
      model: result.model,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }

  private async deepReview(instruction: string, context: string, issues: string[]): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a senior code reviewer performing a deep review. The first pass found issues.
Analyze thoroughly and provide:
1. Detailed analysis of each issue
2. Suggested fixes
3. Risk assessment
4. Whether the changes should be approved, modified, or rejected

Be specific and actionable.`,
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nChanges:\n${instruction}\n\nFirst pass issues:\n${issues.join('\n')}`,
      },
    ];

    const result = await this.client.chat(config.models.heavy, messages, { maxTokens: 4000 });

    return {
      success: true,
      output: result.content,
      model: result.model,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }

  private detectIssues(reviewResult: AgentResult): string[] {
    const issues: string[] = [];
    const output = reviewResult.output.toLowerCase();

    const issuePatterns = [
      /severity.*high/g,
      /security\s*issue/g,
      /syntax\s*error/g,
      /logic\s*error/g,
      /buffer\s*overflow/g,
      /sql\s*injection/g,
      /xss/g,
      /race\s*condition/g,
      /memory\s*leak/g,
    ];

    for (const pattern of issuePatterns) {
      const matches = output.match(pattern);
      if (matches) {
        issues.push(...matches);
      }
    }

    return issues;
  }
}
