import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { ExecutionProcess } from 'shared/types';

export interface UseProjectDevServerStatusResult {
  runningDevServers: ExecutionProcess[];
  isLoading: boolean;
  hasRunningDevServer: boolean;
  error: Error | null;
}

/**
 * Hook to get the dev server status for a project.
 * Returns running dev servers for the entire project (across all workspaces).
 */
export function useProjectDevServerStatus(
  projectId: string | undefined
): UseProjectDevServerStatusResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['project-dev-server-status', projectId],
    queryFn: () => projectsApi.getDevServerStatus(projectId!),
    enabled: !!projectId,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const runningDevServers = data ?? [];

  return {
    runningDevServers,
    isLoading,
    hasRunningDevServer: runningDevServers.length > 0,
    error: error as Error | null,
  };
}
