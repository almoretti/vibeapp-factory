use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::{
    project::SearchResult,
    repo::{Repo, UpdateRepo},
};
use deployment::Deployment;
use git::{GitBranch, GitRemote};
use serde::{Deserialize, Serialize};
use services::services::{
    file_search::SearchQuery,
    git_host::{GitHostError, GitHostProvider, GitHostService, OpenPrInfo, ProviderKind},
    repo::RepoError,
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    routes::projects::{OpenEditorRequest, OpenEditorResponse},
};

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RegisterRepoRequest {
    pub path: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct InitRepoRequest {
    pub parent_path: String,
    pub folder_name: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct BatchRepoRequest {
    pub ids: Vec<Uuid>,
}

pub async fn register_repo(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<RegisterRepoRequest>,
) -> Result<ResponseJson<ApiResponse<Repo>>, ApiError> {
    let repo = deployment
        .repo()
        .register(
            &deployment.db().pool,
            &payload.path,
            payload.display_name.as_deref(),
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(repo)))
}

pub async fn init_repo(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<InitRepoRequest>,
) -> Result<ResponseJson<ApiResponse<Repo>>, ApiError> {
    let repo = deployment
        .repo()
        .init_repo(
            &deployment.db().pool,
            deployment.git(),
            &payload.parent_path,
            &payload.folder_name,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(repo)))
}

pub async fn get_repo_branches(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<GitBranch>>>, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;

    let branches = deployment.git().get_all_branches(&repo.path)?;
    Ok(ResponseJson(ApiResponse::success(branches)))
}

pub async fn get_repo_remotes(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<GitRemote>>>, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;

    let remotes = deployment.git().list_remotes(&repo.path)?;
    Ok(ResponseJson(ApiResponse::success(remotes)))
}

