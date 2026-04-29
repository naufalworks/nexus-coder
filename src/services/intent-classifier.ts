/**
 * Intent Classifier Service
 *
 * Analyzes user messages to determine task intent and route to appropriate agents.
 * Uses pattern matching for high-confidence cases and LLM fallback for ambiguous cases.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 10.1-10.7, 13.1-13.4
 */

import { IntentType, IntentClassification, ChatMessage } from '../types/chat';
import { ModelRouter } from '../core/models/router';
import { AgentRegistry } from '../agents/registry';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum confidence threshold for pattern matching (0.8) */
const PATTERN_CONFIDENCE_THRESHOLD = 0.8;

/** Stop words to filter out during keyword extraction */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
  'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
]);

/** Pattern keywords for each intent type */
const INTENT_PATTERNS: Record<IntentType, string[]> = {
  [IntentType.REVIEW]: ['review', 'check', 'analyze', 'audit', 'inspect'],
  [IntentType.CODE]: ['write', 'create', 'implement', 'add', 'build'],
  [IntentType.REFACTOR]: ['refactor', 'improve', 'optimize', 'clean'],
  [IntentType.DEBUG]: ['debug', 'fix', 'error', 'bug', 'issue'],
  [IntentType.EXPLAIN]: ['explain', 'what', 'how', 'why', 'understand'],
  [IntentType.SEARCH]: ['find', 'search', 'locate', 'where'],
  [IntentType.GIT]: ['commit', 'push', 'branch', 'merge', 'git'],
  [IntentType.GENERAL]: [],
};

/** Intent to agent mapping */
const INTENT_AGENT_MAP: Record<IntentType, string> = {
  [IntentType.REVIEW]: 'reviewer',
  [IntentType.CODE]: 'coder',
  [IntentType.REFACTOR]: 'coder',
  [IntentType.DEBUG]: 'coder',
  [IntentType.EXPLAIN]: 'context',
  [IntentType.SEARCH]: 'context',
  [IntentType.GIT]: 'git',
  [IntentType.GENERAL]: 'orchestrator',
};

/** Intent to context scope mapping */
const INTENT_CONTEXT_SCOPE_MAP: Record<IntentType, 'full' | 'partial' | 'minimal'> = {
  [IntentType.REVIEW]: 'full',
  [IntentType.REFACTOR]: 'full',
  [IntentType.CODE]: 'partial',
  [IntentType.DEBUG]: 'partial',
  [IntentType.SEARCH]: 'partial',
  [IntentType.EXPLAIN]: 'minimal',
  [IntentType.GIT]: 'minimal',
  [IntentType.GENERAL]: 'minimal',
};

// ---------------------------------------------------------------------------
// IntentClassifier
// ---------------------------------------------------------------------------

/**
 * Service that classifies user intent from natural language messages.
 * 
 * Uses a two-stage approach:
 * 1. Pattern matching with keyword extraction (fast, high confidence)
 * 2. LLM classification (slower, handles ambiguous cases)
 */
export class IntentClassifier {
  constructor(
    private modelRouter: ModelRouter,
    private agentRegistry: AgentRegistry
  ) {}

