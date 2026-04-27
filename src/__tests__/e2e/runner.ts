/**
 * Base E2E flow runner for orchestrating user journey tests.
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 */

import { RenderResult } from '@testing-library/react';
import { UserFlow, FlowStep, IDEStateSnapshot } from '../helpers/types';

/**
 * Execute a complete user flow and return the results.
 */
export async function runUserFlow(
  renderFn: (state: IDEStateSnapshot) => RenderResult,
  flow: UserFlow
): Promise<{ container: HTMLElement; passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  let result: RenderResult;
  
  try {
    // Step 1: Render with initial state
    result = renderFn(flow.initialState);
    const { container } = result;
    
    // Step 2: Execute each step in sequence
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      
      try {
        await step.execute(container);
        step.assert(container);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Step ${i + 1} (${step.description}): ${errorMessage}`);
      }
    }
    
    // Step 3: Run final assertion
    try {
      flow.finalAssertion(container);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Final assertion: ${errorMessage}`);
    }
    
    return {
      container,
      passed: errors.length === 0,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Setup error: ${errorMessage}`);
    
    return {
      container: null as unknown as HTMLElement,
      passed: false,
      errors,
    };
  }
}

/**
 * Create a step that simulates a user click.
 */
export function clickStep(
  description: string,
  selector: string | ((container: HTMLElement) => HTMLElement | null),
  assertFn: (container: HTMLElement) => void
): FlowStep {
  return {
    description,
    async execute(container: HTMLElement) {
      const element = typeof selector === 'function' 
        ? selector(container) 
        : container.querySelector(selector) as HTMLElement | null;
      
      if (!element) {
        throw new Error(`Element not found: ${typeof selector === 'string' ? selector : 'custom selector'}`);
      }
      
      element.click();
    },
    assert: assertFn,
  };
}

/**
 * Create a step that simulates typing in an input.
 */
export function typeStep(
  description: string,
  selector: string,
  text: string,
  assertFn: (container: HTMLElement) => void
): FlowStep {
  return {
    description,
    async execute(container: HTMLElement) {
      const input = container.querySelector<HTMLInputElement>(selector);
      
      if (!input) {
        throw new Error(`Input not found: ${selector}`);
      }
      
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    assert: assertFn,
  };
}

/**
 * Create a step that waits for an element to appear.
 */
export function waitForStep(
  description: string,
  selector: string,
  timeout: number = 5000
): FlowStep {
  return {
    description,
    async execute(container: HTMLElement) {
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const element = container.querySelector(selector);
        if (element) return;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      throw new Error(`Timeout waiting for element: ${selector}`);
    },
    assert() {
      // Assertion is baked into execute
    },
  };
}
