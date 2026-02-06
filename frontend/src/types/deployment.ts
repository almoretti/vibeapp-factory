// Deployment types matching backend models

export type DeploymentStatus = 'pending' | 'building' | 'running' | 'failed';

export interface Deployment {
  id: string;
  project_id: string;
  branch: string;
  coolify_app_uuid: string | null;
  domain: string | null;
  status: DeploymentStatus;
  build_logs: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDeploymentRequest {
  branch: string;
  git_repo_url: string;
  ports: number[];
}

export interface DeploymentLogsResponse {
  logs: string;
}
