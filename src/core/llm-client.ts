import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import logger from './logger';

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;
  }

  async sendMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt?: string
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages,
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      throw new Error('Unexpected response type from LLM');
    } catch (error) {
      logger.error('LLM API error:', error);
      throw error;
    }
  }

  async streamMessage(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt?: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: messages,
      });

      let fullResponse = '';

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullResponse += chunk;
          onChunk(chunk);
        }
      }

      return fullResponse;
    } catch (error) {
      logger.error('LLM streaming error:', error);
      throw error;
    }
  }

  async analyzeCode(
    code: string,
    instruction: string
  ): Promise<{ reasoning: string; changes: any[] }> {
    const systemPrompt = `You are an expert code analyst. Analyze the code and provide:
1. Reasoning: Why changes are needed
2. Impact: What the changes will fix/improve
3. Risk: Assessment of the change risk (low/medium/high)
4. Changes: Specific code modifications needed

Always think step-by-step and be thorough.`;

    const response = await this.sendMessage(
      [
        {
          role: 'user',
          content: `Code:\n\`\`\`\n${code}\n\`\`\`\n\nInstruction: ${instruction}`,
        },
      ],
      systemPrompt
    );

    return {
      reasoning: response,
      changes: [],
    };
  }
}

export const llmClient = new LLMClient();
