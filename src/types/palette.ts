/** Command categories */
export enum CommandCategory {
  SEARCH = 'search',
  NAVIGATION = 'navigation',
  CHAT = 'chat',
  ANALYSIS = 'analysis',
  TASK = 'task',
  FILE = 'file',
  AGENT = 'agent',
  SETTING = 'setting',
}

/** Context available to commands */
export interface CommandContext {
  activeFile?: string;
  activeNodeId?: string;
  activeTaskId?: string;
  selectedAgent?: string;
  graphAvailable: boolean;
  vectorStoreAvailable: boolean;
  recentCommands: string[];
}

/** A command registered in the palette */
export interface PaletteCommand {
  /** Unique command ID */
  id: string;
  /** Display label */
  label: string;
  /** Category for grouping */
  category: CommandCategory;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Command handler */
  execute: (context: CommandContext) => void | Promise<void>;
  /** Whether the command is currently available */
  available: (context: CommandContext) => boolean;
  /** Icon or emoji */
  icon?: string;
  /** Tags for fuzzy matching */
  tags: string[];
}

/** A scored match from the palette search */
export interface PaletteMatch {
  command: PaletteCommand;
  score: number;
  highlights: number[];
}

/** Palette widget state */
export interface PaletteState {
  isOpen: boolean;
  query: string;
  matches: PaletteMatch[];
  selectedIndex: number;
  recentCommands: string[];
  isLoading: boolean;
  error: string | null;
}

/** Command execution result */
export interface CommandResult {
  commandId: string;
  success: boolean;
  message?: string;
  sideEffect?: 'open-widget' | 'navigate' | 'search' | 'chat';
  sideEffectData?: unknown;
}
