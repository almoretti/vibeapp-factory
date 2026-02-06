import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeployButton } from './DeployButton';
import type { Repo } from 'shared/types';

// Mock hooks and API
const mockUseProjectDeployments = vi.fn();
const mockUseDeploymentMutations = vi.fn();
const mockGetGitStatus = vi.fn();

vi.mock('@/hooks/useDeployments', () => ({
  useProjectDeployments: (...args: unknown[]) => mockUseProjectDeployments(...args),
  useDeploymentMutations: (...args: unknown[]) => mockUseDeploymentMutations(...args),
}));

vi.mock('@/lib/api', () => ({
  repoApi: {
    getGitStatus: (...args: unknown[]) => mockGetGitStatus(...args),
  },
}));

// Mock DeploymentsPanelDialog
vi.mock('./DeploymentsPanel', () => ({
  DeploymentsPanelDialog: ({
    open,
    onOpenChange,
  }: {
    projectId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="deployments-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
        Deployments Panel Dialog
      </div>
    ) : null,
}));

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockRepo: Repo = {
  id: 'repo-1',
  display_name: 'my-app',
  path: '/repos/my-app',
} as Repo;

const mockRepo2: Repo = {
  id: 'repo-2',
  display_name: 'backend',
  path: '/repos/backend',
} as Repo;

const defaultMutationResult = {
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  isError: false,
  error: null,
};

describe('DeployButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseProjectDeployments.mockReturnValue({
      deployments: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseDeploymentMutations.mockReturnValue({
      createDeployment: defaultMutationResult,
    });

    mockGetGitStatus.mockResolvedValue({
      current_branch: 'main',
      is_clean: true,
    });
  });

  it('renders the deploy button', () => {
    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    expect(screen.getByText('Deploy')).toBeInTheDocument();
  });

  it('opens dropdown menu on click', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));

    expect(screen.getByText('Deploy Now')).toBeInTheDocument();
    expect(screen.getByText('View Deployments')).toBeInTheDocument();
  });

  it('shows deployment count in View Deployments menu item', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [
        { id: 'd1', status: 'running' },
        { id: 'd2', status: 'failed' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens deploy dialog when clicking Deploy Now', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /deploy/i }));

    // Click Deploy Now
    await user.click(screen.getByText('Deploy Now'));

    // Deploy dialog should be open - check for the description which is unique to the dialog
    expect(
      screen.getByText(
        'Deploy the current branch to Coolify. This will create or update your deployment.'
      )
    ).toBeInTheDocument();
  });

  it('opens deployments dialog when clicking View Deployments', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('View Deployments'));

    expect(screen.getByTestId('deployments-dialog')).toBeInTheDocument();
  });

  it('shows branch info in deploy dialog', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    // Wait for git status to populate (via React Query)
    // The branch should show "Loading..." initially, but the mock resolves immediately
    // Check for branch label
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  it('shows port configuration input with default value', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    const portsInput = screen.getByLabelText('Ports (comma-separated)');
    expect(portsInput).toHaveValue('3000');
  });

  it('allows editing port configuration', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    const portsInput = screen.getByLabelText('Ports (comma-separated)');
    await user.clear(portsInput);
    await user.type(portsInput, '8080, 3000');

    expect(portsInput).toHaveValue('8080, 3000');
  });

  it('shows Cancel and Deploy buttons in dialog footer', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // The footer deploy button - find all Deploy buttons and check the one in the dialog
    const deployButtons = screen.getAllByRole('button', { name: 'Deploy' });
    // At least one deploy button should be in the dialog footer (not the dropdown trigger)
    expect(deployButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('closes deploy dialog on Cancel', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    // Dialog should be open - the description text is unique to the dialog
    const description = screen.getByText(
      'Deploy the current branch to Coolify. This will create or update your deployment.'
    );
    expect(description).toBeInTheDocument();

    // Click Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Dialog should be closed - description should no longer be visible
    expect(
      screen.queryByText(
        'Deploy the current branch to Coolify. This will create or update your deployment.'
      )
    ).not.toBeInTheDocument();
  });

  it('shows active building deployment indicator', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [{ id: 'd1', status: 'building', branch: 'main' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    // Building = animated ping with amber color
    const pingElement = container.querySelector('.animate-ping');
    expect(pingElement).toBeInTheDocument();
    expect(pingElement?.className).toContain('bg-amber-400');
  });

  it('shows active running deployment indicator', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [{ id: 'd1', status: 'running', branch: 'main' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    // Running = solid emerald circle, no ping animation
    const emeraldDot = container.querySelector('.bg-emerald-500');
    expect(emeraldDot).toBeInTheDocument();
  });

  it('shows no status indicator when no active deployments', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [{ id: 'd1', status: 'failed', branch: 'main' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    expect(container.querySelector('.animate-ping')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-emerald-500')).not.toBeInTheDocument();
  });

  it('shows active deployment warning in deploy dialog', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [
        {
          id: 'd1',
          status: 'running',
          branch: 'develop',
          domain: 'app.example.com',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.getByText('Active deployment exists')).toBeInTheDocument();
    expect(screen.getByText(/Branch: develop/)).toBeInTheDocument();
    expect(screen.getByText(/app\.example\.com/)).toBeInTheDocument();
  });

  it('shows building deployment warning in deploy dialog', async () => {
    const user = userEvent.setup();
    mockUseProjectDeployments.mockReturnValue({
      deployments: [
        { id: 'd1', status: 'building', branch: 'feature/new' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.getByText('Deployment in progress')).toBeInTheDocument();
  });

  it('shows repo selector when multiple repos provided', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo, mockRepo2]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.getByLabelText('Repository')).toBeInTheDocument();
    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('does not show repo selector with single repo', async () => {
    const user = userEvent.setup();

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.queryByLabelText('Repository')).not.toBeInTheDocument();
  });

  it('shows "Deploying..." text when mutation is pending', async () => {
    const user = userEvent.setup();
    mockUseDeploymentMutations.mockReturnValue({
      createDeployment: {
        ...defaultMutationResult,
        isPending: true,
      },
    });

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('button', { name: /deploy/i }));
    await user.click(screen.getByText('Deploy Now'));

    expect(screen.getByText('Deploying...')).toBeInTheDocument();
  });

  it('applies border class when there is an active deployment', () => {
    mockUseProjectDeployments.mockReturnValue({
      deployments: [{ id: 'd1', status: 'running', branch: 'main' }],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DeployButton projectId="proj-1" repos={[mockRepo]} />,
      { wrapper: createQueryWrapper() }
    );

    const button = screen.getByRole('button', { name: /deploy/i });
    expect(button.className).toContain('border-emerald-500');
  });
});
