import OpenAI from 'openai';
import { config } from '../config';
import logger from '../logger';
import { ChatMessage, ChatOptions, ChatResult } from './types';

export class UnifiedClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.api.key,
      baseURL: config.api.baseUrl,
    });
  }

  async chat(model: string, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const maxTokens = options?.maxTokens ?? 4096;
    const maxRetries = options?.retries ?? config.retry.maxRetries;
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const stream = await this.client.chat.completions.create({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          max_tokens: maxTokens,
          temperature: options?.temperature ?? 0.7,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
          stream: true,
        });

        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0;
            outputTokens = chunk.usage.completion_tokens ?? 0;
          }
        }

        const latencyMs = Date.now() - startTime;

        if (!inputTokens) {
          inputTokens = Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
          outputTokens = Math.ceil(fullContent.length / 4);
        }

        logger.debug(
          `[Unified:${model}] ${inputTokens}in/${outputTokens}out, ${latencyMs}ms`
        );

        return {
          content: fullContent,
          model,
          inputTokens,
          outputTokens,
          latencyMs,
          cost: 0,
        };
      } catch (error: unknown) {
        lastError = error as Error;
        const delay = Math.min(
          config.retry.baseDelayMs * Math.pow(config.retry.backoffMultiplier, attempt),
          config.retry.maxDelayMs
        );
        logger.warn(`[Unified:${model}] Attempt ${attempt + 1}/${maxRetries} failed, retry in ${delay}ms: ${lastError.message}`);
        await this.sleep(delay);
      }
    }

    throw new Error(`UnifiedClient failed after ${maxRetries} retries: ${lastError?.message}`);
  }

  async chatStream(
    model: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions,
  ): Promise<ChatResult> {
    const maxTokens = options?.maxTokens ?? 4096;
    const startTime = Date.now();

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        onChunk(delta);
      }
    }

    const latencyMs = Date.now() - startTime;
    return {
      content: fullContent,
      model,
      inputTokens: Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4),
      outputTokens: Math.ceil(fullContent.length / 4),
      latencyMs,
      cost: 0,
    };
  }

  async structuredChat<T>(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<{ data: T; result: ChatResult }> {
    const jsonMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'system',
        content: 'You must respond with valid JSON only. No markdown, no explanation, just the JSON object.',
      },
    ];

    const result = await this.chat(model, jsonMessages, {
      ...options,
      jsonMode: true,
    });

    let cleaned = result.content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const data: T = JSON.parse(cleaned);
    return { data, result };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
