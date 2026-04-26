import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import * as fs from 'fs';
import * as path from 'path';
import { SCGNode, SCGEdge, NodeType, EdgeType, SemanticCodeGraphData } from '../../../types';
import { UnifiedClient } from '../../models/unified-client';
import { config } from '../../config';
import logger from '../../logger';

const MAX_DIRECTORY_DEPTH = 15;
const SUMMARY_BATCH_SIZE = 10;
const MAX_SUMMARY_LENGTH = 120;

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next',
  '__pycache__', 'venv', '.venv', 'coverage', '.cache',
  'target', 'bin', 'obj', '.vscode', '.idea',
]);

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  mjs: 'javascript',
  cjs: 'javascript',
};

export class SemanticGraphBuilder {
  private parsers: Map<string, Parser>;
  private client: UnifiedClient;
  private nodeIndex: number;

  constructor(client: UnifiedClient) {
    this.client = client;
    this.parsers = new Map();
    this.nodeIndex = 0;
    this.initializeParsers();
  }

  private initializeParsers(): void {
    try {
      const tsParser = new Parser();
      tsParser.setLanguage(TypeScript.typescript);
      this.parsers.set('typescript', tsParser);

      const jsParser = new Parser();
      jsParser.setLanguage(JavaScript);
      this.parsers.set('javascript', jsParser);

      const pyParser = new Parser();
      pyParser.setLanguage(Python);
      this.parsers.set('python', pyParser);
    } catch (error) {
      logger.warn('Failed to initialize some tree-sitter parsers:', error);
    }
  }

