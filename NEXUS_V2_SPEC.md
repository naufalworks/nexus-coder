# Nexus Coder V2 — Full Architecture Specification

## 1. Vision

Nexus V2 is a ground-up rewrite that treats context as an **information compression problem**, not a "stuffing" problem. The core innovation is the **Semantic Code Graph (SCG)** — a compressed knowledge representation of the entire codebase that enables surgical context delivery.

**Models**: GLM-5.1 (cheap routing) → GLM-5 Turbo (fast analysis) → Claude Sonnet (heavy lifting)
**MCP**: Deeply integrated as default infrastructure, not a separate agent
**Context**: 100x more effective through graph-based retrieval + adaptive compression

---

## 2. Architecture Overview

```
User Input
    │
    ▼
┌─────────────┐     ┌──────────────────┐
│   CLI/REPL   │────►│  Model Router     │ (GLM-5.1 classifies task)
│              │     │  (task type +     │
│              │     │   model selection)│
└─────────────┘     └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Event Bus       │ (async agent messaging)
                    │   (EventEmitter)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼──────┐ ┌────▼───────┐
    │ Context Engine  │ │  Planner  │ │    MCP     │
    │                 │ │(GLM-5 T.) │ │  Layer     │
    │ ┌─────────────┐│ └────┬──────┘ │            │
    │ │ Semantic    ││      │        │ filesystem │
    │ │ Code Graph  ││      ▼        │ git        │
    │ │ (SCG)       ││ ┌──────────┐  │ github     │
    │ ├─────────────┤│ │Dynamic   │  │ memory     │
    │ │ Traversal   ││ │Orchestr- │  │ seq-think  │
    │ │ Compression ││ │ator      │  │            │
    │ │ Budgeting   ││ └────┬─────┘  └─────┬──────┘
    │ └─────────────┘│      │              │
    │ ┌─────────────┐│      │    ┌─────────┘
    │ │ Persistent  ││      │    │ (MCP tools available
    │ │ Memory      ││      │     │  to ALL agents)
    │ │ (cross-sess)││      │
    │ └─────────────┘│      ▼
    └────────────────┘│ ┌────────────────────────────────┐
                      │ │    Agent Registry               │
                      │ │    (capability-based selection)  │
                      │ └──┬──────┬───────┬───────┬──────┘
                      │    │      │       │       │
                      │    ▼      ▼       ▼       ▼
                      │  Coder  Analyst  Reviewer  Git
                      │  Claude  GLM-5T  GLM-5T→  (No LLM)
                      │                   Claude
                      └──────────────────────────────────
```

---

## 3. MCP as Default Flow

### 3.1 MCP is NOT a separate agent — it's shared infrastructure

In V1, MCP was a stub "Tools Agent". In V2, MCP is a **capability layer** that all agents access:

```typescript
// Any agent can use MCP tools directly:
const files = await mcp.readDir('./src');
const content = await mcp.readFile('./src/auth.ts');
const status = await mcp.gitStatus();
```

### 3.2 Default MCP Servers (auto-enabled)

| Server | Purpose | Used By |
|--------|---------|---------|
| `filesystem` | Read/write/list files | Context Engine, Coder, SCG Builder |
| `git` | Git operations | Git Agent, Context Engine |
| `sequential-thinking` | Step-by-step reasoning | Planner, Coder, Reviewer |
| `memory` | Persistent cross-session memory | Persistent Memory, Context Engine |
| `github` | PR/Issue creation | Git Agent (optional) |

### 3.3 MCP Integration Points

```
Context Engine ←→ filesystem MCP (reads files for SCG)
Context Engine ←→ memory MCP (stores/retrieves patterns)
Coder Agent   ←→ filesystem MCP (writes proposed changes)
Coder Agent   ←→ sequential-thinking MCP (reasoning chains)
Git Agent     ←→ git MCP (all git operations)
Reviewer      ←→ sequential-thinking MCP (structured review)
Orchestrator  ←→ All MCP (coordinates tool usage)
```

