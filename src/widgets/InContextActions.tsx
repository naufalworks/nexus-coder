import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * InContextAction: Describes a single context-aware action.
 * - label: Display text for the action.
 * - action: Callback executed when the action is triggered. Receives the current context.
 * - visible: Predicate that determines whether the action should be shown for the given context.
 */
export interface InContextAction {
  label: string;
  action: (context: ActionContext) => void;
  visible: (context: ActionContext) => boolean;
}

/**
 * ActionContext: The context object passed to action handlers and visibility predicates.
 */
export interface ActionContext {
  file: string;
  function?: string;
}

/**
 * InContextActionsProps: Props for the InContextActions component.
 */
export interface InContextActionsProps {
  /** List of actions to display in the context menu */
  actions: InContextAction[];
  /** The current context (file and optional function) */
  context: ActionContext;
  /** Optional trigger mode: 'right-click' (default) or 'hover' */
  trigger?: 'right-click' | 'hover';
  /** Optional className for the wrapper element */
  className?: string;
}

/**
 * Built-in action factory: Approve AI Change
 * Visible when context includes a file (i.e., user is viewing a file).
 */
export const approveChangeAction = (
  onApprove: (context: ActionContext) => void
): InContextAction => ({
  label: 'Approve AI Change',
  action: onApprove,
  visible: (ctx) => !!ctx.file,
});

/**
 * Built-in action factory: Review Impact
 * Visible when context includes both file and function.
 */
export const reviewImpactAction = (
  onReview: (context: ActionContext) => void
): InContextAction => ({
  label: 'Review Impact',
  action: onReview,
  visible: (ctx) => !!ctx.file && !!ctx.function,
});

/**
 * Built-in action factory: Request Explanation
 * Visible when context includes at least a file.
 */
export const requestExplanationAction = (
  onExplain: (context: ActionContext) => void
): InContextAction => ({
  label: 'Request Explanation',
  action: onExplain,
  visible: (ctx) => !!ctx.file,
});

/**
 * getVisibleActions: Returns only the actions whose `visible` predicate returns true
 * for the given context. Used internally and exported for testability.
 */
export function getVisibleActions(
  actions: InContextAction[],
  context: ActionContext
): InContextAction[] {
  return actions.filter((a) => a.visible(context));
}

/**
 * InContextActions: A context-aware action menu component.
 *
 * - Right-click or hover on the wrapped area triggers the menu.
 * - Only actions whose `visible` predicate passes are displayed (Requirement 5.3).
 * - Clicking an action executes its `action` callback with the current context (Requirement 5.2).
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
export const InContextActions: React.FC<InContextActionsProps> = ({
  actions,
  context,
  trigger = 'right-click',
  className,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleActions = getVisibleActions(actions, context);

  // Close menu on outside click or Escape key
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (trigger !== 'right-click') return;
      e.preventDefault();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    },
    [trigger]
  );

  const handleMouseEnter = useCallback(() => {
    if (trigger !== 'hover') return;
    setMenuOpen(true);
  }, [trigger]);

  const handleMouseLeave = useCallback(() => {
    if (trigger !== 'hover') return;
    setMenuOpen(false);
  }, [trigger]);

  const handleActionClick = useCallback(
    (action: InContextAction) => {
      action.action(context);
      setMenuOpen(false);
    },
    [context]
  );

  return (
    <div
      className={`in-context-actions ${className || ''}`}
      data-testid="in-context-actions"
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={containerRef}
    >
      {/* Wrapped content area where right-click / hover triggers the menu */}
      <div className="in-context-actions-content" data-testid="in-context-actions-content" />

      {menuOpen && visibleActions.length > 0 && (
        <div
          className="in-context-actions-menu"
          data-testid="in-context-actions-menu"
          role="menu"
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
            zIndex: 1000,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            minWidth: '180px',
          }}
        >
          {visibleActions.map((a, i) => (
            <button
              key={i}
              className="in-context-action-item"
              data-testid={`action-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
              role="menuitem"
              onClick={() => handleActionClick(a)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
