import chalk from 'chalk';
import ora from 'ora';
import { Task, CodeChange, AgentInfo, TaskStatus, AgentMessage, SemanticCodeGraphData } from '../types';
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
