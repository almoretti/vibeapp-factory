import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildLogViewer } from './BuildLogViewer';

// Mock the useDeploymentLogs hook
const mockUseDeploymentLogs = vi.fn();
vi.mock('@/hooks/useDeployments', () => ({
  useDeploymentLogs: (...args: unknown[]) => mockUseDeploymentLogs(...args),
}));

describe('BuildLogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when logs are loading', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="building" />
    );

    expect(screen.getByText('Loading logs...')).toBeInTheDocument();
  });

  it('renders error state when there is an error', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: false,
      error: new Error('Network failure'),
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="running" />
    );

    expect(screen.getByText('Failed to load logs: Network failure')).toBeInTheDocument();
  });

  it('renders log content when available', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'Step 1: Installing dependencies\nStep 2: Building project',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="running" />
    );

    // Use function matcher since getByText normalizes whitespace across newlines
    expect(
      screen.getByText((_content, element) =>
        element?.tagName === 'PRE' &&
        element.textContent === 'Step 1: Installing dependencies\nStep 2: Building project'
      )
    ).toBeInTheDocument();
  });

  it('shows "Waiting for build output..." when building with no logs', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="building" />
    );

    expect(screen.getByText('Waiting for build output...')).toBeInTheDocument();
  });

  it('shows "No logs available" when not building and no logs', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="running" />
    );

    expect(screen.getByText('No logs available')).toBeInTheDocument();
  });

  it('shows "Waiting for build output..." for pending status with no logs', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="pending" />
    );

    expect(screen.getByText('Waiting for build output...')).toBeInTheDocument();
  });

  it('shows building indicator when status is building', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'some output',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="building" />
    );

    expect(screen.getByText('Building...')).toBeInTheDocument();
  });

  it('shows building indicator when status is pending', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'some output',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="pending" />
    );

    expect(screen.getByText('Building...')).toBeInTheDocument();
  });

  it('does not show building indicator for running status', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'Build complete',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="running" />
    );

    expect(screen.queryByText('Building...')).not.toBeInTheDocument();
  });

  it('does not show building indicator for failed status', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'Error in build step',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="failed" />
    );

    expect(screen.queryByText('Building...')).not.toBeInTheDocument();
  });

  it('passes deploymentId and status to useDeploymentLogs', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-123" status="building" />
    );

    expect(mockUseDeploymentLogs).toHaveBeenCalledWith('dep-123', 'building');
  });

  it('applies custom className', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'some logs',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(
      <BuildLogViewer
        deploymentId="dep-1"
        status="running"
        className="max-h-64"
      />
    );

    // The container div should have the custom class
    const logContainer = container.firstChild as HTMLElement;
    expect(logContainer.className).toContain('max-h-64');
  });

  it('renders logs in a pre element for whitespace preservation', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: '  indented\n    nested',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="running" />
    );

    const pre = screen.getByText((_content, element) =>
      element?.tagName === 'PRE' &&
      element.textContent === '  indented\n    nested'
    );
    expect(pre.tagName).toBe('PRE');
  });

  it('does not show loading state when logs already exist but isLoading is true (background refresh)', () => {
    mockUseDeploymentLogs.mockReturnValue({
      logs: 'existing logs',
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BuildLogViewer deploymentId="dep-1" status="building" />
    );

    // Should show logs, not loading indicator
    expect(screen.getByText('existing logs')).toBeInTheDocument();
    expect(screen.queryByText('Loading logs...')).not.toBeInTheDocument();
  });
});
