//! Dev Server Auto-Detection Service
//!
//! Provides zero-config dev server startup by auto-detecting:
//! - Package manager (npm, yarn, pnpm, bun)
//! - Dev command (npm run dev, etc.)
//! - Available port (3001-3099)

use std::path::Path;
use std::net::TcpListener;

/// Port range for dev servers
const DEV_PORT_START: u16 = 3001;
const DEV_PORT_END: u16 = 3099;

/// Supported package managers
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PackageManager {
    Npm,
    Yarn,
    Pnpm,
    Bun,
}

impl PackageManager {
    /// Get the dev command for this package manager
    pub fn dev_command(&self) -> &'static str {
        match self {
            PackageManager::Npm => "npm run dev",
            PackageManager::Yarn => "yarn dev",
            PackageManager::Pnpm => "pnpm run dev",
            PackageManager::Bun => "bun run dev",
        }
    }

    /// Get the install command for this package manager
    pub fn install_command(&self) -> &'static str {
        match self {
            PackageManager::Npm => "npm install",
            PackageManager::Yarn => "yarn install",
            PackageManager::Pnpm => "pnpm install",
            PackageManager::Bun => "bun install",
        }
    }
}

/// Detect package manager from lockfiles in a directory
pub fn detect_package_manager(repo_path: &Path) -> Option<PackageManager> {
    // Check lockfiles in priority order (most specific first)
    if repo_path.join("bun.lockb").exists() {
        return Some(PackageManager::Bun);
    }
    if repo_path.join("pnpm-lock.yaml").exists() {
        return Some(PackageManager::Pnpm);
    }
    if repo_path.join("yarn.lock").exists() {
        return Some(PackageManager::Yarn);
    }
    if repo_path.join("package-lock.json").exists() {
        return Some(PackageManager::Npm);
    }
    // Fallback: if package.json exists, default to npm
    if repo_path.join("package.json").exists() {
        return Some(PackageManager::Npm);
    }
    None
}

/// Check if node_modules exists
pub fn has_node_modules(repo_path: &Path) -> bool {
    repo_path.join("node_modules").is_dir()
}

/// Get the dev command for a repository (auto-detect or use configured)
pub fn get_dev_command(repo_path: &Path, configured_script: Option<&str>) -> Option<String> {
    // Use configured script if provided
    if let Some(script) = configured_script {
        if !script.is_empty() {
            return Some(script.to_string());
        }
    }
    
    // Auto-detect package manager and return dev command
    detect_package_manager(repo_path).map(|pm| pm.dev_command().to_string())
}

/// Find an available port in the dev server range
pub fn find_available_port() -> Option<u16> {
    for port in DEV_PORT_START..=DEV_PORT_END {
        if is_port_available(port) {
            return Some(port);
        }
    }
    None
}

/// Check if a port is available
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Generate the dev server URL for a given port
pub fn dev_server_url(port: u16, base_domain: &str) -> String {
    format!("https://dev-{}.{}", port, base_domain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_detect_npm() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("package-lock.json"), "{}").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some(PackageManager::Npm));
    }

    #[test]
    fn test_detect_yarn() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("yarn.lock"), "").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some(PackageManager::Yarn));
    }

    #[test]
    fn test_detect_pnpm() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some(PackageManager::Pnpm));
    }

    #[test]
    fn test_detect_bun() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("bun.lockb"), "").unwrap();
        assert_eq!(detect_package_manager(dir.path()), Some(PackageManager::Bun));
    }

    #[test]
    fn test_find_available_port() {
        // Should find at least one available port
        let port = find_available_port();
        assert!(port.is_some());
        assert!(port.unwrap() >= DEV_PORT_START && port.unwrap() <= DEV_PORT_END);
    }
}