  async buildGraph(directory: string): Promise<SemanticCodeGraphData> {
    const nodes = new Map<string, SCGNode>();
    const edges: SCGEdge[] = [];
    const dependencies = new Map<string, string[]>();
    this.nodeIndex = 0;

    const files = this.collectFiles(directory);
    logger.info(`[SCG] Analyzing ${files.length} files...`);

    for (const filePath of files) {
      try {
        const ext = path.extname(filePath).substring(1);
        const language = LANGUAGE_MAP[ext];
        if (!language || !this.parsers.has(language)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const parser = this.parsers.get(language)!;
        const tree = parser.parse(content);

        if (!tree) continue;

        const fileNodes = this.extractNodes(tree.rootNode, filePath);
        const fileEdges = this.extractEdges(tree.rootNode, filePath, fileNodes);

        for (const node of fileNodes) {
          nodes.set(node.id, node);
        }
        edges.push(...fileEdges);

        const imports = this.extractImports(tree.rootNode);
        dependencies.set(filePath, imports);
      } catch (error) {
        logger.debug(`[SCG] Failed to analyze ${filePath}: ${error}`);
      }
    }

    const graph: SemanticCodeGraphData = {
      nodes,
      edges,
      dependencies,
      builtAt: new Date(),
      fileCount: files.length,
      symbolCount: nodes.size,
    };

    logger.info(`[SCG] Built graph: ${nodes.size} nodes, ${edges.length} edges from ${files.length} files`);
    return graph;
  }

  async generateSummaries(graph: SemanticCodeGraphData): Promise<void> {
    const batchSize = SUMMARY_BATCH_SIZE;
    const nodesWithoutSummary = Array.from(graph.nodes.values())
      .filter(n => !n.summary && (n.type === NodeType.FUNCTION || n.type === NodeType.CLASS));

    for (let i = 0; i < nodesWithoutSummary.length; i += batchSize) {
      const batch = nodesWithoutSummary.slice(i, i + batchSize);

      const descriptions = batch.map(node =>
        `File: ${node.file} | ${node.type}: ${node.name}\n${node.signature}`
      ).join('\n\n---\n\n');

      try {
        const result = await this.client.chat(
          config.models.fast,
          [
            {
              role: 'system',
              content: 'For each code symbol, provide a one-line summary (max 80 chars). Format: SYMBOL_NAME: summary. One per line.',
            },
            { role: 'user', content: descriptions },
          ],
          { maxTokens: 500, temperature: 0.3 }
        );

        const lines = result.content.split('\n').filter(l => l.includes(':'));
        for (let j = 0; j < batch.length && j < lines.length; j++) {
          const summary = lines[j].substring(lines[j].indexOf(':') + 1).trim();
          if (summary) {
            batch[j].summary = summary.substring(0, MAX_SUMMARY_LENGTH);
          }
        }
      } catch (error) {
        logger.debug(`[SCG] Summary generation failed for batch ${i}: ${error}`);
        for (const node of batch) {
          node.summary = `${node.type} ${node.name}`;
        }
      }
    }
  }

  private collectFiles(directory: string): string[] {
    const files: string[] = [];

    const walk = (dir: string, depth: number) => {
      if (depth > MAX_DIRECTORY_DEPTH) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).substring(1);
          if (LANGUAGE_MAP[ext]) {
            files.push(fullPath);
          }
        }
      }
    };

    walk(directory, 0);
    return files;
  }

  private extractNodes(rootNode: Parser.SyntaxNode, filePath: string): SCGNode[] {
    const nodes: SCGNode[] = [];

    const traverse = (node: Parser.SyntaxNode) => {
      const parsed = this.parseNode(node, filePath);
      if (parsed) {
        nodes.push(parsed);
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(rootNode);
    return nodes;
  }

  private parseNode(node: Parser.SyntaxNode, filePath: string): SCGNode | null {
    let type: NodeType | null = null;
    let nameNode: Parser.SyntaxNode | null = null;

    switch (node.type) {
      case 'function_declaration':
      case 'function_definition':
      case 'method_definition':
      case 'arrow_function':
        type = NodeType.FUNCTION;
        nameNode = node.childForFieldName('name');
        if (!nameNode && node.parent?.type === 'variable_declarator') {
          nameNode = node.parent.childForFieldName('name');
        }
        break;
      case 'class_declaration':
      case 'class_definition':
        type = NodeType.CLASS;
        nameNode = node.childForFieldName('name');
        break;
      case 'interface_declaration':
        type = NodeType.INTERFACE;
        nameNode = node.childForFieldName('name');
        break;
      case 'type_alias_declaration':
        type = NodeType.TYPE;
        nameNode = node.childForFieldName('name');
        break;
      case 'decorated_definition':
        for (const child of node.children) {
          if (child.type === 'function_definition' || child.type === 'class_definition') {
            return this.parseNode(child, filePath);
          }
        }
        return null;
      default:
        return null;
    }

    if (!nameNode) return null;

    const name = nameNode.text;
    const params = node.childForFieldName('parameters');
    const signature = params
      ? `${name}${params.text}`
      : name;

    const scgNode: SCGNode = {
      id: this.generateNodeId(filePath, name, node.startPosition.row),
      type,
      name,
      file: filePath,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      signature,
      summary: '',
      complexity: this.estimateComplexity(node),
      changeFrequency: 0,
    };

    return scgNode;
  }

  private extractEdges(rootNode: Parser.SyntaxNode, filePath: string, fileNodes: SCGNode[]): SCGEdge[] {
    const edges: SCGEdge[] = [];

    for (const node of fileNodes) {
      const parentMap = this.findRelationships(rootNode, node, filePath);
      for (const [targetName, edgeType] of parentMap) {
        edges.push({
          from: node.id,
          to: this.generateNodeId(filePath, targetName, 0),
          type: edgeType,
          weight: 1.0,
        });
      }
    }

    return edges.filter(e => e.from !== e.to);
  }

  private findRelationships(
    rootNode: Parser.SyntaxNode,
    node: SCGNode,
    _filePath: string
  ): Array<[string, EdgeType]> {
    const relationships: Array<[string, EdgeType]> = [];

    const astNode = this.findAstNode(rootNode, node.name, node.line - 1);
    if (!astNode) return relationships;

    if (node.type === NodeType.CLASS) {
      this.extractClassRelationships(astNode, relationships);
    } else if (node.type === NodeType.FUNCTION) {
      this.extractCallRelationships(astNode, relationships);
    }

    return relationships;
  }

  private findAstNode(root: Parser.SyntaxNode, name: string, line: number): Parser.SyntaxNode | null {
    const stack: Parser.SyntaxNode[] = [root];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (
        (current.type === 'function_declaration' ||
          current.type === 'function_definition' ||
          current.type === 'method_definition' ||
          current.type === 'arrow_function' ||
          current.type === 'class_declaration' ||
          current.type === 'class_definition' ||
          current.type === 'interface_declaration' ||
          current.type === 'type_alias_declaration') &&
        current.startPosition.row === line
      ) {
        const nameNode = current.childForFieldName('name');
        if (nameNode && nameNode.text === name) {
          return current;
        }
      }

      for (const child of current.children) {
        stack.push(child);
      }
    }

    return null;
  }

  private extractClassRelationships(
    classNode: Parser.SyntaxNode,
    relationships: Array<[string, EdgeType]>
  ): void {
    const heritage = classNode.childForFieldName('her_clause') ||
      classNode.children.find(c =>
        c.type === 'class_heritage' || c.type === 'argument_list'
      );

    if (heritage) {
      const walk = (n: Parser.SyntaxNode) => {
        if (n.type === 'identifier' || n.type === 'type_identifier') {
          relationships.push([n.text, EdgeType.EXTENDS]);
        }
        for (const child of n.children) {
          walk(child);
        }
      };
      walk(heritage);
    }

    for (const child of classNode.children) {
      if (
        child.type === 'function_declaration' ||
        child.type === 'method_definition' ||
        child.type === 'function_definition'
      ) {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          relationships.push([nameNode.text, EdgeType.REFERENCES]);
        }
      }
    }
  }

  private extractCallRelationships(
    functionNode: Parser.SyntaxNode,
    relationships: Array<[string, EdgeType]>
  ): void {
    const body = functionNode.childForFieldName('body') || functionNode;
    const seen = new Set<string>();

    const walk = (n: Parser.SyntaxNode) => {
      if (n.type === 'call_expression') {
        const func = n.childForFieldName('function');
        if (func) {
          const calleeName = this.extractCalleeName(func);
          if (calleeName && !seen.has(calleeName)) {
            seen.add(calleeName);
            relationships.push([calleeName, EdgeType.CALLS]);
          }
        }
      }

      for (const child of n.children) {
        walk(child);
      }
    };

    walk(body);
  }

  private extractCalleeName(funcNode: Parser.SyntaxNode): string | null {
    if (funcNode.type === 'identifier') {
      return funcNode.text;
    }

    if (funcNode.type === 'member_expression' || funcNode.type === 'attribute') {
      const property = funcNode.childForFieldName('attribute') ||
        funcNode.children[funcNode.children.length - 1];
      return property?.text ?? null;
    }

    return null;
  }

  private extractImports(rootNode: Parser.SyntaxNode): string[] {
    const imports: string[] = [];

    const traverse = (node: Parser.SyntaxNode) => {
      if (
        node.type === 'import_statement' ||
        node.type === 'import_from_statement' ||
        node.type === 'import_declaration'
      ) {
        const sourceNode = node.childForFieldName('source') ||
          node.children.find(c => c.type === 'string');
        if (sourceNode) {
          let source = sourceNode.text;
          if (source.startsWith('"') || source.startsWith("'")) {
            source = source.slice(1, -1);
          }
          imports.push(source);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(rootNode);
    return imports;
  }

  private estimateComplexity(node: Parser.SyntaxNode): number {
    let branches = 0;

    const countBranches = (n: Parser.SyntaxNode) => {
      if (
        n.type === 'if_statement' ||
        n.type === 'for_statement' ||
        n.type === 'while_statement' ||
        n.type === 'try_statement' ||
        n.type === 'switch_case' ||
        n.type === 'conditional_expression' ||
        n.type === 'elif_clause' ||
        n.type === 'except_clause'
      ) {
        branches++;
      }
      for (const child of n.children) {
        countBranches(child);
      }
    };

    countBranches(node);
    return Math.min(10, 1 + Math.floor(branches / 2));
  }

  private generateNodeId(file: string, name: string, line: number): string {
    return `${file}::${name}::${line}`;
  }
}
