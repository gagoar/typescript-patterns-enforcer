import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HERE, "..", "dist", "check.js");
const fixture = (name) => join(HERE, "fixtures", name);

const CASES = [
  { id: "no-explicit-any", bad: "no-explicit-any.bad.ts", good: "no-explicit-any.good.ts" },
  { id: "ban-ts-comment", bad: "ban-ts-comment.bad.ts", good: "ban-ts-comment.good.ts" },
  { id: "no-magic-numbers", bad: "no-magic-numbers.bad.ts", good: "no-magic-numbers.good.ts" },
  { id: "prefer-await-to-then", bad: "prefer-await-to-then.bad.ts", good: "prefer-await-to-then.good.ts" },
  { id: "no-switch-statement", bad: "no-switch-statement.bad.ts", good: "no-switch-statement.good.ts" },
  { id: "no-param-reassign", bad: "no-param-reassign.bad.ts", good: "no-param-reassign.good.ts" },
  { id: "no-loop-statements", bad: "no-loop-statements.bad.ts", good: "no-loop-statements.good.ts" },
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
