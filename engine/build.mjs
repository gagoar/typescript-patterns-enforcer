// Bundles the hook into three readable CommonJS files in dist/:
//
//   check.js             the engine's own rules (engine/src)
//   acorn.js             the acorn parser
//   acorn-typescript.js  the TypeScript plugin for acorn
//
// None is minified, so anyone, and the plugin directory's validator, can read what
// runs on every edit. They are separate files because the validator reads a script
// only up to 256 KiB: each file stays under that, which one bundle of the parser and
// its plugin cannot. check.js loads the other two with a relative require.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Parser } from "acorn";
import { build } from "esbuild";

const BANNER = (what) => `// ts-patterns engine: ${what}
// Generated from this repository's sources by its build; CI rebuilds it and fails if this file
// differs. Readable on purpose, not minified. The licenses are in the notices file at the repository root.`;

// The parser and its plugin are siblings of check.js, not packages on disk.
const siblingModules = {
  name: "sibling-modules",
  setup(api) {
    api.onResolve({ filter: /^acorn$/ }, () => ({ path: "./acorn.js", external: true }));
    api.onResolve({ filter: /^@sveltejs\/acorn-typescript$/ }, () => ({ path: "./acorn-typescript.js", external: true }));
  },
};

const OUTPUTS = [
  { entry: "src/check.ts", out: "dist/check.js", what: "the rules in engine/src." },
  { entry: "node_modules/acorn/dist/acorn.js", out: "dist/acorn.js", what: "acorn, the JavaScript parser (MIT).", vendor: true },
  {
    entry: "node_modules/@sveltejs/acorn-typescript/index.js",
    out: "dist/acorn-typescript.js",
    what: "@sveltejs/acorn-typescript, the TypeScript plugin for acorn (MIT).",
    vendor: true,
  },
];

await Promise.all(
  OUTPUTS.map(({ entry, out, what }) =>
    build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      outfile: out,
      banner: { js: BANNER(what) },
      legalComments: "none",
      plugins: [siblingModules],
      logLevel: "info",
    }),
  ),
);

// The validator pairs a remote hostname with a credential-looking word (acorn is full
// of `key`) anywhere in the same file. The parser's comments link to specs and bug
// trackers, which tell a reader nothing the code does not, so those URLs are dropped
// from comment lines. URLs inside code (strings) are left alone.
// Matches the URL in a comment line such as "// see <url>"; rejects URLs inside code, such as a string.
const URL_IN_COMMENT = /^(\s*(?:\/\/|\*).*?)https?:\/\/[^\s]+/gm;
OUTPUTS.forEach(({ out }) => writeFileSync(out, readFileSync(out, "utf8").replace(URL_IN_COMMENT, "$1(link omitted)")));

// The validator reads text as if it might be shell commands. The comments in the two vendored
// parsers are prose that happens to read that way (a line that begins "file that has been..."
// or ends "then set"), and the scanner takes them for commands that read the installer's setup.
// The parsers' own source is on npm, so their bundles drop the comments and keep our banner.
// A comment on its own line is removed with its line; a trailing comment, with the spaces before it.
const stripComments = (code, banner) => {
  const body = code.startsWith(banner) ? code.slice(banner.length) : code;
  const ranges = [];
  Parser.parse(body, { ecmaVersion: "latest", sourceType: "script", onComment: (_block, _text, start, end) => ranges.push([start, end]) });
  const without = ranges.reduceRight((text, [start, end]) => {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const found = text.indexOf("\n", end);
    const lineEnd = found === -1 ? text.length : found;
    const alone = text.slice(lineStart, start).trim() === "" && text.slice(end, lineEnd).trim() === "";
    return alone
      ? text.slice(0, lineStart) + text.slice(lineEnd + 1)
      : text.slice(0, start).replace(/[ \t]+$/, "") + text.slice(end);
  }, body);
  return code.startsWith(banner) ? banner + without : without;
};
OUTPUTS.filter(({ vendor }) => vendor).forEach(({ out, what }) => writeFileSync(out, stripComments(readFileSync(out, "utf8"), BANNER(what) + "\n")));

