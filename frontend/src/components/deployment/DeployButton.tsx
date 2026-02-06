import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import {
  useProjectDeployments,
  useDeploymentMutations,
} from '@/hooks/useDeployments';
import { repoApi } from '@/lib/api';
import type { Repo } from 'shared/types';
import { DeploymentsPanelDialog } from './DeploymentsPanel';
import {
  Rocket,
  ChevronDown,
  RefreshCw,
  List,
  CheckCircle,
  Loader2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeployButtonProps {
  projectId: string;
  repos: Repo[];
  className?: string;
  projectName?: string;
}

/**
 * Deploy button with dropdown for triggering deployments and viewing deployment history.
 */
export function DeployButton({ projectId, repos, className, projectName }: DeployButtonProps) {
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deploymentsDialogOpen, setDeploymentsDialogOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(
    repos[0] ?? null
  );
  const [customPorts, setCustomPorts] = useState('3000');

  const { deployments } = useProjectDeployments(projectId);
  const { createDeployment } = useDeploymentMutations(projectId);

  // Get git status for selected repo
  const { data: gitStatus } = useQuery({
    queryKey: ['repo-git-status', selectedRepo?.id],
    queryFn: () => repoApi.getGitStatus(selectedRepo!.id),
    enabled: !!selectedRepo,
  });

  const activeDeployment = deployments.find(
    (d) => d.status === 'running' || d.status === 'building'
  );

  // Compute subdomain preview matching backend logic: "{project}-{branch}" sanitized
  const subdomainPreview = useMemo(() => {
    if (!projectName || !gitStatus?.current_branch) return null;
    return `${projectName}-${gitStatus.current_branch}`
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase();
  }, [projectName, gitStatus?.current_branch]);

  const handleDeploy = useCallback(async () => {
    if (!selectedRepo || !gitStatus) return;

    // Parse ports from input
    const ports = customPorts
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p) && p > 0);

    if (ports.length === 0) {
      ports.push(3000); // Default port
    }

    try {
      await createDeployment.mutateAsync({
        branch: gitStatus.current_branch,
        git_repo_url: selectedRepo.path, // Using local path, backend will resolve
        ports,
      });
      setDeployDialogOpen(false);
    } catch (err) {
      console.error('Deployment failed:', err);
    }
  }, [selectedRepo, gitStatus, customPorts, createDeployment]);

  const getStatusIndicator = () => {
    if (activeDeployment?.status === 'building') {
      return (
        <span className="flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
      );
    }
    if (activeDeployment?.status === 'running') {
      return (
        <span className="flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      );
    }
    return null;
  };

  return (
    <>
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 gap-1.5 px-2',
                    activeDeployment && 'border-emerald-500/50',
                    className
                  )}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Deploy</span>
                  {getStatusIndicator()}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Deploy to Coolify</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDeployDialogOpen(true)}>
            <Rocket className="h-4 w-4 mr-2" />
            Deploy Now
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeploymentsDialogOpen(true)}>
            <List className="h-4 w-4 mr-2" />
            View Deployments
            {deployments.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {deployments.length}
              </span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deploy Dialog */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Deploy to Coolify
            </DialogTitle>
            <DialogDescription>
              Deploy the current branch to Coolify. This will create or update
              your deployment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Repo selection (if multiple) */}
            {repos.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="repo">Repository</Label>
                <select
                  id="repo"
                  value={selectedRepo?.id ?? ''}
                  onChange={(e) =>
                    setSelectedRepo(
                      repos.find((r) => r.id === e.target.value) ?? null
                    )
                  }
                  className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                >
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.display_name || repo.path.split('/').pop()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Branch info */}
            <div className="space-y-2">
              <Label>Branch</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
                <span className="text-sm font-mono">
                  {gitStatus?.current_branch ?? 'Loading...'}
                </span>
                {gitStatus && !gitStatus.is_clean && (
                  <span className="text-xs text-amber-500">
                    (uncommitted changes)
                  </span>
                )}
              </div>
            </div>

            {/* Port configuration */}
            <div className="space-y-2">
              <Label htmlFor="ports">Ports (comma-separated)</Label>
              <Input
                id="ports"
                value={customPorts}
                onChange={(e) => setCustomPorts(e.target.value)}
                placeholder="3000, 8080"
              />
              <p className="text-xs text-muted-foreground">
                Specify which ports your application listens on
              </p>
            </div>

            {/* Subdomain preview */}
            {subdomainPreview && (
              <div className="space-y-2">
                <Label>Deployment subdomain</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-mono text-muted-foreground">
                    {subdomainPreview}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  App name derived from project and branch
                </p>
              </div>
            )}

            {/* Active deployment warning */}
            {activeDeployment && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-sm">
                {activeDeployment.status === 'building' ? (
                  <Loader2 className="h-4 w-4 mt-0.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">
                    {activeDeployment.status === 'building'
                      ? 'Deployment in progress'
                      : 'Active deployment exists'}
                  </p>
                  <p className="text-xs opacity-80">
                    Branch: {activeDeployment.branch}
                    {activeDeployment.domain && ` • ${activeDeployment.domain}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeployDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={
                !selectedRepo ||
                !gitStatus ||
                createDeployment.isPending
              }
            >
              {createDeployment.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deployments List Dialog */}
      <DeploymentsPanelDialog
        projectId={projectId}
        open={deploymentsDialogOpen}
        onOpenChange={setDeploymentsDialogOpen}
      />
    </>
  );
}

export default DeployButton;
