// Bundles the hook entrypoint into ONE fully self-contained CJS file —
// `typescript` included. esbuild tree-shakes it down to only the parsing
// path this engine actually reaches (we never do type-aware linting), so
// the single bundle ends up smaller than the old split of a 6MB bundle
// plus a separately vendored ~24MB node_modules/typescript. Zero runtime
// dependencies: dist/check.js is the entire shipped artifact.
import { build } from "esbuild";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// Resolve package roots from their package.json, which every package exposes.
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const tsEslintRulesDir = join(pkgDir("@typescript-eslint/eslint-plugin"), "dist", "rules");
const eslintRulesDir = join(pkgDir("eslint"), "lib", "rules");

// The plugin directory rejects any file over 5 MiB, and the bundle was 15.5 MiB.
// `typescript` alone is 9.5 MiB, so the bundle has to be minified; on top of that,
// the rule indexes below pull in hundreds of rules this engine never runs. This
// plugin replaces each index with a module that loads only the rules in use.
const pruneUnusedRules = {
  name: "prune-unused-rules",
  setup(b) {
    const virtual = (path, contents) => ({ path, namespace: "pruned", pluginData: { contents } });

    // @typescript-eslint/eslint-plugin: 148 rules in the index, three in use.
    b.onResolve({ filter: /^@typescript-eslint\/eslint-plugin\/use-at-your-own-risk\/rules$/ }, () =>
      virtual("ts-eslint-rules", `module.exports = {
        "no-explicit-any": require(${JSON.stringify(join(tsEslintRulesDir, "no-explicit-any.js"))}).default,
        "ban-ts-comment": require(${JSON.stringify(join(tsEslintRulesDir, "ban-ts-comment.js"))}).default,
        "no-magic-numbers": require(${JSON.stringify(join(tsEslintRulesDir, "no-magic-numbers.js"))}).default,
      };`));

    // ESLint core: 305 built-in rules in the index. The engine's own rules are
    // plugins; the one core rule needed is no-magic-numbers, which the
    // typescript-eslint version extends via eslint's builtinRules.
    b.onResolve({ filter: /^(\.\.?\/)+rules(\/index(\.js)?)?$/ }, (args) =>
      args.importer.includes("node_modules/eslint/lib/")
        ? virtual("eslint-builtin-rules", `const rules = new Map();
           rules.set("no-magic-numbers", require(${JSON.stringify(join(eslintRulesDir, "no-magic-numbers.js"))}));
           module.exports = rules;`)
        : undefined);

    b.onLoad({ filter: /.*/, namespace: "pruned" }, (args) => ({
      contents: args.pluginData.contents, loader: "js", resolveDir: process.cwd(),
    }));
  },
};

await build({
  entryPoints: ["src/check.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/check.js",
  // `jiti`/`jiti/package.json` are ESLint core's optional, dynamically-imported
  // loader for .ts-flavored config files (lib/config/config-loader.js) — a
  // codepath only the CLI `ESLint` class's config discovery triggers, which
  // we never call. Left external so esbuild preserves the dynamic import as
  // a real (never-hit) runtime call instead of failing the build trying to
  // resolve it.
  external: ["jiti", "jiti/package.json"],
  // Swap the `debug` package for a no-op. The real one enumerates the whole
  // process environment at load time, which the plugin-directory upload
  // scanner reads as the installer's credentials being collected. See
  // src/shims/debug.ts.
  alias: { debug: "./src/shims/debug.ts" },
  plugins: [pruneUnusedRules],
  // Required to stay under the 5 MiB per-file limit (see above).
  minify: true,
  legalComments: "none",
  logLevel: "info",
});

// Fail the build rather than ship a bundle the directory will reject.
const MAX_BYTES = 5 * 1024 * 1024;
const size = statSync("dist/check.js").size;
if (size > MAX_BYTES) {
  throw new Error(`dist/check.js is ${(size / 1048576).toFixed(2)} MiB; the plugin directory rejects files over 5 MiB`);
}