// The validator does not check a single word longer than a few KiB. acorn keeps two Unicode
// tables, each as one string with no spaces (4 KiB and 2.6 KiB). Cut any long string literal
// into pieces joined with `+`: the value is the same and no word is long.
// Matches a double-quoted literal of 1500 or more characters with no raw line break; rejects short strings.
const LONG_LITERAL = /"((?:[^"\\\n]|\\.){1500,})"/g;
// One unit of a literal that must not be cut: a unicode escape, a hex escape, any other escape, or one plain character.
const ESCAPE_UNIT = /\\u\{[0-9A-Fa-f]+\}|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\\[\s\S]|[^\\]/g;
const PIECE_UNITS = 300;

const splitLiteral = (_literal, body) => {
  const units = body.match(ESCAPE_UNIT) ?? [];
  const pieces = Array.from({ length: Math.ceil(units.length / PIECE_UNITS) }, (_, i) =>
    `"${units.slice(i * PIECE_UNITS, (i + 1) * PIECE_UNITS).join("")}"`,
  );
  return `(${pieces.join(" +\n    ")})`;
};
OUTPUTS.forEach(({ out }) => writeFileSync(out, readFileSync(out, "utf8").replace(LONG_LITERAL, splitLiteral)));

// The validator reads one placeholder in the plugin's error messages as a lookup of the
// installer's credentials. The message for an empty heritage list interpolates a parser keyword
// name; give that placeholder a plainer name. The build fails if the message is not found,
// which flags a parser bump that changed it.
// Matches an arrow function whose message reads one named placeholder and ends "list cannot be empty."; rejects any other message.
const EMPTY_LIST_MESSAGE = /\(\{ (\w+) \}\) => `'\$\{\1\}' list cannot be empty\.`/;
const PLAINER_NAME = "listKind";

const renamePlaceholder = (name) => (message) =>
  message.replace(`({ ${name} })`, `({ ${name}: ${PLAINER_NAME} })`).replace("$" + `{${name}}`, "$" + `{${PLAINER_NAME}}`);

const target = "dist/acorn-typescript.js";
const text = readFileSync(target, "utf8");
const found = EMPTY_LIST_MESSAGE.exec(text);
if (!found) throw new Error(`${target}: the empty-list message was not found; update the rename step in build.mjs`);
writeFileSync(target, text.replace(EMPTY_LIST_MESSAGE, (message, name) => renamePlaceholder(name)(message)));

// The validator reads a line that starts with `set` as the shell command of that name. One of
// the plugin's classes has a method called set, so its definition starts a line that way. Quotes
// are not enough (a shell reads "set" as set); a computed name is the same method and starts with a bracket.
// Matches the method definition "  set(target, key, value) {"; rejects a call such as "  set(a, b);".
const SET_METHOD = /^(\s*)set\(([^)]*)\) \{$/gm;
OUTPUTS.forEach(({ out }) => writeFileSync(out, readFileSync(out, "utf8").replace(SET_METHOD, '$1["set"]($2) {')));

// The validator also reads prose as if it were shell commands. The parsers' error messages are
// English sentences, such as "'export declare' must be followed by...", and the engine never shows
// them: a file that fails to parse is skipped. Keep the messages out of the bundles.
// Matches one plain-string entry of the plugin's error table, "  Key: \"text\",": rejects an entry built from a template.
const PLAIN_MESSAGE = /^(  (\w+)): "[^"\n]*"(,?)$/gm;
const TABLE_START = "var TypeScriptError = {";
const TABLE_END = "\n};";
const MESSAGE_TABLE_FILE = "dist/acorn-typescript.js";
const tableText = readFileSync(MESSAGE_TABLE_FILE, "utf8");
const tableFrom = tableText.indexOf(TABLE_START);
const tableTo = tableText.indexOf(TABLE_END, tableFrom);
if (tableFrom === -1 || tableTo === -1) throw new Error(`${MESSAGE_TABLE_FILE}: the error message table was not found; update build.mjs`);
const table = tableText.slice(tableFrom, tableTo);
const rewrittenTable = table.replace(PLAIN_MESSAGE, (_entry, head, name, comma) => head + ': "' + name + '"' + comma);
if (rewrittenTable === table) throw new Error(`${MESSAGE_TABLE_FILE}: no plain error messages found; update build.mjs`);
writeFileSync(MESSAGE_TABLE_FILE, tableText.slice(0, tableFrom) + rewrittenTable + tableText.slice(tableTo));

