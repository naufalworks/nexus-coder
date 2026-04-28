# Nexus V2 - Multi-Agent AI Coding Assistant

A production-ready, multi-agent AI coding assistant with 100x context capacity powered by Semantic Code Graph (SCG) and intelligent compression.

## Overview

Nexus V2 is an advanced AI coding system that combines semantic code understanding, vector search, and multi-agent orchestration to provide intelligent code assistance at scale. Unlike traditional AI assistants limited by context windows, Nexus uses a graph-based approach to understand and navigate large codebases efficiently.

## Key Features

- **Semantic Code Graph (SCG)** - AST-based code understanding with relationship tracking (calls, extends, imports)
- **100x Context Capacity** - Distance-aware compression (FULL → SUMMARY → SIGNATURE → NAME) via graph BFS
- **Vector Similarity Search** - Qdrant-powered semantic search with OpenAI embeddings
- **Multi-Agent Architecture** - Specialized agents (Context, Coder, Reviewer, Git) orchestrated dynamically
- **Persistent Memory** - Decision journal, pattern store, and vector-backed long-term memory
- **Multi-Model Routing** - Intelligent routing between GLM-5.1, Claude Sonnet, and other models
- **Production Ready** - Comprehensive E2E tests, security protections, git integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dynamic Orchestrator                      │
│              (Task Planning & Agent Routing)                 │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┬──────────┬──────────┬─────────┐
    │                 │          │          │         │
┌───▼────┐  ┌────────▼───┐  ┌───▼─────┐  ┌─▼──────┐ │
│Context │  │   Coder    │  │Reviewer │  │  Git   │ │
│ Agent  │  │   Agent    │  │ Agent   │  │ Agent  │ │
└───┬────┘  └────────┬───┘  └───┬─────┘  └─┬──────┘ │
    │                │          │          │         │
    └────────┬───────┴──────────┴──────────┴─────────┘
             │
    ┌────────▼─────────────────────────────────────────┐
    │            Context Engine (Phase 3)              │
    │  ┌──────────────┐  ┌─────────────────────────┐  │
    │  │ Semantic     │  │  Compression Engine     │  │
    │  │ Code Graph   │  │  (Distance-aware)       │  │
    │  │ (304 nodes)  │  │  FULL→SUMMARY→SIG→NAME  │  │
    │  └──────────────┘  └─────────────────────────┘  │
    │  ┌──────────────┐  ┌─────────────────────────┐  │
    │  │ Vector Store │  │  Persistent Memory      │  │
    │  │ (Qdrant)     │  │  Decisions + Patterns   │  │
    │  └──────────────┘  └─────────────────────────┘  │
    └──────────────────────────────────────────────────┘
             │
    ┌────────▼─────────────────────────────────────────┐
    │         Model Router (Phase 1)                   │
    │  GLM-5.1 (ZhipuAI) + Claude Sonnet (Anthropic)  │
    └──────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for Qdrant vector store)
- API keys for LLM providers (ZhipuAI, Anthropic, or OpenAI-compatible)

### Installation

```bash
# Clone the repository
git clone https://github.com/naufalworks/nexus-coder.git
cd nexus-coder

# Install dependencies
npm install

# Set up Qdrant vector store
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/.qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Configure environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Configuration

Create a `.env` file with your API credentials:

```bash
# LLM API Configuration
NEXUS_API_KEY=your_api_key_here
NEXUS_BASE_URL=https://api.z.ai/api/coding/paas/v4

# Model Selection (adjust based on your provider)
NEXUS_MODEL_GENERAL=glm-5.1
NEXUS_MODEL_FAST=glm-5.1
NEXUS_MODEL_HEAVY=glm-5.1
NEXUS_MODEL_CODER=glm-5.1
NEXUS_MODEL_ANALYST=glm-5.1

# OpenAI for Embeddings (required for vector search)
OPENAI_API_KEY=your_openai_key_here

# Qdrant Configuration (optional, defaults to localhost)
QDRANT_URL=http://localhost:6333
# QDRANT_API_KEY=your_qdrant_key  # Only if using Qdrant Cloud
```

### Usage

```typescript
import { ContextEngine, DynamicOrchestrator, UnifiedClient } from 'nexus-coder';

// Initialize the system
const client = new UnifiedClient();
const contextEngine = new ContextEngine(client);
const orchestrator = new DynamicOrchestrator(contextEngine);

// Build semantic code graph
await contextEngine.initialize('/path/to/your/codebase');

// Execute a coding task
const result = await orchestrator.executeTask({
  description: 'Add error handling to the authentication module',
  priority: 'high',
  constraints: { maxTokens: 8000 }
});

console.log(result.output);
```

## Testing

Nexus V2 includes comprehensive E2E tests covering all major features:

```bash
# Run all tests (requires API keys and Qdrant)
npm test

