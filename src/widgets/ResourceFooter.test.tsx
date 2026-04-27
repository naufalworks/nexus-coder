import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResourceFooter, ResourceFooterProps } from './ResourceFooter';

const defaultTokenUsage = {
  heavy: 100,
  fast: 50,
  general: 200,
  coder: 75,
  analyst: 30,
  total: 455,
  estimatedCost: 2.34,
};

function renderFooter(overrides: Partial<ResourceFooterProps> = {}) {
  const props: ResourceFooterProps = {
    tokenUsage: defaultTokenUsage,
    vectorStoreStatus: 'healthy',
    ...overrides,
  };
  return render(<ResourceFooter {...props} />);
}

describe('ResourceFooter', () => {
  it('renders token usage and cost', () => {
    renderFooter();
    expect(screen.getByText(/Tokens:/)).toHaveTextContent('Tokens: 455');
    expect(screen.getByText(/Cost:/)).toHaveTextContent('Cost: $2.34');
  });

  it('renders vector store status as healthy', () => {
    renderFooter({ vectorStoreStatus: 'healthy' });
    expect(screen.getByText(/Vector Store:/)).toHaveTextContent('Vector Store: healthy');
    // No alert when healthy
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders degraded status and shows block UI alert', () => {
    renderFooter({ vectorStoreStatus: 'degraded' });
    expect(screen.getByRole('alert')).toHaveTextContent('degraded');
    expect(screen.getByText(/Vector Store:/)).toHaveTextContent('Vector Store: degraded');
  });

  it('renders offline status and shows block UI alert', () => {
    renderFooter({ vectorStoreStatus: 'offline' });
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    expect(screen.getByText(/Vector Store:/)).toHaveTextContent('Vector Store: offline');
  });

  it('renders quota when provided', () => {
    renderFooter({
      quota: { maxTokens: 10000, maxCost: 100 },
    });
    expect(screen.getByText(/Quota:/)).toHaveTextContent('Quota: 10000');
    expect(screen.getByText(/Max Cost:/)).toHaveTextContent('Max Cost: $100.00');
  });

  it('does not render quota when not provided', () => {
    renderFooter();
    expect(screen.queryByText(/Quota:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Max Cost:/)).not.toBeInTheDocument();
  });

  it('updates display when token usage changes', () => {
    const { rerender } = renderFooter();
    expect(screen.getByText(/Tokens:/)).toHaveTextContent('Tokens: 455');

    const newUsage = { ...defaultTokenUsage, total: 999, estimatedCost: 5.67 };
    rerender(
      <ResourceFooter tokenUsage={newUsage} vectorStoreStatus="healthy" />
    );
    expect(screen.getByText(/Tokens:/)).toHaveTextContent('Tokens: 999');
    expect(screen.getByText(/Cost:/)).toHaveTextContent('Cost: $5.67');
  });

  it('applies status CSS class based on vector store status', () => {
    const { rerender } = renderFooter({ vectorStoreStatus: 'healthy' });
    expect(screen.getByText(/Tokens:/).closest('.resource-footer')).toHaveClass('status-healthy');

    rerender(
      <ResourceFooter tokenUsage={defaultTokenUsage} vectorStoreStatus="degraded" />
    );
    expect(screen.getByText(/Tokens:/).closest('.resource-footer')).toHaveClass('status-degraded');

    rerender(
      <ResourceFooter tokenUsage={defaultTokenUsage} vectorStoreStatus="offline" />
    );
    expect(screen.getByText(/Tokens:/).closest('.resource-footer')).toHaveClass('status-offline');
  });
});
