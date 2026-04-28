/**
 * Integration Tests for Re-Render Analysis
 * 
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5
 * 
 * Tests the ReRenderTracker's ability to detect unnecessary re-renders,
 * identify triggering props/state keys, and suggest optimizations.
 */

import React, { useState, useCallback, useMemo, memo } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  ReRenderTracker,
  withReRenderTracking,
  hasUnnecessaryRenders,
  getTopTriggerKeys,
  getSuggestionsForKey,
  formatReRenderAnalysis,
  OptimizationType,
  ReRenderAnalysis,
} from './rerender-analysis';

// ---------------------------------------------------------------------------
// Test Components
// ---------------------------------------------------------------------------

/**
 * Simple component that renders a value.
 */
const SimpleComponent: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  return (
    <div data-testid="simple">
      {label}: {value}
    </div>
  );
};

/**
 * Component with callback props.
 */
const ComponentWithCallbacks: React.FC<{
  onClick: () => void;
  onChange: (value: string) => void;
  value: string;
}> = ({ onClick, onChange, value }) => {
  return (
    <div data-testid="callback-component">
      <span>{value}</span>
      <button onClick={onClick}>Click</button>
      <input onChange={(e) => onChange(e.target.value)} />
    </div>
  );
};

/**
 * Component with object/array props.
 */
const ComponentWithObjects: React.FC<{
  items: string[];
  config: { theme: string; locale: string };
  name: string;
}> = ({ items, config, name }) => {
  return (
    <div data-testid="object-component">
      <span>{name}</span>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <small>Theme: {config.theme}</small>
    </div>
  );
};

/**
 * Component with multiple state keys.
 */
const ComponentWithMultipleState: React.FC<{ initialValue: number }> = ({ initialValue }) => {
  const [a, setA] = useState(initialValue);
  const [b, setB] = useState('hello');
  const [c, setC] = useState(true);

  return (
    <div data-testid="state-component">
      <span>{a}</span>
      <span>{b}</span>
      <span>{c ? 'yes' : 'no'}</span>
      <button onClick={() => setA(a + 1)}>Increment A</button>
      <button onClick={() => setB('world')}>Change B</button>
      <button onClick={() => setC(!c)}>Toggle C</button>
    </div>
  );
};

/**
 * Memoized component for testing unnecessary renders.
 */
