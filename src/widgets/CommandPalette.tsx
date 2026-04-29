import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  PaletteCommand,
  CommandContext,
  PaletteMatch,
  CommandResult,
} from '../types/palette';
import { CommandPaletteService } from '../services/command-palette-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandPaletteWidgetProps {
  /** Command palette service instance */
  service: CommandPaletteService;
  /** Current command context */
  context: CommandContext;
  /** Whether the palette is open */
  isOpen: boolean;
  /** Callback when palette should close */
  onClose: () => void;
  /** Callback when a command is executed */
  onCommandExecute?: (result: CommandResult) => void;
  /** Maximum number of results to display */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Format keyboard shortcut for display.
 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('Ctrl', '⌃')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Cmd', '⌘')
    .replace('+', ' ');
}

/**
 * Get category icon for a command.
 */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    search: '🔍',
    navigation: '🧭',
    chat: '💬',
    analysis: '📊',
    task: '✓',
    file: '📄',
    agent: '🤖',
    setting: '⚙️',
  };
  return icons[category] || '•';
}

/**
 * Highlight matched characters in a string.
 */
export function highlightMatches(
  text: string,
  matchedIndices: number[]
): Array<{ text: string; isHighlight: boolean }> {
  const parts: Array<{ text: string; isHighlight: boolean }> = [];
  const matchSet = new Set(matchedIndices);

  let currentPart = '';
  let isCurrentHighlight = false;

  for (let i = 0; i < text.length; i++) {
    const isHighlight = matchSet.has(i);

    if (isHighlight !== isCurrentHighlight) {
      // Flush current part
      if (currentPart) {
        parts.push({ text: currentPart, isHighlight: isCurrentHighlight });
      }
      currentPart = text[i];
      isCurrentHighlight = isHighlight;
    } else {
      currentPart += text[i];
    }
  }

  // Flush final part
  if (currentPart) {
    parts.push({ text: currentPart, isHighlight: isCurrentHighlight });
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Search bar with input */
const PaletteSearchBar: React.FC<{
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}> = React.memo(({ query, onQueryChange, inputRef }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onQueryChange(e.target.value);
    },
    [onQueryChange]
  );

  return (
    <div className="palette-search-bar">
      <input
        ref={inputRef}
        type="text"
        className="palette-search-input"
        placeholder="Type a command..."
        value={query}
        onChange={handleChange}
        aria-label="Command search"
        autoFocus
      />
    </div>
  );
});
PaletteSearchBar.displayName = 'PaletteSearchBar';

