import { useState } from 'react';
import { useProjectDeployments } from '@/hooks/useDeployments';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader } from '@/components/ui/loader';
import { BuildLogViewer } from './BuildLogViewer';
import {
  Rocket,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeploymentsPanelProps {
  projectId: string;
  className?: string;
}

function getStatusConfig(status: DeploymentStatus) {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        icon: Clock,
        variant: 'secondary' as const,
        className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
      };
    case 'building':
      return {
        label: 'Building',
        icon: Loader2,
        variant: 'secondary' as const,
        className:
          'bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse',
      };
    case 'running':
      return {
        label: 'Running',
        icon: CheckCircle,
        variant: 'secondary' as const,
        className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircle,
        variant: 'destructive' as const,
        className: 'bg-red-500/10 text-red-600 dark:text-red-400',
      };
    default:
      return {
        label: status,
        icon: Clock,
        variant: 'secondary' as const,
        className: '',
      };
  }
}

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn('gap-1', config.className)}>
      <Icon
        className={cn('h-3 w-3', status === 'building' && 'animate-spin')}
      />
      {config.label}
    </Badge>
  );
}

function DeploymentItem({ deployment }: { deployment: Deployment }) {
  const [showLogs, setShowLogs] = useState(false);
  const createdAt = new Date(deployment.created_at);
  const timeAgo = getTimeAgo(createdAt);

  return (
    <>
      <div className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-md border">
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={deployment.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {deployment.branch}
              </span>
              {deployment.domain && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`https://${deployment.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>{deployment.domain}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{timeAgo}</div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowLogs(!showLogs)}
        >
          <FileText className="h-3.5 w-3.5" />
          Logs
          {showLogs ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </div>

      {showLogs && (
        <div className="mt-1 mb-2">
          <BuildLogViewer
            deploymentId={deployment.id}
            status={deployment.status}
            className="max-h-64"
          />
        </div>
      )}
    </>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Panel showing deployments list for a project with status badges.
 */
export function DeploymentsPanel({ projectId, className }: DeploymentsPanelProps) {
  const { deployments, isLoading, error } = useProjectDeployments(projectId);
  const [isExpanded, setIsExpanded] = useState(false);

  const activeDeployments = deployments.filter(
    (d) => d.status === 'running' || d.status === 'building'
  );
  const hasActiveDeployment = activeDeployments.length > 0;

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-4', className)}>
        <Loader size={16} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-sm text-destructive py-2', className)}>
        Failed to load deployments
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div
        className={cn('text-sm text-muted-foreground py-2 text-center', className)}
      >
        No deployments yet
      </div>
    );
  }

  // Show summary view by default
  return (
    <div className={cn('space-y-2', className)}>
      {/* Summary header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-secondary/30 rounded-md hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Deployments ({deployments.length})
          </span>
          {hasActiveDeployment && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="space-y-2 pl-2">
          {deployments.map((deployment) => (
            <DeploymentItem key={deployment.id} deployment={deployment} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dialog version of DeploymentsPanel for use in modals
 */
export function DeploymentsPanelDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deployments, isLoading, error } = useProjectDeployments(projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Deployments
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader size={24} message="Loading deployments..." />
            </div>
          ) : error ? (
            <div className="text-destructive py-4 text-center">
              Failed to load deployments: {error.message}
            </div>
          ) : deployments.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No deployments yet. Click the Deploy button to create one.
            </div>
          ) : (
            deployments.map((deployment) => (
              <DeploymentItem key={deployment.id} deployment={deployment} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DeploymentsPanel;
