import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ProjectBranchContextType {
  /** Current branch for the active project (null = show all tasks / main) */
  currentBranch: string | null;
  /** Set the current branch for filtering */
  setCurrentBranch: (branch: string | null) => void;
}

const ProjectBranchContext = createContext<ProjectBranchContextType | null>(null);

export function ProjectBranchProvider({ children }: { children: ReactNode }) {
  const [currentBranch, setCurrentBranchState] = useState<string | null>(null);

  const setCurrentBranch = useCallback((branch: string | null) => {
    // Treat "main" and "master" as null (show all/default tasks)
    if (branch === 'main' || branch === 'master') {
      setCurrentBranchState(null);
    } else {
      setCurrentBranchState(branch);
    }
  }, []);

  return (
    <ProjectBranchContext.Provider value={{ currentBranch, setCurrentBranch }}>
      {children}
    </ProjectBranchContext.Provider>
  );
}

export function useProjectBranch() {
  const context = useContext(ProjectBranchContext);
  // Return default values if used outside provider (graceful fallback)
  if (!context) {
    return { currentBranch: null, setCurrentBranch: () => {} };
  }
  return context;
}
