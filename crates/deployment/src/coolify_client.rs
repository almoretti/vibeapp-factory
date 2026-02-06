//! Coolify API client for managing deployments.

use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;
use url::Url;

/// Errors that can occur when interacting with the Coolify API.
#[derive(Debug, Error)]
pub enum CoolifyError {
    #[error("network error: {0}")]
    Transport(String),
    #[error("timeout")]
    Timeout,
    #[error("http {status}: {body}")]
    Http { status: u16, body: String },
    #[error("unauthorized - check COOLIFY_API_TOKEN")]
    Auth,
    #[error("not found: {0}")]
    NotFound(String),
    #[error("json error: {0}")]
    Serde(String),
    #[error("url error: {0}")]
    Url(String),
    #[error("missing environment variable: {0}")]
    MissingEnv(String),
}

impl CoolifyError {
    /// Returns true if the error is transient and could be retried.
    pub fn is_transient(&self) -> bool {
        matches!(self, Self::Transport(_) | Self::Timeout)
            || matches!(self, Self::Http { status, .. } if (500..=599).contains(status))
    }
}

/// Response from creating an application.
#[derive(Debug, Clone, Deserialize)]
pub struct CoolifyApp {
    pub uuid: String,
}

/// Response from starting a deployment.
#[derive(Debug, Clone, Deserialize)]
pub struct DeployResponse {
    #[serde(rename = "deployment_uuid")]
    pub deployment_uuid: Option<String>,
    pub message: String,
}

/// Application status returned by Coolify.
#[derive(Debug, Clone, Deserialize)]
pub struct CoolifyAppStatus {
    pub uuid: String,
    pub status: Option<String>,
    pub fqdn: Option<String>,
}

/// Logs response from Coolify.
#[derive(Debug, Clone, Deserialize)]
pub struct LogsResponse {
    pub logs: String,
}

/// Request body for creating a public repository application.
#[derive(Debug, Serialize)]
struct CreatePublicAppRequest<'a> {
    project_uuid: &'a str,
    server_uuid: &'a str,
    environment_name: &'a str,
    git_repository: &'a str,
    git_branch: &'a str,
    build_pack: &'a str,
    ports_exposes: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
}

/// HTTP client for the Coolify API.
#[derive(Clone)]
pub struct CoolifyClient {
    base: Url,
    http: Client,
    token: String,
    /// Coolify project UUID to deploy apps into
    project_uuid: String,
    /// Coolify server UUID where apps will run
    server_uuid: String,
}

impl std::fmt::Debug for CoolifyClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CoolifyClient")
            .field("base", &self.base)
            .field("project_uuid", &self.project_uuid)
            .field("server_uuid", &self.server_uuid)
            .finish_non_exhaustive()
    }
}

impl CoolifyClient {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
    const DEFAULT_BASE_URL: &'static str = "https://coolify.moretti.cc/api/v1";

    /// Creates a new CoolifyClient from environment variables.
    ///
    /// Required environment variables:
    /// - `COOLIFY_API_TOKEN`: Bearer token for API authentication
    /// - `COOLIFY_PROJECT_UUID`: The Coolify project to deploy into
    /// - `COOLIFY_SERVER_UUID`: The Coolify server to deploy on
    ///
    /// Optional:
    /// - `COOLIFY_BASE_URL`: Override the default API base URL
    pub fn from_env() -> Result<Self, CoolifyError> {
        let token =
            std::env::var("COOLIFY_API_TOKEN").map_err(|_| CoolifyError::MissingEnv("COOLIFY_API_TOKEN".into()))?;
        let project_uuid = std::env::var("COOLIFY_PROJECT_UUID")
            .map_err(|_| CoolifyError::MissingEnv("COOLIFY_PROJECT_UUID".into()))?;
        let server_uuid = std::env::var("COOLIFY_SERVER_UUID")
            .map_err(|_| CoolifyError::MissingEnv("COOLIFY_SERVER_UUID".into()))?;
        let base_url = std::env::var("COOLIFY_BASE_URL").unwrap_or_else(|_| Self::DEFAULT_BASE_URL.to_string());

        Self::new(&base_url, token, project_uuid, server_uuid)
    }

