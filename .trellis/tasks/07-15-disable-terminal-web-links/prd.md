# 移除终端 Web 超链接与整行虚线

## Goal

终端保留 CLI 原始可见文本，但不再把普通 URL 或 OSC 8 区域渲染成可点击链接，避免 Codex 界面整行出现虚线并跳转到当前仓库。

## Root-Cause Statement

问题位于 PTY 输出进入 xterm 的链接语义层：`XTermTerminal` 同时启用了 xterm 原生 OSC 8 链接处理和 `WebLinksAddon`，因此 Codex 输出的仓库链接区域被保留为可点击装饰；修复应在 xterm 初始化边界禁用这两类 Web 链接，而不是用 CSS 隐藏下划线。

## Discovery List

- [x] `src/components/XTermTerminal.tsx`：OSC 8 handler、`WebLinksAddon`、终端文件路径 link provider。
- [x] `src/components/TerminalTabs.tsx`：唯一 React 挂载入口，接口无需变化。
- [x] `src/lib/terminalFileLinks.ts`：文件路径跳转为独立 provider，确认保留。
- [x] `package.json` / `package-lock.json`：移除不再使用的 `@xterm/addon-web-links`。
- [x] `.trellis/spec/backend/terminal-runtime-monitoring-contracts.md`：运行状态 OSC 133/633/777 与本修复无关，继续按原链路处理。
- [x] PTY Rust 后端：只传输原始输出，不拥有链接展示语义，确认无需修改。

## Impact

- `XTermTerminal` 仅由 `TerminalTabs` 渲染；历史 GitNexus 记录和当前引用检查均显示 LOW 风险。
- 不改变 PTY 数据、终端输入、普通文本显示、文件路径识别、搜索、复制或快照逻辑。

## Requirements

- 消费 OSC 8 控制序列，但保留序列包裹的可见文字。
- 不加载 `WebLinksAddon`，普通 `http://` / `https://` 文本不再自动变为链接。
- 保留现有终端文件路径点击打开功能。
- 卸载终端时释放新增的 parser handler。

## Verification Needed

- [x] `npx tsc --noEmit` 通过。
- [x] `npm run build` 通过；仅保留既有大 chunk / dynamic import warning。
- [x] 依赖锁文件和源码中不再包含 `@xterm/addon-web-links`、`WebLinksAddon`、`linkHandler` 或 `openHttpUrl`。
- [x] xterm 6.0 类型定义确认 `registerOscHandler(8, callback)` 返回可释放的 `IDisposable`。
- [ ] Windows 实机重新构建并启动后，Codex TUI 行下方不再出现链接虚线，点击不再打开仓库页面。

## Failures and Pitfalls

- 首次 `npm ci` 在 125 秒超时；改用 `--ignore-scripts --prefer-offline --no-audit --no-fund` 后完成，未影响后续类型检查和前端构建。
- `npm run tauri:build:local` 的前端阶段通过，但 Rust 链接失败：当前 PATH 只找到 `C:\Program Files\Git\usr\bin\link.exe`，其 GNU `link` 把 MSVC 参数识别为 `extra operand`；本机未发现 Visual Studio C++ Build Tools / `vcvars64.bat`。未生成安装包，未覆盖正在使用的安装版。
- 后续改走仓库现有 GitHub Actions 管理员 Windows 构建工作流，并将应用版本提升到 `1.2.9`，确保安装器可作为明确的新版本执行升级测试。
