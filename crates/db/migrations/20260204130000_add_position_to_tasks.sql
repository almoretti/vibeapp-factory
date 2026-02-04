-- Add position field to tasks for manual ordering
-- Lower position = higher priority (sorted ASC)
-- Default to created_at timestamp converted to seconds for existing tasks

ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Set existing tasks' positions based on creation order (older tasks have lower positions)
-- This preserves the current order by created_at
UPDATE tasks SET position = (
    SELECT COUNT(*) FROM tasks t2 
    WHERE t2.project_id = tasks.project_id 
    AND t2.status = tasks.status 
    AND t2.created_at <= tasks.created_at
);
