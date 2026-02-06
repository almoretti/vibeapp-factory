use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(
    Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default,
)]
#[sqlx(type_name = "deployment_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum DeploymentStatus {
    #[default]
    Pending,
    Building,
    Running,
    Failed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Deployment {
    pub id: Uuid,
    pub project_id: Uuid,
    pub branch: String,
    pub coolify_app_uuid: Option<String>,
    pub domain: Option<String>,
    pub status: DeploymentStatus,
    pub build_logs: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateDeployment {
    pub project_id: Uuid,
    pub branch: String,
    pub coolify_app_uuid: Option<String>,
    pub domain: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateDeployment {
    pub coolify_app_uuid: Option<String>,
    pub domain: Option<String>,
    pub status: Option<DeploymentStatus>,
    pub build_logs: Option<String>,
}

impl Deployment {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM deployments
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM deployments
               WHERE project_id = $1
               ORDER BY created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_branch(
        pool: &SqlitePool,
        project_id: Uuid,
        branch: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM deployments
               WHERE project_id = $1 AND branch = $2"#,
            project_id,
            branch
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateDeployment) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let status = DeploymentStatus::Pending;
        sqlx::query_as!(
            Deployment,
            r#"INSERT INTO deployments (id, project_id, branch, coolify_app_uuid, domain, status)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.branch,
            data.coolify_app_uuid,
            data.domain,
            status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: DeploymentStatus,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"UPDATE deployments
               SET status = $2, updated_at = datetime('now')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_build_logs(
        pool: &SqlitePool,
        id: Uuid,
        build_logs: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"UPDATE deployments
               SET build_logs = $2, updated_at = datetime('now')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            build_logs
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_coolify_info(
        pool: &SqlitePool,
        id: Uuid,
        coolify_app_uuid: &str,
        domain: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"UPDATE deployments
               SET coolify_app_uuid = $2, domain = $3, updated_at = datetime('now')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            coolify_app_uuid,
            domain
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM deployments WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn find_by_status(
        pool: &SqlitePool,
        status: DeploymentStatus,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM deployments
               WHERE status = $1
               ORDER BY created_at DESC"#,
            status
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_status_and_domain(
        pool: &SqlitePool,
        id: Uuid,
        status: DeploymentStatus,
        domain: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Deployment,
            r#"UPDATE deployments
               SET status = $2, domain = $3, updated_at = datetime('now')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", branch, coolify_app_uuid, domain, status as "status!: DeploymentStatus", build_logs, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status,
            domain
        )
        .fetch_one(pool)
        .await
    }
}
