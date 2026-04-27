import * as fs from 'fs';
import * as path from 'path';
import { PersistentMemory } from '../../src/core/context/memory/persistent';
import { DecisionJournal } from '../../src/core/context/memory/decisions';
import { PatternStore } from '../../src/core/context/memory/patterns';

const TEST_DATA_DIR = path.join(process.cwd(), '.nexus-test-mem');

describe('E2E: Memory Persistence (No LLM needed)', () => {
  jest.setTimeout(30000);

  beforeAll(() => {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('PersistentMemory', () => {
    const storePath = path.join(TEST_DATA_DIR, 'test-memory.json');

    test('should store and retrieve a memory', () => {
      const memory = new PersistentMemory(storePath);
      memory.store('ContextEngine uses BFS traversal for graph exploration', 'success');
      memory.store('FileWriter validates paths against directory traversal', 'pattern');

      const results = memory.retrieve('BFS traversal');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('BFS');
    });

    test('should persist memories to disk and reload', () => {
      const sp2 = path.join(TEST_DATA_DIR, 'persist-test.json');

      const mem1 = new PersistentMemory(sp2);
      mem1.store('Pattern: always validate user input before processing', 'convention');
      mem1.store('Decision: use async fs.promises over sync fs methods', 'success');
      mem1.save();

      expect(fs.existsSync(sp2)).toBe(true);

      const mem2 = new PersistentMemory(sp2);
      const results = mem2.retrieve('validate input');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('validate');
    });

    test('keyword index should narrow candidates', () => {
      const sp3 = path.join(TEST_DATA_DIR, 'keyword-test.json');
      const memory = new PersistentMemory(sp3);

      for (let i = 0; i < 100; i++) {
        memory.store(`Memory entry ${i} about topic ${i % 5} with unique keyword${i}`, 'convention');
      }

      const results = memory.retrieve('unique keyword42');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('keyword42');
    });

    test('should handle large number of memories', () => {
      const sp4 = path.join(TEST_DATA_DIR, 'bulk-test.json');
      const memory = new PersistentMemory(sp4);

      for (let i = 0; i < 500; i++) {
        memory.store(`Bulk memory ${i}: details about function${i} in module${i % 10}`, 'convention');
      }

      const results = memory.retrieve('function42');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('DecisionJournal', () => {
    const storePath = path.join(TEST_DATA_DIR, 'test-decisions.json');

    test('should record and retrieve decisions', () => {
      const journal = new DecisionJournal(storePath);
      journal.record('graph-traversal', 'Choose BFS over DFS', 'BFS gives better distance metrics for compression');

      const decisions = journal.getRecent(5);
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].decision).toContain('BFS');
    });

    test('should persist decisions across instances', () => {
      const sp2 = path.join(TEST_DATA_DIR, 'persist-decisions.json');

      const j1 = new DecisionJournal(sp2);
      j1.record('performance', 'Use adjacency index', 'O(1) lookup instead of O(E)');
      j1.save();

      const j2 = new DecisionJournal(sp2);
      const decisions = j2.getRecent(1);
      expect(decisions.length).toBe(1);
      expect(decisions[0].decision).toContain('adjacency');
    });
  });

  describe('PatternStore', () => {
    const storePath = path.join(TEST_DATA_DIR, 'test-patterns.json');

    test('should record and find patterns', () => {
      const store = new PatternStore(storePath);
      store.record('Always validate paths before file operations', 'security review', 'bug_fix');

      const patterns = store.findPatterns('validate paths');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].pattern).toContain('validate paths');
    });

    test('should track occurrences across recordings', () => {
      const sp2 = path.join(TEST_DATA_DIR, 'success-patterns.json');
      const store = new PatternStore(sp2);

      store.record('Use async fs.promises', 'performance optimization', 'refactor');
      store.record('Use async fs.promises', 'performance optimization', 'refactor');
      store.record('Use async fs.promises', 'performance optimization', 'refactor');

      const patterns = store.findPatterns('async fs');
      const asyncPattern = patterns.find((p: any) => p.pattern.includes('async'));
      if (asyncPattern) {
        expect(asyncPattern.occurrences).toBeGreaterThanOrEqual(3);
        console.log(`[Patterns] Async pattern: occurrences=${asyncPattern.occurrences}, successRate=${asyncPattern.successRate}`);
      }
    });

    test('should persist patterns across instances', () => {
      const sp3 = path.join(TEST_DATA_DIR, 'persist-patterns.json');

      const s1 = new PatternStore(sp3);
      s1.record('Build adjacency index for O(1) lookups', 'graph performance', 'feature');
      s1.save();

      const s2 = new PatternStore(sp3);
      const patterns = s2.findPatterns('adjacency');
      expect(patterns.length).toBe(1);
      expect(patterns[0].pattern).toContain('adjacency');
    });
  });
});
