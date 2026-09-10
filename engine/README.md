# ts-patterns mechanical engine

A self-contained checker for 7 of `ts-patterns`'s rules, invoked by
`hooks/hooks.json` after every `.ts`/`.tsx` edit. It never reads or writes
whatever ESLint/tsconfig setup exists in the repo Claude is editing — it
brings its own pinned dependencies and runs in total isolation.

## What's checked, and why these 7

| Check | Origin | Mechanizes |
|---|---|---|
| `no-explicit-any` | reused from `@typescript-eslint/eslint-plugin` | Core Rule 1 |
| `ban-ts-comment` | reused | `@ts-ignore` needs a TODO |
| `no-magic-numbers` | reused | Core Rule 9 (numbers half) |
| `prefer-await-to-then` | reused from `eslint-plugin-promise` | Core Rule 5 |
| `no-switch-statement` | hand-rolled | Data Over Logic (presence only) |
| `no-param-reassign` | hand-rolled | parameter mutation |
| `no-loop-statements` | hand-rolled | Data Over Logic pipelines (presence only) |

See `src/registry.ts` for the full traceability map back to `SKILL.md`. The
mechanical layer detects *presence*; the *conversion* (switch→`Record`,
loop→pipeline) is a judgment call that stays in `SKILL.md`'s prose — a
linter can ban a `switch`, but it can't rewrite one well.

Two of the reused rules are pulled from `@typescript-eslint/eslint-plugin`'s
`./use-at-your-own-risk/rules` export (its declared, if informally-named,
subpath for raw rule objects — the package's `exports` map blocks arbitrary
internal paths). `eslint-plugin-promise` has no `exports` map restriction,
so its rule is required by its real file path directly.

## Release: rebuild and re-vendor

`dist/check.js` and `node_modules/typescript/` are **checked-in build
artifacts** — plugins install via git clone with no guaranteed build step,
so end users get zero install/build of their own. Rebuilding them is a
release-time task, not something to hand-edit:

```sh
cd engine
npm ci              # exact, pinned deps + lockfile
npm run typecheck   # tsc --noEmit, strict — the dogfood gate
npm run build       # esbuild -> dist/check.js
npm test            # fixture suite against the BUILT artifact
```

Then commit the resulting `dist/check.js` and `node_modules/typescript/`
(everything else in `node_modules/` stays gitignored — see `.gitignore`).
Before committing, sanity-check:

```sh
git status --short engine/            # dist/check.js and node_modules/typescript/ show as new/changed
git check-ignore engine/node_modules/typescript/package.json  # must NOT report it ignored (exit 1)
```

## A note on the deep-path imports

`no-explicit-any`, `ban-ts-comment`, and `no-magic-numbers` come through
`@typescript-eslint/eslint-plugin`'s aggregated rules index rather than
individual per-rule files — that package's `exports` map only declares that
one subpath, not arbitrary deep paths. `eslint-plugin-promise/rules/prefer-await-to-then`
*is* a deep, undocumented path (that package has no `exports` map to block
it, but also makes no promise the layout won't move). Bumping either
package's pinned version should re-confirm the relevant path/export still
resolves before shipping.
