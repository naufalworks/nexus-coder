import { mcpManager } from './mcp-manager';
import logger from './logger';

export class MCPTools {
  // Filesystem MCP Tools
  static async readFile(path: string): Promise<string> {
    try {
      const result = await mcpManager.callTool('filesystem', 'read_file', {
        path,
      });
      return result[0].text;
    } catch (error) {
      logger.error('Failed to read file via MCP:', error);
      throw error;
    }
  }

  static async writeFile(path: string, content: string): Promise<void> {
    try {
      await mcpManager.callTool('filesystem', 'write_file', {
        path,
        content,
      });
    } catch (error) {
      logger.error('Failed to write file via MCP:', error);
      throw error;
    }
  }

  static async listDirectory(path: string): Promise<string[]> {
    try {
      const result = await mcpManager.callTool('filesystem', 'list_directory', {
        path,
      });
      return result[0].text.split('\n');
    } catch (error) {
      logger.error('Failed to list directory via MCP:', error);
      throw error;
    }
  }

  // Git MCP Tools
  static async gitStatus(): Promise<any> {
    try {
      const result = await mcpManager.callTool('git', 'git_status', {});
      return JSON.parse(result[0].text);
    } catch (error) {
      logger.error('Failed to get git status via MCP:', error);
      throw error;
    }
  }

  static async gitDiff(file?: string): Promise<string> {
    try {
      const result = await mcpManager.callTool('git', 'git_diff', {
        file,
      });
      return result[0].text;
    } catch (error) {
      logger.error('Failed to get git diff via MCP:', error);
      throw error;
    }
  }

  static async gitCommit(message: string): Promise<void> {
    try {
      await mcpManager.callTool('git', 'git_commit', {
        message,
      });
    } catch (error) {
      logger.error('Failed to commit via MCP:', error);
      throw error;
    }
  }

  // GitHub MCP Tools
  static async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string
  ): Promise<any> {
    try {
      const result = await mcpManager.callTool('github', 'create_issue', {
        owner,
        repo,
        title,
        body,
      });
      return JSON.parse(result[0].text);
    } catch (error) {
      logger.error('Failed to create issue via MCP:', error);
      throw error;
    }
  }

  static async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<any> {
    try {
      const result = await mcpManager.callTool('github', 'create_pull_request', {
        owner,
        repo,
        title,
        body,
        head,
        base,
      });
      return JSON.parse(result[0].text);
    } catch (error) {
      logger.error('Failed to create PR via MCP:', error);
      throw error;
    }
  }

  static async searchCode(query: string): Promise<any> {
    try {
      const result = await mcpManager.callTool('github', 'search_code', {
        query,
      });
      return JSON.parse(result[0].text);
    } catch (error) {
      logger.error('Failed to search code via MCP:', error);
      throw error;
    }
  }

  // Sequential Thinking MCP Tools
  static async sequentialThink(
    problem: string,
    steps?: string[]
  ): Promise<string> {
    try {
      const result = await mcpManager.callTool('sequential-thinking', 'think', {
        problem,
        steps,
      });
      return result[0].text;
    } catch (error) {
      logger.error('Failed to use sequential thinking via MCP:', error);
      throw error;
    }
  }

  // Memory MCP Tools
  static async storeMemory(key: string, value: string): Promise<void> {
    try {
      await mcpManager.callTool('memory', 'store', {
        key,
        value,
      });
    } catch (error) {
      logger.error('Failed to store memory via MCP:', error);
      throw error;
    }
  }

  static async retrieveMemory(key: string): Promise<string> {
    try {
      const result = await mcpManager.callTool('memory', 'retrieve', {
        key,
      });
      return result[0].text;
    } catch (error) {
      logger.error('Failed to retrieve memory via MCP:', error);
      throw error;
    }
  }

  static async searchMemory(query: string): Promise<any[]> {
    try {
      const result = await mcpManager.callTool('memory', 'search', {
        query,
      });
      return JSON.parse(result[0].text);
    } catch (error) {
      logger.error('Failed to search memory via MCP:', error);
      throw error;
    }
  }
}
