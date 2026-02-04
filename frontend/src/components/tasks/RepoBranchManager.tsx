import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch as GitBranchIcon, Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
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
import { repoApi } from '@/lib/api';

interface RepoBranchManagerProps {
  repoId: string;
  className?: string;
}

/**
 * RepoBranchManager - Provides branch management for a repo
 * 
 * Features:
 * - Show current branch with status (ahead/behind)
 * - Switch branches (with dirty check warning)
 * - Create new branches
 * - Delete branches (with protection for main/master)
 */
export function RepoBranchManager({ repoId, className = '' }: RepoBranchManagerProps) {
  const { t } = useTranslation(['common', 'tasks']);
  const queryClient = useQueryClient();
  
  const [newBranchName, setNewBranchName] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [checkoutAndCreate, setCheckoutAndCreate] = useState(true);

  // Fetch branches
  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['repo-branches', repoId],
    queryFn: () => repoApi.getBranches(repoId),
    enabled: !!repoId,
  });

  // Fetch git status
  const { data: gitStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['repo-git-status', repoId],
    queryFn: () => repoApi.getGitStatus(repoId),
    enabled: !!repoId,
    refetchInterval: 30000, // Refresh every 30s
  });

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => repoApi.checkoutBranch(repoId, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repoId] });
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repoId] });
    },
  });

  // Create branch mutation
  const createBranchMutation = useMutation({
    mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) =>
      repoApi.createBranch(repoId, name, checkout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repoId] });
      queryClient.invalidateQueries({ queryKey: ['repo-git-status', repoId] });
      setNewBranchName('');
      setCreateDialogOpen(false);
    },
  });

  // Delete branch mutation
  const deleteBranchMutation = useMutation({
    mutationFn: (branchName: string) => repoApi.deleteBranch(repoId, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repo-branches', repoId] });
    },
  });

  const handleCheckout = useCallback(async (branch: string) => {
    if (!gitStatus?.is_clean) {
      // Show warning - in a real implementation this would be a confirm dialog
      if (!window.confirm(t('tasks:git.checkout.dirtyWarning', 
        'You have uncommitted changes. Are you sure you want to switch branches?'))) {
        return;
      }
    }
    await checkoutMutation.mutateAsync(branch);
  }, [checkoutMutation, gitStatus?.is_clean, t]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    await createBranchMutation.mutateAsync({
      name: newBranchName.trim(),
      checkout: checkoutAndCreate,
    });
  }, [createBranchMutation, newBranchName, checkoutAndCreate]);

  const handleDeleteBranch = useCallback(async (branchName: string) => {
    const protected_branches = ['main', 'master', 'develop', 'dev'];
    if (protected_branches.includes(branchName)) {
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
  }, [deleteBranchMutation, gitStatus?.current_branch, t]);

  const currentBranch = branches.find(b => b.is_current);
  const localBranches = branches.filter(b => !b.is_remote);
  const isLoading = branchesLoading || statusLoading;
  const isPending = checkoutMutation.isPending || createBranchMutation.isPending || deleteBranchMutation.isPending;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Branch dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={isLoading || isPending}>
            <GitBranchIcon className="h-4 w-4" />
            <span className="max-w-[150px] truncate">
              {gitStatus?.current_branch || currentBranch?.name || 'Select branch'}
            </span>
            {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {/* Status indicator */}
          {gitStatus && !gitStatus.is_clean && (
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {t('tasks:git.status.uncommittedChanges', 'Uncommitted changes')}
            </div>
          )}
          {gitStatus?.has_remote && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {gitStatus.ahead > 0 && <span className="text-emerald-600">↑{gitStatus.ahead}</span>}
              {gitStatus.ahead > 0 && gitStatus.behind > 0 && ' '}
              {gitStatus.behind > 0 && <span className="text-amber-600">↓{gitStatus.behind}</span>}
            </div>
          )}
          <DropdownMenuSeparator />
          
          {/* Branch list */}
          {localBranches.map((branch) => (
            <DropdownMenuItem
              key={branch.name}
              className="flex items-center justify-between"
              onSelect={() => !branch.is_current && handleCheckout(branch.name)}
              disabled={branch.is_current}
            >
              <span className={`truncate ${branch.is_current ? 'font-medium' : ''}`}>
                {branch.name}
              </span>
              <div className="flex items-center gap-1">
                {branch.is_current && (
                  <span className="text-xs bg-primary/10 text-primary px-1 rounded">current</span>
                )}
                {!branch.is_current && !['main', 'master', 'develop', 'dev'].includes(branch.name) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBranch(branch.name);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete branch</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create branch button */}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setCreateDialogOpen(true)}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">New Branch</span>
      </Button>
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tasks:git.createBranch.title', 'Create New Branch')}</DialogTitle>
            <DialogDescription>
              {t('tasks:git.createBranch.description', 'Create a new branch from the current HEAD')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                {t('tasks:git.createBranch.nameLabel', 'Branch name')}
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
                id="checkout-after-create"
                checked={checkoutAndCreate}
                onChange={(e) => setCheckoutAndCreate(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="checkout-after-create" className="text-sm">
                {t('tasks:git.createBranch.checkoutAfter', 'Switch to new branch after creation')}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t('common:cancel', 'Cancel')}
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
    </div>
  );
}

export default RepoBranchManager;
