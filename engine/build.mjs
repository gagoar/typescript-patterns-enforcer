// Bundles the hook entrypoint into one self-contained CJS file. `typescript`
// is externalized deliberately (see README "Release: rebuild and re-vendor")
// — it's shipped as a real, pinned node_modules/typescript alongside this
// bundle rather than inlined, since it's large and internally dynamic.
import { build } from "esbuild";

await build({
  entryPoints: ["src/check.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/check.js",
  // `typescript` is vendored separately (see README); `jiti`/`jiti/package.json`
  // are ESLint core's optional, dynamically-imported loader for .ts-flavored
  // config files (lib/config/config-loader.js) — a codepath only the CLI
  // `ESLint` class's config discovery triggers, which we never call. Left
  // external so esbuild preserves the dynamic import as a real (never-hit)
  // runtime call instead of failing the build trying to resolve it.
  external: ["typescript", "jiti", "jiti/package.json"],
  logLevel: "info",
});
