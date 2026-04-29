import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Task, CodeChange, ChangeType, AgentInfo, TaskStatus, AgentMessage, SemanticCodeGraphData } from '../types';
import { filterTasks, applyApprovalAction, getAssignedAgents, getAffectedFiles } from '../widgets/TaskPanel';
import { groupChangesByTask, calculateImpactSummary, parseDiffToColumns } from '../widgets/DiffApproval';
import { getRelevantNodeIds, getRelatedNodes, enrichNodes, getOverlayMapping } from '../widgets/GraphExplorer';

/**
 * CLI command handlers that mirror IDE widget flows.
 * Each command delegates to the corresponding widget helper functions.
 */

export interface CLIContext {
  tasks: Task[];
  agents: AgentInfo[];
  changes: CodeChange[];
  graph?: SemanticCodeGraphData;
  log: AgentMessage[];
}

/**
 * Approve command: Approve a specific code change
 * Mirrors DiffApproval widget functionality
 */
export async function approveCommand(
  context: CLIContext,
  options: { taskId?: string; changeIndex?: number; all?: boolean }
): Promise<void> {
  try {
    if (options.all) {
      // Approve all changes
      const spinner = ora('Approving all changes...').start();
      let approvedCount = 0;
      
      for (const change of context.changes) {
        change.approved = true;
        approvedCount++;
      }
      
      spinner.succeed(`Approved ${approvedCount} change(s)`);
      return;
    }

    if (!options.taskId || options.changeIndex === undefined) {
      throw new Error('Task ID and change index are required');
    }

    const task = context.tasks.find(t => t.id === options.taskId);
    if (!task) {
      throw new Error(`Task not found: ${options.taskId}`);
    }

    if (!task.result?.changes || options.changeIndex >= task.result.changes.length) {
      throw new Error(`Invalid change index: ${options.changeIndex}`);
    }

    const { updatedTask, logEntry } = applyApprovalAction(
      task,
      options.changeIndex,
      true,
      'cli-user'
    );

    // Update context
    const taskIndex = context.tasks.findIndex(t => t.id === options.taskId);
    context.tasks[taskIndex] = updatedTask;
    context.log.push(logEntry);

    console.log(chalk.green(`✓ Approved change ${options.changeIndex} for task ${options.taskId}`));
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Diff command: Display code changes grouped by task
 * Mirrors DiffApproval widget functionality
 */
export async function diffCommand(
  context: CLIContext,
  options: { taskId?: string; verbose?: boolean }
): Promise<void> {
  try {
    let changes = context.changes;
    
    if (options.taskId) {
      const task = context.tasks.find(t => t.id === options.taskId);
      if (!task) {
        throw new Error(`Task not found: ${options.taskId}`);
      }
      changes = task.result?.changes || [];
    }

    if (changes.length === 0) {
      console.log(chalk.yellow('No changes to display'));
      return;
    }

    const grouped = groupChangesByTask(changes, context.tasks);

    for (const group of grouped) {
      console.log(chalk.bold.cyan(`\n${group.taskInstruction}`));
      console.log(chalk.dim(calculateImpactSummary(group.changes)));

      for (let i = 0; i < group.changes.length; i++) {
        const change = group.changes[i];
        console.log(chalk.bold(`\n  ${change.file} (${change.type})`));
        console.log(chalk.dim(`  Risk: ${change.risk} | Impact: ${change.impact.join(', ')}`));
        console.log(`  ${change.reasoning}`);

        if (options.verbose) {
          const { oldLines, newLines } = parseDiffToColumns(change.diff);
          console.log(chalk.dim('\n  Diff:'));
          for (let j = 0; j < Math.max(oldLines.length, newLines.length); j++) {
            const old = oldLines[j] || '';
            const new_ = newLines[j] || '';
            if (old && !new_) {
              console.log(chalk.red(`  - ${old}`));
            } else if (!old && new_) {
              console.log(chalk.green(`  + ${new_}`));
            } else if (old !== new_) {
              console.log(chalk.dim(`    ${old}`));
            }
          }
        }

        console.log(chalk.dim(`  Status: ${change.approved ? 'Approved' : 'Pending'}`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Status command: Display agent status and progress
 * Mirrors AgentStatus widget functionality
 */
export async function statusCommand(
  context: CLIContext,
  options: { agent?: string }
): Promise<void> {
  try {
    let agents = context.agents;
    
    if (options.agent) {
      agents = agents.filter(a => a.name === options.agent);
      if (agents.length === 0) {
        throw new Error(`Agent not found: ${options.agent}`);
      }
    }

    console.log(chalk.bold.cyan('\nAgent Status'));
    
    for (const agent of agents) {
      const agentTasks = context.tasks.filter(t => 
        t.subTasks.some(st => st.assignedAgent === agent.name)
      );
      
      const status = agent.status || 'idle';
      const statusColor = status === 'error' ? 'red' : status === 'busy' ? 'yellow' : 'green';
      
      console.log(chalk.bold(`\n  ${agent.name}`));
      console.log(`  Status: ${chalk[statusColor](status)}`);
      console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
      
      if (agent.currentTask) {
        console.log(`  Current Task: ${agent.currentTask}`);
      }
      
      if (agentTasks.length > 0) {
        console.log(`  Assigned Tasks: ${agentTasks.length}`);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Tasks command: List and filter tasks
 * Mirrors TaskPanel widget functionality
 */
export async function tasksCommand(
  context: CLIContext,
  options: { status?: TaskStatus; agent?: string; verbose?: boolean }
): Promise<void> {
  try {
    const filtered = filterTasks(context.tasks, {
      status: options.status,
      agent: options.agent,
    });

    if (filtered.length === 0) {
      console.log(chalk.yellow('No tasks found'));
      return;
    }

    console.log(chalk.bold.cyan(`\nTasks (${filtered.length})`));

    for (const task of filtered) {
      const statusColor = 
        task.status === TaskStatus.COMPLETED ? 'green' :
        task.status === TaskStatus.FAILED ? 'red' :
        'yellow';

      console.log(chalk.bold(`\n  ${task.id}`));
      console.log(`  ${task.instruction}`);
      console.log(`  Status: ${chalk[statusColor](task.status)}`);

      if (options.verbose) {
        const agents = getAssignedAgents(task);
        if (agents.length > 0) {
          console.log(`  Agents: ${agents.join(', ')}`);
        }

        const files = getAffectedFiles(task);
        if (files.length > 0) {
          console.log(`  Files: ${files.join(', ')}`);
        }

        if (task.subTasks.length > 0) {
          console.log(`  Sub-tasks: ${task.subTasks.length}`);
          for (const st of task.subTasks) {
            console.log(chalk.dim(`    - ${st.assignedAgent}: ${st.status}`));
          }
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Code command: Display code context for a task
 * Mirrors TaskPanel and DiffApproval functionality
 */
export async function codeCommand(
  context: CLIContext,
  options: { taskId: string }
): Promise<void> {
  try {
    const task = context.tasks.find(t => t.id === options.taskId);
    if (!task) {
      throw new Error(`Task not found: ${options.taskId}`);
    }

    console.log(chalk.bold.cyan(`\nCode Context: ${task.id}`));
    console.log(chalk.bold(`Instruction: ${task.instruction}`));

    const files = getAffectedFiles(task);
    if (files.length > 0) {
      console.log(chalk.bold('\nAffected Files:'));
      files.forEach(f => console.log(`  - ${f}`));
    }

    if (task.context) {
      console.log(chalk.bold('\nContext:'));
      console.log(task.context);
    }

    if (task.result?.changes) {
      console.log(chalk.bold(`\nChanges: ${task.result.changes.length}`));
      for (const change of task.result.changes) {
        console.log(`  - ${change.file} (${change.type})`);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Review command: Display reasoning log with filters
 * Mirrors ReasoningLog widget functionality
 */
export async function reviewCommand(
  context: CLIContext,
  options: { agent?: string; keyword?: string; limit?: number }
): Promise<void> {
  try {
    let log = context.log;

    if (options.agent) {
      log = log.filter(m => m.agent === options.agent);
    }

    if (options.keyword) {
      const kw = options.keyword;
      log = log.filter(m => 
        m.content.toLowerCase().includes(kw.toLowerCase())
      );
    }

    if (options.limit) {
      log = log.slice(-options.limit);
    }

    if (log.length === 0) {
      console.log(chalk.yellow('No log entries found'));
      return;
    }

    console.log(chalk.bold.cyan(`\nReasoning Log (${log.length} entries)`));

    for (const entry of log) {
      console.log(chalk.bold(`\n  [${entry.agent}] ${entry.timestamp.toISOString()}`));
      console.log(`  ${entry.content}`);
      
      if (entry.metadata) {
        const meta = entry.metadata;
        if (meta.file) {
          console.log(chalk.dim(`  File: ${meta.file}${meta.line ? `:${meta.line}` : ''}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Graph command: Display semantic code graph for a task
 * Mirrors GraphExplorer widget functionality
 */
export async function graphCommand(
  context: CLIContext,
  options: { taskId: string; expand?: boolean }
): Promise<void> {
  try {
    if (!context.graph) {
      throw new Error('Semantic code graph not available');
    }

    const task = context.tasks.find(t => t.id === options.taskId);
    if (!task) {
      throw new Error(`Task not found: ${options.taskId}`);
    }

    const relevantNodeIds = getRelevantNodeIds(context.graph, task);
    const overlayMapping = getOverlayMapping(context.graph, context.changes);
    const enriched = enrichNodes(context.graph, relevantNodeIds, overlayMapping);

    console.log(chalk.bold.cyan(`\nSemantic Graph: ${task.id}`));
    console.log(chalk.dim(`${enriched.length} relevant nodes, ${overlayMapping.size} with proposals`));

    for (const item of enriched) {
      const { node, hasOverlay, overlayProposals, relationships } = item;
      
      console.log(chalk.bold(`\n  ${node.name} (${node.type})`));
      console.log(chalk.dim(`  ${node.file}:${node.line}-${node.endLine}`));
      
      if (hasOverlay) {
        console.log(chalk.yellow(`  ⚠ ${overlayProposals.length} proposal(s)`));
      }

      if (options.expand) {
        const calls = relationships.get('calls') || [];
        const usedBy = relationships.get('used_by') || [];
        const imports = relationships.get('imports') || [];

        if (calls.length > 0) {
          console.log(chalk.dim(`  Calls: ${calls.map(n => n.name).join(', ')}`));
        }
        if (usedBy.length > 0) {
          console.log(chalk.dim(`  Used by: ${usedBy.map(n => n.name).join(', ')}`));
        }
        if (imports.length > 0) {
          console.log(chalk.dim(`  Imports: ${imports.map(n => n.name).join(', ')}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Context command: Display full context for a task
 * Combines multiple widget functionalities
 */
export async function contextCommand(
  context: CLIContext,
  options: { taskId: string }
): Promise<void> {
  try {
    const task = context.tasks.find(t => t.id === options.taskId);
    if (!task) {
      throw new Error(`Task not found: ${options.taskId}`);
    }

    console.log(chalk.bold.cyan(`\nFull Context: ${task.id}`));
    console.log(chalk.bold(`\nInstruction:`));
    console.log(`  ${task.instruction}`);
    
    console.log(chalk.bold(`\nStatus: ${task.status}`));
    
    if (task.classification) {
      console.log(chalk.bold(`\nClassification:`));
      console.log(`  Type: ${task.classification.type}`);
      console.log(`  Priority: ${task.classification.priority}`);
      console.log(`  Complexity: ${task.classification.complexity}`);
      console.log(`  Affected Areas: ${task.classification.affectedAreas.join(', ')}`);
    }

    const agents = getAssignedAgents(task);
    if (agents.length > 0) {
      console.log(chalk.bold(`\nAssigned Agents:`));
      agents.forEach(a => console.log(`  - ${a}`));
    }

    const files = getAffectedFiles(task);
    if (files.length > 0) {
      console.log(chalk.bold(`\nAffected Files:`));
      files.forEach(f => console.log(`  - ${f}`));
    }

    if (task.subTasks.length > 0) {
      console.log(chalk.bold(`\nSub-tasks: ${task.subTasks.length}`));
      for (const st of task.subTasks) {
        console.log(`  - ${st.assignedAgent}: ${st.instruction} (${st.status})`);
      }
    }

    if (task.result?.changes) {
      console.log(chalk.bold(`\nChanges: ${task.result.changes.length}`));
      const summary = calculateImpactSummary(task.result.changes);
      console.log(chalk.dim(`  ${summary}`));
    }

    if (task.tokenUsage) {
      console.log(chalk.bold(`\nToken Usage:`));
      console.log(`  Total: ${task.tokenUsage.total}`);
      console.log(`  Cost: $${task.tokenUsage.estimatedCost.toFixed(4)}`);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Chat command: Start an interactive agent chat session
 * Supports --agent for targeting a specific agent (manual mode),
 * --context for adding files to session context,
 * --auto/--no-auto for enabling/disabling automatic agent routing,
 * and --full-context/--no-full-context for enabling/disabling full graph context.
 */
export async function chatCommand(
  chatService: any,
  registry: any,
  options: {
    agent?: string;
    context?: string[];
    auto?: boolean;
    fullContext?: boolean;
  }
): Promise<void> {
  try {
    // Check if graph is initialized
    const graph = chatService.contextEngine?.getGraph?.();
    if (!graph) {
      throw new Error('Graph not initialized. Run `nexus init` first.');
    }

    // Get available agents
    const agents = registry.listAgents();
    if (agents.length === 0) {
      throw new Error('No agents available. Register agents first.');
    }

    // Determine mode based on presence of --agent option
    const mode = options.agent ? 'manual' : 'auto';
    
    // Select agent for manual mode
    let agentName = options.agent;
    if (mode === 'manual' && !agentName) {
      if (agents.length === 1) {
        agentName = agents[0].name;
      } else {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'agent',
            message: 'Select an agent to chat with:',
            choices: agents.map((a: { name: string; capabilities: string[] }) => ({
              name: `${a.name} (${a.capabilities.join(', ')})`,
              value: a.name,
            })),
          },
        ]);
        agentName = answer.agent;
      }
    }

    // Verify agent exists for manual mode
    if (mode === 'manual' && agentName) {
      const agent = registry.getAgent(agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}. Available: ${agents.map((a: { name: string }) => a.name).join(', ')}`);
      }
    }

    // Create session with appropriate options
    const session = chatService.createSession({
      mode,
      agentName,
      autoRouting: options.auto ?? (mode === 'auto'),
      fullGraphContext: options.fullContext ?? (mode === 'auto'),
    });

    // Display session information
    console.log(chalk.bold.green(`\n💬 Chat session started (${mode} mode)`));
    
    if (mode === 'auto') {
      console.log(chalk.dim('Agent will be automatically selected based on your message'));
    } else {
      console.log(chalk.dim(`Agent: ${agentName}`));
    }
    
    console.log(chalk.dim(`Session ID: ${session.id}`));
    console.log(chalk.dim('Type "exit" or "quit" to end the session\n'));

    // Add context files if provided
    if (options.context && options.context.length > 0) {
      for (const file of options.context) {
        session.contextFiles.push(file);
        console.log(chalk.dim(`Added context file: ${file}`));
      }
      console.log();
    }

    // REPL loop
    let messageCount = 0;
    let currentAgent = agentName || 'auto';
    
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: `${chalk.bold.green('You')}:`,
          prefix: '',
        },
      ]);

      if (!message.trim()) continue;
      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        console.log(chalk.dim('\nSession ended.'));
        chatService.closeSession(session.id);
        break;
      }

      // Send message and stream response
      const command = {
        type: 'message' as const,
        content: message,
      };

      // In auto mode, the agent name may change, so we display it dynamically
      const displayAgent = mode === 'auto' ? session.agentName : currentAgent;
      process.stdout.write(`${chalk.bold.blue(displayAgent)}: `);
      let fullResponse = '';

      try {
        for await (const chunk of chatService.sendMessage(session.id, command)) {
          process.stdout.write(chunk.chunk);
          fullResponse += chunk.chunk;
        }
        console.log('\n');
        messageCount++;
        
        // Update current agent for next iteration (in case it changed)
        currentAgent = session.agentName;
      } catch (error) {
        console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }

    console.log(chalk.dim(`Messages exchanged: ${messageCount}`));
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Search command: Perform semantic code search
 * Mirrors SemanticSearch widget functionality
 */
export async function searchCommand(
  vectorStore: any,
  traversal: any,
  query: string,
  options: {
    limit?: number;
    minScore?: number;
    graph?: boolean;
    file?: string;
    type?: string;
  }
): Promise<void> {
  const spinner = ora('Searching...').start();

  try {
    // Lazy import to avoid circular dependencies
    const { SemanticSearchService } = await import('../services/search-service');
    const { SearchResultType } = await import('../types/search');

    const searchService = new SemanticSearchService();

    // Build search query
    const searchQuery = {
      text: query,
      limit: options.limit ?? 10,
      minScore: options.minScore ?? 0.5,
      fileFilter: options.file,
      typeFilter: options.type as any,
      includeGraphContext: options.graph ?? true,
    };

    // Execute search
    const response = await searchService.executeSearch(
      searchQuery,
      vectorStore,
      traversal
    );

    spinner.succeed(`Found ${response.results.length} result(s) in ${response.searchTimeMs}ms`);

    if (response.results.length === 0) {
      console.log(chalk.yellow('\nNo results found'));
      return;
    }

    // Display results
    console.log(chalk.bold.cyan(`\nSearch Results for: "${query}"`));
    console.log(chalk.dim(`Total matches: ${response.totalMatches}, Graph nodes explored: ${response.graphNodesExplored}`));

    for (let i = 0; i < response.results.length; i++) {
      const result = response.results[i];
      
      console.log(chalk.bold(`\n${i + 1}. ${chalk.cyan(result.file)}:${result.lineRange.start}-${result.lineRange.end}`));
      console.log(chalk.dim(`   Type: ${result.matchType} | Score: ${result.relevanceScore.toFixed(3)}`));
      
      // Display content snippet (truncate if too long)
      const snippet = result.content.length > 200 
        ? result.content.substring(0, 200) + '...' 
        : result.content;
      console.log(`   ${snippet.split('\n').join('\n   ')}`);

      // Display graph context if available
      if (result.graphContext.length > 0) {
        console.log(chalk.dim(`   Graph context: ${result.graphContext.length} related node(s)`));
        
        if (options.graph) {
          for (const ctx of result.graphContext.slice(0, 3)) {
            console.log(chalk.dim(`     → ${ctx.relationship}: ${ctx.node.name} (distance: ${ctx.distance})`));
          }
          if (result.graphContext.length > 3) {
            console.log(chalk.dim(`     ... and ${result.graphContext.length - 3} more`));
          }
        }
      }
    }

    console.log(); // Empty line at end
  } catch (error) {
    spinner.fail('Search failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * Impact command: Analyze code change impact
 * Mirrors ImpactAnalysis widget functionality
 */
export async function impactCommand(
  impactService: any,
  graph: SemanticCodeGraphData,
  traversal: any,
  options: {
    file?: string;
    node?: string;
    depth?: number;
    json?: boolean;
  }
): Promise<void> {
  const spinner = ora('Analyzing impact...').start();

  try {
    // Lazy import to avoid circular dependencies
    const { ImpactAnalysisService } = await import('../services/impact-service');
    const { ImpactSeverity } = await import('../types/impact');
    const { ChangeType } = await import('../types/task');

    // Validate options
    if (!options.file && !options.node) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error: Either --file or --node must be provided'));
      process.exit(1);
      return;
    }

    // Check if graph is available
    if (!graph || graph.nodes.size === 0) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error: Graph not available. Run `nexus init` first.'));
      process.exit(1);
      return;
    }

    const service = impactService || new ImpactAnalysisService();
    const maxDepth = options.depth ?? 4;

    let analysis;

    if (options.node) {
      // Analyze from node
      const node = traversal.getNode(options.node);
      if (!node) {
        spinner.fail('Analysis failed');
        console.error(chalk.red(`Error: Node not found: ${options.node}. Run \`nexus init\` to rebuild graph.`));
        process.exit(1);
        return;
      }

      analysis = service.analyzeNode(options.node, graph, traversal, maxDepth);
    } else if (options.file) {
      // Analyze from file
      const change = {
        file: options.file,
        type: ChangeType.MODIFY,
        reasoning: `Analyzing impact of changes to ${options.file}`,
        impact: [],
        risk: 'medium' as const,
        diff: '',
        content: '',
        approved: false,
      };

      analysis = service.analyzeChange(change, graph, traversal, maxDepth);

      // Check if file was found
      if (!analysis.seedNodeId) {
        spinner.fail('Analysis failed');
        console.error(chalk.red(`Error: File not found in graph: ${options.file}. Run \`nexus init\` to rebuild graph.`));
        process.exit(1);
        return;
      }
    }

    spinner.succeed('Analysis complete');

    // Output results
    if (options.json) {
      // JSON output
      const jsonOutput = {
        seedNodeId: analysis.seedNodeId,
        directImpacts: analysis.directImpacts.map((impact: any) => ({
          nodeId: impact.node.id,
          nodeName: impact.node.name,
          file: impact.node.file,
          line: impact.node.line,
          distance: impact.distance,
          severity: impact.severity,
          reason: impact.reason,
        })),
        transitiveImpacts: analysis.transitiveImpacts.map((impact: any) => ({
          nodeId: impact.node.id,
          nodeName: impact.node.name,
          file: impact.node.file,
          line: impact.node.line,
          distance: impact.distance,
          severity: impact.severity,
          reason: impact.reason,
        })),
        affectedTests: analysis.affectedTests.map((test: any) => ({
          nodeId: test.node.id,
          nodeName: test.node.name,
          file: test.node.file,
          line: test.node.line,
        })),
        riskAssessment: {
          overall: analysis.riskAssessment.overall,
          score: analysis.riskAssessment.score,
          directImpactCount: analysis.riskAssessment.directImpactCount,
          transitiveImpactCount: analysis.riskAssessment.transitiveImpactCount,
          affectedTestCount: analysis.riskAssessment.affectedTestCount,
          affectedFileCount: analysis.riskAssessment.affectedFileCount,
          reasoning: analysis.riskAssessment.reasoning,
        },
        stats: {
          nodesTraversed: analysis.stats.nodesTraversed,
          edgesFollowed: analysis.stats.edgesFollowed,
          maxDepthReached: analysis.stats.maxDepthReached,
          analysisTimeMs: analysis.stats.analysisTimeMs,
        },
      };

      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      // Human-readable output
      const sourceFile = options.file || analysis.seedChange?.file || 'unknown';
      
      console.log(chalk.bold.cyan(`\nImpact Analysis: ${sourceFile}`));
      console.log(chalk.dim('━'.repeat(80)));
      console.log();

      // Risk assessment
      const riskEmoji: Record<string, string> = {
        [ImpactSeverity.CRITICAL]: '🔴',
        [ImpactSeverity.HIGH]: '🟠',
        [ImpactSeverity.MEDIUM]: '🟡',
        [ImpactSeverity.LOW]: '🔵',
        [ImpactSeverity.INFO]: '⚪',
      };

      const riskColor: Record<string, 'red' | 'yellow' | 'blue' | 'gray' | 'white'> = {
        [ImpactSeverity.CRITICAL]: 'red',
        [ImpactSeverity.HIGH]: 'yellow',
        [ImpactSeverity.MEDIUM]: 'yellow',
        [ImpactSeverity.LOW]: 'blue',
        [ImpactSeverity.INFO]: 'gray',
      };

      const emoji = riskEmoji[analysis.riskAssessment.overall] || '⚪';
      const color = riskColor[analysis.riskAssessment.overall] || 'white';

      console.log(chalk.bold(`Risk Assessment: ${emoji} ${chalk[color](analysis.riskAssessment.overall.toUpperCase())} (score: ${analysis.riskAssessment.score}/100)`));
      
      // Count by severity
      const criticalCount = [...analysis.directImpacts, ...analysis.transitiveImpacts].filter(
        (i: any) => i.severity === ImpactSeverity.CRITICAL
      ).length;
      const highCount = [...analysis.directImpacts, ...analysis.transitiveImpacts].filter(
        (i: any) => i.severity === ImpactSeverity.HIGH
      ).length;
      const mediumCount = [...analysis.directImpacts, ...analysis.transitiveImpacts].filter(
        (i: any) => i.severity === ImpactSeverity.MEDIUM
      ).length;

      if (criticalCount > 0 || highCount > 0 || mediumCount > 0) {
        const parts = [];
        if (criticalCount > 0) parts.push(`${criticalCount} critical`);
        if (highCount > 0) parts.push(`${highCount} high`);
        if (mediumCount > 0) parts.push(`${mediumCount} medium`);
        console.log(parts.join(', ') + ' impacts');
      }
      console.log();

      // Direct impacts
      if (analysis.directImpacts.length > 0) {
        console.log(chalk.bold(`Direct Impacts (${analysis.directImpacts.length}):`));
        for (const impact of analysis.directImpacts.slice(0, 10)) {
          const impactEmoji = riskEmoji[impact.severity] || '⚪';
          const impactColor = riskColor[impact.severity] || 'white';
          console.log(`  ${impactEmoji} ${chalk[impactColor](impact.node.name)} (${impact.severity.toUpperCase()}) - ${impact.node.file}:${impact.node.line}`);
          console.log(chalk.dim(`     ${impact.reason}`));
          console.log();
        }
        if (analysis.directImpacts.length > 10) {
          console.log(chalk.dim(`  ... and ${analysis.directImpacts.length - 10} more`));
          console.log();
        }
      }

      // Transitive impacts
      if (analysis.transitiveImpacts.length > 0) {
        console.log(chalk.bold(`Transitive Impacts (${analysis.transitiveImpacts.length}):`));
        for (const impact of analysis.transitiveImpacts.slice(0, 10)) {
          const impactEmoji = riskEmoji[impact.severity] || '⚪';
          const impactColor = riskColor[impact.severity] || 'white';
          console.log(`  ${impactEmoji} ${chalk[impactColor](impact.node.name)} (${impact.severity.toUpperCase()}) - ${impact.node.file}:${impact.node.line}`);
          console.log(chalk.dim(`     ${impact.reason}`));
          console.log();
        }
        if (analysis.transitiveImpacts.length > 10) {
          console.log(chalk.dim(`  ... and ${analysis.transitiveImpacts.length - 10} more`));
          console.log();
        }
      }

      // Affected files
      if (analysis.affectedFiles.length > 0) {
        console.log(chalk.bold(`Affected Files (${analysis.affectedFiles.length}):`));
        for (const affectedFile of analysis.affectedFiles.slice(0, 10)) {
          const fileEmoji = riskEmoji[affectedFile.highestSeverity] || '⚪';
          const fileColor = riskColor[affectedFile.highestSeverity] || 'white';
          console.log(`  • ${affectedFile.file} (${chalk[fileColor](affectedFile.highestSeverity.toUpperCase())}, ${affectedFile.impactedNodes.length} node${affectedFile.impactedNodes.length === 1 ? '' : 's'})`);
        }
        if (analysis.affectedFiles.length > 10) {
          console.log(chalk.dim(`  ... and ${analysis.affectedFiles.length - 10} more`));
        }
        console.log();
      }

      // Affected tests
      if (analysis.affectedTests.length > 0) {
        console.log(chalk.bold(`Affected Tests (${analysis.affectedTests.length}):`));
        
        // Group by file
        const testsByFile = new Map<string, any[]>();
        for (const test of analysis.affectedTests) {
          const file = test.node.file;
          if (!testsByFile.has(file)) {
            testsByFile.set(file, []);
          }
          testsByFile.get(file)!.push(test);
        }

        for (const [file, tests] of Array.from(testsByFile.entries()).slice(0, 5)) {
          console.log(`  • ${file} (${tests.length} test${tests.length === 1 ? '' : 's'})`);
        }
        if (testsByFile.size > 5) {
          console.log(chalk.dim(`  ... and ${testsByFile.size - 5} more files`));
        }
        console.log();
      }

      // Stats
      console.log(chalk.dim(`Analysis completed in ${analysis.stats.analysisTimeMs}ms`));
    }
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
