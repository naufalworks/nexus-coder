import { SCGNode, SCGEdge, CompressionLevel } from '../../../types';

export interface SerializedGraph {
  nodes: Array<{ key: string; value: SCGNode }>;
  edges: SCGEdge[];
  builtAt: string;
  fileCount: number;
  symbolCount: number;
}

export interface GraphSearchResult {
  nodes: SCGNode[];
  edges: SCGEdge[];
  scores: Map<string, number>;
}

export interface TraversalResult {
  visited: Map<string, number>;
  nodes: SCGNode[];
  edges: SCGEdge[];
}

export interface ImpactAnalysisResult {
  seedId: string;
  direct: SCGNode[];
  indirect: SCGNode[];
  tests: SCGNode[];
  allAffected: Set<string>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface NeighborhoodResult {
  seedNodes: SCGNode[];
  expandedNodes: Array<{
    node: SCGNode;
    distance: number;
    compressionLevel: CompressionLevel;
    score: number;
  }>;
  totalEstimatedTokens: number;
}

export const DISTANCE_COMPRESSION_MAP: Record<number, CompressionLevel> = {
  0: CompressionLevel.FULL,
  1: CompressionLevel.SUMMARY,
  2: CompressionLevel.SIGNATURE,
};

export const COMPRESSION_TOKEN_ESTIMATES: Record<CompressionLevel, number> = {
  [CompressionLevel.SIGNATURE]: 20,
  [CompressionLevel.SUMMARY]: 40,
  [CompressionLevel.PARTIAL]: 100,
  [CompressionLevel.FULL]: 500,
};
