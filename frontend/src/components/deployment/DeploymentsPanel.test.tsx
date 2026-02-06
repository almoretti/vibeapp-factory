import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeploymentsPanel, DeploymentsPanelDialog } from './DeploymentsPanel';
import type { Deployment } from '@/types/deployment';

// Mock hooks
const mockUseProjectDeployments = vi.fn();
vi.mock('@/hooks/useDeployments', () => ({
  useProjectDeployments: (...args: unknown[]) => mockUseProjectDeployments(...args),
}));

// Mock BuildLogViewer since it has its own tests
vi.mock('./BuildLogViewer', () => ({
  BuildLogViewer: ({ deploymentId, status }: { deploymentId: string; status: string }) => (
    <div data-testid={`build-log-viewer-${deploymentId}`}>
      BuildLogViewer: {status}
    </div>
  ),
}));

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'dep-1',
    project_id: 'proj-1',
    branch: 'main',
    coolify_app_uuid: null,
    domain: null,
    status: 'running',
    build_logs: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('DeploymentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<DeploymentsPanel projectId="proj-1" />);

    // Loader component renders a spinning Loader2 icon
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: new Error('Server error'),
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    expect(screen.getByText('Failed to load deployments')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    expect(screen.getByText('No deployments yet')).toBeInTheDocument();
  });

  it('renders deployment count in summary', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment(), makeDeployment({ id: 'dep-2' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    expect(screen.getByText('Deployments (2)')).toBeInTheDocument();
  });

  it('expands to show deployment list on click', async () => {
    const user = userEvent.setup();
    const deployments = [
      makeDeployment({ id: 'dep-1', branch: 'main' }),
      makeDeployment({ id: 'dep-2', branch: 'feature/test' }),
    ];

    mockUseProjectDeployments.mockReturnValue({
      deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    // Initially collapsed - branches not visible
    expect(screen.queryByText('feature/test')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('Deployments (2)'));

    // Now branches visible
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('feature/test')).toBeInTheDocument();
  });

  it('collapses when clicking the summary again', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ branch: 'develop' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    // Expand
    await user.click(screen.getByText('Deployments (1)'));
    expect(screen.getByText('develop')).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText('Deployments (1)'));
    expect(screen.queryByText('develop')).not.toBeInTheDocument();
  });

  it('passes projectId to useProjectDeployments', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="my-project" />);

    expect(mockUseProjectDeployments).toHaveBeenCalledWith('my-project');
  });

  it('shows active deployment indicator for running deployments', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ status: 'running' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<DeploymentsPanel projectId="proj-1" />);

    // Active deployment indicator: animated ping element
    const pingElement = container.querySelector('.animate-ping');
    expect(pingElement).toBeInTheDocument();
  });

  it('does not show active indicator when all deployments are failed', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ status: 'failed' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<DeploymentsPanel projectId="proj-1" />);

    const pingElement = container.querySelector('.animate-ping');
    expect(pingElement).not.toBeInTheDocument();
  });
});

describe('DeploymentItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows deployment branch name', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ branch: 'feature/auth' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);

    // Expand to see items
    await user.click(screen.getByText('Deployments (1)'));

    expect(screen.getByText('feature/auth')).toBeInTheDocument();
  });

  it('shows domain link for running deployments with domain', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [
        makeDeployment({
          status: 'running',
          domain: 'myapp.example.com',
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (1)'));

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://myapp.example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not show domain link when domain is null', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ domain: null })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (1)'));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('toggles build log viewer on logs button click', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ id: 'dep-99' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (1)'));

    // Logs should not be visible initially
    expect(screen.queryByTestId('build-log-viewer-dep-99')).not.toBeInTheDocument();

    // Click Logs button
    await user.click(screen.getByText('Logs'));

    // Now BuildLogViewer should be visible
    expect(screen.getByTestId('build-log-viewer-dep-99')).toBeInTheDocument();

    // Click again to hide
    await user.click(screen.getByText('Logs'));
    expect(screen.queryByTestId('build-log-viewer-dep-99')).not.toBeInTheDocument();
  });

  it('renders correct status badge for each status', async () => {
    const user = userEvent.setup();
    const deployments = [
      makeDeployment({ id: 'dep-1', status: 'pending' }),
      makeDeployment({ id: 'dep-2', status: 'building' }),
      makeDeployment({ id: 'dep-3', status: 'running' }),
      makeDeployment({ id: 'dep-4', status: 'failed' }),
    ];

    mockUseProjectDeployments.mockReturnValue({
      deployments,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (4)'));

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Building')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows time ago for deployment creation', async () => {
    const user = userEvent.setup();
    // Create a deployment that was created 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ created_at: twoHoursAgo })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (1)'));

    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('shows "just now" for very recent deployments', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment({ created_at: new Date().toISOString() })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DeploymentsPanel projectId="proj-1" />);
    await user.click(screen.getByText('Deployments (1)'));

    expect(screen.getByText('just now')).toBeInTheDocument();
  });
});

describe('DeploymentsPanelDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Deployments')).toBeInTheDocument();
  });

  it('shows empty state in dialog', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(
      screen.getByText('No deployments yet. Click the Deploy button to create one.')
    ).toBeInTheDocument();
  });

  it('shows loading state in dialog', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Loading deployments...')).toBeInTheDocument();
  });

  it('shows error state in dialog', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: new Error('Connection failed'),
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(
      screen.getByText('Failed to load deployments: Connection failed')
    ).toBeInTheDocument();
  });

  it('renders deployment items in dialog', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [
        makeDeployment({ id: 'dep-1', branch: 'main' }),
        makeDeployment({ id: 'dep-2', branch: 'staging' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [makeDeployment()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeploymentsPanelDialog
        projectId="proj-1"
        open={false}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Deployments')).not.toBeInTheDocument();
  });
});
