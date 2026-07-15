# WebDAV Sync Contracts

## Scenario: WebDAV device snapshot sync

### 1. Scope / Trigger

- Trigger: code changes that touch WebDAV sync commands, `src-tauri/src/sync/mod.rs`, `src-tauri/src/webdav/mod.rs`, or frontend sync-store calls that invoke sync commands.
- Scope: preserve safe sync boundaries across Tauri commands, Rust WebDAV storage, and the frontend sync UI.
- This is a cross-layer contract: changes must keep TypeScript invoke payloads, Rust command signatures, remote paths, and error handling in sync.

### 2. Signatures

Backend commands:

```rust
#[tauri::command]
pub async fn sync_get_default_device_name() -> Result<DeviceNameResult, String>;

#[tauri::command]
pub async fn sync_list_device_snapshots(
    config: SyncConfigInput,
    device_names: Vec<String>,
    remote_dir: Option<String>,
) -> Result<Vec<DeviceSnapshotInfo>, String>;

#[tauri::command]
pub async fn sync_upload(
    config: SyncConfigInput,
    data: SyncData,
    remote_dir: Option<String>,
) -> Result<SyncUploadResult, String>;

#[tauri::command]
pub async fn sync_download(
    config: SyncConfigInput,
    local_data: Option<SyncData>,
    force: bool,
    device_name: Option<String>,
    remote_dir: Option<String>,
) -> Result<SyncDownloadResult, String>;

pub async fn sync_save_password(password: String) -> Result<(), String>;

pub async fn sync_load_password() -> Result<Option<String>, String>;

pub async fn sync_delete_password() -> Result<(), String>;
```

Rust sync layer:

```rust
pub async fn upload(
    config: WebDavConfig,
    data: SyncData,
    remote_dir: Option<String>,
) -> Result<(), String>;

pub async fn download(
    config: WebDavConfig,
    device_name: Option<String>,
    allow_legacy_fallback: bool,
    remote_dir: Option<String>,
) -> Result<SyncData, String>;

pub async fn list_device_snapshots(
    config: WebDavConfig,
    device_names: Vec<String>,
    remote_dir: Option<String>,
) -> Result<Vec<DeviceSnapshotInfo>, String>;

pub fn default_device_name() -> String;
```

Frontend store surface:

```ts
export type AutoSyncAction = "off" | "upload" | "download";
export type SyncDataDomain = "projects" | "groups" | "command_templates";

download(force?: boolean, options?: { deviceName?: string; domains?: SyncDataDomain[] }): Promise<void>;
getPreview(deviceName?: string): Promise<SyncPreview>;
runAutoSync(phase: "startup" | "close"): Promise<"skipped" | "success" | "conflict" | "error">;
```

### 3. Contracts

#### Credential storage

- The credential identity is fixed as `service=CLI-Manager`, `user=webdav` on every supported platform.
- Windows stores the password through `windows-native-keyring-store` in Windows Credential Manager.
- macOS stores the password through `apple-native-keyring-store` with the `keychain` feature in the user/login Keychain. Do not switch to the `protected` backend without adding and validating the required provisioning-profile entitlements.
- Linux stores the password through `zbus-secret-service-keyring-store` with `rt-tokio-crypto-rust` in freedesktop Secret Service. Every Linux entry uses the fixed `target=CLI-Manager` collection so native WSL does not depend on a missing default collection.
- `keyring-core` and each native provider must remain target-scoped so unsupported platforms do not compile an unused native backend.
- Save/load/delete run through `tokio::task::spawn_blocking`; native credential APIs must not block the async Tauri command executor.
- Loading a missing credential returns `Ok(None)`. Deleting a missing credential returns `Ok(())`.
- An empty password is equivalent to deleting the credential.
- Native store initialization or access failures propagate to the caller. Never fall back to Tauri store, SQLite, sync payloads, logs, or another plaintext location.
- WSL shells opened by the Windows desktop app still use Windows Credential Manager because password commands execute in the Windows Tauri host process.
- Native Linux and CLI-Manager processes running inside WSL/WSLg require a working D-Bus session plus a Secret Service provider such as GNOME Keyring or KWallet. Missing infrastructure is an error; Linux kernel keyutils and plaintext files are not fallbacks.

#### Remote storage

- Current device snapshot path: `cli-manager/devices/<safe-device-name>.json`.
- Legacy single snapshot path: `cli-manager/sync.json`.
- Upload must create/ensure `cli-manager/devices` and write only the current device snapshot.
- `sync_download` must read the requested device snapshot and must not silently read another device snapshot.
- Tauri command `sync_download` passes `allow_legacy_fallback = false`; a missing device snapshot must remain a 404-like error for the frontend preview/download logic.
- Legacy fallback is only allowed in backend code paths that explicitly opt in with `allow_legacy_fallback = true`.

#### Device name

