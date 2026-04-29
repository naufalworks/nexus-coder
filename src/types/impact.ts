import { SCGNode, EdgeType } from './graph';
import { CodeChange, ChangeType } from './task';

/** Impact severity levels */
export enum ImpactSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

/** A single edge in the impact path */
export interface ImpactEdge {
  from: string;
  to: string;
  edgeType: EdgeType;
}

/** A single impacted node with severity */
export interface ImpactNode {
  /** The graph node that is impacted */
  node: SCGNode;
  /** How this node is impacted (edge type from seed) */
  impactPath: ImpactEdge[];
  /** Distance from the seed change */
  distance: number;
  /** Severity level */
  severity: ImpactSeverity;
  /** Why this node is affected (human-readable) */
  reason: string;
}

/** Risk assessment summary */
export interface RiskAssessment {
  overall: ImpactSeverity;
  score: number;
  directImpactCount: number;
  transitiveImpactCount: number;
  affectedTestCount: number;
  affectedFileCount: number;
  reasoning: string;
}

/** Affected file with aggregated severity */
export interface AffectedFile {
  file: string;
  impactedNodes: ImpactNode[];
  highestSeverity: ImpactSeverity;
  changeTypes: ChangeType[];
}

/** Impact analysis statistics */
export interface ImpactStats {
  nodesTraversed: number;
  edgesFollowed: number;
  maxDepthReached: number;
  analysisTimeMs: number;
}

/** Impact analysis for a proposed change */
export interface ImpactAnalysis {
  /** The seed change being analyzed */
  seedChange: CodeChange;
  /** Seed node in the graph */
  seedNodeId: string;
  /** Directly impacted nodes (distance = 1) */
  directImpacts: ImpactNode[];
  /** Transitively impacted nodes (distance > 1) */
  transitiveImpacts: ImpactNode[];
  /** Test files/nodes that may need updates */
  affectedTests: ImpactNode[];
  /** Overall risk assessment */
  riskAssessment: RiskAssessment;
  /** Files affected, grouped by severity */
  affectedFiles: AffectedFile[];
  /** Analysis timestamp */
  analyzedAt: Date;
  /** Graph traversal statistics */
  stats: ImpactStats;
}

/** Impact widget state */
export interface ImpactState {
  analysis: ImpactAnalysis | null;
  isAnalyzing: boolean;
  expandedNodes: Set<string>;
  selectedImpact: ImpactNode | null;
  viewMode: 'tree' | 'butterfly' | 'list';
  error: string | null;
}
