# Requirements Document

## Introduction

The "nexus-ide" is a minimalist, AI-driven coding IDE and integrated CLI designed for Nexus V2’s multi-agent workflows. Its innovation centers on actionable context, agent proposals, semantic code navigation, and user approvals—delivered through a unified, decluttered interface and terminal-compatible workflows. This requirements specification derives from the approved architectural and interface design.

## Glossary

- **IDE Shell**: The main UI framework for coding activities, integrating all widgets.
- **Task Panel**: Sidebar listing active tasks, agent assignments, status, and affected files/functions.
- **Diff Approval Widget**: Inline view for reviewing, approving, or rejecting code changes grouped by logical task.
- **Semantic Code Graph Explorer**: Sidebar/minimap showing relationships between code elements and overlays of agent proposals.
- **Reasoning Log**: Panel capturing agent decisions, proposals, reviews, and user approvals.
- **In-Context Actions**: Right-click/hover menu for agent-driven and user-driven actions.
- **Agent Status Dashboard**: Widget showing agent progress, errors, and readiness.
- **Resource Footer**: Bar displaying API usage, token consumption, quotas, vector store health.
- **CLI Integration**: Terminal interface mirroring all IDE flows as commands.
- **AgentInfo**: Data model detailing agent identity, status, progress, and errors.
- **CodeChange**: Data model for describing proposed and applied code changes.
- **SemanticCodeGraphData**: Data structure for representing relationships in source code.
- **TokenUsage**: Data model tracking API tokens, quotas, and consumption.

## Requirements

### Requirement 1: Intelligent Task & Change Panel
**User Story:** As a developer, I want to see a unified view of all tasks and changes, so that I can manage agent-driven coding workflows efficiently.

#### Acceptance Criteria
1. THE Task Panel SHALL list all active tasks, showing agent assignments, status, and direct links to affected files/functions (Ubiquitous)
2. THE Task Panel SHALL support filtering by task status and agent (Optional feature)
3. WHEN a task is selected THEN THE system SHALL show details, impacted code, and agent proposals (Event-driven)
4. WHEN agent assignments change THEN THE Task Panel SHALL update associations in real time (Event-driven)

### Requirement 2: Minimalist Code Diff/Approval Widget
**User Story:** As a developer, I want a streamlined diff widget to review and approve code changes, so that I can maintain control and auditability.

#### Acceptance Criteria
1. THE Diff Approval Widget SHALL display changes grouped by logical task (Ubiquitous)
2. WHEN a code change is proposed THEN THE Widget SHALL show an inline, two-column diff view (Event-driven)
3. WHEN the user approves or rejects a change THEN THE system SHALL update task status and log the action in Reasoning Log (Event-driven)
4. WHEN the Explain button is pressed THEN THE system SHALL show an agent-generated summary (Event-driven)
5. IF approval/reject fails THEN THE Widget SHALL re-prompt or display error unobtrusively (Unwanted event)

### Requirement 3: Semantic Code Graph Explorer
**User Story:** As a developer, I want to visually explore code relationships and agent proposals, so that I can navigate and understand context efficiently.

#### Acceptance Criteria
1. THE Graph Explorer SHALL show relationships relevant to the current task (Ubiquitous)
2. WHEN nodes are expanded THEN THE Explorer SHALL reveal Calls, Used By, Imports (Event-driven)
3. WHEN agent proposals are available THEN THE Explorer SHALL overlay them on relevant nodes (State-driven)
4. WHEN a node is selected THEN THE system SHALL display corresponding code and task context (Event-driven)
5. WHILE overlays are active THEN THE Explorer SHALL maintain accurate relationships and visual state (State-driven)

### Requirement 4: Conversation & Reasoning Log
**User Story:** As a developer, I want a log of all agent interactions, proposals, and user approvals, so that I can trace decisions and context.

#### Acceptance Criteria
1. THE Reasoning Log SHALL capture agent decisions, proposals, reviews, and user approvals (Ubiquitous)
2. WHEN filtered by agent or keyword THEN THE Log SHALL restrict entries accordingly (Event-driven)
3. WHEN a log entry references code THEN THE system SHALL enable jump to affected code (Event-driven)
4. WHEN a log entry is added THEN THE system SHALL timestamp and attribute it to the responsible agent/user (Event-driven)

### Requirement 5: In-Context Actions
**User Story:** As a developer, I want the ability to trigger context-specific actions, so that I can efficiently review and approve agent proposals.

