import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deploymentsApi } from '@/lib/api';
import type {
  Deployment,
  CreateDeploymentRequest,
  DeploymentStatus,
} from '@/types/deployment';

const deploymentKeys = {
  all: ['deployments'] as const,
  byProject: (projectId: string) =>
    [...deploymentKeys.all, 'project', projectId] as const,
  byId: (deploymentId: string) =>
    [...deploymentKeys.all, 'detail', deploymentId] as const,
  logs: (deploymentId: string) =>
    [...deploymentKeys.all, 'logs', deploymentId] as const,
};

export interface UseProjectDeploymentsResult {
  deployments: Deployment[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to get all deployments for a project
 */
export function useProjectDeployments(
  projectId: string | undefined
): UseProjectDeploymentsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: deploymentKeys.byProject(projectId!),
    queryFn: () => deploymentsApi.listByProject(projectId!),
    enabled: !!projectId,
    refetchInterval: 10000, // Poll every 10 seconds for status updates
  });

  return {
    deployments: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export interface UseDeploymentResult {
  deployment: Deployment | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to get a single deployment by ID
 */
export function useDeployment(
  deploymentId: string | undefined
): UseDeploymentResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: deploymentKeys.byId(deploymentId!),
    queryFn: () => deploymentsApi.getById(deploymentId!),
    enabled: !!deploymentId,
    refetchInterval: (query) => {
      // Poll more frequently while building
      const deployment = query.state.data as Deployment | undefined;
      if (
        deployment?.status === 'building' ||
        deployment?.status === 'pending'
      ) {
        return 3000; // Poll every 3 seconds while building
      }
      return false; // Stop polling when done
    },
  });

  return {
    deployment: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export interface UseDeploymentLogsResult {
  logs: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to get deployment build logs
 */
export function useDeploymentLogs(
  deploymentId: string | undefined,
  status?: DeploymentStatus
): UseDeploymentLogsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: deploymentKeys.logs(deploymentId!),
    queryFn: () => deploymentsApi.getLogs(deploymentId!),
    enabled: !!deploymentId,
    refetchInterval: () => {
      // Poll while building
      if (status === 'building' || status === 'pending') {
        return 2000; // Poll every 2 seconds while building
      }
      return false;
    },
  });

  return {
    logs: data?.logs ?? '',
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export interface UseDeploymentMutationsResult {
  createDeployment: ReturnType<
    typeof useMutation<Deployment, Error, CreateDeploymentRequest>
  >;
}

/**
 * Hook for deployment mutations (create/trigger deployments)
 */
export function useDeploymentMutations(
  projectId: string | undefined
): UseDeploymentMutationsResult {
  const queryClient = useQueryClient();

  const createDeployment = useMutation({
    mutationFn: (data: CreateDeploymentRequest) => {
      if (!projectId) throw new Error('Project ID is required');
      return deploymentsApi.create(projectId, data);
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: deploymentKeys.byProject(projectId),
        });
      }
    },
    onError: (err) => {
      console.error('Failed to create deployment:', err);
    },
  });

  return { createDeployment };
}
