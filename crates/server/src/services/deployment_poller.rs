//! Background service for polling Coolify deployment status.

use std::time::Duration;

use db::models::deployment::{Deployment, DeploymentStatus};
use deployment::coolify_client::{CoolifyClient, CoolifyError};
use sqlx::SqlitePool;
use tokio::time::interval;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

/// Interval between status polls.
const POLL_INTERVAL: Duration = Duration::from_secs(30);

/// Service that polls Coolify for deployment status updates.
pub struct DeploymentPoller {
    pool: SqlitePool,
    coolify_client: CoolifyClient,
    poll_interval: Duration,
    cancel_token: CancellationToken,
}

impl DeploymentPoller {
    /// Creates a new DeploymentPoller.
    ///
    /// Returns None if Coolify client cannot be initialized (missing env vars).
    pub fn new(pool: SqlitePool, cancel_token: CancellationToken) -> Option<Self> {
        match CoolifyClient::from_env() {
            Ok(client) => Some(Self {
                pool,
                coolify_client: client,
                poll_interval: POLL_INTERVAL,
                cancel_token,
            }),
            Err(e) => {
                info!("Coolify client not configured, deployment polling disabled: {}", e);
                None
            }
        }
    }

    /// Spawns the poller as a background task.
    ///
    /// Returns the JoinHandle for the spawned task.
    pub fn spawn(pool: SqlitePool, cancel_token: CancellationToken) -> Option<tokio::task::JoinHandle<()>> {
        let poller = Self::new(pool, cancel_token)?;
        Some(tokio::spawn(async move {
            poller.run().await;
        }))
    }

    /// Main polling loop.
    async fn run(&self) {
        info!(
            "Starting deployment status poller with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            tokio::select! {
                _ = self.cancel_token.cancelled() => {
                    info!("Deployment poller received shutdown signal");
                    break;
                }
                _ = interval.tick() => {
                    if let Err(e) = self.poll_building_deployments().await {
                        error!("Error polling deployment status: {}", e);
                    }
                }
            }
        }

        info!("Deployment poller stopped");
    }

    /// Polls all deployments in 'building' status.
    async fn poll_building_deployments(&self) -> Result<(), sqlx::Error> {
        let building_deployments =
            Deployment::find_by_status(&self.pool, DeploymentStatus::Building).await?;

        if building_deployments.is_empty() {
            debug!("No building deployments to poll");
            return Ok(());
        }

        info!("Polling {} building deployments", building_deployments.len());

        for deployment in building_deployments {
            if let Err(e) = self.check_deployment_status(&deployment).await {
                warn!(
                    "Error checking deployment {} status: {}",
                    deployment.id, e
                );
            }
        }

        Ok(())
    }

    /// Checks and updates the status of a single deployment.
    async fn check_deployment_status(&self, deployment: &Deployment) -> Result<(), DeploymentPollerError> {
        let coolify_uuid = deployment
            .coolify_app_uuid
            .as_ref()
            .ok_or(DeploymentPollerError::MissingCoolifyUuid)?;

        debug!(
            "Checking status for deployment {} (coolify: {})",
            deployment.id, coolify_uuid
        );

        let status = self
            .coolify_client
            .get_deployment_status(coolify_uuid)
            .await?;

        let new_status = map_coolify_status(&status.status);

        // Only update if status changed to a terminal state
        if let Some(new_status) = new_status {
            info!(
                "Deployment {} status changed to {:?}, domain: {:?}",
                deployment.id, new_status, status.fqdn
            );

            Deployment::update_status_and_domain(
                &self.pool,
                deployment.id,
                new_status,
                status.fqdn.as_deref(),
            )
            .await?;
        } else {
            debug!(
                "Deployment {} still building (coolify status: {:?})",
                deployment.id, status.status
            );
        }

        Ok(())
    }
}

/// Maps Coolify status string to our DeploymentStatus.
///
/// Returns Some(status) for terminal states, None if still building.
fn map_coolify_status(coolify_status: &Option<String>) -> Option<DeploymentStatus> {
    match coolify_status.as_deref() {
        Some("running") | Some("Running") => Some(DeploymentStatus::Running),
        Some("exited") | Some("Exited") | Some("failed") | Some("Failed") | Some("error") | Some("Error") => {
            Some(DeploymentStatus::Failed)
        }
        // Still building or unknown status
        _ => None,
    }
}

