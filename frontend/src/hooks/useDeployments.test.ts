import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useProjectDeployments,
  useDeployment,
  useDeploymentLogs,
  useDeploymentMutations,
} from './useDeployments';
import type { Deployment, DeploymentLogsResponse } from '@/types/deployment';

// Mock the API layer
const mockDeploymentsApi = {
  create: vi.fn(),
  listByProject: vi.fn(),
  getById: vi.fn(),
  getLogs: vi.fn(),
};

vi.mock('@/lib/api', () => ({
  deploymentsApi: {
    create: (...args: unknown[]) => mockDeploymentsApi.create(...args),
    listByProject: (...args: unknown[]) => mockDeploymentsApi.listByProject(...args),
    getById: (...args: unknown[]) => mockDeploymentsApi.getById(...args),
    getLogs: (...args: unknown[]) => mockDeploymentsApi.getLogs(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockDeployment: Deployment = {
  id: 'dep-1',
  project_id: 'proj-1',
  branch: 'main',
  coolify_app_uuid: 'uuid-123',
  domain: 'myapp.example.com',
  status: 'running',
  build_logs: null,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T01:00:00Z',
};

describe('useProjectDeployments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches deployments for a project', async () => {
    const deployments = [mockDeployment];
    mockDeploymentsApi.listByProject.mockResolvedValue(deployments);

    const { result } = renderHook(
      () => useProjectDeployments('proj-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.deployments).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.deployments).toEqual(deployments);
    expect(result.current.error).toBeNull();
    expect(mockDeploymentsApi.listByProject).toHaveBeenCalledWith('proj-1');
  });

  it('returns empty array when projectId is undefined', () => {
    const { result } = renderHook(
      () => useProjectDeployments(undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.deployments).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockDeploymentsApi.listByProject).not.toHaveBeenCalled();
  });

  it('handles API errors', async () => {
    mockDeploymentsApi.listByProject.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useProjectDeployments('proj-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.deployments).toEqual([]);
  });

  it('provides a refetch function', async () => {
    mockDeploymentsApi.listByProject.mockResolvedValue([]);

    const { result } = renderHook(
      () => useProjectDeployments('proj-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});

describe('useDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single deployment by ID', async () => {
    mockDeploymentsApi.getById.mockResolvedValue(mockDeployment);

    const { result } = renderHook(
      () => useDeployment('dep-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.deployment).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.deployment).toEqual(mockDeployment);
    expect(mockDeploymentsApi.getById).toHaveBeenCalledWith('dep-1');
  });

  it('returns null deployment when ID is undefined', () => {
    const { result } = renderHook(
      () => useDeployment(undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.deployment).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockDeploymentsApi.getById).not.toHaveBeenCalled();
  });

  it('handles fetch errors', async () => {
    mockDeploymentsApi.getById.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(
      () => useDeployment('dep-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Not found');
    expect(result.current.deployment).toBeNull();
  });
});

describe('useDeploymentLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches deployment logs', async () => {
    const logsResponse: DeploymentLogsResponse = {
      logs: 'Step 1: Building...\nStep 2: Done!',
    };
    mockDeploymentsApi.getLogs.mockResolvedValue(logsResponse);

    const { result } = renderHook(
      () => useDeploymentLogs('dep-1', 'running'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.logs).toBe('Step 1: Building...\nStep 2: Done!');
    expect(result.current.error).toBeNull();
    expect(mockDeploymentsApi.getLogs).toHaveBeenCalledWith('dep-1');
  });

  it('returns empty string when deploymentId is undefined', () => {
    const { result } = renderHook(
      () => useDeploymentLogs(undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.logs).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(mockDeploymentsApi.getLogs).not.toHaveBeenCalled();
  });

  it('handles log fetch errors', async () => {
    mockDeploymentsApi.getLogs.mockRejectedValue(new Error('Logs unavailable'));

    const { result } = renderHook(
      () => useDeploymentLogs('dep-1', 'running'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Logs unavailable');
    expect(result.current.logs).toBe('');
  });
});

describe('useDeploymentMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides a createDeployment mutation', () => {
    const { result } = renderHook(
      () => useDeploymentMutations('proj-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.createDeployment).toBeDefined();
    expect(typeof result.current.createDeployment.mutateAsync).toBe('function');
  });

  it('calls deploymentsApi.create with correct args', async () => {
    const newDeployment = { ...mockDeployment, id: 'dep-new' };
    mockDeploymentsApi.create.mockResolvedValue(newDeployment);

    const { result } = renderHook(
      () => useDeploymentMutations('proj-1'),
      { wrapper: createWrapper() }
    );

    const data = {
      branch: 'main',
      git_repo_url: '/repos/my-app',
      ports: [3000],
    };

    await result.current.createDeployment.mutateAsync(data);

    expect(mockDeploymentsApi.create).toHaveBeenCalledWith('proj-1', data);
  });

  it('throws when projectId is undefined', async () => {
    const { result } = renderHook(
      () => useDeploymentMutations(undefined),
      { wrapper: createWrapper() }
    );

    await expect(
      result.current.createDeployment.mutateAsync({
        branch: 'main',
        git_repo_url: '/repos/app',
        ports: [3000],
      })
    ).rejects.toThrow('Project ID is required');
  });
});
