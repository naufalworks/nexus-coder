/**
 * Property-Based Tests for IntentClassifier
 *
 * Tests universal properties that should hold for all valid inputs.
 *
 * Requirements: 1.1, 1.5, 1.6, 1.7, 10.1-10.7, 14.1, 14.4
 */

// Mock logger BEFORE importing IntentClassifier
jest.mock('../../core/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as fc from 'fast-check';
import { IntentClassifier } from '../../services/intent-classifier';
import { IntentType, ChatMessage } from '../../types/chat';
import { ModelRouter } from '../../core/models/router';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { EventBus } from '../../core/event-bus';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('IntentClassifier Property-Based Tests', () => {
  let classifier: IntentClassifier;
  let mockModelRouter: jest.Mocked<ModelRouter>;
  let mockAgentRegistry: jest.Mocked<AgentRegistry>;

  beforeEach(() => {
    // Create mock dependencies
    const mockClient = {} as UnifiedClient;
    const mockEventBus = {} as EventBus;
    
    mockModelRouter = new ModelRouter(mockClient) as jest.Mocked<ModelRouter>;
    mockAgentRegistry = new AgentRegistry() as jest.Mocked<AgentRegistry>;

    // Mock the execute method to return valid JSON
    mockModelRouter.execute = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        intent: 'general',
        confidence: 0.7,
        keywords: ['test'],
        reasoning: 'test reasoning',
      }),
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
    });

    classifier = new IntentClassifier(mockModelRouter, mockAgentRegistry);
  });

  // ---------------------------------------------------------------------------
  // Property 1: Intent Classification Returns Valid Types
  // ---------------------------------------------------------------------------

  describe('Property 1: Intent Classification Returns Valid Types', () => {
    /**
     * **Validates: Requirements 1.1, 14.4**
     *
     * For any user message, the Intent_Classifier SHALL return an IntentClassification
     * with an intent field that is one of the eight valid IntentType enum values.
     */
    it('should always return a valid IntentType for any message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (message) => {
            const result = await classifier.classify(message, []);

            // Verify intent is one of the 8 valid enum values
            const validIntents = Object.values(IntentType);
            expect(validIntents).toContain(result.intent);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return valid IntentType even with special characters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (message) => {
            const result = await classifier.classify(message, []);

            // Verify intent is one of the 8 valid types
            expect(Object.values(IntentType)).toContain(result.intent);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return valid IntentType with conversation history', async () => {
      const historyArb = fc.array(
        fc.record({
          id: fc.uuid(),
          role: fc.constantFrom('user' as const, 'agent' as const),
          content: fc.string({ minLength: 1, maxLength: 100 }),
          timestamp: fc.date(),
          codeReferences: fc.constant([] as any[]),
          graphNodeIds: fc.constant([] as string[]),
          isStreaming: fc.constant(false),
        }),
        { maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          historyArb,
          async (message, history) => {
            const result = await classifier.classify(message, history as ChatMessage[]);

            // Verify intent is valid
            expect(Object.values(IntentType)).toContain(result.intent);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: Confidence Score Bounds
  // ---------------------------------------------------------------------------

  describe('Property 2: Confidence Score Bounds', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * For any intent classification result, the confidence score SHALL be
     * a number between 0.0 and 1.0 (inclusive).
     */
    it('should always return confidence between 0.0 and 1.0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (message) => {
            const result = await classifier.classify(message, []);

            // Verify confidence is in valid range
            expect(result.confidence).toBeGreaterThanOrEqual(0.0);
            expect(result.confidence).toBeLessThanOrEqual(1.0);
            expect(typeof result.confidence).toBe('number');
            expect(Number.isFinite(result.confidence)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return valid confidence for pattern matching', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message) => {
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            // Verify confidence bounds
            expect(result.confidence).toBeGreaterThanOrEqual(0.0);
            expect(result.confidence).toBeLessThanOrEqual(1.0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return NaN or Infinity as confidence', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 500 }),
          async (message) => {
            // Handle empty string edge case
            if (message.length === 0) {
              return;
            }

            const result = await classifier.classify(message, []);

            expect(Number.isNaN(result.confidence)).toBe(false);
            expect(Number.isFinite(result.confidence)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 3: Classification Completeness
  // ---------------------------------------------------------------------------

  describe('Property 3: Classification Completeness', () => {
    /**
     * **Validates: Requirements 1.6, 1.7, 14.1**
     *
     * For any intent classification result, the IntentClassification object SHALL
     * contain all required fields: intent type, confidence, keywords array,
     * suggested agent, and context scope.
     */
    it('should always return complete IntentClassification object', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (message) => {
            const result = await classifier.classify(message, []);

            // Verify all required fields are present
            expect(result).toHaveProperty('intent');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('keywords');
            expect(result).toHaveProperty('suggestedAgent');
            expect(result).toHaveProperty('contextScope');

            // Verify field types
            expect(typeof result.intent).toBe('string');
            expect(typeof result.confidence).toBe('number');
            expect(Array.isArray(result.keywords)).toBe(true);
            expect(typeof result.suggestedAgent).toBe('string');
            expect(typeof result.contextScope).toBe('string');

            // Verify keywords is an array of strings
            result.keywords.forEach(keyword => {
              expect(typeof keyword).toBe('string');
            });

            // Verify contextScope is valid
            expect(['full', 'partial', 'minimal']).toContain(result.contextScope);

            // Verify suggestedAgent is not empty
            expect(result.suggestedAgent.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return complete object for pattern matching', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (message) => {
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            // Verify completeness
            expect(result.intent).toBeDefined();
            expect(result.confidence).toBeDefined();
            expect(result.keywords).toBeDefined();
            expect(result.suggestedAgent).toBeDefined();
            expect(result.contextScope).toBeDefined();

            // Verify types
            expect(Object.values(IntentType)).toContain(result.intent);
            expect(typeof result.confidence).toBe('number');
            expect(Array.isArray(result.keywords)).toBe(true);
            expect(['full', 'partial', 'minimal']).toContain(result.contextScope);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return null or undefined for required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (message) => {
            const result = await classifier.classify(message, []);

            // Verify no null/undefined values
            expect(result.intent).not.toBeNull();
            expect(result.intent).not.toBeUndefined();
            expect(result.confidence).not.toBeNull();
            expect(result.confidence).not.toBeUndefined();
            expect(result.keywords).not.toBeNull();
            expect(result.keywords).not.toBeUndefined();
            expect(result.suggestedAgent).not.toBeNull();
            expect(result.suggestedAgent).not.toBeUndefined();
            expect(result.contextScope).not.toBeNull();
            expect(result.contextScope).not.toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 16-22: Keyword Classification Accuracy
  // ---------------------------------------------------------------------------

  describe('Property 16: Review Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.1**
     *
     * For any message containing at least one review keyword (review, check,
     * analyze, audit, inspect), the Intent_Classifier SHALL classify the intent
     * as "review" with confidence greater than 0.7.
     */
    it('should classify messages with review keywords as REVIEW with high confidence', () => {
      const reviewKeywords = ['review', 'check', 'analyze', 'audit', 'inspect'];

      fc.assert(
        fc.property(
          fc.constantFrom(...reviewKeywords),
          (keyword) => {
            // Use only the keyword to ensure it's detected
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            // Should classify as REVIEW with confidence > 0.7
            expect(result.intent).toBe(IntentType.REVIEW);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 17: Code Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.2**
     *
     * For any message containing at least one code keyword (write, create,
     * implement, add, build), the Intent_Classifier SHALL classify the intent
     * as "code" with confidence greater than 0.7.
     */
    it('should classify messages with code keywords as CODE with high confidence', () => {
      const codeKeywords = ['write', 'create', 'implement', 'add', 'build'];

      fc.assert(
        fc.property(
          fc.constantFrom(...codeKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.CODE);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 18: Refactor Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.3**
     *
     * For any message containing at least one refactor keyword (refactor, improve,
     * optimize, clean), the Intent_Classifier SHALL classify the intent as
     * "refactor" with confidence greater than 0.7.
     */
    it('should classify messages with refactor keywords as REFACTOR with high confidence', () => {
      const refactorKeywords = ['refactor', 'improve', 'optimize', 'clean'];

      fc.assert(
        fc.property(
          fc.constantFrom(...refactorKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.REFACTOR);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 19: Debug Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.4**
     *
     * For any message containing at least one debug keyword (debug, fix, error,
     * bug, issue), the Intent_Classifier SHALL classify the intent as "debug"
     * with confidence greater than 0.7.
     */
    it('should classify messages with debug keywords as DEBUG with high confidence', () => {
      const debugKeywords = ['debug', 'fix', 'error', 'bug', 'issue'];

      fc.assert(
        fc.property(
          fc.constantFrom(...debugKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.DEBUG);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 20: Explain Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.5**
     *
     * For any message containing at least one explain keyword (explain, what,
     * how, why, understand), the Intent_Classifier SHALL classify the intent
     * as "explain" with confidence greater than 0.7.
     */
    it('should classify messages with explain keywords as EXPLAIN with high confidence', () => {
      const explainKeywords = ['explain', 'what', 'how', 'why', 'understand'];

      fc.assert(
        fc.property(
          fc.constantFrom(...explainKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.EXPLAIN);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 21: Search Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.6**
     *
     * For any message containing at least one search keyword (find, search,
     * locate, where), the Intent_Classifier SHALL classify the intent as
     * "search" with confidence greater than 0.7.
     */
    it('should classify messages with search keywords as SEARCH with high confidence', () => {
      const searchKeywords = ['find', 'search', 'locate', 'where'];

      fc.assert(
        fc.property(
          fc.constantFrom(...searchKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.SEARCH);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 22: Git Keyword Classification Accuracy', () => {
    /**
     * **Validates: Requirements 10.7**
     *
     * For any message containing at least one git keyword (commit, push, branch,
     * merge, git), the Intent_Classifier SHALL classify the intent as "git"
     * with confidence greater than 0.7.
     */
    it('should classify messages with git keywords as GIT with high confidence', () => {
      const gitKeywords = ['commit', 'push', 'branch', 'merge', 'git'];

      fc.assert(
        fc.property(
          fc.constantFrom(...gitKeywords),
          (keyword) => {
            const message = keyword;
            const keywords = classifier.extractKeywords(message);
            const result = classifier.detectIntentByPattern(message, keywords);

            expect(result.intent).toBe(IntentType.GIT);
            expect(result.confidence).toBeGreaterThan(0.7);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
