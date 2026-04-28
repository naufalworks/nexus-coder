/**
 * Dead Code Detector Types
 *
 * Type definitions for the dead code detection audit module.
 *
 * @module audit/dead-code/types
 */

import type { AuditViolation, AuditReport } from '../framework/types';

/**
 * Kind of dead symbol identified by the detector.
 */
export type DeadSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'props';

/**
 * Extended violation interface for dead code issues.
 */
export interface DeadCodeViolation extends AuditViolation {
  category: 'dead-code';
  /** Kind of dead symbol */
  symbolKind: DeadSymbolKind;
  /** Estimated bytes saved by removal */
  estimatedBytesSaved: number;
}

/**
 * Information about an unused export.
 */
export interface UnusedExport {
  /** Symbol name */
  name: string;
  /** File containing the export */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Kind of export */
  kind: DeadSymbolKind;
  /** Whether it's exported from index.ts */
  isBarrelExport: boolean;
  /** Estimated bytes saved */
  estimatedBytes: number;
}

/**
 * Information about unused React component props.
 */
export interface UnusedProps {
  /** Props interface name */
  interfaceName: string | null;
  /** Component name */
  componentName: string;
  /** Names of unused prop fields */
  unusedProps: string[];
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Whether the component has any usage sites */
  hasUsageSites: boolean;
}

/**
 * Extended audit report for dead code detection.
 */
export interface DeadCodeReport extends AuditReport {
  category: 'dead-code';
  /** All unused exports found */
  unusedExports?: UnusedExport[];
  /** All unused props found */
  unusedProps?: UnusedProps[];
  /** Total estimated bytes saved */
  totalEstimatedBytesSaved?: number;
  /** Formatted bundle reduction estimate */
  estimatedBundleReduction: string;
}
