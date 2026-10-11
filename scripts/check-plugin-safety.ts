#!/usr/bin/env node
// Plugin-directory upload gate. Fails when a plugin ships something the upload
// scanner holds for review:
//   1. a skill/agent/command pre-approves a write- or exec-capable tool with no path scope
//   2. shipped code copies the whole environment (every secret in it) instead of named variables
//   3. a native executable is committed (the scanner cannot read it)
//   4. any file is over 5 MiB (the plugin directory rejects it)
//   5. a script or document is over 256 KiB (the scanner reads only that much, then holds the plugin)
//   6. a shell command word that prints the environment sits on its own in a call or condition
//   7. a template placeholder names a credential (key, token, secret, ...)
// Usage: node scripts/check-plugin-safety.ts [plugin-root ...]   (default: .)
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const SELF = "check-plugin-safety.ts";
const SKIP_DIRS: ReadonlySet<string> = new Set([".git", "node_modules"]);
const MAX_SCAN_BYTES = 67_108_864;
const MAX_FILE_BYTES = 5_242_880; // the directory's per-file limit: 5 MiB
const MAX_TEXT_BYTES = 262_144; // the scanner reads scripts and documents only up to 256 KiB
const BYTES_PER_MIB = 1_048_576;
const BYTES_PER_KIB = 1024;
// Images and fonts are let through unread, so the 256 KiB reading limit does not apply to them.
const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf"]);
const HEAD_CHARS = 200;
const SNIPPET_CHARS = 100;
const ARGV_ROOTS_START = 2; // argv[0] is node, argv[1] is this script

// ---- rule 1: unscoped grants -------------------------------------------------

// Tools that change files or run commands. They must carry a scope: Tool(pattern).
const SCOPED_ONLY: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"]);
// Scopes that match everything are the same as no scope.
const BROAD: ReadonlySet<string> = new Set(["*", "**", "/**", "./**", "//**", "~/**", "**/*"]);
const FRONTMATTER_FIELDS: readonly string[] = ["allowed-tools", "allowed_tools", "tools"];
const FIELD_RE = new RegExp(`^(?:${FRONTMATTER_FIELDS.join("|")})\\s*:\\s*(.*)$`);
const LIST_ITEM_RE = /^\s+-\s+(.*)$/;

function frontmatter(text: string): readonly string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match?.[1] === undefined ? [] : match[1].split(/\r?\n/);
}

const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, "");

interface SplitState {
  readonly parts: readonly string[];
  readonly current: string;
  readonly depth: number;
}

function splitStep(state: SplitState, ch: string): SplitState {
  if (ch === "(") return { ...state, current: state.current + ch, depth: state.depth + 1 };
  if (ch === ")") return { ...state, current: state.current + ch, depth: state.depth - 1 };
  if (ch === "," && state.depth === 0) return { parts: [...state.parts, state.current], current: "", depth: 0 };
  return { ...state, current: state.current + ch };
}

// Split on commas outside parentheses.
function splitTools(value: string): readonly string[] {
  const end = Array.from(value).reduce(splitStep, { parts: [], current: "", depth: 0 });
  return [...end.parts, end.current].map(unquote).filter((t) => t !== "");
}

function blockList(rest: readonly string[]): readonly string[] {
  const stop = rest.findIndex((l) => !LIST_ITEM_RE.test(l));
  const items = stop === -1 ? rest : rest.slice(0, stop);
  return items.map((l) => unquote(LIST_ITEM_RE.exec(l)?.[1] ?? ""));
}

function toolsOnLine(lines: readonly string[], index: number): readonly string[] {
  const m = FIELD_RE.exec(lines[index] ?? "");
  if (!m) return [];
  const value = (m[1] ?? "").trim().replace(/^\[|\]$/g, "");
  return value === "" ? blockList(lines.slice(index + 1)) : splitTools(value);
}

const toolsIn = (lines: readonly string[]): readonly string[] => lines.flatMap((_, i) => toolsOnLine(lines, i));

