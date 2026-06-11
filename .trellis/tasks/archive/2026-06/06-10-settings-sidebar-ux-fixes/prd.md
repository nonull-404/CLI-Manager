# settings-sidebar-ux-fixes：设置页与侧栏三处 UX 修复

## Goal

修复三个独立的小型 UX 问题，按优先级一次任务内顺序完成：

1. **P0（功能性 Bug）** 终端设置页的「终端预览」卡片在全屏（≥xl 宽度）下没有吸顶，随滚动条滚走消失，导致挑选主题时无法实时对照预览。
2. **P1（实用小功能）** 项目右键菜单缺少「打开所在目录」，无法快速在资源管理器中打开项目维护的路径。
3. **P2（交互打磨）** 通用设置「应用字体颜色」控件：hex 输入框 `flex-1` 占满整行过长；「跟随主题」按钮实际是"重置"动作，禁用态语义模糊，交互奇怪。

优先级依据：P0 是已损坏的既有功能（sticky 类已写但失效）；P1 改动最小、日常价值高；P2 纯视觉/交互打磨，无功能损失。

## What I already know（代码勘察结论）

- **问题 1**：`src/components/settings/pages/ThemeSettingsPage.tsx:137` 预览 Card 已带 `sticky top-5 z-10 self-start xl:col-start-2 xl:row-span-3 xl:row-start-1`；滚动容器是 `src/components/settings/SettingsLayout.tsx:42` 的 `overflow-y-auto` div。类名齐全但运行时不生效。
  - 根因假设（需运行时验证 computed style）：
    - ① Tailwind v4 utilities 位于 `@layer utilities`，Mantine 的无 layer 样式优先级更高，若 Mantine `Card`（Paper）自带 `position` 相关样式则会覆盖 `position: sticky`；
    - ② sticky 元素是 grid item，吸附范围受其 grid area 约束（`row-span-3` + `self-start` 理论上有活动空间，但需验证）。
- **问题 2**：项目右键菜单在 `src/components/sidebar/index.tsx:846-941`（`contextMenu.kind === "project"` 块）。`Project.path` 字段存在（`src/lib/types.ts:12`）。`@tauri-apps/plugin-opener` 已是依赖（`AboutSection.tsx` 用了 `openUrl`），capability 已有 `opener:default`，但 `opener:default` 不含 `allow-open-path`，需在 `src-tauri/capabilities/default.json` 增加权限。错误提示沿用现有 `sonner` toast 模式。
- **问题 3**：控件在 `src/components/settings/pages/GeneralSettingsPage.tsx:471-549`：color picker（w=52）+ hex TextInput（`className="flex-1"`）+「跟随主题」Button（onClick 清空 `uiTextColor`，已跟随时 disabled）。

## Requirements

### R1（P0）终端预览吸顶修复

- 全屏（视口 ≥ xl=1280px，双列布局）下滚动「终端设置」页，预览卡片保持吸附在滚动容器顶部（`top-5`），始终可见。
- 视口 < xl（单列布局）时保持现状的文档流布局，不产生吸顶遮挡。
- 修复方式（推荐）：把 grid 定位 + sticky 职责从 Mantine `Card` 上移到一个普通 `<div>` wrapper（`xl:sticky top-5 self-start xl:col-start-2 xl:row-span-3 xl:row-start-1`），Card 退化为纯内容容器，避开 Mantine 无 layer 样式与 Tailwind cascade layer 的优先级问题。实现时先用 devtools 确认 computed `position`，按实际根因落地。

### R2（P1）项目右键「打开所在目录」

- 在项目右键菜单「修改」上方（与 Clone/选中等管理操作同区）新增菜单项「打开所在目录」，图标用 lucide `FolderOpen`，尺寸 14 / strokeWidth 1.5 与现有项一致。
- 点击后调用 `@tauri-apps/plugin-opener` 的 `openPath(project.path)`，用系统资源管理器直接打开项目路径（注意：是打开该目录本身，不是 reveal 父目录）。
- `src-tauri/capabilities/default.json` 增加 `opener:allow-open-path` 权限（最小新增，不动其他权限）。
- 失败（路径不存在/无权限）时 `toast.error("打开目录失败", { description })`，不崩溃；点击后菜单关闭（`setContextMenu(null)`，与现有项一致）。

### R3（P2）应用字体颜色控件打磨

采用最小改动方案（方案 A）：