---

## 4. Multi-Model Router

### 4.1 Model Definitions

```typescript
interface ModelDefinition {
  id: string;
  provider: 'glm' | 'anthropic';
  model: string;
  costPer1kTokens: { input: number; output: number };
  maxOutputTokens: number;
  capabilities: ModelCapability[];
  latencyProfile: 'instant' | 'fast' | 'moderate' | 'slow';
}

enum ModelCapability {
  CLASSIFICATION = 'classification',     // GLM-5.1
  SUMMARIZATION = 'summarization',       // GLM-5.1, GLM-5 Turbo
  CODE_GENERATION = 'code_generation',   // Claude
  CODE_REVIEW = 'code_review',          // GLM-5 Turbo, Claude
  STRUCTURED_EXTRACTION = 'extraction',  // GLM-5 Turbo
  COMPLEX_REASONING = 'reasoning',       // Claude
  PLANNING = 'planning',                // GLM-5 Turbo
  EMBEDDING = 'embedding',              // OpenAI
}
```

### 4.2 Routing Table

| Task | Primary Model | Fallback | Rationale |
|------|--------------|----------|-----------|
| Task classification | GLM-5.1 | — | Simple classification, cheapest |
| SCG node summarization | GLM-5.1 | GLM-5 Turbo | Short descriptions |
| Context planning | GLM-5.1 | — | Decide what context to fetch |
| Task breakdown | GLM-5 Turbo | Claude | Structured planning |
| Code summarization | GLM-5 Turbo | GLM-5.1 | Compression |
| Structured extraction | GLM-5 Turbo | — | JSON extraction |
| Code review (1st pass) | GLM-5 Turbo | — | Quick sanity check |
| Code generation | Claude | — | Best at code |
| Architecture decisions | Claude | — | Complex reasoning |
| Code review (2nd pass) | Claude | — | Deep review |
| Multi-file refactor | Claude | — | Cross-file awareness |
| Commit messages | GLM-5.1 | — | Simple summarization |

### 4.3 GLM Client (OpenAI-compatible)

```typescript
// GLM models use OpenAI-compatible API via ZhipuAI
// Base URL: https://open.bigmodel.cn/api/paas/v4/
// Authentication: Bearer token

class GLMClient {
  private client: OpenAI; // reuse OpenAI SDK with different base URL
  
  constructor(apiKey: string, baseUrl: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl, // ZhipuAI endpoint
    });
  }
  
  async chat(model: string, messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model,        // 'glm-5.1' or 'glm-5-turbo'
      messages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
    });
    return response.choices[0].message.content;
  }
}
```

---

## 5. Semantic Code Graph (SCG) — Detailed Design

### 5.1 Graph Structure

```typescript
interface SCGNode {
  id: string;                    // Unique ID (hash of file+name+line)
  type: NodeType;
  name: string;                  // Symbol name
  file: string;                  // Source file path
  line: number;                  // Start line
  endLine: number;               // End line
  signature: string;             // Compressed representation
  summary: string;               // 1-line AI-generated summary
  complexity: number;            // 1-10 complexity score
  changeFrequency: number;       // How often this node changes
  compressionLevel: CompressionLevel;
}

interface SCGEdge {
  from: string;                  // Source node ID
  to: string;                    // Target node ID
  type: EdgeType;
  weight: number;                // Strength of relationship
}

enum NodeType {
  FUNCTION, CLASS, INTERFACE, TYPE, VARIABLE,
  MODULE, ENDPOINT, TEST, MIDDLEWARE, MODEL,
  EXPORT, IMPORT
}

enum EdgeType {
  CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEPENDS_ON,
  TESTS, USES, ROUTES_TO, REFERENCES, EXPORTS
}

enum CompressionLevel {
  SIGNATURE = 0,   // "func authenticate(req: Request): Promise<User>"
  SUMMARY   = 1,   // Signature + 1-line description
  PARTIAL   = 2,   // Key lines (signature, returns, critical branches)
  FULL      = 3,   // Complete source code
}
```

