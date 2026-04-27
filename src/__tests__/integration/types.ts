/**
 * Integration test types specific to cross-widget testing.
 */

import { TaskStatus } from '../../types';

/**
 * A user action that can affect multiple widgets.
 */
export type CrossWidgetAction =
  | { type: 'APPROVE_CHANGE'; changeId: string; taskId: string }
  | { type: 'REJECT_CHANGE'; changeId: string; taskId: string }
  | { type: 'SELECT_TASK'; taskId: string }
  | { type: 'AGENT_STATUS_CHANGE'; agentName: string; status: TaskStatus }
  | { type: 'RESOURCE_UPDATE'; promptTokens: number; completionTokens: number };

/**
 * Expected state after a cross-widget action.
 */
export interface ExpectedWidgetState {
  taskPanel?: {
    selectedTaskId?: string;
    displayedTaskCount?: number;
    agentAssignments?: string[];
  };
  diffApproval?: {
    displayedChangeCount?: number;
    approvedChanges?: string[];
    rejectedChanges?: string[];
  };
  reasoningLog?: {
    entryCount?: number;
    lastAgent?: string;
  };
  agentStatus?: {
    agentStatuses?: Record<string, TaskStatus>;
  };
  resourceFooter?: {
    tokenUsage?: { prompt: number; completion: number; total: number };
  };
  graphExplorer?: {
    displayedNodeCount?: number;
    activeTaskId?: string;
  };
}

/**
 * Cross-widget test assertion helper.
 */
export interface CrossWidgetAssertion {
  description: string;
  verify: (container: HTMLElement, expected: ExpectedWidgetState) => void;
}
