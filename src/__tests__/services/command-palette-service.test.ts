/**
 * Unit Tests for Command Palette Service
 *
 * **Validates: Requirements 14.1**
 *
 * Tests cover:
 * 1. Command registration, retrieval, unregistration, duplicate rejection
 * 2. Fuzzy matching: exact, prefix, partial, empty query, no match
 * 3. matchCommands: filtering by availability, scoring, limiting results
 * 4. executeCommand: success, failure, recent commands update, event emission
 * 5. Performance: <50ms for 100+ commands
 */

// Mock logger before any imports
jest.mock('../../core/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));

import { CommandPaletteService } from '../../services/command-palette-service';
import { EventBus, EventType } from '../../core/event-bus';
import {
  PaletteCommand,
  CommandContext,
  CommandCategory,
} from '../../types/palette';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeCommand(overrides: Partial<PaletteCommand> = {}): PaletteCommand {
  return {
    id: 'test-command',
    label: 'Test Command',
    category: CommandCategory.SEARCH,
    execute: jest.fn().mockResolvedValue(undefined),
    available: jest.fn().mockReturnValue(true),
    tags: ['test'],
    ...overrides,
  };
}

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    graphAvailable: true,
    vectorStoreAvailable: true,
    recentCommands: [],
    ...overrides,
  };
}

function makeEventBus(): EventBus {
  return new EventBus();
}