### 5.2 SCG Builder Pipeline

```
File System
    │
    ▼
Tree-sitter AST Parser (TS, JS, Python, etc.)
    │
    ├── Extract: functions, classes, interfaces, types, imports, exports
    │
    ├── Build nodes with signatures
    │
    ├── Analyze relationships (calls, imports, extends)
    │
    ├── Generate edges between nodes
    │
    ├── GLM-5.1: Generate 1-line summaries for each node
    │
    ├── Calculate complexity scores
    │
    └── Store graph in memory + Qdrant (for vector search)
```

### 5.3 Graph Traversal Algorithms

```typescript
class GraphTraversal {
  // Get all nodes within N hops of a seed node
  bfs(startIds: string[], maxDepth: number): Map<string, number>;
  
  // Find shortest path between two nodes
  shortestPath(from: string, to: string): string[];
  
  // Impact analysis: what nodes are affected by changing this node?
  impactAnalysis(nodeId: string): { direct: string[]; indirect: string[]; tests: string[] };
  
  // Get the "neighborhood" of a task — all relevant nodes
  getTaskNeighborhood(query: string, budget: number): NeighborhoodResult;
}
```

### 5.4 Compression Engine

```typescript
class CompressionEngine {
  // Compress a node to the specified level
  compress(node: SCGNode, level: CompressionLevel): string;
  
  // Compress a set of nodes to fit within a token budget
  compressToBudget(nodes: SCGNode[], budget: number): CompressedContext;
  
  // Estimate tokens for a compressed representation
  estimateTokens(content: string): number;
}
```

**Compression Strategy:**
- **SIGNATURE**: Name + params + return type → ~20 tokens
- **SUMMARY**: Signature + 1-line description → ~30 tokens
- **PARTIAL**: Signature + key control flow → ~100 tokens
- **FULL**: Complete source → variable (100-5000 tokens)

### 5.5 Context Assembly Flow

```
Task: "Fix the authentication middleware bug"
         │
         ▼
Step 1: Vector search → find seed nodes (authenticate, middleware, auth)
         │
         ▼
Step 2: Graph traversal (BFS, depth=3) → expand neighborhood
         │
         ▼
Step 3: Score nodes by relevance × recency × distance
         │
         ▼
Step 4: Apply compression based on distance:
         distance 0 → FULL
         distance 1 → SUMMARY
         distance 2 → SIGNATURE
         distance 3 → NAME only
         │
         ▼
Step 5: Fill token budget (stop when budget exhausted)
         │
         ▼
Step 6: Format as structured XML context
         │
         ▼
Result: ~2000 tokens of surgical context
```

---

## 6. Persistent Learning Memory

### 6.1 Memory Types

```typescript
interface PersistentMemory {
  // Codebase conventions discovered over time
  conventions: Convention[];
  
  // Successful patterns: "When fixing auth bugs, check middleware first"
  patterns: Pattern[];
  
  // User preferences: "prefers functional style", "uses repository pattern"
  preferences: UserPreference[];
  
  // Decision journal: why each decision was made
  decisions: Decision[];
  
  // Error history: what went wrong and how it was fixed
  errorHistory: ErrorRecord[];
}
```

### 6.2 Memory Growth

```
Session 1: Empty memory → learns basic project structure
Session 2: Remembers structure → learns conventions (naming, patterns)
Session 3: Remembers conventions → learns user preferences
Session 5: Remembers preferences → learns common bug patterns
Session 10: Highly personalized → knows your codebase better than you do
```

---

## 7. Event Bus

### 7.1 Event Types

