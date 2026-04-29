/**
 * Property-Based Tests for Command Palette Service
 *
 * **Validates: Requirements 14.1**
 *
 * Properties:
 * - Property 4: Fuzzy Match Completeness
 * - Property 5: Fuzzy Match Score Monotonicity
 * - Property 6: Command Registry Round-Trip
 * - Property 7: Command Availability Filtering
 * - Property 13: Recent Commands Priority
 */

import * as fc from 'fast-check';
import { CommandPaletteService } from '../../services/command-palette-service';
import { EventBus } from '../../core/event-bus';
import {
  PaletteCommand,
  CommandContext,
  CommandCategory,
} from '../../types/palette';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const commandCategoryArb = fc.constantFrom(
  CommandCategory.SEARCH,
  CommandCategory.NAVIGATION,
  CommandCategory.CHAT,
  CommandCategory.ANALYSIS,
  CommandCategory.TASK,
  CommandCategory.FILE,
  CommandCategory.AGENT,
  CommandCategory.SETTING
) as fc.Arbitrary<CommandCategory>;

/** Generate a valid command ID */
const commandIdArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 20 })
  .map((s) => `cmd_${s.replace(/[^a-zA-Z0-9]/g, '_')}`);

/** Generate a command label */
const commandLabelArb: fc.Arbitrary<string> = fc.string({
  minLength: 5,
  maxLength: 30,
});

/** Generate command tags */
const commandTagsArb: fc.Arbitrary<string[]> = fc.array(
  fc.string({ minLength: 3, maxLength: 15 }),
  { minLength: 0, maxLength: 5 }
);

/** Generate a command context */
const commandContextArb: fc.Arbitrary<CommandContext> = fc.record({
  activeFile: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
    nil: undefined,
  }),
  activeNodeId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
    nil: undefined,
  }),
  activeTaskId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
    nil: undefined,
  }),
  selectedAgent: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
    nil: undefined,
  }),
  graphAvailable: fc.boolean(),
  vectorStoreAvailable: fc.boolean(),
  recentCommands: fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
    minLength: 0,
    maxLength: 10,
  }),
});

/** Generate a palette command */
const paletteCommandArb: fc.Arbitrary<PaletteCommand> = fc.record({
  id: commandIdArb,
  label: commandLabelArb,
  category: commandCategoryArb,
  shortcut: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
    nil: undefined,
  }),
  execute: fc.constant(async () => {}),
  available: fc.constant(() => true),
  icon: fc.option(fc.string({ minLength: 1, maxLength: 5 }), { nil: undefined }),
  tags: commandTagsArb,
});

/** Generate a query string */
const queryArb: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property 4: Fuzzy Match Completeness
// ---------------------------------------------------------------------------

