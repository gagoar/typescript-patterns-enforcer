import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HERE, "..", "dist", "check.js");
const STOP = join(HERE, "..", "dist", "stop.js");
const fixture = (name) => join(HERE, "fixtures", name);

const CASES = [
  { id: "no-explicit-any", bad: "no-explicit-any.bad.ts", good: "no-explicit-any.good.ts" },
  { id: "ban-ts-comment", bad: "ban-ts-comment.bad.ts", good: "ban-ts-comment.good.ts" },
  { id: "no-magic-numbers", bad: "no-magic-numbers.bad.ts", good: "no-magic-numbers.good.ts" },
  { id: "prefer-await-to-then", bad: "prefer-await-to-then.bad.ts", good: "prefer-await-to-then.good.ts" },
  { id: "no-switch-statement", bad: "no-switch-statement.bad.ts", good: "no-switch-statement.good.ts" },
  { id: "no-param-reassign", bad: "no-param-reassign.bad.ts", good: "no-param-reassign.good.ts" },
  { id: "no-loop-statements", bad: "no-loop-statements.bad.ts", good: "no-loop-statements.good.ts" },
  { id: "no-narrative-comment", bad: "no-narrative-comment.bad.ts", good: "no-narrative-comment.good.ts" },
  { id: "no-nested-ternary", bad: "no-nested-ternary.bad.ts", good: "no-nested-ternary.good.ts" },
  { id: "require-regex-example", bad: "require-regex-example.bad.ts", good: "require-regex-example.good.ts" },
];

function runHook(filePath) {
  const input = JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath } });
  const result = spawnSync(process.execPath, [CHECK], { input, encoding: "utf8" });
  return { code: result.status, stderr: result.stderr };
}

for (const c of CASES) {
  test(`${c.id}: bad fixture is flagged with its own rule id`, () => {
    const r = runHook(fixture(c.bad));
    assert.equal(r.code, 2, `expected exit 2 for ${c.bad}, got ${r.code}. stderr: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(c.id), `expected "${c.id}" in stderr, got: ${r.stderr}`);
  });

  test(`${c.id}: good fixture passes clean`, () => {
    const r = runHook(fixture(c.good));
    assert.equal(r.code, 0, `expected exit 0 for ${c.good}, got ${r.code}. stderr: ${r.stderr}`);
  });
}

test("non-.ts file is ignored", () => {
  const r = runHook(join(HERE, "fixtures", "no-explicit-any.bad.ts") + ".md");
  assert.equal(r.code, 0);
});

test("missing file_path is ignored", () => {
  const result = spawnSync(process.execPath, [CHECK], { input: "{}", encoding: "utf8" });
  assert.equal(result.status, 0);
});

// Parity suite: each file in test/parity is run through the hook and its output must
// match test/parity/golden/<name>.txt exactly (exit code, rule ids, positions and
// message text). The goldens were recorded from the previous, ESLint-based engine, so
// they pin the behavior of every rule: the ESLint and typescript-eslint rules this
// engine reimplements, and the quirks that came with them. The one deliberate
// difference is `disable.ts`: that engine also reported "Definition for rule
// '@typescript-eslint/...' was not found" for eslint-disable comments naming another
// plugin's rules; this one ignores such comments.
const PARITY = join(HERE, "parity");
const parityFiles = readdirSync(PARITY).filter((name) => name !== "golden");

for (const name of parityFiles) {
  test(`parity: ${name} matches the recorded output exactly`, () => {
    const file = join(PARITY, name);
    const r = runHook(file);
    const actual = `exit ${r.code}\n${r.stderr.split(file).join("<FILE>")}`;
    const expected = readFileSync(join(PARITY, "golden", `${name}.txt`), "utf8");
    assert.equal(actual, expected);
  });
}

// Stop hook: files written through a shell never reach the edit hook, so it walks the
// working directory for .ts/.tsx files modified since the session transcript was created.
const SECONDS_BEFORE_SESSION = 3600;
const BAD_SOURCE = "export const x: any = 1;\n";

function stopScenario(setup, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ts-patterns-stop-"));
  const transcript = join(dir, "session.jsonl");
  writeFileSync(transcript, "");
  setup(dir);
  const input = JSON.stringify({ cwd: dir, transcript_path: transcript, ...extra });
  const result = spawnSync(process.execPath, [STOP], { input, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test("stop: reports a shell-written .ts file, advisory (exit 0, systemMessage)", () => {
  const r = stopScenario((dir) => writeFileSync(join(dir, "made-by-heredoc.ts"), BAD_SOURCE));
  assert.equal(r.status, 0);
  const { systemMessage } = JSON.parse(r.stdout);
  assert.match(systemMessage, /made-by-heredoc\.ts/);
  assert.match(systemMessage, /no-explicit-any/);
});

test("stop: a .ts file older than the session is not reported", () => {
  const r = stopScenario((dir) => {
    const old = join(dir, "old.ts");
    writeFileSync(old, BAD_SOURCE);
    const past = new Date(Date.now() - SECONDS_BEFORE_SESSION * 1000);
    utimesSync(old, past, past);
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("stop: node_modules and .d.ts files are skipped", () => {
  const r = stopScenario((dir) => {
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg", "index.ts"), BAD_SOURCE);
    writeFileSync(join(dir, "types.d.ts"), BAD_SOURCE);
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("stop: a clean .ts file produces no output", () => {
  const r = stopScenario((dir) => writeFileSync(join(dir, "clean.ts"), "export const x = (): number => 1;\n"));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("stop: stop_hook_active and a missing transcript stay silent", () => {
  const active = stopScenario((dir) => writeFileSync(join(dir, "a.ts"), BAD_SOURCE), { stop_hook_active: true });
  assert.equal(active.status, 0);
  assert.equal(active.stdout, "");
  const none = spawnSync(process.execPath, [STOP], { input: JSON.stringify({ cwd: HERE }), encoding: "utf8" });
  assert.equal(none.status, 0);
  assert.equal(none.stdout, "");
});
