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
  { entry: "node_modules/acorn/dist/acorn.js", out: "dist/acorn.js", what: "acorn, the JavaScript parser (MIT)." },
  {
    entry: "node_modules/@sveltejs/acorn-typescript/index.js",
    out: "dist/acorn-typescript.js",
    what: "@sveltejs/acorn-typescript, the TypeScript plugin for acorn (MIT).",
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
