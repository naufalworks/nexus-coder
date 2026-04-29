/**
 * Command Palette Service
 *
 * Implements command registration, fuzzy matching, and execution for the
 * command palette widget.
 *
 * Requirements: Command Palette (Task 14)
 */

import { EventBus, EventType } from '../core/event-bus';
import {
  PaletteCommand,
  CommandContext,
  PaletteMatch,
  CommandResult,
} from '../types/palette';
import logger from '../core/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Input debounce delay in milliseconds */
const INPUT_DEBOUNCE_MS = 150;

/** Maximum number of recent commands to track */
const MAX_RECENT_COMMANDS = 20;

/** Fuzzy match score weight */
const FUZZY_SCORE_WEIGHT = 0.7;

/** Recency boost weight */
const RECENCY_BOOST_WEIGHT = 0.2;

/** Category relevance weight */
const CATEGORY_RELEVANCE_WEIGHT = 0.1;

/** Performance target for fuzzy matching in milliseconds */
const FUZZY_MATCH_TARGET_MS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentCommand {
  commandId: string;
  timestamp: Date;
}

interface PrecomputedScore {
  commandId: string;
  recencyBoost: number;
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// CommandPaletteService
// ---------------------------------------------------------------------------

/**
 * Service that manages command registration, fuzzy matching, and execution
 * for the command palette.
 */
export class CommandPaletteService {
  private commands: Map<string, PaletteCommand> = new Map();
  private recentCommands: RecentCommand[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private precomputedScores: Map<string, PrecomputedScore> = new Map();

  constructor(private eventBus: EventBus) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register a command in the palette.
   *
   * @param command - Command to register
   * @throws Error if command with same ID already exists
   *
   * Postconditions:
   *  - Command is stored in registry
   *  - Duplicate IDs are rejected with error
   */
  registerCommand(command: PaletteCommand): void {
    if (this.commands.has(command.id)) {
      throw new Error(`Command with ID "${command.id}" is already registered`);
    }

    this.commands.set(command.id, command);
    logger.debug(`[CommandPaletteService] Registered command: ${command.id}`);
  }

  /**
   * Unregister a command from the palette.
   *
   * @param id - Command ID to remove
   *
   * Postconditions:
   *  - Command is removed from registry
   *  - Other commands are not affected
   */
  unregisterCommand(id: string): void {
    this.commands.delete(id);
    logger.debug(`[CommandPaletteService] Unregistered command: ${id}`);
  }

  /**
   * Perform fuzzy matching on a query against a target string.
   *
   * Algorithm:
   *  - Empty query matches everything with score 1.0
   *  - Exact match (case-insensitive) returns score 1.0
   *  - Prefix match returns score >= 0.9
   *  - Subsequence match returns score based on character positions
   *  - No match returns null
   *
   * @param query - Search query
   * @param target - Target string to match against
   * @returns Match score (0-1) and matched indices, or null if no match
   */
  fuzzyMatch(
    query: string,
    target: string
  ): { score: number; matchedIndices: number[] } | null {
    // Empty query matches everything
    if (query.length === 0) {
      return { score: 1.0, matchedIndices: [] };
    }

    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    // Exact match
    if (queryLower === targetLower) {
      return {
        score: 1.0,
        matchedIndices: Array.from({ length: target.length }, (_, i) => i),
      };
    }

    // Prefix match
    if (targetLower.startsWith(queryLower)) {
      return {
        score: 0.9 + 0.1 * (queryLower.length / targetLower.length),
        matchedIndices: Array.from({ length: query.length }, (_, i) => i),
      };
    }

    // Subsequence match
    const matchedIndices: number[] = [];
    let queryIndex = 0;
    let targetIndex = 0;

    while (queryIndex < queryLower.length && targetIndex < targetLower.length) {
      if (queryLower[queryIndex] === targetLower[targetIndex]) {
        matchedIndices.push(targetIndex);
        queryIndex++;
      }
      targetIndex++;
    }

    // No match if not all query characters found
    if (queryIndex < queryLower.length) {
      return null;
    }

    // Calculate score based on match quality
    // Better score for consecutive matches and early matches
    let score = 0.5; // Base score for subsequence match

    // Bonus for consecutive matches
    let consecutiveCount = 0;
    for (let i = 1; i < matchedIndices.length; i++) {
      if (matchedIndices[i] === matchedIndices[i - 1] + 1) {
        consecutiveCount++;
      }
    }
    score += (consecutiveCount / matchedIndices.length) * 0.2;

    // Bonus for early matches
    const avgPosition =
      matchedIndices.reduce((sum, idx) => sum + idx, 0) / matchedIndices.length;
    const earlyBonus = (1 - avgPosition / targetLower.length) * 0.2;
    score += earlyBonus;

    // Bonus for match density
    const density = matchedIndices.length / targetLower.length;
    score += density * 0.1;

    return { score: Math.min(score, 0.89), matchedIndices };
  }

  /**
   * Match commands against a query with scoring and filtering.
   *
   * Algorithm:
   *  1. Filter by available(context)
   *  2. Fuzzy match against label, tags
   *  3. Apply composite scoring: fuzzy * 0.7 + recency * 0.2 + category * 0.1
   *  4. Sort by descending score
   *  5. Limit to maxResults
   *
   * Performance: Targets <50ms for 100+ commands using pre-computed
   * recency scores and early exit on no-match.
   *
   * @param query - Search query
   * @param commands - Commands to search
   * @param context - Current context
   * @param recentCommands - Recent command IDs for recency boost
   * @param maxResults - Maximum results to return
   * @returns Matched commands with scores, sorted by descending score
   */
  matchCommands(
    query: string,
    commands: PaletteCommand[],
    context: CommandContext,
    recentCommands: string[],
    maxResults: number
  ): PaletteMatch[] {
    const matches: PaletteMatch[] = [];

    // Pre-compute recency scores for this batch
    const recencyScoreMap = new Map<string, number>();
    for (const cmdId of recentCommands) {
      const precomputed = this.precomputedScores.get(cmdId);
      if (precomputed && Date.now() - precomputed.lastUpdated < 30000) {
        recencyScoreMap.set(cmdId, precomputed.recencyBoost);
      } else {
        const boost = this.calculateRecencyBoost(cmdId, recentCommands);
        recencyScoreMap.set(cmdId, boost);
        this.precomputedScores.set(cmdId, {
          commandId: cmdId,
          recencyBoost: boost,
          lastUpdated: Date.now(),
        });
      }
    }

    // Cache category relevance
    const categoryCache = new Map<string, number>();

    for (const command of commands) {
      // Filter by availability
      if (!command.available(context)) {
        continue;
      }

      // Fuzzy match against label
      const labelMatch = this.fuzzyMatch(query, command.label);
      if (!labelMatch) {
        // Try matching against tags — early exit if no tags
        if (command.tags.length === 0) continue;

        let bestTagMatch: { score: number; matchedIndices: number[] } | null = null;
        for (const tag of command.tags) {
          const tagMatch = this.fuzzyMatch(query, tag);
          if (tagMatch && (!bestTagMatch || tagMatch.score > bestTagMatch.score)) {
            bestTagMatch = tagMatch;
          }
        }

        if (!bestTagMatch) {
          continue; // No match
        }

        // Use tag match
        const fuzzyScore = bestTagMatch.score * 0.8; // Slight penalty for tag match
        const recencyBoost = recencyScoreMap.get(command.id) ?? 0;
        
        // Cache category relevance
        let categoryRelevance = categoryCache.get(command.category);
        if (categoryRelevance === undefined) {
          categoryRelevance = this.calculateCategoryRelevance(
            command.category,
            context
          );
          categoryCache.set(command.category, categoryRelevance);
        }

        const finalScore =
          fuzzyScore * FUZZY_SCORE_WEIGHT +
          recencyBoost * RECENCY_BOOST_WEIGHT +
          categoryRelevance * CATEGORY_RELEVANCE_WEIGHT;

        matches.push({
          command,
          score: finalScore,
          highlights: bestTagMatch.matchedIndices,
        });
      } else {
        // Use label match
        const fuzzyScore = labelMatch.score;
        const recencyBoost = recencyScoreMap.get(command.id) ?? 0;
        
        // Cache category relevance
        let categoryRelevance = categoryCache.get(command.category);
        if (categoryRelevance === undefined) {
          categoryRelevance = this.calculateCategoryRelevance(
            command.category,
            context
          );
          categoryCache.set(command.category, categoryRelevance);
        }

        const finalScore =
          fuzzyScore * FUZZY_SCORE_WEIGHT +
          recencyBoost * RECENCY_BOOST_WEIGHT +
          categoryRelevance * CATEGORY_RELEVANCE_WEIGHT;

        matches.push({
          command,
          score: finalScore,
          highlights: labelMatch.matchedIndices,
        });
      }
    }

    // Sort by descending score
    matches.sort((a, b) => b.score - a.score);

    // Limit results
    return matches.slice(0, maxResults);
  }

  /**
   * Execute a command by ID.
   *
   * @param id - Command ID to execute
   * @param context - Execution context
   * @returns Command result
   * @throws Error if command not found
   *
   * Postconditions:
   *  - Command handler is invoked exactly once
   *  - Result is returned
   *  - Command is added to recent commands on success
   *  - COMMAND_EXECUTED event is emitted
   *  - Errors are caught and reported in result
   */
  async executeCommand(id: string, context: CommandContext): Promise<CommandResult> {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`Command not found: ${id}`);
    }