- `SyncData.device_name` is required for new uploads and has `#[serde(default)]` for old payload compatibility.
- Default device name comes from `COMPUTERNAME`, then `HOSTNAME`, then `当前设备`.
- Safe device name rules must match frontend and Rust:
  - trim leading/trailing whitespace;
  - keep ASCII letters, ASCII digits, `-`, `_`, and CJK unified ideographs;
  - convert space and `.` to `-`;
  - drop all other characters;
  - limit to 64 characters;
  - reject empty result with `设备名称不能为空`.

#### Sync data payload

```rust
pub struct SyncData {
    pub version: u32,
    pub device_id: String,
    #[serde(default)]
    pub device_name: String,
    pub last_modified: String,
    pub data: SyncPayload,
}

pub struct SyncPayload {
    pub projects: Vec<serde_json::Value>,
    pub groups: Vec<serde_json::Value>,
    pub command_templates: Vec<serde_json::Value>,
    #[serde(default)]
    pub worktrees: Vec<serde_json::Value>,
    pub settings: serde_json::Value,
}
```

- Upload body: UTF-8 JSON bytes from `serde_json::to_vec(&data)`.
- Upload `Content-Type`: `application/json`.
- Download body: UTF-8 JSON bytes parsed into `SyncData`.
- `SyncPayload.worktrees` is durable active project state and must default to an empty list when old payloads omit it.
- Discarded worktrees and local records marked `status="missing"` must not be uploaded or restored from remote snapshots.
- WebDAV successful response body limit: `16 * 1024 * 1024` bytes.

#### Manual preview and partial restore

- Manual upload/download must call preview before mutating local or remote state.
- Upload preview may show `remote.missing = true`; upload is still allowed and creates the device snapshot.
- Download/restore preview with `remote.missing = true` must show `无法从云端同步` and must not call `download(...)`.
- Partial restore domain set is exactly: `projects`, `groups`, `command_templates`.
- Active worktree records are restored with the `projects` domain; if `projects` is not selected, local worktree records are preserved.
- Empty or omitted domain list means all domains.
- When restoring a subset, unselected domains must be rebuilt from local backup data, not deleted.
- Foreign keys must be normalized after mixed-domain restore:
  - project `group_id` becomes `null` if the selected final groups do not contain it;
  - worktree rows whose `project_id` is not in the final projects set are skipped;
  - template `project_id` becomes `null` if the selected final projects do not contain it.

#### Auto sync

- Auto sync runs only when `syncMode === "cloud"`, WebDAV URL is non-empty, and a password is stored.
- Startup auto sync must not block app initialization.
- Close auto sync may run before session cleanup/window destroy, but failure must not prevent the window from closing.
- Non-`force` download conflict rule: if `local.last_modified > remote.last_modified`, return conflict; do not require `device_id` to differ.
- Resolving a conflict with local data must upload and then clear conflict state.
- Resolving a conflict with remote data must apply remote data and upload the resolved current-device snapshot, so the same conflict does not reappear on restart.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Save/load/delete on Windows | Use Windows Credential Manager with `CLI-Manager` / `webdav` identity. |
| Save/load/delete on macOS | Use the user/login Keychain with `CLI-Manager` / `webdav` identity. |
| Save/load/delete on Linux or native WSL | Use Secret Service with `service=CLI-Manager`, `user=webdav`, `target=CLI-Manager`. |
| Linux D-Bus/Secret Service is unavailable | Propagate the provider error; do not persist plaintext fallback data. |
| Password is empty | Delete the native credential; missing entry is success. |
| Password credential is missing during load | `Ok(None)`. |
| Native credential store is unavailable or access is denied | Propagate the error; do not persist plaintext fallback data. |
| Password save on an unsupported target | Return the unsupported-platform error; do not persist the password. |
| Device name sanitizes to empty | `Err("设备名称不能为空")` |
| Requested device snapshot returns HTTP 404 in frontend preview | `SyncPreview.remote.missing = true` |
| Requested device snapshot returns HTTP 404 for download/restore | toast `无法从云端同步`; no local overwrite |
| Requested device snapshot returns non-404 error | propagate the error; do not convert to missing snapshot |
| `sync_download(force = false)` and local is newer than remote | `has_conflict = true`, `data = Some(remote_data)` |
| `sync_download(force = true)` and remote exists | return remote data without conflict check |
| Manual restore domain list is empty/omitted | restore all supported domains |
| Manual restore selects only one/two domains | preserve unselected domains from local backup |
| Manual restore selects `projects` | restore projects and worktree records together |
| Manual restore does not select `projects` | preserve local worktree records |
| Remote payload contains `missing` worktree records | skip those worktree records |
| Downloaded JSON parse fails | `Err("Failed to parse sync data: <err>")` |
| HTTP status is not success | `Err(WebDavError { message: "HTTP error: <status>", status_code: Some(status) })` |
| Response exceeds 16 MiB | `Err(WebDavError { message: "Response too large: <len> bytes", status_code: Some(status) })` |

### 5. Good/Base/Bad Cases

