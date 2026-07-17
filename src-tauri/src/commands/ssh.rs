use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;
use uuid::Uuid;

use crate::shell_resolver::{output_with_timeout, silent_command};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshClientStatus {
    available: bool,
    version: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionSpec {
    host: String,
    port: u16,
    username: String,
    config_alias: String,
    auth_mode: String,
    identity_file: String,
    #[serde(default)]
    credential_ref: String,
    jump_target: String,
    proxy_command: String,
    connect_timeout_sec: u64,
    server_alive_interval_sec: u64,
    server_alive_count_max: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDiagnosticStage {
    key: String,
    status: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionTestResult {
    success: bool,
    stages: Vec<SshDiagnosticStage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPathCheckResult {
    exists: bool,
    accessible: bool,
    git_repository: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDirectoryEntry {
    name: String,
    path: String,
}

fn single_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn validate_spec(spec: &SshConnectionSpec) -> Result<(), String> {
    if spec.config_alias.trim().is_empty() && spec.host.trim().is_empty() {
        return Err("ssh_host_address_required".to_string());
    }
    if spec.config_alias.trim().is_empty() && spec.port == 0 {
        return Err("ssh_host_port_invalid".to_string());
    }
    if spec.connect_timeout_sec == 0 || spec.connect_timeout_sec > 300 {
        return Err("ssh_connect_timeout_invalid".to_string());
    }
    if spec.server_alive_count_max > 100 {
        return Err("ssh_server_alive_count_invalid".to_string());
    }
    if !matches!(
        spec.auth_mode.as_str(),
        "ssh_config" | "agent" | "identity_file" | "password_prompt" | "interactive" | "credential_ref"
    ) {
        return Err("ssh_auth_mode_invalid".to_string());
    }
    if spec.auth_mode == "identity_file" && spec.identity_file.trim().is_empty() {
        return Err("ssh_identity_file_required".to_string());
    }
    if spec.auth_mode == "credential_ref" && spec.credential_ref.trim().is_empty() {
        return Err("ssh_credential_ref_required".to_string());
    }
    Ok(())
}

fn ssh_password_account(host_id: &str) -> Result<String, String> {
    let id = Uuid::parse_str(host_id.trim()).map_err(|_| "ssh_host_id_invalid".to_string())?;
    Ok(format!("ssh:{id}:password"))
}

#[tauri::command]
pub async fn ssh_save_password(host_id: String, password: String) -> Result<String, String> {
    if password.is_empty() {
        return Err("ssh_password_required".to_string());
    }
    let account = ssh_password_account(&host_id)?;
    let account_for_store = account.clone();
    tokio::task::spawn_blocking(move || crate::credential_store::set(&account_for_store, &password))
        .await
        .map_err(|err| format!("ssh credential task failed: {err}"))??;
    Ok(account)
}

#[tauri::command]
pub async fn ssh_password_status(host_id: String) -> Result<bool, String> {
    let account = ssh_password_account(&host_id)?;
    tokio::task::spawn_blocking(move || {
        crate::credential_store::get(&account).map(|value| value.is_some_and(|item| !item.is_empty()))
    })
    .await
    .map_err(|err| format!("ssh credential task failed: {err}"))?
}

#[tauri::command]
pub async fn ssh_delete_password(host_id: String) -> Result<(), String> {
    let account = ssh_password_account(&host_id)?;
    tokio::task::spawn_blocking(move || crate::credential_store::delete(&account))
        .await
        .map_err(|err| format!("ssh credential task failed: {err}"))?
}

fn target(spec: &SshConnectionSpec) -> String {
    if !spec.config_alias.trim().is_empty() {
        return spec.config_alias.trim().to_string();
    }
    if spec.username.trim().is_empty() {
        spec.host.trim().to_string()
    } else {
        format!("{}@{}", spec.username.trim(), spec.host.trim())
    }
}

fn validate_remote_path(path: &str) -> Result<&str, String> {
    let path = path.trim();
    if !path.starts_with('/') || path.contains('\0') || path.contains('\n') || path.contains('\r') {
        return Err("ssh_remote_path_invalid".to_string());
    }
    if path.split('/').any(|part| part == "..") {
        return Err("ssh_remote_path_parent_forbidden".to_string());
    }
    Ok(path)
}

fn posix_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn ensure_non_interactive(spec: &SshConnectionSpec) -> Result<(), String> {
    if matches!(spec.auth_mode.as_str(), "password_prompt" | "interactive") {
        return Err("ssh_interactive_auth_required".to_string());
    }
    Ok(())
}

fn ssh_remote_command(spec: &SshConnectionSpec, remote_command: &str) -> Result<Command, String> {
    let mut command = silent_command("ssh");
    command.arg("-T");
    command.args([
        "-o",
        if spec.auth_mode == "credential_ref" {
            "BatchMode=no"
        } else {
            "BatchMode=yes"
        },
    ]);
    command
        .args([
            "-o",
            &format!("ConnectTimeout={}", spec.connect_timeout_sec),
        ])
        .args([
            "-o",
            &format!("ServerAliveInterval={}", spec.server_alive_interval_sec),
        ])
        .args([
            "-o",
            &format!("ServerAliveCountMax={}", spec.server_alive_count_max),
        ]);
    if spec.config_alias.trim().is_empty() {
        command.args(["-p", &spec.port.to_string()]);
    }
    if spec.auth_mode == "identity_file" && !spec.identity_file.trim().is_empty() {
        command.args(["-i", spec.identity_file.trim()]);
    }
    match spec.auth_mode.as_str() {
        "agent" => {
            command.args(["-o", "PubkeyAuthentication=yes"]);
            command.args(["-o", "PreferredAuthentications=publickey"]);
        }
        "identity_file" => {
            command.args(["-o", "IdentitiesOnly=yes"]);
            command.args(["-o", "PreferredAuthentications=publickey"]);
        }
        "password_prompt" | "credential_ref" => {
            command.args(["-o", "PubkeyAuthentication=no"]);
            command.args(["-o", "PasswordAuthentication=yes"]);
            command.args(["-o", "KbdInteractiveAuthentication=no"]);
            command.args(["-o", "PreferredAuthentications=password"]);
        }
        "interactive" => {
            command.args(["-o", "PubkeyAuthentication=no"]);
            command.args(["-o", "PasswordAuthentication=no"]);
            command.args(["-o", "KbdInteractiveAuthentication=yes"]);
            command.args(["-o", "PreferredAuthentications=keyboard-interactive"]);
        }
        _ => {}
    }
    if spec.auth_mode == "credential_ref" {
        command.envs(crate::ssh_askpass::prepare(&spec.credential_ref)?);
    }
    if !spec.jump_target.trim().is_empty() {
        command.args(["-J", spec.jump_target.trim()]);
    }
    if !spec.proxy_command.trim().is_empty() {
        command.args(["-o", &format!("ProxyCommand={}", spec.proxy_command.trim())]);
    }
    command.arg(target(spec)).arg(remote_command);
    Ok(command)
}

fn ssh_probe_command(spec: &SshConnectionSpec) -> Result<Command, String> {
    ssh_remote_command(spec, "printf CLI_MANAGER_SSH_OK")
}

#[tauri::command]
pub async fn ssh_client_status() -> SshClientStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let mut command = silent_command("ssh");
        command.arg("-V");
        match output_with_timeout(command, Duration::from_secs(5)) {
            Ok(output) => {
                let stderr = single_line(&output.stderr);
                let stdout = single_line(&output.stdout);
                let version = if stderr.is_empty() { stdout } else { stderr };
                SshClientStatus {
                    available: output.status.success() || !version.is_empty(),
                    version: (!version.is_empty()).then_some(version),
                    error: None,
                }
            }
            Err(error) => SshClientStatus {
                available: false,
                version: None,
                error: Some(error.to_string()),
            },
        }
    })
    .await
    .unwrap_or_else(|error| SshClientStatus {
        available: false,
        version: None,
        error: Some(error.to_string()),
    })
}

#[tauri::command]
pub async fn ssh_test_connection(
    spec: SshConnectionSpec,
) -> Result<SshConnectionTestResult, String> {
    validate_spec(&spec)?;
    let client = ssh_client_status().await;
    let mut stages = vec![SshDiagnosticStage {
        key: "client".to_string(),
        status: if client.available { "passed" } else { "failed" }.to_string(),
        detail: client
            .version
            .or(client.error)
            .unwrap_or_else(|| "ssh_client_unavailable".to_string()),
    }];
    if !client.available {
        return Ok(SshConnectionTestResult {
            success: false,
            stages,
        });
    }

    if matches!(spec.auth_mode.as_str(), "password_prompt" | "interactive") {
        stages.push(SshDiagnosticStage {
            key: "authentication".to_string(),
            status: "interactive_required".to_string(),
            detail: "ssh_interactive_auth_required".to_string(),
        });
        return Ok(SshConnectionTestResult {
            success: false,
            stages,
        });
    }

    let timeout = Duration::from_secs(spec.connect_timeout_sec.saturating_add(5).min(305));
    let command = ssh_probe_command(&spec)?;
    let output = tauri::async_runtime::spawn_blocking(move || {
        output_with_timeout(command, timeout)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = single_line(&output.stderr);
    let success = output.status.success() && stdout.contains("CLI_MANAGER_SSH_OK");
    stages.push(SshDiagnosticStage {
        key: "connection".to_string(),
        status: if success { "passed" } else { "failed" }.to_string(),
        detail: if success {
            "ssh_connection_ready".to_string()
        } else if stderr.is_empty() {
            format!("ssh_exit_status_{}", output.status.code().unwrap_or(-1))
        } else {
            stderr
        },
    });
    Ok(SshConnectionTestResult { success, stages })
}

#[tauri::command]
pub async fn ssh_check_path(
    spec: SshConnectionSpec,
    path: String,
) -> Result<SshPathCheckResult, String> {
    validate_spec(&spec)?;
    ensure_non_interactive(&spec)?;
    let path = validate_remote_path(&path)?.to_string();
    let quoted = posix_quote(&path);
    let script = format!(
        "if [ ! -d {quoted} ]; then printf 'missing'; \
         elif [ ! -x {quoted} ]; then printf 'inaccessible'; \
         elif git -C {quoted} rev-parse --is-inside-work-tree >/dev/null 2>&1; then printf 'git'; \
         else printf 'ok'; fi"
    );
    let timeout = Duration::from_secs(spec.connect_timeout_sec.saturating_add(5).min(305));
    let command = ssh_remote_command(&spec, &script)?;
    let output = tauri::async_runtime::spawn_blocking(move || output_with_timeout(command, timeout))
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(single_line(&output.stderr));
    }
    Ok(match String::from_utf8_lossy(&output.stdout).trim() {
        "git" => SshPathCheckResult {
            exists: true,
            accessible: true,
            git_repository: true,
        },
        "ok" => SshPathCheckResult {
            exists: true,
            accessible: true,
            git_repository: false,
        },
        "inaccessible" => SshPathCheckResult {
            exists: true,
            accessible: false,
            git_repository: false,
        },
        _ => SshPathCheckResult {
            exists: false,
            accessible: false,
            git_repository: false,
        },
    })
}

#[tauri::command]
pub async fn ssh_list_directories(
    spec: SshConnectionSpec,
    path: String,
) -> Result<Vec<SshDirectoryEntry>, String> {
    validate_spec(&spec)?;
    ensure_non_interactive(&spec)?;
    let path = validate_remote_path(&path)?.to_string();
    let script = format!(
        "find -- {} -mindepth 1 -maxdepth 1 -type d -print0",
        posix_quote(&path)
    );
    let timeout = Duration::from_secs(spec.connect_timeout_sec.saturating_add(10).min(310));
    let command = ssh_remote_command(&spec, &script)?;
    let output = tauri::async_runtime::spawn_blocking(move || output_with_timeout(command, timeout))
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(single_line(&output.stderr));
    }
    let mut entries: Vec<SshDirectoryEntry> = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .filter_map(|value| String::from_utf8(value.to_vec()).ok())
        .map(|entry_path| {
            let normalized = entry_path.trim_end_matches('/').to_string();
            let name = normalized
                .rsplit('/')
                .next()
                .unwrap_or(&normalized)
                .to_string();
            SshDirectoryEntry {
                name,
                path: normalized,
            }
        })
        .collect();
    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{
        posix_quote, ssh_password_account, ssh_probe_command, target, validate_remote_path, validate_spec,
        SshConnectionSpec,
    };

    fn spec() -> SshConnectionSpec {
        SshConnectionSpec {
            host: "example.com".to_string(),
            port: 2222,
            username: "dev".to_string(),
            config_alias: String::new(),
            auth_mode: "identity_file".to_string(),
            identity_file: "/home/dev/.ssh/id_ed25519".to_string(),
            credential_ref: String::new(),
            jump_target: "bastion".to_string(),
            proxy_command: String::new(),
            connect_timeout_sec: 12,
            server_alive_interval_sec: 30,
            server_alive_count_max: 3,
        }
    }

    #[test]
    fn builds_safe_structured_probe_arguments() {
        let spec = spec();
        validate_spec(&spec).unwrap();
        assert_eq!(target(&spec), "dev@example.com");
        let command = ssh_probe_command(&spec).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(args.windows(2).any(|pair| pair == ["-p", "2222"]));
        assert!(args.windows(2).any(|pair| pair == ["-J", "bastion"]));
        assert!(args.iter().any(|arg| arg == "BatchMode=yes"));
        assert_eq!(
            args.last().map(String::as_str),
            Some("printf CLI_MANAGER_SSH_OK")
        );
    }

    #[test]
    fn config_alias_owns_address_and_port_resolution() {
        let mut spec = spec();
        spec.config_alias = "gpu-dev".to_string();
        spec.host.clear();
        spec.port = 0;
        spec.auth_mode = "ssh_config".to_string();
        validate_spec(&spec).unwrap();
        assert_eq!(target(&spec), "gpu-dev");
        let command = ssh_probe_command(&spec).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(!args.iter().any(|arg| arg == "-p"));
        assert!(!args.iter().any(|arg| arg == "-i"));
    }

    #[test]
    fn quotes_remote_paths_and_rejects_parent_traversal() {
        assert_eq!(posix_quote("/srv/team's app"), "'/srv/team'\\''s app'");
        assert_eq!(validate_remote_path("/srv/app").unwrap(), "/srv/app");
        assert!(validate_remote_path("srv/app").is_err());
        assert!(validate_remote_path("/srv/../etc").is_err());
    }

    #[test]
    fn password_probe_does_not_include_stale_identity_file() {
        let mut spec = spec();
        spec.auth_mode = "password_prompt".to_string();
        let command = ssh_probe_command(&spec).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(!args.iter().any(|arg| arg == "-i"));
        assert!(args.iter().any(|arg| arg == "PreferredAuthentications=password"));
    }

    #[test]
    fn interactive_probe_does_not_include_stale_identity_file() {
        let mut spec = spec();
        spec.auth_mode = "interactive".to_string();
        let command = ssh_probe_command(&spec).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(!args.iter().any(|arg| arg == "-i"));
        assert!(args
            .iter()
            .any(|arg| arg == "PreferredAuthentications=keyboard-interactive"));
    }

    #[test]
    fn credential_account_is_scoped_to_valid_host_uuid() {
        assert_eq!(
            ssh_password_account("550e8400-e29b-41d4-a716-446655440000").unwrap(),
            "ssh:550e8400-e29b-41d4-a716-446655440000:password"
        );
        assert!(ssh_password_account("../webdav").is_err());
    }
}
