import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  InContextActions,
  InContextAction,
  ActionContext,
  getVisibleActions,
  approveChangeAction,
  reviewImpactAction,
  requestExplanationAction,
} from './InContextActions';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<InContextAction> = {}): InContextAction {
  return {
    label: 'Test Action',
    action: jest.fn(),
    visible: () => true,
    ...overrides,
  };
}

function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    file: 'src/app.ts',
    function: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: Context menu visibility (Requirement 5.3)
// ---------------------------------------------------------------------------

describe('InContextActions - Menu Visibility', () => {
  /** Validates: Requirements 5.1, 5.3 */

  it('shows actions whose visible predicate returns true', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'Visible Action', visible: () => true }),
      makeAction({ label: 'Hidden Action', visible: () => false }),
    ];
    const context = makeContext();

    // Trigger menu via right-click
    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.getByText('Visible Action')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Action')).not.toBeInTheDocument();
  });

  it('hides all actions when no actions pass visibility criteria', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'Action A', visible: () => false }),
      makeAction({ label: 'Action B', visible: () => false }),
    ];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    // Menu should not appear when no actions are visible
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on right-click when trigger is right-click (default)', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} trigger="right-click" />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('does not open menu on right-click when trigger is hover', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} trigger="hover" />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on hover when trigger is hover', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} trigger="hover" />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.mouseEnter(wrapper);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes menu on mouse leave when trigger is hover', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} trigger="hover" />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Action execution (Requirement 5.2)
// ---------------------------------------------------------------------------