- Good: current device `Work-Laptop` uploads to `cli-manager/devices/Work-Laptop.json` and records `device_name: "Work-Laptop"` in the JSON.
- Good: Windows, macOS, and Linux use the same service/user identity while selecting only their own native provider at compile time.
- Good: restarting on macOS loads the WebDAV password from the login Keychain and restores `hasPassword` without writing a secret to app storage.
- Good: native WSL with a running Secret Service creates/reuses the dedicated `CLI-Manager` collection and restores the password after restart without a default collection.
- Good: manual upload when the device snapshot does not exist shows an empty remote summary and still allows upload.
- Good: manual download when the device snapshot does not exist shows `无法从云端同步` and leaves local data untouched.
- Base: download with `force = true` applies selected domains from the requested device snapshot.
- Base: auto download with stale local data applies remote data; auto download with newer local data reports conflict.
- Bad: do not fall back from `cli-manager/devices/<device>.json` to `cli-manager/sync.json` inside the public `sync_download` command, because that turns an empty current-device snapshot into unrelated remote data.
- Bad: do not implement partial restore by deleting all three tables and only reinserting selected remote domains; that erases unselected local domains.
- Bad: do not treat any error text containing `404` as a missing snapshot; only a clear `HTTP error: 404` should be classified as missing.
- Bad: do not silence a Keychain error and keep only the in-memory password; that reports a successful save which will fail after restart.
- Bad: do not use Apple protected-data storage without provisioning entitlements or add a plaintext fallback for unsigned/development builds.
- Bad: do not use the Linux default collection for WebDAV entries; native WSL commonly has no default collection.
- Bad: do not fall back to a config file or kernel keyutils when Secret Service is missing; those mechanisms have different persistence/security contracts.

### 6. Tests Required

Minimum checks after WebDAV sync contract changes:

- `npx tsc --noEmit` must pass after frontend sync-store or settings UI changes.
- `cargo check --manifest-path src-tauri/Cargo.toml` must pass after Rust/Tauri sync changes.
- Native Windows checks must keep `windows-native-keyring-store` selected; Cargo metadata/tree checks must select `apple-native-keyring-store` with `keychain` only on macOS and `zbus-secret-service-keyring-store` with `rt-tokio-crypto-rust` only on Linux.
- A macOS runtime check must save, restart/load, replace, and delete the fixed `CLI-Manager` / `webdav` login-Keychain entry. Denied/locked Keychain access must surface an error without creating a plaintext secret.
- A Linux runtime check must repeat the lifecycle against Secret Service using `target=CLI-Manager`, including native WSL without a default collection; missing D-Bus/Secret Service must surface an error without plaintext fallback.
- Manual or automated assertions:
  - device name sanitization produces identical safe names in frontend and Rust;
  - upload path uses `cli-manager/devices/<safe-device-name>.json`;
  - preview of a missing snapshot sets `remote.missing = true`;
  - upload from a missing remote snapshot is allowed;
  - download from a missing remote snapshot is blocked with `无法从云端同步`;
  - non-404 WebDAV errors are shown as failures, not converted to empty snapshots;
  - non-`force` download with `local.last_modified > remote.last_modified` returns conflict;
  - partial restore preserves unselected domains and clears invalid cross-domain references.

### 7. Wrong vs Correct

#### Wrong: public download silently falls back to legacy data

```rust
let remote_data = download(webdav_config, Some(device_name), true).await?;
```

This can restore `cli-manager/sync.json` when the requested device snapshot is missing.

#### Correct: public download preserves missing-device semantics

```rust
let remote_data = download(webdav_config, device_name, false).await?;
```

The frontend can then distinguish `HTTP error: 404` and block restore with `无法从云端同步`.

#### Wrong: partial restore deletes unselected data

```ts
await db.execute("DELETE FROM command_templates");
await db.execute("DELETE FROM projects");
await db.execute("DELETE FROM groups");
await insertProjects(remote.projects);
```

#### Correct: rebuild from final selected + backup datasets

```ts
const finalGroups = shouldApplyGroups ? remote.groups : backupGroups;
const finalProjects = shouldApplyProjects ? remote.projects : backupProjects;
const finalTemplates = shouldApplyTemplates ? remote.command_templates : backupTemplates;
```

#### Wrong: block first upload when cloud snapshot is missing

```ts
const preview = await getPreview(deviceName); // throws 404 and aborts upload
```

#### Correct: allow upload preview but block restore preview

```ts
if (mode === "download" && preview.remote.missing) {
  toast.error("无法从云端同步");
  return;
}
```

#### Wrong: reject every non-Windows password save

```rust
#[cfg(not(target_os = "windows"))]
return Err("WebDAV password secure storage is only supported on Windows".to_string());
```

This makes the frontend promise of system secure storage false on macOS and prevents password recovery after restart.

#### Correct: share the password lifecycle across native desktop providers

```rust
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
let entry = webdav_password_entry()?;
```

`webdav_password_entry` initializes Windows Credential Manager, the macOS login Keychain, or Linux Secret Service behind the same `keyring-core::Entry` contract. Linux entries add the fixed target modifier for WSL; unsupported platforms still receive no plaintext fallback.
