# Investigate slow terminal creation

## Goal

排查当前版本中新建内置终端明显变慢的问题，优先对比/读取 V1.0.5 相对 V1.0.4 的修改，定位是否由近期改动引入，并形成最小修复方案。

## What I already know

* 用户已确认修复方向：采用 **默认关闭通用 Shell 运行监控**。
* 新增用户要求：Claude / Codex 终端的 Hook 运行状态环境注入也要先判断对应 Hook 是否已安装；未安装时不注入 `CLI_MANAGER_NOTIFY_*`，按普通 shell 处理。
* 推荐实现方向：跨层增加显式 opt-in 参数（前端判断 cli tool + hook status 后传给 `pty_create`），避免 Rust 后端无条件对所有 PTY 注入 Hook bridge env。
* 当前仓库最新 tag 到 `V1.0.4`，`CHANGELOG.md` 已有 `V1.0.5 - 2026-06-12` 未打 tag 章节。
* `git diff V1.0.4..HEAD` 只显示云同步自定义远程目录相关文件：`src-tauri/src/commands/sync.rs`、`src-tauri/src/sync/mod.rs`、`src/components/settings/pages/SyncSettingsPage.tsx`、`src/stores/syncStore.ts`，没有直接改动终端创建链路。
* 终端创建链路初步定位：前端 `src/stores/terminalStore.ts` 的 `createSession` 调用 Tauri `pty_create`，后端 `src-tauri/src/commands/terminal.rs` 注入 env 后调用 `PtyManager::create`，核心实现位于 `src-tauri/src/pty/manager.rs`。
* 当前 `createSession` 会根据设置为 PowerShell/Pwsh 终端注入 `CLI_MANAGER_SHELL_RUNTIME_MONITORING=1`，后端在该 env 启用时使用 `powershell.exe -NoLogo -NoExit -Command <prompt hook script>` 启动，而不是普通 `powershell.exe -NoLogo`。

## Assumptions (temporary)

* V1.0.5 的云同步远程目录改动本身不应直接拖慢新建终端；慢点更可能来自 V1.0.4 或近期未直接归类为 V1.0.5 的终端/设置初始化改动。
* 如果慢只发生在默认 PowerShell/Pwsh，而 CMD/Git Bash 不明显，重点怀疑 shell runtime monitoring 的启动脚本或 PowerShell profile/初始化交互。
* 如果所有 shell 都慢，重点转向前端持久化 `saveSessions`/`saveActiveSessionId`、xterm 初始化、全局设置加载或后台同步/历史任务竞争。

## Open Questions

* 慢主要发生在哪种创建入口/配置组合：默认新建空终端，还是从项目/命令面板新建带 cwd/env/startupCmd 的终端？

## Requirements (evolving)

* 对比 V1.0.5 相对 V1.0.4 的变更并确认是否直接影响终端创建。
* 梳理终端创建链路中的同步/阻塞步骤。
* 定位“Tab 已出现但 PowerShell / Claude prompt 迟迟不出现”的 shell ready 慢点。
* 优先提供低风险修复：避免默认 PowerShell/pwsh 终端被监控 wrapper 或用户 profile 拖慢，同时保留可选的标签运行状态能力。

## Acceptance Criteria (evolving)

* [ ] 明确说明 V1.0.5 改动是否直接影响终端创建。
* [ ] 找到至少一个可验证的慢点假设，并说明验证方式。
* [ ] 若需要修改代码，修复后保持终端创建功能、shell 选择、tab 状态监控和会话持久化不回退。

## Definition of Done (team quality bar)

* Tests added/updated where practical, or explain why manual verification is more appropriate.
* Typecheck / Rust check scope明确；若未运行，说明由用户验证。
* Docs/notes updated if behavior or diagnostic approach changes.
* Rollback considered if risky.

## Out of Scope (explicit)

* 不重构整个 PTY 架构。
* 不改动云同步功能，除非证据表明它直接阻塞终端创建。
* 不主动提交 git commit。

## Technical Notes

* `CHANGELOG.md` lines 3-14: V1.0.5 记录为云同步自定义远程目录。
* `src/stores/terminalStore.ts`: `createSession` 调用 `pty_create`，然后注册 `pty-status-*` 监听，更新 Zustand 状态，并等待 `sessionStore.saveSessions` / `saveActiveSessionId`。
* `src-tauri/src/commands/terminal.rs`: `pty_create` 生成 UUID，写入 `CLI_MANAGER_TAB_ID`，调用 Claude hook bridge 注入 env，再调用 `PtyManager::create`。
* `src-tauri/src/pty/manager.rs`: `PtyManager::create` 打开 PTY、解析 shell、spawn shell、clone reader、启动 reader thread、登记 session。
* 需继续读取设置默认值、`shellRuntimeMonitoringEnabled` 来源、sessionStore 持久化实现和 V1.0.4 终端相关 diff。
* 已刷新 GitNexus 索引：4954 symbols / 9194 relationships / 300 flows。
* GitNexus impact：`createSession` 上游风险 LOW（未识别直接调用者，实际 UI 调用通过 Zustand action/解构）；`PtyManager::create` 上游风险 LOW；`powershell_runtime_monitor_args` 上游风险 LOW；`buildPtyEnvVars` 上游风险 HIGH，直接影响 `createSession` / `splitTerminal` / `restoreSessions`，如修改该函数需先向用户明确提示风险。
* V1.0.4 终端相关 diff：`XTermTerminal.tsx` 新增 `terminalScrollbackRows` 设置热更新、OSC 8 链接 handler、IME render 事件锚点；默认回滚仍为 5000 行。若用户把回滚调到 50000，多终端/xterm 初始化可能变慢。
* 运行监控功能（已包含于 V1.0.3/V1.0.4 tag）：`shellRuntimeMonitoringEnabled` 默认 true；PowerShell/pwsh 新 PTY 会走 `-NoLogo -NoExit -Command <prompt wrapper>`，用于发 `ESC]777;cli-manager` 私有 OSC 状态标记。设置页已有「通用 Shell 运行监控」开关。该路径最可能影响“prompt 出现慢”而非 V1.0.5 云同步改动。
