# Nexus Coder - Quick Start Guide

## Prerequisites

1. **Node.js 18+** installed
2. **Docker** (for Qdrant vector database)
3. **Git** configured
4. **Claude API key** (Anthropic)

## Installation Steps

### 1. Install Dependencies

```bash
cd nexus-coder
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
GITHUB_TOKEN=your_github_token_here
```

### 3. Start Qdrant Vector Database

```bash
docker-compose up -d
```

This will start Qdrant on `http://localhost:6333`

### 4. Initialize Nexus Coder

```bash
npm run build
npm link
nexus init
```

## Usage

### Basic Commands

```bash
# Initialize in a project
nexus init

# Execute a coding task
nexus code "Add authentication to the API"

# Check status
nexus status

# View git diff
nexus diff

# View commit history
nexus history

# Search context memory
nexus context "authentication flow"

# Create a branch
nexus branch feature/new-auth
```

### Advanced Usage

```bash
# Code with additional context
nexus code "Refactor the database layer" --context "Use connection pooling"

# Auto-approve changes (not recommended)
nexus code "Fix typo in README" --auto-approve

# Clear context memory
nexus clear-context
```

## Architecture

Nexus Coder uses a multi-agent swarm architecture:

1. **Orchestrator Agent**: Coordinates all other agents
2. **Context Agent**: Manages unlimited context memory via Qdrant
3. **Task Agent**: Plans and tracks goals
4. **Git Agent**: Handles all git operations
5. **Coding Agent**: Proposes code changes with reasoning
6. **Tools Agent**: Uses MCP servers for external tools

## MCP Servers (Built-in)

Nexus Coder comes with 5 built-in MCP servers:

1. **Filesystem**: Read/write files
2. **Git**: Local git operations
3. **GitHub**: GitHub integration (issues, PRs, search)
4. **Sequential Thinking**: Structured problem-solving (prevents hallucination)
5. **Memory**: Persistent memory across sessions

## Reasoning-First Workflow

Every code change follows this process:

1. **Analyze**: Agent analyzes the code and task
2. **Reason**: Shows WHY changes are needed
3. **Impact**: Shows WHAT it fixes/improves
4. **Risk**: Shows risk assessment (low/medium/high)
5. **Diff**: Shows the actual code changes
6. **Approve**: You approve or reject
7. **Commit**: Auto-commits with descriptive message

## Example Output

```
┌─────────────────────────────────────────────────┐
│  PROPOSED CHANGE                                │
├─────────────────────────────────────────────────┤
│  File: src/auth/login.ts                        │
│                                                  │
│  REASONING:                                      │
│  • Found typo in error message (line 45)        │
│  • Detected unused import 'bcrypt' (line 3)     │
│  • Missing null check causes potential crash    │
│                                                  │
│  IMPACT:                                         │
│  • Fixes: TypeError when user is undefined      │
│  • Improves: Code clarity and maintainability   │
│  • Risk: Low (no logic changes)                 │
│                                                  │
│  DIFF:                                           │
│  - import bcrypt from 'bcrypt'                  │
│  + // removed unused import                     │
│                                                  │
│  - if (user.password === password) {            │
│  + if (user?.password === password) {           │
│                                                  │
│  - throw new Error('Invlaid credentials')       │
│  + throw new Error('Invalid credentials')       │
│                                                  │
├─────────────────────────────────────────────────┤
│  [A]pprove  [R]eject  [M]odify  [?]Explain      │
└─────────────────────────────────────────────────┘
```

## Configuration

### Custom API Endpoint

If you're using a custom Claude API endpoint:

```env
ANTHROPIC_API_BASE_URL=https://your-custom-api.com
```

### Model Selection

```env
CLAUDE_MODEL=claude-sonnet-4-6-20250514
```

### Context Management

```env
CONTEXT_MAX_TOKENS=200000
CONTEXT_SUMMARY_THRESHOLD=50000
```

## Troubleshooting

### Qdrant Connection Error

```bash
# Check if Qdrant is running
docker ps

# Restart Qdrant
docker-compose restart
```

### MCP Server Issues

```bash
# Check MCP server status
nexus status

# Reinstall MCP servers
npm install @modelcontextprotocol/server-filesystem
npm install @modelcontextprotocol/server-git
npm install @modelcontextprotocol/server-github
npm install @modelcontextprotocol/server-sequential-thinking
npm install @modelcontextprotocol/server-memory
```

### Git Issues

```bash
# Ensure you're in a git repository
git status

# Initialize if needed
git init
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
