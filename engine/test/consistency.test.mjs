import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Hand-kept lists and numbers that must agree with the source of truth. Each one has
// drifted or can drift without a compile error or a failing test: the registry against
// its fixtures and docs, the build outputs against the workflow, the hooks and the docs,
// and the version against every file that prints it. Each test names what to fix.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const unique = (items) => [...new Set(items)].sort();

const registry = read("engine/src/registry.ts");
// Matches the `id: "no-explicit-any"` line of one registry entry; rejects the other `id:` fields.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cs%2Bid%3A%20%22%28%5Ba-z-%5D%2B%29%22&flags=gm&testString=%20%20%20%20id%3A%20%22no-explicit-any%22%2C%0A%20%20readonly%20id%3A%20string%3B
const CHECK_IDS = unique([...registry.matchAll(/^\s+id: "([a-z-]+)"/gm)].map((m) => m[1]));
const CHECK_POINTERS = [...registry.matchAll(/^\s+pointer: "((?:[^"\\]|\\.)*)"/gm)].map((m) => m[1].replaceAll('\\"', '"'));

const NUMBER_WORDS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

test("the registry is read: it lists checks and pointers", () => {
  assert.ok(CHECK_IDS.length >= 10, `parsed ${CHECK_IDS.length} check ids from engine/src/registry.ts`);
  assert.equal(CHECK_POINTERS.length, CHECK_IDS.length, "every check needs exactly one pointer");
});

test("every check has a case in run.test.mjs and both fixture files", () => {
  const cases = unique([...read("engine/test/run.test.mjs").matchAll(/\{ id: "([a-z-]+)", bad:/g)].map((m) => m[1]));
  assert.deepEqual(CHECK_IDS.filter((id) => !cases.includes(id)), [], "checks with no CASES row in run.test.mjs");
  const missing = CHECK_IDS.flatMap((id) => [`${id}.bad.ts`, `${id}.good.ts`]).filter((file) => !existsSync(join(HERE, "fixtures", file)));
  assert.deepEqual(missing, [], "fixture files that do not exist");
});

test("every check is named in the README, the engine README and the site", () => {
  const files = ["README.md", "engine/README.md", "docs/index.html"];
  const gaps = files.flatMap((file) => CHECK_IDS.filter((id) => !read(file).includes(id)).map((id) => `${file}: ${id}`));
  assert.deepEqual(gaps, []);
});

test("the number of checks written in words or digits matches the registry", () => {
  // Matches "sixteen mechanical checks" and "16 checks"; rejects "Eleven rules for the skill to enforce"
  // (that counts SKILL.md's core rules, tested below) and "three parts". The link carries g and i so the tester tries every line.
  // https://regex101.com/?flavor=javascript&regex=%5Cb%28ten%7Celeven%7Ctwelve%7Cthirteen%7Cfourteen%7Cfifteen%7Csixteen%7Cseventeen%7Ceighteen%7Cnineteen%7Ctwenty%7C%5Cd%2B%29%20%28%3F%3Amechanical%20%7Cdeterministic%20%29%3F%28%3F%3Achecks%7Crules%29%5Cb%28%3F%21%20for%20the%20skill%29&flags=gi&testString=sixteen%20mechanical%20checks%0A16%20checks%0AEleven%20rules%20for%20the%20skill%20to%20enforce%0Athree%20parts
  const COUNT = /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d+) (?:mechanical |deterministic )?(?:checks|rules)\b(?! for the skill)/gi;
  const claims = ["README.md", "engine/README.md", "docs/index.html", "docs/guide.html"].flatMap((file) =>
    [...read(file).matchAll(COUNT)].map((m) => ({ file, said: m[1], count: NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]) })),
  );
  assert.ok(claims.length, "no count claims found: the pattern no longer matches the docs");
  const wrong = claims.filter(({ count }) => count !== CHECK_IDS.length);
  assert.deepEqual(wrong, [], `docs say a different number than the ${CHECK_IDS.length} checks in the registry`);
});

