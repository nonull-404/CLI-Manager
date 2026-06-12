# 实现摘要：云同步自定义远程目录

## 概述

完成 issue #31 需求：WebDAV 云同步支持自定义远程目录配置。

## 改动清单

### 后端 Rust

**`src-tauri/src/sync/mod.rs`**
- 常量：`SYNC_DEVICES_DIR_PATH` 改为 `DEFAULT_REMOTE_DIR = "cli-manager"`，移除 `LEGACY_SYNC_FILE_PATH` 常量。
- 函数签名参数化：
  - `upload(config, data, remote_dir: Option<String>)`
  - `download(config, device_name, allow_legacy_fallback, remote_dir: Option<String>)`
  - `list_device_snapshots(config, device_names, remote_dir: Option<String>)`
- 新增 `sanitize_remote_dir(remote_dir: Option<&str>) -> String`：
  - 空值回退默认 `cli-manager`
  - 去除前后 `/`、统一分隔符、剔除 `..` / `.` 段
  - 按安全清单要求的字符串层校验
- 新增 `legacy_sync_file_path(base_dir: &str) -> String`：构造 `{base_dir}/sync.json`
- 更新 `device_sync_file_path(base_dir: &str, device_name: &str)`：参数化根目录，构造 `{base_dir}/devices/{device}.json`
- 新增单元测试模块 `#[cfg(test)] mod tests`，覆盖：
  - 空值/空白回退默认
  - 保留合法路径
  - 去前后斜杠
  - 反斜杠归一化
  - `..` / `.` 段剔除
  - `device_sync_file_path` / `legacy_sync_file_path` 使用 base_dir

**`src-tauri/src/commands/sync.rs`**
- `sync_upload` 新增 `remote_dir: Option<String>` 参数，透传至 `upload`。
- `sync_download` 新增 `remote_dir: Option<String>` 参数，透传至 `download`。
- `sync_list_device_snapshots` 新增 `remote_dir: Option<String>` 参数，透传至 `list_device_snapshots`。

### 前端 TypeScript

**`src/stores/syncStore.ts`**
- 接口 `SyncStore` 新增字段：
  - `remoteDir: string`
  - `setRemoteDir: (dir: string) => Promise<void>`
- 初始状态：`remoteDir: ""`
- `load()` 从 `sync-config.json` 读取 `remoteDir`，并设置到 state。
- `setRemoteDir(dir)` 持久化到 store 并更新 state。
- `downloadRemoteSnapshot` helper 新增 `remoteDir` 参数，透传到 invoke。
- 所有 invoke 调用新增 `remoteDir` 透传：
  - `upload()` → `sync_upload`
  - `download()` → via `downloadRemoteSnapshot`
  - `getPreview()` → via `downloadRemoteSnapshot`
  - `listDeviceSnapshots()` → `sync_list_device_snapshots`

**`src/components/settings/pages/SyncSettingsPage.tsx`**
- 从 store 解构 `remoteDir` 与 `setRemoteDir`。
- 新增局部状态 `remoteDirInput` 与 setter。
- 同步效果 hook 从 store 初始化 `remoteDirInput`（依赖 `remoteDir`）。
- 新增 `handleSaveRemoteDir` 处理器，调用 `setRemoteDir` 并 toast 成功消息。
- WebDAV 配置卡片：在「服务器地址」与「用户名/密码」之间插入「远程目录」输入框 + 保存按钮 + 说明文字（占位符 `cli-manager（默认）`，提示留空即默认）。

## 验证

- `cargo check` ✅ 通过
- `cargo test --lib sync::tests` ✅ 7 个测试通过
- `npx tsc --noEmit` ✅ 无类型错误

## 向后兼容

- `remoteDir` 空值时自动回退 `cli-manager`，行为与现状一致。
- legacy fallback 路径仍保留（`{base_dir}/sync.json`），仅在 base_dir 为默认值时触发。
- 用户改动远程目录后，等于切换了云端命名空间，由用户重新上传/下载（UI 说明文字已提示）。

## 已知局限

- 不自动迁移已有远端数据（设计决策，符合 PRD 非目标）。
- 远程目录仅影响云同步（WebDAV），本地同步（zip）已有独立 `localSyncDir`。

## 测试覆盖

单元测试覆盖 `sanitize_remote_dir` 核心逻辑，符合 Tauri 安全清单要求（字符串层校验）。

集成测试需手动验证：
1. 远程目录留空，上传/下载仍落在 `cli-manager/devices/`（默认行为）。
2. 设置自定义目录（如 `backups/cli-mgr`），上传后云端出现 `backups/cli-mgr/devices/{device}.json`。
3. 切换回空值或另一目录，云端路径对应切换。
