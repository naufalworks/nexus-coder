import { SCGNode, CompressionLevel } from '../../../types';

export class ASTCompressor {
  compressToSignature(node: SCGNode): string {
    const typePrefix = node.type === 'function' ? 'fn' :
                       node.type === 'class' ? 'class' :
                       node.type === 'interface' ? 'iface' :
                       node.type === 'type' ? 'type' : 'symbol';

    return `${typePrefix} ${node.name}${node.signature.includes('(') ? node.signature.substring(node.name.length) : ''}`;
  }

  compressToSummary(node: SCGNode): string {
    const signature = this.compressToSignature(node);
    const summary = node.summary || `${node.type} defined at ${node.file}:${node.line}`;
    return `${signature} — ${summary}`;
  }

  compressToPartial(node: SCGNode, sourceContent: string): string {
    const lines = sourceContent.split('\n');
    const startLine = Math.max(0, node.line - 1);
    const endLine = Math.min(lines.length, node.endLine);

    const signatureLine = lines[startLine]?.trim() || node.signature;

    const keyLines: string[] = [signatureLine];

    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      if (
        line.startsWith('return ') ||
        line.startsWith('throw ') ||
        line.startsWith('if ') ||
        line.startsWith('else') ||
        line.startsWith('for ') ||
        line.startsWith('while ') ||
        line.startsWith('try ') ||
        line.startsWith('catch ') ||
        line.startsWith('await ') ||
        line.startsWith('export ')
      ) {
        keyLines.push(line);
      }
    }

    return keyLines.join('\n');
  }

  compress(node: SCGNode, level: CompressionLevel, sourceContent?: string): string {
    switch (level) {
      case CompressionLevel.SIGNATURE:
        return this.compressToSignature(node);
      case CompressionLevel.SUMMARY:
        return this.compressToSummary(node);
      case CompressionLevel.PARTIAL:
        return sourceContent
          ? this.compressToPartial(node, sourceContent)
          : this.compressToSummary(node);
      case CompressionLevel.FULL:
        return sourceContent || node.signature;
      default:
        return this.compressToSignature(node);
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}
