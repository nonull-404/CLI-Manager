# 移除 window.prompt 并统一应用内输入弹窗

## Goal

移除应用内全部 `window.prompt` 调用，将状态栏配置名称、外部配置另存和配置库导入冲突输入统一改为跟随应用主题的内部弹窗，避免出现 WebView 系统式输入框。

## Requirements

- 项目中不再保留 `window.prompt` 调用。
- 状态栏配置的新建、复制、重命名和外部配置另存使用统一应用内输入弹窗。
- 状态栏配置库导入冲突处理继续支持覆盖、跳过和重命名，并使用应用内弹窗收集输入。
- 保留原有默认值、首尾空格清理、取消操作和异步执行顺序。
- 所有弹窗文案继续支持 `zh-CN` 与 `en-US`，优先复用现有翻译键。
- Changelog Target：`[TEMP]`。

## Acceptance Criteria

- [x] `rg "window\\.prompt" src` 无匹配结果。
- [ ] 新建、复制、重命名和另存外部配置均可通过应用内弹窗提交或取消。
- [ ] 导入冲突可以逐项选择覆盖、跳过或重命名；取消任一步骤时不提交导入。
- [ ] 输入名称会去除首尾空格，空名称不会提交。
- [x] TypeScript 类型检查通过。

## Technical Approach

- 新增一个轻量、可复用的应用内输入弹窗组件，通过 Promise 返回用户输入或取消结果，保持现有顺序式调用代码简单。
- 在 `StatuslineProfileBar.tsx` 和 `StatuslineSettingsPage.tsx` 中替换全部 `window.prompt`。
- 不修改后端接口、配置格式或保存语义。

## Decision (ADR-lite)

**Context**：当前状态栏多配置功能直接调用 `window.prompt`，样式由 WebView 决定，无法跟随应用主题。

**Decision**：使用项目现有 Dialog 与输入组件实现统一应用内输入弹窗，不增加依赖，不建立全局弹窗状态管理。

**Consequences**：交互风格统一；调用方需要处理异步输入结果，导入冲突流程需确保取消后立即终止。

## Out of Scope

- 不替换 `window.confirm`。
- 不调整状态栏配置后端、存储结构和导入导出协议。
- 不新增配置名称规则或重复名称校验逻辑。

## Notes

- 涉及文件：`src/components/settings/StatuslineProfileBar.tsx`、`src/components/settings/pages/StatuslineSettingsPage.tsx`、新增应用内输入弹窗组件、`CHANGELOG.md`。
- 用户已确认实施方案。
