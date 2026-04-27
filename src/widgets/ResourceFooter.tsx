import React from 'react';
import { TokenUsage } from '../types';

export interface ResourceFooterProps {
  tokenUsage: TokenUsage;
  vectorStoreStatus: 'healthy' | 'degraded' | 'offline';
  quota?: {
    maxTokens: number;
    maxCost: number;
  };
}

export const ResourceFooter: React.FC<ResourceFooterProps> = ({ tokenUsage, vectorStoreStatus, quota }) => {
  const isDegraded = vectorStoreStatus === 'degraded' || vectorStoreStatus === 'offline';

  return (
    <div className={`resource-footer status-${vectorStoreStatus}`}
      aria-busy={isDegraded}
      aria-live="polite"
    >
      {isDegraded && (
        <div className="resource-footer-block-ui" role="alert">
          Status: {vectorStoreStatus} (API/vector store unavailable)
        </div>
      )}
      <span className="resource-footer-tokens">
        Tokens: {tokenUsage.total}{quota ? ` / Quota: ${quota.maxTokens}` : ''}
      </span>
      <span className="resource-footer-cost">
        Cost: ${tokenUsage.estimatedCost.toFixed(2)}{quota ? ` / Max Cost: $${quota.maxCost.toFixed(2)}` : ''}
      </span>
      <span className="resource-footer-status">
        Vector Store: {vectorStoreStatus}
      </span>
    </div>
  );
};
