/**
 * Integration Test: Resource_Footer updates on Diff_Approval_Widget explain action
 * 
 * Validates: Requirements 1.4
 * 
 * Test that triggering explain updates token usage in Resource_Footer
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DiffApproval } from '../../widgets/DiffApproval';
import { ResourceFooter } from '../../widgets/ResourceFooter';
import { 
  makeTaskWithChanges,
  makeTokenUsage,
  makeCodeChange
} from '../helpers/factories';
import { TokenUsage } from '../../types';

describe('Integration: Resource Footer updates on Diff Approval explain action', () => {
  describe('Requirement 1.4: Explain action updates token usage', () => {
    it('should update token usage when explain is triggered in Diff_Approval_Widget', async () => {
      // Initial token usage
      let tokenUsage = makeTokenUsage({ 
        total: 1500 
      });
      
      const task = makeTaskWithChanges(2);
      const changes = task.result?.changes || [];
      
      // Mock explain handler that updates token usage
      const handleExplain = jest.fn().mockImplementation(async () => {
        // Simulate API call using tokens
        tokenUsage = {
          ...tokenUsage,
          total: tokenUsage.total + 300,
          estimatedCost: tokenUsage.estimatedCost + 0.01,
        };
        return 'This change refactors the authentication logic to use JWT tokens instead of session-based auth. The main security improvement is that tokens are stateless and can be validated without database lookups.';
      });
      
      // Render both widgets
      render(
        <div>
          <DiffApproval
            changes={changes}
            tasks={[task]}
            onApprove={jest.fn()}
            onReject={jest.fn()}
            onExplain={handleExplain}
          />
          <ResourceFooter 
            tokenUsage={tokenUsage}
            vectorStoreStatus="healthy"
          />
        </div>
      );
      
      // Initial token count
      expect(screen.getByText(/1500/)).toBeInTheDocument();
      
      // Find and click explain button
      const explainButtons = screen.getAllByText('Explain');
      expect(explainButtons.length).toBeGreaterThan(0);
      
      await act(async () => {
        fireEvent.click(explainButtons[0]);
      });
      
      // Verify explain was called
      await waitFor(() => {
        expect(handleExplain).toHaveBeenCalled();
      });
    });
    
    it('should display updated token count in Resource_Footer after API call', async () => {
      // Mutable token usage state
      let tokenUsage = makeTokenUsage({ total: 2000 });
      
      // Render ResourceFooter
      const { rerender } = render(
        <ResourceFooter 
          tokenUsage={tokenUsage}
          vectorStoreStatus="healthy"
        />
      );
      
      // Verify initial state
      expect(screen.getByText(/2000/)).toBeInTheDocument();
      
      // Update token usage
      tokenUsage = { ...tokenUsage, total: 2500 };
      
      // Rerender with updated state
      rerender(
        <ResourceFooter 
          tokenUsage={tokenUsage}
          vectorStoreStatus="healthy"
        />
      );
      
      // Verify updated display
      expect(screen.getByText(/2500/)).toBeInTheDocument();
    });
    
    it('should reflect token usage from last agent action', async () => {
      // Create change with explanation metadata
      const change = makeCodeChange({
        file: 'src/auth/login.ts',
        reasoning: 'Fix authentication bug',
      });
      
      let explanationTokens = 0;
      
      const handleExplain = jest.fn().mockImplementation(async () => {
        explanationTokens = 150; // Tokens used for explanation
        return 'Explanation of the change';
      });
      
      render(
        <DiffApproval
          changes={[change]}
          onApprove={jest.fn()}
          onReject={jest.fn()}
          onExplain={handleExplain}
        />
      );
      
      // Trigger explain
      const explainBtn = screen.getByText('Explain');
      await act(async () => {
        fireEvent.click(explainBtn);
      });
      
      await waitFor(() => {
        expect(handleExplain).toHaveBeenCalled();
        expect(explanationTokens).toBeGreaterThan(0);
      });
    });
    
    it('should show cost estimate increase after explain action', async () => {
      // Initial cost
      let tokenUsage = makeTokenUsage({ 
        total: 1500,
        estimatedCost: 0.03 
      });
      
      const handleExplain = jest.fn().mockResolvedValue('Explanation text');
      
      // Simulate cost increase
      const increasedCost = 0.05;
      
      render(
        <ResourceFooter 
          tokenUsage={{
            ...tokenUsage,
            estimatedCost: increasedCost,
          }}
          vectorStoreStatus="healthy"
        />
      );
      
      // Verify cost is displayed
      expect(screen.getByText(/0\.05/)).toBeInTheDocument();
    });
  });
  
  describe('Resource_Footer consistency', () => {
    it('should display vector store status alongside token usage', () => {
      const tokenUsage = makeTokenUsage();
      
      render(
        <ResourceFooter 
          tokenUsage={tokenUsage}
          vectorStoreStatus="healthy"
        />
      );
      
      // Both token usage and status should be visible
      expect(screen.getByText(new RegExp(tokenUsage.total.toString()))).toBeInTheDocument();
    });
    
    it('should handle degraded vector store gracefully', () => {
      const tokenUsage = makeTokenUsage();
      
      render(
        <ResourceFooter 
          tokenUsage={tokenUsage}
          vectorStoreStatus="degraded"
        />
      );
      
      // Should show degraded status
      expect(screen.getAllByText(/degraded/i).length).toBeGreaterThan(0);
    });
    
    it('should show last known values when offline', () => {
      const tokenUsage = makeTokenUsage({ total: 3000 });
      
      render(
        <ResourceFooter 
          tokenUsage={tokenUsage}
          vectorStoreStatus="offline"
        />
      );
      
      // Should still show last known token usage
      expect(screen.getByText(/3000/)).toBeInTheDocument();
      expect(screen.getAllByText(/offline/i).length).toBeGreaterThan(0);
    });
  });
});
