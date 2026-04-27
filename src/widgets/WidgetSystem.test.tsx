import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WidgetSystem, WidgetMount } from './WidgetSystem';

describe('WidgetSystem', () => {
  it('mounts widgets and displays them with minimal chrome', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'testWidget',
        component: <div>Test Widget Content</div>,
        visible: true,
        chrome: true
      }
    ];
    render(<WidgetSystem initialWidgets={widgets} layout="sidebar" />);
    expect(screen.getByText('Test Widget Content')).toBeInTheDocument();
  });

  it('does not render invisible widgets', () => {
    const widgets: WidgetMount[] = [
      { id: 'invisibleWidget', component: <div>Sneaky</div>, visible: false, chrome: false }
    ];
    render(<WidgetSystem initialWidgets={widgets} layout="panel" />);
    expect(screen.queryByText('Sneaky')).toBeNull();
  });
});