pub async fn get_repos_batch(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(payload): ResponseJson<BatchRepoRequest>,
) -> Result<ResponseJson<ApiResponse<Vec<Repo>>>, ApiError> {
    let repos = Repo::find_by_ids(&deployment.db().pool, &payload.ids).await?;
    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub async fn get_repos(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Repo>>>, ApiError> {
    let repos = Repo::list_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub async fn get_repo(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Repo>>, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;
    Ok(ResponseJson(ApiResponse::success(repo)))
}

pub async fn update_repo(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateRepo>,
) -> Result<ResponseJson<ApiResponse<Repo>>, ApiError> {
    let repo = Repo::update(&deployment.db().pool, repo_id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(repo)))
}

pub async fn open_repo_in_editor(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<Option<OpenEditorRequest>>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.as_ref().and_then(|req| req.editor_type.as_deref());
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(&repo.path).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for repo {} at path: {}{}",
                repo_id,
                repo.path.to_string_lossy(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            deployment
                .track_if_analytics_allowed(
                    "repo_editor_opened",
                    serde_json::json!({
                        "repo_id": repo_id.to_string(),
                        "editor_type": payload.as_ref().and_then(|req| req.editor_type.as_ref()),
                        "remote_mode": url.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!("Failed to open editor for repo {}: {:?}", repo_id, e);
            Err(ApiError::EditorOpen(e))
        }
    }
}

pub async fn search_repo(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
    Query(search_query): Query<SearchQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<SearchResult>>>, StatusCode> {
    if search_query.q.trim().is_empty() {
        return Ok(ResponseJson(ApiResponse::error(
            "Query parameter 'q' is required and cannot be empty",
        )));
    }

    let repo = match deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await
    {
        Ok(repo) => repo,
        Err(e) => {
            tracing::error!("Failed to get repo {}: {}", repo_id, e);
            return Err(StatusCode::NOT_FOUND);
        }
    };

    match deployment
        .file_search_cache()
        .search_repo(&repo.path, &search_query.q, search_query.mode)
        .await
    {
        Ok(results) => Ok(ResponseJson(ApiResponse::success(results))),
        Err(e) => {
            tracing::error!("Failed to search files in repo {}: {}", repo_id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum ListPrsError {
    CliNotInstalled { provider: ProviderKind },
    AuthFailed { message: String },
    UnsupportedProvider,
}

#[derive(Debug, Deserialize)]
pub struct ListPrsQuery {
    pub remote: Option<String>,
}

pub async fn list_open_prs(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
    Query(query): Query<ListPrsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<OpenPrInfo>, ListPrsError>>, ApiError> {
    let repo = deployment
        .repo()
        .get_by_id(&deployment.db().pool, repo_id)
        .await?;

    let remote = match query.remote {
        Some(name) => GitRemote {
            url: deployment.git().get_remote_url(&repo.path, &name)?,
            name,
        },
        None => deployment.git().get_default_remote(&repo.path)?,
    };

    let git_host = match GitHostService::from_url(&remote.url) {
        Ok(host) => host,
        Err(GitHostError::UnsupportedProvider) => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ListPrsError::UnsupportedProvider,
            )));
        }
        Err(e) => {
            tracing::error!("Failed to create git host service: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&e.to_string())));
        }
    };

    match git_host.list_open_prs(&repo.path, &remote.url).await {
        Ok(prs) => Ok(ResponseJson(ApiResponse::success(prs))),
        Err(GitHostError::CliNotInstalled { provider }) => Ok(ResponseJson(
            ApiResponse::error_with_data(ListPrsError::CliNotInstalled { provider }),
        )),
        Err(GitHostError::AuthFailed(message)) => Ok(ResponseJson(ApiResponse::error_with_data(
            ListPrsError::AuthFailed { message },
        ))),
        Err(GitHostError::UnsupportedProvider) => Ok(ResponseJson(ApiResponse::error_with_data(
            ListPrsError::UnsupportedProvider,
        ))),
        Err(e) => {
            tracing::error!("Failed to list open PRs for repo {}: {}", repo_id, e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

/// Git status response for a repo
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RepoGitStatus {
    pub current_branch: String,
    pub is_clean: bool,
    pub ahead: u32,
    pub behind: u32,
    pub has_remote: bool,
    pub last_commit_message: Option<String>,
}

/// Get git status for a repo (branch, ahead/behind, dirty status)
pub async fn get_repo_git_status(
    Path(repo_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<RepoGitStatus>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    // Get current branch
    let current_branch = git.get_current_branch(repo_path)
        .unwrap_or_else(|_| "unknown".to_string());

    // Check if clean
    let is_clean = git.is_worktree_clean(repo_path).unwrap_or(false);

    // Get ahead/behind (if remote tracking exists)
    let (ahead, behind, has_remote) = match git.get_remote_branch_status(repo_path, &current_branch, None) {
        Ok((ahead, behind)) => (ahead as u32, behind as u32, true),
        Err(_) => (0, 0, false),
    };

    // Get last commit message
    let last_commit_message = git.get_commit_subject(repo_path, "HEAD").ok();

    Ok(ResponseJson(ApiResponse::success(RepoGitStatus {
        current_branch,
        is_clean,
        ahead,
        behind,
        has_remote,
        last_commit_message,
    })))
}

/// Push current branch to remote
pub async fn push_repo(
    Path(repo_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    // Get current branch
    let branch = git.get_current_branch(repo_path)
        .map_err(|e| ApiError::BadRequest(format!("Failed to get current branch: {}", e)))?;

    // Get remote
    let remotes = git.list_remotes(repo_path)?;
    let remote = remotes.first()
        .ok_or_else(|| ApiError::BadRequest("No remote configured".to_string()))?;

    // Push
    git.push_to_remote(repo_path, &branch, false)
        .map_err(|e| ApiError::BadRequest(format!("Push failed: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(format!("Pushed {} to {}", branch, remote.name))))
}

/// Pull from remote
pub async fn pull_repo(
    Path(repo_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    // Get current branch
    let branch = git.get_current_branch(repo_path)
        .map_err(|e| ApiError::BadRequest(format!("Failed to get current branch: {}", e)))?;

    // Get remote
    let remotes = git.list_remotes(repo_path)?;
    let remote = remotes.first()
        .ok_or_else(|| ApiError::BadRequest("No remote configured".to_string()))?;

    // Fetch and merge (pull)
    git.fetch_branch(repo_path, &remote.name, &branch)
        .map_err(|e| ApiError::BadRequest(format!("Fetch failed: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(format!("Pulled {} from {}", branch, remote.name))))
}

#[derive(Debug, Deserialize)]
pub struct CheckoutRequest {
    pub branch: String,
}

/// Checkout (switch to) a branch
pub async fn checkout_branch(
    Path(repo_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CheckoutRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    // Check if worktree is clean before switching
    let is_clean = git.is_worktree_clean(repo_path).unwrap_or(false);
    if !is_clean {
        return Err(ApiError::BadRequest(
            "Cannot switch branches: working directory has uncommitted changes".to_string()
        ));
    }

    git.checkout_branch(repo_path, &req.branch)
        .map_err(|e| ApiError::BadRequest(format!("Checkout failed: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(format!("Switched to branch '{}'", req.branch))))
}

#[derive(Debug, Deserialize)]
pub struct CreateBranchRequest {
    pub name: String,
    #[serde(default)]
    pub checkout: bool,
}

/// Create a new branch
pub async fn create_branch(
    Path(repo_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<CreateBranchRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    if req.checkout {
        git.create_and_checkout_branch(repo_path, &req.name)
            .map_err(|e| ApiError::BadRequest(format!("Failed to create branch: {}", e)))?;
        Ok(ResponseJson(ApiResponse::success(format!("Created and switched to branch '{}'", req.name))))
    } else {
        git.create_branch(repo_path, &req.name)
            .map_err(|e| ApiError::BadRequest(format!("Failed to create branch: {}", e)))?;
        Ok(ResponseJson(ApiResponse::success(format!("Created branch '{}'", req.name))))
    }
}

#[derive(Debug, Deserialize)]
pub struct DeleteBranchParams {
    pub repo_id: Uuid,
    pub branch_name: String,
}

/// Delete a local branch
pub async fn delete_branch(
    Path(params): Path<DeleteBranchParams>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<String>>, ApiError> {
    let repo = Repo::find_by_id(&deployment.db().pool, params.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let git = deployment.git();
    let repo_path = std::path::Path::new(&repo.path);

    git.delete_branch(repo_path, &params.branch_name, false)
        .map_err(|e| ApiError::BadRequest(format!("Failed to delete branch: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(format!("Deleted branch '{}'", params.branch_name))))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/repos", get(get_repos).post(register_repo))
        .route("/repos/init", post(init_repo))
        .route("/repos/batch", post(get_repos_batch))
        .route("/repos/{repo_id}", get(get_repo).put(update_repo))
        .route("/repos/{repo_id}/branches", get(get_repo_branches).post(create_branch))
        .route("/repos/{repo_id}/branches/{branch_name}", delete(delete_branch))
        .route("/repos/{repo_id}/checkout", post(checkout_branch))
        .route("/repos/{repo_id}/remotes", get(get_repo_remotes))
        .route("/repos/{repo_id}/prs", get(list_open_prs))
        .route("/repos/{repo_id}/search", get(search_repo))
        .route("/repos/{repo_id}/open-editor", post(open_repo_in_editor))
        .route("/repos/{repo_id}/git-status", get(get_repo_git_status))
        .route("/repos/{repo_id}/push", post(push_repo))
        .route("/repos/{repo_id}/pull", post(pull_repo))
}