  /**
   * Classify user intent from message and conversation history.
   * 
   * @param message - User message to classify
   * @param history - Recent conversation history (last 3 messages)
   * @returns IntentClassification with intent, confidence, keywords, agent, and scope
   * 
   * Postconditions:
   *  - Returns valid IntentType (one of 8 enum values)
   *  - Confidence is between 0.0 and 1.0
   *  - Keywords array is populated
   *  - Suggested agent matches intent
   *  - Context scope matches intent
   */
  async classify(
    message: string,
    history: ChatMessage[] = []
  ): Promise<IntentClassification> {
    // Extract keywords from message
    const keywords = this.extractKeywords(message);
    
    // Try pattern matching first (fast path)
    const patternResult = this.detectIntentByPattern(message, keywords);
    
    if (patternResult.confidence >= PATTERN_CONFIDENCE_THRESHOLD) {
      logger.debug(
        `[IntentClassifier] Pattern match: ${patternResult.intent} (confidence: ${patternResult.confidence.toFixed(2)})`
      );
      return patternResult;
    }
    
    // Fall back to LLM classification for ambiguous cases
    logger.debug(
      `[IntentClassifier] Pattern confidence too low (${patternResult.confidence.toFixed(2)}), using LLM`
    );
    
    try {
      const llmResult = await this.classifyWithLLM(message, history);
      return llmResult;
    } catch (error) {
      logger.warn(
        `[IntentClassifier] LLM classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      
      // Fall back to pattern result or GENERAL intent
      if (patternResult.confidence > 0) {
        return patternResult;
      }
      
      return {
        intent: IntentType.GENERAL,
        confidence: 0.5,
        keywords,
        suggestedAgent: this.mapIntentToAgent(IntentType.GENERAL),
        contextScope: this.determineContextScope(IntentType.GENERAL),
      };
    }
  }

  /**
   * Extract keywords from message by filtering stop words and short words.
   * 
   * @param message - User message
   * @returns Array of keywords (lowercase, >2 characters, not stop words)
   */
  extractKeywords(message: string): string[] {
    return message
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
      .map(word => word.replace(/[^a-z0-9]/g, '')) // Remove punctuation
      .filter(word => word.length > 0);
  }

  /**
   * Detect intent using pattern matching on keywords.
   * 
   * @param message - User message
   * @param keywords - Extracted keywords
   * @returns IntentClassification with pattern-based confidence
   * 
   * Algorithm:
   *  1. Score each intent by counting keyword matches
   *  2. Select intent with highest score
   *  3. Calculate confidence based on match ratio and boost for strong matches
   *  4. Return GENERAL intent if no matches found
   */
  detectIntentByPattern(
    message: string,
    keywords: string[]
  ): IntentClassification {
    // Handle empty keywords case
    if (keywords.length === 0) {
      return {
        intent: IntentType.GENERAL,
        confidence: 0,
        keywords: [],
        suggestedAgent: this.mapIntentToAgent(IntentType.GENERAL),
        contextScope: this.determineContextScope(IntentType.GENERAL),
      };
    }

    const scores: Record<IntentType, number> = {
      [IntentType.REVIEW]: 0,
      [IntentType.CODE]: 0,
      [IntentType.REFACTOR]: 0,
      [IntentType.DEBUG]: 0,
      [IntentType.EXPLAIN]: 0,
      [IntentType.SEARCH]: 0,
      [IntentType.GIT]: 0,
      [IntentType.GENERAL]: 0,
    };

    // Score each intent based on keyword matches
    for (const [intent, patternKeywords] of Object.entries(INTENT_PATTERNS)) {
      scores[intent as IntentType] = keywords.filter(keyword =>
        patternKeywords.some(pk => keyword.includes(pk) || pk.includes(keyword))
      ).length;
    }

    // Find highest scoring intent
    const maxScore = Math.max(...Object.values(scores));
    
    // If no matches, return GENERAL
    if (maxScore === 0) {
      return {
        intent: IntentType.GENERAL,
        confidence: 0,
        keywords,
        suggestedAgent: this.mapIntentToAgent(IntentType.GENERAL),
        contextScope: this.determineContextScope(IntentType.GENERAL),
      };
    }
    
    const topIntent = (Object.entries(scores).find(
      ([_, score]) => score === maxScore
    )?.[0] as IntentType) || IntentType.GENERAL;

    // Calculate confidence with boost for strong matches
    // Base confidence: matches / total keywords
    // Boost: if we have at least 1 match, add 0.5 to ensure we meet 0.7 threshold
    const baseConfidence = maxScore / keywords.length;
    const confidence = Math.min(baseConfidence + 0.5, 1.0);

    return {
      intent: topIntent,
      confidence,
      keywords,
      suggestedAgent: this.mapIntentToAgent(topIntent),
      contextScope: this.determineContextScope(topIntent),
    };
  }

  /**
   * Classify intent using LLM when pattern matching is ambiguous.
   * 
   * @param message - User message
   * @param history - Recent conversation history
   * @returns IntentClassification from LLM
   * 
   * Includes conversation history to resolve ambiguous references like "fix that".
   */
  async classifyWithLLM(
    message: string,
    history: ChatMessage[]
  ): Promise<IntentClassification> {
    // Build conversation context (last 3 messages)
    const recentHistory = history.slice(-3);
    const conversationContext = recentHistory.length > 0
      ? recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')
      : 'No previous conversation';

    const prompt = `Classify the user's intent from this message:

Message: "${message}"

Recent conversation:
${conversationContext}

Respond with JSON only (no markdown, no explanation):
{
  "intent": "review" | "code" | "refactor" | "debug" | "explain" | "search" | "git" | "general",
  "confidence": 0.0-1.0,
  "keywords": ["keyword1", "keyword2"],
  "reasoning": "brief explanation"
}`;

    const response = await this.modelRouter.execute(
      [
        {
          role: 'system',
          content: 'You are an intent classifier. Respond with JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        maxTokens: 500,
        preferredModelId: 'general',
      }
    );

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM response did not contain valid JSON');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate intent type
    if (!Object.values(IntentType).includes(result.intent)) {
      logger.warn(`[IntentClassifier] Invalid intent from LLM: ${result.intent}, defaulting to GENERAL`);
      result.intent = IntentType.GENERAL;
    }

    // Validate confidence
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      logger.warn(`[IntentClassifier] Invalid confidence from LLM: ${result.confidence}, defaulting to 0.7`);
      result.confidence = 0.7;
    }

    logger.debug(
      `[IntentClassifier] LLM classification: ${result.intent} (confidence: ${result.confidence.toFixed(2)}, reasoning: ${result.reasoning})`
    );

    return {
      intent: result.intent,
      confidence: result.confidence,
      keywords: result.keywords || [],
      suggestedAgent: this.mapIntentToAgent(result.intent),
      contextScope: this.determineContextScope(result.intent),
    };
  }

  /**
   * Map intent type to appropriate agent name.
   * 
   * @param intent - Intent type
   * @returns Agent name
   */
  mapIntentToAgent(intent: IntentType): string {
    return INTENT_AGENT_MAP[intent];
  }

  /**
   * Determine context scope based on intent type.
   * 
   * @param intent - Intent type
   * @returns Context scope (full, partial, or minimal)
   */
  determineContextScope(intent: IntentType): 'full' | 'partial' | 'minimal' {
    return INTENT_CONTEXT_SCOPE_MAP[intent];
  }
}
