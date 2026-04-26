import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import { RepoMap, FileAnalysis, SymbolInfo } from '../types';
import logger from './logger';
import * as fs from 'fs';
import * as path from 'path';

export class RepoMapGenerator {
  private parsers: Map<string, Parser>;

  constructor() {
    this.parsers = new Map();
    this.initializeParsers();
  }

  private initializeParsers(): void {
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript);
    this.parsers.set('typescript', tsParser);
    this.parsers.set('tsx', tsParser);

    const jsParser = new Parser();
    jsParser.setLanguage(JavaScript);
    this.parsers.set('javascript', jsParser);
    this.parsers.set('js', jsParser);

    const pyParser = new Parser();
    pyParser.setLanguage(Python);
    this.parsers.set('python', pyParser);
    this.parsers.set('py', pyParser);
  }

  async generate(directory: string): Promise<RepoMap> {
    const repoMap: RepoMap = {
      files: new Map(),
      symbols: new Map(),
      dependencies: new Map(),
    };

    await this.walkDirectory(directory, repoMap);

    logger.info(
      `Generated repo map: ${repoMap.files.size} files, ${repoMap.symbols.size} symbols`
    );

    return repoMap;
  }

  private async walkDirectory(
    dir: string,
    repoMap: RepoMap,
    depth: number = 0
  ): Promise<void> {
    if (depth > 10) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!this.shouldIgnore(entry.name)) {
          await this.walkDirectory(fullPath, repoMap, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).substring(1);
        if (this.parsers.has(ext)) {
          await this.analyzeFile(fullPath, ext, repoMap);
        }
      }
    }
  }

  private async analyzeFile(
    filePath: string,
    language: string,
    repoMap: RepoMap
  ): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parser = this.parsers.get(language);

      if (!parser) return;

      const tree = parser.parse(content);
      const symbols = this.extractSymbols(tree.rootNode, filePath);
      const imports = this.extractImports(tree.rootNode);
      const exports = this.extractExports(tree.rootNode);

      const analysis: FileAnalysis = {
        path: filePath,
        language,
        symbols,
        imports,
        exports,
      };

      repoMap.files.set(filePath, analysis);

      for (const symbol of symbols) {
        repoMap.symbols.set(symbol.name, symbol);
      }

      repoMap.dependencies.set(filePath, imports);
    } catch (error) {
      logger.debug(`Failed to analyze ${filePath}: ${error}`);
    }
  }

  private extractSymbols(node: Parser.SyntaxNode, file: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const traverse = (currentNode: Parser.SyntaxNode) => {
      if (
        currentNode.type === 'function_declaration' ||
        currentNode.type === 'function_definition' ||
        currentNode.type === 'method_definition'
      ) {
        const nameNode = currentNode.childForFieldName('name');
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            type: 'function',
            file: file,
            line: currentNode.startPosition.row + 1,
            signature: this.extractSignature(currentNode),
          });
        }
      }

      if (
        currentNode.type === 'class_declaration' ||
        currentNode.type === 'class_definition'
      ) {
        const nameNode = currentNode.childForFieldName('name');
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            type: 'class',
            file: file,
            line: currentNode.startPosition.row + 1,
          });
        }
      }

      if (
        currentNode.type === 'interface_declaration' ||
        currentNode.type === 'type_alias_declaration'
      ) {
        const nameNode = currentNode.childForFieldName('name');
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            type: 'interface',
            file: file,
            line: currentNode.startPosition.row + 1,
          });
        }
      }

      for (const child of currentNode.children) {
        traverse(child);
      }
    };

    traverse(node);
    return symbols;
  }

  private extractImports(node: Parser.SyntaxNode): string[] {
    const imports: string[] = [];

    const traverse = (currentNode: Parser.SyntaxNode) => {
      if (
        currentNode.type === 'import_statement' ||
        currentNode.type === 'import_from_statement'
      ) {
        imports.push(currentNode.text);
      }

      for (const child of currentNode.children) {
        traverse(child);
      }
    };

    traverse(node);
    return imports;
  }

  private extractExports(node: Parser.SyntaxNode): string[] {
    const exports: string[] = [];

    const traverse = (currentNode: Parser.SyntaxNode) => {
      if (currentNode.type === 'export_statement') {
        exports.push(currentNode.text);
      }

      for (const child of currentNode.children) {
        traverse(child);
      }
    };

    traverse(node);
    return exports;
  }

  private extractSignature(node: Parser.SyntaxNode): string {
    const params = node.childForFieldName('parameters');
    return params ? params.text : '()';
  }

  private shouldIgnore(name: string): boolean {
    const ignorePatterns = [
      'node_modules',
      'dist',
      'build',
      '.git',
      '.next',
      '__pycache__',
      'venv',
      '.venv',
    ];

    return ignorePatterns.includes(name) || name.startsWith('.');
  }

  async getRelevantSymbols(
    repoMap: RepoMap,
    query: string,
    limit: number = 20
  ): Promise<SymbolInfo[]> {
    const queryLower = query.toLowerCase();
    const symbols = Array.from(repoMap.symbols.values());

    const scored = symbols.map((symbol) => {
      let score = 0;
      if (symbol.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }
      if (symbol.documentation?.toLowerCase().includes(queryLower)) {
        score += 5;
      }
      return { symbol, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.symbol);
  }
}

export const repoMapGenerator = new RepoMapGenerator();
