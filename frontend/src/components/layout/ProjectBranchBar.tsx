import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectBranch } from '@/contexts/ProjectBranchContext';
import {
  GitBranch,
  Plus,
  Trash2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Check,
  Search,
  ChevronDown,
} from 'lucide-react';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { repoApi } from '@/lib/api';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { useProjectDevServerStatus } from '@/hooks/useProjectDevServerStatus';
import type { Repo } from 'shared/types';
import { cn } from '@/lib/utils';
import { Square } from 'lucide-react';

interface ProjectBranchBarProps {
  projectId: string;
  className?: string;
}

interface RepoBranchItemProps {
  repo: Repo;
}

function RepoBranchItem({ repo }: RepoBranchItemProps) {
  const { t } = useTranslation(['common', 'tasks']);
  const queryClient = useQueryClient();
  const { setCurrentBranch } = useProjectBranch();

  const [branchFilter, setBranchFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);

  // Fetch git status
  const { data: gitStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['repo-git-status', repo.id],
    queryFn: () => repoApi.getGitStatus(repo.id),
    refetchInterval: 30000,
  });

  // Update the project branch context when current branch changes
  useEffect(() => {
    if (gitStatus?.current_branch) {
      setCurrentBranch(gitStatus.current_branch);
    }
  }, [gitStatus?.current_branch, setCurrentBranch]);

  // Fetch branches
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['repo-branches', repo.id],
    queryFn: () => repoApi.getBranches(repo.id),
  });

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => repoApi.checkoutBranch(repo.id, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repo.id] });
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repo.id] });
    },
  });

  // Create branch mutation
  const createBranchMutation = useMutation({
    mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) =>
      repoApi.createBranch(repo.id, name, checkout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repo.id] });
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repo.id] });
      setNewBranchName('');
      setCreateDialogOpen(false);
    },
  });

  // Delete branch mutation
  const deleteBranchMutation = useMutation({
    mutationFn: (branchName: string) => repoApi.deleteBranch(repo.id, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repo.id] });
    },
  });

  // Push mutation
  const pushMutation = useMutation({
    mutationFn: () => repoApi.push(repo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repo.id] });
    },
  });

  // Pull mutation
  const pullMutation = useMutation({
    mutationFn: () => repoApi.pull(repo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repo.id] });
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repo.id] });
    },
  });

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!gitStatus?.is_clean) {
        if (
          !window.confirm(
            t('tasks:git.checkout.dirtyWarning', 'You have uncommitted changes. Switch anyway?')
          )
        ) {
          return;
        }
      }
      await checkoutMutation.mutateAsync(branch);
    },
    [checkoutMutation, gitStatus?.is_clean, t]
  );

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    await createBranchMutation.mutateAsync({
      name: newBranchName.trim(),
      checkout: checkoutAfterCreate,
    });
  }, [createBranchMutation, newBranchName, checkoutAfterCreate]);

  const handleDeleteBranch = useCallback(
    async (branchName: string) => {
      const protectedBranches = ['main', 'master', 'develop', 'dev'];
      if (protectedBranches.includes(branchName)) {
        alert(t('tasks:git.delete.protected', `Cannot delete protected branch "${branchName}"`));
        return;
      }
      if (branchName === gitStatus?.current_branch) {
        alert(t('tasks:git.delete.current', 'Cannot delete the currently checked out branch'));
        return;
      }
      if (window.confirm(t('tasks:git.delete.confirm', `Delete branch "${branchName}"?`))) {
        await deleteBranchMutation.mutateAsync(branchName);
      }
    },
    [deleteBranchMutation, gitStatus?.current_branch, t]
  );

  const localBranches = branches.filter((b) => !b.is_remote);
  const filteredBranches = branchFilter
    ? localBranches.filter((b) => b.name.toLowerCase().includes(branchFilter.toLowerCase()))
    : localBranches;

  const isLoading = statusLoading || branchesLoading;
  const isPending =
    checkoutMutation.isPending || createBranchMutation.isPending || deleteBranchMutation.isPending;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-md border border-border">
        {/* Repo name */}
        <span className="text-xs font-medium text-muted-foreground truncate max-w-[100px]">
          {repo.display_name || repo.path.split('/').pop()}
        </span>

        {/* Branch dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2"
              disabled={isLoading || isPending}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate text-xs font-medium">
                {gitStatus?.current_branch || 'Loading...'}
              </span>
              {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Switch Branch</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Search */}
            <div className="px-2 py-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter branches..."
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-7 pl-7 text-xs"
                  autoFocus
                />
              </div>
            </div>
            <DropdownMenuSeparator />

            {/* Branch list */}
            <div className="max-h-[200px] overflow-y-auto">
              {filteredBranches.map((branch) => (
                <DropdownMenuItem
                  key={branch.name}
                  className="text-xs font-mono flex items-center justify-between"
                  onSelect={() => !branch.is_current && handleCheckout(branch.name)}
                  disabled={isPending || branch.is_current}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {branch.is_current ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{branch.name}</span>
                  </div>
                  {!branch.is_current &&
                    !['main', 'master', 'develop', 'dev'].includes(branch.name) && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBranch(branch.name);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCreateDialogOpen(true)} className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-2" />
              Create New Branch...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status indicators */}
        {gitStatus && (
          <div className="flex items-center gap-1.5 text-xs">
            {!gitStatus.is_clean && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Uncommitted changes</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {gitStatus.has_remote && gitStatus.ahead > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => pushMutation.mutate()}
                      disabled={pushMutation.isPending}
                      className="flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 px-1 py-0.5 rounded transition-colors"
                    >
                      <ArrowUp className="h-3 w-3" />
                      {gitStatus.ahead}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Push {gitStatus.ahead} commit{gitStatus.ahead > 1 ? 's' : ''}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {gitStatus.has_remote && gitStatus.behind > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => pullMutation.mutate()}
                      disabled={pullMutation.isPending}
                      className="flex items-center gap-0.5 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 px-1 py-0.5 rounded transition-colors"
                    >
                      <ArrowDown className="h-3 w-3" />
                      {gitStatus.behind}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Pull {gitStatus.behind} commit{gitStatus.behind > 1 ? 's' : ''}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>

      {/* Create branch dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from {gitStatus?.current_branch || 'HEAD'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                Branch name
              </label>
              <Input
                id="branch-name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-feature"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="checkout-after"
                checked={checkoutAfterCreate}
                onChange={(e) => setCheckoutAfterCreate(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="checkout-after" className="text-sm">
                Switch to new branch after creation
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || createBranchMutation.isPending}
            >
              {createBranchMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Branch'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * ProjectBranchBar - Shows branch info for all repos in a project
 * Inspired by AutoMaker's WorktreePanel
 */
export function ProjectBranchBar({ projectId, className }: ProjectBranchBarProps) {
  const { data: repos = [], isLoading } = useProjectRepos(projectId);
  const { hasRunningDevServer, runningDevServers } = useProjectDevServerStatus(projectId);

  if (isLoading || repos.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-border bg-background/50 backdrop-blur-sm overflow-x-auto',
        className
      )}
    >
      <span className="text-xs font-medium text-muted-foreground shrink-0">Repos:</span>
      {repos.map((repo) => (
        <RepoBranchItem key={repo.id} repo={repo} />
      ))}
      
      {/* Dev Server Status Indicator */}
      <div className="ml-auto shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                hasRunningDevServer 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-muted text-muted-foreground'
              )}>
                {hasRunningDevServer ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>Dev Server</span>
                  </>
                ) : (
                  <>
                    <Square className="h-3 w-3" />
                    <span>Dev Server</span>
                  </>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {hasRunningDevServer 
                ? `${runningDevServers.length} dev server${runningDevServers.length > 1 ? 's' : ''} running`
                : 'No dev server running'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export default ProjectBranchBar;