#[derive(Debug, thiserror::Error)]
enum DeploymentPollerError {
    #[error("deployment missing coolify_app_uuid")]
    MissingCoolifyUuid,
    #[error("coolify api error: {0}")]
    Coolify(#[from] CoolifyError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio_util::sync::CancellationToken;

    // ==================== map_coolify_status Tests ====================

    #[test]
    fn test_map_coolify_status_running() {
        assert_eq!(
            map_coolify_status(&Some("running".to_string())),
            Some(DeploymentStatus::Running)
        );
        assert_eq!(
            map_coolify_status(&Some("Running".to_string())),
            Some(DeploymentStatus::Running)
        );
    }

    #[test]
    fn test_map_coolify_status_failed_variants() {
        // All these should map to Failed
        let failed_statuses = ["failed", "Failed", "exited", "Exited", "error", "Error"];

        for status in failed_statuses {
            assert_eq!(
                map_coolify_status(&Some(status.to_string())),
                Some(DeploymentStatus::Failed),
                "Status '{}' should map to Failed",
                status
            );
        }
    }

    #[test]
    fn test_map_coolify_status_building_variants() {
        // These should return None (still building)
        let building_statuses = ["building", "Building", "starting", "Starting", "pending", ""];

        for status in building_statuses {
            assert_eq!(
                map_coolify_status(&Some(status.to_string())),
                None,
                "Status '{}' should return None (still building)",
                status
            );
        }
    }

    #[test]
    fn test_map_coolify_status_none() {
        assert_eq!(map_coolify_status(&None), None);
    }

    #[test]
    fn test_map_coolify_status_unknown() {
        // Unknown statuses should return None
        assert_eq!(
            map_coolify_status(&Some("unknown_status".to_string())),
            None
        );
        assert_eq!(
            map_coolify_status(&Some("something_else".to_string())),
            None
        );
    }

    // ==================== DeploymentPollerError Tests ====================

    #[test]
    fn test_deployment_poller_error_display() {
        let err = DeploymentPollerError::MissingCoolifyUuid;
        assert_eq!(err.to_string(), "deployment missing coolify_app_uuid");
    }

    #[test]
    fn test_deployment_poller_error_from_coolify() {
        let coolify_err = CoolifyError::Timeout;
        let poller_err: DeploymentPollerError = coolify_err.into();
        assert!(matches!(poller_err, DeploymentPollerError::Coolify(_)));
    }

    // ==================== CancellationToken Tests ====================

    #[tokio::test]
    async fn test_cancellation_token_basic() {
        let token = CancellationToken::new();
        let token_clone = token.clone();

        // Token should not be cancelled initially
        assert!(!token.is_cancelled());

        // Spawn a task that waits for cancellation
        let handle = tokio::spawn(async move {
            token_clone.cancelled().await;
            true
        });

        // Cancel after a small delay
        tokio::time::sleep(Duration::from_millis(10)).await;
        token.cancel();

        // Task should complete
        let result = tokio::time::timeout(Duration::from_secs(1), handle).await;
        assert!(result.is_ok());
        assert!(result.unwrap().unwrap());
    }

    #[tokio::test]
    async fn test_cancellation_in_select() {
        let token = CancellationToken::new();
        let token_clone = token.clone();

        // This simulates how the poller uses select!
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(100));
            let mut ticks = 0;

            loop {
                tokio::select! {
                    _ = token_clone.cancelled() => {
                        return ticks;
                    }
                    _ = interval.tick() => {
                        ticks += 1;
                        if ticks >= 10 {
                            // Safety bail in case cancel doesn't work
                            return ticks;
                        }
                    }
                }
            }
        });

        // Let it tick a few times
        tokio::time::sleep(Duration::from_millis(250)).await;
        token.cancel();

        let result = tokio::time::timeout(Duration::from_secs(1), handle).await;
        assert!(result.is_ok());
        let ticks = result.unwrap().unwrap();
        // Should have ticked 2-3 times before cancellation
        assert!(ticks >= 2 && ticks < 10, "Got {} ticks", ticks);
    }

    // ==================== DeploymentPoller::new Tests ====================

    #[test]
    fn test_poller_new_without_env_vars() {
        // Ensure env vars are not set
        // SAFETY: We're in a test, modifying env vars is acceptable
        unsafe {
            std::env::remove_var("COOLIFY_API_TOKEN");
            std::env::remove_var("COOLIFY_PROJECT_UUID");
            std::env::remove_var("COOLIFY_SERVER_UUID");
        }

        // We can't easily create a SqlitePool in tests without a real DB,
        // but we can verify that from_env fails before we need the pool
        let result = CoolifyClient::from_env();
        assert!(result.is_err());
    }

    // ==================== POLL_INTERVAL Tests ====================

    #[test]
    fn test_poll_interval_value() {
        assert_eq!(POLL_INTERVAL, Duration::from_secs(30));
    }

    // ==================== Status Transition Logic Tests ====================

    #[test]
    fn test_status_transitions_comprehensive() {
        // Test the complete status transition logic
        let test_cases = vec![
            // (coolify_status, expected_mapped_status)
            (Some("running".to_string()), Some(DeploymentStatus::Running)),
            (Some("Running".to_string()), Some(DeploymentStatus::Running)),
            (Some("failed".to_string()), Some(DeploymentStatus::Failed)),
            (Some("Failed".to_string()), Some(DeploymentStatus::Failed)),
            (Some("exited".to_string()), Some(DeploymentStatus::Failed)),
            (Some("Exited".to_string()), Some(DeploymentStatus::Failed)),
            (Some("error".to_string()), Some(DeploymentStatus::Failed)),
            (Some("Error".to_string()), Some(DeploymentStatus::Failed)),
            (Some("building".to_string()), None),
            (Some("Building".to_string()), None),
            (Some("starting".to_string()), None),
            (Some("restarting".to_string()), None),
            (Some("pending".to_string()), None),
            (Some("unknown".to_string()), None),
            (Some("".to_string()), None),
            (None, None),
        ];

        for (coolify_status, expected) in test_cases {
            let result = map_coolify_status(&coolify_status);
            assert_eq!(
                result, expected,
                "map_coolify_status({:?}) = {:?}, expected {:?}",
                coolify_status, result, expected
            );
        }
    }

    // ==================== Error Variant Tests ====================

    #[test]
    fn test_error_is_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        assert_send::<DeploymentPollerError>();
        assert_sync::<DeploymentPollerError>();
    }

    #[test]
    fn test_error_debug_impl() {
        let err = DeploymentPollerError::MissingCoolifyUuid;
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("MissingCoolifyUuid"));
    }
}