const MemoizedComponent = memo<{ value: number; label: string }>(
  ({ value, label }) => {
    return (
      <div data-testid="memoized">
        {label}: {value}
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReRenderTracker Integration Tests', () => {
  describe('Requirement 18.1: Detect unnecessary re-renders when props/state unchanged', () => {
    it('should detect re-renders when same props are passed', () => {
      const tracker = new ReRenderTracker({ componentName: 'SimpleComponent' });
      const Tracked = withReRenderTracking(SimpleComponent, tracker);

      const { rerender } = render(<Tracked value={1} label="Count" />);
      expect(tracker.analyze().totalRenders).toBe(1);

      // Rerender with identical props
      rerender(<Tracked value={1} label="Count" />);
      const analysis = tracker.analyze();
      
      expect(analysis.totalRenders).toBe(2);
      expect(analysis.unnecessaryRenders).toBe(1);
    });

    it('should NOT flag necessary renders when props change', () => {
      const tracker = new ReRenderTracker({ componentName: 'SimpleComponent' });
      const Tracked = withReRenderTracking(SimpleComponent, tracker);

      const { rerender } = render(<Tracked value={1} label="Count" />);
      rerender(<Tracked value={2} label="Count" />);
      
      const analysis = tracker.analyze();
      
      expect(analysis.totalRenders).toBe(2);
      expect(analysis.unnecessaryRenders).toBe(0);
    });

    it('should detect mixed pattern of necessary and unnecessary renders', () => {
      const tracker = new ReRenderTracker({ componentName: 'SimpleComponent' });
      const Tracked = withReRenderTracking(SimpleComponent, tracker);

      const { rerender } = render(<Tracked value={1} label="Count" />);
      
      // Necessary render (value changed)
      rerender(<Tracked value={2} label="Count" />);
      
      // Unnecessary render (same props)
      rerender(<Tracked value={2} label="Count" />);
      
      // Necessary render (label changed)
      rerender(<Tracked value={2} label="Total" />);
      
      // Unnecessary render (same props)
      rerender(<Tracked value={2} label="Total" />);

      const analysis = tracker.analyze();
      
      expect(analysis.totalRenders).toBe(5);
      expect(analysis.unnecessaryRenders).toBe(2);
    });
  });

  describe('Requirement 18.2: Identify triggering prop or state keys', () => {
    it('should identify which prop keys triggered re-renders', () => {
      const tracker = new ReRenderTracker({ componentName: 'SimpleComponent' });
      const Tracked = withReRenderTracking(SimpleComponent, tracker);

      const { rerender } = render(<Tracked value={1} label="Count" />);
      
      // Change value only
      rerender(<Tracked value={2} label="Count" />);
      
      // Change label only
      rerender(<Tracked value={2} label="Total" />);

      const analysis = tracker.analyze();
      
      expect(analysis.triggerKeys).toContain('props.value');
      expect(analysis.triggerKeys).toContain('props.label');
    });

    it('should only report keys that actually changed', () => {
      const tracker = new ReRenderTracker({ componentName: 'SimpleComponent' });
      const Tracked = withReRenderTracking(SimpleComponent, tracker);

      const { rerender } = render(<Tracked value={1} label="Count" />);
      
      // Only value changes across all renders
      rerender(<Tracked value={2} label="Count" />);
      rerender(<Tracked value={3} label="Count" />);
      rerender(<Tracked value={4} label="Count" />);

      const analysis = tracker.analyze();
      
      expect(analysis.triggerKeys).toContain('props.value');
      expect(analysis.triggerKeys).not.toContain('props.label');
    });

    it('should identify state keys when state tracking is enabled', () => {
      const tracker = new ReRenderTracker({
        componentName: 'StateComponent',
        trackState: true,
      });

      // Simulate state tracking manually
      tracker.trackRender({ initialValue: 1 }, { a: 1, b: 'hello', c: true });
      tracker.trackRender({ initialValue: 1 }, { a: 2, b: 'hello', c: true });
      tracker.trackRender({ initialValue: 1 }, { a: 2, b: 'world', c: true });

      const analysis = tracker.analyze();
      
      expect(analysis.triggerKeys).toContain('state.a');
      expect(analysis.triggerKeys).toContain('state.b');
      expect(analysis.triggerKeys).not.toContain('state.c');
    });
  });

  describe('Requirement 18.3: Suggest useMemo for object/array props', () => {
    it('should suggest useMemo for object/array props that trigger re-renders', () => {
      const tracker = new ReRenderTracker({ componentName: 'ObjectComponent' });

      // Simulate re-renders with new array/object references (same values)
      tracker.trackRender({
        items: ['a', 'b'],
        config: { theme: 'dark', locale: 'en' },
        name: 'Test',
      });

      tracker.trackRender({
        items: ['a', 'b'], // Same values, new reference
        config: { theme: 'dark', locale: 'en' },
        name: 'Test',
      });

      const analysis = tracker.analyze();
      const useMemoSuggestions = analysis.suggestions.filter(
        (s) => s.type === 'useMemo'
      );

      // Should suggest useMemo for items and config
      expect(useMemoSuggestions.length).toBeGreaterThan(0);
      expect(useMemoSuggestions.some((s) => s.targetKey === 'items')).toBe(true);
      expect(useMemoSuggestions.some((s) => s.targetKey === 'config')).toBe(true);
    });
  });

  describe('Requirement 18.4: Suggest useCallback for function props', () => {
    it('should suggest useCallback for function props that trigger re-renders', () => {
      const tracker = new ReRenderTracker({
        componentName: 'CallbackComponent',
      });

      // First render
      tracker.trackRender({
        onClick: () => {},
        onChange: (v: string) => {},
        value: 'test',
      });

      // Re-render with new function references
      tracker.trackRender({
        onClick: () => {},
        onChange: (v: string) => {},
        value: 'test',
      });

      const analysis = tracker.analyze();
      const useCallbackSuggestions = analysis.suggestions.filter(
        (s) => s.type === 'useCallback'
      );

      expect(useCallbackSuggestions.length).toBeGreaterThan(0);
      expect(
        useCallbackSuggestions.some((s) => s.targetKey === 'onClick')
      ).toBe(true);
      expect(
        useCallbackSuggestions.some((s) => s.targetKey === 'onChange')
      ).toBe(true);
    });
  });

  describe('Requirement 18.5: Report component name, trigger key, and render count', () => {
    it('should provide complete analysis with component name and render count', () => {
      const tracker = new ReRenderTracker({ componentName: 'TestWidget' });

      tracker.trackRender({ value: 1, label: 'A' });
      tracker.trackRender({ value: 2, label: 'A' });
      tracker.trackRender({ value: 2, label: 'A' }); // unnecessary

      const analysis = tracker.analyze();

      expect(analysis.componentName).toBe('TestWidget');
      expect(analysis.totalRenders).toBe(3);
      expect(analysis.unnecessaryRenders).toBe(1);
      expect(analysis.triggerKeys).toContain('props.value');
    });

    it('should format analysis report correctly', () => {
      const tracker = new ReRenderTracker({ componentName: 'FormattedWidget' });

      tracker.trackRender({ value: 1 });
      tracker.trackRender({ value: 1 }); // unnecessary

      const analysis = tracker.analyze();
      const formatted = formatReRenderAnalysis(analysis);

      expect(formatted).toContain('FormattedWidget');
      expect(formatted).toContain('Total Renders: 2');
      expect(formatted).toContain('Unnecessary Renders: 1');
    });
  });

  describe('Utility Functions', () => {
    describe('hasUnnecessaryRenders', () => {
      it('should return true when unnecessary renders exist', () => {
        const tracker = new ReRenderTracker({ componentName: 'Test' });
        tracker.trackRender({ value: 1 });
        tracker.trackRender({ value: 1 }); // unnecessary

        const analysis = tracker.analyze();
        expect(hasUnnecessaryRenders(analysis)).toBe(true);
      });

      it('should return false when no unnecessary renders exist', () => {
        const tracker = new ReRenderTracker({ componentName: 'Test' });
        tracker.trackRender({ value: 1 });
        tracker.trackRender({ value: 2 });

        const analysis = tracker.analyze();
        expect(hasUnnecessaryRenders(analysis)).toBe(false);
      });
    });

    describe('getTopTriggerKeys', () => {
      it('should return keys sorted by frequency', () => {
        const tracker = new ReRenderTracker({ componentName: 'Test' });

        tracker.trackRender({ a: 1, b: 1, c: 1 });
        tracker.trackRender({ a: 2, b: 1, c: 1 }); // a changed
        tracker.trackRender({ a: 3, b: 1, c: 1 }); // a changed
        tracker.trackRender({ a: 3, b: 2, c: 1 }); // b changed

        const analysis = tracker.analyze();
        const topKeys = getTopTriggerKeys(analysis);

        // 'a' changed twice, 'b' changed once
        expect(topKeys[0]).toBe('props.a');
        expect(topKeys).toContain('props.b');
      });
    });

    describe('getSuggestionsForKey', () => {
      it('should filter suggestions by target key', () => {
        const tracker = new ReRenderTracker({ componentName: 'Test' });

        tracker.trackRender({
          items: [1, 2],
          onClick: () => {},
          value: 1,
        });
        tracker.trackRender({
          items: [1, 2],
          onClick: () => {},
          value: 1,
        });

        const analysis = tracker.analyze();
        const itemsSuggestions = getSuggestionsForKey(analysis, 'items');

        expect(itemsSuggestions.length).toBeGreaterThan(0);
        expect(itemsSuggestions.every((s) => s.targetKey === 'items')).toBe(true);
      });
    });
  });

  describe('Deep Compare Mode', () => {
    it('should detect that deeply equal objects are unchanged', () => {
      const tracker = new ReRenderTracker({
        componentName: 'DeepCompareTest',
        deepCompare: true,
      });

      tracker.trackRender({
        config: { theme: 'dark', locale: 'en' },
        items: [1, 2, 3],
      });

      // New references but same deep values
      tracker.trackRender({
        config: { theme: 'dark', locale: 'en' },
        items: [1, 2, 3],
      });

      const analysis = tracker.analyze();
      expect(analysis.unnecessaryRenders).toBe(1);
    });

    it('should detect deep changes when shallow comparison would miss them', () => {
      const tracker = new ReRenderTracker({
        componentName: 'DeepChangeTest',
        deepCompare: true,
      });

      tracker.trackRender({
        config: { theme: 'dark', locale: 'en' },
      });

      // Same reference structure but different value
      tracker.trackRender({
        config: { theme: 'light', locale: 'en' },
      });

      const analysis = tracker.analyze();
      expect(analysis.triggerKeys).toContain('props.config');
    });
  });

  describe('Ignored Props', () => {
    it('should exclude ignored props from analysis', () => {
      const tracker = new ReRenderTracker({
        componentName: 'IgnoreTest',
        ignoredProps: ['children', 'className'],
      });

      tracker.trackRender({
        value: 1,
        className: 'test-class',
      });

      tracker.trackRender({
        value: 1,
        className: 'different-class', // Should be ignored
      });

      const analysis = tracker.analyze();
      // className was ignored, so value is the same -> unnecessary render
      expect(analysis.unnecessaryRenders).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset tracker state', () => {
      const tracker = new ReRenderTracker({ componentName: 'ResetTest' });

      tracker.trackRender({ value: 1 });
      tracker.trackRender({ value: 2 });
      expect(tracker.analyze().totalRenders).toBe(2);

      tracker.reset();
      expect(tracker.analyze().totalRenders).toBe(0);
      expect(tracker.analyze().renderEvents).toEqual([]);
    });
  });
});