function grantProblem(tool: string): string | undefined {
  const m = /^([A-Za-z_*]+)(?:\((.*)\))?$/.exec(tool);
  if (!m) return undefined;
  const name = m[1] ?? "";
  const scope = m[2];
  if (name === "*") return "wildcard grants every tool";
  if (!SCOPED_ONLY.has(name)) return undefined;
  if (scope === undefined || scope.trim() === "") return `${name} has no path scope; use ${name}(./path/**)`;
  return BROAD.has(scope.trim()) ? `${name}(${scope}) matches everything; narrow the scope` : undefined;
}

// ---- rule 2: whole-environment forwarding -----------------------------------

// Reading one named variable (process.env.COLUMNS) is fine. Copying or listing
// the whole environment hands every secret in it to the code.
const ENV_PATTERNS: readonly { readonly re: RegExp; readonly why: string }[] = [
  { re: /\.\.\.\s*process\.env\b(?!\s*\.|\s*\[)/, why: "spreads the whole environment" },
  { re: /Object\.(?:keys|entries|values)\(\s*process\.env\s*\)/, why: "enumerates the whole environment" },
  { re: /Object\.assign\([^)]*\bprocess\.env\s*[,)]/, why: "copies the whole environment" },
  { re: /\benv\s*:\s*process\.env\s*[,}\n]/, why: "passes the whole environment to a child process" },
];
const CODE_EXTS: ReadonlySet<string> = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".cts"]);
const TEST_FILE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/;
const NODE_SHEBANG = /^#!.*\bnode\b/;

function isShippedCode(path: string, head: string): boolean {
  if (basename(path) === SELF || TEST_FILE.test(path)) return false;
  const ext = extname(path).toLowerCase();
  return CODE_EXTS.has(ext) || (ext === "" && NODE_SHEBANG.test(head));
}

function envProblems(path: string): readonly string[] {
  const text = statSync(path).size > MAX_SCAN_BYTES ? "" : readFileSync(path, "utf8");
  if (!isShippedCode(path, text.slice(0, HEAD_CHARS))) return [];
  return text.split(/\r?\n/).flatMap((line, i) =>
    ENV_PATTERNS.filter(({ re }) => re.test(line)).map(
      ({ why }) => `line ${i + 1} ${why}: ${line.trim().slice(0, SNIPPET_CHARS)}`,
    ),
  );
}

// ---- rules 6 and 7: shapes the scanner reads as a credential lookup ----------

// The scanner splits a line on parentheses, braces and the shell's separators, and reads a segment that
// is one command word as that command run with no arguments. A bare declare, set, export or env prints
// the whole environment, so a call or a condition holding just such a word is held as a read of the
// installer's environment, whether it sits in code, in a comment or in a document.
const COMMAND_WORDS: readonly string[] = ["declare", "env", "export", "printenv", "set", "typeset", "unset"];
// Matches a segment that is one command word, right after "(" or "{" or at a statement start; rejects a word given arguments or part of a longer name.
// https://regex101.com/?flavor=javascript&regex=%28%3F%3A%5B%28%7B%5D%7C%5E%7C%3B%7C%26%26%7C%5C%7C%5C%7C%29%5Cs%2A%5B%22%27%60%5D%3F%28%3F%3Adeclare%7Cenv%7Cexport%7Cprintenv%7Cset%7Ctypeset%7Cunset%29%5B%22%27%60%5D%3F%5Cs%2A%28%3F%3A%5B%29%7D%5D%7C%26%26%7C%5C%7C%5C%7C%7C%3B%7C%24%29&flags=m&testString=%28declare%29%0Aif%20%28set%20%26%26%20ok%29%20%7B%0A%7B%20env%20%7D%0Arun%28export%29%3B%0Aset%28a%2C%20b%29%3B%0Adeclare%20%3D%201%3B%0Aconst%20isDeclare%20%3D%201%3B
const LONE_COMMAND_RE = new RegExp(
  `(?:[({]|^|;|&&|\\|\\|)\\s*["'\`]?(?:${COMMAND_WORDS.join("|")})["'\`]?\\s*(?:[)}]|&&|\\|\\||;|$)`,
);