    try {
      // Execute command
      await command.execute(context);

      // Add to recent commands
      this.addRecentCommand(id);

      // Emit event
      this.eventBus.emit(
        EventType.AGENT_COMPLETED,
        {
          commandId: id,
          timestamp: new Date(),
        },
        'command-palette'
      );

      logger.info(`[CommandPaletteService] Executed command: ${id}`);

      return {
        commandId: id,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        `[CommandPaletteService] Error executing command ${id}: ${errorMessage}`
      );

      return {
        commandId: id,
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Get recent commands (most recent first).
   */
  getRecentCommands(): string[] {
    return this.recentCommands.map((rc) => rc.commandId);
  }

  /**
   * Get all registered commands.
   */
  getAllCommands(): PaletteCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Debounce input for the specified delay.
   *
   * @param callback - Callback to invoke after debounce
   */
  debounceInput(callback: () => void): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      callback();
      this.debounceTimer = null;
    }, INPUT_DEBOUNCE_MS);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Calculate recency boost for a command.
   *
   * @param commandId - Command ID
   * @param recentCommands - Recent command IDs (most recent first)
   * @returns Recency boost (0-1)
   */
  private calculateRecencyBoost(
    commandId: string,
    recentCommands: string[]
  ): number {
    const index = recentCommands.indexOf(commandId);
    if (index === -1) {
      return 0;
    }

    // Exponential decay: most recent = 1.0, decays to 0
    return Math.exp(-index / 5);
  }

  /**
   * Calculate category relevance based on context.
   *
   * @param category - Command category
   * @param context - Current context
   * @returns Category relevance (0-1)
   */
  private calculateCategoryRelevance(
    category: string,
    context: CommandContext
  ): number {
    // Simple heuristic: boost certain categories based on context
    if (context.activeFile && category === 'file') {
      return 1.0;
    }
    if (context.activeNodeId && category === 'navigation') {
      return 1.0;
    }
    if (context.selectedAgent && category === 'agent') {
      return 1.0;
    }

    return 0.5; // Default relevance
  }

  /**
   * Add a command to recent commands list.
   *
   * @param commandId - Command ID to add
   */
  private addRecentCommand(commandId: string): void {
    // Remove if already exists
    this.recentCommands = this.recentCommands.filter(
      (rc) => rc.commandId !== commandId
    );

    // Add to front
    this.recentCommands.unshift({
      commandId,
      timestamp: new Date(),
    });

    // Limit size
    if (this.recentCommands.length > MAX_RECENT_COMMANDS) {
      this.recentCommands = this.recentCommands.slice(0, MAX_RECENT_COMMANDS);
    }
  }
}