#### Acceptance Criteria
1. THE system SHALL provide context-aware action menus on right-click or hover (Ubiquitous)
2. WHEN an action is triggered THEN THE system SHALL execute the labeled function and update context (Event-driven)
3. IF action visibility criteria are not met THEN THE menu SHALL hide the action (Unwanted event)

### Requirement 6: Agent Status Dashboard
**User Story:** As a developer, I want unobtrusive tracking of agent progress/errors/readiness, so that I can monitor workflow health.

#### Acceptance Criteria
1. THE Agent Status Dashboard SHALL display agent progress, errors, and readiness in real time (Ubiquitous)
2. WHEN clicked THEN THE system SHALL show agent activity trace (Event-driven)
3. IF agent activity trace fails THEN THE dashboard SHALL display error unobtrusively (Unwanted event)

### Requirement 7: Resource & API Status Footer
**User Story:** As a developer, I want live updates on resource usage and API quotas, so that I can avoid disruptions and optimize workflows.

#### Acceptance Criteria
1. THE Resource Footer SHALL display API token usage, cost, quotas, and vector store health (Ubiquitous)
2. WHEN resource or API usage updates THEN THE footer SHALL update its display instantly without blocking UI (Event-driven)
3. IF vector store or API integration fails THEN THE footer SHALL show status as "degraded" or "offline" (Unwanted event)

### Requirement 8: CLI Integration
**User Story:** As a terminal-centric developer, I want to mirror all IDE flows in the CLI, so that I can work efficiently without switching context.

#### Acceptance Criteria
1. THE CLI SHALL support commands for all major IDE flows: approve, diff, status, tasks, code, review, graph, context (Ubiquitous)
2. WHEN a CLI command is executed THEN THE system SHALL invoke the corresponding IDE functionality (Event-driven)
3. IF a CLI command fails THEN THE system SHALL return non-zero exit code and descriptive error (Unwanted event)

### Requirement 9: Data Models & Integration
**User Story:** As a developer, I want all UI features to use consistent data models for tasks, agents, code changes, graphs, logs, and token usage, so that reliability and interoperability are maintained.

#### Acceptance Criteria
1. THE system SHALL use Nexus types: Task, SubTask, AgentInfo, CodeChange, SemanticCodeGraphData, AgentMessage, TokenUsage for all UI features (Ubiquitous)
2. WHEN a new data model is required THEN THE system SHALL extend existing Nexus types without breaking compatibility (Complex)

### Requirement 10: Error Handling
**User Story:** As a developer, I want errors to be displayed unobtrusively, with clear recovery, so that workflow interruptions are minimized.

#### Acceptance Criteria
1. THE UI SHALL display errors unobtrusively; agent errors surfaced in dashboard (Ubiquitous)
2. WHEN approval/reject actions fail THEN THE system SHALL re-prompt or display error (Event-driven)
3. WHEN CLI errors occur THEN THE system SHALL return codes for integration/test flows (Event-driven)

### Requirement 11: Testing & Correctness
**User Story:** As a system architect, I want robust testing covering widget behaviors, properties, and end-to-end flows, so that correctness is guaranteed.

#### Acceptance Criteria
1. THE system SHALL provide example-based unit tests for widget behaviors (Ubiquitous)
2. THE system SHALL provide property-based tests covering core correctness properties (Ubiquitous)
3. THE system SHALL provide integration tests for end-to-end agent proposals, user actions, code updates, and task completion (Ubiquitous)

### Requirement 12: Performance
**User Story:** As a developer, I want instant rendering and live updates, so that the IDE remains responsive even as project size grows.

#### Acceptance Criteria
1. THE system SHALL render all widgets in under 100ms (Ubiquitous)
2. THE system SHALL scale graph overlay operations with project size (State-driven)
3. THE resource footer SHALL update live without blocking UI (State-driven)

### Requirement 13: Security
**User Story:** As a developer, I want secure handling of user and agent data, so that privacy and integrity are protected in all workflows.

#### Acceptance Criteria
1. THE system SHALL never show user-sensitive data by default (Ubiquitous)
2. Approval/reject actions SHALL be locked to authenticated users (Ubiquitous)
3. THE system SHALL ensure secure access to vector store and agent logs (Ubiquitous)

### Requirement 14: Dependencies
**User Story:** As a developer, I want to leverage proven libraries and modules, so that the IDE is reliable and maintainable.

#### Acceptance Criteria
1. THE system SHALL use React, TypeScript, existing Nexus types and agent modules for the IDE shell (Ubiquitous)
2. THE system SHALL use fast-check for property tests (Ubiquitous)
3. THE system SHALL use Qdrant, tree-sitter, OpenAI/Anthropic SDKs for agent context (Ubiquitous)