    /// Creates a new CoolifyClient with the given configuration.
    pub fn new(
        base_url: &str,
        token: String,
        project_uuid: String,
        server_uuid: String,
    ) -> Result<Self, CoolifyError> {
        let base = Url::parse(base_url).map_err(|e| CoolifyError::Url(e.to_string()))?;
        let http = Client::builder()
            .timeout(Self::REQUEST_TIMEOUT)
            .user_agent(concat!("vibeapp-coolify-client/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| CoolifyError::Transport(e.to_string()))?;

        Ok(Self {
            base,
            http,
            token,
            project_uuid,
            server_uuid,
        })
    }

    /// Creates a new application in Coolify from a public git repository.
    ///
    /// # Arguments
    /// * `name` - Display name for the application
    /// * `git_repo` - Git repository URL (e.g., "https://github.com/user/repo")
    /// * `branch` - Git branch to deploy
    /// * `ports_exposes` - Comma-separated ports to expose (e.g., "3000" or "3000,8080")
    pub async fn create_application(
        &self,
        name: &str,
        git_repo: &str,
        branch: &str,
        ports_exposes: &str,
    ) -> Result<CoolifyApp, CoolifyError> {
        let body = CreatePublicAppRequest {
            project_uuid: &self.project_uuid,
            server_uuid: &self.server_uuid,
            environment_name: "production",
            git_repository: git_repo,
            git_branch: branch,
            build_pack: "nixpacks",
            ports_exposes,
            name: Some(name),
        };

        self.post("/applications/public", &body).await
    }

    /// Triggers a deployment for an application.
    ///
    /// # Arguments
    /// * `app_uuid` - The UUID of the application to deploy
    pub async fn deploy(&self, app_uuid: &str) -> Result<DeployResponse, CoolifyError> {
        self.get(&format!("/applications/{}/start", app_uuid)).await
    }

    /// Gets the current status of an application.
    ///
    /// # Arguments
    /// * `app_uuid` - The UUID of the application
    pub async fn get_deployment_status(&self, app_uuid: &str) -> Result<CoolifyAppStatus, CoolifyError> {
        self.get(&format!("/applications/{}", app_uuid)).await
    }

    /// Retrieves deployment logs for an application.
    ///
    /// # Arguments
    /// * `app_uuid` - The UUID of the application
    /// * `lines` - Number of log lines to retrieve (default: 100)
    pub async fn get_deployment_logs(&self, app_uuid: &str, lines: Option<u32>) -> Result<String, CoolifyError> {
        let lines = lines.unwrap_or(100);
        let response: LogsResponse = self
            .get(&format!("/applications/{}/logs?lines={}", app_uuid, lines))
            .await?;
        Ok(response.logs)
    }

    /// Deletes an application from Coolify.
    ///
    /// This will also clean up Docker resources and volumes.
    ///
    /// # Arguments
    /// * `app_uuid` - The UUID of the application to delete
    pub async fn delete_application(&self, app_uuid: &str) -> Result<(), CoolifyError> {
        self.delete(&format!(
            "/applications/{}?delete_configurations=true&delete_volumes=true&docker_cleanup=true",
            app_uuid
        ))
        .await
    }

    /// Restarts an application.
    ///
    /// # Arguments
    /// * `app_uuid` - The UUID of the application to restart
    pub async fn restart(&self, app_uuid: &str) -> Result<DeployResponse, CoolifyError> {
        self.get(&format!("/applications/{}/restart", app_uuid))
            .await
    }

    async fn request<T>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&impl Serialize>,
    ) -> Result<T, CoolifyError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let url = self
            .base
            .join(path.trim_start_matches('/'))
            .map_err(|e| CoolifyError::Url(e.to_string()))?;

        let mut req = self.http.request(method, url).bearer_auth(&self.token);

        if let Some(b) = body {
            req = req.json(b);
        }

        let res = req.send().await.map_err(map_reqwest_error)?;

        match res.status() {
            s if s.is_success() => res
                .json()
                .await
                .map_err(|e| CoolifyError::Serde(e.to_string())),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(CoolifyError::Auth),
            StatusCode::NOT_FOUND => {
                let body = res.text().await.unwrap_or_default();
                Err(CoolifyError::NotFound(body))
            }
            s => {
                let status = s.as_u16();
                let body = res.text().await.unwrap_or_default();
                warn!("Coolify API error {}: {}", status, body);
                Err(CoolifyError::Http { status, body })
            }
        }
    }