- hex 输入框从 `flex-1` 改为固定紧凑宽度（`w={120}` 左右，容纳 `#RRGGBB` + padding），整行不再被拉长。
- 「跟随主题」按钮改为**仅在自定义颜色生效时显示**（`uiTextColor` 为空时整个按钮隐藏，而非 disabled），并把文案改为「恢复跟随主题」以明确这是一个动作而非状态；保留现有点击行为（清空 `uiTextColor`）。
- 下方「当前自定义 / 当前跟随主题」状态行与无效输入提示保持不变（状态展示已由该行承担，按钮不再兼任状态指示）。

备选方案 B（不采用，记录备查）：改为 Switch「跟随主题」，关闭后才显示取色控件。语义最清晰但状态联动改动更大，违背 KISS。

### R3 返工（用户验收反馈：自定义颜色多次只偶尔生效）

根因（两个叠加的原有缺陷）：

1. **提交时机不可靠**：`type="color"` 取色器仅在 `onBlur` 提交；系统取色对话框关闭后焦点仍在输入框上，不点击页面其他位置则永不提交。
2. **静默对比度门槛**：`App.tsx`（canUseUiTextColor）要求自定义色与 `--bg-primary` 的 WCAG 对比度 ≥ 4.5 才应用，不达标静默移除 CSS 变量，设置页状态行却仍显示「当前自定义 #xxx」，无任何反馈。

修复要求：

- 取色器 `onChange` 时立即提交（实时生效即实时预览）；hex 输入保持 blur/Enter 提交。`settingsStore.update` 为内存 set + 插件防抖落盘，无需额外 debounce。
- 对比度门槛从 4.5（可读性标准）降为约 1.6（仅拦截「与背景几乎同色」的自锁风险）；把 hex 解析/对比度计算抽到 `src/lib/` 共享工具，设置页据此显示反馈：比值低于硬门槛提示「颜色与背景过于接近，未应用」；介于硬门槛与 4.5 之间提示「对比度较低，可能影响可读性」（仍应用）。彻底消除静默不生效。


## Acceptance Criteria

- [ ] ≥xl 宽度下滚动终端设置页到底部，预览卡片始终吸附可见；<xl 单列下无遮挡、布局正常。
- [ ] 项目右键菜单出现「打开所在目录」，点击后资源管理器打开 `project.path`；无效路径时出现错误 toast，应用不崩溃。
- [ ] `capabilities/default.json` 仅新增 `opener:allow-open-path` 一项权限。
- [ ] 应用字体颜色行：hex 输入框为固定紧凑宽度；跟随主题状态下不出现禁用按钮；自定义颜色后出现「恢复跟随主题」按钮且点击可恢复。
- [ ] `npx tsc --noEmit` 通过。

## Definition of Done

- `npx tsc --noEmit` 通过；涉及 Rust 配置变更不需要 cargo 代码改动（仅 capability JSON）。
- 向用户报告改动范围；UI/运行验证由用户执行（团队约定：validation scope）。
- 不新增依赖、不动数据库、不动 settings store 结构。

## Out of Scope

- 不重构终端主题选择/预览的其他布局与交互。
- 不为「打开所在目录」做路径预校验（`check_paths_exist`）或后端新命令，失败走 toast 即可。
- 不实现方案 B（Switch 化）的字体颜色交互重构。
- 不处理 group（目录）右键菜单的同类功能（目录无 path 字段）。

## Decision (ADR-lite)

**Context**：三个问题是否拆多个任务；问题 2 用 `openPath` 还是 `revealItemInDir`；问题 3 用最小打磨还是 Switch 重构。
**Decision**：单任务三子项按 P0→P1→P2 顺序实现（同属 UI 小修，独立验收）；用 `openPath` 直接打开项目路径（符合"目录是项目维护的路径"的语义）；问题 3 采用方案 A 最小打磨。
**Consequences**：一次实现一次验收，回归面集中在设置页与侧栏菜单；若未来用户希望"跟随主题"有更强的模式感，可再升级为方案 B。

## Technical Notes

- 涉及文件：
  - `src/components/settings/pages/ThemeSettingsPage.tsx`（R1，预览卡片 wrapper）
  - `src/components/sidebar/index.tsx`（R2，菜单项 + openPath + toast）
  - `src-tauri/capabilities/default.json`（R2，`opener:allow-open-path`）
  - `src/components/settings/pages/GeneralSettingsPage.tsx`（R3，宽度 + 按钮显隐/文案）
- 约束：Tailwind v4 cascade layer 与 Mantine 无 layer 样式的优先级关系是 R1 的关键疑点；修复落地前先验证 computed style，避免盲改。
- 安全：`opener:allow-open-path` 打开的路径来自用户自己维护的项目配置（非任意外部输入），风险与现有 `open_windows_terminal` 同级，符合最小权限新增。
