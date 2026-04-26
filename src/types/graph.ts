export enum NodeType {
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  TYPE = 'type',
  VARIABLE = 'variable',
  MODULE = 'module',
  ENDPOINT = 'endpoint',
  TEST = 'test',
  MIDDLEWARE = 'middleware',
  MODEL = 'model',
  EXPORT = 'export',
  IMPORT = 'import',
}

export enum EdgeType {
  CALLS = 'calls',
  IMPORTS = 'imports',
  EXTENDS = 'extends',
  IMPLEMENTS = 'implements',
  DEPENDS_ON = 'depends_on',
  TESTS = 'tests',
  USES = 'uses',
  ROUTES_TO = 'routes_to',
  REFERENCES = 'references',
  EXPORTS = 'exports',
}

export enum CompressionLevel {
  SIGNATURE = 0,
  SUMMARY = 1,
  PARTIAL = 2,
  FULL = 3,
}

export interface SCGNode {
  id: string;
  type: NodeType;
  name: string;
  file: string;
  line: number;
  endLine: number;
  signature: string;
  summary: string;
  complexity: number;
  changeFrequency: number;
}

export interface SCGEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface SemanticCodeGraphData {
  nodes: Map<string, SCGNode>;
  edges: SCGEdge[];
  dependencies: Map<string, string[]>;
  builtAt: Date;
  fileCount: number;
  symbolCount: number;
}

export interface CompressedContext {
  content: string;
  nodes: SCGNode[];
  totalTokens: number;
  budgetUsed: number;
  compressionRatio: number;
}

export interface ContextEntry {
  id: string;
  content: string;
  embedding?: number[];
  relevance: number;
  metadata: {
    file?: string;
    line?: number;
    type: 'code' | 'documentation' | 'conversation' | 'memory' | 'decision' | 'pattern';
    timestamp: Date;
    source: string;
  };
}

export interface TokenBudget {
  total: number;
  systemPrompt: number;
  conversationHistory: number;
  codeContext: number;
  vectorMemory: number;
  repoMap: number;
  reserve: number;
}