// A template placeholder whose expression names a credential reads as a credential lookup, however
// harmless the expression around the name is.
const CREDENTIAL_WORDS: readonly string[] = [
  "key",
  "keys",
  "token",
  "tokens",
  "secret",
  "secrets",
  "password",
  "passwd",
  "pass",
  "auth",
  "apikey",
  "credential",
  "credentials",
  "cookie",
  "session",
];
// Matches a placeholder with a credential word inside it; rejects one with an ordinary name such as "name" or "githubToken" (one word, no boundary).
// https://regex101.com/?flavor=javascript&regex=%5C%24%5C%7B%5B%5E%7D%5D%2A%5Cb%28%3F%3Akey%7Ckeys%7Ctoken%7Ctokens%7Csecret%7Csecrets%7Cpassword%7Cpasswd%7Cpass%7Cauth%7Capikey%7Ccredential%7Ccredentials%7Ccookie%7Csession%29%5Cb%5B%5E%7D%5D%2A%5C%7D&flags=i&testString=%24%7Bkey%7D%0A%24%7Bthis.input.slice%28key.start%29%7D%0A%24%7Bname%7D%0A%24%7BgithubToken%7D%0A%24%7Btoken%7D
const CREDENTIAL_PLACEHOLDER_RE = new RegExp(`\\$\\{[^}]*\\b(?:${CREDENTIAL_WORDS.join("|")})\\b[^}]*\\}`, "i");

const WORKFLOW_DIR = ".github"; // not part of what the scanner reads
const LOCKFILE = "package-lock.json"; // hashes, not code

// The gate spells these patterns itself, so it is not held to them.
const isOutsideRules = (root: string, path: string): boolean =>
  basename(path) === SELF || basename(path) === LOCKFILE || relative(root, path).startsWith(WORKFLOW_DIR);

// Images and fonts are let through unread, so they have no text to match.
function readableText(path: string): string {
  if (MEDIA_EXTENSIONS.has(extname(path).toLowerCase())) return "";
  return statSync(path).size > MAX_SCAN_BYTES ? "" : readFileSync(path, "utf8");
}

function lineProblems(path: string, re: RegExp, why: string): readonly string[] {
  return readableText(path)
    .split("\n")
    .flatMap((line, i) => (re.test(line) ? [`line ${i + 1} ${why}: ${line.trim().slice(0, SNIPPET_CHARS)}`] : []));
}

function scannerShapeProblems(root: string, path: string): readonly string[] {
  if (isOutsideRules(root, path)) return [];
  return [
    ...lineProblems(path, LONE_COMMAND_RE, "has a command word on its own, which the scanner reads as a command that prints the environment"),
    ...lineProblems(path, CREDENTIAL_PLACEHOLDER_RE, "has a template placeholder that names a credential, which the scanner reads as a credential lookup"),
  ];
}

// ---- rule 3: native executables ---------------------------------------------

const HEADER_BYTES = 0x40;
const MAGIC_BYTES = 4;
const ELF_MAGIC = 0x7f454c46;
const MACHO_32 = 0xfeedface;
const MACHO_64 = 0xfeedfacf;
const MACHO_32_SWAPPED = 0xcefaedfe;
const MACHO_64_SWAPPED = 0xcffaedfe;
const MACHO_MAGICS: ReadonlySet<number> = new Set([MACHO_32, MACHO_64, MACHO_32_SWAPPED, MACHO_64_SWAPPED]);
const FAT_MACHO_MAGIC = 0xcafebabe; // also the magic of a Java .class, which is small
const JAVA_CLASS_MAX_BYTES = 4096;
const DOS_MAGIC = 0x4d5a;
const PE_OFFSET_FIELD = 0x3c;
const PE_SIGNATURE = "PE\0\0";