/** Single result item */
const PaletteResultItem: React.FC<{
  match: PaletteMatch;
  isSelected: boolean;
  onSelect: () => void;
  onExecute: () => void;
}> = React.memo(({ match, isSelected, onSelect, onExecute }) => {
  const { command, highlights } = match;
  const labelParts = useMemo(
    () => highlightMatches(command.label, highlights),
    [command.label, highlights]
  );

  const handleClick = useCallback(() => {
    onSelect();
    onExecute();
  }, [onSelect, onExecute]);

  const handleMouseEnter = useCallback(() => {
    onSelect();
  }, [onSelect]);

  return (
    <div
      className={`palette-result-item ${isSelected ? 'palette-result-selected' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      role="option"
      aria-selected={isSelected}
      data-command-id={command.id}
    >
      <div className="palette-result-icon">
        {command.icon || getCategoryIcon(command.category)}
      </div>
      <div className="palette-result-content">
        <div className="palette-result-label">
          {labelParts.map((part, index) => (
            <span
              key={index}
              className={part.isHighlight ? 'palette-highlight' : ''}
            >
              {part.text}
            </span>
          ))}
        </div>
        {command.shortcut && (
          <div className="palette-result-shortcut">
            {formatShortcut(command.shortcut)}
          </div>
        )}
      </div>
      <div className="palette-result-category">{command.category}</div>
    </div>
  );
});
PaletteResultItem.displayName = 'PaletteResultItem';

/** Result list */
const PaletteResultList: React.FC<{
  matches: PaletteMatch[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onExecuteCommand: (match: PaletteMatch) => void;
}> = React.memo(({ matches, selectedIndex, onSelectIndex, onExecuteCommand }) => {
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [selectedIndex]);

  if (matches.length === 0) {
    return (
      <div className="palette-result-list palette-no-results">
        <div className="palette-no-results-message">No commands found</div>
      </div>
    );
  }

  return (
    <div className="palette-result-list" role="listbox">
      {matches.map((match, index) => (
        <div
          key={match.command.id}
          ref={index === selectedIndex ? selectedRef : null}
        >
          <PaletteResultItem
            match={match}
            isSelected={index === selectedIndex}
            onSelect={() => onSelectIndex(index)}
            onExecute={() => onExecuteCommand(match)}
          />
        </div>
      ))}
    </div>
  );
});
PaletteResultList.displayName = 'PaletteResultList';

/** Action preview panel */
const PaletteActionPreview: React.FC<{
  selectedMatch: PaletteMatch | null;
}> = React.memo(({ selectedMatch }) => {
  if (!selectedMatch) {
    return null;
  }

  const { command } = selectedMatch;

  return (
    <div className="palette-action-preview">
      <div className="palette-preview-header">
        <span className="palette-preview-icon">
          {command.icon || getCategoryIcon(command.category)}
        </span>
        <span className="palette-preview-label">{command.label}</span>
      </div>
      <div className="palette-preview-category">
        Category: {command.category}
      </div>
      {command.shortcut && (
        <div className="palette-preview-shortcut">
          Shortcut: {formatShortcut(command.shortcut)}
        </div>
      )}
      {command.tags.length > 0 && (
        <div className="palette-preview-tags">
          Tags: {command.tags.join(', ')}
        </div>
      )}
    </div>
  );
});
PaletteActionPreview.displayName = 'PaletteActionPreview';

/** Keyboard hints */
const PaletteKeyboardHints: React.FC = React.memo(() => {
  return (
    <div className="palette-keyboard-hints">
      <span className="palette-hint">
        <kbd>↑↓</kbd> Navigate
      </span>
      <span className="palette-hint">
        <kbd>Enter</kbd> Execute
      </span>
      <span className="palette-hint">
        <kbd>Esc</kbd> Close
      </span>
    </div>
  );
});
PaletteKeyboardHints.displayName = 'PaletteKeyboardHints';

// ---------------------------------------------------------------------------
// Main CommandPalette Component
// ---------------------------------------------------------------------------

export const CommandPalette: React.FC<CommandPaletteWidgetProps> = ({
  service,
  context,
  isOpen,
  onClose,
  onCommandExecute,
  maxResults = 10,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Get all commands and recent commands
  const allCommands = useMemo(() => service.getAllCommands(), [service]);
  const recentCommands = useMemo(() => service.getRecentCommands(), [service]);

  // Match commands with debouncing
  const [matches, setMatches] = useState<PaletteMatch[]>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Debounce the search
    service.debounceInput(() => {
      const results = service.matchCommands(
        query,
        allCommands,
        context,
        recentCommands,
        maxResults
      );
      setMatches(results);
      setSelectedIndex(0); // Reset selection on new results
    });
  }, [query, allCommands, context, recentCommands, maxResults, service, isOpen]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setIsExecuting(false);
      inputRef.current?.focus();

      // Initial load of commands (empty query shows recent + all)
      const results = service.matchCommands(
        '',
        allCommands,
        context,
        recentCommands,
        maxResults
      );
      setMatches(results);
    }
  }, [isOpen, service, allCommands, context, recentCommands, maxResults]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, matches.length - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (matches.length > 0 && selectedIndex >= 0 && !isExecuting) {
            handleExecuteCommand(matches[selectedIndex]);
          }
          break;

        default:
          break;
      }
    },
    [isOpen, matches, selectedIndex, isExecuting, onClose]
  );

  // Handle command execution
  const handleExecuteCommand = useCallback(
    async (match: PaletteMatch) => {
      if (isExecuting) {
        return;
      }

      setIsExecuting(true);

      try {
        const result = await service.executeCommand(match.command.id, context);
        onCommandExecute?.(result);

        // Close palette on successful execution
        if (result.success) {
          onClose();
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        onCommandExecute?.({
          commandId: match.command.id,
          success: false,
          message: errorMessage,
        });
      } finally {
        setIsExecuting(false);
      }
    },
    [service, context, onCommandExecute, onClose, isExecuting]
  );

  // Handle overlay click (close on backdrop click)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  const selectedMatch = matches[selectedIndex] || null;

  return (
    <div
      ref={overlayRef}
      className="command-palette-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="command-palette-container">
        <PaletteSearchBar
          query={query}
          onQueryChange={setQuery}
          inputRef={inputRef}
        />

        <PaletteResultList
          matches={matches}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          onExecuteCommand={handleExecuteCommand}
        />

        <PaletteActionPreview selectedMatch={selectedMatch} />

        <PaletteKeyboardHints />

        {isExecuting && (
          <div className="palette-executing-indicator">
            Executing command...
          </div>
        )}
      </div>
    </div>
  );
};
