-- Add branch field to tasks for branch-scoped workspace feature
ALTER TABLE tasks ADD COLUMN branch TEXT;

-- Index for filtering tasks by branch
CREATE INDEX idx_tasks_branch ON tasks(branch);

-- Composite index for project + branch filtering
CREATE INDEX idx_tasks_project_branch ON tasks(project_id, branch);
