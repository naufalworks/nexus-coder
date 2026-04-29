/**
 * Verification test for new type definitions added in nexus-ide-advanced-features spec
 * Task 1: Set up shared data models and type definitions
 */

import {
  // Search types
  SearchResultType,
  GraphContextInfo,
  SearchResult,
  SearchQuery,
  SearchResponse,
  SearchState,
  SearchGraphLink,
  // Chat types
  CodeReference,
  ChatMessage,
  ChatSession,
  ChatCommand,
  StreamChunk,
  ChatState,
  ChatSearchIntegration,
  // Impact types
  ImpactSeverity,
  ImpactEdge,
  ImpactNode,
  RiskAssessment,
  AffectedFile,
  ImpactStats,
  ImpactAnalysis,
  ImpactState,
  // Palette types
  CommandCategory,
  CommandContext,
  PaletteCommand,
  PaletteMatch,
  PaletteState,
  CommandResult,
} from '../../types';

describe('New Type Definitions - Import Verification', () => {
  it('should import all search types', () => {
    expect(SearchResultType).toBeDefined();
    expect(SearchResultType.FUNCTION).toBe('function');
    expect(SearchResultType.CLASS).toBe('class');
    expect(SearchResultType.INTERFACE).toBe('interface');
    expect(SearchResultType.SNIPPET).toBe('snippet');
    expect(SearchResultType.FILE).toBe('file');
  });

  it('should import all impact types', () => {
    expect(ImpactSeverity).toBeDefined();
    expect(ImpactSeverity.CRITICAL).toBe('critical');
    expect(ImpactSeverity.HIGH).toBe('high');
    expect(ImpactSeverity.MEDIUM).toBe('medium');
    expect(ImpactSeverity.LOW).toBe('low');
    expect(ImpactSeverity.INFO).toBe('info');
  });

  it('should import all palette types', () => {
    expect(CommandCategory).toBeDefined();
    expect(CommandCategory.SEARCH).toBe('search');
    expect(CommandCategory.NAVIGATION).toBe('navigation');
    expect(CommandCategory.CHAT).toBe('chat');
    expect(CommandCategory.ANALYSIS).toBe('analysis');
    expect(CommandCategory.TASK).toBe('task');
    expect(CommandCategory.FILE).toBe('file');
    expect(CommandCategory.AGENT).toBe('agent');
    expect(CommandCategory.SETTING).toBe('setting');
  });

  it('should verify SearchResult interface structure', () => {
    const mockSearchResult: SearchResult = {
      id: 'test-1',
      content: 'function test() {}',
      relevanceScore: 0.95,
      file: 'src/test.ts',
      lineRange: { start: 1, end: 3 },
      graphNodeId: 'node-1',
      graphContext: [],
      matchType: SearchResultType.FUNCTION,
      summary: 'Test function',
    };
    expect(mockSearchResult.id).toBe('test-1');
    expect(mockSearchResult.relevanceScore).toBe(0.95);
  });

  it('should verify ChatMessage interface structure', () => {
    const mockMessage: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
      codeReferences: [],
      graphNodeIds: [],
      isStreaming: false,
    };
    expect(mockMessage.role).toBe('user');
    expect(mockMessage.isStreaming).toBe(false);
  });

  it('should verify ImpactAnalysis interface structure', () => {
    const mockAnalysis: Partial<ImpactAnalysis> = {
      seedNodeId: 'node-1',
      directImpacts: [],
      transitiveImpacts: [],
      affectedTests: [],
      affectedFiles: [],
      analyzedAt: new Date(),
    };
    expect(mockAnalysis.seedNodeId).toBe('node-1');
    expect(Array.isArray(mockAnalysis.directImpacts)).toBe(true);
  });

  it('should verify PaletteCommand interface structure', () => {
    const mockCommand: PaletteCommand = {
      id: 'cmd-1',
      label: 'Test Command',
      category: CommandCategory.SEARCH,
      execute: () => {},
      available: () => true,
      tags: ['test'],
    };
    expect(mockCommand.category).toBe(CommandCategory.SEARCH);
    expect(typeof mockCommand.execute).toBe('function');
    expect(typeof mockCommand.available).toBe('function');
  });
});