describe('Command Palette Service Property-Based Tests', () => {
  describe('Property 4: Fuzzy Match Completeness', () => {
    it('should match when all query characters appear in order in target', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 15 }),
          fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 5 }),
          (baseString, gaps) => {
            // Build target by inserting gaps between query characters
            const query = baseString.slice(0, Math.min(baseString.length, 5));
            let target = '';
            for (let i = 0; i < query.length; i++) {
              target += query[i];
              if (i < gaps.length) {
                target += 'x'.repeat(gaps[i]);
              }
            }

            const service = new CommandPaletteService(new EventBus());
            const result = service.fuzzyMatch(query, target);

            // Property: If all query chars are in order in target, should match
            return result !== null && result.score > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not match when query characters are not in order', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 10 }),
          (str) => {
            if (str.length < 2) return true;

            // Create query and target where characters are reversed
            const query = str;
            const target = str.split('').reverse().join('');

            const service = new CommandPaletteService(new EventBus());
            const result = service.fuzzyMatch(query, target);

            // Property: Reversed order should not match (unless palindrome)
            const isPalindrome = query === target;
            if (isPalindrome) {
              return result !== null;
            } else {
              return result === null;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match empty query against any target with score 1.0', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 30 }), (target) => {
          const service = new CommandPaletteService(new EventBus());
          const result = service.fuzzyMatch('', target);

          // Property: Empty query always matches with score 1.0
          return result !== null && result.score === 1.0;
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 5: Fuzzy Match Score Monotonicity
  // ---------------------------------------------------------------------------

  describe('Property 5: Fuzzy Match Score Monotonicity', () => {
    it('should give exact match score >= partial match score', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 3, maxLength: 20 }), (str) => {
          const service = new CommandPaletteService(new EventBus());

          // Exact match
          const exactMatch = service.fuzzyMatch(str, str);

          // Partial match (prefix)
          const partialMatch = service.fuzzyMatch(
            str.slice(0, Math.max(1, Math.floor(str.length / 2))),
            str
          );

          // Property: Exact match score >= partial match score
          if (exactMatch && partialMatch) {
            return exactMatch.score >= partialMatch.score;
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should give prefix match score >= subsequence match score', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.integer({ min: 1, max: 3 }),
          (str, gap) => {
            const service = new CommandPaletteService(new EventBus());

            const prefix = str.slice(0, 3);
            const target = str;

            // Prefix match
            const prefixMatch = service.fuzzyMatch(prefix, target);

            // Subsequence match (with gaps)
            const subseqQuery = prefix[0] + prefix[2];
            const subseqMatch = service.fuzzyMatch(subseqQuery, target);

            // Property: Prefix match score >= subsequence match score
            if (prefixMatch && subseqMatch) {
              return prefixMatch.score >= subseqMatch.score;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should give exact match score of 1.0', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 30 }), (str) => {
          const service = new CommandPaletteService(new EventBus());
          const result = service.fuzzyMatch(str, str);

          // Property: Exact match always has score 1.0
          return result !== null && result.score === 1.0;
        }),
        { numRuns: 100 }
      );
    });

    it('should give prefix match score >= 0.9', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 30 }),
          fc.integer({ min: 1, max: 10 }),
          (str, prefixLen) => {
            const actualPrefixLen = Math.min(prefixLen, str.length - 1);
            if (actualPrefixLen < 1) return true;

            const prefix = str.slice(0, actualPrefixLen);
            const service = new CommandPaletteService(new EventBus());
            const result = service.fuzzyMatch(prefix, str);

            // Property: Prefix match score >= 0.9
            return result !== null && result.score >= 0.9;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 6: Command Registry Round-Trip
  // ---------------------------------------------------------------------------

  describe('Property 6: Command Registry Round-Trip', () => {
    it('should retrieve registered command', () => {
      fc.assert(
        fc.property(paletteCommandArb, (command) => {
          const service = new CommandPaletteService(new EventBus());

          // Register
          service.registerCommand(command);

          // Retrieve
          const allCommands = service.getAllCommands();
          const retrieved = allCommands.find((c) => c.id === command.id);

          // Property: Registered command is retrievable
          return retrieved !== undefined && retrieved.id === command.id;
        }),
        { numRuns: 100 }
      );
    });

    it('should match registered command in search', () => {
      fc.assert(
        fc.property(
          paletteCommandArb,
          commandContextArb,
          (command, context) => {
            const service = new CommandPaletteService(new EventBus());

            // Register
            service.registerCommand(command);

            // Search with part of label
            const query = command.label.slice(0, Math.max(1, command.label.length / 2));
            const matches = service.matchCommands(
              query,
              service.getAllCommands(),
              context,
              [],
              10
            );

            // Property: Command should be matchable if available
            if (command.available(context)) {
              return matches.some((m) => m.command.id === command.id);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should remove command after unregistration', () => {
      fc.assert(
        fc.property(paletteCommandArb, (command) => {
          const service = new CommandPaletteService(new EventBus());

          // Register
          service.registerCommand(command);

          // Unregister
          service.unregisterCommand(command.id);

          // Retrieve
          const allCommands = service.getAllCommands();
          const retrieved = allCommands.find((c) => c.id === command.id);

          // Property: Unregistered command is not retrievable
          return retrieved === undefined;
        }),
        { numRuns: 100 }
      );
    });

    it('should reject duplicate command IDs', () => {
      fc.assert(
        fc.property(paletteCommandArb, (command) => {
          const service = new CommandPaletteService(new EventBus());

          // Register once
          service.registerCommand(command);

          // Try to register again
          let threw = false;
          try {
            service.registerCommand(command);
          } catch (error) {
            threw = true;
          }

          // Property: Duplicate registration throws error
          return threw;
        }),
        { numRuns: 100 }
      );
    });

    it('should not affect other commands when unregistering', () => {
      fc.assert(
        fc.property(
          fc.array(paletteCommandArb, { minLength: 2, maxLength: 5 }),
          (commands) => {
            // Ensure unique IDs
            const uniqueCommands = Array.from(
              new Map(commands.map((c) => [c.id, c])).values()
            );
            if (uniqueCommands.length < 2) return true;

            const service = new CommandPaletteService(new EventBus());

            // Register all
            uniqueCommands.forEach((c) => service.registerCommand(c));

            // Unregister first
            service.unregisterCommand(uniqueCommands[0].id);

            // Check others still exist
            const remaining = service.getAllCommands();

            // Property: Other commands are unaffected
            return uniqueCommands
              .slice(1)
              .every((c) => remaining.some((r) => r.id === c.id));
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 7: Command Availability Filtering
  // ---------------------------------------------------------------------------

  describe('Property 7: Command Availability Filtering', () => {
    it('should only return available commands in results', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: commandIdArb,
              label: commandLabelArb,
              category: commandCategoryArb,
              shortcut: fc.constant(undefined as string | undefined),
              execute: fc.constant(async () => {}),
              available: fc.boolean().map((avail) => () => avail),
              icon: fc.constant(undefined as string | undefined),
              tags: commandTagsArb,
            }),
            { minLength: 5, maxLength: 20 }
          ),
          commandContextArb,
          queryArb,
          (commands, context, query) => {
            // Ensure unique IDs
            const uniqueCommands = Array.from(
              new Map(commands.map((c) => [c.id, c])).values()
            );

            const service = new CommandPaletteService(new EventBus());

            // Register all
            uniqueCommands.forEach((c) => service.registerCommand(c));

            // Match
            const matches = service.matchCommands(
              query,
              service.getAllCommands(),
              context,
              [],
              100
            );

            // Property: All matched commands are available
            return matches.every((m) => m.command.available(context));
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should filter out unavailable commands', () => {
      fc.assert(
        fc.property(commandContextArb, queryArb, (context, query) => {
          const service = new CommandPaletteService(new EventBus());

          // Register available command
          const availableCmd: PaletteCommand = {
            id: 'available',
            label: 'Available Command',
            category: CommandCategory.SEARCH,
            execute: async () => {},
            available: () => true,
            tags: ['test'],
          };

          // Register unavailable command
          const unavailableCmd: PaletteCommand = {
            id: 'unavailable',
            label: 'Unavailable Command',
            category: CommandCategory.SEARCH,
            execute: async () => {},
            available: () => false,
            tags: ['test'],
          };

          service.registerCommand(availableCmd);
          service.registerCommand(unavailableCmd);

          // Match
          const matches = service.matchCommands(
            query,
            service.getAllCommands(),
            context,
            [],
            100
          );

          // Property: Unavailable command is not in results
          return !matches.some((m) => m.command.id === 'unavailable');
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 13: Recent Commands Priority
  // ---------------------------------------------------------------------------

  describe('Property 13: Recent Commands Priority', () => {
    it('should boost recent commands in scoring', () => {
      fc.assert(
        fc.property(
          fc.array(paletteCommandArb, { minLength: 3, maxLength: 10 }),
          commandContextArb,
          queryArb,
          (commands, context, query) => {
            // Ensure unique IDs
            const uniqueCommands = Array.from(
              new Map(commands.map((c) => [c.id, c])).values()
            );
            if (uniqueCommands.length < 2) return true;

            const service = new CommandPaletteService(new EventBus());

            // Register all
            uniqueCommands.forEach((c) => service.registerCommand(c));

            // Mark first command as recent
            const recentCommands = [uniqueCommands[0].id];

            // Match without recent
            const matchesWithoutRecent = service.matchCommands(
              query,
              service.getAllCommands(),
              context,
              [],
              100
            );

            // Match with recent
            const matchesWithRecent = service.matchCommands(
              query,
              service.getAllCommands(),
              context,
              recentCommands,
              100
            );

            // Find the recent command in both result sets
            const recentInWithout = matchesWithoutRecent.find(
              (m) => m.command.id === uniqueCommands[0].id
            );
            const recentInWith = matchesWithRecent.find(
              (m) => m.command.id === uniqueCommands[0].id
            );

            // Property: Recent command has higher score when recency is applied
            if (recentInWithout && recentInWith) {
              return recentInWith.score >= recentInWithout.score;
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should track recent commands after execution', async () => {
      fc.assert(
        await fc.asyncProperty(
          paletteCommandArb,
          commandContextArb,
          async (command, context) => {
            const service = new CommandPaletteService(new EventBus());

            // Register
            service.registerCommand(command);

            // Execute
            await service.executeCommand(command.id, context);

            // Check recent
            const recent = service.getRecentCommands();

            // Property: Executed command is in recent list
            return recent.includes(command.id);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should limit recent commands to maximum size', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.array(paletteCommandArb, { minLength: 25, maxLength: 30 }),
          commandContextArb,
          async (commands, context) => {
            // Ensure unique IDs
            const uniqueCommands = Array.from(
              new Map(commands.map((c) => [c.id, c])).values()
            );

            const service = new CommandPaletteService(new EventBus());

            // Register all
            uniqueCommands.forEach((c) => service.registerCommand(c));

            // Execute all
            for (const cmd of uniqueCommands) {
              await service.executeCommand(cmd.id, context);
            }

            // Check recent
            const recent = service.getRecentCommands();

            // Property: Recent commands list is limited to 20
            return recent.length <= 20;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should order recent commands by most recent first', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.array(paletteCommandArb, { minLength: 3, maxLength: 5 }),
          commandContextArb,
          async (commands, context) => {
            // Ensure unique IDs
            const uniqueCommands = Array.from(
              new Map(commands.map((c) => [c.id, c])).values()
            );
            if (uniqueCommands.length < 3) return true;

            const service = new CommandPaletteService(new EventBus());

            // Register all
            uniqueCommands.forEach((c) => service.registerCommand(c));

            // Execute in order
            for (const cmd of uniqueCommands) {
              await service.executeCommand(cmd.id, context);
            }

            // Check recent
            const recent = service.getRecentCommands();

            // Property: Most recent command is first
            return recent[0] === uniqueCommands[uniqueCommands.length - 1].id;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
