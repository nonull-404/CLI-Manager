# 全局移除 window.confirm 系统对话框

## Goal

移除前端源码中全部 `window.confirm`，统一改为跟随应用主题的内部确认弹窗，避免 Windows WebView 系统对话框破坏软件交互一致性。

## Requirements

- 替换 `src/` 中全部 `window.confirm` 调用。
- 覆盖状态栏未保存切换、状态栏配置删除、Powerline 字体安装、终端背景移除、未保存文件切换等现有流程。
- 复用现有 `ConfirmDialog`，通过轻量 Promise Hook 保留现有顺序式异步代码。
- 确认继续执行原操作；取消、Esc 或关闭弹窗不得执行操作。
- 所有文案继续通过现有中英文 i18n 获取。
- 不修改后端接口、数据格式或业务校验。
- Changelog Target：`[TEMP]`。

## Acceptance Criteria

- [x] `rg "window\\.confirm" src` 无匹配结果。
- [ ] 所有替换流程的确认和取消语义保持不变。
- [ ] 应用内确认弹窗支持确认、取消和 Esc 关闭。
- [x] TypeScript 类型检查通过。
- [x] GitNexus 逐符号影响分析均为 LOW；工作区整体 CRITICAL 来自并行的非本任务改动。

## Technical Approach

- 新增 `useAppConfirm` Hook，内部渲染现有 `ConfirmDialog` 并返回 `Promise<boolean>`。
- 调用方通过 `await confirm(...)` 替代同步 `window.confirm(...)`。
- 将前端规范扩展为禁止 `window.prompt` 和 `window.confirm`。

## Out of Scope

- 不替换系统文件选择框、系统通知或 Tauri 原生文件对话框。
- 不调整确认文案或业务流程。

## Notes

- 用户已确认全局替换范围。