function readBytes(path: string, length: number, position: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(length);
    return buf.subarray(0, readSync(fd, buf, 0, length, position));
  } finally {
    closeSync(fd);
  }
}

function isPortableExecutable(path: string, head: Buffer): boolean {
  if (head.length < HEADER_BYTES || head.readUInt16BE(0) !== DOS_MAGIC) return false;
  const sig = readBytes(path, MAGIC_BYTES, head.readUInt32LE(PE_OFFSET_FIELD));
  return sig.toString("latin1") === PE_SIGNATURE;
}

function nativeKind(path: string): string | undefined {
  const head = readBytes(path, HEADER_BYTES, 0);
  if (head.length < MAGIC_BYTES) return undefined;
  const magic = head.readUInt32BE(0);
  if (magic === ELF_MAGIC) return "ELF executable";
  if (MACHO_MAGICS.has(magic)) return "Mach-O executable";
  if (magic === FAT_MACHO_MAGIC && statSync(path).size > JAVA_CLASS_MAX_BYTES) return "Mach-O universal binary";
  return isPortableExecutable(path, head) ? "Windows PE executable" : undefined;
}

// ---- walk and report --------------------------------------------------------

function expand(dir: string, entry: Dirent): readonly string[] {
  const p = join(dir, entry.name);
  if (entry.isDirectory()) return walk(p);
  return entry.isFile() ? [p] : [];
}

function walk(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP_DIRS.has(e.name))
    .flatMap((e) => expand(dir, e));
}

function isGrantFile(root: string, path: string): boolean {
  if (!path.endsWith(".md")) return false;
  const dirs = relative(root, path).split(/[\\/]/);
  return basename(path) === "SKILL.md" || dirs.includes("agents") || dirs.includes("commands");
}

function grantProblems(root: string, path: string): readonly string[] {
  if (!isGrantFile(root, path)) return [];
  return toolsIn(frontmatter(readFileSync(path, "utf8"))).flatMap((tool) => {
    const why = grantProblem(tool);
    return why === undefined ? [] : [`${tool}: ${why}`];
  });
}

function sizeProblems(path: string): readonly string[] {
  const size = statSync(path).size;
  if (size > MAX_FILE_BYTES) {
    return [`${(size / BYTES_PER_MIB).toFixed(1)} MiB; the plugin directory rejects any file over 5 MiB. Shrink it, or fetch it at run time`];
  }
  if (size >= MAX_TEXT_BYTES && !MEDIA_EXTENSIONS.has(extname(path).toLowerCase())) {
    return [`${Math.round(size / BYTES_PER_KIB)} KiB; the scanner reads scripts and documents only up to 256 KiB and holds the plugin for review beyond that. Split it into smaller files`];
  }
  return [];
}

function fileProblems(root: string, path: string): readonly string[] {
  const grants = [...grantProblems(root, path), ...sizeProblems(path)];
  const kind = nativeKind(path);
  if (kind !== undefined) {
    return [...grants, `${kind} committed; the scanner cannot read it. Ship source and fetch a pinned build instead`];
  }
  return [...grants, ...envProblems(path), ...scannerShapeProblems(root, path)];
}

function checkRoot(root: string): number {
  const files = walk(root);
  const lines = files.flatMap((f) => fileProblems(root, f).map((p) => `FAIL ${relative(root, f)}: ${p}`));
  lines.forEach((l) => console.log(l));
  console.log(`${root}: checked ${files.length} files, ${lines.length} problem(s)`);
  return lines.length;
}

function checkTarget(root: string): number {
  if (existsSync(root)) return checkRoot(root);
  console.log(`FAIL ${root}: no such directory`);
  return 1;
}

function main(): number {
  const roots = process.argv.slice(ARGV_ROOTS_START).map((r) => resolve(r));
  const targets = roots.length > 0 ? roots : [resolve(".")];
  const failures = targets.map(checkTarget).reduce((a, b) => a + b, 0);
  return failures > 0 ? 1 : 0;
}

process.exit(main());
