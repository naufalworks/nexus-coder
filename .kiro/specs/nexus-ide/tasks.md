# Implementation Plan: nexus-ide

## Overview

This plan outlines the actionable tasks to implement a minimalist, AI-powered coding IDE and integrated CLI for Nexus V2. Tasks cover widgetized UI foundations, intelligent agent/context flows, semantic code navigation, property-based tests, performance, security, and CLI parity. Each task references granular requirements from the spec.

## Tasks

- [x] 1. IDE Shell & Widget System Foundation
  - Set up React + TypeScript project structure in the IDE shell
  - Implement composable widget system (mount/unmount, layout, minimal chrome)
  - Integrate Nexus data models (Task, AgentInfo, etc.)
  - _Requirements: 1.1, 9.1, 14.1_

- [x] 2. Intelligent Task & Change Panel Widget
  - [x] 2.1 Implement Task Panel component
    - List all active tasks, agent assignments, affected files/functions
    - Implement filtering by status and agent
    - Real-time update associations on agent assignment changes
    - _Requirements: 1.1–1.4, 9.1_
  - [x] 2.2 Write property-based test for task panel status and log update
    - **Property 1: Approval/Reject updates task & log**
    - **Validates: Requirements 2.3, 4.1**
  - [x] 2.3 Write unit tests for Task Panel filters
    - _Requirements: 1.2_

- [x] 3. Minimalist Code Diff/Approval Widget
  - [x] 3.1 Implement Diff Approval component
    - Display changes grouped by logical task, inline two-column diff
    - One-click Approve/Reject/Explain, impact summary
    - Obtrusive error display and re-prompt for failed approval/reject
    - _Requirements: 2.1–2.5, 10.2_
  - [x] 3.2 Write property-based test for diff grouping
    - **Property 2: Diff widget groups by logical task**
    - **Validates: Requirements 2.1, 2.3**
  - [x] 3.3 Write unit tests for approval workflow
    - _Requirements: 2.3, 2.5_

- [x] 4. Semantic Code Graph Explorer Widget
  - [x] 4.1 Implement Graph Explorer component
    - Visualize relationships (Calls, Used By, Imports) relevant to active task
    - Overlay agent proposals on relevant nodes
    - Maintain accurate relationships with overlays active
    - _Requirements: 3.1–3.5_
  - [x] 4.2 Write property-based test for agent proposal overlay
    - **Property 3: Semantic graph overlays agent proposals**
    - **Validates: Requirements 3.3, 3.5**
  - [x] 4.3 Write unit tests for graph navigation/expansion
    - _Requirements: 3.2, 3.4_

- [x] 5. Conversation & Reasoning Log Widget
  - [x] 5.1 Implement Reasoning Log component
    - Capture agent decisions, proposals, user approvals with timestamp/attribution
    - Filter/search by agent/keyword
    - Jump to code from log entry
    - _Requirements: 4.1–4.4_
  - [x] 5.2 Write unit tests for log filtering/search and jump-to-code
    - _Requirements: 4.2, 4.3_

- [x] 6. In-Context Actions System
  - [x] 6.1 Implement context-aware action menus (right-click/hover)
    - Trigger Approve, Review Impact, Request Explanation as context functions
    - Hide actions when visibility criteria not met
    - _Requirements: 5.1–5.3_
  - [x] 6.2 Write unit tests for context menu visibility and execution
    - _Requirements: 5.2, 5.3_

- [x] 7. Agent Status Dashboard Widget
  - [x] 7.1 Implement Agent Status Dashboard
    - Display agent progress, errors, readiness in real time
    - Click for agent activity trace
    - Obtrusive error display on trace failure
    - _Requirements: 6.1–6.3_
  - [x] 7.2 Write unit tests for progress update/error display
    - _Requirements: 6.1, 6.3_

- [x] 8. Resource & API Status Footer Widget
  - [x] 8.1 Implement Resource Footer component
    - Display API token usage, quotas, vector store health
    - Instantly update on resource/API changes, block UI if degraded/offline
    - _Requirements: 7.1–7.3, 12.3, 14.2_
  - [x] 8.2 Write property-based test for accurate live updates
    - **Property 4: Resource footer reflects accurate API state**
    - **Validates: Requirements 7.2, 12.3**
  - [x] 8.3 Write unit tests for footer error status and update
    - _Requirements: 7.3_

- [x] 9. CLI Integration
  - [x] 9.1 Implement CLI commands mirroring all IDE widget flows
    - Approve, diff, status, tasks, code, review, graph, context
    - Sync CLI commands with IDE functionality (use Commander, inquirer, ora, chalk)
    - Return non-zero exit code and error on failure
    - _Requirements: 8.1–8.3, 14.1_
  - [x] 9.2 Write unit tests for CLI command flows
    - _Requirements: 8.2, 8.3_

- [x] 10. Data Models & Existing Integration
  - Integrate all widgets and CLI flows with existing Nexus types (Task, SubTask, AgentInfo, CodeChange, SemanticCodeGraphData, AgentMessage, TokenUsage)
  - Extend models as needed, ensure no breaking changes
  - _Requirements: 9.1, 9.2_

- [x] 11. Error Handling, Performance & Security Implementation
  - Integrate unobtrusive error display in UI, robust error codes in CLI
  - Optimize rendering: all widgets <100ms, live updates for overlays/footer
  - Enforce authenticated user for approval/reject, secure vector store/agent log access
  - _Requirements: 10.1–10.3, 12.1–12.3, 13.1–13.3_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all property and unit tests execute successfully; ask user if questions arise

## Notes
- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements and property tests for traceability.
- Checkpoints ensure incremental validation.
- Property-based tests are powered by fast-check and validate universal correctness properties.
- Unit tests validate widget behaviors and CLI flows.