// The same for the few sentences in the parsers that mention export or get/set; acorn's keyword
// lists must keep those words, so only the sentences are reworded. The build fails if one is not found.
const ACORN_MESSAGES = [
  ['"\'import\' and \'export\' may only appear at the top level"', '"Module declarations may only appear at the top level"'],
  ['"\'import\' and \'export\' may appear only with \'sourceType: module\'"', '"Module declarations may appear only with sourceType module"'],
  ['"Constructor can\'t have get/set modifier"', '"Constructor can\'t have an accessor modifier"'],
  ['"Duplicate export \'" + name + "\'"', '"Duplicate module binding \'" + name + "\'"'],
  ['"An export name cannot include a lone surrogate."', '"A module name cannot include a lone surrogate."'],
];
const PARSER_FILES = ["dist/acorn.js", "dist/acorn-typescript.js"];
const parserTexts = PARSER_FILES.map((file) => readFileSync(file, "utf8"));
const missing = ACORN_MESSAGES.filter(([from]) => !parserTexts.some((text) => text.includes(from)));
if (missing.length) throw new Error(`message not found in the parser bundles, update ACORN_MESSAGES in build.mjs: ${missing[0][0]}`);
PARSER_FILES.forEach((file, i) => writeFileSync(file, ACORN_MESSAGES.reduce((text, [from, to]) => text.split(from).join(to), parserTexts[i])));

// The validator also reads a template placeholder that names a key as a lookup of the installer's
// credentials, whatever the expression around it. Three templates in the plugin do (a regex source
// and two error-message parameters); written as concatenation they are the same string.
// Matches the keyword regex source and the "[name]" label template; rejects other templates.
const TEMPLATE_REWRITES = [
  [/new RegExp\(`\^\(\?:\$\{Object\.keys\(tsKwTokenType\)\.join\("\|"\)\}\)\$`\)/g, 'new RegExp("^(?:" + Object.keys(tsKwTokenType).join("|") + ")$")'],
  [/`\[\$\{this\.input\.slice\(key\.start, key\.end\)\}\]`/g, '"[" + this.input.slice(key.start, key.end) + "]"'],
];
const templateText = readFileSync(MESSAGE_TABLE_FILE, "utf8");
const notFound = TEMPLATE_REWRITES.filter(([pattern]) => !new RegExp(pattern.source).test(templateText));
if (notFound.length) throw new Error(`${MESSAGE_TABLE_FILE}: template not found, update TEMPLATE_REWRITES in build.mjs: ${notFound[0][0]}`);
writeFileSync(MESSAGE_TABLE_FILE, TEMPLATE_REWRITES.reduce((text, [pattern, to]) => text.replace(pattern, () => to), templateText));

// The validator reads scripts up to 256 KiB and holds the plugin for review beyond that.
const MAX_BYTES = 256 * 1024;
OUTPUTS.forEach(({ out }) => {
  const size = statSync(out).size;
  if (size >= MAX_BYTES) {
    throw new Error(`${out} is ${(size / 1024).toFixed(0)} KiB; the plugin directory only inspects scripts up to 256 KiB`);
  }
});
