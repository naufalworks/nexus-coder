/**
 * Feature Commands Registration
 *
 * Registers all built-in feature commands in the Command Palette service.
 * Each feature (Search, Chat, Impact Analysis) contributes its commands.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4
 */

import { PaletteCommand, CommandCategory, CommandContext } from '../types/palette';
import { CommandPaletteService } from './command-palette-service';

// ---------------------------------------------------------------------------
// Feature command definitions
// ---------------------------------------------------------------------------

/**
 * Create search feature commands.
 *
 * Commands:
 * - search.open: Open Semantic Search widget
 * - search.query: Quick search with a query string
 */
export function createSearchCommands(
  onOpenSearch?: () => void,
  onSearchQuery?: (query: string) => void
): PaletteCommand[] {
  return [
    {
      id: 'search.open',
      label: 'Semantic Search',
      category: CommandCategory.SEARCH,
      shortcut: 'Ctrl+Shift+F',
      icon: '🔍',
      tags: ['search', 'find', 'semantic', 'code'],
      available: (context: CommandContext) => true,
      execute: async () => {
        onOpenSearch?.();
      },
    },
    {
      id: 'search.query',
      label: 'Search for...',
      category: CommandCategory.SEARCH,
      icon: '🔎',
      tags: ['search', 'quick', 'find'],
      available: (context: CommandContext) => true,
      execute: async () => {
        // Default: open search (query is entered via search bar)
        onSearchQuery?.('');
      },
    },
  ];
}

/**
 * Create chat feature commands.
 *
 * Commands:
 * - chat.open: Open Agent Chat widget
 * - chat.agent: Start chat with a specific agent
 */
export function createChatCommands(
  onOpenChat?: () => void,
  onChatAgent?: (agentName: string) => void
): PaletteCommand[] {
  return [
    {
      id: 'chat.open',
      label: 'Open Agent Chat',
      category: CommandCategory.CHAT,
      shortcut: 'Ctrl+Shift+C',
      icon: '💬',
      tags: ['chat', 'message', 'agent', 'conversation'],
      available: (context: CommandContext) => true,
      execute: async () => {
        onOpenChat?.();
      },
    },
    {
      id: 'chat.agent',
      label: 'Chat with Agent...',
      category: CommandCategory.CHAT,
      icon: '��',
      tags: ['chat', 'agent', 'start'],
      available: (context: CommandContext) => true,
      execute: async () => {
        // Default: open chat (agent selection happens in chat UI)
        onChatAgent?.('');
      },
    },
  ];
}

/**
 * Create impact analysis feature commands.
 *
 * Commands:
 * - impact.analyze: Open Impact Analysis widget
 * - impact.change: Analyze impact of a specific change
 */
export function createImpactCommands(
  onOpenImpact?: () => void,
  onImpactChange?: (nodeId: string) => void
): PaletteCommand[] {
  return [
    {
      id: 'impact.analyze',
      label: 'Analyze Impact',
      category: CommandCategory.ANALYSIS,
      shortcut: 'Ctrl+Shift+I',
      icon: '📊',
      tags: ['impact', 'analysis', 'change', 'ripple'],
      available: (context: CommandContext) => context.graphAvailable,
      execute: async () => {
        onOpenImpact?.();
      },
    },
    {
      id: 'impact.change',
      label: 'Impact of Change...',
      category: CommandCategory.ANALYSIS,
      icon: '⚡',
      tags: ['impact', 'change', 'analyze'],
      available: (context: CommandContext) => context.graphAvailable,
      execute: async () => {
        // Default: open impact analysis (node selection happens in impact UI)
        onImpactChange?.('');
      },
    },
  ];
}

/**
 * Navigation commands for the palette.
 *
 * Commands:
 * - nav.graph: Open Graph Explorer
 * - nav.tasks: Open Task Panel
 */
export function createNavigationCommands(
  onOpenGraph?: () => void,
  onOpenTasks?: () => void
): PaletteCommand[] {
  return [
    {
      id: 'nav.graph',
      label: 'Open Graph Explorer',
      category: CommandCategory.NAVIGATION,
      icon: '🧭',
      tags: ['graph', 'navigate', 'explore'],
      available: (context: CommandContext) => context.graphAvailable,
      execute: async () => {
        onOpenGraph?.();
      },
    },
    {
      id: 'nav.tasks',
      label: 'Open Task Panel',
      category: CommandCategory.TASK,
      icon: '✓',
      tags: ['task', 'panel', 'list'],
      available: () => true,
      execute: async () => {
        onOpenTasks?.();
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

/**
 * Register all feature commands with the Command Palette service.
 *
 * @param service - Command Palette service instance
 * @param callbacks - Callback functions for each feature action
 * @returns Array of registered command IDs
 *
 * Postconditions:
 *  - All feature commands are registered in the service
 *  - Duplicate IDs are handled gracefully
 */
export function registerFeatureCommands(
  service: CommandPaletteService,
  callbacks: {
    onOpenSearch?: () => void;
    onSearchQuery?: (query: string) => void;
    onOpenChat?: () => void;
    onChatAgent?: (agentName: string) => void;
    onOpenImpact?: () => void;
    onImpactChange?: (nodeId: string) => void;
    onOpenGraph?: () => void;
    onOpenTasks?: () => void;
  } = {}
): string[] {
  const allCommands: PaletteCommand[] = [
    ...createSearchCommands(callbacks.onOpenSearch, callbacks.onSearchQuery),
    ...createChatCommands(callbacks.onOpenChat, callbacks.onChatAgent),
    ...createImpactCommands(callbacks.onOpenImpact, callbacks.onImpactChange),
    ...createNavigationCommands(callbacks.onOpenGraph, callbacks.onOpenTasks),
  ];

  const registeredIds: string[] = [];

  for (const command of allCommands) {
    try {
      service.registerCommand(command);
      registeredIds.push(command.id);
    } catch (error) {
      // Duplicate command — skip silently (already registered)
      if (
        error instanceof Error &&
        error.message.includes('already registered')
      ) {
        continue;
      }
      throw error;
    }
  }

  return registeredIds;
}