test("the site's count of core rules matches the numbered rules in SKILL.md", () => {
  const skill = read("skills/check/SKILL.md");
  const section = /## Core Rules\n([\s\S]*?)\n## /.exec(skill)?.[1] ?? "";
  const rules = [...section.matchAll(/^(\d+)\. \*\*/gm)].length;
  const said = /(\w+) rules for the skill to enforce/i.exec(read("docs/index.html"))?.[1];
  assert.ok(said, "docs/index.html no longer has the 'rules for the skill to enforce' heading");
  assert.equal(NUMBER_WORDS[said.toLowerCase()] ?? Number(said), rules);
});

test("every registry pointer names a real rule or section of SKILL.md", () => {
  const skill = read("skills/check/SKILL.md");
  const headings = [...skill.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].replaceAll("`", "").toLowerCase());
  const ruleNumbers = [...skill.matchAll(/^(\d+)\. \*\*/gm)].map((m) => m[1]);
  const broken = CHECK_POINTERS.flatMap((pointer) => {
    if (pointer.startsWith("SKILL.md —")) return [];
    const [target] = pointer.replace(/^SKILL\.md\s*/, "").split(" — ");
    if (!target) return [];
    const rule = /^Core Rule (\d+)/.exec(target);
    const found = rule ? ruleNumbers.includes(rule[1]) : headings.some((h) => h.includes(target.toLowerCase()));
    return found ? [] : [`${pointer} -> "${target}" is not in SKILL.md`];
  });
  assert.deepEqual(broken, []);
});

test("build outputs, dist, workflow, hooks and the engine README name the same files", () => {
  const outputs = unique([...read("engine/build.mjs").matchAll(/out: "dist\/([\w-]+\.js)"/g)].map((m) => m[1]));
  const onDisk = unique(readdirSync(join(ROOT, "engine", "dist")).filter((name) => name.endsWith(".js")));
  assert.deepEqual(onDisk, outputs, "engine/dist differs from the OUTPUTS in engine/build.mjs: rebuild");
  const workflow = read(".github/workflows/release-engine.yml");
  const sums = /sha256sum ([\w .-]+?) >/.exec(workflow)?.[1].split(" ") ?? [];
  const uploads = /release upload "\$TAG" ([\w .-]+?) SHA256SUMS/.exec(workflow)?.[1].split(" ") ?? [];
  assert.deepEqual(unique(sums), outputs, "release-engine.yml sha256sum list differs from the build outputs");
  assert.deepEqual(unique(uploads), outputs, "release-engine.yml upload list differs from the build outputs");
  const hooked = unique([...read("hooks/hooks.json").matchAll(/engine\/dist\/([\w-]+\.js)/g)].map((m) => m[1]));
  assert.deepEqual(hooked.filter((name) => !outputs.includes(name)), [], "hooks.json runs a file the build does not produce");
  const documented = unique([...read("engine/README.md").matchAll(/^\| `([\w-]+\.js)` \|/gm)].map((m) => m[1]));
  assert.deepEqual(documented, outputs, "the dist table in engine/README.md differs from the build outputs");
});

test("the version is the same in plugin.json, marketplace.json and the site", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json")).version;
  const market = [...read(".claude-plugin/marketplace.json").matchAll(/"version": "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(market.length, "marketplace.json has no version");
  assert.deepEqual(market.filter((v) => v !== plugin), [], `marketplace.json differs from plugin.json (${plugin})`);
  const shown = [
    ...read("docs/index.html").matchAll(/&middot; v(\d+\.\d+\.\d+) &middot;/g),
    ...read("docs/guide.html").matchAll(/Enforcer v(\d+\.\d+\.\d+)</g),
  ].map((m) => m[1]);
  assert.equal(shown.length, 2, "expected one version line on each site page");
  assert.deepEqual(shown.filter((v) => v !== plugin), [], `a site page shows a version other than ${plugin}`);
});
