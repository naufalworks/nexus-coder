import * as fs from 'fs';
import { SCGNode, CompressionLevel, SemanticCodeGraphData, CompressedContext } from '../../../types';
import { ASTCompressor } from './ast-compress';
import { NeighborhoodResult } from '../graph/types';
import logger from '../../logger';

const MAX_FILE_CACHE_SIZE = 100;

export class CompressionEngine {
  private astCompressor: ASTCompressor;
  private fileCache: Map<string, string>;

  constructor() {
    this.astCompressor = new ASTCompressor();
    this.fileCache = new Map();
  }

  compressGraphNeighborhood(neighborhood: NeighborhoodResult): CompressedContext {
    const sections: string[] = ['<context>'];
    let totalTokens = 0;
    let rawTokenEstimate = 0;

    const nodesByDistance = new Map<number, SCGNode[]>();
    for (const entry of neighborhood.expandedNodes) {
      const existing = nodesByDistance.get(entry.distance) || [];
      existing.push(entry.node);
      nodesByDistance.set(entry.distance, existing);
      rawTokenEstimate += Math.max(entry.node.signature.length, 200);
    }

    const distances = Array.from(nodesByDistance.keys()).sort((a, b) => a - b);

    for (const distance of distances) {
      const nodes = nodesByDistance.get(distance) ?? [];
      let compressionLevel: CompressionLevel;
      if (distance === 0) compressionLevel = CompressionLevel.FULL;
      else if (distance === 1) compressionLevel = CompressionLevel.SUMMARY;
      else compressionLevel = CompressionLevel.SIGNATURE;

      const label = distance === 0 ? 'primary' :
                    distance === 1 ? 'dependencies' :
                    distance === 2 ? 'related' : 'awareness';

      sections.push(`  <${label} distance="${distance}">`);

      for (const node of nodes) {
        const needsSource = compressionLevel >= CompressionLevel.PARTIAL;
        const sourceContent = needsSource ? this.readFile(node.file) : undefined;

        const compressed = this.astCompressor.compress(node, compressionLevel, sourceContent);
        const tokens = this.astCompressor.estimateTokens(compressed);
        totalTokens += tokens;

        const fileAttr = ` file="${node.file}:${node.line}"`;
        const scoreAttr = neighborhood.expandedNodes.find(e => e.node.id === node.id);
        const relevanceAttr = scoreAttr ? ` relevance="${scoreAttr.score.toFixed(2)}"` : '';

        sections.push(`    <symbol${fileAttr}${relevanceAttr}>`);
        sections.push(`      ${compressed}`);
        sections.push(`    </symbol>`);
      }

      sections.push(`  </${label}>`);
    }

    sections.push('</context>');

    const content = sections.join('\n');
    const compressionRatio = rawTokenEstimate > 0 ? totalTokens / rawTokenEstimate : 1;

    return {
      content,
      nodes: neighborhood.expandedNodes.map(e => e.node),
      totalTokens,
      budgetUsed: totalTokens,
      compressionRatio,
    };
  }

  compressSingle(node: SCGNode, level: CompressionLevel): string {
    const sourceContent = level === CompressionLevel.FULL || level === CompressionLevel.PARTIAL
      ? this.readFile(node.file)
      : undefined;

    return this.astCompressor.compress(node, level, sourceContent);
  }

  formatXmlContext(items: Array<{ node: SCGNode; compressed: string; relevance: number }>): string {
    const parts: string[] = ['<context>'];

    for (const item of items) {
      parts.push(`  <symbol file="${item.node.file}:${item.node.line}" relevance="${item.relevance.toFixed(2)}">`);
      parts.push(`    ${item.compressed}`);
      parts.push('  </symbol>');
    }

    parts.push('</context>');
    return parts.join('\n');
  }

  clearFileCache(): void {
    this.fileCache.clear();
  }

  private readFile(filePath: string): string | undefined {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.fileCache.set(filePath, content);

      if (this.fileCache.size > MAX_FILE_CACHE_SIZE) {
        const firstKey = this.fileCache.keys().next().value;
        if (firstKey !== undefined) {
          this.fileCache.delete(firstKey);
        }
      }

      return content;
    } catch {
      logger.debug(`[Compressor] Cannot read file: ${filePath}`);
      return undefined;
    }
  }
}
