# Fix Terminal Side Panel Tabs

## Goal
Fix the terminal right-side panel tab bar so the three tabs fit without wrapping, and prevent the app from crashing when switching away from or into the realtime stats tab.

## Confirmed Facts
- The terminal side panel now has three top tabs: realtime stats, Git changes, and files.
- The current default panel width is too narrow, causing tab text such as "实时统计" to wrap.
- Reproduction for the crash: open a project, click realtime stats, then click Git changes or files.
- The console reports `Rendered fewer hooks than expected`, which indicates an unstable hook call order, likely from a conditional return inside a React component.
- Switching only between Git changes and files does not crash.
- Opening the right-side Files panel currently writes to the shared file explorer project state, which makes the left sidebar switch from the project tree to the file tree.

## Requirements
- Increase the default/minimum right panel width enough for the three tabs to render on one line in Chinese and English.
- Preserve user-resizable side panel behavior and existing persisted width settings.
- Ensure all hooks in the affected realtime stats / side panel components are called unconditionally and in a stable order.
- Opening or switching the right-side Files panel must not force the left sidebar out of the project tree.
- The left sidebar file tree must remain an explicit user choice from the left project context menu and must provide a working return path to the project tree.
- Keep all user-visible text routed through the existing i18n layer.

## Acceptance Criteria
- With the default layout, the three side panel tab labels do not wrap.
- Clicking realtime stats, then Git changes, then files, in any order does not produce a React hooks error or black screen.
- Clicking the right toolbar Files button opens the right panel without changing the left sidebar project tree.
- If the left sidebar file tree is opened explicitly, its close/back button returns to the project tree without closing the right Files panel data.
- Existing Git changes and file browser tab switching behavior remains intact.
- Frontend type-check passes.

## Out of Scope
- Redesigning the side panel beyond the width and crash fix.
- Changing backend history, Git, or file APIs.
