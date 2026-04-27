import * as fs from 'fs';
import * as path from 'path';
import { FileWriter } from '../../src/core/file-writer';
import { ChangeType } from '../../src/types';

const TEST_WORK_DIR = path.join(process.cwd(), '.nexus-test-security');

function makeChange(file: string, type: ChangeType, content: string) {
  return { file, type, content, reasoning: 'test', impact: [] as string[], risk: 'low' as const, diff: '', approved: true };
}

describe('E2E: Security — Path Traversal Protection', () => {
  jest.setTimeout(15000);

  let writer: FileWriter;

  beforeAll(() => {
    if (!fs.existsSync(TEST_WORK_DIR)) {
      fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
    }
    writer = new FileWriter(TEST_WORK_DIR);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_WORK_DIR)) {
      fs.rmSync(TEST_WORK_DIR, { recursive: true, force: true });
    }
  });

  test('should block path traversal with ../../', async () => {
    const results = await writer.applyChanges([
      makeChange('../../outside.txt', ChangeType.CREATE, 'hacked'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Path traversal');
    console.log(`[Security] Path traversal blocked: ${results[0].error}`);
  });

  test('should block writes to .git directory', async () => {
    const gitDir = path.join(TEST_WORK_DIR, '.git');
    if (!fs.existsSync(gitDir)) {
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'config'), 'original');
    }

    const results = await writer.applyChanges([
      makeChange('.git/config', ChangeType.MODIFY, 'malicious'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('protected');
    console.log(`[Security] Protected dir blocked: ${results[0].error}`);
  });

  test('should block nested path traversal', async () => {
    const results = await writer.applyChanges([
      makeChange('subdir/../../../etc/passwd', ChangeType.CREATE, 'test'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Path traversal');
  });

  test('should allow normal file writes within cwd', async () => {
    const results = await writer.applyChanges([
      makeChange('test-file.txt', ChangeType.CREATE, 'Hello Nexus'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);

    const content = fs.readFileSync(path.join(TEST_WORK_DIR, 'test-file.txt'), 'utf-8');
    expect(content).toBe('Hello Nexus');
    console.log(`[Security] Normal write succeeded: ${results[0].bytesWritten} bytes`);
  });

  test('should allow writes to nested subdirectories', async () => {
    const results = await writer.applyChanges([
      makeChange('src/utils/helper.ts', ChangeType.CREATE, 'export function help() {}'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(fs.existsSync(path.join(TEST_WORK_DIR, 'src', 'utils', 'helper.ts'))).toBe(true);
  });

  test('should support file modification with backup', async () => {
    const filePath = path.join(TEST_WORK_DIR, 'modify-test.txt');
    fs.writeFileSync(filePath, 'original content');

    const results = await writer.applyChanges([
      makeChange('modify-test.txt', ChangeType.MODIFY, 'modified content'),
    ]);

    expect(results).toBeDefined();
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('modified content');

    expect(results[0].backupPath).toBeTruthy();
    expect(fs.existsSync(results[0].backupPath!)).toBe(true);

    const backupContent = fs.readFileSync(results[0].backupPath!, 'utf-8');
    expect(backupContent).toBe('original content');
    console.log(`[Security] Backup exists at ${results[0].backupPath}`);
  });
});