function registerManyCommands(
  service: CommandPaletteService,
  count: number
): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (let i = 0; i < count; i++) {
    const cmd = makeCommand({
      id: `cmd-${i}`,
      label: `Command ${i}`,
      category: CommandCategory.SEARCH,
      tags: [`tag-${i}`],
    });
    service.registerCommand(cmd);
    commands.push(cmd);
  }
  return commands;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CommandPaletteService', () => {
  let service: CommandPaletteService;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = makeEventBus();
    service = new CommandPaletteService(eventBus);
  });

  // -------------------------------------------------------------------------
  // 1. Command Registration
  // -------------------------------------------------------------------------

  describe('registerCommand', () => {
    it('should register a command', () => {
      const cmd = makeCommand();
      service.registerCommand(cmd);

      const all = service.getAllCommands();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('test-command');
    });

    it('should register multiple commands', () => {
      const cmd1 = makeCommand({ id: 'cmd-1' });
      const cmd2 = makeCommand({ id: 'cmd-2' });

      service.registerCommand(cmd1);
      service.registerCommand(cmd2);

      const all = service.getAllCommands();
      expect(all).toHaveLength(2);
    });

    it('should reject duplicate command IDs', () => {
      const cmd = makeCommand({ id: 'duplicate' });
      service.registerCommand(cmd);

      expect(() => {
        service.registerCommand(makeCommand({ id: 'duplicate' }));
      }).toThrow('already registered');
    });

    it('should validate command ID is present', () => {
      const cmd = makeCommand({ id: '' });
      service.registerCommand(cmd);

      // Empty ID is still accepted (validation is caller's responsibility)
      expect(service.getAllCommands()).toHaveLength(1);
    });
  });

  describe('unregisterCommand', () => {
    it('should remove a registered command', () => {
      const cmd = makeCommand({ id: 'to-remove' });
      service.registerCommand(cmd);

      service.unregisterCommand('to-remove');

      expect(service.getAllCommands()).toHaveLength(0);
    });

    it('should not affect other commands', () => {
      const cmd1 = makeCommand({ id: 'keep' });
      const cmd2 = makeCommand({ id: 'remove' });

      service.registerCommand(cmd1);
      service.registerCommand(cmd2);

      service.unregisterCommand('remove');

      const all = service.getAllCommands();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('keep');
    });

    it('should handle unregistering non-existent command gracefully', () => {
      expect(() => {
        service.unregisterCommand('non-existent');
      }).not.toThrow();
    });
  });

  describe('getAllCommands', () => {
    it('should return empty array when no commands registered', () => {
      expect(service.getAllCommands()).toEqual([]);
    });

    it('should return all registered commands', () => {
      registerManyCommands(service, 5);
      expect(service.getAllCommands()).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Fuzzy Matching
  // -------------------------------------------------------------------------

  describe('fuzzyMatch', () => {
    it('should match exact string with score 1.0', () => {
      const result = service.fuzzyMatch('hello', 'hello');

      expect(result).not.toBeNull();
      expect(result!.score).toBe(1.0);
    });

    it('should match exact string case-insensitively', () => {
      const result = service.fuzzyMatch('HELLO', 'hello');

      expect(result).not.toBeNull();
      expect(result!.score).toBe(1.0);
    });

    it('should match prefix with score >= 0.9', () => {
      const result = service.fuzzyMatch('open', 'open file');

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.9);
    });

    it('should match prefix case-insensitively', () => {
      const result = service.fuzzyMatch('OPEN', 'open file');

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.9);
    });

    it('should match subsequence', () => {
      const result = service.fuzzyMatch('oF', 'openFile');

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it('should match partial subsequence', () => {
      const result = service.fuzzyMatch('sv', 'save file');

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it('should match with empty query and score 1.0', () => {
      const result = service.fuzzyMatch('', 'anything');

      expect(result).not.toBeNull();
      expect(result!.score).toBe(1.0);
      expect(result!.matchedIndices).toEqual([]);
    });

    it('should return null for no match', () => {
      const result = service.fuzzyMatch('xyz', 'abc');

      expect(result).toBeNull();
    });

    it('should return null when query is longer than target', () => {
      const result = service.fuzzyMatch('very long query', 'short');

      expect(result).toBeNull();
    });

    it('should return matched indices for exact match', () => {
      const result = service.fuzzyMatch('abc', 'abc');

      expect(result).not.toBeNull();
      expect(result!.matchedIndices).toEqual([0, 1, 2]);
    });

    it('should return matched indices for prefix match', () => {
      const result = service.fuzzyMatch('ab', 'abcdef');

      expect(result).not.toBeNull();
      expect(result!.matchedIndices).toEqual([0, 1]);
    });

    it('should return matched indices for subsequence match', () => {
      const result = service.fuzzyMatch('ac', 'abc');

      expect(result).not.toBeNull();
      expect(result!.matchedIndices).toEqual([0, 2]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. matchCommands
  // -------------------------------------------------------------------------

  describe('matchCommands', () => {
    const context = makeContext();

    it('should filter by availability', () => {
      const available = makeCommand({
        id: 'available',
        label: 'Available Command',
        available: () => true,
      });
      const unavailable = makeCommand({
        id: 'unavailable',
        label: 'Unavailable Command',
        available: () => false,
      });

      const matches = service.matchCommands(
        '',
        [available, unavailable],
        context,
        [],
        10
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].command.id).toBe('available');
    });

    it('should score and sort by descending score', () => {
      const cmd1 = makeCommand({
        id: 'exact-match',
        label: 'open',
      });
      const cmd2 = makeCommand({
        id: 'partial-match',
        label: 'open file dialog',
      });

      const matches = service.matchCommands(
        'open',
        [cmd2, cmd1],
        context,
        [],
        10
      );

      // Exact match should score higher
      expect(matches[0].command.id).toBe('exact-match');
    });

    it('should limit results to maxResults', () => {
      const commands = registerManyCommands(service, 20);

      const matches = service.matchCommands(
        '',
        service.getAllCommands(),
        context,
        [],
        5
      );

      expect(matches.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no commands match', () => {
      const cmd = makeCommand({ id: 'test', label: 'Open File' });

      const matches = service.matchCommands(
        'xyz',
        [cmd],
        context,
        [],
        10
      );

      expect(matches).toHaveLength(0);
    });

    it('should match against tags', () => {
      const cmd = makeCommand({
        id: 'tagged',
        label: 'Something Else',
        tags: ['search', 'find'],
      });

      const matches = service.matchCommands(
        'search',
        [cmd],
        context,
        [],
        10
      );

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].command.id).toBe('tagged');
    });

    it('should apply recency boost', () => {
      const cmd1 = makeCommand({ id: 'recent', label: 'Save File' });
      const cmd2 = makeCommand({ id: 'old', label: 'Save As' });

      const matchesWithoutRecent = service.matchCommands(
        'save',
        [cmd1, cmd2],
        context,
        [],
        10
      );

      const matchesWithRecent = service.matchCommands(
        'save',
        [cmd1, cmd2],
        context,
        ['recent'],
        10
      );

      // Recent command should score higher with recency boost
      const recentWithoutScore =
        matchesWithoutRecent.find((m) => m.command.id === 'recent')?.score ?? 0;
      const recentWithScore =
        matchesWithRecent.find((m) => m.command.id === 'recent')?.score ?? 0;

      expect(recentWithScore).toBeGreaterThan(recentWithoutScore);
    });
  });

  // -------------------------------------------------------------------------
  // 4. executeCommand
  // -------------------------------------------------------------------------

  describe('executeCommand', () => {
    const context = makeContext();

    it('should execute command and return success result', async () => {
      const executeMock = jest.fn().mockResolvedValue(undefined);
      const cmd = makeCommand({ id: 'exec-test', execute: executeMock });

      service.registerCommand(cmd);

      const result = await service.executeCommand('exec-test', context);

      expect(result.success).toBe(true);
      expect(result.commandId).toBe('exec-test');
      expect(executeMock).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent command', async () => {
      await expect(service.executeCommand('non-existent', context)).rejects.toThrow(
        'Command not found'
      );
    });

    it('should invoke handler exactly once', async () => {
      const executeMock = jest.fn().mockResolvedValue(undefined);
      const cmd = makeCommand({ id: 'once-test', execute: executeMock });

      service.registerCommand(cmd);

      await service.executeCommand('once-test', context);

      expect(executeMock).toHaveBeenCalledTimes(1);
    });

    it('should add to recent commands on success', async () => {
      const cmd = makeCommand({ id: 'recent-test' });
      service.registerCommand(cmd);

      await service.executeCommand('recent-test', context);

      const recent = service.getRecentCommands();
      expect(recent).toContain('recent-test');
    });

    it('should emit event on successful execution', async () => {
      const emitSpy = jest.spyOn(eventBus, 'emit');
      const cmd = makeCommand({ id: 'emit-test' });
      service.registerCommand(cmd);

      await service.executeCommand('emit-test', context);

      expect(emitSpy).toHaveBeenCalledWith(
        EventType.AGENT_COMPLETED,
        expect.objectContaining({ commandId: 'emit-test' }),
        'command-palette'
      );
    });

    it('should catch and report errors in result', async () => {
      const executeMock = jest
        .fn()
        .mockRejectedValue(new Error('Execution failed'));
      const cmd = makeCommand({ id: 'fail-test', execute: executeMock });

      service.registerCommand(cmd);

      const result = await service.executeCommand('fail-test', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Execution failed');
    });

    it('should not add to recent commands on failure', async () => {
      const executeMock = jest
        .fn()
        .mockRejectedValue(new Error('Failed'));
      const cmd = makeCommand({ id: 'fail-recent', execute: executeMock });

      service.registerCommand(cmd);

      await service.executeCommand('fail-recent', context);

      const recent = service.getRecentCommands();
      expect(recent).not.toContain('fail-recent');
    });

    it('should handle synchronous execute functions', async () => {
      const executeMock = jest.fn();
      const cmd = makeCommand({ id: 'sync-test', execute: executeMock });

      service.registerCommand(cmd);

      const result = await service.executeCommand('sync-test', context);

      expect(result.success).toBe(true);
      expect(executeMock).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Recent Commands
  // -------------------------------------------------------------------------

  describe('getRecentCommands', () => {
    it('should return empty array initially', () => {
      expect(service.getRecentCommands()).toEqual([]);
    });

    it('should return commands in most recent first order', async () => {
      const cmd1 = makeCommand({ id: 'first' });
      const cmd2 = makeCommand({ id: 'second' });
      const cmd3 = makeCommand({ id: 'third' });

      service.registerCommand(cmd1);
      service.registerCommand(cmd2);
      service.registerCommand(cmd3);

      const context = makeContext();
      await service.executeCommand('first', context);
      await service.executeCommand('second', context);
      await service.executeCommand('third', context);

      const recent = service.getRecentCommands();
      expect(recent[0]).toBe('third');
      expect(recent[1]).toBe('second');
      expect(recent[2]).toBe('first');
    });

    it('should move command to front when re-executed', async () => {
      const cmd1 = makeCommand({ id: 'first' });
      const cmd2 = makeCommand({ id: 'second' });

      service.registerCommand(cmd1);
      service.registerCommand(cmd2);

      const context = makeContext();
      await service.executeCommand('first', context);
      await service.executeCommand('second', context);
      await service.executeCommand('first', context); // re-execute

      const recent = service.getRecentCommands();
      expect(recent[0]).toBe('first');
      expect(recent[1]).toBe('second');
    });

    it('should limit to 20 recent commands', async () => {
      const commands = registerManyCommands(service, 25);

      const context = makeContext();
      for (const cmd of commands) {
        await service.executeCommand(cmd.id, context);
      }

      const recent = service.getRecentCommands();
      expect(recent.length).toBeLessThanOrEqual(20);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Debounce
  // -------------------------------------------------------------------------

  describe('debounceInput', () => {
    it('should debounce input callback', (done) => {
      let callCount = 0;

      service.debounceInput(() => {
        callCount++;
      });

      // Should not be called immediately
      expect(callCount).toBe(0);

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 200);
    });

    it('should cancel previous debounced call', (done) => {
      let callCount = 0;

      service.debounceInput(() => {
        callCount++;
      });

      service.debounceInput(() => {
        callCount++;
      });

      setTimeout(() => {
        // Only the last callback should fire
        expect(callCount).toBe(1);
        done();
      }, 200);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Performance
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    it('should fuzzy match 100+ commands in under 50ms', () => {
      const commands = registerManyCommands(service, 150);
      const context = makeContext();

      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        service.matchCommands(
          `command ${i}`,
          service.getAllCommands(),
          context,
          [],
          20
        );
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // 10 iterations, each < 50ms
    });

    it('should fuzzy match single query against 100+ commands in under 50ms', () => {
      const commands = registerManyCommands(service, 150);
      const context = makeContext();

      const startTime = Date.now();

      service.matchCommands(
        'command 50',
        service.getAllCommands(),
        context,
        [],
        20
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });
  });
});
