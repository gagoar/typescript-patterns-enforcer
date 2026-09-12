// Bundles the hook entrypoint into ONE fully self-contained CJS file —
// `typescript` included. esbuild tree-shakes it down to only the parsing
// path this engine actually reaches (we never do type-aware linting), so
// the single bundle ends up smaller than the old split of a 6MB bundle
// plus a separately vendored ~24MB node_modules/typescript. Zero runtime
// dependencies: dist/check.js is the entire shipped artifact.
import { build } from "esbuild";

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
  logLevel: "info",
});
