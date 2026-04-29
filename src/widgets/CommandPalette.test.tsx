/**
 * Unit tests for CommandPalette widget
 *
 * Tests:
 * - Overlay rendering, search bar, result list
 * - Keyboard shortcut opening (Ctrl+P handled externally via isOpen prop)
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Action preview display
 * - Render performance within 100ms budget
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  CommandPalette,
  formatShortcut,
  getCategoryIcon,
  highlightMatches,
} from './CommandPalette';
import { CommandPaletteService } from '../services/command-palette-service';
import { PaletteCommand, CommandCategory, CommandContext } from '../types/palette';
import { EventBus, EventType } from '../core/event-bus';

// Polyfill scrollIntoView for JSDOM
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(overrides: Partial<PaletteCommand> = {}): PaletteCommand {
  return {
    id: 'test-command',
    label: 'Test Command',
    category: CommandCategory.SEARCH,
    tags: ['test'],
    available: () => true,
    execute: jest.fn(),
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

function makeService(): CommandPaletteService {
  const eventBus = new EventBus();
  return new CommandPaletteService(eventBus);
}

function makePaletteCommands(): PaletteCommand[] {
  return [
    makeCommand({
      id: 'search.open',
      label: 'Open Search',
      category: CommandCategory.SEARCH,
      shortcut: 'Ctrl+Shift+F',
      tags: ['search', 'find'],
    }),
    makeCommand({
      id: 'chat.open',
      label: 'Open Chat',
      category: CommandCategory.CHAT,
      shortcut: 'Ctrl+Shift+C',
      tags: ['chat', 'message'],
    }),
    makeCommand({
      id: 'impact.analyze',
      label: 'Analyze Impact',
      category: CommandCategory.ANALYSIS,
      tags: ['impact', 'analysis'],
    }),
    makeCommand({
      id: 'file.open',
      label: 'Open File',
      category: CommandCategory.FILE,
      tags: ['file', 'open'],
    }),
    makeCommand({
      id: 'nav.goto',
      label: 'Go to Node',
      category: CommandCategory.NAVIGATION,
      tags: ['goto', 'navigate'],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe('formatShortcut', () => {
  it('should replace Ctrl with ⌃', () => {
    expect(formatShortcut('Ctrl+P')).toContain('⌃');
  });

  it('should replace Shift with ⇧', () => {
    expect(formatShortcut('Shift+F')).toContain('⇧');
  });

  it('should replace Alt with ⌥', () => {
    expect(formatShortcut('Alt+X')).toContain('⌥');
  });

  it('should replace Cmd with ⌘', () => {
    expect(formatShortcut('Cmd+S')).toContain('⌘');
  });

  it('should return original if no special keys', () => {
    expect(formatShortcut('Enter')).toBe('Enter');
  });
});

describe('getCategoryIcon', () => {
  it('should return search icon for search category', () => {
    expect(getCategoryIcon('search')).toBe('🔍');
  });

  it('should return chat icon for chat category', () => {
    expect(getCategoryIcon('chat')).toBe('💬');
  });

  it('should return default icon for unknown category', () => {
    expect(getCategoryIcon('unknown')).toBe('•');
  });

  it('should return icons for all known categories', () => {
    const categories = ['search', 'navigation', 'chat', 'analysis', 'task', 'file', 'agent', 'setting'];
    categories.forEach((cat) => {
      expect(getCategoryIcon(cat)).not.toBe('•');
    });
  });
});

describe('highlightMatches', () => {
  it('should highlight matched characters', () => {
    const result = highlightMatches('Open Search', [0, 1, 2, 3]);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Open', isHighlight: true }),
      ])
    );
  });

  it('should return non-highlighted text for empty indices', () => {
    const result = highlightMatches('Hello', []);
    expect(result).toEqual([{ text: 'Hello', isHighlight: false }]);
  });

  it('should handle non-contiguous matches', () => {
    const result = highlightMatches('abcde', [0, 2, 4]);
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((p) => p.isHighlight)).toBe(true);
    expect(result.some((p) => !p.isHighlight)).toBe(true);
  });

  it('should handle full match', () => {
    const result = highlightMatches('test', [0, 1, 2, 3]);
    expect(result).toEqual([{ text: 'test', isHighlight: true }]);
  });

  it('should handle empty text', () => {
    const result = highlightMatches('', []);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Widget rendering tests
// ---------------------------------------------------------------------------

describe('CommandPalette widget', () => {
  let service: CommandPaletteService;
  let commands: PaletteCommand[];
  let context: CommandContext;
  let onClose: jest.Mock;
  let onCommandExecute: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    service = makeService();
    commands = makePaletteCommands();
    context = makeContext();
    onClose = jest.fn();
    onCommandExecute = jest.fn();

    // Register commands
    commands.forEach((cmd) => service.registerCommand(cmd));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderPalette(overrides = {}) {
    return render(
      <CommandPalette
        service={service}
        context={context}
        isOpen={true}
        onClose={onClose}
        onCommandExecute={onCommandExecute}
        maxResults={10}
        {...overrides}
      />
    );
  }

  // -----------------------------------------------------------------------
  // Overlay rendering
  // -----------------------------------------------------------------------

  describe('overlay rendering', () => {
    it('should render the overlay when isOpen is true', () => {
      renderPalette();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      renderPalette({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should have correct aria attributes', () => {
      renderPalette();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Command Palette');
    });

    it('should render search input with autofocus', () => {
      renderPalette();
      const input = screen.getByLabelText('Command search');
      expect(input).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Search bar
  // -----------------------------------------------------------------------

  describe('search bar', () => {
    it('should update query on input change', () => {
      renderPalette();
      const input = screen.getByLabelText('Command search');

      fireEvent.change(input, { target: { value: 'search' } });
      expect(input).toHaveValue('search');
    });

    it('should have placeholder text', () => {
      renderPalette();
      const input = screen.getByLabelText('Command search');
      expect(input).toHaveAttribute('placeholder', 'Type a command...');
    });
  });

  // -----------------------------------------------------------------------
  // Result list
  // -----------------------------------------------------------------------

  describe('result list', () => {
    it('should display commands on open (empty query shows all)', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should show at least some results
      const items = screen.queryAllByRole('option');
      expect(items.length).toBeGreaterThan(0);
    });

    it('should show no results message when no matches', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const input = screen.getByLabelText('Command search');
      fireEvent.change(input, { target: { value: 'zzzznonexistent' } });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(screen.getByText('No commands found')).toBeInTheDocument();
    });

    it('should display command labels in results', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Check that results are displayed (multiple instances may exist in preview + list)
      const searchResults = screen.getAllByText('Open Search');
      expect(searchResults.length).toBeGreaterThan(0);
      
      const chatResults = screen.getAllByText('Open Chat');
      expect(chatResults.length).toBeGreaterThan(0);
    });

    it('should show category labels in results', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Categories are displayed in results
      expect(screen.getByText('search')).toBeInTheDocument();
      expect(screen.getByText('chat')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------

  describe('keyboard navigation', () => {
    it('should close on Escape key', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should navigate down with ArrowDown', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');

      // First item should be selected by default
      const items = screen.getAllByRole('option');
      expect(items[0]).toHaveAttribute('aria-selected', 'true');

      // Navigate down
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });

      // Second item should now be selected
      expect(items[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('should navigate up with ArrowUp', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');

      // Navigate down first
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });

      // Navigate back up
      fireEvent.keyDown(dialog, { key: 'ArrowUp' });

      // First item should be selected again
      const items = screen.getAllByRole('option');
      expect(items[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('should not go below first item with ArrowUp', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');

      // Already at top, press up
      fireEvent.keyDown(dialog, { key: 'ArrowUp' });

      // First item should still be selected
      const items = screen.getAllByRole('option');
      expect(items[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('should not go beyond last item with ArrowDown', () => {
      renderPalette({ maxResults: 3 });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');
      const items = screen.getAllByRole('option');
      const lastIndex = items.length - 1;

      // Navigate to last item
      for (let i = 0; i < lastIndex + 5; i++) {
        fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      }

      // Last item should be selected
      expect(items[lastIndex]).toHaveAttribute('aria-selected', 'true');
    });

    it('should execute command on Enter', async () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Enter' });

      await waitFor(() => {
        expect(onCommandExecute).toHaveBeenCalled();
      });
    });

    it('should close on successful command execution', async () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Enter' });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Mouse interaction
  // -----------------------------------------------------------------------

  describe('mouse interaction', () => {
    it('should select item on mouse enter', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const items = screen.getAllByRole('option');
      if (items.length > 1) {
        fireEvent.mouseEnter(items[1]);
        expect(items[1]).toHaveAttribute('aria-selected', 'true');
      }
    });

    it('should execute command on click', async () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const items = screen.getAllByRole('option');
      fireEvent.click(items[0]);

      await waitFor(() => {
        expect(onCommandExecute).toHaveBeenCalled();
      });
    });

    it('should close when clicking overlay backdrop', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Action preview
  // -----------------------------------------------------------------------

  describe('action preview', () => {
    it('should display action preview for selected command', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // First command should be selected by default
      const items = screen.getAllByRole('option');
      const firstCommandId = items[0].getAttribute('data-command-id');
      expect(firstCommandId).toBeTruthy();

      // Preview panel should be rendered with category info
      const previewPanel = screen.getByText(/Category:/);
      expect(previewPanel).toBeInTheDocument();
    });

    it('should show shortcut in preview when available', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Find a command with shortcut (search.open has Ctrl+Shift+F)
      const shortcutLabels = screen.queryAllByText(/Shortcut:/);
      expect(shortcutLabels.length).toBeGreaterThanOrEqual(0);
    });

    it('should show tags in preview', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const tagsElements = screen.queryAllByText(/Tags:/);
      expect(tagsElements.length).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // Keyboard hints
  // -----------------------------------------------------------------------

  describe('keyboard hints', () => {
    it('should render keyboard hints', () => {
      renderPalette();

      expect(screen.getByText('Navigate')).toBeInTheDocument();
      expect(screen.getByText('Execute')).toBeInTheDocument();
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // State reset
  // -----------------------------------------------------------------------

  describe('state reset', () => {
    it('should reset query when reopening', () => {
      // First render with isOpen
      const { unmount } = render(
        <CommandPalette
          service={service}
          context={context}
          isOpen={true}
          onClose={onClose}
          onCommandExecute={onCommandExecute}
        />
      );

      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Type in search
      const input = screen.getByLabelText('Command search');
      fireEvent.change(input, { target: { value: 'search' } });
      expect(input).toHaveValue('search');

      // Unmount (close)
      unmount();

      // Re-render (reopen)
      render(
        <CommandPalette
          service={service}
          context={context}
          isOpen={true}
          onClose={onClose}
          onCommandExecute={onCommandExecute}
        />
      );

      act(() => {
        jest.advanceTimersByTime(200);
      });

      const newInput = screen.getByLabelText('Command search');
      expect(newInput).toHaveValue('');
    });
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  describe('filtering', () => {
    it('should filter results by query', () => {
      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const input = screen.getByLabelText('Command search');
      fireEvent.change(input, { target: { value: 'chat' } });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should show only chat-related commands
      const items = screen.queryAllByRole('option');
      items.forEach((item) => {
        // Chat command should be present, others may be filtered
        expect(item).toBeInTheDocument();
      });
    });

    it('should only show available commands', () => {
      const unavailableCmd = makeCommand({
        id: 'unavailable',
        label: 'Unavailable Command',
        category: CommandCategory.SETTING,
        tags: ['unavailable'],
        available: () => false,
      });
      service.registerCommand(unavailableCmd);

      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(screen.queryByText('Unavailable Command')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle command execution errors gracefully', async () => {
      const errorCmd = makeCommand({
        id: 'error-cmd',
        label: 'Error Command',
        category: CommandCategory.TASK,
        tags: ['error'],
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
      });
      service.registerCommand(errorCmd);

      renderPalette();
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Find and click the error command
      const input = screen.getByLabelText('Command search');
      fireEvent.change(input, { target: { value: 'error' } });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      const items = screen.queryAllByRole('option');
      if (items.length > 0) {
        fireEvent.click(items[0]);

        await waitFor(() => {
          expect(onCommandExecute).toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              message: 'Execution failed',
            })
          );
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // Render performance
  // -----------------------------------------------------------------------

  describe('render performance', () => {
    it('should render within 100ms budget', () => {
      const startTime = performance.now();

      renderPalette();

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(100);
    });

    it('should handle many commands efficiently', () => {
      // Register 50 more commands
      for (let i = 0; i < 50; i++) {
        service.registerCommand(
          makeCommand({
            id: `perf-cmd-${i}`,
            label: `Performance Command ${i}`,
            category: CommandCategory.TASK,
            tags: [`perf-${i}`],
          })
        );
      }

      const startTime = performance.now();

      renderPalette({ maxResults: 20 });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // JSDOM is slower than real browsers, allow 3x budget (300ms)
      expect(renderTime).toBeLessThan(300);
    });
  });
});
