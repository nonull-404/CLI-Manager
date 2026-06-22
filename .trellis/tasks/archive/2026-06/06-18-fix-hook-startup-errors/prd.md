# fix hook startup errors

## Goal

修复 Claude Code 与 Codex 启动时出现的 `SessionStart:startup hook error`，并避免 CLI-Manager 后续重新安装 hook 时再次写入不兼容命令。

## Requirements

- 清理当前全局 Claude Code 配置中指向已不存在 `notify-cli-manager-*.ps1` 的旧 hook 命令。
- 修复当前全局 Codex hook 命令在 Windows PowerShell 下无法执行含空格 exe 路径的问题。
- 修正 CLI-Manager 后端 hook 安装逻辑：Windows 原生路径生成 PowerShell 可执行命令；WSL/POSIX 路径继续保持 shell 可执行形式。
- 保持 `__hook` 失败静默退出的行为，不让通知桥异常打断 Claude/Codex。

## Acceptance Criteria

- [ ] 直接执行 Claude `SessionStart` hook 命令不再因为缺失 `.ps1` 文件报错。
- [ ] 直接执行 Codex `SessionStart` hook 命令不再出现 PowerShell `Unexpected token '__hook'`。
- [ ] `hook_settings.rs` 相关测试通过。
- [ ] 不改动无关 hook / MCP / 模型配置。

## Definition of Done

- 相关全局配置已更新或清理。
- 后端命令生成逻辑已修复并有测试覆盖。
- 最小相关验证命令已执行。

## Technical Approach

- 用 PowerShell `-Command "& '<exe>' ..."` 包装 Windows 原生 exe 路径，解决路径含空格时裸引号命令在 PowerShell 中被当作字符串表达式的问题。
- 保留 WSL `/mnt/...` 与非 Windows 的 `"<exe>" args` 形式，避免破坏 Linux shell 执行。
- 当前全局 Claude/Codex 配置直接替换为新命令格式。

## Decision (ADR-lite)

**Context**: 旧版全局 Claude hook 指向已删除的 `.ps1` 文件；Codex 全局 hook 指向 `"D:\Program Files\...\cli-manager.exe" __hook ...`，该形式在 PowerShell 下解析失败。

**Decision**: 采用 Windows PowerShell wrapper 作为原生 Windows hook 命令格式，WSL/POSIX 保留原 shell 格式。

**Consequences**: Windows 下命令更长，但可稳定处理空格路径；Codex 修改 hook 命令后可能需要在 `/hooks` 中重新信任一次。

## Out of Scope

- 不重构 hook 设置页 UI。
- 不新增 hook 事件类型。
- 不调整 Trellis SessionStart 上下文注入逻辑。
- 不修改模型、MCP、权限等无关配置。

## Technical Notes

- `C:\Users\Administrator\.claude\settings.json` 中旧 `.ps1` hook 文件不存在，导致 Claude Code `SessionStart:startup` 非阻塞错误。
- `.claude/hooks/session-start.py` 和 `.codex/hooks/session-start.py` 单独执行均可输出合法 JSON，不是本次错误源。
- `C:\Users\Administrator\.codex\hooks.json` 的裸引号 exe 命令在 PowerShell 中复现 `Unexpected token '__hook'`。
- 受影响后端文件：`src-tauri/src/commands/hook_settings.rs`。
- GitNexus impact: `build_command` 上游风险 CRITICAL，直接影响 install/uninstall/status 相关流程，需保持改动最小并测试。