```typescript
enum EventType {
  TASK_RECEIVED = 'task:received',
  TASK_CLASSIFIED = 'task:classified',
  PLAN_CREATED = 'plan:created',
  CONTEXT_ASSEMBLED = 'context:assembled',
  CODE_GENERATED = 'code:generated',
  CODE_REVIEWED = 'code:reviewed',
  CHANGES_PROPOSED = 'changes:proposed',
  CHANGES_APPROVED = 'changes:approved',
  CHANGES_APPLIED = 'changes:applied',
  GIT_COMMITTED = 'git:committed',
  ERROR_OCCURRED = 'error:occurred',
}
```

### 7.2 Agent Communication

```typescript
// Agents emit events, other agents subscribe
eventBus.on(EventType.CONTEXT_ASSEMBLED, (context) => {
  coderAgent.startWork(context);
});

eventBus.on(EventType.CODE_GENERATED, (code) => {
  reviewerAgent.review(code);
});
```

---

## 8. Detailed File Specifications

### Phase 1: Foundation (14 files)

#### `src/core/models/types.ts`
- ModelCapability enum
- ModelDefinition interface
- RoutingDecision interface
- ModelCost tracking types

#### `src/core/models/glm-client.ts`
- GLMClient class wrapping OpenAI SDK with ZhipuAI base URL
- Supports GLM-5.1 and GLM-5 Turbo
- Methods: chat(), chatStream(), structuredChat()
- Built-in retry logic with exponential backoff
- Token counting

#### `src/core/models/claude-client.ts`
- ClaudeClient class wrapping Anthropic SDK
- Methods: chat(), streamChat(), analyzeCode()
- Built-in retry logic
- Separate maxOutputTokens from contextWindowSize
- Conversation history per session

#### `src/core/models/router.ts`
- ModelRouter class
- classifyTask() → uses GLM-5.1 to classify task type
- selectModel(taskType) → returns best model for the task
- executeWithRouting(task) → automatically picks model and executes
- Cost tracking per request
- Fallback logic: if primary model fails, try next in chain

#### `src/core/event-bus.ts`
- EventBus class (extends EventEmitter)
- Typed events
- Subscribe/publish pattern
- Error handling middleware
- Event history for debugging

#### `src/core/config.ts`
- loadConfig() reads from .env
- Model configurations (GLM, Claude)
- MCP server configs
- Context budget configs
- Validation with clear error messages

#### `src/core/logger.ts`
- Winston logger (same as V1, keep as-is)

### Phase 2: Semantic Code Graph (7 files)

#### `src/core/context/graph/types.ts`
- SCGNode, SCGEdge interfaces
- NodeType, EdgeType, CompressionLevel enums
- GraphMetadata interface
- TraversalResult interface

#### `src/core/context/graph/semantic-graph.ts`
- SemanticCodeGraph class
- buildGraph(directory: string): builds full graph from codebase
- addNode(), addEdge(), removeNode(), removeEdge()
- getNode(), getEdge(), getNeighbors()
- serialize() / deserialize() for persistence
- Uses tree-sitter for AST parsing
- Calls GLM-5.1 for summary generation during indexing

#### `src/core/context/graph/traversal.ts`
- GraphTraversal class
- bfs(): breadth-first traversal with depth limit
- impactAnalysis(): find all affected nodes
- getTaskNeighborhood(): find relevant nodes for a task
- findRelated(): semantic similarity + graph distance
- rankByRelevance(): score nodes for a given query

#### `src/core/context/compression/compressor.ts`
- CompressionEngine class
- compress(): compress node to specified level
- compressToBudget(): compress set of nodes to fit token budget
- estimateTokens(): tiktoken-based token counting
- AST-aware compression (preserves structure)

#### `src/core/context/compression/ast-compress.ts`
- ASTCompressor class
- extractSignature(): name + params + return type
- extractSummary(): signature + key description
- extractPartial(): signature + critical control flow
- Language-specific compressors (TS, JS, Python)

#### `src/core/context/budget/token-budget.ts`
- TokenBudget class
- allocateBudget(): distribute tokens across context types
- trackUsage(): real-time token tracking
- getRemaining(): how many tokens left
- autoCompress(): if over budget, compress lowest-priority items