describe('InContextActions - Action Execution', () => {
  /** Validates: Requirement 5.2 */

  it('executes action callback with current context when clicked', () => {
    const actionFn = jest.fn();
    const actions: InContextAction[] = [
      makeAction({ label: 'Approve', action: actionFn }),
    ];
    const context = makeContext({ file: 'src/auth.ts', function: 'login' });

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    const button = screen.getByText('Approve');
    fireEvent.click(button);

    expect(actionFn).toHaveBeenCalledWith({ file: 'src/auth.ts', function: 'login' });
  });

  it('closes the menu after an action is executed', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'Approve', action: jest.fn() }),
    ];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const button = screen.getByText('Approve');
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('executes multiple actions independently', () => {
    const approveFn = jest.fn();
    const reviewFn = jest.fn();
    const actions: InContextAction[] = [
      makeAction({ label: 'Approve', action: approveFn }),
      makeAction({ label: 'Review Impact', action: reviewFn }),
    ];
    const context = makeContext({ file: 'src/app.ts', function: 'main' });

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;

    // Execute first action
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Approve'));
    expect(approveFn).toHaveBeenCalledTimes(1);

    // Execute second action
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Review Impact'));
    expect(reviewFn).toHaveBeenCalledTimes(1);
  });

  it('updates context for subsequent renders', () => {
    const actionFn = jest.fn();
    const actions: InContextAction[] = [
      makeAction({ label: 'Approve', action: actionFn, visible: () => true }),
    ];

    const { container, rerender } = render(
      <InContextActions
        actions={actions}
        context={{ file: 'src/a.ts', function: 'funcA' }}
      />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Approve'));
    expect(actionFn).toHaveBeenCalledWith({ file: 'src/a.ts', function: 'funcA' });

    // Re-render with new context
    const newContext = { file: 'src/b.ts', function: 'funcB' };
    rerender(
      <InContextActions actions={actions} context={newContext} />
    );

    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Approve'));
    expect(actionFn).toHaveBeenCalledWith({ file: 'src/b.ts', function: 'funcB' });
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Built-in action factories (Requirement 5.1)
// ---------------------------------------------------------------------------

describe('InContextActions - Built-in Action Factories', () => {
  /** Validates: Requirement 5.1 */

  describe('approveChangeAction', () => {
    it('is visible when context has a file', () => {
      const action = approveChangeAction(jest.fn());
      expect(action.visible({ file: 'src/app.ts' })).toBe(true);
    });

    it('is hidden when context has no file', () => {
      const action = approveChangeAction(jest.fn());
      expect(action.visible({ file: '' })).toBe(false);
    });

    it('executes the approve callback with context', () => {
      const onApprove = jest.fn();
      const action = approveChangeAction(onApprove);
      const ctx = { file: 'src/app.ts', function: 'login' };
      action.action(ctx);
      expect(onApprove).toHaveBeenCalledWith(ctx);
    });

    it('has correct label', () => {
      const action = approveChangeAction(jest.fn());
      expect(action.label).toBe('Approve AI Change');
    });
  });

  describe('reviewImpactAction', () => {
    it('is visible when context has both file and function', () => {
      const action = reviewImpactAction(jest.fn());
      expect(action.visible({ file: 'src/app.ts', function: 'login' })).toBe(true);
    });

    it('is hidden when context has file but no function', () => {
      const action = reviewImpactAction(jest.fn());
      expect(action.visible({ file: 'src/app.ts' })).toBe(false);
    });

    it('is hidden when context has no file', () => {
      const action = reviewImpactAction(jest.fn());
      expect(action.visible({ file: '' })).toBe(false);
    });

    it('executes the review callback with context', () => {
      const onReview = jest.fn();
      const action = reviewImpactAction(onReview);
      const ctx = { file: 'src/app.ts', function: 'login' };
      action.action(ctx);
      expect(onReview).toHaveBeenCalledWith(ctx);
    });

    it('has correct label', () => {
      const action = reviewImpactAction(jest.fn());
      expect(action.label).toBe('Review Impact');
    });
  });

  describe('requestExplanationAction', () => {
    it('is visible when context has a file', () => {
      const action = requestExplanationAction(jest.fn());
      expect(action.visible({ file: 'src/app.ts' })).toBe(true);
    });

    it('is hidden when context has no file', () => {
      const action = requestExplanationAction(jest.fn());
      expect(action.visible({ file: '' })).toBe(false);
    });

    it('is visible even without a function', () => {
      const action = requestExplanationAction(jest.fn());
      expect(action.visible({ file: 'src/app.ts' })).toBe(true);
    });

    it('executes the explain callback with context', () => {
      const onExplain = jest.fn();
      const action = requestExplanationAction(onExplain);
      const ctx = { file: 'src/app.ts' };
      action.action(ctx);
      expect(onExplain).toHaveBeenCalledWith(ctx);
    });

    it('has correct label', () => {
      const action = requestExplanationAction(jest.fn());
      expect(action.label).toBe('Request Explanation');
    });
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: getVisibleActions helper (Requirement 5.3)
// ---------------------------------------------------------------------------

describe('getVisibleActions', () => {
  /** Validates: Requirement 5.3 */

  it('returns only actions that are visible for the given context', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'A', visible: () => true }),
      makeAction({ label: 'B', visible: () => false }),
      makeAction({ label: 'C', visible: () => true }),
    ];

    const result = getVisibleActions(actions, makeContext());
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.label)).toEqual(['A', 'C']);
  });

  it('returns empty array when no actions are visible', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'A', visible: () => false }),
      makeAction({ label: 'B', visible: () => false }),
    ];

    const result = getVisibleActions(actions, makeContext());
    expect(result).toEqual([]);
  });

  it('returns all actions when all are visible', () => {
    const actions: InContextAction[] = [
      makeAction({ label: 'A', visible: () => true }),
      makeAction({ label: 'B', visible: () => true }),
    ];

    const result = getVisibleActions(actions, makeContext());
    expect(result).toHaveLength(2);
  });

  it('filters based on context properties', () => {
    const actions: InContextAction[] = [
      makeAction({
        label: 'File Only',
        visible: (ctx) => !!ctx.file && !ctx.function,
      }),
      makeAction({
        label: 'With Function',
        visible: (ctx) => !!ctx.file && !!ctx.function,
      }),
    ];

    // Without function
    const resultNoFunc = getVisibleActions(actions, { file: 'src/app.ts' });
    expect(resultNoFunc.map((a) => a.label)).toEqual(['File Only']);

    // With function
    const resultWithFunc = getVisibleActions(actions, { file: 'src/app.ts', function: 'main' });
    expect(resultWithFunc.map((a) => a.label).sort()).toEqual(['With Function']);
  });

  it('returns empty array for empty actions list', () => {
    const result = getVisibleActions([], makeContext());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Integration - Built-in actions in component (Requirement 5.1, 5.2, 5.3)
// ---------------------------------------------------------------------------

describe('InContextActions - Built-in Actions Integration', () => {
  /** Validates: Requirements 5.1, 5.2, 5.3 */

  it('shows Approve and Request Explanation for file-only context', () => {
    const actions = [
      approveChangeAction(jest.fn()),
      reviewImpactAction(jest.fn()),
      requestExplanationAction(jest.fn()),
    ];
    const context = { file: 'src/app.ts' };

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.getByText('Approve AI Change')).toBeInTheDocument();
    expect(screen.getByText('Request Explanation')).toBeInTheDocument();
    expect(screen.queryByText('Review Impact')).not.toBeInTheDocument();
  });

  it('shows all three actions for file+function context', () => {
    const actions = [
      approveChangeAction(jest.fn()),
      reviewImpactAction(jest.fn()),
      requestExplanationAction(jest.fn()),
    ];
    const context = { file: 'src/app.ts', function: 'main' };

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.getByText('Approve AI Change')).toBeInTheDocument();
    expect(screen.getByText('Review Impact')).toBeInTheDocument();
    expect(screen.getByText('Request Explanation')).toBeInTheDocument();
  });

  it('hides all actions when file context is empty', () => {
    const actions = [
      approveChangeAction(jest.fn()),
      reviewImpactAction(jest.fn()),
      requestExplanationAction(jest.fn()),
    ];
    const context = { file: '' };

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('executes all three actions correctly with context', () => {
    const approveFn = jest.fn();
    const reviewFn = jest.fn();
    const explainFn = jest.fn();

    const actions = [
      approveChangeAction(approveFn),
      reviewImpactAction(reviewFn),
      requestExplanationAction(explainFn),
    ];
    const context = { file: 'src/auth.ts', function: 'login' };

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;

    // Test Approve
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Approve AI Change'));
    expect(approveFn).toHaveBeenCalledWith(context);

    // Test Review Impact
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Review Impact'));
    expect(reviewFn).toHaveBeenCalledWith(context);

    // Test Request Explanation
    fireEvent.contextMenu(wrapper);
    fireEvent.click(screen.getByText('Request Explanation'));
    expect(explainFn).toHaveBeenCalledWith(context);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Menu closing behavior
// ---------------------------------------------------------------------------

describe('InContextActions - Menu Closing', () => {
  it('closes menu when Escape key is pressed', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    const { container } = render(
      <InContextActions actions={actions} context={context} />
    );

    const wrapper = container.querySelector('[data-testid="in-context-actions"]')!;
    fireEvent.contextMenu(wrapper);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not show menu initially', () => {
    const actions = [makeAction({ label: 'Action' })];
    const context = makeContext();

    render(<InContextActions actions={actions} context={context} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