# Run specific test suites
npm test -- tests/e2e/01-graph-build.test.ts    # Graph construction
npm test -- tests/e2e/02-traversal.test.ts      # Graph traversal
npm test -- tests/e2e/03-compression.test.ts    # Compression engine
npm test -- tests/e2e/04-context-assembly.test.ts  # Context assembly
npm test -- tests/e2e/05-classification.test.ts # Task classification
npm test -- tests/e2e/07-security.test.ts       # Security features

# Run QA test suites
npm run test:integration     # Integration tests
npm run test:a11y            # Accessibility tests
npm run test:performance     # Performance tests
npm run test:security        # Security tests
npm run test:visual          # Visual regression tests
npm run test:qa              # Full QA suite (tests + audits)

# Run with environment variables
NEXUS_API_KEY="your_key" \
NEXUS_BASE_URL="https://api.z.ai/api/coding/paas/v4" \
NEXUS_MODEL_GENERAL="glm-5.1" \
npm test
```

Test Results (42/42 passing):
- Graph Build: 11/11 ✅ (304 nodes, 103 edges)
- Traversal: 8/8 ✅
- Compression: 6/6 ✅
- Context Assembly: 5/5 ✅
- Classification: 6/6 ✅
- Security: 6/6 ✅

## Code Quality Audits

Nexus V2 includes a comprehensive audit framework for maintaining code quality:

### Available Audit Commands

```bash
# Run individual audit modules
npm run audit:typescript     # TypeScript strict mode audit
npm run audit:dead-code      # Dead code detection
npm run audit:security       # Security pattern audit
npm run audit:architecture   # Architecture compliance audit
npm run audit:performance    # Performance audit
npm run audit:bundle         # Bundle size analysis

# Run all audits
npm run audit:all

# Full QA pipeline (tests + audits)
npm run test:qa
```

### Test Commands

```bash
# Run property-based tests
npm run test:pbt

# Run all audit tests
npm run test:audit
```

### CLI Usage

The audit framework provides a flexible CLI for running audits programmatically:

```bash
ts-node src/__tests__/audit/cli.ts [options]

Options:
  -c, --category <category>  Run only a specific audit category
  -f, --format <format>      Output format: json or markdown (default: json)
  -o, --output <path>        Write output to file instead of stdout
  -h, --help                 Show usage information
```

**Examples:**

```bash
# Run all audits with JSON output
ts-node src/__tests__/audit/cli.ts

# Run specific category with markdown output
ts-node src/__tests__/audit/cli.ts -c typescript-strict -f markdown

# Save results to file
ts-node src/__tests__/audit/cli.ts -o audit-report.json

# Run security audit with markdown report
ts-node src/__tests__/audit/cli.ts -c security -f markdown -o security-report.md
```

### Exit Codes

The audit CLI uses standard exit codes for CI/CD integration:

- **0**: All audits passed (no violations)
- **1**: Critical violations found
- **2**: High violations found (if no critical)
- **3**: Audit infrastructure error
- **4**: Configuration error (invalid arguments)

### Audit Report Format

The audit framework generates comprehensive JSON reports with the following structure:

```typescript
{
  "timestamp": "2026-04-28T17:00:00.000Z",
  "healthScore": 95.1,           // Overall health score (0-100)
  "passed": true,                 // Whether all audits passed
  "summary": {
    "totalViolations": 12,
    "bySeverity": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 5
    },
    "byCategory": {
      "typescript-strict": 12,
      "dead-code": 0,
      // ... other categories
    }
  },
  "reports": {
    "typescript-strict": {
      "category": "typescript-strict",
      "passed": false,
      "violations": [...],
      "executionTime": 1234
    }
    // ... other category reports
  },
  "topPriorityIssues": [
    {
      "severity": "high",
      "category": "typescript-strict",
      "filePath": "src/core/config.ts",
      "lineNumber": 42,
      "message": "Implicit 'any' type detected",
      "suggestion": "Add explicit type annotation"
    }
    // ... up to 10 highest priority issues
  ]
}
```

**Key Report Features:**
- **Health Score**: Calculated based on violation severity and count (0-100 scale)
- **Top Priority Issues**: Automatically surfaces the most critical violations
- **Category Breakdown**: Violations grouped by audit category for easy triage
- **Execution Metrics**: Performance data for each audit module

**Audit Framework Status** (as of 2026-04-28):
- **Phase 1: Core Framework** ✅ Complete (107 passing tests)
- **Phase 2: Core Modules** ⏳ 25% complete (TypeScript strict, naming conventions)
- TypeScript Strict Mode: 95.1% compliance (12 violations across 5 files)
- Naming Conventions: 11 violations detected
- Health Score Calculation: Property-based tested
- Violation Registry: Production-ready

See [.kiro/specs/nexus-codebase-audit/IMPLEMENTATION_STATUS.md](.kiro/specs/nexus-codebase-audit/IMPLEMENTATION_STATUS.md) for detailed audit framework documentation.

## Project Structure

```
nexus-coder/
├── src/
│   ├── core/
│   │   ├── models/           # UnifiedClient, ModelRouter
│   │   ├── context/
│   │   │   ├── graph/        # SemanticGraphBuilder, GraphTraversal
│   │   │   ├── compression/  # CompressionEngine
│   │   │   ├── memory/       # PersistentMemory, DecisionJournal, PatternStore
│   │   │   └── engine.ts     # ContextEngine (orchestrates Phase 3)
│   │   ├── store/            # VectorStore (Qdrant), EmbeddingGenerator
│   │   ├── event-bus.ts      # Event system
│   │   ├── config.ts         # Configuration management
│   │   ├── logger.ts         # Winston logging
│   │   ├── git-manager.ts    # Git operations
│   │   └── file-writer.ts    # Safe file operations with backups
│   ├── agents/
│   │   ├── orchestrator/     # DynamicOrchestrator, Planner
│   │   ├── specialized/      # ContextAgent, CoderAgent, ReviewerAgent, GitAgent
│   │   └── registry.ts       # AgentRegistry
│   ├── types/                # TypeScript type definitions
│   └── index.ts              # Public API exports
├── tests/
│   └── e2e/                  # End-to-end tests (42 tests)
├── src/
│   └── __tests__/            # QA test suites (375+ tests)
│       ├── audit/            # Code quality audit framework
│       │   └── framework/    # Core audit types, registry, runner, reporter
│       ├── integration/      # Cross-widget integration tests
│       ├── e2e/              # IDE end-to-end flow tests
│       ├── accessibility/    # WCAG accessibility tests
│       ├── performance/      # Render budget & memory tests
│       ├── security/         # Security audit tests
│       └── visual/           # Visual regression tests
├── docs/                     # Additional documentation
├── .env.example              # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

