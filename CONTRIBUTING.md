# Contributing to Nexus Coder

Thank you for your interest in contributing to Nexus Coder!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Start Qdrant: `docker-compose up -d`
5. Build: `npm run build`
6. Run tests: `npm test`

## Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Write tests for new features
- Update documentation

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Run tests and lint
4. Submit PR with description

## Architecture

- `src/agents/`: Multi-agent system
- `src/core/`: Core functionality (LLM, Git, Context, MCP)
- `src/cli/`: CLI interface
- `src/types/`: TypeScript types

## Questions?

Open an issue or discussion on GitHub.
