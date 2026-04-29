/**
 * Unit Tests for IntentClassifier
 *
 * Tests specific examples, edge cases, and error handling.
 *
 * Requirements: 1.2, 1.3, 1.4, 13.1, 13.2, 13.3, 13.4
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

import { IntentClassifier } from '../../services/intent-classifier';
import { IntentType, ChatMessage } from '../../types/chat';
import { ModelRouter } from '../../core/models/router';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';

describe('IntentClassifier Unit Tests', () => {
  let classifier: IntentClassifier;
  let mockModelRouter: jest.Mocked<ModelRouter>;
  let mockAgentRegistry: jest.Mocked<AgentRegistry>;

  beforeEach(() => {
    const mockClient = {} as UnifiedClient;
    mockModelRouter = new ModelRouter(mockClient) as jest.Mocked<ModelRouter>;
    mockAgentRegistry = new AgentRegistry() as jest.Mocked<AgentRegistry>;

    classifier = new IntentClassifier(mockModelRouter, mockAgentRegistry);
  });

  // ---------------------------------------------------------------------------
  // extractKeywords() Tests
  // ---------------------------------------------------------------------------

  describe('extractKeywords()', () => {
    it('should extract keywords from simple message', () => {
      const keywords = classifier.extractKeywords('review my code please');
      
      expect(keywords).toContain('review');
      expect(keywords).toContain('code');
      expect(keywords).toContain('please');
    });

    it('should filter out stop words', () => {
      const keywords = classifier.extractKeywords('the quick brown fox');
      
      expect(keywords).not.toContain('the');
      expect(keywords).toContain('quick');
      expect(keywords).toContain('brown');
    });

    it('should filter out short words (<=2 characters)', () => {
      const keywords = classifier.extractKeywords('I am ok to go');
      
      expect(keywords).not.toContain('i');
      expect(keywords).not.toContain('am');
      expect(keywords).not.toContain('ok');
      expect(keywords).not.toContain('to');
    });

    it('should convert to lowercase', () => {
      const keywords = classifier.extractKeywords('Review My Code');
      
      expect(keywords).toContain('review');
      expect(keywords).toContain('code');
      expect(keywords).not.toContain('Review');
      expect(keywords).not.toContain('Code');
    });

    it('should remove punctuation', () => {
      const keywords = classifier.extractKeywords('review, analyze! debug?');
      
      expect(keywords).toContain('review');
      expect(keywords).toContain('analyze');
      expect(keywords).toContain('debug');
    });

    it('should handle empty string', () => {
      const keywords = classifier.extractKeywords('');
      
      expect(keywords).toEqual([]);
    });

    it('should handle string with only stop words', () => {
      const keywords = classifier.extractKeywords('the a an in on at');
      
      expect(keywords).toEqual([]);
    });

    it('should handle string with only short words', () => {
      const keywords = classifier.extractKeywords('I am ok to go');
      
      expect(keywords).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // detectIntentByPattern() Tests
  // ---------------------------------------------------------------------------

  describe('detectIntentByPattern()', () => {
    it('should detect REVIEW intent from review keywords', () => {
      const message = 'review my codebase for issues';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.REVIEW);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect CODE intent from code keywords', () => {
      const message = 'write a new function to handle authentication';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.CODE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect REFACTOR intent from refactor keywords', () => {
      const message = 'refactor this code to improve performance';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.REFACTOR);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect DEBUG intent from debug keywords', () => {
      const message = 'fix the bug in the login module';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.DEBUG);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect EXPLAIN intent from explain keywords', () => {
      const message = 'explain how the authentication works';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.EXPLAIN);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect SEARCH intent from search keywords', () => {
      const message = 'find all references to the User class';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.SEARCH);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect GIT intent from git keywords', () => {
      const message = 'commit these changes and push to main';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.GIT);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should return GENERAL intent when no keywords match', () => {
      const message = 'hello there';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.GENERAL);
      expect(result.confidence).toBe(0);
    });

    it('should return GENERAL intent with empty keywords', () => {
      const result = classifier.detectIntentByPattern('', []);

      expect(result.intent).toBe(IntentType.GENERAL);
      expect(result.confidence).toBe(0);
    });

    it('should calculate confidence based on keyword matches', () => {
      // Message with 2 review keywords out of 3 total keywords
      const message = 'review and analyze code';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.intent).toBe(IntentType.REVIEW);
      // 2 matches / 3 keywords = 0.666...
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should cap confidence at 1.0', () => {
      // Message with only review keywords
      const message = 'review check analyze';
      const keywords = classifier.extractKeywords(message);
      const result = classifier.detectIntentByPattern(message, keywords);

      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // classifyWithLLM() Tests
  // ---------------------------------------------------------------------------

  describe('classifyWithLLM()', () => {
    it('should call ModelRouter.execute with correct prompt', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'review',
          confidence: 0.9,
          keywords: ['review', 'code'],
          reasoning: 'User wants code review',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classifyWithLLM('review my code', []);

      expect(mockModelRouter.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        expect.objectContaining({
          maxTokens: 500,
          preferredModelId: 'general',
        })
      );

      expect(result.intent).toBe(IntentType.REVIEW);
      expect(result.confidence).toBe(0.9);
    });

    it('should include conversation history in prompt', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'debug',
          confidence: 0.85,
          keywords: ['fix', 'that'],
          reasoning: 'User wants to fix previously discussed issue',
        }),
        inputTokens: 150,
        outputTokens: 60,
        cost: 0.002,
      });

      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'There is a bug in the login function',
          timestamp: new Date(),
          codeReferences: [],
          graphNodeIds: [],
          isStreaming: false,
        },
        {
          id: '2',
          role: 'agent',
          agentName: 'coder',
          content: 'I found the issue',
          timestamp: new Date(),
          codeReferences: [],
          graphNodeIds: [],
          isStreaming: false,
        },
      ];

      await classifier.classifyWithLLM('fix that', history);

      const callArgs = mockModelRouter.execute.mock.calls[0];
      const userMessage = callArgs[0][1].content;

      expect(userMessage).toContain('user: There is a bug in the login function');
      expect(userMessage).toContain('agent: I found the issue');
    });

    it('should handle last 3 messages from history', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'general',
          confidence: 0.7,
          keywords: [],
          reasoning: 'General query',
        }),
        inputTokens: 200,
        outputTokens: 50,
        cost: 0.003,
      });

      const history: ChatMessage[] = [
        { id: '1', role: 'user', content: 'msg1', timestamp: new Date(), codeReferences: [], graphNodeIds: [], isStreaming: false },
        { id: '2', role: 'agent', content: 'msg2', timestamp: new Date(), codeReferences: [], graphNodeIds: [], isStreaming: false, agentName: 'test' },
        { id: '3', role: 'user', content: 'msg3', timestamp: new Date(), codeReferences: [], graphNodeIds: [], isStreaming: false },
        { id: '4', role: 'agent', content: 'msg4', timestamp: new Date(), codeReferences: [], graphNodeIds: [], isStreaming: false, agentName: 'test' },
        { id: '5', role: 'user', content: 'msg5', timestamp: new Date(), codeReferences: [], graphNodeIds: [], isStreaming: false },
      ];

      await classifier.classifyWithLLM('test message', history);

      const callArgs = mockModelRouter.execute.mock.calls[0];
      const userMessage = callArgs[0][1].content;

      // Should only include last 3 messages
      expect(userMessage).not.toContain('msg1');
      expect(userMessage).not.toContain('msg2');
      expect(userMessage).toContain('msg3');
      expect(userMessage).toContain('msg4');
      expect(userMessage).toContain('msg5');
    });

    it('should handle empty conversation history', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'code',
          confidence: 0.8,
          keywords: ['write'],
          reasoning: 'User wants to write code',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      await classifier.classifyWithLLM('write a function', []);

      const callArgs = mockModelRouter.execute.mock.calls[0];
      const userMessage = callArgs[0][1].content;

      expect(userMessage).toContain('No previous conversation');
    });

    it('should parse JSON from LLM response', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'refactor',
          confidence: 0.88,
          keywords: ['optimize', 'performance'],
          reasoning: 'User wants performance optimization',
        }),
        inputTokens: 120,
        outputTokens: 55,
        cost: 0.0015,
      });

      const result = await classifier.classifyWithLLM('optimize for performance', []);

      expect(result.intent).toBe(IntentType.REFACTOR);
      expect(result.confidence).toBe(0.88);
      expect(result.keywords).toEqual(['optimize', 'performance']);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: '```json\n{"intent": "search", "confidence": 0.75, "keywords": ["find"], "reasoning": "test"}\n```',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classifyWithLLM('find something', []);

      expect(result.intent).toBe(IntentType.SEARCH);
      expect(result.confidence).toBe(0.75);
    });

    it('should throw error if LLM response has no JSON', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: 'This is not JSON',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      await expect(
        classifier.classifyWithLLM('test message', [])
      ).rejects.toThrow('LLM response did not contain valid JSON');
    });

    it('should default to GENERAL for invalid intent from LLM', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'invalid_intent',
          confidence: 0.9,
          keywords: [],
          reasoning: 'test',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classifyWithLLM('test', []);

      expect(result.intent).toBe(IntentType.GENERAL);
    });

    it('should default confidence to 0.7 for invalid confidence from LLM', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'code',
          confidence: 1.5, // Invalid: > 1.0
          keywords: [],
          reasoning: 'test',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classifyWithLLM('test', []);

      expect(result.confidence).toBe(0.7);
    });

    it('should handle missing keywords in LLM response', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'git',
          confidence: 0.8,
          reasoning: 'test',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classifyWithLLM('test', []);

      expect(result.keywords).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // classify() Integration Tests
  // ---------------------------------------------------------------------------

  describe('classify()', () => {
    it('should use pattern matching for high confidence matches', async () => {
      const executeSpy = jest.spyOn(mockModelRouter, 'execute');

      const result = await classifier.classify('review my code', []);

      // Should not call LLM (pattern matching was sufficient)
      expect(executeSpy).not.toHaveBeenCalled();
      expect(result.intent).toBe(IntentType.REVIEW);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should fall back to LLM for low confidence pattern matches', async () => {
      mockModelRouter.execute = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: 'general',
          confidence: 0.6,
          keywords: ['hello'],
          reasoning: 'Greeting',
        }),
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
      });

      const result = await classifier.classify('hello there', []);

      // Should call LLM (pattern confidence was low)
      expect(mockModelRouter.execute).toHaveBeenCalled();
      expect(result.intent).toBe(IntentType.GENERAL);
    });

    it('should fall back to pattern result if LLM fails', async () => {
      mockModelRouter.execute = jest.fn().mockRejectedValue(new Error('LLM error'));

      const result = await classifier.classify('review code', []);

      // Should return pattern result despite LLM failure
      expect(result.intent).toBe(IntentType.REVIEW);
    });

    it('should fall back to GENERAL if both pattern and LLM fail', async () => {
      mockModelRouter.execute = jest.fn().mockRejectedValue(new Error('LLM error'));

      const result = await classifier.classify('xyz abc', []);

      // No pattern match, LLM failed -> GENERAL
      expect(result.intent).toBe(IntentType.GENERAL);
      expect(result.confidence).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // mapIntentToAgent() Tests
  // ---------------------------------------------------------------------------

  describe('mapIntentToAgent()', () => {
    it('should map REVIEW to reviewer', () => {
      expect(classifier.mapIntentToAgent(IntentType.REVIEW)).toBe('reviewer');
    });

    it('should map CODE to coder', () => {
      expect(classifier.mapIntentToAgent(IntentType.CODE)).toBe('coder');
    });

    it('should map REFACTOR to coder', () => {
      expect(classifier.mapIntentToAgent(IntentType.REFACTOR)).toBe('coder');
    });

    it('should map DEBUG to coder', () => {
      expect(classifier.mapIntentToAgent(IntentType.DEBUG)).toBe('coder');
    });

    it('should map EXPLAIN to context', () => {
      expect(classifier.mapIntentToAgent(IntentType.EXPLAIN)).toBe('context');
    });

    it('should map SEARCH to context', () => {
      expect(classifier.mapIntentToAgent(IntentType.SEARCH)).toBe('context');
    });

    it('should map GIT to git', () => {
      expect(classifier.mapIntentToAgent(IntentType.GIT)).toBe('git');
    });

    it('should map GENERAL to orchestrator', () => {
      expect(classifier.mapIntentToAgent(IntentType.GENERAL)).toBe('orchestrator');
    });
  });

  // ---------------------------------------------------------------------------
  // determineContextScope() Tests
  // ---------------------------------------------------------------------------

  describe('determineContextScope()', () => {
    it('should return full scope for REVIEW', () => {
      expect(classifier.determineContextScope(IntentType.REVIEW)).toBe('full');
    });

    it('should return full scope for REFACTOR', () => {
      expect(classifier.determineContextScope(IntentType.REFACTOR)).toBe('full');
    });

    it('should return partial scope for CODE', () => {
      expect(classifier.determineContextScope(IntentType.CODE)).toBe('partial');
    });

    it('should return partial scope for DEBUG', () => {
      expect(classifier.determineContextScope(IntentType.DEBUG)).toBe('partial');
    });

    it('should return partial scope for SEARCH', () => {
      expect(classifier.determineContextScope(IntentType.SEARCH)).toBe('partial');
    });

    it('should return minimal scope for EXPLAIN', () => {
      expect(classifier.determineContextScope(IntentType.EXPLAIN)).toBe('minimal');
    });

    it('should return minimal scope for GIT', () => {
      expect(classifier.determineContextScope(IntentType.GIT)).toBe('minimal');
    });

    it('should return minimal scope for GENERAL', () => {
      expect(classifier.determineContextScope(IntentType.GENERAL)).toBe('minimal');
    });
  });
});