    async fn get<T>(&self, path: &str) -> Result<T, CoolifyError>
    where
        T: for<'de> Deserialize<'de>,
    {
        self.request(reqwest::Method::GET, path, None::<&()>).await
    }

    async fn post<T, B>(&self, path: &str, body: &B) -> Result<T, CoolifyError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        self.request(reqwest::Method::POST, path, Some(body)).await
    }

    async fn delete(&self, path: &str) -> Result<(), CoolifyError> {
        let url = self
            .base
            .join(path.trim_start_matches('/'))
            .map_err(|e| CoolifyError::Url(e.to_string()))?;

        let res = self
            .http
            .delete(url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        match res.status() {
            s if s.is_success() => Ok(()),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(CoolifyError::Auth),
            StatusCode::NOT_FOUND => {
                let body = res.text().await.unwrap_or_default();
                Err(CoolifyError::NotFound(body))
            }
            s => {
                let status = s.as_u16();
                let body = res.text().await.unwrap_or_default();
                Err(CoolifyError::Http { status, body })
            }
        }
    }
}

fn map_reqwest_error(e: reqwest::Error) -> CoolifyError {
    if e.is_timeout() {
        CoolifyError::Timeout
    } else {
        CoolifyError::Transport(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{bearer_token, header, method, path, path_regex};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const TEST_TOKEN: &str = "test-token-12345";
    const TEST_PROJECT_UUID: &str = "proj-uuid-123";
    const TEST_SERVER_UUID: &str = "srv-uuid-456";

    async fn setup_client(mock_server: &MockServer) -> CoolifyClient {
        CoolifyClient::new(
            &format!("{}/", mock_server.uri()),
            TEST_TOKEN.to_string(),
            TEST_PROJECT_UUID.to_string(),
            TEST_SERVER_UUID.to_string(),
        )
        .expect("Failed to create test client")
    }

    // ==================== Error Type Tests ====================

    #[test]
    fn test_error_is_transient() {
        // Transient errors
        assert!(CoolifyError::Timeout.is_transient());
        assert!(CoolifyError::Transport("network error".into()).is_transient());
        assert!(CoolifyError::Http {
            status: 500,
            body: "internal error".into()
        }
        .is_transient());
        assert!(CoolifyError::Http {
            status: 502,
            body: "bad gateway".into()
        }
        .is_transient());
        assert!(CoolifyError::Http {
            status: 503,
            body: "service unavailable".into()
        }
        .is_transient());
        assert!(CoolifyError::Http {
            status: 504,
            body: "gateway timeout".into()
        }
        .is_transient());

        // Non-transient errors
        assert!(!CoolifyError::Auth.is_transient());
        assert!(!CoolifyError::NotFound("resource".into()).is_transient());
        assert!(!CoolifyError::Http {
            status: 400,
            body: "bad request".into()
        }
        .is_transient());
        assert!(!CoolifyError::Http {
            status: 404,
            body: "not found".into()
        }
        .is_transient());
        assert!(!CoolifyError::Serde("json error".into()).is_transient());
        assert!(!CoolifyError::Url("invalid url".into()).is_transient());
        assert!(
            !CoolifyError::MissingEnv("COOLIFY_API_TOKEN".into()).is_transient()
        );
    }

    #[test]
    fn test_error_display() {
        assert_eq!(
            CoolifyError::Timeout.to_string(),
            "timeout"
        );
        assert_eq!(
            CoolifyError::Auth.to_string(),
            "unauthorized - check COOLIFY_API_TOKEN"
        );
        assert_eq!(
            CoolifyError::NotFound("app-123".into()).to_string(),
            "not found: app-123"
        );
        assert_eq!(
            CoolifyError::Http {
                status: 500,
                body: "error".into()
            }
            .to_string(),
            "http 500: error"
        );
    }

    // ==================== Client Creation Tests ====================

    #[test]
    fn test_new_with_valid_url() {
        let client = CoolifyClient::new(
            "https://coolify.example.com/api/v1",
            "token".to_string(),
            "project".to_string(),
            "server".to_string(),
        );
        assert!(client.is_ok());
    }

    #[test]
    fn test_new_with_invalid_url() {
        let client = CoolifyClient::new(
            "not a valid url",
            "token".to_string(),
            "project".to_string(),
            "server".to_string(),
        );
        assert!(matches!(client, Err(CoolifyError::Url(_))));
    }

    #[test]
    fn test_debug_impl_hides_token() {
        let client = CoolifyClient::new(
            "https://coolify.example.com/api/v1/",
            "secret-token".to_string(),
            "project".to_string(),
            "server".to_string(),
        )
        .unwrap();
        let debug_output = format!("{:?}", client);
        assert!(!debug_output.contains("secret-token"));
        assert!(debug_output.contains("CoolifyClient"));
    }

    #[test]
    fn test_from_env_missing_token() {
        // Ensure env vars are not set for this test
        // SAFETY: We're in a test, modifying env vars is acceptable
        unsafe {
            std::env::remove_var("COOLIFY_API_TOKEN");
            std::env::remove_var("COOLIFY_PROJECT_UUID");
            std::env::remove_var("COOLIFY_SERVER_UUID");
        }

        let result = CoolifyClient::from_env();
        assert!(matches!(
            result,
            Err(CoolifyError::MissingEnv(ref var)) if var == "COOLIFY_API_TOKEN"
        ));
    }

    // ==================== create_application Tests ====================

    #[tokio::test]
    async fn test_create_application_success() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/applications/public"))
            .and(bearer_token(TEST_TOKEN))
            .and(header("content-type", "application/json"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "uuid": "app-uuid-789"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client
            .create_application(
                "my-app",
                "https://github.com/user/repo",
                "main",
                "3000",
            )
            .await;

        assert!(result.is_ok());
        let app = result.unwrap();
        assert_eq!(app.uuid, "app-uuid-789");
    }

    #[tokio::test]
    async fn test_create_application_auth_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/applications/public"))
            .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client
            .create_application(
                "my-app",
                "https://github.com/user/repo",
                "main",
                "3000",
            )
            .await;

        assert!(matches!(result, Err(CoolifyError::Auth)));
    }

    #[tokio::test]
    async fn test_create_application_forbidden() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/applications/public"))
            .respond_with(ResponseTemplate::new(403).set_body_string("Forbidden"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client
            .create_application(
                "my-app",
                "https://github.com/user/repo",
                "main",
                "3000",
            )
            .await;

        assert!(matches!(result, Err(CoolifyError::Auth)));
    }

    #[tokio::test]
    async fn test_create_application_server_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/applications/public"))
            .respond_with(
                ResponseTemplate::new(500).set_body_string("Internal Server Error"),
            )
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client
            .create_application(
                "my-app",
                "https://github.com/user/repo",
                "main",
                "3000",
            )
            .await;

        assert!(matches!(
            result,
            Err(CoolifyError::Http { status: 500, .. })
        ));
        assert!(result.unwrap_err().is_transient());
    }

    #[tokio::test]
    async fn test_create_application_invalid_json_response() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/applications/public"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not json"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client
            .create_application(
                "my-app",
                "https://github.com/user/repo",
                "main",
                "3000",
            )
            .await;

        assert!(matches!(result, Err(CoolifyError::Serde(_))));
    }

    // ==================== deploy Tests ====================

    #[tokio::test]
    async fn test_deploy_success() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/app-123/start"))
            .and(bearer_token(TEST_TOKEN))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "deployment_uuid": "deploy-uuid-456",
                "message": "Deployment started"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.deploy("app-123").await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.deployment_uuid, Some("deploy-uuid-456".to_string()));
        assert_eq!(response.message, "Deployment started");
    }

    #[tokio::test]
    async fn test_deploy_not_found() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/nonexistent/start"))
            .respond_with(
                ResponseTemplate::new(404).set_body_string("Application not found"),
            )
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.deploy("nonexistent").await;

        assert!(matches!(result, Err(CoolifyError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_deploy_without_deployment_uuid() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/app-123/start"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "message": "Already running"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.deploy("app-123").await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.deployment_uuid.is_none());
    }

    // ==================== get_deployment_status Tests ====================

    #[tokio::test]
    async fn test_get_deployment_status_running() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/app-123"))
            .and(bearer_token(TEST_TOKEN))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "uuid": "app-123",
                "status": "running",
                "fqdn": "https://myapp.example.com"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_status("app-123").await;

        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.uuid, "app-123");
        assert_eq!(status.status, Some("running".to_string()));
        assert_eq!(status.fqdn, Some("https://myapp.example.com".to_string()));
    }

    #[tokio::test]
    async fn test_get_deployment_status_building() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/app-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "uuid": "app-123",
                "status": "building",
                "fqdn": null
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_status("app-123").await;

        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status.status, Some("building".to_string()));
        assert!(status.fqdn.is_none());
    }

    #[tokio::test]
    async fn test_get_deployment_status_not_found() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/nonexistent"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not found"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_status("nonexistent").await;

        assert!(matches!(result, Err(CoolifyError::NotFound(_))));
    }

    // ==================== get_deployment_logs Tests ====================

    #[tokio::test]
    async fn test_get_deployment_logs_success() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path_regex(r"/applications/app-123/logs.*"))
            .and(bearer_token(TEST_TOKEN))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "logs": "Build started...\nInstalling dependencies...\nBuild complete!"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_logs("app-123", None).await;

        assert!(result.is_ok());
        let logs = result.unwrap();
        assert!(logs.contains("Build started"));
        assert!(logs.contains("Build complete"));
    }

    #[tokio::test]
    async fn test_get_deployment_logs_with_custom_lines() {
        let mock_server = MockServer::start().await;

        // Match the path part only; query params are handled separately by wiremock
        Mock::given(method("GET"))
            .and(path_regex(r"/applications/app-123/logs"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "logs": "Last 50 lines of logs"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_logs("app-123", Some(50)).await;

        assert!(result.is_ok());
        let logs = result.unwrap();
        assert_eq!(logs, "Last 50 lines of logs");
    }

    #[tokio::test]
    async fn test_get_deployment_logs_auth_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path_regex(r"/applications/app-123/logs.*"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.get_deployment_logs("app-123", None).await;

        assert!(matches!(result, Err(CoolifyError::Auth)));
    }

    // ==================== delete_application Tests ====================

    #[tokio::test]
    async fn test_delete_application_success() {
        let mock_server = MockServer::start().await;

        Mock::given(method("DELETE"))
            .and(path_regex(r"/applications/app-123.*"))
            .and(bearer_token(TEST_TOKEN))
            .respond_with(ResponseTemplate::new(200))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.delete_application("app-123").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_application_not_found() {
        let mock_server = MockServer::start().await;

        Mock::given(method("DELETE"))
            .and(path_regex(r"/applications/nonexistent.*"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not found"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.delete_application("nonexistent").await;

        assert!(matches!(result, Err(CoolifyError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_delete_application_auth_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("DELETE"))
            .and(path_regex(r"/applications/app-123.*"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.delete_application("app-123").await;

        assert!(matches!(result, Err(CoolifyError::Auth)));
    }

    #[tokio::test]
    async fn test_delete_application_server_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("DELETE"))
            .and(path_regex(r"/applications/app-123.*"))
            .respond_with(ResponseTemplate::new(503).set_body_string("Service unavailable"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.delete_application("app-123").await;

        assert!(matches!(
            result,
            Err(CoolifyError::Http { status: 503, .. })
        ));
    }

    // ==================== restart Tests ====================

    #[tokio::test]
    async fn test_restart_success() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/app-123/restart"))
            .and(bearer_token(TEST_TOKEN))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "deployment_uuid": "restart-uuid-789",
                "message": "Restart triggered"
            })))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.restart("app-123").await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.message, "Restart triggered");
    }

    #[tokio::test]
    async fn test_restart_not_found() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/applications/nonexistent/restart"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not found"))
            .mount(&mock_server)
            .await;

        let client = setup_client(&mock_server).await;
        let result = client.restart("nonexistent").await;

        assert!(matches!(result, Err(CoolifyError::NotFound(_))));
    }

    // ==================== Clone/Send/Sync Tests ====================

    #[tokio::test]
    async fn test_client_is_clone() {
        let mock_server = MockServer::start().await;
        let client = setup_client(&mock_server).await;
        let _cloned = client.clone();
    }

    fn assert_send<T: Send>() {}
    fn assert_sync<T: Sync>() {}

    #[test]
    fn test_client_is_send_sync() {
        assert_send::<CoolifyClient>();
        assert_sync::<CoolifyClient>();
    }

    #[test]
    fn test_error_is_send_sync() {
        assert_send::<CoolifyError>();
        assert_sync::<CoolifyError>();
    }
}
