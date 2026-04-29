/**
 * Integration tests for cross-feature integration
 *
 * Tests:
 * - Search → Graph Explorer navigation
 * - Search → Impact Analysis seeding
 * - Search → Chat context passing
 * - Chat → Search context retrieval
 * - Chat → Impact analysis invocation
 * - Palette → Search, Chat, Impact command execution
 *
 * Requirements: 34.1, 34.2, 34.3, 34.4
 */

// Polyfill setImmediate for JSDOM (winston logger uses it)
if (typeof setImmediate === 'undefined') {
  (global as any).setImmediate = (fn: () => void) => setTimeout(fn, 0);
}

import { SemanticSearchService } from '../../services/search-service';
import { ChatService } from '../../services/chat-service';
import { ImpactAnalysisService } from '../../services/impact-service';
import { CommandPaletteService } from '../../services/command-palette-service';
import {
  registerFeatureCommands,
} from '../../services/feature-commands';
import { SearchResult, SearchQuery, SearchGraphLink } from '../../types/search';
import { ChatSearchIntegration } from '../../types/chat';
import { ImpactAnalysis } from '../../types/impact';
import { CommandContext } from '../../types/palette';
import { EventBus, EventType } from '../../core/event-bus';
import { AgentRegistry } from '../../agents/registry';
import { UnifiedClient } from '../../core/models/unified-client';
import { ContextEngine } from '../../core/context/engine';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeEventBus(): EventBus {
  return new EventBus();
}

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    graphAvailable: true,
    vectorStoreAvailable: true,
    recentCommands: [],
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'result-1',
    content: 'function authenticate() { ... }',
    relevanceScore: 0.95,
    file: 'src/auth.ts',
    lineRange: { start: 10, end: 25 },
    graphNodeId: 'node-auth-1',
    graphContext: [],
    matchType: 'function' as SearchResult['matchType'],
    summary: 'Authentication function',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Cross-Feature Integration', () => {
  // -----------------------------------------------------------------------
  // Search → Graph Explorer navigation
  // -----------------------------------------------------------------------

  describe('Search → Graph Explorer', () => {
    it('should create a SearchGraphLink for results with graph nodes', () => {
      const searchService = new SemanticSearchService();
      const onOpenGraphExplorer = jest.fn();

      const result = makeSearchResult();
      const link = searchService.createGraphLink(result, {
        onOpenGraphExplorer,
      });

      expect(link).not.toBeNull();
      expect(link!.searchResultId).toBe('result-1');
      expect(link!.graphNodeId).toBe('node-auth-1');
    });

    it('should invoke openInGraphExplorer callback', () => {
      const searchService = new SemanticSearchService();
      const onOpenGraphExplorer = jest.fn();

      const result = makeSearchResult();
      const link = searchService.createGraphLink(result, {
        onOpenGraphExplorer,
      });

      link!.openInGraphExplorer();

      expect(onOpenGraphExplorer).toHaveBeenCalledWith('node-auth-1');
    });

    it('should return null for results without graph nodes', () => {
      const searchService = new SemanticSearchService();

      const result = makeSearchResult({ graphNodeId: null });
      const link = searchService.createGraphLink(result, {});

      expect(link).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Search → Impact Analysis seeding
  // -----------------------------------------------------------------------

  describe('Search → Impact Analysis', () => {
    it('should invoke showImpact callback', () => {
      const searchService = new SemanticSearchService();
      const onShowImpact = jest.fn();

      const result = makeSearchResult();
      const link = searchService.createGraphLink(result, {
        onShowImpact,
      });

      link!.showImpact();

      expect(onShowImpact).toHaveBeenCalledWith('node-auth-1');
    });
  });

  // -----------------------------------------------------------------------
  // Search → Chat context passing
  // -----------------------------------------------------------------------

  describe('Search → Chat', () => {
    it('should invoke discussInChat callback with code context', () => {
      const searchService = new SemanticSearchService();
      const onDiscussInChat = jest.fn();

      const result = makeSearchResult();
      const link = searchService.createGraphLink(result, {
        onDiscussInChat,
      });

      link!.discussInChat();

      expect(onDiscussInChat).toHaveBeenCalledWith(
        'node-auth-1',
        expect.stringContaining('src/auth.ts')
      );
      expect(onDiscussInChat).toHaveBeenCalledWith(
        'node-auth-1',
        expect.stringContaining('function authenticate()')
      );
    });
  });

  // -----------------------------------------------------------------------
  // Chat → Search context retrieval
  // -----------------------------------------------------------------------

  describe('Chat → Search', () => {
    it('should create a ChatSearchIntegration', () => {
      const eventBus = makeEventBus();
      const agentRegistry = new AgentRegistry();
      const unifiedClient = {} as UnifiedClient;
      const contextEngine = {} as ContextEngine;

      const chatService = new ChatService(
        agentRegistry,
        unifiedClient,
        contextEngine,
        eventBus
      );

      const onSearchForContext = jest.fn().mockResolvedValue([]);
      const integration = chatService.createSearchIntegration({
        onSearchForContext,
        onOpenCodeReference: jest.fn(),
        onAnalyzeImpact: jest.fn().mockResolvedValue({} as ImpactAnalysis),
      });

      expect(integration).toBeDefined();
      expect(typeof integration.searchForContext).toBe('function');
      expect(typeof integration.openCodeReference).toBe('function');
      expect(typeof integration.analyzeImpact).toBe('function');
    });

    it('should invoke searchForContext and return results', async () => {
      const eventBus = makeEventBus();
      const agentRegistry = new AgentRegistry();
      const unifiedClient = {} as UnifiedClient;
      const contextEngine = {} as ContextEngine;

      const chatService = new ChatService(
        agentRegistry,
        unifiedClient,
        contextEngine,
        eventBus
      );

      const mockResults = [makeSearchResult()];
      const onSearchForContext = jest.fn().mockResolvedValue(mockResults);

      const integration = chatService.createSearchIntegration({
        onSearchForContext,
        onOpenCodeReference: jest.fn(),
        onAnalyzeImpact: jest.fn().mockResolvedValue({} as ImpactAnalysis),
      });

      const results = await integration.searchForContext('authentication');

      expect(onSearchForContext).toHaveBeenCalledWith('authentication');
      expect(results).toEqual(mockResults);
    });

    it('should return empty results on search error', async () => {
      const eventBus = makeEventBus();
      const agentRegistry = new AgentRegistry();
      const unifiedClient = {} as UnifiedClient;
      const contextEngine = {} as ContextEngine;

      const chatService = new ChatService(
        agentRegistry,
        unifiedClient,
        contextEngine,
        eventBus
      );

      const onSearchForContext = jest.fn().mockRejectedValue(new Error('Search failed'));

      const integration = chatService.createSearchIntegration({
        onSearchForContext,
        onOpenCodeReference: jest.fn(),
        onAnalyzeImpact: jest.fn().mockResolvedValue({} as ImpactAnalysis),
      });

      const results = await integration.searchForContext('query');

      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Chat → Impact analysis invocation
  // -----------------------------------------------------------------------

  describe('Chat → Impact', () => {
    it('should invoke analyzeImpact with node ID', async () => {
      const eventBus = makeEventBus();
      const agentRegistry = new AgentRegistry();
      const unifiedClient = {} as UnifiedClient;
      const contextEngine = {} as ContextEngine;

      const chatService = new ChatService(
        agentRegistry,
        unifiedClient,
        contextEngine,
        eventBus
      );

      const mockAnalysis = {} as ImpactAnalysis;
      const onAnalyzeImpact = jest.fn().mockResolvedValue(mockAnalysis);

      const integration = chatService.createSearchIntegration({
        onSearchForContext: jest.fn().mockResolvedValue([]),
        onOpenCodeReference: jest.fn(),
        onAnalyzeImpact,
      });

      const analysis = await integration.analyzeImpact('node-1');

      expect(onAnalyzeImpact).toHaveBeenCalledWith('node-1');
      expect(analysis).toBe(mockAnalysis);
    });
  });

  // -----------------------------------------------------------------------
  // Palette → Search, Chat, Impact command execution
  // -----------------------------------------------------------------------

  describe('Palette → All Features', () => {
    it('should register and execute search commands', async () => {
      const eventBus = makeEventBus();
      const service = new CommandPaletteService(eventBus);
      const onOpenSearch = jest.fn();

      registerFeatureCommands(service, { onOpenSearch });

      await service.executeCommand('search.open', makeContext());

      expect(onOpenSearch).toHaveBeenCalledTimes(1);
    });

    it('should register and execute chat commands', async () => {
      const eventBus = makeEventBus();
      const service = new CommandPaletteService(eventBus);
      const onOpenChat = jest.fn();

      registerFeatureCommands(service, { onOpenChat });

      await service.executeCommand('chat.open', makeContext());

      expect(onOpenChat).toHaveBeenCalledTimes(1);
    });

    it('should register and execute impact commands', async () => {
      const eventBus = makeEventBus();
      const service = new CommandPaletteService(eventBus);
      const onOpenImpact = jest.fn();

      registerFeatureCommands(service, { onOpenImpact });

      await service.executeCommand('impact.analyze', makeContext());

      expect(onOpenImpact).toHaveBeenCalledTimes(1);
    });

    it('should filter impact commands when graph is unavailable', () => {
      const eventBus = makeEventBus();
      const service = new CommandPaletteService(eventBus);

      registerFeatureCommands(service);

      const contextWithoutGraph = makeContext({ graphAvailable: false });
      const matches = service.matchCommands(
        '',
        service.getAllCommands(),
        contextWithoutGraph,
        [],
        20
      );

      // Impact commands should not appear
      const impactMatches = matches.filter(
        (m) => m.command.id.startsWith('impact.')
      );
      expect(impactMatches.length).toBe(0);

      // But search and chat commands should still appear
      const searchMatches = matches.filter(
        (m) => m.command.id.startsWith('search.')
      );
      const chatMatches = matches.filter(
        (m) => m.command.id.startsWith('chat.')
      );
      expect(searchMatches.length).toBeGreaterThan(0);
      expect(chatMatches.length).toBeGreaterThan(0);
    });

    it('should match feature commands by fuzzy query', () => {
      const eventBus = makeEventBus();
      const service = new CommandPaletteService(eventBus);

      registerFeatureCommands(service);

      const matches = service.matchCommands(
        'search',
        service.getAllCommands(),
        makeContext(),
        [],
        10
      );

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].command.id).toContain('search');
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end: Search result → Palette integration
  // -----------------------------------------------------------------------

  describe('End-to-end integration', () => {
    it('should flow from search result to all feature callbacks', () => {
      const searchService = new SemanticSearchService();
      const onOpenGraphExplorer = jest.fn();
      const onShowImpact = jest.fn();
      const onDiscussInChat = jest.fn();

      const result = makeSearchResult({
        id: 'e2e-result',
        graphNodeId: 'e2e-node',
        file: 'src/e2e.ts',
        content: 'export function main() {}',
        lineRange: { start: 1, end: 5 },
      });

      const link = searchService.createGraphLink(result, {
        onOpenGraphExplorer,
        onShowImpact,
        onDiscussInChat,
      });

      expect(link).not.toBeNull();

      // Trigger all integrations
      link!.openInGraphExplorer();
      link!.showImpact();
      link!.discussInChat();

      expect(onOpenGraphExplorer).toHaveBeenCalledWith('e2e-node');
      expect(onShowImpact).toHaveBeenCalledWith('e2e-node');
      expect(onDiscussInChat).toHaveBeenCalledWith(
        'e2e-node',
        expect.stringContaining('src/e2e.ts')
      );
    });
  });
});
