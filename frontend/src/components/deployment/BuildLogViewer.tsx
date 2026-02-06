import { useRef, useEffect } from 'react';
import { useDeploymentLogs } from '@/hooks/useDeployments';
import type { DeploymentStatus } from '@/types/deployment';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';

interface BuildLogViewerProps {
  deploymentId: string;
  status: DeploymentStatus;
  className?: string;
}

/**
 * Displays deployment build logs with auto-scroll and auto-refresh while building.
 */
export function BuildLogViewer({
  deploymentId,
  status,
  className,
}: BuildLogViewerProps) {
  const { logs, isLoading, error } = useDeploymentLogs(deploymentId, status);
  const containerRef = useRef<HTMLDivElement>(null);
  const isBuilding = status === 'building' || status === 'pending';

  // Auto-scroll to bottom when logs update while building
  useEffect(() => {
    if (isBuilding && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isBuilding]);

  if (isLoading && !logs) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader size={24} message="Loading logs..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load logs: {error.message}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-black text-green-400 font-mono text-xs p-4 overflow-auto rounded-md',
        className
      )}
    >
      {logs ? (
        <pre className="whitespace-pre-wrap break-words">{logs}</pre>
      ) : (
        <div className="text-muted-foreground italic">
          {isBuilding ? 'Waiting for build output...' : 'No logs available'}
        </div>
      )}
      {isBuilding && (
        <div className="flex items-center gap-2 mt-2 text-amber-400">
          <span className="animate-pulse">Building...</span>
        </div>
      )}
    </div>
  );
}

export default BuildLogViewer;
