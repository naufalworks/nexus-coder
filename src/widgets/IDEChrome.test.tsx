import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IDEChrome } from './IDEChrome';
import { WidgetMount } from './IDEShell';

describe('IDEChrome', () => {
  it('renders the full IDE shell with header, body and footer', () => {
    const widgets: WidgetMount[] = [
      {
        id: 'testWidget',
        component: <div>Widget Content</div>,
        visible: true,
        chrome: true,
        title: 'Test'
      }
    ];

    render(<IDEChrome widgets={widgets} layout="sidebar" />);
    expect(screen.getByText('Nexus IDE')).toBeInTheDocument();
    // Widget appears in multiple regions (sidebar, panel, footer) - use getAllByText
    expect(screen.getAllByText('Widget Content').length).toBeGreaterThanOrEqual(1);
  });
});
