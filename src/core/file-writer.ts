import * as fs from 'fs';
import * as path from 'path';
import { CodeChange, ChangeType } from '../types';
import logger from './logger';

const PROTECTED_DIRS = ['.git'];

export interface WriteResult {
  file: string;
  success: boolean;
  backupPath?: string;
  error?: string;
  bytesWritten: number;
}

export class FileWriter {
  private backupDir: string;
  private cwd: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.cwd = workingDirectory;
    this.backupDir = path.join(workingDirectory, '.nexus', 'backups');
  }

  async applyChanges(changes: CodeChange[]): Promise<WriteResult[]> {
    const results: WriteResult[] = [];

    this.ensureBackupDir();

    for (const change of changes) {
      if (!change.approved) {
        results.push({
          file: change.file,
          success: false,
          error: 'Change not approved',
          bytesWritten: 0,
        });
        continue;
      }

      try {
        const filePath = this.resolvePath(change.file);
        switch (change.type) {
          case ChangeType.CREATE:
            results.push(await this.createFile(filePath, change.content || change.diff));
            break;
          case ChangeType.MODIFY:
          case ChangeType.REFACTOR:
            results.push(await this.modifyFile(filePath, change.content || change.diff));
            break;
          case ChangeType.DELETE:
            results.push(await this.deleteFile(filePath));
            break;
          default:
            results.push({
              file: change.file,
              success: false,
              error: `Unknown change type: ${change.type}`,
              bytesWritten: 0,
            });
        }
      } catch (error) {
        logger.error(`[FileWriter] Failed to apply ${change.type} to ${change.file}: ${error}`);
        results.push({
          file: change.file,
          success: false,
          error: String(error),
          bytesWritten: 0,
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    logger.info(`[FileWriter] Applied ${succeeded}/${results.length} changes`);

    return results;
  }

  private async createFile(filePath: string, content: string): Promise<WriteResult> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      return this.modifyFile(filePath, content);
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`[FileWriter] Created: ${path.relative(this.cwd, filePath)}`);

    return {
      file: filePath,
      success: true,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
    };
  }

  private async modifyFile(filePath: string, content: string): Promise<WriteResult> {
    if (!fs.existsSync(filePath)) {
      return this.createFile(filePath, content);
    }

    const backupPath = await this.backup(filePath);

    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`[FileWriter] Modified: ${path.relative(this.cwd, filePath)}`);

    return {
      file: filePath,
      success: true,
      backupPath,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
    };
  }

  private async deleteFile(filePath: string): Promise<WriteResult> {
    if (!fs.existsSync(filePath)) {
      return {
        file: filePath,
        success: false,
        error: 'File does not exist',
        bytesWritten: 0,
      };
    }

    const backupPath = await this.backup(filePath);

    fs.unlinkSync(filePath);
    logger.info(`[FileWriter] Deleted: ${path.relative(this.cwd, filePath)}`);

    return {
      file: filePath,
      success: true,
      backupPath,
      bytesWritten: 0,
    };
  }

  async restoreBackup(filePath: string): Promise<boolean> {
    const backupPath = this.getBackupPath(filePath);

    if (!fs.existsSync(backupPath)) {
      logger.warn(`[FileWriter] No backup found for ${filePath}`);
      return false;
    }

    fs.copyFileSync(backupPath, filePath);
    logger.info(`[FileWriter] Restored: ${path.relative(this.cwd, filePath)}`);
    return true;
  }

  async restoreAllBackups(results: WriteResult[]): Promise<void> {
    for (const result of results) {
      if (result.backupPath && fs.existsSync(result.backupPath)) {
        fs.copyFileSync(result.backupPath, result.file);
        logger.info(`[FileWriter] Restored backup: ${path.relative(this.cwd, result.file)}`);
      }
    }
  }

  private async backup(filePath: string): Promise<string> {
    const backupPath = this.getBackupPath(filePath);
    const backupFileDir = path.dirname(backupPath);

    if (!fs.existsSync(backupFileDir)) {
      fs.mkdirSync(backupFileDir, { recursive: true });
    }

    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }

  private getBackupPath(filePath: string): string {
    const relativePath = path.relative(this.cwd, filePath);
    const timestamp = Date.now();
    const basename = path.basename(filePath);
    const dir = path.dirname(relativePath);
    return path.join(this.backupDir, dir, `${basename}.${timestamp}.bak`);
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private resolvePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
    this.validatePath(resolved);
    return resolved;
  }

  private validatePath(resolvedPath: string): void {
    const relative = path.relative(this.cwd, resolvedPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal detected: ${resolvedPath} escapes working directory`);
    }

    const parts = relative.split(path.sep);
    if (PROTECTED_DIRS.includes(parts[0])) {
      throw new Error(`Write to protected directory denied: ${parts[0]}`);
    }
  }
}
