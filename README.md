# Nexus Coder

Multi-agent AI coding assistant with git-native workflow and unlimited context memory.

## Features

- **Multi-Agent Swarm**: Specialized agents for different tasks (orchestrator, context, task, git, coding, tools)
- **Git-Native Workflow**: Every change is automatically committed with reasoning
- **Unlimited Context**: Qdrant vector database for persistent memory
- **MCP Integration**: Built-in support for Filesystem, Git, GitHub, Sequential Thinking, and Memory servers
- **Reasoning-First**: Shows why changes are needed before showing what changes
- **No Hallucination**: Sequential Thinking MCP ensures structured problem-solving

## Installation

```bash
npm install
npm run build
npm link
```

## Usage

```bash
nexus init
nexus code "Add authentication to the API"
nexus status
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                    │
│              (Manages agent coordination)                │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│   CONTEXT    │  │    TASK     │  │     GIT     │
│    AGENT     │  │   AGENT     │  │   AGENT     │
│              │  │             │  │             │
│ - Compress   │  │ - Plan      │  │ - Commit    │
│ - Retrieve   │  │ - Track     │  │ - Diff      │
│ - Summarize  │  │ - Goals     │  │ - Revert    │
└──────────────┘  └─────────────┘  └─────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                ┌─────────▼─────────┐
                │   CODING AGENT    │
                │  (Fresh context)  │
                │                   │
                │ - Read code       │
                │ - Propose edits   │
                │ - Ask approval    │
                └───────────────────┘
                          │
                ┌─────────▼─────────┐
                │   TOOLS AGENT     │
                │                   │
                │ - WebSearch       │
                │ - MCP Servers     │
                │ - LSP             │
                │ - File ops        │
                └───────────────────┘
```

## Configuration

Copy `.env.example` to `.env` and configure:

- `ANTHROPIC_API_KEY`: Your Claude API key
- `QDRANT_URL`: Qdrant vector database URL
- `GITHUB_TOKEN`: GitHub personal access token

## MCP Servers

Nexus Coder comes with built-in MCP servers:

1. **Filesystem**: Read/write files
2. **Git**: Local git operations
3. **GitHub**: GitHub integration
4. **Sequential Thinking**: Structured problem-solving
5. **Memory**: Persistent memory across sessions

## License

MIT
