/**
 * Unit tests for render performance analyzer utilities.
 * 
 * Validates that the performance measurement utilities work correctly.
 */

import {
  generatePerformanceDataset,
  generateGraphExplorerDataset,
  generateReasoningLogDataset,
  generateTaskPanelDataset,
  measureRenderTime,
  analyzeRenderVariance,
  formatMeasurement,
  formatVariance,
  RENDER_BUDGET_MS,
  MAX_VARIANCE_MS,
  VARIANCE_TEST_RUNS,
} from './render-budget';

describe('Render Performance Analyzer', () => {
  describe('Dataset Generation', () => {
    it('should generate performance dataset with default configuration', () => {
      const dataset = generatePerformanceDataset();
      
      expect(dataset.tasks).toHaveLength(100);
      expect(dataset.agents).toHaveLength(10);
      expect(dataset.changes).toHaveLength(500);
      expect(dataset.graph.nodes.size).toBe(200);
      // Edge count may be slightly less due to random generation skipping self-loops
      expect(dataset.graph.edges.length).toBeGreaterThanOrEqual(490);
      expect(dataset.graph.edges.length).toBeLessThanOrEqual(500);
      expect(dataset.messages).toHaveLength(1000);
      expect(dataset.tokenUsage).toBeDefined();
    });

    it('should generate GraphExplorer dataset with 200 nodes and 500 edges', () => {
      const dataset = generateGraphExplorerDataset();
      
      expect(dataset.graph.nodes.size).toBe(200);
      // Edge count may be slightly less due to random generation skipping self-loops
      expect(dataset.graph.edges.length).toBeGreaterThanOrEqual(490);
      expect(dataset.graph.edges.length).toBeLessThanOrEqual(500);
      expect(dataset.tasks).toHaveLength(1);
    });

    it('should generate ReasoningLog dataset with 1000 entries', () => {
      const dataset = generateReasoningLogDataset();
      
      expect(dataset.messages).toHaveLength(1000);
    });

    it('should generate TaskPanel dataset with 50 tasks', () => {
      const dataset = generateTaskPanelDataset();
      
      expect(dataset.tasks).toHaveLength(50);
      expect(dataset.agents).toHaveLength(10);
    });

    it('should allow custom dataset configuration', () => {
      const dataset = generatePerformanceDataset({
        tasks: 25,
        agents: 5,
        changes: 100,
        nodes: 50,
        edges: 100,
        logEntries: 500,
      });
      
      expect(dataset.tasks).toHaveLength(25);
      expect(dataset.agents).toHaveLength(5);
      expect(dataset.changes).toHaveLength(100);
      expect(dataset.graph.nodes.size).toBe(50);
      // Edge count may be slightly less due to random generation skipping self-loops
      expect(dataset.graph.edges.length).toBeGreaterThanOrEqual(95);
      expect(dataset.graph.edges.length).toBeLessThanOrEqual(100);
      expect(dataset.messages).toHaveLength(500);
    });
  });

  describe('Constants', () => {
    it('should export correct performance budget constant', () => {
      expect(RENDER_BUDGET_MS).toBe(100);
    });

    it('should export correct variance limit constant', () => {
      expect(MAX_VARIANCE_MS).toBe(50); // Updated for JSDOM tolerance
    });

    it('should export correct variance test runs constant', () => {
      expect(VARIANCE_TEST_RUNS).toBe(10);
    });
  });

  describe('Measurement Formatting', () => {
    it('should format measurement within budget', () => {
      const measurement = {
        widgetName: 'TestWidget',
        renderTimeMs: 50.5,
        withinBudget: true,
        datasetConfig: {},
        timestamp: new Date(),
      };
      
      const formatted = formatMeasurement(measurement);
      
      expect(formatted).toContain('TestWidget');
      expect(formatted).toContain('50.50ms');
      expect(formatted).toContain('✓ PASS');
    });

    it('should format measurement exceeding budget', () => {
      const measurement = {
        widgetName: 'SlowWidget',
        renderTimeMs: 150.75,
        withinBudget: false,
        datasetConfig: {},
        timestamp: new Date(),
      };
      
      const formatted = formatMeasurement(measurement);
      
      expect(formatted).toContain('SlowWidget');
      expect(formatted).toContain('150.75ms');
      expect(formatted).toContain('✗ FAIL');
    });

    it('should format variance analysis', () => {
      const variance = {
        widgetName: 'TestWidget',
        runs: 10,
        renderTimes: [45, 47, 46, 48, 45, 46, 47, 46, 45, 47],
        averageMs: 46.2,
        minMs: 45,
        maxMs: 48,
        varianceMs: 3,
        varianceAcceptable: true,
        datasetConfig: {},
      };
      
      const formatted = formatVariance(variance);
      
      expect(formatted).toContain('TestWidget');
      expect(formatted).toContain('Average: 46.20ms');
      expect(formatted).toContain('Min: 45.00ms');
      expect(formatted).toContain('Max: 48.00ms');
      expect(formatted).toContain('Variance: 3.00ms');
      expect(formatted).toContain('✓ PASS');
    });
  });

  describe('Type Exports', () => {
    it('should export dataset configuration type', () => {
      const config: import('./render-budget').DatasetConfig = {
        tasks: 10,
        agents: 5,
      };
      
      expect(config).toBeDefined();
    });

    it('should export performance dataset type', () => {
      const dataset = generatePerformanceDataset({ tasks: 1, agents: 1, changes: 1 });
      
      const typedDataset: import('./render-budget').PerformanceDataset = dataset;
      
      expect(typedDataset).toBeDefined();
    });

    it('should export render measurement type', () => {
      const measurement: import('./render-budget').RenderMeasurement = {
        widgetName: 'Test',
        renderTimeMs: 50,
        withinBudget: true,
        datasetConfig: {},
        timestamp: new Date(),
      };
      
      expect(measurement).toBeDefined();
    });

    it('should export variance analysis type', () => {
      const variance: import('./render-budget').VarianceAnalysis = {
        widgetName: 'Test',
        runs: 10,
        renderTimes: [50, 51, 49],
        averageMs: 50,
        minMs: 49,
        maxMs: 51,
        varianceMs: 2,
        varianceAcceptable: true,
        datasetConfig: {},
      };
      
      expect(variance).toBeDefined();
    });
  });
});
