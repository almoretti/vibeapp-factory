//! Deployment API routes for managing Coolify deployments.

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    deployment::{CreateDeployment, Deployment as DeploymentModel, DeploymentStatus},
    project::Project,
};
use deployment::{coolify_client::CoolifyClient, Deployment};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_middleware};

/// Request body for creating a deployment.
#[derive(Debug, Deserialize, TS)]
pub struct CreateDeploymentRequest {
    /// Git branch to deploy
    pub branch: String,
    /// Git repository URL (e.g., "https://github.com/user/repo")
    pub git_repo_url: String,
    /// Comma-separated ports to expose (e.g., "3000" or "3000,8080")
    #[serde(default = "default_ports")]
    pub ports: String,
}

fn default_ports() -> String {
    "3000".to_string()
}

/// Response for deployment operations.
#[derive(Debug, Serialize, TS)]
pub struct DeploymentResponse {
    pub deployment: DeploymentModel,
    pub message: String,
}

/// Query parameters for listing deployments.
#[derive(Debug, Deserialize)]
pub struct ListDeploymentsQuery {
    pub branch: Option<String>,
}

/// Query parameters for getting logs.
#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub lines: Option<u32>,
}

/// Response for deployment logs.
#[derive(Debug, Serialize, TS)]
pub struct DeploymentLogsResponse {
    pub logs: String,
}