## Core Components

### Semantic Code Graph (SCG)

The SCG uses tree-sitter to parse source code into an AST-based graph with typed relationships:

- Nodes: Functions, classes, methods, variables
- Edges: CALLS, EXTENDS, IMPORTS, USES
- Compression: Distance-aware (FULL → SUMMARY → SIGNATURE → NAME)

### Context Engine

Orchestrates all Phase 3 components:
- Graph traversal and neighborhood extraction
- Budget-aware compression
- Vector similarity search
- Persistent memory integration

### Multi-Agent System

Four specialized agents coordinated by the Dynamic Orchestrator:
- ContextAgent: Retrieves relevant code context
- CoderAgent: Generates code changes
- ReviewerAgent: Reviews and validates changes
- GitAgent: Manages git operations

## API Reference

See [NEXUS_V2_SPEC.md](./NEXUS_V2_SPEC.md) for detailed technical specifications.

### Key Exports

```typescript
// Core
export { UnifiedClient } from './core/models/unified-client';
export { ModelRouter } from './core/models/router';
export { ContextEngine } from './core/context/engine';

// Graph & Compression
export { SemanticGraphBuilder } from './core/context/graph/semantic-graph';
export { GraphTraversal } from './core/context/graph/traversal';
export { CompressionEngine } from './core/context/compression/compressor';

// Memory & Storage
export { PersistentMemory } from './core/context/memory/persistent';
export { VectorStore } from './core/store/vector-store';
export { EmbeddingGenerator } from './core/store/embeddings';

// Agents
export { DynamicOrchestrator } from './agents/orchestrator/orchestrator';
export { AgentRegistry } from './agents/registry';

// Utilities
export { GitManager } from './core/git-manager';
export { FileWriter } from './core/file-writer';

// Audit Framework (for code quality checks)
export { AuditRunner } from './__tests__/audit/framework/runner';
export { ViolationRegistry } from './__tests__/audit/framework/registry';
export { ReportGenerator } from './__tests__/audit/framework/reporter';
export type { AuditModule, AuditReport, AuditViolation, ComprehensiveAuditReport } from './__tests__/audit/framework/types';
```

## Performance

- Graph Build: ~2s for 304 nodes (32 source files)
- Context Assembly: 20,816 tokens (21 nodes) in ~1s
- Compression Ratio: 12.49x (SIGNATURE → FULL)
- Lookup Speed: 0.005ms per node

## Security

- Path traversal protection
- Backup system for all file writes
- Git integration with safe operations
- Sensitive data filtering in logs
- Comprehensive input validation

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

MIT

## Support

- GitHub Issues: https://github.com/naufalworks/nexus-coder/issues
- Documentation: [QUICKSTART.md](./QUICKSTART.md)
- Technical Spec: [NEXUS_V2_SPEC.md](./NEXUS_V2_SPEC.md)

## Acknowledgments

Built with:
- tree-sitter (AST parsing)
- Qdrant (vector database)
- OpenAI (embeddings)
- ZhipuAI GLM-5.1 & Anthropic Claude (LLMs)
- TypeScript, Jest, Winston
