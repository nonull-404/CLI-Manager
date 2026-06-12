# 云同步自定义远程目录

> Issue: https://github.com/dark-hxx/CLI-Manager/issues/31
> "在云同步中能否添加一下备份路径？也就是自定义同步目录，支持手动配置"

## 背景

当前云同步（WebDAV）的远程存储路径在后端 **硬编码**：

- `src-tauri/src/sync/mod.rs`
  - `SYNC_DEVICES_DIR_PATH = "cli-manager/devices"`
  - `LEGACY_SYNC_FILE_PATH = "cli-manager/sync.json"`

最终设备快照写入 `{webdavUrl}/cli-manager/devices/{deviceName}.json`。用户无法控制远端目录，多个工具共用同一 WebDAV 时只能挤在 `cli-manager/` 下。

本地同步（`local` 模式）已经支持自定义目录（`localSyncDir`），本需求只针对 **云同步**。

## 目标

在 WebDAV 配置中新增「远程目录」字段，允许用户手动配置云端根目录，保持 `devices/{device}.json` 子结构不变。

## 需求

1. 新增可配置的远程根目录（默认 `cli-manager`，保持向后兼容）。
2. UI：WebDAV 配置卡片中新增「远程目录」文本输入 + 保存。
3. 路径安全：sanitize 远程目录（去除前后 `/`、`\` 归一化为 `/`、剔除 `..`/`.` 段、空值回退默认）。
4. 后端 `upload` / `download` / `list_device_snapshots` 接受可选 `sync_dir`，沿用 sanitize 后的根目录拼接路径。
5. 前端 `syncStore` 持久化 `webdavSyncDir`，并在所有云同步 invoke 调用中透传。

## 非目标

- 不改本地同步（已支持自定义目录）。
- 不迁移已有远端数据（改目录后等于换了一个新的远端命名空间，由用户自行重新上传）。

## 验收

- 远程目录为空时，行为与现状完全一致（`cli-manager/devices/...`）。
- 设置自定义目录（如 `backups/cli`）后，上传/下载/快照列表都走新目录。
- sanitize 拒绝 `..` 逃逸、反斜杠、前导斜杠，并有单元测试覆盖。
- `npx tsc --noEmit` 与 `cargo check` 通过。

## 改动范围

- `src-tauri/src/sync/mod.rs` — 路径 helper 参数化 + sanitize + 单元测试
- `src-tauri/src/commands/sync.rs` — 三个命令新增 `sync_dir` 参数
- `src/stores/syncStore.ts` — 新增 `webdavSyncDir` 状态/动作/透传
- `src/components/settings/pages/SyncSettingsPage.tsx` — 远程目录输入框
