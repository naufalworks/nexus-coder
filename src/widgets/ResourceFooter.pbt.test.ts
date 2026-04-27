// Property-based tests for ResourceFooter
// Validates: Requirements 7.2, 12.3
// Property 4: Resource footer reflects accurate API state
import fc from 'fast-check';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResourceFooter } from './ResourceFooter';
import { TokenUsage } from '../types';

const vectorStoreStatusArb = fc.constantFrom<'healthy' | 'degraded' | 'offline'>('healthy', 'degraded', 'offline');
const tokenUsageArb: fc.Arbitrary<TokenUsage> = fc.record({
  heavy: fc.integer({ min: 0, max: 10000 }),
  fast: fc.integer({ min: 0, max: 10000 }),
  general: fc.integer({ min: 0, max: 10000 }),
  coder: fc.integer({ min: 0, max: 10000 }),
  analyst: fc.integer({ min: 0, max: 10000 }),
  total: fc.integer({ min: 0, max: 50000 }),
  estimatedCost: fc.float({ min: 0, max: 1000 }),
});
const quotaArb = fc.option(
  fc.record({
    maxTokens: fc.integer({ min: 100, max: 50000 }),
    maxCost: fc.float({ min: 10, max: 1000 })
  })
);

describe('Property 4: Resource footer reflects accurate API state', () => {
  /** Validates: Requirements 7.2, 12.3 */
  
  afterEach(() => {
    cleanup();
  });
  
  it('for any change to token usage or vector store state, footer displays accurate, current status without delay', () => {
    fc.assert(
      fc.property(tokenUsageArb, vectorStoreStatusArb, quotaArb, (tokenUsage, vectorStoreStatus, quota) => {
        const { container } = render(
          React.createElement(ResourceFooter, {
            tokenUsage,
            vectorStoreStatus,
            quota: quota ?? undefined
          })
        );
        
        // Check tokens displayed accurately
        const tokensText = container.querySelector('.resource-footer-tokens')?.textContent || '';
        expect(tokensText).toContain(`Tokens: ${tokenUsage.total}`);
        
        // Cost displayed accurately (with $ sign)
        const costText = container.querySelector('.resource-footer-cost')?.textContent || '';
        expect(costText).toContain(`Cost: $${tokenUsage.estimatedCost.toFixed(2)}`);
        
        // Status shown
        const statusText = container.querySelector('.resource-footer-status')?.textContent || '';
        expect(statusText).toContain(`Vector Store: ${vectorStoreStatus}`);
        
        // Quota, if present
        if (quota) {
          expect(tokensText).toContain(`Quota: ${quota.maxTokens}`);
          expect(costText).toContain(`Max Cost: $${quota.maxCost.toFixed(2)}`);
        }
        
        // If degraded/offline, block UI shown
        if (vectorStoreStatus === 'degraded' || vectorStoreStatus === 'offline') {
          const alert = container.querySelector('[role="alert"]');
          expect(alert).toBeTruthy();
          expect(alert?.textContent).toContain(vectorStoreStatus);
        }
        
        // Cleanup after each property test iteration
        cleanup();
      })
    );
  });
});