#### `src/core/context/budget/adaptive.ts`
- AdaptiveWindow class
- monitor(): track if agent needs more/less context
- expand(): add more context when agent struggles
- shrink(): remove context when sufficient
- dynamic adjustment based on task complexity

### Phase 3: Context Engine & Memory (6 files)

#### `src/core/context/engine.ts`
- ContextEngine class — THE BRAIN
- assembleContext(task, budget): main entry point
  1. Query SCG for seed nodes
  2. Traverse graph for neighborhood
  3. Score and rank nodes
  4. Compress to budget
  5. Format as structured context
- refreshContext(): update when files change
- getContextDiff(): only what changed since last context

#### `src/core/context/memory/persistent.ts`
- PersistentMemory class
- Uses MCP memory server as backend
- store(): save learned information
- retrieve(): recall relevant memories
- search(): vector search across memories
- Auto-decay old memories

#### `src/core/context/memory/decisions.ts`
- DecisionJournal class
- record(): log a decision with reasoning
- getRelevant(): find past decisions for current context
- learn(): extract patterns from decisions

#### `src/core/context/memory/patterns.ts`
- PatternStore class
- recordPattern(): save a successful pattern
- findPatterns(): retrieve patterns for current task
- Auto-categorize: bug-fix patterns, feature patterns, refactor patterns

#### `src/core/store/vector-store.ts`
- VectorStore class (Qdrant wrapper)
- store(), search(), delete(), clear()
- Batch operations
- Health check

#### `src/core/store/embeddings.ts`
- EmbeddingGenerator class
- generate(): create embedding via OpenAI
- generateBatch(): batch embedding
- Cache layer
- NO Anthropic fallback (V1 bug fix)

### Phase 4: Agents (8 files)

#### `src/agents/registry.ts`
- AgentRegistry class
- register(): agent registers with capabilities
- findAgent(capability): find agent for a task
- listCapabilities(): show all available agent capabilities
- Dynamic agent loading

#### `src/agents/event-bus.ts`
- Re-export from core/event-bus with agent-specific event types
- AgentEvent types

#### `src/agents/orchestrator/orchestrator.ts`
- DynamicOrchestrator class
- executeTask(): main entry — dynamically selects agents based on task
- NOT sequential — picks only needed agents
- Parallel execution where possible (Promise.all)
- Error recovery: if agent fails, try alternative
- Uses ModelRouter for all LLM calls
- Uses MCP for tool operations

#### `src/agents/orchestrator/planner.ts`
- Planner class
- createPlan(): GLM-5 Turbo creates structured plan
- breakdownToSubtasks(): split into subtasks
- assignAgents(): match subtasks to agents via registry
- estimateCost(): predict token/cost before execution

#### `src/agents/specialized/context-agent.ts`
- ContextAgent
- execute(): assemble context using ContextEngine
- Model: GLM-5.1 (for context planning only)
- Direct SCG access, no LLM for retrieval

#### `src/agents/specialized/coder-agent.ts`
- CoderAgent
- execute(): generate code changes
- Model: Claude (primary), GLM-5 Turbo (simple changes)
- Uses sequential-thinking MCP for reasoning chains
- Uses filesystem MCP for reading/writing files
- Returns structured CodeChange[]

#### `src/agents/specialized/reviewer-agent.ts`
- ReviewerAgent
- execute(): two-pass review
- Pass 1: GLM-5 Turbo (quick sanity check)
- Pass 2: Claude (if pass 1 finds issues, deep review)
- Uses sequential-thinking MCP for structured review

#### `src/agents/specialized/git-agent.ts`
- GitAgent
- execute(): git operations
- ZERO LLM calls — pure rule-based
- Uses git MCP for all operations
- Auto-generates commit messages from diff (GLM-5.1, minimal cost)

### Phase 5: CLI & UX (4 files)