/// Create a new deployment for a project.
///
/// POST /api/projects/:project_id/deploy
pub async fn create_deployment(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateDeploymentRequest>,
) -> Result<ResponseJson<ApiResponse<DeploymentResponse>>, ApiError> {
    tracing::info!(
        "Creating deployment for project {} on branch {}",
        project.id,
        payload.branch
    );

    // Check if there's already a deployment for this project/branch
    let existing = DeploymentModel::find_by_project_and_branch(
        &deployment.db().pool,
        project.id,
        &payload.branch,
    )
    .await?;

    if let Some(existing_deployment) = existing {
        // If there's an existing deployment with a coolify_app_uuid, redeploy it
        if let Some(app_uuid) = &existing_deployment.coolify_app_uuid {
            let coolify = CoolifyClient::from_env().map_err(|e| {
                ApiError::BadRequest(format!("Coolify not configured: {}", e))
            })?;

            match coolify.deploy(app_uuid).await {
                Ok(response) => {
                    // Update status to building
                    let updated = DeploymentModel::update_status(
                        &deployment.db().pool,
                        existing_deployment.id,
                        DeploymentStatus::Building,
                    )
                    .await?;

                    return Ok(ResponseJson(ApiResponse::success(DeploymentResponse {
                        deployment: updated,
                        message: response.message,
                    })));
                }
                Err(e) => {
                    tracing::error!("Failed to trigger deployment: {}", e);
                    return Err(ApiError::BadRequest(format!(
                        "Failed to trigger deployment: {}",
                        e
                    )));
                }
            }
        }
    }

    // Create a new deployment record
    let create_data = CreateDeployment {
        project_id: project.id,
        branch: payload.branch.clone(),
        coolify_app_uuid: None,
        domain: None,
    };

    let deployment_record = DeploymentModel::create(&deployment.db().pool, &create_data).await?;

    // Create application in Coolify
    let coolify = CoolifyClient::from_env().map_err(|e| {
        ApiError::BadRequest(format!("Coolify not configured: {}", e))
    })?;

    let app_name = format!("{}-{}", project.name, payload.branch)
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .to_lowercase();

    match coolify
        .create_application(&app_name, &payload.git_repo_url, &payload.branch, &payload.ports)
        .await
    {
        Ok(app) => {
            // Update deployment with Coolify app UUID
            let updated = DeploymentModel::update_coolify_info(
                &deployment.db().pool,
                deployment_record.id,
                &app.uuid,
                None,
            )
            .await?;

            // Trigger the deployment
            match coolify.deploy(&app.uuid).await {
                Ok(response) => {
                    let final_deployment = DeploymentModel::update_status(
                        &deployment.db().pool,
                        updated.id,
                        DeploymentStatus::Building,
                    )
                    .await?;

                    Ok(ResponseJson(ApiResponse::success(DeploymentResponse {
                        deployment: final_deployment,
                        message: response.message,
                    })))
                }
                Err(e) => {
                    tracing::error!("Failed to start deployment: {}", e);
                    let _ = DeploymentModel::update_status(
                        &deployment.db().pool,
                        updated.id,
                        DeploymentStatus::Failed,
                    )
                    .await;
                    Err(ApiError::BadRequest(format!(
                        "Failed to start deployment: {}",
                        e
                    )))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to create Coolify application: {}", e);
            let _ = DeploymentModel::update_status(
                &deployment.db().pool,
                deployment_record.id,
                DeploymentStatus::Failed,
            )
            .await;
            Err(ApiError::BadRequest(format!(
                "Failed to create application: {}",
                e
            )))
        }
    }
}

/// List deployments for a project.
///
/// GET /api/projects/:project_id/deployments
pub async fn list_deployments(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDeploymentsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<DeploymentModel>>>, ApiError> {
    let deployments = if let Some(branch) = query.branch {
        match DeploymentModel::find_by_project_and_branch(
            &deployment.db().pool,
            project.id,
            &branch,
        )
        .await?
        {
            Some(d) => vec![d],
            None => vec![],
        }
    } else {
        DeploymentModel::find_by_project_id(&deployment.db().pool, project.id).await?
    };

    Ok(ResponseJson(ApiResponse::success(deployments)))
}

/// Get deployment status.
///
/// GET /api/deployments/:deployment_id
pub async fn get_deployment_status(
    State(deployment): State<DeploymentImpl>,
    Path(deployment_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<DeploymentModel>>, ApiError> {
    let deployment_record = DeploymentModel::find_by_id(&deployment.db().pool, deployment_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Deployment not found".to_string()))?;

    // If we have a Coolify app UUID, fetch the latest status
    if let Some(app_uuid) = &deployment_record.coolify_app_uuid {
        let coolify = match CoolifyClient::from_env() {
            Ok(c) => c,
            Err(_) => return Ok(ResponseJson(ApiResponse::success(deployment_record))),
        };

        match coolify.get_deployment_status(app_uuid).await {
            Ok(status) => {
                // Map Coolify status to our status enum
                let new_status = match status.status.as_deref() {
                    Some("running") => DeploymentStatus::Running,
                    Some("building") | Some("starting") | Some("restarting") => {
                        DeploymentStatus::Building
                    }
                    Some("exited") | Some("stopped") | Some("error") => DeploymentStatus::Failed,
                    _ => deployment_record.status.clone(),
                };

                // Update domain if available
                let updated = if status.fqdn.is_some() || new_status != deployment_record.status {
                    if let Some(fqdn) = &status.fqdn {
                        DeploymentModel::update_coolify_info(
                            &deployment.db().pool,
                            deployment_id,
                            app_uuid,
                            Some(fqdn),
                        )
                        .await?
                    } else {
                        deployment_record.clone()
                    };

                    DeploymentModel::update_status(&deployment.db().pool, deployment_id, new_status)
                        .await?
                } else {
                    deployment_record
                };

                Ok(ResponseJson(ApiResponse::success(updated)))
            }
            Err(e) => {
                tracing::warn!("Failed to fetch Coolify status: {}", e);
                Ok(ResponseJson(ApiResponse::success(deployment_record)))
            }
        }
    } else {
        Ok(ResponseJson(ApiResponse::success(deployment_record)))
    }
}

/// Get deployment logs.
///
/// GET /api/deployments/:deployment_id/logs
pub async fn get_deployment_logs(
    State(deployment): State<DeploymentImpl>,
    Path(deployment_id): Path<Uuid>,
    Query(query): Query<LogsQuery>,
) -> Result<ResponseJson<ApiResponse<DeploymentLogsResponse>>, ApiError> {
    let deployment_record = DeploymentModel::find_by_id(&deployment.db().pool, deployment_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Deployment not found".to_string()))?;

    let app_uuid = deployment_record
        .coolify_app_uuid
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("Deployment has no Coolify application".to_string()))?;

    let coolify = CoolifyClient::from_env().map_err(|e| {
        ApiError::BadRequest(format!("Coolify not configured: {}", e))
    })?;

    match coolify.get_deployment_logs(app_uuid, query.lines).await {
        Ok(logs) => {
            // Also store logs in the database for persistence
            let _ =
                DeploymentModel::update_build_logs(&deployment.db().pool, deployment_id, &logs)
                    .await;

            Ok(ResponseJson(ApiResponse::success(DeploymentLogsResponse {
                logs,
            })))
        }
        Err(e) => {
            tracing::error!("Failed to fetch deployment logs: {}", e);
            // Return cached logs if available
            if let Some(cached_logs) = deployment_record.build_logs {
                Ok(ResponseJson(ApiResponse::success(DeploymentLogsResponse {
                    logs: cached_logs,
                })))
            } else {
                Err(ApiError::BadRequest(format!(
                    "Failed to fetch logs: {}",
                    e
                )))
            }
        }
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes that require project context
    let project_routes = Router::new()
        .route("/deploy", post(create_deployment))
        .route("/deployments", get(list_deployments))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_middleware,
        ));

    // Routes that operate on deployment directly
    let deployment_routes = Router::new()
        .route("/{deployment_id}", get(get_deployment_status))
        .route("/{deployment_id}/logs", get(get_deployment_logs));

    Router::new()
        .nest("/projects/{id}", project_routes)
        .nest("/deployments", deployment_routes)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== Request/Response Structure Tests ====================

    #[test]
    fn test_create_deployment_request_default_ports() {
        // Test that deserializing without ports uses default
        let json = r#"{"branch": "main", "git_repo_url": "https://github.com/user/repo"}"#;
        let request: CreateDeploymentRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.branch, "main");
        assert_eq!(request.git_repo_url, "https://github.com/user/repo");
        assert_eq!(request.ports, "3000"); // default
    }

    #[test]
    fn test_create_deployment_request_custom_ports() {
        let json = r#"{"branch": "develop", "git_repo_url": "https://github.com/user/repo", "ports": "8080,9000"}"#;
        let request: CreateDeploymentRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.branch, "develop");
        assert_eq!(request.ports, "8080,9000");
    }

    #[test]
    fn test_create_deployment_request_missing_required_fields() {
        // Missing branch
        let json = r#"{"git_repo_url": "https://github.com/user/repo"}"#;
        let result: Result<CreateDeploymentRequest, _> = serde_json::from_str(json);
        assert!(result.is_err());

        // Missing git_repo_url
        let json = r#"{"branch": "main"}"#;
        let result: Result<CreateDeploymentRequest, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_deployment_response_serialization() {
        let deployment = DeploymentModel {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            branch: "main".to_string(),
            coolify_app_uuid: Some("app-123".to_string()),
            domain: Some("https://myapp.example.com".to_string()),
            status: DeploymentStatus::Running,
            build_logs: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let response = DeploymentResponse {
            deployment,
            message: "Deployment started".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("main"));
        assert!(json.contains("Deployment started"));
        assert!(json.contains("app-123"));
    }

    #[test]
    fn test_deployment_logs_response_serialization() {
        let response = DeploymentLogsResponse {
            logs: "Build started...\nInstalling deps...".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("Build started"));
    }

    #[test]
    fn test_list_deployments_query_parsing() {
        // With branch filter
        let query: ListDeploymentsQuery = serde_qs::from_str("branch=main").unwrap();
        assert_eq!(query.branch, Some("main".to_string()));

        // Without branch filter
        let query: ListDeploymentsQuery = serde_qs::from_str("").unwrap();
        assert!(query.branch.is_none());
    }

    #[test]
    fn test_logs_query_parsing() {
        // With lines parameter
        let query: LogsQuery = serde_qs::from_str("lines=50").unwrap();
        assert_eq!(query.lines, Some(50));

        // Without lines parameter
        let query: LogsQuery = serde_qs::from_str("").unwrap();
        assert!(query.lines.is_none());
    }

    // ==================== Helper Function Tests ====================

    #[test]
    fn test_default_ports() {
        assert_eq!(default_ports(), "3000");
    }

    // ==================== App Name Generation Tests ====================

    #[test]
    fn test_app_name_generation_simple() {
        let project_name = "my-project";
        let branch = "main";
        let app_name = format!("{}-{}", project_name, branch)
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>()
            .to_lowercase();
        assert_eq!(app_name, "my-project-main");
    }

    #[test]
    fn test_app_name_generation_special_chars() {
        let project_name = "My Project!";
        let branch = "feature/test";
        let app_name = format!("{}-{}", project_name, branch)
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>()
            .to_lowercase();
        assert_eq!(app_name, "my-project--feature-test");
    }

    #[test]
    fn test_app_name_generation_unicode() {
        let project_name = "Проект";
        let branch = "main";
        let app_name = format!("{}-{}", project_name, branch)
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect::<String>()
            .to_lowercase();
        // Unicode chars are alphanumeric in Rust
        assert!(app_name.contains("main"));
    }

    // ==================== DeploymentStatus Mapping Tests ====================

    #[test]
    fn test_status_mapping_running() {
        let coolify_status = Some("running".to_string());
        let mapped = match coolify_status.as_deref() {
            Some("running") => DeploymentStatus::Running,
            _ => DeploymentStatus::Pending,
        };
        assert_eq!(mapped, DeploymentStatus::Running);
    }

    #[test]
    fn test_status_mapping_building() {
        let coolify_status = Some("building".to_string());
        let mapped = match coolify_status.as_deref() {
            Some("building") | Some("starting") | Some("restarting") => DeploymentStatus::Building,
            _ => DeploymentStatus::Pending,
        };
        assert_eq!(mapped, DeploymentStatus::Building);
    }

    #[test]
    fn test_status_mapping_failed_states() {
        for status in ["exited", "stopped", "error"] {
            let coolify_status = Some(status.to_string());
            let mapped = match coolify_status.as_deref() {
                Some("exited") | Some("stopped") | Some("error") => DeploymentStatus::Failed,
                _ => DeploymentStatus::Pending,
            };
            assert_eq!(mapped, DeploymentStatus::Failed, "Failed for status: {}", status);
        }
    }

    // ==================== TypeScript Type Generation Tests ====================

    #[test]
    fn test_ts_export_create_deployment_request() {
        // Verify TS type can be exported (compile-time check)
        let _type_name = <CreateDeploymentRequest as ts_rs::TS>::name();
    }

    #[test]
    fn test_ts_export_deployment_response() {
        let _type_name = <DeploymentResponse as ts_rs::TS>::name();
    }

    #[test]
    fn test_ts_export_deployment_logs_response() {
        let _type_name = <DeploymentLogsResponse as ts_rs::TS>::name();
    }
}
