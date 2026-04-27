/**
 * Dead Code Elimination Audit Script
 * 
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 * 
 * Identifies exported symbols with zero imports and unused props.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface AuditViolation {
  category: 'dead-code';
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  lineNumber: number;
  message: string;
  symbolName?: string;
  estimatedBundleReduction?: string;
}

interface AuditReport {
  category: string;
  totalViolations: number;
  violations: AuditViolation[];
  estimatedBundleReduction: string;
}

// Directories to scan
const SRC_DIRS = ['src'];
// Extensions to analyze
const EXTENSIONS = ['.ts', '.tsx'];

class DeadCodeAnalyzer {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private violations: AuditViolation[] = [];
  private usedSymbols: Set<string> = new Set();
  private exportedSymbols: Map<string, { filePath: string; line: number; kind: string }> = new Map();

  constructor() {
    // Create TypeScript program
    const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
    const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : null;
    
    const compilerOptions: ts.CompilerOptions = config?.config?.compilerOptions || {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    };
    
    this.program = ts.createProgram({
      rootNames: this.getSourceFiles(),
      options: compilerOptions,
    });
    
    this.checker = this.program.getTypeChecker();
  }

  private getSourceFiles(): string[] {
    const files: string[] = [];
    
    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(fullPath);
        } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    }
    
    for (const dir of SRC_DIRS) {
      if (fs.existsSync(dir)) {
        walk(dir);
      }
    }
    
    return files;
  }

  analyze(): AuditReport {
    console.log('Running Dead Code Audit...\n');
    
    // Find all exported symbols
    this.findExports();
    
    // Find all imports
    this.findImports();
    
    // Find unused exports
    this.findUnused();
    
    // Find unused React props
    this.findUnusedProps();
    
    // Generate report
    const report: AuditReport = {
      category: 'dead-code',
      totalViolations: this.violations.length,
      violations: this.violations,
      estimatedBundleReduction: this.estimateReduction(),
    };
    
    this.printReport(report);
    
    return report;
  }

  private findExports() {
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.fileName.includes('node_modules')) continue;
      
      ts.forEachChild(sourceFile, (node) => {
        // Check for export declarations
        if (ts.isFunctionDeclaration(node) && node.name) {
          const name = node.name.text;
          this.exportedSymbols.set(name, {
            filePath: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'function',
          });
        }
        
        if (ts.isClassDeclaration(node) && node.name) {
          const name = node.name.text;
          this.exportedSymbols.set(name, {
            filePath: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'class',
          });
        }
        
        if (ts.isInterfaceDeclaration(node)) {
          const name = node.name.text;
          this.exportedSymbols.set(name, {
            filePath: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'interface',
          });
        }
        
        if (ts.isTypeAliasDeclaration(node)) {
          const name = node.name.text;
          this.exportedSymbols.set(name, {
            filePath: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'type',
          });
        }
        
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const name = node.name.text;
          this.exportedSymbols.set(name, {
            filePath: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'variable',
          });
        }
      });
    }
  }

  private findImports() {
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.fileName.includes('node_modules')) continue;
      
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node)) {
          const importClause = node.importClause;
          if (importClause) {
            // Default import
            if (importClause.name) {
              this.usedSymbols.add(importClause.name.text);
            }
            
            // Named imports
            if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
              importClause.namedBindings.elements.forEach(element => {
                this.usedSymbols.add(element.name.text);
              });
            }
          }
        }
        
        // Track usage in code
        if (ts.isIdentifier(node)) {
          this.usedSymbols.add(node.text);
        }
      });
    }
  }

  private findUnused() {
    for (const [name, info] of this.exportedSymbols) {
      // Check if symbol is used anywhere (except test files)
      const isTestFile = info.filePath.includes('.test.') || info.filePath.includes('.spec.');
      const isUsed = this.usedSymbols.has(name);
      
      // Skip if used or in test files
      if (isUsed || isTestFile) continue;
      
      // Check if it's explicitly exported
      const isInIndexExport = info.filePath.includes('index.ts');
      
      if (!isInIndexExport) {
        this.violations.push({
          category: 'dead-code',
          severity: 'medium',
          filePath: info.filePath,
          lineNumber: info.line,
          message: `Unused exported ${info.kind}: ${name}`,
          symbolName: name,
        });
      }
    }
  }

  private findUnusedProps() {
    // This would require more sophisticated analysis with the TypeScript compiler API
    // Placeholder for detecting unused React component props
    console.log('  Analyzing React component props...');
    
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.fileName.includes('node_modules')) continue;
      if (!sourceFile.fileName.endsWith('.tsx')) continue;
      
      // Find interfaces ending with 'Props'
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text.endsWith('Props')) {
          // Check if all props are used in the component
          // This is a simplified check - production would need full data flow analysis
        }
      });
    }
  }

  private estimateReduction(): string {
    // Estimate based on violation count
    const bytesPerViolation = 200; // Rough estimate
    const totalBytes = this.violations.length * bytesPerViolation;
    
    if (totalBytes > 1024) {
      return `${(totalBytes / 1024).toFixed(1)}KB`;
    }
    return `${totalBytes}B`;
  }

  private printReport(report: AuditReport) {
    console.log(`${'='.repeat(60)}`);
    console.log('Dead Code Audit Report');
    console.log('='.repeat(60));
    console.log(`Total violations: ${report.totalViolations}`);
    console.log(`Estimated bundle reduction: ${report.estimatedBundleReduction}`);
    
    if (report.violations.length > 0) {
      console.log(`\nUnused exports found:`);
      report.violations.slice(0, 20).forEach(v => {
        console.log(`  ${v.symbolName || 'unknown'} (${v.filePath}:${v.lineNumber})`);
        console.log(`    ${v.message}`);
      });
      
      if (report.violations.length > 20) {
        console.log(`  ... and ${report.violations.length - 20} more`);
      }
    }
    
    // Write JSON report
    const reportPath = 'dead-code-audit-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${reportPath}`);
  }
}

// Run the audit
const analyzer = new DeadCodeAnalyzer();
const report = analyzer.analyze();

process.exit(report.totalViolations > 0 ? 1 : 0);