#### `src/cli/index.ts`
- Commander-based CLI
- Lazy initialization (only create services when needed)
- Commands: init, code, status, diff, history, undo, branch, context, clear-context
- Interactive REPL mode: `nexus chat`

#### `src/cli/approval-ui.ts`
- Fixed approval flow (V1 was dead code)
- Shows changes with diff visualization
- Approve/Reject/Modify/Explain options
- Risk/impact display
- Connects to orchestrator's approval pipeline

#### `src/cli/interactive.ts`
- Interactive REPL mode
- Streaming responses
- Context-aware (remembers conversation)
- Cost tracking display
- Agent status dashboard

#### `src/types/index.ts`
- All shared types
- Clean type hierarchy
- No `any` types

---

## 9. Token Budget Comparison (V1 vs V2)

| Operation | V1 Tokens | V1 Model | V2 Tokens | V2 Model | Savings |
|-----------|-----------|----------|-----------|----------|---------|
| Task classify | 5K | Claude | 200 | GLM-5.1 | 96% |
| Context retrieval | 50K | Claude | 2K | No LLM | 96% |
| Task breakdown | 10K | Claude | 1K | GLM-5 Turbo | 90% |
| Code generation | 30K | Claude | 20K | Claude | 33% |
| Code review | 15K | Claude | 3K | GLM-5 Turbo | 80% |
| Git status | 5K | Claude | 0 | No LLM | 100% |
| Commit message | 5K | Claude | 300 | GLM-5.1 | 94% |
| **Total (typical task)** | **120K** | **All Claude** | **~27K** | **Mixed** | **~78%** |

---

## 10. Error Handling Strategy

```typescript
// Every LLM call wrapped with retry + fallback
async function executeWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await primary();
    } catch (error) {
      if (attempt === retries - 1) {
        logger.warn('Primary model failed, using fallback');
        return await fallback();
      }
      await sleep(Math.pow(2, attempt) * 1000); // exponential backoff
    }
  }
  throw new Error('All attempts failed');
}
```

---

## 11. Key Design Principles

1. **Dependency Injection**: All shared resources (LLM clients, stores, MCP) are injected, never created inside agents
2. **Event-Driven**: Agents communicate via events, not direct calls
3. **Capability-Based Routing**: Agents advertise capabilities, orchestrator picks based on need
4. **MCP as Infrastructure**: MCP tools are shared infrastructure, not a separate agent
5. **Progressive Context**: Start minimal, expand on-demand
6. **Cost-Aware**: Every LLM call tracks cost, user can set budget caps
7. **Zero-LLM where possible**: Git ops, file listing, status checks → no AI needed

---

## 12. Environment Variables (.env)

```env
# GLM Models (ZhipuAI - OpenAI compatible)
GLM_API_KEY=your_zhipuai_key
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
GLM_5_1_MODEL=glm-5.1
GLM_5_TURBO_MODEL=glm-5-turbo

# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_BASE_URL=https://api.anthropic.com
CLAUDE_MODEL=claude-sonnet-4-6-20250514
CLAUDE_MAX_OUTPUT_TOKENS=8192

# OpenAI (for embeddings only)
OPENAI_API_KEY=your_openai_key

# Qdrant Vector Database
QDRANT_URL=http://localhost:6333

# MCP Servers
MCP_FILESYSTEM_ENABLED=true
MCP_GIT_ENABLED=true
MCP_GITHUB_ENABLED=false
MCP_SEQUENTIAL_THINKING_ENABLED=true
MCP_MEMORY_ENABLED=true

# Context Configuration
CONTEXT_WINDOW_SIZE=200000
CONTEXT_CODE_BUDGET=40000
CONTEXT_MEMORY_BUDGET=10000
CONTEXT_REPO_MAP_BUDGET=5000

# Git
GIT_AUTO_COMMIT=false
GIT_COMMIT_PREFIX=nexus:

# Logging
LOG_LEVEL=info
LOG_FILE=logs/nexus-v2.log
```
