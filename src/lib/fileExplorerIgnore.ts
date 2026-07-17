/**
 * 文件树用的轻量 ignore 规则。
 * Issue #147：优先解析项目 .gitignore；无 ignore 时回退默认折叠/隐藏规则。
 *
 * 覆盖常见 gitignore 语法子集：注释、否定 (!)、目录后缀 /、* / ** 通配。
 * 不做完整 git 语义（如范围外锚点、复杂字符类），足以满足资源管理器噪音过滤。
 */

export interface IgnoreRule {
  /** 去掉前导 ! 与末尾 / 后的模式 */
  pattern: string;
  directoryOnly: boolean;
  negated: boolean;
}

/** 无 .gitignore 时使用的默认折叠/隐藏规则（目录名与常见垃圾文件）。 */
export const DEFAULT_FILE_EXPLORER_IGNORE_PATTERNS: readonly string[] = [
  ".git/",
  ".hg/",
  ".svn/",
  "node_modules/",
  "bower_components/",
  ".pnpm-store/",
  ".yarn/",
  "dist/",
  "build/",
  "out/",
  "output/",
  ".output/",
  "target/",
  "coverage/",
  "htmlcov/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".vite/",
  ".parcel-cache/",
  ".cache/",
  "cache/",
  "__pycache__/",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  ".venv/",
  "venv/",
  ".idea/",
  ".vscode/",
  ".vscode-test/",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "*.log",
  "*.tmp",
  "*.temp",
  "*.swp",
  "*.swo",
  "*~",
  ".env.local",
  ".env.*.local",
];

export function parseIgnoreContent(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    let body = line;
    let negated = false;
    if (body.startsWith("!")) {
      negated = true;
      body = body.slice(1);
    }
    // 去掉未转义的前导 /（相对仓库根）
    if (body.startsWith("/") && !body.startsWith("//")) {
      body = body.slice(1);
    }
    if (!body) continue;
    let directoryOnly = false;
    if (body.endsWith("/") && !body.endsWith("\\/")) {
      directoryOnly = true;
      body = body.slice(0, -1);
    }
    if (!body) continue;
    rules.push({ pattern: body.replace(/\\ /g, " "), directoryOnly, negated });
  }
  return rules;
}

export function parseDefaultIgnoreRules(): IgnoreRule[] {
  return parseIgnoreContent(DEFAULT_FILE_EXPLORER_IGNORE_PATTERNS.join("\n"));
}

/**
 * 判断相对路径是否应被文件树隐藏/折叠。
 * @param relativePath 使用 `/` 分隔、无前导 `/` 的项目相对路径
 */
export function isIgnoredByRules(
  relativePath: string,
  isDirectory: boolean,
  rules: IgnoreRule[]
): boolean {
  const path = relativePath.replace(/\\/g, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!path) return false;

  let ignored = false;
  for (const rule of rules) {
    const matched = rule.directoryOnly
      // 目录规则：自身、其子路径（文件或目录）均视为命中
      ? pathMatchesDirectoryRule(path, rule.pattern)
      : pathMatchesRule(path, isDirectory, rule);
    if (!matched) continue;
    ignored = !rule.negated;
  }
  return ignored;
}

function pathMatchesDirectoryRule(path: string, pattern: string): boolean {
  // 目录规则：自身或任意子路径
  if (pathMatchesGlob(path, pattern)) return true;
  const prefix = pattern.endsWith("/") ? pattern : `${pattern}/`;
  // 简化：若 pattern 无通配，检查 path 是否在该目录下
  if (!hasGlobMeta(pattern)) {
    return path === pattern || path.startsWith(`${pattern}/`);
  }
  // 带通配时逐段检查祖先
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const ancestor = parts.slice(0, i).join("/");
    if (pathMatchesGlob(ancestor, pattern)) return true;
  }
  void prefix;
  return false;
}

function pathMatchesRule(path: string, isDirectory: boolean, rule: IgnoreRule): boolean {
  if (rule.directoryOnly) {
    return isDirectory && pathMatchesGlob(path, rule.pattern);
  }
  // 无斜杠的模式匹配任意深度的 basename（gitignore 惯例）
  if (!rule.pattern.includes("/")) {
    const base = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    return pathMatchesGlob(base, rule.pattern) || pathMatchesGlob(path, rule.pattern);
  }
  return pathMatchesGlob(path, rule.pattern);
}

function hasGlobMeta(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}

/** 极简 glob：支持 *、**、?；大小写敏感（与 git 在 Linux 一致；Windows 上路径已由调用方规范化）。 */
export function pathMatchesGlob(path: string, pattern: string): boolean {
  const regex = globToRegExp(pattern);
  return regex.test(path);
}

function globToRegExp(pattern: string): RegExp {
  let i = 0;
  let out = "^";
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** 可跨目录
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if (ch === "." || ch === "+" || ch === "(" || ch === ")" || ch === "|" || ch === "^" || ch === "$" || ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "\\") {
      out += `\\${ch}`;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  out += "$";
  return new RegExp(out, "u");
}

/**
 * 从条目列表中收集应自动折叠的目录路径、应隐藏的文件路径。
 */
export function collectIgnoreHits(
  entries: Array<{ path: string; name: string; kind: string; children?: unknown }>,
  rules: IgnoreRule[],
  result: { collapsedDirs: Set<string>; hiddenFiles: Set<string> } = {
    collapsedDirs: new Set(),
    hiddenFiles: new Set(),
  }
): { collapsedDirs: Set<string>; hiddenFiles: Set<string> } {
  for (const entry of entries) {
    const isDir = entry.kind === "directory";
    if (isIgnoredByRules(entry.path, isDir, rules)) {
      if (isDir) result.collapsedDirs.add(entry.path);
      else result.hiddenFiles.add(entry.path);
    }
    if (isDir && Array.isArray(entry.children)) {
      collectIgnoreHits(entry.children as typeof entries, rules, result);
    }
  }
  return result;
}
