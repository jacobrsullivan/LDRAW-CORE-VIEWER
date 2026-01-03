import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';

// Mock the Canvas3D and LDrawEditor components
vi.mock('../../components/Canvas3D', () => ({
  Canvas3D: () => <div data-testid="canvas-3d">Canvas3D Component</div>
}));

vi.mock('../../components/LDrawEditor', () => ({
  LDrawEditor: () => <div data-testid="editor">LDrawEditor Component</div>
}));

describe('App', () => {
  it('renders the header', () => {
    render(<App />);
    expect(screen.getByText('LDraw 3D Web Viewer & Editor')).toBeInTheDocument();
  });

  it('renders the main layout sections', () => {
    render(<App />);
    expect(screen.getByTestId('canvas-3d')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });
}); 