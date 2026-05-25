# 发布 V0.1.4 版本与 CHANGELOG

## Goal

将版本号从 0.1.3 提升到 0.1.4，并把 V0.1.3 之后的所有变更整理写入 `CHANGELOG.md`。

## Commits since V0.1.3 (last release commit `0869052`)

| Hash | Type | Summary |
|------|------|---------|
| `e4c29cb` | fix | PTY 字节流边界保护（UTF-8 + ANSI ESC），修终端 diff 输出左侧色块错乱 |
| `c2bda3b` | perf + feat | 历史扫描移出 async runtime、非激活终端 buffering 削减、history 搜索小写化优化、diff payload 缩小、settings 写入节流、sync/WebDAV 导入路径收紧；**新增 Catppuccin 系列等终端主题**（terminalThemes.ts +384 行） |
| `c5b806f` | chore | 把 `.agents/` `.codex/` `.xcodemap/` 加进 gitignore |
| `2595aa5` | doc | 引入 Trellis 工作流脚本与 spec |

## Requirements

- [R1] 同步将 3 个版本字段从 `0.1.3` → `0.1.4`：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`
- [R2] 运行 `cd src-tauri && cargo check` 让 `Cargo.lock` 自动同步 cli-manager 版本（避免手改）
- [R3] 在 `CHANGELOG.md` 顶部新增 V0.1.4 区块（**早于** V0.1.3 区块）
- [R4] V0.1.4 区块按"用户可感知"维度组织：终端渲染修复 / 性能优化 / 新增终端主题；工程内务（trellis、gitignore）不写入或仅 footer 简提
- [R5] CHANGELOG 文体沿用现有风格（中文 + 三级标题 + 项目符号）

## Acceptance Criteria

- [ ] 3 处版本字段全部为 `0.1.4`
- [ ] `Cargo.lock` 内 cli-manager 同步为 `0.1.4`
- [ ] `CHANGELOG.md` 顶部含完整 V0.1.4 区块（日期 2026-05-22）
- [ ] `npx tsc --noEmit` 通过
- [ ] `cd src-tauri && cargo check` 通过

## Out of Scope

- Trellis 元数据本身的内容（用户已通过 2595aa5 提交）
- 不打 tag、不发 GitHub Release（仅本地版本号 + 文档）

## Technical Notes

- 现有 CHANGELOG 中 V0.1.2/V0.1.3 顺序略乱（V0.1.3 在 V0.1.2 之前），新增 V0.1.4 仍放在最顶端，保持"最新在上"的语义
- terminalThemes.ts 新增的主题包括 Catppuccin Mocha / Macchiato 等（具体列表实施时再扫一次确认）
