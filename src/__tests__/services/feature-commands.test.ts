/**
 * Unit tests for feature commands registration
 *
 * Tests:
 * - Search command registration
 * - Chat command registration
 * - Impact command registration
 * - Navigation command registration
 * - Command availability based on context
 * - Command execution callbacks
 */

import {
  createSearchCommands,
  createChatCommands,
  createImpactCommands,
  createNavigationCommands,
  registerFeatureCommands,
} from '../../services/feature-commands';
import { CommandPaletteService } from '../../services/command-palette-service';
import { CommandContext, CommandCategory } from '../../types/palette';
import { EventBus } from '../../core/event-bus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    graphAvailable: true,
    vectorStoreAvailable: true,
    recentCommands: [],
    ...overrides,
  };
}

function makeService(): CommandPaletteService {
  const eventBus = new EventBus();
  return new CommandPaletteService(eventBus);
}

// ---------------------------------------------------------------------------
// Search commands
// ---------------------------------------------------------------------------

describe('createSearchCommands', () => {
  it('should create search.open command', () => {
    const commands = createSearchCommands();
    const openCmd = commands.find((c) => c.id === 'search.open');

    expect(openCmd).toBeDefined();
    expect(openCmd?.label).toBe('Semantic Search');
    expect(openCmd?.category).toBe(CommandCategory.SEARCH);
    expect(openCmd?.shortcut).toBe('Ctrl+Shift+F');
    expect(openCmd?.icon).toBe('🔍');
  });

  it('should create search.query command', () => {
    const commands = createSearchCommands();
    const queryCmd = commands.find((c) => c.id === 'search.query');

    expect(queryCmd).toBeDefined();
    expect(queryCmd?.label).toBe('Search for...');
    expect(queryCmd?.category).toBe(CommandCategory.SEARCH);
  });

  it('should invoke onOpenSearch callback', async () => {
    const onOpenSearch = jest.fn();
    const commands = createSearchCommands(onOpenSearch);
    const openCmd = commands.find((c) => c.id === 'search.open')!;

    await openCmd.execute(makeContext());

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('should invoke onSearchQuery callback', async () => {
    const onSearchQuery = jest.fn();
    const commands = createSearchCommands(undefined, onSearchQuery);
    const queryCmd = commands.find((c) => c.id === 'search.query')!;

    await queryCmd.execute(makeContext());

    expect(onSearchQuery).toHaveBeenCalledWith('');
  });

  it('should be available in all contexts', () => {
    const commands = createSearchCommands();
    const openCmd = commands.find((c) => c.id === 'search.open')!;

    expect(openCmd.available(makeContext({ graphAvailable: false }))).toBe(true);
    expect(openCmd.available(makeContext({ vectorStoreAvailable: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chat commands
// ---------------------------------------------------------------------------

describe('createChatCommands', () => {
  it('should create chat.open command', () => {
    const commands = createChatCommands();
    const openCmd = commands.find((c) => c.id === 'chat.open');

    expect(openCmd).toBeDefined();
    expect(openCmd?.label).toBe('Open Agent Chat');
    expect(openCmd?.category).toBe(CommandCategory.CHAT);
    expect(openCmd?.shortcut).toBe('Ctrl+Shift+C');
    expect(openCmd?.icon).toBe('💬');
  });

  it('should create chat.agent command', () => {
    const commands = createChatCommands();
    const agentCmd = commands.find((c) => c.id === 'chat.agent');

    expect(agentCmd).toBeDefined();
    expect(agentCmd?.label).toBe('Chat with Agent...');
    expect(agentCmd?.category).toBe(CommandCategory.CHAT);
  });

  it('should invoke onOpenChat callback', async () => {
    const onOpenChat = jest.fn();
    const commands = createChatCommands(onOpenChat);
    const openCmd = commands.find((c) => c.id === 'chat.open')!;

    await openCmd.execute(makeContext());

    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('should invoke onChatAgent callback', async () => {
    const onChatAgent = jest.fn();
    const commands = createChatCommands(undefined, onChatAgent);
    const agentCmd = commands.find((c) => c.id === 'chat.agent')!;

    await agentCmd.execute(makeContext());

    expect(onChatAgent).toHaveBeenCalledWith('');
  });

  it('should be available in all contexts', () => {
    const commands = createChatCommands();
    const openCmd = commands.find((c) => c.id === 'chat.open')!;

    expect(openCmd.available(makeContext({ graphAvailable: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Impact commands
// ---------------------------------------------------------------------------

describe('createImpactCommands', () => {
  it('should create impact.analyze command', () => {
    const commands = createImpactCommands();
    const analyzeCmd = commands.find((c) => c.id === 'impact.analyze');

    expect(analyzeCmd).toBeDefined();
    expect(analyzeCmd?.label).toBe('Analyze Impact');
    expect(analyzeCmd?.category).toBe(CommandCategory.ANALYSIS);
    expect(analyzeCmd?.shortcut).toBe('Ctrl+Shift+I');
    expect(analyzeCmd?.icon).toBe('📊');
  });

  it('should create impact.change command', () => {
    const commands = createImpactCommands();
    const changeCmd = commands.find((c) => c.id === 'impact.change');

    expect(changeCmd).toBeDefined();
    expect(changeCmd?.label).toBe('Impact of Change...');
    expect(changeCmd?.category).toBe(CommandCategory.ANALYSIS);
  });

  it('should invoke onOpenImpact callback', async () => {
    const onOpenImpact = jest.fn();
    const commands = createImpactCommands(onOpenImpact);
    const analyzeCmd = commands.find((c) => c.id === 'impact.analyze')!;

    await analyzeCmd.execute(makeContext());

    expect(onOpenImpact).toHaveBeenCalledTimes(1);
  });

  it('should invoke onImpactChange callback', async () => {
    const onImpactChange = jest.fn();
    const commands = createImpactCommands(undefined, onImpactChange);
    const changeCmd = commands.find((c) => c.id === 'impact.change')!;

    await changeCmd.execute(makeContext());

    expect(onImpactChange).toHaveBeenCalledWith('');
  });

  it('should only be available when graph is available', () => {
    const commands = createImpactCommands();
    const analyzeCmd = commands.find((c) => c.id === 'impact.analyze')!;

    expect(analyzeCmd.available(makeContext({ graphAvailable: true }))).toBe(true);
    expect(analyzeCmd.available(makeContext({ graphAvailable: false }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Navigation commands
// ---------------------------------------------------------------------------

describe('createNavigationCommands', () => {
  it('should create nav.graph command', () => {
    const commands = createNavigationCommands();
    const graphCmd = commands.find((c) => c.id === 'nav.graph');

    expect(graphCmd).toBeDefined();
    expect(graphCmd?.label).toBe('Open Graph Explorer');
    expect(graphCmd?.category).toBe(CommandCategory.NAVIGATION);
  });

  it('should create nav.tasks command', () => {
    const commands = createNavigationCommands();
    const tasksCmd = commands.find((c) => c.id === 'nav.tasks');

    expect(tasksCmd).toBeDefined();
    expect(tasksCmd?.label).toBe('Open Task Panel');
    expect(tasksCmd?.category).toBe(CommandCategory.TASK);
  });

  it('should invoke onOpenGraph callback', async () => {
    const onOpenGraph = jest.fn();
    const commands = createNavigationCommands(onOpenGraph);
    const graphCmd = commands.find((c) => c.id === 'nav.graph')!;

    await graphCmd.execute(makeContext());

    expect(onOpenGraph).toHaveBeenCalledTimes(1);
  });

  it('should invoke onOpenTasks callback', async () => {
    const onOpenTasks = jest.fn();
    const commands = createNavigationCommands(undefined, onOpenTasks);
    const tasksCmd = commands.find((c) => c.id === 'nav.tasks')!;

    await tasksCmd.execute(makeContext());

    expect(onOpenTasks).toHaveBeenCalledTimes(1);
  });

  it('nav.graph should only be available when graph is available', () => {
    const commands = createNavigationCommands();
    const graphCmd = commands.find((c) => c.id === 'nav.graph')!;

    expect(graphCmd.available(makeContext({ graphAvailable: true }))).toBe(true);
    expect(graphCmd.available(makeContext({ graphAvailable: false }))).toBe(false);
  });

  it('nav.tasks should always be available', () => {
    const commands = createNavigationCommands();
    const tasksCmd = commands.find((c) => c.id === 'nav.tasks')!;

    expect(tasksCmd.available(makeContext({ graphAvailable: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registerFeatureCommands', () => {
  it('should register all feature commands', () => {
    const service = makeService();
    const registeredIds = registerFeatureCommands(service);

    expect(registeredIds).toContain('search.open');
    expect(registeredIds).toContain('search.query');
    expect(registeredIds).toContain('chat.open');
    expect(registeredIds).toContain('chat.agent');
    expect(registeredIds).toContain('impact.analyze');
    expect(registeredIds).toContain('impact.change');
    expect(registeredIds).toContain('nav.graph');
    expect(registeredIds).toContain('nav.tasks');
  });

  it('should register 8 commands total', () => {
    const service = makeService();
    const registeredIds = registerFeatureCommands(service);

    expect(registeredIds.length).toBe(8);
  });

  it('should handle duplicate registration gracefully', () => {
    const service = makeService();

    // Register once
    const firstIds = registerFeatureCommands(service);
    expect(firstIds.length).toBe(8);

    // Register again (should skip duplicates)
    const secondIds = registerFeatureCommands(service);
    expect(secondIds.length).toBe(0); // All duplicates, none registered
  });

  it('should wire callbacks correctly', async () => {
    const service = makeService();
    const onOpenSearch = jest.fn();
    const onOpenChat = jest.fn();
    const onOpenImpact = jest.fn();

    registerFeatureCommands(service, {
      onOpenSearch,
      onOpenChat,
      onOpenImpact,
    });

    // Execute search command
    await service.executeCommand('search.open', makeContext());
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    // Execute chat command
    await service.executeCommand('chat.open', makeContext());
    expect(onOpenChat).toHaveBeenCalledTimes(1);

    // Execute impact command
    await service.executeCommand('impact.analyze', makeContext());
    expect(onOpenImpact).toHaveBeenCalledTimes(1);
  });

  it('should return all registered commands via getAllCommands', () => {
    const service = makeService();
    registerFeatureCommands(service);

    const allCommands = service.getAllCommands();
    expect(allCommands.length).toBe(8);

    const commandIds = allCommands.map((c) => c.id);
    expect(commandIds).toContain('search.open');
    expect(commandIds).toContain('chat.open');
    expect(commandIds).toContain('impact.analyze');
  });
});
